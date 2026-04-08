import express from 'express';
import { createServer as createViteServer } from 'vite';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import os from 'os';

dotenv.config();

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

async function startServer() {
  const app = express();
  const PORT = 3000;
  const localIp = getLocalIp();

  app.use(express.json());

  // Global Request Logger
  app.use((req, res, next) => {
    console.log(`📡 Request: ${req.method} ${req.originalUrl}`);
    next();
  });

  // MySQL Connection Pool
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'airpods_manager',
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Test connection
  try {
    const connection = await pool.getConnection();
    console.log('✅ Connected to MySQL database');
    connection.release();
  } catch (error) {
    console.error('❌ Failed to connect to MySQL database:', error);
    console.log('💡 Tip: Make sure your MySQL server is running and the credentials in .env are correct.');
  }

  // Database Initialization
  const initDb = async () => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS sales (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATE NOT NULL,
          model VARCHAR(100) NOT NULL,
          \`condition\` VARCHAR(50) NOT NULL,
          platform VARCHAR(50) NOT NULL,
          quantity INT NOT NULL DEFAULT 1,
          buy_price DECIMAL(10, 2) NOT NULL,
          sell_price DECIMAL(10, 2) NOT NULL,
          fees DECIMAL(10, 2) DEFAULT 0,
          profit DECIMAL(10, 2) NOT NULL,
          buyer VARCHAR(255),
          city VARCHAR(100),
          tracking_number VARCHAR(255),
          notes TEXT,
          userId VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Migration: Ensure userId column exists in sales table
      try {
        const [columns]: any = await pool.query('SHOW COLUMNS FROM sales LIKE "userId"');
        if (columns.length === 0) {
          console.log('Adding userId column to sales table...');
          await pool.query('ALTER TABLE sales ADD COLUMN userId VARCHAR(100) NOT NULL DEFAULT "legacy"');
          console.log('userId column added to sales successfully.');
        }
      } catch (err) {
        console.error('Migration error (sales userId):', err);
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS stock (
          id INT AUTO_INCREMENT PRIMARY KEY,
          model VARCHAR(100) NOT NULL,
          \`condition\` VARCHAR(50) NOT NULL,
          quantity INT NOT NULL DEFAULT 0,
          buy_price DECIMAL(10, 2) NOT NULL,
          lead_time INT DEFAULT 7,
          userId VARCHAR(100) NOT NULL,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pending_sales (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATE NOT NULL,
          model VARCHAR(100) NOT NULL,
          \`condition\` VARCHAR(50) NOT NULL,
          platform VARCHAR(50) NOT NULL,
          quantity INT NOT NULL DEFAULT 1,
          buy_price DECIMAL(10, 2) NOT NULL,
          sell_price DECIMAL(10, 2) NOT NULL,
          fees DECIMAL(10, 2) DEFAULT 0,
          profit DECIMAL(10, 2) NOT NULL,
          buyer VARCHAR(255),
          city VARCHAR(100),
          tracking_number VARCHAR(255),
          notes TEXT,
          userId VARCHAR(100) NOT NULL,
          status ENUM('pending', 'confirmed', 'cancelled') DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // Migration: Ensure userId column exists in pending_sales table
      try {
        const [columns]: any = await pool.query('SHOW COLUMNS FROM pending_sales LIKE "userId"');
        if (columns.length === 0) {
          console.log('Adding userId column to pending_sales table...');
          await pool.query('ALTER TABLE pending_sales ADD COLUMN userId VARCHAR(100) NOT NULL DEFAULT "legacy"');
          console.log('userId column added to pending_sales successfully.');
        }
      } catch (err) {
        console.error('Migration error (pending_sales userId):', err);
      }

      // Migration: Ensure userId column exists in stock table
      try {
        const [columns]: any = await pool.query('SHOW COLUMNS FROM stock LIKE "userId"');
        if (columns.length === 0) {
          console.log('Adding userId column to stock table...');
          // For existing records, we might want to assign them to the first admin or leave it empty
          // but since it's NOT NULL, we'll set a default or allow NULL temporarily
          await pool.query('ALTER TABLE stock ADD COLUMN userId VARCHAR(100) NOT NULL DEFAULT "legacy"');
          console.log('userId column added successfully.');
        }
      } catch (err) {
        console.error('Migration error (stock userId):', err);
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS market_prices (
          id INT AUTO_INCREMENT PRIMARY KEY,
          model VARCHAR(100) NOT NULL,
          \`condition\` VARCHAR(50) NOT NULL,
          platform VARCHAR(50) NOT NULL,
          price DECIMAL(10, 2) NOT NULL,
          date DATE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          uid VARCHAR(100) PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          role ENUM('admin', 'client') DEFAULT 'client',
          displayName VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          userId VARCHAR(100) NOT NULL,
          action VARCHAR(100) NOT NULL,
          details TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Database tables initialized');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
    }
  };

  await initDb();

  // Helper to log activity
  const logActivity = async (userId: string, action: string, details: string) => {
    try {
      await pool.query('INSERT INTO audit_logs (userId, action, details) VALUES (?, ?, ?)', [userId, action, details]);
    } catch (error) {
      console.error('Failed to log activity:', error);
    }
  };

  // Middleware to get user role
  const getUserContext = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      (req as any).user = { role: 'guest' };
      return next();
    }

    try {
      const [rows]: any = await pool.query('SELECT role FROM users WHERE uid = ?', [userId]);
      if (rows.length > 0) {
        (req as any).user = { uid: userId, role: rows[0].role };
      } else {
        (req as any).user = { uid: userId, role: 'client' }; // Default for new users
      }
      next();
    } catch (error) {
      next();
    }
  };

  // API Router
  const apiRouter = express.Router();
  apiRouter.use(getUserContext);

  // Ping test
  apiRouter.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'pong', timestamp: new Date().toISOString() });
  });

  // System Backup (POST to avoid interception)
  apiRouter.post('/system/backup', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    console.log('📥 BACKUP API ROUTE HIT');
    try {
      const [sales] = await pool.query('SELECT * FROM sales');
      const [stock] = await pool.query('SELECT * FROM stock');
      const [pending] = await pool.query('SELECT * FROM pending_sales');
      const [market] = await pool.query('SELECT * FROM market_prices');
      const [users] = await pool.query('SELECT * FROM users');

      const backup = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        data: {
          sales,
          stock,
          pending_sales: pending,
          market_prices: market,
          users
        }
      };

      console.log('📤 Sending backup JSON');
      res.json(backup);
    } catch (error) {
      console.error('❌ Backup error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // User Sync
  apiRouter.post('/users/sync', async (req, res) => {
    console.log('📥 USER SYNC REQUEST:', req.body.email);
    try {
      const { uid, email, displayName } = req.body;
      if (!uid || !email) {
        console.warn('⚠️ Missing uid or email in sync request');
        return res.status(400).json({ error: 'Missing uid or email' });
      }

      const [existing]: any = await pool.query('SELECT * FROM users WHERE uid = ?', [uid]);
      
      if (existing.length === 0) {
        console.log('🆕 Creating new user:', email);
        // Check if this is the first user or specific admin email
        const [userCount]: any = await pool.query('SELECT COUNT(*) as count FROM users');
        const role = (userCount[0].count === 0 || email === 'csmucza@gmail.com') ? 'admin' : 'client';
        
        await pool.query(
          'INSERT INTO users (uid, email, displayName, role) VALUES (?, ?, ?, ?)',
          [uid, email, displayName, role]
        );
        console.log('✅ New user created with role:', role);

        if (role === 'admin') {
          console.log('📦 Assigning legacy records to first admin...');
          await pool.query('UPDATE sales SET userId = ? WHERE userId = "legacy"', [uid]);
          await pool.query('UPDATE stock SET userId = ? WHERE userId = "legacy"', [uid]);
          await pool.query('UPDATE pending_sales SET userId = ? WHERE userId = "legacy"', [uid]);
          await pool.query('UPDATE audit_logs SET userId = ? WHERE userId = "legacy"', [uid]);
        }

        res.json({ uid, email, displayName, role });
      } else {
        console.log('🔄 Updating existing user:', email);
        const role = (email === 'csmucza@gmail.com') ? 'admin' : existing[0].role;
        await pool.query(
          'UPDATE users SET email = ?, displayName = ?, role = ? WHERE uid = ?',
          [email, displayName, role, uid]
        );

        // Robust migration: if this user is an admin, they should take over legacy records
        if (role === 'admin') {
          const [legacyCheck]: any = await pool.query('SELECT COUNT(*) as count FROM sales WHERE userId = "legacy"');
          if (legacyCheck[0].count > 0) {
            console.log('📦 Found legacy records, assigning to admin:', email);
            await pool.query('UPDATE sales SET userId = ? WHERE userId = "legacy"', [uid]);
            await pool.query('UPDATE stock SET userId = ? WHERE userId = "legacy"', [uid]);
            await pool.query('UPDATE pending_sales SET userId = ? WHERE userId = "legacy"', [uid]);
            await pool.query('UPDATE audit_logs SET userId = ? WHERE userId = "legacy"', [uid]);
          }
        }

        console.log('✅ User updated successfully');
        res.json({ ...existing[0], email, displayName, role });
      }
    } catch (error) {
      console.error('❌ User sync error:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Debug routes
  apiRouter.get('/debug/users', async (req, res) => {
    try {
      const [users] = await pool.query('SELECT * FROM users');
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.get('/debug/routes', (req, res) => {
    const routes: string[] = [];
    function split(thing: any) {
      if (typeof thing === 'string') {
        return thing;
      } else if (thing.fast_slash) {
        return '';
      } else {
        const match = thing.toString()
          .replace('\\/?', '')
          .replace('(?=\\/|$)', '')
          .match(/^\/\^\\(\/.*?)\\?\//);
        return match ? match[1].replace(/\\(.)/g, '$1') : '<complex>';
      }
    }

    app._router.stack.forEach((middleware: any) => {
      if (middleware.route) {
        routes.push(`${Object.keys(middleware.route.methods).join(',').toUpperCase()} ${middleware.route.path}`);
      } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler: any) => {
          if (handler.route) {
            const path = split(middleware.regexp) + split(handler.route.path);
            routes.push(`${Object.keys(handler.route.methods).join(',').toUpperCase()} ${path}`);
          }
        });
      }
    });
    res.json(routes);
  });

  // Audit Logs
  apiRouter.get('/audit_logs', async (req, res) => {
    const user = (req as any).user;
    try {
      let query = 'SELECT a.*, u.email as userEmail FROM audit_logs a LEFT JOIN users u ON a.userId = u.uid';
      let params: any[] = [];

      if (user.role !== 'admin') {
        query += ' WHERE a.userId = ?';
        params.push(user.uid);
      }

      query += ' ORDER BY timestamp DESC LIMIT 100';
      const [rows] = await pool.query(query, params);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/audit_logs', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    try {
      await pool.query('DELETE FROM audit_logs');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/system/all', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM sales');
      await connection.query('DELETE FROM stock');
      await connection.query('DELETE FROM pending_sales');
      await connection.query('DELETE FROM market_prices');
      await connection.query('DELETE FROM audit_logs');
      await connection.commit();
      res.json({ success: true });
    } catch (error) {
      await connection.rollback();
      res.status(500).json({ error: (error as Error).message });
    } finally {
      connection.release();
    }
  });

  // Sales
  apiRouter.get('/sales', async (req, res) => {
    const user = (req as any).user;
    try {
      let query = 'SELECT * FROM sales';
      let params: any[] = [];

      if (user.role !== 'admin') {
        if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });
        query += ' WHERE userId = ?';
        params.push(user.uid);
      }

      query += ' ORDER BY date DESC';
      const [rows] = await pool.query(query, params);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/sales', async (req, res) => {
    const user = (req as any).user;
    try {
      const sale = req.body;
      
      // Basic Validation
      if (!sale.model || !sale.platform || sale.quantity <= 0) {
        return res.status(400).json({ error: 'Hiányzó vagy érvénytelen adatok' });
      }

      const userId = sale.userId || user.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const [result] = await pool.query(
        'INSERT INTO sales (date, model, `condition`, platform, quantity, buy_price, sell_price, fees, profit, buyer, city, tracking_number, notes, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sale.date, sale.model, sale.condition, sale.platform, sale.quantity, sale.buy_price, sale.sell_price, sale.fees, sale.profit, sale.buyer, sale.city, sale.tracking_number, sale.notes, userId]
      );
      await logActivity(userId, 'CREATE_SALE', `${sale.model} (${sale.quantity} db) - ${sale.platform}`);
      res.json({ id: (result as any).insertId, ...sale, userId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/sales/:id', async (req, res) => {
    const user = (req as any).user;
    try {
      const [rows]: any = await pool.query('SELECT * FROM sales WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Sale not found' });
      
      const sale = rows[0];
      if (user.role !== 'admin' && sale.userId !== user.uid) {
        console.warn(`🚫 Forbidden sales delete: User ${user.uid} (role: ${user.role}) attempted to delete sale ${req.params.id} owned by ${sale.userId}`);
        return res.status(403).json({ error: 'Forbidden' });
      }

      await logActivity(sale.userId, 'DELETE_SALE', `${sale.model} - ${sale.platform}`);
      await pool.query('DELETE FROM sales WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/sales/:id', async (req, res) => {
    const user = (req as any).user;
    try {
      const [rows]: any = await pool.query('SELECT * FROM sales WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Sale not found' });
      
      const existingSale = rows[0];
      if (user.role !== 'admin' && existingSale.userId !== user.uid) {
        console.warn(`🚫 Forbidden sales update: User ${user.uid} (role: ${user.role}) attempted to update sale ${req.params.id} owned by ${existingSale.userId}`);
        return res.status(403).json({ error: 'Forbidden' });
      }

      const sale = req.body;
      await pool.query(
        'UPDATE sales SET date = ?, model = ?, `condition` = ?, platform = ?, quantity = ?, buy_price = ?, sell_price = ?, fees = ?, profit = ?, buyer = ?, city = ?, tracking_number = ?, notes = ? WHERE id = ?',
        [sale.date, sale.model, sale.condition, sale.platform, sale.quantity, sale.buy_price, sale.sell_price, sale.fees, sale.profit, sale.buyer, sale.city, sale.tracking_number, sale.notes, req.params.id]
      );
      await logActivity(user.uid, 'UPDATE_SALE', `${sale.model} - ${sale.platform}`);
      res.json({ id: req.params.id, ...sale });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/sales', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    try {
      await pool.query('DELETE FROM sales');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Stock
  apiRouter.get('/stock', async (req, res) => {
    const user = (req as any).user;
    try {
      let query = 'SELECT * FROM stock';
      let params: any[] = [];

      if (user.role !== 'admin') {
        if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });
        query += ' WHERE userId = ?';
        params.push(user.uid);
      }

      const [rows] = await pool.query(query, params);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/stock/:id', async (req, res) => {
    const user = (req as any).user;
    try {
      const [rows]: any = await pool.query('SELECT * FROM stock WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Stock item not found' });
      
      const item = rows[0];
      if (user.role !== 'admin' && item.userId !== user.uid) {
        console.warn(`🚫 Forbidden stock update: User ${user.uid} (role: ${user.role}) attempted to update stock ${req.params.id} owned by ${item.userId}`);
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { quantity, lead_time } = req.body;
      if (lead_time !== undefined) {
        await pool.query('UPDATE stock SET quantity = ?, lead_time = ? WHERE id = ?', [quantity, lead_time, req.params.id]);
      } else {
        await pool.query('UPDATE stock SET quantity = ? WHERE id = ?', [quantity, req.params.id]);
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

      // Basic Validation
      if (!item.model || item.quantity < 0) {
        return res.status(400).json({ error: 'Hiányzó vagy érvénytelen adatok' });
      }

      const userId = item.userId || user.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const [result] = await pool.query(
        'INSERT INTO stock (model, `condition`, quantity, buy_price, lead_time, userId) VALUES (?, ?, ?, ?, ?, ?)',
        [item.model, item.condition, item.quantity, item.buy_price, item.lead_time || 7, userId]
      );
      res.json({ id: (result as any).insertId, ...item, userId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/stock/:id', async (req, res) => {
    const user = (req as any).user;
    try {
      const [rows]: any = await pool.query('SELECT * FROM stock WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Stock item not found' });
      
      const item = rows[0];
      if (user.role !== 'admin' && item.userId !== user.uid) {
        console.warn(`🚫 Forbidden stock delete: User ${user.uid} (role: ${user.role}) attempted to delete stock ${req.params.id} owned by ${item.userId}`);
        return res.status(403).json({ error: 'Forbidden' });
      }

      await pool.query('DELETE FROM stock WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Pending Sales
  apiRouter.get('/pending_sales', async (req, res) => {
    const user = (req as any).user;
    try {
      let query = 'SELECT * FROM pending_sales WHERE status = "pending"';
      let params: any[] = [];

      if (user.role !== 'admin') {
        if (!user.uid) return res.status(401).json({ error: 'Unauthorized' });
        query += ' AND userId = ?';
        params.push(user.uid);
      }

      const [rows] = await pool.query(query, params);
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

      const [result] = await pool.query(
        'INSERT INTO pending_sales (date, model, `condition`, platform, quantity, buy_price, sell_price, fees, profit, buyer, city, tracking_number, notes, userId, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sale.date, sale.model, sale.condition, sale.platform, sale.quantity, sale.buy_price, sale.sell_price, sale.fees, sale.profit, sale.buyer, sale.city, sale.tracking_number, sale.notes, userId, sale.status]
      );
      res.json({ id: (result as any).insertId, ...sale, userId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/pending_sales/:id', async (req, res) => {
    const user = (req as any).user;
    try {
      const [rows]: any = await pool.query('SELECT * FROM pending_sales WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Pending sale not found' });
      
      const sale = rows[0];
      if (user.role !== 'admin' && sale.userId !== user.uid) {
        console.warn(`🚫 Forbidden pending_sales update: User ${user.uid} (role: ${user.role}) attempted to update sale ${req.params.id} owned by ${sale.userId}`);
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { status } = req.body;
      await pool.query('UPDATE pending_sales SET status = ? WHERE id = ?', [status, req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Market Prices
  apiRouter.get('/market_prices', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM market_prices');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/system/restore', async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const connection = await pool.getConnection();
    try {
      const { data } = req.body;
      if (!data) throw new Error('Invalid backup data');

      await connection.beginTransaction();

      // Clear existing data
      await connection.query('DELETE FROM sales');
      await connection.query('DELETE FROM stock');
      await connection.query('DELETE FROM pending_sales');
      await connection.query('DELETE FROM market_prices');

      // Restore Sales
      if (data.sales?.length > 0) {
        const salesFields = ['date', 'model', 'condition', 'platform', 'quantity', 'buy_price', 'sell_price', 'fees', 'profit', 'buyer', 'city', 'tracking_number', 'notes', 'userId'];
        const salesValues = data.sales.map((s: any) => [s.date, s.model, s.condition, s.platform, s.quantity, s.buy_price, s.sell_price, s.fees, s.profit, s.buyer, s.city, s.tracking_number, s.notes, s.userId]);
        await connection.query(`INSERT INTO sales (${salesFields.map(f => `\`${f}\``).join(', ')}) VALUES ?`, [salesValues]);
      }

      // Restore Stock
      if (data.stock?.length > 0) {
        const stockFields = ['model', 'condition', 'quantity', 'buy_price', 'lead_time', 'userId'];
        const stockValues = data.stock.map((s: any) => [s.model, s.condition, s.quantity, s.buy_price, s.lead_time, s.userId || 'legacy']);
        await connection.query(`INSERT INTO stock (${stockFields.map(f => `\`${f}\``).join(', ')}) VALUES ?`, [stockValues]);
      }

      // Restore Pending Sales
      if (data.pending_sales?.length > 0) {
        const pendingFields = ['date', 'model', 'condition', 'platform', 'quantity', 'buy_price', 'sell_price', 'fees', 'profit', 'buyer', 'city', 'tracking_number', 'notes', 'userId', 'status'];
        const pendingValues = data.pending_sales.map((s: any) => [s.date, s.model, s.condition, s.platform, s.quantity, s.buy_price, s.sell_price, s.fees, s.profit, s.buyer, s.city, s.tracking_number, s.notes, s.userId, s.status]);
        await connection.query(`INSERT INTO pending_sales (${pendingFields.map(f => `\`${f}\``).join(', ')}) VALUES ?`, [pendingValues]);
      }

      // Restore Market Prices
      if (data.market_prices?.length > 0) {
        const marketFields = ['model', 'condition', 'platform', 'price', 'date'];
        const marketValues = data.market_prices.map((p: any) => [p.model, p.condition, p.platform, p.price, p.date]);
        await connection.query(`INSERT INTO market_prices (${marketFields.map(f => `\`${f}\``).join(', ')}) VALUES ?`, [marketValues]);
      }

      await connection.commit();
      res.json({ success: true });
    } catch (error) {
      await connection.rollback();
      res.status(500).json({ error: (error as Error).message });
    } finally {
      connection.release();
    }
  });

  // Catch-all for unmatched API routes
  apiRouter.all('*', (req, res) => {
    console.warn(`⚠️ Unmatched API route: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
      error: 'API route not found', 
      method: req.method, 
      url: req.originalUrl 
    });
  });

  // Mount API router
  app.use('/api', apiRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server is running!`);
    console.log(`🏠 Local:            http://localhost:${PORT}`);
    console.log(`🌐 Network (Phone):  http://${localIp}:${PORT}\n`);
  });
}

startServer();
