const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function syncVPSFix() {
  console.log('🚀 Iniciando sincronização das correções com o VPS...');

  // Lista de arquivos que foram corrigidos
  const filesToSync = [
    'shared/schema.ts',
    'server/storage.ts',
    'server/routes.ts',
    'migrations/018_add_mercadopago_columns.sql'
  ];

  console.log('📁 Arquivos que serão sincronizados:');
  filesToSync.forEach(file => console.log(`  - ${file}`));

  // Verificar se os arquivos existem localmente
  for (const file of filesToSync) {
    if (!fs.existsSync(file)) {
      console.error(`❌ Arquivo não encontrado: ${file}`);
      return;
    }
  }

  console.log('✅ Todos os arquivos encontrados localmente');

  // Comandos para sincronizar com o VPS
  const commands = [
    // Fazer commit das alterações
    'git add .',
    'git commit -m "fix: remove mercadopago columns from queries to fix login error"',
    'git push origin main',
    
    // Conectar ao VPS e atualizar
    'ssh brelli@69.62.101.23 "cd /home/brelli/dev.brelli.com.br && git pull origin main"',
    
    // Reiniciar o serviço no VPS
    'ssh brelli@69.62.101.23 "cd /home/brelli/dev.brelli.com.br && pm2 restart all"'
  ];

  console.log('🔄 Executando comandos de sincronização...');

  for (let i = 0; i < commands.length; i++) {
    const command = commands[i];
    console.log(`\n📝 Executando: ${command}`);
    
    try {
      await executeCommand(command);
      console.log(`✅ Comando executado com sucesso`);
    } catch (error) {
      console.error(`❌ Erro ao executar comando: ${error.message}`);
      return;
    }
  }

  console.log('\n🎉 Sincronização concluída!');
  console.log('📋 Próximos passos:');
  console.log('  1. Verifique se o VPS está funcionando corretamente');
  console.log('  2. Teste o login em /company');
  console.log('  3. Se ainda houver problemas, verifique os logs do VPS');
}

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Erro: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.warn(`Aviso: ${stderr}`);
      }
      if (stdout) {
        console.log(`Saída: ${stdout}`);
      }
      resolve();
    });
  });
}

// Executar se o arquivo for executado diretamente
if (require.main === module) {
  syncVPSFix()
    .then(() => {
      console.log('✅ Sincronização executada com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro ao executar sincronização:', error);
      process.exit(1);
    });
}

module.exports = syncVPSFix; 