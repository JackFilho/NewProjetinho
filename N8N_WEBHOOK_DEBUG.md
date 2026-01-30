# Como Ativar Logs de Debug

Este guia explica como ativar/desativar os logs detalhados do sistema para debug.

## 📋 Resumo das Variáveis de Debug

Adicione estas variáveis no arquivo `.env` para ativar logs detalhados:

| Variável | Descrição | Impacto |
|----------|-----------|---------|
| `DEBUG_N8N_WEBHOOK=true` | Logs de webhooks enviados ao n8n | Mostra URL, payload e resposta de todos os webhooks n8n |
| `DEBUG_WHATSAPP_WEBHOOK=true` | Logs de webhooks recebidos do WhatsApp | Mostra mensagens recebidas, eventos e processamento |
| `DEBUG_SQL_QUERIES=true` | Logs de todas as queries SQL | Mostra todas as queries executadas pelo Drizzle ORM |

**Uso recomendado:**
- ✅ **Desenvolvimento/Debug**: Ative apenas quando precisar investigar um problema específico
- ❌ **Produção**: Mantenha TODAS desativadas ou removidas do `.env`

---

## 🔧 Como Ativar os Logs

Para ver logs detalhados de todos os webhooks n8n sendo enviados:

1. **Adicione a variável de ambiente** no arquivo `.env`:
   ```bash
   DEBUG_N8N_WEBHOOK=true
   ```

2. **Reinicie o servidor**:
   ```bash
   npm run dev
   ```

3. **Agora você verá logs detalhados** no console:
   ```
   🔍 [AI/WHATSAPP] Sending to n8n webhook: http://seu-n8n.com/webhook/agendamentos
   📦 [AI/WHATSAPP] Payload: {
     "event": "appointment.created",
     "timestamp": "2025-12-28T...",
     "createdBy": "whatsapp_ai",
     ...
   }
   📬 [AI/WHATSAPP] N8N webhook response status: 200
   ✅ [AI/WHATSAPP] N8N webhook sent successfully
   ```

## 🔇 Como Desativar os Logs

1. **Remova ou comente a variável** no arquivo `.env`:
   ```bash
   # DEBUG_N8N_WEBHOOK=true
   ```

   Ou defina como `false`:
   ```bash
   DEBUG_N8N_WEBHOOK=false
   ```

2. **Reinicie o servidor**:
   ```bash
   npm run dev
   ```

3. **Apenas logs de erro aparecerão**:
   ```
   ⚠️ N8N webhook error: 500 Internal Server Error
   ⚠️ Error processing n8n webhook: Error...
   ```

## 📊 Tipos de Logs

### Com DEBUG_N8N_WEBHOOK=true

**Agendamentos via WhatsApp (AI):**
- `🔍 [AI/WHATSAPP] Sending to n8n webhook: ...`
- `📦 [AI/WHATSAPP] Payload: ...`
- `✅ [AI/WHATSAPP] N8N webhook sent successfully`

**Agendamentos via Empresa:**
- `🔍 [COMPANY] Sending to n8n webhook: ...`
- `📦 [COMPANY] Payload: ...`
- `✅ [COMPANY] N8N webhook sent successfully`

**Agendamentos via Profissional:**
- `🔍 [PROFESSIONAL] Sending to n8n webhook: ...`
- `📦 [PROFESSIONAL] Payload: ...`
- `✅ [PROFESSIONAL] N8N webhook sent successfully`

### Sem DEBUG_N8N_WEBHOOK (padrão)

Apenas logs de erro:
- `⚠️ N8N webhook error: [status] [statusText]`
- `⚠️ Error processing n8n webhook: [error]`

## 📝 Onde os Logs são Gerados

Os webhooks são enviados em **4 lugares diferentes**:

1. **Agendamento via WhatsApp (AI Agent)** - `server/routes.ts` e `server.ts`
   - Identificado por `createdBy: "whatsapp_ai"`
   - Inclui `conversationId` do WhatsApp

2. **Agendamento via Empresa** - `server/routes.ts`
   - Endpoint: `POST /api/company/appointments`
   - Identificado por `createdBy: "company"`

