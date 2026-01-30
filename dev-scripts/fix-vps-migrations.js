#!/usr/bin/env node

/**
 * Script para corrigir migrations no VPS
 * Executa no VPS para sincronizar com o estado local
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuração do banco (lê do .env)
const config = {
  host: process.env.MYSQL_HOST || null,
  port: parseInt(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || null,
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || null,
  multipleStatements: true
};

console.log('🔧 Iniciando correção das migrations no VPS...');

async function fixMigrations() {
  let connection;
  
  try {
    // Conectar ao banco
    console.log('🔌 Conectando ao banco de dados...');
    connection = await mysql.createConnection(config);
    console.log('✅ Conexão estabelecida!');

    // Listar migrations no diretório
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`📁 Encontradas ${migrationFiles.length} migrations no diretório`);

    // Verificar tabela migrations
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT PRIMARY KEY AUTO_INCREMENT,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_filename (filename)
      )
    `);

    // Buscar migrations executadas no banco
    const [executedMigrations] = await connection.execute(
      'SELECT filename FROM migrations ORDER BY filename'
    );

    console.log(`💾 ${executedMigrations.length} migrations registradas no banco`);

    // Identificar migrations faltantes
    const executedFilenames = executedMigrations.map(m => m.filename);
    const missingMigrations = migrationFiles.filter(file => !executedFilenames.includes(file));
    const extraMigrations = executedFilenames.filter(filename => !migrationFiles.includes(filename));

    if (extraMigrations.length > 0) {
      console.log('⚠️  Migrations registradas no banco mas não encontradas no diretório:');
      extraMigrations.forEach(filename => console.log(`   - ${filename}`));
      
      // Remover registros órfãos
      for (const filename of extraMigrations) {
        await connection.execute('DELETE FROM migrations WHERE filename = ?', [filename]);
        console.log(`🗑️  Removido registro órfão: ${filename}`);
      }
    }

    if (missingMigrations.length > 0) {
      console.log('📋 Migrations pendentes de execução:');
      missingMigrations.forEach(filename => console.log(`   - ${filename}`));

      // Executar migrations faltantes
      for (const filename of missingMigrations) {
        console.log(`⚡ Executando migration: ${filename}`);
        
        try {
          const migrationPath = path.join(migrationsDir, filename);
          const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
          
          // Executar SQL da migration
          await connection.execute(migrationSQL);
          
          // Registrar como executada (se não estiver já registrada)
          await connection.execute(
            'INSERT IGNORE INTO migrations (filename) VALUES (?)',
            [filename]
          );
          
          console.log(`✅ Migration ${filename} executada com sucesso!`);
          
        } catch (error) {
          console.error(`❌ Erro ao executar ${filename}:`, error.message);
          // Continuar com as próximas migrations
        }
      }
    }

    // Verificar status final
    const [finalMigrations] = await connection.execute(
      'SELECT filename FROM migrations ORDER BY filename'
    );

    console.log('\n📊 Status Final:');
    console.log(`Total de migrations no diretório: ${migrationFiles.length}`);
    console.log(`Total de migrations executadas: ${finalMigrations.length}`);
    console.log(`Migrations pendentes: ${migrationFiles.length - finalMigrations.length}`);

    if (migrationFiles.length === finalMigrations.length) {
      console.log('🎉 Todas as migrations estão sincronizadas!');
    } else {
      console.log('⚠️  Ainda há inconsistências. Verifique os erros acima.');
    }

  } catch (error) {
    console.error('❌ Erro durante a correção:', error.message);
  } finally {
    if (connection) {
      await connection.end();
      console.log('👋 Conexão finalizada');
    }
  }
}

// Executar correção
fixMigrations().catch(console.error);