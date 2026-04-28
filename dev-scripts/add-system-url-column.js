import mysql from 'mysql2/promise';

async function addSystemUrlColumn() {
  let connection;
  
  try {
    // Create connection to MySQL database
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

    console.log('Connected to MySQL database');

    // Check if system_url column exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'gilliard_salao' 
      AND TABLE_NAME = 'global_settings' 
      AND COLUMN_NAME = 'system_url'
    `);

    if (columns.length === 0) {
      console.log('Adding system_url column to global_settings table...');
      
      await connection.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN system_url VARCHAR(500) AFTER custom_domain_url
      `);
      
      console.log('✅ system_url column added successfully');
      
      // Set default value for system_url
      await connection.execute(`
        UPDATE global_settings 
        SET system_url = 'http://agenday.gilliard.dev' 
        WHERE id = 1 AND system_url IS NULL
      `);
      
      console.log('✅ Default system_url set successfully');
    } else {
      console.log('✅ system_url column already exists');
    }

  } catch (error) {
    console.error('❌ Error adding system_url column:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the migration
addSystemUrlColumn().catch(console.error);