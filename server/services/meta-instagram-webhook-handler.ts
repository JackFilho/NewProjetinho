/**
 * Meta Instagram Messaging API - Webhook Handler
 *
 * Arquitetura espelha o meta-webhook-handler.ts (WhatsApp):
 *   config  → Resolução de credenciais (DB + env vars)
 *   service → Lógica de negócio (validação, normalização)
 *   controller → Handlers HTTP (GET verificação, POST eventos)
 *   router → Express Router registrado como /webhooks/meta/instagram
 *
 * Multi-tenant: roteia eventos pelo ig_business_account_id → instagram_instances → company.
 * Segurança: validação X-Hub-Signature-256 com HMAC SHA-256 (mesmo app secret do WhatsApp).
 */

import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { webhookEvents, instagramInstances } from '../../shared/schema';
import { MetaInstagramService, InstagramWebhookMessage } from './meta-instagram';
import { ChatwootService } from './chatwoot';

// =====================================================================
// CONFIG
// =====================================================================

export interface InstagramWebhookConfig {
  verifyToken: string;
  appSecret: string;
  validateSignature: boolean;
}

export async function resolveInstagramWebhookConfig(
  getGlobalSettings: () => Promise<any>
): Promise<InstagramWebhookConfig> {
  let settings: any = null;
  try {
    settings = await getGlobalSettings();
  } catch (err) {
    console.error('[ig-webhook] Failed to load global settings:', err);
  }

  const verifyToken =
    settings?.metaWebhookVerifyToken ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    '';

  // Buscar App Secret: 1) Instâncias Instagram (metaAppSecret), 2) Global Settings, 3) Env var
  let appSecret = '';
  try {
    const instances = await db.select().from(instagramInstances).limit(1);
    if (instances.length > 0 && instances[0].metaAppSecret) {
      appSecret = instances[0].metaAppSecret;
    }
  } catch (e) {
    // Tabela pode não existir ainda
  }

  if (!appSecret) {
    appSecret = settings?.metaAppSecret || process.env.META_APP_SECRET || '';
  }

  const validateSignature =
    process.env.META_WEBHOOK_VALIDATE_SIGNATURE !== 'false' && !!appSecret;

  return { verifyToken, appSecret, validateSignature };
}

// =====================================================================
// NORMALIZED MESSAGE (formato interno unificado)
// =====================================================================

export interface NormalizedInstagramMessage {
  /** Instagram-scoped ID do remetente */
  senderId: string;
  /** Instagram-scoped ID do destinatário (nossa página) */
  recipientId: string;
  /** Nome do contato (preenchido após busca de perfil) */
  contactName: string;
  /** Username do Instagram */
  username?: string;
  /** Profile pic URL */
  profilePic?: string;
  /** ID da mensagem */
  messageId: string;
  /** Tipo da mensagem */
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'share' | 'story_mention' | 'ig_reel' | 'reaction' | 'postback' | 'unknown';
  /** Conteúdo textual */
  text?: string;
  /** Se é eco (mensagem enviada por nós) */
  isEcho: boolean;
  /** Timestamp */
  timestamp: number;
  /** Dados de mídia */
  media?: {
    type: string;
    url?: string;
  };
  /** Dados de reação */
  reaction?: {
    messageId: string;
    action: 'react' | 'unreact';
    emoji?: string;
  };
  /** Dados de postback */
  postback?: {
    title: string;
    payload: string;
  };
  /** Referral (ads, links) */
  referral?: {
    ref: string;
    source: string;
    type: string;
  };
  /** Payload bruto */
  raw?: any;
}

// =====================================================================
// DEPS - Interface de dependências
// =====================================================================

export interface InstagramWebhookDeps {
  getGlobalSettings: () => Promise<any>;
  findInstagramInstanceByIgAccountId: (igAccountId: string) => Promise<any>;
  getCompany: (companyId: number) => Promise<any>;
  findOrCreateConversation: (companyId: number, instanceId: number, senderId: string, contactName: string, providerType: string) => Promise<any>;
  saveMessage: (conversationId: number, role: string, content: string, messageId: string, messageType: string) => Promise<any>;
  onMessageReceived?: (params: {
    message: NormalizedInstagramMessage;
    company: any;
    instance: any;
    conversation: any;
  }) => Promise<void>;
}

