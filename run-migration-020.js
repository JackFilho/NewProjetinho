import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

async function runMigration() {
  let connection;

  try {
    console.log('🔌 Connecting to database...');

    connection = await createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'inhousec_sistema',
      multipleStatements: true
    });

    console.log('✅ Connected to database');
    console.log('📄 Reading migration file...');

    const migrationPath = join(__dirname, 'migrations', '020_add_time_interval_to_professionals.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('🚀 Executing migration 020...');
    console.log('SQL:', migrationSQL);

    await connection.query(migrationSQL);

    console.log('✅ Migration 020 executed successfully!');
    console.log('📊 Verifying column was added...');

    const [columns] = await connection.query(
      "SHOW COLUMNS FROM professionals WHERE Field = 'time_interval'"
    );

    if (columns.length > 0) {
      console.log('✅ Column time_interval confirmed in professionals table');
      console.log('Column details:', columns[0]);
    } else {
      console.log('❌ Column time_interval not found - something went wrong');
    }

  } catch (error) {
    console.error('❌ Error executing migration:', error);

    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ Column already exists - migration was already executed');
    } else {
      process.exit(1);
    }
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

runMigration();
