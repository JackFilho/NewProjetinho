#!/usr/bin/env node

/**
 * Script para validar se todas as migrations estão atualizadas e sincronizadas
 * com o schema atual do sistema.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Validando Migrations...\n');

// Listar todas as migrations
const migrationsDir = path.join(__dirname, 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort();

console.log('📁 Migrations encontradas:');
migrationFiles.forEach((file, index) => {
  console.log(`  ${index + 1}. ${file}`);
});

console.log(`\n✅ Total: ${migrationFiles.length} migrations`);

// Verificar se todas as migrations estão numeradas sequencialmente
console.log('\n🔢 Verificando numeração sequencial...');
let hasSequenceError = false;

for (let i = 0; i < migrationFiles.length; i++) {
  const expectedNumber = String(i + 1).padStart(3, '0');
  const actualNumber = migrationFiles[i].substring(0, 3);
  
  if (expectedNumber !== actualNumber) {
    console.log(`❌ Erro de sequência: Esperado ${expectedNumber}, encontrado ${actualNumber}`);
    hasSequenceError = true;
  }
}

if (!hasSequenceError) {
  console.log('✅ Numeração sequencial correta');
}

// Verificar se há migrations vazias ou incompletas
console.log('\n📝 Verificando conteúdo das migrations...');
let hasContentError = false;

migrationFiles.forEach(file => {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Verificar se a migration tem conteúdo mínimo
  if (content.length < 200) {
    console.log(`⚠️  Migration muito pequena: ${file} (${content.length} caracteres)`);
    hasContentError = true;
  }
  
  // Verificar se tem seções vazias
  if (content.includes('-- ================================================\n-- ') && 
      content.includes('\n-- ================================================\n\n-- ================================================')) {
    console.log(`⚠️  Possível seção vazia em: ${file}`);
  }
  
  // Verificar se registra a migration
  if (!content.includes("INSERT IGNORE INTO migrations (filename) VALUES")) {
    console.log(`⚠️  Migration não se registra: ${file}`);
  }
});

if (!hasContentError) {
  console.log('✅ Conteúdo das migrations parece adequado');
}

// Verificar estrutura do README
console.log('\n📚 Verificando README das migrations...');
const readmePath = path.join(migrationsDir, 'README.md');

if (fs.existsSync(readmePath)) {
  const readmeContent = fs.readFileSync(readmePath, 'utf8');
  const listedMigrations = (readmeContent.match(/- `\d{3}_.*\.sql`/g) || []).length;
  
  if (listedMigrations === migrationFiles.length) {
    console.log('✅ README atualizado com todas as migrations');
  } else {
    console.log(`⚠️  README desatualizado: Lista ${listedMigrations}, existem ${migrationFiles.length}`);
  }
} else {
  console.log('❌ README.md não encontrado no diretório migrations');
}

// Resumo final
console.log('\n' + '='.repeat(50));
console.log('📊 RESUMO DA VALIDAÇÃO');
console.log('='.repeat(50));

if (!hasSequenceError && !hasContentError) {
  console.log('🎉 Todas as migrations estão válidas!');
  console.log('✅ Numeração sequencial correta');
  console.log('✅ Conteúdo adequado');
  console.log('✅ Sistema pronto para execução das migrations');
} else {
  console.log('⚠️  Foram encontrados alguns problemas:');
  if (hasSequenceError) console.log('   - Problemas de numeração sequencial');
  if (hasContentError) console.log('   - Problemas de conteúdo');
  console.log('\n🔧 Revise os problemas listados acima antes de executar as migrations.');
}

console.log('\n💡 Para executar as migrations:');
console.log('   npm run migrate');
console.log('\n📖 Para mais informações, consulte migrations/README.md');