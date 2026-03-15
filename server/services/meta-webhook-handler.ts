/**
 * Meta WhatsApp Cloud API - Webhook Handler
 *
 * Handlers para processar webhooks da API oficial da Meta.
 * Inclui:
 * - Verificação de webhook (GET challenge)
 * - Processamento de mensagens recebidas
 * - Status de entrega de mensagens
 * - Integração com Chatwoot
 *
 * Este módulo é registrado como rotas no Express.
 */

import { Router, Request, Response } from 'express';
import { MetaWhatsAppService, MetaWebhookMessage } from './meta-whatsapp';
import { normalizeMetaWebhook, NormalizedIncomingMessage } from './whatsapp-provider';
import { ChatwootService } from './chatwoot';

export interface MetaWebhookDeps {
  /** Função para buscar configurações globais */
  getGlobalSettings: () => Promise<any>;
  /** Função para buscar instância por phoneNumberId */
  findInstanceByMetaPhoneNumberId: (phoneNumberId: string) => Promise<any>;
  /** Função para buscar empresa por ID */
  getCompany: (companyId: number) => Promise<any>;
  /** Função para buscar ou criar conversa */
  findOrCreateConversation: (companyId: number, instanceId: number, phone: string, contactName: string, providerType: string) => Promise<any>;
  /** Função para salvar mensagem */
  saveMessage: (conversationId: number, role: string, content: string, messageId: string, messageType: string) => Promise<any>;
  /** Função de callback para processar mensagem (AI agent, etc.) */
  onMessageReceived?: (params: {
    message: NormalizedIncomingMessage;
    company: any;
    instance: any;
    conversation: any;
  }) => Promise<void>;
  /** Callback para status updates */
  onStatusUpdate?: (params: {
    messageId: string;
    status: string;
    recipientId: string;
    errors?: any[];
  }) => Promise<void>;
}

/**
 * Cria o router do Express para os webhooks da Meta Cloud API.
 * Registra dois endpoints:
 * - GET /api/webhook/meta-whatsapp  → Verificação do webhook
 * - POST /api/webhook/meta-whatsapp → Recebimento de eventos
 */
export function createMetaWebhookRouter(deps: MetaWebhookDeps): Router {
  const router = Router();

  // ===== Webhook Verification (GET) =====
  // A Meta envia um GET request para verificar o endpoint
  router.get('/api/webhook/meta-whatsapp', async (req: Request, res: Response) => {
    try {
      const mode = req.query['hub.mode'] as string;
      const token = req.query['hub.verify_token'] as string;
      const challenge = req.query['hub.challenge'] as string;

      console.log('🔔 Meta Webhook Verification Request');
      console.log('📋 Mode:', mode);

      const settings = await deps.getGlobalSettings();
      const verifyToken = settings?.metaWebhookVerifyToken || process.env.META_WEBHOOK_VERIFY_TOKEN || '';

      const result = MetaWhatsAppService.handleWebhookVerification(mode, token, challenge, verifyToken);

      if (result) {
        console.log('✅ Meta Webhook verificado com sucesso');
        return res.status(200).send(result);
      }

      console.error('❌ Meta Webhook verification failed');
      return res.status(403).send('Forbidden');
    } catch (error) {
      console.error('❌ Erro na verificação de webhook Meta:', error);
      return res.status(500).send('Internal Server Error');
    }
  });

  // ===== Webhook Events (POST) =====
  router.post('/api/webhook/meta-whatsapp', async (req: Request, res: Response) => {
    try {
      const body = req.body as MetaWebhookMessage;

      // Responder imediatamente com 200 (requisito da Meta)
      res.status(200).send('EVENT_RECEIVED');

      // Validar que é um evento WhatsApp
      if (body.object !== 'whatsapp_business_account') {
        console.warn('⚠️ Meta Webhook: objeto não reconhecido:', body.object);
        return;
      }

      console.log('🔔 Meta WhatsApp webhook received');

      // Processar mensagens
      const normalizedMessages = normalizeMetaWebhook(body);
      for (const message of normalizedMessages) {
        await processIncomingMetaMessage(message, deps);
      }

      // Processar status updates (sent, delivered, read, failed)
      const statuses = MetaWhatsAppService.parseWebhookStatuses(body);
      for (const status of statuses) {
        console.log(`📊 Message status: ${status.messageId} → ${status.status}`);
        if (deps.onStatusUpdate) {
          await deps.onStatusUpdate({
            messageId: status.messageId,
            status: status.status,
            recipientId: status.recipientId,
            errors: status.errors,
          });
        }
      }
    } catch (error) {
      console.error('❌ Erro ao processar webhook Meta:', error);
    }
  });

  return router;
}

