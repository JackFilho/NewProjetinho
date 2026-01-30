import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function addPointsColumn() {
  const connection = await mysql.createConnection({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: Number(process.env.PGPORT)
  });

  try {
    console.log('Checking if points column exists...');
    
    // Check if column exists
    const [rows] = await connection.execute(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'services' 
      AND COLUMN_NAME = 'points'
    `, [process.env.PGDATABASE]);
    
    const columnExists = (rows as any)[0].count > 0;
    
    if (!columnExists) {
      console.log('Adding points column to services table...');
      await connection.execute('ALTER TABLE services ADD COLUMN points INT DEFAULT 0 AFTER color');
      console.log('✅ Points column added successfully');
    } else {
      console.log('⚠️ Points column already exists');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.end();
  }
}

addPointsColumn();