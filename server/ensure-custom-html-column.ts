import { pool } from "./db";

export async function ensureCustomHtmlColumn() {
  try {
    // Check if custom_html column exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'global_settings' 
      AND COLUMN_NAME = 'custom_html'
    `);

    if (Array.isArray(columns) && columns.length === 0) {
      console.log('Adding custom_html column to global_settings table...');
      
      await pool.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN custom_html TEXT AFTER smtp_secure
      `);
      
      console.log('✅ Custom HTML column added successfully');
    } else {
      console.log('✅ Custom HTML column already exists');
    }
  } catch (error: any) {
    console.error('❌ Error ensuring custom HTML column:', error.message);
  }
}