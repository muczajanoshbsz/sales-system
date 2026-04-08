import express from 'express';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import os from 'os';

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
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

        CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_unique_model_condition
          ON stock (model, "condition");

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
      `);

      console.log('✅ Database tables initialized');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  };

  await initDb();

  const logActivity = async (userId: string, action: string, details: string) => {
    try {
      await runExec(pool, 'INSERT INTO audit_logs ("userId", action, details) VALUES (?, ?, ?)', [
        userId,
        action,
        details,
      ]);
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  };

  const getUserContext = async (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const userId = req.headers['x-user-id'] as string | undefined;

    if (!userId) {
      (req as any).user = { role: 'guest' };
      return next();
    }

    try {
      const rows = await runQuery(pool, 'SELECT role FROM users WHERE uid = ?', [userId]);
      if (rows.length > 0) {
        (req as any).user = { uid: userId, role: rows[0].role };
      } else {
        (req as any).user = { uid: userId, role: 'client' };
      }
    } catch {
      (req as any).user = { uid: userId, role: 'client' };
    }

    next();
  };

  const apiRouter = express.Router();
  apiRouter.use(getUserContext);

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

      if (existing.length === 0) {
        const countRows = await runQuery<{ count: string }>(pool, 'SELECT COUNT(*)::text AS count FROM users');
        const role = Number(countRows[0].count) === 0 || email === 'csmucza@gmail.com' ? 'admin' : 'client';

        await runExec(
          pool,
          'INSERT INTO users (uid, email, "displayName", role) VALUES (?, ?, ?, ?)',
          [uid, email, displayName ?? null, role]
        );

        if (role === 'admin') {
          await Promise.all([
            runExec(pool, 'UPDATE sales SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE stock SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE pending_sales SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE audit_logs SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
          ]);
        }

        return res.json({ uid, email, displayName, role });
      }

      const role = email === 'csmucza@gmail.com' ? 'admin' : existing[0].role;

      await runExec(pool, 'UPDATE users SET email = ?, "displayName" = ?, role = ? WHERE uid = ?', [
        email,
        displayName ?? null,
        role,
        uid,
      ]);

      if (role === 'admin') {
        const legacyCheck = await runQuery<{ count: string }>(
          pool,
          'SELECT COUNT(*)::text AS count FROM sales WHERE "userId" = ?',
          ['legacy']
        );

        if (Number(legacyCheck[0].count) > 0) {
          await Promise.all([
            runExec(pool, 'UPDATE sales SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE stock SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE pending_sales SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
            runExec(pool, 'UPDATE audit_logs SET "userId" = ? WHERE "userId" = ?', [uid, 'legacy']),
          ]);
        }
      }

      res.json({ ...existing[0], email, displayName, role });
    } catch (error) {
      console.error('❌ User sync error:', error);
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

    try {
      let query = 'SELECT a.*, u.email AS "userEmail" FROM audit_logs a LEFT JOIN users u ON a."userId" = u.uid';
      const params: any[] = [];

      if (user.role !== 'admin') {
        query += ' WHERE a."userId" = ?';
        params.push(user.uid);
      }

      query += ' ORDER BY a."timestamp" DESC LIMIT 100';
      const rows = await runQuery(pool, query, params);
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

    try {
      let query = 'SELECT * FROM sales';
      const params: any[] = [];

      if (user.role !== 'admin') {
        if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });
        query += ' WHERE "userId" = ?';
        params.push(user.uid);
      }

      query += ' ORDER BY date DESC, id DESC';
      const rows = await runQuery(pool, query, params);
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

      await logActivity(userId, 'CREATE_SALE', `${sale.model} (${sale.quantity} db) - ${sale.platform}`);
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

      await logActivity(sale.userId, 'DELETE_SALE', `${sale.model} - ${sale.platform}`);
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

      await logActivity(user.uid, 'UPDATE_SALE', `${sale.model} - ${sale.platform}`);
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

    try {
      let query = 'SELECT * FROM stock';
      const params: any[] = [];

      if (user.role !== 'admin') {
        if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });
        query += ' WHERE "userId" = ?';
        params.push(user.uid);
      }

      query += ' ORDER BY id DESC';
      const rows = await runQuery(pool, query, params);
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

      const { quantity, lead_time } = req.body;
      if (lead_time !== undefined) {
        await runExec(pool, 'UPDATE stock SET quantity = ?, lead_time = ? WHERE id = ?', [
          quantity,
          lead_time,
          req.params.id,
        ]);
      } else {
        await runExec(pool, 'UPDATE stock SET quantity = ? WHERE id = ?', [quantity, req.params.id]);
      }

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

      await runExec(pool, 'DELETE FROM stock WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/pending_sales', async (req, res) => {
    const user = (req as any).user;

    try {
      let query = 'SELECT * FROM pending_sales WHERE status = ?';
      const params: any[] = ['pending'];

      if (user.role !== 'admin') {
        if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });
        query += ' AND "userId" = ?';
        params.push(user.uid);
      }

      query += ' ORDER BY date DESC, id DESC';
      const rows = await runQuery(pool, query, params);
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

      const { status } = req.body;
      await runExec(pool, 'UPDATE pending_sales SET status = ? WHERE id = ?', [status, req.params.id]);
      res.json({ success: true });
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