// Script para verificar a estrutura da tabela global_settings
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function checkTableStructure() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  try {
    console.log('🔍 Verificando estrutura da tabela global_settings...\n');
    
    const [rows] = await connection.execute('DESCRIBE global_settings');
    
    console.log('Colunas encontradas:');
    console.table(rows);
    
    // Verificar se as colunas necessárias existem
    const requiredColumns = [
      'id',
      'system_name',
      'logo_url',
      'favicon_url',
      'primary_color',
      'secondary_color',
      'background_color',
      'text_color',
      'meta_app_id',
      'meta_app_secret',
      'default_birthday_message',
      'openai_api_key',
      'openai_model',
      'openai_temperature',
      'openai_max_tokens',
      'default_ai_prompt',
      'smtp_host',
      'smtp_port',
      'smtp_user',
      'smtp_password',
      'smtp_secure',
      'smtp_from_name',
      'smtp_from_email'
    ];
    
    const existingColumns = rows.map(row => row.Field);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.log('\n❌ Colunas faltando:');
      missingColumns.forEach(col => console.log(`  - ${col}`));
    } else {
      console.log('\n✅ Todas as colunas necessárias estão presentes');
    }
    
    // Verificar dados existentes
    const [data] = await connection.execute('SELECT * FROM global_settings LIMIT 1');
    console.log('\n📊 Dados existentes:');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('❌ Erro ao verificar tabela:', error);
  } finally {
    await connection.end();
  }
}

checkTableStructure();