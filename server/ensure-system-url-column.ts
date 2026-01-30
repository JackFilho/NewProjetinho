import { db } from "./db";

export async function ensureSystemUrlColumn() {
  try {
    // Check if system_url column exists
    const [columns] = await db.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'global_settings' 
      AND COLUMN_NAME = 'system_url'
    `) as any;

    if (columns.length === 0) {
      console.log('Adding system_url column to global_settings table...');
      
      await db.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN system_url VARCHAR(500) AFTER custom_domain_url
      `);
      
      console.log('✅ system_url column added successfully');
      
      // Set default value for system_url if not exists
      await db.execute(`
        UPDATE global_settings 
        SET system_url = 'http://agenday.gilliard.dev' 
        WHERE id = 1 AND (system_url IS NULL OR system_url = '')
      `);
      
      console.log('✅ Default system_url set successfully');
    } else {
      console.log('✅ system_url column already exists');
    }

  } catch (error) {
    console.error('❌ Error ensuring system_url column:', error);
    throw error;
  }
}