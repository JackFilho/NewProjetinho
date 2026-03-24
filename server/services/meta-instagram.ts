/**
 * Meta Instagram Messaging API Service
 * Integração com a API oficial da Meta para Instagram Direct Messages
 * Documentação: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
 *
 * Usa a mesma infraestrutura da Meta Graph API (mesmo App, mesmo webhook).
 * O Instagram Messaging API usa o Page Access Token da página do Facebook conectada.
 */

import crypto from 'crypto';

const META_GRAPH_API_VERSION = 'v25.0';
const META_GRAPH_API_BASE = `https://graph.instagram.com/${META_GRAPH_API_VERSION}`;

// ===== Interfaces =====

export interface MetaInstagramConfig {
  /** Instagram Business Account ID (IG User ID) */
  igBusinessAccountId: string;
  /** Facebook Page ID conectada ao Instagram */
  facebookPageId: string;
  /** Page Access Token */
  pageAccessToken: string;
  /** App ID da Meta */
  appId?: string;
  /** App Secret (para validação de webhooks) */
  appSecret?: string;
  /** Verify Token para webhook */
  webhookVerifyToken?: string;
}

export interface InstagramSendTextOptions {
  /** Instagram-scoped ID do destinatário (IGSID) */
  recipientId: string;
  /** Texto da mensagem */
  text: string;
}

export interface InstagramSendMediaOptions {
  /** Instagram-scoped ID do destinatário */
  recipientId: string;
  /** Tipo de mídia */
  type: 'image' | 'video' | 'audio' | 'file';
  /** URL pública da mídia */
  mediaUrl: string;
}

export interface InstagramSendReactionOptions {
  /** Instagram-scoped ID do destinatário */
  recipientId: string;
  /** ID da mensagem para reagir */
  messageId: string;
  /** Emoji de reação */
  emoji: string;
}

export interface InstagramMessageResponse {
  recipient_id: string;
  message_id: string;
}

export interface InstagramWebhookMessage {
  object: string;
  entry: Array<{
    id: string;
    time: number;
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: {
        mid: string;
        text?: string;
        is_echo?: boolean;
        is_deleted?: boolean;
        attachments?: Array<{
          type: 'image' | 'video' | 'audio' | 'file' | 'share' | 'story_mention' | 'ig_reel';
          payload: {
            url?: string;
            title?: string;
            sticker_id?: number;
          };
        }>;
        reply_to?: {
          mid: string;
        };
        quick_reply?: {
          payload: string;
        };
        referral?: {
          ref: string;
          source: string;
          type: string;
        };
      };
      reaction?: {
        mid: string;
        action: 'react' | 'unreact';
        reaction?: string;
        emoji?: string;
      };
      read?: {
        mid: string;
      };
      postback?: {
        mid: string;
        title: string;
        payload: string;
      };
    }>;
  }>;
}

// ===== Service Class =====

export class MetaInstagramService {
  private config: MetaInstagramConfig;

  constructor(config: MetaInstagramConfig) {
    this.config = config;
  }

  private async request<T = any>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${META_GRAPH_API_BASE}${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.pageAccessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    console.log(`[instagram] API [${method} ${endpoint}]`);
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = (data as any)?.error?.message || `Instagram API Error: ${response.status}`;
      console.error(`[instagram] API Error [${method} ${endpoint}]:`, JSON.stringify(data));
      const err = new Error(errorMsg) as any;
      err.statusCode = response.status;
      err.errorData = data;
      throw err;
    }

