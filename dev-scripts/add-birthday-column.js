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

async function addBirthdayColumn() {
  let connection;
  
  try {
    connection = await mysql.createConnection(config);
    console.log('✅ Conectado ao banco');
    
    // Adicionar coluna birthday_message
    await connection.execute(`
      ALTER TABLE companies 
      ADD COLUMN IF NOT EXISTS birthday_message TEXT DEFAULT NULL
    `);
    
    console.log('✅ Coluna birthday_message adicionada com sucesso!');
    
    // Verificar se foi adicionada
    const [columns] = await connection.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'birthday_message'
    `, [config.database]);
    
    if (columns.length > 0) {
      console.log('✅ Coluna birthday_message confirmada no banco!');
    } else {
      console.log('❌ Coluna birthday_message não foi criada');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

addBirthdayColumn();