3. **Agendamento via Profissional** - `server/routes.ts`
   - Endpoint: `POST /api/professional/appointments`
   - Identificado por `createdBy: "professional"`

## 🚀 Exemplo de Uso

### Cenário 1: Testando nova integração n8n
```bash
# Ative os logs
echo "DEBUG_N8N_WEBHOOK=true" >> .env

# Reinicie o servidor
npm run dev

# Faça um agendamento de teste
# Verifique os logs no console
# Verifique se chegou no n8n

# Desative os logs
sed -i 's/DEBUG_N8N_WEBHOOK=true/# DEBUG_N8N_WEBHOOK=true/' .env
```

### Cenário 2: Problema com webhook não chegando
```bash
# Ative os logs para investigar
DEBUG_N8N_WEBHOOK=true npm run dev

# Os logs mostrarão:
# - Se o webhook está sendo chamado
# - Qual URL está sendo usada
# - O payload completo sendo enviado
# - A resposta do servidor n8n
```

## 💡 Dicas

- **Produção**: Mantenha `DEBUG_N8N_WEBHOOK=false` ou removido para reduzir logs
- **Desenvolvimento**: Use `DEBUG_N8N_WEBHOOK=true` durante testes
- **Debug**: Se webhook não está funcionando, ative os logs para ver o que está acontecendo
- **Performance**: Logs detalhados não impactam performance, apenas volume de logs

## 🔍 Troubleshooting

**Problema**: Webhook não está sendo enviado
```bash
# Ative os logs
DEBUG_N8N_WEBHOOK=true

# Verifique se aparece algum log começando com 🔍
# Se não aparecer, o toggle pode estar desativado
```

**Problema**: Webhook retorna erro
```bash
# Com logs ativos, você verá:
⚠️ N8N webhook error: 404 Not Found
# Isso indica que a URL do n8n está incorreta

# Ou:
⚠️ N8N webhook error: 500 Internal Server Error
# Isso indica erro no workflow do n8n
```

---

## 🗄️ Debug de Queries SQL

### Como Ativar Logs SQL

Para ver logs detalhados de todas as queries SQL executadas pelo Drizzle ORM:

1. **Adicione a variável de ambiente** no arquivo `.env`:
   ```bash
   DEBUG_SQL_QUERIES=true
   ```

2. **Reinicie o servidor**:
   ```bash
   npm run dev
   ```

3. **Agora você verá logs detalhados** de todas as queries:
   ```
   Query: select `id`, `fantasy_name`, `document`, ... from `companies` where `companies`.`email` = ? -- params: ["email@example.com"]
   Query: select `id`, `name`, `email` from `professionals` where `professionals`.`company_id` = ? -- params: [23]
   Query: update `companies` set `last_login` = ? where `companies`.`id` = ? -- params: ["2025-12-28T10:30:00.000Z", 23]
   ```

### Como Desativar Logs SQL

1. **Remova ou comente a variável** no arquivo `.env`:
   ```bash
   # DEBUG_SQL_QUERIES=true
   ```

   Ou defina como `false`:
   ```bash
   DEBUG_SQL_QUERIES=false
   ```

2. **Reinicie o servidor**:
   ```bash
   npm run dev
   ```

3. **As queries não aparecerão mais** no console (apenas logs de erro permanecerão)

### Quando Usar

**✅ Ative os logs SQL quando:**
- Estiver debugando problemas de consultas ao banco
- Precisar entender quais queries estão sendo executadas
- Investigar problemas de performance no banco de dados
- Verificar se os índices estão sendo utilizados corretamente

**❌ Mantenha desativado em:**
- Ambiente de produção (muita poluição de logs)
- Desenvolvimento normal (apenas ative quando necessário)

### Onde os Logs são Gerados

Os logs SQL aparecem em **todos os acessos** ao banco de dados:
- Login de empresa (`/api/login`)
- Login de profissional (`/api/professional/login`)
- Login de administrador (`/api/admin/login`)
- Criação de agendamentos
- Listagem de clientes
- Qualquer operação CRUD (Create, Read, Update, Delete)

O logger está configurado em `server/db.ts` no objeto Drizzle ORM.

### Exemplo de Uso

