# Instruções para Atualizar o VPS

## ✅ Status Atual
- ✅ Alterações foram commitadas e enviadas para o GitHub
- ✅ Código local está funcionando corretamente
- ❌ VPS ainda não foi atualizado

## 🔧 Passos para Atualizar o VPS

### 1. Conectar ao VPS
```bash
ssh brelli@69.62.101.23
```

### 2. Navegar para o diretório do projeto
```bash
cd /home/brelli/dev.brelli.com.br
```

### 3. Atualizar o código do GitHub
```bash
git pull origin main
```

### 4. Verificar se as alterações foram aplicadas
```bash
# Verificar se o arquivo schema.ts foi atualizado
grep -n "mercadopago" shared/schema.ts

# Verificar se o arquivo storage.ts foi atualizado
grep -n "db.select().from(companies)" server/storage.ts
```

### 5. Reiniciar o serviço
```bash
pm2 restart all
```

### 6. Verificar os logs
```bash
pm2 logs
```

## 📋 Arquivos que foram corrigidos:
- `shared/schema.ts` - Removidas colunas do MercadoPago
- `server/storage.ts` - Corrigidas todas as funções de query
- `server/routes.ts` - Corrigida query SQL específica
- `migrations/018_add_mercadopago_columns.sql` - Migration criada

## 🔍 Verificação
Após a atualização, teste:
1. Login em `/company`
2. Verifique se não há mais erros de "Unknown column 'mercadopago_access_token'"
3. Verifique se as rotas `/api/company/auth/profile` e `/api/company/plan-info` funcionam

## 🚨 Se ainda houver problemas
1. Verifique os logs do PM2: `pm2 logs`
2. Verifique se o banco de dados está acessível
3. Execute a migration se necessário: `node scripts/migrate.cjs` 