import { db, pool } from './server/db.js';

async function addProfessionalPasswordColumn() {
  try {
    console.log('🔧 Adding password column to professionals table...');
    
    // Check if column exists
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'professionals' 
      AND COLUMN_NAME = 'password'
      AND TABLE_SCHEMA = DATABASE()
    `);
    
    if (columns.length === 0) {
      // Add password column
      await pool.execute(`
        ALTER TABLE professionals 
        ADD COLUMN password VARCHAR(255) AFTER email
      `);
      console.log('✅ Password column added to professionals table');
    } else {
      console.log('✅ Password column already exists in professionals table');
    }
    
  } catch (error) {
    console.error('❌ Error adding password column:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  addProfessionalPasswordColumn()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

export { addProfessionalPasswordColumn };