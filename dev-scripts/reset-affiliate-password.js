import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

async function resetAffiliatePassword() {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_PASSWORD) {
    throw new Error('Variáveis MYSQL_HOST e MYSQL_PASSWORD são obrigatórias');
  }
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    // Hash a new password
    const newPassword = '12345678';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    console.log(`New password: ${newPassword}`);
    console.log(`Hashed password: ${hashedPassword}`);
    
    // Update the affiliate password
    const [result] = await connection.execute(
      'UPDATE affiliates SET password = ? WHERE email = ?',
      [hashedPassword, 'gilliard@gmail.com']
    );
    
    console.log('Password update result:', result);
    
    // Verify the affiliate data
    const [rows] = await connection.execute(
      'SELECT id, name, email, password, is_active FROM affiliates WHERE email = ?',
      ['gilliard@gmail.com']
    );
    
    console.log('Affiliate data after update:', rows[0]);
    
    // Test password validation
    const affiliate = rows[0];
    const isValid = await bcrypt.compare(newPassword, affiliate.password);
    console.log('Password validation test:', isValid);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

resetAffiliatePassword();