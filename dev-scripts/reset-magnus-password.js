import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';

async function resetMagnusPassword() {
  let connection;
  
  try {
    // Create database connection
    if (!process.env.MYSQL_HOST || !process.env.MYSQL_PASSWORD) {
      throw new Error('Variáveis MYSQL_HOST e MYSQL_PASSWORD são obrigatórias');
    }
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });

    console.log('Connected to MySQL database');

    // Check current professional data
    const [currentData] = await connection.execute(
      'SELECT id, name, email, password FROM professionals WHERE email = ?',
      ['mag@gmail.com']
    );

    if (currentData.length === 0) {
      console.log('Professional mag@gmail.com not found');
      return;
    }

    const professional = currentData[0];
    console.log(`Found professional: ${professional.name} (ID: ${professional.id})`);
    console.log(`Current password hash: ${professional.password ? professional.password.substring(0, 20) + '...' : 'No password'}`);

    // Hash the new password
    const newPassword = '12345678';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    console.log(`Generated new hash: ${hashedPassword.substring(0, 20)}...`);

    // Update the password
    await connection.execute(
      'UPDATE professionals SET password = ? WHERE id = ?',
      [hashedPassword, professional.id]
    );

    console.log('Password updated successfully');

    // Verify the update
    const [updatedData] = await connection.execute(
      'SELECT password FROM professionals WHERE id = ?',
      [professional.id]
    );

    const isMatch = await bcrypt.compare(newPassword, updatedData[0].password);
    console.log(`Password verification: ${isMatch ? 'SUCCESS' : 'FAILED'}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

resetMagnusPassword();