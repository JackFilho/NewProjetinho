import mysql from 'mysql2/promise';

async function addCreatedAtColumn() {
  let connection;
  
  try {
    // Connect to MySQL database
    if (!process.env.MYSQL_HOST || !process.env.MYSQL_PASSWORD) {
      throw new Error('Variáveis MYSQL_HOST e MYSQL_PASSWORD são obrigatórias');
    }
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });

    console.log('🔌 Connected to MySQL database');

    // Add created_at column to review_invitations table
    await connection.execute(`
      ALTER TABLE review_invitations 
      ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);

    console.log('✅ created_at column added to review_invitations table');

  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('✅ created_at column already exists in review_invitations table');
    } else {
      console.error('❌ Error adding created_at column:', error);
      throw error;
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run if called directly
addCreatedAtColumn().catch(console.error);