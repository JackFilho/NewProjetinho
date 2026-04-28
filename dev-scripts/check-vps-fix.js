const fs = require('fs');
const path = require('path');

function checkVPSFix() {
  console.log('🔍 Verificando se as correções foram aplicadas no VPS...\n');

  const checks = [
    {
      file: 'shared/schema.ts',
      description: 'Verificar se as colunas do MercadoPago foram removidas do schema',
      check: (content) => {
        const hasMercadoPagoColumns = content.includes('mercadopagoAccessToken') || 
                                    content.includes('mercadopagoPublicKey') || 
                                    content.includes('mercadopagoWebhookUrl') || 
                                    content.includes('mercadopagoEnabled');
        return !hasMercadoPagoColumns;
      }
    },
    {
      file: 'server/storage.ts',
      description: 'Verificar se as funções de query foram corrigidas',
      check: (content) => {
        const hasSelectAll = content.includes('db.select().from(companies)');
        return !hasSelectAll;
      }
    },
    {
      file: 'server/routes.ts',
      description: 'Verificar se a query SQL foi corrigida',
      check: (content) => {
        const hasSelectAll = content.includes('SELECT * FROM companies');
        return !hasSelectAll;
      }
    },
    {
      file: 'migrations/018_add_mercadopago_columns.sql',
      description: 'Verificar se a migration foi criada',
      check: (content) => {
        return content.includes('mercadopago_access_token') && 
               content.includes('mercadopago_public_key') && 
               content.includes('mercadopago_webhook_url') && 
               content.includes('mercadopago_enabled');
      }
    }
  ];

  let allPassed = true;

  for (const check of checks) {
    console.log(`📁 Verificando: ${check.file}`);
    console.log(`📝 ${check.description}`);
    
    try {
      if (!fs.existsSync(check.file)) {
        console.log(`❌ Arquivo não encontrado: ${check.file}`);
        allPassed = false;
        continue;
      }

      const content = fs.readFileSync(check.file, 'utf8');
      const passed = check.check(content);
      
      if (passed) {
        console.log(`✅ PASS - Correção aplicada corretamente`);
      } else {
        console.log(`❌ FAIL - Correção não foi aplicada`);
        allPassed = false;
      }
    } catch (error) {
      console.log(`❌ ERRO - Não foi possível verificar o arquivo: ${error.message}`);
      allPassed = false;
    }
    
    console.log('');
  }

  console.log('📊 RESULTADO FINAL:');
  if (allPassed) {
    console.log('🎉 TODAS AS CORREÇÕES FORAM APLICADAS COM SUCESSO!');
    console.log('✅ O login em /company deve funcionar corretamente agora.');
  } else {
    console.log('⚠️  ALGUMAS CORREÇÕES NÃO FORAM APLICADAS.');
    console.log('🔄 Execute "git pull origin main" para atualizar o código.');
  }

  return allPassed;
}

// Executar se o arquivo for executado diretamente
if (require.main === module) {
  const result = checkVPSFix();
  process.exit(result ? 0 : 1);
}

module.exports = checkVPSFix; 