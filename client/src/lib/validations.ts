import { z } from "zod";

export function formatDocument(value: string): string {
  // Check if value exists and is a string
  if (!value || typeof value !== 'string') {
    return '';
  }
  
  // Remove all non-numeric characters
  const numbers = value.replace(/\D/g, '');
  
  // If length is 11, format as CPF: 000.000.000-00
  if (numbers.length <= 11) {
    return numbers
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  }
  
  // If length is 14, format as CNPJ: 00.000.000/0000-00
  return numbers
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
}

export function formatPhone(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length <= 10) {
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  
  return numbers
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

export function formatCEP(value: string): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  
  const numbers = value.replace(/\D/g, '');
  return numbers.replace(/(\d{5})(\d)/, '$1-$2');
}

// Validation schemas
export const companyProfileSchema = z.object({
  fantasyName: z.string().min(2, "Nome fantasia deve ter pelo menos 2 caracteres"),
  document: z.string().min(11, "CNPJ/CPF é obrigatório"),
  email: z.string().email("E-mail inválido"),
  address: z.string().min(5, "Endereço é obrigatório"),
  googleMapsLocation: z.string().url("URL do Google Maps inválida").optional().or(z.literal("")),
  coursesDescription: z.string().optional(),
  coursesImages: z.string().optional(),
  coursesPdfs: z.string().optional(),
  phone: z.string().optional(),
  zipCode: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  planId: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  tourEnabled: z.boolean().optional(),
  financialPasswordEnabled: z.boolean().optional(),
  password: z.string().optional(),
  healthSpecialty: z.string().nullable().optional(),
});

// Schema específico para edição de empresa (sem validação de senha)
export const companyEditSchema = z.object({
  fantasyName: z.string().min(2, "Nome fantasia deve ter pelo menos 2 caracteres"),
  document: z.string().min(11, "CNPJ/CPF é obrigatório"),
  email: z.string().email("E-mail inválido"),
  address: z.string().min(5, "Endereço é obrigatório"),
  phone: z.string().optional(),
  zipCode: z.string().optional(),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  planId: z.number().nullable().optional(),
  isActive: z.boolean().optional(),
  tourEnabled: z.boolean().optional(),
  financialPasswordEnabled: z.boolean().optional(),
  password: z.string().optional(),
  healthSpecialty: z.string().nullable().optional(),
});

export const companyPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Senha atual é obrigatória"),
  newPassword: z.string().min(6, "Nova senha deve ter pelo menos 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Senhas não coincidem",
  path: ["confirmPassword"],
});

export const companyAiAgentSchema = z.object({
  aiAgentPrompt: z.string().min(10, "Prompt deve ter pelo menos 10 caracteres"),
  agentInactivityTimeout: z.number().int().min(30).max(180).default(30),
  autoSelectProfessional: z.boolean().default(false),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().min(1, "Modelo é obrigatório").default("gpt-4o-mini"),
  openaiTemperature: z.number().min(0).max(2).default(0.7),
  openaiMaxTokens: z.number().int().min(100).max(8000).default(180),
});

export const companyHumanRequestSchema = z.object({
  humanRequestEnabled: z.boolean().default(false),
  humanRequestContact: z.string().optional(),
  humanRequestMessage: z.string().optional(),
  humanRequestKeywords: z.string().optional(),
  humanRequestTimeout: z.number().int().min(0).max(60).refine(
    (val) => val === 0 || val >= 10,
    { message: "O tempo deve ser 0 (sem limite) ou entre 10 e 60 minutos" }
  ).default(30),
});

export const companyCourseNotificationSchema = z.object({
  courseNotificationEnabled: z.boolean().default(false),
  courseNotificationContact: z.string().optional(),
  courseNotificationMessage: z.string().optional(),
  courseNotificationKeywords: z.string().optional(),
  courseNotificationTimeout: z.number().default(30),
});

export const companyIgnoredNumbersSchema = z.object({
  ignoredNumbers: z.string().optional(),
});

