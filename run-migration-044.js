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

    const migrationPath = join(__dirname, 'migrations', '044_add_courses_fields.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('🚀 Executing migration 044...');
    console.log('SQL:', migrationSQL);

    await connection.query(migrationSQL);

    console.log('✅ Migration 044 executed successfully!');
    console.log('📊 Verifying columns were added...');

    const [columns] = await connection.query(
      "SHOW COLUMNS FROM companies WHERE Field IN ('courses_description', 'courses_images', 'courses_pdfs')"
    );

    if (columns.length === 3) {
      console.log('✅ All courses columns confirmed in companies table');
      console.log('Column details:', columns);
    } else {
      console.log('⚠️  Some columns might be missing. Found:', columns.length);
      console.log('Columns found:', columns);
    }

  } catch (error) {
    console.error('❌ Error executing migration:', error);

    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️  Columns already exist - migration was already executed');
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
