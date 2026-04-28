const mysql = require('mysql2/promise');

async function migrateOpenAI() {
  const connection = await mysql.createConnection({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT
  });

  try {
    await connection.execute(`
      ALTER TABLE global_settings 
      ADD COLUMN openai_api_key VARCHAR(500) NULL,
      ADD COLUMN openai_model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
      ADD COLUMN openai_temperature DECIMAL(3,2) NOT NULL DEFAULT 0.70,
      ADD COLUMN openai_max_tokens INT NOT NULL DEFAULT 4000
    `);
    console.log('OpenAI columns added successfully');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('OpenAI columns already exist');
    } else {
      console.error('Migration error:', error.message);
      throw error;
    }
  } finally {
    await connection.end();
  }
}

migrateOpenAI()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));