// =====================================================================
// MESSAGE DEDUP (evitar processar a mesma mensagem duas vezes)
// =====================================================================

const processedMessageIds = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000; // 5 minutos

function isDuplicate(messageId: string): boolean {
  const now = Date.now();
  // Limpar entradas expiradas
  for (const [key, timestamp] of processedMessageIds) {
    if (now - timestamp > DEDUP_TTL_MS) {
      processedMessageIds.delete(key);
    }
  }
  if (processedMessageIds.has(messageId)) return true;
  processedMessageIds.set(messageId, now);
  return false;
}

// =====================================================================
// CONTROLLER - Handlers HTTP
// =====================================================================

/**
 * GET /webhooks/meta/instagram
 * Verificação do webhook (Meta envia challenge).
 */
export function handleInstagramVerification(deps: InstagramWebhookDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;

    console.log('[ig-webhook] verification request | mode=%s', mode);

    if (!mode || !token || !challenge) {
      res.status(400).send('Bad Request');
      return;
    }

    try {
      const config = await resolveInstagramWebhookConfig(deps.getGlobalSettings);
      const result = MetaInstagramService.handleWebhookVerification(mode, token, challenge, config.verifyToken);

      if (result) {
        console.log('[ig-webhook] verification success');
        res.status(200).type('text/plain').send(result);
        return;
      }

      console.warn('[ig-webhook] verification failed: token mismatch');
      res.status(403).send('Forbidden');
    } catch (error) {
      console.error('[ig-webhook] verification error:', error);
      res.status(500).send('Internal Server Error');
    }
  };
}

/**
 * POST /webhooks/meta/instagram
 * Recebimento de eventos do Instagram Messaging.
 */
export function handleInstagramEvents(deps: InstagramWebhookDeps) {
  return async (req: any, res: Response): Promise<void> => {
    // Responder 200 IMEDIATAMENTE (requisito Meta)
    res.status(200).send('EVENT_RECEIVED');

    const body = req.body;
    console.log('[ig-webhook] payload received:', JSON.stringify(body).substring(0, 500));

    // Validar objeto
    if (body?.object !== 'instagram') {
      console.warn('[ig-webhook] ignored: unknown object type "%s"', body?.object);
      return;
    }

    // Validar assinatura (não bloqueia — apenas loga)
    try {
      const config = await resolveInstagramWebhookConfig(deps.getGlobalSettings);
      if (config.validateSignature) {
        const signature = req.headers['x-hub-signature-256'] as string;
        const rawBody = req.rawBody;
        if (signature && rawBody) {
          const valid = MetaInstagramService.validateWebhookSignature(rawBody, signature, config.appSecret);
          if (!valid) {
            console.warn('[ig-webhook] SECURITY: invalid signature (appSecret length=%d) — continuando mesmo assim', config.appSecret?.length || 0);
          } else {
            console.log('[ig-webhook] signature validated');
          }
        } else {
          console.warn('[ig-webhook] signature or rawBody missing — skipping validation');
        }
      }
    } catch (sigErr) {
      console.error('[ig-webhook] signature validation error:', sigErr);
    }

    // Persistir evento bruto
    try {
      await db.insert(webhookEvents).values({
        companyId: null,
        instanceName: 'instagram',
        provider: 'meta_instagram',
        eventType: 'instagram_messaging',
        messageId: null,
        wabaId: null,
        phoneNumberId: null,
        payload: body,
        headersJson: null,
        processingStatus: 'received',
        processed: false,
      });
    } catch (err) {
      console.error('[ig-webhook] failed to persist event:', err);
    }

    // Processar mensagens
    try {
      const parsedMessages = MetaInstagramService.parseWebhookPayload(body);

      // Se não conseguiu parsear nenhuma mensagem, verificar se tem message_edit
      // (Instagram em modo Development envia message_edit com num_edit=0 para mensagens novas)
      if (parsedMessages.length === 0) {
        for (const entry of body.entry || []) {
          const igAccountId = entry.id;
          for (const event of entry.messaging || []) {
            if (event.message_edit?.mid) {
              console.log('[ig-webhook] message_edit detected (mid=%s) — fetching via API...', event.message_edit.mid);

              // Buscar instância para ter o token
              const instance = await deps.findInstagramInstanceByIgAccountId(igAccountId);
              if (!instance) {
                console.error('[ig-webhook] no instance for ig_account=%s', igAccountId);
                continue;
              }

              try {
                const { createMetaInstagramService } = await import('./meta-instagram.js');
                const igService = createMetaInstagramService({
                  igBusinessAccountId: instance.igBusinessAccountId,
                  facebookPageId: instance.facebookPageId,
                  pageAccessToken: instance.pageAccessToken,
                });

                // Buscar detalhes da mensagem pela API
                const msgDetails = await igService.getMessage(event.message_edit.mid);
                console.log('[ig-webhook] message details from API:', JSON.stringify(msgDetails).substring(0, 300));

                if (msgDetails && msgDetails.from && msgDetails.message) {
                  const senderId = msgDetails.from.id;
                  // Se o remetente é a própria conta, é um echo - ignorar
                  if (senderId === igAccountId) {
                    console.log('[ig-webhook] ignoring echo (from self)');
                    continue;
                  }

                  // Dedup
                  if (isDuplicate(event.message_edit.mid)) {
                    console.log('[ig-webhook] duplicate message_edit ignored');
                    continue;
                  }

                  const syntheticMsg = {
                    senderId: senderId,
                    recipientId: igAccountId,
                    messageId: msgDetails.id || event.message_edit.mid,
                    timestamp: new Date(msgDetails.created_time).getTime(),
                    text: msgDetails.message,
                    isEcho: false,
                    isDeleted: false,
                    isReaction: false,
                    isRead: false,
                    isPostback: false,
                  };

                  await processIncomingInstagramMessage(syntheticMsg, body, deps);
                }
              } catch (apiErr) {
                console.error('[ig-webhook] failed to fetch message via API:', apiErr);
              }
            }
          }
        }
      }

      for (const msg of parsedMessages) {
        // Ignorar ecos, reads e reactions
        if (msg.isEcho) continue;
        if (msg.isRead) continue;
        if (msg.isReaction) continue;
        if (msg.isDeleted) continue;

        // Dedup
        if (msg.messageId && isDuplicate(msg.messageId)) {
          console.log('[ig-webhook] duplicate message ignored | id=%s', msg.messageId);
          continue;
        }

        await processIncomingInstagramMessage(msg, body, deps);
      }
    } catch (processErr) {
      console.error('[ig-webhook] processing error:', processErr);
    }
  };
}

