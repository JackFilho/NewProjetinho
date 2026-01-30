import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function createTasksTable() {
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

    // Create tasks table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company_id INT NOT NULL,
        due_date DATE NOT NULL,
        recurrence VARCHAR(20) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        color VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ Tasks table created/verified');

  } catch (error) {
    console.error('❌ Error creating tasks table:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createTasksTable().catch(console.error);