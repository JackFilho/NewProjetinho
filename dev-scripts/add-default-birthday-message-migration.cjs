const mysql = require('mysql2/promise');
require('dotenv').config();

async function addDefaultBirthdayMessageColumn() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '31.97.166.39',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'agenday_dev',
    password: process.env.MYSQL_PASSWORD || 'AgenDay@2024',
    database: process.env.MYSQL_DATABASE || 'agenday_dev'
  });

  try {
    // Check if column exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'global_settings' AND COLUMN_NAME = 'default_birthday_message'
    `, [process.env.MYSQL_DATABASE || 'agenday_dev']);

    if (columns.length === 0) {
      // Add the column
      await connection.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN default_birthday_message TEXT DEFAULT NULL
      `);
      console.log('✅ Default birthday message column added successfully');
    } else {
      console.log('✅ Default birthday message column already exists');
    }
  } catch (error) {
    console.error('❌ Error adding default birthday message column:', error);
  } finally {
    await connection.end();
  }
}

addDefaultBirthdayMessageColumn();