import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function addMaxProfessionalsColumn() {
  let connection;
  
  try {
    // Create connection using environment variables
    connection = await mysql.createConnection({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE
    });

    console.log('Connected to MySQL database');

    // Check if max_professionals column already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'plans' AND COLUMN_NAME = 'max_professionals'
    `, [process.env.PGDATABASE]);

    if (columns.length > 0) {
      console.log('max_professionals column already exists');
      return;
    }

    // Add max_professionals column
    await connection.execute(`
      ALTER TABLE plans ADD COLUMN max_professionals INT NOT NULL DEFAULT 1
    `);

    console.log('max_professionals column added successfully');

    // Update existing plans with appropriate values
    await connection.execute(`
      UPDATE plans SET max_professionals = 
      CASE 
        WHEN LOWER(name) LIKE '%básico%' OR LOWER(name) LIKE '%basic%' THEN 1
        WHEN LOWER(name) LIKE '%premium%' OR LOWER(name) LIKE '%profissional%' THEN 5
        WHEN LOWER(name) LIKE '%enterprise%' OR LOWER(name) LIKE '%empresarial%' THEN 10
        ELSE 3
      END
    `);

    console.log('Existing plans updated with max_professionals values');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

addMaxProfessionalsColumn();