```bash
# Ativar logs para investigar queries
echo "DEBUG_SQL_QUERIES=true" >> .env
npm run dev

# Faça login ou execute a operação que quer investigar
# Verifique as queries no console

# Desativar logs depois do debug
sed -i 's/DEBUG_SQL_QUERIES=true/# DEBUG_SQL_QUERIES=true/' .env
npm run dev
```

### 💡 Dicas

- **Produção**: SEMPRE mantenha `DEBUG_SQL_QUERIES=false` ou removido
- **Desenvolvimento**: Use apenas quando precisar debugar queries específicas
- **Performance**: Logs SQL não impactam performance, apenas volume de logs
- **Segurança**: Logs podem conter dados sensíveis (emails, documentos), não compartilhe

---

## 📱 Debug de Webhooks do WhatsApp

### Como Ativar Logs do WhatsApp

Para ver logs detalhados dos webhooks recebidos do WhatsApp (Evolution API):

1. **Adicione a variável de ambiente** no arquivo `.env`:
   ```bash
   DEBUG_WHATSAPP_WEBHOOK=true
   ```

2. **Reinicie o servidor**:
   ```bash
   npm run dev
   ```

3. **Agora você verá logs detalhados** quando mensagens chegarem:
   ```
   🔔 WhatsApp webhook received
   📋 Instance: MinhaInstancia
   📋 Event: messages.upsert
   📋 Full data: { ... }
   🔍 Debug - isMessageEventArray: false
   🔍 Debug - isMessageEventDirect: true
   📱 Message type: conversation
   👤 From me: false
   📞 Remote JID: 5511999999999@s.whatsapp.net
   ```

### Como Desativar Logs do WhatsApp

1. **Remova ou comente a variável** no arquivo `.env`:
   ```bash
   # DEBUG_WHATSAPP_WEBHOOK=true
   ```

2. **Reinicie o servidor**

3. **Os logs excessivos não aparecerão mais** (apenas logs de erro permanecerão)

### Problema de Webhooks Duplicados

**IMPORTANTE**: Se você estava vendo webhooks duplicados, isso foi corrigido!

O problema era causado por **4 endpoints duplicados** registrados para `/api/webhook/whatsapp/:instanceName`:
- 3 em `server.ts` (linhas 361, 3924, 7245) - **DESATIVADOS**
- 1 em `server/routes.ts` (linha 4840) - **ATIVO** ✅

Os endpoints duplicados foram desativados e agora retornam:
```json
{
  "received": true,
  "processed": false,
  "reason": "Endpoint duplicado desativado - use routes.ts"
}
```

### Endpoint Ativo

Apenas **um endpoint** processa webhooks do WhatsApp:
- **Localização**: `server/routes.ts` linha ~4840
- **Rota**: `POST /api/webhook/whatsapp/:instanceName`
- **Eventos suportados**:
  - `messages.upsert` - Novas mensagens
  - `connection.update` - Atualizações de conexão
  - `qrcode.updated` - Atualizações de QR Code

### Tipos de Logs (com DEBUG_WHATSAPP_WEBHOOK=true)

**Recebimento de Webhook:**
- `🔔 WhatsApp webhook received`
- `📋 Instance: ...`
- `📋 Event: ...`
- `📋 Full data: ...`

**Processamento de Mensagem:**
- `📱 Message type: ...`
- `👤 From me: ...`
- `📞 Remote JID: ...`
- `📞 Normalized phone number: ...`

**Debug de Detecção:**
- `🔍 Debug - isMessageEventArray: ...`
- `🔍 Debug - isMessageEventDirect: ...`
- `🔍 Debug - isDirectMessage: ...`

### Sem DEBUG_WHATSAPP_WEBHOOK (padrão)

Apenas logs essenciais e de erro aparecem, reduzindo significativamente a poluição do console.

### Exemplo de Uso

```bash
# Ativar logs para debug
echo "DEBUG_WHATSAPP_WEBHOOK=true" >> .env
npm run dev

# Envie uma mensagem no WhatsApp
# Verifique os logs detalhados

# Desativar logs depois do debug
sed -i 's/DEBUG_WHATSAPP_WEBHOOK=true/# DEBUG_WHATSAPP_WEBHOOK=true/' .env
npm run dev
```
