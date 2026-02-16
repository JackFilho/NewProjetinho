/**
 * Schemas de validação Zod para todos os endpoints da API.
 * Centralizados aqui para reutilização e manutenção.
 */
import { z } from "zod";

// ============================================================================
// UTILITÁRIOS COMUNS
// ============================================================================

/** Valida email no formato correto */
const emailSchema = z.string().email("Email inválido").max(255);

/** Senha com requisitos mínimos */
const passwordSchema = z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(255);

/** Telefone brasileiro (flexível - aceita vários formatos) */
const phoneSchema = z.string().min(8, "Telefone inválido").max(20).optional().nullable();

/** ID numérico positivo */
const idSchema = z.coerce.number().int().positive("ID inválido");

/** String não vazia com trim */
const requiredString = (fieldName: string, maxLen = 255) =>
  z.string().trim().min(1, `${fieldName} é obrigatório`).max(maxLen);

/** Data no formato YYYY-MM-DD */
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD");

/** Hora no formato HH:MM ou HH:MM:SS */
const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora deve estar no formato HH:MM");

// ============================================================================
// AUTENTICAÇÃO
// ============================================================================

export const adminLoginSchema = z.object({
  username: requiredString("Usuário", 100),
  password: z.string().min(1, "Senha é obrigatória").max(255),
});

export const companyLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Senha é obrigatória").max(255),
});

export const professionalLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Senha é obrigatória").max(255),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token é obrigatório"),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória"),
  newPassword: passwordSchema,
});

// ============================================================================
// REGISTRO PÚBLICO
// ============================================================================

export const publicRegisterSchema = z.object({
  fantasyName: requiredString("Nome fantasia"),
  document: z.string().min(11, "Documento inválido").max(20),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().min(8, "Telefone inválido").max(20).optional(),
});

// ============================================================================
// EMPRESA - CONFIGURAÇÕES
// ============================================================================

export const aiAgentSchema = z.object({
  aiAgentPrompt: z.string().trim().min(10, "Prompt deve ter pelo menos 10 caracteres").max(50000),
  agentInactivityTimeout: z.coerce.number().int().min(5).max(120).optional().nullable(),
  autoSelectProfessional: z.union([z.boolean(), z.number()]).optional().nullable(),
  openaiApiKey: z.string().max(255).optional().nullable(),
  openaiModel: z.string().max(100).optional().default("gpt-4o-mini"),
  openaiTemperature: z.coerce.number().min(0).max(2).optional().default(0.7),
  openaiMaxTokens: z.coerce.number().int().min(50).max(4096).optional().default(180),
});

export const n8nWebhookSchema = z.object({
  n8nWebhookUrl: z.string().url("URL inválida").max(500).optional().nullable().or(z.literal("")),
  n8nWebhookEnabled: z.preprocess(val => val === true || val === 1 || val === "true", z.boolean()).optional().default(false),
});

export const humanRequestSchema = z.object({
  humanRequestEnabled: z.union([z.boolean(), z.number()]).optional(),
  humanRequestContact: z.string().max(255).optional().nullable(),
  humanRequestMessage: z.string().max(2000).optional().nullable(),
  humanRequestKeywords: z.string().max(5000).optional().nullable(),
  humanRequestTimeout: z.coerce.number().int().min(5).max(120).optional(),
});

// ============================================================================
// AGENDAMENTOS
// ============================================================================

export const createAppointmentSchema = z.object({
  professionalId: idSchema,
  serviceId: idSchema,
  clientName: requiredString("Nome do cliente"),
  clientPhone: z.string().min(8, "Telefone do cliente é obrigatório").max(20),
  appointmentDate: dateSchema,
  appointmentTime: timeSchema,
  status: z.string().max(50).optional().default("Pendente"),
  notes: z.string().max(2000).optional().nullable(),
  clientEmail: z.string().email().max(255).optional().nullable().or(z.literal("")),
});

export const updateAppointmentStatusSchema = z.object({
  status: z.string().min(1).max(50),
});

export const updateAppointmentPriceSchema = z.object({
  price: z.coerce.number().min(0, "Preço não pode ser negativo"),
});

// ============================================================================
// PROFISSIONAIS
// ============================================================================

