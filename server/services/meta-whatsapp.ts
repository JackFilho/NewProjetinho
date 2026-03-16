/**
 * Meta WhatsApp Cloud API Service
 * Integração com a API oficial da Meta (WhatsApp Business Platform)
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Para se tornar um Tech Provider / BSP (Business Solution Provider),
 * esta integração usa a Cloud API com endpoints oficiais da Meta.
 */

const META_GRAPH_API_VERSION = 'v21.0';
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

// ===== Interfaces =====

export interface MetaWhatsAppConfig {
  /** ID do número de telefone WhatsApp Business (Phone Number ID) */
  phoneNumberId: string;
  /** WhatsApp Business Account ID (WABA ID) */
  wabaId: string;
  /** Access Token (System User Token ou token temporário) */
  accessToken: string;
  /** App ID da Meta (para webhooks) */
  appId?: string;
  /** App Secret (para validação de webhooks) */
  appSecret?: string;
  /** Verify Token para validação de webhook */
  webhookVerifyToken?: string;
}

export interface MetaSendTextOptions {
  /** Número no formato internacional (ex: 5511999999999) */
  to: string;
  /** Texto da mensagem */
  text: string;
  /** Se true, envia como mensagem de preview de URL */
  previewUrl?: boolean;
}

export interface MetaSendTemplateOptions {
  /** Número no formato internacional */
  to: string;
  /** Nome do template aprovado pela Meta */
  templateName: string;
  /** Código do idioma do template (ex: pt_BR) */
  languageCode: string;
  /** Componentes (header, body, buttons) com parâmetros dinâmicos */
  components?: MetaTemplateComponent[];
}

export interface MetaTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: string;
  parameters: MetaTemplateParameter[];
}

export interface MetaTemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'document' | 'video';
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
  image?: { link: string };
  document?: { link: string; filename?: string };
  video?: { link: string };
}

export interface MetaSendMediaOptions {
  /** Número no formato internacional */
  to: string;
  /** Tipo de mídia */
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker';
  /** URL pública da mídia ou Media ID */
  mediaUrl?: string;
  mediaId?: string;
  /** Legenda (para image, video e document) */
  caption?: string;
  /** Nome do arquivo (para document) */
  filename?: string;
}

export interface MetaSendInteractiveOptions {
  to: string;
  type: 'button' | 'list' | 'product' | 'product_list';
  header?: { type: 'text' | 'image' | 'video' | 'document'; text?: string; image?: { link: string }; video?: { link: string }; document?: { link: string } };
  body: { text: string };
  footer?: { text: string };
  action: any;
}

export interface MetaMessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface MetaWebhookMessage {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type: string; sha256: string; caption?: string };
          video?: { id: string; mime_type: string; sha256: string; caption?: string };
          audio?: { id: string; mime_type: string; sha256: string; voice?: boolean };
          document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
          sticker?: { id: string; mime_type: string; sha256: string; animated?: boolean };
          location?: { latitude: number; longitude: number; name?: string; address?: string };
          contacts?: Array<any>;
          interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string; description: string } };
          reaction?: { message_id: string; emoji: string };
          button?: { text: string; payload: string };
          context?: { from: string; id: string };
        }>;
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string; message: string; error_data?: { details: string } }>;
        }>;
        errors?: Array<{ code: number; title: string; message: string }>;
      };
      field: string;
    }>;
  }>;
}

export interface MetaBusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
}

export interface MetaTemplateInfo {
  name: string;
  status: string;
  category: string;
  language: string;
  components: any[];
  id: string;
}

// ===== Service Class =====

export class MetaWhatsAppService {
  private config: MetaWhatsAppConfig;

  constructor(config: MetaWhatsAppConfig) {
    this.config = config;
  }

  // === Métodos internos ===

