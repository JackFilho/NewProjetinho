import { db } from './db';
import { sql } from 'drizzle-orm';

export async function ensurePointsColumn() {
  try {
    // Check if points column exists
    const result = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ${process.env.PGDATABASE} 
      AND TABLE_NAME = 'services' 
      AND COLUMN_NAME = 'points'
    `);
    
    const columnExists = (result[0] as any).count > 0;
    
    if (!columnExists) {
      await db.execute(sql`ALTER TABLE services ADD COLUMN points INT DEFAULT 0`);
      console.log('✅ Points column added to services table');
    } else {
      console.log('⚠️ Points column already exists');
    }
  } catch (error) {
    console.error('Error ensuring points column:', error);
  }
}