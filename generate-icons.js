/**
 * Script para gerar ícones em vários tamanhos a partir de uma única imagem
 *
 * Uso:
 * 1. Coloque sua imagem em: client/public/icons/my-logo.png
 * 2. Execute: node generate-icons.js
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_IMAGE = path.join(__dirname, 'client/public/icons/my-logo.png');
const OUTPUT_DIR = path.join(__dirname, 'client/public/icons');

// Tamanhos de ícones necessários
const SIZES = [
  16, 32, 72, 96, 120, 128, 144, 152, 167, 180, 192, 384, 512
];

async function generateIcons() {
  console.log('🎨 Iniciando geração de ícones...\n');

  // Verificar se a imagem de entrada existe
  if (!fs.existsSync(INPUT_IMAGE)) {
    console.error('❌ Erro: Imagem não encontrada!');
    console.error(`   Coloque sua imagem em: ${INPUT_IMAGE}`);
    console.error('   A imagem deve ser PNG e de preferência 512x512px ou maior');
    process.exit(1);
  }

  // Criar pasta de saída se não existir
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`📁 Imagem de entrada: ${INPUT_IMAGE}`);
  console.log(`📁 Pasta de saída: ${OUTPUT_DIR}\n`);

  // Obter informações da imagem original
  const metadata = await sharp(INPUT_IMAGE).metadata();
  console.log(`📏 Tamanho original: ${metadata.width}x${metadata.height}px\n`);

  // Gerar cada tamanho
  for (const size of SIZES) {
    const outputPath = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);

    try {
      await sharp(INPUT_IMAGE)
        .trim() // Remove espaços em branco/transparentes ao redor
        .resize(size, size, {
          fit: 'cover', // Preenche todo o espaço (pode cortar as bordas)
          position: 'center', // Centraliza a imagem
          background: { r: 255, g: 255, b: 255, alpha: 0 } // Fundo transparente
        })
        .png()
        .toFile(outputPath);

      console.log(`✅ Gerado: icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`❌ Erro ao gerar ${size}x${size}:`, error.message);
    }
  }

  console.log('\n🎉 Ícones gerados com sucesso!');
  console.log('\n💡 Dica: Reinicie o servidor de desenvolvimento para ver as mudanças');
  console.log('💡 Limpe o cache do navegador (Ctrl+Shift+R) para ver o novo favicon');
}

// Executar
generateIcons().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
