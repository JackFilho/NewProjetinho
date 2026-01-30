import { pool } from "./db";

export async function ensureAddressColumns() {
  try {
    console.log('✅ Checking and ensuring MySQL database tables...');
    
    // First ensure the companies table exists
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS companies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fantasy_name VARCHAR(255) NOT NULL,
        document VARCHAR(20) NOT NULL UNIQUE,
        address TEXT NOT NULL,
        phone VARCHAR(20),
        zip_code VARCHAR(10),
        number VARCHAR(20),
        neighborhood VARCHAR(255),
        city VARCHAR(255),
        state VARCHAR(2),
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        cnpj VARCHAR(18),
        plan_id INT,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        trial_end_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Companies table ensured');
    
    // Ensure other essential tables exist
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR(255) PRIMARY KEY,
        sess TEXT NOT NULL,
        expire VARCHAR(255) NOT NULL
      )
    `);
    
    console.log('✅ Sessions table ensured');
    
    return true;
  } catch (error: any) {
    console.error('Error ensuring database tables:', error);
    return false;
  }
}