import mysql from 'mysql2/promise';

async function addAddressFields() {
  const connection = await mysql.createConnection({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  });

  try {
    console.log('Checking if address fields exist...');
    
    // Check if columns already exist
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companies' 
      AND COLUMN_NAME IN ('phone', 'zip_code', 'number', 'neighborhood', 'city', 'state')
    `, [process.env.PGDATABASE]);

    if (columns.length === 0) {
      console.log('Adding address fields to companies table...');
      
      await connection.execute(`
        ALTER TABLE companies 
        ADD COLUMN phone VARCHAR(20) NULL,
        ADD COLUMN zip_code VARCHAR(10) NULL,
        ADD COLUMN number VARCHAR(10) NULL,
        ADD COLUMN neighborhood VARCHAR(100) NULL,
        ADD COLUMN city VARCHAR(100) NULL,
        ADD COLUMN state VARCHAR(2) NULL
      `);
      
      console.log('✅ Address fields added successfully');
    } else {
      console.log('✅ Address fields already exist');
    }
  } catch (error) {
    console.error('Error adding address fields:', error);
  } finally {
    await connection.end();
  }
}

addAddressFields();