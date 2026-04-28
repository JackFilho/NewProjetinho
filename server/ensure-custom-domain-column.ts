import { pool } from "./db";

export async function ensureCustomDomainColumn() {
  try {
    // Check if custom_domain_url column exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'global_settings' 
      AND COLUMN_NAME = 'custom_domain_url'
    `);

    if (Array.isArray(columns) && columns.length === 0) {
      console.log('Adding custom_domain_url column to global_settings table...');
      
      await pool.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN custom_domain_url VARCHAR(500) AFTER custom_html
      `);
      
      console.log('✅ Custom domain URL column added successfully');
    } else {
      console.log('✅ Custom domain URL column already exists');
    }
  } catch (error: any) {
    console.error('❌ Error ensuring custom domain URL column:', error.message);
  }
}