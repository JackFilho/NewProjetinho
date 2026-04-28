import mysql from 'mysql2/promise';
import 'dotenv/config';

async function testMySQLConnection() {
  try {
    console.log('Testando conexão com MySQL...');
    console.log(`Host: ${process.env.MYSQL_HOST || 'localhost'}`);
    console.log(`Port: ${process.env.MYSQL_PORT || '3306'}`);
    console.log(`User: ${process.env.MYSQL_USER || 'root'}`);
    console.log(`Database: ${process.env.MYSQL_DATABASE || 'admin_system'}`);

    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'password',
      database: process.env.MYSQL_DATABASE || 'admin_system',
    });

    console.log('✅ Conexão com MySQL estabelecida com sucesso!');
    
    // Testar se as tabelas existem
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('📋 Tabelas encontradas:', tables);

    await connection.end();
    console.log('🔐 Conexão fechada.');
    
  } catch (error) {
    console.error('❌ Erro ao conectar com MySQL:', error);
    console.log('\n📝 Instruções:');
    console.log('1. Verifique se o MySQL está rodando');
    console.log('2. Configure as credenciais no arquivo .env');
    console.log('3. Execute o script setup-database.sql');
  }
}

// Remove CommonJS check for ES modules

export { testMySQLConnection };