/**
 * Chatwoot Service Integration
 *
 * Integração completa com o Chatwoot como canal de atendimento ao cliente.
 * Permite:
 * - Criar/gerenciar contatos
 * - Criar/gerenciar conversas
 * - Enviar/receber mensagens
 * - Sincronizar com WhatsApp (via Meta Cloud API)
 * - Gerenciar agentes e equipes
 *
 * Documentação Chatwoot API: https://www.chatwoot.com/developers/api/
 */

// ===== Interfaces =====

export interface ChatwootConfig {
  /** URL base do Chatwoot (ex: https://app.chatwoot.com ou self-hosted) */
  baseUrl: string;
  /** API Access Token (User ou Bot) */
  apiAccessToken: string;
  /** Account ID */
  accountId: number;
  /** Inbox ID para WhatsApp (opcional, pode ser criado dinamicamente) */
  inboxId?: number;
}

export interface ChatwootContact {
  id?: number;
  name: string;
  phone_number?: string;
  email?: string;
  identifier?: string;
  custom_attributes?: Record<string, any>;
}

export interface ChatwootConversation {
  id: number;
  account_id: number;
  inbox_id: number;
  status: 'open' | 'resolved' | 'pending' | 'snoozed';
  contact_id: number;
  display_id: number;
  messages?: ChatwootMessage[];
  meta?: {
    sender?: ChatwootContact;
    channel?: string;
  };
  custom_attributes?: Record<string, any>;
  labels?: string[];
}

export interface ChatwootMessage {
  id?: number;
  content: string;
  message_type: 'incoming' | 'outgoing' | 'activity' | 'template';
  content_type?: 'text' | 'input_select' | 'cards' | 'form' | 'article' | 'input_email' | 'input_csat';
  private?: boolean;
  content_attributes?: Record<string, any>;
  attachments?: Array<{
    file_type: 'image' | 'audio' | 'video' | 'file' | 'location' | 'fallback';
    data_url?: string;
    external_url?: string;
  }>;
}

export interface ChatwootInbox {
  id: number;
  name: string;
  channel_type: string;
  greeting_enabled: boolean;
  greeting_message?: string;
  working_hours_enabled: boolean;
  phone_number?: string;
}

export interface ChatwootWebhookPayload {
  event: string;
  id?: number;
  account?: { id: number };
  inbox?: { id: number; name: string };
  conversation?: ChatwootConversation;
  message?: ChatwootMessage & {
    id: number;
    conversation_id: number;
    account_id: number;
    sender?: { id: number; name: string; type: string };
  };
  contact?: ChatwootContact;
  [key: string]: any;
}

export interface ChatwootLabel {
  id: number;
  title: string;
  description?: string;
  color?: string;
  show_on_sidebar?: boolean;
}

// ===== Service Class =====

export class ChatwootService {
  private config: ChatwootConfig;
  private baseApiUrl: string;

  constructor(config: ChatwootConfig) {
    this.config = config;
    this.baseApiUrl = `${config.baseUrl.replace(/\/+$/, '')}/api/v1/accounts/${config.accountId}`;
  }

  // === Métodos internos ===