export const createProfessionalSchema = z.object({
  name: requiredString("Nome", 255),
  email: emailSchema.optional().nullable().or(z.literal("")),
  phone: phoneSchema,
  password: z.string().max(255).optional().nullable(),
  workDays: z.string().max(100).optional().nullable(),
  workStartTime: timeSchema.optional().nullable(),
  workEndTime: timeSchema.optional().nullable(),
  lunchStartTime: timeSchema.optional().nullable(),
  lunchEndTime: timeSchema.optional().nullable(),
  isActive: z.union([z.boolean(), z.number()]).optional().default(1),
});

export const updateProfessionalSchema = createProfessionalSchema.partial();

// ============================================================================
// CLIENTES
// ============================================================================

export const createClientSchema = z.object({
  name: requiredString("Nome", 255),
  phone: phoneSchema,
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  birthDate: z.string().max(20).optional().nullable().or(z.literal("")),
  sex: z.enum(["masculino", "feminino", "outro"]).optional().nullable(),
  guardian: z.string().max(255).optional().nullable().or(z.literal("")),
  occupation: z.string().max(255).optional().nullable().or(z.literal("")),
  notes: z.string().max(5000).optional().nullable().or(z.literal("")),
});

export const updateClientSchema = createClientSchema.partial();

// ============================================================================
// SERVIÇOS
// ============================================================================

export const createServiceSchema = z.object({
  name: requiredString("Nome do serviço", 255),
  duration: z.coerce.number().int().min(5, "Duração mínima: 5 minutos").max(480, "Duração máxima: 8 horas"),
  price: z.coerce.number().min(0, "Preço não pode ser negativo").optional().default(0),
  description: z.string().max(2000).optional().nullable().or(z.literal("")),
  isActive: z.union([z.boolean(), z.number()]).optional().default(1),
});

export const updateServiceSchema = createServiceSchema.partial();

// ============================================================================
// CAMPANHAS
// ============================================================================

export const createCampaignSchema = z.object({
  name: z.string().max(255).optional(),
  message: requiredString("Mensagem da campanha", 5000),
  scheduledDate: z.string().min(1, "Data agendada é obrigatória"),
  targetType: z.enum(["all", "selected", "birthday"]).optional().default("all"),
  selectedClients: z.array(z.number()).optional(),
  imageUrl: z.string().max(500).optional().nullable(),
});

// ============================================================================
// FINANCEIRO
// ============================================================================

export const createTransactionSchema = z.object({
  description: requiredString("Descrição", 500),
  amount: z.coerce.number().positive("Valor deve ser positivo"),
  type: z.enum(["receita", "despesa", "income", "expense"]),
  categoryId: z.coerce.number().int().optional().nullable(),
  date: dateSchema.optional(),
  notes: z.string().max(2000).optional().nullable(),
  paymentMethodId: z.coerce.number().int().optional().nullable(),
});

// ============================================================================
// ADMIN
// ============================================================================

export const createAdminSchema = z.object({
  username: requiredString("Usuário", 100),
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
});

