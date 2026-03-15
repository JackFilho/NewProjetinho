/**
 * WhatsApp Provider - Meta Cloud API (API Oficial)
 *
 * Provider único usando a API oficial da Meta (WhatsApp Cloud API).
 * Para uso como Tech Provider / BSP.
 */

import { MetaWhatsAppService, createMetaWhatsAppService, MetaWhatsAppConfig } from './meta-whatsapp';

// ===== Types =====

export interface WhatsAppSendTextResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppSendMediaResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppInstanceInfo {
  instanceName: string;
  status: string;
  phoneNumber?: string;
  metaPhoneNumberId?: string;
  metaWabaId?: string;
}

export interface NormalizedIncomingMessage {
  /** Número de telefone do remetente (apenas dígitos) */
  from: string;
  /** Nome do contato */
  contactName: string;
  /** ID da mensagem no provider */
  messageId: string;
  /** Tipo da mensagem */
  type: 'text' | 'image' | 'video' | 'audio' | 'ptt' | 'document' | 'sticker' | 'location' | 'reaction' | 'interactive' | 'button' | 'unknown';
  /** Conteúdo textual da mensagem */
  text?: string;
  /** Se a mensagem foi enviada pelo próprio número (bot) */
  fromMe: boolean;
  /** Timestamp */
  timestamp: string;
  /** Dados de mídia */
  media?: {
    id?: string;
    url?: string;
    mimeType?: string;
    caption?: string;
    filename?: string;
  };
  /** Dados de localização */
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  /** Se é uma reação */
  reaction?: {
    messageId: string;
    emoji: string;
  };
  /** Dados brutos do provider (para debugging) */
  raw?: any;
}

// ===== Provider Interface =====

export interface IWhatsAppProvider {
  sendText(to: string, text: string): Promise<WhatsAppSendTextResult>;
  sendMedia(to: string, type: 'image' | 'video' | 'audio' | 'document' | 'sticker', urlOrData: string, caption?: string, filename?: string): Promise<WhatsAppSendMediaResult>;
  sendTyping(to: string, durationMs?: number): Promise<void>;
  markAsRead(messageId: string): Promise<void>;
  /** Acesso direto ao serviço Meta para operações avançadas (templates, etc.) */
  getMetaService(): MetaWhatsAppService;
}

// ===== Meta Official Provider =====

export class MetaOfficialProvider implements IWhatsAppProvider {
  private service: MetaWhatsAppService;

  constructor(service: MetaWhatsAppService) {
    this.service = service;
  }

  async sendText(to: string, text: string): Promise<WhatsAppSendTextResult> {
    try {
      const result = await this.service.sendText({ to, text });
      const messageId = result.messages?.[0]?.id;
      return { success: true, messageId };
    } catch (error: any) {
      console.error('❌ Meta sendText error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendMedia(to: string, type: 'image' | 'video' | 'audio' | 'document' | 'sticker', urlOrData: string, caption?: string, filename?: string): Promise<WhatsAppSendMediaResult> {
    try {
      const result = await this.service.sendMedia({
        to,
        type,
        mediaUrl: urlOrData,
        caption,
        filename,
      });
      const messageId = result.messages?.[0]?.id;
      return { success: true, messageId };
    } catch (error: any) {
      console.error('❌ Meta sendMedia error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendTyping(_to: string, _durationMs: number = 2000): Promise<void> {
    // Meta Cloud API não tem endpoint de "typing indicator" — no-op
  }

  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.service.markAsRead(messageId);
    } catch (error: any) {
      console.warn('⚠️ Meta markAsRead error:', error.message);
    }
  }

  getMetaService(): MetaWhatsAppService {
    return this.service;
  }
}

// ===== Factory =====

export interface ProviderConfig {
  metaPhoneNumberId: string;
  metaWabaId: string;
  metaAccessToken: string;
  metaAppId?: string;
  metaAppSecret?: string;
  metaWebhookVerifyToken?: string;
}

/**
 * Cria o provider Meta oficial a partir da configuração.
 */
export function createWhatsAppProvider(config: ProviderConfig): IWhatsAppProvider {
  if (!config.metaPhoneNumberId || !config.metaWabaId || !config.metaAccessToken) {
    throw new Error('Configuração Meta incompleta: phoneNumberId, wabaId e accessToken são obrigatórios');
  }
  const metaConfig: MetaWhatsAppConfig = {
    phoneNumberId: config.metaPhoneNumberId,
    wabaId: config.metaWabaId,
    accessToken: config.metaAccessToken,
    appId: config.metaAppId,
    appSecret: config.metaAppSecret,
    webhookVerifyToken: config.metaWebhookVerifyToken,
  };
  const service = createMetaWhatsAppService(metaConfig);
  return new MetaOfficialProvider(service);
}

// ===== Normalizer =====

/**
 * Normaliza mensagens recebidas da Meta Cloud API para o formato unificado.
 */
export function normalizeMetaWebhook(rawPayload: any): NormalizedIncomingMessage[] {
  const messages = MetaWhatsAppService.parseWebhookPayload(rawPayload);
  return messages.map((msg): NormalizedIncomingMessage => {
    let type: NormalizedIncomingMessage['type'] = 'text';
    if (msg.type === 'audio' || msg.type === 'ptt') type = msg.type as any;
    else if (['image', 'video', 'document', 'sticker', 'location', 'reaction', 'interactive', 'button'].includes(msg.type)) {
      type = msg.type as any;
    }

    return {
      from: msg.from,
      contactName: msg.contactName,
      messageId: msg.messageId,
      type,
      text: msg.text,
      fromMe: false,
      timestamp: msg.timestamp,
      media: msg.media ? {
        id: msg.media.id,
        mimeType: msg.media.mimeType,
        caption: msg.media.caption,
        filename: msg.media.filename,
      } : undefined,
      location: msg.location,
      reaction: msg.reaction ? {
        messageId: msg.reaction.messageId,
        emoji: msg.reaction.emoji,
      } : undefined,
      raw: rawPayload,
    };
  });
}
