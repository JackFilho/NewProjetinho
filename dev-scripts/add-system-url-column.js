import mysql from 'mysql2/promise';

async function addSystemUrlColumn() {
  let connection;
  
  try {
    // Create connection to MySQL database
    connection = await mysql.createConnection({
      host: '69.62.101.23',
      port: 3306,
      user: 'gilliard_salao',
      password: 'g200689G@',
      database: 'gilliard_salao'
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