import { pool } from "./db";

export async function ensureResetColumns() {
  try {
    // Check if reset token columns exist
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'companies' 
      AND COLUMN_NAME IN ('reset_token', 'reset_token_expires')
    `);

    if (Array.isArray(columns) && columns.length === 0) {
      console.log('Adding reset token columns to companies table...');
      
      await pool.execute(`
        ALTER TABLE companies 
        ADD COLUMN reset_token VARCHAR(255),
        ADD COLUMN reset_token_expires TIMESTAMP
      `);
      
      console.log('✅ Reset token columns added successfully');
    } else {
      console.log('✅ Reset token columns already exist');
    }
  } catch (error: any) {
    console.error('❌ Error ensuring reset token columns:', error.message);
  }
}