    return data as T;
  }

  // === Envio de Mensagens ===

  /** Enviar mensagem de texto via Instagram DM */
  async sendText(options: InstagramSendTextOptions): Promise<InstagramMessageResponse> {
    const payload = {
      recipient: { id: options.recipientId },
      message: { text: options.text },
    };

    return this.request<InstagramMessageResponse>(
      `/${this.config.igBusinessAccountId}/messages`,
      'POST',
      payload
    );
  }

  /** Enviar mídia (imagem, vídeo, áudio, arquivo) via Instagram DM */
  async sendMedia(options: InstagramSendMediaOptions): Promise<InstagramMessageResponse> {
    const attachmentType = options.type === 'file' ? 'file' : options.type;

    const payload = {
      recipient: { id: options.recipientId },
      message: {
        attachment: {
          type: attachmentType,
          payload: {
            url: options.mediaUrl,
            is_reusable: true,
          },
        },
      },
    };

    return this.request<InstagramMessageResponse>(
      `/${this.config.igBusinessAccountId}/messages`,
      'POST',
      payload
    );
  }

  /** Enviar reação a uma mensagem */
  async sendReaction(options: InstagramSendReactionOptions): Promise<InstagramMessageResponse> {
    const payload = {
      recipient: { id: options.recipientId },
      sender_action: 'react',
      payload: {
        message_id: options.messageId,
        reaction: options.emoji,
      },
    };

    return this.request<InstagramMessageResponse>(
      `/${this.config.igBusinessAccountId}/messages`,
      'POST',
      payload
    );
  }

  /** Marcar mensagem como vista (mark seen) */
  async markAsSeen(senderId: string): Promise<any> {
    const payload = {
      recipient: { id: senderId },
      sender_action: 'mark_seen',
    };

    return this.request(
      `/${this.config.igBusinessAccountId}/messages`,
      'POST',
      payload
    );
  }

  /** Enviar indicador de digitação */
  async sendTyping(senderId: string): Promise<any> {
    const payload = {
      recipient: { id: senderId },
      sender_action: 'typing_on',
    };

    return this.request(
      `/${this.config.igBusinessAccountId}/messages`,
      'POST',
      payload
    );
  }

  // === Perfil do Usuário ===

  /** Buscar informações de perfil do Instagram do remetente */
  async getUserProfile(igScopedId: string): Promise<{
    name?: string;
    profile_pic?: string;
    username?: string;
    follower_count?: number;
    is_verified_user?: boolean;
  }> {
    return this.request(
      `/${igScopedId}?fields=name,profile_pic,username,follower_count,is_verified_user`
    );
  }

  // === Conversations API ===

  /** Buscar conversas recentes do Instagram */
  async getConversations(): Promise<any> {
    return this.request(
      `/${this.config.igBusinessAccountId}/conversations?platform=instagram&fields=participants,messages{id,created_time,from,to,message}`
    );
  }

  /** Buscar uma mensagem específica pelo ID */
  async getMessage(messageId: string): Promise<any> {
    return this.request(
      `/${messageId}?fields=id,created_time,from,to,message`
    );
  }

  // === Webhook Validation ===

  /** Validar assinatura de webhook (mesmo mecanismo do WhatsApp - HMAC SHA-256) */
  static validateWebhookSignature(
    payload: string,
    signature: string,
    appSecret: string
  ): boolean {
    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  }

  /** Verificação de webhook (GET - challenge) */
  static handleWebhookVerification(
    mode: string,
    token: string,
    challenge: string,
    verifyToken: string
  ): string | null {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[instagram] Webhook verificado com sucesso');
      return challenge;
    }
    console.error('[instagram] Falha na verificação do webhook');
    return null;
  }

  /** Extrair mensagens do payload de webhook do Instagram */
  static parseWebhookPayload(body: InstagramWebhookMessage): Array<{
    senderId: string;
    recipientId: string;
    messageId: string;
    timestamp: number;
    text?: string;
    isEcho: boolean;
    isDeleted: boolean;
    attachments?: Array<{
      type: string;
      url?: string;
      title?: string;
    }>;
    replyTo?: string;
    quickReplyPayload?: string;
    isReaction: boolean;
    reaction?: {
      messageId: string;
      action: 'react' | 'unreact';
      emoji?: string;
    };
    isRead: boolean;
    readMessageId?: string;
    isPostback: boolean;
    postback?: {
      title: string;
      payload: string;
    };
    referral?: {
      ref: string;
      source: string;
      type: string;
    };
  }> {
    const parsedMessages: any[] = [];

    if (body.object !== 'instagram') return parsedMessages;

    for (const entry of body.entry || []) {
      // Instagram pode enviar 'messaging' ou 'changes' dependendo do tipo de evento
      const events = entry.messaging || [];

      // Se não tem messaging, tentar extrair de changes (format usado pela Instagram API com Business Login)
      if (events.length === 0 && entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'messages' && change.value) {
            const val = change.value;
            if (val.sender && val.recipient) {
              events.push(val);
            }
          }
        }
      }

      for (const event of events) {
        if (!event.sender?.id || !event.recipient?.id) {
          console.warn('[instagram] skipping event without sender/recipient:', JSON.stringify(event).substring(0, 200));
          continue;
        }
        const parsed: any = {
          senderId: event.sender.id,
          recipientId: event.recipient.id,
          timestamp: event.timestamp,
          isEcho: false,
          isDeleted: false,
          isReaction: false,
          isRead: false,
          isPostback: false,
        };

        if (event.message) {
          parsed.messageId = event.message.mid;
          parsed.text = event.message.text;
          parsed.isEcho = event.message.is_echo || false;
          parsed.isDeleted = event.message.is_deleted || false;
          parsed.replyTo = event.message.reply_to?.mid;
          parsed.quickReplyPayload = event.message.quick_reply?.payload;
          parsed.referral = event.message.referral;

          if (event.message.attachments) {
            parsed.attachments = event.message.attachments.map((att: any) => ({
              type: att.type,
              url: att.payload?.url,
              title: att.payload?.title,
            }));
          }
        } else if (event.reaction) {
          parsed.isReaction = true;
          parsed.messageId = event.reaction.mid;
          parsed.reaction = {
            messageId: event.reaction.mid,
            action: event.reaction.action,
            emoji: event.reaction.reaction || event.reaction.emoji,
          };
        } else if (event.read) {
          parsed.isRead = true;
          parsed.readMessageId = event.read.mid;
          parsed.messageId = event.read.mid;
        } else if (event.postback) {
          parsed.isPostback = true;
          parsed.messageId = event.postback.mid;
          parsed.postback = {
            title: event.postback.title,
            payload: event.postback.payload,
          };
          parsed.text = event.postback.title;
        }

        parsedMessages.push(parsed);
      }
    }

    return parsedMessages;
  }
}

// === Factory ===

export function createMetaInstagramService(config: MetaInstagramConfig): MetaInstagramService {
  return new MetaInstagramService(config);
}
