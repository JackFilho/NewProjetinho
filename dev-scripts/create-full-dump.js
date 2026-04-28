#!/usr/bin/env node

/**
 * Criar dump completo do banco para restaurar no VPS
 */

import { execSync } from 'child_process';
import fs from 'fs';

console.log('💾 Criando dump completo do banco de dados...');

try {
  // Ler configurações do .env
  const envContent = fs.readFileSync('.env', 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      envVars[key.trim()] = value.trim();
    }
  });

  const host = envVars.MYSQL_HOST || 'localhost';
  const user = envVars.MYSQL_USER || 'root';
  const password = envVars.MYSQL_PASSWORD || '';
  const database = envVars.MYSQL_DATABASE || 'admin_system';

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dumpFile = `database_dump_${timestamp}.sql`;

  // Criar dump
  const command = `mysqldump -h ${host} -u ${user} -p${password} --single-transaction --routines --triggers ${database} > ${dumpFile}`;
  
  execSync(command);
  
  console.log(`✅ Dump criado: ${dumpFile}`);
  console.log('\n📋 Para restaurar no VPS:');
  console.log(`1. Copie o arquivo: scp ${dumpFile} usuario@vps:/caminho/`);
  console.log(`2. No VPS execute: mysql -u usuario -p database_name < ${dumpFile}`);
  
} catch (error) {
  console.error('❌ Erro ao criar dump:', error.message);
  console.log('\n💡 Tente manualmente:');
  console.log('mysqldump -u usuario -p database_name > dump.sql');
}