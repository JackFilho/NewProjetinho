import mysql from 'mysql2/promise';

async function addCreatedAtColumn() {
  let connection;
  
  try {
    // Connect to MySQL database
    connection = await mysql.createConnection({
      host: '69.62.101.23',
      port: 3306,
      user: 'root',
      password: 'Gilliard1900',
      database: 'gilliard_salao'
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