export const whatsappInstanceSchema = z.object({
  instanceName: z.string().min(3, "Nome da instância deve ter pelo menos 3 caracteres"),
  phoneNumber: z.string().min(10, "Número de telefone é obrigatório (com DDD)"),
});

export const webhookConfigSchema = z.object({
  apiUrl: z.string().url("URL da API inválida"),
  apiKey: z.string().min(10, "Chave da API é obrigatória"),
});

export const companySchema = z.object({
  fantasyName: z.string().min(2, "Nome fantasia deve ter pelo menos 2 caracteres"),
  document: z.string().min(11, "CNPJ/CPF é obrigatório"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  address: z.string().min(5, "Endereço é obrigatório"),
  phone: z.string().min(1, "Celular é obrigatório"),
  zipCode: z.string().min(1, "CEP é obrigatório"),
  number: z.string().min(1, "Número é obrigatório"),
  neighborhood: z.string().min(1, "Bairro é obrigatório"),
  city: z.string().min(1, "Cidade é obrigatória"),
  state: z.string().min(1, "Estado é obrigatório"),
  planId: z.number().min(1, "Plano é obrigatório"),
  isActive: z.boolean().default(true),
  tourEnabled: z.boolean().default(true),
  financialPasswordEnabled: z.boolean().default(false),
  healthSpecialty: z.string().nullable().optional(),
});

export const planSchema = z.object({
  name: z.string().min(2, "Nome do plano deve ter pelo menos 2 caracteres"),
  freeDays: z.number().min(0, "Dias grátis deve ser maior ou igual a 0"),
  price: z.string().min(1, "Preço é obrigatório"),
  annualPrice: z.string().optional(),
  maxProfessionals: z.number().min(1, "Máximo de profissionais deve ser pelo menos 1"),
  isActive: z.boolean().default(true),
  permissions: z.record(z.boolean()).default({}),
});

export const companySettingsSchema = z.object({
  birthdayMessage: z.string().optional(),
  aiAgentPrompt: z.string().optional(),
  logoUrl: z.string().url("URL inválida").optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor hexadecimal invalida").optional().or(z.literal("")),
});

export const asaasConfigSchema = z.object({
  asaasApiKey: z.string().optional(),
  asaasEnvironment: z.enum(["sandbox", "production"]).optional(),
  asaasEnabled: z.boolean().optional(),
});

// Módulo de Saúde
export const healthSpecialtySchema = z.object({
  healthSpecialty: z.string().max(100).nullable(),
});

export const clinicalEvolutionSchema = z.object({
  title: z.string().max(255).optional(),
  content: z.string().min(1, "Conteúdo é obrigatório").max(50000),
  evolutionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  professionalId: z.coerce.number().optional().nullable(),
});

export const anamnesisRecordSchema = z.object({
  templateId: z.coerce.number().positive("Selecione um modelo"),
  answers: z.record(z.string(), z.any()),
  notes: z.string().max(10000).optional(),
});

export const settingsSchema = z.object({
  systemName: z.string().optional(),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  primaryColor: z.string().min(4, "Cor primária é obrigatória"),
  secondaryColor: z.string().min(4, "Cor secundária é obrigatória"),
  backgroundColor: z.string().min(4, "Cor de fundo é obrigatória"),
  textColor: z.string().min(4, "Cor do texto é obrigatória"),
  tourColor: z.string().min(4, "Cor do tour guiado é obrigatória"),
  uazapiUrl: z.string().optional(),
  uazapiAdminToken: z.string().optional(),
  defaultBirthdayMessage: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
  openaiTemperature: z.string().optional(),
  openaiMaxTokens: z.string().optional(),
  defaultAiPrompt: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.string().optional(),
  smtpUser: z.string().optional(),
  smtpPassword: z.string().optional(),
  smtpFromEmail: z.string().optional(),
  smtpFromName: z.string().optional(),
  smtpSecure: z.string().optional(),
  customHtml: z.string().optional(),
  customDomainUrl: z.string().optional(),
  systemUrl: z.string().optional(),
  supportWhatsapp: z.string().optional(),
});