import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { professionals } from './shared/schema.ts';

// Load environment variables
dotenv.config();

async function hashMagPassword() {
  console.log('🔧 Hashing password for mag@gmail.com...');

  const host = process.env.MYSQL_HOST || process.env.DB_HOST;
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD;

  if (!host || !password) {
    throw new Error('Missing required environment variables: MYSQL_HOST (or DB_HOST) and MYSQL_PASSWORD (or DB_PASSWORD) must be set');
  }

  const connection = await mysql.createConnection({
    host,
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password,
    database: process.env.DB_NAME,
  });

  const db = drizzle(connection);

  try {
    // Get the specific professional
    const [professional] = await db.select().from(professionals)
      .where(eq(professionals.email, 'mag@gmail.com'));
    
    if (!professional) {
      console.log('❌ Professional mag@gmail.com not found');
      return;
    }
    
    console.log(`Found professional: ${professional.name}`);
    console.log(`Current password: ${professional.password}`);
    
    // Hash the password "12345678"
    const hashedPassword = await bcrypt.hash('12345678', 10);
    
    // Update in database
    await db.update(professionals)
      .set({ password: hashedPassword })
      .where(eq(professionals.id, professional.id));
      
    console.log(`✅ Password hashed for ${professional.name}`);
    console.log(`New hash: ${hashedPassword}`);
    
    // Test the hash
    const testMatch = await bcrypt.compare('12345678', hashedPassword);
    console.log(`✅ Password verification test: ${testMatch}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await connection.end();
  }
}

hashMagPassword();