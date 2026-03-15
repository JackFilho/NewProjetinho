# Guia Completo: Tornando-se um Meta Tech Provider (BSP) para WhatsApp

## Sumário

1. [O que é um Tech Provider / BSP](#1-o-que-é-um-tech-provider--bsp)
2. [Requisitos para se tornar Tech Provider](#2-requisitos-para-se-tornar-tech-provider)
3. [Passo a Passo do Processo](#3-passo-a-passo-do-processo)
4. [Configuração Técnica do Sistema](#4-configuração-técnica-do-sistema)
5. [Integração com Chatwoot](#5-integração-com-chatwoot)
6. [Webhook e Endpoints](#6-webhook-e-endpoints)
7. [Templates de Mensagem](#7-templates-de-mensagem)
8. [Precificação e Modelo de Negócio](#8-precificação-e-modelo-de-negócio)
9. [Compliance e Políticas](#9-compliance-e-políticas)
10. [FAQ](#10-faq)

---

## 1. O que é um Tech Provider / BSP

### Definição
Um **Tech Provider** (anteriormente chamado de BSP - Business Solution Provider) é uma empresa autorizada pela Meta para fornecer acesso à **WhatsApp Business Platform** (Cloud API) para outras empresas.

### Benefícios
- **API Oficial**: Acesso direto à API Cloud da Meta
- **Escalabilidade**: Envio de milhares de mensagens por segundo
- **Confiabilidade**: SLA da Meta, sem risco de banimento por uso não-oficial
- **Templates**: Capacidade de enviar mensagens proativas (fora da janela de 24h)
- **Receita**: Possibilidade de cobrar dos clientes pelo uso da API
- **Badge Verificado**: Selo verde no WhatsApp para clientes verificados

### Diferença entre Tech Provider e uso direto da Cloud API
| Aspecto | Uso Direto | Tech Provider |
|---------|-----------|---------------|
| Quem usa | Sua empresa apenas | Seus clientes (multi-tenant) |
| Gestão de números | Seu número apenas | Números dos seus clientes |
| Billing | Você paga Meta | Você gerencia billing para clientes |
| Onboarding | Manual por empresa | Embedded Signup (automático) |
| Escala | Limitada | Enterprise |

---

## 2. Requisitos para se tornar Tech Provider

### Requisitos Técnicos
- [ ] Empresa registrada com CNPJ ativo
- [ ] Website profissional com informações da empresa
- [ ] Infraestrutura técnica para hospedar a API
- [ ] Equipe técnica para manutenção e suporte
- [ ] Capacidade de processar webhooks em tempo real
- [ ] SSL/HTTPS obrigatório em todos os endpoints

### Requisitos Legais e de Negócio
- [ ] Política de Privacidade publicada
- [ ] Termos de Serviço publicados
- [ ] Conformidade com LGPD (Lei Geral de Proteção de Dados)
- [ ] Conta no Meta Business Manager verificada
- [ ] Pelo menos 1 app aprovado no Meta Developer Portal

### Requisitos Financeiros
- [ ] Capacidade de gerenciar billing (créditos WhatsApp)
- [ ] Conta de pagamento configurada no Meta Business Manager
- [ ] Capital para adiantamento de créditos (dependendo do modelo)

---

## 3. Passo a Passo do Processo

### Fase 1: Preparação (1-2 semanas)

#### 1.1 Criar conta no Meta Business Manager
1. Acesse [business.facebook.com](https://business.facebook.com)
2. Crie uma conta com os dados da sua empresa
3. Verifique sua empresa (enviar documentos):
   - Contrato Social / CNPJ
   - Comprovante de endereço
   - Documento do representante legal

#### 1.2 Criar App no Meta Developer Portal
1. Acesse [developers.facebook.com](https://developers.facebook.com)
2. Crie um novo App → Tipo: **Business**
3. Adicione o produto **WhatsApp** ao app
4. Anote:
   - **App ID**: `META_APP_ID`
   - **App Secret**: `META_APP_SECRET`

#### 1.3 Configurar número de teste
1. No dashboard do WhatsApp, use o número de teste fornecido
2. Configure um número de teste para receber mensagens
3. Gere um **Access Token temporário** para testes

### Fase 2: Aplicação como Tech Provider (2-4 semanas)

#### 2.1 Solicitar acesso ao programa Tech Provider
1. Acesse o [Meta Partner Directory](https://www.facebook.com/business/partner-directory)
2. Ou aplique diretamente via o formulário de Tech Provider
3. Preencha informações sobre:
   - Sua empresa e modelo de negócio
   - Caso de uso do WhatsApp
   - Estimativa de volume de mensagens
   - Infraestrutura técnica

#### 2.2 Aguardar aprovação
- A Meta revisa a aplicação (pode levar 2-4 semanas)
- Podem solicitar informações adicionais
- Após aprovação, você recebe acesso ao **Embedded Signup**

### Fase 3: Implementação Técnica (2-4 semanas)

#### 3.1 Configurar System User
1. No Business Manager → Configurações → System Users
2. Crie um System User com permissão de **Admin**
3. Gere um **System User Access Token** (permanente)
4. Atribua as permissões:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
   - `business_management`

#### 3.2 Configurar Webhooks
1. No App → WhatsApp → Configuração
2. Configure o webhook URL: `https://seudominio.com/api/webhook/meta-whatsapp`
3. Configure o Verify Token (o mesmo em `META_WEBHOOK_VERIFY_TOKEN`)
4. Inscreva-se nos campos:
   - `messages` (mensagens recebidas e status)

#### 3.3 Implementar Embedded Signup (para onboarding de clientes)
1. Integre o fluxo de Embedded Signup no frontend
2. Quando um cliente se cadastra, ele autoriza seu app a gerenciar o WhatsApp dele
3. Você recebe o `phone_number_id` e `waba_id` do cliente

### Fase 4: Go-Live e Operação

#### 4.1 Solicitar verificação do App
1. No App Dashboard → Revisão do App
2. Solicite permissões de produção:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
3. Aguarde aprovação (1-5 dias úteis)

#### 4.2 Migrar para produção
1. Troque tokens temporários por System User Token permanente
2. Configure billing no Business Manager
3. Registre números de telefone dos clientes

---

## 4. Configuração Técnica do Sistema

### 4.1 Variáveis de Ambiente

Adicione ao seu `.env`:

```env
# === Meta WhatsApp Cloud API ===
META_APP_ID=seu_app_id
META_APP_SECRET=seu_app_secret
META_WEBHOOK_VERIFY_TOKEN=um_token_secreto_qualquer

# === Chatwoot ===
CHATWOOT_BASE_URL=https://seu-chatwoot.com
CHATWOOT_API_TOKEN=seu_token_chatwoot
CHATWOOT_ACCOUNT_ID=1
```

### 4.2 Configuração no Painel Admin

No painel de administração do sistema:

1. **Configurações Globais** → Meta WhatsApp:
   - App ID
   - App Secret
   - Webhook Verify Token
   - Business Manager ID

2. **Configurações Globais** → Chatwoot:
   - URL do Chatwoot
   - API Token
   - Account ID

### 4.3 Configuração por Empresa (Cliente)

Para cada empresa/cliente que usar a API oficial:

1. Na tela de **WhatsApp** da empresa:
   - Selecionar provider: "Meta Oficial"
   - Phone Number ID (obtido via Embedded Signup ou manual)
   - WABA ID
   - Access Token (System User Token com permissão para o WABA)

2. Na tela de **Chatwoot** da empresa:
   - Habilitar integração Chatwoot
   - Configurar Inbox ID (criado automaticamente ou manualmente)

### 4.4 Arquitetura dos Arquivos

```
server/services/
├── meta-whatsapp.ts          # Serviço da API Cloud da Meta
├── meta-webhook-handler.ts   # Handler de webhooks da Meta
├── whatsapp-provider.ts      # Provider e interface unificada
└── chatwoot.ts               # Integração com Chatwoot
```

### 4.5 Fluxo de Mensagens

```
CLIENTE ENVIA MENSAGEM NO WHATSAPP
         │
         ▼
Meta Cloud API recebe a mensagem
         │
         ▼
Meta envia webhook → POST /api/webhook/meta-whatsapp
         │
         ▼
meta-webhook-handler.ts processa:
  1. Normaliza mensagem (normalizeMetaWebhook)
  2. Identifica instância pelo phoneNumberId
  3. Busca/cria conversa
  4. Salva mensagem no banco
  5. Sincroniza com Chatwoot (se habilitado)
  6. Envia para processamento de AI
         │
         ▼
AI Agent processa e responde
         │
         ▼
whatsapp-provider.ts → MetaOfficialProvider.sendText()
         │
         ▼
meta-whatsapp.ts → POST graph.facebook.com/{phoneNumberId}/messages
         │
         ▼
CLIENTE RECEBE RESPOSTA NO WHATSAPP


AGENTE HUMANO RESPONDE VIA CHATWOOT
         │
         ▼
Chatwoot envia webhook → POST /api/webhook/chatwoot
         │
         ▼
Sistema detecta mensagem outgoing do agente
         │
         ▼
Ativa takeoverMode = 'human' (pausa AI)
         │
         ▼
whatsapp-provider.ts → MetaOfficialProvider.sendText()
         │
         ▼
Mensagem enviada ao cliente via Meta API
```

---

## 5. Integração com Chatwoot

### 5.1 O que é o Chatwoot
O [Chatwoot](https://www.chatwoot.com/) é uma plataforma open-source de atendimento ao cliente que suporta múltiplos canais (WhatsApp, email, chat web, etc.).

### 5.2 Opções de Deploy

| Opção | Custo | Controle | Recomendação |
|-------|-------|----------|-------------|
| **Chatwoot Cloud** | A partir de $19/agente/mês | Baixo | Para começar rápido |
| **Self-hosted (VPS)** | ~$20-50/mês servidor | Total | Para produção |
| **Self-hosted (Docker)** | ~$20-50/mês servidor | Total | Recomendado |

### 5.3 Setup do Chatwoot (Self-hosted com Docker)

```bash
# 1. Clone o repositório
git clone https://github.com/chatwoot/chatwoot.git
cd chatwoot

# 2. Copie o arquivo de ambiente
cp .env.example .env

# 3. Configure variáveis essenciais no .env
# FRONTEND_URL=https://chatwoot.seudominio.com
# SECRET_KEY_BASE=gere_uma_chave_secreta

# 4. Inicie com Docker Compose
docker compose up -d
```

### 5.4 Configuração da Integração

1. **No Chatwoot:**
   - Crie uma **Inbox** do tipo "API" para cada empresa
   - Anote o `inbox_id`
   - Gere um **Access Token** em Configurações → Integrações

2. **No Sistema:**
   - Habilite Chatwoot na empresa
   - Configure URL, Token e Account ID
   - Configure o Inbox ID

3. **Webhook do Chatwoot para o Sistema:**
   - No Chatwoot → Configurações → Integrações → Webhooks
   - URL: `https://seudominio.com/api/webhook/chatwoot`
   - Eventos: `message_created`, `conversation_updated`

### 5.5 Funcionalidades da Integração

- **Sincronização bidirecional**: Mensagens do WhatsApp aparecem no Chatwoot e vice-versa
- **Human Takeover**: Quando agente responde no Chatwoot, AI é pausada
- **Label "humano"**: Adicionar label "humano" bloqueia AI permanentemente
- **Retorno automático**: Após timeout de inatividade, AI retoma

---

## 6. Arquitetura da API Oficial Meta

O sistema utiliza **exclusivamente** a API oficial da Meta (WhatsApp Cloud API).

### 6.1 Como funciona

- Campo `provider_type` na tabela `whatsapp_instances` é sempre `meta_official`
- A camada `whatsapp-provider.ts` abstrai o acesso à API
- Webhooks: `POST /api/webhook/meta-whatsapp`

### 6.2 Vantagens da API Oficial

| Funcionalidade | Meta API |
|---------------|----------|
| Autenticação | Via Business Manager (sem QR Code) |
| Mensagens proativas | Via templates aprovados |
| Janela de 24h | Obrigatória para mensagens livres |
| Custo por mensagem | Meta cobra por conversa |
| Risco de ban | Muito baixo |
| Velocidade | Alta (tier-based) |
| Suporte | Meta (documentação oficial) |

---

## 7. Templates de Mensagem

### 7.1 O que são Templates

Na API oficial da Meta, para enviar mensagens **fora da janela de 24 horas** é necessário usar templates pré-aprovados.

### 7.2 Categorias de Templates

- **UTILITY**: Confirmações, lembretes, atualizações (mais baratos)
- **MARKETING**: Promoções, campanhas, newsletters (mais caros)
- **AUTHENTICATION**: Códigos OTP, verificação

### 7.3 Exemplos de Templates para o Sistema

#### Template: Lembrete de Agendamento (UTILITY)
```
Nome: appointment_reminder
Idioma: pt_BR
Categoria: UTILITY
Body: Olá {{1}}! 📅 Lembrete do seu agendamento:
      📋 Serviço: {{2}}
      👤 Profissional: {{3}}
      📅 Data: {{4}}
      ⏰ Horário: {{5}}
      Para confirmar, responda com SIM.
```

#### Template: Convite de Avaliação (UTILITY)
```
Nome: review_invitation
Idioma: pt_BR
Categoria: UTILITY
Body: Olá {{1}}! Esperamos que tenha gostado do atendimento com {{2}}.
      Que tal nos avaliar? Sua opinião é muito importante!
      {{3}}
```

#### Template: Mensagem de Aniversário (MARKETING)
```
Nome: birthday_greeting
Idioma: pt_BR
Categoria: MARKETING
Body: 🎉 Parabéns, {{1}}! 🎂
      {{2}} deseja a você um feliz aniversário!
      {{3}}
```

### 7.4 Custos por Conversa (referência 2024/2025 Brasil)

| Categoria | Custo por conversa |
|-----------|-------------------|
| Utility | ~R$ 0,15 |
| Marketing | ~R$ 0,50 |
| Authentication | ~R$ 0,15 |
| Service (iniciada pelo cliente) | Gratuita (primeiras 1000/mês) |

> Valores aproximados. Consulte a [página oficial de preços da Meta](https://developers.facebook.com/docs/whatsapp/pricing).

---

## 8. Precificação e Modelo de Negócio

### 8.1 Modelos de Monetização

#### Modelo 1: Markup por Conversa
- Cobra do cliente um markup sobre o custo da Meta
- Ex: Meta cobra R$ 0,15 → você cobra R$ 0,25
- **Margem**: ~40-60%

#### Modelo 2: Plano Fixo + Excedente
- Plano mensal inclui X conversas
- Excedente cobrado por conversa
- Ex: R$ 199/mês inclui 500 conversas, excedente R$ 0,30/cada

#### Modelo 3: SaaS Puro (recomendado para início)
- Valor mensal fixo por funcionalidades
- Custo das conversas é repassado ou incluso
- Mais simples de gerenciar

### 8.2 Sugestão de Planos

| Plano | Preço | Conversas/mês | Funcionalidades |
|-------|-------|--------------|-----------------|
| Starter | R$ 149/mês | 300 | Agendamento + AI básico |
| Professional | R$ 299/mês | 1.000 | + Campanhas + Chatwoot |
| Enterprise | R$ 599/mês | 5.000 | + Multi-profissional + API |

---

## 9. Compliance e Políticas

### 9.1 Política de Opt-in da Meta
- **Obrigatório**: Cliente deve dar consentimento explícito para receber mensagens
- O opt-in deve ser claro sobre quais tipos de mensagens receberá
- Deve haver opção de opt-out (parar de receber)

### 9.2 LGPD
- Armazenar dados pessoais com consentimento
- Permitir exclusão de dados (direito ao esquecimento)
- Documentar base legal para processamento de dados
- Ter DPO (Data Protection Officer) designado

### 9.3 Regras da Meta para Mensagens
- **Não enviar spam**: Mensagens devem ser relevantes e solicitadas
- **Respeitar janela de 24h**: Fora dela, apenas templates
- **Não compartilhar dados**: Dados dos clientes não devem ser compartilhados
- **Quality Rating**: Manter qualidade GREEN (evitar bloqueios)

### 9.4 Termos obrigatórios para seus clientes
1. Política de Privacidade do seu SaaS
2. Termos de Uso do serviço de WhatsApp
3. Política de Mensagens (frequência, tipos, opt-out)
4. Contrato de Prestação de Serviços (SLA, responsabilidades)

---

## 10. FAQ

### Quanto tempo leva para ser aprovado como Tech Provider?
Geralmente 2-6 semanas após submissão completa da documentação.

### Preciso de um número de telefone dedicado?
Cada cliente precisa do seu próprio número. O número é registrado na plataforma Meta e não pode ser usado no WhatsApp normal simultaneamente.

### Preciso migrar de outra API?
O sistema foi projetado para usar exclusivamente a API oficial da Meta. Caso esteja migrando de outra solução, basta configurar as credenciais Meta nas instâncias WhatsApp.

### Quanto custa ser Tech Provider?
Não há custo fixo para ser Tech Provider. Você paga apenas pelas conversas dos seus clientes (custo Meta) + custos de infraestrutura.

### O Chatwoot é obrigatório?
Não. O Chatwoot é opcional e pode ser habilitado por empresa. Sem ele, o sistema funciona apenas com AI + WhatsApp.

### Posso usar Chatwoot Cloud em vez de self-hosted?
Sim. Basta configurar a URL do Chatwoot Cloud e o API Token.

### O que acontece se meu Quality Rating cair?
- **GREEN**: Tudo normal
- **YELLOW**: Aviso, pode ter limite reduzido
- **RED**: Limite severamente reduzido, risco de bloqueio
- Mantenha qualidade monitorando opt-outs e denúncias

### Como funciona o billing da Meta?
A Meta cobra por "conversa" (janela de 24h), não por mensagem individual. Você configura uma forma de pagamento no Business Manager e é cobrado mensalmente.

---

## Próximos Passos

1. [ ] Criar conta no Meta Business Manager
2. [ ] Verificar sua empresa
3. [ ] Criar App no Developer Portal
4. [ ] Configurar número de teste
5. [ ] Aplicar para Tech Provider
6. [ ] Configurar Chatwoot (se desejado)
7. [ ] Testar integração em ambiente de desenvolvimento
8. [ ] Migrar primeiro cliente para Meta API
9. [ ] Documentar processos de onboarding
10. [ ] Definir precificação

---

## Links Úteis

- [Meta Business Manager](https://business.facebook.com)
- [Meta Developer Portal](https://developers.facebook.com)
- [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [WhatsApp Pricing](https://developers.facebook.com/docs/whatsapp/pricing)
- [Chatwoot Docs](https://www.chatwoot.com/docs)
- [Chatwoot API Reference](https://www.chatwoot.com/developers/api/)
- [LGPD - Lei 13.709](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
