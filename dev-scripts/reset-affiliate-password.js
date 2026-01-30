import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

async function resetAffiliatePassword() {
  const connection = await mysql.createConnection({
    host: '69.62.101.23',
    port: 3306,
    user: 'gilliard_salao',
    password: 'jkl456jkl',
    database: 'gilliard_salao'
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