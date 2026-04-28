import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

async function runMigrations() {
  let connection;

  try {
    console.log('🔌 Connecting to database...');

    connection = await createConnection({
      host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
      user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
      password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '',
      database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'inhousec_sistema',
      multipleStatements: true
    });

    console.log('✅ Connected to database');

    // Migration 039
    console.log('\n📄 Reading migration 039...');
    const migration039Path = join(__dirname, 'migrations', '039_add_openai_configs_to_companies.sql');
    const migration039SQL = readFileSync(migration039Path, 'utf8');

    console.log('🚀 Executing migration 039...');
    console.log('SQL:', migration039SQL);

    await connection.query(migration039SQL);
    console.log('✅ Migration 039 executed successfully!');

    // Verify migration 039
    console.log('📊 Verifying columns were added...');
    const [columns039] = await connection.query(
      "SHOW COLUMNS FROM companies WHERE Field IN ('openai_api_key', 'openai_model', 'openai_temperature', 'openai_max_tokens')"
    );

    if (columns039.length === 4) {
      console.log('✅ All 4 OpenAI columns confirmed in companies table');
      columns039.forEach(col => console.log(`  - ${col.Field}: ${col.Type}`));
    } else {
      console.log(`⚠️ Expected 4 columns, found ${columns039.length}`);
    }

    // Migration 040
    console.log('\n📄 Reading migration 040...');
    const migration040Path = join(__dirname, 'migrations', '040_migrate_global_openai_to_companies.sql');
    const migration040SQL = readFileSync(migration040Path, 'utf8');

    console.log('🚀 Executing migration 040...');
    console.log('SQL:', migration040SQL);

    await connection.query(migration040SQL);
    console.log('✅ Migration 040 executed successfully!');

    // Verify migration 040
    console.log('📊 Checking migrated data...');
    const [companies] = await connection.query(
      "SELECT COUNT(*) as total, COUNT(openai_api_key) as with_key FROM companies"
    );

    console.log(`✅ Total companies: ${companies[0].total}`);
    console.log(`✅ Companies with OpenAI key: ${companies[0].with_key}`);

    // Migration 041
    console.log('\n📄 Reading migration 041...');
    const migration041Path = join(__dirname, 'migrations', '041_remove_global_openai_columns.sql');
    const migration041SQL = readFileSync(migration041Path, 'utf8');

    console.log('🚀 Executing migration 041...');
    console.log('SQL:', migration041SQL);

    await connection.query(migration041SQL);
    console.log('✅ Migration 041 executed successfully!');

    // Verify migration 041
    console.log('📊 Verifying OpenAI columns were removed from global_settings...');
    const [globalColumns] = await connection.query(
      "SHOW COLUMNS FROM global_settings WHERE Field IN ('openai_api_key', 'openai_model', 'openai_temperature', 'openai_max_tokens')"
    );

    if (globalColumns.length === 0) {
      console.log('✅ All OpenAI columns successfully removed from global_settings');
    } else {
      console.log(`⚠️ Found ${globalColumns.length} OpenAI columns still in global_settings`);
    }

    console.log('\n🎉 All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Error executing migrations:', error);

    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ Columns already exist - migrations were already executed');
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

runMigrations();
