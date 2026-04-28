# Integração Asaas - Sistema de Pagamentos

## Visão Geral

Este documento descreve a integração do sistema com o Asaas, plataforma de pagamentos brasileira que substituiu o Stripe.

## Configuração

### Variáveis de Ambiente

Adicione as seguintes variáveis ao seu arquivo `.env`:

```env
ASAAS_API_KEY=sua_chave_api_aqui
ASAAS_ENVIRONMENT=sandbox  # ou 'production' para ambiente de produção
```

### Obtendo Credenciais

1. Acesse [Asaas](https://www.asaas.com/)
2. Crie uma conta ou faça login
3. Navegue até **Integrações > API**
4. Copie sua chave de API (Access Token)

**Importante:** Use a chave de sandbox para testes e a chave de produção apenas em ambiente de produção.

## Estrutura do Serviço

O serviço Asaas está localizado em `server/services/asaas.ts` e fornece os seguintes métodos:

### Gerenciamento de Clientes

- `createCustomer(data)` - Cria um novo cliente no Asaas
- `updateCustomer(customerId, data)` - Atualiza dados de um cliente
- `getCustomer(customerId)` - Busca informações de um cliente

### Cobranças (Pagamentos Únicos)

- `createPayment(data)` - Cria uma cobrança única
- `getPayment(paymentId)` - Busca informações de uma cobrança
- `listCustomerPayments(customerId, options)` - Lista cobranças de um cliente

### Assinaturas (Pagamentos Recorrentes)

- `createSubscription(data)` - Cria uma assinatura recorrente
- `getSubscription(subscriptionId)` - Busca informações de uma assinatura
- `updateSubscription(subscriptionId, data)` - Atualiza uma assinatura
- `cancelSubscription(subscriptionId)` - Cancela uma assinatura

### PIX

- `getPixQrCode(paymentId)` - Gera QR Code PIX para uma cobrança

## Tipos de Pagamento Suportados

O Asaas suporta os seguintes métodos de pagamento:

- **BOLETO** - Boleto bancário
- **CREDIT_CARD** - Cartão de crédito
- **PIX** - Pagamento instantâneo PIX
- **UNDEFINED** - Não especificado (cliente escolhe)

## Fluxo de Pagamento

### 1. Criar Cliente

Primeiro, crie um cliente no Asaas com os dados da empresa:

```typescript
const customer = await asaasService.createCustomer({
  name: 'Nome da Empresa',
  email: 'email@empresa.com',
  cpfCnpj: '00.000.000/0000-00',
  phone: '1140041234',
  mobilePhone: '11999991234',
  postalCode: '01310-100',
  address: 'Av. Paulista',
  addressNumber: '1578',
  province: 'Bela Vista',
});
```

### 2. Criar Assinatura

Para planos mensais/anuais, crie uma assinatura recorrente:

```typescript
const subscription = await asaasService.createSubscription({
  customer: customer.id,
  billingType: 'CREDIT_CARD',
  value: 89.90,
  nextDueDate: '2025-11-24', // Data do primeiro vencimento
  cycle: 'MONTHLY', // MONTHLY, YEARLY, etc.
  description: 'Plano Profissional - Mensal',
  externalReference: `company_${companyId}`,
});
```

### 3. Processar Webhooks

Configure um webhook no painel do Asaas apontando para:
```
https://seu-dominio.com/api/asaas/webhook
```

Eventos importantes:
- `PAYMENT_RECEIVED` - Pagamento confirmado
- `PAYMENT_OVERDUE` - Pagamento vencido
- `PAYMENT_DELETED` - Pagamento cancelado
- `PAYMENT_RESTORED` - Pagamento restaurado

## Migrações do Banco de Dados

### Migração 019 - Remoção de Colunas Stripe

Execute a migração para remover as colunas antigas do Stripe:

```bash
mysql -u usuario -p banco < migrations/019_remove_stripe_columns.sql
```

Esta migração remove:
- `companies.stripe_customer_id`
- `companies.stripe_subscription_id`
- `plans.stripe_product_id`
- `plans.stripe_price_id`

### Novas Colunas Asaas

As colunas do Asaas já estão presentes no schema:
- `companies.asaas_api_key` - Chave API específica da empresa (opcional)
- `companies.asaas_webhook_url` - URL do webhook (opcional)
- `companies.asaas_environment` - Ambiente (sandbox/production)
- `companies.asaas_enabled` - Se o Asaas está habilitado

## Testes

### Modo Sandbox

No ambiente sandbox, você pode:
- Criar clientes de teste
- Simular pagamentos
- Testar webhooks

### Dados de Teste

Para cartões de crédito em sandbox:
- Número: `5162306219378829`
- CVV: `318`
- Validade: Qualquer data futura

## Próximos Passos

1. ✅ Remover código do Stripe
2. ✅ Criar serviço Asaas base
3. 🔲 Implementar rotas de pagamento com Asaas
4. 🔲 Criar página de checkout no frontend
5. 🔲 Implementar processamento de webhooks
6. 🔲 Migrar dados existentes (se houver)
7. 🔲 Testes de integração
8. 🔲 Documentação de uso

## Referências

- [Documentação Asaas](https://docs.asaas.com/)
- [API Reference](https://docs.asaas.com/reference)
- [Webhooks](https://docs.asaas.com/docs/webhooks)
- [Status de Pagamentos](https://docs.asaas.com/docs/status-de-pagamentos)

## Suporte

Em caso de dúvidas sobre a API do Asaas:
- Email: suporte@asaas.com
- Telefone: (11) 4950-5000
- Chat: Disponível no painel Asaas
