/**
 * UAZAPI WhatsApp Service
 * Integração com a API do UAZAPI para comunicação via WhatsApp
 * Documentação: https://docs.uazapi.com/
 */

interface SendTextOptions {
  number: string;
  text: string;
  delay?: number;
  readchat?: boolean;
  track_source?: string;
  track_id?: string;
}

interface SendMediaOptions {
  number: string;
  type: 'image' | 'video' | 'document' | 'audio' | 'ptt' | 'sticker';
  file: string; // URL ou base64
  text?: string; // caption
  docName?: string;
  delay?: number;
  track_source?: string;
  track_id?: string;
}

interface SendPresenceOptions {
  number: string;
  presence: 'composing' | 'recording' | 'paused';
  delay?: number; // duração em ms (max 300000)
}

interface WebhookConfig {
  url: string;
  events: string[];
  excludeMessages?: string[];
  addUrlEvents?: boolean;
}

interface UazapiInstanceResult {
  id?: string;
  token?: string;
  name?: string;
  status?: string;
  qrcode?: string;
  paircode?: string;
  profileName?: string;
  [key: string]: any;
}

export class UazapiService {
  private baseUrl: string;
  private adminToken: string;

  constructor(baseUrl: string, adminToken: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.adminToken = adminToken;
  }

  // Remove WhatsApp JID suffixes to get plain phone number
  // UAZAPI expects just the number (e.g. "5511999999999"), not JID format
  private cleanNumber(phone: string): string {
    return phone.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '');
  }

  private async request(
    endpoint: string,
    method: string,
    token: string,
    tokenType: 'token' | 'admintoken',
    body?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [tokenType]: token,
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`❌ Erro UAZAPI [${method} ${endpoint}]:`, data);
      throw new Error(data.error || `Erro UAZAPI: ${response.status} ${response.statusText}`);
    }

    return data;
  }

  // === Operações Admin (usam admintoken) ===

  async createInstance(name: string): Promise<UazapiInstanceResult> {
    console.log('🔄 Criando instância UAZAPI:', name);
    const result = await this.request('/instance/init', 'POST', this.adminToken, 'admintoken', { name });
    console.log('✅ Instância criada UAZAPI:', result.name, '- Token:', result.token?.substring(0, 8) + '...');
    return result;
  }

  async listAllInstances(): Promise<UazapiInstanceResult[]> {
    console.log('🔄 Listando todas as instâncias UAZAPI');
    const result = await this.request('/instance/all', 'GET', this.adminToken, 'admintoken');
    console.log('✅ Instâncias listadas:', Array.isArray(result) ? result.length : 0);
    return Array.isArray(result) ? result : [];
  }

  // === Operações de Instância (usam token da instância) ===

  async connect(instanceToken: string, phone?: string): Promise<UazapiInstanceResult> {
    console.log('🔄 Conectando instância UAZAPI', phone ? `(pairing: ${phone})` : '(QR code)');
    const body: any = {};
    if (phone) {
      body.phone = phone;
    }
    const result = await this.request('/instance/connect', 'POST', instanceToken, 'token', body);
    console.log('✅ Conexão iniciada UAZAPI');
    return result;
  }

  async disconnect(instanceToken: string): Promise<any> {
    console.log('🔄 Desconectando instância UAZAPI');
    const result = await this.request('/instance/disconnect', 'POST', instanceToken, 'token');
    console.log('✅ Instância desconectada UAZAPI');
    return result;
  }

  async deleteInstance(instanceToken: string): Promise<any> {
    console.log('🔄 Deletando instância UAZAPI');
    const result = await this.request('/instance', 'DELETE', instanceToken, 'token');
    console.log('✅ Instância deletada UAZAPI');
    return result;
  }

  async getStatus(instanceToken: string): Promise<UazapiInstanceResult> {
    const result = await this.request('/instance/status', 'GET', instanceToken, 'token');
    return result;
  }

  async configureWebhook(instanceToken: string, config: WebhookConfig): Promise<any> {
    console.log('🔄 Configurando webhook UAZAPI:', config.url);
    const payload: any = {
      enabled: true,
      url: config.url,
      events: config.events,
      excludeMessages: config.excludeMessages || ['wasSentByApi'],
    };
    if (config.addUrlEvents !== undefined) {
      payload.addUrlEvents = config.addUrlEvents;
    }
    const result = await this.request('/webhook', 'POST', instanceToken, 'token', payload);
    console.log('✅ Webhook configurado UAZAPI');
    return result;
  }

  // === Envio de Mensagens (usam token da instância) ===

  async sendText(instanceToken: string, options: SendTextOptions): Promise<any> {
    const payload: any = {
      number: this.cleanNumber(options.number),
      text: options.text,
    };
    if (options.delay) payload.delay = options.delay;
    if (options.readchat) payload.readchat = options.readchat;
    if (options.track_source) payload.track_source = options.track_source;
    if (options.track_id) payload.track_id = options.track_id;

    const result = await this.request('/send/text', 'POST', instanceToken, 'token', payload);
    return result;
  }

  async sendMedia(instanceToken: string, options: SendMediaOptions): Promise<any> {
    console.log('🔄 Enviando mídia UAZAPI:', options.type);
    const payload: any = {
      number: this.cleanNumber(options.number),
      type: options.type,
      file: options.file,
    };
    if (options.text) payload.text = options.text;
    if (options.docName) payload.docName = options.docName;
    if (options.delay) payload.delay = options.delay;
    if (options.track_source) payload.track_source = options.track_source;
    if (options.track_id) payload.track_id = options.track_id;

    const result = await this.request('/send/media', 'POST', instanceToken, 'token', payload);
    console.log('✅ Mídia enviada UAZAPI');
    return result;
  }

  async sendPresence(instanceToken: string, options: SendPresenceOptions): Promise<any> {
    const payload: any = {
      number: this.cleanNumber(options.number),
      presence: options.presence,
    };
    if (options.delay) payload.delay = options.delay;

    try {
      const result = await this.request('/message/presence', 'POST', instanceToken, 'token', payload);
      return result;
    } catch (error) {
      // Presença é best-effort, não deve quebrar o fluxo
      console.warn('⚠️ Falha ao enviar presença UAZAPI:', error);
      return null;
    }
  }
}

// Helper para criar instância do serviço a partir das configurações globais
export function createUazapiService(baseUrl: string, adminToken: string): UazapiService {
  return new UazapiService(baseUrl, adminToken);
}
