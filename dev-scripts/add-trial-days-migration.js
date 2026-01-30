import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

const alterTable = async () => {
  try {
    await pool.query('ALTER TABLE companies ADD COLUMN trial_days INTEGER;');
    console.log('Table altered successfully');
  } catch (err) {
    console.error('Error altering table', err);
  } finally {
    await pool.end();
  }
};

alterTable(); 