export const createAlertSchema = z.object({
  title: requiredString("Título", 255),
  message: requiredString("Mensagem", 5000),
  type: z.enum(["info", "warning", "error", "success"]).optional().default("info"),
  targetCompanyIds: z.array(z.number()).optional().nullable(),
  startsAt: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

// ============================================================================
// TICKETS DE SUPORTE
// ============================================================================

export const createSupportTicketSchema = z.object({
  title: requiredString("Título", 255),
  description: requiredString("Descrição", 10000),
  typeId: z.coerce.number().int().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
});

// ============================================================================
// WHATSAPP
// ============================================================================

export const createWhatsAppInstanceSchema = z.object({
  instanceName: requiredString("Nome da instância", 100),
  phoneNumber: z.string().min(8, "Número de telefone inválido").max(20).optional(),
});

// ============================================================================
// ASSINATURA / SUBSCRIPTION
// ============================================================================

export const createSubscriptionSchema = z.object({
  planId: idSchema,
  isAnnual: z.boolean().optional().default(false),
  installments: z.coerce.number().int().min(1).max(12).optional().default(1),
  couponCode: z.string().max(50).optional(),
});

// ============================================================================
// WEBHOOKS (entrada externa - validação mais rigorosa)
// ============================================================================

export const mercadoPagoWebhookSchema = z.object({
  action: z.string().optional(),
  type: z.string().optional(),
  data: z.object({
    id: z.string().or(z.number()).optional(),
  }).optional(),
  id: z.union([z.string(), z.number()]).optional(),
}).passthrough(); // Permite campos extras do MP

export const asaasWebhookSchema = z.object({
  event: z.string().min(1),
  payment: z.object({
    id: z.string(),
    status: z.string(),
    value: z.number().optional(),
    customer: z.string().optional(),
    externalReference: z.string().optional().nullable(),
  }).optional(),
}).passthrough(); // Permite campos extras do Asaas

// ============================================================================
// MÓDULO DE SAÚDE
// ============================================================================

export const updateHealthSpecialtySchema = z.object({
  healthSpecialty: z.string().max(100).nullable().optional(),
});

export const createAnamnesisTemplateSchema = z.object({
  specialty: requiredString("Especialidade", 100),
  name: requiredString("Nome do modelo", 255),
  description: z.string().max(5000).optional().nullable(),
  fields: z.array(z.object({
    section: z.string().max(255).optional().nullable(),
    label: requiredString("Pergunta", 500),
    fieldType: z.enum(["text", "textarea", "select", "checkbox", "number", "date", "boolean"]).default("text"),
    options: z.array(z.string()).optional().nullable(),
    isRequired: z.union([z.boolean(), z.number()]).transform(val => typeof val === 'boolean' ? (val ? 1 : 0) : val).default(0),
    sortOrder: z.coerce.number().int().min(0).default(0),
    placeholder: z.string().max(255).optional().nullable(),
  })).min(1, "Modelo precisa ter pelo menos um campo"),
});

export const updateAnamnesisTemplateSchema = z.object({
  name: requiredString("Nome do modelo", 255).optional(),
  description: z.string().max(5000).optional().nullable(),
  fields: z.array(z.object({
    section: z.string().max(255).optional().nullable(),
    label: requiredString("Pergunta", 500),
    fieldType: z.enum(["text", "textarea", "select", "checkbox", "number", "date", "boolean"]).default("text"),
    options: z.array(z.string()).optional().nullable(),
    isRequired: z.union([z.boolean(), z.number()]).transform(val => typeof val === 'boolean' ? (val ? 1 : 0) : val).default(0),
    sortOrder: z.coerce.number().int().min(0).default(0),
    placeholder: z.string().max(255).optional().nullable(),
  })).min(1, "Modelo precisa ter pelo menos um campo").optional(),
});

export const createAnamnesisRecordSchema = z.object({
  templateId: idSchema,
  answers: z.record(z.string(), z.any()),
  filledBy: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().max(10000).optional().nullable(),
});

export const updateAnamnesisRecordSchema = z.object({
  answers: z.record(z.string(), z.any()).optional(),
  notes: z.string().max(10000).optional().nullable(),
});

export const createClinicalEvolutionSchema = z.object({
  professionalId: z.coerce.number().int().positive().optional().nullable(),
  appointmentId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().max(255).optional().nullable(),
  content: requiredString("Conteúdo da evolução", 50000),
  evolutionDate: dateSchema,
});

export const updateClinicalEvolutionSchema = z.object({
  professionalId: z.coerce.number().int().positive().optional().nullable(),
  appointmentId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().max(255).optional().nullable(),
  content: requiredString("Conteúdo da evolução", 50000).optional(),
  evolutionDate: dateSchema.optional(),
});

// ============================================================================
// MIDDLEWARE DE VALIDAÇÃO
// ============================================================================

import type { Request, Response, NextFunction } from "express";

/**
 * Middleware factory que valida req.body com um schema Zod.
 * Se a validação falhar, retorna 400 com as mensagens de erro.
 * Se passar, substitui req.body pelo objeto validado (com coerção e defaults).
 */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      }));
      return res.status(400).json({
        message: "Dados inválidos",
        errors,
      });
    }
    // Substitui body pelo objeto validado (com coerção de tipos e defaults)
    req.body = result.data;
    next();
  };
}

/**
 * Middleware factory que valida req.params com um schema Zod.
 */
export function validateParams<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({
        message: "Parâmetros inválidos",
        errors: result.error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      });
    }
    (req as any).validatedParams = result.data;
    next();
  };
}

/** Schema para parâmetros :id comuns */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive("ID inválido"),
});
