#!/bin/bash

# Script para sincronizar migrations no VPS
# Execute este script no VPS para corrigir as migrations

echo "🔧 Sincronizando migrations no VPS..."

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Execute este script no diretório raiz do projeto"
    exit 1
fi

# Verificar se o arquivo .env existe
if [ ! -f ".env" ]; then
    echo "❌ Arquivo .env não encontrado"
    exit 1
fi

echo "📁 Verificando migrations..."
ls -la migrations/*.sql | wc -l

echo "🔄 Executando script de correção..."
node fix-vps-migrations.js

echo "📊 Verificando status final..."
node scripts/migration-status.cjs

echo "✅ Sincronização concluída!"