/**
 * Processa uma mensagem recebida normalizada da Meta Cloud API.
 */
async function processIncomingMetaMessage(
  message: NormalizedIncomingMessage,
  deps: MetaWebhookDeps
): Promise<void> {
  try {
    // Ignorar mensagens do próprio bot
    if (message.fromMe) return;

    // Ignorar reações
    if (message.type === 'reaction') return;

    console.log('📨 Meta mensagem recebida:');
    console.log('  📞 De:', message.from);
    console.log('  👤 Nome:', message.contactName);
    console.log('  📝 Tipo:', message.type);
    console.log('  💬 Texto:', (message.text || '').substring(0, 100));

    // Buscar Phone Number ID a partir do payload raw
    const phoneNumberId = extractPhoneNumberId(message.raw);
    if (!phoneNumberId) {
      console.error('❌ Phone Number ID não encontrado no webhook');
      return;
    }

    // Buscar instância pelo Phone Number ID
    const instance = await deps.findInstanceByMetaPhoneNumberId(phoneNumberId);
    if (!instance) {
      console.error('❌ Instância não encontrada para Phone Number ID:', phoneNumberId);
      return;
    }

    // Buscar empresa
    const company = await deps.getCompany(instance.companyId);
    if (!company) {
      console.error('❌ Empresa não encontrada para instância:', instance.id);
      return;
    }

    // Buscar ou criar conversa
    const conversation = await deps.findOrCreateConversation(
      instance.companyId,
      instance.id,
      message.from,
      message.contactName,
      'meta_official'
    );

    // Salvar mensagem
    const textContent = message.text || `[${message.type}]`;
    await deps.saveMessage(
      conversation.id,
      'user',
      textContent,
      message.messageId,
      message.type
    );

    // Sincronizar com Chatwoot se habilitado
    if (company.chatwootEnabled && company.chatwootBaseUrl && company.chatwootApiToken) {
      try {
        const chatwoot = new ChatwootService({
          baseUrl: company.chatwootBaseUrl,
          apiAccessToken: company.chatwootApiToken,
          accountId: company.chatwootAccountId,
          inboxId: company.chatwootInboxId,
        });

        await chatwoot.syncIncomingMessage(
          message.from,
          message.contactName,
          textContent,
          company.chatwootInboxId
        );
        console.log('✅ Mensagem sincronizada com Chatwoot');
      } catch (chatwootError) {
        console.warn('⚠️ Erro ao sincronizar com Chatwoot:', chatwootError);
      }
    }

    // Callback para processamento adicional (AI agent, etc.)
    if (deps.onMessageReceived) {
      await deps.onMessageReceived({
        message,
        company,
        instance,
        conversation,
      });
    }
  } catch (error) {
    console.error('❌ Erro ao processar mensagem Meta:', error);
  }
}

/**
 * Extrai o Phone Number ID do payload raw do webhook da Meta.
 */
function extractPhoneNumberId(rawPayload: any): string | null {
  try {
    for (const entry of rawPayload?.entry || []) {
      for (const change of entry?.changes || []) {
        if (change?.value?.metadata?.phone_number_id) {
          return change.value.metadata.phone_number_id;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}
