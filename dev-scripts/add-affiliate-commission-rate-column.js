import mysql from 'mysql2/promise';

async function addAffiliateCommissionRateColumn() {
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

    // Check if affiliate_commission_rate column exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'gilliard_salao' 
      AND TABLE_NAME = 'global_settings' 
      AND COLUMN_NAME = 'affiliate_commission_rate'
    `);

    if (columns.length === 0) {
      console.log('Adding affiliate_commission_rate column to global_settings table...');
      
      await connection.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN affiliate_commission_rate DECIMAL(5,2) DEFAULT 10.00 AFTER system_url
      `);
      
      console.log('✅ affiliate_commission_rate column added successfully');
      
      // Set default value for affiliate_commission_rate
      await connection.execute(`
        UPDATE global_settings 
        SET affiliate_commission_rate = 10.00 
        WHERE id = 1 AND affiliate_commission_rate IS NULL
      `);
      
      console.log('✅ Default affiliate_commission_rate set successfully');
    } else {
      console.log('✅ affiliate_commission_rate column already exists');
    }

  } catch (error) {
    console.error('❌ Error adding affiliate_commission_rate column:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run the migration
addAffiliateCommissionRateColumn();