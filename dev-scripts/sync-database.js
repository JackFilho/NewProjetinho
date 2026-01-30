#!/usr/bin/env node

/**
 * Script para sincronizar banco de dados entre ambientes
 * Uso: node sync-database.js [local-to-remote|remote-to-local|migrations-only]
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurações (ajuste conforme necessário)
const CONFIG = {
  local: {
    host: 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'admin_system'
  },
  remote: {
    host: process.env.VPS_HOST || 'seu-vps.com',
    user: process.env.VPS_MYSQL_USER || 'root',
    password: process.env.VPS_MYSQL_PASSWORD || '',
    database: process.env.VPS_MYSQL_DATABASE || 'admin_system',
    sshUser: process.env.VPS_SSH_USER || 'root',
    projectPath: process.env.VPS_PROJECT_PATH || '/var/www/projeto'
  }
};

const mode = process.argv[2] || 'migrations-only';

console.log('🔄 Iniciando sincronização do banco de dados...');
console.log(`📋 Modo: ${mode}`);

switch (mode) {
  case 'migrations-only':
    await syncMigrationsOnly();
    break;
  case 'local-to-remote':
    await syncLocalToRemote();
    break;
  case 'remote-to-local':
    await syncRemoteToLocal();
    break;
  default:
    console.log('❌ Modo inválido. Use: migrations-only, local-to-remote, ou remote-to-local');
    process.exit(1);
}

async function syncMigrationsOnly() {
  console.log('🚀 Executando apenas migrations no VPS...');
  
  try {
    // Executar migrations via SSH
    const sshCommand = `ssh ${CONFIG.remote.sshUser}@${CONFIG.remote.host} "cd ${CONFIG.remote.projectPath} && node scripts/migrate.cjs"`;
    
    console.log('📡 Conectando ao VPS e executando migrations...');
    execSync(sshCommand, { stdio: 'inherit' });
    
    console.log('✅ Migrations executadas com sucesso no VPS!');
    
    // Verificar status
    const statusCommand = `ssh ${CONFIG.remote.sshUser}@${CONFIG.remote.host} "cd ${CONFIG.remote.projectPath} && node scripts/migration-status.cjs"`;
    console.log('📊 Verificando status das migrations...');
    execSync(statusCommand, { stdio: 'inherit' });
    
  } catch (error) {
    console.error('❌ Erro ao executar migrations no VPS:', error.message);
    console.log('\n💡 Dicas para resolver:');
    console.log('1. Verifique se o SSH está configurado corretamente');
    console.log('2. Confirme se o caminho do projeto está correto');
    console.log('3. Verifique se as variáveis de ambiente estão configuradas no VPS');
  }
}

async function syncLocalToRemote() {
  console.log('📤 Sincronizando banco local para VPS...');
  
  try {
    // Criar backup local
    const backupFile = `backup_${Date.now()}.sql`;
    const backupCommand = `mysqldump -h ${CONFIG.local.host} -u ${CONFIG.local.user} -p${CONFIG.local.password} ${CONFIG.local.database} > ${backupFile}`;
    
    console.log('💾 Criando backup do banco local...');
    execSync(backupCommand);
    
    // Transferir para VPS
    console.log('📡 Transferindo backup para VPS...');
    const scpCommand = `scp ${backupFile} ${CONFIG.remote.sshUser}@${CONFIG.remote.host}:${CONFIG.remote.projectPath}/`;
    execSync(scpCommand);
    
    // Restaurar no VPS
    console.log('🔄 Restaurando backup no VPS...');
    const restoreCommand = `ssh ${CONFIG.remote.sshUser}@${CONFIG.remote.host} "cd ${CONFIG.remote.projectPath} && mysql -h ${CONFIG.remote.host} -u ${CONFIG.remote.user} -p${CONFIG.remote.password} ${CONFIG.remote.database} < ${backupFile}"`;
    execSync(restoreCommand);
    
    // Limpar arquivos temporários
    fs.unlinkSync(backupFile);
    execSync(`ssh ${CONFIG.remote.sshUser}@${CONFIG.remote.host} "rm ${CONFIG.remote.projectPath}/${backupFile}"`);
    
    console.log('✅ Sincronização concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error.message);
  }
}

async function syncRemoteToLocal() {
  console.log('📥 Sincronizando banco do VPS para local...');
  
  try {
    // Criar backup no VPS
    const backupFile = `backup_remote_${Date.now()}.sql`;
    const backupCommand = `ssh ${CONFIG.remote.sshUser}@${CONFIG.remote.host} "mysqldump -h ${CONFIG.remote.host} -u ${CONFIG.remote.user} -p${CONFIG.remote.password} ${CONFIG.remote.database} > ${CONFIG.remote.projectPath}/${backupFile}"`;
    
    console.log('💾 Criando backup do banco no VPS...');
    execSync(backupCommand);
    
    // Transferir para local
    console.log('📡 Transferindo backup do VPS...');
    const scpCommand = `scp ${CONFIG.remote.sshUser}@${CONFIG.remote.host}:${CONFIG.remote.projectPath}/${backupFile} ./`;
    execSync(scpCommand);
    
    // Restaurar localmente
    console.log('🔄 Restaurando backup localmente...');
    const restoreCommand = `mysql -h ${CONFIG.local.host} -u ${CONFIG.local.user} -p${CONFIG.local.password} ${CONFIG.local.database} < ${backupFile}`;
    execSync(restoreCommand);
    
    // Limpar arquivos temporários
    fs.unlinkSync(backupFile);
    execSync(`ssh ${CONFIG.remote.sshUser}@${CONFIG.remote.host} "rm ${CONFIG.remote.projectPath}/${backupFile}"`);
    
    console.log('✅ Sincronização concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error.message);
  }
}

console.log('\n📋 Comandos disponíveis:');
console.log('  node sync-database.js migrations-only    # Apenas executar migrations no VPS');
console.log('  node sync-database.js local-to-remote    # Copiar banco local para VPS');
console.log('  node sync-database.js remote-to-local    # Copiar banco VPS para local');
console.log('\n💡 Configure as variáveis de ambiente no .env antes de usar!');