import mysql from 'mysql2/promise';

async function addSmtpColumns() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: process.env.MYSQL_ROOT_PASSWORD || '',
    database: 'business_management'
  });

  try {
    // Check if columns already exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'business_management' 
      AND TABLE_NAME = 'global_settings' 
      AND COLUMN_NAME IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email', 'smtp_from_name', 'smtp_secure')
    `);

    if (columns.length === 0) {
      console.log('Adding SMTP columns to global_settings table...');
      
      await connection.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN smtp_host VARCHAR(255),
        ADD COLUMN smtp_port VARCHAR(10),
        ADD COLUMN smtp_user VARCHAR(255),
        ADD COLUMN smtp_password VARCHAR(255),
        ADD COLUMN smtp_from_email VARCHAR(255),
        ADD COLUMN smtp_from_name VARCHAR(255),
        ADD COLUMN smtp_secure BOOLEAN DEFAULT TRUE
      `);
      
      console.log('✅ SMTP columns added successfully');
    } else {
      console.log('✅ SMTP columns already exist');
    }
  } catch (error) {
    console.error('❌ Error adding SMTP columns:', error.message);
  } finally {
    await connection.end();
  }
}

addSmtpColumns();