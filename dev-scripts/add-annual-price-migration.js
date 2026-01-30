const mysql = require('mysql2/promise');

async function addAnnualPriceColumn() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '69.62.101.23',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'gilliard_salao',
    password: process.env.MYSQL_PASSWORD || 'Gilliard@2024',
    database: process.env.MYSQL_DATABASE || 'gilliard_salao'
  });

  try {
    // Check if column exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'plans' AND COLUMN_NAME = 'annual_price'
    `, [process.env.MYSQL_DATABASE || 'gilliard_salao']);

    if (columns.length === 0) {
      // Add annual_price column
      await connection.execute(`
        ALTER TABLE plans 
        ADD COLUMN annual_price DECIMAL(10,2) NULL AFTER price
      `);
      console.log('✅ annual_price column added to plans table');
    } else {
      console.log('✅ annual_price column already exists in plans table');
    }
  } catch (error) {
    console.error('Error adding annual_price column:', error);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  addAnnualPriceColumn();
}

module.exports = addAnnualPriceColumn;