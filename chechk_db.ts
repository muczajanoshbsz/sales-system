
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT),
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function check() {
  try {
    const sales = await pool.query('SELECT "userId", COUNT(*) FROM sales GROUP BY "userId"');
    const stock = await pool.query('SELECT "userId", COUNT(*) FROM stock GROUP BY "userId"');
    const users = await pool.query('SELECT uid, email, role FROM users');
    
    console.log('SALES COUNTS:');
    console.table(sales.rows);
    console.log('STOCK COUNTS:');
    console.table(stock.rows);
    console.log('USERS:');
    console.table(users.rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

check();