  private async request<T = any>(
    endpoint: string,
    method: string = 'GET',
    body?: any,
    customHeaders?: Record<string, string>
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${META_GRAPH_API_BASE}${endpoint}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.accessToken}`,
      'Content-Type': 'application/json',
      ...customHeaders,
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    console.log(`🔄 Meta API [${method} ${endpoint}]`);
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = (data as any)?.error?.message || `Meta API Error: ${response.status}`;
      const errorCode = (data as any)?.error?.code;
      console.error(`❌ Meta API Error [${method} ${endpoint}]:`, JSON.stringify(data));
      const err = new Error(errorMsg) as any;
      err.statusCode = response.status;
      err.errorCode = errorCode;
      err.errorData = data;
      throw err;
    }

    return data as T;
  }

  /** Formata número para o formato esperado pela Meta (apenas dígitos, sem +) */
  private formatNumber(phone: string): string {
    return phone
      .replace(/@s\.whatsapp\.net$/, '')
      .replace(/@c\.us$/, '')
      .replace(/@g\.us$/, '')
      .replace(/@lid$/, '')
      .replace(/[^\d]/g, '');
  }

  // === Envio de Mensagens ===

  /** Enviar mensagem de texto */
  async sendText(options: MetaSendTextOptions): Promise<MetaMessageResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatNumber(options.to),
      type: 'text',
      text: {
        preview_url: options.previewUrl || false,
        body: options.text,
      },
    };

    return this.request<MetaMessageResponse>(
      `/${this.config.phoneNumberId}/messages`,
      'POST',
      payload
    );
  }

  /** Enviar mensagem template (necessário para iniciar conversas fora da janela de 24h) */
  /** Validar variáveis de template antes do envio */
  static validateTemplateVariables(components?: MetaTemplateComponent[]): string[] {
    const errors: string[] = [];
    if (!components) return errors;

    for (const comp of components) {
      if (!comp.parameters) continue;
      for (let i = 0; i < comp.parameters.length; i++) {
        const param = comp.parameters[i];
        if (param.type === 'text') {
          if (!param.text || param.text.trim() === '') {
            errors.push(`Componente ${comp.type}[${i}]: parâmetro text está vazio`);
          }
        } else if (param.type === 'image' && !param.image?.link) {
          errors.push(`Componente ${comp.type}[${i}]: image.link é obrigatório`);
        } else if (param.type === 'document' && !param.document?.link) {
          errors.push(`Componente ${comp.type}[${i}]: document.link é obrigatório`);
        } else if (param.type === 'video' && !param.video?.link) {
          errors.push(`Componente ${comp.type}[${i}]: video.link é obrigatório`);
        }
      }
    }
    return errors;
  }

  async sendTemplate(options: MetaSendTemplateOptions): Promise<MetaMessageResponse> {
    // Validate template variables before sending
    const validationErrors = MetaWhatsAppService.validateTemplateVariables(options.components);
    if (validationErrors.length > 0) {
      throw new Error(`Template validation failed: ${validationErrors.join('; ')}`);
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatNumber(options.to),
      type: 'template',
      template: {
        name: options.templateName,
        language: { code: options.languageCode },
      },
    };

    if (options.components && options.components.length > 0) {
      payload.template.components = options.components;
    }

    return this.request<MetaMessageResponse>(
      `/${this.config.phoneNumberId}/messages`,
      'POST',
      payload
    );
  }

  /** Enviar mídia (imagem, vídeo, áudio, documento, sticker) */
  async sendMedia(options: MetaSendMediaOptions): Promise<MetaMessageResponse> {
    const mediaObject: any = {};
    if (options.mediaUrl) {
      mediaObject.link = options.mediaUrl;
    } else if (options.mediaId) {
      mediaObject.id = options.mediaId;
    }
    if (options.caption) mediaObject.caption = options.caption;
    if (options.filename) mediaObject.filename = options.filename;

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatNumber(options.to),
      type: options.type,
      [options.type]: mediaObject,
    };

    return this.request<MetaMessageResponse>(
      `/${this.config.phoneNumberId}/messages`,
      'POST',
      payload
    );
  }

  /** Enviar mensagem interativa (botões, listas) */
  async sendInteractive(options: MetaSendInteractiveOptions): Promise<MetaMessageResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatNumber(options.to),
      type: 'interactive',
      interactive: {
        type: options.type,
        header: options.header,
        body: options.body,
        footer: options.footer,
        action: options.action,
      },
    };

    return this.request<MetaMessageResponse>(
      `/${this.config.phoneNumberId}/messages`,
      'POST',
      payload
    );
  }

  /** Enviar reação a uma mensagem */
  async sendReaction(to: string, messageId: string, emoji: string): Promise<MetaMessageResponse> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatNumber(to),
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji,
      },
    };

    return this.request<MetaMessageResponse>(
      `/${this.config.phoneNumberId}/messages`,
      'POST',
      payload
    );
  }

  /** Marcar mensagem como lida */
  async markAsRead(messageId: string): Promise<any> {
    const payload = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };

    return this.request(
      `/${this.config.phoneNumberId}/messages`,
      'POST',
      payload
    );
  }

  // === Gerenciamento de Mídia ===

  /** Upload de mídia para o servidor da Meta */
  async uploadMedia(fileBuffer: Buffer, mimeType: string, filename: string): Promise<{ id: string }> {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename);
    formData.append('type', mimeType);

    const url = `${META_GRAPH_API_BASE}/${this.config.phoneNumberId}/media`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || 'Erro ao fazer upload de mídia');
    }
    return data;
  }

  /** Obter URL de download de uma mídia */
  async getMediaUrl(mediaId: string): Promise<{ url: string; mime_type: string; sha256: string; file_size: number }> {
    return this.request(`/${mediaId}`);
  }

  /** Baixar conteúdo de mídia */
  async downloadMedia(mediaUrl: string): Promise<Buffer> {
    const response = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Erro ao baixar mídia: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // === Gerenciamento de Perfil ===

  /** Obter perfil do negócio */
  async getBusinessProfile(): Promise<MetaBusinessProfile> {
    const result = await this.request<{ data: MetaBusinessProfile[] }>(
      `/${this.config.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`
    );
    return result.data[0] || {};
  }

  /** Atualizar perfil do negócio */
  async updateBusinessProfile(profile: Partial<MetaBusinessProfile>): Promise<any> {
    return this.request(
      `/${this.config.phoneNumberId}/whatsapp_business_profile`,
      'POST',
      { messaging_product: 'whatsapp', ...profile }
    );
  }

  // === Templates ===

  /** Listar templates de mensagem */
  async listTemplates(status?: string): Promise<MetaTemplateInfo[]> {
    let endpoint = `/${this.config.wabaId}/message_templates?fields=name,status,category,language,components,id`;
    if (status) endpoint += `&status=${status}`;

    const result = await this.request<{ data: MetaTemplateInfo[] }>(endpoint);
    return result.data || [];
  }

  /** Criar template de mensagem */
  async createTemplate(template: {
    name: string;
    category: 'AUTHENTICATION' | 'MARKETING' | 'UTILITY';
    language: string;
    components: any[];
  }): Promise<any> {
    return this.request(
      `/${this.config.wabaId}/message_templates`,
      'POST',
      template
    );
  }

  /** Deletar template de mensagem */
  async deleteTemplate(templateName: string): Promise<any> {
    return this.request(
      `/${this.config.wabaId}/message_templates?name=${templateName}`,
      'DELETE'
    );
  }

  // === Números de Telefone ===

  /** Listar números de telefone da WABA */
  async listPhoneNumbers(): Promise<any[]> {
    const result = await this.request<{ data: any[] }>(
      `/${this.config.wabaId}/phone_numbers?fields=verified_name,code_verification_status,display_phone_number,quality_rating,platform_type,throughput,id`
    );
    return result.data || [];
  }

  /** Registrar número de telefone */
  async registerPhoneNumber(pin: string): Promise<any> {
    return this.request(
      `/${this.config.phoneNumberId}/register`,
      'POST',
      { messaging_product: 'whatsapp', pin }
    );
  }

  // === Webhook Validation ===

  /** Validar assinatura de webhook da Meta (HMAC SHA-256) */
  static validateWebhookSignature(
    payload: string,
    signature: string,
    appSecret: string
  ): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');
    return `sha256=${expectedSignature}` === signature;
  }

  /** Processar verificação de webhook (GET request da Meta) */
  static handleWebhookVerification(
    mode: string,
    token: string,
    challenge: string,
    verifyToken: string
  ): string | null {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook Meta verificado com sucesso');
      return challenge;
    }
    console.error('❌ Falha na verificação do webhook Meta');
    return null;
  }

  /** Extrair mensagens de um payload de webhook */
  static parseWebhookPayload(body: MetaWebhookMessage): Array<{
    phoneNumberId: string;
    from: string;
    contactName: string;
    messageId: string;
    timestamp: string;
    type: string;
    text?: string;
    media?: { id: string; mimeType: string; caption?: string; filename?: string };
    location?: { latitude: number; longitude: number; name?: string; address?: string };
    interactive?: { type: string; id: string; title: string };
    reaction?: { messageId: string; emoji: string };
    isButton?: boolean;
    buttonText?: string;
    buttonPayload?: string;
    context?: { from: string; id: string };
  }> {
    const parsedMessages: any[] = [];

    if (body.object !== 'whatsapp_business_account') return parsedMessages;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;

        if (!value.messages) continue;

        for (const msg of value.messages) {
          const contact = value.contacts?.find((c: any) => c.wa_id === msg.from);
          const parsed: any = {
            phoneNumberId,
            from: msg.from,
            contactName: contact?.profile?.name || msg.from,
            messageId: msg.id,
            timestamp: msg.timestamp,
            type: msg.type,
            context: msg.context,
          };

          switch (msg.type) {
            case 'text':
              parsed.text = msg.text?.body;
              break;
            case 'image':
              parsed.media = { id: msg.image!.id, mimeType: msg.image!.mime_type, caption: msg.image!.caption };
              parsed.text = msg.image?.caption;
              break;
            case 'video':
              parsed.media = { id: msg.video!.id, mimeType: msg.video!.mime_type, caption: msg.video!.caption };
              parsed.text = msg.video?.caption;
              break;
            case 'audio':
              parsed.media = { id: msg.audio!.id, mimeType: msg.audio!.mime_type };
              parsed.type = msg.audio?.voice ? 'ptt' : 'audio';
              break;
            case 'document':
              parsed.media = { id: msg.document!.id, mimeType: msg.document!.mime_type, filename: msg.document!.filename, caption: msg.document!.caption };
              parsed.text = msg.document?.caption;
              break;
            case 'sticker':
              parsed.media = { id: msg.sticker!.id, mimeType: msg.sticker!.mime_type };
              break;
            case 'location':
              parsed.location = msg.location;
              break;
            case 'interactive':
              if (msg.interactive?.button_reply) {
                parsed.interactive = { type: 'button_reply', id: msg.interactive.button_reply.id, title: msg.interactive.button_reply.title };
                parsed.text = msg.interactive.button_reply.title;
              } else if (msg.interactive?.list_reply) {
                parsed.interactive = { type: 'list_reply', id: msg.interactive.list_reply.id, title: msg.interactive.list_reply.title };
                parsed.text = msg.interactive.list_reply.title;
              }
              break;
            case 'reaction':
              parsed.reaction = { messageId: msg.reaction!.message_id, emoji: msg.reaction!.emoji };
              break;
            case 'button':
              parsed.isButton = true;
              parsed.buttonText = msg.button?.text;
              parsed.buttonPayload = msg.button?.payload;
              parsed.text = msg.button?.text;
              break;
          }

          parsedMessages.push(parsed);
        }
      }
    }

    return parsedMessages;
  }

  /** Extrair status updates de um payload de webhook */
  static parseWebhookStatuses(body: MetaWebhookMessage): Array<{
    messageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipientId: string;
    errors?: Array<{ code: number; title: string; message: string }>;
  }> {
    const statuses: any[] = [];

    if (body.object !== 'whatsapp_business_account') return statuses;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        if (!value.statuses) continue;

        for (const status of value.statuses) {
          statuses.push({
            messageId: status.id,
            status: status.status,
            timestamp: status.timestamp,
            recipientId: status.recipient_id,
            errors: status.errors,
          });
        }
      }
    }

    return statuses;
  }
}

// === Helper Factory ===

export function createMetaWhatsAppService(config: MetaWhatsAppConfig): MetaWhatsAppService {
  return new MetaWhatsAppService(config);
}