  private async request<T = any>(
    endpoint: string,
    method: string = 'GET',
    body?: any
  ): Promise<T> {
    const url = `${this.baseApiUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'api_access_token': this.config.apiAccessToken,
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = (data as any)?.error || (data as any)?.message || `Chatwoot API Error: ${response.status}`;
      console.error(`❌ Chatwoot API Error [${method} ${endpoint}]:`, data);
      throw new Error(errorMsg);
    }

    return data as T;
  }

  // === Contatos ===

  /** Buscar contato por número de telefone */
  async findContactByPhone(phone: string): Promise<ChatwootContact | null> {
    try {
      const result = await this.request<{ payload: ChatwootContact[] }>(
        `/contacts/search?q=${encodeURIComponent(phone)}&include_contacts=true`
      );
      const contacts = result.payload || [];
      return contacts.find((c: any) =>
        c.phone_number?.replace(/[^\d]/g, '') === phone.replace(/[^\d]/g, '')
      ) || null;
    } catch (error) {
      console.warn('⚠️ Chatwoot: Contato não encontrado para', phone);
      return null;
    }
  }

  /** Criar contato */
  async createContact(contact: ChatwootContact): Promise<ChatwootContact> {
    const payload: any = {
      name: contact.name,
      phone_number: contact.phone_number ? `+${contact.phone_number.replace(/[^\d]/g, '')}` : undefined,
      email: contact.email,
      identifier: contact.identifier,
      custom_attributes: contact.custom_attributes,
    };

    const result = await this.request<{ payload: { contact: ChatwootContact } }>(
      '/contacts',
      'POST',
      payload
    );
    return result.payload?.contact || result as any;
  }

  /** Criar ou buscar contato existente */
  async findOrCreateContact(name: string, phone: string): Promise<ChatwootContact> {
    const existing = await this.findContactByPhone(phone);
    if (existing) {
      // Atualizar nome se mudou
      if (existing.name !== name && name && existing.id) {
        try {
          await this.request(`/contacts/${existing.id}`, 'PUT', { name });
          existing.name = name;
        } catch (_) {}
      }
      return existing;
    }

    return this.createContact({
      name,
      phone_number: phone,
      identifier: phone,
    });
  }

  /** Atualizar contato */
  async updateContact(contactId: number, data: Partial<ChatwootContact>): Promise<ChatwootContact> {
    return this.request(`/contacts/${contactId}`, 'PUT', data);
  }

  // === Conversas ===

  /** Criar conversa */
  async createConversation(
    contactId: number,
    inboxId?: number,
    customAttributes?: Record<string, any>
  ): Promise<ChatwootConversation> {
    const payload: any = {
      contact_id: contactId,
      inbox_id: inboxId || this.config.inboxId,
      custom_attributes: customAttributes,
    };

    return this.request<ChatwootConversation>('/conversations', 'POST', payload);
  }

  /** Buscar conversas de um contato */
  async getContactConversations(contactId: number): Promise<ChatwootConversation[]> {
    const result = await this.request<{ payload: ChatwootConversation[] }>(
      `/contacts/${contactId}/conversations`
    );
    return result.payload || [];
  }

  /** Buscar conversa aberta para um contato (ou criar nova) */
  async findOrCreateConversation(
    contactId: number,
    inboxId?: number,
    customAttributes?: Record<string, any>
  ): Promise<ChatwootConversation> {
    const conversations = await this.getContactConversations(contactId);
    const targetInboxId = inboxId || this.config.inboxId;

    // Buscar conversa aberta no inbox correto
    const openConversation = conversations.find(
      (c: any) => c.inbox_id === targetInboxId && (c.status === 'open' || c.status === 'pending')
    );

    if (openConversation) return openConversation;

    // Criar nova conversa
    return this.createConversation(contactId, targetInboxId, customAttributes);
  }

  /** Atualizar status da conversa */
  async updateConversationStatus(
    conversationId: number,
    status: 'open' | 'resolved' | 'pending' | 'snoozed'
  ): Promise<any> {
    return this.request(`/conversations/${conversationId}/toggle_status`, 'POST', { status });
  }

  /** Atribuir agente a conversa */
  async assignAgent(conversationId: number, agentId: number): Promise<any> {
    return this.request(`/conversations/${conversationId}/assignments`, 'POST', {
      assignee_id: agentId,
    });
  }

  /** Adicionar labels a conversa */
  async addLabels(conversationId: number, labels: string[]): Promise<any> {
    // Primeiro buscar labels existentes
    const conversation = await this.request<ChatwootConversation>(`/conversations/${conversationId}`);
    const existingLabels = conversation.labels || [];
    const allLabels = [...new Set([...existingLabels, ...labels])];

    return this.request(`/conversations/${conversationId}/labels`, 'POST', {
      labels: allLabels,
    });
  }

  /** Remover label de conversa */
  async removeLabel(conversationId: number, labelToRemove: string): Promise<any> {
    const conversation = await this.request<ChatwootConversation>(`/conversations/${conversationId}`);
    const existingLabels = conversation.labels || [];
    const newLabels = existingLabels.filter((l: string) => l.toLowerCase() !== labelToRemove.toLowerCase());

    return this.request(`/conversations/${conversationId}/labels`, 'POST', {
      labels: newLabels,
    });
  }

  // === Mensagens ===

  /** Enviar mensagem em uma conversa */
  async sendMessage(
    conversationId: number,
    content: string,
    messageType: 'incoming' | 'outgoing' = 'outgoing',
    isPrivate: boolean = false,
    attachments?: ChatwootMessage['attachments']
  ): Promise<ChatwootMessage> {
    const payload: any = {
      content,
      message_type: messageType,
      private: isPrivate,
    };

    if (attachments && attachments.length > 0) {
      payload.attachments = attachments;
    }

    return this.request<ChatwootMessage>(
      `/conversations/${conversationId}/messages`,
      'POST',
      payload
    );
  }

  /**
   * Enviar mensagem com arquivo anexo (multipart/form-data).
   * Usa a API de mensagens do Chatwoot que aceita file uploads.
   * Ideal para enviar áudio, imagens, vídeos e documentos.
   */
  async sendMessageWithFile(
    conversationId: number,
    content: string,
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    messageType: 'incoming' | 'outgoing' = 'incoming',
    isPrivate: boolean = false
  ): Promise<ChatwootMessage> {
    const url = `${this.baseApiUrl}/conversations/${conversationId}/messages`;

    const formData = new FormData();
    formData.append('content', content);
    formData.append('message_type', messageType);
    formData.append('private', String(isPrivate));
    formData.append('attachments[]', new Blob([fileBuffer], { type: mimeType }), filename);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'api_access_token': this.config.apiAccessToken,
      },
      body: formData,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = (data as any)?.error || (data as any)?.message || `Chatwoot API Error: ${response.status}`;
      console.error('[chatwoot] sendMessageWithFile error:', data);
      throw new Error(errorMsg);
    }

    return data as ChatwootMessage;
  }

  /** Listar mensagens de uma conversa */
  async getMessages(conversationId: number, before?: number): Promise<ChatwootMessage[]> {
    let endpoint = `/conversations/${conversationId}/messages`;
    if (before) endpoint += `?before=${before}`;

    const result = await this.request<{ payload: ChatwootMessage[] }>(endpoint);
    return result.payload || [];
  }

  // === Inboxes ===

  /** Listar inboxes */
  async listInboxes(): Promise<ChatwootInbox[]> {
    const result = await this.request<{ payload: ChatwootInbox[] }>('/inboxes');
    return result.payload || [];
  }

  /** Criar inbox API (para integração com WhatsApp) */
  async createApiInbox(name: string, webhookUrl?: string): Promise<ChatwootInbox> {
    const payload: any = {
      name,
      channel: {
        type: 'api',
        webhook_url: webhookUrl,
      },
    };

    return this.request<ChatwootInbox>('/inboxes', 'POST', payload);
  }

  // === Labels ===

  /** Listar labels */
  async listLabels(): Promise<ChatwootLabel[]> {
    const result = await this.request<{ payload: ChatwootLabel[] }>('/labels');
    return result.payload || [];
  }

  /** Criar label */
  async createLabel(title: string, description?: string, color?: string): Promise<ChatwootLabel> {
    return this.request<ChatwootLabel>('/labels', 'POST', {
      title,
      description,
      color,
      show_on_sidebar: true,
    });
  }

  // === Webhook Processing ===

  /**
   * Processa webhook recebido do Chatwoot.
   * Retorna informações estruturadas sobre o evento.
   */
  static parseWebhookEvent(payload: ChatwootWebhookPayload): {
    event: string;
    isAgentMessage: boolean;
    isHumanTakeover: boolean;
    conversationId?: number;
    messageContent?: string;
    senderName?: string;
    senderType?: string;
    contactPhone?: string;
    labels?: string[];
  } {
    const event = payload.event || '';
    const message = payload.message;
    const conversation = payload.conversation || (message as any)?.conversation;

    // Detectar se é mensagem de agente (outgoing = agente respondeu)
    const isAgentMessage = event === 'message_created' &&
      message?.message_type === 'outgoing' &&
      !message?.private &&
      message?.sender?.type !== 'contact';

    // Detectar human takeover por label "humano"
    const labels = conversation?.labels || [];
    const isHumanTakeover = labels.some(
      (l: string) => l.toLowerCase() === 'humano' || l.toLowerCase() === 'human'
    );

    // Extrair telefone do contato
    let contactPhone: string | undefined;
    if (payload.contact?.phone_number) {
      contactPhone = payload.contact.phone_number.replace(/[^\d]/g, '');
    } else if (conversation?.meta?.sender?.phone_number) {
      contactPhone = (conversation.meta.sender.phone_number as string).replace(/[^\d]/g, '');
    }

    return {
      event,
      isAgentMessage,
      isHumanTakeover,
      conversationId: conversation?.id || message?.conversation_id,
      messageContent: message?.content,
      senderName: message?.sender?.name,
      senderType: message?.sender?.type,
      contactPhone,
      labels,
    };
  }

  /**
   * Sincroniza uma mensagem recebida do WhatsApp para o Chatwoot.
   * Cria contato e conversa se necessário.
   */
  async syncIncomingMessage(
    phone: string,
    contactName: string,
    messageContent: string,
    inboxId?: number
  ): Promise<{ contact: ChatwootContact; conversation: ChatwootConversation; message: ChatwootMessage }> {
    // 1. Criar ou encontrar contato
    const contact = await this.findOrCreateContact(contactName, phone);
    if (!contact.id) throw new Error('Falha ao criar contato no Chatwoot');

    // 2. Criar ou encontrar conversa
    const conversation = await this.findOrCreateConversation(contact.id, inboxId);

    // 3. Enviar mensagem como incoming (do cliente)
    const message = await this.sendMessage(
      conversation.id,
      messageContent,
      'incoming'
    );

    return { contact, conversation, message };
  }

  /**
   * Sincroniza uma mensagem com mídia (áudio, imagem, vídeo, documento) para o Chatwoot.
   * Baixa a mídia e envia como anexo via multipart/form-data.
   *
   * @param phone - Número de telefone do remetente
   * @param contactName - Nome do contato
   * @param messageContent - Texto da mensagem (ou transcrição para áudio)
   * @param mediaBuffer - Buffer do arquivo de mídia
   * @param mediaFilename - Nome do arquivo
   * @param mediaMimeType - MIME type do arquivo
   * @param inboxId - ID da inbox (opcional)
   */
  async syncIncomingMediaMessage(
    phone: string,
    contactName: string,
    messageContent: string,
    mediaBuffer: Buffer,
    mediaFilename: string,
    mediaMimeType: string,
    inboxId?: number
  ): Promise<{ contact: ChatwootContact; conversation: ChatwootConversation; message: ChatwootMessage }> {
    // 1. Criar ou encontrar contato
    const contact = await this.findOrCreateContact(contactName, phone);
    if (!contact.id) throw new Error('Falha ao criar contato no Chatwoot');

    // 2. Criar ou encontrar conversa
    const conversation = await this.findOrCreateConversation(contact.id, inboxId);

    // 3. Enviar mensagem com arquivo anexo como incoming
    const message = await this.sendMessageWithFile(
      conversation.id,
      messageContent,
      mediaBuffer,
      mediaFilename,
      mediaMimeType,
      'incoming'
    );

    return { contact, conversation, message };
  }

  /**
   * Sincroniza uma mensagem enviada pelo bot/sistema para o Chatwoot.
   */
  async syncOutgoingMessage(
    conversationId: number,
    messageContent: string,
    isPrivate: boolean = false
  ): Promise<ChatwootMessage> {
    return this.sendMessage(conversationId, messageContent, 'outgoing', isPrivate);
  }
}

// === Factory ===

export function createChatwootService(config: ChatwootConfig): ChatwootService {
  return new ChatwootService(config);
}
