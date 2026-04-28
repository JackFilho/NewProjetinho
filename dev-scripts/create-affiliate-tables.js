import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function createAffiliateTables() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'management_system'
  });

  try {
    // Create affiliates table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS affiliates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        affiliate_code VARCHAR(50) NOT NULL UNIQUE,
        commission_rate DECIMAL(5,2) DEFAULT 10.00,
        is_active INT DEFAULT 1,
        total_earnings DECIMAL(10,2) DEFAULT 0.00,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_affiliate_code (affiliate_code)
      )
    `);
    
    // Create affiliate_referrals table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS affiliate_referrals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        affiliate_id INT NOT NULL,
        company_id INT NOT NULL,
        plan_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        commission_paid DECIMAL(10,2) DEFAULT 0.00,
        monthly_commission DECIMAL(10,2) DEFAULT 0.00,
        referral_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        activation_date TIMESTAMP NULL,
        last_payment_date TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
        INDEX idx_affiliate_id (affiliate_id),
        INDEX idx_company_id (company_id),
        INDEX idx_status (status)
      )
    `);
    
    // Create affiliate_commissions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS affiliate_commissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        affiliate_id INT NOT NULL,
        referral_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        payment_method VARCHAR(50) DEFAULT 'bank_transfer',
        payment_status VARCHAR(50) DEFAULT 'pending',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE,
        FOREIGN KEY (referral_id) REFERENCES affiliate_referrals(id) ON DELETE CASCADE,
        INDEX idx_affiliate_id (affiliate_id),
        INDEX idx_payment_status (payment_status)
      )
    `);
    
    // Add affiliate tracking to companies table
    await connection.execute(`
      ALTER TABLE companies 
      ADD COLUMN IF NOT EXISTS affiliate_code VARCHAR(50) NULL,
      ADD INDEX IF NOT EXISTS idx_affiliate_code (affiliate_code)
    `);
    
    console.log('✅ Affiliate tables created successfully');
    
  } catch (error) {
    console.error('❌ Error creating affiliate tables:', error);
  } finally {
    await connection.end();
  }
}

createAffiliateTables();