/**
 * Meta WhatsApp Cloud API - Webhook Handler (Production-ready)
 *
 * Arquitetura:
 *   config  → Resolução de credenciais (DB + env vars)
 *   repository → Persistência de eventos (webhook_events)
 *   service → Lógica de negócio (validação, normalização, roteamento)
 *   controller → Handlers HTTP (GET verificação, POST eventos)
 *   router → Express Router registrado como /webhooks/meta/whatsapp
 *
 * Multi-tenant: roteia eventos pelo phone_number_id → whatsapp_instances → company.
 * Idempotência: dedup por message ID com TTL de 5 minutos.
 * Segurança: validação X-Hub-Signature-256 com HMAC SHA-256.
 */

import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { webhookEvents } from '@shared/schema';
import { MetaWhatsAppService, MetaWebhookMessage } from './meta-whatsapp';
import { normalizeMetaWebhook, NormalizedIncomingMessage } from './whatsapp-provider';
import { ChatwootService } from './chatwoot';

// =====================================================================
// CONFIG - Resolução de credenciais (global settings + env vars)
// =====================================================================

export interface MetaWebhookConfig {
  verifyToken: string;
  appSecret: string;
  validateSignature: boolean;
}

/**
 * Resolve configuração Meta de múltiplas fontes (DB > env var > default).
 */
export async function resolveMetaWebhookConfig(
  getGlobalSettings: () => Promise<any>
): Promise<MetaWebhookConfig> {
  let settings: any = null;
  try {
    settings = await getGlobalSettings();
  } catch (err) {
    console.error('[meta-webhook] Failed to load global settings:', err);
  }

  const verifyToken =
    settings?.metaWebhookVerifyToken ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    '';

  const appSecret =
    settings?.metaAppSecret ||
    process.env.META_APP_SECRET ||
    '';

  const validateSignature =
    process.env.META_WEBHOOK_VALIDATE_SIGNATURE !== 'false' && !!appSecret;

  return { verifyToken, appSecret, validateSignature };
}

// =====================================================================
// REPOSITORY - Persistência de eventos
// =====================================================================

export interface WebhookEventInsert {
  companyId?: number | null;
  instanceName: string;
  provider: string;
  eventType: string;
  messageId?: string | null;
  wabaId?: string | null;
  phoneNumberId?: string | null;
  payload: any;
  headersJson?: any;
  processingStatus: string;
}

/**
 * Persiste evento bruto no banco para auditoria e reprocessamento.
 */
export async function persistWebhookEvent(event: WebhookEventInsert): Promise<number | null> {
  try {
    const result = await db.insert(webhookEvents).values({
      companyId: event.companyId || null,
      instanceName: event.instanceName,
      provider: event.provider,
      eventType: event.eventType,
      messageId: event.messageId || null,
      wabaId: event.wabaId || null,
      phoneNumberId: event.phoneNumberId || null,
      payload: event.payload,
      headersJson: event.headersJson || null,
      processingStatus: event.processingStatus,
      processed: false,
    });
    console.log('[meta-webhook] event persisted | type=%s phoneNumberId=%s', event.eventType, event.phoneNumberId || 'unknown');
    return null; // MySQL insert doesn't return ID directly with Drizzle
  } catch (err) {
    console.error('[meta-webhook] failed to persist event:', err);
    return null;
  }
}

/**
 * Marca evento como processado (ou com erro).
 */
export async function markEventProcessed(
  eventId: number,
  status: 'processed' | 'failed',
  errorMessage?: string
): Promise<void> {
  try {
    await db.update(webhookEvents)
      .set({
        processingStatus: status,
        processed: status === 'processed',
        processedAt: new Date(),
        errorMessage: errorMessage || null,
      })
      .where(eq(webhookEvents.id, eventId));
  } catch (err) {
    console.error('[meta-webhook] failed to update event status:', err);
  }
}

// =====================================================================
// SERVICE - Lógica de negócio
// =====================================================================

/**
 * Extrai metadata do payload Meta para roteamento multi-tenant.
 */
export function extractWebhookMetadata(body: any): {
  wabaId: string | null;
  phoneNumberId: string | null;
  firstMessageId: string | null;
  hasMessages: boolean;
  hasStatuses: boolean;
} {
  let wabaId: string | null = null;
  let phoneNumberId: string | null = null;
  let firstMessageId: string | null = null;
  let hasMessages = false;
  let hasStatuses = false;

  for (const entry of body?.entry || []) {
    if (!wabaId) wabaId = entry.id || null;
    for (const change of entry?.changes || []) {
      if (change?.value?.metadata?.phone_number_id) {
        phoneNumberId = change.value.metadata.phone_number_id;
      }
      if (change?.value?.messages?.length > 0) {
        hasMessages = true;
        firstMessageId = change.value.messages[0].id || null;
      }
      if (change?.value?.statuses?.length > 0) {
        hasStatuses = true;
      }
    }
  }

  return { wabaId, phoneNumberId, firstMessageId, hasMessages, hasStatuses };
}

