import { pool } from "./db";

export async function ensureSmtpColumns() {
  try {
    // Check if SMTP columns exist
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'global_settings' 
      AND COLUMN_NAME IN ('smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_email', 'smtp_from_name', 'smtp_secure')
    `);

    if (Array.isArray(columns) && columns.length === 0) {
      console.log('Adding SMTP columns to global_settings table...');
      
      await pool.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN smtp_host VARCHAR(255),
        ADD COLUMN smtp_port VARCHAR(10),
        ADD COLUMN smtp_user VARCHAR(255),
        ADD COLUMN smtp_password VARCHAR(255),
        ADD COLUMN smtp_from_email VARCHAR(255),
        ADD COLUMN smtp_from_name VARCHAR(255),
        ADD COLUMN smtp_secure VARCHAR(10) DEFAULT 'tls'
      `);
      
      console.log('✅ SMTP columns added successfully');
    } else {
      console.log('✅ SMTP columns already exist');
      
      // Check if smtp_secure is boolean and convert to varchar
      try {
        await pool.execute(`
          ALTER TABLE global_settings 
          MODIFY COLUMN smtp_secure VARCHAR(10) DEFAULT 'tls'
        `);
        console.log('✅ smtp_secure column updated to VARCHAR');
      } catch (error: any) {
        console.log('smtp_secure column type already correct or error:', error.message);
      }
    }
  } catch (error: any) {
    console.error('❌ Error ensuring SMTP columns:', error.message);
  }
}