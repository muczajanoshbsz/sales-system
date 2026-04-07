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
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stock (
          id INT AUTO_INCREMENT PRIMARY KEY,
          model VARCHAR(100) NOT NULL,
          \`condition\` VARCHAR(50) NOT NULL,
          quantity INT NOT NULL DEFAULT 0,
          buy_price DECIMAL(10, 2) NOT NULL,
          lead_time INT DEFAULT 7,
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

  // API Router
  const apiRouter = express.Router();

  // Ping test
  apiRouter.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'pong', timestamp: new Date().toISOString() });
  });

  // System Backup (POST to avoid interception)
  apiRouter.post('/system/backup', async (req, res) => {
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

  // Debug routes
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
    try {
      const [rows] = await pool.query('SELECT a.*, u.email as userEmail FROM audit_logs a LEFT JOIN users u ON a.userId = u.uid ORDER BY timestamp DESC LIMIT 100');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/audit_logs', async (req, res) => {
    try {
      await pool.query('DELETE FROM audit_logs');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/system/all', async (req, res) => {
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
    try {
      const [rows] = await pool.query('SELECT * FROM sales ORDER BY date DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/sales', async (req, res) => {
    try {
      const sale = req.body;
      const [result] = await pool.query(
        'INSERT INTO sales (date, model, `condition`, platform, quantity, buy_price, sell_price, fees, profit, buyer, city, tracking_number, notes, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sale.date, sale.model, sale.condition, sale.platform, sale.quantity, sale.buy_price, sale.sell_price, sale.fees, sale.profit, sale.buyer, sale.city, sale.tracking_number, sale.notes, sale.userId]
      );
      await logActivity(sale.userId, 'CREATE_SALE', `${sale.model} (${sale.quantity} db) - ${sale.platform}`);
      res.json({ id: (result as any).insertId, ...sale });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/sales/:id', async (req, res) => {
    try {
      const [sale]: any = await pool.query('SELECT * FROM sales WHERE id = ?', [req.params.id]);
      if (sale.length > 0) {
        await logActivity(sale[0].userId, 'DELETE_SALE', `${sale[0].model} - ${sale[0].platform}`);
      }
      await pool.query('DELETE FROM sales WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/sales/:id', async (req, res) => {
    try {
      const sale = req.body;
      await pool.query(
        'UPDATE sales SET date = ?, model = ?, `condition` = ?, platform = ?, quantity = ?, buy_price = ?, sell_price = ?, fees = ?, profit = ?, buyer = ?, city = ?, tracking_number = ?, notes = ? WHERE id = ?',
        [sale.date, sale.model, sale.condition, sale.platform, sale.quantity, sale.buy_price, sale.sell_price, sale.fees, sale.profit, sale.buyer, sale.city, sale.tracking_number, sale.notes, req.params.id]
      );
      await logActivity(sale.userId, 'UPDATE_SALE', `${sale.model} - ${sale.platform}`);
      res.json({ id: req.params.id, ...sale });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/sales', async (req, res) => {
    try {
      await pool.query('DELETE FROM sales');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Stock
  apiRouter.get('/stock', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM stock');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/stock/:id', async (req, res) => {
    try {
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
    try {
      const item = req.body;
      const [result] = await pool.query(
        'INSERT INTO stock (model, `condition`, quantity, buy_price, lead_time) VALUES (?, ?, ?, ?, ?)',
        [item.model, item.condition, item.quantity, item.buy_price, item.lead_time || 7]
      );
      res.json({ id: (result as any).insertId, ...item });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.delete('/stock/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM stock WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Pending Sales
  apiRouter.get('/pending_sales', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM pending_sales WHERE status = "pending"');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.post('/pending_sales', async (req, res) => {
    try {
      const sale = req.body;
      const [result] = await pool.query(
        'INSERT INTO pending_sales (date, model, `condition`, platform, quantity, buy_price, sell_price, fees, profit, buyer, city, tracking_number, notes, userId, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sale.date, sale.model, sale.condition, sale.platform, sale.quantity, sale.buy_price, sale.sell_price, sale.fees, sale.profit, sale.buyer, sale.city, sale.tracking_number, sale.notes, sale.userId, sale.status]
      );
      res.json({ id: (result as any).insertId, ...sale });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  apiRouter.put('/pending_sales/:id', async (req, res) => {
    try {
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
        const stockFields = ['model', 'condition', 'quantity', 'buy_price', 'lead_time'];
        const stockValues = data.stock.map((s: any) => [s.model, s.condition, s.quantity, s.buy_price, s.lead_time]);
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
