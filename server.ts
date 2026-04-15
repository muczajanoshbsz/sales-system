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

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift()!, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const key = crypto.scryptSync(BACKUP_SECRET, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
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
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Gemini request failed');
  }

  const text = extractResponseText(data);
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
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          ...history,
          { role: 'user', parts: [{ text: message }] },
        ],
        generationConfig: {
          temperature: 0.7,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Gemini chat request failed');
  }

  return extractResponseText(data);
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

  const logActivity = async (userId: string, action: string, details: string, req?: express.Request) => {
    let finalDetails = details;
    const user = req ? (req as any).user : null;
    
    if (user && user.isGhostMode) {
      finalDetails = `[GHOST MODE] Admin ${user.adminName} (${user.adminUid}) as User ${userId}: ${details}`;
    }

    try {
      await runExec(pool, 'INSERT INTO audit_logs ("userId", action, details) VALUES (?, ?, ?)', [
        userId,
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
          const rows = data.stock || [];
          return res.json(isAdmin ? rows : rows.filter((r: any) => r.userId === user?.uid));
      }
      if (pathName === '/sales' || pathName === '/admin/sales') {
          const rows = data.sales || [];
          return res.json(isAdmin ? rows : rows.filter((r: any) => r.userId === user?.uid));
      }
      if (pathName === '/pending_sales' || pathName === '/admin/pending_sales') {
          const rows = data.pending_sales || [];
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
      const { uid, email, displayName } = req.body;
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

  // Create a backup
  async function createBackup(type: 'auto' | 'manual', createdBy?: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${timestamp}.enc`;
    const filePath = path.join(BACKUP_DIR, filename);

    // Fetch all data for the snapshot
    const tables = ['product_models', 'stock', 'sales', 'pending_sales', 'market_prices', 'audit_logs', 'users'];
    const snapshot: Record<string, any> = {};

    for (const table of tables) {
      snapshot[table] = await runQuery(pool, `SELECT * FROM "${table}"`);
    }

    const encryptedData = encrypt(JSON.stringify(snapshot));
    
    // Still write to file as a temporary cache, but primary storage is now DB
    try {
      fs.writeFileSync(filePath, encryptedData);
    } catch (e) {
      console.warn('Could not write backup file to disk, continuing with DB storage only');
    }

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

    return result[0];
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
      const backups = await runQuery(pool, 'SELECT * FROM backups ORDER BY created_at DESC');
      res.json(backups);
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
      await logActivity(req as any, 'Backup created', `Manual backup created: ${backup.filename}`);
      res.json(backup);
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
      await logActivity(req as any, 'System Restored', `System restored from backup: ${backup[0].filename}`);
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

  apiRouter.use('/admin', adminRouter);

  // Schedule daily backup at 3 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('Running scheduled daily backup...');
    try {
      await createBackup('auto');
      console.log('Scheduled backup successful');
    } catch (error) {
      console.error('Scheduled backup failed:', error);
    }
  });

  apiRouter.post('/system/restore', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

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
