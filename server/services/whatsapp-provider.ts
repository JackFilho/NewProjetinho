/**
 * WhatsApp Provider Abstraction Layer
 *
 * Camada de abstração que permite coexistência entre:
 * - UAZAPI (provider legado / não-oficial)
 * - Meta Cloud API (provider oficial / Tech Provider)
 *
 * Cada empresa (company) pode escolher qual provider usar.
 * O sistema detecta automaticamente o provider configurado e roteia as chamadas.
 */

import { UazapiService, createUazapiService } from './uazapi';
import { MetaWhatsAppService, createMetaWhatsAppService, MetaWhatsAppConfig } from './meta-whatsapp';

// ===== Types =====

export type WhatsAppProviderType = 'uazapi' | 'meta_official';

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
  provider: WhatsAppProviderType;
  instanceName: string;
  status: string;
  phoneNumber?: string;
  /** Phone Number ID da Meta (apenas para meta_official) */
  metaPhoneNumberId?: string;
  /** WABA ID da Meta (apenas para meta_official) */
  metaWabaId?: string;
}

export interface NormalizedIncomingMessage {
  /** Provider de origem */
  provider: WhatsAppProviderType;
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
  readonly providerType: WhatsAppProviderType;

  sendText(to: string, text: string): Promise<WhatsAppSendTextResult>;
  sendMedia(to: string, type: 'image' | 'video' | 'audio' | 'document' | 'sticker', urlOrData: string, caption?: string, filename?: string): Promise<WhatsAppSendMediaResult>;
  sendTyping(to: string, durationMs?: number): Promise<void>;
  markAsRead?(messageId: string): Promise<void>;
}

// ===== UAZAPI Provider =====

export class UazapiProvider implements IWhatsAppProvider {
  readonly providerType: WhatsAppProviderType = 'uazapi';
  private service: UazapiService;
  private instanceToken: string;

  constructor(service: UazapiService, instanceToken: string) {
    this.service = service;
    this.instanceToken = instanceToken;
  }

