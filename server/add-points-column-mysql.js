import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function addPointsColumn() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: process.env.PGPORT
    });

    console.log('✅ Connected to MySQL database');

    // Check if points column already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'services' AND COLUMN_NAME = 'points'
    `, [process.env.PGDATABASE]);

    if (columns.length > 0) {
      console.log('⚠️ Points column already exists');
      return;
    }

    // Add points column to services table
    await connection.execute(`
      ALTER TABLE services ADD COLUMN points INT DEFAULT 0 AFTER color
    `);

    console.log('✅ Points column added to services table');

  } catch (error) {
    console.error('❌ Error adding points column:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('✅ Database connection closed');
    }
  }
}

// Execute immediately
addPointsColumn().catch(console.error);