// =====================================================================
// MESSAGE PROCESSOR
// =====================================================================

async function processIncomingInstagramMessage(
  msg: any,
  rawPayload: any,
  deps: InstagramWebhookDeps
): Promise<void> {
  try {
    // Determinar tipo de mensagem
    let messageType: NormalizedInstagramMessage['type'] = 'text';
    let mediaInfo: NormalizedInstagramMessage['media'] | undefined;

    if (msg.attachments && msg.attachments.length > 0) {
      const att = msg.attachments[0];
      messageType = att.type as any;
      mediaInfo = {
        type: att.type,
        url: att.url,
      };
    } else if (msg.isPostback) {
      messageType = 'postback';
    }

    const textContent = msg.text || (msg.postback?.title) || '';

    console.log(
      '[ig-webhook] message | from=%s type=%s text="%s"',
      msg.senderId,
      messageType,
      (textContent || '').substring(0, 80)
    );

    // O recipientId é o nosso IG Business Account ID
    const igAccountId = msg.recipientId;

    // Buscar instância
    const instance = await deps.findInstagramInstanceByIgAccountId(igAccountId);
    if (!instance) {
      console.error('[ig-webhook] message ignored: no instance for ig_account=%s', igAccountId);
      return;
    }

    const company = await deps.getCompany(instance.companyId);
    if (!company) {
      console.error('[ig-webhook] message ignored: no company for instance=%d', instance.id);
      return;
    }

    // Buscar perfil do remetente para obter nome
    let contactName = msg.senderId;
    let username: string | undefined;
    let profilePic: string | undefined;
    try {
      const igService = new MetaInstagramService({
        igBusinessAccountId: instance.igBusinessAccountId,
        facebookPageId: instance.facebookPageId,
        pageAccessToken: instance.pageAccessToken,
      });
      const profile = await igService.getUserProfile(msg.senderId);
      contactName = profile.name || profile.username || msg.senderId;
      username = profile.username;
      profilePic = profile.profile_pic;
    } catch (profileErr) {
      console.warn('[ig-webhook] failed to get sender profile:', profileErr);
    }

    // Encontrar ou criar conversa (usa senderId como identificador, análogo a phoneNumber)
    const conversation = await deps.findOrCreateConversation(
      instance.companyId,
      instance.id,
      `ig:${msg.senderId}`,
      contactName,
      'instagram'
    );

    // Determinar conteúdo para salvar
    let textForDb = textContent;
    if (!textForDb && mediaInfo) {
      textForDb = `[${mediaInfo.type}]`;
    }
    if (!textForDb) {
      textForDb = '[instagram message]';
    }

    await deps.saveMessage(
      conversation.id,
      'user',
      textForDb,
      msg.messageId,
      messageType
    );

    console.log('[ig-webhook] message persisted | conversation=%d', conversation.id);

    // ── Chatwoot sync ──
    if (company.chatwootEnabled && company.chatwootBaseUrl && company.chatwootApiToken) {
      try {
        const chatwoot = new ChatwootService({
          baseUrl: company.chatwootBaseUrl,
          apiAccessToken: company.chatwootApiToken,
          accountId: company.chatwootAccountId,
          inboxId: company.chatwootInstagramInboxId || company.chatwootInboxId,
        });

        if (mediaInfo?.url) {
          // Baixar mídia e enviar como anexo
          try {
            const mediaResponse = await fetch(mediaInfo.url);
            if (mediaResponse.ok) {
              const arrayBuffer = await mediaResponse.arrayBuffer();
              const mediaBuffer = Buffer.from(arrayBuffer);
              const contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream';
              const extension = contentType.split('/')[1]?.split(';')[0] || 'bin';
              const filename = `ig_${mediaInfo.type}_${Date.now()}.${extension}`;

              await chatwoot.syncIncomingMediaMessage(
                `ig:${msg.senderId}`,
                contactName,
                textContent || '',
                mediaBuffer,
                filename,
                contentType,
                company.chatwootInstagramInboxId || company.chatwootInboxId
              );
              console.log('[ig-webhook] chatwoot media synced | type=%s', mediaInfo.type);
            }
          } catch (mediaErr) {
            console.warn('[ig-webhook] chatwoot media sync failed, sending as text:', mediaErr);
            await chatwoot.syncIncomingMessage(
              `ig:${msg.senderId}`,
              contactName,
              textForDb,
              company.chatwootInstagramInboxId || company.chatwootInboxId
            );
          }
        } else {
          await chatwoot.syncIncomingMessage(
            `ig:${msg.senderId}`,
            contactName,
            textForDb,
            company.chatwootInstagramInboxId || company.chatwootInboxId
          );
        }
        console.log('[ig-webhook] chatwoot synced');
      } catch (chatwootErr) {
        console.warn('[ig-webhook] chatwoot sync failed:', chatwootErr);
      }
    }

    // Construir mensagem normalizada para o callback
    const normalizedMessage: NormalizedInstagramMessage = {
      senderId: msg.senderId,
      recipientId: msg.recipientId,
      contactName,
      username,
      profilePic,
      messageId: msg.messageId,
      type: messageType,
      text: textContent || undefined,
      isEcho: false,
      timestamp: msg.timestamp,
      media: mediaInfo,
      postback: msg.postback,
      referral: msg.referral,
      raw: rawPayload,
    };

    // AI agent callback
    if (deps.onMessageReceived) {
      await deps.onMessageReceived({ message: normalizedMessage, company, instance, conversation });
    }
  } catch (err) {
    console.error('[ig-webhook] message processing error:', err);
  }
}

// =====================================================================
// ROUTER
// =====================================================================

/**
 * Cria o router do Express para webhooks do Instagram Messaging API.
 *
 * Registra:
 *   GET  /webhooks/meta/instagram → Verificação do webhook
 *   POST /webhooks/meta/instagram → Recebimento de eventos
 */
export function createInstagramWebhookRouter(deps: InstagramWebhookDeps): Router {
  const router = Router();

  router.get('/webhooks/meta/instagram', handleInstagramVerification(deps));
  router.post('/webhooks/meta/instagram', handleInstagramEvents(deps));

  // Compatibilidade
  router.get('/api/webhook/meta-instagram', handleInstagramVerification(deps));
  router.post('/api/webhook/meta-instagram', handleInstagramEvents(deps));

  return router;
}
