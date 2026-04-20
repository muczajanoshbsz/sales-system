import express from 'express';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import os from 'os';
import cron from 'node-cron';
import * as XLSX from 'xlsx';
import nodemailer from 'nodemailer';
import { jsPDF } from 'jspdf';
import { GoogleGenAI } from "@google/genai";
import AdmZip from 'adm-zip';
import jwt from 'jsonwebtoken';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ai: GoogleGenAI;

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function toPgPlaceholders(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

type QueryResultRow = Record<string, any>;

async function runQuery<T extends QueryResultRow = QueryResultRow>(
  poolOrClient: pg.Pool | pg.PoolClient,
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const result = await poolOrClient.query<T>(toPgPlaceholders(sql), params);
  return result.rows;
}

async function runExec(
  poolOrClient: pg.Pool | pg.PoolClient,
  sql: string,
  params: any[] = []
) {
  return poolOrClient.query(toPgPlaceholders(sql), params);
}

// --- Backup & Recovery Logic Constants & Helpers ---
const BACKUP_DIR = path.join(process.cwd(), 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const BACKUP_SECRET = process.env.BACKUP_SECRET || 'default-backup-secret-key-32-chars!!';

function encrypt(text: string) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(BACKUP_SECRET, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string) {
  try {
    if (!text || !text.includes(':')) return text; // Handle unencrypted legacy data
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const key = crypto.scryptSync(BACKUP_SECRET, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error('Decryption failed, returning raw text:', err);
    return text;
  }
}

function calculateHash(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function createNotification(pool: pg.Pool, userId: string, type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) {
  try {
    await runExec(pool, `
      INSERT INTO notifications ("userId", type, title, message)
      VALUES (?, ?, ?, ?)
    `, [userId, type, title, message]);
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}

async function bulkInsert(
  client: pg.PoolClient,
  tableName: string,
  columns: string[],
  rows: any[][]
) {
  if (!rows.length) return;

  const values: any[] = [];
  const valueGroups = rows.map((row, rowIndex) => {
    const placeholders = row.map((_, colIndex) => {
      values.push(row[colIndex]);
      return `$${rowIndex * columns.length + colIndex + 1}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
  const sql = `INSERT INTO ${tableName} (${quotedColumns}) VALUES ${valueGroups.join(', ')}`;
  await client.query(sql, values);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function jsonBlockPrompt(task: string, payload: unknown, shapeDescription: string) {
  return `
${task}

Input data:
${JSON.stringify(payload, null, 2)}

Return ONLY valid JSON.
Expected JSON shape:
${shapeDescription}
`.trim();
}

function extractResponseText(data: any): string {
  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part?.text ?? '')
      .join('') ?? ''
  ).trim();
}

function safeJsonParse<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as T;
    }

    const arrStart = text.indexOf('[');
    const arrEnd = text.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
      return JSON.parse(text.slice(arrStart, arrEnd + 1)) as T;
    }

    throw new Error('Invalid JSON response from Gemini');
  }
}

async function callGeminiJSON<T>(apiKey: string, prompt: string): Promise<T> {
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json"
    }
  });

  const text = result.text;
  if (!text) {
    throw new Error('Empty Gemini response');
  }

  return safeJsonParse<T>(text);
}

async function callGeminiChat(
  apiKey: string,
  systemInstruction: string,
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  message: string
): Promise<string> {
  const result = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      ...history.map(h => ({ role: h.role, parts: h.parts })),
      { role: 'user', parts: [{ text: message }] }
    ],
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.7,
    }
  });

  return result.text || 'Nincs válasz az AI-tól.';
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const localIp = getLocalIp();

  app.use(express.json({ limit: '10mb' }));

  app.use((req, _res, next) => {
    console.log(`📡 Request: ${req.method} ${req.originalUrl}`);
    next();
  });

  const dbHost = requireEnv('SUPABASE_DB_HOST');
  const dbPort = Number(requireEnv('SUPABASE_DB_PORT'));
  const dbName = requireEnv('SUPABASE_DB_NAME');
  const dbUser = requireEnv('SUPABASE_DB_USER');
  const dbPassword = requireEnv('SUPABASE_DB_PASSWORD');

  const pool = new Pool({
    host: dbHost,
    port: dbPort,
    database: dbName,
    user: dbUser,
    password: dbPassword,
    ssl: {
      rejectUnauthorized: false,
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to Supabase PostgreSQL');
  } catch (error) {
    console.error('❌ Failed to connect to Supabase PostgreSQL:', error);
    throw error;
  }

  const initDb = async () => {
    try {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
            CREATE TYPE user_role AS ENUM ('admin', 'client');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pending_sale_status') THEN
            CREATE TYPE pending_sale_status AS ENUM ('pending', 'confirmed', 'cancelled');
          END IF;
        END
        $$;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          uid VARCHAR(100) PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          role user_role NOT NULL DEFAULT 'client',
          "displayName" VARCHAR(255),
          is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
          has_seen_onboarding BOOLEAN NOT NULL DEFAULT FALSE,
          last_login TIMESTAMPTZ,
          last_active TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Ensure columns exist if table was created earlier
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "displayName" VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS has_seen_onboarding BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;

        -- Add missing columns if they don't exist
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_suspended') THEN
            ALTER TABLE users ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_login') THEN
            ALTER TABLE users ADD COLUMN last_login TIMESTAMPTZ;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_active') THEN
            ALTER TABLE users ADD COLUMN last_active TIMESTAMPTZ;
          END IF;
        END
        $$;

        -- Ensure userId column exists in all relevant tables
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sales' AND column_name='userId') THEN
            ALTER TABLE sales ADD COLUMN "userId" VARCHAR(100) NOT NULL DEFAULT 'legacy';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock' AND column_name='userId') THEN
            ALTER TABLE stock ADD COLUMN "userId" VARCHAR(100) NOT NULL DEFAULT 'legacy';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pending_sales' AND column_name='userId') THEN
            ALTER TABLE pending_sales ADD COLUMN "userId" VARCHAR(100) NOT NULL DEFAULT 'legacy';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='userId') THEN
            ALTER TABLE audit_logs ADD COLUMN "userId" VARCHAR(100) NOT NULL DEFAULT 'legacy';
          END IF;
        END
        $$;

        CREATE TABLE IF NOT EXISTS product_models (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          date DATE NOT NULL,
          model VARCHAR(100) NOT NULL,
          "condition" VARCHAR(50) NOT NULL,
          platform VARCHAR(50) NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          buy_price NUMERIC(10, 2) NOT NULL,
          sell_price NUMERIC(10, 2) NOT NULL,
          fees NUMERIC(10, 2) NOT NULL DEFAULT 0,
          profit NUMERIC(10, 2) NOT NULL,
          buyer VARCHAR(255),
          city VARCHAR(100) DEFAULT '',
          tracking_number VARCHAR(255),
          notes TEXT,
          "userId" VARCHAR(100) NOT NULL DEFAULT 'legacy',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS stock (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          model VARCHAR(100) NOT NULL,
          "condition" VARCHAR(50) NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          buy_price NUMERIC(10, 2) NOT NULL,
          lead_time INTEGER NOT NULL DEFAULT 7,
          "userId" VARCHAR(100) NOT NULL DEFAULT 'legacy',
          last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS pending_sales (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          date DATE NOT NULL,
          model VARCHAR(100) NOT NULL,
          "condition" VARCHAR(50) NOT NULL,
          platform VARCHAR(50) NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 1,
          buy_price NUMERIC(10, 2) NOT NULL,
          sell_price NUMERIC(10, 2) NOT NULL,
          fees NUMERIC(10, 2) NOT NULL DEFAULT 0,
          profit NUMERIC(10, 2) NOT NULL,
          buyer VARCHAR(255),
          city VARCHAR(100) DEFAULT '',
          tracking_number VARCHAR(255),
          notes TEXT,
          "userId" VARCHAR(100) NOT NULL DEFAULT 'legacy',
          status pending_sale_status NOT NULL DEFAULT 'pending',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS market_prices (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          model VARCHAR(100) NOT NULL,
          "condition" VARCHAR(50) NOT NULL,
          platform VARCHAR(50) NOT NULL,
          price NUMERIC(10, 2) NOT NULL,
          date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          "userId" VARCHAR(100) NOT NULL DEFAULT 'legacy',
          action VARCHAR(100) NOT NULL,
          details TEXT,
          "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_market_prices_unique
          ON market_prices (model, "condition", platform, date);

        DROP INDEX IF EXISTS idx_stock_unique_model_condition;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_unique_model_condition_user
          ON stock (model, "condition", "userId");

        CREATE INDEX IF NOT EXISTS idx_pending_sales_date
          ON pending_sales (date);

        CREATE INDEX IF NOT EXISTS idx_pending_sales_status
          ON pending_sales (status);

        CREATE INDEX IF NOT EXISTS idx_sales_user_id
          ON sales ("userId");

        CREATE INDEX IF NOT EXISTS idx_stock_user_id
          ON stock ("userId");

        CREATE INDEX IF NOT EXISTS idx_pending_sales_user_id
          ON pending_sales ("userId");

        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
          ON audit_logs ("userId");

        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
          ON audit_logs ("timestamp");

        CREATE TABLE IF NOT EXISTS backups (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          filename VARCHAR(255) NOT NULL,
          size BIGINT NOT NULL,
          type VARCHAR(50) NOT NULL, -- 'auto' or 'manual'
          format VARCHAR(50) NOT NULL, -- 'sql' or 'json'
          created_by VARCHAR(100),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          metadata JSONB,
          data TEXT -- Store encrypted backup data in DB for persistence on ephemeral storage
        );

        -- Ensure data column exists if table was already created
        ALTER TABLE backups ADD COLUMN IF NOT EXISTS data TEXT;

        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          "userId" VARCHAR(100) NOT NULL,
          type VARCHAR(50) NOT NULL, -- 'success', 'error', 'warning', 'info'
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS weekly_reports (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          "userId" VARCHAR(100) NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          report_json JSONB NOT NULL,
          report_text TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ai_tips (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          content TEXT NOT NULL,
          metadata JSONB,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS system_config (
          key VARCHAR(255) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        INSERT INTO system_config (key, value) VALUES ('SESSION_TIMEOUT_MINUTES', '15') ON CONFLICT (key) DO NOTHING;

        CREATE TABLE IF NOT EXISTS system_health_checks (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          type VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL,
          message TEXT,
          details JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS data_audit_flags (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          entity_type VARCHAR(50) NOT NULL,
          entity_id VARCHAR(100),
          issue_type VARCHAR(50) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          description TEXT NOT NULL,
          suggestion TEXT,
          is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS archived_summaries (
          id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
          period_start DATE NOT NULL,
          period_end DATE NOT NULL,
          data_summary JSONB NOT NULL,
          archive_link TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications ("userId");
        CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications (is_read);
        CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_id ON weekly_reports ("userId");
      `);

      await pool.query(`
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION set_last_updated()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.last_updated = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await pool.query(`
        DROP TRIGGER IF EXISTS trg_sales_updated_at ON sales;
        CREATE TRIGGER trg_sales_updated_at
        BEFORE UPDATE ON sales
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();

        DROP TRIGGER IF EXISTS trg_pending_sales_updated_at ON pending_sales;
        CREATE TRIGGER trg_pending_sales_updated_at
        BEFORE UPDATE ON pending_sales
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();

        DROP TRIGGER IF EXISTS trg_stock_last_updated ON stock;
        CREATE TRIGGER trg_stock_last_updated
        BEFORE UPDATE ON stock
        FOR EACH ROW
        EXECUTE FUNCTION set_last_updated();

        DROP TRIGGER IF EXISTS trg_product_models_updated_at ON product_models;
        CREATE TRIGGER trg_product_models_updated_at
        BEFORE UPDATE ON product_models
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
      `);

      const modelsCount = await runQuery<{ count: string }>(pool, 'SELECT COUNT(*)::text AS count FROM product_models');
      if (Number(modelsCount[0].count) === 0) {
        const initialModels = ["AirPods 2", "AirPods 3", "AirPods 4 ANC", "AirPods Pro", "AirPods Pro 2", "AirPods Pro 3", "AirPods Max", "JBL Pulse 5", "Egyéb"];
        for (const model of initialModels) {
          await runExec(pool, 'INSERT INTO product_models (name) VALUES (?) ON CONFLICT DO NOTHING', [model]);
        }
        console.log('✅ Initial product models seeded');
      }

      console.log('✅ Database tables initialized');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  };

  await initDb();

  async function sendWeeklyReportEmail(reportData: any, reportText: string, startDate: Date, endDate: Date) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;
    const receiverEmail = process.env.REPORT_RECEIVER_EMAIL;

    if (!smtpHost || !smtpUser || !smtpPass || !receiverEmail) {
      console.warn('⚠️ SMTP not fully configured. Skipping email report.');
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      // Generate PDF
      const doc = new jsPDF();
      const margin = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      let y = 0;

      // Fix Hungarian double acute characters (jsPDF standard fonts don't support them)
      const normalizeHungarian = (text: string) => {
        return text
          .replace(/ő/g, 'ö').replace(/ő/g, 'ö')
          .replace(/ű/g, 'ü').replace(/ű/g, 'ü')
          .replace(/Ő/g, 'Ö').replace(/Ő/g, 'Ö')
          .replace(/Ű/g, 'Ü').replace(/Ű/g, 'Ü');
      };

      // Header Bar
      doc.setFillColor(30, 41, 59); // Slate-900 (Darker, more professional)
      doc.rect(0, 0, pageWidth, 50, 'F');
      
      y = 30;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(255, 255, 255);
      doc.text('AirPods Manager', margin, y);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184); // Slate-400
      doc.text('PREMIUM ÜZLETI ELEMZÉS', margin, y + 10);
      
      doc.setTextColor(255, 255, 255);
      const dateRange = `IDŐSZAK: ${startDate.toLocaleDateString('hu-HU')} - ${endDate.toLocaleDateString('hu-HU')}`;
      doc.text(dateRange, pageWidth - margin - doc.getTextWidth(dateRange), y);
      
      y = 70;
      doc.setTextColor(15, 23, 42); // Slate-900
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(normalizeHungarian('Vezetői Összefoglaló'), margin, y);
      
      // Decoration line
      doc.setDrawColor(79, 70, 229); // Indigo-600
      doc.setLineWidth(1);
      doc.line(margin, y + 4, margin + 40, y + 4);
      
      y += 20;
      
      // Stats Boxes
      const boxWidth = (pageWidth - (margin * 2) - 10) / 3;
      const boxHeight = 35;

      const drawStatBox = (x: number, y: number, label: string, value: string, color: [number, number, number], bgColor: [number, number, number]) => {
        doc.setFillColor(...bgColor);
        doc.roundedRect(x, y, boxWidth, boxHeight, 3, 3, 'F');
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...color);
        doc.text(label, x + 8, y + 12);
        
        doc.setFontSize(14);
        doc.text(value, x + 8, y + 25);
      };

      drawStatBox(margin, y, 'HETI PROFIT', `${reportData.totalProfit.toLocaleString('hu-HU')} Ft`, [21, 128, 61], [240, 253, 244]);
      drawStatBox(margin + boxWidth + 5, y, 'ELADOTT DARAB', `${reportData.salesCount} db`, [29, 78, 216], [239, 246, 255]);
      
      const starText = reportData.starProduct.length > 18 ? reportData.starProduct.substring(0, 15) + '...' : reportData.starProduct;
      drawStatBox(margin + (boxWidth * 2) + 10, y, 'SZTÁRTERMÉK', normalizeHungarian(starText), [180, 83, 9], [255, 251, 235]);

      y += 55;

      // AI Analysis Content
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('AI Business Insights', margin, y);
      y += 12;

      // Text Area Background
      const startY = y;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      
      const cleanMarkdown = (text: string) => {
        return normalizeHungarian(text)
          .replace(/#{1,6}\s?/g, '') // Remove headers notation
          .replace(/\*\*/g, '')      // Remove bold notation
          .replace(/\*/g, '•')       // Bullet points
          .trim();
      };

      const lines = reportText.split('\n');
      for (const line of lines) {
        if (!line.trim()) {
          y += 5;
          continue;
        }

        let isHeader = false;
        let processedLine = line.trim();

        if (line.startsWith('#')) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(30, 41, 59);
          isHeader = true;
          processedLine = cleanMarkdown(line);
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(71, 85, 105);
          processedLine = cleanMarkdown(line);
        }

        const splitLine = doc.splitTextToSize(processedLine, pageWidth - (margin * 2));
        
        for (const sLine of splitLine) {
          if (y > 275) {
            doc.addPage();
            y = 20;
          }
          doc.text(sLine, margin, y);
          y += isHeader ? 8 : 6;
        }
        
        if (isHeader) y += 2;
      }

      // Footer
      const footerY = doc.internal.pageSize.getHeight() - 15;
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.5);
      doc.line(margin, footerY - 5, pageWidth - margin, footerY - 5);
      
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Generálva az AirPods Manager intelligens rendszere által', margin, footerY);
      doc.text(`Készült: ${new Date().toLocaleString('hu-HU')}`, pageWidth - margin - doc.getTextWidth(`Készült: ${new Date().toLocaleString('hu-HU')}`), footerY);

      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

      // Send Email
      await transporter.sendMail({
        from: `"AirPods Manager" <${smtpFrom}>`,
        to: receiverEmail,
        subject: `📊 Heti Jelentés: ${startDate.toLocaleDateString('hu-HU')} - ${endDate.toLocaleDateString('hu-HU')}`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; color: #334155; background-color: #f8fafc; border-radius: 24px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #4f46e5; margin: 0; font-size: 28px; font-weight: 800;">AirPods Manager</h1>
              <p style="color: #94a3b8; font-size: 14px; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em;">Üzleti Elemzés</p>
            </div>
            
            <div style="background-color: white; border-radius: 20px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <h2 style="color: #0f172a; font-size: 20px; margin-top: 0; margin-bottom: 16px;">Szia! 👋</h2>
              <p style="line-height: 1.6; margin-bottom: 24px;">Elkészítettük az elmúlt időszak adatait összegző üzleti jelentésedet.</p>
              
              <div style="background-color: #f0fdf4; border-radius: 12px; padding: 16px; border: 1px solid #dcfce7; margin-bottom: 24px;">
                <span style="display: block; font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase; margin-bottom: 4px;">Heti Profit</span>
                <span style="font-size: 20px; font-weight: 800; color: #166534;">${reportData.totalProfit.toLocaleString('hu-HU')} Ft</span>
              </div>

              <p style="font-size: 14px; color: #64748b; line-height: 1.6;">
                A csatolt PDF dokumentumban találod a részletes AI elemzést és a javaslatokat.
              </p>
            </div>
          </div>
        `,
        attachments: [
          {
            filename: `Heti_Jelentes_${endDate.toISOString().split('T')[0]}.pdf`,
            content: pdfBuffer,
          },
        ],
      });

      console.log('✅ Weekly report email sent successfully to:', receiverEmail);
    } catch (error) {
      console.error('❌ Failed to send weekly report email:', error);
    }
  }

  async function sendSystemEmail(subject: string, title: string, content: string, details?: any) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || smtpUser;
    const receiverEmail = process.env.REPORT_RECEIVER_EMAIL;

    if (!smtpHost || !smtpUser || !smtpPass || !receiverEmail) {
      console.warn('⚠️ SMTP not fully configured. Skipping system email.');
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      let detailsHtml = '';
      if (details) {
        detailsHtml = `<div style="margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 8px; font-family: monospace; font-size: 12px; color: #475569; overflow: auto;">
          ${JSON.stringify(details, null, 2).replace(/\n/g, '<br>').replace(/\s/g, '&nbsp;')}
        </div>`;
      }

      await transporter.sendMail({
        from: `"AirPods Vault" <${smtpFrom}>`,
        to: receiverEmail,
        subject: `[VAULT-ALERT] ${subject}`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px; color: #334155; background-color: #f8fafc; border-radius: 24px; border: 1px solid #e2e8f0;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #4f46e5; margin: 0; font-size: 24px; font-weight: 800;">AirPods Vault</h1>
              <p style="color: #94a3b8; font-size: 12px; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.1em;">System Health Monitor</p>
            </div>
            
            <div style="background-color: white; border-radius: 20px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
              <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; margin-bottom: 12px;">${title}</h2>
              <div style="line-height: 1.6; font-size: 14px;">${content}</div>
              ${detailsHtml}
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8;">
                Időpont: ${new Date().toLocaleString('hu-HU')}<br>
                Szerver: ${os.hostname()}
              </div>
            </div>
          </div>
        `,
      });
      console.log('✅ System alert email sent:', subject);
    } catch (error) {
      console.error('❌ Failed to send system email:', error);
    }
  }

  async function generateAndSendReport(daysBefore: number = 14) {
    console.log(`Generating report for the last ${daysBefore} days...`);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Weekly report failed: Gemini API key not configured');
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - daysBefore);

    // Gather data
    const [sales, stock, backups, auditLogs, users] = await Promise.all([
      runQuery(pool, 'SELECT * FROM sales WHERE created_at >= ?', [startDate.toISOString()]),
      runQuery(pool, 'SELECT * FROM stock'),
      runQuery(pool, 'SELECT * FROM backups WHERE created_at >= ?', [startDate.toISOString()]),
      runQuery(pool, 'SELECT * FROM audit_logs WHERE "timestamp" >= ?', [startDate.toISOString()]),
      runQuery(pool, 'SELECT uid, email, role FROM users')
    ]);

    const totalProfit = sales.reduce((sum, s) => sum + (Number(s.profit) || 0), 0);
    const totalStockValue = stock.reduce((sum, s) => sum + (Number(s.buy_price) * Number(s.quantity) || 0), 0);
    
    // Find star product
    const modelCounts: Record<string, number> = {};
    sales.forEach(s => {
      modelCounts[s.model] = (modelCounts[s.model] || 0) + 1;
    });
    const starProduct = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    const prompt = `
      You are a professional business analyst for an AirPods reseller business.
      Generate a "Business Balance Report" in Hungarian for the last ${daysBefore} days.
      
      Data for the period (${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}):
      - Total Sales: ${sales.length}
      - Total Profit: ${totalProfit.toLocaleString('hu-HU')} Ft
      - Star Product: ${starProduct}
      - Total Stock Value: ${totalStockValue.toLocaleString('hu-HU')} Ft
      - Backups: ${backups.length}
      - Google Drive Sync: ${backups.filter(b => {
          const meta = b.metadata || {};
          return meta.googleDriveId || meta.vaultStatus === 'completed';
        }).length}/${backups.length} successful
      - System Audit Logs: ${auditLogs.length}
      
      The report should be professional, encouraging, and insightful.
      Format the response as a JSON object with the following structure:
      {
        "financial_balance": "text about profit and comparison",
        "star_product": "text about the best selling product",
        "stock_audit": "text about stock value and aging items",
        "system_health": "text about backups and errors",
        "next_week_plan": "text about strategy for next week",
        "summary_text": "a full cohesive markdown report"
      }
      
      Ensure the tone is professional and the Hungarian is natural.
    `;

    const reportJson = await callGeminiJSON<any>(apiKey, prompt);

    const reportData = {
      financials: {
        totalSales: sales.length,
        totalProfit: totalProfit,
        totalStockValue: totalStockValue
      },
      topProduct: {
        model: starProduct,
        count: modelCounts[starProduct] || 0
      },
      inventory: {
        totalStock: stock.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0),
        lowStockItems: stock.filter(s => Number(s.quantity) < 5).map(s => s.model)
      },
      aiAnalysis: reportJson
    };

    // Store for each admin
    const admins = users.filter(u => u.role === 'admin');
    for (const admin of admins) {
      await runExec(pool, `
        INSERT INTO weekly_reports ("userId", start_date, end_date, report_json, report_text)
        VALUES (?, ?, ?, ?, ?)
      `, [
        admin.uid, 
        startDate.toISOString().split('T')[0], 
        endDate.toISOString().split('T')[0], 
        JSON.stringify(reportData),
        reportJson.summary_text
      ]);

      await createNotification(
        pool, 
        admin.uid, 
        'info', 
        'Üzleti jelentés elkészült', 
        `📊 A ${daysBefore} napos üzleti mérleg elkészült. Nézd meg az Admin Panelben!`
      );
    }

    // Send Email Report ONCE for the system
    await sendWeeklyReportEmail(
      {
        salesCount: sales.length,
        totalProfit: totalProfit,
        starProduct: starProduct
      },
      reportJson.summary_text,
      startDate,
      endDate
    );

    return reportJson;
  }

  // SELF-HEALING MONITOR & RETRY LOGIC
  async function runSelfHealingMonitor() {
    console.log('🛡️ Running Self-Healing Monitor...');
    
    try {
      // 1. Check DB Connection
      await pool.query('SELECT 1');
      console.log('✅ Health: DB Connection OK');
    } catch (dbErr) {
      console.error('❌ Health: DB Connection Failed!', dbErr);
      // In a real serverless env, we might not be able to "fix" this ourselves easily
      // but we log it and it will trigger an alert if repeated.
    }

    try {
      // 2. Recover Failed Vault Syncs
      const failedBackups = await runQuery(pool, `
        SELECT id, filename, metadata, data FROM backups 
        WHERE metadata->>'vaultStatus' IN ('failed', 'uploading')
        AND created_at > NOW() - INTERVAL '2 days'
      `);

      for (const backup of failedBackups) {
        let meta = backup.metadata || {};
        if (typeof meta === 'string') try { meta = JSON.parse(meta); } catch(e) {}
        
        const failureCount = (meta.retryCount || 0) + 1;
        
        if (failureCount <= 3) {
          console.log(`🔄 Self-Healing: Retrying Vault Sync for ${backup.filename} (Attempt ${failureCount})...`);
          try {
            const uploadResult = await uploadToGoogleDrive(backup.filename, backup.data);
            await runExec(pool, 'UPDATE backups SET metadata = ? WHERE id = ?', [
              JSON.stringify({ 
                ...meta, 
                googleDriveId: uploadResult.id, 
                googleDriveLink: uploadResult.webViewLink,
                checksum: uploadResult.checksum,
                uploadedAt: new Date().toISOString(),
                vaultStatus: 'completed',
                retryCount: failureCount
              }),
              backup.id
            ]);
            console.log(`✅ Self-Healing: Sync recovered for ${backup.filename}`);
          } catch (retryErr) {
            console.error(`❌ Self-Healing: Retry ${failureCount} failed for ${backup.filename}`);
            await runExec(pool, 'UPDATE backups SET metadata = ? WHERE id = ?', [
              JSON.stringify({ ...meta, retryCount: failureCount, vaultStatus: failureCount >= 3 ? 'failed_permanent' : 'failed' }),
              backup.id
            ]);
            
            if (failureCount === 3) {
              await sendSystemEmail(
                'KRITIKUS: Vault Szinkronizáció Sikertelen',
                '❌ Vault Szinkronizációs Hiba (3 sikertelen próbálkozás)',
                `A következő mentés feltöltése véglegesen megszakadt: <b>${backup.filename}</b>.<br>Kérjük ellenőrizze a Google Drive beállításokat manuálisan!`
              );
            }
          }
        }
      }
    } catch (vaultHealthErr) {
      console.error('❌ Health: Vault Monitor Error:', vaultHealthErr);
    }
  }

  // 1. DISASTER RECOVERY DRILL (Automata Mentés-Ellenőrző)
  async function runDisasterRecoveryDrill() {
    console.log('🩺 Running automated Disaster Recovery Drill...');
    try {
      const latestBackups = await runQuery(pool, 'SELECT * FROM backups ORDER BY created_at DESC LIMIT 1');
      if (latestBackups.length === 0) {
        throw new Error('No backups found to test.');
      }

      const backup = latestBackups[0];
      let rawData = backup.data;
      
      if (!rawData) {
        const filePath = path.join(BACKUP_DIR, backup.filename);
        if (fs.existsSync(filePath)) {
          rawData = fs.readFileSync(filePath, 'utf8');
        } else {
          throw new Error(`Backup file data missing for ${backup.filename}`);
        }
      }

      let snapshot;
      try {
        if (backup.type === 'system' || backup.format === 'enc') {
          snapshot = JSON.parse(decrypt(rawData));
        } else {
          snapshot = JSON.parse(rawData);
        }
      } catch (parseErr) {
        throw new Error(`Parse failed: ${(parseErr as Error).message}`);
      }

      // Validation logic: check for core tables
      const requiredTables = ['users', 'sales', 'stock', 'product_models'];
      const data = snapshot.data || snapshot;
      const missingTables = requiredTables.filter(t => !data[t]);
      
      if (missingTables.length > 0) {
        throw new Error(`Integrity check failed: Missing tables ${missingTables.join(', ')}`);
      }

      const rowCount = {
        users: (data.users || []).length,
        sales: (data.sales || []).length,
        stock: (data.stock || []).length
      };

      await runExec(pool, `
        INSERT INTO system_health_checks (type, status, message, details)
        VALUES ('drill', 'success', ?, ?)
      `, [
        `Automata visszaállítási teszt sikeres: ${backup.filename}`,
        JSON.stringify({ backupId: backup.id, rowCounts: rowCount, testedAt: new Date().toISOString() })
      ]);

      console.log('✅ Disaster Recovery Drill: Success');
    } catch (err) {
      console.error('❌ Disaster Recovery Drill: Failed!', err);
      await runExec(pool, `
        INSERT INTO system_health_checks (type, status, message, details)
        VALUES ('drill', 'failed', ?, ?)
      `, [
        `VISSZAÁLLÍTÁSI HIBA: ${(err as Error).message}`,
        JSON.stringify({ error: (err as Error).message, failedAt: new Date().toISOString() })
      ]);
      
      await sendSystemEmail(
        'KRITIKUS: Mentés Ellenőrzési Hiba',
        '⚠️ RENDSZER HIBA: A mentés visszaállítási teszt elbukott',
        `Az automata ellenőrzés során kiderült, hogy a mentések nem visszaállíthatóak vagy sérültek.<br>Hiba üzenet: <b>${(err as Error).message}</b><br>Kérjük azonnal végezzen manuális mentést!`
      );
    }
  }

  // 2. AI DATA GUARD (Automata Adatminőség-figyelő)
  async function runAIDataAudit() {
    console.log('🛡️ AI Data Guard starting audit...');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    try {
      // Get recent data (last 48 hours for buffer)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 2);

      const [recentSales, recentStock] = await Promise.all([
        runQuery(pool, 'SELECT * FROM sales WHERE created_at >= ?', [yesterday.toISOString()]),
        runQuery(pool, 'SELECT * FROM stock WHERE last_updated >= ?', [yesterday.toISOString()])
      ]);

      if (recentSales.length === 0 && recentStock.length === 0) {
        console.log('AI Data Guard: No recent data to audit.');
        return;
      }

      const prompt = `
        You are the "AirPods Vault Data Guard". Your goal is to detect data entry errors, anomalies, or missing fields.
        Analyze the following data entries from the last 48 hours.
        Look for:
        1. Pricing anomalies (e.g. sale price way too low or high for the specific model).
        2. Missing critical info (e.g. empty fields that should be filled).
        3. Statistical outliers.
        
        Recent Sales: ${JSON.stringify(recentSales.map(s => ({ id: s.id, model: s.model, price: s.sell_price, profit: s.profit })))}
        Recent Stock Updates: ${JSON.stringify(recentStock.map(s => ({ id: s.id, model: s.model, qty: s.quantity })))}
        
        If you find issues, return a JSON array of objects:
        [
          {
            "entity_type": "sale" | "stock",
            "entity_id": string,
            "issue_type": "anomaly" | "missing_data" | "pricing_error",
            "severity": "low" | "medium" | "high",
            "description": "What is wrong in Hungarian",
            "suggestion": "How to fix it in Hungarian"
          }
        ]
        If no issues are found, return an empty array []. Use natural Hungarian for descriptions.
      `;

      const auditResults = await callGeminiJSON<any[]>(apiKey, prompt);

      for (const issue of auditResults) {
        const currentFlags = await runQuery(pool, 'SELECT id FROM data_audit_flags WHERE entity_id = ? AND issue_type = ? AND is_resolved = FALSE', [issue.entity_id, issue.issue_type]);
        
        if (currentFlags.length === 0) {
          await runExec(pool, `
            INSERT INTO data_audit_flags (entity_type, entity_id, issue_type, severity, description, suggestion)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [issue.entity_type, issue.entity_id, issue.issue_type, issue.severity, issue.description, issue.suggestion]);

          if (issue.severity === 'high') {
             const admins = await runQuery(pool, 'SELECT uid FROM users WHERE role = ?', ['admin']);
             for (const admin of admins) {
               await createNotification(pool, admin.uid, 'warning', '🛡️ Adatminőségi Hiba', issue.description);
             }
          }
        }
      }

      console.log(`✅ AI Data Guard finished. Found ${auditResults.length} issues.`);
    } catch (err) {
      console.error('❌ AI Data Guard failed:', err);
    }
  }

  // 3. SMART INDEXING (Önhangoló Adatbázis)
  async function runDatabaseOptimizer() {
    console.log('⚡ Running Smart Database Optimizer...');
    try {
      const startTime = Date.now();
      
      // PostgreSQL VACUUM and ANALYZE
      await pool.query('VACUUM ANALYZE');
      
      const duration = Date.now() - startTime;

      await runExec(pool, `
        INSERT INTO system_health_checks (type, status, message, details)
        VALUES ('optimizer', 'success', ?, ?)
      `, [
        `Adatbázis karbantartás elvégezve (${duration}ms)`,
        JSON.stringify({ durationMs: duration, optimizedAt: new Date().toISOString() })
      ]);

      console.log('✅ Database Optimized.');
    } catch (err) {
      console.error('❌ Database Optimization failed:', err);
      await runExec(pool, `
        INSERT INTO system_health_checks (type, status, message, details)
        VALUES ('optimizer', 'failed', ?, ?)
      `, [
        `OPTIMALIZÁLÁSI HIBA: ${(err as Error).message}`,
        JSON.stringify({ error: (err as Error).message, failedAt: new Date().toISOString() })
      ]);
    }
  }

  // 4. THE BUSINESS HISTORIAN (Adattömörítő és Archiváló)
  async function runDataArchiver() {
    console.log('📚 Running Business Historian Archiver...');
    try {
      // Threshold: Older than 1 year for detailed records
      const threshold = new Date();
      threshold.setFullYear(threshold.getFullYear() - 1);

      const oldSales = await runQuery(pool, 'SELECT * FROM sales WHERE date < ?', [threshold.toISOString().split('T')[0]]);
      
      if (oldSales.length === 0) {
        console.log('Historian: No data to archive yet.');
        return;
      }

      const summary: Record<string, any> = {};
      oldSales.forEach((s: any) => {
        const month = s.date.substring(0, 7); // YYYY-MM
        if (!summary[month]) {
          summary[month] = { salesCount: 0, profit: 0, revenue: 0 };
        }
        summary[month].salesCount++;
        summary[month].profit += Number(s.profit) || 0;
        summary[month].revenue += Number(s.sell_price) * Number(s.quantity);
      });

      const archiveData = JSON.stringify({ sales: oldSales, archivedAt: new Date().toISOString() });
      const archiveFilename = `archived-sales-${new Date().toISOString().split('T')[0]}.json.enc`;
      const encryptedArchive = encrypt(archiveData);
      
      // Upload to Vault (Google Drive)
      const uploadResult = await uploadToGoogleDrive(archiveFilename, encryptedArchive);

      for (const [month, data] of Object.entries(summary)) {
        await runExec(pool, `
          INSERT INTO archived_summaries (period_start, period_end, data_summary, archive_link)
          VALUES (?, ?, ?, ?)
        `, [
          `${month}-01`,
          `${month}-31`, 
          JSON.stringify(data),
          uploadResult.webViewLink
        ]);
      }

      const archiveIds = oldSales.map((s: any) => s.id);
      if (archiveIds.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < archiveIds.length; i += chunkSize) {
          const chunk = archiveIds.slice(i, i + chunkSize);
          await runExec(pool, `DELETE FROM sales WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
        }
      }

      await runExec(pool, `
        INSERT INTO system_health_checks (type, status, message, details)
        VALUES ('archiver', 'success', ?, ?)
      `, [
        `Sikeres archiválás: ${oldSales.length} eladás elmentve a Vault-ba és rögzítve az Üzleti Emlékezetben.`,
        JSON.stringify({ archivedCount: oldSales.length, vaultLink: uploadResult.webViewLink })
      ]);

      console.log('✅ Business Historian: Success');
    } catch (err) {
      console.error('❌ Business Historian failed:', err);
      await runExec(pool, `
        INSERT INTO system_health_checks (type, status, message, details)
        VALUES ('archiver', 'failed', ?, ?)
      `, [
        `ARCHIVÁLÁSI HIBA: ${(err as Error).message}`,
        JSON.stringify({ error: (err as Error).message, failedAt: new Date().toISOString() })
      ]);
    }
  }

  // PROACTIVE AI BUSINESS AGENT
  async function runProactiveAIReview() {
    console.log('🤖 Proactive AI Agent starting review...');
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const [todaySales, currentStock, marketPrices] = await Promise.all([
        runQuery(pool, 'SELECT * FROM sales WHERE date = ?', [today]),
        runQuery(pool, 'SELECT * FROM stock'),
        runQuery(pool, 'SELECT * FROM market_prices ORDER BY date DESC LIMIT 50')
      ]);

      const prompt = `
        You are the "AirPods Vault AI Manager". Your goal is to optimize profit and operational efficiency.
        Analyze today's business activity and current stock to provide 1-3 actionable "Daily Tips".
        
        Today's Data (${today}):
        - Sales: ${JSON.stringify(todaySales)}
        - Current Stock: ${JSON.stringify(currentStock)}
        - Recent Market Benchmarks: ${JSON.stringify(marketPrices)}
        
        Focus on:
        1. Pricing Anomalies (sold too cheap? too expensive?)
        2. Slow Moving Inventory (items in stock > 7 days without sales)
        3. Profit Opportunities.
        
        Format your response as a JSON array of objects:
        [
          { "type": "pricing" | "stock" | "general", "content": "The specific advice in Hungarian" }
        ]
        Limit to 1-3 most important tips. Use natural Hungarian.
      `;

      const tips = await callGeminiJSON<any[]>(apiKey, prompt);

      for (const tip of tips) {
        await runExec(pool, 'INSERT INTO ai_tips (type, content, metadata) VALUES (?, ?, ?)', [
          tip.type,
          tip.content,
          JSON.stringify({ date: today })
        ]);

        // Push notification to admins
        const users = await runQuery(pool, 'SELECT uid FROM users WHERE role = ?', ['admin']);
        for (const admin of users) {
          await createNotification(
            pool,
            admin.uid,
            'info',
            '🤖 AI Üzleti Tipp',
            tip.content
          );
        }
      }

      console.log(`✅ Proactive AI Agent finished. Generated ${tips.length} tips.`);
    } catch (err) {
      console.error('❌ Proactive AI Agent failed:', err);
    }
  }

  // INTELLIGENT STOCK PREDICTIONS
  async function runStockPredictions() {
    console.log('📈 Running Intelligent Stock Predictions...');
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [recentSales, stock] = await Promise.all([
        runQuery(pool, 'SELECT model, quantity FROM sales WHERE created_at >= ?', [thirtyDaysAgo.toISOString()]),
        runQuery(pool, 'SELECT * FROM stock')
      ]);

      // Calculate daily burn rate
      const salesVolume: Record<string, number> = {};
      recentSales.forEach(s => {
        salesVolume[s.model] = (salesVolume[s.model] || 0) + Number(s.quantity);
      });

      const burnRates: Record<string, number> = {};
      Object.entries(salesVolume).forEach(([model, total]) => {
        burnRates[model] = total / 30; // Average per day
      });

      const lowStockAlerts: string[] = [];

      stock.forEach(item => {
        const rate = burnRates[item.model];
        if (rate && rate > 0) {
          const daysLeft = Number(item.quantity) / rate;
          if (daysLeft <= 4) {
            lowStockAlerts.push(`<b>${item.model}</b>: Kb. <b>${Math.ceil(daysLeft)} nap</b> múlva elfogy! (Átlag napi eladás: ${rate.toFixed(1)} db)`);
          }
        } else if (Number(item.quantity) <= 2) {
          lowStockAlerts.push(`<b>${item.model}</b>: Kritikus készlet! Csak <b>${item.quantity} db</b> maradt.`);
        }
      });

      if (lowStockAlerts.length > 0) {
        const admins = await runQuery(pool, 'SELECT id, uid FROM users WHERE role = "admin"');
        for (const admin of admins) {
          await createNotification(
            pool, 
            admin.uid, 
            'warning', 
            '📈 Készlet Előrejelzés', 
            `Várható készlethiány észlelet: ${lowStockAlerts.join('; ')}`
          );
        }

        await sendSystemEmail(
          'Készlet Előrejelzési Jelentés',
          '📈 Várható Készlethiányok',
          `Az algoritmus a következő modelleknél jelzett előre kifogyást:<br><br><ul>${lowStockAlerts.map(a => `<li>${a}</li>`).join('')}</ul><br>Érdemes elindítani a beszerzést!`
        );
      }

      console.log('✅ Stock predictions completed.');
    } catch (err) {
      console.error('❌ Stock predictions failed:', err);
    }
  }

  const logActivity = async (userId: string | any, action: string, details: string, req?: express.Request) => {
    let finalUserId = userId;
    // Safety check: if an object (like req) was mistakenly passed, try to extract a string ID
    if (typeof userId !== 'string' && userId !== null && userId !== undefined) {
      finalUserId = userId?.user?.uid || userId?.uid || 'system';
    }
    
    let finalDetails = details;
    const user = req ? (req as any).user : null;
    
    if (user && user.isGhostMode) {
      finalDetails = `[GHOST MODE] Admin ${user.adminName} (${user.adminUid}) as User ${userId}: ${details}`;
    }

    try {
      await runExec(pool, 'INSERT INTO audit_logs ("userId", action, details) VALUES (?, ?, ?)', [
        finalUserId,
        action,
        finalDetails,
      ]);
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  };

  const getUserContext = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userId = req.headers['x-user-id'] as string | undefined;
    const ghostUserId = req.headers['x-ghost-user-id'] as string | undefined;
    const ghostReadOnly = req.headers['x-ghost-mode-readonly'] === 'true';

    if (!userId) {
      (req as any).user = { role: 'guest' };
      return next();
    }

    try {
      const rows = await runQuery(pool, 'SELECT role, is_suspended, "displayName", email FROM users WHERE uid = ?', [userId]);
      if (rows.length > 0) {
        if (rows[0].is_suspended) {
          return res.status(403).json({ error: 'Account suspended' });
        }
        
        const realUser = { uid: userId, role: rows[0].role, displayName: rows[0].displayName, email: rows[0].email };
        (req as any).user = realUser;

        // Ghost Mode Logic
        if (ghostUserId && realUser.role === 'admin') {
          const ghostRows = await runQuery(pool, 'SELECT role, "displayName", email FROM users WHERE uid = ?', [ghostUserId]);
          if (ghostRows.length > 0) {
            // Prevent admin impersonating another admin
            if (ghostRows[0].role !== 'admin') {
              (req as any).user = {
                uid: ghostUserId,
                role: ghostRows[0].role,
                displayName: ghostRows[0].displayName,
                email: ghostRows[0].email,
                isGhostMode: true,
                adminUid: userId,
                adminName: realUser.displayName || realUser.email,
                readOnly: ghostReadOnly
              };

              // Block write operations if read-only is active
              if (ghostReadOnly && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
                // Allow some specific non-modifying POSTs if any? No, usually POST is write.
                // Exception: /users/sync is needed for login/sync
                if (!req.path.includes('/users/sync')) {
                  return res.status(403).json({ error: 'Ghost Mode is in Read-Only state' });
                }
              }
            }
          }
        }
        
        // Update last_active asynchronously (only for real user)
        runExec(pool, 'UPDATE users SET last_active = NOW() WHERE uid = ?', [userId]).catch(err => console.error('Failed to update last_active:', err));
      } else {
        (req as any).user = { uid: userId, role: 'client' };
      }
    } catch {
      (req as any).user = { uid: userId, role: 'client' };
    }

    next();
  };

  const checkAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user = (req as any).user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  };

  // Secret trigger for automated backups (for external cron services)
  app.get('/api/system/trigger-auto-backup', async (req, res) => {
    const { token } = req.query;
    const secretToken = process.env.BACKUP_CRON_TOKEN || 'AirPods_Secure_2024_Xyz';

    if (token !== secretToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      console.log('External Cron Trigger: Creating daily backup...');
      await createBackup('auto');
      res.json({ success: true });
    } catch (error) {
      console.error('External Cron Trigger failed:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  const apiRouter = express.Router();
  apiRouter.use(getUserContext);

  // --- Ghost Mode for Backups (Time Travel) ---
  apiRouter.use(async (req, res, next) => {
    const backupId = req.headers['x-backup-id'];
    if (!backupId || backupId === 'null' || backupId === 'undefined' || req.method !== 'GET') return next();

    try {
      const backup = await runQuery(pool, 'SELECT * FROM backups WHERE id = ?', [backupId]);
      if (!backup.length) return next();

      let rawData = backup[0].data;
      if (!rawData) {
        const filePath = path.join(BACKUP_DIR, backup[0].filename);
        if (fs.existsSync(filePath)) {
          rawData = fs.readFileSync(filePath, 'utf8');
        } else {
          return next();
        }
      }
      
      let snapshot;
      try {
        if (backup[0].format === 'enc') {
          snapshot = JSON.parse(decrypt(rawData));
        } else {
          snapshot = JSON.parse(rawData);
        }
      } catch (e) {
        console.error('❌ Failed to parse backup for Ghost Mode:', e);
        return next();
      }

      const data = snapshot.data || snapshot;
      const pathName = req.path;
      const user = (req as any).user;
      const isAdmin = user?.role === 'admin';

      console.log(`👻 Ghost Mode Active [Backup ${backupId}] Intercepting: ${pathName} for user: ${user?.email}`);

      // Intercept common GET routes
      if (pathName === '/stock' || pathName === '/admin/stock') {
          const rows = Array.isArray(data.stock) ? data.stock : [];
          return res.json(isAdmin ? rows : rows.filter((r: any) => r.userId === user?.uid));
      }
      if (pathName === '/sales' || pathName === '/admin/sales') {
          const rows = Array.isArray(data.sales) ? data.sales : [];
          return res.json(isAdmin ? rows : rows.filter((r: any) => r.userId === user?.uid));
      }
      if (pathName === '/pending_sales' || pathName === '/admin/pending_sales') {
          const rows = Array.isArray(data.pending_sales) ? data.pending_sales : [];
          if (pathName === '/admin/pending_sales') return res.json(rows.filter((r: any) => r.status === 'pending'));
          return res.json(rows.filter((r: any) => r.userId === user?.uid && r.status === 'pending'));
      }
      if (pathName === '/admin/audit_logs') return res.json(data.audit_logs || []);
      if (pathName === '/catalog/models' || pathName === '/admin/catalog/models') return res.json(data.product_models || []);
      
      if (pathName === '/admin/stats') {
          const sales = data.sales || [];
          const stock = data.stock || [];
          const users = data.users || [];
          return res.json({
              totalSales: sales.length,
              totalStock: stock.length,
              totalUsers: users.length,
              totalProfit: sales.reduce((sum: number, s: any) => sum + (Number(s.profit) || 0), 0)
          });
      }

      next();
    } catch (error) {
      console.error('❌ Ghost Mode Error:', error);
      next();
    }
  });

  apiRouter.get('/ping', (_req, res) => {
    res.json({ status: 'ok', message: 'pong', timestamp: new Date().toISOString() });
  });

  apiRouter.post('/system/backup', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    try {
      const [sales, stock, pending, market, users] = await Promise.all([
        runQuery(pool, 'SELECT * FROM sales ORDER BY id'),
        runQuery(pool, 'SELECT * FROM stock ORDER BY id'),
        runQuery(pool, 'SELECT * FROM pending_sales ORDER BY id'),
        runQuery(pool, 'SELECT * FROM market_prices ORDER BY id'),
        runQuery(pool, 'SELECT * FROM users ORDER BY uid'),
      ]);

      res.json({
        version: '2.0.0-postgres',
        timestamp: new Date().toISOString(),
        data: {
          sales,
          stock,
          pending_sales: pending,
          market_prices: market,
          users,
        },
      });
    } catch (error) {
      console.error('❌ Backup error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/users/sync', async (req, res) => {
    console.log('📥 USER SYNC REQUEST:', req.body.email);

    try {
      const { uid, email: rawEmail, displayName } = req.body;
      const email = rawEmail?.toLowerCase();
      if (!uid || !email) {
        return res.status(400).json({ error: 'Missing uid or email' });
      }

      const existing = await runQuery(pool, 'SELECT * FROM users WHERE uid = ?', [uid]);

      if (existing.length > 0 && existing[0].is_suspended) {
        return res.status(403).json({ error: 'Account suspended' });
      }

      if (existing.length === 0) {
        const countRows = await runQuery<{ count: string }>(pool, 'SELECT COUNT(*)::text AS count FROM users');
        const role = Number(countRows[0].count) === 0 || email === 'csmucza@gmail.com' ? 'admin' : 'client';

        await runExec(
          pool,
          'INSERT INTO users (uid, email, "displayName", role, last_login, last_active) VALUES (?, ?, ?, ?, NOW(), NOW())',
          [uid, email, displayName ?? null, role]
        );

        if (role === 'admin') {
          await Promise.all([
            runExec(pool, 'UPDATE sales SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE stock SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE pending_sales SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE audit_logs SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
          ]);

          if (email === 'csmucza@gmail.com') {
            const oldAdmins = await runQuery(pool, 'SELECT uid FROM users WHERE (email = ? OR email = ?) AND uid != ?', ['admin@localhost', 'admin@localhost.com', uid]);
            const uidsToMigrate = oldAdmins.map(u => u.uid);
            
            const devSalesCheck = await runQuery<{ count: string }>(pool, 'SELECT COUNT(*)::text AS count FROM sales WHERE "userId" = ?', ['local-dev-user']);
            const devStockCheck = await runQuery<{ count: string }>(pool, 'SELECT COUNT(*)::text AS count FROM stock WHERE "userId" = ?', ['local-dev-user']);
            
            if ((Number(devSalesCheck[0].count) > 0 || Number(devStockCheck[0].count) > 0) && !uidsToMigrate.includes('local-dev-user') && uid !== 'local-dev-user') {
              uidsToMigrate.push('local-dev-user');
            }

            for (const oldUid of uidsToMigrate) {
              await Promise.all([
                runExec(pool, 'UPDATE sales SET "userId" = ? WHERE "userId" = ?', [uid, oldUid]),
                runExec(pool, 'UPDATE stock SET "userId" = ? WHERE "userId" = ?', [uid, oldUid]),
                runExec(pool, 'UPDATE pending_sales SET "userId" = ? WHERE "userId" = ?', [uid, oldUid]),
                runExec(pool, 'UPDATE audit_logs SET "userId" = ? WHERE "userId" = ?', [uid, oldUid]),
              ]);
            }
          }
        }
      } else {
        const role = email === 'csmucza@gmail.com' ? 'admin' : existing[0].role;
        await runExec(pool, 'UPDATE users SET email = ?, "displayName" = ?, role = ?, last_login = NOW(), last_active = NOW() WHERE uid = ?', [
          email,
          displayName ?? null,
          role,
          uid,
        ]);

        if (role === 'admin') {
          await Promise.all([
            runExec(pool, 'UPDATE sales SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE stock SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE pending_sales SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE audit_logs SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
          ]);
        }
      }

      const finalUser = await runQuery(pool, 'SELECT uid, email, role, "displayName", is_suspended, has_seen_onboarding FROM users WHERE uid = ?', [uid]);
      if (finalUser.length > 0) {
        const user = finalUser[0];
        res.json({
          uid: user.uid,
          email: user.email,
          role: user.role,
          displayName: user.displayName || user.displayname || null,
          is_suspended: user.is_suspended,
          has_seen_onboarding: user.has_seen_onboarding
        });
      } else {
        res.status(404).json({ error: 'User not found after sync' });
      }
    } catch (error) {
      console.error('❌ User sync error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/users/onboarding-complete', async (req, res) => {
    const userId = (req as any).user?.uid;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      await runExec(pool, 'UPDATE users SET has_seen_onboarding = TRUE WHERE uid = ?', [userId]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/users/onboarding-reset', async (req, res) => {
    const userId = (req as any).user?.uid || req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      await runExec(pool, 'UPDATE users SET has_seen_onboarding = FALSE WHERE uid = ?', [userId]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/debug/migration', async (_req, res) => {
    try {
      const uniqueUsersInSales = await runQuery(pool, 'SELECT DISTINCT "userId" FROM sales');
      const uniqueUsersInStock = await runQuery(pool, 'SELECT DISTINCT "userId" FROM stock');
      const allUsers = await runQuery(pool, 'SELECT uid, email FROM users');
      const legacySales = await runQuery(pool, 'SELECT COUNT(*) FROM sales WHERE "userId" = ? OR "userId" IS NULL', ['legacy']);
      const legacyStock = await runQuery(pool, 'SELECT COUNT(*) FROM stock WHERE "userId" = ? OR "userId" IS NULL', ['legacy']);
      const devSales = await runQuery(pool, 'SELECT COUNT(*) FROM sales WHERE "userId" = ?', ['local-dev-user']);
      const devStock = await runQuery(pool, 'SELECT COUNT(*) FROM stock WHERE "userId" = ?', ['local-dev-user']);
      const adminLocalhost = await runQuery(pool, 'SELECT uid, email FROM users WHERE email = ?', ['admin@localhost']);
      
      res.json({
        uniqueUsersInSales,
        uniqueUsersInStock,
        allUsers,
        legacySales,
        legacyStock,
        devSales,
        devStock,
        adminLocalhost
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/debug/counts', async (_req, res) => {
    try {
      const salesCounts = await runQuery(pool, 'SELECT "userId", COUNT(*) FROM sales GROUP BY "userId"');
      const stockCounts = await runQuery(pool, 'SELECT "userId", COUNT(*) FROM stock GROUP BY "userId"');
      const users = await runQuery(pool, 'SELECT uid, email, role FROM users');
      res.json({ salesCounts, stockCounts, users });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/debug/users', async (_req, res) => {
    try {
      const users = await runQuery(pool, 'SELECT * FROM users ORDER BY created_at DESC');
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/debug/routes', (_req, res) => {
    const routes: string[] = [];

    function split(thing: any) {
      if (typeof thing === 'string') return thing;
      if (thing.fast_slash) return '';

      const match = thing
        .toString()
        .replace('\\/?', '')
        .replace('(?=\\/|$)', '')
        .match(/^\/\^\\(\/.*?)\\?\//);

      return match ? match[1].replace(/\\(.)/g, '$1') : '<complex>';
    }

    (app as any)._router?.stack?.forEach((middleware: any) => {
      if (middleware.route) {
        routes.push(`${Object.keys(middleware.route.methods).join(',').toUpperCase()} ${middleware.route.path}`);
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler: any) => {
          if (handler.route) {
            const routePath = split(middleware.regexp) + split(handler.route.path);
            routes.push(`${Object.keys(handler.route.methods).join(',').toUpperCase()} ${routePath}`);
          }
        });
      }
    });

    res.json(routes);
  });

  apiRouter.get('/audit_logs', async (req, res) => {
    const user = (req as any).user;
    if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const query = 'SELECT a.*, u.email AS "userEmail" FROM audit_logs a LEFT JOIN users u ON a."userId" = u.uid WHERE a."userId" = ? ORDER BY a."timestamp" DESC LIMIT 100';
      const rows = await runQuery(pool, query, [user.uid]);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/audit_logs', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    try {
      await runExec(pool, 'DELETE FROM audit_logs');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/system/all', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM sales');
      await client.query('DELETE FROM stock');
      await client.query('DELETE FROM pending_sales');
      await client.query('DELETE FROM market_prices');
      await client.query('DELETE FROM audit_logs');
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: (error as Error).message });
    } finally {
      client.release();
    }
  });

  apiRouter.get('/sales', async (req, res) => {
    const user = (req as any).user;
    if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const query = 'SELECT * FROM sales WHERE "userId" = ? ORDER BY date DESC, id DESC';
      const rows = await runQuery(pool, query, [user.uid]);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/sales', async (req, res) => {
    const user = (req as any).user;

    try {
      const sale = req.body;

      if (!sale.model || !sale.platform || Number(sale.quantity) <= 0) {
        return res.status(400).json({ error: 'Hiányzó vagy érvénytelen adatok' });
      }

      const userId = sale.userId || user.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const rows = await runQuery<{ id: number }>(
        pool,
        `INSERT INTO sales
          (date, model, "condition", platform, quantity, buy_price, sell_price, fees, profit, buyer, city, tracking_number, notes, "userId")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          sale.date,
          sale.model,
          sale.condition,
          sale.platform,
          sale.quantity,
          sale.buy_price,
          sale.sell_price,
          sale.fees ?? 0,
          sale.profit,
          sale.buyer ?? null,
          sale.city ?? '',
          sale.tracking_number ?? null,
          sale.notes ?? null,
          userId,
        ]
      );

      await logActivity(userId, 'CREATE_SALE', `${sale.model} (${sale.quantity} db) - ${sale.platform}`, req);
      res.json({ id: rows[0].id, ...sale, userId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/sales/:id', async (req, res) => {
    const user = (req as any).user;

    try {
      const rows = await runQuery(pool, 'SELECT * FROM sales WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Sale not found' });

      const sale = rows[0];
      if (user.role !== 'admin' && sale.userId !== user.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await logActivity(sale.userId, 'DELETE_SALE', `${sale.model} - ${sale.platform}`, req);
      await runExec(pool, 'DELETE FROM sales WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/sales/:id', async (req, res) => {
    const user = (req as any).user;

    try {
      const rows = await runQuery(pool, 'SELECT * FROM sales WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Sale not found' });

      const existingSale = rows[0];
      if (user.role !== 'admin' && existingSale.userId !== user.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const sale = req.body;
      await runExec(
        pool,
        `UPDATE sales
         SET date = ?, model = ?, "condition" = ?, platform = ?, quantity = ?, buy_price = ?, sell_price = ?, fees = ?, profit = ?, buyer = ?, city = ?, tracking_number = ?, notes = ?
         WHERE id = ?`,
        [
          sale.date,
          sale.model,
          sale.condition,
          sale.platform,
          sale.quantity,
          sale.buy_price,
          sale.sell_price,
          sale.fees ?? 0,
          sale.profit,
          sale.buyer ?? null,
          sale.city ?? '',
          sale.tracking_number ?? null,
          sale.notes ?? null,
          req.params.id,
        ]
      );

      await logActivity(user.uid, 'UPDATE_SALE', `${sale.model} - ${sale.platform}`, req);
      res.json({ id: Number(req.params.id), ...sale });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/sales', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    try {
      await runExec(pool, 'DELETE FROM sales');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/stock', async (req, res) => {
    const user = (req as any).user;
    if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const query = 'SELECT * FROM stock WHERE "userId" = ? ORDER BY id DESC';
      const rows = await runQuery(pool, query, [user.uid]);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/stock/:id', async (req, res) => {
    const user = (req as any).user;

    try {
      const rows = await runQuery(pool, 'SELECT * FROM stock WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Stock item not found' });

      const item = rows[0];
      if (user.role !== 'admin' && item.userId !== user.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { quantity, lead_time, buy_price } = req.body;
      
      await runExec(
        pool, 
        'UPDATE stock SET quantity = ?, lead_time = ?, buy_price = ? WHERE id = ?', 
        [
          quantity !== undefined ? quantity : item.quantity,
          lead_time !== undefined ? lead_time : item.lead_time,
          buy_price !== undefined ? buy_price : item.buy_price,
          req.params.id
        ]
      );

      await logActivity(user.uid, 'UPDATE_STOCK', `${item.model} (${quantity})`, req);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/stock', async (req, res) => {
    const user = (req as any).user;

    try {
      const item = req.body;

      if (!item.model || Number(item.quantity) < 0) {
        return res.status(400).json({ error: 'Hiányzó vagy érvénytelen adatok' });
      }

      const userId = item.userId || user.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const rows = await runQuery<{ id: number }>(
        pool,
        `INSERT INTO stock (model, "condition", quantity, buy_price, lead_time, "userId")
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [item.model, item.condition, item.quantity, item.buy_price, item.lead_time || 7, userId]
      );

      await logActivity(userId, 'CREATE_STOCK', `${item.model} (${item.quantity})`, req);
      res.json({ id: rows[0].id, ...item, userId });
    } catch (error: any) {
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'Ez a modell/állapot kombináció már létezik a készletben.' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  apiRouter.delete('/stock/:id', async (req, res) => {
    const user = (req as any).user;

    try {
      const rows = await runQuery(pool, 'SELECT * FROM stock WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Stock item not found' });

      const item = rows[0];
      if (user.role !== 'admin' && item.userId !== user.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await logActivity(item.userId, 'DELETE_STOCK', `${item.model}`, req);
      await runExec(pool, 'DELETE FROM stock WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/pending_sales', async (req, res) => {
    const user = (req as any).user;
    if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const query = 'SELECT * FROM pending_sales WHERE status = ? AND "userId" = ? ORDER BY date DESC, id DESC';
      const rows = await runQuery(pool, query, ['pending', user.uid]);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/pending_sales', async (req, res) => {
    const user = (req as any).user;

    try {
      const sale = req.body;
      const userId = sale.userId || user.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const rows = await runQuery<{ id: number }>(
        pool,
        `INSERT INTO pending_sales
          (date, model, "condition", platform, quantity, buy_price, sell_price, fees, profit, buyer, city, tracking_number, notes, "userId", status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        [
          sale.date,
          sale.model,
          sale.condition,
          sale.platform,
          sale.quantity,
          sale.buy_price,
          sale.sell_price,
          sale.fees ?? 0,
          sale.profit,
          sale.buyer ?? null,
          sale.city ?? '',
          sale.tracking_number ?? null,
          sale.notes ?? null,
          userId,
          sale.status || 'pending',
        ]
      );

      await logActivity(userId, 'CREATE_PENDING_SALE', `${sale.model} (${sale.quantity})`, req);
      res.json({ id: rows[0].id, ...sale, userId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/pending_sales/:id', async (req, res) => {
    const user = (req as any).user;

    try {
      const rows = await runQuery(pool, 'SELECT * FROM pending_sales WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Pending sale not found' });

      const sale = rows[0];
      if (user.role !== 'admin' && sale.userId !== user.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const updates = req.body;
      const allowedFields = ['status', 'date', 'model', 'condition', 'platform', 'quantity', 'buy_price', 'sell_price', 'fees', 'profit', 'buyer', 'city', 'tracking_number', 'notes'];
      
      const setClauses = [];
      const values = [];
      
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          setClauses.push(`"${field}" = ?`);
          values.push(updates[field]);
        }
      }
      
      if (setClauses.length === 0) return res.json({ success: true });
      
      values.push(req.params.id);
      await runExec(pool, `UPDATE pending_sales SET ${setClauses.join(', ')} WHERE id = ?`, values);
      
      const updatedRows = await runQuery(pool, 'SELECT * FROM pending_sales WHERE id = ?', [req.params.id]);
      
      await logActivity(user.uid, 'UPDATE_PENDING', `${sale.model} updated`, req);
      res.json(updatedRows[0]);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/market_prices', async (_req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT * FROM market_prices ORDER BY date DESC, id DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Catalog Routes
  apiRouter.get('/catalog/models', async (req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT * FROM product_models ORDER BY name ASC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/catalog/active-models', async (req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT name FROM product_models WHERE is_active = TRUE ORDER BY name ASC');
      res.json(rows.map(r => r.name));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/catalog/models', checkAdmin, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const rows = await runQuery(pool, 'INSERT INTO product_models (name) VALUES (?) RETURNING *', [name]);
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/catalog/models/:id', checkAdmin, async (req, res) => {
    try {
      const { is_active, name } = req.body;
      const rows = await runQuery(pool, 'UPDATE product_models SET is_active = COALESCE(?, is_active), name = COALESCE(?, name) WHERE id = ? RETURNING *', [is_active, name, req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Model not found' });
      res.json(rows[0]);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/catalog/models/:id', checkAdmin, async (req, res) => {
    try {
      await runExec(pool, 'DELETE FROM product_models WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // --- Backup & Recovery Logic ---

  // Create a system artifact (Code + DB)
  async function createSystemArtifact(createdBy: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `system-artifact-${timestamp}.zip.enc`;
    const filePath = path.join(BACKUP_DIR, filename);

    console.log('📦 Starting system artifact generation...');

    // 1. Create DB Snapshot
    const tables = ['product_models', 'stock', 'sales', 'pending_sales', 'market_prices', 'audit_logs', 'users', 'weekly_reports', 'backups', 'notifications'];
    const dbSnapshot: Record<string, any> = {};
    for (const table of tables) {
      try {
        if (table === 'backups') {
          // IMPORTANT: Exclude the large 'data' field to save memory
          dbSnapshot[table] = await runQuery(pool, `SELECT id, filename, size, type, format, created_by, created_at, metadata FROM "${table}"`);
        } else if (table === 'audit_logs') {
          // IMPORTANT: Limit logs to the last 1000 entries
          dbSnapshot[table] = await runQuery(pool, `SELECT * FROM "${table}" ORDER BY timestamp DESC LIMIT 1000`);
        } else {
          dbSnapshot[table] = await runQuery(pool, `SELECT * FROM "${table}"`);
        }
      } catch (e) {
        console.warn(`Failed to snapshot table ${table}:`, e);
      }
    }

    // 2. Prepare Zip
    const zip = new AdmZip();
    zip.addFile('database_snapshot.json', Buffer.from(JSON.stringify(dbSnapshot), 'utf8'));
    
    // Add source code (excluding bulky folders)
    const excludePaths = ['node_modules', 'dist', 'backups', '.git', '.next', '.cache', '.env'];
    const rootFiles = fs.readdirSync(process.cwd());
    for (const file of rootFiles) {
      if (excludePaths.includes(file)) continue;
      
      const fullPath = path.join(process.cwd(), file);
      try {
        const stats = fs.lstatSync(fullPath);
        if (stats.isDirectory()) {
           zip.addLocalFolder(fullPath, file);
        } else if (stats.isFile()) {
           zip.addLocalFile(fullPath);
        }
      } catch (e) {
        console.warn(`Skipping ${file} due to error:`, e);
      }
    }

    const zipBuffer = zip.toBuffer();
    console.log(`📦 Zip created (${(zipBuffer.length / 1024 / 1024).toFixed(2)} MB). Encrypting...`);
    
    const encryptedData = encrypt(zipBuffer.toString('base64'));
    
    // Store in DB
    const result = await runQuery(pool, `
      INSERT INTO backups (filename, size, type, format, created_by, metadata, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `, [
      filename,
      Buffer.byteLength(encryptedData),
      'system',
      'enc_zip',
      createdBy,
      JSON.stringify({ isSystemArtifact: true, tableCount: tables.length }),
      encryptedData
    ]);

    console.log('✅ System artifact generated and stored in database.');
    return result[0];
  }

  // Create a backup
  async function createBackup(type: 'auto' | 'manual', createdBy?: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.enc`;
    const filePath = path.join(BACKUP_DIR, filename);

    // Fetch all data for the snapshot
    const tables = ['product_models', 'stock', 'sales', 'pending_sales', 'market_prices', 'audit_logs', 'users'];
    const snapshot: Record<string, any> = {};

    for (const table of tables) {
      if (table === 'audit_logs') {
        snapshot[table] = await runQuery(pool, `SELECT * FROM "${table}" ORDER BY timestamp DESC LIMIT 1000`);
      } else {
        snapshot[table] = await runQuery(pool, `SELECT * FROM "${table}"`);
      }
    }

    const encryptedData = encrypt(JSON.stringify(snapshot));
    
    // Still write to file as a temporary cache, but primary storage is now DB
    try {
      fs.writeFileSync(filePath, encryptedData);
    } catch (e) {
      console.warn('Could not write backup file to disk, continuing with DB storage only');
    }

    try {
      const result = await runQuery(pool, `
        INSERT INTO backups (filename, size, type, format, created_by, metadata, data)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `, [
        filename, 
        Buffer.byteLength(encryptedData), 
        type, 
        'enc', 
        createdBy || 'system', 
        JSON.stringify({ tables: tables }),
        encryptedData
      ]);

      // Notify admins
      const admins = await runQuery(pool, "SELECT uid FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await createNotification(
          pool, 
          admin.uid, 
          'success', 
          'Biztonsági mentés sikeres', 
          `✅ Biztonsági mentés sikeres (${new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}). Adatbázis és felhő tárhely szinkronizálva. Méret: ${(Buffer.byteLength(encryptedData) / 1024).toFixed(2)} KB.`
        );
      }

      return result[0];
    } catch (error) {
      // Notify admins of failure
      const admins = await runQuery(pool, "SELECT uid FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await createNotification(
          pool, 
          admin.uid, 
          'error', 
          'KRITIKUS: Mentés sikertelen', 
          `❌ KRITIKUS: A mentés sikertelen! Ok: ${(error as Error).message}. Kérlek, készíts egy manuális mentést most!`
        );
      }
      throw error;
    }
  }

  // Admin Global Routes
  const adminRouter = express.Router();
  adminRouter.use(checkAdmin);

  adminRouter.get('/users', async (_req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT * FROM users ORDER BY created_at DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.put('/users/:uid', async (req, res) => {
    try {
      const { role, is_suspended } = req.body;
      const { uid } = req.params;
      
      await runExec(
        pool, 
        'UPDATE users SET role = COALESCE(?, role), is_suspended = COALESCE(?, is_suspended) WHERE uid = ?',
        [role, is_suspended, uid]
      );
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/users/:uid/insights', async (req, res) => {
    try {
      const { uid } = req.params;
      
      const [profitRows, stockRows, logRows] = await Promise.all([
        runQuery<{ total_profit: string }>(pool, 'SELECT SUM(profit)::text as total_profit FROM sales WHERE "userId" = ?', [uid]),
        runQuery(pool, 'SELECT model, condition, quantity FROM stock WHERE "userId" = ? AND quantity > 0', [uid]),
        runQuery(pool, 'SELECT * FROM audit_logs WHERE "userId" = ? ORDER BY timestamp DESC LIMIT 20', [uid])
      ]);
      
      res.json({
        totalProfit: Number(profitRows[0]?.total_profit || 0),
        stock: stockRows,
        logs: logRows
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  adminRouter.post('/users/:uid/professional-delete', async (req, res) => {
    const admin = (req as any).user;
    const { uid } = req.params;
    const { mode } = req.body; // 'cascade' | 'anonymize'

    try {
      // 1. Fetch user data for export
      const [userRows, salesRows, stockRows, pendingRows, notificationRows] = await Promise.all([
        runQuery(pool, 'SELECT * FROM users WHERE uid = ?', [uid]),
        runQuery(pool, 'SELECT * FROM sales WHERE "userId" = ?', [uid]),
        runQuery(pool, 'SELECT * FROM stock WHERE "userId" = ?', [uid]),
        runQuery(pool, 'SELECT * FROM pending_sales WHERE "userId" = ?', [uid]),
        runQuery(pool, 'SELECT * FROM notifications WHERE "userId" = ?', [uid])
      ]);

      if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
      const user = userRows[0];

      // 2. Security Export (JSON)
      const exportData = {
        meta: {
          exportedAt: new Date().toISOString(),
          exportedBy: admin.email,
          reason: 'PROFESSIONAL_DELETE',
          destructionMode: mode
        },
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          createdAt: user.created_at,
          lastActive: user.last_active
        },
        records: {
          sales: salesRows,
          stock: stockRows,
          pending_sales: pendingRows,
          notifications: notificationRows
        }
      };

      // 3. Send Security Export via Email
      await sendSystemEmail(
        `BIZTONSÁGI EXPORT: Felhasználó törölve (${user.email})`,
        '👤 Felhasználó Végleges Törlése & Export',
        `A rendszerből professzionális törlési folyamattal eltávolításra került a következő felhasználó: <b>${user.displayName || 'Névtelen'} (${user.email})</b>.<br><br>
         <b>Törlés módja:</b> ${mode === 'cascade' ? '🔥 TELJES TÖRLÉS (Mindent törölve)' : '👥 ANONIMIZÁLÁS (Statisztika megőrizve)'}<br>
         <b>Törölte:</b> ${admin.displayName || admin.email}<br><br>
         A felhasználóhoz tartozó összes rögzített adatot (eladások, készlet, értesítések) sikeresen kiexportáltuk biztonsági okokból. Ezt az exportot a rendszergazdai felületen a "Details" mellett tudod majd visszaolvasni, ha szükséges.`,
        { 
          user: user.email, 
          action: 'PROFESSIONAL_DELETE', 
          mode, 
          export: JSON.stringify(exportData, null, 2) 
        }
      );

      // 4. Professional Cleaning Process
      if (mode === 'cascade') {
        // Hard Delete (Nukleáris opció)
        await Promise.all([
          runExec(pool, 'DELETE FROM sales WHERE "userId" = ?', [uid]),
          runExec(pool, 'DELETE FROM stock WHERE "userId" = ?', [uid]),
          runExec(pool, 'DELETE FROM pending_sales WHERE "userId" = ?', [uid]),
          runExec(pool, 'DELETE FROM notifications WHERE "userId" = ?', [uid]),
          runExec(pool, 'DELETE FROM audit_logs WHERE "userId" = ?', [uid]),
          runExec(pool, 'DELETE FROM users WHERE uid = ?', [uid]),
        ]);
      } else {
        // Anonymize (Statisztika kedvelő opció)
        // Keep records but unlink from real identity
        await Promise.all([
          runExec(pool, 'UPDATE sales SET "userId" = ? WHERE "userId" = ?', ['deleted-user', uid]),
          runExec(pool, 'UPDATE stock SET "userId" = ? WHERE "userId" = ?', ['deleted-user', uid]),
          runExec(pool, 'UPDATE pending_sales SET "userId" = ? WHERE "userId" = ?', ['deleted-user', uid]),
          runExec(pool, 'DELETE FROM notifications WHERE "userId" = ?', [uid]),
          runExec(pool, 'DELETE FROM users WHERE uid = ?', [uid]),
        ]);
        // Note: For audit logs, we might want to keep the record but anonymize the ID
        await runExec(pool, 'UPDATE audit_logs SET "userId" = ? WHERE "userId" = ?', ['deleted-user', uid]);
      }

      // 5. Immutable Audit Log Entry
      await runExec(pool, 'INSERT INTO audit_logs ("userId", action, details, timestamp) VALUES (?, ?, ?, NOW())', [
        admin.uid,
        'PROFESSIONAL_USER_DELETE',
        `Deleted user ${user.email} (${uid}) using ${mode} mode. Email with data export sent to admin.`
      ]);

      res.json({ success: true, message: 'User deleted professionally' });
    } catch (error) {
      console.error('❌ Professional delete failed:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/sales', async (_req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT s.*, u.email as "userEmail" FROM sales s LEFT JOIN users u ON s."userId" = u.uid ORDER BY s.date DESC, s.id DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/stock', async (_req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT s.*, u.email as "userEmail" FROM stock s LEFT JOIN users u ON s."userId" = u.uid ORDER BY s.id DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/pending_sales', async (_req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT s.*, u.email as "userEmail" FROM pending_sales s LEFT JOIN users u ON s."userId" = u.uid WHERE s.status = \'pending\' ORDER BY s.date DESC, s.id DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/audit_logs', async (_req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT a.*, u.email AS "userEmail" FROM audit_logs a LEFT JOIN users u ON a."userId" = u.uid ORDER BY a."timestamp" DESC LIMIT 500');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/stats', async (_req, res) => {
    try {
      const [salesCount, stockCount, usersCount, totalProfit] = await Promise.all([
        runQuery<{ count: string }>(pool, 'SELECT COUNT(*)::text AS count FROM sales'),
        runQuery<{ count: string }>(pool, 'SELECT COUNT(*)::text AS count FROM stock'),
        runQuery<{ count: string }>(pool, 'SELECT COUNT(*)::text AS count FROM users'),
        runQuery<{ sum: string }>(pool, 'SELECT SUM(profit)::text AS sum FROM sales'),
      ]);

      res.json({
        totalSales: Number(salesCount[0].count),
        totalStock: Number(stockCount[0].count),
        totalUsers: Number(usersCount[0].count),
        totalProfit: Number(totalProfit[0].sum || 0),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/backups', async (_req, res) => {
    try {
      const backups = await runQuery(pool, 'SELECT id, filename, size, type, format, created_by, created_at, metadata FROM backups ORDER BY created_at DESC');
      res.json(backups);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/backups/details/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const backup = await runQuery(pool, 'SELECT * FROM backups WHERE id = ?', [id]);
      if (!backup.length) return res.status(404).json({ error: 'Mentés nem található' });
      res.json(backup[0]);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/weekly-report', async (_req, res) => {
    try {
      const reports = await runQuery(pool, 'SELECT * FROM weekly_reports ORDER BY created_at DESC LIMIT 1');
      res.json(reports[0] || null);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.post('/ai-diagnostics', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

    try {
      const { message, history = [] } = req.body;

      // Gather system state
      const [logs, stock, backups, stats] = await Promise.all([
        runQuery(pool, 'SELECT a.*, u.email AS "userEmail" FROM audit_logs a LEFT JOIN users u ON a."userId" = u.uid ORDER BY a."timestamp" DESC LIMIT 50'),
        runQuery(pool, 'SELECT * FROM stock'),
        runQuery(pool, 'SELECT id, filename, type, created_at FROM backups ORDER BY created_at DESC LIMIT 5'),
        runQuery(pool, 'SELECT COUNT(*) as sales_count, SUM(profit) as total_profit FROM sales')
      ]);

      const systemContext = {
        timestamp: new Date().toISOString(),
        auditLogs: logs,
        stockLevels: stock,
        recentBackups: backups,
        basicStats: stats[0]
      };

      const systemInstruction = `You are the "AI System Doctor" for an AirPods Inventory & Sales Management application. 
      Your goal is to analyze the system state, identify potential issues (security, data integrity, business logic, technical failures), and provide clear, human-friendly advice to the administrator.
      
      Current System Context: ${JSON.stringify(systemContext)}
      
      Guidelines:
      1. Be professional yet friendly.
      2. If you see failed operations in logs, explain why they might have happened.
      3. If stock is low or profit is negative, point it out.
      4. If backups are missing or old, warn the user.
      5. Translate technical errors into Hungarian (as the user is Hungarian).
      6. Provide actionable steps for any issues found.
      7. Keep responses concise but thorough.`;

      const geminiHistory = history.map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }]
      }));

      const analysis = await callGeminiChat(
        apiKey,
        systemInstruction,
        geminiHistory,
        message || "Kérlek, végezz egy teljes rendszerellenőrzést és írj egy rövid jelentést!"
      );

      res.json({ analysis });
    } catch (error) {
      console.error('AI Diagnostics failed:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.post('/backups/create', async (req, res) => {
    try {
      const user = (req as any).user;
      const backup = await createBackup('manual', user.email);
      await logActivity(user.uid, 'Backup created', `Manual backup created: ${backup.filename}`, req);
      res.json(backup);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.post('/backups/system-artifact', async (req, res) => {
    try {
      const user = (req as any).user;
      const artifact = await createSystemArtifact(user.email);
      await logActivity(user.uid, 'System Artifact created', `Professional system snapshot created: ${artifact.filename}`, req);
      res.json(artifact);
    } catch (error) {
      console.error('Artifact generation failed:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/backups/download-artifact/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const backup = await runQuery(pool, 'SELECT * FROM backups WHERE id = ?', [id]);
      if (!backup.length || backup[0].format !== 'enc_zip') {
        return res.status(404).json({ error: 'Artifact not found' });
      }

      const decryptedBase64 = decrypt(backup[0].data);
      const zipBuffer = Buffer.from(decryptedBase64, 'base64');

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${backup[0].filename.replace('.enc', '')}"`);
      res.send(zipBuffer);
    } catch (error) {
      console.error('Artifact download failed:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Google Drive Vault Upload (Professional Version: Resumable, Checksum, Retention)
  async function uploadToGoogleDrive(filename: string, dataB64: string) {
    const client_id = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const client_secret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const refresh_token = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
    const folder_id = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!client_id || !client_secret || !refresh_token) {
      throw new Error('Hiányzó Google Drive beállítások!');
    }

    // 1. Get Access Token
    const authRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${client_id}&client_secret=${client_secret}&refresh_token=${refresh_token}&grant_type=refresh_token`
    });
    
    const authData = await authRes.json() as any;
    if (!authData.access_token) throw new Error('Google OAuth hiba');
    const accessToken = authData.access_token;

    // 2. Calculate Checksum
    const buffer = Buffer.from(dataB64, 'utf8');
    const checksum = calculateHash(buffer);

    // 3. Initiate Resumable Upload
    const metadata = { 
      name: filename, 
      parents: folder_id ? [folder_id] : [],
      description: `Checksum (SHA-256): ${checksum}`,
      properties: { checksum, vault_version: '2.0' }
    };

    const initiateRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'text/plain',
        'X-Upload-Content-Length': buffer.length.toString()
      },
      body: JSON.stringify(metadata)
    });

    if (!initiateRes.ok) throw new Error(`Létrehozási hiba: ${initiateRes.status}`);
    const uploadUrl = initiateRes.headers.get('Location');
    if (!uploadUrl) throw new Error('Nem kaptam feltöltési URL-t');

    // 4. Upload Data
    const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Length': buffer.length.toString() },
        body: buffer
    });

    if (!uploadRes.ok) throw new Error(`Feltöltési hiba: ${uploadRes.status}`);
    const fileInfo = await uploadRes.json() as any;

    // 5. Get WebViewLink
    const getLinkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileInfo.id}?fields=webViewLink`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const linkData = await getLinkRes.json() as any;

    // 6. Retention Policy: Cleanup old backups (> 30 days)
    try {
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folder_id || 'root'}' in parents and trashed = false&fields=files(id, name, createdTime)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const listData = await listRes.json() as any;
        if (listData.files) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            for (const file of listData.files) {
                if (new Date(file.createdTime) < thirtyDaysAgo && file.name.startsWith('backup-')) {
                    console.log(`🗑️ Cleaning up old Drive backup: ${file.name}`);
                    await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                }
            }
        }
    } catch (e) { console.error('Retention cleanup failed:', e); }

    return { id: fileInfo.id, webViewLink: linkData.webViewLink, checksum };
  }

  adminRouter.post('/backups/vault-upload/:id', async (req, res) => {
    try {
      const { id } = req.params;
      // Fetch full backup with data for upload
      const backupRows = await runQuery(pool, 'SELECT * FROM backups WHERE id = ?', [id]);
      if (!backupRows.length) return res.status(404).json({ error: 'Mentés nem található' });

      // Fallback to disk if DB data is missing (for legacy or low-memory filtered backups)
      if (!backupRows[0].data) {
        const filePath = path.join(BACKUP_DIR, backupRows[0].filename);
        if (fs.existsSync(filePath)) {
          backupRows[0].data = fs.readFileSync(filePath, 'utf8');
        } else {
          return res.status(400).json({ error: 'A mentés bináris adata nem található sem az adatbázisban, sem a lemezen.' });
        }
      }

      // Set initial uploading status so UI can react
      let initialMetadata = backupRows[0].metadata || {};
      if (typeof initialMetadata === 'string') try { initialMetadata = JSON.parse(initialMetadata); } catch(e) {}
      
      await runExec(pool, 'UPDATE backups SET metadata = ? WHERE id = ?', [
        JSON.stringify({ ...initialMetadata, vaultStatus: 'uploading', vaultStartedAt: new Date().toISOString() }),
        id
      ]);

      // Return immediately for UI responsiveness
      res.json({ success: true, message: 'Feltöltés elindítva a háttérben.' });

      // Process in background
      (async () => {
        try {
          console.log(`🚀 Vault: Background uploading ${backupRows[0].filename}...`);
          const uploadResult = await uploadToGoogleDrive(backupRows[0].filename, backupRows[0].data);
          
          // Re-fetch to ensure we have the latest metadata before updating
          const currentRows = await runQuery(pool, 'SELECT metadata FROM backups WHERE id = ?', [id]);
          let updatedMetadata = currentRows[0].metadata || {};
          if (typeof updatedMetadata === 'string') try { updatedMetadata = JSON.parse(updatedMetadata); } catch(e) {}

          await runExec(pool, 'UPDATE backups SET metadata = ? WHERE id = ?', [
            JSON.stringify({ 
                ...updatedMetadata, 
                googleDriveId: uploadResult.id, 
                googleDriveLink: uploadResult.webViewLink,
                checksum: uploadResult.checksum,
                uploadedAt: new Date().toISOString(),
                vaultStatus: 'completed'
            }),
            id
          ]);

          const user = (req as any).user;
          await logActivity(user.uid, 'Vault Upload', `Backup ${backupRows[0].filename} feltöltve (ID: ${uploadResult.id})`, req);
          await createNotification(pool, user.uid, 'success', 'Vault Szinkronizáció', `✅ Mentés sikeresen archiválva a Drive-on: ${backupRows[0].filename}`);
        } catch (error) {
          console.error('Background Vault Upload failed:', error);
          try {
            const currentRows = await runQuery(pool, 'SELECT metadata FROM backups WHERE id = ?', [id]);
            let updatedMetadata = currentRows[0].metadata || {};
            if (typeof updatedMetadata === 'string') try { updatedMetadata = JSON.parse(updatedMetadata); } catch(e) {}
            
            await runExec(pool, 'UPDATE backups SET metadata = ? WHERE id = ?', [
              JSON.stringify({ ...updatedMetadata, vaultStatus: 'failed', lastError: (error as Error).message }),
              id
            ]);
          } catch(e) { console.error('Failed to set failed status:', e); }

          const user = (req as any).user;
          await createNotification(pool, user.uid, 'error', 'Vault Hiba', `❌ Mentés feltöltése sikertelen: ${(error as Error).message}`);
        }
      })();

    } catch (error) {
      console.error('Vault Upload initiation failed:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.post('/system/maintenance', async (req, res) => {
    try {
      const { testMode = false } = req.body;
      const result = await runSystemMaintenance(testMode);
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/system-config', async (req, res) => {
    try {
      const configs = await runQuery(pool, 'SELECT key, value, updated_at FROM system_config');
      const decryptedConfigs = configs.map((c: any) => ({
        ...c,
        value: decrypt(c.value)
      }));
      res.json(decryptedConfigs);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.post('/system-config', async (req, res) => {
    try {
      const { key, value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: 'Missing key or value' });
      
      const encryptedValue = encrypt(value);
      await runExec(pool, `
        INSERT INTO system_config (key, value, updated_at)
        VALUES (?, ?, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [key, encryptedValue]);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/backups/download/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const backup = await runQuery(pool, 'SELECT * FROM backups WHERE id = ?', [id]);
      if (!backup.length) return res.status(404).json({ error: 'Backup not found' });

      let finalContent = backup[0].data;
      if (!finalContent) {
        // Fallback to disk if DB data is missing (for older backups)
        const filePath = path.join(BACKUP_DIR, backup[0].filename);
        if (fs.existsSync(filePath)) {
          finalContent = fs.readFileSync(filePath, 'utf8');
        } else {
          return res.status(404).json({ error: 'Backup data missing' });
        }
      }

      let finalFilename = backup[0].filename;

      if (backup[0].format === 'enc') {
        finalContent = decrypt(finalContent);
        finalFilename = backup[0].filename.replace('.enc', '.json');
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
      res.send(finalContent);
    } catch (error) {
      console.error('Download error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.post('/backups/restore/:id', async (req, res) => {
    try {
      // 1. SAFETY FIRST: Auto-Snapshot before restore
      console.log('⚠️ SAFETY FIRST: Creating auto-snapshot before restore...');
      await createSystemArtifact('system (auto-safety-pre-restore)');
    } catch (e) {
      console.error('Safety snapshot failed, but continuing restore...', e);
    }

    const client = await pool.connect();
    try {
      const { id } = req.params;
      const backup = await runQuery(pool, 'SELECT * FROM backups WHERE id = ?', [id]);
      if (!backup.length) return res.status(404).json({ error: 'Backup not found' });

      let rawData = backup[0].data;
      if (!rawData) {
        const filePath = path.join(BACKUP_DIR, backup[0].filename);
        if (fs.existsSync(filePath)) {
          rawData = fs.readFileSync(filePath, 'utf8');
        } else {
          return res.status(404).json({ error: 'Backup data missing' });
        }
      }
      
      let snapshot;
      if (backup[0].format === 'enc') {
        snapshot = JSON.parse(decrypt(rawData));
      } else {
        snapshot = JSON.parse(rawData);
      }

      await client.query('BEGIN');

      // Clear existing data
      const tables = ['audit_logs', 'market_prices', 'pending_sales', 'sales', 'stock', 'product_models', 'users'];
      for (const table of tables) {
        await client.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
      }

      // Restore data
      for (const table of tables) {
        const rows = snapshot[table];
        if (rows && rows.length > 0) {
          const columns = Object.keys(rows[0]);
          await bulkInsert(client, table, columns, rows.map((r: any) => columns.map(c => r[c])));
        }
      }

      await client.query('COMMIT');
      const user = (req as any).user;
      await logActivity(user.uid, 'System Restored', `System restored from backup: ${backup[0].filename}`, req);
      
      // Notify admin via Email
      await sendSystemEmail(
        'Sikeres Visszaállítás',
        '✅ Rendszer sikeresen visszaállítva',
        `A rendszert sikeresen visszaállítottuk a következő mentésből: <b>${backup[0].filename}</b>.<br>A frissítő művelet előtt a biztonság kedvéért automatikus Snapshot mentés készült minden adatról és a szerver kódjáról is.`,
        { backupId: backup[0].id, type: backup[0].type, restoredAt: new Date().toISOString() }
      );

      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: (error as Error).message });
    } finally {
      client.release();
    }
  });

  adminRouter.get('/export/:format', async (req, res) => {
    try {
      const format = req.params.format;
      const tables = ['product_models', 'stock', 'sales', 'pending_sales', 'market_prices', 'audit_logs'];
      const data: Record<string, any> = {};

      for (const table of tables) {
        data[table] = await runQuery(pool, `SELECT * FROM "${table}"`);
      }

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=export.json');
        return res.send(JSON.stringify(data, null, 2));
      }

      if (format === 'xlsx') {
        const wb = XLSX.utils.book_new();
        for (const table of tables) {
          const ws = XLSX.utils.json_to_sheet(data[table]);
          XLSX.utils.book_append_sheet(wb, ws, table);
        }
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=export.xlsx');
        return res.send(buf);
      }

      res.status(400).json({ error: 'Invalid format' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/ai/tips', async (req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT * FROM ai_tips ORDER BY created_at DESC LIMIT 20');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/ai/audit-flags', async (req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT * FROM data_audit_flags ORDER BY created_at DESC LIMIT 50');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/ai/health-checks', async (req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT * FROM system_health_checks ORDER BY created_at DESC LIMIT 50');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.get('/ai/archives', async (req, res) => {
    try {
      const rows = await runQuery(pool, 'SELECT * FROM archived_summaries ORDER BY created_at DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.post('/ai/trigger-drill', async (req, res) => {
    try {
      await runDisasterRecoveryDrill();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  adminRouter.post('/ai/trigger-audit', async (req, res) => {
    try {
      await runAIDataAudit();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Public (Authenticated) system config for session timeout
  apiRouter.get('/config/session-timeout', async (req, res) => {
    try {
      const config = await runQuery(pool, "SELECT value FROM system_config WHERE key = 'SESSION_TIMEOUT_MINUTES'");
      const value = config.length > 0 ? decrypt(config[0].value) : '15';
      res.json({ value });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.use('/admin', adminRouter);

  // Notifications Routes
  apiRouter.get('/notifications', async (req, res) => {
    try {
      const user = (req as any).user;
      const rows = await runQuery(pool, 'SELECT * FROM notifications WHERE "userId" = ? ORDER BY created_at DESC LIMIT 50', [user.uid]);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/notifications/:id/read', async (req, res) => {
    try {
      const user = (req as any).user;
      await runExec(pool, 'UPDATE notifications SET is_read = TRUE WHERE id = ? AND "userId" = ?', [req.params.id, user.uid]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/notifications/read-all', async (req, res) => {
    try {
      const user = (req as any).user;
      await runExec(pool, 'UPDATE notifications SET is_read = TRUE WHERE "userId" = ?', [user.uid]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // --- CONSOLIDATED DAILY MAINTENANCE (SUPABASE EGRESS OPTIMIZATION) ---
  async function runConsolidatedDailyMaintenance() {
    console.log('🌟 Starting Consolidated Daily Maintenance & Backup...');
    try {
      // 1. Create Mega Snapshot (Encrypted)
      const artifact = await createSystemArtifact('consolidated (auto)');
      console.log(`✅ Snapshot created: ${artifact.filename}`);

      // 2. Immediate Google Drive Sync
      let driveLink = 'N/A';
      let vaultStatus = 'failed';
      try {
        const uploadResult = await uploadToGoogleDrive(artifact.filename, artifact.data);
        driveLink = uploadResult.webViewLink;
        vaultStatus = 'completed';

        let currentMetadata = artifact.metadata || {};
        if (typeof currentMetadata === 'string') try { currentMetadata = JSON.parse(currentMetadata); } catch(e) {}

        await runExec(pool, 'UPDATE backups SET metadata = ?, data = NULL WHERE id = ?', [
          JSON.stringify({ 
              ...currentMetadata, 
              googleDriveId: uploadResult.id, 
              googleDriveLink: driveLink,
              checksum: uploadResult.checksum,
              uploadedAt: new Date().toISOString(),
              vaultStatus: 'completed',
              isArchived: true // Mark as archived immediately to save Supabase DB storage
          }),
          artifact.id
        ]);
        console.log('✅ Auto-vault sync successful. Data offloaded from DB.');
      } catch (vaultErr) {
        console.error('❌ Auto-vault sync failed:', vaultErr);
      }

      // 3. System Maintenance (Cleanup old stuff)
      const maintenanceResult = await runSystemMaintenance(false);

      // 4. Send Unified Report
      await sendSystemEmail(
        'Napi Rendszerkarbantartás Sikeres',
        '🌟 Összesített Karbantartási Jelentés',
        `A napi biztonsági mentés és rendszerkarbantartás lefutott.<br><br>
         <b>Mentés:</b> ${artifact.filename}<br>
         <b>Vault:</b> ${vaultStatus === 'completed' ? '☁️ Szinkronizálva a Google Drive-ra' : '❌ Hiba a feltöltésnél!'}<br>
         <b>清理:</b> -${maintenanceResult.logsRemoved} napló törölve, ${maintenanceResult.backupsOffloaded} mentés archiválva.`,
        { 
          filename: artifact.filename, 
          size: `${(artifact.size / 1024 / 1024).toFixed(2)} MB`, 
          googleDrive: driveLink,
          maintenance: maintenanceResult
        }
      );

      // 5. Run Predictions
      await runStockPredictions();

    } catch (error) {
      console.error('❌ Consolidated maintenance failed:', error);
      await sendSystemEmail(
        'KRITIKUS: Karbantartási Hiba', 
        '❌ HIBA A NAPI KARBANTARTÁSNÁL', 
        `Váratlan hiba történt: ${(error as Error).message}`
      );
    }
  }

  // --- CRON TRIGGERS (OPTIMIZED FOR SUPABASE) ---

  // Consolidated Daily Job at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    await runConsolidatedDailyMaintenance();
  });

  // Schedule AI Data Guard: Daily at 1 AM
  cron.schedule('0 1 * * *', async () => {
    await runAIDataAudit();
  });

  // Schedule Proactive AI Review: Daily at 11 PM
  cron.schedule('0 23 * * *', async () => {
    await runProactiveAIReview();
  });

  // Schedule Weekly Report: Sunday at 8 PM
  cron.schedule('0 20 * * 0', async () => {
    console.log('Generating Scheduled Business Report...');
    try { await generateAndSendReport(14); } catch (e) {}
  });

  // Schedule Self-Healing every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await runSelfHealingMonitor();
  });

  // Professional Tiered Maintenance 
  async function runSystemMaintenance(forceAll: boolean = false) {
    console.log(`🧹 Starting Professional Tiered Storage Cleanup (Force: ${forceAll})...`);
    try {
      // 1. CLEANUP AUDIT LOGS (Aggressive technical cleanup: 7 days, Business events: 30 days)
      // Keep important user actions for 30 days, technical logs for 7
      const deletedLogs = await runExec(pool, `
        DELETE FROM audit_logs 
        WHERE (action LIKE '%API%' OR action LIKE '%Cron%' OR action LIKE '%Health%') AND timestamp < NOW() - INTERVAL '7 days'
        OR timestamp < NOW() - INTERVAL '30 days'
      `);
      console.log(`🗑️ Audit logs cleaned: ${deletedLogs.rowCount} rows removed.`);

      // 2. OFFLOAD BACKUPS (> 7 days if they are on Drive)
      const backupInterval = forceAll ? '0 days' : '7 days';
      const oldBackups = await runQuery(pool, `
        SELECT id, filename, metadata FROM backups 
        WHERE created_at < NOW() - INTERVAL '${backupInterval}' 
        AND data IS NOT NULL 
        AND type != 'system'
      `);

      let offloadedBackups = 0;
      for (const b of oldBackups) {
        let meta = b.metadata || {};
        if (typeof meta === 'string') try { meta = JSON.parse(meta); } catch(e) {}
        
        if (meta.googleDriveId || meta.vaultStatus === 'completed') {
          console.log(`📦 Offloading old backup to Vault: ${b.filename}`);
          await runExec(pool, 'UPDATE backups SET data = NULL, metadata = ? WHERE id = ?', [
            JSON.stringify({ ...meta, isArchived: true, offloadedAt: new Date().toISOString() }),
            b.id
          ]);
          offloadedBackups++;
        }
      }

      // 3. OFFLOAD SNAPSHOTS (Keep last 2, offload > 14 days if on Drive)
      const snapshotInterval = forceAll ? '0 days' : '14 days';
      const oldSnapshots = await runQuery(pool, `
        SELECT id, filename, metadata FROM backups 
        WHERE created_at < NOW() - INTERVAL '${snapshotInterval}' 
        AND data IS NOT NULL 
        AND type = 'system'
        ORDER BY created_at DESC
        OFFSET 2
      `);

      let offloadedSnapshots = 0;
      for (const s of oldSnapshots) {
        let meta = s.metadata || {};
        if (typeof meta === 'string') try { meta = JSON.parse(meta); } catch(e) {}
        
        if (meta.googleDriveId || meta.vaultStatus === 'completed') {
          console.log(`🛸 Archiving old System Snapshot: ${s.filename}`);
          await runExec(pool, 'UPDATE backups SET data = NULL, metadata = ? WHERE id = ?', [
            JSON.stringify({ ...meta, isArchived: true, offloadedAt: new Date().toISOString() }),
            s.id
          ]);
          offloadedSnapshots++;
        }
      }

      console.log('✅ Tiered Storage Cleanup completed successfully.');
      
      await sendSystemEmail(
        'Rendszerkarbantartás Sikeres',
        '🧹 Karbantartási Jelentés',
        `Az éjszakai karbantartás befejeződött.<br>Audit logok: <b>-${deletedLogs.rowCount}</b><br>Archivált mentések: <b>${offloadedBackups}</b><br>Archivált snapshotok: <b>${offloadedSnapshots}</b>`,
        { logsRemoved: deletedLogs.rowCount, backupsOffloaded: offloadedBackups, snapshotsOffloaded: offloadedSnapshots }
      );
      
      return { logsRemoved: deletedLogs.rowCount, backupsOffloaded: offloadedBackups, snapshotsOffloaded: offloadedSnapshots };
    } catch (error) {
      console.error('❌ Tiered Storage Cleanup failed:', error);
      throw error;
    }
  }

  // Runs every day at 4 AM (after the 3 AM backup)
  cron.schedule('0 4 * * *', async () => {
    await runSystemMaintenance(false);
    await runStockPredictions();
  });

  // Schedule Self-Healing every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    await runSelfHealingMonitor();
  });

  // 🛡️ AI Data Guard: Daily at 1 AM (after snapshot)
  cron.schedule('0 1 * * *', async () => {
    await runAIDataAudit();
  });

  // ⚡ Database Optimizer: Weekly on Saturday at 1 AM (shifted)
  cron.schedule('0 1 * * 6', async () => {
    await runDatabaseOptimizer();
  });

  // 📚 Business Historian: Weekly on Sunday at 4 AM (shifted)
  cron.schedule('0 4 * * 0', async () => {
    await runDataArchiver();
  });

  // 🩺 Disaster Recovery Drill: Monthly on the 1st at 5 AM (shifted)
  cron.schedule('0 5 1 * *', async () => {
    await runDisasterRecoveryDrill();
  });

  apiRouter.post('/admin/reports/test-send', checkAdmin, async (req, res) => {
    try {
      const result = await generateAndSendReport(14);
      res.json({ success: true, report: result });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/system/restore', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    try {
      // 1. SAFETY FIRST: Auto-Snapshot before data restore
      console.log('⚠️ SAFETY FIRST: Creating auto-snapshot before data restore...');
      await createSystemArtifact('system (auto-safety-pre-restore)');
    } catch (e) {
      console.error('Safety snapshot failed, but continuing restore...', e);
    }

    const client = await pool.connect();

    try {
      const { data } = req.body;
      if (!data) throw new Error('Invalid backup data');

      await client.query('BEGIN');

      await client.query('DELETE FROM sales');
      await client.query('DELETE FROM stock');
      await client.query('DELETE FROM pending_sales');
      await client.query('DELETE FROM market_prices');

      if (data.sales?.length > 0) {
        await bulkInsert(
          client,
          'sales',
          [
            'date',
            'model',
            'condition',
            'platform',
            'quantity',
            'buy_price',
            'sell_price',
            'fees',
            'profit',
            'buyer',
            'city',
            'tracking_number',
            'notes',
            'userId',
          ],
          data.sales.map((s: any) => [
            s.date,
            s.model,
            s.condition,
            s.platform,
            s.quantity,
            s.buy_price,
            s.sell_price,
            s.fees,
            s.profit,
            s.buyer,
            s.city,
            s.tracking_number,
            s.notes,
            s.userId,
          ])
        );
      }

      if (data.stock?.length > 0) {
        await bulkInsert(
          client,
          'stock',
          ['model', 'condition', 'quantity', 'buy_price', 'lead_time', 'userId'],
          data.stock.map((s: any) => [s.model, s.condition, s.quantity, s.buy_price, s.lead_time, s.userId || 'legacy'])
        );
      }

      if (data.pending_sales?.length > 0) {
        await bulkInsert(
          client,
          'pending_sales',
          [
            'date',
            'model',
            'condition',
            'platform',
            'quantity',
            'buy_price',
            'sell_price',
            'fees',
            'profit',
            'buyer',
            'city',
            'tracking_number',
            'notes',
            'userId',
            'status',
          ],
          data.pending_sales.map((s: any) => [
            s.date,
            s.model,
            s.condition,
            s.platform,
            s.quantity,
            s.buy_price,
            s.sell_price,
            s.fees,
            s.profit,
            s.buyer,
            s.city,
            s.tracking_number,
            s.notes,
            s.userId,
            s.status,
          ])
        );
      }

      if (data.market_prices?.length > 0) {
        await bulkInsert(
          client,
          'market_prices',
          ['model', 'condition', 'platform', 'price', 'date'],
          data.market_prices.map((p: any) => [p.model, p.condition, p.platform, p.price, p.date])
        );
      }

      await client.query('COMMIT');

      // Notify admin via Email
      const user = (req as any).user;
      await sendSystemEmail(
        'Sikeres Adat Visszaállítás',
        '✅ Adatbázis sikeresen visszaállítva',
        `A manuálisan feltöltött adatok sikeresen bekerültek az adatbázisba.<br>A frissítő művelet előtt a biztonság kedvéért automatikus Snapshot mentés készült minden adatról és a szerver kódjáról is.`,
        { restoredBy: user.displayName || user.email, restoredAt: new Date().toISOString() }
      );

      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: (error as Error).message });
    } finally {
      client.release();
    }
  });

  // Lazy Cron: Check for daily backup on every request
  let lastAutoBackupCheck = 0;
  apiRouter.use(async (req, res, next) => {
    const now = Date.now();
    // Check every 15 minutes
    if (now - lastAutoBackupCheck > 15 * 60 * 1000) {
      lastAutoBackupCheck = now;
      const today = new Date();
      if (today.getHours() >= 3) {
        const dateStr = today.toISOString().split('T')[0];
        try {
          const existing = await runQuery(pool, 
            "SELECT id FROM backups WHERE type = 'auto' AND created_at::date = ?", 
            [dateStr]
          );
          if (existing.length === 0) {
            console.log('Lazy Cron: Creating daily backup...');
            await createBackup('auto');
          }
        } catch (error) {
          console.error('Lazy Cron failed:', error);
        }
      }
    }
    next();
  });

  // AI endpoints
  apiRouter.post('/ai/demand-forecast', async (req, res) => {
    try {
      const apiKey = requireEnv('GEMINI_API_KEY');
      const { sales, model, condition } = req.body;

      const modelSales = (sales || []).filter((s: any) => s.model === model && s.condition === condition);

      const result = await callGeminiJSON<{
        predictions: {
          date: string;
          predicted_demand: number;
          seasonal_factor: number;
          trend_effect: number;
        }[];
        summary: string;
      }>(
        apiKey,
        jsonBlockPrompt(
          `Analyze the following sales data for ${model} (${condition}) and provide a 90-day demand forecast in Hungarian.`,
          {
            sales: modelSales.map((s: any) => ({ date: s.date, quantity: s.quantity })),
            currentDate: new Date().toISOString().split('T')[0],
          },
          `{
  "predictions": [
    {
      "date": "YYYY-MM-DD",
      "predicted_demand": 0,
      "seasonal_factor": 1,
      "trend_effect": 0
    }
  ],
  "summary": "..."
}`
        )
      );

      res.json(result);
    } catch (error) {
      console.error('AI demand forecast error:', error);
      res.status(500).json({ error: 'AI demand forecast failed' });
    }
  });

  apiRouter.post('/ai/smart-pricing', async (req, res) => {
    try {
      const apiKey = requireEnv('GEMINI_API_KEY');
      const { product, marketPrices, recentSales } = req.body;

      const filteredMarketPrices = (marketPrices || []).filter(
        (p: any) => p.model === product.model && p.condition === product.condition
      );
      const filteredRecentSales = (recentSales || [])
        .filter((s: any) => s.model === product.model && s.condition === product.condition)
        .slice(-10);

      const result = await callGeminiJSON<{
        final_price: number;
        base_price: number;
        market_adjustment: number;
        demand_factor: number;
        seasonal_factor: number;
        stock_factor: number;
        confidence_score: number;
        pricing_strategy: string;
        reasoning: string;
      }>(
        apiKey,
        jsonBlockPrompt(
          'Calculate an intelligent dynamic price in Hungarian.',
          {
            product,
            marketPrices: filteredMarketPrices,
            recentSales: filteredRecentSales,
            currentDate: new Date().toISOString().split('T')[0],
          },
          `{
  "final_price": 0,
  "base_price": 0,
  "market_adjustment": 0,
  "demand_factor": 1,
  "seasonal_factor": 1,
  "stock_factor": 1,
  "confidence_score": 0.8,
  "pricing_strategy": "...",
  "reasoning": "..."
}`
        )
      );

      res.json(result);
    } catch (error) {
      console.error('AI smart pricing error:', error);
      res.status(500).json({ error: 'AI smart pricing failed' });
    }
  });

  apiRouter.post('/ai/customer-analysis', async (req, res) => {
    try {
      const apiKey = requireEnv('GEMINI_API_KEY');
      const { sales } = req.body;

      const result = await callGeminiJSON<{
        segments: { high_value: number; medium_value: number; low_value: number };
        details: {
          segment: string;
          avg_purchase_count: number;
          avg_total_spent: number;
          avg_profit: number;
          recommendation: string;
        }[];
      }>(
        apiKey,
        jsonBlockPrompt(
          'Analyze customer behavior and segment them in Hungarian.',
          {
            sales: (sales || []).map((s: any) => ({
              buyer: s.buyer,
              price: s.sell_price,
              profit: s.profit,
              date: s.date,
            })),
          },
          `{
  "segments": {
    "high_value": 0,
    "medium_value": 0,
    "low_value": 0
  },
  "details": [
    {
      "segment": "...",
      "avg_purchase_count": 0,
      "avg_total_spent": 0,
      "avg_profit": 0,
      "recommendation": "..."
    }
  ]
}`
        )
      );

      res.json(result);
    } catch (error) {
      console.error('AI customer analysis error:', error);
      res.status(500).json({ error: 'AI customer analysis failed' });
    }
  });

  apiRouter.post('/ai/geographical-analysis', async (req, res) => {
    try {
      const apiKey = requireEnv('GEMINI_API_KEY');
      const { cityData } = req.body;

      const result = await callGeminiJSON<{
        insights: {
          title: string;
          description: string;
          impact: 'low' | 'medium' | 'high';
        }[];
        summary: string;
        recommendations: string[];
      }>(
        apiKey,
        jsonBlockPrompt(
          'Analyze the geographical distribution of sales in Hungarian.',
          { cityData },
          `{
  "insights": [
    {
      "title": "...",
      "description": "...",
      "impact": "low"
    }
  ],
  "summary": "...",
  "recommendations": ["..."]
}`
        )
      );

      res.json(result);
    } catch (error) {
      console.error('AI geographical analysis error:', error);
      res.status(500).json({ error: 'AI geographical analysis failed' });
    }
  });

  apiRouter.post('/ai/detect-anomalies', async (req, res) => {
    try {
      const apiKey = requireEnv('GEMINI_API_KEY');
      const { sales } = req.body;

      const result = await callGeminiJSON<{
        anomalies: {
          id?: string;
          date: string;
          model: string;
          reason: string;
          severity: 'low' | 'medium' | 'high';
          type: string;
        }[];
        risk_score: number;
      }>(
        apiKey,
        jsonBlockPrompt(
          'Detect anomalies or suspicious patterns in these sales in Hungarian.',
          { sales: (sales || []).slice(-50) },
          `{
  "anomalies": [
    {
      "id": "1",
      "date": "YYYY-MM-DD",
      "model": "...",
      "reason": "...",
      "severity": "medium",
      "type": "..."
    }
  ],
  "risk_score": 0
}`
        )
      );

      res.json(result);
    } catch (error) {
      console.error('AI anomaly detection error:', error);
      res.status(500).json({ error: 'AI anomaly detection failed' });
    }
  });

  apiRouter.post('/ai/pipeline-analysis', async (req, res) => {
    try {
      const apiKey = requireEnv('GEMINI_API_KEY');
      const { pendingSales } = req.body;

      const result = await callGeminiJSON<{
        potential_revenue: number;
        potential_profit: number;
        risk_assessment: string;
        recommendations: string[];
        closing_forecast: {
          timeframe: string;
          expected_conversion: number;
        }[];
      }>(
        apiKey,
        jsonBlockPrompt(
          'Analyze the following pending sales pipeline and provide insights in Hungarian.',
          {
            pendingSales: (pendingSales || []).map((s: any) => ({
              model: s.model,
              platform: s.platform,
              revenue: s.sell_price,
              profit: s.profit,
              date: s.date,
            })),
          },
          `{
  "potential_revenue": 0,
  "potential_profit": 0,
  "risk_assessment": "...",
  "recommendations": ["..."],
  "closing_forecast": [
    {
      "timeframe": "...",
      "expected_conversion": 0
    }
  ]
}`
        )
      );

      res.json(result);
    } catch (error) {
      console.error('AI pipeline analysis error:', error);
      res.status(500).json({ error: 'AI pipeline analysis failed' });
    }
  });

  apiRouter.post('/ai/profit-prediction', async (req, res) => {
    try {
      const apiKey = requireEnv('GEMINI_API_KEY');
      const { sales } = req.body;

      const result = await callGeminiJSON<{
        predictions: {
          date: string;
          predicted_profit: number;
          confidence_upper: number;
          confidence_lower: number;
        }[];
        insights: string[];
      }>(
        apiKey,
        jsonBlockPrompt(
          'Predict the profit for the next 3 months in Hungarian based on historical sales data.',
          {
            sales: (sales || []).map((s: any) => ({
              date: s.date,
              profit: s.profit,
            })),
            currentDate: new Date().toISOString().split('T')[0],
          },
          `{
  "predictions": [
    {
      "date": "YYYY-MM",
      "predicted_profit": 0,
      "confidence_upper": 0,
      "confidence_lower": 0
    }
  ],
  "insights": ["..."]
}`
        )
      );

      res.json(result);
    } catch (error) {
      console.error('AI profit prediction error:', error);
      res.status(500).json({ error: 'AI profit prediction failed' });
    }
  });

  apiRouter.post('/ai/chat', async (req, res) => {
    try {
      const apiKey = requireEnv('GEMINI_API_KEY');
      const { message, history, context } = req.body;

      const systemInstruction = `You are a professional Business Assistant for an AirPods reseller.
Your goal is to help the user manage their business by providing insights based on their data.

Current Business Data Summary:
- Total Sales: ${context?.sales?.length || 0}
- Total Stock Items: ${context?.stock?.length || 0}
- Pending Sales: ${context?.pendingSales?.length || 0}

Detailed Data:
- Sales: ${JSON.stringify((context?.sales || []).slice(-50))}
- Stock: ${JSON.stringify(context?.stock || [])}
- Pending: ${JSON.stringify(context?.pendingSales || [])}

Guidelines:
1. Be concise and professional.
2. Always answer in Hungarian.
3. If asked about what to buy, look at stock levels and recent sales trends.
4. If asked about profits, calculate them from the sales data.
5. If there is not enough data, clearly say so.
6. Use markdown for formatting when helpful.
7. Current Date: ${new Date().toISOString().split('T')[0]}`;

      const text = await callGeminiChat(apiKey, systemInstruction, history || [], message || '');
      res.json({ text });
    } catch (error) {
      console.error('Gemini chat error:', error);
      res.status(500).json({ error: 'AI chat failed' });
    }
  });

  apiRouter.all('*', (req, res) => {
    console.warn(`⚠️ Unmatched API route: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      error: 'API route not found',
      method: req.method,
      url: req.originalUrl,
    });
  });

  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server is running!`);
    console.log(`🏠 Local:            http://localhost:${PORT}`);
    console.log(`🌐 Network (Phone):  http://${localIp}:${PORT}\n`);
  });
}

startServer().catch((error) => {
  console.error('❌ Fatal startup error:', error);
  process.exit(1);
});