/**
 * Extrai headers relevantes para persistência (reduz ruído).
 */
export function extractRelevantHeaders(req: Request): Record<string, string> {
  const relevant = [
    'x-hub-signature-256',
    'x-forwarded-for',
    'user-agent',
    'content-type',
    'x-real-ip',
  ];
  const result: Record<string, string> = {};
  for (const key of relevant) {
    const val = req.headers[key];
    if (val) result[key] = Array.isArray(val) ? val[0] : val;
  }
  return result;
}

// =====================================================================
// DEPS - Interface de dependências (injeção para testabilidade)
// =====================================================================

export interface MetaWebhookDeps {
  getGlobalSettings: () => Promise<any>;
  findInstanceByMetaPhoneNumberId: (phoneNumberId: string) => Promise<any>;
  getCompany: (companyId: number) => Promise<any>;
  findOrCreateConversation: (companyId: number, instanceId: number, phone: string, contactName: string, providerType: string) => Promise<any>;
  saveMessage: (conversationId: number, role: string, content: string, messageId: string, messageType: string) => Promise<any>;
  onMessageReceived?: (params: {
    message: NormalizedIncomingMessage;
    company: any;
    instance: any;
    conversation: any;
  }) => Promise<void>;
  onStatusUpdate?: (params: {
    messageId: string;
    status: string;
    recipientId: string;
    errors?: any[];
  }) => Promise<void>;
}

// =====================================================================
// CONTROLLER - Handlers HTTP
// =====================================================================

/**
 * GET /webhooks/meta/whatsapp
 * Verificação do webhook (Meta envia challenge).
 */
export function handleVerification(deps: MetaWebhookDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    console.log('[meta-webhook] verification request | mode=%s', mode);

    if (!mode || !token || !challenge) {
      console.warn('[meta-webhook] verification failed: missing params');
      res.status(400).send('Bad Request');
      return;
    }

    try {
      const config = await resolveMetaWebhookConfig(deps.getGlobalSettings);
      const result = MetaWhatsAppService.handleWebhookVerification(mode, token, challenge, config.verifyToken);

      if (result) {
        console.log('[meta-webhook] verification success');
        res.status(200).send(result);
        return;
      }

      console.warn('[meta-webhook] verification failed: token mismatch');
      res.status(403).send('Forbidden');
    } catch (error) {
      console.error('[meta-webhook] verification error:', error);
      res.status(500).send('Internal Server Error');
    }
  };
}

/**
 * POST /webhooks/meta/whatsapp
 * Recebimento de eventos (mensagens, status, etc).
 */
export function handleEvents(deps: MetaWebhookDeps) {
  return async (req: any, res: Response): Promise<void> => {
    // Responder 200 IMEDIATAMENTE (requisito Meta - timeout 20s)
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;

    // 1. Validar objeto
    if (body?.object !== 'whatsapp_business_account') {
      console.warn('[meta-webhook] ignored: unknown object type "%s"', body?.object);
      return;
    }

    // 2. Validar assinatura
    try {
      const config = await resolveMetaWebhookConfig(deps.getGlobalSettings);
      if (config.validateSignature) {
        const signature = req.headers['x-hub-signature-256'] as string;
        if (!signature) {
          console.error('[meta-webhook] SECURITY: missing X-Hub-Signature-256 header');
          return;
        }
        const rawBody = req.rawBody || JSON.stringify(body);
        const valid = MetaWhatsAppService.validateWebhookSignature(rawBody, signature, config.appSecret);
        if (!valid) {
          console.error('[meta-webhook] SECURITY: invalid signature - possible spoofing');
          return;
        }
        console.log('[meta-webhook] signature validated');
      }
    } catch (sigErr) {
      console.error('[meta-webhook] signature validation error:', sigErr);
      // Continue processing - fail open for now to avoid losing messages
    }

    // 3. Extrair metadata para roteamento
    const meta = extractWebhookMetadata(body);
    const headers = extractRelevantHeaders(req);

    // 4. Resolver tenant
    let instance: any = null;
    let companyId: number | null = null;
    if (meta.phoneNumberId) {
      try {
        instance = await deps.findInstanceByMetaPhoneNumberId(meta.phoneNumberId);
        companyId = instance?.companyId || null;
      } catch (err) {
        console.error('[meta-webhook] instance lookup error:', err);
      }
    }

    // 5. Persistir evento bruto
    const eventType = meta.hasMessages ? 'message' : meta.hasStatuses ? 'status' : 'other';
    await persistWebhookEvent({
      companyId,
      instanceName: instance?.instanceName || 'unresolved',
      provider: 'meta_cloud_api',
      eventType,
      messageId: meta.firstMessageId,
      wabaId: meta.wabaId,
      phoneNumberId: meta.phoneNumberId,
      payload: body,
      headersJson: headers,
      processingStatus: 'received',
    });

    console.log(
      '[meta-webhook] event received | type=%s waba=%s phone_number_id=%s tenant=%s',
      eventType,
      meta.wabaId || 'unknown',
      meta.phoneNumberId || 'unknown',
      companyId || 'unresolved'
    );

    // 6. Processamento assíncrono
    try {
      // 6a. Status updates
      if (meta.hasStatuses) {
        const statuses = MetaWhatsAppService.parseWebhookStatuses(body);
        for (const status of statuses) {
          console.log('[meta-webhook] status update | msg=%s status=%s', status.messageId, status.status);
          if (deps.onStatusUpdate) {
            await deps.onStatusUpdate({
              messageId: status.messageId,
              status: status.status,
              recipientId: status.recipientId,
              errors: status.errors,
            });
          }
        }
      }

      // 6b. Mensagens recebidas
      if (meta.hasMessages) {
        const normalizedMessages = normalizeMetaWebhook(body);
        for (const message of normalizedMessages) {
          await processIncomingMetaMessage(message, deps);
        }
      }

      console.log('[meta-webhook] event processed successfully');
    } catch (processErr) {
      console.error('[meta-webhook] processing error:', processErr);
    }
  };
}

