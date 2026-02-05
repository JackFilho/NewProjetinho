import { Router } from "express";
import storage from "./storage";
import { z } from "zod";

const router = Router();

// URL da API do Mercado Pago (mesma para sandbox e produção, o token diferencia)
const MP_API_URL = 'https://api.mercadopago.com';

// Lock em memória para evitar processamento duplicado de webhooks (race condition)
const processingPayments = new Set<string>();

// Interface para cobrança PIX
interface PixPayment {
  id: string;
  value: number;
  pixQrCode: {
    encodedImage: string; // QR Code em base64
    payload: string; // Código copia e cola
    expirationDate: string;
  };
}

// Interface para cobrança de cartão (link)
interface CardPayment {
  id: string;
  invoiceUrl: string; // Link para pagamento
  value: number;
}

/**
 * Agenda verificação de expiração do PIX após 10 minutos.
 * Se o pagamento não foi confirmado, envia mensagem ao cliente.
 */
export function schedulePixExpirationCheck(
  paymentId: string,
  companyId: number,
  clientPhone: string,
  conversationId?: number,
) {
  const EXPIRATION_MS = 10 * 60 * 1000 + 30 * 1000; // 10min30s (margem de 30s)

  setTimeout(async () => {
    try {
      console.log(`[PIX Expiration] Verificando pagamento ${paymentId}...`);

      // Verificar se já foi criado agendamento para este pagamento
      const existingAppointments = await storage.getAppointmentsByPaymentId(paymentId);
      if (existingAppointments && existingAppointments.length > 0) {
        console.log(`[PIX Expiration] Pagamento ${paymentId} já confirmado - agendamento ${existingAppointments[0].id} existe.`);
        return;
      }

      // Pagamento não foi confirmado - enviar mensagem
      console.log(`[PIX Expiration] Pagamento ${paymentId} NÃO confirmado - enviando aviso de expiração.`);

      const globalSettings = await storage.getGlobalSettings();
      const instances = await storage.getWhatsappInstancesByCompany(companyId);
      const activeInstance = instances[0];

      if (globalSettings?.evolutionApiUrl && globalSettings?.evolutionApiGlobalKey && activeInstance) {
        let formattedPhone = clientPhone.replace(/\D/g, '');
        if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10) {
          formattedPhone = '55' + formattedPhone;
        }

        let apiUrl = globalSettings.evolutionApiUrl.replace(/\/+$/, '');

        const expirationMsg = `⏰ *Tempo de pagamento expirado*\n\nO prazo de 10 minutos para o pagamento via PIX se encerrou e o agendamento não foi realizado.\n\nCaso ainda deseje agendar, é só enviar uma nova mensagem que estaremos prontos para atendê-lo! 😊`;

        await fetch(`${apiUrl}/message/sendText/${activeInstance.instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': globalSettings.evolutionApiGlobalKey
          },
          body: JSON.stringify({
            number: formattedPhone,
            text: expirationMsg
          })
        });

        console.log(`[PIX Expiration] Mensagem de expiração enviada para ${formattedPhone}`);

        // Salvar mensagem na conversa
        if (conversationId) {
          await storage.createMessage({
            conversationId,
            content: expirationMsg,
            role: 'assistant',
            messageType: 'text',
            delivered: true,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error(`[PIX Expiration] Erro ao verificar expiração do pagamento ${paymentId}:`, error);
    }
  }, EXPIRATION_MS);

  console.log(`[PIX Expiration] Verificação agendada para pagamento ${paymentId} em ~10min30s`);
}

/**
 * Cria cobrança PIX e retorna QR Code via Mercado Pago
 * Não precisa de CPF - o QR Code vem direto na resposta!
 */
export async function createPixPayment(
  companyId: number,
  paymentData: {
    clientName: string;
    clientPhone: string;
    clientEmail?: string;
    serviceName: string;
    servicePrice: number;
    appointmentId?: number;
    externalReference?: string;
  }
): Promise<PixPayment | null> {
  try {
    const company = await storage.getCompany(companyId);

    if (!company || !company.asaasApiKey || !company.asaasEnabled) {
      console.error('[MercadoPago] Empresa não tem pagamento configurado ou habilitado');
      return null;
    }

    const accessToken = company.asaasApiKey;

    // Limitar externalReference a 256 caracteres (limite do Mercado Pago)
    let externalRef = paymentData.externalReference || `appointment_${paymentData.appointmentId || Date.now()}`;
    if (externalRef.length > 256) {
      // Tentar compactar o JSON mantendo apenas campos essenciais para o webhook
      try {
        const parsed = JSON.parse(externalRef);
        if (parsed.type === 'pending_appointment') {
          const compact: any = {
            type: 'pending_appointment',
            companyId: parsed.companyId,
            clientName: (parsed.clientName || '').substring(0, 30),
            clientPhone: parsed.clientPhone,
            serviceId: parsed.serviceId,
            servicePrice: parsed.servicePrice,
            professionalId: parsed.professionalId,
            date: parsed.date || parsed.appointmentDate || '',
            time: parsed.time || parsed.appointmentTime || '',
          };
          // Adicionar campos opcionais se couber
          const base = JSON.stringify(compact);
          if (base.length <= 256) {
            if (parsed.serviceName) compact.serviceName = parsed.serviceName.substring(0, 30);
            if (parsed.professionalName) compact.professionalName = parsed.professionalName.substring(0, 30);
            if (parsed.conversationId) compact.conversationId = parsed.conversationId;
            if (parsed.instanceName) compact.instanceName = parsed.instanceName;
            // Verificar se ainda cabe
            let result = JSON.stringify(compact);
            while (result.length > 256 && Object.keys(compact).length > 8) {
              // Remover último campo opcional adicionado
              const keys = Object.keys(compact);
              delete compact[keys[keys.length - 1]];
              result = JSON.stringify(compact);
            }
            externalRef = result;
          } else {
            externalRef = base.substring(0, 256);
          }
          console.log(`[MercadoPago] externalReference compactado: ${externalRef.length} chars`);
        }
      } catch (e) {
        externalRef = externalRef.substring(0, 256);
        console.log('[MercadoPago] externalReference truncado para 256 chars');
      }
    }
    console.log(`[MercadoPago] externalReference (${externalRef.length} chars):`, externalRef);

    // Buscar URL do sistema para webhook
    const globalSettings = await storage.getGlobalSettings();
    const systemUrl = globalSettings?.systemUrl || '';

    // Montar payload - Mercado Pago PIX não precisa de CPF!
    // Expiração em 10 minutos
    const expirationDate = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const paymentPayload: any = {
      transaction_amount: Number(paymentData.servicePrice),
      description: `${company.fantasyName || 'Pagamento'} - ${paymentData.serviceName}`,
      payment_method_id: 'pix',
      date_of_expiration: expirationDate,
      payer: {
        email: paymentData.clientEmail || `cliente_${Date.now()}@pagamento.com`,
        first_name: paymentData.clientName.split(' ')[0] || 'Cliente',
        last_name: paymentData.clientName.split(' ').slice(1).join(' ') || '',
      },
      external_reference: externalRef,
    };

    // Adicionar URL de notificação se systemUrl estiver configurada
    if (systemUrl) {
      paymentPayload.notification_url = `${systemUrl}/api/webhook/mercadopago/${companyId}`;
      console.log('[MercadoPago] Webhook URL:', paymentPayload.notification_url);
    }

    console.log('[MercadoPago] Criando cobrança PIX:', JSON.stringify(paymentPayload, null, 2));

    const response = await fetch(`${MP_API_URL}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': `pix_${companyId}_${Date.now()}`,
      },
      body: JSON.stringify(paymentPayload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[MercadoPago] Erro ao criar cobrança PIX:', response.status, errorData);
      return null;
    }

    const payment = await response.json();
    console.log('[MercadoPago] Cobrança PIX criada:', payment.id, 'Status:', payment.status);

    // O QR Code vem direto na resposta do Mercado Pago!
    const transactionData = payment.point_of_interaction?.transaction_data;

    if (!transactionData) {
      console.error('[MercadoPago] Resposta não contém dados do PIX');
      return null;
    }

    console.log('[MercadoPago] QR Code PIX gerado com sucesso');

    return {
      id: String(payment.id),
      value: payment.transaction_amount,
      pixQrCode: {
        encodedImage: transactionData.qr_code_base64,
        payload: transactionData.qr_code,
        expirationDate: payment.date_of_expiration || expirationDate,
      },
    };
  } catch (error) {
    console.error('[MercadoPago] Erro ao criar cobrança PIX:', error);
    return null;
  }
}

/**
 * Cria link de pagamento com cartão via Mercado Pago (Checkout Pro)
 */
export async function createCardPayment(
  companyId: number,
  paymentData: {
    clientName: string;
    clientPhone: string;
    clientEmail?: string;
    serviceName: string;
    servicePrice: number;
    appointmentId?: number;
    externalReference?: string;
  }
): Promise<CardPayment | null> {
  try {
    const company = await storage.getCompany(companyId);

    if (!company || !company.asaasApiKey || !company.asaasEnabled) {
      console.error('[MercadoPago] Empresa não tem pagamento configurado ou habilitado');
      return null;
    }

    const accessToken = company.asaasApiKey;

    // Limitar externalReference a 256 caracteres
    let externalRef = paymentData.externalReference || `appointment_${paymentData.appointmentId || Date.now()}`;
    if (externalRef.length > 256) {
      try {
        const parsed = JSON.parse(externalRef);
        if (parsed.type === 'pending_appointment') {
          const compact: any = {
            type: 'pending_appointment',
            companyId: parsed.companyId,
            clientName: (parsed.clientName || '').substring(0, 30),
            clientPhone: parsed.clientPhone,
            serviceId: parsed.serviceId,
            servicePrice: parsed.servicePrice,
            professionalId: parsed.professionalId,
            date: parsed.date || parsed.appointmentDate || '',
            time: parsed.time || parsed.appointmentTime || '',
          };
          const base = JSON.stringify(compact);
          if (base.length <= 256) {
            if (parsed.serviceName) compact.serviceName = parsed.serviceName.substring(0, 30);
            if (parsed.professionalName) compact.professionalName = parsed.professionalName.substring(0, 30);
            if (parsed.conversationId) compact.conversationId = parsed.conversationId;
            if (parsed.instanceName) compact.instanceName = parsed.instanceName;
            let result = JSON.stringify(compact);
            while (result.length > 256 && Object.keys(compact).length > 8) {
              const keys = Object.keys(compact);
              delete compact[keys[keys.length - 1]];
              result = JSON.stringify(compact);
            }
            externalRef = result;
          } else {
            externalRef = base.substring(0, 256);
          }
          console.log(`[MercadoPago] externalReference compactado: ${externalRef.length} chars`);
        }
      } catch (e) {
        externalRef = externalRef.substring(0, 256);
      }
    }

    // Buscar URL do sistema para webhook
    const globalSettings = await storage.getGlobalSettings();
    const systemUrl = globalSettings?.systemUrl || '';

    // Criar preferência de checkout (Checkout Pro)
    const preferencePayload: any = {
      items: [{
        title: `${company.fantasyName || 'Pagamento'} - ${paymentData.serviceName}`,
        quantity: 1,
        unit_price: Number(paymentData.servicePrice),
        currency_id: 'BRL',
      }],
      payer: {
        email: paymentData.clientEmail || `cliente_${Date.now()}@pagamento.com`,
        name: paymentData.clientName,
      },
      external_reference: externalRef,
      payment_methods: {
        excluded_payment_methods: [],
        excluded_payment_types: [{ id: 'ticket' }], // Excluir boleto
        installments: 12,
      },
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    // Adicionar URL de notificação se systemUrl estiver configurada
    if (systemUrl) {
      preferencePayload.notification_url = `${systemUrl}/api/webhook/mercadopago/${companyId}`;
      console.log('[MercadoPago] Webhook URL:', preferencePayload.notification_url);
    }

    console.log('[MercadoPago] Criando preferência de checkout:', JSON.stringify(preferencePayload, null, 2));

    const response = await fetch(`${MP_API_URL}/checkout/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferencePayload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[MercadoPago] Erro ao criar preferência:', response.status, errorData);
      return null;
    }

    const preference = await response.json();
    console.log('[MercadoPago] Preferência criada:', preference.id, 'Link:', preference.init_point);

    return {
      id: preference.id,
      invoiceUrl: preference.init_point,
      value: paymentData.servicePrice,
    };
  } catch (error) {
    console.error('[MercadoPago] Erro ao criar link de cartão:', error);
    return null;
  }
}

/**
 * Verifica se empresa tem pagamento configurado e habilitado
 */
export async function isPaymentEnabled(companyId: number): Promise<boolean> {
  try {
    const company = await storage.getCompany(companyId);
    return !!(company?.asaasApiKey && company?.asaasEnabled);
  } catch (error) {
    console.error('[MercadoPago] Erro ao verificar configuração:', error);
    return false;
  }
}

// Middleware para verificar autenticação da empresa
function requireCompanyAuth(req: any, res: any, next: any) {
  if (!req.session.companyId) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  next();
}

// Schema de validação (reutiliza campos do banco)
const paymentConfigSchema = z.object({
  asaasApiKey: z.string().min(1),
  asaasEnvironment: z.enum(["sandbox", "production"]).optional(),
  asaasEnabled: z.boolean().optional(),
});

// GET - Obter configurações de pagamento
router.get("/api/company/asaas-config", requireCompanyAuth, async (req: any, res: any) => {
  try {
    const companyId = req.session.companyId;
    const company = await storage.getCompany(companyId);

    if (!company) {
      return res.status(404).json({ error: "Empresa não encontrada" });
    }

    const config = {
      asaasApiKey: company.asaasApiKey ? `${company.asaasApiKey.slice(0, 15)}...` : null,
      asaasEnvironment: company.asaasEnvironment,
      asaasEnabled: company.asaasEnabled,
      hasApiKey: !!company.asaasApiKey,
    };

    res.json(config);
  } catch (error) {
    console.error("Erro ao buscar configurações de pagamento:", error);
    res.status(500).json({ error: "Erro ao buscar configurações" });
  }
});

// PUT - Atualizar configurações de pagamento
router.put("/api/company/asaas-config", requireCompanyAuth, async (req: any, res: any) => {
  try {
    const companyId = req.session.companyId;
    const validatedData = paymentConfigSchema.parse(req.body);

    await storage.updateCompany(companyId, {
      asaasApiKey: validatedData.asaasApiKey,
      asaasEnvironment: validatedData.asaasEnvironment,
      asaasEnabled: validatedData.asaasEnabled,
    });

    res.json({
      success: true,
      message: "Configurações de pagamento atualizadas com sucesso"
    });
  } catch (error) {
    console.error("Erro ao atualizar configurações de pagamento:", error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Dados inválidos",
        details: error.errors
      });
    }

    res.status(500).json({ error: "Erro ao atualizar configurações" });
  }
});

// POST - Webhook do Mercado Pago
router.post("/api/webhook/mercadopago/:companyId", async (req: any, res: any) => {
  try {
    const { companyId } = req.params;
    const notification = req.body;

    console.log(`[MP Webhook] ========================================`);
    console.log(`[MP Webhook] Notificação recebida para empresa ${companyId}`);
    console.log(`[MP Webhook] Body:`, JSON.stringify(notification, null, 2));
    console.log(`[MP Webhook] Query:`, JSON.stringify(req.query, null, 2));
    console.log(`[MP Webhook] ========================================`);

    // Mercado Pago envia diferentes formatos de notificação
    let paymentId: string | null = null;

    // Formato IPN v2: { action: "payment.updated", data: { id: "123" } }
    if (notification.data?.id) {
      paymentId = String(notification.data.id);
    }
    // Formato IPN v1: { topic: "payment", resource: "https://...payments/123" }
    else if (notification.resource) {
      const parts = notification.resource.split('/');
      paymentId = parts[parts.length - 1];
    }
    // Formato query string: ?id=123&topic=payment
    else if (req.query?.id && req.query?.topic === 'payment') {
      paymentId = String(req.query.id);
    }
    // Formato merchant_order - precisa buscar os pagamentos
    else if (req.query?.topic === 'merchant_order' || notification.topic === 'merchant_order') {
      console.log('[MP Webhook] Notificação merchant_order - ignorando (processamos apenas payment)');
      return res.status(200).json({ received: true });
    }

    if (!paymentId) {
      console.log('[MP Webhook] Notificação sem payment ID - ignorando');
      return res.status(200).json({ received: true });
    }

    // Verificar se a empresa existe e tem pagamento habilitado
    const company = await storage.getCompany(parseInt(companyId));

    if (!company || !company.asaasEnabled || !company.asaasApiKey) {
      console.log(`[MP Webhook] Empresa ${companyId} não encontrada ou pagamento desabilitado`);
      return res.status(200).json({ received: true });
    }

    // Buscar detalhes do pagamento na API do Mercado Pago
    const paymentResponse = await fetch(`${MP_API_URL}/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${company.asaasApiKey}`,
      },
    });

    if (!paymentResponse.ok) {
      console.error(`[MP Webhook] Erro ao buscar pagamento ${paymentId}:`, paymentResponse.status);
      return res.status(200).json({ received: true });
    }

    const payment = await paymentResponse.json();
    console.log(`[MP Webhook] Pagamento ${paymentId} - Status: ${payment.status}`);

    // Processar pagamento aprovado
    if (payment.status === 'approved') {
      console.log(`[MP Webhook] Pagamento APROVADO: ${paymentId}`);

      // === PROTEÇÃO CONTRA DUPLICAÇÃO (LOCK + DB) ===
      // 1. Lock em memória: impede race condition quando 2 webhooks chegam ao mesmo tempo
      if (processingPayments.has(paymentId)) {
        console.log(`[MP Webhook] ⚠️ Pagamento ${paymentId} já está sendo processado (lock ativo). Ignorando.`);
        return res.status(200).json({ received: true, duplicate: true });
      }
      processingPayments.add(paymentId);

      try {
      // 2. Verificação no banco: impede duplicação se o servidor reiniciou entre os webhooks
      const existingAppointments = await storage.getAppointmentsByPaymentId(paymentId);
      if (existingAppointments && existingAppointments.length > 0) {
        console.log(`[MP Webhook] ⚠️ Pagamento ${paymentId} já processado - agendamento ID ${existingAppointments[0].id} já existe. Ignorando duplicata.`);
        processingPayments.delete(paymentId);
        return res.status(200).json({ received: true, duplicate: true });
      }

      const externalRef = payment.external_reference;
      console.log(`[MP Webhook] External Reference:`, externalRef);

      // Tentar parsear como JSON (dados do agendamento pendente)
      try {
        const pendingData = JSON.parse(externalRef);
        console.log(`[MP Webhook] Dados parseados:`, JSON.stringify(pendingData, null, 2));

        if (pendingData.type === 'pending_appointment') {
          console.log(`[MP Webhook] Tipo pending_appointment detectado - criando agendamento...`);

          // Converter data - pode vir como DD/MM/YYYY ou YYYY-MM-DD
          let appointmentDate = '';
          const dateValue = pendingData.date || pendingData.appointmentDate || '';
          if (dateValue) {
            if (dateValue.includes('/')) {
              // Formato DD/MM/YYYY → YYYY-MM-DD
              const dateParts = dateValue.split('/');
              if (dateParts.length === 3) {
                appointmentDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
              }
            } else {
              // Já está em YYYY-MM-DD
              appointmentDate = dateValue;
            }
          }
          const appointmentTime = pendingData.time || pendingData.appointmentTime || '';
          console.log(`[MP Webhook] Data: ${appointmentDate}, Hora: ${appointmentTime}`);

          // === BUSCAR DADOS REAIS DO SERVIÇO (duration + price) ===
          let serviceDuration = 30; // default 30 minutos
          let servicePrice = '0.00';
          if (pendingData.serviceId) {
            try {
              const serviceData = await storage.getService(pendingData.serviceId);
              if (serviceData) {
                serviceDuration = serviceData.duration || 30;
                servicePrice = serviceData.price ? String(serviceData.price) : '0.00';
                console.log(`[MP Webhook] Serviço encontrado: duration=${serviceDuration}, price=${servicePrice}`);
              } else {
                console.log(`[MP Webhook] Serviço ${pendingData.serviceId} não encontrado, usando defaults`);
              }
            } catch (e) {
              console.log(`[MP Webhook] Erro ao buscar serviço ${pendingData.serviceId}, usando defaults`);
            }
          }

          // Criar o agendamento com paymentId para controle de idempotência
          await storage.createAppointment({
            companyId: pendingData.companyId,
            professionalId: pendingData.professionalId || null,
            serviceId: pendingData.serviceId,
            clientName: pendingData.clientName,
            clientPhone: pendingData.clientPhone,
            appointmentDate: appointmentDate,
            appointmentTime: appointmentTime,
            status: 'Confirmado',
            duration: serviceDuration,
            totalPrice: servicePrice,
            asaasPaymentId: paymentId,
            asaasPaymentStatus: 'approved',
          });

          console.log(`[MP Webhook] ✅ Agendamento criado com sucesso! (paymentId: ${paymentId})`);

          // Enviar mensagem de confirmação via WhatsApp
          try {
            const globalSettings = await storage.getGlobalSettings();
            const instances = await storage.getWhatsappInstancesByCompany(pendingData.companyId);
            const activeInstance = instances[0];

            if (globalSettings?.evolutionApiUrl && globalSettings?.evolutionApiGlobalKey && activeInstance) {
              let formattedPhone = pendingData.clientPhone.replace(/\D/g, '');
              if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10) {
                formattedPhone = '55' + formattedPhone;
              }

              // Buscar nome do profissional do banco para garantir dado correto
              let professionalName = pendingData.professionalName || '';
              if (pendingData.professionalId && !professionalName) {
                try {
                  const prof = await storage.getProfessional(pendingData.professionalId);
                  if (prof) professionalName = prof.name;
                } catch (e) { /* usar fallback */ }
              }

              // Formatar data com dia da semana
              const diasSemana = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
              const dateForDisplay = appointmentDate || pendingData.date || '';
              let formattedDateDisplay = dateForDisplay;
              try {
                // appointmentDate está em YYYY-MM-DD
                const [year, month, day] = dateForDisplay.split('-').map(Number);
                const dateObj = new Date(year, month - 1, day);
                const diaSemana = diasSemana[dateObj.getDay()];
                formattedDateDisplay = `${diaSemana}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
              } catch (e) { /* usar data sem dia da semana */ }

              const timeForDisplay = appointmentTime || pendingData.time || '';
              const profPart = professionalName ? ` com ${professionalName}` : '';

              const confirmationMessage = `*Pagamento Confirmado!* ✅\n\nAgendamento realizado com sucesso! Nos vemos no dia ${formattedDateDisplay} às ${timeForDisplay}${profPart}.`;

              let apiUrl = globalSettings.evolutionApiUrl;
              apiUrl = apiUrl.replace(/\/+$/, '');

              await fetch(`${apiUrl}/message/sendText/${activeInstance.instanceName}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': globalSettings.evolutionApiGlobalKey
                },
                body: JSON.stringify({
                  number: formattedPhone,
                  text: confirmationMessage
                })
              });

              console.log(`[MP Webhook] Mensagem de confirmação enviada para ${formattedPhone}`);

              if (pendingData.conversationId) {
                await storage.createMessage({
                  conversationId: pendingData.conversationId,
                  content: confirmationMessage,
                  role: 'assistant',
                  messageType: 'text',
                  delivered: true,
                  timestamp: new Date(),
                });
              }
            }
          } catch (msgError) {
            console.error(`[MP Webhook] Erro ao enviar mensagem de confirmação:`, msgError);
          }
        }
      } catch (parseError: any) {
        console.log(`[MP Webhook] external_reference não é JSON válido:`, parseError.message);
        // Formato simples: appointment_ID
        if (externalRef && externalRef.startsWith('appointment_')) {
          const appointmentId = parseInt(externalRef.split('_')[1]);
          if (!isNaN(appointmentId)) {
            console.log(`[MP Webhook] Formato simples - Confirmando agendamento ${appointmentId}`);
            await storage.updateAppointment(appointmentId, { status: 'Confirmado' });
          }
        }
      }
      } finally {
        // Sempre liberar o lock ao finalizar processamento
        processingPayments.delete(paymentId);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error("[MP Webhook] Erro ao processar webhook:", error);
    res.status(200).json({ received: true }); // Sempre retornar 200 para o MP não reenviar
  }
});

// Manter rota antiga do Asaas para não quebrar webhooks pendentes
router.post("/api/webhook/asaas/:companyId", async (req: any, res: any) => {
  console.log('[Webhook] Rota Asaas descontinuada - redirecionando para Mercado Pago');
  res.status(200).json({ received: true, deprecated: true });
});

export default router;
