import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const config = {
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

async function checkColumns() {
  let connection;
  
  try {
    connection = await mysql.createConnection(config);
    console.log('✅ Conectado ao banco');
    
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companies'
      ORDER BY ORDINAL_POSITION
    `, [config.database]);
    
    console.log('\n📋 Colunas da tabela companies:');
    console.log('=====================================');
    
    columns.forEach((col, index) => {
      console.log(`${index + 1}. ${col.COLUMN_NAME} (${col.DATA_TYPE}) - ${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Verificar colunas específicas que podem estar faltando
    const expectedColumns = [
      'birthday_message',
      'ai_agent_prompt', 
      'reset_token',
      'reset_token_expires',
      'stripe_customer_id',
      'stripe_subscription_id',
      'tour_enabled',
      'trial_expires_at',
      'trial_alert_shown',
      'subscription_status'
    ];
    
    console.log('\n🔍 Verificando colunas esperadas:');
    console.log('=====================================');
    
    const existingColumns = columns.map(col => col.COLUMN_NAME);
    
    expectedColumns.forEach(col => {
      const exists = existingColumns.includes(col);
      console.log(`${exists ? '✅' : '❌'} ${col}`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkColumns();