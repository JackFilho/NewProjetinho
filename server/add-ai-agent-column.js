import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function addAiAgentColumn() {
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: process.env.MYSQL_PORT,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });

    console.log('Connected to MySQL database');

    // Check if column exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'companies' 
      AND COLUMN_NAME = 'ai_agent_prompt'
      AND TABLE_SCHEMA = DATABASE()
    `);

    if (columns.length === 0) {
      // Add the column
      await connection.execute(`
        ALTER TABLE companies 
        ADD COLUMN ai_agent_prompt TEXT NULL
      `);
      console.log('✅ AI agent prompt column added successfully');
    } else {
      console.log('✅ AI agent prompt column already exists');
    }

  } catch (error) {
    console.error('❌ Error adding AI agent column:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

addAiAgentColumn();