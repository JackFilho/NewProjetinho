const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Configuração do banco de dados
const dbConfig = {
  host: process.env.MYSQL_HOST,
  port: parseInt(process.env.MYSQL_PORT || '3306'),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  charset: 'utf8mb4'
};

async function checkMigrationStatus() {
  let connection;
  
  try {
    console.log('🔌 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conexão estabelecida com sucesso!');

    // Verificar se a tabela migrations existe
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'migrations'"
    );

    if (tables.length === 0) {
      console.log('⚠️ Tabela migrations não existe - nenhuma migration foi executada ainda');
      return;
    }

    // Buscar migrations executadas
    const [executedMigrations] = await connection.execute(
      'SELECT filename, executed_at FROM migrations ORDER BY executed_at'
    );

    // Buscar arquivos de migration disponíveis
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log('📊 Status das Migrations:');
    console.log('========================');

    const executedFileNames = executedMigrations.map(m => m.filename);

    migrationFiles.forEach(file => {
      const isExecuted = executedFileNames.includes(file);
      const status = isExecuted ? '✅ EXECUTADA' : '⏳ PENDENTE';
      
      if (isExecuted) {
        const migration = executedMigrations.find(m => m.filename === file);
        const date = new Date(migration.executed_at).toLocaleString('pt-BR');
        console.log(`${status} - ${file} (${date})`);
      } else {
        console.log(`${status} - ${file}`);
      }
    });

    console.log('\n📈 Resumo:');
    console.log(`Total de migrations: ${migrationFiles.length}`);
    console.log(`Executadas: ${executedMigrations.length}`);
    console.log(`Pendentes: ${migrationFiles.length - executedMigrations.length}`);

    if (migrationFiles.length === executedMigrations.length) {
      console.log('🎉 Todas as migrations estão atualizadas!');
    } else {
      console.log('⚠️ Existem migrations pendentes. Execute: node scripts/migrate.js');
    }

  } catch (error) {
    console.error('❌ Erro ao verificar status das migrations:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('👋 Conexão com banco finalizada');
    }
  }
}

checkMigrationStatus();