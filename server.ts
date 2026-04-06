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

  // API Routes
  
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
      console.log('✅ Database tables initialized');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
    }
  };

  await initDb();

  // Sales

  app.get('/api/sales', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM sales ORDER BY date DESC');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/sales', async (req, res) => {
    try {
      const sale = req.body;
      const [result] = await pool.query(
        'INSERT INTO sales (date, model, `condition`, platform, quantity, buy_price, sell_price, fees, profit, buyer, city, tracking_number, notes, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sale.date, sale.model, sale.condition, sale.platform, sale.quantity, sale.buy_price, sale.sell_price, sale.fees, sale.profit, sale.buyer, sale.city, sale.tracking_number, sale.notes, sale.userId]
      );
      res.json({ id: (result as any).insertId, ...sale });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/sales/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM sales WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/sales/:id', async (req, res) => {
    try {
      const sale = req.body;
      console.log('PUT /api/sales/' + req.params.id, sale);
      await pool.query(
        'UPDATE sales SET date = ?, model = ?, `condition` = ?, platform = ?, quantity = ?, buy_price = ?, sell_price = ?, fees = ?, profit = ?, buyer = ?, city = ?, tracking_number = ?, notes = ? WHERE id = ?',
        [sale.date, sale.model, sale.condition, sale.platform, sale.quantity, sale.buy_price, sale.sell_price, sale.fees, sale.profit, sale.buyer, sale.city, sale.tracking_number, sale.notes, req.params.id]
      );
      res.json({ id: req.params.id, ...sale });
    } catch (error) {
      console.error('Error updating sale:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.delete('/api/sales', async (req, res) => {
    try {
      await pool.query('DELETE FROM sales');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Stock
  app.get('/api/stock', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM stock');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put('/api/stock/:id', async (req, res) => {
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

  app.post('/api/stock', async (req, res) => {
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

  app.delete('/api/stock/:id', async (req, res) => {
    try {
      await pool.query('DELETE FROM stock WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Pending Sales
  app.get('/api/pending_sales', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM pending_sales WHERE status = "pending"');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/pending_sales', async (req, res) => {
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

  app.put('/api/pending_sales/:id', async (req, res) => {
    try {
      const { status } = req.body;
      await pool.query('UPDATE pending_sales SET status = ? WHERE id = ?', [status, req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Market Prices
  app.get('/api/market_prices', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM market_prices');
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

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
