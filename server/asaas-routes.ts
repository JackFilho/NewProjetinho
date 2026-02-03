import { Router } from "express";
import { eq } from "drizzle-orm";
import { companies, appointments, whatsappInstances } from "@shared/schema";
import storage, { db } from "./storage";
import { z } from "zod";

const router = Router();

// Interface para o retorno da criação do link de pagamento
interface AsaasPaymentLink {
  id: string;
  url: string;
  billingType: string;
  chargeType: string;
  value: number;
  description: string;
  expirationDate?: string;
}

// Interface para cobrança PIX
interface AsaasPixPayment {
  id: string;
  value: number;
  pixQrCode: {
    encodedImage: string; // QR Code em base64
    payload: string; // Código copia e cola
    expirationDate: string;
  };
}

// Interface para cobrança de cartão (link)
interface AsaasCreditCardPayment {
  id: string;
  invoiceUrl: string; // Link para pagamento
  value: number;
}

// Função helper para obter a URL base do Asaas
function getAsaasApiUrl(environment: string = 'production'): string {
  return environment === 'sandbox'
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/api/v3';
}

// Função para criar link de pagamento no Asaas
export async function createAsaasPaymentLink(
  companyId: number,
  appointmentData: {
    clientName: string;
    clientCpf?: string;
    clientEmail?: string;
    clientPhone: string;
    serviceName: string;
    servicePrice: number;
    appointmentId?: number;
    externalReference?: string;
  }
): Promise<AsaasPaymentLink | null> {
  try {
    // Buscar configurações do Asaas da empresa
    const company = await db
      .select({
        name: companies.name,
        asaasApiKey: companies.asaasApiKey,
        asaasEnvironment: companies.asaasEnvironment,
        asaasEnabled: companies.asaasEnabled,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company[0] || !company[0].asaasApiKey || !company[0].asaasEnabled) {
      console.error('[Asaas] Empresa não tem Asaas configurado ou habilitado');
      return null;
    }

    const apiUrl = getAsaasApiUrl(company[0].asaasEnvironment || 'production');

    // Preparar dados do link de pagamento
    const paymentLinkData = {
      name: `${company[0].name} - ${appointmentData.serviceName}`,
      description: `Pagamento do serviço: ${appointmentData.serviceName}`,
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Expira em 24h
      value: appointmentData.servicePrice,
      billingType: "UNDEFINED", // Cliente escolhe forma de pagamento
      chargeType: "DETACHED",
      maxInstallmentCount: 1,
      notificationEnabled: true,
      // Adicionar referência externa para rastrear o agendamento
      externalReference: appointmentData.externalReference || `appointment_${appointmentData.appointmentId || Date.now()}`,
    };

    console.log('[Asaas] Criando link de pagamento:', paymentLinkData);

    // Fazer requisição para criar o link
    const response = await fetch(`${apiUrl}/paymentLinks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': company[0].asaasApiKey,
      },
      body: JSON.stringify(paymentLinkData),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[Asaas] Erro ao criar link de pagamento:', response.status, errorData);
      return null;
    }

    const result = await response.json();
    console.log('[Asaas] Link de pagamento criado com sucesso:', result);

    return {
      id: result.id,
      url: result.url,
      billingType: result.billingType,
      chargeType: result.chargeType,
      value: result.value,
      description: result.description,
      expirationDate: result.endDate,
    };
  } catch (error) {
    console.error('[Asaas] Erro ao criar link de pagamento:', error);
    return null;
  }
}

/**
 * Cria ou busca cliente no Asaas
 */
async function getOrCreateAsaasCustomer(
  apiKey: string,
  apiUrl: string,
  clientData: {
    name: string;
    phone: string;
    cpf?: string;
    email?: string;
  }
): Promise<string | null> {
  try {
    // Primeiro, buscar se já existe um cliente com esse telefone
    const searchResponse = await fetch(`${apiUrl}/customers?mobilePhone=${clientData.phone.replace(/\D/g, '')}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
    });

    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      if (searchResult.data && searchResult.data.length > 0) {
        console.log('[Asaas] Cliente já existe:', searchResult.data[0].id);
        return searchResult.data[0].id;
      }
    }

    // Se não existe, criar novo cliente
    const customerData = {
      name: clientData.name,
      mobilePhone: clientData.phone.replace(/\D/g, ''),
      cpfCnpj: clientData.cpf?.replace(/\D/g, '') || undefined,
      email: clientData.email || undefined,
      notificationDisabled: true, // Desabilitar notificações do Asaas (vamos enviar pelo WhatsApp)
    };

    const createResponse = await fetch(`${apiUrl}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify(customerData),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.text();
      console.error('[Asaas] Erro ao criar cliente:', errorData);
      return null;
    }

    const customer = await createResponse.json();
    console.log('[Asaas] Cliente criado:', customer.id);
    return customer.id;
  } catch (error) {
    console.error('[Asaas] Erro ao buscar/criar cliente:', error);
    return null;
  }
}

/**
 * Cria cobrança PIX e retorna QR Code
 */
export async function createAsaasPixPayment(
  companyId: number,
  paymentData: {
    clientName: string;
    clientPhone: string;
    clientCpf?: string;
    clientEmail?: string;
    serviceName: string;
    servicePrice: number;
    appointmentId?: number;
    externalReference?: string;
  }
): Promise<AsaasPixPayment | null> {
  try {
    // Buscar configurações do Asaas da empresa
    const company = await db
      .select({
        name: companies.name,
        asaasApiKey: companies.asaasApiKey,
        asaasEnvironment: companies.asaasEnvironment,
        asaasEnabled: companies.asaasEnabled,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company[0] || !company[0].asaasApiKey || !company[0].asaasEnabled) {
      console.error('[Asaas] Empresa não tem Asaas configurado ou habilitado');
      return null;
    }

    const apiUrl = getAsaasApiUrl(company[0].asaasEnvironment || 'production');
    const apiKey = company[0].asaasApiKey;

    // Criar ou buscar cliente
    const customerId = await getOrCreateAsaasCustomer(apiKey, apiUrl, {
      name: paymentData.clientName,
      phone: paymentData.clientPhone,
      cpf: paymentData.clientCpf,
      email: paymentData.clientEmail,
    });

    if (!customerId) {
      console.error('[Asaas] Não foi possível criar/buscar cliente');
      return null;
    }

    // Criar cobrança PIX
    const dueDate = new Date();
    dueDate.setMinutes(dueDate.getMinutes() + 30); // Vencimento em 30 minutos

    const paymentPayload = {
      customer: customerId,
      billingType: 'PIX',
      value: paymentData.servicePrice,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `${company[0].name} - ${paymentData.serviceName}`,
      externalReference: paymentData.externalReference || `appointment_${paymentData.appointmentId || Date.now()}`,
    };

    console.log('[Asaas] Criando cobrança PIX:', paymentPayload);

    const paymentResponse = await fetch(`${apiUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.text();
      console.error('[Asaas] Erro ao criar cobrança PIX:', errorData);
      return null;
    }

    const payment = await paymentResponse.json();
    console.log('[Asaas] Cobrança PIX criada:', payment.id);

    // Buscar QR Code PIX
    const pixResponse = await fetch(`${apiUrl}/payments/${payment.id}/pixQrCode`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
    });

    if (!pixResponse.ok) {
      const errorData = await pixResponse.text();
      console.error('[Asaas] Erro ao buscar QR Code PIX:', errorData);
      return null;
    }

    const pixData = await pixResponse.json();
    console.log('[Asaas] QR Code PIX gerado com sucesso');

    return {
      id: payment.id,
      value: payment.value,
      pixQrCode: {
        encodedImage: pixData.encodedImage,
        payload: pixData.payload,
        expirationDate: pixData.expirationDate,
      },
    };
  } catch (error) {
    console.error('[Asaas] Erro ao criar cobrança PIX:', error);
    return null;
  }
}

