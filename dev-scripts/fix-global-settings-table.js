// Script para corrigir a tabela global_settings
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function fixGlobalSettingsTable() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  try {
    console.log('🔧 Corrigindo tabela global_settings...\n');
    
    // 1. Adicionar colunas faltando
    console.log('1. Adicionando colunas faltando...');
    
    try {
      await connection.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN default_birthday_message TEXT DEFAULT NULL
      `);
      console.log('✅ Coluna default_birthday_message adicionada');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna default_birthday_message já existe');
      } else {
        console.error('❌ Erro ao adicionar default_birthday_message:', error.message);
      }
    }
    
    try {
      await connection.execute(`
        ALTER TABLE global_settings 
        ADD COLUMN default_ai_prompt TEXT DEFAULT NULL
      `);
      console.log('✅ Coluna default_ai_prompt adicionada');
    } catch (error) {
      if (error.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ Coluna default_ai_prompt já existe');
      } else {
        console.error('❌ Erro ao adicionar default_ai_prompt:', error.message);
      }
    }
    
    // 2. Corrigir tipos de colunas
    console.log('\n2. Corrigindo tipos de colunas...');
    
    try {
      await connection.execute(`
        ALTER TABLE global_settings 
        MODIFY COLUMN openai_temperature VARCHAR(10) NOT NULL DEFAULT '0.70'
      `);
      console.log('✅ Tipo da coluna openai_temperature corrigido para VARCHAR');
    } catch (error) {
      console.error('❌ Erro ao corrigir openai_temperature:', error.message);
    }
    
    try {
      await connection.execute(`
        ALTER TABLE global_settings 
        MODIFY COLUMN openai_max_tokens VARCHAR(10) NOT NULL DEFAULT '4000'
      `);
      console.log('✅ Tipo da coluna openai_max_tokens corrigido para VARCHAR');
    } catch (error) {
      console.error('❌ Erro ao corrigir openai_max_tokens:', error.message);
    }
    
    // 3. Verificar estrutura final
    console.log('\n3. Verificando estrutura final...');
    const [rows] = await connection.execute('DESCRIBE global_settings');
    
    const requiredColumns = [
      'id',
      'system_name',
      'logo_url',
      'favicon_url',
      'primary_color',
      'secondary_color',
      'background_color',
      'text_color',
      'evolution_api_url',
      'evolution_api_global_key',
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
    
    if (missingColumns.length === 0) {
      console.log('✅ Todas as colunas necessárias estão presentes');
    } else {
      console.log('❌ Ainda faltam colunas:');
      missingColumns.forEach(col => console.log(`  - ${col}`));
    }
    
    console.log('\n🎉 Correção da tabela concluída!');
    
  } catch (error) {
    console.error('❌ Erro geral:', error);
  } finally {
    await connection.end();
  }
}

fixGlobalSettingsTable();