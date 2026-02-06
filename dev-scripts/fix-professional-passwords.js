import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { professionals } from './shared/schema.ts';

async function fixProfessionalPasswords() {
  console.log('🔧 Fixing professional passwords...');

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
    // Get all professionals with passwords
    const allProfessionals = await db.select().from(professionals);
    
    console.log(`Found ${allProfessionals.length} professionals`);
    
    for (const professional of allProfessionals) {
      console.log(`\nChecking professional: ${professional.name} (${professional.email})`);
      console.log(`Current password: ${professional.password}`);
      
      // Check if password is already hashed (bcrypt hashes start with $2b$)
      if (professional.password && !professional.password.startsWith('$2b$')) {
        console.log('Password needs hashing...');
        
        // Hash the password
        const hashedPassword = await bcrypt.hash(professional.password, 10);
        
        // Update in database
        await db.update(professionals)
          .set({ password: hashedPassword })
          .where(eq(professionals.id, professional.id));
          
        console.log(`✅ Password hashed for ${professional.name}`);
        console.log(`New hash: ${hashedPassword}`);
      } else if (professional.password && professional.password.startsWith('$2b$')) {
        console.log('✅ Password already hashed');
      } else {
        console.log('⚠️ No password set');
      }
    }
    
    console.log('\n🎉 All professional passwords checked and fixed!');
    
  } catch (error) {
    console.error('❌ Error fixing passwords:', error);
  } finally {
    await connection.end();
  }
}

fixProfessionalPasswords();