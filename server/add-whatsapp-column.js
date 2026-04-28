import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function addWhatsappColumn() {
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

    // Add whatsapp_number column to tasks table
    await connection.execute(`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20)
    `);

    console.log('✅ WhatsApp number column added to tasks table');

  } catch (error) {
    console.error('❌ Error adding WhatsApp column:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

addWhatsappColumn().catch(console.error);