/**
 * Cria cobrança de cartão de crédito e retorna link de pagamento
 */
export async function createAsaasCreditCardPayment(
  companyId: number,
  paymentData: {
    clientName: string;
    clientPhone: string;
    clientCpf?: string;
    clientEmail?: string;
    serviceName: string;
    servicePrice: number;
    appointmentId?: number;
    externalReference?: string;
  }
): Promise<AsaasCreditCardPayment | null> {
  try {
    // Buscar configurações do Asaas da empresa
    const company = await db
      .select({
        name: companies.name,
        asaasApiKey: companies.asaasApiKey,
        asaasEnvironment: companies.asaasEnvironment,
        asaasEnabled: companies.asaasEnabled,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company[0] || !company[0].asaasApiKey || !company[0].asaasEnabled) {
      console.error('[Asaas] Empresa não tem Asaas configurado ou habilitado');
      return null;
    }

    const apiUrl = getAsaasApiUrl(company[0].asaasEnvironment || 'production');
    const apiKey = company[0].asaasApiKey;

    // Criar ou buscar cliente
    const customerId = await getOrCreateAsaasCustomer(apiKey, apiUrl, {
      name: paymentData.clientName,
      phone: paymentData.clientPhone,
      cpf: paymentData.clientCpf,
      email: paymentData.clientEmail,
    });

    if (!customerId) {
      console.error('[Asaas] Não foi possível criar/buscar cliente');
      return null;
    }

    // Criar cobrança de cartão (UNDEFINED para gerar link)
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + 24); // Vencimento em 24 horas

    const paymentPayload = {
      customer: customerId,
      billingType: 'UNDEFINED', // Gera link onde cliente pode pagar com cartão
      value: paymentData.servicePrice,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `${company[0].name} - ${paymentData.serviceName}`,
      externalReference: paymentData.externalReference || `appointment_${paymentData.appointmentId || Date.now()}`,
    };

    console.log('[Asaas] Criando cobrança para cartão:', paymentPayload);

    const paymentResponse = await fetch(`${apiUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.text();
      console.error('[Asaas] Erro ao criar cobrança de cartão:', errorData);
      return null;
    }

    const payment = await paymentResponse.json();
    console.log('[Asaas] Cobrança de cartão criada:', payment.id, 'Link:', payment.invoiceUrl);

    return {
      id: payment.id,
      invoiceUrl: payment.invoiceUrl,
      value: payment.value,
    };
  } catch (error) {
    console.error('[Asaas] Erro ao criar cobrança de cartão:', error);
    return null;
  }
}

/**
 * Verifica se empresa tem Asaas configurado e habilitado
 */
export async function isAsaasEnabled(companyId: number): Promise<boolean> {
  try {
    const company = await db
      .select({
        asaasApiKey: companies.asaasApiKey,
        asaasEnabled: companies.asaasEnabled,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    return !!(company[0]?.asaasApiKey && company[0]?.asaasEnabled);
  } catch (error) {
    console.error('[Asaas] Erro ao verificar configuração:', error);
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

// Schema de validação
const asaasConfigSchema = z.object({
  asaasApiKey: z.string().min(1),
  asaasEnvironment: z.enum(["sandbox", "production"]).optional(),
  asaasEnabled: z.boolean().optional(),
});

// GET - Obter configurações do Asaas
router.get("/api/company/asaas-config", requireCompanyAuth, async (req: any, res: any) => {
  try {
    const companyId = req.session.companyId;

    const company = await db
      .select({
        asaasApiKey: companies.asaasApiKey,
        asaasEnvironment: companies.asaasEnvironment,
        asaasEnabled: companies.asaasEnabled,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (!company[0]) {
      return res.status(404).json({ error: "Empresa não encontrada" });
    }

    // Mascarar a chave da API para segurança
    const config = {
      ...company[0],
      asaasApiKey: company[0].asaasApiKey ? `${company[0].asaasApiKey.slice(0, 10)}...` : null,
      hasApiKey: !!company[0].asaasApiKey,
    };

    res.json(config);
  } catch (error) {
    console.error("Erro ao buscar configurações do Asaas:", error);
    res.status(500).json({ error: "Erro ao buscar configurações" });
  }
});

// PUT - Atualizar configurações do Asaas
router.put("/api/company/asaas-config", requireCompanyAuth, async (req: any, res: any) => {
  try {
    const companyId = req.session.companyId;

    // Validar dados
    const validatedData = asaasConfigSchema.parse(req.body);

    // Atualizar no banco de dados
    await db
      .update(companies)
      .set({
        asaasApiKey: validatedData.asaasApiKey,
        asaasEnvironment: validatedData.asaasEnvironment,
        asaasEnabled: validatedData.asaasEnabled,
      })
      .where(eq(companies.id, companyId));

    res.json({
      success: true,
      message: "Configurações do Asaas atualizadas com sucesso"
    });
  } catch (error) {
    console.error("Erro ao atualizar configurações do Asaas:", error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Dados inválidos",
        details: error.errors
      });
    }

    res.status(500).json({ error: "Erro ao atualizar configurações" });
  }
});

// POST - Webhook do Asaas
router.post("/api/webhook/asaas/:companyId", async (req: any, res: any) => {
  try {
    const { companyId } = req.params;
    const event = req.body;

    console.log(`[Asaas Webhook] Evento recebido para empresa ${companyId}:`, event.event);

    // Verificar se a empresa existe e tem Asaas habilitado
    const company = await db
      .select({
        id: companies.id,
        asaasEnabled: companies.asaasEnabled,
      })
      .from(companies)
      .where(eq(companies.id, parseInt(companyId)))
      .limit(1);

    if (!company[0] || !company[0].asaasEnabled) {
      console.log(`[Asaas Webhook] Empresa ${companyId} não encontrada ou Asaas desabilitado`);
      return res.status(404).json({ error: "Empresa não encontrada ou integração desabilitada" });
    }

    // Processar diferentes tipos de eventos
    switch (event.event) {
      case "PAYMENT_CREATED":
        console.log(`[Asaas] Pagamento criado: ${event.payment.id}`);
        // Implementar lógica para pagamento criado
        break;

      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED":
        console.log(`[Asaas] Pagamento confirmado/recebido: ${event.payment.id}`);

        const externalRef = event.payment.externalReference;
        console.log(`[Asaas] External Reference:`, externalRef);

        // NOVO FLUXO: Verificar se é JSON com dados do agendamento pendente
        try {
          const pendingData = JSON.parse(externalRef);

          if (pendingData.type === 'pending_appointment') {
            console.log(`[Asaas] Criando agendamento após pagamento confirmado...`);
            console.log(`[Asaas] Dados do agendamento:`, pendingData);

            // Converter data DD/MM/YYYY para YYYY-MM-DD
            let appointmentDate = '';
            if (pendingData.date) {
              const dateParts = pendingData.date.split('/');
              if (dateParts.length === 3) {
                appointmentDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
              }
            }

            // Criar o agendamento
            const newAppointment = await db
              .insert(appointments)
              .values({
                companyId: pendingData.companyId,
                professionalId: pendingData.professionalId,
                serviceId: pendingData.serviceId,
                clientName: pendingData.clientName,
                clientPhone: pendingData.clientPhone,
                date: appointmentDate,
                time: pendingData.time,
                status: 'Confirmado',
                asaasPaymentId: event.payment.id,
                asaasPaymentStatus: 'confirmed',
                createdAt: new Date(),
                updatedAt: new Date(),
              });

            console.log(`[Asaas] ✅ Agendamento criado com sucesso após pagamento!`);

            // Enviar mensagem de confirmação via WhatsApp
            try {
              const globalSettings = await storage.getGlobalSettings();
              const activeInstance = await db
                .select()
                .from(whatsappInstances)
                .where(eq(whatsappInstances.companyId, pendingData.companyId))
                .limit(1);

              if (globalSettings?.evolutionApiUrl && globalSettings?.evolutionApiGlobalKey && activeInstance[0]) {
                let formattedPhone = pendingData.clientPhone.replace(/\D/g, '');
                if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10) {
                  formattedPhone = '55' + formattedPhone;
                }

                const confirmationMessage = `✅ *Pagamento Confirmado!*\n\nSeu agendamento foi confirmado com sucesso!\n\n📋 *Detalhes:*\n👤 Cliente: ${pendingData.clientName}\n💼 Serviço: ${pendingData.serviceName}\n${pendingData.professionalName ? `🏢 Profissional: ${pendingData.professionalName}\n` : ''}📅 Data: ${pendingData.date}\n🕐 Horário: ${pendingData.time}\n\nAguardamos você! 😊`;

                let apiUrl = globalSettings.evolutionApiUrl;
                if (!apiUrl.includes('/message/')) {
                  apiUrl = apiUrl.replace(/\/+$/, '');
                }

                await fetch(`${apiUrl}/message/sendText/${activeInstance[0].instanceName}`, {
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

                console.log(`[Asaas] ✅ Mensagem de confirmação enviada para ${formattedPhone}`);

                // Salvar mensagem no banco
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
              console.error(`[Asaas] Erro ao enviar mensagem de confirmação:`, msgError);
            }
          }
        } catch (parseError) {
          // Não é JSON - pode ser o formato antigo (appointment_ID)
          if (externalRef && externalRef.startsWith('appointment_')) {
            const appointmentId = parseInt(externalRef.split('_')[1]);

            if (!isNaN(appointmentId)) {
              console.log(`[Asaas] Formato antigo - Confirmando agendamento ${appointmentId}`);

              await db
                .update(appointments)
                .set({
                  status: 'Confirmado',
                  asaasPaymentId: event.payment.id,
                  asaasPaymentStatus: 'confirmed',
                  updatedAt: new Date(),
                })
                .where(eq(appointments.id, appointmentId));

              console.log(`[Asaas] Agendamento ${appointmentId} confirmado com sucesso`);
            }
          }
        }
        break;

      case "PAYMENT_OVERDUE":
        console.log(`[Asaas] Pagamento vencido: ${event.payment.id}`);
        // Implementar lógica para pagamento vencido
        break;

      case "PAYMENT_DELETED":
        console.log(`[Asaas] Pagamento cancelado: ${event.payment.id}`);
        // Implementar lógica para pagamento cancelado
        break;

      case "PAYMENT_REFUNDED":
        console.log(`[Asaas] Pagamento estornado: ${event.payment.id}`);
        // Implementar lógica para pagamento estornado
        break;

      default:
        console.log(`[Asaas] Evento não processado: ${event.event}`);
    }

    // Retornar sucesso para o Asaas
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("[Asaas Webhook] Erro ao processar webhook:", error);
    res.status(500).json({ error: "Erro ao processar webhook" });
  }
});

export default router;