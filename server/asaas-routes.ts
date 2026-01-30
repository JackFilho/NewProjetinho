import { Router } from "express";
import { eq } from "drizzle-orm";
import { companies, appointments } from "@shared/schema";
import storage from "./storage";
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
    const company = await storage.db
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

    const company = await storage.db
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
    await storage.db
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
    const company = await storage.db
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

        // Extrair o ID do agendamento da referência externa
        const externalRef = event.payment.externalReference;
        if (externalRef && externalRef.startsWith('appointment_')) {
          const appointmentId = parseInt(externalRef.replace('appointment_', ''));

          if (!isNaN(appointmentId)) {
            console.log(`[Asaas] Confirmando agendamento ${appointmentId} após pagamento`);

            // Atualizar status do agendamento para confirmado
            try {
              await storage.db
                .update(appointments)
                .set({
                  status: 'Confirmado',
                  asaasPaymentId: event.payment.id,
                  asaasPaymentStatus: 'confirmed',
                  updatedAt: new Date(),
                })
                .where(eq(appointments.id, appointmentId));

              console.log(`[Asaas] Agendamento ${appointmentId} confirmado com sucesso`);

              // TODO: Enviar mensagem WhatsApp confirmando o pagamento e agendamento
            } catch (updateError) {
              console.error(`[Asaas] Erro ao atualizar agendamento ${appointmentId}:`, updateError);
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