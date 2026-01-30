/**
 * Asaas Payment Service
 * Integração com a API do Asaas para processamento de pagamentos
 * Documentação: https://docs.asaas.com/
 */

interface AsaasCustomerData {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  postalCode?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
}

interface AsaasPaymentData {
  customer: string; // ID do cliente no Asaas
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  installmentCount?: number;
  installmentValue?: number;
  discount?: {
    value?: number;
    dueDateLimitDays?: number;
    type?: 'FIXED' | 'PERCENTAGE';
  };
  interest?: {
    value: number;
  };
  fine?: {
    value: number;
  };
  postalService?: boolean;
}

interface AsaasSubscriptionData {
  customer: string;
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
  description?: string;
  externalReference?: string;
  maxPayments?: number; // Número máximo de cobranças
}

export class AsaasService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    const apiKey = process.env.ASAAS_API_KEY;
    const environment = process.env.ASAAS_ENVIRONMENT || 'sandbox';

    if (!apiKey) {
      console.warn('⚠️ ASAAS_API_KEY não configurado. O serviço de pagamentos estará indisponível.');
    }

    this.apiKey = apiKey || '';
    this.baseUrl = environment === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3';
  }

  private checkAsaasAvailable() {
    if (!this.apiKey) {
      throw new Error('Asaas não está configurado. Configure ASAAS_API_KEY para usar funcionalidades de pagamento.');
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    this.checkAsaasAvailable();

    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'access_token': this.apiKey,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Erro na API Asaas:', data);
      throw new Error(data.errors?.[0]?.description || 'Erro na comunicação com Asaas');
    }

    return data;
  }

  /**
   * Cria um cliente no Asaas
   */
  async createCustomer(data: AsaasCustomerData) {
    console.log('🔄 Criando cliente no Asaas:', data.name);

    const customer = await this.request('/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    console.log('✅ Cliente criado no Asaas:', customer.id);
    return customer;
  }

  /**
   * Atualiza um cliente no Asaas
   */
  async updateCustomer(customerId: string, data: Partial<AsaasCustomerData>) {
    console.log('🔄 Atualizando cliente no Asaas:', customerId);

    const customer = await this.request(`/customers/${customerId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    console.log('✅ Cliente atualizado no Asaas:', customerId);
    return customer;
  }

  /**
   * Busca um cliente no Asaas
   */
  async getCustomer(customerId: string) {
    return await this.request(`/customers/${customerId}`, {
      method: 'GET',
    });
  }

  /**
   * Cria uma cobrança única no Asaas
   */
  async createPayment(data: AsaasPaymentData) {
    console.log('🔄 Criando cobrança no Asaas para cliente:', data.customer);

    const payment = await this.request('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    console.log('✅ Cobrança criada no Asaas:', payment.id);
    return payment;
  }

  /**
   * Busca uma cobrança no Asaas
   */
  async getPayment(paymentId: string) {
    return await this.request(`/payments/${paymentId}`, {
      method: 'GET',
    });
  }

  /**
   * Cria uma assinatura recorrente no Asaas
   */
  async createSubscription(data: AsaasSubscriptionData) {
    console.log('🔄 Criando assinatura no Asaas para cliente:', data.customer);

    const subscription = await this.request('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    console.log('✅ Assinatura criada no Asaas:', subscription.id);
    return subscription;
  }

  /**
   * Busca uma assinatura no Asaas
   */
  async getSubscription(subscriptionId: string) {
    return await this.request(`/subscriptions/${subscriptionId}`, {
      method: 'GET',
    });
  }

  /**
   * Cancela uma assinatura no Asaas
   */
  async cancelSubscription(subscriptionId: string) {
    console.log('🔄 Cancelando assinatura no Asaas:', subscriptionId);

    const subscription = await this.request(`/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
    });

    console.log('✅ Assinatura cancelada no Asaas:', subscriptionId);
    return subscription;
  }

  /**
   * Atualiza uma assinatura no Asaas
   */
  async updateSubscription(subscriptionId: string, data: Partial<AsaasSubscriptionData>) {
    console.log('🔄 Atualizando assinatura no Asaas:', subscriptionId);

    const subscription = await this.request(`/subscriptions/${subscriptionId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    console.log('✅ Assinatura atualizada no Asaas:', subscriptionId);
    return subscription;
  }

  /**
   * Gera QR Code PIX para uma cobrança
   */
  async getPixQrCode(paymentId: string) {
    console.log('🔄 Gerando QR Code PIX para cobrança:', paymentId);

    const pixData = await this.request(`/payments/${paymentId}/pixQrCode`, {
      method: 'GET',
    });

    console.log('✅ QR Code PIX gerado para cobrança:', paymentId);
    return pixData;
  }

  /**
   * Processa webhook do Asaas
   */
  async handleWebhook(payload: any, asaasSignature: string) {
    console.log('🔄 Processando webhook do Asaas');

    // TODO: Implementar validação de assinatura do webhook
    // A validação deve ser feita usando o access token configurado

    console.log('📨 Evento do webhook:', payload.event);
    return payload;
  }

  /**
   * Lista cobranças de um cliente
   */
  async listCustomerPayments(customerId: string, options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams({
      customer: customerId,
      ...(options?.status && { status: options.status }),
      ...(options?.limit && { limit: options.limit.toString() }),
      ...(options?.offset && { offset: options.offset.toString() }),
    });

    return await this.request(`/payments?${params.toString()}`, {
      method: 'GET',
    });
  }

  /**
   * Lista todas as assinaturas
   */
  async listSubscriptions(options?: {
    customer?: string;
    billingType?: string;
    status?: string;
    deletedOnly?: boolean;
    externalReference?: string;
    offset?: number;
    limit?: number;
  }) {
    console.log('🔄 Listando assinaturas do Asaas');

    const params = new URLSearchParams();

    if (options?.customer) params.append('customer', options.customer);
    if (options?.billingType) params.append('billingType', options.billingType);
    if (options?.status) params.append('status', options.status);
    if (options?.deletedOnly) params.append('deletedOnly', 'true');
    if (options?.externalReference) params.append('externalReference', options.externalReference);
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.limit) params.append('limit', options.limit.toString());

    const endpoint = params.toString() ? `/subscriptions?${params.toString()}` : '/subscriptions';

    const response = await this.request(endpoint, {
      method: 'GET',
    });

    console.log('✅ Assinaturas listadas:', response.totalCount || response.data?.length || 0);
    return response;
  }
}

export const asaasService = new AsaasService();
export default asaasService;