  async sendText(to: string, text: string): Promise<WhatsAppSendTextResult> {
    try {
      const result = await this.service.sendText(this.instanceToken, { number: to, text });
      return { success: true, messageId: result?.id || result?.messageId };
    } catch (error: any) {
      console.error('❌ UazapiProvider.sendText error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendMedia(to: string, type: 'image' | 'video' | 'audio' | 'document' | 'sticker', urlOrData: string, caption?: string, filename?: string): Promise<WhatsAppSendMediaResult> {
    try {
      const result = await this.service.sendMedia(this.instanceToken, {
        number: to,
        type: type as any,
        file: urlOrData,
        text: caption,
        docName: filename,
      });
      return { success: true, messageId: result?.id || result?.messageId };
    } catch (error: any) {
      console.error('❌ UazapiProvider.sendMedia error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendTyping(to: string, durationMs: number = 2000): Promise<void> {
    try {
      await this.service.sendPresence(this.instanceToken, { number: to, presence: 'composing', delay: durationMs });
    } catch (error: any) {
      console.warn('⚠️ UazapiProvider.sendTyping error:', error.message);
    }
  }
}

// ===== Meta Official Provider =====

export class MetaOfficialProvider implements IWhatsAppProvider {
  readonly providerType: WhatsAppProviderType = 'meta_official';
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
      console.error('❌ MetaOfficialProvider.sendText error:', error.message);
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
      console.error('❌ MetaOfficialProvider.sendMedia error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async sendTyping(to: string, _durationMs: number = 2000): Promise<void> {
    // Meta Cloud API não tem endpoint de "typing indicator" — é no-op
    // A presença de digitação é simulada no lado do cliente
  }

  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.service.markAsRead(messageId);
    } catch (error: any) {
      console.warn('⚠️ MetaOfficialProvider.markAsRead error:', error.message);
    }
  }

  /** Acesso direto ao serviço Meta para operações avançadas (templates, etc.) */
  getMetaService(): MetaWhatsAppService {
    return this.service;
  }
}

// ===== Factory =====

export interface ProviderConfig {
  type: WhatsAppProviderType;
  // UAZAPI config
  uazapiBaseUrl?: string;
  uazapiAdminToken?: string;
  uazapiInstanceToken?: string;
  // Meta config
  metaPhoneNumberId?: string;
  metaWabaId?: string;
  metaAccessToken?: string;
  metaAppId?: string;
  metaAppSecret?: string;
  metaWebhookVerifyToken?: string;
}

/**
 * Cria o provider correto com base na configuração.
 * Permite que cada empresa use provider diferente (coexistência).
 */
export function createWhatsAppProvider(config: ProviderConfig): IWhatsAppProvider {
  switch (config.type) {
    case 'uazapi': {
      if (!config.uazapiBaseUrl || !config.uazapiAdminToken || !config.uazapiInstanceToken) {
        throw new Error('Configuração UAZAPI incompleta: baseUrl, adminToken e instanceToken são obrigatórios');
      }
      const service = createUazapiService(config.uazapiBaseUrl, config.uazapiAdminToken);
      return new UazapiProvider(service, config.uazapiInstanceToken);
    }

    case 'meta_official': {
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

    default:
      throw new Error(`Provider WhatsApp desconhecido: ${config.type}`);
  }
}

// ===== Normalizer =====

/**
 * Normaliza mensagens recebidas de diferentes providers para um formato único.
 * Isso permite que o restante do sistema (AI agent, Chatwoot, etc.)
 * funcione sem saber qual provider está sendo usado.
 */
export function normalizeUazapiWebhook(rawPayload: any): NormalizedIncomingMessage | null {
  try {
    const message = rawPayload.message || rawPayload;
    const chat = rawPayload.chat;

    // Determinar se é do próprio bot
    const fromMe = message.fromMe === true || message.wasSentByApi === true;

    // Extrair número de telefone
    let phone = '';
    if (chat?.phone) phone = chat.phone;
    else if (chat?.wa_chatid) phone = chat.wa_chatid;
    else if (message.chatid) phone = message.chatid;
    else if (message.sender_pn) phone = message.sender_pn;
    else if (message.sender) phone = message.sender;

    phone = phone.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '').replace(/[^\d]/g, '');

    if (!phone) return null;

    // Extrair texto
    const text = message.text || message.body || message.conversation || message.caption || '';

    // Extrair nome do contato
    const contactName = message.senderName || message.pushName || message.name || chat?.name || chat?.wa_contactName || phone;

    // Extrair ID da mensagem
    const messageId = message.messageid || message.id || '';

    // Determinar tipo
    let type: NormalizedIncomingMessage['type'] = 'text';
    const rawType = (message.type || message.messageType || '').toLowerCase();

    if (['audio', 'ptt', 'audiomessage', 'ptmessage'].includes(rawType)) {
      type = message.audio?.ptt || rawType === 'ptt' ? 'ptt' : 'audio';
    } else if (rawType === 'image' || rawType === 'imagemessage') {
      type = 'image';
    } else if (rawType === 'video' || rawType === 'videomessage') {
      type = 'video';
    } else if (rawType === 'document' || rawType === 'documentmessage') {
      type = 'document';
    } else if (rawType === 'sticker' || rawType === 'stickermessage') {
      type = 'sticker';
    } else if (rawType === 'location' || rawType === 'locationmessage') {
      type = 'location';
    } else if (rawType === 'reaction') {
      type = 'reaction';
    }

    const normalized: NormalizedIncomingMessage = {
      provider: 'uazapi',
      from: phone,
      contactName,
      messageId,
      type,
      text: text || undefined,
      fromMe,
      timestamp: message.timestamp || new Date().toISOString(),
      raw: rawPayload,
    };

    return normalized;
  } catch (error) {
    console.error('❌ Erro ao normalizar webhook UAZAPI:', error);
    return null;
  }
}

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
      provider: 'meta_official',
      from: msg.from,
      contactName: msg.contactName,
      messageId: msg.messageId,
      type,
      text: msg.text,
      fromMe: false, // Webhooks da Meta só recebem mensagens de clientes
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
