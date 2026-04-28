const mysql = require('mysql2/promise');

async function addCustomDomainColumn() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_agendamento'
  });

  try {
    // Check if column exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'global_settings' 
      AND COLUMN_NAME = 'custom_domain_url'
    `);

    if (columns.length === 0) {
      console.log('Adding custom_domain_url column to global_settings table...');
      
      await connection.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN custom_domain_url VARCHAR(500) AFTER custom_html
      `);
      
      console.log('✅ Custom domain URL column added successfully');
    } else {
      console.log('✅ Custom domain URL column already exists');
    }
  } catch (error) {
    console.error('❌ Error adding custom domain URL column:', error.message);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  addCustomDomainColumn();
}

module.exports = { addCustomDomainColumn };