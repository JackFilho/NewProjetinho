import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function addPermissionsColumn() {
  let connection;
  
  try {
    // Create connection using environment variables
    connection = await mysql.createConnection({
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE
    });

    console.log('Connected to MySQL database');

    // Check if permissions column already exists
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'plans' AND COLUMN_NAME = 'permissions'
    `, [process.env.PGDATABASE]);

    if (columns.length > 0) {
      console.log('Permissions column already exists');
      return;
    }

    // Add permissions column
    await connection.execute(`
      ALTER TABLE plans ADD COLUMN permissions JSON DEFAULT (JSON_OBJECT(
        'dashboard', true,
        'appointments', true,
        'services', true,
        'professionals', true,
        'clients', true,
        'reviews', false,
        'tasks', false,
        'pointsProgram', false,
        'loyalty', false,
        'inventory', false,
        'messages', false,
        'coupons', false,
        'financial', false,
        'reports', false,
        'settings', true
      ))
    `);

    console.log('Permissions column added successfully');

    // Update existing plans with default permissions
    await connection.execute(`
      UPDATE plans SET permissions = JSON_OBJECT(
        'dashboard', true,
        'appointments', true,
        'services', true,
        'professionals', true,
        'clients', true,
        'reviews', false,
        'tasks', false,
        'pointsProgram', false,
        'loyalty', false,
        'inventory', false,
        'messages', false,
        'coupons', false,
        'financial', false,
        'reports', false,
        'settings', true
      ) WHERE permissions IS NULL
    `);

    console.log('Existing plans updated with default permissions');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

addPermissionsColumn();