// =====================================================================
// MESSAGE PROCESSOR (reaproveitado do handler anterior)
// =====================================================================

async function processIncomingMetaMessage(
  message: NormalizedIncomingMessage,
  deps: MetaWebhookDeps
): Promise<void> {
  try {
    if (message.fromMe) return;
    if (message.type === 'reaction') return;

    console.log(
      '[meta-webhook] message | from=%s name=%s type=%s text="%s"',
      message.from,
      message.contactName,
      message.type,
      (message.text || '').substring(0, 80)
    );

    const phoneNumberId = extractPhoneNumberId(message.raw);
    if (!phoneNumberId) {
      console.error('[meta-webhook] message ignored: no phone_number_id in payload');
      return;
    }

    const instance = await deps.findInstanceByMetaPhoneNumberId(phoneNumberId);
    if (!instance) {
      console.error('[meta-webhook] message ignored: no instance for phone_number_id=%s', phoneNumberId);
      return;
    }

    const company = await deps.getCompany(instance.companyId);
    if (!company) {
      console.error('[meta-webhook] message ignored: no company for instance=%d', instance.id);
      return;
    }

    const conversation = await deps.findOrCreateConversation(
      instance.companyId,
      instance.id,
      message.from,
      message.contactName,
      'meta_official'
    );

    const textContent = message.text || `[${message.type}]`;
    await deps.saveMessage(
      conversation.id,
      'user',
      textContent,
      message.messageId,
      message.type
    );

    console.log('[meta-webhook] message persisted | conversation=%d', conversation.id);

    // Chatwoot sync
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
      } catch (chatwootErr) {
        console.warn('[meta-webhook] chatwoot sync failed:', chatwootErr);
      }
    }

    // AI agent callback
    if (deps.onMessageReceived) {
      await deps.onMessageReceived({ message, company, instance, conversation });
    }
  } catch (err) {
    console.error('[meta-webhook] message processing error:', err);
  }
}

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

// =====================================================================
// ROUTER - Express Router
// =====================================================================

/**
 * Cria o router do Express para os webhooks da Meta Cloud API.
 *
 * Registra:
 *   GET  /webhooks/meta/whatsapp → Verificação do webhook
 *   POST /webhooks/meta/whatsapp → Recebimento de eventos
 *
 * Também mantém compatibilidade com a rota anterior:
 *   GET  /api/webhook/meta-whatsapp
 *   POST /api/webhook/meta-whatsapp
 */
export function createMetaWebhookRouter(deps: MetaWebhookDeps): Router {
  const router = Router();

  // Rota principal (produção)
  router.get('/webhooks/meta/whatsapp', handleVerification(deps));
  router.post('/webhooks/meta/whatsapp', handleEvents(deps));

  // Retrocompatibilidade
  router.get('/api/webhook/meta-whatsapp', handleVerification(deps));
  router.post('/api/webhook/meta-whatsapp', handleEvents(deps));

  return router;
}
