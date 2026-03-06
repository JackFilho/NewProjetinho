import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isCompanyAuthenticated } from "./auth";
import { db, pool } from "./db";
import { loadCompanyPlan, requirePermission, checkProfessionalsLimit, RequestWithPlan } from "./plan-middleware";
import { checkSubscriptionStatus, getCompanyPaymentAlerts, markAlertAsShown } from "./subscription-middleware";
import { insertCompanySchema, insertPlanSchema, insertGlobalSettingsSchema, insertAdminSchema, financialCategories, paymentMethods, financialTransactions, companies, appointments, adminAlerts, companyAlertViews, insertCouponSchema, supportTickets, supportTicketTypes, supportTicketStatuses, tasks, insertTaskSchema, trainingVideos, whatsappInstances, conversations } from "@shared/schema";
import bcrypt from "bcrypt";
import { z } from "zod";
import QRCode from "qrcode";
import { validateUploadContent, IMAGE_MIMES, COURSE_FILE_MIMES } from "./upload-validator";
import {
  validateBody,
  adminLoginSchema,
  companyLoginSchema,
  professionalLoginSchema,
  forgotPasswordSchema,
  changePasswordSchema,
  publicRegisterSchema,
  aiAgentSchema,
  n8nWebhookSchema,
  createAppointmentSchema,
  createProfessionalSchema,
  updateProfessionalSchema,
  createClientSchema,
  updateClientSchema,
  createServiceSchema,
  updateServiceSchema,
  createCampaignSchema,
  createTransactionSchema,
  createAdminSchema,
  createAlertSchema,
  createSupportTicketSchema,
  createWhatsAppInstanceSchema,
  createSubscriptionSchema,
} from "./validation-schemas";
import { reminderScheduler, rescheduleRemindersForAppointment } from "./reminder-scheduler";
import { sql, eq, and, desc, asc, sum, count, gte, lte } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import rateLimit from "express-rate-limit";
import { UazapiService, createUazapiService } from "./services/uazapi";

// Helper para obter serviço UAZAPI configurado
async function getUazapiService(): Promise<UazapiService> {
  const settings = await storage.getGlobalSettings();
  const baseUrl = settings?.uazapiUrl || process.env.UAZAPI_URL || '';
  const adminToken = settings?.uazapiAdminToken || process.env.UAZAPI_ADMIN_TOKEN || '';
  return createUazapiService(baseUrl, adminToken);
}

// Helper para obter o token da instância ativa de uma empresa
async function getInstanceToken(companyId: number): Promise<{ token: string; instanceName: string } | null> {
  const instances = await storage.getWhatsappInstancesByCompany(companyId);
  const activeInstance = instances.find((i: any) => i.status === 'connected') || instances[0];
  if (!activeInstance?.instanceToken) return null;
  return { token: activeInstance.instanceToken, instanceName: activeInstance.instanceName };
}

// Helpers de compatibilidade para envio via UAZAPI (substituem fetch direto + ensureUAZAPIApiEndpoint)
// Estes helpers buscam o token da instância pelo nome e usam o serviço UAZAPI

// Remove sufixos de JID do WhatsApp para obter apenas o número puro
function cleanWhatsAppNumber(phone: string): string {
  return phone.replace(/@s\.whatsapp\.net$/, '').replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '');
}

async function uazapiSendText(instanceName: string, phoneNumber: string, text: string): Promise<{ ok: boolean; status: number }> {
  try {
    const uazapi = await getUazapiService();
    const [instance] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.instanceName, instanceName)).limit(1);
    if (!instance?.instanceToken) {
      console.error('❌ Token UAZAPI não encontrado para instância:', instanceName);
      return { ok: false, status: 404 };
    }
    const cleanNumber = cleanWhatsAppNumber(phoneNumber);
    await uazapi.sendText(instance.instanceToken, { number: cleanNumber, text });
    return { ok: true, status: 200 };
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem UAZAPI:', error);
    return { ok: false, status: 500 };
  }
}

async function uazapiSendMedia(instanceName: string, phoneNumber: string, mediaType: string, fileData: string, caption?: string, docName?: string): Promise<{ ok: boolean; status: number }> {
  try {
    const uazapi = await getUazapiService();
    const [instance] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.instanceName, instanceName)).limit(1);
    if (!instance?.instanceToken) {
      console.error('❌ Token UAZAPI não encontrado para instância:', instanceName);
      return { ok: false, status: 404 };
    }
    const cleanNumber = cleanWhatsAppNumber(phoneNumber);
    await uazapi.sendMedia(instance.instanceToken, { number: cleanNumber, type: mediaType as any, file: fileData, text: caption, docName: docName });
    return { ok: true, status: 200 };
  } catch (error) {
    console.error('❌ Erro ao enviar mídia UAZAPI:', error);
    return { ok: false, status: 500 };
  }
}

async function uazapiSendTyping(instanceName: string, phoneNumber: string, durationMs: number = 2000): Promise<void> {
  try {
    const uazapi = await getUazapiService();
    const [instance] = await db.select().from(whatsappInstances).where(eq(whatsappInstances.instanceName, instanceName)).limit(1);
    if (!instance?.instanceToken) return;
    const cleanNumber = cleanWhatsAppNumber(phoneNumber);
    await uazapi.sendPresence(instance.instanceToken, { number: cleanNumber, presence: 'composing', delay: durationMs });
  } catch (error) {
    console.warn('⚠️ Erro ao enviar presença UAZAPI:', error);
  }
}

// Função de compatibilidade para normalização de URL (no-op para UAZAPI)
function ensureUAZAPIApiEndpoint(baseUrl: string): string {
  if (!baseUrl) return baseUrl;
  return baseUrl.replace(/\/+$/, '');
}

// Rate limiters para proteção contra brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 tentativas por IP
  message: { message: "Muitas tentativas de login. Tente novamente em 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5, // 5 requisições por IP por hora
  message: { message: "Muitas solicitações de recuperação de senha. Tente novamente mais tarde." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiGeneralLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // 100 requisições por minuto por IP
  message: { message: "Muitas requisições. Tente novamente em alguns segundos." },
  standardHeaders: true,
  legacyHeaders: false,
});

import { 
  getLoyaltyCampaignsByCompany, 
  createLoyaltyCampaign, 
  updateLoyaltyCampaign, 
  toggleLoyaltyCampaign, 
  deleteLoyaltyCampaign, 
  getLoyaltyRewardsHistory 
} from "./storage";
import { formatBrazilianPhone, validateBrazilianPhone, normalizePhone, normalizeWhatsAppNumber } from "../shared/phone-utils";
import { asaasService } from "./services/asaas";
import { clearMetaTagsCache } from "./vite";
import { getAvailableSlots, validateSlot, getAvailabilitySummary, generateAvailabilityTextForAI } from "./services/availability";

// 📨 MESSAGE GROUPING: Debounce - aguarda silêncio de 7s para agrupar mensagens (máx 84s)
const processingLocks = new Map<string, boolean>();
const lastMessageTime = new Map<string, number>();

// 🔒 EARLY LOCK: Previne race condition quando duas mensagens chegam quase ao mesmo tempo
// O lock principal (processingLocks) é setado ~1600 linhas após o webhook começar, após muitos awaits.
// Sem este early lock, duas mensagens simultâneas podem ambas passar pelo lock check antes de setar o lock.
// Este Map usa instanceName:phoneNumber como chave (disponível sem DB) para bloquear a segunda mensagem
// até que a primeira tenha setado o lock principal.
const earlyWebhookLocks = new Map<string, number>(); // key -> timestamp

// ⏰ LEMBRETE DE CONFIRMAÇÃO: Timer de 10 minutos para clientes que não respondem "Sim"
const pendingConfirmationTimers = new Map<string, {
  timer: NodeJS.Timeout;
  conversationId: number;
  instanceName: string;
  companyId: number;
  phoneNumber: string;
}>();

// 💬 FOLLOW-UP DE CONVERSA: Timer de 30 minutos para clientes que param de responder durante o atendimento
const conversationFollowUpTimers = new Map<string, {
  timer: NodeJS.Timeout;
  conversationId: number;
  instanceName: string;
  companyId: number;
  phoneNumber: string;
}>();
// Rastreia conversas que já receberam follow-up (só envia uma vez por conversa)
const conversationFollowUpSent = new Set<string>();

// 🗑️ LIMPEZA DE CONVERSA: Timer de 2 horas após agendamento confirmado para deletar histórico
const conversationCleanupTimers = new Map<string, NodeJS.Timeout>();

// 🤖 CACHE DE RESPOSTAS DA AI: Detecta quando o Chatwoot ecoa a resposta da AI como mensagem de "agente humano"
// Quando a AI envia uma resposta via UAZAPI, ela é sincronizada ao Chatwoot e aparece como mensagem de um agente (tipo 'user').
// Sem este cache, o webhook do Chatwoot ativaria o human takeover para cada resposta da AI.
// Key: conversationId, Value: { contents (array de primeiros 200 chars de cada msg), timestamp }
// Suporta múltiplas mensagens por conversa (ex: fluxo PIX envia QR + código + instruções)
const recentAISentMessages = new Map<number, { contents: string[]; timestamp: number }>();

// Helper para registrar resposta da AI no cache
function cacheAIResponse(conversationId: number, content: string) {
  const existing = recentAISentMessages.get(conversationId);
  const trimmed = content.substring(0, 200);
  if (existing && (Date.now() - existing.timestamp) < 60000) {
    // Adicionar ao array existente (máximo 10 entradas)
    if (existing.contents.length < 10) {
      existing.contents.push(trimmed);
    }
    existing.timestamp = Date.now();
  } else {
    recentAISentMessages.set(conversationId, { contents: [trimmed], timestamp: Date.now() });
  }
}

/**
 * Verifica se o cliente tem agendamento futuro ativo (consulta direta ao banco).
 * Usado para suprimir follow-up de inatividade após o cliente já ter agendado.
 */
async function clientHasFutureAppointment(companyId: number, phoneNumber: string): Promise<boolean> {
  try {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const nowBrasilia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayStr = nowBrasilia.toISOString().split('T')[0];

    // Gerar variações do telefone para comparação exata (evita REPLACE/LIKE no SQL)
    // O telefone pode estar salvo como: "11999887766", "5511999887766", "(11) 99988-7766", etc.
    const phoneVariations: string[] = [cleanPhone];
    if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
      phoneVariations.push(cleanPhone.substring(2)); // sem código país
    } else if (cleanPhone.length >= 10 && cleanPhone.length <= 11) {
      phoneVariations.push('55' + cleanPhone); // com código país
    }

    // Usar SELECT 1 + EXISTS pattern e company_id direto (sem JOIN)
    const placeholders = phoneVariations.map(() => '?').join(',');
    const [rows] = await pool.execute(`
      SELECT 1 FROM appointments
      WHERE company_id = ?
        AND appointment_date >= ?
        AND status IN ('Pendente', 'Confirmado', 'confirmado', 'agendado', 'Agendado', 'scheduled', 'confirmed')
        AND REPLACE(REPLACE(REPLACE(REPLACE(client_phone, '-', ''), ' ', ''), '(', ''), ')', '') IN (${placeholders})
      LIMIT 1
    `, [companyId, todayStr, ...phoneVariations]);

    return (rows as any[]).length > 0;
  } catch (error) {
    console.error('❌ Erro ao verificar agendamento futuro do cliente:', error);
    return false;
  }
}

/**
 * Verifica se uma resposta da IA é um resumo de confirmação de agendamento.
 * Usa os mesmos padrões da detecção em PRÉ-VALIDAÇÃO (linhas 8489-8503).
 */
function isConfirmationSummary(text: string): boolean {
  const hasConfirmationPrompt =
    text.includes('Está tudo correto?') ||
    text.includes('Responda SIM para confirmar') ||
    text.includes('Digite SIM ou OK para confirmar') ||
    text.includes('confirmar seu agendamento') ||
    text.includes('Vou confirmar');

  const hasNameMarker = text.includes('👤') || text.includes('Nome:');
  const hasDateMarker = text.includes('📅') || text.includes('Data:');
  const hasTimeMarker = text.includes('🕐') || text.includes('Horário:');

  return hasConfirmationPrompt && hasNameMarker && hasDateMarker && hasTimeMarker;
}

/**
 * Verifica se uma resposta da IA indica que o atendimento foi concluído.
 * Usado para NÃO agendar follow-up de 30 min quando a conversa já terminou.
 * Cobre: agendamento confirmado/cancelado/remarcado, despedidas e agradecimentos.
 */
function isConversationConcluded(text: string): boolean {
  const lowerText = text.toLowerCase();

  // Palavras-chave de conclusão de agendamento
  const conclusionKeywords = [
    'agendamento realizado com sucesso',
    'agendamento está confirmado',
    'agendamento confirmado',
    'realizado com sucesso',
    'agendamento cancelado com sucesso',
    'agendamento remarcado com sucesso',
    'nos vemos',
    'te aguardo',
    'aguardamos você',
    'até lá',
  ];

  // Palavras-chave de despedida/encerramento (quando a IA responde a "obrigada", "tchau", etc)
  const farewellKeywords = [
    'de nada',
    'por nada',
    'disponha',
    'foi um prazer',
    'estou à disposição',
    'estou a disposição',
    'fico à disposição',
    'fico a disposição',
    'qualquer coisa é só chamar',
    'qualquer dúvida é só chamar',
    'até mais',
    'até logo',
    'tenha um bom dia',
    'tenha uma boa tarde',
    'tenha uma boa noite',
    'bom dia pra você',
    'boa tarde pra você',
    'boa noite pra você',
  ];

  const hasConclusionKeyword = conclusionKeywords.some(keyword => lowerText.includes(keyword));
  const hasFarewellKeyword = farewellKeywords.some(keyword => lowerText.includes(keyword));

  return hasConclusionKeyword || hasFarewellKeyword;
}

// 🧹 LIMPEZA PERIÓDICA: Remove entradas órfãs dos Maps em memória a cada 5 minutos
setInterval(() => {
  const now = Date.now();
  let cleanedProcessing = 0;
  let cleanedLastMsg = 0;
  let cleanedTimers = 0;

  // processingLocks: entradas mais velhas que 5 minutos são órfãs (processamento travado)
  // Não temos timestamp direto, mas lastMessageTime serve como proxy
  for (const [key] of processingLocks) {
    const lastActivity = lastMessageTime.get(key);
    if (lastActivity && now - lastActivity > 5 * 60 * 1000) {
      processingLocks.delete(key);
      cleanedProcessing++;
    }
  }

  // lastMessageTime: entradas mais velhas que 5 minutos não são mais necessárias para debounce
  for (const [key, timestamp] of lastMessageTime) {
    if (now - timestamp > 5 * 60 * 1000) {
      lastMessageTime.delete(key);
      cleanedLastMsg++;
    }
  }

  // pendingConfirmationTimers: entradas mais velhas que 15 minutos são órfãs
  // (o timer de lembrete é 10 min, então 15 min já passou do timeout)
  for (const [key, entry] of pendingConfirmationTimers) {
    // Não temos createdAt, mas se o timer existir há mais de 15 min, é órfão
    const lastActivity = lastMessageTime.get(key) || 0;
    if (lastActivity > 0 && now - lastActivity > 15 * 60 * 1000) {
      clearTimeout(entry.timer);
      pendingConfirmationTimers.delete(key);
      cleanedTimers++;
    }
  }

  // conversationFollowUpTimers: entradas mais velhas que 35 minutos são órfãs
  // (o timer de follow-up é 30 min, então 35 min já passou do timeout)
  let cleanedFollowUp = 0;
  for (const [key, entry] of conversationFollowUpTimers) {
    const lastActivity = lastMessageTime.get(key) || 0;
    if (lastActivity > 0 && now - lastActivity > 35 * 60 * 1000) {
      clearTimeout(entry.timer);
      conversationFollowUpTimers.delete(key);
      cleanedFollowUp++;
    }
  }

  // conversationFollowUpSent: limpar entradas antigas (mais de 2 horas sem atividade)
  let cleanedFollowUpSent = 0;
  for (const key of conversationFollowUpSent) {
    const lastActivity = lastMessageTime.get(key) || 0;
    if (lastActivity > 0 && now - lastActivity > 2 * 60 * 60 * 1000) {
      conversationFollowUpSent.delete(key);
      cleanedFollowUpSent++;
    }
  }

  // recentAISentMessages: limpar entradas mais velhas que 60 segundos
  // O eco do Chatwoot chega em menos de 5 segundos, então 60s é mais que suficiente
  let cleanedAICache = 0;
  for (const [key, entry] of recentAISentMessages) {
    if (now - entry.timestamp > 60 * 1000) {
      recentAISentMessages.delete(key);
      cleanedAICache++;
    }
  }

  // earlyWebhookLocks: limpar entradas mais velhas que 30 segundos
  // Previne vazamento de memória caso algum return antecipado não limpe o early lock
  let cleanedEarlyLocks = 0;
  for (const [key, timestamp] of earlyWebhookLocks) {
    if (now - timestamp > 30 * 1000) {
      earlyWebhookLocks.delete(key);
      cleanedEarlyLocks++;
    }
  }

  if (cleanedProcessing > 0 || cleanedLastMsg > 0 || cleanedTimers > 0 || cleanedFollowUp > 0 || cleanedFollowUpSent > 0 || cleanedAICache > 0 || cleanedEarlyLocks > 0) {
    console.log(`🧹 Limpeza de Maps: processingLocks=${cleanedProcessing}, lastMessageTime=${cleanedLastMsg}, pendingTimers=${cleanedTimers}, followUpTimers=${cleanedFollowUp}, followUpSent=${cleanedFollowUpSent}, aiCache=${cleanedAICache}, earlyLocks=${cleanedEarlyLocks}`);
  }
}, 5 * 60 * 1000); // 5 minutos

// ensureUAZAPIApiEndpoint removido - UAZAPI não precisa de normalização de URL

/**
 * Formata uma data para o formato YYYY-MM-DD sem conversão para UTC
 * Isso evita o problema de offset de timezone onde datas podem aparecer um dia antes
 * quando convertidas para UTC em timezones como Brasil (UTC-3)
 */
function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Utility function to get current date/time in Brazil timezone (America/Sao_Paulo)
function getBrazilDate(): Date {
  // Get current date and convert to Brazil timezone
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  return new Date(nowStr);
}

// Format a date in Brazil timezone to YYYY-MM-DD
function formatDateBrazil(date: Date): string {
  // Convert to Brazil timezone string first
  const brazilDateStr = date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const brazilDate = new Date(brazilDateStr);
  return formatDateLocal(brazilDate);
}

// Configure multer for file uploads
const storage_config = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads/support-tickets';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `ticket-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const supportTicketUpload = multer({
  storage: storage_config,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas!'));
    }
  }
});

// Temporary in-memory storage for WhatsApp instances
const tempWhatsappInstances: any[] = [];

// Configure multer for file uploads
const storage_multer = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${ext}`);
  }
});

// Function to transcribe audio using OpenAI Whisper
async function transcribeAudio(audioBase64: string, openaiApiKey: string): Promise<string | null> {
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: openaiApiKey });
    
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    // WhatsApp typically sends audio as OGG Opus format, but we'll try to detect
    let extension = 'ogg'; // Default to ogg for WhatsApp
    if (audioBuffer.length > 4) {
      const header = audioBuffer.subarray(0, 4);
      const headerStr = header.toString('ascii', 0, 4);
      
      if (header[0] === 0xFF && (header[1] & 0xF0) === 0xF0) {
        extension = 'mp3';
      } else if (headerStr === 'OggS') {
        extension = 'ogg';
      } else if (headerStr === 'RIFF') {
        extension = 'wav';
      } else if (headerStr.includes('ftyp')) {
        extension = 'm4a';
      } else {
        // WhatsApp commonly uses OGG format even without proper header
        extension = 'ogg';
      }
    }
    
    const tempFilePath = path.join('/tmp', `audio_${Date.now()}.${extension}`);
    
    // Ensure /tmp directory exists
    if (!fs.existsSync('/tmp')) {
      fs.mkdirSync('/tmp', { recursive: true });
    }
    
    fs.writeFileSync(tempFilePath, audioBuffer);
    
    // Create a readable stream for OpenAI
    const audioStream = fs.createReadStream(tempFilePath);
    
    console.log(`🎵 Transcribing audio file: ${extension} format, size: ${audioBuffer.length} bytes`);
    
    // Transcribe using OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: "whisper-1",
      language: "pt", // Portuguese language
    });
    
    // Clean up temporary file
    fs.unlinkSync(tempFilePath);
    
    return transcription.text;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return null;
  }
}

const logoUpload = multer({
  storage: storage_multer,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

// Configure multer for course files (images and PDFs)
const courseFilesStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'courses');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `course-${uniqueSuffix}${ext}`);
  }
});

const courseFilesUpload = multer({
  storage: courseFilesStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for PDFs
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens e PDFs são permitidos'));
    }
  }
});

// Helper function to generate public webhook URLs
// Prioriza system_url das configurações globais para garantir URL pública acessível
async function generateWebhookUrl(req: any, instanceName: string): Promise<string> {
  // Tentar usar system_url das configurações globais (URL pública)
  try {
    const settings = await storage.getGlobalSettings();
    if (settings?.systemUrl) {
      const baseUrl = settings.systemUrl.replace(/\/+$/, '');
      return `${baseUrl}/api/webhook/whatsapp/${encodeURIComponent(instanceName)}`;
    }
  } catch (e) {
    console.warn('⚠️ Could not get system_url from global settings');
  }

  // Fallback: usar host do request
  const host = req.get('host');
  if (host?.includes('replit.dev') || host?.includes('replit.app')) {
    return `https://${host}/api/webhook/whatsapp/${encodeURIComponent(instanceName)}`;
  }
  return `${req.protocol}://${host}/api/webhook/whatsapp/${encodeURIComponent(instanceName)}`;
}

// sendTypingPresence removido - agora usa uazapiService.sendPresence()

/**
 * Envia webhook para N8N quando ocorre um erro no agendamento
 * Tipos de erro:
 * - EXTRACTION_FAILED: Falha ao extrair dados do agendamento
 * - VALIDATION_FAILED: Dados incompletos ou inválidos
 * - CONFLICT: Horário já ocupado
 * - PROFESSIONAL_UNAVAILABLE: Profissional indisponível
 * - SERVICE_NOT_FOUND: Serviço não encontrado
 * - DATABASE_ERROR: Erro ao salvar no banco
 * - AI_ERROR: Erro na chamada da IA (OpenAI)
 * - UNKNOWN: Erro desconhecido
 */
async function sendAppointmentErrorWebhook(
  companyId: number,
  errorType: string,
  errorMessage: string,
  details: {
    conversationId?: number;
    phoneNumber?: string;
    clientName?: string;
    professionalId?: number;
    professionalName?: string;
    serviceId?: number;
    serviceName?: string;
    requestedDate?: string;
    requestedTime?: string;
    additionalInfo?: string;
  }
): Promise<void> {
  try {
    const company = await storage.getCompanyById(companyId);

    if (!company?.n8nWebhookEnabled || !company?.n8nWebhookUrl) {
      return; // Webhook não configurado
    }

    const webhookPayload = {
      event: 'appointment.error',
      timestamp: new Date().toISOString(),
      errorType,
      errorMessage,
      details: {
        conversationId: details.conversationId,
        phoneNumber: details.phoneNumber,
        clientName: details.clientName,
        professional: {
          id: details.professionalId,
          name: details.professionalName
        },
        service: {
          id: details.serviceId,
          name: details.serviceName
        },
        requestedDate: details.requestedDate,
        requestedTime: details.requestedTime,
        additionalInfo: details.additionalInfo
      },
      company: {
        id: companyId,
        name: company.fantasyName
      }
    };

    console.log('🚨 [ERROR WEBHOOK] Enviando notificação de erro para N8N');

    if (process.env.DEBUG_N8N_WEBHOOK === 'true') {
      console.log('🔍 [ERROR WEBHOOK] URL configured:', !!company.n8nWebhookUrl);
      console.log('📦 [ERROR WEBHOOK] Payload keys:', Object.keys(webhookPayload).join(', '));
    }

    const response = await fetch(company.n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    });

    if (!response.ok) {
      console.error('⚠️ N8N error webhook failed:', response.status, response.statusText);
    } else {
      console.log('✅ [ERROR WEBHOOK] N8N notificado sobre erro no agendamento');
    }
  } catch (webhookError) {
    console.error('⚠️ Error sending error webhook to n8n:', webhookError);
  }
}

// Helper function to list client's future appointments
async function listClientAppointments(clientPhone: string, companyId: number): Promise<string> {
  try {
    const allAppointments = await storage.getAppointmentsByCompany(companyId);
    const now = new Date();

    // Filter appointments for this client that are in the future or today
    const clientAppointments = allAppointments.filter(apt => {
      const aptDate = new Date(apt.appointmentDate);
      aptDate.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);

      return (
        apt.clientPhone?.replace(/\D/g, '') === clientPhone.replace(/\D/g, '') &&
        (apt.status === 'agendado' || apt.status === 'confirmado') &&
        aptDate >= now
      );
    }).sort((a, b) => {
      const dateA = new Date(`${a.appointmentDate}T${a.appointmentTime}`);
      const dateB = new Date(`${b.appointmentDate}T${b.appointmentTime}`);
      return dateA.getTime() - dateB.getTime();
    });

    if (clientAppointments.length === 0) {
      return 'Você não possui agendamentos futuros.';
    }

    let appointmentsList = 'Seus agendamentos:\n\n';

    for (const apt of clientAppointments) {
      const professional = await storage.getProfessional(apt.professionalId);
      const service = await storage.getService(apt.serviceId);

      const date = new Date(apt.appointmentDate);
      const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
      const dayName = dayNames[date.getDay()];

      appointmentsList += `📅 ${dayName}, ${date.toLocaleDateString('pt-BR')}\n`;
      appointmentsList += `🕐 ${apt.appointmentTime}\n`;
      appointmentsList += `💼 ${service?.name || 'Serviço'}\n`;
      appointmentsList += `👤 ${professional?.name || 'Profissional'}\n`;
      appointmentsList += `ID: ${apt.id}\n\n`;
    }

    return appointmentsList;
  } catch (error) {
    console.error('Error listing client appointments:', error);
    return 'Erro ao buscar seus agendamentos.';
  }
}

// Helper function to list client's future appointments with numbers (for cancel/reschedule)
// OTIMIZADO: Consulta direta no banco com filtros (não carrega todos na memória)
async function listClientAppointmentsNumbered(clientPhone: string, companyId: number, action: 'cancelar' | 'remarcar'): Promise<string> {
  try {
    const cleanClientPhone = clientPhone.replace(/\D/g, '');

    // Calcular data de hoje no fuso horário de São Paulo
    const nowBrasilia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayStr = nowBrasilia.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log('📋 [listClientAppointmentsNumbered] OTIMIZADO:');
    console.log('   📞 Telefone:', cleanClientPhone);
    console.log('   🏢 Company ID:', companyId);
    console.log('   📅 Data de hoje (Brasília):', todayStr);

    // Consulta direta no banco - MUITO mais eficiente!
    // Busca apenas agendamentos futuros deste cliente com status válido
    const [rows] = await pool.execute(`
      SELECT
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.professional_id,
        a.service_id,
        s.name as service_name,
        p.name as professional_name
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.id
      LEFT JOIN professionals p ON a.professional_id = p.id
      WHERE REPLACE(REPLACE(REPLACE(a.client_phone, '-', ''), ' ', ''), '(', '') LIKE ?
        AND a.appointment_date >= ?
        AND a.status IN ('Pendente', 'Confirmado', 'confirmado', 'pendente', 'agendado', 'Agendado', 'scheduled', 'confirmed')
        AND p.company_id = ?
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
      LIMIT 10
    `, [`%${cleanClientPhone}%`, todayStr, companyId]);

    const clientAppointments = rows as any[];

    console.log('   🎯 Agendamentos encontrados:', clientAppointments.length);

    if (clientAppointments.length === 0) {
      return `Você não possui agendamentos futuros para ${action}.`;
    }

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const actionText = action === 'cancelar' ? 'cancelar' : 'remarcar';

    let appointmentsList = `📋 Seus próximos agendamentos:\n\n`;

    for (let i = 0; i < clientAppointments.length; i++) {
      const apt = clientAppointments[i];

      const date = new Date(apt.appointment_date);
      const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
      const dayName = dayNames[date.getDay()];

      appointmentsList += `${numberEmojis[i]} ${dayName}, ${date.toLocaleDateString('pt-BR')} às ${apt.appointment_time}\n`;
      appointmentsList += `   💼 ${apt.service_name || 'Serviço'} | 👤 ${apt.professional_name || 'Profissional'}\n\n`;
    }

    appointmentsList += `Qual agendamento você deseja ${actionText}? (responda com o número)`;

    return appointmentsList;
  } catch (error) {
    console.error('Error listing client appointments numbered:', error);
    return 'Erro ao buscar seus agendamentos.';
  }
}

// Helper function to cancel an appointment
async function cancelAppointmentById(appointmentId: number, companyId: number): Promise<{ success: boolean; message: string }> {
  try {
    const appointment = await storage.getAppointment(appointmentId);

    if (!appointment) {
      return { success: false, message: 'Agendamento não encontrado.' };
    }

    // Verify appointment belongs to this company
    const professional = await storage.getProfessional(appointment.professionalId);
    if (professional?.companyId !== companyId) {
      return { success: false, message: 'Agendamento não pertence a esta empresa.' };
    }

    // Delete the appointment from database
    await storage.deleteAppointment(appointmentId);

    return {
      success: true,
      message: `✅ Agendamento cancelado com sucesso!\n\nSe precisar de um novo agendamento, é só me avisar! 😊`
    };
  } catch (error) {
    console.error('Error canceling appointment:', error);
    return { success: false, message: 'Erro ao cancelar o agendamento.' };
  }
}

// Helper function to reschedule an appointment
async function rescheduleAppointment(
  appointmentId: number,
  newDate: string,
  newTime: string,
  companyId: number
): Promise<{ success: boolean; message: string }> {
  try {
    const appointment = await storage.getAppointment(appointmentId);

    if (!appointment) {
      return { success: false, message: 'Agendamento não encontrado.' };
    }

    // Verify appointment belongs to this company
    const professional = await storage.getProfessional(appointment.professionalId);
    if (professional?.companyId !== companyId) {
      return { success: false, message: 'Agendamento não pertence a esta empresa.' };
    }

    // Update appointment
    await storage.updateAppointment(appointmentId, {
      appointmentDate: newDate,
      appointmentTime: newTime,
    });

    const service = await storage.getService(appointment.serviceId);
    // Fix timezone issue: add time to prevent UTC conversion
    const date = new Date(newDate + 'T12:00:00');
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const dayName = dayNames[date.getDay()];

    // Format date as DD/MM/YYYY
    const [year, month, day] = newDate.split('-');
    const formattedDate = `${day}/${month}/${year}`;

    return {
      success: true,
      message: `✅ Agendamento remarcado com sucesso!\n\n📅 Nova data: ${dayName}, ${formattedDate}\n🕐 Novo horário: ${newTime}\n💼 Serviço: ${service?.name}\n👤 Profissional: ${professional?.name}\n\nNos vemos lá! 😊`
    };
  } catch (error) {
    console.error('Error rescheduling appointment:', error);
    return { success: false, message: 'Erro ao remarcar o agendamento.' };
  }
}

// ==================== SISTEMA INTELIGENTE DE DISPONIBILIDADE ====================

// Cache para disponibilidade - evita recalcular a cada mensagem
interface AvailabilityCache {
  data: string;
  timestamp: number;
  companyId: number;
}

const availabilityCache = new Map<number, AvailabilityCache>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutos de cache

// Limpar cache ao iniciar para forçar uso do novo sistema
console.log('🗑️ Limpando cache de disponibilidade (inicialização)');
availabilityCache.clear();

/**
 * Detecta se a mensagem do usuário está relacionada a agendamento/disponibilidade
 * Esta função economiza recursos ao evitar consultas desnecessárias ao banco de dados
 */
function needsAvailabilityInfo(messageText: string, conversationHistory: any[]): boolean {
  const lowerMessage = messageText.toLowerCase();

  // Palavras-chave que indicam necessidade de consultar disponibilidade
  const schedulingKeywords = [
    'agendar', 'agendamento', 'horário', 'horario', 'disponível', 'disponivel',
    'marcar', 'quando', 'data', 'dia', 'hora', 'vaga', 'tempo',
    'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado', 'domingo',
    'amanhã', 'amanha', 'hoje', 'semana', 'próximo', 'proximo', 'próxima', 'proxima',
    'livre', 'ocupado', 'atende', 'trabalha', 'funciona', 'aberto',
    'mudar', 'trocar', 'alterar'
  ];

  // Se a mensagem contém qualquer palavra-chave de agendamento
  const hasSchedulingKeyword = schedulingKeywords.some(keyword => lowerMessage.includes(keyword));

  if (hasSchedulingKeyword) {
    return true;
  }

  // Verifica se há contexto de agendamento nas últimas 3 mensagens
  const recentMessages = conversationHistory.slice(-3);
  const hasRecentSchedulingContext = recentMessages.some(msg => {
    const msgLower = msg.content.toLowerCase();
    return schedulingKeywords.some(keyword => msgLower.includes(keyword));
  });

  if (hasRecentSchedulingContext) {
    // Se há contexto recente, verifica se a mensagem atual parece ser uma resposta
    // (números, confirmações, datas, etc.)
    const looksLikeSchedulingResponse = /\d{1,2}[:\h]?\d{0,2}/.test(messageText) || // Horários
                                        /\d{1,2}\/\d{1,2}/.test(messageText) || // Datas
                                        /\b(sim|sin|sím|sii|ok|confirmo|confirma|confirmar|confirmado|combinado|pode ser|tudo certo|tudo correto|tá bom|ta bom|com certeza|claro|positivo|afirmativo)\b/i.test(messageText);

    return looksLikeSchedulingResponse;
  }

  return false;
}

/**
 * Obtém informações de disponibilidade com cache inteligente
 * MODO NOVO: Usa horários pré-calculados para evitar erros de cálculo do agente
 */
async function getAvailabilityInfoSmart(
  messageText: string,
  conversationHistory: any[],
  professionals: any[],
  existingAppointments: any[],
  companyId: number,
  forceRefresh: boolean = false,
  services?: any[] // Adiciona serviços para o novo modo
): Promise<string> {
  // Verifica se realmente precisa de informações de disponibilidade
  if (!forceRefresh && !needsAvailabilityInfo(messageText, conversationHistory)) {
    console.log('⚡ Otimização: Mensagem não precisa de informações de disponibilidade - pulando consulta ao banco');
    return ''; // Retorna vazio - a IA vai responder sem contexto de disponibilidade
  }

  // Verifica se existe cache válido
  const cached = availabilityCache.get(companyId);
  const now = Date.now();

  if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`⚡ Usando cache de disponibilidade (idade: ${Math.round((now - cached.timestamp) / 1000)}s)`);
    return cached.data;
  }

  // Cache expirado ou não existe - gera nova disponibilidade
  console.log('📋 Gerando informações básicas (horários sob demanda)');

  let availabilityInfo: string;

  // MODO OTIMIZADO: Apenas informações básicas, horários buscados sob demanda
  if (services && services.length > 0) {
    console.log('🆕 Usando sistema OTIMIZADO (horários sob demanda)');
    availabilityInfo = await generateBasicAvailabilityInfo(companyId, professionals, services);
  } else {
    // MODO ANTIGO: Fallback para compatibilidade
    console.log('📋 Usando sistema antigo de disponibilidade');
    availabilityInfo = await generateAvailabilityInfo(professionals, existingAppointments);
  }

  // Salva no cache
  availabilityCache.set(companyId, {
    data: availabilityInfo,
    timestamp: now,
    companyId
  });

  return availabilityInfo;
}

/**
 * Limpa o cache de disponibilidade de uma empresa específica
 * Útil para forçar atualização após criar/cancelar/remarcar agendamentos
 */
export function clearAvailabilityCache(companyId: number): void {
  availabilityCache.delete(companyId);
  console.log(`🗑️ Cache de disponibilidade limpo para empresa ${companyId}`);
}

// ==================== FIM DO SISTEMA INTELIGENTE ====================

/**
 * Gera informações básicas dos profissionais e serviços (SEM horários pré-calculados)
 * Os horários serão buscados sob demanda quando o usuário informar a data
 */
async function generateBasicAvailabilityInfo(
  companyId: number,
  professionals: any[],
  services: any[]
): Promise<string> {
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

  // Data de hoje para referência
  const today = getBrazilDate();
  const todayStr = formatDateLocal(today);
  const todayFormatted = today.toLocaleDateString('pt-BR');

  let text = `
═══════════════════════════════════════════════════════════════════
📋 INFORMAÇÕES PARA AGENDAMENTO
═══════════════════════════════════════════════════════════════════

📅 Data de hoje: ${todayFormatted}

`;

  // Listar profissionais ativos com seus dias/horários de trabalho
  const activeProfessionals = professionals.filter(p => p.active);
  text += `👥 PROFISSIONAIS DISPONÍVEIS:\n`;
  for (const prof of activeProfessionals) {
    text += `   • ${prof.name} (ID: ${prof.id})\n`;

    // Buscar schedules do profissional para mostrar dias de trabalho
    const professionalSchedules = await storage.getProfessionalSchedules(prof.id);
    if (professionalSchedules.length > 0) {
      const enabledDays = professionalSchedules
        .filter(s => s.isEnabled)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

      if (enabledDays.length > 0) {
        const workingDayNames = enabledDays.map(s => dayNames[s.dayOfWeek]);
        text += `     📅 Dias de trabalho: ${workingDayNames.join(', ')}\n`;
        // Listar dias que NÃO trabalha para ficar explícito
        const workingDayNumbers = enabledDays.map(s => s.dayOfWeek);
        const nonWorkingDays = dayNames.filter((_, index) => !workingDayNumbers.includes(index));
        if (nonWorkingDays.length > 0) {
          text += `     🚫 NÃO trabalha: ${nonWorkingDays.join(', ')}\n`;
        }
      }
    } else {
      // Fallback para sistema antigo
      const workDays = prof.workDays || [1, 2, 3, 4, 5, 6];
      text += `     📅 Dias de trabalho: ${workDays.map((day: number) => dayNames[day]).join(', ')}\n`;
      const nonWorkingDays = dayNames.filter((_, index) => !workDays.includes(index));
      if (nonWorkingDays.length > 0) {
        text += `     🚫 NÃO trabalha: ${nonWorkingDays.join(', ')}\n`;
      }
    }

    // Buscar dias de folga próximos
    const startDate = formatDateLocal(today);
    const endDateObj = getBrazilDate();
    endDateObj.setDate(endDateObj.getDate() + 7);
    const endDate = formatDateLocal(endDateObj);
    const professionalDaysOff = await storage.getProfessionalDaysOffByDateRange(prof.id, startDate, endDate);
    if (professionalDaysOff.length > 0) {
      const daysOffInfo = professionalDaysOff.map(d => {
        let displayDate: string;
        if (typeof d.dateOff === 'string') {
          const parts = d.dateOff.split('-');
          displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          const date = new Date(d.dateOff);
          const day = String(date.getUTCDate()).padStart(2, '0');
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const year = date.getUTCFullYear();
          displayDate = `${day}/${month}/${year}`;
        }
        return d.reason ? `${displayDate} (${d.reason})` : displayDate;
      }).join(', ');
      text += `     ⛔ FOLGAS: ${daysOffInfo}\n`;
    }

    text += `\n`;
  }

  // Listar serviços
  text += `💇 SERVIÇOS OFERECIDOS:\n`;
  for (const service of services) {
    const price = service.price ? `R$ ${parseFloat(service.price).toFixed(2)}` : 'Consultar';
    text += `   • ${service.name} - ${service.duration || 30}min - ${price} (ID: ${service.id})\n`;
  }

  return text;
}

/**
 * Gera informações de disponibilidade com horários PRÉ-CALCULADOS
 * Esta função usa o serviço de disponibilidade para calcular horários precisos,
 * removendo a necessidade do agente de IA fazer cálculos complexos
 *
 * @deprecated Use generateBasicAvailabilityInfo + busca sob demanda para melhor performance
 */
async function generatePrecalculatedAvailability(
  companyId: number,
  professionals: any[],
  services: any[]
): Promise<string> {
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

  // Gerar próximos 3 dias (reduzido para otimizar o prompt)
  const nextDays = [];
  for (let i = 0; i < 3; i++) {
    const date = getBrazilDate();
    date.setDate(date.getDate() + i);
    const dateStr = formatDateLocal(date);
    const dateParts = dateStr.split('-');
    const brazilDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    const dayOfWeek = brazilDate.getDay();
    nextDays.push({
      date: dateStr,
      dayName: dayNames[dayOfWeek],
      formatted: brazilDate.toLocaleDateString('pt-BR')
    });
  }

  let text = `
═══════════════════════════════════════════════════════════════════
📋 HORÁRIOS DISPONÍVEIS PRÉ-CALCULADOS (USE APENAS ESTES HORÁRIOS)
═══════════════════════════════════════════════════════════════════

⚠️ REGRA ABSOLUTAMENTE OBRIGATÓRIA:
- SOMENTE os horários listados abaixo estão DISPONÍVEIS
- Se um horário NÃO está na lista, ele NÃO PODE ser agendado
- NÃO tente calcular ou deduzir outros horários
- O sistema de backend JÁ calculou tudo considerando:
  • Horário de trabalho do profissional
  • Pausas/intervalos (almoço, etc.)
  • Agendamentos existentes
  • Duração de cada serviço
  • Antecedência mínima

`;

  const activeProfessionals = professionals.filter(p => p.active);

  for (const prof of activeProfessionals) {
    text += `\n👤 PROFISSIONAL: ${prof.name.toUpperCase()} (ID: ${prof.id})\n`;
    text += `${'─'.repeat(50)}\n`;

    // Para cada serviço, calcular horários disponíveis
    for (const service of services) {
      text += `\n   📌 Serviço: ${service.name} (${service.duration || 30} min)\n`;

      for (const day of nextDays) {
        try {
          const availability = await getAvailableSlots(
            companyId,
            prof.id,
            service.id,
            day.date
          );

          if (availability.error === 'DAY_OFF' || availability.error === 'NOT_WORKING_DAY') {
            text += `      📅 ${day.dayName} (${day.formatted}): ❌ NÃO DISPONÍVEL\n`;
          } else if (availability.availableSlots.length === 0) {
            text += `      📅 ${day.dayName} (${day.formatted}): ❌ SEM HORÁRIOS (todos ocupados)\n`;
          } else {
            // Mostrar apenas os primeiros 10 horários para não sobrecarregar
            const slotsToShow = availability.availableSlots.slice(0, 12);
            const moreCount = availability.availableSlots.length - slotsToShow.length;
            let slotsStr = slotsToShow.join(', ');
            if (moreCount > 0) {
              slotsStr += ` (+${moreCount} mais)`;
            }
            text += `      📅 ${day.dayName} (${day.formatted}): ✅ ${slotsStr}\n`;
          }
        } catch (error) {
          console.error(`Erro ao calcular disponibilidade para ${prof.name}, ${service.name}, ${day.date}:`, error);
          text += `      📅 ${day.dayName} (${day.formatted}): ⚠️ Erro ao calcular\n`;
        }
      }
    }
  }

  text += `
═══════════════════════════════════════════════════════════════════
📌 COMO USAR ESTAS INFORMAÇÕES:
═══════════════════════════════════════════════════════════════════

1. Quando o cliente escolher PROFISSIONAL + SERVIÇO + DATA:
   → Consulte a lista acima para aquela combinação específica
   → Mostre APENAS os horários que aparecem como ✅

2. Se o cliente pedir um horário que NÃO está na lista:
   → Diga: "Esse horário não está disponível."
   → Mostre os horários disponíveis da lista

3. NUNCA tente agendar um horário que não aparece na lista ✅

4. Se todos os horários estão ocupados para uma data:
   → Sugira outra data ou outro profissional

5. Se o cliente pedir uma data que NÃO está na lista acima:
   → Use a função de buscar horários passando a data específica

`;

  return text;
}

async function generateAvailabilityInfo(professionals: any[], existingAppointments: any[]): Promise<string> {
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const dayKeysMap: { [key: number]: string } = {
    0: 'domingo',
    1: 'segunda',
    2: 'terca',
    3: 'quarta',
    4: 'quinta',
    5: 'sexta',
    6: 'sabado'
  };

  // Generate next 7 days for display (user can still book up to 30 days ahead on request)
  const nextDays = [];
  for (let i = 0; i < 7; i++) {
    const date = getBrazilDate(); // Use Brazil timezone
    date.setDate(date.getDate() + i);
    const dateStr = formatDateLocal(date);
    // Parse back to get correct day of week in Brazil timezone
    const dateParts = dateStr.split('-');
    const brazilDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    const dayOfWeek = brazilDate.getDay(); // Pre-calculated correctly in day object (already in Brazil timezone)
    nextDays.push({
      date: dateStr,
      dayName: dayNames[dayOfWeek],
      dayKey: dayKeysMap[dayOfWeek],
      dayOfWeek: dayOfWeek, // Add this for later use
      formatted: brazilDate.toLocaleDateString('pt-BR')
    });
  }

  let availabilityText = 'DISPONIBILIDADE REAL DOS PROFISSIONAIS POR DATA:\n\n';

  for (const prof of professionals) {
    if (!prof.active || prof.archived) continue;

    availabilityText += `${prof.name} (ID: ${prof.id}):\n`;

    // Get individual schedules for each day
    const professionalSchedules = await storage.getProfessionalSchedules(prof.id);

    // Get professional breaks
    const professionalBreaks = await storage.getProfessionalBreaks(prof.id);

    // Get professional days off for the date range
    const startDate = nextDays[0].date;
    const endDate = nextDays[nextDays.length - 1].date;
    const professionalDaysOff = await storage.getProfessionalDaysOffByDateRange(prof.id, startDate, endDate);

    // Get professional exceptional schedules for the date range
    const professionalExceptionalSchedules = await storage.getProfessionalExceptionalSchedulesByDateRange(prof.id, startDate, endDate);

    // Display schedule by day
    if (professionalSchedules.length > 0) {
      availabilityText += `- Horários por dia:\n`;
      professionalSchedules
        .filter(s => s.isEnabled)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .forEach(schedule => {
          availabilityText += `  * ${dayNames[schedule.dayOfWeek]}: ${schedule.startTime} às ${schedule.endTime}\n`;
        });
    } else {
      // Fallback to old system if no schedules configured
      const workDays = prof.workDays || [1, 2, 3, 4, 5, 6];
      const workStart = prof.workStartTime || '09:00';
      const workEnd = prof.workEndTime || '18:00';
      availabilityText += `- Horário de trabalho: ${workStart} às ${workEnd}\n`;
      availabilityText += `- Dias de trabalho: ${workDays.map((day: number) => dayNames[day]).join(', ')}\n`;
    }

    // Add time interval information
    const configuredInterval = prof.timeInterval || 0;
    if (configuredInterval === 0) {
      availabilityText += `- Intervalo de agendamento: Sem intervalo fixo (usa a duração do serviço)\n`;
    } else {
      const timeInterval = configuredInterval;
      availabilityText += `- Intervalo de agendamento: ${timeInterval} minutos (APENAS sugira horários que sejam múltiplos de ${timeInterval} minutos. Ex: `;

      // Generate example times based on interval
      // Get a reference start time for examples (use first enabled schedule or fallback)
      let exampleStartTime = '09:00';
      if (professionalSchedules.length > 0) {
        const firstSchedule = professionalSchedules.find(s => s.isEnabled);
        if (firstSchedule) {
          exampleStartTime = firstSchedule.startTime;
        }
      } else {
        exampleStartTime = prof.workStartTime || '09:00';
      }

      const startHour = parseInt(exampleStartTime.split(':')[0]);
      const exampleTimes: string[] = [];
      let currentHour = startHour;
      let currentMinute = 0;

      for (let i = 0; i < 4; i++) {
        exampleTimes.push(`${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`);
        currentMinute += timeInterval;
        if (currentMinute >= 60) {
          currentHour += Math.floor(currentMinute / 60);
          currentMinute = currentMinute % 60;
        }
      }

      availabilityText += `${exampleTimes.join(', ')}, etc.)\n`;
    }

    // Add minimum advance hours information
    const minimumAdvanceHours = Number(prof.minimumAdvanceHours) || 0;
    if (minimumAdvanceHours > 0) {
      // Formatar corretamente: 0.5 = "30 minutos", 1 = "1 hora", 2 = "2 horas"
      const advanceText = minimumAdvanceHours < 1
        ? `${Math.round(minimumAdvanceHours * 60)} minutos`
        : minimumAdvanceHours === 1
          ? '1 hora'
          : `${minimumAdvanceHours} horas`;
      availabilityText += `- Antecedência mínima: ${advanceText} (válido apenas para agendamentos HOJE - dias futuros sempre permitidos)\n`;
    } else {
      availabilityText += `- Antecedência mínima: Nenhuma\n`;
    }

    // Show breaks if any
    if (professionalBreaks.length > 0) {
      const breaksByDay: { [key: string]: string[] } = {};
      for (const brk of professionalBreaks) {
        if (!breaksByDay[brk.dayOfWeek]) {
          breaksByDay[brk.dayOfWeek] = [];
        }
        breaksByDay[brk.dayOfWeek].push(`${brk.startTime}-${brk.endTime}`);
      }

      const breakInfo = Object.entries(breaksByDay)
        .map(([day, times]) => `${day}: ${times.join(', ')}`)
        .join('; ');
      availabilityText += `- PAUSAS/INTERVALOS (NÃO AGENDAR): ${breakInfo}\n`;
    }

    // Show days off if any
    if (professionalDaysOff.length > 0) {
      const daysOffInfo = professionalDaysOff.map(d => {
        // d.dateOff comes from MySQL as Date object
        // Extract date parts directly to avoid timezone conversion issues
        let displayDate: string;

        if (typeof d.dateOff === 'string') {
          // If it's already a string (YYYY-MM-DD), parse and format
          const parts = d.dateOff.split('-');
          displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          // If it's a Date object, use UTC methods to avoid timezone offset
          const date = new Date(d.dateOff);
          const day = String(date.getUTCDate()).padStart(2, '0');
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const year = date.getUTCFullYear();
          displayDate = `${day}/${month}/${year}`;
        }

        return d.reason ? `${displayDate} (${d.reason})` : displayDate;
      }).join(', ');
      availabilityText += `- DIAS INDISPONÍVEIS (NÃO AGENDAR): ${daysOffInfo}\n`;
    }

    // Show exceptional schedules if any
    if (professionalExceptionalSchedules.length > 0) {
      const exceptionalInfo = professionalExceptionalSchedules.map(exc => {
        // exc.exceptionDate comes from MySQL as Date object
        // Extract date parts directly to avoid timezone conversion issues
        let displayDate: string;

        if (typeof exc.exceptionDate === 'string') {
          // If it's already a string (YYYY-MM-DD), parse and format
          const parts = exc.exceptionDate.split('-');
          displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          // If it's a Date object, use UTC methods to avoid timezone offset
          const date = new Date(exc.exceptionDate);
          const day = String(date.getUTCDate()).padStart(2, '0');
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const year = date.getUTCFullYear();
          displayDate = `${day}/${month}/${year}`;
        }

        const reasonText = exc.reason ? ` - ${exc.reason}` : '';
        return `${displayDate}: ${exc.startTime} às ${exc.endTime}${reasonText}`;
      }).join(', ');
      // IMPORTANTE: Mostrar horários excepcionais para a IA considerar na disponibilidade
      availabilityText += `- ⚠️ HORÁRIOS ESPECIAIS (diferente do normal): ${exceptionalInfo}\n`;
    }
    availabilityText += '\n';

    // Check availability for next 7 days (detailed view)
    for (const day of nextDays) {
      // Use pre-calculated dayOfWeek from Brazil timezone (avoid recalculating with local timezone)
      const dayOfWeek = day.dayOfWeek;

      // Check if this day is a day off
      const isDayOff = professionalDaysOff.some(d => {
        // Use UTC methods to extract date without timezone conversion
        const dateObj = new Date(d.dateOff);
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const dayNum = String(dateObj.getUTCDate()).padStart(2, '0');
        const dayOffDate = `${year}-${month}-${dayNum}`;
        return dayOffDate === day.date;
      });

      if (isDayOff) {
        const dayOffInfo = professionalDaysOff.find(d => {
          // Use UTC methods to extract date without timezone conversion
          const dateObj = new Date(d.dateOff);
          const year = dateObj.getUTCFullYear();
          const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
          const dayNum = String(dateObj.getUTCDate()).padStart(2, '0');
          const dayOffDate = `${year}-${month}-${dayNum}`;
          return dayOffDate === day.date;
        });
        const reason = dayOffInfo?.reason ? ` - ${dayOffInfo.reason}` : '';
        availabilityText += `  ${day.dayName} (${day.formatted}): INDISPONÍVEL${reason} (NÃO AGENDAR)\n`;
        continue;
      }

      // Check if there's an exceptional schedule for this specific date
      const exceptionalSchedule = professionalExceptionalSchedules.find(exc => {
        // Use UTC methods to extract date without timezone conversion
        const dateObj = new Date(exc.exceptionDate);
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const dayNum = String(dateObj.getUTCDate()).padStart(2, '0');
        const excDate = `${year}-${month}-${dayNum}`;
        return excDate === day.date;
      });

      let workStart: string;
      let workEnd: string;
      let isExceptional = false;

      if (exceptionalSchedule) {
        // Use exceptional schedule hours
        workStart = exceptionalSchedule.startTime;
        workEnd = exceptionalSchedule.endTime;
        isExceptional = true;
      } else {
        // Check if professional has regular schedule for this day
        const daySchedule = professionalSchedules.find(s => s.dayOfWeek === dayOfWeek && s.isEnabled);
        if (!daySchedule) {
          availabilityText += `  ${day.dayName} (${day.formatted}): NÃO TRABALHA\n`;
          continue;
        }
        workStart = daySchedule.startTime;
        workEnd = daySchedule.endTime;
      }

      // Get breaks for this specific day (exception breaks or regular day-of-week breaks)
      let dayBreaks: { startTime: string; endTime: string }[] = [];
      if (isExceptional && exceptionalSchedule) {
        dayBreaks = await storage.getExceptionBreaks(exceptionalSchedule.id);
      } else {
        dayBreaks = professionalBreaks.filter(brk => brk.dayOfWeek === day.dayKey);
      }

      // Find appointments for this specific date
      const dayAppointments = existingAppointments.filter(apt => {
        if (apt.professionalId !== prof.id ||
            apt.status === 'Cancelado' ||
            apt.status === 'cancelado') {
          return false;
        }
        // appointmentDate already comes as YYYY-MM-DD string from database (via DATE_FORMAT)
        // No need to convert - just compare directly to avoid timezone issues

        // Debug log to see the comparison
        if (prof.id === 4 || prof.id === 5) {
          console.log(`🔍 Comparing appointment: ${apt.appointmentDate} vs ${day.date} for professional ${prof.name} (${prof.id})`);
        }

        return apt.appointmentDate === day.date;
      });

      let statusParts: string[] = [];

      if (dayAppointments.length > 0) {
        // Show appointments with duration to help AI understand time blocks
        const appointmentDetails = dayAppointments
          .map(apt => {
            const duration = apt.duration || 30;
            const [startHour, startMin] = apt.appointmentTime.split(':').map(Number);
            const startInMinutes = startHour * 60 + startMin;
            const endInMinutes = startInMinutes + duration;
            const endHour = Math.floor(endInMinutes / 60);
            const endMin = endInMinutes % 60;
            const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
            return `${apt.appointmentTime}-${endTime} (${duration}min)`;
          })
          .sort()
          .join(', ');
        statusParts.push(`OCUPADO ${appointmentDetails}`);
      }

      if (dayBreaks.length > 0) {
        const breakTimes = dayBreaks.map(brk => `${brk.startTime}-${brk.endTime}`);
        statusParts.push(`PAUSA às ${breakTimes.join(', ')} (NÃO AGENDAR)`);
      }

      // Removido exceptionalNote: não mencionar horários excepcionais ao cliente

      if (statusParts.length > 0) {
        availabilityText += `  ${day.dayName} (${day.formatted}): ${statusParts.join(' | ')} (trabalha ${workStart} às ${workEnd})\n`;
      } else {
        availabilityText += `  ${day.dayName} (${day.formatted}): LIVRE (${workStart} às ${workEnd})\n`;
      }
    }

    availabilityText += '\n';
  }

  return availabilityText;
}

// ==================== VERIFICAÇÃO DE DISPONIBILIDADE PARA DATAS ESPECÍFICAS ====================

/**
 * Extrai data específica mencionada na mensagem do usuário
 * Retorna a data em formato YYYY-MM-DD ou null se não encontrar
 */
function extractSpecificDateFromMessage(messageText: string, conversationHistory: any[]): string | null {
  const today = getBrazilDate();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  // Padrões para detectar datas específicas
  const datePatterns = [
    // Formato DD/MM/YYYY
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
    // Formato DD/MM
    /\b(\d{1,2})\/(\d{1,2})\b/,
    // "dia DD" ou "dia DD de"
    /\bdia\s+(\d{1,2})\b/i,
    // "DD de [mês]"
    /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i,
  ];

  const monthNames: { [key: string]: number } = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
    'outubro': 10, 'novembro': 11, 'dezembro': 12
  };

  // Combina mensagem atual com últimas 3 mensagens do usuário para contexto
  const recentUserMessages = conversationHistory
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content)
    .join(' ');

  const fullText = `${messageText} ${recentUserMessages}`.toLowerCase();

  // Tenta encontrar data no formato DD/MM/YYYY
  let match = fullText.match(datePatterns[0]);
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Tenta encontrar data no formato DD/MM (usa ano atual)
  match = fullText.match(datePatterns[1]);
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    // Se o mês for menor que o mês atual, assume próximo ano
    const year = month < currentMonth ? currentYear + 1 : currentYear;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Tenta encontrar "dia DD"
  match = fullText.match(datePatterns[2]);
  if (match) {
    const day = parseInt(match[1]);
    // Se o dia já passou no mês atual, assume próximo mês
    const targetMonth = day < today.getDate() ? currentMonth + 1 : currentMonth;
    const year = targetMonth > 12 ? currentYear + 1 : currentYear;
    const month = targetMonth > 12 ? 1 : targetMonth;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Tenta encontrar "DD de [mês]"
  match = fullText.match(datePatterns[3]);
  if (match) {
    const day = parseInt(match[1]);
    const monthName = match[2].toLowerCase();
    const month = monthNames[monthName] || currentMonth;
    // Se o mês for menor que o mês atual, assume próximo ano
    const year = month < currentMonth ? currentYear + 1 : currentYear;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Calcula diferença de dias entre hoje e data específica
 */
function getDaysDifference(targetDate: string): number {
  const today = getBrazilDate();
  today.setHours(0, 0, 0, 0);

  const [year, month, day] = targetDate.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Busca disponibilidade em tempo real para uma data específica
 */
async function getSpecificDateAvailability(
  targetDate: string,
  professionals: any[],
  existingAppointments: any[]
): Promise<string> {
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const dayKeysMap: { [key: number]: string } = {
    0: 'domingo',
    1: 'segunda',
    2: 'terca',
    3: 'quarta',
    4: 'quinta',
    5: 'sexta',
    6: 'sabado'
  };

  // Parse target date
  const [year, month, day] = targetDate.split('-').map(Number);
  const targetDateObj = new Date(year, month - 1, day);
  const dayOfWeek = targetDateObj.getDay();
  const dayName = dayNames[dayOfWeek];
  const dayKey = dayKeysMap[dayOfWeek];
  const formatted = targetDateObj.toLocaleDateString('pt-BR');

  let availabilityText = `\n\n🔍 DISPONIBILIDADE PARA DATA ESPECÍFICA SOLICITADA:\n`;
  availabilityText += `📅 Data: ${dayName}, ${formatted}\n\n`;

  for (const prof of professionals) {
    if (!prof.active || prof.archived) continue;

    availabilityText += `${prof.name} (ID: ${prof.id}):\n`;

    // Get professional schedules
    const professionalSchedules = await storage.getProfessionalSchedules(prof.id);

    // Get professional breaks
    const professionalBreaks = await storage.getProfessionalBreaks(prof.id);

    // Check for days off on this specific date
    const professionalDaysOff = await storage.getProfessionalDaysOffByDateRange(prof.id, targetDate, targetDate);

    // Check if this day is a day off
    const isDayOff = professionalDaysOff.some(d => {
      const dateObj = new Date(d.dateOff);
      const dateOffYear = dateObj.getUTCFullYear();
      const dateOffMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const dateOffDay = String(dateObj.getUTCDate()).padStart(2, '0');
      const dayOffDate = `${dateOffYear}-${dateOffMonth}-${dateOffDay}`;
      return dayOffDate === targetDate;
    });

    if (isDayOff) {
      const dayOffInfo = professionalDaysOff.find(d => {
        const dateObj = new Date(d.dateOff);
        const dateOffYear = dateObj.getUTCFullYear();
        const dateOffMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const dateOffDay = String(dateObj.getUTCDate()).padStart(2, '0');
        const dayOffDate = `${dateOffYear}-${dateOffMonth}-${dateOffDay}`;
        return dayOffDate === targetDate;
      });
      const reason = dayOffInfo?.reason ? ` - ${dayOffInfo.reason}` : '';
      availabilityText += `  ❌ INDISPONÍVEL${reason} (NÃO AGENDAR NESTE DIA)\n\n`;
      continue;
    }

    // Check if there's an exceptional schedule for this specific date
    const exceptionalSchedules = await storage.getProfessionalExceptionalSchedulesByDateRange(prof.id, targetDate, targetDate);
    let workStart: string;
    let workEnd: string;
    let isExceptionalDay = false;

    if (exceptionalSchedules.length > 0) {
      workStart = exceptionalSchedules[0].startTime;
      workEnd = exceptionalSchedules[0].endTime;
      isExceptionalDay = true;
    } else {
      // Check if professional has schedule for this day
      const daySchedule = professionalSchedules.find(s => s.dayOfWeek === dayOfWeek && s.isEnabled);
      if (!daySchedule) {
        availabilityText += `  ❌ NÃO TRABALHA NESTE DIA DA SEMANA\n\n`;
        continue;
      }
      workStart = daySchedule.startTime;
      workEnd = daySchedule.endTime;
    }

    availabilityText += `  ✅ Horário de trabalho: ${workStart} às ${workEnd}\n`;

    // Get breaks for this specific day (exception breaks or regular day-of-week breaks)
    let dayBreaks: { startTime: string; endTime: string }[] = [];
    if (isExceptionalDay && exceptionalSchedules.length > 0) {
      dayBreaks = await storage.getExceptionBreaks(exceptionalSchedules[0].id);
    } else {
      dayBreaks = professionalBreaks.filter(brk => brk.dayOfWeek === dayKey);
    }

    // Get appointments for this specific date
    const dayAppointments = existingAppointments.filter(apt => {
      return apt.professionalId === prof.id &&
             apt.status !== 'Cancelado' &&
             apt.status !== 'cancelado' &&
             apt.appointmentDate === targetDate;
    });

    // Show busy times with duration (same format as the first 7 days)
    if (dayAppointments.length > 0) {
      // Show appointments with duration to help AI understand time blocks
      const appointmentDetails = dayAppointments
        .map(apt => {
          const duration = apt.duration || 30;
          const [startHour, startMin] = apt.appointmentTime.split(':').map(Number);
          const startInMinutes = startHour * 60 + startMin;
          const endInMinutes = startInMinutes + duration;
          const endHour = Math.floor(endInMinutes / 60);
          const endMin = endInMinutes % 60;
          const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
          return `${apt.appointmentTime}-${endTime} (${duration}min)`;
        })
        .sort()
        .join(', ');
      availabilityText += `  🚫 OCUPADO ${appointmentDetails}\n`;
    } else {
      availabilityText += `  ✅ Sem agendamentos ainda - horários disponíveis\n`;
    }

    // Show break times
    if (dayBreaks.length > 0) {
      const breakTimes = dayBreaks
        .map(brk => `${brk.startTime}-${brk.endTime}`)
        .join(', ');
      availabilityText += `  ⏸️ PAUSA/INTERVALO: ${breakTimes} (NÃO AGENDAR)\n`;
    }

    availabilityText += '\n';
  }

  availabilityText += `⚠️ IMPORTANTE: Antes de confirmar qualquer horário para ${formatted}, verifique se o horário NÃO está marcado como OCUPADO ou PAUSA acima.\n`;

  return availabilityText;
}

/**
 * Verifica se precisa buscar disponibilidade de data específica
 * Retorna informações adicionais se necessário
 */
async function checkSpecificDateAvailability(
  messageText: string,
  conversationHistory: any[],
  professionals: any[],
  existingAppointments: any[]
): Promise<string> {
  // Extrai data específica mencionada
  const specificDate = extractSpecificDateFromMessage(messageText, conversationHistory);

  if (!specificDate) {
    return ''; // Não encontrou data específica
  }

  console.log(`📅 Data específica detectada: ${specificDate}`);

  // Calcula diferença de dias
  const daysDiff = getDaysDifference(specificDate);

  console.log(`📊 Diferença de dias: ${daysDiff}`);

  // Se for data passada, informa
  if (daysDiff < 0) {
    return '\n\n⚠️ ATENÇÃO: A data mencionada já passou. Por favor, solicite uma data futura.\n';
  }

  // Se for dentro dos próximos 7 dias, não precisa buscar (já está no contexto padrão)
  if (daysDiff <= 7) {
    console.log(`⚡ Data dentro dos próximos 7 dias - usando disponibilidade padrão`);
    return '';
  }

  // Se for além de 30 dias, bloqueia
  if (daysDiff > 30) {
    const [year, month, day] = specificDate.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const formatted = dateObj.toLocaleDateString('pt-BR');
    return `\n\n⚠️ ATENÇÃO: A data ${formatted} está além do período de agendamento permitido (máximo 30 dias). Por favor, escolha uma data dentro dos próximos 30 dias.\n`;
  }

  // Se for entre 8-30 dias, busca disponibilidade em tempo real
  console.log(`🔍 Buscando disponibilidade em tempo real para ${specificDate}`);
  const availability = await getSpecificDateAvailability(specificDate, professionals, existingAppointments);

  return availability;
}

// ==================== FIM DA VERIFICAÇÃO DE DISPONIBILIDADE PARA DATAS ESPECÍFICAS ====================

/**
 * Verifica se um horário específico está disponível em algum dia da semana
 * Retorna os dias que têm esse horário disponível
 */
async function checkSpecificTimeAvailability(
  companyId: number,
  professionalId: number,
  targetTime: string, // formato HH:MM
  daysToCheck: number = 7
): Promise<string> {
  try {
    const professionals = await storage.getProfessionalsByCompany(companyId);
    const professional = professionals.find(p => p.id === professionalId);

    if (!professional) {
      return `Desculpe, não consegui identificar o profissional.`;
    }

    // Gerar próximos dias (usando timezone Brasil)
    const nextDays: { date: string; dayName: string; formatted: string; dayOfWeek: number }[] = [];
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

    for (let i = 1; i <= daysToCheck; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      // Usar UTC para evitar problemas de timezone
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const dayOfWeek = date.getDay();

      nextDays.push({
        date: dateStr,
        dayName: dayNames[dayOfWeek],
        formatted: `${day}/${month}`,
        dayOfWeek
      });
    }

    const startDate = nextDays[0].date;
    const endDate = nextDays[nextDays.length - 1].date;

    // Buscar schedules, folgas e horários excepcionais
    const professionalSchedules = await storage.getProfessionalSchedules(professionalId);
    const professionalDaysOff = await storage.getProfessionalDaysOffByDateRange(professionalId, startDate, endDate);
    const professionalExceptionalSchedules = await storage.getProfessionalExceptionalSchedulesByDateRange(professionalId, startDate, endDate);
    const existingAppointments = await storage.getAppointmentsByCompanyInRange(companyId, startDate, endDate);

    // Normalizar horário buscado
    const [targetHour, targetMin] = targetTime.split(':').map(Number);
    const targetMinutes = targetHour * 60 + targetMin;

    const availableDays: string[] = [];

    for (const day of nextDays) {
      // Verificar se é dia de folga
      const isDayOff = professionalDaysOff.some(d => {
        const dateObj = new Date(d.dateOff);
        const dayOffDate = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        return dayOffDate === day.date;
      });

      if (isDayOff) continue;

      // Verificar horário excepcional
      const exceptionalSchedule = professionalExceptionalSchedules.find(exc => {
        const dateObj = new Date(exc.exceptionDate);
        const excDate = `${dateObj.getUTCFullYear()}-${String(dateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(dateObj.getUTCDate()).padStart(2, '0')}`;
        return excDate === day.date;
      });

      let workStart: string;
      let workEnd: string;

      if (exceptionalSchedule) {
        workStart = exceptionalSchedule.startTime;
        workEnd = exceptionalSchedule.endTime;
      } else {
        const daySchedule = professionalSchedules.find(s => s.dayOfWeek === day.dayOfWeek && s.isEnabled);
        if (!daySchedule) continue;
        workStart = daySchedule.startTime;
        workEnd = daySchedule.endTime;
      }

      // Converter horários para minutos
      const [startH, startM] = workStart.split(':').map(Number);
      const [endH, endM] = workEnd.split(':').map(Number);
      const workStartMinutes = startH * 60 + startM;
      const workEndMinutes = endH * 60 + endM;

      // Verificar se o horário buscado está dentro do expediente
      if (targetMinutes < workStartMinutes || targetMinutes >= workEndMinutes) continue;

      // Verificar se já tem agendamento nesse horário
      const dayAppointments = existingAppointments.filter(apt =>
        apt.professionalId === professionalId &&
        apt.appointmentDate === day.date &&
        apt.status !== 'cancelado' &&
        apt.status !== 'Cancelado'
      );

      const isOccupied = dayAppointments.some(apt => {
        const [aptH, aptM] = apt.appointmentTime.split(':').map(Number);
        const aptMinutes = aptH * 60 + aptM;
        // Considerando duração padrão de 40 minutos
        return targetMinutes >= aptMinutes && targetMinutes < aptMinutes + 40;
      });

      if (!isOccupied) {
        availableDays.push(`${day.dayName} (${day.formatted})`);
      }
    }

    if (availableDays.length === 0) {
      return `Infelizmente não temos o horário das ${targetTime} disponível nos próximos ${daysToCheck} dias. Gostaria de verificar outro horário?`;
    }

    if (availableDays.length === 1) {
      return `Temos o horário das ${targetTime} disponível na ${availableDays[0]} com ${professional.name}. Gostaria de agendar?`;
    }

    return `Temos o horário das ${targetTime} disponível nos seguintes dias com ${professional.name}:\n${availableDays.map(d => `• ${d}`).join('\n')}\n\nQual dia você prefere?`;

  } catch (error) {
    console.error('Erro ao verificar disponibilidade de horário:', error);
    return `Desculpe, ocorreu um erro ao verificar a disponibilidade. Pode tentar novamente?`;
  }
}

/**
 * Calcula e retorna horários disponíveis para um serviço específico em uma data
 * Considera a duração do serviço para evitar conflitos
 */
async function getAvailableTimesForService(
  companyId: number,
  serviceId: number,
  professionalId: number,
  dateStr: string
): Promise<string> {
  try {
    // Buscar informações do serviço
    const services = await storage.getServicesByCompany(companyId);
    const service = services.find(s => s.id === serviceId);

    if (!service) {
      console.log(`⚠️ Serviço ID ${serviceId} não encontrado. Serviços disponíveis:`, services.map(s => `${s.id}:${s.name}`));
      // Retornar mensagem amigável ao invés de erro
      return `Desculpe, não consegui identificar o serviço. Pode me informar novamente qual serviço você deseja?`;
    }

    const serviceDuration = service.duration || 30;

    // Buscar informações do profissional
    const professionals = await storage.getProfessionalsByCompany(companyId);
    const professional = professionals.find(p => p.id === professionalId);

    if (!professional) {
      console.log(`⚠️ Profissional ID ${professionalId} não encontrado. Profissionais disponíveis:`, professionals.map(p => `${p.id}:${p.name}`));
      // Retornar mensagem amigável ao invés de erro
      return `Desculpe, não consegui identificar o profissional. Pode me informar novamente com quem você gostaria de agendar?`;
    }

    // Buscar horários de trabalho do profissional
    const professionalSchedules = await storage.getProfessionalSchedules(professionalId);
    const professionalBreaks = await storage.getProfessionalBreaks(professionalId);
    const professionalDaysOff = await storage.getProfessionalDaysOffByDateRange(professionalId, dateStr, dateStr);
    const professionalExceptionalSchedules = await storage.getProfessionalExceptionalSchedulesByDateRange(professionalId, dateStr, dateStr);

    // Verificar se é dia de folga
    if (professionalDaysOff.length > 0) {
      try {
        const nextDaySuggestions = await getAvailabilitySummary(companyId, professionalId, serviceId, dateStr, 8);
        const daysWithSlots = nextDaySuggestions
          .filter(d => d.date !== dateStr && (d.status === 'available' || d.status === 'partial') && d.slotsCount > 0);

        if (daysWithSlots.length > 0) {
          const suggestions = daysWithSlots.slice(0, 5).map(d =>
            `📅 *${d.dayName}*, ${d.dateFormatted} — ${d.slotsCount} horário${d.slotsCount > 1 ? 's' : ''} disponível${d.slotsCount > 1 ? 'is' : ''}`
          ).join('\n');

          return `😕 ${professional.name} não está disponível nesta data.\n\nMas temos disponibilidade nos seguintes dias:\n\n${suggestions}\n\nQual desses dias fica melhor pra você?`;
        }
      } catch (err) {
        console.error('⚠️ Erro ao buscar sugestões de dias:', err);
      }
      return `❌ ${professional.name} não está disponível nesta data (dia de folga ou indisponível).\n\nQue tal escolher outro dia?`;
    }

    // Determinar dia da semana (0 = domingo, 1 = segunda, etc.)
    const date = new Date(dateStr + 'T00:00:00');
    const dayOfWeek = date.getDay();
    const dayOfWeekKeyMap: { [key: number]: string } = {
      0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta',
      4: 'quinta', 5: 'sexta', 6: 'sabado'
    };
    const dayOfWeekKey = dayOfWeekKeyMap[dayOfWeek];

    // Verificar se há horário excepcional para esta data específica
    let workStartTime: string;
    let workEndTime: string;

    if (professionalExceptionalSchedules.length > 0) {
      // Usar horário excepcional
      const exceptionalSchedule = professionalExceptionalSchedules[0];
      workStartTime = exceptionalSchedule.startTime;
      workEndTime = exceptionalSchedule.endTime;
    } else {
      // Buscar horário regular de trabalho para este dia
      const daySchedule = professionalSchedules.find(s => s.dayOfWeek === dayOfWeek && s.isEnabled);

      if (!daySchedule) {
        const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

        try {
          const nextDaySuggestions = await getAvailabilitySummary(companyId, professionalId, serviceId, dateStr, 8);
          const daysWithSlots = nextDaySuggestions
            .filter(d => d.date !== dateStr && (d.status === 'available' || d.status === 'partial') && d.slotsCount > 0);

          if (daysWithSlots.length > 0) {
            const suggestions = daysWithSlots.slice(0, 5).map(d =>
              `📅 *${d.dayName}*, ${d.dateFormatted} — ${d.slotsCount} horário${d.slotsCount > 1 ? 's' : ''} disponível${d.slotsCount > 1 ? 'is' : ''}`
            ).join('\n');

            return `😕 ${professional.name} não trabalha às ${dayNames[dayOfWeek]}.\n\nMas temos disponibilidade nos seguintes dias:\n\n${suggestions}\n\nQual desses dias fica melhor pra você?`;
          }
        } catch (err) {
          console.error('⚠️ Erro ao buscar sugestões de dias:', err);
        }

        return `😕 ${professional.name} não trabalha às ${dayNames[dayOfWeek]}.\n\nQue tal escolher outro dia? Estou aqui para ajudar!`;
      }

      workStartTime = daySchedule.startTime;
      workEndTime = daySchedule.endTime;
    }

    // Buscar agendamentos existentes para este dia (excluindo cancelados)
    const [existingAppointments] = await pool.execute(
      `SELECT appointment_time, duration, status, client_name FROM appointments
       WHERE company_id = ? AND professional_id = ? AND appointment_date = ?
       AND status NOT IN ('Cancelado', 'cancelado', 'cancelled')
       ORDER BY appointment_time`,
      [companyId, professionalId, dateStr]
    ) as any;

    // DEBUG: Mostrar parâmetros da busca e agendamentos encontrados
    console.log(`\n========== DEBUG HORÁRIOS ==========`);
    console.log(`📌 Parâmetros: companyId=${companyId}, professionalId=${professionalId}, date=${dateStr}`);
    console.log(`📊 Agendamentos encontrados: ${existingAppointments.length}`);
    if (existingAppointments.length > 0) {
      existingAppointments.forEach((apt: any) => {
        console.log(`   ➡️ ${apt.appointment_time} | Duração: ${apt.duration}min | Status: ${apt.status} | Cliente: ${apt.client_name}`);
      });
    } else {
      console.log(`   ⚠️ NENHUM agendamento encontrado para estes parâmetros!`);
    }
    console.log(`====================================\n`);

    // Converter horário de início e fim para minutos
    const [startHour, startMin] = workStartTime.split(':').map(Number);
    const [endHour, endMin] = workEndTime.split(':').map(Number);
    const workStartMinutes = startHour * 60 + startMin;
    const workEndMinutes = endHour * 60 + endMin;

    // Intervalo de agendamento - se 0 (sem intervalo), usar a duração do serviço
    const configuredInterval = professional.timeInterval || 0;
    const timeInterval = configuredInterval === 0 ? serviceDuration : configuredInterval;

    // === FILTRO DE HORÁRIOS PASSADOS E ANTECEDÊNCIA MÍNIMA ===
    const brazilNowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const brazilNow = new Date(brazilNowStr);
    const todayStr = `${brazilNow.getFullYear()}-${String(brazilNow.getMonth() + 1).padStart(2, '0')}-${String(brazilNow.getDate()).padStart(2, '0')}`;

    let minTimeMinutes = workStartMinutes;
    const minimumAdvanceHours = Number(professional.minimumAdvanceHours) || 0;

    if (dateStr === todayStr) {
      const currentMinutes = brazilNow.getHours() * 60 + brazilNow.getMinutes();
      const advanceMinutes = minimumAdvanceHours * 60;
      const minAdvanceMinutes = currentMinutes + advanceMinutes;
      minTimeMinutes = Math.max(workStartMinutes, minAdvanceMinutes);

      if (timeInterval > 0) {
        minTimeMinutes = Math.ceil(minTimeMinutes / timeInterval) * timeInterval;
      }
    }
    // === FIM DO FILTRO ===

    // Calcular horários disponíveis
    const availableTimes: string[] = [];
    let currentTimeMinutes = workStartMinutes;

    while (currentTimeMinutes + serviceDuration <= workEndMinutes) {
      // NOVO: Pular horários antes do mínimo permitido (passados + antecedência)
      if (currentTimeMinutes < minTimeMinutes) {
        currentTimeMinutes += timeInterval;
        continue;
      }

      const currentHour = Math.floor(currentTimeMinutes / 60);
      const currentMin = currentTimeMinutes % 60;
      const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

      // Verificar se há conflito com agendamentos existentes
      let hasConflict = false;

      for (const apt of existingAppointments) {
        const [aptHour, aptMin] = apt.appointment_time.split(':').map(Number);
        const aptStartMinutes = aptHour * 60 + aptMin;
        const aptDuration = apt.duration || 30;
        const aptEndMinutes = aptStartMinutes + aptDuration;

        // Verifica sobreposição
        const newEndMinutes = currentTimeMinutes + serviceDuration;

        if ((currentTimeMinutes < aptEndMinutes) && (newEndMinutes > aptStartMinutes)) {
          hasConflict = true;
          break;
        }
      }

      // Verificar se está em horário de pausa (excepcional ou regular)
      let isBreakTime = false;
      let breaksToCheck: { startTime: string; endTime: string }[] = [];
      if (professionalExceptionalSchedules.length > 0) {
        breaksToCheck = await storage.getExceptionBreaks(professionalExceptionalSchedules[0].id);
      } else {
        breaksToCheck = professionalBreaks.filter(brk => brk.dayOfWeek === dayOfWeekKey);
      }
      for (const brk of breaksToCheck) {
        const [brkStartHour, brkStartMin] = brk.startTime.split(':').map(Number);
        const [brkEndHour, brkEndMin] = brk.endTime.split(':').map(Number);
        const brkStartMinutes = brkStartHour * 60 + brkStartMin;
        const brkEndMinutes = brkEndHour * 60 + brkEndMin;

        const newEndMinutes = currentTimeMinutes + serviceDuration;

        if ((currentTimeMinutes < brkEndMinutes) && (newEndMinutes > brkStartMinutes)) {
          isBreakTime = true;
          break;
        }
      }

      if (!hasConflict && !isBreakTime) {
        availableTimes.push(timeStr);
      }

      currentTimeMinutes += timeInterval;
    }

    // Formatar resposta - apenas os horários de forma simples
    if (availableTimes.length === 0) {
      // Buscar disponibilidade nos próximos 7 dias úteis para sugerir alternativas
      try {
        const nextDaySuggestions = await getAvailabilitySummary(companyId, professionalId, serviceId, dateStr, 8);
        const daysWithSlots = nextDaySuggestions
          .filter(d => d.date !== dateStr && (d.status === 'available' || d.status === 'partial') && d.slotsCount > 0);

        if (daysWithSlots.length > 0) {
          const suggestions = daysWithSlots.slice(0, 5).map(d =>
            `📅 *${d.dayName}*, ${d.dateFormatted} — ${d.slotsCount} horário${d.slotsCount > 1 ? 's' : ''} disponível${d.slotsCount > 1 ? 'is' : ''}`
          ).join('\n');

          return `😕 Esse dia já está com a agenda cheia!\n\nMas temos disponibilidade nos seguintes dias:\n\n${suggestions}\n\nQual desses dias fica melhor pra você?`;
        }
      } catch (err) {
        console.error('⚠️ Erro ao buscar sugestões de dias:', err);
      }

      // Fallback caso não encontre nenhum dia com disponibilidade
      return `😕 Não temos horários disponíveis nesta data.\n\nQue tal escolher outro dia? Estou aqui para ajudar!`;
    }

    // Retorna apenas os horários agrupados
    let response = '';
    for (let i = 0; i < availableTimes.length; i += 5) {
      const group = availableTimes.slice(i, i + 5);
      response += `${group.join(' | ')}\n`;
    }

    return response.trim();
  } catch (error) {
    console.error('❌ Erro ao calcular horários disponíveis:', error);
    return '❌ Erro ao calcular horários disponíveis. Por favor, tente novamente.';
  }
}

// ==================== FIM DO CÁLCULO DE HORÁRIOS DISPONÍVEIS PARA SERVIÇO ====================

// ========================================
// FUNÇÃO AUXILIAR GLOBAL: Criar um único agendamento a partir de dados extraídos
// ========================================
async function createSingleAppointmentFromExtractedData(
  targetCompanyId: number,
  data: any,
  targetPhoneNumber: string,
  targetInitialStatus: string,
  targetContactName?: string
): Promise<number | null> {
  try {
    // Buscar serviços e profissionais
    const services = await storage.getServicesByCompany(targetCompanyId);
    const professionals = await storage.getProfessionalsByCompany(targetCompanyId);

    // Encontrar serviço
    let serviceId: number | null = null;
    let serviceDuration = 30;
    if (data.service) {
      const serviceName = data.service.toLowerCase();
      const foundService = services.find(s => s.name.toLowerCase() === serviceName) ||
                          services.find(s => s.name.toLowerCase().includes(serviceName) || serviceName.includes(s.name.toLowerCase()));
      if (foundService) {
        serviceId = foundService.id;
        serviceDuration = foundService.duration || 30;
      }
    }

    // Encontrar profissional
    let professionalId: number | null = null;
    if (data.professional) {
      const profName = data.professional.toLowerCase();
      const foundProf = professionals.find(p => p.name.toLowerCase() === profName) ||
                       professionals.find(p => p.name.toLowerCase().includes(profName) || profName.includes(p.name.toLowerCase()));
      if (foundProf) {
        professionalId = foundProf.id;
      }
    }

    // Se não encontrou profissional, usar o primeiro ativo
    if (!professionalId && professionals.length > 0) {
      const activeProf = professionals.find(p => p.active);
      if (activeProf) professionalId = activeProf.id;
    }

    // Converter data DD/MM/YYYY para YYYY-MM-DD
    let appointmentDate = '';
    if (data.date) {
      const dateParts = data.date.split('/');
      if (dateParts.length === 3) {
        appointmentDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
      }
    }

    if (!appointmentDate || !data.time || !professionalId) {
      console.log('❌ [Multi] Dados insuficientes:', { appointmentDate, time: data.time, professionalId });
      return null;
    }

    // Verificar conflito de horário - busca direta no banco
    const [existingAppointments] = await pool.execute(
      `SELECT appointment_time, duration, status FROM appointments
       WHERE professional_id = ? AND appointment_date = ?
       AND status NOT IN ('Cancelado', 'cancelado', 'cancelled')`,
      [professionalId, appointmentDate]
    ) as any;

    const requestedTimeMinutes = parseInt(data.time.split(':')[0]) * 60 + parseInt(data.time.split(':')[1]);
    const requestedEndMinutes = requestedTimeMinutes + serviceDuration;

    for (const apt of existingAppointments) {
      const aptTime = apt.appointment_time || apt.appointmentTime;
      if (!aptTime) continue;
      const aptTimeMinutes = parseInt(aptTime.split(':')[0]) * 60 + parseInt(aptTime.split(':')[1]);
      const aptEndMinutes = aptTimeMinutes + (apt.duration || 30);

      if ((requestedTimeMinutes < aptEndMinutes) && (requestedEndMinutes > aptTimeMinutes)) {
        console.log(`❌ [Multi] Conflito: ${data.time} conflita com ${aptTime}`);
        return null;
      }
    }

    // Criar ou buscar cliente - busca direta no banco
    let clientId: number | null = null;
    const cleanPhone = targetPhoneNumber.replace(/\D/g, '');
    const clientName = data.clientName || targetContactName || 'Cliente';

    // Buscar cliente existente pelo telefone
    const [existingClients] = await pool.execute(
      `SELECT id FROM clients WHERE company_id = ? AND phone = ? LIMIT 1`,
      [targetCompanyId, cleanPhone]
    ) as any;

    if (existingClients && existingClients.length > 0) {
      clientId = existingClients[0].id;
    } else {
      // Criar novo cliente
      const [insertResult] = await pool.execute(
        `INSERT INTO clients (company_id, name, phone, created_at) VALUES (?, ?, ?, NOW())`,
        [targetCompanyId, clientName, cleanPhone]
      ) as any;
      clientId = insertResult.insertId;
    }

    // Criar agendamento
    const appointment = await storage.createAppointment({
      companyId: targetCompanyId,
      professionalId,
      serviceId,
      clientId,
      clientName: data.clientName || targetContactName || 'Cliente',
      clientPhone: cleanPhone,
      appointmentDate,
      appointmentTime: data.time,
      duration: serviceDuration,
      status: targetInitialStatus,
      notes: `Agendamento via WhatsApp (múltiplos)`
    });

    return appointment.id;
  } catch (error) {
    console.error('❌ [Multi] Erro ao criar agendamento:', error);
    return null;
  }
}

// ========================================
// FUNÇÃO AUXILIAR GLOBAL: Extrair dados de um único bloco de agendamento
// ========================================
function extractDataFromAppointmentBlock(blockText: string): any {
  const data: any = {};

  // Extract service
  const serviceMatch = blockText.match(/💼\s*Serviço:\s*(.+?)(?:\n|$)/i) ||
                      blockText.match(/Serviço:\s*(.+?)(?:\n|$)/i) ||
                      blockText.match(/✂️\s*Serviço:\s*(.+?)(?:\n|$)/i);
  if (serviceMatch) data.service = serviceMatch[1].trim();

  // Extract name - com fallbacks para formato livre
  const nameMatch = blockText.match(/👤\s*Nome:\s*(.+?)(?:\n|$)/i) ||
                   blockText.match(/Nome:\s*(.+?)(?:\n|$)/i) ||
                   // Fallback: nome após marcador numérico (ex: "1️⃣ Everton às 09:00")
                   blockText.match(/(?:1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)\s*([A-ZÀ-Ÿ][a-záéíóúâêôãõüç]+(?:\s+[A-ZÀ-Ÿa-záéíóúâêôãõüç]+)*)\s+(?:às|as|–|-|:|\d)/i) ||
                   // Fallback: nome após marcador sem "às" (ex: "1️⃣ Everton")
                   blockText.match(/(?:1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)\s*([A-ZÀ-Ÿ][a-záéíóúâêôãõüç]+(?:\s+[A-ZÀ-Ÿa-záéíóúâêôãõüç]+)*)/i);
  if (nameMatch) data.clientName = nameMatch[1].trim();

  // Extract professional
  const profMatch = blockText.match(/🏢\s*Profissional:\s*(.+?)(?:\n|$)/i) ||
                   blockText.match(/Profissional:\s*(.+?)(?:\n|$)/i) ||
                   blockText.match(/👨‍💼\s*Profissional:\s*(.+?)(?:\n|$)/i) ||
                   // Fallback: "com o profissional X" ou "com X"
                   blockText.match(/com\s+(?:o\s+)?profissional\s+([A-ZÀ-Ÿ][a-záéíóúâêôãõüç]+(?:\s+[A-ZÀ-Ÿa-záéíóúâêôãõüç]+)*)/i) ||
                   blockText.match(/todos\s+com\s+(?:o\s+)?(?:profissional\s+)?([A-ZÀ-Ÿ][a-záéíóúâêôãõüç]+)/i);
  if (profMatch) data.professional = profMatch[1].trim();

  // Extract date
  const dateMatch = blockText.match(/📅\s*Data:\s*(?:[^,\d]+,\s*)?(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
                   blockText.match(/Data:\s*(?:[^,\d]+,\s*)?(\d{1,2}\/\d{1,2}\/\d{4})/i) ||
                   blockText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (dateMatch) {
    const dateParts = dateMatch[1].trim().split('/');
    if (dateParts.length === 3) {
      data.date = `${dateParts[0].padStart(2, '0')}/${dateParts[1].padStart(2, '0')}/${dateParts[2]}`;
    }
  }

  // Extract time - com fallbacks para formato livre e horários truncados
  const timeMatch = blockText.match(/🕐\s*Horário:\s*(\d{1,2}:\d{2})/i) ||
                   blockText.match(/Horário:\s*(\d{1,2}:\d{2})/i) ||
                   blockText.match(/Hora:\s*(\d{1,2}:\d{2})/i) ||
                   // Fallback: "às HH:MM" ou "as HH:MM"
                   blockText.match(/(?:às|as)\s+(\d{1,2}:\d{2})/i) ||
                   // Fallback: HH:MM solto no texto (apenas se não for data)
                   blockText.match(/(?:^|[^\d\/])(\d{1,2}:\d{2})(?:[^\d]|$)/);
  if (timeMatch) {
    data.time = timeMatch[1].trim();
  } else {
    // Fallback para horários TRUNCADOS: "12:" ou "9:" (IA cortou os minutos)
    const truncatedTimeMatch = blockText.match(/🕐\s*Horário:\s*(\d{1,2}):\s*$/im) ||
                               blockText.match(/Horário:\s*(\d{1,2}):\s*$/im) ||
                               blockText.match(/🕐\s*Horário:\s*(\d{1,2}):\s*(?:\n|,)/i) ||
                               blockText.match(/Horário:\s*(\d{1,2}):\s*(?:\n|,)/i) ||
                               // Horário sem minutos: "Horário: 12" ou "às 12"
                               blockText.match(/🕐\s*Horário:\s*(\d{1,2})\s*$/im) ||
                               blockText.match(/Horário:\s*(\d{1,2})\s*$/im) ||
                               blockText.match(/(?:às|as)\s+(\d{1,2})\s*(?:\n|,|$)/i);
    if (truncatedTimeMatch) {
      const hour = truncatedTimeMatch[1].padStart(2, '0');
      data.time = `${hour}:00`;
      console.log(`⚠️ Horário truncado detectado "${truncatedTimeMatch[0].trim()}" → normalizado para ${data.time}`);
    }
  }

  return data;
}

async function createAppointmentFromAIConfirmation(conversationId: number, companyId: number, aiResponse: string, phoneNumber: string, initialStatus: string = 'agendado', contactName?: string): Promise<number | null> {
  try {
    console.log('==================================================');
    console.log('🎯 INICIANDO CRIAÇÃO DE AGENDAMENTO VIA CONFIRMAÇÃO');
    console.log('==================================================');
    console.log('🔍 AI Response to analyze:', aiResponse);
    console.log('📱 Phone number:', phoneNumber);
    console.log('🏢 Company ID:', companyId);
    console.log('💬 Conversation ID:', conversationId);
    console.log('👤 Contact Name (pushName):', contactName || 'não disponível');

    // IMPORTANTE: NÃO processar mensagens que são do TEMPLATE de confirmação (já enviadas pelo sistema)
    const isTemplateConfirmationMessage = aiResponse.includes('Agendamento Confirmado!') &&
                                          aiResponse.includes('Obrigado por escolher nossos serviços');

    if (isTemplateConfirmationMessage) {
      console.log('⚠️ Mensagem é template de confirmação já enviado, não criando duplicata');
      return null;
    }

    // Check if it's a summary message with appointment details (asking for confirmation)
    const hasSummaryFormat = (
      (aiResponse.includes('👤') || aiResponse.includes('Nome:')) &&
      (aiResponse.includes('📅') || aiResponse.includes('Data:')) &&
      (aiResponse.includes('🕐') || aiResponse.includes('Horário:'))
    );

   // Check if it's asking for confirmation
    const isAskingConfirmation = (
      aiResponse.includes('Está tudo correto?') ||
      aiResponse.includes('Responda SIM para confirmar') ||
      aiResponse.includes('Responda SIM para cancelar') ||
      aiResponse.includes('CANCELAR* para confirmar') ||
      aiResponse.includes('CANCELAR para confirmar') ||
      aiResponse.includes('Confirma a remarcação?') ||
      aiResponse.includes('Confirma o cancelamento?') ||
      aiResponse.includes('confirmar seu agendamento') ||
      aiResponse.includes('Vou confirmar')
    );

    // Check if it's AI confirming the appointment (after user said SIM)
    const isAIConfirmingAppointment = (
      (aiResponse.includes('agendamento foi confirmado') ||
       aiResponse.includes('Nos vemos') ||
       aiResponse.includes('está confirmado') ||
       aiResponse.includes('confirmado para')) &&
      (aiResponse.match(/\d{2}\/\d{2}\/\d{4}/) || aiResponse.match(/segunda|terça|quarta|quinta|sexta|sábado|domingo/i)) &&
      (aiResponse.match(/\d{1,2}:\d{2}/) || aiResponse.includes('às'))
    );

    // Check if message has appointment data (date/time)
    const hasAppointmentData = (
      (aiResponse.match(/\d{2}\/\d{2}\/\d{4}/) || aiResponse.match(/segunda|terça|quarta|quinta|sexta|sábado|domingo/i)) &&
      (aiResponse.match(/\d{1,2}:\d{2}/) || aiResponse.includes('às'))
    );

    console.log('🔍 Verificações:', {
      hasSummaryFormat,
      isAskingConfirmation,
      isAIConfirmingAppointment,
      hasAppointmentData,
      willProceed: (hasSummaryFormat && isAskingConfirmation) || isAIConfirmingAppointment || hasAppointmentData
    });

    // Proceed if: asking for confirmation with summary, OR AI is confirming, OR has appointment data
    if (!((hasSummaryFormat && isAskingConfirmation) || isAIConfirmingAppointment || hasAppointmentData)) {
      console.log('❌ Mensagem não contém dados de agendamento válidos. Não criando agendamento.');
      return null;
    }
    console.log('✅ Resumo de agendamento encontrado, processando extração de dados');

    // Get conversation history to extract appointment data
    const allMessages = await storage.getMessagesByConversation(conversationId);

    // ========================================
    // 🔄 REUTILIZAR DADOS DA PRÉ-VALIDAÇÃO
    // ========================================
    // Se a mensagem atual é uma CONFIRMAÇÃO (ex: "Agendamento realizado com sucesso!"),
    // precisamos buscar a mensagem de RESUMO anterior para extrair dados corretamente.
    // A mensagem de confirmação tem formato diferente e não tem os emojis/estrutura do resumo.
    let messageToExtractFrom = aiResponse;

    const isConfirmationResponse = (
      aiResponse.includes('Agendamento realizado com sucesso') ||
      aiResponse.includes('agendamento foi confirmado') ||
      aiResponse.includes('Nos vemos') ||
      aiResponse.includes('está confirmado')
    );

    if (isConfirmationResponse) {
      console.log('🔄 Resposta atual é CONFIRMAÇÃO, buscando mensagem de RESUMO anterior...');

      // Buscar mensagem de resumo nas últimas 5 mensagens do assistente
      const recentAssistantMessages = allMessages
        .filter(m => m.role === 'assistant')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);

      const summaryMessage = recentAssistantMessages.find(m =>
        !m.content.includes('Agendamento Confirmado!') &&
        !m.content.includes('Obrigado por escolher nossos serviços') &&
        !m.content.includes('Agendamento realizado com sucesso') &&
        (
          ((m.content.includes('Está tudo correto?') ||
            m.content.includes('Responda SIM para confirmar') ||
            m.content.includes('Digite SIM ou OK para confirmar') ||
            m.content.includes('confirmar seu agendamento') ||
            m.content.includes('Vou confirmar')) &&
           (m.content.includes('👤') || m.content.includes('Nome:')) &&
           (m.content.includes('📅') || m.content.includes('Data:')) &&
           (m.content.includes('🕐') || m.content.includes('Horário:')))
        )
      );

      if (summaryMessage) {
        console.log('✅ Mensagem de RESUMO encontrada, usando ela para extração de dados');
        console.log('📋 Resumo (primeiros 200 chars):', summaryMessage.content.substring(0, 200));
        messageToExtractFrom = summaryMessage.content;
      } else {
        console.log('⚠️ Mensagem de RESUMO não encontrada, usando resposta atual');
      }
    }
    // ========================================

    // ========================================
    // 🔄 DETECTAR MÚLTIPLOS AGENDAMENTOS
    // ========================================
    // Método 1: Marcadores numéricos (1️⃣, 2️⃣, etc.)
    const numericMarkers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
    const foundNumericMarkers = numericMarkers.filter(marker => messageToExtractFrom.includes(marker));

    // Método 2: Contar ocorrências de campos-chave (👤 Nome:, 🕐 Horário:)
    const nameMatches = (messageToExtractFrom.match(/👤\s*Nome:/gi) || []).length;
    const timeMatches = (messageToExtractFrom.match(/🕐\s*Horário:/gi) || []).length;

    // Detecta múltiplos se: tem 2+ marcadores numéricos OU tem 2+ nomes E 2+ horários
    const hasMultipleByMarkers = foundNumericMarkers.length >= 2;
    const hasMultipleByFields = nameMatches >= 2 && timeMatches >= 2;

    if (hasMultipleByMarkers || hasMultipleByFields) {
      console.log('🔄 MÚLTIPLOS AGENDAMENTOS DETECTADOS!');
      console.log(`   - Marcadores numéricos: ${foundNumericMarkers.length}`);
      console.log(`   - Campos Nome: ${nameMatches}, Horário: ${timeMatches}`);

      // Escolher método de divisão baseado no que foi detectado
      let appointmentBlocks: string[];

      // Função auxiliar para validar se um bloco tem dados mínimos de agendamento
      const isValidAppointmentBlock = (block: string): boolean => {
        const trimmed = block.trim();
        // Bloco válido deve ter Nome (label OU nome próprio após marcador) E (Data ou Horário ou HH:MM)
        const hasNameLabel = /Nome:/i.test(trimmed);
        const hasNameAfterMarker = /(?:1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)\s*[A-ZÀ-Ÿ][a-záéíóúâêôãõüç]/i.test(trimmed);
        const hasName = hasNameLabel || hasNameAfterMarker;
        const hasDateOrTime = /Data:/i.test(trimmed) || /Horário:/i.test(trimmed) || /\d{1,2}:\d{2}/.test(trimmed) || /\d{1,2}:\s*$/.test(trimmed) || /às\s+\d{1,2}/i.test(trimmed);
        return !!trimmed && hasName && hasDateOrTime;
      };

      // Extrair data do header (texto completo) para propagar aos blocos sem data
      let headerDate = '';
      const headerDateMatch = messageToExtractFrom.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (headerDateMatch) {
        const hDateParts = headerDateMatch[1].split('/');
        if (hDateParts.length === 3) {
          headerDate = `${hDateParts[0].padStart(2, '0')}/${hDateParts[1].padStart(2, '0')}/${hDateParts[2]}`;
        }
      }

      // Extrair profissional do texto geral (ex: "todos com o profissional Estevão")
      let headerProfessional = '';
      const headerProfMatch = messageToExtractFrom.match(/todos\s+com\s+(?:o\s+)?(?:profissional\s+)?([A-ZÀ-Ÿ][a-záéíóúâêôãõüç]+(?:\s+[A-ZÀ-Ÿa-záéíóúâêôãõüç]+)*)/i) ||
                              messageToExtractFrom.match(/com\s+(?:o\s+)?profissional\s+([A-ZÀ-Ÿ][a-záéíóúâêôãõüç]+(?:\s+[A-ZÀ-Ÿa-záéíóúâêôãõüç]+)*)/i);
      if (headerProfMatch) {
        headerProfessional = headerProfMatch[1].trim();
      }

      console.log('📅 Data do header para propagação:', headerDate || 'não encontrada');
      console.log('👤 Profissional do header:', headerProfessional || 'não encontrado');

      if (hasMultipleByMarkers) {
        // Dividir por marcadores numéricos
        const splitPattern = /(?=1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/;
        appointmentBlocks = messageToExtractFrom.split(splitPattern).filter(isValidAppointmentBlock);
        console.log('   - Método de divisão: marcadores numéricos');
      } else {
        // Dividir por ocorrências de "👤 Nome:" (cada bloco começa com um nome)
        const splitPattern = /(?=👤\s*Nome:)/gi;
        appointmentBlocks = messageToExtractFrom.split(splitPattern).filter(isValidAppointmentBlock);
        console.log('   - Método de divisão: campos Nome:');
      }

      console.log(`📋 Total de ${appointmentBlocks.length} blocos de agendamento VÁLIDOS encontrados`);

      const createdAppointmentIds: number[] = [];

      for (let i = 0; i < appointmentBlocks.length; i++) {
        const block = appointmentBlocks[i];
        console.log(`\n========== PROCESSANDO AGENDAMENTO ${i + 1} ==========`);
        console.log('Bloco (primeiros 300 chars):', block.substring(0, 300));

        const blockData = extractDataFromAppointmentBlock(block);

        // Propagar data do header se o bloco não tem data própria
        if (!blockData.date && headerDate) {
          blockData.date = headerDate;
          console.log(`📅 Data propagada do header: ${headerDate}`);
        }

        // Propagar profissional do header se o bloco não tem profissional
        if (!blockData.professional && headerProfessional) {
          blockData.professional = headerProfessional;
          console.log(`👤 Profissional propagado do header: ${headerProfessional}`);
        }

        if (blockData.clientName && blockData.date && blockData.time) {
          console.log(`✅ Dados extraídos - date: ${blockData.date}, time: ${blockData.time}, client: ${blockData.clientName}, prof: ${blockData.professional || 'N/A'}`);

          const singleAppointmentId = await createSingleAppointmentFromExtractedData(
            companyId,
            blockData,
            phoneNumber,
            initialStatus,
            contactName
          );

          if (singleAppointmentId) {
            createdAppointmentIds.push(singleAppointmentId);
            console.log(`✅ Agendamento ${i + 1} criado com ID: ${singleAppointmentId}`);

            // 🔔 Enviar webhook N8N e broadcast para CADA agendamento múltiplo
            try {
              const multiCompany = await storage.getCompanyById(companyId);
              const multiServices = await storage.getServicesByCompany(companyId);
              const multiProfessionals = await storage.getProfessionalsByCompany(companyId);

              const multiService = multiServices.find(s => s.name.toLowerCase() === (blockData.service || '').toLowerCase()) ||
                                   multiServices.find(s => s.name.toLowerCase().includes((blockData.service || '').toLowerCase()) || (blockData.service || '').toLowerCase().includes(s.name.toLowerCase()));
              const multiProfessional = multiProfessionals.find(p => p.name.toLowerCase() === (blockData.professional || '').toLowerCase()) ||
                                        multiProfessionals.find(p => p.name.toLowerCase().includes((blockData.professional || '').toLowerCase()) || (blockData.professional || '').toLowerCase().includes(p.name.toLowerCase()));

              // Converter data DD/MM/YYYY para YYYY-MM-DD
              let multiDateStr = '';
              if (blockData.date) {
                const dp = blockData.date.split('/');
                if (dp.length === 3) multiDateStr = `${dp[2]}-${dp[1]}-${dp[0]}`;
              }

              // Broadcast para dashboard em tempo real
              try {
                broadcastEvent({
                  type: 'appointment_created',
                  data: {
                    appointment: {
                      id: singleAppointmentId,
                      clientName: blockData.clientName || contactName || 'Cliente',
                      clientPhone: phoneNumber,
                      appointmentDate: multiDateStr,
                      appointmentTime: blockData.time,
                      professionalId: multiProfessional?.id,
                      serviceId: multiService?.id,
                      status: 'Pendente'
                    }
                  }
                }, companyId);
              } catch (broadcastErr) {
                console.error('⚠️ [Multi] Broadcast error:', broadcastErr);
              }

              // Webhook N8N
              if (multiCompany?.n8nWebhookEnabled && multiCompany?.n8nWebhookUrl) {
                const multiWebhookPayload = {
                  event: 'appointment.created',
                  timestamp: new Date().toISOString(),
                  createdBy: 'whatsapp_ai',
                  conversationId: conversationId,
                  appointment: {
                    id: singleAppointmentId,
                    clientName: blockData.clientName || contactName || 'Cliente',
                    clientPhone: phoneNumber,
                    clientEmail: null,
                    appointmentDate: multiDateStr,
                    appointmentTime: blockData.time,
                    status: initialStatus === 'payment_pending' ? 'Aguardando Pagamento' : 'Pendente',
                    duration: multiService?.duration || 30,
                    totalPrice: multiService?.price || 0,
                    notes: `Agendamento via WhatsApp (múltiplos)`
                  },
                  service: {
                    id: multiService?.id || null,
                    name: multiService?.name || blockData.service || 'Serviço',
                    price: multiService?.price || 0
                  },
                  professional: {
                    id: multiProfessional?.id || null,
                    name: multiProfessional?.name || blockData.professional || 'Profissional'
                  },
                  company: {
                    id: companyId,
                    name: multiCompany.fantasyName
                  }
                };

                const multiWebhookResponse = await fetch(multiCompany.n8nWebhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(multiWebhookPayload)
                });

                if (!multiWebhookResponse.ok) {
                  console.error(`⚠️ [Multi] N8N webhook error for appointment ${i + 1}:`, multiWebhookResponse.status);
                } else {
                  console.log(`✅ [Multi] N8N webhook sent for appointment ${i + 1} (ID: ${singleAppointmentId})`);
                }
              }
            } catch (multiWebhookError) {
              console.error(`⚠️ [Multi] Error sending webhook/broadcast for appointment ${i + 1}:`, multiWebhookError);
            }
          } else {
            console.log(`❌ Falha ao criar agendamento ${i + 1}`);
          }
        } else {
          console.log(`⚠️ Dados incompletos no bloco ${i + 1}:`, blockData);
          console.log(`   - clientName: ${blockData.clientName || 'FALTANDO'}`);
          console.log(`   - date: ${blockData.date || 'FALTANDO'}`);
          console.log(`   - time: ${blockData.time || 'FALTANDO'}`);
        }
      }

      if (createdAppointmentIds.length > 0) {
        console.log(`\n✅ TOTAL: ${createdAppointmentIds.length} agendamentos criados: [${createdAppointmentIds.join(', ')}]`);
        return createdAppointmentIds[0]; // Retorna o primeiro ID para compatibilidade
      } else {
        console.log('❌ Nenhum agendamento foi criado dos múltiplos blocos');
        return null;
      }
    }
    // ========================================

    // Extract data directly from the summary message
    const extractDataFromSummary = (summaryText: string) => {
      const data: any = {};

      // Extract service FIRST (needed for cleaning name later)
      const servicePatterns = [
        /💼\s*Serviço:\s*(.+?)(?:\n|$)/i,
        /Serviço:\s*(.+?)(?:\n|$)/i,
      ];
      for (const pattern of servicePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.service = match[1].trim();
          break;
        }
      }

      // Extract name
      const namePatterns = [
        /👤\s*Nome:\s*(.+?)(?:\n|$)/i,
        /Nome:\s*(.+?)(?:\n|$)/i,
      ];
      for (const pattern of namePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.clientName = match[1].trim();
          break;
        }
      }

      // Clean client name - remove service name if accidentally included
      // Example: "Gabriel Cabelo" when service is "Cabelo" should become "Gabriel"
      if (data.clientName && data.service) {
        const serviceWords = data.service.toLowerCase().split(/\s+/);
        const nameWords = data.clientName.split(/\s+/);

        // Filter out words that match service name (case insensitive)
        const cleanedNameWords = nameWords.filter((word: string) =>
          !serviceWords.some((serviceWord: string) =>
            word.toLowerCase() === serviceWord.toLowerCase()
          )
        );

        if (cleanedNameWords.length > 0 && cleanedNameWords.length < nameWords.length) {
          const originalName = data.clientName;
          data.clientName = cleanedNameWords.join(' ');
          console.log(`🧹 Nome limpo: "${originalName}" -> "${data.clientName}" (removido serviço "${data.service}")`);
        }
      }

      // Extract professional - múltiplos formatos possíveis
      const profPatterns = [
        /🏢\s*Profissional:\s*(.+?)(?:\n|$)/i,
        /Profissional:\s*(.+?)(?:\n|$)/i,
        /👨‍💼\s*Profissional:\s*(.+?)(?:\n|$)/i,
        /👨‍💼\s*:\s*(.+?)(?:\n|$)/i,
        /👨‍💼\s+(.+?)(?:\n|$)/i,
        /🏢\s+(.+?)(?:\n|$)/i,
        /com\s+(?:a\s+|o\s+)?([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)(?:\.|$|\n)/i, // "com Mariana", "com o Jack"
      ];
      for (const pattern of profPatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.professional = match[1].trim();
          console.log(`🔍 Profissional extraído do resumo: "${data.professional}" usando pattern: ${pattern}`);
          break;
        }
      }

      // Extract date - multiple formats supported
      const datePatterns = [
        // With emoji: 📅 Data: quinta-feira, 18/12/2025
        /📅\s*Data:\s*(?:[^,\d]+,\s*)?(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // Without emoji: Data: quinta-feira, 18/12/2025
        /Data:\s*(?:[^,\d]+,\s*)?(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // With emoji: 📅 Data: 18/12/2025
        /📅\s*Data:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // Without emoji: Data: 18/12/2025
        /Data:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // In text: dia 18/12/2025
        /dia\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // In text: para o dia 18/12/2025
        /para\s+o?\s*dia\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // Date anywhere in text: 18/12/2025
        /(\d{1,2}\/\d{1,2}\/\d{4})/,
      ];
      for (const pattern of datePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          // Normalize to DD/MM/YYYY format
          const dateParts = match[1].trim().split('/');
          if (dateParts.length === 3) {
            const day = dateParts[0].padStart(2, '0');
            const month = dateParts[1].padStart(2, '0');
            const year = dateParts[2];
            data.date = `${day}/${month}/${year}`;
            console.log(`📅 Data extraída: ${data.date} (pattern: ${pattern})`);
          }
          break;
        }
      }

      // Extract time
      const timePatterns = [
        /🕐\s*Horário:\s*(\d{1,2}:\d{2})/i,
        /Horário:\s*(\d{1,2}:\d{2})/i,
      ];
      for (const pattern of timePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.time = match[1].trim();
          break;
        }
      }

      // Fallback para horários TRUNCADOS: "12:" ou "12" (IA cortou os minutos)
      if (!data.time) {
        const truncatedMatch = summaryText.match(/🕐\s*Horário:\s*(\d{1,2}):\s*(?:\n|,|$)/im) ||
                               summaryText.match(/Horário:\s*(\d{1,2}):\s*(?:\n|,|$)/im) ||
                               summaryText.match(/🕐\s*Horário:\s*(\d{1,2})\s*(?:\n|,|$)/im) ||
                               summaryText.match(/Horário:\s*(\d{1,2})\s*(?:\n|,|$)/im);
        if (truncatedMatch) {
          const hour = truncatedMatch[1].padStart(2, '0');
          data.time = `${hour}:00`;
          console.log(`⚠️ Horário truncado detectado → normalizado para ${data.time}`);
        }
      }

      // Extract phone
      const phonePatterns = [
        /📱\s*Telefone:\s*(.+?)(?:\n|$)/i,
        /Telefone:\s*(.+?)(?:\n|$)/i,
      ];
      for (const pattern of phonePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.phone = match[1].trim();
          break;
        }
      }

      return data;
    };

    // First try to extract from the correct message (summary if confirmation, or aiResponse if not)
    let extractedFromSummary = extractDataFromSummary(messageToExtractFrom);

    // If date is missing, search in all assistant messages (the date might be in an earlier message)
    if (!extractedFromSummary.date) {
      console.log('📅 Data não encontrada na resposta atual, buscando em mensagens anteriores...');
      const assistantMessages = allMessages.filter(m => m.role === 'assistant').map(m => m.content);
      for (const msg of assistantMessages.reverse()) { // Start from most recent
        const tempData = extractDataFromSummary(msg);
        if (tempData.date) {
          extractedFromSummary.date = tempData.date;
          console.log(`📅 Data encontrada em mensagem anterior: ${tempData.date}`);
          break;
        }
      }
    }

    // Also try to find date from user messages (user might have typed "dia 18")
    if (!extractedFromSummary.date) {
      console.log('📅 Buscando data nas mensagens do usuário...');
      const userMessagesForDate = allMessages.filter(m => m.role === 'user').map(m => m.content);
      const allUserTextForDate = userMessagesForDate.join(' ');

      // Try to find date in user messages
      const userDatePatterns = [
        /dia\s+(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{4}))?/i,
        /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/,
      ];

      for (const pattern of userDatePatterns) {
        const match = allUserTextForDate.match(pattern);
        if (match) {
          const today = getBrazilDate(); // Use Brazil timezone
          const day = match[1].padStart(2, '0');
          const month = match[2] ? match[2].padStart(2, '0') : String(today.getMonth() + 1).padStart(2, '0');
          const year = match[3] || String(today.getFullYear());
          extractedFromSummary.date = `${day}/${month}/${year}`;
          console.log(`📅 Data encontrada na mensagem do usuário: ${extractedFromSummary.date}`);
          break;
        }
      }
    }

    console.log('📋 DADOS EXTRAÍDOS DO RESUMO - fields:', Object.keys(extractedFromSummary).join(', '));

    // CRÍTICO: Pegar apenas as últimas 12 mensagens do USUÁRIO para evitar contaminar com dados muito antigos
    // IMPORTANTE: allMessages vem DESC do banco (mais recente primeiro), então slice(0,12) pega as 12 mais recentes
    const recentMessages = allMessages
      .filter(m => m.role === 'user')  // Apenas mensagens do usuário
      .slice(0, 12);  // Pega as primeiras 12 do array (que são as 12 mais recentes)
    const userMessages = recentMessages.map(m => m.content);
    const allConversationText = userMessages.join(' ');

    console.log(`📊 Total de mensagens: ${allMessages.length}, usando últimas ${recentMessages.length} do USUÁRIO (máx 12)`);

    // 🎯 FUNÇÃO AUXILIAR: Procura item nas mensagens (MAIS RECENTE → MAIS ANTIGA)
    // Garante 100% de acurácia pegando sempre o dado do agendamento atual
    const findInRecentMessages = (items: any[], getName: (item: any) => string): any | null => {
      // Helper to normalize strings for comparison
      const normalizeForSearch = (str: string) => {
        return str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Processa mensagens da MAIS RECENTE (índice 0) para a MAIS ANTIGA
      for (const message of userMessages) {
        const normalizedMessage = normalizeForSearch(message);
        for (const item of items) {
          const normalizedItemName = normalizeForSearch(getName(item));
          if (normalizedMessage.includes(normalizedItemName)) {
            return item; // Retorna PRIMEIRA ocorrência (que é a mais recente)
          }
        }
      }
      return null;
    };

    // Check if user has explicitly confirmed with SIM/OK - but be more lenient
    // since we're already in the confirmation flow
    const hasExplicitConfirmation = /\b(sim|ok|confirmo|confirma|s|yes)\b/i.test(allConversationText);
    console.log('🔍 Verificando confirmação do usuário:', {
      allConversationText: allConversationText.substring(0, 200) + '...',
      hasExplicitConfirmation: hasExplicitConfirmation
    });

    // Comment out the strict check for now since we know user confirmed
    // if (!hasExplicitConfirmation) {
    //   console.log('❌ User has not explicitly confirmed with SIM/OK. Not creating appointment.');
    //   console.log('💬 Texto completo da conversa:', allConversationText);
    //   return;
    // }
    console.log('✅ Prosseguindo com criação do agendamento (confirmação implícita)');
    
    console.log('📚 User conversation text:', allConversationText);
    
    // Enhanced patterns for better extraction from AI response and conversation
    const patterns = {
      clientName: /\b([A-Z][a-zA-ZÀ-ÿ]+\s+[A-Z][a-zA-ZÀ-ÿ]+)\b/g, // Matches "João Silva" pattern
      time: /(?:às|as)\s+(\d{1,2}:?\d{0,2})/i,
      day: /(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i
    };
    
    // Extract client name - prioritize summary extraction
    let extractedName: string | null = extractedFromSummary.clientName || null;

    if (!extractedName) {
      // Fallback: try to extract name from AI response
      // Priority patterns - AI confirmation of name
      let aiNameMatch = aiResponse.match(/(?:Ok|Ótimo|Perfeito|Excelente),\s+([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+(?:\s+[A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)*)(?:\.|!|,)/);

      if (!aiNameMatch) {
        // Try "Nome:" pattern
        aiNameMatch = aiResponse.match(/(?:👤\s*)?Nome:\s*([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+(?:\s+[A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)*)/);
      }

      if (!aiNameMatch) {
        // Try greeting patterns
        aiNameMatch = aiResponse.match(/(?:Ótimo|Perfeito|Excelente),\s+([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)/);
      }

      if (aiNameMatch) {
        extractedName = aiNameMatch[1].trim();
        console.log(`📝 Nome encontrado na resposta da IA: "${extractedName}"`);
      }
    } else {
      console.log(`📝 Usando nome do resumo: "${extractedName}"`);
    }
    
    // If no name in AI response, try to extract from user messages
    if (!extractedName) {
      // Lista de palavras que NÃO devem ser consideradas nomes
      // IMPORTANTE: Não incluir serviços específicos aqui, pois cada empresa tem seus próprios serviços
      // Mantemos apenas uma versão (com acento) pois a normalização remove acentos automaticamente
      const invalidNames = [
        // Confirmações e saudações
        'sim', 'ok', 'não', 'claro', 'perfeito', 'ótimo',
        'excelente', 'certo', 'beleza', 'legal', 'show', 'confirmo', 'confirmar',
        'obrigado', 'obrigada', 'valeu', 'tchau', 'oi', 'olá', 'bom', 'dia', 'tarde', 'noite',
        // Palavras do sistema e comuns
        'whatsapp', 'profissional', 'serviço', 'agendar', 'agendamento',
        'atendimento', 'com', 'para', 'por', 'mais', 'menos', 'tem', 'qual', 'quais',
        'pode', 'ser', 'esta', 'está', 'esse', 'essa', 'aqui', 'ali', 'que', 'quero',
        'fazer', 'gostaria', 'preciso', 'queria', 'quer', 'vou', 'vai',
        // Dias da semana
        'hoje', 'amanhã', 'ontem',
        'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'
      ];

      // Normaliza palavras inválidas uma vez (para performance)
      const normalizeForComparison = (str: string) => {
        return str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .trim();
      };

      const normalizedInvalidNames = invalidNames.map(normalizeForComparison);

      // Analyze user messages to find name
      for (const message of userMessages) {
        // Priority 1: Explicit name context - captura nomes completos (até 5 palavras)
        const explicitPatterns = [
          /(?:nome|chamo|cliente)\s*:?\s*([A-ZÀÁÉÍÓÚ][a-záéíóúâêôãç]+(?:\s+(?:dos|das|de|do|da|e)?\s*[A-ZÀÁÉÍÓÚa-záéíóúâêôãç]+){0,4})/i,
          /(?:me chamo|sou o|sou a|nome é|eu sou|meu nome)\s+([A-ZÀÁÉÍÓÚ][a-záéíóúâêôãç]+(?:\s+(?:dos|das|de|do|da|e)?\s*[A-ZÀÁÉÍÓÚa-záéíóúâêôãç]+){0,4})/i,
        ];

        for (const pattern of explicitPatterns) {
          const match = message.match(pattern);
          if (match && match[1]) {
            const name = match[1].trim();
            const words = name.split(/\s+/);

            // Verifica se não é apenas palavras inválidas (com normalização)
            const hasValidWord = words.some(word => {
              const normalizedWord = normalizeForComparison(word);
              return !normalizedInvalidNames.includes(normalizedWord) && word.length >= 3;
            });

            if (hasValidWord) {
              extractedName = name;
              console.log(`📝 ✅ Nome encontrado em contexto explícito: "${extractedName}"`);
              break;
            }
          }
        }

        if (extractedName) break;

        // Priority 2: Nome completo digitado sozinho (captura até 60 caracteres e até 5 palavras)
        const trimmedMsg = message.trim();
        if (trimmedMsg.length >= 3 && trimmedMsg.length <= 60) {
          // Captura nomes completos incluindo preposições
          const fullNameMatch = trimmedMsg.match(/^([A-ZÀÁÉÍÓÚ][a-záéíóúâêôãç]+(?:\s+(?:dos|das|de|do|da|e)?\s*[A-ZÀÁÉÍÓÚa-záéíóúâêôãç]+){0,4})$/);
          if (fullNameMatch) {
            const name = fullNameMatch[1].trim();
            const words = name.split(/\s+/);

            // Verifica se não é apenas palavras inválidas (com normalização)
            const hasValidWord = words.some(word => {
              const normalizedWord = normalizeForComparison(word);
              return !normalizedInvalidNames.includes(normalizedWord) && word.length >= 3;
            });

            if (hasValidWord) {
              extractedName = name;
              console.log(`📝 ✅ Nome completo digitado: "${extractedName}"`);
              break;
            }
          }
        }
      }

      if (!extractedName) {
        console.log(`📝 ❌ Nenhum nome válido encontrado na conversa`);
      }
    }

    // Fallback: Use pushName from WhatsApp if no name was extracted from conversation
    if (!extractedName && contactName && contactName.trim().length > 0) {
      extractedName = contactName.trim();
      console.log(`📝 ✅ Usando pushName do WhatsApp como fallback: "${extractedName}"`);
    }
    
    // Enhanced time extraction - prioritize summary extraction
    let extractedTime: string | null = extractedFromSummary.time || null;

    if (!extractedTime) {
      // Try multiple time patterns in order of specificity
      const timePatterns = [
        // AI response patterns
        /Horário:\s*(\d{1,2}:\d{2})/i,           // "Horário: 09:00"
        /(?:às|as)\s+(\d{1,2}:\d{2})/i,          // "às 09:00"
        /(\d{1,2}:\d{2})/g,                      // Any "09:00" format
        // Conversation patterns
        /(?:às|as)\s+(\d{1,2})/i,                // "às 9"
        /(\d{1,2})h/i,                           // "9h"
        /(\d{1,2})(?=\s|$)/                      // Single digit followed by space or end
      ];

      // Check AI response first (more reliable), then conversation
      const searchTexts = [aiResponse, allConversationText];
    
    for (const text of searchTexts) {
      for (const pattern of timePatterns) {
        const matches = text.match(pattern);
        if (matches) {
          let timeCandidate = matches[1];
          
          // Validate time format
          if (timeCandidate && timeCandidate.includes(':')) {
            // Already in HH:MM format
            const [hour, minute] = timeCandidate.split(':');
            const h = parseInt(hour);
            const m = parseInt(minute);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
              extractedTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
              console.log(`🕐 Extracted time from ${text === aiResponse ? 'AI response' : 'conversation'}: "${extractedTime}"`);
              break;
            }
          } else if (timeCandidate) {
            // Hour only, add :00
            const hour = parseInt(timeCandidate);
            if (hour >= 0 && hour <= 23) {
              extractedTime = `${hour.toString().padStart(2, '0')}:00`;
              console.log(`🕐 Extracted hour from ${text === aiResponse ? 'AI response' : 'conversation'}: "${extractedTime}"`);
              break;
            }
          }
        }
      }
      if (extractedTime) break;
    }
    } else {
      console.log(`🕐 Usando horário do resumo: "${extractedTime}"`);
    }
    
    // Get recent user messages for better context
    const conversationMessages = await storage.getMessagesByConversation(conversationId);
    const recentUserMessages = conversationMessages
      .filter(m => m.role === 'user')
      .slice(0, 8) // First 8 user messages (most recent, query is DESC)
      .map(m => m.content)
      .join(' ');
    
    console.log(`🔍 Analisando mensagens recentes: ${recentUserMessages}`);
    
    // Priority extraction - use summary data first, then patterns
    let extractedDay = extractedFromSummary.date ? null : aiResponse.match(patterns.day)?.[1]; // We'll handle date conversion separately
    let extractedProfessional = extractedFromSummary.professional || null;
    let extractedService = extractedFromSummary.service || null;

    // Check for "hoje" and "amanhã" in recent messages with higher priority
    const todayPattern = /\bhoje\b/i;
    const tomorrowPattern = /\bamanhã\b/i;

    if (todayPattern.test(recentUserMessages)) {
      extractedDay = "hoje";
      console.log(`📅 Detectado "hoje" nas mensagens recentes`);
    } else if (tomorrowPattern.test(recentUserMessages)) {
      extractedDay = "amanhã";
      console.log(`📅 Detectado "amanhã" nas mensagens recentes`);
    } else if (!extractedDay) {
      // Only fallback to all conversation if nothing found in recent messages
      extractedDay = recentUserMessages.match(patterns.day)?.[1] || allConversationText.match(patterns.day)?.[1];
    }
    
    // If no name found, check existing clients by phone
    if (!extractedName) {
      const clients = await storage.getClientsByCompany(companyId);
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      const existingClient = clients.find(c => 
        c.phone && c.phone.replace(/\D/g, '') === normalizedPhone
      );
      extractedName = existingClient?.name || null;
    }
    
    console.log('📋 Extracted from AI response and conversation:', {
      clientName: extractedName,
      time: extractedTime,
      day: extractedDay,
      professional: extractedProfessional,
      service: extractedService
    });

    // Validate required data before proceeding
    if (!extractedTime || extractedTime === 'undefined:00') {
      console.log('❌ Invalid time extracted, cannot create appointment');
      return;
    }
    
    // Get professionals and services to match extracted data
    const professionals = await storage.getProfessionalsByCompany(companyId);
    const services = await storage.getServicesByCompany(companyId);

    console.log('🔍 Buscando profissional e serviço...');
    console.log('📋 Professionals disponíveis:', professionals.map(p => p.name).join(', '));
    console.log('📋 Services disponíveis:', services.map(s => s.name).join(', '));
    console.log('🔍 Buscando por professional:', extractedProfessional);
    console.log('🔍 Buscando por service:', extractedService);

    // Find matching professional - PRIORIDADE: buscar primeiro na resposta da IA
    let professional = null;

    console.log('🔍 Buscando profissional - PRIORIDADE 1: Resposta da IA');
    // Helper function to normalize strings for comparison
    const normalizeString = (str: string) => {
      return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();
    };

    // PRIORIDADE 1: Buscar na resposta da IA (mensagem de confirmação)
    for (const prof of professionals) {
      const normalizedProfName = normalizeString(prof.name);
      const normalizedAiResponse = normalizeString(aiResponse);

      if (normalizedAiResponse.includes(normalizedProfName)) {
        professional = prof;
        console.log(`✅ Profissional encontrado na resposta da IA: ${prof.name}`);
        break;
      }
    }

    // PRIORIDADE 2: Se não encontrou na IA, tentar com dados do resumo
    if (!professional && extractedProfessional) {
      console.log('🔍 Buscando profissional - PRIORIDADE 2: Dados extraídos do resumo');
      const normalizedSearch = normalizeString(extractedProfessional);

      professional = professionals.find(p => {
        const normalizedProfName = normalizeString(p.name);
        console.log(`  Comparando "${normalizedSearch}" com "${normalizedProfName}"`);
        return normalizedProfName === normalizedSearch;
      });

      if (!professional) {
        // Try partial match with normalization
        professional = professionals.find(p => {
          const normalizedProfName = normalizeString(p.name);
          return normalizedProfName.includes(normalizedSearch) ||
                 normalizedSearch.includes(normalizedProfName);
        });
      }

      if (professional) {
        console.log(`✅ Profissional encontrado com dados do resumo: ${professional.name}`);
      } else {
        console.log(`⚠️ Profissional "${extractedProfessional}" extraído do resumo mas não encontrado no banco de dados`);
        console.log(`📋 Profissionais disponíveis: ${professionals.map(p => p.name).join(', ')}`);
      }
    }

    // PRIORIDADE 3: Buscar nas mensagens RECENTES do usuário (últimas 8 mensagens)
    if (!professional) {
      console.log('🔍 Buscando profissional - PRIORIDADE 3: Mensagens recentes do usuário');
      const normalizedRecent = normalizeString(recentUserMessages);

      for (const prof of professionals) {
        const normalizedProfName = normalizeString(prof.name);
        if (normalizedRecent.includes(normalizedProfName)) {
          professional = prof;
          console.log(`✅ Profissional encontrado nas mensagens recentes: ${prof.name}`);
          break;
        }
      }
    }

    // Find matching service - PRIORIDADE: buscar primeiro na resposta da IA
    let service = null;

    console.log('🔍 Buscando serviço - PRIORIDADE 1: Resposta da IA');
    // PRIORIDADE 1: Buscar na resposta da IA (mensagem de confirmação)
    for (const serv of services) {
      const normalizedServiceName = normalizeString(serv.name);
      const normalizedAiResponse = normalizeString(aiResponse);

      if (normalizedAiResponse.includes(normalizedServiceName)) {
        service = serv;
        console.log(`✅ Serviço encontrado na resposta da IA: ${serv.name}`);
        break;
      }
    }

    // PRIORIDADE 2: Se não encontrou na IA, tentar com dados do resumo
    if (!service && extractedService) {
      console.log('🔍 Buscando serviço - PRIORIDADE 2: Dados extraídos do resumo');
      const normalizedSearch = normalizeString(extractedService);

      service = services.find(s => {
        const normalizedServiceName = normalizeString(s.name);
        console.log(`  Comparando "${normalizedSearch}" com "${normalizedServiceName}"`);
        return normalizedServiceName === normalizedSearch;
      });

      if (!service) {
        // Try partial match with normalization
        service = services.find(s => {
          const normalizedServiceName = normalizeString(s.name);
          return normalizedServiceName.includes(normalizedSearch) ||
                 normalizedSearch.includes(normalizedServiceName);
        });
      }

      if (service) {
        console.log(`✅ Serviço encontrado com dados do resumo: ${service.name}`);
      } else {
        console.log(`⚠️ Serviço "${extractedService}" extraído do resumo mas não encontrado no banco de dados`);
        console.log(`📋 Serviços disponíveis: ${services.map(s => s.name).join(', ')}`);
      }
    }

    // PRIORIDADE 3: Buscar nas mensagens RECENTES do usuário (últimas 8 mensagens)
    if (!service) {
      console.log('🔍 Buscando serviço - PRIORIDADE 3: Mensagens recentes do usuário');
      const normalizedRecent = normalizeString(recentUserMessages);

      for (const serv of services) {
        const normalizedServiceName = normalizeString(serv.name);
        if (normalizedRecent.includes(normalizedServiceName)) {
          service = serv;
          console.log(`✅ Serviço encontrado nas mensagens recentes: ${serv.name}`);
          break;
        }
      }
    }

    console.log('==================================================');
    console.log('🔍 VALIDAÇÃO CRÍTICA - Verificando dados extraídos');
    console.log('==================================================');
    console.log('Professional:', professional ? `✅ ${professional.name} (ID: ${professional.id})` : '❌ MISSING');
    console.log('Service:', service ? `✅ ${service.name} (ID: ${service.id})` : '❌ MISSING');
    console.log('Time:', extractedTime ? `✅ ${extractedTime}` : '❌ MISSING');
    console.log('Name:', extractedName ? `✅ ${extractedName}` : '❌ MISSING');
    console.log('Day:', extractedDay || '❌ MISSING');
    console.log('Summary Data fields:', Object.keys(extractedFromSummary).join(', '));
    console.log('==================================================');

    if (!professional || !service || !extractedTime) {
      console.log('❌❌❌ ERRO CRÍTICO: Dados insuficientes para criar agendamento');
      console.log('Missing:', {
        professional: !professional ? '❌ MISSING' : `✅ ID: ${professional.id}`,
        service: !service ? '❌ MISSING' : `✅ ID: ${service.id}`,
        time: !extractedTime ? '❌ MISSING' : `✅ ${extractedTime}`
      });
      console.log('📋 Available professionals count:', professionals.length);
      console.log('📋 Available services:', services.map(s => `${s.name} (ID: ${s.id})`).join(', '));
      console.log('❌ ABORTANDO criação de agendamento');

      // Generic error message
      const errorMessage = `Erro ❌

Houve uma falha inesperada no sistema e não foi possível concluir seu agendamento.
Pedimos desculpas pelo transtorno. Aguarde alguns instantes e tente novamente.`;

      console.log('📤 Enviando mensagem de erro ao usuário:', errorMessage);

      // Send error message to user via WhatsApp
      try {
        // Get company WhatsApp instance
        const instances = await storage.getWhatsappInstancesByCompany(companyId);
        const activeInstance = instances.find(i => i.status === 'connected');

        if (activeInstance) {
          // Get global settings for UAZAPI
          const globalSettings = await storage.getGlobalSettings();

          if (globalSettings?.uazapiUrl && globalSettings?.uazapiAdminToken) {
            let formattedPhone = phoneNumber.replace(/\D/g, '');
            if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10) {
              formattedPhone = '55' + formattedPhone;
            }

            await uazapiSendTyping(activeInstance.instanceName, formattedPhone, 2000);
            await new Promise(resolve => setTimeout(resolve, 2000));

            const response = await uazapiSendText(activeInstance.instanceName, formattedPhone, errorMessage);

            if (response.ok) {
              console.log('✅ Mensagem de erro enviada com sucesso');
              await storage.createMessage({
                conversationId: conversationId,
                content: errorMessage,
                role: 'assistant',
                messageType: 'text',
                delivered: true,
                timestamp: new Date(),
              });
            } else {
              console.error('❌ Falha ao enviar mensagem de erro');
            }
          } else {
            console.error('❌ Configurações globais da UAZAPI não encontradas');
          }
        } else {
          console.error('❌ Nenhuma instância do WhatsApp conectada encontrada para esta empresa');
        }
      } catch (error) {
        console.error('❌ Erro ao enviar mensagem de erro:', error);
      }

      return;
    }
    
    // Calculate appointment date using the EXACT same logic from system prompt
    const today = getBrazilDate(); // Use Brazil timezone
    const dayMap = { 'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6 };
    let appointmentDate = getBrazilDate();

    // If we have a date from summary (DD/MM/YYYY format), use it
    if (extractedFromSummary.date) {
      const [day, month, year] = extractedFromSummary.date.split('/').map(Number);
      // Create date at noon (12:00) to avoid timezone conversion issues
      // When converting to UTC, 12:00 Brazil (UTC-3) = 15:00 UTC (same day)
      appointmentDate = new Date(year, month - 1, day, 12, 0, 0);
      console.log(`📅 Usando data do resumo: ${appointmentDate.toLocaleDateString('pt-BR')}`);
    }
    // Handle special cases first
    else if (extractedDay?.toLowerCase() === "hoje") {
      appointmentDate = new Date(today);
      appointmentDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues
      console.log(`📅 Agendamento para HOJE: ${appointmentDate.toLocaleDateString('pt-BR')}`);
    } else if (extractedDay?.toLowerCase() === "amanhã") {
      appointmentDate = new Date(today);
      appointmentDate.setDate(today.getDate() + 1);
      appointmentDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues
      console.log(`📅 Agendamento para AMANHÃ: ${appointmentDate.toLocaleDateString('pt-BR')}`);
    } else {
      // Handle regular day names
      const targetDay = dayMap[extractedDay?.toLowerCase() as keyof typeof dayMap];
      
      if (targetDay !== undefined) {
        const currentDay = today.getDay();
        let daysUntilTarget = targetDay - currentDay;
        
        // If it's the same day but later time, keep today
        // Otherwise, get next week's occurrence if day has passed
        if (daysUntilTarget < 0) {
          daysUntilTarget += 7;
        } else if (daysUntilTarget === 0) {
          // Same day - check if it's still possible today or next week
          // For now, assume same day means today
          daysUntilTarget = 0;
        }
        
        // Set the correct date
        appointmentDate.setDate(today.getDate() + daysUntilTarget);
        appointmentDate.setHours(0, 0, 0, 0); // Reset time to start of day
        
        console.log(`📅 Cálculo de data: Hoje é ${today.toLocaleDateString('pt-BR')} (${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][currentDay]})`);
        console.log(`📅 Dia alvo: ${extractedDay} (${targetDay}), Dias até o alvo: ${daysUntilTarget}`);
        console.log(`📅 Data calculada do agendamento: ${appointmentDate.toLocaleDateString('pt-BR')}`);
      }
    }
    
    // Format time
    const formattedTime = extractedTime.includes(':') ? extractedTime : `${extractedTime}:00`;
    
    // Find or create client
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const existingClients = await storage.getClientsByCompany(companyId);
    
    console.log(`🔍 Looking for existing client with phone: ${normalizedPhone}`);
    console.log(`📋 Existing clients:`, existingClients.map(c => ({ name: c.name, phone: c.phone })));
    
    // Try to find existing client by phone or name
    let client = existingClients.find(c => 
      (c.phone && c.phone.replace(/\D/g, '') === normalizedPhone) ||
      (c.name && extractedName && c.name.toLowerCase() === extractedName.toLowerCase())
    );
    
    if (!client) {
      // Use proper Brazilian phone formatting from phone-utils
      console.log(`📞 Processing phone: ${phoneNumber}`);
      const normalizedPhone = normalizePhone(phoneNumber);
      console.log(`📞 Normalized: ${normalizedPhone}`);
      const formattedPhone = formatBrazilianPhone(normalizedPhone);
      console.log(`📞 Formatted: ${formattedPhone}`);
      
      if (!formattedPhone) {
        console.log(`❌ Invalid phone number format: ${phoneNumber}`);
        throw new Error('Formato de telefone inválido');
      }
      
      // Usar contactName (pushName) como fallback se não tiver nome extraído
      const clientName = extractedName || contactName || `Cliente ${formattedPhone}`;
      console.log(`🆕 Creating new client: ${clientName} with phone ${formattedPhone}`);
      
      client = await storage.createClient({
        companyId,
        name: clientName,
        phone: formattedPhone,
        email: null,
        notes: null,
        birthDate: null
      });
    } else {
      console.log(`✅ Found existing client: ${client.name} (ID: ${client.id})`);
      // Se não temos nome extraído, usar o nome do cliente existente
      if (!extractedName && client.name) {
        extractedName = client.name;
        console.log(`📝 Usando nome do cliente existente: "${extractedName}"`);
      }
    }

    // Fallback final: usar contactName (pushName) da UAZAPI
    if (!extractedName && contactName) {
      extractedName = contactName;
      console.log(`📝 Usando contactName (pushName) da UAZAPI: "${extractedName}"`);
    }

    // Format date for conflict check without timezone conversion
    const conflictCheckDate = `${appointmentDate.getFullYear()}-${String(appointmentDate.getMonth() + 1).padStart(2, '0')}-${String(appointmentDate.getDate()).padStart(2, '0')}`;

    // Check for appointment conflicts before creating
    console.log(`🔍 Checking for appointment conflicts: ${professional.name} on ${formatDateLocal(appointmentDate)} at ${formattedTime}`);

    try {
      // Parse the requested time to minutes for overlap calculation
      const [requestedHour, requestedMin] = formattedTime.split(':').map(Number);
      const requestedTimeInMinutes = requestedHour * 60 + requestedMin;
      const serviceDuration = service.duration || 30; // Default 30 minutes if not specified
      const requestedEndTimeInMinutes = requestedTimeInMinutes + serviceDuration;
      
      console.log(`📊 Novo agendamento: ${formattedTime} (${requestedTimeInMinutes}min) - Duração: ${serviceDuration}min - Fim: ${Math.floor(requestedEndTimeInMinutes/60)}:${String(requestedEndTimeInMinutes%60).padStart(2,'0')}`);
      
      // Get all appointments for this professional on this date (not just exact time match)
      const [existingRows] = await pool.execute(
        `SELECT id, client_name, client_phone, appointment_time, duration
         FROM appointments
         WHERE company_id = ?
           AND professional_id = ?
           AND appointment_date = ?
           AND status != 'Cancelado'`,
        [companyId, professional.id, formatDateLocal(appointmentDate)]
      ) as any;
      
      let hasConflict = false;
      let conflictingAppointment = null;
      
      for (const existing of existingRows) {
        const [existingHour, existingMin] = existing.appointment_time.split(':').map(Number);
        const existingTimeInMinutes = existingHour * 60 + existingMin;
        const existingDuration = existing.duration || 30;
        const existingEndTimeInMinutes = existingTimeInMinutes + existingDuration;
        
        console.log(`📋 Agendamento existente: ${existing.appointment_time} (${existingTimeInMinutes}min) - Duração: ${existingDuration}min - Fim: ${Math.floor(existingEndTimeInMinutes/60)}:${String(existingEndTimeInMinutes%60).padStart(2,'0')}`);
        
        // Check for time overlap: new appointment overlaps if it starts before existing ends AND ends after existing starts
        const hasOverlap = (
          (requestedTimeInMinutes < existingEndTimeInMinutes) && 
          (requestedEndTimeInMinutes > existingTimeInMinutes)
        );
        
        if (hasOverlap) {
          console.log(`⚠️ Conflito de horário detectado: ${existing.client_name} (${existing.appointment_time}-${Math.floor(existingEndTimeInMinutes/60)}:${String(existingEndTimeInMinutes%60).padStart(2,'0')}) vs novo (${formattedTime}-${Math.floor(requestedEndTimeInMinutes/60)}:${String(requestedEndTimeInMinutes%60).padStart(2,'0')})`);

          // Sempre bloquear em caso de sobreposição, independente de ser o mesmo cliente
          // Cliente pode estar agendando para amigo usando mesmo telefone
          hasConflict = true;
          conflictingAppointment = existing;
          break;
        }
      }

      if (hasConflict && conflictingAppointment) {
        const conflictEndTime = conflictingAppointment.appointment_time.split(':').map(Number);
        const conflictEndMinutes = (conflictEndTime[0] * 60 + conflictEndTime[1]) + (conflictingAppointment.duration || 30);
        const conflictEndFormatted = `${Math.floor(conflictEndMinutes/60)}:${String(conflictEndMinutes%60).padStart(2,'0')}`;

        console.log(`❌ Conflito de horário detectado! Cliente ${conflictingAppointment.client_name} já possui agendamento das ${conflictingAppointment.appointment_time} às ${conflictEndFormatted}`);
        console.log(`❌ Agendamento NÃO será criado devido ao conflito de horário`);

        // Return null to indicate appointment was NOT created due to conflict
        return null;
      }

      console.log(`✅ Nenhum conflito encontrado. Criando agendamento para ${extractedName}`);
    } catch (dbError) {
      console.error('❌ Error checking appointment conflicts:', dbError);
      // Continue with appointment creation if conflict check fails
    }

    // Create or get existing client before creating appointment
    try {
      console.log('👤 Criando/verificando cliente:', { name: extractedName, phone: phoneNumber, companyId });
      const client = await storage.createClient({
        companyId,
        name: extractedName,
        phone: phoneNumber,
        email: null,
        birthDate: null,
        notes: 'Cliente criado automaticamente via WhatsApp'
      });
      console.log('✅ Cliente criado/encontrado:', client.id, client.name);
    } catch (clientError) {
      console.error('⚠️ Erro ao criar cliente (continuando com agendamento):', clientError);
      // Continue with appointment creation even if client creation fails
    }

    // Create appointment with initial status
    const appointment = await storage.createAppointment({
      companyId,
      professionalId: professional.id,
      serviceId: service.id,
      clientName: extractedName,
      clientPhone: phoneNumber,
      clientEmail: null,
      appointmentDate: formatDateLocal(appointmentDate),
      appointmentTime: formattedTime,
      duration: service.duration || 30,
      totalPrice: service.price || 0,
      status: initialStatus === 'payment_pending' ? 'Aguardando Pagamento' : 'Pendente',
      notes: `Agendamento confirmado via WhatsApp - Conversa ID: ${conversationId}`,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('🎉🎉🎉 AGENDAMENTO CRIADO COM SUCESSO! 🎉🎉🎉');
    console.log(`✅ Appointment created from AI confirmation: ${extractedName} - ${service.name} - ${appointmentDate.toLocaleDateString()} ${formattedTime}`);

    // Limpar cache de disponibilidade para esta empresa
    clearAvailabilityCache(companyId);

    console.log('📊 Detalhes do agendamento:', {
      id: appointment?.id,
      clientName: extractedName,
      professional: professional.name,
      service: service.name,
      date: appointmentDate.toLocaleDateString('pt-BR'),
      time: formattedTime
    });

    // Force immediate refresh of appointments list
    console.log('📡 Broadcasting new appointment notification...');

    // Broadcast notification with complete appointment data
    // Format date without timezone conversion to avoid losing a day
    const year = appointmentDate.getFullYear();
    const month = String(appointmentDate.getMonth() + 1).padStart(2, '0');
    const day = String(appointmentDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;

    const appointmentNotification = {
      type: 'new_appointment',
      appointment: {
        id: appointment?.id || Date.now(),
        clientName: extractedName,
        serviceName: service.name,
        professionalName: professional?.name || 'Profissional',
        appointmentDate: formatDateLocal(appointmentDate),
        appointmentTime: formattedTime,
        professionalId: professional.id,
        serviceId: service.id,
        status: 'Pendente'
      }
    };

    try {
      broadcastEvent(appointmentNotification, companyId);
      console.log('✅ Broadcast notification sent for appointment type:', appointmentNotification?.type, 'companyId:', companyId);
    } catch (broadcastError) {
      console.error('⚠️ Broadcast error:', broadcastError);
    }

    // 🚫 Cancelar follow-up de inatividade — cliente já agendou, não precisa ser cobrado
    const suppressKey = `${companyId}:${phoneNumber}`;
    if (conversationFollowUpTimers.has(suppressKey)) {
      const pendingFollowUp = conversationFollowUpTimers.get(suppressKey)!;
      clearTimeout(pendingFollowUp.timer);
      conversationFollowUpTimers.delete(suppressKey);
      console.log(`🚫 [FOLLOW-UP] Timer de follow-up CANCELADO para ${suppressKey} (agendamento criado)`);
    }

    // 🔔 Send to n8n webhook if configured and enabled
    try {
      const company = await storage.getCompanyById(companyId);

      if (company?.n8nWebhookEnabled && company?.n8nWebhookUrl) {
        const webhookPayload = {
          event: 'appointment.created',
          timestamp: new Date().toISOString(),
          createdBy: 'whatsapp_ai',
          conversationId: conversationId,
          appointment: {
            id: appointment.id,
            clientName: extractedName,
            clientPhone: phoneNumber,
            clientEmail: null,
            appointmentDate: formatDateLocal(appointmentDate),
            appointmentTime: formattedTime,
            status: appointment.status,
            duration: service.duration || 30,
            totalPrice: service.price || 0,
            notes: appointment.notes
          },
          service: {
            id: service.id,
            name: service.name,
            price: service.price
          },
          professional: {
            id: professional?.id,
            name: professional?.name
          },
          company: {
            id: companyId,
            name: company.fantasyName
          }
        };

        // Set DEBUG_N8N_WEBHOOK=true in .env to see detailed logs
        if (process.env.DEBUG_N8N_WEBHOOK === 'true') {
          console.log('🔍 [AI/WHATSAPP] Sending to n8n webhook');
          console.log('📦 [AI/WHATSAPP] Payload keys:', Object.keys(webhookPayload).join(', '));
        }

        const response = await fetch(company.n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload)
        });

        if (!response.ok) {
          console.error('⚠️ N8N webhook error:', response.status, response.statusText);
        } else if (process.env.DEBUG_N8N_WEBHOOK === 'true') {
          console.log('✅ [AI/WHATSAPP] N8N webhook sent successfully');
        }
      }
    } catch (webhookError) {
      console.error('⚠️ Error processing n8n webhook:', webhookError);
    }

    // Return the appointment ID after broadcasting
    return appointment.id;

  } catch (error) {
    console.error('❌ Error creating appointment from AI confirmation:', error);

    // Enviar webhook de erro geral
    try {
      await sendAppointmentErrorWebhook(companyId, 'DATABASE_ERROR', `Erro ao criar agendamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, {
        conversationId,
        phoneNumber,
        additionalInfo: `Stack: ${error instanceof Error ? error.stack : 'N/A'}`
      });
    } catch (webhookErr) {
      console.error('⚠️ Falha ao enviar webhook de erro:', webhookErr);
    }

    return null;
  }
}

async function createAppointmentFromConversation(conversationId: number, companyId: number) {
  try {
    console.log('📅 Checking conversation for complete appointment confirmation:', conversationId);
    
    // Check if appointment already exists for this conversation within the last 5 minutes (only to prevent duplicates)
    const existingAppointments = await storage.getAppointmentsByCompany(companyId);
    console.log(`🔍 DEBUG: Found ${existingAppointments.length} total appointments for company ${companyId}`);

    // Filter appointments that mention this conversation
    const conversationAppointments = existingAppointments.filter(apt =>
      apt.notes && apt.notes.includes(`Conversa ID: ${conversationId}`)
    );
    console.log(`🔍 DEBUG: Found ${conversationAppointments.length} appointments mentioning Conversa ID: ${conversationId}`);

    // Log all conversation-related appointments for debugging
    conversationAppointments.forEach((apt, index) => {
      const createdTime = apt.createdAt ? new Date(apt.createdAt).getTime() : 0;
      const timeDiff = Date.now() - createdTime;
      const minutesAgo = Math.floor(timeDiff / (1000 * 60));
      console.log(`🔍 DEBUG: Appointment ${index + 1}:`, {
        id: apt.id,
        status: apt.status,
        clientName: apt.clientName,
        createdAt: apt.createdAt,
        minutesAgo: minutesAgo,
        notes: apt.notes?.substring(0, 100) + '...'
      });
    });

    // Check for recent appointments (within 5 minutes) but only if they are active/pending
    // We'll do a more detailed check after extracting the appointment data
    const recentActiveAppointments = conversationAppointments.filter(apt =>
      apt.createdAt &&
      new Date(apt.createdAt).getTime() > (Date.now() - 5 * 60 * 1000) &&
      apt.status &&
      !['Cancelado', 'Rejeitado', 'Excluído'].includes(apt.status)
    );

    if (recentActiveAppointments.length > 0) {
      console.log(`ℹ️ Found ${recentActiveAppointments.length} recent ACTIVE appointments for this conversation (within 5 min)`);
      console.log('📋 Will check if new appointment data differs from existing ones after extraction');
    } else {
      console.log('✅ No recent active appointments found for this conversation, proceeding with creation');
    }
    
    // Get conversation and messages
    const allConversations = await storage.getConversationsByCompany(companyId);
    const conversation = allConversations.find(conv => conv.id === conversationId);
    if (!conversation) {
      console.log('⚠️ Conversa não encontrada:', conversationId);
      return;
    }
    
    const messages = await storage.getMessagesByConversation(conversationId);
    const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // REGRA CRÍTICA: Só criar agendamento se houver confirmação explícita final
    const finalConfirmationPhrases = [
      'sim',
      'ok', 
      'confirmo',
      'sim, confirmo',
      'sim, está correto',
      'sim, pode agendar',
      'ok, confirmo',
      'ok, está correto',
      'ok, pode agendar',
      'confirmo sim',
      'está correto sim',
      'pode agendar sim'
    ];

    // Normaliza a mensagem removendo pontuação (!, ., ?, etc.) para aceitar "sim!", "sim.", etc.
    const normalizeForComparison = (text: string) => {
      return text.toLowerCase().trim().replace(/[!?.,:;'"]+$/g, '').trim();
    };

    // Get last user message to check for recent confirmation
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const hasRecentConfirmation = lastUserMessage &&
      finalConfirmationPhrases.some(phrase =>
        normalizeForComparison(lastUserMessage.content) === phrase.toLowerCase()
      );

    // Buscar confirmação apenas nas mensagens do USUÁRIO (não do assistente)
    // A frase "Responda SIM para confirmar" do assistente contém "sim" e causava falso positivo
    const userMessagesText = messages.filter(m => m.role === 'user').map(m => m.content.toLowerCase()).join(' ');
    const hasAnyConfirmation = finalConfirmationPhrases.some(phrase =>
      userMessagesText.includes(phrase.toLowerCase())
    );

    if (!hasRecentConfirmation && !hasAnyConfirmation) {
      console.log('⚠️ Nenhuma confirmação final (sim/ok) encontrada na conversa, pulando criação de agendamento');
      return;
    }
    
    console.log('✅ Confirmação detectada na conversa, prosseguindo com criação de agendamento');

    // VERIFICAÇÃO ADICIONAL: Deve ter data específica mencionada na mesma mensagem ou contexto próximo
    const dateSpecificPhrases = [
      'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo',
      'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira',
      'amanhã', 'hoje', 'depois de amanhã'
    ];
    
    const hasSpecificDate = dateSpecificPhrases.some(phrase => 
      conversationText.toLowerCase().includes(phrase.toLowerCase())
    );
    
    if (!hasSpecificDate) {
      console.log('⚠️ No specific date mentioned in conversation, skipping appointment creation');
      return;
    }

    // VERIFICAÇÃO CRÍTICA: Se a última resposta do AI contém pergunta, dados ainda estão incompletos
    const lastAIMessage = messages.filter(m => m.role === 'assistant').pop();
    if (lastAIMessage && lastAIMessage.content) {
      // IMPORTANTE: Se a mensagem já é uma confirmação de agendamento anterior, NÃO criar outro
      const isAlreadyConfirmedAppointment = lastAIMessage.content.includes('Agendamento Confirmado!') ||
                                            lastAIMessage.content.includes('Obrigado por escolher nossos serviços');

      if (isAlreadyConfirmedAppointment) {
        console.log('⚠️ Última mensagem é de agendamento já confirmado anteriormente, não criando duplicata');
        return;
      }

      // Check if AI is ASKING for confirmation (waiting for user to say SIM)
      const isAskingForConfirmation = lastAIMessage.content.includes('Está tudo correto?') ||
                                      lastAIMessage.content.includes('Responda SIM para confirmar') ||
                                      lastAIMessage.content.includes('Responda SIM para cancelar') ||
                                      lastAIMessage.content.includes('CANCELAR* para confirmar') ||
                                      lastAIMessage.content.includes('CANCELAR para confirmar') ||
                                      lastAIMessage.content.includes('Confirma a remarcação?') ||
                                      lastAIMessage.content.includes('Confirma o cancelamento?') ||
                                      lastAIMessage.content.includes('confirmar seu agendamento');

      // Check if AI is confirming appointment (skip question check if it's a confirmation)
      const isConfirmingAppointment = lastAIMessage.content.toLowerCase().includes('agendamento realizado') ||
                                      lastAIMessage.content.toLowerCase().includes('nos vemos');

      // 🛑 NÃO criar agendamento quando a IA está PEDINDO confirmação (aguardando SIM do cliente)
      // Sem esta verificação, a IA envia "Responda SIM" e o sistema cria o agendamento prematuramente,
      // gerando um "fantasma" que causa conflito quando o cliente realmente confirma.
      if (isAskingForConfirmation && !isConfirmingAppointment) {
        console.log('⏳ AI está pedindo confirmação ao cliente (SIM/OK), aguardando resposta antes de criar agendamento');
        return null;
      }

      if (!isConfirmingAppointment && !isAskingForConfirmation) {
        const hasQuestion = lastAIMessage.content.includes('?') ||
                           lastAIMessage.content.toLowerCase().includes('qual') ||
                           lastAIMessage.content.toLowerCase().includes('escolha') ||
                           lastAIMessage.content.toLowerCase().includes('prefere') ||
                           lastAIMessage.content.toLowerCase().includes('gostaria');

        // For "informe", only consider it a blocking question if it's asking for critical missing data
        // and not just asking for phone when other data is complete
        const hasInformeQuestion = lastAIMessage.content.toLowerCase().includes('informe');
        const isAskingForPhone = lastAIMessage.content.toLowerCase().includes('telefone') ||
                                lastAIMessage.content.toLowerCase().includes('número');

        // Check if we have enough appointment data in the conversation to proceed despite AI questions
        const hasAppointmentData = messages.some(m =>
          m.role === 'assistant' && (
            (m.content.toLowerCase().includes('está disponível') &&
             m.content.toLowerCase().includes('para') &&
             (m.content.toLowerCase().includes('às') || m.content.toLowerCase().includes('horário'))) ||
            (m.content.includes('Nome:') ||
             (m.content.toLowerCase().includes('obrigad') && m.content.toLowerCase().includes('nome')))
          )
        );

        console.log('🔍 DEBUG Question Detection:', {
          hasQuestion,
          hasInformeQuestion,
          isAskingForPhone,
          hasAppointmentData,
          shouldBlock: (hasQuestion || (hasInformeQuestion && !isAskingForPhone)) && !hasAppointmentData,
          lastAIMessage: lastAIMessage.content.substring(0, 100) + '...'
        });

        // Only block if asking questions AND we don't have enough appointment data
        if ((hasQuestion || (hasInformeQuestion && !isAskingForPhone)) && !hasAppointmentData) {
          console.log('⚠️ AI is asking questions to client, appointment data incomplete, skipping creation');
          return;
        }

        if (hasInformeQuestion && isAskingForPhone) {
          console.log('ℹ️ AI asking for phone, but other appointment data may be complete, continuing with extraction');
        }
      } else {
        console.log('✅ AI is confirming appointment, proceeding with creation');
      }
    }
    
    // Get available professionals and services to match
    const professionals = await storage.getProfessionalsByCompany(companyId);
    const services = await storage.getServicesByCompany(companyId);
    
    console.log('💬 Analyzing conversation with explicit confirmation for appointment data...');

    // Get company for OpenAI configuration
    const company = await storage.getCompany(companyId);
    if (!company?.openaiApiKey) {
      throw new Error('Company does not have OpenAI API key configured');
    }

    // Extract appointment data using AI
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: company.openaiApiKey });
    
    // Calculate correct dates for relative day names
    const today = getBrazilDate(); // Use Brazil timezone
    const dayMap = {
      'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3,
      'quinta': 4, 'sexta': 5, 'sábado': 6
    };
    
    function getNextWeekdayDate(dayName: string): string {
      const targetDay = dayMap[dayName.toLowerCase()];
      if (targetDay === undefined) return '';
      
      const date = new Date();
      const currentDay = date.getDay();
      let daysUntilTarget = targetDay - currentDay;
      
      // Se o dia alvo é hoje, usar o próximo
      if (daysUntilTarget === 0) {
        daysUntilTarget = 7; // Próxima semana
      }
      
      // Se o dia já passou esta semana, pegar a próxima ocorrência
      if (daysUntilTarget < 0) {
        daysUntilTarget += 7;
      }
      
      // Criar nova data para evitar modificar a original
      const resultDate = new Date(date);
      resultDate.setDate(resultDate.getDate() + daysUntilTarget);
      return formatDateLocal(resultDate);
    }

    const extractionPrompt = `Analise esta conversa de WhatsApp e extraia os dados do agendamento APENAS SE HOUVER CONFIRMAÇÃO EXPLÍCITA COMPLETA.

HOJE É: ${today.toLocaleDateString('pt-BR')} (${['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][today.getDay()]})
ANO ATUAL: ${today.getFullYear()}
MÊS ATUAL: ${today.getMonth() + 1} (${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][today.getMonth()]})

PRÓXIMOS DIAS DA SEMANA (use apenas se cliente NÃO especificou data exata):
- Domingo: ${getNextWeekdayDate('domingo')}
- Segunda-feira: ${getNextWeekdayDate('segunda')}
- Terça-feira: ${getNextWeekdayDate('terça')}
- Quarta-feira: ${getNextWeekdayDate('quarta')}
- Quinta-feira: ${getNextWeekdayDate('quinta')}
- Sexta-feira: ${getNextWeekdayDate('sexta')}
- Sábado: ${getNextWeekdayDate('sábado')}

PROFISSIONAIS DISPONÍVEIS:
${professionals.map(p => `- ${p.name} (ID: ${p.id})`).join('\n')}

SERVIÇOS DISPONÍVEIS:
${services.map(s => `- ${s.name} (ID: ${s.id})`).join('\n')}

CONVERSA:
${conversationText}

🔍 COMO EXTRAIR OS DADOS:

1. PRIMEIRO: Procure se o cliente confirmou com "sim" ou "ok" no final da conversa
2. SEGUNDO: Se confirmou, procure o RESUMO do agendamento que o ASSISTANT enviou ANTES da confirmação
3. TERCEIRO: Extraia os dados do RESUMO (que pode conter emojis como 👤, 📅, 🕐) ou das mensagens do USUÁRIO
4. QUARTO: Se algum dado estiver faltando no resumo, busque nas mensagens anteriores do USUÁRIO

⚠️ INSTRUÇÕES CRÍTICAS:

IMPORTANTE: Se a IA mencionar dados diferentes do que o cliente escolheu, SEMPRE priorize as escolhas do CLIENTE.
- Se cliente disse "hidratação" e IA disse "escova", use HIDRATAÇÃO
- Se cliente disse "terça" e IA disse "quarta", use TERÇA
- Se cliente disse "15:00" e IA disse "10:00", use 15:00
- A IA pode alucinar dados incorretos, mas as escolhas do cliente são sempre corretas
- BUSQUE nos RESUMOS do assistant E nas mensagens do usuário
- O assistant geralmente envia um resumo com formato "Resumo do agendamento:" ou com emojis (👤 📅 🕐)

REGRAS CRÍTICAS - SÓ EXTRAIA SE TODAS AS CONDIÇÕES FOREM ATENDIDAS:

1. DEVE haver confirmação final com "SIM" ou "OK":
   - Cliente deve responder "sim", "ok", "sim, confirmo", "ok, confirmo", "sim, está correto"
   - NUNCA extraia dados se cliente não confirmou com SIM/OK

2. TODOS os dados devem estar presentes na conversa (mesmo que espalhados):
   - Nome do cliente (primeiro nome é suficiente, pode estar no resumo ou nas mensagens do usuário)
   - IMPORTANTE: NÃO aceite palavras de confirmação como nome (sim, ok, não, nao, claro, perfeito, ótimo, excelente, certo, beleza, etc.)
   - Se o nome for uma palavra de confirmação, considere DADOS_INCOMPLETOS
   - Profissional ESPECÍFICO escolhido
   - Serviço ESPECÍFICO escolhido
   - Data ESPECÍFICA (dia da semana + data)
   - Horário ESPECÍFICO
   - TELEFONE: NÃO é necessário na conversa (será preenchido automaticamente com o número do WhatsApp)

3. INSTRUÇÕES PARA DATAS - MUITO IMPORTANTE:
   - PRIORIZE a data EXATA mencionada na conversa, especialmente no RESUMO do agendamento
   - Se no resumo aparece "📅 Data: quinta-feira, 18/12/2025", a data é 2025-12-18
   - Se cliente disse "dia 18" e estamos em dezembro, a data é 2025-12-18
   - SEMPRE converta para formato YYYY-MM-DD (ano-mês-dia)
   - Exemplos de conversão:
     * "18/12/2025" ou "18/12" -> "2025-12-18"
     * "dia 18" (dezembro atual) -> "2025-12-18"
     * "25 de janeiro" -> "2026-01-25"
   - Se mencionado APENAS dia da semana sem data específica:
     * "sábado" -> ${getNextWeekdayDate('sábado')}
     * "segunda" -> ${getNextWeekdayDate('segunda')}
     * "terça" -> ${getNextWeekdayDate('terça')}
     * "quarta" -> ${getNextWeekdayDate('quarta')}
     * "quinta" -> ${getNextWeekdayDate('quinta')}
     * "sexta" -> ${getNextWeekdayDate('sexta')}
     * "domingo" -> ${getNextWeekdayDate('domingo')}
   - ATENÇÃO: NÃO confunda o dia da semana com a data numérica!
   - Se resumo mostra "18/12/2025" mas diz "quinta-feira", USE A DATA 2025-12-18
   - Aceite QUALQUER data futura válida

4. CASOS QUE DEVEM RETORNAR "DADOS_INCOMPLETOS":
   - Cliente não confirmou com "sim" ou "ok"
   - Falta qualquer dado obrigatório (nome do cliente, data específica, horário)
   - Dados estão inconsistentes ou contraditórios na conversa

IMPORTANTE: Responda APENAS com JSON puro, sem explicações, sem formatação markdown, sem comentários.
NÃO use \`\`\`json, NÃO use \`\`\`, NÃO adicione texto antes ou depois.

Retorne EXATAMENTE um destes dois formatos:
1. Se os dados estão completos, retorne APENAS o JSON:
{"clientName":"Nome do cliente","professionalId":123,"serviceId":456,"appointmentDate":"YYYY-MM-DD","appointmentTime":"HH:MM"}

2. Se falta algum dado ou não há confirmação, retorne APENAS:
DADOS_INCOMPLETOS

Exemplo de resposta válida (sem aspas externas, sem formatação):
{"clientName":"Maria Silva","professionalId":1,"serviceId":2,"appointmentDate":"2025-12-18","appointmentTime":"14:00"}

NOTA: O telefone NÃO precisa estar no JSON - será preenchido automaticamente pelo sistema.

ATENÇÃO FINAL: Se no resumo do agendamento aparece uma data como "18/12/2025", você DEVE retornar appointmentDate como "2025-12-18" (formato YYYY-MM-DD). NÃO use o dia da semana para calcular a data, use a DATA EXATA mostrada!`;

    const extraction = await openai.chat.completions.create({
      model: company.openaiModel || "gpt-4o-mini",
      messages: [{ role: "user", content: extractionPrompt }],
      temperature: company.openaiTemperature ? parseFloat(company.openaiTemperature.toString()) : 0.7,
      max_tokens: company.openaiMaxTokens || 180
    });

    const extractedData = extraction.choices[0]?.message?.content?.trim();
    console.log('🤖 AI Extraction result:', extractedData);

    if (!extractedData || extractedData === 'DADOS_INCOMPLETOS' || extractedData.includes('DADOS_INCOMPLETOS')) {
      console.log('⚠️ Incomplete appointment data or missing confirmation, skipping creation');

      // Enviar webhook de erro
      await sendAppointmentErrorWebhook(companyId, 'EXTRACTION_FAILED', 'Dados do agendamento incompletos ou cliente não confirmou', {
        conversationId,
        phoneNumber: conversation.phoneNumber,
        additionalInfo: 'Cliente pode não ter confirmado com SIM/OK ou faltam dados obrigatórios'
      });

      return;
    }

    try {
      // Limpar a resposta da IA para extrair apenas o JSON
      let cleanedData = extractedData;

      // Remover possíveis marcações de código (```json, ```)
      cleanedData = cleanedData.replace(/```json\s*/gi, '');
      cleanedData = cleanedData.replace(/```\s*/g, '');

      // Remover possíveis aspas extras no início e fim
      cleanedData = cleanedData.replace(/^["']|["']$/g, '');

      // Extrair apenas o objeto JSON se houver texto adicional
      const jsonMatch = cleanedData.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedData = jsonMatch[0];
      }

      // Remover caracteres invisíveis, BOM e espaços extras
      cleanedData = cleanedData.trim()
        .replace(/^\uFEFF/, '') // Remove BOM
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove caracteres de controle
        .replace(/\r\n/g, '\n') // Normaliza quebras de linha
        .replace(/\s+/g, ' '); // Normaliza espaços

      // Validar se parece um JSON antes de tentar fazer parse
      if (!cleanedData.startsWith('{') || !cleanedData.endsWith('}')) {
        console.error('❌ Invalid JSON structure - not starting with { or ending with }');
        console.error('📊 Cleaned data:', cleanedData);
        return;
      }

      console.log('🧹 Cleaned data for parsing:', cleanedData);

      const appointmentData = JSON.parse(cleanedData);

      // SEMPRE usar o telefone do WhatsApp automaticamente
      appointmentData.clientPhone = conversation.phoneNumber;
      console.log('📱 Usando telefone do WhatsApp automaticamente:', appointmentData.clientPhone);

      // Validação final de todos os campos obrigatórios (sem exigir telefone pois é automático)
      if (!appointmentData.clientName ||
          !appointmentData.professionalId || !appointmentData.serviceId ||
          !appointmentData.appointmentDate || !appointmentData.appointmentTime) {
        console.log('⚠️ Missing required appointment fields after extraction, skipping creation');

        // Identificar quais campos estão faltando
        const missingFields = [];
        if (!appointmentData.clientName) missingFields.push('nome do cliente');
        if (!appointmentData.professionalId) missingFields.push('profissional');
        if (!appointmentData.serviceId) missingFields.push('serviço');
        if (!appointmentData.appointmentDate) missingFields.push('data');
        if (!appointmentData.appointmentTime) missingFields.push('horário');

        // Enviar webhook de erro
        await sendAppointmentErrorWebhook(companyId, 'VALIDATION_FAILED', `Campos obrigatórios faltando: ${missingFields.join(', ')}`, {
          conversationId,
          phoneNumber: conversation.phoneNumber,
          clientName: appointmentData.clientName,
          professionalId: appointmentData.professionalId,
          serviceId: appointmentData.serviceId,
          requestedDate: appointmentData.appointmentDate,
          requestedTime: appointmentData.appointmentTime,
          additionalInfo: `Campos extraídos: ${JSON.stringify(appointmentData)}`
        });

        return;
      }

      console.log('✅ Valid appointment data extracted - serviceId:', appointmentData.serviceId, 'date:', appointmentData.date, 'time:', appointmentData.time);

      // Find the service to get duration
      const service = services.find(s => s.id === appointmentData.serviceId);
      if (!service) {
        console.log('⚠️ Service not found');

        // Enviar webhook de erro
        await sendAppointmentErrorWebhook(companyId, 'SERVICE_NOT_FOUND', `Serviço ID ${appointmentData.serviceId} não encontrado`, {
          conversationId,
          phoneNumber: conversation.phoneNumber,
          clientName: appointmentData.clientName,
          serviceId: appointmentData.serviceId,
          requestedDate: appointmentData.appointmentDate,
          requestedTime: appointmentData.appointmentTime
        });

        return;
      }

      // Create client if doesn't exist
      let client;
      try {
        // Use imported normalizePhone function that handles missing 9th digit
        const normalizedClientPhone = normalizePhone(appointmentData.clientPhone);

        const existingClients = await storage.getClientsByCompany(companyId);
        client = existingClients.find(c =>
          c.phone && normalizePhone(c.phone) === normalizedClientPhone
        );
        
        if (!client) {
          client = await storage.createClient({
            companyId,
            name: appointmentData.clientName,
            phone: appointmentData.clientPhone,
            email: null,
            notes: 'Cliente criado via WhatsApp',
            birthDate: null
          });
          console.log('👤 New client created:', client.name);
        } else {
          console.log('👤 Existing client found:', client.name);
        }
      } catch (error) {
        console.error('Error creating/finding client:', error);
        return;
      }

      // Create appointment with correct date
      const appointmentDate = new Date(appointmentData.appointmentDate + 'T00:00:00.000Z');
      
      const appointmentPayload = {
        companyId,
        serviceId: appointmentData.serviceId,
        professionalId: appointmentData.professionalId,
        clientName: appointmentData.clientName,
        clientPhone: appointmentData.clientPhone,
        appointmentDate: formatDateLocal(appointmentDate),
        appointmentTime: appointmentData.appointmentTime,
        duration: service.duration || 60,
        status: 'Pendente',
        totalPrice: String(service.price || 0),
        notes: `Agendamento confirmado via WhatsApp - Conversa ID: ${conversationId}`,
        reminderSent: 0
      };

      console.log('📋 Creating appointment - companyId:', appointmentPayload.companyId, 'serviceId:', appointmentPayload.serviceId, 'date:', appointmentPayload.appointmentDate);
      
      let appointment;
      try {
        appointment = await storage.createAppointment(appointmentPayload);
        console.log('✅ Appointment created successfully with ID:', appointment.id);
        console.log('🎯 SUCCESS: Appointment saved to database with explicit confirmation');
      } catch (createError) {
        console.error('❌ CRITICAL ERROR: Failed to create appointment in database:', createError);
        throw createError;
      }
      
      console.log(`📅 CONFIRMED APPOINTMENT: ${appointmentData.clientName} - ${service.name} - ${appointmentDate.toLocaleDateString('pt-BR')} ${appointmentData.appointmentTime}`);

      // Get professional name for notification
      const professional = await storage.getProfessional(appointmentData.professionalId);
      
      // Broadcast new appointment event only to connections of the same company
      broadcastEvent({
        type: 'new_appointment',
        appointment: {
          id: appointment.id,
          clientName: appointmentData.clientName,
          serviceName: service.name,
          professionalName: professional?.name || 'Profissional',
          appointmentDate: appointmentData.appointmentDate,
          appointmentTime: appointmentData.appointmentTime
        }
      }, companyId);

    } catch (parseError) {
      console.error('❌ Error parsing extracted appointment data:', parseError);
      console.error('📊 Original extracted data:', extractedData);
      if (extractedData) {
        console.error('📏 Data length:', extractedData.length);
        console.error('🔤 First 200 chars:', extractedData.substring(0, 200));
        console.error('🔢 Last 200 chars:', extractedData.substring(Math.max(0, extractedData.length - 200)));
      }
    }

  } catch (error) {
    console.error('❌ Error in createAppointmentFromConversation:', error);
    throw error;
  }
}

// Store SSE connections with companyId for multi-tenant isolation
const sseConnections = new Map<any, number>();

// Function to broadcast events only to connections of the same company
const broadcastEvent = (eventData: any, targetCompanyId?: number) => {
  const data = JSON.stringify(eventData);
  sseConnections.forEach((companyId, res) => {
    try {
      // Only send to connections of the same company
      if (!targetCompanyId || companyId === targetCompanyId) {
        res.write(`data: ${data}\n\n`);
      }
    } catch (error) {
      // Remove dead connections
      sseConnections.delete(res);
    }
  });
};

export async function registerRoutes(app: Express): Promise<Server> {

  // Security headers (CSP, HSTS, X-Frame-Options, etc.)
  app.use((await import("./security-headers")).securityHeaders);

  // Rate limiter geral para todas as rotas da API
  app.use('/api/', apiGeneralLimiter);

  // Proteção CSRF via validação de Origin/Referer para mutações (POST/PUT/PATCH/DELETE)
  app.use('/api/', (req: any, res, next) => {
    // Permitir métodos GET/HEAD/OPTIONS sem verificação
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    // Permitir webhooks (não têm Origin do nosso domínio)
    if (req.path.includes('/webhook/')) {
      return next();
    }

    // Permitir rotas de agendamento público (booking page)
    if (req.path.includes('/public/')) {
      return next();
    }

    const origin = req.get('Origin') || req.get('Referer') || '';
    const host = req.get('Host') || '';

    // Em produção, verificar se Origin/Referer corresponde ao nosso host
    if (process.env.NODE_ENV === 'production' && origin) {
      try {
        const originUrl = new URL(origin);
        const hostWithoutPort = host.split(':')[0];
        if (originUrl.hostname !== hostWithoutPort && originUrl.hostname !== 'localhost') {
          console.warn(`[CSRF] Bloqueado: Origin=${origin} não corresponde a Host=${host}`);
          return res.status(403).json({ message: 'Requisição bloqueada por proteção CSRF' });
        }
      } catch {
        // Origin inválida
      }
    }

    next();
  });

  // Ensure trial columns exist in companies table
  try {
    console.log('🔧 Verificando colunas de trial na tabela companies...');
    
    // Check if trial columns exist
    const [trialColumns] = await pool.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'companies' 
      AND COLUMN_NAME IN ('trial_expires_at', 'trial_alert_shown')
    `);
    
    const existingColumns = (trialColumns as any[]).map(col => col.COLUMN_NAME);
    
    // Add trial_expires_at if missing
    if (!existingColumns.includes('trial_expires_at')) {
      console.log('➕ Adicionando coluna trial_expires_at...');
      
      await pool.execute(`
        ALTER TABLE companies 
        ADD COLUMN trial_expires_at DATETIME NULL
      `);
      
      console.log('✅ Coluna trial_expires_at adicionada!');
      
      // Update existing companies with trial expiration dates
      const [companies] = await pool.execute(`
        SELECT c.id, c.created_at, IFNULL(p.free_days, 30) as free_days
        FROM companies c 
        LEFT JOIN plans p ON c.plan_id = p.id 
        WHERE c.trial_expires_at IS NULL
      `);
      
      for (const company of (companies as any[])) {
        const freeDays = company.free_days || 30;
        const createdAt = new Date(company.created_at);
        const trialExpiresAt = new Date(createdAt.getTime() + (freeDays * 24 * 60 * 60 * 1000));
        
        await pool.execute(`
          UPDATE companies 
          SET trial_expires_at = ?, subscription_status = 'trial' 
          WHERE id = ?
        `, [trialExpiresAt, company.id]);
      }
      
      console.log(`✅ ${(companies as any[]).length} empresas atualizadas com datas de trial`);
    }
    
    // Add trial_alert_shown if missing
    if (!existingColumns.includes('trial_alert_shown')) {
      console.log('➕ Adicionando coluna trial_alert_shown...');
      
      await pool.execute(`
        ALTER TABLE companies 
        ADD COLUMN trial_alert_shown INT NOT NULL DEFAULT 0
      `);
      
      console.log('✅ Coluna trial_alert_shown adicionada!');
    }
    
    console.log('✅ Todas as colunas de trial verificadas');
  } catch (error) {
    console.error('❌ Erro ao verificar/criar colunas de trial:', error);
  }

  // REMOVIDO: endpoints /api/test/appointments-count e /api/test/create-appointment (sem autenticação)
  // REMOVIDO: endpoint /api/test-notification (sem autenticação)

  // Auth middleware
  await setupAuth(app);

  // SSE endpoint for real-time updates (requires company authentication via session)
  app.get('/api/events', (req: any, res) => {
    const companyId = req.session?.companyId;
    if (!companyId) {
      return res.status(401).json({ message: 'Não autenticado' });
    }

    const origin = req.headers.origin || req.headers.host || '';
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Add connection to store with companyId for tenant isolation
    sseConnections.set(res, companyId);
    console.log(`📡 New SSE connection added for company ${companyId}. Total connections: ${sseConnections.size}`);

    // Send initial connection confirmation
    res.write('data: {"type":"connection_established","message":"SSE connected successfully"}\n\n');

    // Send keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      try {
        res.write('data: {"type":"ping"}\n\n');
      } catch (error) {
        clearInterval(keepAlive);
        sseConnections.delete(res);
      }
    }, 30000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepAlive);
      sseConnections.delete(res);
      console.log(`📡 SSE connection closed for company ${companyId}. Remaining connections: ${sseConnections.size}`);
    });
  });

  // REMOVIDO: endpoint /api/test/notification-trigger (sem autenticação)



  // REMOVIDO: credenciais de admin hardcoded (vulnerabilidade de segurança)

  // Company routes
  app.get('/api/companies', isAuthenticated, async (req, res) => {
    try {
      const [companyRows] = await pool.execute(`
        SELECT c.*, p.name as plan_name, p.free_days,
               CASE
                 WHEN c.subscription_status = 'blocked' OR
                      (c.trial_expires_at <= NOW() AND c.subscription_status = 'trial')
                 THEN true
                 ELSE false
               END as is_blocked,
               CASE
                 WHEN c.trial_expires_at > NOW() AND c.subscription_status = 'trial'
                 THEN DATEDIFF(c.trial_expires_at, NOW())
                 ELSE NULL
               END as days_remaining
        FROM companies c
        LEFT JOIN plans p ON c.plan_id = p.id
        ORDER BY
          CASE WHEN c.subscription_status = 'blocked' THEN 0 ELSE 1 END,
          c.fantasy_name
      `) as any;

      // Convert snake_case to camelCase for frontend
      const formattedCompanies = (companyRows as any[]).map((company: any) => ({
        ...company,
        fantasyName: company.fantasy_name,
        planName: company.plan_name,
        freeDays: company.free_days,
        isBlocked: company.is_blocked,
        daysRemaining: company.days_remaining,
        subscriptionStatus: company.subscription_status,
        trialExpiresAt: company.trial_expires_at,
        planId: company.plan_id,
        financialPasswordEnabled: company.financial_password_enabled
      }));

      res.json(formattedCompanies);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.status(500).json({ message: "Falha ao buscar empresas" });
    }
  });

  app.get('/api/companies/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const company = await storage.getCompany(id);

      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada" });
      }

      // Remove sensitive keys from response - return only boolean flags
      const { openaiApiKey, asaasApiKey, password, resetToken, resetTokenExpires, financialPassword, ...safeCompany } = company as any;
      res.json({
        ...safeCompany,
        hasOpenaiApiKey: !!openaiApiKey,
        hasAsaasApiKey: !!asaasApiKey,
        hasFinancialPassword: !!financialPassword,
      });
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ message: "Falha ao buscar empresa" });
    }
  });

  app.post('/api/companies', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertCompanySchema.parse(req.body);
      
      // Check if email already exists
      const existingCompany = await storage.getCompanyByEmail(validatedData.email);
      if (existingCompany) {
        return res.status(400).json({ message: "Email já cadastrado" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 12);
      
      // Get global settings to apply default AI prompt and birthday message
      const globalSettings = await storage.getGlobalSettings();
      const defaultAiPrompt = globalSettings?.defaultAiPrompt || "";
      const defaultBirthdayMessage = globalSettings?.defaultBirthdayMessage || "";
      
      const company = await storage.createCompany({
        ...validatedData,
        password: hashedPassword,
        aiAgentPrompt: defaultAiPrompt, // Apply default AI prompt from admin settings
        birthdayMessage: defaultBirthdayMessage, // Apply default birthday message from admin settings
      });
      
      res.status(201).json(company);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Error creating company:", error);
      res.status(500).json({ message: "Falha ao criar empresa" });
    }
  });

  app.put('/api/companies/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      console.log('Updating company ID:', id, '- fields:', Object.keys(req.body).join(', '));

      const validatedData = insertCompanySchema.partial().parse(req.body);
      console.log('Validated fields:', Object.keys(validatedData).join(', '));
      
      // Hash password if provided and not empty
      if (validatedData.password && validatedData.password.trim() !== '') {
        validatedData.password = await bcrypt.hash(validatedData.password, 12);
      } else {
        // Remove password field if empty to avoid updating with empty value
        delete validatedData.password;
      }
      
      // Convert isActive to number if it's a boolean
      if (typeof validatedData.isActive === 'boolean') {
        (validatedData as any).isActive = validatedData.isActive ? 1 : 0;
      }

      // Convert financialPasswordEnabled to number if it's a boolean
      if (typeof validatedData.financialPasswordEnabled === 'boolean') {
        (validatedData as any).financialPasswordEnabled = validatedData.financialPasswordEnabled ? 1 : 0;
      }

      const company = await storage.updateCompany(id, validatedData);
      console.log('Updated company ID:', company?.id);

      // Remove sensitive keys from response
      const { openaiApiKey, asaasApiKey, password: _pw, resetToken, resetTokenExpires, financialPassword, ...safeCompany } = company as any;
      res.json({
        ...safeCompany,
        hasOpenaiApiKey: !!openaiApiKey,
        hasAsaasApiKey: !!asaasApiKey,
        hasFinancialPassword: !!financialPassword,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.errors);
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Error updating company:", error);
      res.status(500).json({ message: "Falha ao atualizar empresa" });
    }
  });

  app.delete('/api/companies/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCompany(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company:", error);
      res.status(500).json({ message: "Falha ao excluir empresa" });
    }
  });

  // Endpoint para liberar/bloquear empresa pelo administrador
  app.patch('/api/companies/:id/status', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { action } = req.body; // 'activate' ou 'block'
      
      if (!['activate', 'block'].includes(action)) {
        return res.status(400).json({ message: "Ação inválida. Use 'activate' ou 'block'" });
      }

      let updateData: any = {};
      
      if (action === 'activate') {
        // Liberar empresa: ativar e definir status como ativo
        updateData = {
          isActive: 1,
          planStatus: 'active',
          subscriptionStatus: 'active'
        };
        console.log(`Admin liberando empresa ${id}`);
      } else if (action === 'block') {
        // Bloquear empresa: desativar e definir status como bloqueado
        updateData = {
          isActive: 0,
          planStatus: 'suspended',
          subscriptionStatus: 'blocked'
        };
        console.log(`Admin bloqueando empresa ${id}`);
      }

      // Atualizar no banco usando query direta para garantir que funcione
      await pool.execute(`
        UPDATE companies 
        SET is_active = ?, plan_status = ?, subscription_status = ?
        WHERE id = ?
      `, [updateData.isActive, updateData.planStatus, updateData.subscriptionStatus, id]);

      // Buscar empresa atualizada
      const company = await storage.getCompany(id);
      
      res.json({ 
        message: action === 'activate' ? 'Empresa liberada com sucesso' : 'Empresa bloqueada com sucesso',
        company 
      });
    } catch (error) {
      console.error("Error updating company status:", error);
      res.status(500).json({ message: "Falha ao atualizar status da empresa" });
    }
  });

  // Plan routes (public endpoint for subscription selection)
  app.get('/api/plans', async (req, res) => {
    try {
      const plans = await storage.getPlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Falha ao buscar planos" });
    }
  });

  app.get('/api/plans/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const plan = await storage.getPlan(id);
      
      if (!plan) {
        return res.status(404).json({ message: "Plano não encontrado" });
      }
      
      res.json(plan);
    } catch (error) {
      console.error("Error fetching plan:", error);
      res.status(500).json({ message: "Falha ao buscar plano" });
    }
  });

  app.post('/api/plans', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertPlanSchema.parse(req.body);
      const plan = await storage.createPlan(validatedData);
      res.status(201).json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Error creating plan:", error);
      res.status(500).json({ message: "Falha ao criar plano" });
    }
  });

  app.put('/api/plans/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertPlanSchema.partial().parse(req.body);
      const plan = await storage.updatePlan(id, validatedData);
      res.json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Error updating plan:", error);
      res.status(500).json({ message: "Falha ao atualizar plano" });
    }
  });

  app.delete('/api/plans/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePlan(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting plan:", error);
      res.status(500).json({ message: "Falha ao excluir plano" });
    }
  });

  // Public settings route for login page (without authentication)
  app.get('/api/public-settings', async (req, res) => {
    try {
      const settings = await storage.getGlobalSettings();
      // Return public settings needed for login page including colors and custom HTML
      res.json({
        logoUrl: settings?.logoUrl || null,
        systemName: settings?.systemName || null,
        faviconUrl: settings?.faviconUrl || null,
        primaryColor: settings?.primaryColor || null,
        secondaryColor: settings?.secondaryColor || null,
        backgroundColor: settings?.backgroundColor || null,
        textColor: settings?.textColor || null,
        customHtml: settings?.customHtml || null
      });
    } catch (error) {
      console.error("Error fetching public settings:", error);
      res.status(500).json({ message: "Falha ao buscar configurações públicas" });
    }
  });

  // Public plans endpoint for subscription page
  app.get('/api/public-plans', async (req, res) => {
    try {
      // Primeiro, verifica se existem planos na tabela
      const [result] = await db.execute(sql`
        SELECT id, name, price, annual_price, free_days, permissions, max_professionals, is_active
        FROM plans
        WHERE is_active = 1
        ORDER BY price ASC
        LIMIT 5
      `);
      
      let plans = Array.isArray(result) ? result : (result ? [result] : []);
      
      // Se não houver planos, cria planos padrão
      if (plans.length === 0 || (plans.length === 1 && !plans[0])) {
        console.log('Nenhum plano encontrado, criando planos padrão...');
        
        // Define as permissões padrão
        const defaultPermissions = {
          dashboard: true,
          appointments: true,
          services: true,
          professionals: true,
          clients: true,
          reviews: true,
          tasks: true,
          pointsProgram: true,
          loyalty: true,
          inventory: true,
          messages: true,
          coupons: true,
          financial: true,
          reports: true,
          settings: true,
        };
        const permissionsJson = JSON.stringify(defaultPermissions);

        // Insere planos padrão no banco de dados com preços anuais
        await db.execute(sql`
          INSERT INTO plans (name, price, annual_price, free_days, permissions, max_professionals, is_active)
          VALUES 
            ('Básico', 49.90, 479.00, 7, ${permissionsJson}, 1, true),
            ('Profissional', 89.90, 862.00, 15, ${permissionsJson}, 5, true),
            ('Premium', 149.90, 1439.00, 30, ${permissionsJson}, 15, true)
        `);
        
        // Busca os planos recém-criados
        const [newResult] = await db.execute(sql`SELECT * FROM plans WHERE is_active = 1`);
        plans = Array.isArray(newResult) ? newResult : (newResult ? [newResult] : []);
        
        console.log('Planos padrão criados:', plans);
      }
      
      // Mapeia os planos para o formato de resposta
      const processedPlans = plans.map((plan: any) => {
        let permissions = {};
        try {
          if (typeof plan.permissions === 'string') {
            permissions = JSON.parse(plan.permissions);
          } else if (typeof plan.permissions === 'object' && plan.permissions !== null) {
            permissions = plan.permissions;
          }
        } catch (e) {
          console.error(`Erro ao fazer parse das permissões do plano ${plan.id}:`, e);
        }

        return {
          id: plan.id,
          name: plan.name,
          price: plan.price,
          annualPrice: plan.annual_price,
          maxProfessionals: plan.max_professionals || 1,
          freeDays: plan.free_days,
          description: `Plano ${plan.name} - Ideal para seu negócio`,
          features: [
            "Agendamentos ilimitados",
            "Gestão de clientes",
            "Relatórios básicos",
            "Suporte por email",
            "Backup automático"
          ],
          popular: plan.name.toLowerCase().includes('profissional'),
          permissions: permissions
        };
      });

      res.json(processedPlans);
    } catch (error) {
      console.error("Erro ao buscar planos públicos:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Create subscription endpoint with annual billing support
  app.post('/api/create-subscription', validateBody(createSubscriptionSchema), async (req, res) => {
    try {
      const { planId, isAnnual, installments } = req.body;

      // Get plan details
      const [planResult] = await db.execute(sql`
        SELECT * FROM plans WHERE id = ${planId} AND is_active = 1
      `);
      
      const plans = Array.isArray(planResult) ? planResult : [planResult];
      const plan = plans[0];

      if (!plan) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }

      // Calculate price based on billing period
      let priceToUse = parseFloat(plan.price);
      if (isAnnual && plan.annual_price) {
        priceToUse = parseFloat(plan.annual_price);
      }

      // For completely free plans (price = 0), return success without payment
      if (priceToUse === 0) {
        return res.json({
          success: true,
          message: 'Plano gratuito ativado com sucesso',
          planName: plan.name,
          billingPeriod: isAnnual ? 'annual' : 'monthly'
        });
      }

      // TODO: Integrar com Asaas para pagamentos
      res.json({
        message: 'Integração de pagamento em desenvolvimento (Asaas)',
        planName: plan.name,
        amount: priceToUse,
        billingPeriod: isAnnual ? 'annual' : 'monthly',
        freeDays: plan.free_days || 0
      });

    } catch (error) {
      console.error('Error creating subscription:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Admin plans endpoint for authenticated companies
  app.get('/api/admin-plans', async (req, res) => {
    try {
      const plans = await storage.getPlans();
      const activePlans = plans.filter(plan => plan.isActive);
      res.json(activePlans);
    } catch (error) {
      console.error("Error fetching admin plans:", error);
      res.status(500).json({ message: "Erro ao buscar planos" });
    }
  });

  // Global settings routes
  app.get('/api/settings', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getGlobalSettings();
      if (settings) {
        // Remove sensitive keys from response - return only boolean flags
        const { uazapiAdminToken, openaiApiKey, ...safeSettings } = settings as any;
        res.json({
          ...safeSettings,
          hasUazapiAdminToken: !!uazapiAdminToken,
          hasOpenaiApiKey: !!openaiApiKey,
        });
      } else {
        res.json(settings);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ message: "Falha ao buscar configurações" });
    }
  });

  app.put('/api/settings', isAuthenticated, async (req, res) => {
    try {
      const validatedData = insertGlobalSettingsSchema.partial().parse(req.body);
      const settings = await storage.updateGlobalSettings(validatedData);

      // Clear meta tags cache when settings are updated
      clearMetaTagsCache();

      // Remove sensitive keys from response
      const { uazapiAdminToken, openaiApiKey, ...safeSettings } = settings as any;
      res.json({
        ...safeSettings,
        hasUazapiAdminToken: !!uazapiAdminToken,
        hasOpenaiApiKey: !!openaiApiKey,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation errors:", error.errors);
        return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
      }
      console.error("Error updating settings:", error);
      res.status(500).json({ message: "Falha ao atualizar configurações" });
    }
  });

  // OpenAI models endpoint
  app.get('/api/openai/models', isCompanyAuthenticated, async (req: any, res) => {
    try {
      // Get company from session
      const companyId = req.session.companyId;

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({
          message: "Empresa não encontrada.",
          models: []
        });
      }

      if (!company.openaiApiKey) {
        return res.status(400).json({
          message: "Chave da API OpenAI não configurada. Configure nas configurações da empresa.",
          models: []
        });
      }

      const openaiResponse = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${company.openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!openaiResponse.ok) {
        return res.status(openaiResponse.status).json({ 
          message: `Erro da OpenAI API: ${openaiResponse.statusText}`,
          models: []
        });
      }

      const modelsData = await openaiResponse.json();

      console.log('📊 Total models from OpenAI API:', modelsData.data.length);
      console.log('📋 Sample of raw model IDs:', modelsData.data.slice(0, 10).map((m: any) => m.id));

      // Filter for chat completion models and sort by relevance
      const chatModels = modelsData.data
        .filter((model: any) => {
          const id = model.id.toLowerCase();
          return (
            id.includes('gpt') ||
            id.includes('o1') ||
            id.includes('chatgpt') ||
            id.includes('text-davinci')
          ) && !id.includes('embedding') && !id.includes('whisper') && !id.includes('dall-e');
        })
        .map((model: any) => {
          // Create friendly name based on model ID
          const id = model.id;
          let friendlyName = id;

          // Check for specific models (order matters - check more specific first)
          // GPT-4.1 series (newest)
          if (id.startsWith('gpt-4.1-nano')) {
            friendlyName = 'GPT-4.1 Nano (Econômico)';
          } else if (id.startsWith('gpt-4.1-mini')) {
            friendlyName = 'GPT-4.1 Mini (Balanceado)';
          } else if (id.startsWith('gpt-4.1')) {
            friendlyName = 'GPT-4.1 (Mais Avançado)';
          }
          // GPT-4o series
          else if (id.startsWith('gpt-4o-mini')) {
            friendlyName = 'GPT-4o Mini (Rápido e Econômico)';
          } else if (id.startsWith('gpt-4o')) {
            friendlyName = 'GPT-4o (Mais Inteligente)';
          }
          // GPT-4 Turbo series
          else if (id.startsWith('gpt-4-turbo-preview')) {
            friendlyName = 'GPT-4 Turbo Preview';
          } else if (id.startsWith('gpt-4-turbo')) {
            friendlyName = 'GPT-4 Turbo';
          } else if (id.startsWith('gpt-4-32k')) {
            friendlyName = 'GPT-4 32K';
          } else if (id.startsWith('gpt-4-0613')) {
            friendlyName = 'GPT-4 (06/13)';
          } else if (id.startsWith('gpt-4')) {
            friendlyName = 'GPT-4';
          } else if (id.startsWith('gpt-3.5-turbo-16k')) {
            friendlyName = 'GPT-3.5 Turbo 16K';
          } else if (id.startsWith('gpt-3.5-turbo-0125')) {
            friendlyName = 'GPT-3.5 Turbo (01/25)';
          } else if (id.startsWith('gpt-3.5-turbo-1106')) {
            friendlyName = 'GPT-3.5 Turbo (11/06)';
          } else if (id.startsWith('gpt-3.5-turbo')) {
            friendlyName = 'GPT-3.5 Turbo (Econômico)';
          } else if (id.startsWith('o1-preview')) {
            friendlyName = 'O1 Preview (Reasoning)';
          } else if (id.startsWith('o1-mini')) {
            friendlyName = 'O1 Mini (Reasoning)';
          } else if (id.startsWith('chatgpt-4o-latest')) {
            friendlyName = 'ChatGPT-4o Latest';
          }

          // Add version/date suffix if present and not already in friendly name
          const versionMatch = id.match(/-(\d{4}-\d{2}-\d{2})$/);
          if (versionMatch && !friendlyName.includes(versionMatch[1])) {
            friendlyName += ` (${versionMatch[1]})`;
          }

          return {
            id: model.id,
            name: friendlyName,
            created: model.created
          };
        })
        .sort((a: any, b: any) => {
          // Sort by model priority and recency
          const priority = (id: string) => {
            if (id.includes('gpt-4.1')) return 1;   // GPT-4.1 is newest
            if (id.includes('gpt-4o')) return 2;    // GPT-4o is second
            if (id.includes('o1')) return 3;        // O1 series
            if (id.includes('chatgpt-4o')) return 4;
            if (id.includes('gpt-4')) return 5;     // GPT-4 and variants
            if (id.includes('gpt-3.5')) return 6;   // GPT-3.5
            return 7;
          };
          const priorityDiff = priority(a.id) - priority(b.id);
          if (priorityDiff !== 0) return priorityDiff;
          return b.created - a.created; // Newer models first within same priority
        });

      console.log('✅ Filtered chat models:', chatModels.length);
      console.log('📝 First 10 models:', chatModels.slice(0, 10).map((m: any) => `${m.id} -> ${m.name}`));

      res.json({
        models: chatModels,
        message: `${chatModels.length} modelos encontrados`
      });
    } catch (error: any) {
      console.error("Error fetching OpenAI models:", error);
      res.status(500).json({ 
        message: `Erro ao buscar modelos: ${error.message}`,
        models: []
      });
    }
  });

  // OpenAI usage endpoint
  app.get('/api/openai/usage', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getGlobalSettings();
      
      if (!settings?.openaiApiKey) {
        return res.json({
          isValid: false,
          error: "Chave da API OpenAI não configurada",
          totalTokens: 0,
          totalCost: 0,
          requests: 0,
          period: "N/A"
        });
      }

      // Since OpenAI doesn't provide official billing API, we'll create a local tracking system
      // This simulates usage tracking that would typically be stored in database
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const endOfMonth = new Date(startOfMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      endOfMonth.setDate(0);
      endOfMonth.setHours(23, 59, 59, 999);

      // Test OpenAI API key validity with a minimal request
      try {
        const testResponse = await fetch('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${settings.openaiApiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!testResponse.ok) {
          return res.json({
            isValid: false,
            error: `Chave API inválida: ${testResponse.statusText}`,
            totalTokens: 0,
            totalCost: 0,
            requests: 0,
            period: "N/A"
          });
        }

        // TODO: Implement local usage tracking in database
        // For now, return simulated data to show the interface
        const currentMonth = new Date().toLocaleDateString('pt-BR', { 
          month: 'long', 
          year: 'numeric' 
        });

        // Estimate based on typical usage patterns
        const estimatedTokens = 45000; // Example: average monthly tokens
        const estimatedCost = estimatedTokens * 0.000002; // Rough estimate for GPT-4o
        const estimatedRequests = 150; // Example: average monthly requests

        res.json({
          isValid: true,
          totalTokens: estimatedTokens,
          totalCost: estimatedCost,
          requests: estimatedRequests,
          period: currentMonth,
          note: "Dados estimados - implemente rastreamento local para dados precisos"
        });

      } catch (error: any) {
        console.error("Error testing OpenAI API:", error);
        res.json({
          isValid: false,
          error: `Erro ao conectar com OpenAI: ${error.message}`,
          totalTokens: 0,
          totalCost: 0,
          requests: 0,
          period: "N/A"
        });
      }

    } catch (error: any) {
      console.error("Error fetching OpenAI usage:", error);
      res.status(500).json({
        isValid: false,
        error: `Erro interno: ${error.message}`,
        totalTokens: 0,
        totalCost: 0,
        requests: 0,
        period: "N/A"
      });
    }
  });

  // Logo upload endpoint
  app.post('/api/upload/logo', isAuthenticated, logoUpload.single('logo'), validateUploadContent(IMAGE_MIMES), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado" });
      }

      // Generate the URL for the uploaded file
      const host = req.get('host');
      const protocol = req.protocol;
      const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      res.json({ 
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      console.error("Error uploading logo:", error);
      res.status(500).json({ message: "Erro ao fazer upload do logo" });
    }
  });

  // Company logo upload endpoint
  app.post('/api/company/upload/logo', isCompanyAuthenticated, logoUpload.single('logo'), validateUploadContent(IMAGE_MIMES), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado" });
      }

      const host = req.get('host');
      const protocol = req.protocol;
      const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      res.json({
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      console.error("Error uploading company logo:", error);
      res.status(500).json({ message: "Erro ao fazer upload do logo" });
    }
  });

  // Favicon upload endpoint
  app.post('/api/upload/favicon', isAuthenticated, logoUpload.single('favicon'), validateUploadContent(IMAGE_MIMES), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado" });
      }

      // Generate the URL for the uploaded file
      const host = req.get('host');
      const protocol = req.protocol;
      const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      res.json({
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      console.error("Error uploading favicon:", error);
      res.status(500).json({ message: "Erro ao fazer upload do favicon" });
    }
  });

  // Course file upload endpoint (images and PDFs)
  app.post('/api/upload/course-file', isCompanyAuthenticated, courseFilesUpload.single('file'), validateUploadContent(COURSE_FILE_MIMES), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado" });
      }

      // Generate the URL for the uploaded file
      const host = req.get('host');
      const protocol = req.protocol;
      const fileUrl = `${protocol}://${host}/uploads/courses/${req.file.filename}`;

      res.json({
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      });
    } catch (error) {
      console.error("Error uploading course file:", error);
      res.status(500).json({ message: "Erro ao fazer upload do arquivo" });
    }
  });

  // Admin authentication routes
  app.post('/api/auth/login', loginLimiter, validateBody(adminLoginSchema), async (req: any, res) => {
    try {
      const { username, password } = req.body;

      // Check admin credentials from database
      const admin = await storage.getAdminByUsername(username);
      if (!admin) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      // Verify password with bcrypt
      const isValidPassword = await bcrypt.compare(password, admin.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      // Check if admin is active
      if (!admin.isActive) {
        return res.status(401).json({ message: "Usuário inativo" });
      }

      // Regenerate session to prevent session fixation attacks
      const adminToReturn = admin;
      req.session.regenerate((err: any) => {
        if (err) {
          console.error("Error regenerating session:", err);
          return res.status(500).json({ message: "Erro interno do servidor" });
        }
        req.session.adminId = adminToReturn.id;
        req.session.adminUsername = adminToReturn.username;

        const { password: _, ...adminData } = adminToReturn;
        res.json({ message: "Login realizado com sucesso", admin: adminData });
      });
    } catch (error) {
      console.error("Error during admin login:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.get('/api/auth/user', async (req: any, res) => {
    try {
      const adminId = req.session.adminId;
      if (!adminId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const admin = await storage.getAdmin(adminId);
      if (!admin) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { password: _, ...adminData } = admin;
      res.json(adminData);
    } catch (error) {
      console.error("Error fetching admin user:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.post('/api/auth/logout', async (req: any, res) => {
    try {
      console.log('🚪 Admin logout requested');
      req.session.destroy((err: any) => {
        if (err) {
          console.error("🚪 Error destroying session:", err);
          return res.status(500).json({ message: "Erro ao fazer logout" });
        }
        console.log('🚪 Admin logout successful');
        res.clearCookie('connect.sid');
        res.json({ message: "Logout realizado com sucesso" });
      });
    } catch (error) {
      console.error("🚪 Error during admin logout:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Admin CRUD endpoints
  app.get('/api/admins', isAuthenticated, async (req, res) => {
    try {
      const admins = await storage.getAdmins();
      res.json(admins);
    } catch (error) {
      console.error("Error fetching admins:", error);
      res.status(500).json({ message: "Erro ao buscar administradores" });
    }
  });

  app.post('/api/admins', isAuthenticated, validateBody(createAdminSchema), async (req, res) => {
    try {
      const adminData = req.body;
      const newAdmin = await storage.createAdmin(adminData);
      res.status(201).json(newAdmin);
    } catch (error) {
      console.error("Error creating admin:", error);
      res.status(500).json({ message: "Erro ao criar administrador" });
    }
  });

  app.put('/api/admins/:id', isAuthenticated, async (req, res) => {
    try {
      const adminId = parseInt(req.params.id);
      const updateData = req.body;
      const updatedAdmin = await storage.updateAdmin(adminId, updateData);
      res.json(updatedAdmin);
    } catch (error) {
      console.error("Error updating admin:", error);
      res.status(500).json({ message: "Erro ao atualizar administrador" });
    }
  });

  app.delete('/api/admins/:id', isAuthenticated, async (req, res) => {
    try {
      const adminId = parseInt(req.params.id);
      await storage.deleteAdmin(adminId);
      res.json({ message: "Administrador removido com sucesso" });
    } catch (error) {
      console.error("Error deleting admin:", error);
      res.status(500).json({ message: "Erro ao remover administrador" });
    }
  });

  // REMOVIDO: endpoint /api/temp-reset-password (vulnerabilidade de segurança - reset sem autenticação)

  // Company forgot password route - sends recovery email
  app.post('/api/auth/forgot-password', forgotPasswordLimiter, validateBody(forgotPasswordSchema), async (req: any, res) => {
    try {
      const { email } = req.body;

      // Find company by email
      const company = await storage.getCompanyByEmail(email);

      // Always return success to prevent email enumeration attacks
      if (!company) {
        return res.json({ message: "Se o email estiver registrado, você receberá instruções para redefinir sua senha." });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

      // Save token to database
      await storage.updateCompany(company.id, {
        resetToken,
        resetTokenExpires
      });

      // Get SMTP settings
      const settings = await storage.getGlobalSettings();

      if (!settings?.smtpHost || !settings?.smtpUser || !settings?.smtpPassword) {
        console.error('SMTP not configured');
        return res.status(500).json({ message: "Serviço de email não configurado. Entre em contato com o suporte." });
      }

      // Create transporter
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: parseInt(settings.smtpPort || '587'),
        secure: settings.smtpSecure === 'ssl', // true for 465, false for other ports
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPassword,
        },
      });

      // Generate reset link
      const protocol = req.protocol;
      const host = req.get('host');
      const resetLink = `${protocol}://${host}/reset-password?token=${resetToken}`;

      // Send email
      await transporter.sendMail({
        from: `"${settings.smtpFromName || 'Sistema'}" <${settings.smtpFromEmail || settings.smtpUser}>`,
        to: email,
        subject: 'Recuperação de Senha',
        html: `
          <h2>Recuperação de Senha</h2>
          <p>Olá,</p>
          <p>Você solicitou a recuperação de senha para sua conta.</p>
          <p>Clique no link abaixo para redefinir sua senha:</p>
          <p><a href="${resetLink}" style="background-color: #4CAF50; color: white; padding: 14px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">Redefinir Senha</a></p>
          <p>Ou copie e cole este link no seu navegador:</p>
          <p>${resetLink}</p>
          <p>Este link expira em 1 hora.</p>
          <p>Se você não solicitou esta recuperação, ignore este email.</p>
          <br>
          <p>Atenciosamente,<br>Equipe de Suporte</p>
        `,
      });

      res.json({ message: "Se o email estiver registrado, você receberá instruções para redefinir sua senha." });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Erro ao enviar email de recuperação. Verifique as configurações SMTP." });
    }
  });

  // Company reset password route
  app.post('/api/auth/reset-password', loginLimiter, async (req: any, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({ message: "Token e nova senha são obrigatórios" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "A senha deve ter pelo menos 6 caracteres" });
      }

      const company = await storage.getCompanyByResetToken(token);
      
      if (!company || !company.resetTokenExpires || new Date() > new Date(company.resetTokenExpires)) {
        return res.status(400).json({ message: "Token inválido ou expirado" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update company password and clear reset token
      await storage.updateCompany(company.id, {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null
      });

      res.json({ message: "Senha redefinida com sucesso" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Company login route
  app.post('/api/auth/company-login', async (req: any, res) => {
    try {
      const { email, password } = req.body;
      console.log('Company login attempt:', { email, password: '***' });
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email e senha são obrigatórios" });
      }

      const company = await storage.getCompanyByEmail(email);
      
      if (!company) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      // Verificar status da assinatura ANTES da validação de senha
      if (!company.isActive || company.planStatus === 'suspended') {
        return res.status(402).json({ 
          message: "ASSINATURA SUSPENSA, ENTRE EM CONTATO COM O SUPORTE",
          blocked: true,
          reason: "subscription_suspended"
        });
      }

      const isValidPassword = await bcrypt.compare(password, company.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      // Regenerate session to prevent session fixation attacks
      const companyToReturn = company;
      req.session.regenerate((err: any) => {
        if (err) {
          console.error("Error regenerating session:", err);
          return res.status(500).json({ message: "Erro interno do servidor" });
        }
        req.session.companyId = companyToReturn.id;
        res.json({
          message: "Login realizado com sucesso",
          company: {
            id: companyToReturn.id,
            fantasyName: companyToReturn.fantasyName,
            email: companyToReturn.email
          }
        });
      });
    } catch (error) {
      console.error("Company login error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Admin Analytics endpoint
  app.get('/api/admin/analytics', isAuthenticated, async (req, res) => {
    try {
      const { company, month, year } = req.query;

      // Build date filter for appointments
      let dateFilter = sql``;
      if (month && year) {
        const monthNum = parseInt(month as string);
        const yearNum = parseInt(year as string);
        const monthStr = String(monthNum).padStart(2, '0');
        const startDate = `${yearNum}-${monthStr}-01`;
        const nextMonth = monthNum === 12 ? 1 : monthNum + 1;
        const nextYear = monthNum === 12 ? yearNum + 1 : yearNum;
        const nextMonthStr = String(nextMonth).padStart(2, '0');
        const endDate = `${nextYear}-${nextMonthStr}-01`;
        dateFilter = sql`AND a.appointment_date >= ${startDate} AND a.appointment_date < ${endDate}`;
      }

      // Top companies by appointments
      const topCompaniesResult = await db.execute(sql`
        SELECT
          c.id,
          c.fantasy_name as name,
          COUNT(a.id) as totalAppointments,
          COUNT(DISTINCT a.client_phone) as activeClients
        FROM companies c
        LEFT JOIN appointments a ON c.id = a.company_id ${dateFilter}
        ${company && company !== 'all' ? sql`WHERE c.id = ${company}` : sql``}
        GROUP BY c.id, c.fantasy_name
        ORDER BY totalAppointments DESC
        LIMIT 10
      `);

      // Top professionals by appointments
      const topProfessionalsResult = await db.execute(sql`
        SELECT
          p.id,
          p.name,
          c.fantasy_name as companyName,
          COUNT(a.id) as totalAppointments
        FROM professionals p
        JOIN companies c ON p.company_id = c.id
        LEFT JOIN appointments a ON p.id = a.professional_id ${dateFilter}
        ${company && company !== 'all' ? sql`WHERE c.id = ${company}` : sql``}
        GROUP BY p.id, p.name, c.fantasy_name
        HAVING totalAppointments > 0
        ORDER BY totalAppointments DESC
        LIMIT 10
      `);

      // Top clients by appointments
      const topClientsResult = await db.execute(sql`
        SELECT
          a.client_name as name,
          a.client_phone as phone,
          c.fantasy_name as companyName,
          COUNT(a.id) as totalAppointments
        FROM appointments a
        JOIN companies c ON a.company_id = c.id
        WHERE 1=1 ${dateFilter}
        ${company && company !== 'all' ? sql`AND a.company_id = ${company}` : sql``}
        GROUP BY a.client_name, a.client_phone, c.fantasy_name
        HAVING totalAppointments > 0
        ORDER BY totalAppointments DESC
        LIMIT 10
      `);

      console.log('Top clients result count:', Array.isArray(topClientsResult) ? topClientsResult.length : 'N/A');

      // Company details
      const companyDetailsResult = await db.execute(sql`
        SELECT
          c.id,
          c.fantasy_name as name,
          COUNT(DISTINCT a.id) as totalAppointments,
          COUNT(DISTINCT a.client_phone) as activeClients
        FROM companies c
        LEFT JOIN appointments a ON c.id = a.company_id ${dateFilter}
        ${company && company !== 'all' ? sql`WHERE c.id = ${company}` : sql``}
        GROUP BY c.id, c.fantasy_name
        ORDER BY totalAppointments DESC
      `);

      // Get top professional and client for ALL companies in 2 bulk queries (avoids N+1)
      const companyDetailsArray = Array.isArray(companyDetailsResult) ? companyDetailsResult : [companyDetailsResult];
      const validCompanyIds = (companyDetailsArray as any[]).filter(c => c && c.id).map(c => c.id);

      // Bulk query: top professional per company (single query for all companies)
      let topProfByCompany = new Map<number, any>();
      if (validCompanyIds.length > 0) {
        const topProfBulkResult = await pool.execute(`
          SELECT company_id, name, appointments FROM (
            SELECT p.company_id, p.name, COUNT(a.id) as appointments,
              ROW_NUMBER() OVER (PARTITION BY p.company_id ORDER BY COUNT(a.id) DESC) as rn
            FROM professionals p
            LEFT JOIN appointments a ON p.id = a.professional_id ${dateFilter ? `AND a.appointment_date >= ? AND a.appointment_date < ?` : ''}
            WHERE p.company_id IN (${validCompanyIds.map(() => '?').join(',')})
            GROUP BY p.company_id, p.id, p.name
          ) ranked WHERE rn = 1
        `, [...(month && year ? [
          `${parseInt(year as string)}-${String(parseInt(month as string)).padStart(2, '0')}-01`,
          `${parseInt(month as string) === 12 ? parseInt(year as string) + 1 : parseInt(year as string)}-${String(parseInt(month as string) === 12 ? 1 : parseInt(month as string) + 1).padStart(2, '0')}-01`
        ] : []), ...validCompanyIds]);
        const topProfRows = Array.isArray(topProfBulkResult[0]) ? topProfBulkResult[0] : [];
        for (const row of topProfRows as any[]) {
          topProfByCompany.set(row.company_id, { name: row.name, appointments: row.appointments });
        }
      }

      // Bulk query: top client per company (single query for all companies)
      let topClientByCompany = new Map<number, any>();
      if (validCompanyIds.length > 0) {
        const topClientBulkResult = await pool.execute(`
          SELECT company_id, name, appointments FROM (
            SELECT a.company_id, a.client_name as name, COUNT(a.id) as appointments,
              ROW_NUMBER() OVER (PARTITION BY a.company_id ORDER BY COUNT(a.id) DESC) as rn
            FROM appointments a
            WHERE a.company_id IN (${validCompanyIds.map(() => '?').join(',')})
            ${month && year ? `AND a.appointment_date >= ? AND a.appointment_date < ?` : ''}
            GROUP BY a.company_id, a.client_name, a.client_phone
          ) ranked WHERE rn = 1
        `, [...validCompanyIds, ...(month && year ? [
          `${parseInt(year as string)}-${String(parseInt(month as string)).padStart(2, '0')}-01`,
          `${parseInt(month as string) === 12 ? parseInt(year as string) + 1 : parseInt(year as string)}-${String(parseInt(month as string) === 12 ? 1 : parseInt(month as string) + 1).padStart(2, '0')}-01`
        ] : [])]);
        const topClientRows = Array.isArray(topClientBulkResult[0]) ? topClientBulkResult[0] : [];
        for (const row of topClientRows as any[]) {
          topClientByCompany.set(row.company_id, { name: row.name, appointments: row.appointments });
        }
      }

      // Assemble results (no N+1 — all data already fetched)
      const companiesWithDetails = (companyDetailsArray as any[])
        .filter(c => c && c.id)
        .map(companyDetail => ({
          ...companyDetail,
          topProfessional: topProfByCompany.get(companyDetail.id) || null,
          topClient: topClientByCompany.get(companyDetail.id) || null
        }));

      // Extract results from Drizzle's nested array format
      const topCompanies = Array.isArray(topCompaniesResult) && Array.isArray(topCompaniesResult[0]) 
        ? topCompaniesResult[0] 
        : topCompaniesResult;
      
      const topProfessionals = Array.isArray(topProfessionalsResult) && Array.isArray(topProfessionalsResult[0])
        ? topProfessionalsResult[0]
        : topProfessionalsResult;
        
      const topClients = Array.isArray(topClientsResult) && Array.isArray(topClientsResult[0])
        ? topClientsResult[0]
        : topClientsResult;

      res.json({
        topCompanies: Array.isArray(topCompanies) ? topCompanies : [topCompanies],
        topProfessionals: Array.isArray(topProfessionals) ? topProfessionals : [topProfessionals],
        topClients: Array.isArray(topClients) ? topClients : [topClients],
        companyDetails: companiesWithDetails
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  });

  // Admin Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req, res) => {
    try {
      // Todas as estatísticas do dashboard em uma única query
      const statsResult = await db.execute(sql`
        SELECT
          (SELECT COUNT(*) FROM companies) as totalCompanies,
          (SELECT COUNT(*) FROM plans) as totalPlans,
          (SELECT COUNT(*) FROM companies WHERE plan_status = 'active') as activeCompanies,
          (SELECT COALESCE(SUM(p.price), 0) FROM companies c JOIN plans p ON c.plan_id = p.id WHERE c.plan_status = 'active') as monthlyRevenue
      `);
      const stats = (statsResult as any)[0][0];
      const totalCompanies = stats?.totalCompanies || 0;
      const activePlans = stats?.totalPlans || 0;
      const activeCompanies = stats?.activeCompanies || 0;
      const monthlyRevenue = parseFloat(stats?.monthlyRevenue || '0');

      res.json({
        totalCompanies: Number(totalCompanies),
        activePlans: Number(activePlans),
        activeCompanies: Number(activeCompanies),
        monthlyRevenue: monthlyRevenue.toFixed(2),
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Falha ao buscar estatísticas" });
    }
  });

  // Admin - Listar assinaturas Asaas
  app.get('/api/admin/asaas/subscriptions', isAuthenticated, async (req, res) => {
    try {
      // Buscar todas as empresas com suas informações
      const companiesData = await db.select({
        id: companies.id,
        fantasyName: companies.fantasyName,
        email: companies.email,
        isActive: companies.isActive,
        planStatus: companies.planStatus,
        asaasCustomerId: companies.asaasCustomerId,
        asaasSubscriptionId: companies.asaasSubscriptionId,
        createdAt: companies.createdAt,
      }).from(companies);

      // Buscar detalhes das assinaturas no Asaas
      const subscriptionsData = await Promise.all(
        companiesData.map(async (company) => {
          try {
            let subscriptionDetails = null;

            // Se a empresa tem um ID de assinatura, buscar detalhes no Asaas
            if (company.asaasSubscriptionId) {
              try {
                subscriptionDetails = await asaasService.getSubscription(company.asaasSubscriptionId);
              } catch (error: any) {
                console.error(`Erro ao buscar assinatura ${company.asaasSubscriptionId}:`, error.message);
              }
            }

            return {
              companyId: company.id,
              companyName: company.fantasyName,
              companyEmail: company.email,
              companyStatus: company.isActive === 1 ? 'active' : 'inactive',
              planStatus: company.planStatus,
              asaasCustomerId: company.asaasCustomerId,
              asaasSubscriptionId: company.asaasSubscriptionId,
              asaasStatus: subscriptionDetails?.status || null,
              value: subscriptionDetails?.value || null,
              nextDueDate: subscriptionDetails?.nextDueDate || null,
              cycle: subscriptionDetails?.cycle || null,
              billingType: subscriptionDetails?.billingType || null,
              description: subscriptionDetails?.description || null,
              deleted: subscriptionDetails?.deleted || false,
              createdAt: company.createdAt,
              error: subscriptionDetails ? null : (company.asaasSubscriptionId ? 'Assinatura não encontrada no Asaas' : 'Sem assinatura'),
            };
          } catch (error: any) {
            console.error(`Erro ao processar empresa ${company.id}:`, error.message);
            return {
              companyId: company.id,
              companyName: company.fantasyName,
              companyEmail: company.email,
              companyStatus: company.isActive === 1 ? 'active' : 'inactive',
              planStatus: company.planStatus,
              asaasCustomerId: company.asaasCustomerId,
              asaasSubscriptionId: company.asaasSubscriptionId,
              asaasStatus: null,
              error: error.message,
              createdAt: company.createdAt,
            };
          }
        })
      );

      res.json(subscriptionsData);
    } catch (error: any) {
      console.error("Error fetching Asaas subscriptions:", error);
      res.status(500).json({ message: "Erro ao buscar assinaturas", error: error.message });
    }
  });

  // Company Auth routes
  app.post('/api/company/auth/login', loginLimiter, validateBody(companyLoginSchema), async (req: any, res) => {
    try {
      const { email, password } = req.body;

      const company = await storage.getCompanyByEmail(email);
      if (!company) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      const isValidPassword = await bcrypt.compare(password, company.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Credenciais inválidas" });
      }

      // Verificar se o plano foi cancelado - redirecionar para página de planos
      if (company.subscriptionStatus === 'cancelled' || company.subscriptionStatus === 'canceled' ||
          company.planStatus === 'cancelled' || company.planStatus === 'canceled') {
        console.log('Company subscription/plan cancelled - redirecting to plans page');
        return res.status(403).json({
          message: "Assinatura Cancelada",
          redirectTo: "/company/assinatura",
          reason: "subscription_cancelled",
          details: "Sua assinatura foi cancelada. Por favor, escolha um novo plano para continuar."
        });
      }

      // Verificar status da empresa antes de permitir o login
      // isActive pode ser 0/1 (int) ou false/true (boolean)
      const isActiveValue = company.isActive === 1 || company.isActive === true;
      console.log('Company active status:', { isActive: company.isActive, isActiveValue, planStatus: company.planStatus });

      // Bloquear apenas se a empresa estiver explicitamente inativa E suspensa
      // Permitir login se empresa está ativa OU se não está suspensa
      if (!isActiveValue && company.planStatus === 'suspended') {
        console.log('Company access blocked - inactive AND suspended');
        return res.status(402).json({
          message: "Acesso Bloqueado - Conta Suspensa",
          blocked: true,
          reason: "account_suspended",
          details: "Sua conta foi suspensa. Entre em contato com o suporte para reativar."
        });
      }

      // Se empresa está inativa mas não suspensa, permitir login (pode estar em período de teste)
      if (!isActiveValue && company.planStatus !== 'suspended') {
        console.log('Company inactive but not suspended - allowing login (trial period)');
      }

      // Regenerate session to prevent session fixation attacks
      const companyToReturn = company;
      req.session.regenerate((err: any) => {
        if (err) {
          console.error("Error regenerating session:", err);
          return res.status(500).json({ message: "Erro interno do servidor" });
        }
        req.session.companyId = companyToReturn.id;
        res.json({
          message: "Login realizado com sucesso",
          company: {
            id: companyToReturn.id,
            fantasyName: companyToReturn.fantasyName,
            email: companyToReturn.email
          }
        });
      });
    } catch (error) {
      console.error("Company login error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Payment alerts endpoints
  app.get('/api/company/payment-alerts', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const alerts = await getCompanyPaymentAlerts(companyId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching payment alerts:", error);
      res.status(500).json({ message: "Erro ao buscar alertas de pagamento" });
    }
  });

  app.post('/api/company/payment-alerts/:id/mark-shown', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const alertId = parseInt(req.params.id);
      await markAlertAsShown(alertId);
      res.json({ message: "Alerta marcado como visualizado" });
    } catch (error) {
      console.error("Error marking alert as shown:", error);
      res.status(500).json({ message: "Erro ao marcar alerta como visualizado" });
    }
  });

  // Endpoint to reactivate blocked company (admin use)
  app.post('/api/admin/company/:id/reactivate', isAuthenticated, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      
      // Reativar empresa e definir novo período de trial
      const newTrialDate = new Date();
      newTrialDate.setDate(newTrialDate.getDate() + 30); // 30 dias de trial
      
      await pool.execute(`
        UPDATE companies 
        SET subscription_status = 'active', 
            is_active = 1,
            trial_expires_at = ?
        WHERE id = ?
      `, [newTrialDate, companyId]);
      
      res.json({ 
        message: 'Empresa reativada com sucesso',
        newTrialExpiresAt: newTrialDate
      });
    } catch (error) {
      console.error("Error reactivating company:", error);
      res.status(500).json({ message: "Erro ao reativar empresa" });
    }
  });

  // Fix company status endpoint (temporary)
  app.post('/api/company/fix-status', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      
      // Reativar empresa e definir novo período de trial
      const newTrialDate = new Date();
      newTrialDate.setDate(newTrialDate.getDate() + 30); // 30 dias de trial
      
      await pool.execute(`
        UPDATE companies 
        SET subscription_status = 'active', 
            is_active = 1,
            trial_expires_at = ?
        WHERE id = ?
      `, [newTrialDate, companyId]);
      
      res.json({ 
        message: 'Status da empresa corrigido com sucesso',
        newTrialExpiresAt: newTrialDate
      });
    } catch (error) {
      console.error("Error fixing company status:", error);
      res.status(500).json({ message: "Erro ao corrigir status da empresa" });
    }
  });

  // Trial information endpoint
  app.get('/api/company/trial-info', isCompanyAuthenticated, checkSubscriptionStatus, async (req: any, res) => {
    try {
      const trialInfo = (req as any).trialInfo;
      res.json(trialInfo || {});
    } catch (error) {
      console.error("Error fetching trial info:", error);
      res.status(500).json({ message: "Erro ao buscar informações do período de teste" });
    }
  });

  app.get('/api/company/auth/profile', isCompanyAuthenticated, checkSubscriptionStatus, async (req: any, res) => {
    try {
      console.log('🔍 Profile endpoint - Session ID:', req.sessionID);
      console.log('🔍 Profile endpoint - Company ID from session:', req.session.companyId);
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      // Add AI agent prompt column if it doesn't exist
      try {
        await db.execute(`
          ALTER TABLE companies
          ADD COLUMN ai_agent_prompt TEXT NULL
        `);
        console.log('AI agent prompt column added successfully');
      } catch (dbError: any) {
        if (dbError.code !== 'ER_DUP_FIELDNAME') {
          console.log('AI agent prompt column may already exist:', dbError.code);
        }
      }

      // Get company info
      const companyResult = await db.execute(sql`
        SELECT id, fantasy_name, document, address, google_maps_location, courses_description, courses_images, courses_pdfs, phone, zip_code, number, neighborhood, city, state, email, password, plan_id, plan_status, is_active, ai_agent_prompt, agent_inactivity_timeout, auto_select_professional, openai_api_key, openai_model, openai_temperature, openai_max_tokens, human_request_enabled, human_request_contact, human_request_message, human_request_keywords, human_request_timeout, course_notification_enabled, course_notification_contact, course_notification_message, course_notification_keywords, course_notification_timeout, ignored_numbers, birthday_message, reset_token, reset_token_expires, tour_enabled, trial_expires_at, trial_alert_shown, subscription_status, n8n_webhook_url, n8n_webhook_enabled, asaas_api_key, asaas_environment, asaas_enabled, financial_password_enabled, logo_url, primary_color, created_at, updated_at
        FROM companies WHERE id = ${companyId}
      `);

      // MySQL2 returns [rows, fields] array, we need the first element which contains the rows
      const rows = Array.isArray(companyResult[0]) ? companyResult[0] : companyResult;
      const company = rows[0];

      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada" });
      }

      // Map database fields to camelCase for frontend
      const companyData = {
        id: company.id,
        fantasyName: company.fantasy_name,
        document: company.document,
        address: company.address,
        googleMapsLocation: company.google_maps_location,
        coursesDescription: company.courses_description,
        coursesImages: company.courses_images,
        coursesPdfs: company.courses_pdfs,
        phone: company.phone,
        zipCode: company.zip_code,
        number: company.number,
        neighborhood: company.neighborhood,
        city: company.city,
        state: company.state,
        email: company.email,
        planId: company.plan_id,
        planStatus: company.plan_status,
        isActive: company.is_active,
        aiAgentPrompt: company.ai_agent_prompt,
        agentInactivityTimeout: company.agent_inactivity_timeout,
        autoSelectProfessional: company.auto_select_professional === 1,
        hasOpenaiApiKey: !!company.openai_api_key,
        openaiModel: company.openai_model,
        openaiTemperature: company.openai_temperature ? parseFloat(company.openai_temperature) : 0.7,
        openaiMaxTokens: company.openai_max_tokens,
        humanRequestEnabled: company.human_request_enabled === 1,
        humanRequestContact: company.human_request_contact,
        humanRequestMessage: company.human_request_message,
        humanRequestKeywords: company.human_request_keywords,
        humanRequestTimeout: company.human_request_timeout,
        courseNotificationEnabled: company.course_notification_enabled === 1,
        courseNotificationContact: company.course_notification_contact,
        courseNotificationMessage: company.course_notification_message,
        courseNotificationKeywords: company.course_notification_keywords,
        courseNotificationTimeout: company.course_notification_timeout ?? 30,
        ignoredNumbers: company.ignored_numbers,
        birthdayMessage: company.birthday_message,
        // resetToken e resetTokenExpires removidos por segurança - nunca expor ao frontend
        tourEnabled: company.tour_enabled,
        trialExpiresAt: company.trial_expires_at,
        trialAlertShown: company.trial_alert_shown,
        subscriptionStatus: company.subscription_status,
        n8nWebhookUrl: company.n8n_webhook_url,
        n8nWebhookEnabled: company.n8n_webhook_enabled,
        hasAsaasApiKey: !!company.asaas_api_key,
        asaasEnvironment: company.asaas_environment,
        asaasEnabled: company.asaas_enabled === 1,
        financialPasswordEnabled: company.financial_password_enabled === 1,
        logoUrl: company.logo_url,
        primaryColor: company.primary_color,
        createdAt: company.created_at,
        updatedAt: company.updated_at
      };

      console.log('🔍 Profile response - aiAgentPrompt:', companyData.aiAgentPrompt?.substring(0, 50));
      console.log('🔍 Profile response - googleMapsLocation:', companyData.googleMapsLocation);
      console.log('🔍 Profile response - coursesDescription:', companyData.coursesDescription?.substring(0, 50));
      console.log('🔍 Profile response - coursesImages:', companyData.coursesImages);
      console.log('🔍 Profile response - coursesPdfs:', companyData.coursesPdfs);
      res.json(companyData);
    } catch (error) {
      console.error("Error fetching company profile:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.get('/api/company/auth/logout', async (req: any, res) => {
    try {
      req.session.destroy((err: any) => {
        if (err) {
          console.error("Session destroy error:", err);
          return res.status(500).json({ message: "Erro ao fazer logout" });
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
      });
    } catch (error) {
      console.error("Company logout error:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.put('/api/company/profile', isCompanyAuthenticated, checkSubscriptionStatus, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      console.log('🔧 [PROFILE] Update request - CompanyId:', companyId);

      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { fantasyName, document, email, address, phone, zipCode, googleMapsLocation, coursesDescription, coursesImages, coursesPdfs } = req.body;
      console.log('🔧 [PROFILE] Received data:', { fantasyName, document, email, address, phone, zipCode, googleMapsLocation, coursesDescription, coursesImages, coursesPdfs });

      if (!fantasyName || !address) {
        return res.status(400).json({ message: "Nome fantasia e endereço são obrigatórios" });
      }

      const updateData: any = {
        fantasyName,
        address,
      };

      // Add basic profile fields if provided
      if (document !== undefined) {
        updateData.document = document;
        console.log('🔧 [PROFILE] Adding document to updateData:', document);
      }
      if (email !== undefined) {
        updateData.email = email;
        console.log('🔧 [PROFILE] Adding email to updateData:', email);
      }
      if (phone !== undefined) {
        updateData.phone = phone;
        console.log('🔧 [PROFILE] Adding phone to updateData:', phone);
      }
      if (zipCode !== undefined) {
        updateData.zipCode = zipCode;
        console.log('🔧 [PROFILE] Adding zipCode to updateData:', zipCode);
      }

      // Add googleMapsLocation if provided
      if (googleMapsLocation !== undefined) {
        updateData.googleMapsLocation = googleMapsLocation;
        console.log('🔧 [PROFILE] Adding googleMapsLocation to updateData:', googleMapsLocation);
      }

      // Add courses fields if provided
      if (coursesDescription !== undefined) {
        updateData.coursesDescription = coursesDescription;
        console.log('🔧 [PROFILE] Adding coursesDescription to updateData');
      }
      if (coursesImages !== undefined) {
        updateData.coursesImages = coursesImages;
        console.log('🔧 [PROFILE] Adding coursesImages to updateData');
      }
      if (coursesPdfs !== undefined) {
        updateData.coursesPdfs = coursesPdfs;
        console.log('🔧 [PROFILE] Adding coursesPdfs to updateData');
      }

      console.log('🔧 [PROFILE] Update data to be saved:', updateData);
      const company = await storage.updateCompany(companyId, updateData);
      console.log('🔧 [PROFILE] Updated company googleMapsLocation:', company.googleMapsLocation);
      console.log('🔧 [PROFILE] Updated company courses fields:', {
        coursesDescription: company.coursesDescription,
        coursesImages: company.coursesImages,
        coursesPdfs: company.coursesPdfs
      });

      // Remove password from response
      const { password, ...companyData } = company;
      res.json(companyData);
    } catch (error) {
      console.error("Error updating company profile:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  app.put('/api/company/password', validateBody(changePasswordSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { currentPassword, newPassword } = req.body;

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada" });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, company.password);
      if (!isValidPassword) {
        return res.status(400).json({ message: "Senha atual incorreta" });
      }

      const hashedNewPassword = await bcrypt.hash(newPassword, 12);
      await storage.updateCompany(companyId, {
        password: hashedNewPassword,
      });

      res.json({ message: "Senha alterada com sucesso" });
    } catch (error) {
      console.error("Error updating company password:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Company N8N webhook configuration
  app.put('/api/company/n8n-webhook', isCompanyAuthenticated, validateBody(n8nWebhookSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { n8nWebhookUrl, n8nWebhookEnabled } = req.body;

      await storage.updateCompany(companyId, {
        n8nWebhookUrl: n8nWebhookUrl || null,
        n8nWebhookEnabled: n8nWebhookEnabled ?? false
      });

      res.json({ message: "Webhook N8N atualizado com sucesso" });
    } catch (error) {
      console.error("Error updating N8N webhook config:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Test N8N webhook endpoint
  app.post('/api/company/n8n-webhook/test', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const company = await storage.getCompanyById(companyId);

      if (!company?.n8nWebhookEnabled) {
        return res.status(400).json({ message: "Webhook N8N não está ativado" });
      }

      if (!company?.n8nWebhookUrl) {
        return res.status(400).json({ message: "URL do webhook N8N não configurada" });
      }

      // Create test payload
      const testPayload = {
        event: 'appointment.test',
        timestamp: new Date().toISOString(),
        message: 'Este é um teste de webhook do N8N',
        appointment: {
          id: 99999,
          clientName: 'Cliente Teste',
          clientPhone: '5511999999999',
          clientEmail: 'teste@exemplo.com',
          appointmentDate: new Date().toISOString().split('T')[0],
          appointmentTime: '14:00',
          status: 'confirmed',
          duration: 60,
          totalPrice: 100.00,
          notes: 'Este é um agendamento de teste'
        },
        service: {
          id: 1,
          name: 'Serviço de Teste',
          price: 100.00
        },
        professional: {
          id: 1,
          name: 'Profissional Teste'
        },
        company: {
          id: companyId,
          name: company.fantasyName
        }
      };

      console.log('🧪 Sending test webhook to:', company.n8nWebhookUrl);

      // Send test webhook
      const response = await fetch(company.n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      if (!response.ok) {
        console.error('⚠️ N8N webhook test failed:', response.status, response.statusText);
        return res.status(500).json({
          message: `Webhook retornou erro: ${response.status} ${response.statusText}`,
          status: response.status
        });
      }

      console.log('✅ Test webhook sent successfully');
      res.json({
        message: "Teste enviado com sucesso!",
        status: response.status,
        payload: testPayload
      });
    } catch (error: any) {
      console.error("Error testing N8N webhook:", error);
      res.status(500).json({
        message: "Erro ao enviar teste: " + error.message
      });
    }
  });

  // Company AI agent configuration
  app.put('/api/company/ai-agent', validateBody(aiAgentSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;

      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { aiAgentPrompt, agentInactivityTimeout, autoSelectProfessional, openaiApiKey, openaiModel, openaiTemperature, openaiMaxTokens } = req.body;

      // Se a key não foi enviada, verificar se já existe no banco
      if (!openaiApiKey || openaiApiKey.trim().length === 0) {
        const existingCompany = await storage.getCompanyById(companyId);
        if (!existingCompany?.openaiApiKey) {
          return res.status(400).json({ message: "Chave da API OpenAI é obrigatória" });
        }
      }

      // Build update object
      const updateData: any = {
        aiAgentPrompt: aiAgentPrompt.trim(),
        openaiModel: openaiModel || 'gpt-4o-mini',
        openaiTemperature: openaiTemperature !== undefined ? openaiTemperature : 0.7,
        openaiMaxTokens: openaiMaxTokens !== undefined ? openaiMaxTokens : 180,
      };

      // Só atualizar a API key se o usuário enviou uma nova
      if (openaiApiKey && openaiApiKey.trim().length > 0) {
        updateData.openaiApiKey = openaiApiKey.trim();
      }

      // Only add agentInactivityTimeout if provided
      if (agentInactivityTimeout !== undefined && agentInactivityTimeout !== null) {
        updateData.agentInactivityTimeout = agentInactivityTimeout;
      }

      // Only add autoSelectProfessional if provided
      if (autoSelectProfessional !== undefined && autoSelectProfessional !== null) {
        updateData.autoSelectProfessional = autoSelectProfessional ? 1 : 0;
      }

      const updatedCompany = await storage.updateCompany(companyId, updateData);

      console.log('🔧 [AI-AGENT] Updated company aiAgentPrompt:', updatedCompany.aiAgentPrompt?.substring(0, 100));
      console.log('🔧 [AI-AGENT] Updated company agentInactivityTimeout:', updatedCompany.agentInactivityTimeout);
      console.log('🔧 [AI-AGENT] Updated company autoSelectProfessional:', updatedCompany.autoSelectProfessional);

      res.json({
        message: "Configuração do agente IA atualizada com sucesso",
        aiAgentPrompt: updatedCompany.aiAgentPrompt,
        agentInactivityTimeout: updatedCompany.agentInactivityTimeout,
        autoSelectProfessional: updatedCompany.autoSelectProfessional === 1,
        hasOpenaiApiKey: !!updatedCompany.openaiApiKey,
        openaiModel: updatedCompany.openaiModel,
        openaiTemperature: updatedCompany.openaiTemperature ? parseFloat(updatedCompany.openaiTemperature.toString()) : 0.7,
        openaiMaxTokens: updatedCompany.openaiMaxTokens,
      });
    } catch (error) {
      console.error("❌ [AI-AGENT] Error updating AI agent config:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Company human request configuration
  app.put('/api/company/human-request', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      console.log('🔧 [HUMAN-REQUEST] Update request - CompanyId:', companyId);

      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { humanRequestEnabled, humanRequestContact, humanRequestMessage, humanRequestKeywords, humanRequestTimeout, ignoredNumbers } = req.body;

      // Build update object - only include fields that were actually sent
const updateData: any = {};

// Human request fields - only update if humanRequestEnabled was explicitly sent
if (humanRequestEnabled !== undefined) {
  updateData.humanRequestEnabled = humanRequestEnabled ? 1 : 0;
  updateData.humanRequestContact = humanRequestContact || null;
  updateData.humanRequestMessage = humanRequestMessage || null;
  updateData.humanRequestKeywords = humanRequestKeywords || null;
  updateData.humanRequestTimeout = humanRequestTimeout !== undefined ? humanRequestTimeout : 30;
}

// Ignored numbers - only update if explicitly sent
if (ignoredNumbers !== undefined) {
  updateData.ignoredNumbers = ignoredNumbers || null;
}


      const updatedCompany = await storage.updateCompany(companyId, updateData);

      res.json({
        message: "Configuração de solicitação de atendimento humano atualizada com sucesso",
        humanRequestEnabled: updatedCompany.humanRequestEnabled === 1,
        humanRequestContact: updatedCompany.humanRequestContact,
        humanRequestMessage: updatedCompany.humanRequestMessage,
        humanRequestKeywords: updatedCompany.humanRequestKeywords,
        humanRequestTimeout: updatedCompany.humanRequestTimeout,
        ignoredNumbers: updatedCompany.ignoredNumbers
      });
    } catch (error) {
      console.error("❌ [HUMAN-REQUEST] Error updating human request config:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Company course notification configuration
  app.put('/api/company/course-notification', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      console.log('🔧 [COURSE-NOTIFICATION] Update request - CompanyId:', companyId);

      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { courseNotificationEnabled, courseNotificationContact, courseNotificationMessage, courseNotificationKeywords, courseNotificationTimeout } = req.body;

      console.log('🔧 [COURSE-NOTIFICATION] Received data:', {
        courseNotificationEnabled,
        courseNotificationTimeout,
        typeOfTimeout: typeof courseNotificationTimeout
      });

      // Build update object - always include all fields
      const updateData: any = {
        courseNotificationEnabled: courseNotificationEnabled ? 1 : 0,
        courseNotificationContact: courseNotificationContact || null,
        courseNotificationMessage: courseNotificationMessage || null,
        courseNotificationKeywords: courseNotificationKeywords || null,
        courseNotificationTimeout: typeof courseNotificationTimeout === 'number' ? courseNotificationTimeout : 30,
      };

      console.log('🔧 [COURSE-NOTIFICATION] Saving updateData:', updateData);

      const updatedCompany = await storage.updateCompany(companyId, updateData);

      console.log('🔧 [COURSE-NOTIFICATION] Saved company timeout:', updatedCompany.courseNotificationTimeout);

      res.json({
        message: "Configuração de notificação de cursos atualizada com sucesso",
        courseNotificationEnabled: updatedCompany.courseNotificationEnabled === 1,
        courseNotificationContact: updatedCompany.courseNotificationContact,
        courseNotificationMessage: updatedCompany.courseNotificationMessage,
        courseNotificationKeywords: updatedCompany.courseNotificationKeywords,
        courseNotificationTimeout: updatedCompany.courseNotificationTimeout
      });
    } catch (error) {
      console.error("❌ [COURSE-NOTIFICATION] Error updating course notification config:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Company AI agent test endpoint
  app.post('/api/company/ai-agent/test', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { message } = req.body;
      
      if (!message || !message.trim()) {
        return res.status(400).json({ message: "Mensagem de teste é obrigatória" });
      }

      // Get company with AI prompt
      const company = await storage.getCompany(companyId);
      if (!company?.aiAgentPrompt) {
        return res.status(400).json({ message: "Agente IA não configurado para esta empresa" });
      }

      // Get global settings for OpenAI configuration
      const settings = await storage.getGlobalSettings();
      console.log("OpenAI Settings:", {
        hasApiKey: !!settings?.openaiApiKey,
        model: settings?.openaiModel,
        temperature: settings?.openaiTemperature,
        maxTokens: settings?.openaiMaxTokens
      });
      
      if (!settings?.openaiApiKey) {
        return res.status(400).json({ message: "Configuração OpenAI não encontrada" });
      }

      // Create AI response using the same logic as WhatsApp webhook
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: settings.openaiModel || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: company.aiAgentPrompt
            },
            {
              role: 'user',
              content: message.trim()
            }
          ],
          temperature: parseFloat(settings.openaiTemperature) || 0.7,
          max_tokens: parseInt(settings.openaiMaxTokens) || 500
        })
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error("OpenAI API Error:", openaiResponse.status, errorText);
        throw new Error(`OpenAI API error: ${openaiResponse.statusText} - ${errorText}`);
      }

      const openaiData = await openaiResponse.json();
      const aiResponse = openaiData.choices[0]?.message?.content;

      if (!aiResponse) {
        throw new Error('Resposta vazia da OpenAI API');
      }

      res.json({ 
        response: aiResponse,
        message: "Teste realizado com sucesso"
      });

    } catch (error: any) {
      console.error("Error testing AI agent:", error);
      res.status(500).json({
        message: error.message || "Erro ao testar agente IA"
      });
    }
  });

  // Resume AI agent endpoint - Clear last human response timestamp
  app.post('/api/company/agent/resume', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      console.log('🔄 [AGENT-RESUME] Resume request - CompanyId:', companyId);

      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      // Update all conversations back to agent mode for this company
      // This will allow the AI agent to respond again immediately
      await pool.execute(
        `UPDATE conversations
         SET takeover_mode = 'agent'
         WHERE company_id = ? AND takeover_mode = 'human'`,
        [companyId]
      );

      // Also unpause the agent at company level
      await pool.execute(
        `UPDATE companies
         SET agent_paused = 0
         WHERE id = ?`,
        [companyId]
      );

      console.log('✅ [AGENT-RESUME] Successfully resumed AI agent for company:', companyId);

      res.json({
        message: "Atendimento retomado com sucesso. O agente IA voltará a responder as próximas mensagens.",
        success: true
      });

    } catch (error: any) {
      console.error("❌ [AGENT-RESUME] Error resuming agent:", error);
      res.status(500).json({
        message: error.message || "Erro ao retomar atendimento do agente"
      });
    }
  });

  // Pause AI agent endpoint - Pause all AI responses for this company
  app.post('/api/company/agent/pause', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      console.log('⏸️  [AGENT-PAUSE] Pause request - CompanyId:', companyId);

      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      // Pause the agent at company level
      await pool.execute(
        `UPDATE companies
         SET agent_paused = 1
         WHERE id = ?`,
        [companyId]
      );

      console.log('✅ [AGENT-PAUSE] Successfully paused AI agent for company:', companyId);

      res.json({
        message: "Atendimento pausado com sucesso. O agente IA não responderá até ser retomado.",
        success: true
      });

    } catch (error: any) {
      console.error("❌ [AGENT-PAUSE] Error pausing agent:", error);
      res.status(500).json({
        message: error.message || "Erro ao pausar atendimento do agente"
      });
    }
  });

  // Company settings update endpoint
  app.put('/api/company/settings-update', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      console.log('🔧 [SETTINGS] Update request - CompanyId:', companyId);

      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { birthdayMessage, aiAgentPrompt, agentInactivityTimeout, logoUrl, primaryColor } = req.body;
      console.log('🔧 [SETTINGS] Birthday message:', birthdayMessage?.substring(0, 50));
      console.log('🔧 [SETTINGS] AI prompt:', aiAgentPrompt?.substring(0, 50));
      console.log('🔧 [SETTINGS] Agent inactivity timeout:', agentInactivityTimeout);
      console.log('🔧 [SETTINGS] Logo URL:', logoUrl?.substring(0, 80));
      console.log('🔧 [SETTINGS] Primary color:', primaryColor);

      const updatedCompany = await storage.updateCompany(companyId, {
        birthdayMessage,
        aiAgentPrompt,
        agentInactivityTimeout: agentInactivityTimeout !== undefined ? agentInactivityTimeout : undefined,
        logoUrl: logoUrl !== undefined ? logoUrl : undefined,
        primaryColor: primaryColor !== undefined ? (primaryColor || null) : undefined,
      });

      console.log('🔧 [SETTINGS] Saved birthday message:', updatedCompany.birthdayMessage?.substring(0, 50));
      console.log('🔧 [SETTINGS] Saved AI prompt:', updatedCompany.aiAgentPrompt?.substring(0, 50));
      console.log('🔧 [SETTINGS] Saved agent inactivity timeout:', updatedCompany.agentInactivityTimeout);
      console.log('🔧 [SETTINGS] Saved logo URL:', updatedCompany.logoUrl?.substring(0, 80));
      console.log('🔧 [SETTINGS] Saved primary color:', updatedCompany.primaryColor);

      res.json({
        message: "Configurações atualizadas com sucesso",
        birthdayMessage: updatedCompany.birthdayMessage,
        aiAgentPrompt: updatedCompany.aiAgentPrompt,
        agentInactivityTimeout: updatedCompany.agentInactivityTimeout,
        logoUrl: updatedCompany.logoUrl,
        primaryColor: updatedCompany.primaryColor,
      });
    } catch (error) {
      console.error("❌ [SETTINGS] Error updating company settings:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // REMOVIDO: endpoints /api/debug/* e /api/test/gilliard-appointment (sem autenticação, expõem dados)

  // ========================================
  // 🔗 CHATWOOT WEBHOOK - Human Takeover Detection
  // ========================================
  // 🔗 CHATWOOT WEBHOOK - Human Takeover & Label-based AI Control
  // ========================================
  // Handles two scenarios:
  // 1. Agent sends message (message_created + outgoing) → activates human takeover with timeout
  // 2. Label "humano" added/removed (conversation_updated) → permanent AI block until label removed
  //
  // Configure this URL as an account-level webhook in Chatwoot:
  //   Settings → Integrations → Webhooks → Add Webhook
  //   URL: https://seu-dominio.com/api/webhook/chatwoot
  //   Events: message_created, conversation_updated
  app.post('/api/webhook/chatwoot', async (req: any, res) => {
    try {
      const payload = req.body;
      const event = payload.event;

      // Label name that blocks AI (case-insensitive)
      const HUMAN_LABEL = 'humano';

      // Helper: generates all phone number variants to handle format mismatches
      // Chatwoot stores: 558194526071 (country code + old 8-digit local)
      // DB stores:       81994526071  (no country code + new 9-digit local)
      const buildPhoneVariants = (raw: string): string[] => {
        const variants = new Set<string>();
        variants.add(raw);
        // Strip Brazil country code 55
        if (raw.startsWith('55') && raw.length >= 12) {
          const withoutCC = raw.slice(2); // e.g. "8194526071"
          variants.add(withoutCC);
          // Brazilian 9th digit: insert 9 after 2-digit area code (10-digit → 11-digit)
          if (withoutCC.length === 10) {
            variants.add(withoutCC.slice(0, 2) + '9' + withoutCC.slice(2)); // "81994526071"
          }
        }
        // Also try each variant with @s.whatsapp.net suffix
        for (const v of [...variants]) {
          variants.add(v + '@s.whatsapp.net');
        }
        return [...variants];
      };

      // Helper: search conversation by any phone variant
      const findConvByPhoneVariants = async (variants: string[]) => {
        for (const variant of variants) {
          const [row] = await db
            .select()
            .from(conversations)
            .where(eq(conversations.phoneNumber, variant))
            .limit(1);
          if (row) return row;
        }
        return null;
      };

      // Only process relevant events
      if (event !== 'message_created' && event !== 'conversation_updated') {
        return res.status(200).json({ received: true, ignored: true, reason: 'Event not relevant' });
      }

      // ────────────────────────────────────────────────
      // HANDLER: Label-based AI control (conversation_updated)
      // ────────────────────────────────────────────────
      if (event === 'conversation_updated') {
        // O Chatwoot dispara conversation_updated para QUALQUER mudança na conversa
        // (status, atribuição, prioridade, etc.), não apenas para labels.
        // Devemos processar lógica de labels APENAS quando labels realmente mudaram,
        // caso contrário um conversation_updated de status/atribuição pode desativar
        // o human takeover que foi ativado por mensagem de agente (sem label).
        const changedAttributes = payload.changed_attributes || {};
        const isLabelChange = changedAttributes.labels !== undefined;

        if (!isLabelChange) {
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('🏷️ [CHATWOOT WEBHOOK] conversation_updated NÃO é sobre labels');
          console.log('🏷️ [CHATWOOT WEBHOOK] Atributos alterados:', Object.keys(changedAttributes).join(', ') || 'nenhum');
          console.log('🏷️ [CHATWOOT WEBHOOK] Ignorando - human takeover não será afetado');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          return res.status(200).json({ received: true, ignored: true, reason: 'Not a label change event' });
        }

        // Extract labels from payload - Chatwoot sends them in different locations
        const labels: string[] = payload.labels
          || payload.conversation?.labels
          || changedAttributes.labels?.current_value
          || [];

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🏷️ [CHATWOOT WEBHOOK] Conversation updated - LABEL CHANGE detected');
        console.log('🏷️ [CHATWOOT WEBHOOK] Previous labels:', JSON.stringify(changedAttributes.labels?.previous_value || []));
        console.log('🏷️ [CHATWOOT WEBHOOK] Current labels:', JSON.stringify(labels));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Check if "humano" label is present (case-insensitive)
        const hasHumanLabel = Array.isArray(labels) && labels.some(
          (label: string) => label.toLowerCase() === HUMAN_LABEL
        );

        // Extract phone number from conversation
        const cwConversation = payload.conversation || payload;
        const cwContact = cwConversation.meta?.sender || cwConversation.contact || {};
        const cwContactInbox = cwConversation.contact_inbox || {};

        let phoneNumber = cwContact.phone_number
          || cwContactInbox.source_id
          || cwContact.identifier
          || '';

        phoneNumber = phoneNumber.replace(/[\s+\-()]/g, '').replace(/@s\.whatsapp\.net$/, '');

        if (!phoneNumber) {
          console.log('❌ [CHATWOOT WEBHOOK] Could not extract phone number for label check');
          return res.status(200).json({ received: true, error: 'No phone number found' });
        }

        console.log('📞 [CHATWOOT WEBHOOK] Phone:', phoneNumber);
        console.log('🏷️ [CHATWOOT WEBHOOK] Has "humano" label:', hasHumanLabel);

        // Find conversation in our database - try multiple phone format variants
        const labelPhoneVariants = buildPhoneVariants(phoneNumber);
        console.log('🔍 [CHATWOOT WEBHOOK] Trying phone variants:', labelPhoneVariants);
        const conv = await findConvByPhoneVariants(labelPhoneVariants);

        if (!conv) {
          console.log('⚠️ [CHATWOOT WEBHOOK] No conversation found for phone:', phoneNumber, '(tried', labelPhoneVariants.length, 'variants)');
          return res.status(200).json({ received: true, ignored: true, reason: 'Conversation not found' });
        }

        if (hasHumanLabel) {
          // Label "humano" is present → block AI permanently
          // MySQL TIMESTAMP max is 2038-01-19, so use 2037-12-31 as "forever" sentinel
          await storage.updateConversation(conv.id, {
            takeoverMode: 'human',
            lastMessageAt: new Date('2037-12-31T23:59:59Z'),
          });
          console.log('🏷️ [CHATWOOT WEBHOOK] Label "humano" DETECTED → AI BLOCKED permanently for conversation', conv.id);
          console.log('🚫 [CHATWOOT WEBHOOK] AI will NOT respond until label is removed');
        } else {
          // Label "humano" removed → restore AI
          if (conv.takeoverMode === 'human') {
            await storage.updateConversation(conv.id, {
              takeoverMode: 'agent',
              lastMessageAt: new Date(),
            });
            console.log('🏷️ [CHATWOOT WEBHOOK] Label "humano" REMOVED → AI RESTORED for conversation', conv.id);
            console.log('✅ [CHATWOOT WEBHOOK] AI will respond to next messages');
          } else {
            console.log('🏷️ [CHATWOOT WEBHOOK] No label change needed - already in agent mode');
          }
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return res.status(200).json({ received: true, processed: true, label: hasHumanLabel ? 'humano_added' : 'humano_removed' });
      }

      // ────────────────────────────────────────────────
      // HANDLER: Agent message detection (message_created)
      // ────────────────────────────────────────────────
      const messageType = payload.message_type;

      // message_type: "outgoing" = agent/bot sent, "incoming" = customer sent
      // sender.type: "user" = human agent in Chatwoot, "agent_bot" = bot, null/undefined = API/synced message
      // IMPORTANT: Only activate human takeover for REAL human agents (sender.type === 'user')
      // Messages sent by our AI via UAZAPI sync back to Chatwoot as "outgoing" but without a proper sender,
      // so we must NOT trigger takeover for those.
      const senderType = payload.sender?.type;
      const senderId = payload.sender?.id;
      const senderName = payload.sender?.name;
      const isHumanAgentMessage = senderType === 'user' && !!senderId;

      if (!isHumanAgentMessage) {
        // Log why we're skipping - helps debug if a real agent message is being missed
        if (messageType === 'outgoing' || messageType === 1) {
          console.log('🔍 [CHATWOOT WEBHOOK] Outgoing message ignored (not from human agent)');
          console.log('🔍 [CHATWOOT WEBHOOK] sender.type:', senderType || 'none', '| sender.id:', senderId || 'none', '| sender.name:', senderName || 'none');
        }
        return res.status(200).json({ received: true, ignored: true, reason: 'Not a human agent message' });
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔗 [CHATWOOT WEBHOOK] Human agent message detected');
      console.log('👤 [CHATWOOT WEBHOOK] Agent ID:', senderId, '| Name:', senderName, '| Type:', senderType);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Extract phone number from Chatwoot payload
      const conversation = payload.conversation || {};
      const contact = conversation.meta?.sender || conversation.contact || {};
      const contactInbox = conversation.contact_inbox || {};

      let phoneNumber = contact.phone_number
        || contactInbox.source_id
        || contact.identifier
        || '';

      phoneNumber = phoneNumber.replace(/[\s+\-()]/g, '').replace(/@s\.whatsapp\.net$/, '');

      if (!phoneNumber) {
        console.log('❌ [CHATWOOT WEBHOOK] Could not extract phone number from payload');
        console.log('📦 Payload keys:', Object.keys(payload));
        console.log('📦 Conversation meta:', JSON.stringify(conversation.meta || {}).substring(0, 500));
        return res.status(200).json({ received: true, error: 'No phone number found' });
      }

      console.log('📞 [CHATWOOT WEBHOOK] Phone:', phoneNumber);
      console.log('👤 [CHATWOOT WEBHOOK] Agent:', payload.sender?.name || 'Unknown');
      console.log('💬 [CHATWOOT WEBHOOK] Content:', (payload.content || '').substring(0, 100));

      // Find conversation in our database - try multiple phone format variants
      const msgPhoneVariants = buildPhoneVariants(phoneNumber);
      console.log('🔍 [CHATWOOT WEBHOOK] Trying phone variants:', msgPhoneVariants);
      const matchingConversation = await findConvByPhoneVariants(msgPhoneVariants);

      if (!matchingConversation) {
        console.log('⚠️ [CHATWOOT WEBHOOK] No matching conversation found for phone:', phoneNumber, '(tried', msgPhoneVariants.length, 'variants)');
        return res.status(200).json({ received: true, ignored: true, reason: 'Conversation not found' });
      }

      console.log('✅ [CHATWOOT WEBHOOK] Found conversation:', matchingConversation.id);

      // 🤖 DETECÇÃO DE ECO DA AI: Verificar se esta mensagem é a resposta da AI sendo ecoada pelo Chatwoot
      // Quando a AI envia uma resposta via UAZAPI, o Chatwoot sincroniza e dispara message_created
      // com sender.type='user', fazendo parecer que um agente humano enviou a mensagem.
      // Comparamos o conteúdo com o cache de respostas recentes da AI para detectar esse eco.
      const incomingContent = (payload.content || '').substring(0, 200);
      const recentAI = recentAISentMessages.get(matchingConversation.id);

      if (recentAI && (Date.now() - recentAI.timestamp) < 30000) {
        // Verificar se o conteúdo bate com QUALQUER resposta recente da AI
        const matchIndex = recentAI.contents.findIndex(c => c === incomingContent);
        if (matchIndex !== -1) {
          console.log('🤖 [CHATWOOT WEBHOOK] ⚠️ ECO DETECTADO: Esta mensagem é a resposta da AI ecoada pelo Chatwoot');
          console.log('🤖 [CHATWOOT WEBHOOK] Conteúdo Chatwoot:', incomingContent.substring(0, 80) + '...');
          console.log(`✅ [CHATWOOT WEBHOOK] Human takeover NÃO ativado - mensagem é eco da AI (match ${matchIndex + 1}/${recentAI.contents.length})`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          // Remover apenas a entrada que deu match (outras podem ainda ser ecoadas)
          recentAI.contents.splice(matchIndex, 1);
          if (recentAI.contents.length === 0) {
            recentAISentMessages.delete(matchingConversation.id);
          }
          return res.status(200).json({ received: true, ignored: true, reason: 'AI echo detected - not a real human agent message' });
        }
      }

      // Limpar cache para esta conversa (já foi verificado, sem match)
      recentAISentMessages.delete(matchingConversation.id);

      // Activate human takeover mode
      await storage.updateConversation(matchingConversation.id, {
        takeoverMode: 'human',
        lastMessageAt: new Date(),
      });

      // Cancel any pending follow-up and confirmation timers for this conversation
      // Search by conversationId since phone format may differ between Chatwoot and UAZAPI
      for (const [key, entry] of conversationFollowUpTimers) {
        if (entry.conversationId === matchingConversation.id) {
          clearTimeout(entry.timer);
          conversationFollowUpTimers.delete(key);
          console.log(`💬 [CHATWOOT TAKEOVER] Follow-up timer CANCELLED for ${key}`);
        }
      }
      for (const [key, entry] of pendingConfirmationTimers) {
        if (entry.conversationId === matchingConversation.id) {
          clearTimeout(entry.timer);
          pendingConfirmationTimers.delete(key);
          console.log(`⏰ [CHATWOOT TAKEOVER] Confirmation timer CANCELLED for ${key}`);
        }
      }

      // Save agent message to conversation history
      const agentContent = payload.content || '';
      if (agentContent) {
        await storage.createMessage({
          conversationId: matchingConversation.id,
          messageId: `chatwoot_${payload.id || Date.now()}`,
          content: agentContent,
          role: 'assistant',
          messageType: 'text',
          timestamp: new Date(),
        });
        console.log('💾 [CHATWOOT WEBHOOK] Agent message saved to conversation history');
      }

      console.log('🤝 [CHATWOOT WEBHOOK] Human takeover activated for conversation', matchingConversation.id);
      console.log('🚫 [CHATWOOT WEBHOOK] AI blocked for this conversation');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return res.status(200).json({ received: true, processed: true, takeover: true });

    } catch (error: any) {
      console.error('❌ [CHATWOOT WEBHOOK] Error:', error.message);
      return res.status(200).json({ received: true, error: error.message });
    }
  });

  // Webhook endpoint for WhatsApp integration with AI agent
  app.post('/api/webhook/whatsapp/:instanceName', async (req: any, res) => {
    try {
      const { instanceName } = req.params;
      const webhookData = req.body;

      // UAZAPI uses "EventType" (PascalCase), normalize to a single variable
      const eventType = webhookData.EventType || webhookData.event || '';

      console.log('🔔 WhatsApp webhook received');
      console.log('📋 Instance:', instanceName);
      console.log('📋 EventType:', eventType);
      console.log('📋 Payload keys:', Object.keys(webhookData).join(', '));

      // Handle CONNECTION events to update instance status
      // UAZAPI sends EventType: "connection", legacy used "connection.update" or "CONNECTION_UPDATE"
      const isConnectionEvent = eventType === 'connection' || eventType === 'connection.update' || eventType === 'CONNECTION_UPDATE';
      
      if (isConnectionEvent) {
        console.log('🔄 Processing connection update event');

        // UAZAPI sends connection state at root level or in data property
        const connectionData = webhookData.data || webhookData;
        let newStatus = 'disconnected'; // default status

        // Map connection states to our status
        // UAZAPI uses: 'connected', 'connecting', 'disconnected' (or boolean connected field)
        const state = connectionData?.state || connectionData?.status;
        if (state === 'open' || state === 'connected' || connectionData?.connected === true) {
          newStatus = 'connected';
        } else if (state === 'connecting') {
          newStatus = 'connecting';
        } else if (state === 'close' || state === 'disconnected' || connectionData?.connected === false) {
          newStatus = 'disconnected';
        }
        
        console.log(`📡 Connection state: ${connectionData?.state} -> ${newStatus}`);
        
        // Update instance status in database
        try {
          const whatsappInstance = await storage.getWhatsappInstanceByNameOnly(instanceName);
          if (whatsappInstance) {
            await storage.updateWhatsappInstance(whatsappInstance.id, {
              status: newStatus
            });
            console.log(`✅ Updated instance ${instanceName} status to: ${newStatus}`);
          } else {
            console.log(`⚠️ Instance ${instanceName} not found in database`);
          }
        } catch (dbError) {
          console.error("Error updating instance status:", dbError);
        }
        
        return res.status(200).json({
          received: true,
          processed: true,
          instanceName,
          newStatus,
          event: eventType
        });
      }

      // Check if it's a QR code update event
      const isQrCodeEvent = eventType === 'qrcode.updated' || eventType === 'QRCODE_UPDATED' || eventType === 'qrcode';
      
      if (isQrCodeEvent) {
        console.log('📱 QR code updated for instance:', instanceName);
        
        // Extract QR code from UAZAPI
        let qrCodeData = null;
        
        // Check all possible locations for QR code
        if (webhookData.data) {
          if (webhookData.data.base64) {
            qrCodeData = webhookData.data.base64;
            console.log('QR found in data.base64');
          } else if (webhookData.data.qrcode) {
            qrCodeData = webhookData.data.qrcode;
            console.log('QR found in data.qrcode');
          }
        } else if (webhookData.qrcode) {
          qrCodeData = webhookData.qrcode;
          console.log('QR found in root.qrcode');
        } else if (webhookData.base64) {
          qrCodeData = webhookData.base64;
          console.log('QR found in root.base64');
        }
        
        if (qrCodeData) {
          try {
            console.log('QR code data type:', typeof qrCodeData);
            console.log('QR code raw data:', qrCodeData);
            
            let qrCodeString = '';
            
            // Handle different data formats from UAZAPI
            if (typeof qrCodeData === 'string') {
              qrCodeString = qrCodeData;
            } else if (typeof qrCodeData === 'object' && qrCodeData !== null) {
              // Check if it's a buffer or has base64 property
              if (qrCodeData.base64) {
                qrCodeString = qrCodeData.base64;
              } else if (qrCodeData.data) {
                qrCodeString = qrCodeData.data;
              } else if (Buffer.isBuffer(qrCodeData)) {
                qrCodeString = qrCodeData.toString('base64');
                qrCodeString = `data:image/png;base64,${qrCodeString}`;
              } else {
                // Try to convert object to JSON and see if it contains the QR
                console.log('Object keys:', Object.keys(qrCodeData));
                qrCodeString = JSON.stringify(qrCodeData);
              }
            } else {
              qrCodeString = String(qrCodeData);
            }
            
            console.log('Processed QR code length:', qrCodeString.length);
            
            if (qrCodeString && qrCodeString.length > 50) {
              const whatsappInstance = await storage.getWhatsappInstanceByNameOnly(instanceName);
              if (whatsappInstance) {
                await storage.updateWhatsappInstance(whatsappInstance.id, {
                  qrCode: qrCodeString,
                  status: 'connecting'
                });
                console.log('✅ QR code saved successfully for instance:', instanceName);
                console.log('QR code preview:', qrCodeString.substring(0, 100) + '...');
              } else {
                console.log('❌ Instance not found:', instanceName);
              }
            } else {
              console.log('❌ QR code data is too short or invalid:', qrCodeString.length);
            }
          } catch (error) {
            console.error('❌ Error processing QR code:', error);
          }
        } else {
          console.log('❌ No QR code found in webhook data');
        }
        
        return res.json({ received: true, processed: true, type: 'qrcode' });
      }

      // Check if it's a message event (handle UAZAPI and legacy formats)
      // UAZAPI sends EventType: "messages" with message and chat objects at root level
      const isUazapiMessage = (eventType === 'messages' || eventType === 'message') && (webhookData.message || webhookData.chat);
      // Legacy formats (Evolution API)
      const isLegacyMessageEvent = eventType === 'messages.upsert' || eventType === 'MESSAGES_UPSERT';
      const isMessageEventArray = isLegacyMessageEvent && webhookData.data?.messages?.length > 0;
      const isMessageEventDirect = isLegacyMessageEvent && webhookData.data?.key && webhookData.data?.message;
      const isDirectMessage = !!webhookData.key && !!webhookData.message && !eventType;
      const isWrappedMessage = webhookData.data?.key && webhookData.data?.message;
      const isAudioMessageDirect = !!webhookData.key && webhookData.messageType === 'audioMessage' && !!webhookData.audio;
      const isMessageEvent = isUazapiMessage || isMessageEventArray || isMessageEventDirect || isDirectMessage || isWrappedMessage || isAudioMessageDirect;

      if (process.env.DEBUG_WHATSAPP_WEBHOOK === 'true') {
        console.log('🔍 Debug - eventType:', eventType);
        console.log('🔍 Debug - isUazapiMessage:', isUazapiMessage);
        console.log('🔍 Debug - isLegacyMessageEvent:', isLegacyMessageEvent);
        console.log('🔍 Debug - Has message obj:', !!webhookData.message);
        console.log('🔍 Debug - Has chat obj:', !!webhookData.chat);
        if (webhookData.message) console.log('🔍 Debug - message keys:', Object.keys(webhookData.message).join(', '));
        if (webhookData.chat) console.log('🔍 Debug - chat keys:', Object.keys(webhookData.chat).join(', '));
      }

      if (!isMessageEvent) {
        console.log('❌ Event not recognized as message. EventType:', eventType);
        console.log('❌ Payload keys:', Object.keys(webhookData).join(', '));
        return res.status(200).json({ received: true, processed: false, reason: `Event: ${eventType}` });
      }

      // Skip messages sent by API (UAZAPI wasSentByApi flag) to avoid processing our own outbound messages
      const wasSentByApi = webhookData.wasSentByApi === true || webhookData.data?.wasSentByApi === true
        || webhookData.message?.wasSentByApi === true;
      if (wasSentByApi) {
        console.log('🚫 [SKIP] Message was sent by API (wasSentByApi=true), skipping processing');
        return res.status(200).json({ received: true, processed: false, reason: 'Message sent by API (wasSentByApi)' });
      }

      // Skip reaction messages - reactions are not real messages and should not trigger AI responses
      // UAZAPI sends reactions with type/messageType containing "reaction"
      const uazMsgObj = webhookData.message || webhookData.data?.message || {};
      const uazMsgType = (uazMsgObj.type || '').toLowerCase();
      const uazMsgMessageType = (uazMsgObj.messageType || '').toLowerCase();
      const isReaction = uazMsgType === 'reaction' || uazMsgMessageType === 'reaction'
        || uazMsgMessageType === 'reactionmessage' || uazMsgType === 'reactionmessage'
        || eventType === 'message.reaction' || eventType === 'messages.reaction'
        || !!webhookData.data?.reactionMessage || !!uazMsgObj.reactionMessage;
      if (isReaction) {
        console.log('🚫 [SKIP] Reaction message detected, skipping processing');
        return res.status(200).json({ received: true, processed: false, reason: 'Reaction message ignored' });
      }

      // Skip status/stories responses - when a client replies to a WhatsApp Status (story),
      // the remoteJid is "status@broadcast" and should not trigger AI responses
      const statusRemoteJid = uazMsgObj?.key?.remoteJid || webhookData?.data?.key?.remoteJid || '';
      const chatSource = (webhookData.chatSource || '').toLowerCase();
      // UAZAPI raw message content may contain contextInfo referencing status@broadcast
      const rawContent = uazMsgObj?.content || {};
      const rawContentStr = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      const hasStatusBroadcastInContent = rawContentStr.includes('status@broadcast');
      const uazChatId = (uazMsgObj?.chatid || '').toLowerCase();
      const isStatusMessage = statusRemoteJid === 'status@broadcast'
        || statusRemoteJid.endsWith('@broadcast')
        || eventType === 'status' || eventType === 'message.status'
        || chatSource === 'status' || chatSource === 'broadcast' || chatSource === 'stories'
        || uazChatId === 'status@broadcast' || uazChatId.endsWith('@broadcast')
        || hasStatusBroadcastInContent;

      // DEBUG: log fields that help identify status/stories messages
      console.log('🔍 [STATUS-DEBUG] chatSource:', webhookData.chatSource, '| statusRemoteJid:', statusRemoteJid, '| uazChatId:', uazMsgObj?.chatid, '| hasStatusInContent:', hasStatusBroadcastInContent);

      if (isStatusMessage) {
        console.log('🚫 [SKIP] Status/broadcast message detected, skipping processing');
        return res.status(200).json({ received: true, processed: false, reason: 'Status message ignored' });
      }

      // Handle multiple formats: UAZAPI format, array format, direct format, wrapped format
      let message;
      if (isUazapiMessage) {
        // UAZAPI format: EventType="messages", data at root level with message and chat objects
        // Real payload structure:
        //   message: { chatid, sender, sender_pn, text, fromMe, senderName, messageType, type, id, content, ... }
        //   chat: { id (INTERNAL ID, not phone!), wa_chatid, phone, name, wa_contactName, ... }
        // IMPORTANT: chat.id is an internal UAZAPI ID (e.g. "r1628f4c709b14c"), NOT the phone number!
        const uazMsg = webhookData.message || {};
        const uazChat = webhookData.chat || {};

        // Extract real phone/chat ID - DO NOT use chat.id (it's an internal UAZAPI ID, not a phone number)
        // Priority: message.chatid > message.sender > message.sender_pn > chat.wa_chatid
        const chatId = uazMsg.chatid || uazMsg.sender || uazMsg.sender_pn || uazMsg.from || uazChat.wa_chatid || '';

        // Extract message text
        const msgText = uazMsg.text || uazMsg.body || uazMsg.conversation || uazMsg.caption || (uazMsg.content?.text) || '';

        // Extract message type (UAZAPI uses type="text" and messageType="ExtendedTextMessage")
        const msgType = uazMsg.type || uazMsg.messageType || (msgText ? 'conversation' : 'unknown');

        // Determine if message was sent by the instance (fromMe)
        const fromMe = uazMsg.fromMe === true || uazMsg.fromMe === 'true';

        // Extract message ID (UAZAPI uses messageid field)
        const msgId = uazMsg.messageid || uazMsg.id || uazMsg.messageId || uazMsg.key?.id || '';

        // Extract sender display name
        const pushName = uazMsg.senderName || uazMsg.pushName || uazMsg.name || uazChat.wa_contactName || uazChat.name || '';

        message = {
          key: {
            remoteJid: chatId,
            fromMe: fromMe,
            id: msgId,
          },
          message: {
            conversation: msgText,
          },
          messageType: msgType,
          pushName: pushName,
          // Keep raw UAZAPI data for audio/media handling
          _uazapiRaw: uazMsg,
        };

        // Detect audio messages from UAZAPI
        // UAZAPI messageType values: 'audio', 'ptt', 'myaudio', 'ptv' (voice video note)
        // Also handle legacy/raw WhatsApp types: 'audioMessage', 'pttMessage'
        // Check BOTH type and messageType fields since either could contain the audio indicator
        const audioTypes = ['audio', 'ptt', 'myaudio', 'ptv', 'audiomessage', 'pttmessage'];
        const uazType = (uazMsg.type || '').toLowerCase();
        const uazMessageType = (uazMsg.messageType || '').toLowerCase();
        const isAudioType = audioTypes.includes(msgType.toLowerCase())
          || audioTypes.includes(uazType)
          || audioTypes.includes(uazMessageType)
          || (uazMsg.fileURL && (uazMsg.fileURL.includes('.ogg') || uazMsg.fileURL.includes('.opus') || uazMsg.fileURL.includes('.mp3') || uazMsg.fileURL.includes('.m4a') || uazMsg.fileURL.includes('.oga')));
        if (isAudioType) {
          message.message.audioMessage = uazMsg;
          message.messageType = 'audioMessage';
          console.log('🎵 [UAZAPI] Audio message detected, type:', msgType, 'uazType:', uazType, 'uazMessageType:', uazMessageType);
        } else {
          console.log('🔍 [UAZAPI] Not audio. type:', uazType, 'messageType:', uazMessageType, 'msgType:', msgType, 'fileURL:', uazMsg.fileURL?.substring(0, 80) || 'none');
        }

        console.log('📦 [UAZAPI] Normalized message');
        console.log('📞 [UAZAPI] Phone (chatid):', chatId);
        console.log('💬 [UAZAPI] Text:', msgText.substring(0, 100));
        console.log('👤 [UAZAPI] fromMe:', fromMe, '| pushName:', pushName, '| Type:', msgType);
      } else if (isMessageEventArray) {
        message = webhookData.data.messages[0];
      } else if (isDirectMessage || isAudioMessageDirect) {
        message = webhookData;
      } else if (isWrappedMessage) {
        message = webhookData.data;
      } else {
        message = webhookData.data || webhookData;
      }
      
      if (!message) {
        return res.status(200).json({ received: true, processed: false, reason: 'Message object is null' });
      }

      // ========================================
      // 🔍 DIAGNÓSTICO: Log detalhado da mensagem
      // ========================================
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 [WEBHOOK] Nova mensagem recebida');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📱 Message type:', message?.messageType || 'text');
      console.log('👤 From me (fromMe):', message?.key?.fromMe);
      console.log('📞 Remote JID:', message?.key?.remoteJid);
      console.log('🔑 Message ID:', message?.key?.id);
      console.log('👥 Participant:', message?.key?.participant || 'N/A');
      console.log('📝 Push name:', message?.pushName || 'N/A');

      // Log da estrutura da mensagem
      if (message?.message) {
        console.log('📦 Message structure keys:', Object.keys(message.message));
      }

      // Handle both text and audio messages
      const hasTextContent = message?.message?.conversation || message?.message?.extendedTextMessage?.text;
      const uazRawType = (message?._uazapiRaw?.type || '').toLowerCase();
      const uazRawMessageType = (message?._uazapiRaw?.messageType || '').toLowerCase();
      const uazAudioTypes = ['audio', 'ptt', 'myaudio', 'ptv', 'audiomessage', 'pttmessage'];
      const hasAudioContent = message?.message?.audioMessage || message?.messageType === 'audioMessage'
        || uazAudioTypes.includes(uazRawType)
        || uazAudioTypes.includes(uazRawMessageType)
        || (message?._uazapiRaw?.fileURL && /\.(ogg|opus|mp3|m4a|oga|wav|aac)/i.test(message._uazapiRaw.fileURL));
      // Accept both client messages (fromMe=false) and human messages (fromMe=true)
      const isTextMessage = hasTextContent;
      const isAudioMessage = hasAudioContent;

      console.log('🎵 Audio message detected:', !!hasAudioContent, '| uazRawType:', uazRawType, '| uazRawMessageType:', uazRawMessageType);
      console.log('💬 Text message detected:', !!hasTextContent);
      console.log('👤 From me (human):', message?.key?.fromMe);

      // Detectar origem da mensagem
      const messageOrigin = message?.key?.fromMe
        ? '🖥️  WhatsApp Web/Desktop ou 📱 Celular (enviada por você)'
        : '👤 Cliente (recebida)';
      console.log('🌐 Origem detectada:', messageOrigin);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (isTextMessage || isAudioMessage) {
          // Extract phone number - always get the REAL number (not @lid)
          let rawPhoneNumber = '';
          const remoteJid = message?.key?.remoteJid || '';
          const remoteJidAlt = message?.key?.remoteJidAlt || message?.remoteJidAlt || webhookData?.data?.key?.remoteJidAlt || webhookData?.data?.remoteJidAlt || '';

          console.log('📞 Extracting phone number...');
          console.log('📞 remoteJid:', remoteJid);
          console.log('📞 remoteJidAlt:', remoteJidAlt);

          // Skip group messages: @g.us = WhatsApp group chat
          // Also check UAZAPI fields: message.chatid, chat.wa_chatid may contain group JIDs
          const uazChatId = webhookData?.message?.chatid || webhookData?.chat?.wa_chatid || '';
          const isGroupMessage = remoteJid.includes('@g.us') || uazChatId.includes('@g.us');
          if (isGroupMessage) {
            console.log('🚫 [IGNORED] Group message detected (@g.us) - skipping');
            console.log('📞 remoteJid:', remoteJid);
            console.log('📞 UAZAPI chatid:', uazChatId);
            return res.status(200).json({ received: true, processed: false, reason: 'Group message ignored' });
          }

          // Strategy: Always use the field that contains a REAL number (not @lid)
          // The real number is identified by @s.whatsapp.net or @c.us

          // Check remoteJid first - if it's real, use it
          if (remoteJid && !remoteJid.includes('@lid')) {
            rawPhoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
            console.log('✅ Using real number from remoteJid:', remoteJid);
          }
          // If remoteJid is @lid, get the real number from remoteJidAlt
          else if (remoteJidAlt && !remoteJidAlt.includes('@lid')) {
            rawPhoneNumber = remoteJidAlt.replace('@s.whatsapp.net', '').replace('@c.us', '');
            console.log('✅ Using real number from remoteJidAlt:', remoteJidAlt);
          }
          // Fallback: search in UAZAPI chat/message fields and participant fields
          else {
            console.log('⚠️ Real number not found in remoteJid/remoteJidAlt, searching in UAZAPI and participant fields...');

            // UAZAPI fallback: try chat.id, message.sender, message.from, and root-level fields
            const uazapiChat = webhookData?.chat?.id || '';
            const uazapiMsgSender = webhookData?.message?.sender || webhookData?.message?.from || webhookData?.message?.chatid || '';
            const uazapiRootSender = webhookData?.sender || webhookData?.chatid || webhookData?.data?.sender || webhookData?.data?.chatid || '';
            const uazapiSource = uazapiChat || uazapiMsgSender || uazapiRootSender;
            if (uazapiSource) {
              const uazapiPhone = uazapiSource.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@g.us', '');
              if (uazapiPhone && /^\d{10,}$/.test(uazapiPhone)) {
                rawPhoneNumber = uazapiPhone;
                console.log('✅ Using phone number from UAZAPI chat/message:', uazapiPhone);
              }
            }

            // If UAZAPI didn't provide a number, try legacy participant fields
            if (!rawPhoneNumber) {
              const possibleSources = [
                message?.key?.participant,
                message?.participant,
              ];

              for (const source of possibleSources) {
                if (source && !source.includes('@lid') && (source.includes('@s.whatsapp.net') || source.includes('@c.us'))) {
                  rawPhoneNumber = source.replace('@s.whatsapp.net', '').replace('@c.us', '');
                  console.log('✅ Found real number from participant:', source);
                  break;
                }
              }
            }

            if (!rawPhoneNumber) {
              console.log('❌ Could not find real phone number - all sources contain @lid or are invalid');
              console.log('📊 Message key fields for debugging:', Object.keys(message?.key || {}).join(', '));
            }
          }

          // Normalize the phone number to handle cases where the 9th digit is missing
          const phoneNumber = normalizeWhatsAppNumber(rawPhoneNumber);
          let messageText = message?.message?.conversation || message?.message?.extendedTextMessage?.text;

          if (process.env.DEBUG_WHATSAPP_WEBHOOK === 'true') {
            console.log('📞 Remote JID:', remoteJid);
            console.log('📞 Raw phone number:', rawPhoneNumber);
            console.log('📞 Normalized phone number:', phoneNumber);
          }

          // If we couldn't extract a valid phone number, skip processing
          if (!phoneNumber || phoneNumber.length < 10) {
            // Check if both remoteJid and remoteJidAlt contain @lid (no real number available)
            const bothAreLid = remoteJid.includes('@lid') && (!remoteJidAlt || remoteJidAlt.includes('@lid'));

            if (bothAreLid) {
              console.log('🚫 [IGNORED] All sources contain @lid - no real number available (group/list message)');
              console.log('📞 remoteJid:', remoteJid);
              console.log('📞 remoteJidAlt:', remoteJidAlt);
              return res.status(200).json({ received: true, processed: false, reason: 'Group/list message (@lid) - no real number' });
            }

            console.log('❌ Could not extract valid phone number from message');
            console.log('📊 Message structure keys for debugging:', Object.keys(message || {}).join(', '));
            return res.status(200).json({ received: true, processed: false, reason: 'Invalid phone number' });
          }

          // ========================================
          // 🔒 EARLY LOCK: Previne race condition no debounce
          // ========================================
          // Quando duas mensagens chegam quase ao mesmo tempo, ambas podem passar pelo lock principal
          // (linha ~8701) antes de qualquer uma setá-lo, porque há ~1600 linhas de awaits entre o webhook
          // e o lock. Este early lock garante que a segunda mensagem espere a primeira setar o lock principal.
          const earlyLockKey = `${instanceName}:${phoneNumber}`;
          const earlyLockAge = earlyWebhookLocks.has(earlyLockKey) ? Date.now() - earlyWebhookLocks.get(earlyLockKey)! : Infinity;

          if (earlyWebhookLocks.has(earlyLockKey) && earlyLockAge < 30000) {
            // Outra requisição está no pipeline de setup (entre webhook e lock principal)
            // Esperar até que ela sete o lock principal ou expire (máximo 5s)
            console.log(`⏳ [EARLY-LOCK] Aguardando primeira mensagem setar lock principal (${earlyLockKey})...`);
            const earlyWaitStart = Date.now();
            while (earlyWebhookLocks.has(earlyLockKey) && Date.now() - earlyWaitStart < 5000) {
              await new Promise(resolve => setTimeout(resolve, 150));
            }
            console.log(`✅ [EARLY-LOCK] Liberado após ${Date.now() - earlyWaitStart}ms`);
          }

          // Marcar que estamos no pipeline de setup
          earlyWebhookLocks.set(earlyLockKey, Date.now());

          // ========================================
          // 🚫 IGNORED NUMBERS CHECK
          // ========================================

          // Note: @lid numbers are already filtered out in the extraction logic above
          // Only real numbers (@s.whatsapp.net or @c.us) reach this point

          // Check if number is in ignored list
          const whatsappInstanceForCheck = await storage.getWhatsappInstanceByNameOnly(instanceName);
          if (whatsappInstanceForCheck) {
            const companyForCheck = await storage.getCompany(whatsappInstanceForCheck.companyId);

            if (companyForCheck?.ignoredNumbers) {
              // Parse ignored numbers list (one per line)
              const ignoredNumbersList = companyForCheck.ignoredNumbers
                .split('\n')
                .map((num: string) => num.trim().replace(/\D/g, '')) // Remove non-digits
                .filter((num: string) => num.length >= 10); // Only valid numbers

              // Normalize current phone number for comparison
              const normalizedPhone = phoneNumber.replace(/\D/g, '');

              // Add DDI 55 if not present for comparison
              let phoneToCheck = normalizedPhone;
              if (!phoneToCheck.startsWith('55') && phoneToCheck.length >= 10) {
                phoneToCheck = '55' + phoneToCheck;
              }

              // Check if current number is in ignored list
              const isIgnored = ignoredNumbersList.some((ignoredNum: string) => {
                // Add DDI 55 to ignored number if not present
                let ignoredToCheck = ignoredNum;
                if (!ignoredToCheck.startsWith('55') && ignoredToCheck.length >= 10) {
                  ignoredToCheck = '55' + ignoredToCheck;
                }
                return phoneToCheck === ignoredToCheck;
              });

              if (isIgnored) {
                console.log('🚫 [IGNORED] Number is in ignored list');
                console.log('📞 Phone number:', phoneToCheck);
                earlyWebhookLocks.delete(earlyLockKey);
                return res.status(200).json({ received: true, processed: false, reason: 'Number in ignored list' });
              }
            }
          }

          // ========================================
          // 🤝 HUMAN TAKEOVER CONTROL SYSTEM
          // ========================================

          // Check if message is from human (fromMe = true)
          const isFromHuman = message?.key?.fromMe === true;

          if (isFromHuman) {
            // 🔓 Human messages não passam pelo debounce - liberar early lock imediatamente
            earlyWebhookLocks.delete(earlyLockKey);

            console.log('👤 HUMAN TAKEOVER: Message from human detected');
            console.log('📞 Phone number:', phoneNumber);

            // Find the WhatsApp instance
            const whatsappInstance = await storage.getWhatsappInstanceByNameOnly(instanceName);
            if (!whatsappInstance) {
              console.log('❌ WhatsApp instance not found for takeover update');
              return res.status(200).json({ received: true, processed: true, reason: 'Human message - instance not found' });
            }

            // Find or create conversation
            let conversation = await storage.getConversation(whatsappInstance.companyId, whatsappInstance.id, phoneNumber);

            if (!conversation) {
              console.log('🆕 Creating new conversation for human takeover');
              conversation = await storage.createConversation({
                companyId: whatsappInstance.companyId,
                whatsappInstanceId: whatsappInstance.id,
                phoneNumber: phoneNumber,
                contactName: message.pushName || undefined,
                lastMessageAt: new Date(),
              });
            }

            // Extract message text from human message
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('🔍 [EXTRAÇÃO] Extraindo texto da mensagem do humano');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📦 message.message exists:', !!message?.message);
            console.log('📦 message.message keys:', message?.message ? Object.keys(message.message) : 'N/A');
            console.log('💬 message.message.conversation:', message?.message?.conversation);
            console.log('💬 message.message.extendedTextMessage:', message?.message?.extendedTextMessage);
            console.log('💬 message.message.extendedTextMessage?.text:', message?.message?.extendedTextMessage?.text);

            let humanMessageText = message?.message?.conversation || message?.message?.extendedTextMessage?.text || '';

            console.log('✅ Texto extraído:', humanMessageText || '(VAZIO!)');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // Save human message to database
            const messageTimestamp = message.messageTimestamp
              ? new Date(message.messageTimestamp * 1000)
              : new Date();

            if (humanMessageText) {
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('💾 [SALVANDO] Mensagem do humano no banco de dados');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('🔑 Conversation ID:', conversation.id);
              console.log('📝 Message ID:', message.key?.id || `msg_human_${Date.now()}`);
              console.log('💬 Content:', humanMessageText.substring(0, 100));
              console.log('👥 Role: assistant (human message)');
              console.log('📅 Timestamp:', messageTimestamp.toISOString());
              console.log('📞 Phone:', phoneNumber);

              await storage.createMessage({
                conversationId: conversation.id,
                messageId: message.key?.id || `msg_human_${Date.now()}`,
                content: humanMessageText,
                role: 'assistant', // Human messages are saved as 'assistant' since they're responses
                messageType: message.messageType || 'text',
                timestamp: messageTimestamp,
              });
              console.log('✅ Mensagem salva com sucesso no banco de dados');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            } else {
              console.log('⚠️ [ATENÇÃO] Mensagem de humano NÃO salva: humanMessageText está vazio!');
              console.log('📦 Message object keys:', message?.message ? Object.keys(message.message) : 'N/A');
            }

            // Get company settings for timeout
            const company = await storage.getCompany(whatsappInstance.companyId);
            const timeoutMinutes = company?.agentInactivityTimeout || 30;

            // Update conversation to human mode
            await storage.updateConversation(conversation.id, {
              takeoverMode: 'human',
              lastMessageAt: new Date(),
            });

            // Cancel any pending follow-up and confirmation timers for this conversation
            // These should NOT fire while a human is handling the conversation
            const takeoverTimerKey = `${whatsappInstance.companyId}:${phoneNumber}`;
            if (conversationFollowUpTimers.has(takeoverTimerKey)) {
              const pendingFollowUp = conversationFollowUpTimers.get(takeoverTimerKey)!;
              clearTimeout(pendingFollowUp.timer);
              conversationFollowUpTimers.delete(takeoverTimerKey);
              console.log(`💬 [HUMAN TAKEOVER] Follow-up timer CANCELLED for ${takeoverTimerKey}`);
            }
            if (pendingConfirmationTimers.has(takeoverTimerKey)) {
              const pendingConfirm = pendingConfirmationTimers.get(takeoverTimerKey)!;
              clearTimeout(pendingConfirm.timer);
              pendingConfirmationTimers.delete(takeoverTimerKey);
              console.log(`⏰ [HUMAN TAKEOVER] Confirmation timer CANCELLED for ${takeoverTimerKey}`);
            }

            console.log('✅ HUMAN TAKEOVER: Conversation updated to human mode');
            console.log(`⏰ Timer started: AI will resume in ${timeoutMinutes} minutes if no human messages`);
            console.log('🚫 AI blocked for this conversation');

            return res.status(200).json({
              received: true,
              processed: true,
              reason: 'Human takeover activated - AI blocked'
            });
          }

          // Message is from client (fromMe = false)
          // Check if conversation is in human takeover mode
          console.log('👤 Checking for active human takeover...');

          // Find the WhatsApp instance first
          const whatsappInstance = await storage.getWhatsappInstanceByNameOnly(instanceName);
          if (!whatsappInstance) {
            console.log('❌ WhatsApp instance not found');
            earlyWebhookLocks.delete(earlyLockKey);
            return res.status(404).json({ error: 'Instance not found' });
          }

          // Get company to check inactivity timeout setting
          const company = await storage.getCompany(whatsappInstance.companyId);
          if (!company) {
            console.log('❌ Company not found');
            earlyWebhookLocks.delete(earlyLockKey);
            return res.status(404).json({ error: 'Company not found' });
          }

          // Get timeout from company settings (default: 30 minutes)
          // If human request feature is enabled, use humanRequestTimeout, otherwise use agentInactivityTimeout
          let timeoutMinutes = company.agentInactivityTimeout || 30;

          // Try to find existing conversation
          let conversation = await storage.getConversation(whatsappInstance.companyId, whatsappInstance.id, phoneNumber);

          // ========================================
          // 🎓 COURSE NOTIFICATION - CHECK FIRST (before timeout check)
          // ========================================
          // We need to detect course keywords BEFORE checking timeout
          // so that even if in human mode, we can still process course inquiries

          let courseKeywordDetected = false;
          let shouldPauseCourseAI = false;
          let courseTimeoutValue = 0;
          const courseNotificationEnabled = company.courseNotificationEnabled == 1;

          // ========================================
          // 🎓 COURSE KEYWORD DETECTION
          // Detecção de keyword funciona sempre que a empresa tem PDFs configurados
          // A notificação ao admin é controlada separadamente por courseNotificationEnabled
          // ========================================
          const hasCoursesPdfs = !!(company.coursesPdfs && company.coursesPdfs.trim().length > 0);
          console.log('🔍 [COURSE-DEBUG] courseNotificationEnabled:', courseNotificationEnabled);
          console.log('🔍 [COURSE-DEBUG] hasCoursesPdfs:', hasCoursesPdfs);
          console.log('🔍 [COURSE-DEBUG] coursesPdfs:', company.coursesPdfs ? company.coursesPdfs.substring(0, 200) : 'null/empty');
          console.log('🔍 [COURSE-DEBUG] messageText:', messageText?.substring(0, 100));

          if (hasCoursesPdfs) {
            console.log('🔍 [COURSE] Company has PDFs configured - checking for keywords...');

            let messageTextToCheckForCourse = messageText;
            let courseKeywords: string[] = [];

            // Parse keywords from company settings
            try {
              if (company.courseNotificationKeywords) {
                if (company.courseNotificationKeywords.startsWith('[')) {
                  courseKeywords = JSON.parse(company.courseNotificationKeywords);
                } else {
                  courseKeywords = company.courseNotificationKeywords
                    .split('\n')
                    .map((k: string) => k.trim())
                    .filter((k: string) => k.length > 0);
                }
              }
            } catch (error) {
              console.log('⚠️ [COURSE] Error parsing keywords:', error);
            }

            // Se não tem keywords configuradas, usar keywords padrão
            if (courseKeywords.length === 0) {
              courseKeywords = ['curso', 'cursos'];
              console.log('🔍 [COURSE] No keywords configured, using defaults:', courseKeywords);
            } else {
              console.log('🔍 [COURSE] Keywords from config:', JSON.stringify(courseKeywords));
            }

            if (courseKeywords.length > 0 && messageTextToCheckForCourse) {
              const messageTextLowerForCourse = messageTextToCheckForCourse.toLowerCase();
              courseKeywordDetected = courseKeywords.some((keyword: string) =>
                messageTextLowerForCourse.includes(keyword.toLowerCase())
              );

              if (courseKeywordDetected) {
                console.log('✅ [COURSE] Course keyword detected!');
                // Timeout/pausa só se notificação estiver habilitada
                if (courseNotificationEnabled) {
                  courseTimeoutValue = company.courseNotificationTimeout ?? 30;
                  shouldPauseCourseAI = courseTimeoutValue > 0;
                  console.log(`⚙️ [COURSE] Notification enabled - timeout: ${courseTimeoutValue}min, pause AI: ${shouldPauseCourseAI}`);
                } else {
                  console.log('ℹ️ [COURSE] Notification disabled - PDF will be sent but no admin notification');
                }
              }
            }
          }

          if (conversation && conversation.takeoverMode === 'human') {
            console.log('🔍 HUMAN TAKEOVER ACTIVE: Checking timeout...');

            // Determine which timeout to use:
            // - If takeover was caused by course notification (courseSentAt is recent), use courseNotificationTimeout
            // - Otherwise always use agentInactivityTimeout (human agent takeover via Chatwoot, etc.)
            let effectiveTimeout = timeoutMinutes; // default: agentInactivityTimeout

            const courseSentAt = conversation.courseSentAt ? new Date(conversation.courseSentAt) : null;
            const isCourseTriggeredTakeover = courseSentAt && company.courseNotificationEnabled === 1
              && company.courseNotificationTimeout !== undefined && company.courseNotificationTimeout !== null;

            if (isCourseTriggeredTakeover) {
              effectiveTimeout = company.courseNotificationTimeout;
              console.log(`⚙️ Using Course Notification timeout: ${effectiveTimeout} minutes (course sent at: ${courseSentAt!.toISOString()})`);
            } else {
              console.log(`⚙️ Using Agent Inactivity timeout: ${effectiveTimeout} minutes`);
            }

            const now = new Date();
            const lastMessageTime = new Date(conversation.lastMessageAt || 0);
            const minutesSinceLastMessage = (now.getTime() - lastMessageTime.getTime()) / (1000 * 60);

            console.log('⏰ Last human message:', lastMessageTime.toISOString());
            console.log('⏰ Minutes elapsed:', minutesSinceLastMessage.toFixed(2));
            console.log(`⏰ Timeout threshold: ${effectiveTimeout} minutes`);

            if (minutesSinceLastMessage < effectiveTimeout) {
              // Check if this is a course keyword - if so, let AI respond first
              if (courseKeywordDetected) {
                console.log('🎓 [COURSE-NOTIFICATION] Course keyword detected - letting AI respond before pause');
                // Don't return, let the AI process the course inquiry
                // After AI responds, we'll pause again
              } else {
                console.log('🚫 HUMAN TAKEOVER ACTIVE: AI blocked');
                console.log(`⏰ Time remaining: ${(effectiveTimeout - minutesSinceLastMessage).toFixed(2)} minutes`);
                console.log('👤 Human is still in control of this conversation');

                earlyWebhookLocks.delete(earlyLockKey);
                return res.status(200).json({
                  received: true,
                  processed: true,
                  reason: `Human takeover active - ${(effectiveTimeout - minutesSinceLastMessage).toFixed(2)} minutes remaining`
                });
              }
            } else {
              console.log('✅ HUMAN TAKEOVER TIMEOUT: Returning control to AI');
              console.log('🤖 AI agent resuming conversation handling');

              // Update conversation back to agent mode
              await storage.updateConversation(conversation.id, {
                takeoverMode: 'agent',
                lastMessageAt: new Date(),
              });

              console.log('✅ Conversation mode updated to: agent');
            }
          } else {
            console.log('✅ No active human takeover - proceeding with AI');
          }

          // ========================================
          // 🤝 HUMAN REQUEST DETECTION SYSTEM
          // ========================================

          // Check if human request feature is enabled for this company
          if (company.humanRequestEnabled === 1) {
            console.log('🔍 [HUMAN-REQUEST] Feature enabled - checking for keywords...');

            // Get message text (handle both text and audio messages)
            let messageTextToCheck = messageText;

            // Parse keywords from company settings
            let keywords: string[] = [];
            try {
              if (company.humanRequestKeywords) {
                // If it's JSON array
                if (company.humanRequestKeywords.startsWith('[')) {
                  keywords = JSON.parse(company.humanRequestKeywords);
                } else {
                  // If it's newline separated
                  keywords = company.humanRequestKeywords
                    .split('\n')
                    .map((k: string) => k.trim())
                    .filter((k: string) => k.length > 0);
                }
              }
            } catch (error) {
              console.log('⚠️ [HUMAN-REQUEST] Error parsing keywords:', error);
            }

            console.log('🔍 [HUMAN-REQUEST] Keywords configured:', keywords.length);
            console.log('🔍 [HUMAN-REQUEST] Message text:', messageTextToCheck);

            // Check if message contains any keyword
            if (keywords.length > 0 && messageTextToCheck) {
              const messageTextLower = messageTextToCheck.toLowerCase();
              const keywordFound = keywords.some((keyword: string) =>
                messageTextLower.includes(keyword.toLowerCase())
              );

              if (keywordFound) {
                console.log('✅ [HUMAN-REQUEST] Keyword detected! Processing immediately...');

                // Check if timeout is 0 (no pause - AI continues responding)
                const timeoutValue = company.humanRequestTimeout || 0;
                const shouldPauseAI = timeoutValue > 0;

                console.log(`⚙️ [HUMAN-REQUEST] Timeout configured: ${timeoutValue} minutes`);
                console.log(`⚙️ [HUMAN-REQUEST] Should pause AI: ${shouldPauseAI}`);

                // Only update conversation to human mode if we should pause AI
                if (shouldPauseAI) {
                  if (!conversation) {
                    conversation = await storage.createConversation({
                      companyId: whatsappInstance.companyId,
                      whatsappInstanceId: whatsappInstance.id,
                      phoneNumber: phoneNumber,
                      contactName: message.pushName || phoneNumber,
                      lastMessageAt: new Date(),
                      takeoverMode: 'human'
                    });
                  } else {
                    await storage.updateConversation(conversation.id, {
                      takeoverMode: 'human',
                      lastMessageAt: new Date(),
                    });
                  }
                  console.log('✅ [HUMAN-REQUEST] Conversation switched to human mode');

                  // Save user message to database
                  await storage.createMessage({
                    conversationId: conversation.id,
                    content: messageText,
                    role: 'user',
                    messageType: 'text',
                    delivered: true,
                    timestamp: new Date(),
                  });
                } else {
                  console.log('⚙️ [HUMAN-REQUEST] No pause mode - AI will continue responding');

                  // Create conversation if it doesn't exist (but keep it in agent mode)
                  if (!conversation) {
                    conversation = await storage.createConversation({
                      companyId: whatsappInstance.companyId,
                      whatsappInstanceId: whatsappInstance.id,
                      phoneNumber: phoneNumber,
                      contactName: message.pushName || phoneNumber,
                      lastMessageAt: new Date(),
                      takeoverMode: 'agent'
                    });
                  }
                }

                // Send confirmation message to client IMMEDIATELY
                try {
                  const globalSettings = await storage.getGlobalSettings();
                  if (globalSettings?.uazapiUrl && globalSettings?.uazapiAdminToken) {
                    // Format phone number for UAZAPI - needs country code 55
                    let formattedClientPhone = phoneNumber.replace(/\D/g, '');
                    if (!formattedClientPhone.startsWith('55') && formattedClientPhone.length >= 10) {
                      formattedClientPhone = '55' + formattedClientPhone;
                    }

                    const clientConfirmationMessage = 'Sua solicitação de atendimento humano foi recebida! ✅\n\nEntraremos em contato com você em breve. Por favor, aguarde.';

                    console.log('📤 [HUMAN-REQUEST] Sending confirmation to client:', formattedClientPhone);

                    // Send "typing" presence and wait 2 seconds
                    await uazapiSendTyping(instanceName, formattedClientPhone, 2000);
                    console.log('⏳ [HUMAN-REQUEST] Aguardando 2 segundos (mostrando digitando...)');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    console.log('✅ [HUMAN-REQUEST] Delay concluído, enviando confirmação agora');

                    const clientResponse = await uazapiSendText(instanceName, formattedClientPhone, clientConfirmationMessage);

                    if (clientResponse.ok) {
                      console.log('✅ [HUMAN-REQUEST] Immediate confirmation sent to client');
                      // Registrar no cache para detectar eco no Chatwoot
                      if (conversation) {
                        cacheAIResponse(conversation.id, clientConfirmationMessage);
                      }

                      // Save confirmation message to database (only if we paused AI)
                      if (shouldPauseAI) {
                        await storage.createMessage({
                          conversationId: conversation.id,
                          content: clientConfirmationMessage,
                          role: 'assistant',
                          messageType: 'text',
                          delivered: true,
                          timestamp: new Date(),
                        });
                      }
                    } else {
                      console.log('❌ [HUMAN-REQUEST] Failed to send immediate confirmation:', clientResponse.status);
                    }

                    // Send notification to configured contact
                    if (company.humanRequestContact) {
                      console.log('📤 [HUMAN-REQUEST] Sending notification to:', company.humanRequestContact);

                      let notificationMessage = company.humanRequestMessage ||
                        'Olá! Um cliente está solicitando atendimento humano.\n\n👤 Cliente: {clientName}\n📞 Telefone: {clientPhone}\n⏰ Horário: {time}\n\nPor favor, entre em contato o mais rápido possível.';

                      // Replace variables
                      const now = new Date();
                      notificationMessage = notificationMessage
                        .replace('{clientName}', message.pushName || phoneNumber)
                        .replace('{clientPhone}', phoneNumber)
                        .replace('{time}', now.toLocaleString('pt-BR'));

                      const notificationResponse = await uazapiSendText(instanceName, company.humanRequestContact, notificationMessage);

                      if (notificationResponse.ok) {
                        console.log('✅ [HUMAN-REQUEST] Notification sent successfully');
                      } else {
                        console.log('❌ [HUMAN-REQUEST] Failed to send notification:', notificationResponse.status);
                      }
                    }
                  }
                } catch (confirmError) {
                  console.error('❌ [HUMAN-REQUEST] Error sending confirmation:', confirmError);
                }

                // Always return after processing human request keyword
                // This prevents the AI from also responding to the keyword message itself
                // In "no pause" mode, AI will continue responding to NEXT messages
                if (shouldPauseAI) {
                  console.log('🚫 [HUMAN-REQUEST] AI blocked - human takeover active');
                  earlyWebhookLocks.delete(earlyLockKey);
                  return res.status(200).json({
                    received: true,
                    processed: true,
                    reason: 'Human request keyword detected - switched to human mode'
                  });
                } else {
                  console.log('✅ [HUMAN-REQUEST] No pause mode - confirmation sent, AI will respond to next messages');
                  earlyWebhookLocks.delete(earlyLockKey);
                  return res.status(200).json({
                    received: true,
                    processed: true,
                    reason: 'Human request keyword detected - confirmation sent, AI continues for next messages'
                  });
                }
              }
            }
          }

          // ========================================
          // 🎓 COURSE NOTIFICATION - Store data for post-AI processing
          // ========================================
          // We already detected course keywords above (before timeout check)
          // Now we just need to store data for sending notification AFTER AI responds
          // The AI will respond first, then we'll send notification and pause if configured

          console.log('🔍 [COURSE-DEBUG] courseKeywordDetected after pre-check:', courseKeywordDetected);

          if (courseKeywordDetected) {
            console.log('🎓 [COURSE-NOTIFICATION] Course keyword was detected');

            // Check if course notification was already sent to this client
            console.log('🔍 [COURSE-DEBUG] conversation.courseSentAt:', conversation?.courseSentAt);
            if (conversation && conversation.courseSentAt) {
              console.log('⏭️ [COURSE-NOTIFICATION] Course already sent to this client on:', conversation.courseSentAt);
              console.log('⏭️ [COURSE-NOTIFICATION] Skipping duplicate notification - letting AI respond normally');
              // Reset the flag so AI responds normally without course notification logic
              courseKeywordDetected = false;
            } else {
              console.log(`⚙️ [COURSE-NOTIFICATION] Pause AI after: ${shouldPauseCourseAI}, timeout=${courseTimeoutValue} minutes`);
            }
          }

          if (courseKeywordDetected) {
            // Get course PDFs to send
            let coursePdfsToSend: string[] = [];
            if (company.coursesPdfs) {
              coursePdfsToSend = company.coursesPdfs
                .split(',')
                .map((url: string) => url.trim())
                .filter((url: string) => url.length > 0);
              console.log('📄 [COURSE-NOTIFICATION] PDFs available:', coursePdfsToSend);
            } else {
              console.log('⚠️ [COURSE-NOTIFICATION] No coursesPdfs configured for company');
            }

            // If we have PDFs, send them directly WITHOUT AI response
            if (coursePdfsToSend.length > 0) {
              console.log('📄 [COURSE-NOTIFICATION] Sending PDF directly (skipping AI response)');

              // Create conversation if it doesn't exist
              if (!conversation) {
                conversation = await storage.createConversation({
                  companyId: whatsappInstance.companyId,
                  whatsappInstanceId: whatsappInstance.id,
                  phoneNumber: phoneNumber,
                  contactName: message.pushName || phoneNumber,
                  lastMessageAt: new Date(),
                  takeoverMode: shouldPauseCourseAI ? 'human' : 'agent'
                });
              }

              // Save user message
              await storage.createMessage({
                conversationId: conversation.id,
                content: messageText,
                role: 'user',
                messageType: 'text',
                delivered: true,
                timestamp: new Date(),
              });

              // Format phone number for UAZAPI
              let pdfPhoneForApi = phoneNumber.replace(/\D/g, '');
              if (!pdfPhoneForApi.startsWith('55') && pdfPhoneForApi.length >= 10) {
                pdfPhoneForApi = '55' + pdfPhoneForApi;
              }

              // Send PDFs directly
              try {
                const globalSettings = await storage.getGlobalSettings();
                if (globalSettings?.uazapiUrl) {
                  for (const pdfUrl of coursePdfsToSend) {
                    try {
                      // Extract file path from URL
                      let filePath = pdfUrl;
                      try {
                        const urlObj = new URL(pdfUrl);
                        filePath = urlObj.pathname.substring(1);
                      } catch {
                        filePath = pdfUrl.replace(/^\//, '');
                      }

                      // Full path on server with path traversal protection
                      const fullPath = path.resolve(process.cwd(), filePath);
                      const uploadsDir = path.resolve(process.cwd(), 'uploads');
                      if (!fullPath.startsWith(uploadsDir)) {
                        console.error('[COURSE-PDF] Path traversal blocked');
                        continue;
                      }

                      if (!fs.existsSync(fullPath)) {
                        console.error('❌ [COURSE-PDF] File not found:', fullPath);
                        continue;
                      }

                      // Read file and convert to base64
                      const fileBuffer = fs.readFileSync(fullPath);
                      const base64Data = fileBuffer.toString('base64');

                      // Create filename with company name
                      const companyNameSafe = (company.fantasyName || 'empresa')
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-z0-9]/g, '-')
                        .replace(/-+/g, '-')
                        .replace(/^-|-$/g, '');
                      const customFileName = `${companyNameSafe}-cursos.pdf`;

                      // Prepare caption with course description
                      const caption = company.coursesDescription
                        ? `📄 *Informações do Curso*\n\n${company.coursesDescription}`
                        : '📄 Informações do Curso';

                      // Send document via UAZAPI
                      const mediaResponse = await uazapiSendMedia(instanceName, pdfPhoneForApi, 'document', base64Data, caption, customFileName);

                      if (mediaResponse.ok) {
                        console.log('✅ [COURSE-PDF] PDF sent successfully:', customFileName);

                        // Save assistant message (PDF sent)
                        await storage.createMessage({
                          conversationId: conversation.id,
                          content: `[PDF enviado: ${customFileName}]\n\n${caption}`,
                          role: 'assistant',
                          messageType: 'document',
                          delivered: true,
                          timestamp: new Date(),
                        });
                      } else {
                        console.error('❌ [COURSE-PDF] Failed to send PDF:', mediaResponse.status);
                      }
                    } catch (pdfError) {
                      console.error('❌ [COURSE-PDF] Error sending PDF:', pdfError);
                    }
                  }

                  // Send notification to configured contact (only if notification feature is enabled)
                  if (courseNotificationEnabled && company.courseNotificationContact) {
                    const defaultMessage = shouldPauseCourseAI
                      ? '🎓 *Interesse em Curso Detectado!*\n\n👤 Cliente: {clientName}\n📞 Telefone: {clientPhone}\n💬 Mensagem: {message}\n⏰ Horário: {time}\n\n⏸️ O agente IA foi pausado por ' + courseTimeoutValue + ' minutos.'
                      : '🎓 *Interesse em Curso Detectado!*\n\n👤 Cliente: {clientName}\n📞 Telefone: {clientPhone}\n💬 Mensagem: {message}\n⏰ Horário: {time}\n\n✅ PDF do curso enviado automaticamente.';

                    let notificationMessage = company.courseNotificationMessage || defaultMessage;
                    const now = new Date();
                    notificationMessage = notificationMessage
                      .replace('{clientName}', message.pushName || phoneNumber)
                      .replace('{clientPhone}', phoneNumber)
                      .replace('{message}', messageText?.substring(0, 200) || '')
                      .replace('{time}', now.toLocaleString('pt-BR'));

                    await uazapiSendText(instanceName, company.courseNotificationContact, notificationMessage);
                    console.log('✅ [COURSE-NOTIFICATION] Notification sent');
                  }

                  // Mark course as sent to this client (to avoid duplicate sends)
                  if (conversation) {
                    await storage.updateConversation(conversation.id, {
                      courseSentAt: new Date(),
                      takeoverMode: shouldPauseCourseAI ? 'human' : 'agent',
                      lastMessageAt: new Date(),
                    });
                    console.log('✅ [COURSE-NOTIFICATION] Marked courseSentAt to prevent future duplicate sends');
                    if (shouldPauseCourseAI) {
                      console.log(`✅ [COURSE-NOTIFICATION] AI paused for ${courseTimeoutValue} minutes`);
                    }
                  }
                }
              } catch (error) {
                console.error('❌ [COURSE-PDF] Error in course PDF process:', error);
              }

              // Return - don't let AI respond
              earlyWebhookLocks.delete(earlyLockKey);
              return res.status(200).json({
                received: true,
                processed: true,
                reason: 'Course PDF sent directly'
              });
            }

            // If no PDFs available, let AI respond normally
            // Store data for post-AI processing (notification only)
            (req as any).courseNotificationData = {
              shouldSendNotification: true,
              shouldPauseAI: shouldPauseCourseAI,
              timeoutMinutes: courseTimeoutValue,
              contactName: message.pushName || phoneNumber,
              phoneNumber: phoneNumber,
              messageText: messageText,
              courseNotificationContact: company.courseNotificationContact,
              courseNotificationMessage: company.courseNotificationMessage,
              instanceName: instanceName,
              coursePdfsToSend: [],
              coursesDescription: company.coursesDescription,
              companyName: company.fantasyName
            };

            // Create conversation if it doesn't exist
            if (!conversation) {
              conversation = await storage.createConversation({
                companyId: whatsappInstance.companyId,
                whatsappInstanceId: whatsappInstance.id,
                phoneNumber: phoneNumber,
                contactName: message.pushName || phoneNumber,
                lastMessageAt: new Date(),
                takeoverMode: 'agent'
              });
            }
          }

          // ========================================
          // Continue with normal AI processing below
          // ========================================

          // Process audio message if present
          if (isAudioMessage) {
            console.log('🎵 Processing audio message...');
            console.log('📊 Message structure keys:', Object.keys(message || {}).join(', '));
            const uazRaw = message._uazapiRaw || message.message?.audioMessage || {};
            console.log('📊 UAZAPI raw message keys:', Object.keys(uazRaw).join(', '));
            console.log('📊 UAZAPI raw messageType:', uazRaw.messageType, '| fileURL:', uazRaw.fileURL?.substring(0, 80) || 'none');
            try {
              let transcriptionText: string | null = null;
              let audioBase64: string | null = null;

              const globalSettings = await storage.getGlobalSettings();
              const instanceData = whatsappInstance?.instanceToken ? { token: whatsappInstance.instanceToken, instanceName } : null;
              const msgId = uazRaw.messageid || message.key?.id || uazRaw.id || '';
              console.log('🔑 [AUDIO] Using message ID for download:', msgId);

              // ============================================
              // Method 1: UAZAPI /message/download with built-in transcription
              // This is the most reliable method - UAZAPI downloads and transcribes in one call
              // ============================================
              if (!transcriptionText && globalSettings?.uazapiUrl && instanceData?.token && msgId) {
                try {
                  console.log('🔄 Method 1: UAZAPI /message/download with transcription...');
                  const baseUrl = globalSettings.uazapiUrl.replace(/\/+$/, '');
                  const downloadResponse = await fetch(`${baseUrl}/message/download`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'token': instanceData.token
                    },
                    body: JSON.stringify({
                      id: msgId,
                      transcribe: true,
                      return_base64: true,
                      return_link: false,
                      generate_mp3: true,
                      ...(company.openaiApiKey ? { openai_apikey: company.openaiApiKey } : {})
                    })
                  });

                  if (downloadResponse.ok) {
                    const downloadData = await downloadResponse.json();
                    console.log('📥 UAZAPI download response keys:', Object.keys(downloadData).join(', '));

                    // UAZAPI returns transcription in 'transcription' field
                    if (downloadData.transcription) {
                      transcriptionText = downloadData.transcription;
                      console.log('✅ Method 1 succeeded - UAZAPI transcribed audio directly');
                      console.log('📝 Transcription:', transcriptionText);
                    }

                    // Also grab base64Data (field name per UAZAPI OpenAPI spec) as fallback
                    if (!transcriptionText) {
                      audioBase64 = downloadData.base64Data || downloadData.base64 || downloadData.file?.base64 || null;
                      if (audioBase64) {
                        console.log('✅ Method 1 - Got base64 audio data, length:', audioBase64.length);
                      }
                    }
                  } else {
                    const errText = await downloadResponse.text().catch(() => '');
                    console.log('⚠️ Method 1 failed:', downloadResponse.status, errText.substring(0, 200));
                  }
                } catch (error) {
                  console.log('⚠️ Method 1 error:', error);
                }
              }

              // ============================================
              // Method 2: Try base64 from webhook payload (some UAZAPI configs send it)
              // ============================================
              if (!transcriptionText && !audioBase64) {
                audioBase64 = message.base64
                  || message.message?.base64
                  || uazRaw.base64
                  || uazRaw.audio
                  || null;
                if (audioBase64) {
                  console.log('✅ Method 2 - Found base64 in webhook payload, length:', audioBase64.length);
                }
              }

              // ============================================
              // Method 3: Download from fileURL (UAZAPI includes this in webhook message)
              // ============================================
              if (!transcriptionText && !audioBase64) {
                const audioFileUrl = uazRaw.fileURL || uazRaw.url || uazRaw.mediaUrl || message.message?.audioMessage?.url;
                if (audioFileUrl) {
                  try {
                    console.log('🔄 Method 3: Downloading from fileURL:', audioFileUrl.substring(0, 80));
                    const urlDownloadResponse = await fetch(audioFileUrl);
                    if (urlDownloadResponse.ok) {
                      const audioBuffer = await urlDownloadResponse.arrayBuffer();
                      audioBase64 = Buffer.from(audioBuffer).toString('base64');
                      console.log('✅ Method 3 succeeded - Audio downloaded from fileURL, length:', audioBase64.length);
                    } else {
                      console.log('⚠️ Method 3 failed:', urlDownloadResponse.status);
                    }
                  } catch (error) {
                    console.log('⚠️ Method 3 error:', error);
                  }
                }
              }

              // ============================================
              // Transcribe with OpenAI Whisper if we have base64 but no transcription yet
              // ============================================
              if (!transcriptionText && audioBase64) {
                console.log('🔊 Audio base64 available, transcribing with OpenAI Whisper...');

                if (!company.openaiApiKey) {
                  console.log('❌ Company does not have OpenAI API key configured for audio transcription');
                  return res.status(400).json({ error: 'OpenAI not configured for this company' });
                }

                transcriptionText = await transcribeAudio(audioBase64, company.openaiApiKey);
                if (transcriptionText) {
                  console.log('✅ Whisper transcription succeeded:', transcriptionText);
                } else {
                  console.log('❌ Whisper transcription failed');
                }
              }

              // ============================================
              // Use transcription or send fallback
              // ============================================
              if (transcriptionText) {
                messageText = transcriptionText;
                console.log('✅ Audio transcribed successfully:', messageText);
              } else {
                console.log('❌ Failed to transcribe audio, sending fallback response');
                const fallbackResponse = "Desculpe, não consegui entender o áudio que você enviou. Pode escrever sua mensagem por texto, por favor? 📝";

                try {
                  let formattedPhoneForFallback = phoneNumber.replace(/\D/g, '');
                  if (!formattedPhoneForFallback.startsWith('55') && formattedPhoneForFallback.length >= 10) {
                    formattedPhoneForFallback = '55' + formattedPhoneForFallback;
                  }

                  await uazapiSendTyping(instanceName, formattedPhoneForFallback, 2000);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  const fallbackUAZAPIResponse = await uazapiSendText(instanceName, formattedPhoneForFallback, fallbackResponse);

                  if (fallbackUAZAPIResponse.ok) {
                    console.log('✅ Fallback response sent for failed audio transcription');
                    // Registrar no cache para detectar eco no Chatwoot
                    if (conversation) {
                      cacheAIResponse(conversation.id, fallbackResponse);
                    }
                    earlyWebhookLocks.delete(earlyLockKey);
                    return res.status(200).json({
                      received: true,
                      processed: true,
                      reason: 'Audio transcription failed, fallback response sent'
                    });
                  } else {
                    console.error('❌ Failed to send fallback response via UAZAPI');
                    earlyWebhookLocks.delete(earlyLockKey);
                    return res.status(200).json({ received: true, processed: false, reason: 'Audio transcription and fallback failed' });
                  }
                } catch (sendError) {
                  console.error('❌ Failed to send fallback response:', sendError);
                  earlyWebhookLocks.delete(earlyLockKey);
                  return res.status(200).json({ received: true, processed: false, reason: 'Audio transcription and fallback failed' });
                }
              }
            } catch (error) {
              console.error('❌ Error processing audio:', error);
              earlyWebhookLocks.delete(earlyLockKey);
              return res.status(200).json({ received: true, processed: false, reason: 'Audio processing error' });
            }
          }
          
          console.log('💬 Message text:', messageText);
          console.log('🔍 DEBUG - Checking if message is SIM/OK:', {
            message: messageText,
            trimmed: messageText?.trim(),
            lowercase: messageText?.toLowerCase().trim(),
            isSIM: messageText?.toLowerCase().trim() === 'sim',
            matchesSIMPattern: /\b(sim|ok|confirmo)\b/i.test(messageText?.toLowerCase().trim() || '')
          });

          if (messageText) {
            console.log('✅ Message content found, proceeding with AI processing...');
            // Find company by instance name
            console.log('🔍 Searching for instance:', instanceName);
            const whatsappInstance = await storage.getWhatsappInstanceByNameOnly(instanceName);
            if (!whatsappInstance) {
              console.log(`❌ WhatsApp instance ${instanceName} not found`);
              earlyWebhookLocks.delete(earlyLockKey);
              return res.status(404).json({ error: 'Instance not found' });
            }
            console.log('✅ Found instance:', whatsappInstance.id);

            console.log('🏢 Searching for company:', whatsappInstance.companyId);
            const company = await storage.getCompany(whatsappInstance.companyId);
            if (!company || !company.aiAgentPrompt) {
              console.log(`❌ Company or AI prompt not found for instance ${instanceName}`);
              console.log('Company:', company ? 'Found' : 'Not found');
              console.log('AI Prompt:', company?.aiAgentPrompt ? 'Configured' : 'Not configured');
              earlyWebhookLocks.delete(earlyLockKey);
              return res.status(404).json({ error: 'Company or AI prompt not configured' });
            }
            console.log('✅ Found company and AI prompt configured');
            console.log('📍 Google Maps Location:', company.googleMapsLocation ? `Configured: ${company.googleMapsLocation.substring(0, 50)}...` : 'Not configured');

            // ========================================
            // ⏰ CANCELAR TIMER DE LEMBRETE DE CONFIRMAÇÃO
            // Se o usuário enviou qualquer mensagem, cancelar o timer pendente
            // ========================================
            const confirmTimerKey = `${company.id}:${phoneNumber}`;
            if (pendingConfirmationTimers.has(confirmTimerKey)) {
              const pending = pendingConfirmationTimers.get(confirmTimerKey)!;
              clearTimeout(pending.timer);
              pendingConfirmationTimers.delete(confirmTimerKey);
              console.log(`⏰ Timer de lembrete de confirmação CANCELADO para ${confirmTimerKey}`);
            }

            // ========================================
            // 💬 CANCELAR TIMER DE FOLLOW-UP DE CONVERSA
            // Se o cliente respondeu, cancelar o timer de follow-up e resetar flag
            // ========================================
            const followUpKey = `${company.id}:${phoneNumber}`;
            if (conversationFollowUpTimers.has(followUpKey)) {
              const pendingFollowUp = conversationFollowUpTimers.get(followUpKey)!;
              clearTimeout(pendingFollowUp.timer);
              conversationFollowUpTimers.delete(followUpKey);
              console.log(`💬 Timer de follow-up de conversa CANCELADO para ${followUpKey}`);
            }
            // Resetar flag de follow-up enviado quando o cliente responde (permite novo ciclo)
            conversationFollowUpSent.delete(followUpKey);

            // ========================================
            // ⏸️  CHECK IF AI AGENT IS PAUSED FOR THIS COMPANY
            // ========================================
            if (company.agentPaused === 1 || company.agentPaused === true) {
              console.log('⏸️  AI agent is PAUSED for this company - skipping processing');
              console.log('💾 Saving message to database but not generating AI response');

              // Still save the message to database for record keeping
              const messageTimestamp = message.messageTimestamp
                ? new Date(message.messageTimestamp * 1000)
                : new Date();

              await storage.createMessage({
                conversationId: conversation?.id || 0,
                messageId: message.key?.id || `msg_${Date.now()}`,
                content: messageText,
                role: 'user',
                messageType: message.messageType || 'text',
                timestamp: messageTimestamp,
              });

              earlyWebhookLocks.delete(earlyLockKey);
              return res.status(200).json({
                received: true,
                processed: false,
                reason: 'AI agent paused for this company'
              });
            }

            // Check company's OpenAI configuration
            if (!company.openaiApiKey) {
              console.log('❌ Company does not have OpenAI API key configured');
              earlyWebhookLocks.delete(earlyLockKey);
              return res.status(400).json({ error: 'OpenAI not configured for this company' });
            }

            // Get global settings for UAZAPI
            const globalSettings = await storage.getGlobalSettings();
            if (!globalSettings.uazapiUrl || !globalSettings.uazapiAdminToken) {
              console.log('❌ UAZAPI not configured');
              earlyWebhookLocks.delete(earlyLockKey);
              return res.status(400).json({ error: 'UAZAPI not configured' });
            }

            try {
              // Find or create conversation - prioritize most recent conversation for this phone number
              console.log('💬 Managing conversation for:', phoneNumber);
              
              // First, try to find existing conversation for this exact instance
              let conversation = await storage.getConversation(company.id, whatsappInstance.id, phoneNumber);
              
              // If no conversation for this instance, look for any recent conversation for this phone number
              if (!conversation) {
                console.log('🔍 Nenhuma conversa para esta instância, verificando conversas recentes para o número');
                const allConversations = await storage.getConversationsByCompany(company.id);
                const phoneConversations = allConversations
                  .filter(conv => conv.phoneNumber === phoneNumber)
                  .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
                
                // ================================================================
                // DETECÇÃO DE CONFIRMAÇÃO DE AGENDAMENTO
                // ================================================================
                // Este regex detecta se o cliente está confirmando um agendamento.
                // Usa \b (word boundary) para encontrar a palavra em qualquer posição da frase.
                //
                // COMO ADICIONAR NOVAS VARIAÇÕES:
                // Se um cliente confirmar de uma forma não reconhecida, adicione a palavra/frase
                // dentro do grupo (|nova_palavra|outra_frase) no regex abaixo.
                // Exemplos de confirmações que já foram adicionadas por clientes reais:
                // - "sim tudo certo" (contém "sim" e "certo")
                // - "ok, tudo certo" (contém "ok" e "certo")
                // - "sim, confirmo" (contém "sim" e "confirmo")
                //
                // Se o regex não reconhecer, o fallback com IA será acionado automaticamente.
                // ================================================================
                const normalizedMessage = messageText.toLowerCase().trim();
                const isSimpleConfirmation = /\b(sim|sin|sím|sii|sim sim|ok|confirmo|confirma|confirmar|confirmado|combinado|pode ser|tudo certo|tudo correto|tá bom|ta bom|com certeza|claro|positivo|afirmativo)\b/i.test(normalizedMessage);

                // Special case: if user is responding with payment method choice (PIX or CARTÃO)
                const normalizedPaymentResponse = messageText.toLowerCase().trim().replace(/[!?.,:;'"]+$/g, '');
                const isPaymentMethodChoice = /^(1|2|pix|cartão|cartao|credito|crédito|credit|cart[aã]o\s*(de\s*cr[eé]dito)?|quero\s*(o\s*)?(pix|cart[aã]o)|pagar\s*(com|no|via)\s*(pix|cart[aã]o)|no\s*(pix|cart[aã]o)|via\s*(pix|cart[aã]o))$/i.test(normalizedPaymentResponse);
                const isPix = /\b(1|pix)\b/i.test(normalizedPaymentResponse) && !/cart[aã]o|credito|crédito|credit/i.test(normalizedPaymentResponse);
                const chosenPaymentMethod = isPaymentMethodChoice ?
                  (isPix ? 'PIX' : 'CREDIT_CARD') : null;

                if (isPaymentMethodChoice) {
                  console.log('💳 Detectada resposta de forma de pagamento:', chosenPaymentMethod);
                }

                // ================================================================
                // FALLBACK COM IA: Se o regex não reconhecer como confirmação,
                // usa a IA para interpretar a intenção da mensagem.
                // Isso só é acionado quando:
                // 1. O regex NÃO reconheceu a mensagem como confirmação
                // 2. Existe uma conversa recente com resumo de agendamento pendente
                // Assim reduz custos, pois a IA só é chamada quando necessário.
                // ================================================================
                let confirmationDetected = isSimpleConfirmation;

                if (!confirmationDetected && phoneConversations.length > 0 && company.openaiApiKey) {
                  // Verificar se há uma conversa com resumo de agendamento aguardando confirmação
                  const hasAwaitingConfirmation = await (async () => {
                    for (const conv of phoneConversations) {
                      const recentMessages = await storage.getMessagesByConversation(conv.id);
                      const lastAiMessage = recentMessages.filter(m => m.role === 'assistant')[0];
                      if (lastAiMessage && (
                        lastAiMessage.content.includes('Confirma') ||
                        lastAiMessage.content.includes('confirma') ||
                        lastAiMessage.content.includes('📅') ||
                        lastAiMessage.content.includes('Serviço:') ||
                        lastAiMessage.content.includes('Data:')
                      )) {
                        return true;
                      }
                    }
                    return false;
                  })();

                  if (hasAwaitingConfirmation) {
                    try {
                      console.log('🤖 Regex não reconheceu - usando IA como fallback para detectar confirmação...');
                      const OpenAI = (await import('openai')).default;
                      const openaiForConfirmation = new OpenAI({ apiKey: company.openaiApiKey });
                      const confirmationCheck = await openaiForConfirmation.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [
                          {
                            role: 'system',
                            content: 'Você é um classificador de intenção. Responda APENAS "SIM" ou "NAO". Nada mais.'
                          },
                          {
                            role: 'user',
                            content: `A seguinte mensagem de um cliente é uma confirmação/concordância com algo que foi proposto? Mensagem: "${normalizedMessage}"`
                          }
                        ],
                        max_tokens: 5,
                        temperature: 0
                      });
                      const aiAnswer = confirmationCheck.choices[0]?.message?.content?.trim().toUpperCase() || '';
                      confirmationDetected = aiAnswer.includes('SIM');
                      console.log(`🤖 IA respondeu: "${aiAnswer}" → confirmação: ${confirmationDetected}`);
                    } catch (aiError) {
                      console.error('❌ Erro no fallback de IA para confirmação:', aiError);
                      // Em caso de erro, não bloquear o fluxo
                    }
                  }
                }

                if (confirmationDetected && phoneConversations.length > 0) {
                  // Check if confirmation is in reschedule context - if so, skip booking flow
                  let isInRescheduleContext = false;
                  for (const conv of phoneConversations) {
                    const recentMsgs = await storage.getMessagesByConversation(conv.id);
                    const lastAiMsg = recentMsgs.filter(m => m.role === 'assistant')[0];
                    if (lastAiMsg) {
                      const msg = lastAiMsg.content;
                      // Verificar se é um lembrete de confirmação (não deve ser tratado como reagendamento)
                      const isReminderMsg = msg.includes('agendamento ainda não foi confirmado') ||
                        (msg.includes('Basta responder') && msg.includes('para confirmar')) ||
                        (msg.includes('responder') && msg.includes('SIM') && msg.includes('confirmar') && !msg.includes('cancelar'));
                      if (!isReminderMsg && (msg.includes('mudar seu agendamento') || msg.includes('mudar o agendamento') ||
                          msg.includes('reagendar') || msg.includes('remarcar') ||
                          msg.includes('trocar o dia') || msg.includes('trocar a data') ||
                          msg.includes('trocar o horário') || msg.includes('trocar o horario') ||
                          msg.includes('alterar o agendamento') || msg.includes('alterar seu agendamento') ||
                          msg.includes('adiar') || msg.includes('mudar para') ||
                          msg.includes('Para reagendar') || msg.includes('necessário cancelar o agendamento atual') ||
                          (msg.includes('mudar') && msg.includes('agendamento')) ||
                          (msg.includes('alterar') && msg.includes('agendamento')))) {
                        isInRescheduleContext = true;
                        console.log('🔄 Confirmação detectada em contexto de reagendamento - ignorando busca de agendamento');
                        break;
                      }
                    }
                  }

                  if (!isInRescheduleContext) {
                    // Look for conversation with recent AI confirmation message
                    for (const conv of phoneConversations) {
                      const recentMessages = await storage.getMessagesByConversation(conv.id);
                      // Query retorna DESC, então [0] é a mais recente
                      const lastAiMessage = recentMessages.filter(m => m.role === 'assistant')[0];

                      if (lastAiMessage && lastAiMessage.content.includes('confirmado')) {
                        conversation = conv;
                        console.log('✅ Encontrada conversa com confirmação da IA ID:', conversation.id);
                        break;
                      }
                    }
                  }
                }

                // If not found or not a confirmation, use most recent
                if (!conversation && phoneConversations.length > 0) {
                  conversation = phoneConversations[0];
                  console.log('✅ Usando conversa mais recente ID:', conversation.id);
                }
                
                if (conversation) {
                  // Update the conversation to use current instance
                  await storage.updateConversation(conversation.id, {
                    whatsappInstanceId: whatsappInstance.id,
                    lastMessageAt: new Date(),
                    contactName: message.pushName || conversation.contactName,
                  });
                }
              }
              
              if (!conversation) {
                console.log('🆕 Creating new conversation');
                conversation = await storage.createConversation({
                  companyId: company.id,
                  whatsappInstanceId: whatsappInstance.id,
                  phoneNumber: phoneNumber,
                  contactName: message.pushName || undefined,
                  lastMessageAt: new Date(),
                });
              } else {
                // Update last message timestamp
                console.log('♻️ Updating existing conversation');
                await storage.updateConversation(conversation.id, {
                  lastMessageAt: new Date(),
                  contactName: message.pushName || conversation.contactName,
                });
              }

              // ========================================
              // 📨 VERIFICAR LOCK ANTES DE SALVAR MENSAGEM
              // ========================================
              // Lock inclui companyId para isolar por empresa (mesmo número em empresas diferentes não conflita)
              const lockKey = `${company.id}:${instanceName}:${phoneNumber}`;
              console.log(`🔍 Lock key: ${lockKey}`);
              console.log(`🔍 Lock atual: ${processingLocks.get(lockKey) ? 'ATIVO' : 'LIVRE'}`);

              // 🔓 TIMEOUT AUTOMÁTICO DO LOCK: Se o lock estiver ativo há mais de 2 minutos, liberar automaticamente
              const lockTimeout = 2 * 60 * 1000; // 2 minutos em ms
              const lastLockTime = lastMessageTime.get(lockKey);
              if (processingLocks.get(lockKey) && lastLockTime) {
                const lockAge = Date.now() - lastLockTime;
                if (lockAge > lockTimeout) {
                  console.log(`⚠️ LOCK EXPIRADO! Lock ativo há ${Math.round(lockAge / 1000)}s (máximo: ${lockTimeout / 1000}s)`);
                  console.log(`🔓 Liberando lock expirado automaticamente: ${lockKey}`);
                  processingLocks.delete(lockKey);
                  lastMessageTime.delete(lockKey);
                }
              }

              // Se já está processando, apenas salvar mensagem e retornar
              if (processingLocks.get(lockKey)) {
                // 🔓 Liberar early lock - a mensagem será enfileirada pelo lock principal
                earlyWebhookLocks.delete(earlyLockKey);

                console.log('⏱️  ❌ LOCK ATIVO - Salvando mensagem mas NÃO processando');

                const messageTimestamp = message.messageTimestamp
                  ? new Date(message.messageTimestamp * 1000)
                  : new Date();

                await storage.createMessage({
                  conversationId: conversation.id,
                  messageId: message.key?.id || `msg_${Date.now()}`,
                  content: messageText,
                  role: 'user',
                  messageType: message.messageType || 'text',
                  timestamp: messageTimestamp,
                });

                lastMessageTime.set(lockKey, Date.now());
                console.log('✅ Mensagem salva (aguardando agrupamento)');
                return res.status(200).json({ received: true, queued: true });
              }

              // Marcar como processando ANTES de qualquer operação async
              console.log('🔒 Marcando lock como ATIVO (primeira mensagem)');
              processingLocks.set(lockKey, true);
              lastMessageTime.set(lockKey, Date.now());
              // 🔓 Liberar early lock - o lock principal agora está ativo
              earlyWebhookLocks.delete(earlyLockKey);
              console.log(`🔍 Lock marcado! Estado: ${processingLocks.get(lockKey) ? 'ATIVO' : 'LIVRE'}`);

              // Save user message
              console.log('💾 Salvando primeira mensagem no banco');
              console.log('🕐 Message timestamp raw:', message.messageTimestamp);

              const messageTimestamp = message.messageTimestamp
                ? new Date(message.messageTimestamp * 1000)
                : new Date();

              console.log('🕐 Processed timestamp:', messageTimestamp.toISOString());

              await storage.createMessage({
                conversationId: conversation.id,
                messageId: message.key?.id || `msg_${Date.now()}`,
                content: messageText,
                role: 'user',
                messageType: message.messageType || 'text',
                timestamp: messageTimestamp,
              });

              // ========================================
              // 📨 DEBOUNCE: Aguardar até que o cliente pare de enviar mensagens
              // Reseta o timer a cada nova mensagem (máximo 60s de espera total)
              // ========================================
              const DEBOUNCE_INTERVAL_MS = 7000;    // 7 segundos entre verificações
              const MAX_DEBOUNCE_ITERATIONS = 12;   // 12 x 5s = 60 segundos máximo

              let debounceIteration = 0;
              let lastKnownActivity = lastMessageTime.get(lockKey) || Date.now();

              while (debounceIteration < MAX_DEBOUNCE_ITERATIONS) {
                debounceIteration++;
                console.log(`⏱️ Debounce: Aguardando ${DEBOUNCE_INTERVAL_MS / 1000}s (iteração ${debounceIteration}/${MAX_DEBOUNCE_ITERATIONS})...`);

                await new Promise(resolve => setTimeout(resolve, DEBOUNCE_INTERVAL_MS));

                // Verificar se novas mensagens chegaram via Map em memória
                // O caminho "queued" (linha ~7759) atualiza lastMessageTime a cada mensagem nova
                const latestActivity = lastMessageTime.get(lockKey) || 0;

                if (latestActivity <= lastKnownActivity) {
                  console.log(`✅ Debounce: Nenhuma mensagem nova detectada após ${debounceIteration * DEBOUNCE_INTERVAL_MS / 1000}s. Processando.`);
                  break;
                }

                console.log(`⏱️ Debounce: Nova(s) mensagem(ns) detectada(s). Resetando timer...`);
                lastKnownActivity = latestActivity;
              }

              if (debounceIteration >= MAX_DEBOUNCE_ITERATIONS) {
                console.log(`⚠️ Debounce: Limite máximo atingido (${MAX_DEBOUNCE_ITERATIONS} iterações = ${MAX_DEBOUNCE_ITERATIONS * DEBOUNCE_INTERVAL_MS / 1000}s). Processando mensagens acumuladas.`);
              }

              // Agrupar TODAS as mensagens do usuário desde a última resposta do assistente
              // Substitui a janela rígida de 6 segundos por um limite lógico de contexto
              const allRecentMessages = await storage.getRecentMessages(conversation.id, 50);
              const lastAssistantIndex = allRecentMessages.findIndex(m => m.role === 'assistant');
              const userMessagesSinceLastAssistant = (lastAssistantIndex === -1
                ? allRecentMessages.filter(m => m.role === 'user')
                : allRecentMessages.slice(0, lastAssistantIndex).filter(m => m.role === 'user')
              );

              const messagesToGroup = userMessagesSinceLastAssistant
                .reverse()  // Ordem cronológica (mais antiga primeiro) - getRecentMessages retorna DESC
                .map(m => m.content);

              if (messagesToGroup.length > 1) {
                messageText = messagesToGroup.join('\n');
                console.log(`✅ ${messagesToGroup.length} mensagens agrupadas via debounce: "${messageText.substring(0, 200)}${messageText.length > 200 ? '...' : ''}"`);
              } else if (messagesToGroup.length === 1) {
                messageText = messagesToGroup[0];
                console.log('✅ Mensagem única, processando normalmente');
              } else {
                console.log('⚠️ Nenhuma mensagem do usuário encontrada para processar');
              }

              // Get conversation history (last 15 messages for context)
              console.log('📚 Loading conversation history');
              const recentMessages = await storage.getRecentMessages(conversation.id, 15);

              // Build conversation context for AI, filtering out old confirmation messages
              // to avoid AI getting confused and sending duplicate confirmations
              const conversationHistory = recentMessages
                .reverse() // Oldest first
                .filter(msg => {
                  // Filter out system messages (internal markers like PENDING_CANCEL_ID)
                  if (msg.role === 'system' || !msg.role || msg.role === '') {
                    return false;
                  }
                  // Filter out internal pending markers
                  if (msg.content.includes('[PENDING_CANCEL_ID:') || msg.content.includes('[PENDING_RESCHEDULE_ID:')) {
                    return false;
                  }
                  // Filter out messages that are confirmations of already-created appointments
                  if (msg.role === 'assistant') {
                    const isOldConfirmation = msg.content.includes('Agendamento Confirmado!') ||
                                              msg.content.includes('Obrigado por escolher nossos serviços');
                    if (isOldConfirmation) {
                      console.log('🔄 Filtering out old confirmation message from AI context');
                      return false;
                    }
                  }
                  return true;
                })
                .map((msg, index, array) => {
                  // Detect human interventions: if conversation was in human takeover mode
                  // and this is an assistant message, it might be from a human
                  // We detect this by checking if there's a pattern of human intervention
                  const isLikelyHumanMessage = msg.role === 'assistant' &&
                    conversation.takeoverMode === 'human' &&
                    // Check if this message doesn't look like an AI response
                    !msg.content.includes('Perfeito!') &&
                    !msg.content.includes('Está tudo correto?') &&
                    !msg.content.includes('Responda SIM') &&
                    !msg.content.includes('👤') &&
                    !msg.content.includes('📅');

                  if (isLikelyHumanMessage) {
                    console.log('👨‍💼 Detected likely human intervention message:', msg.content.substring(0, 50));
                    // Add marker to help AI understand this was sent by a human attendant
                    return {
                      role: msg.role as 'user' | 'assistant',
                      content: `[MENSAGEM DO ATENDENTE HUMANO]: ${msg.content}`
                    };
                  }

                  return {
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content
                  };
                });

              // Get available professionals and services for this company
              const professionals = await storage.getProfessionalsByCompany(company.id);
              const activeProfessionals = professionals.filter(prof => prof.active && !prof.archived);
              const availableProfessionals = activeProfessionals
                .map(prof => `- ${prof.name}`)
                .join('\n');

              // Check if auto-select professional is enabled and there's only one professional
              const autoSelectEnabled = company.autoSelectProfessional === 1;
              const hasOnlyOneProfessional = activeProfessionals.length === 1;
              const shouldAutoSelect = autoSelectEnabled && hasOnlyOneProfessional;

              const services = await storage.getServicesByCompany(company.id);

              // Detect if a professional was mentioned in the LAST USER message only
              const userMessages = conversationHistory.filter(m => m.role === 'user');
              const lastUserMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1].content.toLowerCase() : '';

              let selectedProfessional = null;

              // Auto-select professional if enabled and only one exists
              if (shouldAutoSelect) {
                selectedProfessional = activeProfessionals[0];
              } else {
                // Check if the last user message mentions a specific professional (only active, non-archived)
                for (const prof of activeProfessionals) {
                  if (lastUserMessage.includes(prof.name.toLowerCase())) {
                    selectedProfessional = prof;
                    break;
                  }
                }
              }

              // Filter services based on selected professional
              let filteredServices = services.filter(service => service.isActive !== false);

              if (selectedProfessional) {
                // Show only services for this professional OR global services (professionalId = null)
                filteredServices = filteredServices.filter(service => {
                  const isGlobal = !service.professionalId;
                  const isForProfessional = service.professionalId === selectedProfessional.id;
                  return isGlobal || isForProfessional;
                });
              }

              // Função auxiliar para formatar duração
              const formatDuration = (minutes: number): string => {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                let result = '';
                if (hours > 0) result += `${hours}h`;
                if (mins > 0) result += `${mins}min`;
                return result || '0min';
              };

              // Lista de serviços COM duração (CRÍTICO para IA calcular sobreposição)
              const availableServices = filteredServices
                .map(service => {
                  const duration = service.duration || 60;
                  const durationText = formatDuration(duration);
                  return `- ${service.name} (${durationText})`;
                })
                .join('\n');

              // Lista de serviços COM preços E duração - para quando o cliente perguntar
              const availableServicesWithPrices = filteredServices
                .map(service => {
                  const duration = service.duration || 60;
                  const durationText = formatDuration(duration);
                  const priceText = service.price ? ` - R$ ${service.price}` : '';
                  return `- ${service.name} (${durationText})${priceText}`;
                })
                .join('\n');

              // Get existing appointments to check availability
              const existingAppointments = await storage.getAppointmentsByCompany(company.id);

              // Create availability context for AI with intelligent detection and caching
              // NOVO: Passa os serviços para gerar disponibilidade PRÉ-CALCULADA
              const availabilityInfo = await getAvailabilityInfoSmart(
                messageText,
                conversationHistory,
                professionals,
                existingAppointments,
                company.id,
                false, // forceRefresh
                filteredServices // serviços para cálculo pré-calculado
              );

              if (availabilityInfo) {
                console.log('📋 Professional availability info generated:', availabilityInfo);
              }

              // Check if user mentioned a specific date beyond 7 days and get real-time availability
              const specificDateInfo = await checkSpecificDateAvailability(
                messageText,
                conversationHistory,
                professionals,
                existingAppointments
              );

              if (specificDateInfo) {
                console.log('📅 Specific date availability info generated:', specificDateInfo.substring(0, 200));
              }

              // Generate AI response with conversation context
              const OpenAI = (await import('openai')).default;

              // Use company's OpenAI configuration
              // OpenAI API Key check

              if (!company.openaiApiKey) {
                console.log('❌ Company does not have OpenAI API key configured');
                return res.status(400).json({ error: 'OpenAI API key not configured for this company' });
              }

              const openai = new OpenAI({ apiKey: company.openaiApiKey });

              // Add current date context for accurate AI responses
              const today = getBrazilDate(); // Use Brazil timezone
              const getNextWeekdayDateForAI = (dayName: string): string => {
                const dayMap: { [key: string]: number } = {
                  'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3,
                  'quinta': 4, 'sexta': 5, 'sábado': 6
                };

                const targetDay = dayMap[dayName.toLowerCase()];
                if (targetDay === undefined) return '';

                const date = new Date();
                const currentDay = date.getDay();
                let daysUntilTarget = targetDay - currentDay;

                // Se o dia alvo é hoje, usar o próximo
                if (daysUntilTarget === 0) {
                  daysUntilTarget = 7; // Próxima semana
                }

                // Se o dia já passou esta semana, pegar a próxima ocorrência
                if (daysUntilTarget < 0) {
                  daysUntilTarget += 7;
                }

                date.setDate(date.getDate() + daysUntilTarget);
                return date.toLocaleDateString('pt-BR');
              };

              // Gerar exemplo dinâmico para cancelamento/remarcação
              const exampleService = filteredServices[0]?.name || 'seu serviço';
              const exampleProfessional = professionals.find(p => p.active)?.name || 'profissional';
              const rescheduleExample = `15/12/2025 às 14:00, ${exampleService} com ${exampleProfessional}`;

              // Verificar se Asaas está habilitado para esta empresa
              const companyAsaasConfig = await storage.getCompany(company.id);
              const isAsaasEnabled = companyAsaasConfig?.asaasEnabled && companyAsaasConfig?.asaasApiKey;

              // Instruções de pagamento (só adicionadas se Asaas estiver habilitado)
              const asaasPaymentInstructions = isAsaasEnabled ? `
- REGRA DE PAGAMENTO OBRIGATÓRIA:
  * APÓS o cliente confirmar com SIM/OK/CONFIRMO, NÃO confirme o agendamento ainda
  * Pergunte a forma de pagamento: "Ótimo! Como você prefere pagar?\\n\\n1️⃣ PIX (aprovação instantânea)\\n2️⃣ Cartão de Crédito (parcele em até 12x)\\n\\nDigite 1 para PIX ou 2 para Cartão."
  * AGUARDE o cliente responder com a forma de pagamento (1, 2, pix, cartão, etc.)
  * NÃO confirme o agendamento até o cliente escolher a forma de pagamento
  * Após o cliente escolher, responda: "Perfeito! Estou gerando seu [PIX/link de pagamento]. Aguarde um momento..."
  * O sistema enviará automaticamente o QR Code (para PIX) ou link (para cartão)
  * NUNCA diga que o agendamento foi confirmado antes do pagamento ser processado` : '';

              const systemPrompt = `${company.aiAgentPrompt}

Importante: Você está representando a empresa "${company.fantasyName}" via WhatsApp.

⚠️ REGRAS DE FORMATAÇÃO DE MENSAGENS:
- Envie APENAS texto simples, SEM formatação markdown
- NÃO use *negrito*, _itálico_ ou ~tachado~
- NÃO use formatação [texto](link) para links
- Envie URLs completas e diretas quando necessário
- Use emojis quando apropriado para deixar a conversa mais amigável

🤝 INTERVENÇÕES DE ATENDENTES HUMANOS:
- Algumas mensagens no histórico podem ter o prefixo "[MENSAGEM DO ATENDENTE HUMANO]:"
- Essas mensagens foram enviadas por um atendente real da empresa, NÃO por você
- Você DEVE considerar essas mensagens como parte do contexto da conversa
- Continue a conversa de forma natural, levando em conta tudo que o atendente humano disse
- Se o atendente humano já respondeu algo ao cliente, NÃO contradiga ou repita informações
- Use o contexto das mensagens do atendente para dar continuidade à conversa
- Exemplo: Se o atendente disse "Vou verificar isso para você", você pode dar continuidade sem repetir

INFORMAÇÕES DA EMPRESA:
- Nome: ${company.fantasyName}
- Endereço: ${[
  company.address,
  company.number ? `nº ${company.number}` : null,
  company.neighborhood,
  company.city && company.state ? `${company.city}/${company.state}` : company.city || company.state
].filter(Boolean).join(', ') || 'Não informado'}${company.googleMapsLocation ? `\n- Localização Google Maps: ${company.googleMapsLocation}` : ''}
- Telefone: ${company.phone || 'Não informado'}
- CEP: ${company.zipCode || 'Não informado'}${company.coursesDescription ? `\n\n🎓 ========================================\nINFORMAÇÕES SOBRE CURSOS (ENVIAR EXATAMENTE COMO ESTÁ):\n========================================\n${company.coursesDescription}` : ''}

Use essas informações para responder perguntas sobre localização, endereço, telefone e como chegar ao estabelecimento.${company.googleMapsLocation ? '\n\nIMPORTANTE: Quando o cliente perguntar sobre o endereço ou localização, além de informar o endereço completo, envie também o link do Google Maps para facilitar a navegação.\n\n⚠️ ATENÇÃO - FORMATO DE LINKS: Ao enviar o link do Google Maps, envie APENAS a URL completa SEM formatação markdown. NÃO use [texto](link). Envie o link direto, por exemplo: "Para facilitar, aqui está o link do Google Maps: https://maps.app.goo.gl/xxxxx"' : ''}${company.coursesDescription ? `\n\n🎓 ========================================\n⚠️ REGRAS CRÍTICAS - PERGUNTAS SOBRE CURSOS\n========================================\n\n🚨 REGRA ÚNICA - DESCRIÇÃO EXATA:\nQuando o cliente perguntar sobre cursos, você DEVE enviar as informações EXATAMENTE como estão cadastradas acima em "INFORMAÇÕES SOBRE CURSOS".\nNÃO resuma, NÃO reformule, NÃO omita detalhes. Copie e cole a informação INTEIRA.\n\n📄 NOTA: O sistema enviará automaticamente o PDF do curso após sua resposta. Você NÃO precisa mencionar o PDF na sua mensagem.` : ''}

HOJE É: ${today.toLocaleDateString('pt-BR')} (${['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][today.getDay()]})
HORÁRIO ATUAL: ${today.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

IMPORTANTE: NÃO aceite agendamentos para horários que já passaram! Se o cliente solicitar um horário que já passou hoje, explique que não é possível e sugira horários futuros disponíveis.

PRÓXIMOS DIAS DA SEMANA:
- Domingo: ${getNextWeekdayDateForAI('domingo')} 
- Segunda-feira: ${getNextWeekdayDateForAI('segunda')}
- Terça-feira: ${getNextWeekdayDateForAI('terça')}
- Quarta-feira: ${getNextWeekdayDateForAI('quarta')}
- Quinta-feira: ${getNextWeekdayDateForAI('quinta')}
- Sexta-feira: ${getNextWeekdayDateForAI('sexta')}
- Sábado: ${getNextWeekdayDateForAI('sábado')}

PROFISSIONAIS DISPONÍVEIS PARA AGENDAMENTO:
${availableProfessionals || 'Nenhum profissional cadastrado no momento'}

SERVIÇOS DISPONÍVEIS:
${availableServices || 'Nenhum serviço cadastrado no momento'}

PREÇOS DOS SERVIÇOS (use apenas quando o cliente PERGUNTAR especificamente sobre valores):
${availableServicesWithPrices || 'Nenhum serviço cadastrado no momento'}

${availabilityInfo}
${specificDateInfo}

═══════════════════════════════════════════════════════════════════
🚨 REGRA ABSOLUTAMENTE OBRIGATÓRIA - BUSCAR HORÁRIOS 🚨
═══════════════════════════════════════════════════════════════════

Quando o cliente informar a DATA desejada, você DEVE incluir na sua resposta o comando:
[MOSTRAR_HORARIOS_LIVRES:NOME_SERVICO:NOME_PROFISSIONAL:DATA_YYYY-MM-DD]

O sistema vai SUBSTITUIR esse comando pelos horários disponíveis automaticamente.

✅ COMO USAR:
1. Colete: SERVIÇO + PROFISSIONAL + DATA
2. Quando tiver a DATA, inclua o comando na resposta usando os NOMES exatos
3. O sistema mostrará os horários disponíveis

📋 EXEMPLO:
Cliente quer: "Corte de cabelo com Estevão amanhã" (amanhã = 31/01/2026)
→ Serviço: Corte de cabelo
→ Profissional: Estevão
→ Data: 2026-01-31

Sua resposta deve ser:
"Vou verificar os horários disponíveis para amanhã!

[MOSTRAR_HORARIOS_LIVRES:Corte de cabelo:Estevão:2026-01-31]"

APÓS o comando ser processado, o sistema vai retornar:
- Se HOUVER horários: uma lista de horários → aí sim você pergunta "Qual horário você prefere?"
- Se NÃO houver horários ou profissional não trabalha: uma mensagem COMPLETA já perguntando outro dia → NUNCA adicione "Qual horário você prefere?" pois não faz sentido!

⚠️ IMPORTANTE:
• Use o NOME EXATO do serviço e profissional (como aparecem nas listas acima)
• A data DEVE estar no formato YYYY-MM-DD (ex: 2026-01-31)
• NÃO invente horários - o comando retorna apenas horários REAIS
• Se "amanhã" = 31/01/2026, use 2026-01-31

🚨 REGRA CRÍTICA - MUDANÇA DE DATA:
Quando o cliente perguntar sobre OUTRO DIA (ex: "E sexta?", "E amanhã?", "Tem na segunda?"):
• SEMPRE use o comando [MOSTRAR_HORARIOS_LIVRES:...] com a NOVA data
• NUNCA repita os horários do dia anterior
• Cada dia tem disponibilidade DIFERENTE - você DEVE buscar novamente!

Exemplo:
- Cliente perguntou quinta → você usou o comando → mostrou horários de quinta
- Cliente pergunta "E sexta?" → você DEVE usar o comando novamente com a data de sexta!
- NUNCA copie os horários de quinta para sexta - são dias DIFERENTES!

🚫 REGRA ABSOLUTA: Se a mensagem de horários já contiver uma pergunta como "Qual outro dia seria melhor?" ou "Que tal escolher outro dia?", NUNCA adicione "Qual horário você prefere?" - a pergunta já foi feita!

═══════════════════════════════════════════════════════════════════
🕐 COMANDO ESPECIAL - VERIFICAR HORÁRIO NA SEMANA
═══════════════════════════════════════════════════════════════════

Quando o cliente perguntar se tem um HORÁRIO ESPECÍFICO disponível na semana (ex: "Tem 18:30?", "Quando tem às 17h?", "Algum dia tem 19:00?"):

Use o comando: [VERIFICAR_HORARIO_SEMANA:NOME_PROFISSIONAL:HH:MM]

📋 EXEMPLOS:
- Cliente: "Tem algum dia com horário às 18:30?"
  → Resposta: "Vou verificar! [VERIFICAR_HORARIO_SEMANA:Erica Alves:18:30]"

- Cliente: "Quando tem horário às 17h?"
  → Resposta: "Deixa eu verificar para você! [VERIFICAR_HORARIO_SEMANA:Estevão:17:00]"

O sistema vai retornar quais dias da semana têm esse horário disponível, considerando:
✅ Horários regulares de trabalho
✅ Horários EXCEPCIONAIS (dias com expediente diferente)
✅ Agendamentos já existentes
✅ Dias de folga

⚠️ Use este comando SEMPRE que o cliente perguntar sobre um horário específico sem mencionar um dia!

═══════════════════════════════════════════════════════════════════

🚨🚨🚨 ORDEM OBRIGATÓRIA DE COLETA DE DADOS - SIGA EXATAMENTE ESTA SEQUÊNCIA 🚨🚨🚨

${shouldAutoSelect ?
`ETAPA 1 - SERVIÇO (profissional único: ${activeProfessionals[0].name}):
   → Quando cliente quiser agendar, mostre a lista de serviços IMEDIATAMENTE
   → "Aqui estão os serviços disponíveis:\n[lista]\n\nQual serviço você gostaria?"
   → AGUARDE o cliente escolher o serviço`
:
`ETAPA 1 - PROFISSIONAL:
   → Quando cliente quiser agendar, mostre a lista de profissionais PRIMEIRO
   → "Temos os seguintes profissionais:\n[lista]\n\nCom qual você gostaria de agendar?"
   → AGUARDE o cliente escolher o profissional

ETAPA 2 - SERVIÇO:
   → APÓS escolher o profissional, mostre a lista de serviços
   → "Aqui estão os serviços disponíveis:\n[lista]\n\nQual serviço você gostaria?"
   → AGUARDE o cliente escolher o serviço`}

ETAPA ${shouldAutoSelect ? '2' : '3'} - DATA:
   → APÓS o cliente escolher o SERVIÇO, pergunte a data
   → "Em qual dia você gostaria de agendar?"
   → AGUARDE o cliente informar a data

ETAPA ${shouldAutoSelect ? '3' : '4'} - HORÁRIO:
   → APÓS ter a data, use o comando para buscar horários:
   → [MOSTRAR_HORARIOS_LIVRES:NOME_SERVICO:NOME_PROFISSIONAL:DATA_YYYY-MM-DD]
   → Se o resultado mostrar HORÁRIOS (ex: "09:00 | 10:00 | 11:00"): pergunte "Qual horário você prefere?"
   → Se o resultado mostrar INDISPONIBILIDADE (contém "não trabalha", "não disponível", "não temos horários", "agenda cheia", etc): NÃO ADICIONE NADA - a mensagem já está completa com a pergunta sobre outro dia!

ETAPA ${shouldAutoSelect ? '4' : '5'} - NOME:
   → SOMENTE APÓS o cliente escolher o HORÁRIO, pergunte o nome
   → "Qual é o seu nome?"
   → AGUARDE o cliente informar o nome
   → ⚠️ NUNCA pergunte o nome ANTES do horário!

ETAPA ${shouldAutoSelect ? '5' : '6'} - CONFIRMAÇÃO:
   → APÓS ter todos os dados, mostre o RESUMO e peça confirmação com "SIM"

⚠️ REGRAS CRÍTICAS:
- NUNCA pule etapas - siga a ordem EXATA acima
- NUNCA pergunte o NOME antes de ter o HORÁRIO
- NUNCA pergunte a DATA antes de ter o SERVIÇO
- Se o cliente pular etapas, volte e colete os dados faltantes NA ORDEM CORRETA
- Ao listar serviços, mostre APENAS o nome (sem preço nem duração)

═══════════════════════════════════════════════════════════════════

INSTRUÇÕES ADICIONAIS:
- 🚨 PREÇOS: Informe o valor de um serviço APENAS quando o cliente PERGUNTAR especificamente (ex: "quanto custa?", "qual o valor?"). Consulte a seção "PREÇOS DOS SERVIÇOS" acima para responder
- NUNCA peça data e horário na mesma mensagem - sempre separado em duas etapas
- REGRA DE CONFIRMAÇÃO DE DATA: Quando cliente mencionar dias da semana, use as datas da seção "PRÓXIMOS DIAS DA SEMANA"
- Se cliente falar "segunda" (sem data), use a data da segunda-feira listada acima
- AGENDAMENTOS FUTUROS: Cliente pode agendar até 30 dias. Se pedir data além dos 7 dias mostrados, aceite normalmente
- HORÁRIOS INDISPONÍVEIS:
  * Se não houver horários disponíveis, sugira outra data
  * NÃO invente horários - confie apenas no que o comando retornar
- NÃO peça o telefone do cliente - o sistema usará automaticamente o número do WhatsApp
- REGRA OBRIGATÓRIA DE RESUMO E CONFIRMAÇÃO:
  * Quando tiver TODOS os dados (profissional, serviço, nome, data/hora disponível), NÃO confirme imediatamente
  * PRIMEIRO envie um RESUMO COMPLETO do agendamento: "Perfeito! Vou confirmar seu agendamento:\n\n👤 Nome: [nome]\n🏢 Profissional: [profissional]\n💼 Serviço: [serviço]\n📅 Data: [dia da semana], [data]\n🕐 Horário: [horário]\n\nEstá tudo correto? Responda SIM para confirmar ou me informe se algo precisa ser alterado."
  * AGUARDE o cliente responder "SIM", "OK", "CONFIRMO" ou confirmação similar
  * APENAS APÓS a confirmação explícita (SIM, OK, CONFIRMO), confirme o agendamento final
  * Se cliente pedir ALTERAÇÃO (ex: "meu nome está errado", "quero outro horário", "mudar para terça"), processe a alteração normalmente e envie novo resumo
  * Se cliente responder com algo AMBÍGUO que NÃO seja confirmação NEM pedido de alteração (ex: emoji ❤️👍, "beleza", "show", "perfeito", "ótimo", "legal"), NÃO confirme o agendamento. Responda: "Para finalizar seu agendamento, preciso da sua confirmação. Posso confirmar para [data] às [horário]? Digite SIM para confirmar."
  * NUNCA diga "Agendamento realizado com sucesso" sem antes receber SIM, OK ou CONFIRMO explícito do cliente
\${asaasPaymentInstructions}
- NÃO invente serviços - use APENAS os serviços listados acima
- NÃO confirme horários sem verificar disponibilidade real
- 🚨 REGRA CRÍTICA - DISPONIBILIDADE POR DIA DA SEMANA: Antes de dizer que um profissional "trabalha" ou "tem atendimento" em determinado dia, SEMPRE consulte a seção "Dias de trabalho" e "NÃO trabalha" de cada profissional nas INFORMAÇÕES PARA AGENDAMENTO. Se o dia da semana mencionado pelo cliente (amanhã, domingo, segunda, etc.) estiver na lista "NÃO trabalha", NUNCA diga que tem atendimento. Diga diretamente que o profissional não trabalha naquele dia e sugira os dias disponíveis.
- NUNCA responda "Sim, temos atendimento!" ou "Sim, trabalhamos!" sem antes verificar se o dia solicitado está nos dias de trabalho do profissional. Em caso de dúvida, use o comando [MOSTRAR_HORARIOS_LIVRES] para verificar
- SEMPRE mostre todos os profissionais/serviços disponíveis antes de pedir para escolher
- Mantenha respostas concisas e adequadas para mensagens de texto
- Seja profissional mas amigável
- Use o histórico da conversa para dar respostas contextualizadas
- Limite respostas a no máximo 200 palavras por mensagem
- Lembre-se do que já foi discutido anteriormente na conversa

═══════════════════════════════════════════════════════════════════
🎯 MÚLTIPLOS AGENDAMENTOS (DUAS OU MAIS PESSOAS - SEM LIMITE!)
═══════════════════════════════════════════════════════════════════

Quando o cliente quiser agendar para MÚLTIPLAS PESSOAS (ex: "quero agendar para mim e minha amiga", "três horários", "para minha mãe, eu e minha irmã", "para 4 pessoas"), siga estas regras:

⚠️ IMPORTANTE: O sistema suporta agendamento para QUALQUER QUANTIDADE de pessoas (2, 3, 4, 5, 6... quantas forem necessárias). NÃO limite a 2 pessoas!

1. IDENTIFIQUE QUANTAS PESSOAS serão agendadas
   - Pode ser 2, 3, 4, 5 ou mais pessoas
   - Pergunte quantas pessoas se não ficar claro

2. COLETE OS DADOS DE CADA PESSOA SEPARADAMENTE:
   - Nome de cada pessoa
   - Serviço desejado (pode ser o mesmo ou diferente)
   - Horário para cada um (DEVE ser horários diferentes!)

3. NO RESUMO DE CONFIRMAÇÃO, USE SEMPRE O FORMATO COM NÚMEROS:
   - Use 1️⃣, 2️⃣, 3️⃣, 4️⃣, 5️⃣, 6️⃣, 7️⃣, 8️⃣, 9️⃣, 🔟 para separar cada agendamento
   - CADA agendamento DEVE ter seus próprios dados completos
   - Use TANTOS marcadores numéricos quantas pessoas houver

4. FORMATO OBRIGATÓRIO DO RESUMO (exemplo com 3 pessoas):
   "Perfeito! Vou confirmar os dados para os agendamentos:

   1️⃣
   👤 Nome: [nome da pessoa 1]
   🏢 Profissional: [profissional]
   💼 Serviço: [serviço]
   📅 Data: [dia da semana], [data]
   🕐 Horário: [horário 1]

   2️⃣
   👤 Nome: [nome da pessoa 2]
   🏢 Profissional: [profissional]
   💼 Serviço: [serviço]
   📅 Data: [dia da semana], [data]
   🕐 Horário: [horário 2]

   3️⃣
   👤 Nome: [nome da pessoa 3]
   🏢 Profissional: [profissional]
   💼 Serviço: [serviço]
   📅 Data: [dia da semana], [data]
   🕐 Horário: [horário 3]

   Está tudo correto? Responda SIM para confirmar os agendamentos ou me informe se precisa alterar algo."

⚠️ REGRAS IMPORTANTES:
- SEMPRE use os emojis numéricos (1️⃣, 2️⃣, 3️⃣, etc.) para separar CADA agendamento
- NUNCA coloque dois agendamentos sem o separador numérico
- Cada bloco DEVE ter todos os campos: Nome, Profissional, Serviço, Data, Horário
- Os horários DEVEM ser diferentes para cada pessoa
- Para 3+ pessoas: continue a sequência (3️⃣, 4️⃣, 5️⃣...) com o mesmo formato

⚠️ FLUXO PARA MÚLTIPLAS PESSOAS (PASSO A PASSO):
1. Identifique QUANTAS pessoas serão agendadas
2. Pergunte os serviços de TODAS as pessoas (ex: "Qual serviço para cada um de vocês?")
3. Pergunte a data UMA VEZ SÓ (ex: "Qual dia vocês preferem?")
4. Use [MOSTRAR_HORARIOS_LIVRES] com a SOMA das durações dos serviços de TODAS as pessoas
   - Ex: Pessoa 1 (20min) + Pessoa 2 (60min) + Pessoa 3 (30min) = use duração de 110min
   - Isso garante que só serão oferecidos horários onde CABEM TODOS os agendamentos consecutivos
5. Pergunte o horário da PRIMEIRA pessoa (ex: "Qual horário você prefere?")
6. AGUARDE a resposta
7. Após a primeira pessoa escolher, CALCULE os horários de TODAS as outras pessoas automaticamente:
   - Pessoa 2 = horário pessoa 1 + duração serviço pessoa 1
   - Pessoa 3 = horário pessoa 2 + duração serviço pessoa 2
   - Pessoa N = horário pessoa (N-1) + duração serviço pessoa (N-1)
   - Ex: Se primeira escolheu 10:00 (serviço de 20min) → segunda às 10:20 (serviço de 60min) → terceira às 11:20
   - Diga: "Perfeito! Então [pessoa1] fica às 10:00, [pessoa2] às 10:20 e [pessoa3] às 11:20. Tudo certo?"
8. Por fim, colete os NOMES de cada pessoa

⚠️ VERIFICAÇÃO DE ESPAÇO OBRIGATÓRIA:
- ANTES de confirmar, verifique se há espaço para TODOS os serviços consecutivos
- Calcule: horário_pessoa1 + duração_serviço1 + duração_serviço2 + ... + duração_serviçoN = horário_término_total
- Se o horário_término_total conflita com outro agendamento, o horário NÃO serve
- Ex: Pessoa 1 às 10:00 (20min) + Pessoa 2 (60min) + Pessoa 3 (30min) = término às 11:50
      Se tem alguém às 11:30, esse horário NÃO funciona! Ofereça outro.

⚠️ HORÁRIOS CONSECUTIVOS OBRIGATÓRIOS:
- Por se tratar de MÚLTIPLO AGENDAMENTO, as pessoas querem ser atendidas em SEQUÊNCIA
- APENAS a primeira pessoa escolhe o horário - todas as demais ficam AUTOMATICAMENTE nos horários seguintes
- Apenas confirme listando todos os horários calculados

⚠️ NÃO REPITA:
- NÃO pergunte a data novamente para cada pessoa
- NÃO use [MOSTRAR_HORARIOS_LIVRES] mais de uma vez
- NÃO ofereça escolha de horário para nenhuma pessoa além da primeira - é automático/consecutivo

═══════════════════════════════════════════════════════════════════

CANCELAMENTO DE AGENDAMENTOS:
Quando o cliente mencionar qualquer uma dessas frases:
"cancelar", "desmarcar", "não vou poder ir", "preciso cancelar", "não vou conseguir ir", "não vou mais", "quero desmarcar", "preciso desmarcar"

→ Responda EXATAMENTE assim (copie exatamente):
"Vou verificar seus agendamentos... [LISTAR_AGENDAMENTOS_CANCELAR]"

IMPORTANTE: O comando [LISTAR_AGENDAMENTOS_CANCELAR] DEVE estar na sua resposta!
O sistema vai substituir automaticamente pela lista de agendamentos do cliente.

→ Após o cliente responder com um NÚMERO (1, 2, 3...), confirme: "Confirma o cancelamento do agendamento X? Digite CANCELAR para confirmar."

REAGENDAMENTO (REMARCAR):
Quando o cliente mencionar qualquer uma dessas frases:
"remarcar", "alterar horário", "mudar data", "reagendar", "trocar horário", "mudar horário", "adiar"
Ou quando o cliente indicar que agendou no dia/horário errado e quer mudar:

→ Informe ao cliente que para remarcar é necessário PRIMEIRO CANCELAR o agendamento atual e depois fazer um novo agendamento.
→ JÁ INICIE O FLUXO DE CANCELAMENTO AUTOMATICAMENTE! Não pergunte "você gostaria de cancelar?" - já ofereça direto.
→ Responda algo como: "Para remarcar, primeiro preciso cancelar o agendamento atual. Vou verificar seus agendamentos... [LISTAR_AGENDAMENTOS_CANCELAR]"
→ IMPORTANTE: SEMPRE inclua [LISTAR_AGENDAMENTOS_CANCELAR] na resposta de reagendamento!
→ NUNCA pergunte "Você gostaria de mudar seu agendamento?" ou "Posso te ajudar com isso?" - já inicie o cancelamento direto.

REGRAS CRÍTICAS PARA CANCELAMENTO:
- SEMPRE inclua o comando [LISTAR_AGENDAMENTOS_CANCELAR] na sua resposta quando for cancelar
- Sem o comando, o sistema NÃO consegue mostrar os agendamentos!
- NÃO peça dados do agendamento - o sistema lista automaticamente pelo telefone
- O cliente só precisa responder com o NÚMERO do agendamento
- Seja natural e conversacional`;

              // Prepare messages for OpenAI with conversation history
              const messages = [
                { role: 'system' as const, content: systemPrompt },
                ...conversationHistory.slice(-15), // Last 15 messages for context (aumentado para não perder dados do agendamento)
                { role: 'user' as const, content: messageText }
              ];

              console.log('🤖 Generating AI response with conversation context');
              console.log('📖 Using', conversationHistory.length, 'previous messages for context (últimas 15)');
              console.log('🔄 Conversation takeover mode:', conversation.takeoverMode);

              // Log human intervention messages for debugging
              const humanMessages = conversationHistory.filter(m => m.content.includes('[MENSAGEM DO ATENDENTE HUMANO]'));
              if (humanMessages.length > 0) {
                console.log(`👨‍💼 Found ${humanMessages.length} human intervention message(s) in context`);
                humanMessages.forEach((m, i) => {
                  console.log(`  ${i + 1}. ${m.content.substring(0, 100)}...`);
                });
              }

              // ========================================
              // 🔄 INTERCEPTAÇÃO DE CANCELAMENTO/REAGENDAMENTO
              // Detecta keywords antes da IA para forçar o fluxo correto
              // ========================================
              const lowerMsg = messageText.toLowerCase().trim();
              const cancelKeywords = ['cancelar', 'desmarcar', 'não vou poder ir', 'preciso cancelar', 'não vou conseguir ir', 'não vou mais', 'quero desmarcar', 'preciso desmarcar'];
              const rescheduleKeywords = ['remarcar', 'reagendar', 'alterar horário', 'alterar horario', 'mudar data', 'trocar horário', 'trocar horario', 'mudar horário', 'mudar horario', 'adiar'];
              const hasCancelKeyword = cancelKeywords.some(kw => lowerMsg.includes(kw));
              const hasRescheduleKeyword = rescheduleKeywords.some(kw => lowerMsg.includes(kw));

              // Verificar se "cancelar" está sendo usado como CONFIRMAÇÃO de cancelamento (não como novo pedido)
              // Se a última mensagem do bot pediu confirmação, "cancelar" é uma resposta, não um novo pedido
              const lastBotMsgForIntercept = conversationHistory.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
              const isAlreadyInCancelConfirmation = lastBotMsgForIntercept.includes('Confirma o cancelamento?') ||
                                                     lastBotMsgForIntercept.includes('CANCELAR* para confirmar') ||
                                                     lastBotMsgForIntercept.includes('CANCELAR para confirmar') ||
                                                     lastBotMsgForIntercept.includes('SIM* para cancelar') ||
                                                     lastBotMsgForIntercept.includes('SIM para cancelar');
              const isCancelAsConfirmation = isAlreadyInCancelConfirmation && /^(cancelar|cancela|cancelamento)$/i.test(lowerMsg);

              let interceptedResponse: string | null = null;

              if (hasCancelKeyword && !hasRescheduleKeyword && !isCancelAsConfirmation) {
                // Cancelamento direto - listar agendamentos
                console.log('🚫 INTERCEPTAÇÃO: Keyword de cancelamento detectada - disparando fluxo de cancelamento');
                const appointmentsList = await listClientAppointmentsNumbered(phoneNumber, company.id, 'cancelar');
                interceptedResponse = appointmentsList;
              } else if (hasRescheduleKeyword) {
                // Reagendamento - listar agendamentos para cancelar primeiro
                console.log('🔄 INTERCEPTAÇÃO: Keyword de reagendamento detectada - disparando fluxo de cancelamento para remarcar');
                const appointmentsList = await listClientAppointmentsNumbered(phoneNumber, company.id, 'cancelar');
                interceptedResponse = `Para reagendar, é necessário cancelar o agendamento atual e fazer um novo.\n\n${appointmentsList}`;
              }

              if (interceptedResponse) {
                // Salvar mensagem do usuário
                await storage.createMessage({
                  conversationId: conversation.id,
                  role: 'user',
                  content: messageText,
                  messageType: 'text',
                  delivered: true,
                  timestamp: new Date(),
                });

                // Formatar telefone para UAZAPI
                let formattedPhoneIntercept = phoneNumber.replace(/\D/g, '');
                if (!formattedPhoneIntercept.startsWith('55') && formattedPhoneIntercept.length >= 10) {
                  formattedPhoneIntercept = '55' + formattedPhoneIntercept;
                }

                // Enviar presença "digitando" e aguardar
                await uazapiSendTyping(instanceName, formattedPhoneIntercept, 2000);
                await new Promise(resolve => setTimeout(resolve, 2000));

                try {
                  const sendResponse = await uazapiSendText(instanceName, formattedPhoneIntercept, interceptedResponse);

                  if (sendResponse.ok) {
                    console.log(`✅ [INTERCEPTAÇÃO] Resposta enviada para ${phoneNumber}`);
                  } else {
                    console.error(`❌ [INTERCEPTAÇÃO] Falha ao enviar mensagem: Status ${sendResponse.status}`);
                  }
                } catch (error) {
                  console.error('❌ Erro ao enviar mensagem interceptada:', error);
                }

                // Registrar no cache para detectar eco no Chatwoot
                if (conversation) {
                  cacheAIResponse(conversation.id, interceptedResponse);
                }

                // Salvar resposta no banco
                await storage.createMessage({
                  conversationId: conversation.id,
                  role: 'assistant',
                  content: interceptedResponse,
                  messageType: 'text',
                  delivered: true,
                  timestamp: new Date(),
                });

                // Liberar lock e retornar
                const lockKeyIntercept = `${company.id}:${instanceName}:${phoneNumber}`;
                if (processingLocks.has(lockKeyIntercept)) {
                  processingLocks.delete(lockKeyIntercept);
                }

                return res.status(200).json({
                  received: true,
                  processed: true,
                  intercepted: true,
                  message: hasCancelKeyword ? 'Fluxo de cancelamento disparado' : 'Fluxo de reagendamento disparado'
                });
              }

              // ========================================
              // 🆕 PRÉ-VALIDAÇÃO: Validar dados ANTES de chamar IA
              // ========================================
              // Se cliente confirmou com SIM/OK, validar dados ANTES da IA responder
              const confirmationPatterns = [
                /^(sim|sin|sím|sii|s|ok|confirmo|confirmar|confirmado)$/i,
                /^(sim|sin|sím|ok),?\s*(pode|por favor|obrigado|está correto|confirmo)?$/i,
                /^(está correto|tudo certo|tudo correto|pode confirmar|confirmo sim)$/i,
                /^(sim|sin),?\s*(tudo correto|tudo certo|tudo)$/i,
                /^tudo\s*(ok|certo|correto)$/i
              ];

              // Verificar confirmação na mensagem inteira E em cada linha individual
              // (para mensagens agrupadas via debounce, ex: "Tudo ok\nSim")
              const messageLines = messageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
              const isUserConfirming = confirmationPatterns.some(pattern =>
                pattern.test(messageText.toLowerCase().trim())
              ) || (messageLines.length > 1 && messageLines.some(line =>
                confirmationPatterns.some(pattern => pattern.test(line.toLowerCase()))
              ));

              // ========================================
              // VERIFICAR CONTEXTO DE CANCELAMENTO ANTES da pré-validação de agendamento
              // Evita que "Sim" em contexto de cancelamento/remarcação seja tratado
              // como confirmação de agendamento (que causa conflito de horário)
              // ========================================
              const lastAssistantMsgPreCheck = conversationHistory.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';

              // ========================================
              // VERIFICAR CONTEXTO DE LEMBRETE DE CONFIRMAÇÃO
              // Se a última mensagem do assistente é um lembrete pedindo confirmação do agendamento,
              // "Sim" deve ser tratado como CONFIRMAÇÃO, NÃO como reagendamento/cancelamento.
              // A mensagem de lembrete contém "alterar" e "agendamento" juntos, o que pode
              // ativar falsamente o contexto de reagendamento.
              // ========================================
              const isConfirmationReminderContext =
                  lastAssistantMsgPreCheck.includes('agendamento ainda não foi confirmado') ||
                  (lastAssistantMsgPreCheck.includes('Basta responder') && lastAssistantMsgPreCheck.includes('para confirmar')) ||
                  (lastAssistantMsgPreCheck.includes('responder') && lastAssistantMsgPreCheck.includes('SIM') && lastAssistantMsgPreCheck.includes('confirmar') && !lastAssistantMsgPreCheck.includes('cancelar')) ||
                  (lastAssistantMsgPreCheck.includes('Responda') && lastAssistantMsgPreCheck.includes('SIM') && lastAssistantMsgPreCheck.includes('confirmar') && !lastAssistantMsgPreCheck.includes('cancelar')) ||
                  (lastAssistantMsgPreCheck.includes('Está tudo correto') && lastAssistantMsgPreCheck.includes('confirmar')) ||
                  (lastAssistantMsgPreCheck.includes('tudo correto') && lastAssistantMsgPreCheck.includes('SIM') && lastAssistantMsgPreCheck.includes('confirmar'));

              const isCancelContext = lastAssistantMsgPreCheck.includes('Confirma o cancelamento?') ||
                                     lastAssistantMsgPreCheck.includes('CANCELAR* para confirmar') ||
                                     lastAssistantMsgPreCheck.includes('CANCELAR para confirmar') ||
                                     lastAssistantMsgPreCheck.includes('SIM* para cancelar') ||
                                     lastAssistantMsgPreCheck.includes('SIM para cancelar') ||
                                     lastAssistantMsgPreCheck.includes('deseja cancelar o agendamento') ||
                                     lastAssistantMsgPreCheck.includes('deseja cancelar seu agendamento') ||
                                     lastAssistantMsgPreCheck.includes('deseja cancelar o seu agendamento') ||
                                     lastAssistantMsgPreCheck.includes('cancelar o agendamento atual') ||
                                     lastAssistantMsgPreCheck.includes('Qual agendamento você deseja cancelar') ||
                                     (lastAssistantMsgPreCheck.includes('cancelar') && lastAssistantMsgPreCheck.includes('Posso prosseguir')) ||
                                     (lastAssistantMsgPreCheck.includes('cancelar') && lastAssistantMsgPreCheck.includes('prosseguir'));
              // Detectar se usuário digitou "cancelar" como confirmação de cancelamento
              const isUserConfirmingCancelWord = /^(cancelar|cancela|cancelamento)$/i.test(messageText.toLowerCase().trim());
              const isConfirmingCancel = (isUserConfirming || confirmationDetected || isUserConfirmingCancelWord) && isCancelContext;

              // ========================================
              // VERIFICAR CONTEXTO DE REAGENDAMENTO
              // Evita que "Sim" em contexto de reagendamento seja tratado
              // como confirmação de novo agendamento (que causa conflito de horário)
              // ========================================
              const isRescheduleContext =
                  lastAssistantMsgPreCheck.includes('mudar seu agendamento') ||
                  lastAssistantMsgPreCheck.includes('mudar o agendamento') ||
                  lastAssistantMsgPreCheck.includes('reagendar') ||
                  lastAssistantMsgPreCheck.includes('remarcar') ||
                  lastAssistantMsgPreCheck.includes('trocar o dia') ||
                  lastAssistantMsgPreCheck.includes('trocar a data') ||
                  lastAssistantMsgPreCheck.includes('trocar o horário') ||
                  lastAssistantMsgPreCheck.includes('trocar o horario') ||
                  lastAssistantMsgPreCheck.includes('alterar o agendamento') ||
                  lastAssistantMsgPreCheck.includes('alterar seu agendamento') ||
                  lastAssistantMsgPreCheck.includes('alterar a data') ||
                  lastAssistantMsgPreCheck.includes('alterar o horário') ||
                  lastAssistantMsgPreCheck.includes('alterar o horario') ||
                  lastAssistantMsgPreCheck.includes('adiar') ||
                  lastAssistantMsgPreCheck.includes('mudar para') ||
                  lastAssistantMsgPreCheck.includes('Para reagendar') ||
                  lastAssistantMsgPreCheck.includes('necessário cancelar o agendamento atual') ||
                  lastAssistantMsgPreCheck.includes('preciso cancelar o horário anterior') ||
                  lastAssistantMsgPreCheck.includes('cancelar o horário anterior') ||
                  lastAssistantMsgPreCheck.includes('gostaria de mudar') ||
                  (lastAssistantMsgPreCheck.includes('cancelar') && lastAssistantMsgPreCheck.includes('agendar para a nova data')) ||
                  (lastAssistantMsgPreCheck.includes('cancelar') && lastAssistantMsgPreCheck.includes('nova data')) ||
                  (lastAssistantMsgPreCheck.includes('mudar') && lastAssistantMsgPreCheck.includes('agendamento')) ||
                  (lastAssistantMsgPreCheck.includes('alterar') && lastAssistantMsgPreCheck.includes('agendamento'));

              // ========================================
              // VERIFICAR CONTEXTO PÓS-CONFIRMAÇÃO
              // Evita que "Ok"/"Sim" APÓS "Agendamento realizado com sucesso!"
              // seja tratado como nova confirmação de agendamento (que causa conflito de horário)
              // ========================================
              const isPostConfirmationContext =
                  lastAssistantMsgPreCheck.includes('Agendamento realizado com sucesso') ||
                  lastAssistantMsgPreCheck.includes('Nos vemos no dia') ||
                  lastAssistantMsgPreCheck.includes('Nos vemos na') ||
                  lastAssistantMsgPreCheck.includes('Nos vemos no') ||
                  lastAssistantMsgPreCheck.includes('agendamento foi confirmado') ||
                  lastAssistantMsgPreCheck.includes('Agendamento Confirmado!') ||
                  lastAssistantMsgPreCheck.includes('Obrigado por escolher nossos serviços') ||
                  (lastAssistantMsgPreCheck.includes('confirmado para') && lastAssistantMsgPreCheck.includes('às'));

              if (isPostConfirmationContext && isUserConfirming) {
                console.log('✅ PRÉ-PROCESSAMENTO: "Ok/Sim" detectado APÓS confirmação de agendamento - ignorando como confirmação de agendamento');
                console.log('📩 Mensagem do usuário:', messageText);
                console.log('🤖 Última msg IA:', lastAssistantMsgPreCheck.substring(0, 150));
              }

              if (isConfirmationReminderContext && isUserConfirming) {
                console.log('⏰ PRÉ-PROCESSAMENTO: "Sim" detectado após LEMBRETE de confirmação - tratando como confirmação de agendamento');
                console.log('📩 Mensagem do usuário:', messageText);
                console.log('🤖 Última msg IA (lembrete):', lastAssistantMsgPreCheck.substring(0, 150));
              }

              if (isRescheduleContext && isUserConfirming && !isConfirmationReminderContext) {
                console.log('🔄 PRÉ-PROCESSAMENTO: "Sim" detectado em contexto de reagendamento - interceptando para listar agendamentos');

                // Interceptar e listar agendamentos para cancelar (ao invés de deixar a IA processar)
                const appointmentsListReschedule = await listClientAppointmentsNumbered(phoneNumber, company.id, 'cancelar');
                const rescheduleInterceptResponse = `Para reagendar, primeiro vamos cancelar o agendamento atual.\n\n${appointmentsListReschedule}`;

                // Salvar mensagem do usuário
                await storage.createMessage({
                  conversationId: conversation.id,
                  role: 'user',
                  content: messageText,
                  messageType: 'text',
                  delivered: true,
                  timestamp: new Date(),
                });

                // Formatar telefone para UAZAPI
                let formattedPhoneReschedule = phoneNumber.replace(/\D/g, '');
                if (!formattedPhoneReschedule.startsWith('55') && formattedPhoneReschedule.length >= 10) {
                  formattedPhoneReschedule = '55' + formattedPhoneReschedule;
                }

                // Enviar via UAZAPI
                await uazapiSendTyping(instanceName, formattedPhoneReschedule, 2000);
                await new Promise(resolve => setTimeout(resolve, 2000));

                try {
                  const sendResponseReschedule = await uazapiSendText(instanceName, formattedPhoneReschedule, rescheduleInterceptResponse);

                  if (sendResponseReschedule.ok) {
                    console.log(`✅ [REAGENDAMENTO INTERCEPTADO] Resposta enviada para ${phoneNumber}`);
                  } else {
                    console.error(`❌ [REAGENDAMENTO INTERCEPTADO] Falha ao enviar: Status ${sendResponseReschedule.status}`);
                  }
                } catch (error) {
                  console.error('❌ Erro ao enviar mensagem de reagendamento interceptado:', error);
                }

                // Registrar no cache para detectar eco no Chatwoot
                if (conversation) {
                  cacheAIResponse(conversation.id, rescheduleInterceptResponse);
                }

                // Salvar resposta no banco
                await storage.createMessage({
                  conversationId: conversation.id,
                  role: 'assistant',
                  content: rescheduleInterceptResponse,
                  messageType: 'text',
                  delivered: true,
                  timestamp: new Date(),
                });

                // Liberar lock e retornar
                const lockKeyReschedule = `${company.id}:${instanceName}:${phoneNumber}`;
                if (processingLocks.has(lockKeyReschedule)) {
                  processingLocks.delete(lockKeyReschedule);
                }

                return res.status(200).json({
                  received: true,
                  processed: true,
                  intercepted: true,
                  message: 'Fluxo de reagendamento interceptado - listando agendamentos para cancelar'
                });
              }

              // Detectar "Não" em contexto de cancelamento
              const isDecliningCancel = isCancelContext && /^(não|nao|n|no|cancela não|cancela nao|não quero|nao quero)$/i.test(messageText.toLowerCase().trim());

              if (isDecliningCancel) {
                console.log('🚫 PRÉ-PROCESSAMENTO: "Não" detectado em contexto de cancelamento');
                await pool.execute(
                  `DELETE FROM messages WHERE conversation_id = ? AND content LIKE '%[PENDING_CANCEL_ID:%'`,
                  [conversation.id]
                );
              }

              if ((isUserConfirming || confirmationDetected || isUserConfirmingCancelWord) && !isConfirmingCancel && (!isRescheduleContext || isConfirmationReminderContext) && !isPostConfirmationContext) {
                console.log('==================================================');
                console.log(`🔍 PRÉ-VALIDAÇÃO: Cliente confirmou (regex: ${isUserConfirming}, IA: ${confirmationDetected})`);
                console.log('==================================================');

                // Buscar mensagem de resumo nas últimas mensagens
                const recentMessages = await storage.getMessagesByConversation(conversation.id);
                const recentAssistantMessages = recentMessages
                  .filter(m => m.role === 'assistant')
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .slice(0, 5); // Últimas 5 mensagens do assistente

                const summaryMessage = recentAssistantMessages.find(m =>
                  !m.content.includes('Agendamento Confirmado!') &&
                  !m.content.includes('Obrigado por escolher nossos serviços') &&
                  !m.content.includes('Agendamento realizado com sucesso') &&
                  !m.content.includes('Nos vemos no dia') &&
                  (
                    ((m.content.includes('Está tudo correto?') ||
                      m.content.includes('Responda SIM para confirmar') ||
                      m.content.includes('Digite SIM ou OK para confirmar') ||
                      m.content.includes('confirmar seu agendamento') ||
                      m.content.includes('Vou confirmar')) &&
                     (m.content.includes('👤') || m.content.includes('Nome:')) &&
                     (m.content.includes('📅') || m.content.includes('Data:')) &&
                     (m.content.includes('🕐') || m.content.includes('Horário:')))
                  )
                );

                if (summaryMessage) {
                  console.log('✅ Mensagem de resumo encontrada, validando dados...');

                  // ⏰ Cancelar timer de lembrete (rede de segurança)
                  const confirmTimerKeyPreVal = `${company.id}:${phoneNumber}`;
                  if (pendingConfirmationTimers.has(confirmTimerKeyPreVal)) {
                    const pendingTimer = pendingConfirmationTimers.get(confirmTimerKeyPreVal)!;
                    clearTimeout(pendingTimer.timer);
                    pendingConfirmationTimers.delete(confirmTimerKeyPreVal);
                    console.log(`⏰ Timer de lembrete cancelado (confirmação recebida): ${confirmTimerKeyPreVal}`);
                  }

                  // Extrair dados do resumo
                  const extractDetails = (text: string) => {
                    let nameMatch = text.match(/(?:Nome|👤):\s*([^\n]*)/i);
                    let serviceMatch = text.match(/(?:Serviço|✂️|💼):\s*([^\n]*)/i);
                    let professionalMatch = text.match(/(?:Profissional|👨‍💼|👤):\s*([^\n]*)/i);
                    let timeMatch = text.match(/(?:Horário|Hora|🕐):\s*([^\n]*)/i);

                    return {
                      name: nameMatch?.[1]?.trim() || '',
                      service: serviceMatch?.[1]?.trim() || '',
                      professional: professionalMatch?.[1]?.trim() || '',
                      time: timeMatch?.[1]?.trim() || ''
                    };
                  };

                  const details = extractDetails(summaryMessage.content);
                  console.log('📋 Dados extraídos:', details);

                  // Buscar profissional e serviço
                  const professionals = await storage.getProfessionalsByCompany(company.id);
                  const services = await storage.getServicesByCompany(company.id);

                  // Normalizar strings para comparação
                  const normalizeString = (str: string) => {
                    return str
                      .toLowerCase()
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/\s+/g, ' ')
                      .trim();
                  };

                  // Validar profissional
                  let professional = null;
                  if (details.professional) {
                    const normalizedSearch = normalizeString(details.professional);
                    professional = professionals.find(p => {
                      const normalizedProfName = normalizeString(p.name);
                      return normalizedProfName === normalizedSearch ||
                             normalizedProfName.includes(normalizedSearch) ||
                             normalizedSearch.includes(normalizedProfName);
                    });
                  }

                  // Validar serviço - priorizar correspondência exata
                  let service = null;
                  if (details.service) {
                    const normalizedSearch = normalizeString(details.service);

                    // Primeiro: buscar correspondência EXATA
                    service = services.find(s => {
                      const normalizedServiceName = normalizeString(s.name);
                      return normalizedServiceName === normalizedSearch;
                    });

                    // Se não encontrou exata, buscar parcial
                    if (!service) {
                      service = services.find(s => {
                        const normalizedServiceName = normalizeString(s.name);
                        return normalizedServiceName.includes(normalizedSearch) ||
                               normalizedSearch.includes(normalizedServiceName);
                      });
                    }
                  }

                  console.log('🔍 Validação:');
                  console.log('  Professional:', professional ? `✅ ${professional.name}` : '❌ NOT FOUND');
                  console.log('  Service:', service ? `✅ ${service.name} (${service.duration}min)` : '❌ NOT FOUND');
                  console.log('  Time:', details.time ? `✅ ${details.time}` : '❌ MISSING');

                  // Se validação falhar, enviar erro ANTES de chamar IA
                  if (!professional || !service || !details.time) {
                    console.log('❌ PRÉ-VALIDAÇÃO FALHOU: Dados insuficientes');
                    console.log('⚠️ ABORTANDO chamada da IA - enviando mensagem de erro ao cliente');

                    // Mensagem de erro (reutilizando a que já existe)
                    const errorMessage = `Erro ❌

Houve uma falha inesperada no sistema e não foi possível concluir seu agendamento.
Pedimos desculpas pelo transtorno. Aguarde alguns instantes e tente novamente.`;

                    // Enviar erro ao cliente
                    try {
                      const instances = await storage.getWhatsappInstancesByCompany(company.id);
                      const activeInstance = instances.find(i => i.status === 'connected');

                      if (activeInstance) {
                        const globalSettings = await storage.getGlobalSettings();

                        if (globalSettings?.uazapiUrl && globalSettings?.uazapiAdminToken) {
                          let formattedPhone = phoneNumber.replace(/\D/g, '');
                          if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10) {
                            formattedPhone = '55' + formattedPhone;
                          }

                          await uazapiSendTyping(activeInstance.instanceName, formattedPhone, 2000);
                          await new Promise(resolve => setTimeout(resolve, 2000));

                          const response = await uazapiSendText(activeInstance.instanceName, formattedPhone, errorMessage);

                          if (response.ok) {
                            console.log('✅ Mensagem de erro enviada com sucesso (PRÉ-VALIDAÇÃO)');

                            await storage.createMessage({
                              conversationId: conversation.id,
                              content: errorMessage,
                              role: 'assistant',
                              messageType: 'text',
                              delivered: true,
                              timestamp: new Date(),
                            });
                          } else {
                            console.error('❌ Falha ao enviar mensagem de erro:', response.status);
                          }
                        }
                      }
                    } catch (error) {
                      console.error('❌ Erro ao enviar mensagem de erro:', error);
                    }

                    // RETORNAR - NÃO chamar IA
                    console.log('🔓 Liberando lock (PRÉ-VALIDAÇÃO)');
                    const lockKey = `${company.id}:${instanceName}:${phoneNumber}`;
                    if (processingLocks.has(lockKey)) {
                      processingLocks.delete(lockKey);
                    }

                    // IMPORTANTE: Enviar resposta HTTP para o webhook não reenviar
                    return res.status(200).json({
                      received: true,
                      processed: true,
                      validationFailed: true,
                      message: 'Pré-validação falhou - dados insuficientes'
                    });
                  }

                  // ========================================
                  // 🔍 VERIFICAR CONFLITO DE HORÁRIO ANTES DE CHAMAR IA
                  // ========================================
                  console.log('🔍 Verificando conflito de horário na PRÉ-VALIDAÇÃO...');

                  // Extrair data do resumo
                  const dateMatch = summaryMessage.content.match(/(\d{2}\/\d{2}\/\d{4})/);
                  let appointmentDateStr = '';
                  if (dateMatch) {
                    const [day, month, year] = dateMatch[1].split('/');
                    appointmentDateStr = `${year}-${month}-${day}`;
                  }

                  // Extrair horário do resumo
                  const timeExtracted = details.time.match(/(\d{1,2}):(\d{2})/);
                  let appointmentTimeStr = '';
                  if (timeExtracted) {
                    appointmentTimeStr = `${timeExtracted[1].padStart(2, '0')}:${timeExtracted[2]}`;
                  }

                  if (appointmentDateStr && appointmentTimeStr && professional && service) {
                    // Buscar APENAS agendamentos do mesmo dia/profissional com status ativo (consulta otimizada)
                    const inactiveStatusList = ['Cancelado', 'cancelado', 'cancelled', 'Rejeitado', 'rejeitado', 'rejected', 'Excluído', 'excluido', 'deleted', 'Concluído', 'concluido', 'completed', 'Finalizado', 'finalizado'];
                    const placeholders = inactiveStatusList.map(() => '?').join(',');
                    const [conflictRows] = await pool.execute(
                      `SELECT id, client_name, appointment_time, duration, status FROM appointments
                       WHERE company_id = ? AND professional_id = ? AND appointment_date = ?
                       AND (status IS NULL OR status NOT IN (${placeholders}))`,
                      [company.id, professional.id, appointmentDateStr, ...inactiveStatusList]
                    );
                    const existingAppointments = conflictRows as any[];
                    const serviceDuration = service.duration || 30;

                    // Converter horário para minutos
                    const [reqHour, reqMin] = appointmentTimeStr.split(':').map(Number);
                    const requestedStartMinutes = reqHour * 60 + reqMin;
                    const requestedEndMinutes = requestedStartMinutes + serviceDuration;

                    console.log('🔍 [PRÉ-VALIDAÇÃO] Verificando conflitos (consulta otimizada):');
                    console.log(`   📅 Data solicitada: ${appointmentDateStr}`);
                    console.log(`   ⏰ Horário solicitado: ${appointmentTimeStr}`);
                    console.log(`   ⏱️ Duração do serviço: ${serviceDuration} min`);
                    console.log(`   📊 Agendamentos ativos encontrados no dia: ${existingAppointments.length}`);
                    console.log(`   📊 Novo agendamento: início=${requestedStartMinutes}min (${appointmentTimeStr}), fim=${requestedEndMinutes}min (${Math.floor(requestedEndMinutes/60)}:${String(requestedEndMinutes%60).padStart(2,'0')})`);

                    // Verificar conflitos
                    let hasConflict = false;
                    let conflictingAppointment: any = null;

                    for (const apt of existingAppointments) {
                        // Converter horário existente para minutos
                        const aptTime = apt.appointment_time || apt.appointmentTime;
                        const [existHour, existMin] = aptTime.split(':').map(Number);
                        const existingStartMinutes = existHour * 60 + existMin;
                        const existingEndMinutes = existingStartMinutes + (apt.duration || 30);
                        const aptClientName = apt.client_name || apt.clientName;

                        console.log(`   📋 Agendamento existente: ${aptClientName} - ${aptTime} (${existingStartMinutes}min) até ${Math.floor(existingEndMinutes/60)}:${String(existingEndMinutes%60).padStart(2,'0')} (${existingEndMinutes}min)`);
                        console.log(`      🔄 Verificação: novo_inicio(${requestedStartMinutes}) < existente_fim(${existingEndMinutes})? ${requestedStartMinutes < existingEndMinutes}`);
                        console.log(`      🔄 Verificação: novo_fim(${requestedEndMinutes}) > existente_inicio(${existingStartMinutes})? ${requestedEndMinutes > existingStartMinutes}`);

                        // Verificar sobreposição
                        if (requestedStartMinutes < existingEndMinutes && requestedEndMinutes > existingStartMinutes) {
                          console.log(`      ⚠️ CONFLITO DETECTADO!`);
                          hasConflict = true;
                          conflictingAppointment = { ...apt, appointmentTime: aptTime, clientName: aptClientName };
                          break;
                        } else {
                          console.log(`      ✅ Sem conflito com este agendamento`);
                        }
                    }

                    if (hasConflict && conflictingAppointment) {
                      const conflictEndMinutes = (parseInt(conflictingAppointment.appointmentTime.split(':')[0]) * 60 +
                                                  parseInt(conflictingAppointment.appointmentTime.split(':')[1])) +
                                                  (conflictingAppointment.duration || 30);
                      const conflictEndFormatted = `${Math.floor(conflictEndMinutes/60)}:${String(conflictEndMinutes%60).padStart(2,'0')}`;

                      console.log(`❌ PRÉ-VALIDAÇÃO: Conflito de horário detectado!`);
                      console.log(`   Cliente ${conflictingAppointment.clientName} já possui agendamento das ${conflictingAppointment.appointmentTime} às ${conflictEndFormatted}`);

                      // Enviar mensagem de conflito ao cliente
                      const conflictMessage = `❌ *Conflito de Horário Detectado*\n\nDesculpe, mas não foi possível confirmar seu agendamento pois o horário das ${appointmentTimeStr} já está ocupado por outro cliente.\n\nPor favor, escolha outro horário disponível.`;

                      // Enviar webhook de erro para N8N
                      await sendAppointmentErrorWebhook(company.id, 'CONFLICT', 'Horário já está ocupado - detectado na pré-validação', {
                        conversationId: conversation.id,
                        phoneNumber,
                        clientName: details.name,
                        professionalId: professional.id,
                        professionalName: professional.name,
                        serviceId: service.id,
                        serviceName: service.name,
                        requestedDate: appointmentDateStr,
                        requestedTime: appointmentTimeStr,
                        additionalInfo: `Conflito com agendamento de ${conflictingAppointment.clientName} às ${conflictingAppointment.appointmentTime}`
                      });

                      // Enviar erro ao cliente
                      try {
                        console.log('📤 [CONFLITO] Iniciando envio de mensagem de conflito ao cliente...');
                        // Usar a instância já obtida no escopo (whatsappInstance) ao invés de buscar novamente
                        console.log(`📤 [CONFLITO] Usando instância já obtida: ${whatsappInstance.instanceName}`);

                        const globalSettings = await storage.getGlobalSettings();
                        console.log(`📤 [CONFLITO] UAZAPI URL: ${globalSettings?.uazapiUrl || 'NÃO CONFIGURADA'}`);

                        if (globalSettings?.uazapiUrl && globalSettings?.uazapiAdminToken) {
                          let formattedPhone = phoneNumber.replace(/\D/g, '');
                          if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10) {
                            formattedPhone = '55' + formattedPhone;
                          }
                          console.log(`📤 [CONFLITO] Telefone formatado: ${formattedPhone}`);

                          console.log('📤 [CONFLITO] Enviando typing presence...');
                          await uazapiSendTyping(whatsappInstance.instanceName, formattedPhone, 2000);
                          await new Promise(resolve => setTimeout(resolve, 2000));

                          console.log('📤 [CONFLITO] Enviando mensagem via UAZAPI...');
                          const conflictResponse = await uazapiSendText(whatsappInstance.instanceName, formattedPhone, conflictMessage);

                          console.log(`📤 [CONFLITO] Resposta da API (${conflictResponse.status})`);

                          if (conflictResponse.ok) {
                            console.log('✅ Mensagem de conflito enviada com sucesso (PRÉ-VALIDAÇÃO)');

                            await storage.createMessage({
                              conversationId: conversation.id,
                              content: conflictMessage,
                              role: 'assistant',
                              messageType: 'text',
                              delivered: true,
                              timestamp: new Date(),
                            });
                          } else {
                            console.error(`❌ [CONFLITO] Falha ao enviar mensagem: Status ${conflictResponse.status}`);
                          }
                        } else {
                          console.error('❌ [CONFLITO] UAZAPI não configurada');
                        }
                      } catch (error) {
                        console.error('❌ Erro ao enviar mensagem de conflito:', error);
                      }

                      // RETORNAR - NÃO chamar IA
                      console.log('🔓 Liberando lock (PRÉ-VALIDAÇÃO - CONFLITO)');
                      const lockKeyConflict = `${company.id}:${instanceName}:${phoneNumber}`;
                      if (processingLocks.has(lockKeyConflict)) {
                        processingLocks.delete(lockKeyConflict);
                      }

                      // IMPORTANTE: Enviar resposta HTTP para o webhook não reenviar
                      return res.status(200).json({
                        received: true,
                        processed: true,
                        conflict: true,
                        message: 'Conflito de horário detectado na pré-validação'
                      });
                    }
                  }

                  console.log('✅ PRÉ-VALIDAÇÃO PASSOU: Todos os dados estão corretos e sem conflitos');
                  console.log('➡️ Continuando com chamada da IA...');
                } else {
                  console.log('⚠️ Mensagem de resumo não encontrada, continuando normalmente...');
                }
              }
              // ========================================
              // FIM DA PRÉ-VALIDAÇÃO
              // ========================================

              const completion = !isConfirmingCancel ? await openai.chat.completions.create({
                model: company.openaiModel || 'gpt-4o-mini',
                messages: messages,
                temperature: company.openaiTemperature ? parseFloat(company.openaiTemperature.toString()) : 0.7,
                max_tokens: company.openaiMaxTokens || 180,
              }) : null;

              let aiResponse = isConfirmingCancel
                ? '' // Será preenchido pelo processamento de cancelamento abaixo
                : (completion?.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.');

              // Process special commands for appointment management
              console.log('🔍 Checking for special commands in AI response...');
              console.log('📝 AI Response (primeiros 500 chars):', aiResponse.substring(0, 500));

              // Process [LISTAR_AGENDAMENTOS] command
              if (aiResponse.includes('[LISTAR_AGENDAMENTOS]')) {
                console.log('📋 Listing client appointments...');
                const appointmentsList = await listClientAppointments(phoneNumber, company.id);
                aiResponse = aiResponse.replace('[LISTAR_AGENDAMENTOS]', appointmentsList);
              }

              // Process [LISTAR_AGENDAMENTOS_CANCELAR] command - lista agendamentos para cancelamento
              if (aiResponse.includes('[LISTAR_AGENDAMENTOS_CANCELAR]')) {
                console.log('📋 Listando agendamentos para CANCELAMENTO...');
                const appointmentsList = await listClientAppointmentsNumbered(phoneNumber, company.id, 'cancelar');
                aiResponse = aiResponse.replace(/.*\[LISTAR_AGENDAMENTOS_CANCELAR\].*/g, appointmentsList);
              }

              // Process [VERIFICAR_HORARIO_SEMANA:professionalName:time] command
              // Verifica se um horário específico está disponível em algum dia da semana
              const verificarHorarioMatch = aiResponse.match(/\[VERIFICAR_HORARIO_SEMANA:([^:]+):(\d{1,2}:\d{2})\]/);
              if (verificarHorarioMatch) {
                const [fullMatch, professionalIdentifier, targetTime] = verificarHorarioMatch;
                console.log(`🕐 Verificando horário ${targetTime} na semana para profissional "${professionalIdentifier}"`);

                // Buscar profissional
                const companyProfessionals = await storage.getProfessionalsByCompany(company.id);
                const profName = professionalIdentifier.trim().toLowerCase();

                // Buscar por nome (exato ou parcial)
                let foundProfessional = companyProfessionals.find(p =>
                  p.name.toLowerCase() === profName
                ) || companyProfessionals.find(p =>
                  p.name.toLowerCase().includes(profName) ||
                  p.name.toLowerCase().split(' ')[0] === profName
                );

                if (foundProfessional) {
                  console.log(`   ✅ Profissional encontrado: "${foundProfessional.name}" (ID: ${foundProfessional.id})`);
                  const resultado = await checkSpecificTimeAvailability(
                    company.id,
                    foundProfessional.id,
                    targetTime,
                    7 // verificar próximos 7 dias
                  );
                  aiResponse = aiResponse.replace(fullMatch, resultado);
                } else {
                  console.log(`   ⚠️ Profissional "${professionalIdentifier}" não encontrado`);
                  aiResponse = aiResponse.replace(fullMatch, `Desculpe, não consegui identificar o profissional "${professionalIdentifier}".`);
                }
              }

              // Process [MOSTRAR_HORARIOS_LIVRES:serviceId:professionalId:date] command
              // Suporta tanto IDs numéricos quanto NOMES de serviço/profissional
              // Fallback: detectar comandos [MOSTRAR_HORARIOS_LIVRES] SEM data (malformados)
              // Isso pode acontecer quando a IA tenta usar o comando sem ter coletado a data do cliente
              let horariosLivresMalformado;
              while ((horariosLivresMalformado = aiResponse.match(/\[MOSTRAR_HORARIOS_LIVRES:([^\]]+)\]/)) !== null) {
                if (/\d{4}-\d{2}-\d{2}/.test(horariosLivresMalformado[1])) break; // Tem data, sai do loop de malformados
                console.log(`⚠️ Comando [MOSTRAR_HORARIOS_LIVRES] malformado (sem data): "${horariosLivresMalformado[0]}"`);
                aiResponse = aiResponse.replace(horariosLivresMalformado[0], 'Em qual dia você gostaria de agendar? 😊');
              }

              // Processar TODOS os comandos [MOSTRAR_HORARIOS_LIVRES:serviço:profissional:data] (loop)
              // Buscar serviços e profissionais uma vez só (reutilizar para múltiplos comandos)
              let horariosLivresMatch;
              let horariosCompanyServices: any[] | null = null;
              let horariosCompanyProfessionals: any[] | null = null;

              while ((horariosLivresMatch = aiResponse.match(/\[MOSTRAR_HORARIOS_LIVRES:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})\]/)) !== null) {
                const [fullMatch, serviceIdentifier, professionalIdentifier, dateStr] = horariosLivresMatch;
                console.log(`📅 Mostrando horários livres: Serviço "${serviceIdentifier}", Profissional "${professionalIdentifier}", Data ${dateStr}`);

                // Buscar serviços e profissionais da empresa (apenas na primeira iteração)
                if (!horariosCompanyServices) {
                  horariosCompanyServices = await storage.getServicesByCompany(company.id);
                }
                if (!horariosCompanyProfessionals) {
                  horariosCompanyProfessionals = await storage.getProfessionalsByCompany(company.id);
                }
                const companyServices = horariosCompanyServices;
                const companyProfessionals = horariosCompanyProfessionals;

                // Resolver ID do serviço (pode ser número ou nome)
                // PRIORIDADE: 1) Match exato 2) Match único parcial 3) Nome mais curto se múltiplos
                let serviceId: number | null = null;
                if (/^\d+$/.test(serviceIdentifier.trim())) {
                  // É um número - usar diretamente
                  serviceId = parseInt(serviceIdentifier.trim());
                } else {
                  const serviceName = serviceIdentifier.trim().toLowerCase();
                  let foundService = null;

                  // 1. PRIORIDADE MÁXIMA: Match exato (case-insensitive)
                  foundService = companyServices.find(s =>
                    s.name.toLowerCase() === serviceName
                  );

                  if (foundService) {
                    console.log(`   ✅ Serviço encontrado (match exato): "${foundService.name}"`);
                  } else {
                    // 2. Buscar serviços que contêm o termo OU são contidos pelo termo
                    const matchingServices = companyServices.filter(s =>
                      s.name.toLowerCase().includes(serviceName) ||
                      serviceName.includes(s.name.toLowerCase())
                    );

                    if (matchingServices.length === 1) {
                      // Único match parcial - usar esse
                      foundService = matchingServices[0];
                      console.log(`   ✅ Serviço encontrado (match único): "${foundService.name}"`);
                    } else if (matchingServices.length > 1) {
                      // MÚLTIPLOS MATCHES - escolher o mais apropriado
                      console.log(`   🔍 Múltiplos serviços similares: ${matchingServices.map(s => `"${s.name}"`).join(', ')}`);

                      // Priorizar match que começa igual
                      const startsWithMatch = matchingServices.find(s =>
                        s.name.toLowerCase().startsWith(serviceName)
                      );

                      if (startsWithMatch && matchingServices.filter(s => s.name.toLowerCase().startsWith(serviceName)).length === 1) {
                        // Único que começa com o termo
                        foundService = startsWithMatch;
                        console.log(`   ✅ Serviço selecionado (começa com "${serviceName}"): "${foundService.name}"`);
                      } else {
                        // Pegar o de nome mais curto (geralmente o mais genérico)
                        // Ex: "Design" vs "Design com henna" - se buscou "Design", pega "Design"
                        foundService = matchingServices.sort((a, b) => a.name.length - b.name.length)[0];
                        console.log(`   ✅ Serviço selecionado (nome mais curto): "${foundService.name}"`);
                      }
                    }
                  }

                  if (foundService) {
                    serviceId = foundService.id;
                    console.log(`   📋 Serviço final: "${foundService.name}" (ID: ${serviceId})`);
                  } else {
                    console.log(`   ⚠️ Serviço "${serviceIdentifier}" não encontrado. Disponíveis:`, companyServices.map(s => s.name).join(', '));
                  }
                }

                // Resolver ID do profissional (pode ser número ou nome)
                // PRIORIDADE: 1) Match exato 2) Match único parcial 3) Primeiro nome
                let professionalId: number | null = null;
                if (/^\d+$/.test(professionalIdentifier.trim())) {
                  // É um número - usar diretamente
                  professionalId = parseInt(professionalIdentifier.trim());
                } else {
                  const profName = professionalIdentifier.trim().toLowerCase();
                  let foundProfessional = null;

                  // 1. PRIORIDADE MÁXIMA: Match exato (case-insensitive)
                  foundProfessional = companyProfessionals.find(p =>
                    p.name.toLowerCase() === profName
                  );

                  if (foundProfessional) {
                    console.log(`   ✅ Profissional encontrado (match exato): "${foundProfessional.name}"`);
                  } else {
                    // 2. Buscar por primeiro nome ou nome parcial
                    const matchingProfessionals = companyProfessionals.filter(p =>
                      p.name.toLowerCase().includes(profName) ||
                      profName.includes(p.name.toLowerCase()) ||
                      p.name.toLowerCase().split(' ')[0] === profName // Match por primeiro nome
                    );

                    if (matchingProfessionals.length === 1) {
                      foundProfessional = matchingProfessionals[0];
                      console.log(`   ✅ Profissional encontrado (match único): "${foundProfessional.name}"`);
                    } else if (matchingProfessionals.length > 1) {
                      console.log(`   🔍 Múltiplos profissionais similares: ${matchingProfessionals.map(p => `"${p.name}"`).join(', ')}`);
                      // Pegar o primeiro que começa com o nome buscado
                      const startsWithMatch = matchingProfessionals.find(p =>
                        p.name.toLowerCase().startsWith(profName)
                      );
                      foundProfessional = startsWithMatch || matchingProfessionals[0];
                      console.log(`   ✅ Profissional selecionado: "${foundProfessional.name}"`);
                    }
                  }

                  if (foundProfessional) {
                    professionalId = foundProfessional.id;
                    console.log(`   📋 Profissional final: "${foundProfessional.name}" (ID: ${professionalId})`);
                  } else {
                    console.log(`   ⚠️ Profissional "${professionalIdentifier}" não encontrado. Disponíveis:`, companyProfessionals.map(p => p.name).join(', '));
                  }
                }

                // Se encontrou ambos, buscar horários
                if (serviceId && professionalId) {
                  const horariosLivres = await getAvailableTimesForService(
                    company.id,
                    serviceId,
                    professionalId,
                    dateStr
                  );
                  aiResponse = aiResponse.replace(fullMatch, horariosLivres);
                } else {
                  // Não encontrou serviço ou profissional - mensagem amigável
                  let errorMsg = '';
                  if (!serviceId && !professionalId) {
                    errorMsg = `Desculpe, não consegui identificar o serviço "${serviceIdentifier}" nem o profissional "${professionalIdentifier}". Pode me informar novamente?`;
                  } else if (!serviceId) {
                    errorMsg = `Desculpe, não consegui identificar o serviço "${serviceIdentifier}". Pode me informar novamente qual serviço você deseja?`;
                  } else {
                    errorMsg = `Desculpe, não consegui identificar o profissional "${professionalIdentifier}". Pode me informar novamente com quem você gostaria de agendar?`;
                  }
                  aiResponse = aiResponse.replace(fullMatch, errorMsg);
                }
              }

              // ========================================
              // DETECTAR ESCOLHA POR NÚMERO (APÓS LISTAGEM DE AGENDAMENTOS)
              // ========================================
              const recentUserMessages = conversationHistory.slice(-5).filter(m => m.role === 'user').map(m => m.content).join(' ');
              const recentAssistantMessages = conversationHistory.slice(-5).filter(m => m.role === 'assistant').map(m => m.content).join(' ');

              // Verificar se a mensagem anterior continha listagem de agendamentos para cancelar
              const lastAssistantMessage = conversationHistory.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
              const wasListingForCancel = lastAssistantMessage.includes('Qual agendamento você deseja cancelar?');

              // Função para extrair número de várias formas de escrita
              const extractNumberFromText = (text: string, listMessage: string): number | null => {
                const lowerText = text.toLowerCase().trim();

                // Mapeamento de números escritos por extenso
                const writtenNumbers: { [key: string]: number } = {
                  'um': 1, 'uma': 1, 'primeiro': 1, 'primeira': 1, '1º': 1, '1ª': 1,
                  'dois': 2, 'duas': 2, 'segundo': 2, '2º': 2, '2ª': 2,
                  'tres': 3, 'três': 3, 'terceiro': 3, 'terceira': 3, '3º': 3, '3ª': 3,
                  'quatro': 4, '4º': 4, '4ª': 4,
                  'cinco': 5, 'quinto': 5, '5º': 5, '5ª': 5,
                  'seis': 6, 'sexto': 6, '6º': 6, '6ª': 6,
                  'sete': 7, 'setimo': 7, 'sétimo': 7, 'setima': 7, 'sétima': 7, '7º': 7, '7ª': 7,
                  'oito': 8, 'oitavo': 8, 'oitava': 8, '8º': 8, '8ª': 8,
                  'nove': 9, 'nono': 9, 'nona': 9, '9º': 9, '9ª': 9,
                  'dez': 10, 'decimo': 10, 'décimo': 10, 'decima': 10, 'décima': 10, '10º': 10, '10ª': 10
                };

                // Mapeamento de dias da semana
                const daysOfWeek: { [key: string]: string } = {
                  'domingo': 'Domingo', 'dom': 'Domingo',
                  'segunda': 'Segunda', 'seg': 'Segunda',
                  'terça': 'Terça', 'terca': 'Terça', 'ter': 'Terça',
                  'quarta': 'Quarta', 'qua': 'Quarta',
                  'quinta': 'Quinta', 'qui': 'Quinta',
                  'sexta': 'Sexta', 'sex': 'Sexta',
                  'sábado': 'Sábado', 'sabado': 'Sábado', 'sab': 'Sábado'
                };

                // Tentar match direto com número
                const directMatch = lowerText.match(/^[1-9]$|^10$/);
                if (directMatch) {
                  return parseInt(directMatch[0]);
                }

                // Tentar extrair número de frases como "o 1", "opção 2", "agendamento 3"
                const phraseMatch = lowerText.match(/(?:o|a|opção|opcao|agendamento|número|numero)\s*(\d+)/);
                if (phraseMatch && parseInt(phraseMatch[1]) >= 1 && parseInt(phraseMatch[1]) <= 10) {
                  return parseInt(phraseMatch[1]);
                }

                // Tentar encontrar dia da semana na mensagem do usuário
                for (const [dayKey, dayName] of Object.entries(daysOfWeek)) {
                  if (lowerText.includes(dayKey)) {
                    console.log(`🗓️ Usuário mencionou dia da semana: ${dayName}`);
                    // Procurar qual número corresponde a esse dia na lista
                    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
                    for (let i = 0; i < numberEmojis.length; i++) {
                      // Verificar se este número está associado ao dia mencionado
                      const emojiPattern = new RegExp(`${numberEmojis[i]}\\s*${dayName}`, 'i');
                      if (emojiPattern.test(listMessage)) {
                        console.log(`✅ Encontrado: ${dayName} é o agendamento número ${i + 1}`);
                        return i + 1;
                      }
                    }
                    break;
                  }
                }

                // Tentar encontrar número escrito por extenso (exceto dias da semana)
                for (const [word, num] of Object.entries(writtenNumbers)) {
                  // Evitar conflito com "segunda", "quarta", "quinta", "sexta" como dias da semana
                  if (['segunda', 'quarta', 'quinta', 'sexta'].includes(word)) {
                    // Só considera como número ordinal se tiver contexto de "opção" ou similar
                    if (lowerText.includes(`${word} opção`) || lowerText.includes(`a ${word}`)) {
                      return num;
                    }
                    continue;
                  }
                  if (lowerText.includes(word)) {
                    return num;
                  }
                }

                // Tentar extrair qualquer número da mensagem
                const anyNumberMatch = lowerText.match(/\b(\d+)\b/);
                if (anyNumberMatch && parseInt(anyNumberMatch[1]) >= 1 && parseInt(anyNumberMatch[1]) <= 10) {
                  return parseInt(anyNumberMatch[1]);
                }

                return null;
              };

              // Verificar se usuário respondeu com um número (várias formas)
              const selectedNumber = extractNumberFromText(messageText, lastAssistantMessage);

              if (wasListingForCancel && selectedNumber) {
                console.log(`📋 Usuário escolheu agendamento número: ${selectedNumber}`);

                // Buscar agendamentos do cliente - OTIMIZADO com consulta direta
                const cleanPhone = phoneNumber.replace(/\D/g, '');
                const nowBrasilia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
                const todayStr = nowBrasilia.toISOString().split('T')[0];

                const [appointmentRows] = await pool.execute(`
                  SELECT
                    a.id,
                    a.appointment_date as appointmentDate,
                    a.appointment_time as appointmentTime,
                    a.status,
                    a.professional_id as professionalId,
                    a.service_id as serviceId
                  FROM appointments a
                  LEFT JOIN professionals p ON a.professional_id = p.id
                  WHERE REPLACE(REPLACE(REPLACE(a.client_phone, '-', ''), ' ', ''), '(', '') LIKE ?
                    AND a.appointment_date >= ?
                    AND a.status IN ('Pendente', 'Confirmado', 'confirmado', 'pendente', 'agendado', 'Agendado', 'scheduled', 'confirmed')
                    AND p.company_id = ?
                  ORDER BY a.appointment_date ASC, a.appointment_time ASC
                  LIMIT 10
                `, [`%${cleanPhone}%`, todayStr, company.id]);

                const clientAppointments = appointmentRows as any[];

                if (selectedNumber <= clientAppointments.length) {
                  const selectedAppointment = clientAppointments[selectedNumber - 1];
                  const professional = await storage.getProfessional(selectedAppointment.professionalId);
                  const service = await storage.getService(selectedAppointment.serviceId);

                  const date = new Date(selectedAppointment.appointmentDate);
                  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
                  const dayName = dayNames[date.getDay()];

                  // Mostrar confirmação de cancelamento
                  aiResponse = `✅ Agendamento selecionado:

📅 ${dayName}, ${date.toLocaleDateString('pt-BR')} às ${selectedAppointment.appointmentTime}
💼 ${service?.name || 'Serviço'}
👤 ${professional?.name || 'Profissional'}

Confirma o cancelamento? Digite *CANCELAR* para confirmar ou *NÃO* para manter o agendamento.`;

                  // Salvar ID do agendamento no contexto para quando confirmar
                  await pool.execute(
                    `INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)`,
                    [conversation.id, 'system', `[PENDING_CANCEL_ID:${selectedAppointment.id}]`]
                  );
                } else {
                  aiResponse = `❌ Número inválido. Por favor, escolha um número entre 1 e ${clientAppointments.length}.`;
                }
              }

              // ========================================
              // PROCESSAR CONFIRMAÇÃO DE CANCELAMENTO (SIM após escolha de número)
              // ========================================
              const isConfirmingCancelWord = messageText.match(/^(cancelar|cancela|cancelamento)$/i);
              const isConfirmingSIM = messageText.match(/^(sim|sin|sím|sii|s|ok|confirmo|confirmar)$/i);
              const lastAssistantMsg = conversationHistory.filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
              const isAskingCancelConfirmation = lastAssistantMsg.includes('Confirma o cancelamento?') ||
                                                 lastAssistantMsg.includes('CANCELAR* para confirmar') ||
                                                 lastAssistantMsg.includes('CANCELAR para confirmar') ||
                                                 lastAssistantMsg.includes('SIM* para cancelar') ||
                                                 lastAssistantMsg.includes('SIM para cancelar') ||
                                                 lastAssistantMsg.includes('deseja cancelar o agendamento') ||
                                                 lastAssistantMsg.includes('deseja cancelar seu agendamento') ||
                                                 lastAssistantMsg.includes('deseja cancelar o seu agendamento') ||
                                                 lastAssistantMsg.includes('cancelar o agendamento atual') ||
                                                 lastAssistantMsg.includes('Qual agendamento você deseja cancelar') ||
                                                 (lastAssistantMsg.includes('cancelar') && lastAssistantMsg.includes('Posso prosseguir')) ||
                                                 (lastAssistantMsg.includes('cancelar') && lastAssistantMsg.includes('prosseguir'));

              console.log('🔍 DEBUG CANCELAMENTO:');
              console.log('   - Mensagem do usuário:', messageText);
              console.log('   - É confirmação CANCELAR?', !!isConfirmingCancelWord);
              console.log('   - É confirmação SIM?', !!isConfirmingSIM);
              console.log('   - Última msg do assistente (100 chars):', lastAssistantMsg.substring(0, 100));
              console.log('   - Está pedindo confirmação de cancelamento?', isAskingCancelConfirmation);

              if ((isConfirmingCancelWord || isConfirmingSIM) && isAskingCancelConfirmation) {
                console.log('✅ Usuário confirmou cancelamento com', isConfirmingCancelWord ? 'CANCELAR' : 'SIM');

                // Buscar o ID do agendamento pendente nas mensagens do sistema
                const allMessages = await storage.getMessagesByConversation(conversation.id);
                const pendingCancelMsg = allMessages.find(m => m.content.includes('[PENDING_CANCEL_ID:'));

                console.log('🔍 Buscando PENDING_CANCEL_ID...');
                console.log('   - Total de mensagens:', allMessages.length);
                console.log('   - Encontrou PENDING_CANCEL_ID?', !!pendingCancelMsg);

                if (pendingCancelMsg) {
                  const idMatch = pendingCancelMsg.content.match(/\[PENDING_CANCEL_ID:(\d+)\]/);
                  if (idMatch) {
                    const appointmentId = parseInt(idMatch[1]);
                    console.log(`🗑️ Cancelando agendamento ID: ${appointmentId}`);

                    const cancelResult = await cancelAppointmentById(appointmentId, company.id);

                    if (cancelResult.success) {
                      aiResponse = `✅ Agendamento cancelado com sucesso!

Seu agendamento foi removido da nossa agenda. Se precisar agendar novamente, é só me avisar! 😊`;

                      // Remover a mensagem pendente
                      await pool.execute(
                        `DELETE FROM messages WHERE conversation_id = ? AND content LIKE '%[PENDING_CANCEL_ID:%'`,
                        [conversation.id]
                      );
                    } else {
                      aiResponse = `❌ ${cancelResult.message}`;
                    }
                  }
                } else {
                  // FALLBACK: Tentar extrair dados da mensagem de confirmação
                  console.log('⚠️ PENDING_CANCEL_ID não encontrado, tentando fallback...');

                  // Verificar se o contexto é de remarcação (agente perguntou se quer cancelar, sem listar agendamentos ainda)
                  const isRescheduleContext = lastAssistantMsg.includes('cancelar o agendamento atual') ||
                                              lastAssistantMsg.includes('deseja cancelar o agendamento') ||
                                              lastAssistantMsg.includes('deseja cancelar seu agendamento');

                  if (isRescheduleContext && !lastAssistantMsg.includes('Confirma o cancelamento?')) {
                    // Contexto de remarcação: listar agendamentos para o cliente escolher qual cancelar
                    console.log('📋 Contexto de remarcação detectado - listando agendamentos para cancelar...');
                    const appointmentsList = await listClientAppointmentsNumbered(phoneNumber, company.id, 'cancelar');
                    aiResponse = appointmentsList;
                  } else {
                  // Extrair dados da mensagem de confirmação anterior
                  // Formato esperado: "📅 Segunda, 07/02/2026 às 10:40" e "💼 Serviço | 👤 Profissional"
                  const dateMatch = lastAssistantMsg.match(/📅\s+[^,]+,\s+(\d{2}\/\d{2}\/\d{4})\s+às\s+(\d{1,2}:\d{2})/);
                  const serviceMatch = lastAssistantMsg.match(/💼\s+([^|\n]+)/);
                  const profMatch = lastAssistantMsg.match(/👤\s+([^\n]+)/);

                  console.log('🔍 Dados extraídos do fallback:');
                  console.log('   - Data:', dateMatch ? dateMatch[1] : 'não encontrada');
                  console.log('   - Hora:', dateMatch ? dateMatch[2] : 'não encontrada');
                  console.log('   - Serviço:', serviceMatch ? serviceMatch[1].trim() : 'não encontrado');
                  console.log('   - Profissional:', profMatch ? profMatch[1].trim() : 'não encontrado');

                  if (dateMatch && serviceMatch && profMatch) {
                    const aptDateStr = dateMatch[1];
                    const aptTimeStr = dateMatch[2];
                    const serviceName = serviceMatch[1].trim();
                    const profName = profMatch[1].trim();

                    // Converter data para formato YYYY-MM-DD
                    const dateParts = aptDateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                    if (dateParts) {
                      const parsedDate = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`;
                      const parsedTime = aptTimeStr.padStart(5, '0');

                      console.log('🔍 Buscando agendamento: Data', parsedDate, 'Hora', parsedTime);

                      // Buscar agendamento pelo telefone, data e hora
                      const cleanPhone = phoneNumber.replace(/\D/g, '');
                      const [aptRows] = await pool.execute(`
                        SELECT a.id
                        FROM appointments a
                        LEFT JOIN professionals p ON a.professional_id = p.id
                        WHERE REPLACE(REPLACE(REPLACE(a.client_phone, '-', ''), ' ', ''), '(', '') LIKE ?
                          AND a.appointment_date = ?
                          AND a.appointment_time = ?
                          AND a.status IN ('Pendente', 'Confirmado', 'confirmado', 'pendente', 'agendado', 'Agendado', 'scheduled', 'confirmed')
                          AND p.company_id = ?
                        LIMIT 1
                      `, [`%${cleanPhone}%`, parsedDate, parsedTime, company.id]);

                      const foundApts = aptRows as any[];
                      if (foundApts.length > 0) {
                        const appointmentId = foundApts[0].id;
                        console.log(`🗑️ Fallback: Cancelando agendamento ID: ${appointmentId}`);

                        const cancelResult = await cancelAppointmentById(appointmentId, company.id);

                        if (cancelResult.success) {
                          aiResponse = `✅ Agendamento cancelado com sucesso!

Seu agendamento foi removido da nossa agenda. Se precisar agendar novamente, é só me avisar! 😊`;
                        } else {
                          aiResponse = `❌ ${cancelResult.message}`;
                        }
                      } else {
                        console.log('❌ Fallback: Agendamento não encontrado');
                        aiResponse = `❌ Não consegui encontrar o agendamento para cancelar. Por favor, tente novamente.`;
                      }
                    }
                  } else {
                    console.log('❌ Fallback: Dados insuficientes na mensagem');
                    aiResponse = `❌ Ocorreu um erro ao processar o cancelamento. Por favor, tente novamente desde o início.`;
                  }
                  } // fecha o else do isRescheduleContext
                }
              }

// Clean up confirmation message to avoid question detection issues
              if (aiResponse.toLowerCase().includes('agendamento realizado com sucesso')) {
                aiResponse = aiResponse.replace(/Qualquer dúvida[^.!]*[.!?]*/gi, '');
                aiResponse = aiResponse.replace(/estou por aqui[^.!]*[.!?]*/gi, '');
                aiResponse = aiResponse.replace(/Se precisar[^.!]*[.!?]*/gi, '');
                aiResponse = aiResponse.replace(/😊✂️/g, '');
                aiResponse = aiResponse.trim();
              }

              // ========================================
              // 📎 DETECTAR E PROCESSAR COMANDOS DE ENVIO DE ARQUIVOS DE CURSO
              // ========================================
              console.log('==================================================');
              console.log('🔍 VERIFICANDO COMANDOS DE ENVIO DE ARQUIVO');
              console.log('==================================================');
              console.log('📋 Empresa tem imagens de curso?', !!company.coursesImages);
              console.log('📋 Empresa tem PDFs de curso?', !!company.coursesPdfs);
              if (company.coursesImages) {
                console.log('🖼️ Imagens disponíveis:', company.coursesImages);
              }
              if (company.coursesPdfs) {
                console.log('📄 PDFs disponíveis:', company.coursesPdfs);
              }
              console.log('📝 Resposta completa da IA:', aiResponse);
              console.log('==================================================');

              const courseFileCommands = aiResponse.match(/\[ENVIAR_ARQUIVO_CURSO:(.*?)\]/g);
              let courseFilesToSend: string[] = [];

              console.log('🔎 Comandos encontrados:', courseFileCommands);

              if (courseFileCommands && courseFileCommands.length > 0) {
                console.log('==================================================');
                console.log('📎 COMANDOS DE ENVIO DE ARQUIVO DE CURSO DETECTADOS');
                console.log('==================================================');

                // Extrair URLs dos comandos
                courseFilesToSend = courseFileCommands.map(cmd => {
                  const match = cmd.match(/\[ENVIAR_ARQUIVO_CURSO:(.*?)\]/);
                  return match ? match[1].trim() : '';
                }).filter(url => url);

                console.log('📎 Arquivos a enviar:', courseFilesToSend);

                // Remover os comandos da resposta do AI
                aiResponse = aiResponse.replace(/\[ENVIAR_ARQUIVO_CURSO:.*?\]/g, '').trim();

                console.log('📝 Resposta após remoção dos comandos:', aiResponse.substring(0, 300));
              } else {
                console.log('⚠️ NENHUM COMANDO [ENVIAR_ARQUIVO_CURSO:] ENCONTRADO NA RESPOSTA DA IA');
                // Fallback: se keyword de curso foi detectada e empresa tem PDFs, enviar automaticamente
                if (courseKeywordDetected && company.coursesPdfs) {
                  courseFilesToSend = company.coursesPdfs
                    .split(',')
                    .map((url: string) => url.trim())
                    .filter((url: string) => url.length > 0);
                  if (courseFilesToSend.length > 0) {
                    console.log('📄 [COURSE-PDF] Fallback: enviando PDFs automaticamente após resposta da IA:', courseFilesToSend);
                  }
                }
              }
              // ========================================
              // FIM DA DETECÇÃO DE COMANDOS
              // ========================================

              // ========================================
              // 🚨 VALIDAÇÃO DE CONFLITO ANTES DE CONFIRMAR
              // ========================================
              // Detectar se a IA está confirmando um agendamento
              const confirmationKeywordsPreCheck = [
                'agendamento está confirmado',
                'agendamento realizado com sucesso',
                'realizado com sucesso',
                'confirmado para',
                'agendado para',
                'nos vemos',
                'te aguardo',
                'aguardamos você'
              ];

              const isConfirmingAppointment = confirmationKeywordsPreCheck.some(keyword =>
                aiResponse.toLowerCase().includes(keyword.toLowerCase())
              );

              if (isConfirmingAppointment) {
                console.log('==================================================');
                console.log('🚨 IA ESTÁ CONFIRMANDO AGENDAMENTO - VALIDANDO CONFLITOS');
                console.log('==================================================');
                console.log('📝 Resposta da IA:', aiResponse.substring(0, 300));

                // Extrair dados do agendamento da resposta da IA ou histórico recente
                const extractAppointmentDataFromAI = (text: string) => {
                  // Buscar data no formato DD/MM/YYYY
                  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
                  // Buscar horário
                  const timeMatch = text.match(/(?:às\s+)?(\d{1,2}:\d{2})/i);
                  // Buscar profissional (com nome próprio após "com")
                  const profMatch = text.match(/com\s+(?:a\s+|o\s+)?([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)/i);
                  // Buscar serviço (normalmente aparece antes da data)
                  const serviceMatch = text.match(/(?:serviço\s+)?([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã\s]+?)(?:\s+com|\s+para|\s+na|\s+em|\s+às)/i);

                  return {
                    date: dateMatch?.[1],
                    time: timeMatch?.[1],
                    professional: profMatch?.[1],
                    service: serviceMatch?.[1]?.trim()
                  };
                };

                let appointmentData = extractAppointmentDataFromAI(aiResponse);

                // Se não conseguiu extrair tudo da resposta atual, buscar nas mensagens recentes
                if (!appointmentData.date || !appointmentData.time || !appointmentData.professional) {
                  console.log('🔍 Dados incompletos na resposta atual, buscando no histórico...');
                  const recentHistory = conversationHistory.slice(-5).reverse();

                  for (const msg of recentHistory) {
                    const msgData = extractAppointmentDataFromAI(msg.content);
                    if (!appointmentData.date && msgData.date) appointmentData.date = msgData.date;
                    if (!appointmentData.time && msgData.time) appointmentData.time = msgData.time;
                    if (!appointmentData.professional && msgData.professional) appointmentData.professional = msgData.professional;
                    if (!appointmentData.service && msgData.service) appointmentData.service = msgData.service;

                    // Se já temos tudo, parar
                    if (appointmentData.date && appointmentData.time && appointmentData.professional) break;
                  }
                }

                console.log('📋 Dados extraídos:', appointmentData);

                // Se temos os dados mínimos necessários, validar conflito
                if (appointmentData.date && appointmentData.time && appointmentData.professional) {
                  try {
                    // Converter data de DD/MM/YYYY para YYYY-MM-DD
                    const dateParts = appointmentData.date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                    const parsedDate = dateParts ? `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}` : null;

                    // Normalizar horário
                    const timeParts = appointmentData.time.match(/(\d{1,2}):(\d{2})/);
                    const parsedTime = timeParts ? `${timeParts[1].padStart(2, '0')}:${timeParts[2]}` : null;

                    if (parsedDate && parsedTime) {
                      // Buscar profissional
                      const professionals = await storage.getProfessionalsByCompany(company.id);
                      const professional = professionals.find(p =>
                        appointmentData.professional &&
                        (p.name.toLowerCase().includes(appointmentData.professional.toLowerCase()) ||
                         appointmentData.professional.toLowerCase().includes(p.name.toLowerCase()))
                      );

                      if (professional) {
                        // Buscar serviço para obter duração
                        const services = await storage.getServicesByCompany(company.id);
                        const service = services.find(s =>
                          appointmentData.service &&
                          (s.name.toLowerCase().includes(appointmentData.service.toLowerCase()) ||
                           appointmentData.service.toLowerCase().includes(s.name.toLowerCase()))
                        );

                        const requestedDuration = service?.duration || 60;
                        console.log(`🔍 Validando conflito: ${professional.name}, ${parsedDate}, ${parsedTime}, duração: ${requestedDuration}min`);

                        // Parse requested time to minutes
                        const [requestedHour, requestedMin] = parsedTime.split(':').map(Number);
                        const requestedTimeInMinutes = requestedHour * 60 + requestedMin;
                        const requestedEndTimeInMinutes = requestedTimeInMinutes + requestedDuration;

                        // Buscar agendamentos existentes do profissional nesse dia
                        const allAppointments = await storage.getAppointmentsByCompany(company.id);
                        const conflictingAppointments = allAppointments.filter(apt => {
                          if (
                            apt.professionalId === professional.id &&
                            apt.appointmentDate === parsedDate &&
                            apt.status !== 'cancelado' &&
                            apt.status !== 'Cancelado'
                          ) {
                            const [aptHour, aptMin] = apt.appointmentTime.split(':').map(Number);
                            const aptTimeInMinutes = aptHour * 60 + aptMin;
                            const aptDuration = apt.duration || 30;
                            const aptEndTimeInMinutes = aptTimeInMinutes + aptDuration;

                            // Check for overlap
                            const hasOverlap = (
                              (requestedTimeInMinutes < aptEndTimeInMinutes) &&
                              (requestedEndTimeInMinutes > aptTimeInMinutes)
                            );

                            if (hasOverlap) {
                              console.log(`⚠️ CONFLITO: ${apt.clientName} (${apt.appointmentTime}-${Math.floor(aptEndTimeInMinutes/60)}:${String(aptEndTimeInMinutes%60).padStart(2,'0')})`);
                              return true;
                            }
                          }
                          return false;
                        });

                        if (conflictingAppointments.length > 0) {
                          console.log('❌ CONFLITO DE HORÁRIO DETECTADO!');
                          console.log('🚫 Bloqueando confirmação e informando cliente...');

                          // Calcular horários disponíveis
                          const appointmentDate = new Date(`${parsedDate}T00:00:00`);
                          const dayOfWeek = appointmentDate.getDay();
                          const dayNames = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
                          const availability = await storage.getProfessionalAvailability(professional.id, dayNames[dayOfWeek] as any);

                          let availableTimes: string[] = [];

                          if (availability && availability.isAvailable) {
                            const startHour = parseInt(availability.startTime.split(':')[0]);
                            const endHour = parseInt(availability.endTime.split(':')[0]);
                            const interval = professional.appointmentInterval || 30;

                            // Gerar todos os horários possíveis
                            for (let hour = startHour; hour < endHour; hour++) {
                              for (let min = 0; min < 60; min += interval) {
                                const timeInMin = hour * 60 + min;
                                const endTimeInMin = timeInMin + requestedDuration;
                                const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

                                // Verificar se não conflita com nenhum agendamento existente
                                const hasConflict = allAppointments.some(apt => {
                                  if (
                                    apt.professionalId === professional.id &&
                                    apt.appointmentDate === parsedDate &&
                                    apt.status !== 'cancelado' &&
                                    apt.status !== 'Cancelado'
                                  ) {
                                    const [aptHour, aptMin] = apt.appointmentTime.split(':').map(Number);
                                    const aptTimeInMin = aptHour * 60 + aptMin;
                                    const aptEndTimeInMin = aptTimeInMin + (apt.duration || 30);

                                    return (timeInMin < aptEndTimeInMin) && (endTimeInMin > aptTimeInMin);
                                  }
                                  return false;
                                });

                                if (!hasConflict) {
                                  availableTimes.push(timeStr);
                                }
                              }
                            }
                          }

                          // Substituir resposta da IA
                          if (availableTimes.length > 0) {
                            const availableTimesStr = availableTimes.slice(0, 6).join(', ');
                            aiResponse = `❌ O horário ${parsedTime} não está disponível para ${professional.name} no dia ${appointmentData.date}.

📅 Horários disponíveis para este dia:
${availableTimesStr}${availableTimes.length > 6 ? ' e outros' : ''}

Por favor, escolha um dos horários disponíveis acima.`;
                          } else {
                            // Nenhum horário no dia — sugerir próximos dias com disponibilidade
                            let alternativeDaysMsg = '';
                            if (service) {
                              try {
                                const nextDaySuggestions = await getAvailabilitySummary(company.id, professional.id, service.id, parsedDate, 8);
                                const daysWithSlots = nextDaySuggestions
                                  .filter(d => d.date !== parsedDate && (d.status === 'available' || d.status === 'partial') && d.slotsCount > 0);

                                if (daysWithSlots.length > 0) {
                                  const suggestions = daysWithSlots.slice(0, 5).map(d =>
                                    `📅 *${d.dayName}*, ${d.dateFormatted} — ${d.slotsCount} horário${d.slotsCount > 1 ? 's' : ''} disponível${d.slotsCount > 1 ? 'is' : ''}`
                                  ).join('\n');
                                  alternativeDaysMsg = `\n\nMas temos disponibilidade nos seguintes dias:\n\n${suggestions}\n\nQual desses dias fica melhor pra você?`;
                                }
                              } catch (err) {
                                console.error('⚠️ Erro ao buscar sugestões de dias:', err);
                              }
                            }

                            aiResponse = `❌ O horário ${parsedTime} não está disponível para ${professional.name} no dia ${appointmentData.date} e não há mais horários livres neste dia.${alternativeDaysMsg || '\n\nQue tal escolher outro dia?'}`;
                          }

                          console.log('✅ Resposta substituída - cliente será informado sobre conflito');
                          console.log('📝 Nova resposta:', aiResponse);
                        } else {
                          console.log('✅ Nenhum conflito encontrado - agendamento pode prosseguir');
                        }
                      } else {
                        console.log('⚠️ Profissional não encontrado no banco de dados');
                      }
                    }
                  } catch (error) {
                    console.error('❌ Erro ao validar conflito:', error);
                  }
                } else {
                  console.log('⚠️ Dados insuficientes para validar conflito');
                }
              }
              // ========================================
              // FIM DA VALIDAÇÃO DE CONFLITO
              // ========================================

              // Send response back via UAZAPI using global settings
              console.log('==================================================');
              console.log('🚀 ENVIANDO RESPOSTA VIA UAZAPI');
              console.log('==================================================');
              console.log('📝 Resposta Final (primeiros 500 caracteres):', aiResponse.substring(0, 500));
              console.log('🔍 Tipo de resposta:');
              console.log('   - É confirmação de remarcação?', aiResponse.includes('Confirma a remarcação?'));
              console.log('   - É horário indisponível?', aiResponse.includes('Horário indisponível'));
              console.log('   - Pede telefone?', aiResponse.toLowerCase().includes('telefone'));
              console.log('   - Pede nome?', aiResponse.toLowerCase().includes('nome'));
              console.log('==================================================');

              // ========================================
              // 💳 VERIFICAR SE É RESPOSTA À PERGUNTA DE PAGAMENTO
              // Se sim, NÃO interceptar - deixar o fluxo de pagamento processar
              // ========================================
              const msgsForPaymentCheck = await storage.getMessagesByConversation(conversation.id);

              // Ordenar por ID decrescente para pegar a mais recente primeiro
              const sortedAssistantMsgs = msgsForPaymentCheck
                .filter(m => m.role === 'assistant')
                .sort((a, b) => (b.id || 0) - (a.id || 0)); // ID maior = mais recente

              const lastAssistantMsgCheck = sortedAssistantMsgs[0]; // Primeira = mais recente

              console.log('💳 DEBUG PAGAMENTO:');
              console.log('   - messageText:', messageText);
              console.log('   - Última msg assistente (ID ' + (lastAssistantMsgCheck?.id || 'N/A') + '):', lastAssistantMsgCheck?.content?.substring(0, 100) || 'NENHUMA');

              const isRespondingToPaymentQuestion = lastAssistantMsgCheck &&
                (lastAssistantMsgCheck.content.includes('Forma de Pagamento') ||
                 lastAssistantMsgCheck.content.includes('Digite 1 para PIX'));

              const isPaymentChoiceMessage = /\b(1|2|pix|cart[aã]o|credito|crédito|credit)\b/i.test(messageText.trim());

              console.log('   - isRespondingToPaymentQuestion:', isRespondingToPaymentQuestion);
              console.log('   - isPaymentChoiceMessage:', isPaymentChoiceMessage);

              if (isRespondingToPaymentQuestion && isPaymentChoiceMessage) {
                console.log('💳 ✅ Usuário está respondendo à pergunta de pagamento - PULANDO interceptação');
                // Não fazer nada aqui - deixar o código continuar para o processamento de pagamento
              } else {
                console.log('💳 ❌ Não é resposta de pagamento - verificando interceptação...');
                // ========================================
                // 💳 INTERCEPTAR CONFIRMAÇÃO PARA ASAAS
                // Se Asaas habilitado E resposta é confirmação, enviar pergunta de pagamento
                // ========================================
                const isConfirmationResponse = (
                  aiResponse.includes('Agendamento realizado') ||
                  aiResponse.includes('agendamento foi confirmado') ||
                  aiResponse.includes('Nos vemos') ||
                  aiResponse.includes('está confirmado')
                );

              if (isConfirmationResponse && !isPostConfirmationContext) {
                console.log('💳 Resposta é confirmação de agendamento - verificando Asaas...');

                // Check if company has Asaas configured
                const companyForAsaas = await storage.getCompany(company.id);
                const asaasEnabledForIntercept = companyForAsaas?.asaasEnabled && companyForAsaas?.asaasApiKey;

                if (asaasEnabledForIntercept) {
                  console.log('💳 Asaas habilitado - interceptando para perguntar forma de pagamento');

                  // Buscar mensagem de resumo com dados do serviço
                  const msgsForAsaas = await storage.getMessagesByConversation(conversation.id);
                  const summaryMsgForAsaas = msgsForAsaas.find(m =>
                    m.role === 'assistant' &&
                    !m.content.includes('Agendamento realizado') &&
                    !m.content.includes('Nos vemos') &&
                    (m.content.includes('💼') || m.content.includes('Serviço:')) &&
                    (m.content.includes('📅') || m.content.includes('Data:'))
                  );

                  if (summaryMsgForAsaas) {
                    // Extrair serviço
                    const serviceMatchAsaas = summaryMsgForAsaas.content.match(/(?:💼|✂️)\s*(?:Serviço:?)?\s*([^\n]+)/i) ||
                                              summaryMsgForAsaas.content.match(/Serviço:\s*([^\n]+)/i);

                    if (serviceMatchAsaas) {
                      const extractedServiceAsaas = serviceMatchAsaas[1].trim();
                      const servicesAsaas = await storage.getServicesByCompany(company.id);

                      // Match EXATO primeiro
                      let serviceAsaas = servicesAsaas.find(s =>
                        s.name.toLowerCase() === extractedServiceAsaas.toLowerCase() &&
                        s.price && Number(s.price) > 0
                      );

                      if (serviceAsaas) {
                        console.log(`💳 Serviço encontrado: ${serviceAsaas.name} - R$ ${serviceAsaas.price}`);
                        console.log('💳 INTERCEPTANDO - Enviando pergunta de pagamento ao invés da confirmação');

                        // Formatar telefone
                        let phoneForPayment = phoneNumber.replace(/\D/g, '');
                        if (!phoneForPayment.startsWith('55') && phoneForPayment.length >= 10) {
                          phoneForPayment = '55' + phoneForPayment;
                        }

                        const paymentQuestionMsg = `💳 *Forma de Pagamento*\n\nPara confirmar seu agendamento, como você prefere pagar?\n\n1️⃣ *PIX* - Pagamento instantâneo\n2️⃣ *Cartão de Crédito* - Parcele em até 12x\n\n💰 Valor: R$ ${Number(serviceAsaas.price).toFixed(2)}\n\n_Digite 1 para PIX ou 2 para Cartão_`;

                        await uazapiSendTyping(instanceName, phoneForPayment, 1500);

                        await uazapiSendText(instanceName, phoneForPayment, paymentQuestionMsg);
                        // Registrar no cache para detectar eco no Chatwoot
                        cacheAIResponse(conversation.id, paymentQuestionMsg);

                        await storage.createMessage({
                          conversationId: conversation.id,
                          content: paymentQuestionMsg,
                          role: 'assistant',
                          messageType: 'text',
                          delivered: true,
                          timestamp: new Date(),
                        });

                        console.log('💳 ✅ Pergunta de pagamento enviada - RETORNANDO sem enviar confirmação da IA');

                        // IMPORTANTE: Liberar o lock antes de retornar!
                        const lockKeyForPayment = `${company.id}:${instanceName}:${phoneNumber}`;
                        if (processingLocks.has(lockKeyForPayment)) {
                          processingLocks.delete(lockKeyForPayment);
                          console.log('🔓 Lock liberado (interceptação Asaas)');
                        }

                        return res.status(200).json({ received: true, processed: true, awaitingPaymentChoice: true });
                      }
                    }
                  }
                }
              }
              } // Fim do else (não é resposta à pergunta de pagamento)
              // ========================================
              // FIM DA INTERCEPTAÇÃO ASAAS
              // ========================================

              // Flag para controlar se deve enviar resposta da IA
              const shouldSkipAIResponse = isRespondingToPaymentQuestion && isPaymentChoiceMessage;

              if (shouldSkipAIResponse) {
                console.log('💳 ========================================');
                console.log('💳 PULANDO ENVIO DE RESPOSTA DA IA');
                console.log('💳 Motivo: Usuário está escolhendo forma de pagamento');
                console.log('💳 ========================================');
                // Não enviar resposta da IA - ir direto para processamento de pagamento
              }

              if (!shouldSkipAIResponse) {
                // Format phone number for UAZAPI - needs country code 55
                let formattedPhoneForApi = phoneNumber.replace(/\D/g, '');
                if (!formattedPhoneForApi.startsWith('55') && formattedPhoneForApi.length >= 10) {
                  formattedPhoneForApi = '55' + formattedPhoneForApi;
                }
                console.log('📞 Formatted phone for UAZAPI:', formattedPhoneForApi);

                // Send "typing" presence and wait 2 seconds
                await uazapiSendTyping(instanceName, formattedPhoneForApi, 2000);
                console.log('⏳ Aguardando 2 segundos (mostrando digitando...)');
                await new Promise(resolve => setTimeout(resolve, 2000));
                console.log('✅ Delay concluído, enviando mensagem agora');

                const uazapiResponse = await uazapiSendText(instanceName, formattedPhoneForApi, aiResponse);

              if (uazapiResponse.ok) {
                console.log(`✅ AI response sent to ${phoneNumber}: ${aiResponse}`);
                
                // Save AI response to database
                console.log('💾 Saving AI response to database');
                await storage.createMessage({
                  conversationId: conversation.id,
                  content: aiResponse,
                  role: 'assistant',
                  messageType: 'text',
                  delivered: true,
                  timestamp: new Date(),
                });
                console.log('✅ AI response saved to conversation history');

                // 🤖 Registrar resposta da AI no cache para detectar eco no Chatwoot
                // Quando o Chatwoot sincroniza esta resposta, o webhook message_created
                // a identifica incorretamente como "mensagem de agente humano" e ativa o human takeover.
                // Este cache permite que o handler do Chatwoot reconheça e ignore esses ecos.
                cacheAIResponse(conversation.id, aiResponse);
                console.log('🤖 [AI-CACHE] Resposta registrada no cache para detecção de eco no Chatwoot');

                // ========================================
                // ⏰ AGENDAR LEMBRETE DE CONFIRMAÇÃO (10 MINUTOS)
                // Se a IA enviou um resumo de confirmação, agendar lembrete
                // caso o cliente não responda em 10 minutos
                // ========================================
                if (isConfirmationSummary(aiResponse)) {
                  const confirmTimerKeySched = `${company.id}:${phoneNumber}`;

                  // Cancelar timer anterior se existir (evita duplicatas)
                  if (pendingConfirmationTimers.has(confirmTimerKeySched)) {
                    const existing = pendingConfirmationTimers.get(confirmTimerKeySched)!;
                    clearTimeout(existing.timer);
                    pendingConfirmationTimers.delete(confirmTimerKeySched);
                    console.log(`⏰ Timer anterior cancelado para ${confirmTimerKeySched}`);
                  }

                  console.log(`⏰ Agendando lembrete de confirmação para ${confirmTimerKeySched} em 10 minutos`);

                  const reminderConversationId = conversation.id;
                  const reminderInstanceName = instanceName;
                  const reminderCompanyId = company.id;
                  const reminderPhoneNumber = phoneNumber;

                  const reminderTimer = setTimeout(async () => {
                    try {
                      console.log(`⏰ Timer de lembrete disparado para ${confirmTimerKeySched}`);

                      // Buscar configurações atualizadas (podem ter mudado em 10 minutos)
                      const currentGlobalSettings = await storage.getGlobalSettings();
                      if (!currentGlobalSettings?.uazapiUrl || !currentGlobalSettings?.uazapiAdminToken) {
                        console.error('❌ UAZAPI não configurada para lembrete');
                        pendingConfirmationTimers.delete(confirmTimerKeySched);
                        return;
                      }

                      const reminderMessage = 'Oi! 😊 Notei que seu agendamento ainda não foi confirmado. Basta responder *SIM* para confirmar! Se precisar alterar algo, é só me dizer.';

                      // Formatar número para API
                      let reminderPhone = reminderPhoneNumber.replace(/\D/g, '');
                      if (!reminderPhone.startsWith('55') && reminderPhone.length >= 10) {
                        reminderPhone = '55' + reminderPhone;
                      }

                      // Enviar presença "digitando"
                      await uazapiSendTyping(reminderInstanceName, reminderPhone, 2000);
                      await new Promise(resolve => setTimeout(resolve, 2000));

                      // Enviar lembrete via WhatsApp
                      const reminderResponse = await uazapiSendText(reminderInstanceName, reminderPhone, reminderMessage);

                      if (reminderResponse.ok) {
                        console.log(`✅ Lembrete de confirmação enviado para ${reminderPhoneNumber}`);
                        // Registrar no cache para detectar eco no Chatwoot
                        cacheAIResponse(reminderConversationId, reminderMessage);

                        // Salvar lembrete no banco como mensagem do assistente
                        await storage.createMessage({
                          conversationId: reminderConversationId,
                          content: reminderMessage,
                          role: 'assistant',
                          messageType: 'text',
                          delivered: true,
                          timestamp: new Date(),
                        });
                        console.log('✅ Lembrete salvo no histórico da conversa');
                      } else {
                        console.error(`❌ Falha ao enviar lembrete: Status ${reminderResponse.status}`);
                      }
                    } catch (error) {
                      console.error('❌ Erro ao enviar lembrete de confirmação:', error);
                    } finally {
                      // Sempre limpar o timer do mapa
                      pendingConfirmationTimers.delete(confirmTimerKeySched);
                    }
                  }, 29 * 60 * 1000); // 29 minutos

                  pendingConfirmationTimers.set(confirmTimerKeySched, {
                    timer: reminderTimer,
                    conversationId: reminderConversationId,
                    instanceName: reminderInstanceName,
                    companyId: reminderCompanyId,
                    phoneNumber: reminderPhoneNumber,
                  });

                  console.log(`⏰ Timer agendado com sucesso. Total de timers ativos: ${pendingConfirmationTimers.size}`);
                }

                // ========================================
                // 💬 AGENDAR FOLLOW-UP DE CONVERSA (30 MINUTOS)
                // Se a IA NÃO enviou confirmação de agendamento, NÃO é conclusão de atendimento,
                // cliente NÃO tem agendamento futuro, e ainda não enviou follow-up,
                // agendar lembrete contextual caso o cliente pare de responder
                // ========================================
                if (!isConfirmationSummary(aiResponse) && !isConversationConcluded(aiResponse)) {
                  const followUpKeySched = `${company.id}:${phoneNumber}`;

                  // Não agendar follow-up se o cliente já tem agendamento futuro (consulta banco)
                  // (após agendar, o cliente pode tirar dúvidas sem ser "cobrado" por inatividade)
                  const hasAppointment = await clientHasFutureAppointment(company.id, phoneNumber);
                  if (hasAppointment) {
                    console.log(`🚫 [FOLLOW-UP] Suprimido para ${followUpKeySched} — cliente já tem agendamento futuro`);
                  }
                  // Só agendar se ainda não enviou follow-up nesta conversa
                  else if (!conversationFollowUpSent.has(followUpKeySched)) {
                    // Cancelar timer anterior se existir (cada nova mensagem da IA reseta o timer)
                    if (conversationFollowUpTimers.has(followUpKeySched)) {
                      const existingFollowUp = conversationFollowUpTimers.get(followUpKeySched)!;
                      clearTimeout(existingFollowUp.timer);
                      conversationFollowUpTimers.delete(followUpKeySched);
                    }

                    const followUpConversationId = conversation.id;
                    const followUpInstanceName = instanceName;
                    const followUpCompanyId = company.id;
                    const followUpPhoneNumber = phoneNumber;
                    const followUpOpenaiKey = company.openaiApiKey;
                    const followUpModel = company.openaiModel || 'gpt-4o-mini';

                    console.log(`💬 Agendando follow-up de conversa para ${followUpKeySched} em 30 minutos`);

                    const followUpTimer = setTimeout(async () => {
                      try {
                        console.log(`💬 Timer de follow-up disparado para ${followUpKeySched}`);

                        // Verificar se o cliente agendou durante os 30 min de espera (consulta banco)
                        const hasAppointmentAtDispatch = await clientHasFutureAppointment(followUpCompanyId, followUpPhoneNumber);
                        if (hasAppointmentAtDispatch) {
                          console.log(`🚫 [FOLLOW-UP] Timer disparado mas cliente ${followUpKeySched} já tem agendamento futuro — suprimindo envio`);
                          conversationFollowUpTimers.delete(followUpKeySched);
                          return;
                        }

                        // Marcar como enviado ANTES de enviar (evita duplicatas)
                        conversationFollowUpSent.add(followUpKeySched);

                        // Buscar configurações atualizadas
                        const currentGlobalSettings = await storage.getGlobalSettings();
                        if (!currentGlobalSettings?.uazapiUrl || !currentGlobalSettings?.uazapiAdminToken) {
                          console.error('❌ UAZAPI não configurada para follow-up');
                          conversationFollowUpTimers.delete(followUpKeySched);
                          return;
                        }

                        // Verificar se a conversa ainda está em modo agente (não foi assumida por humano)
                        const currentConversation = await storage.getConversation(
                          followUpCompanyId,
                          conversation.whatsappInstanceId,
                          followUpPhoneNumber
                        );
                        if (currentConversation && currentConversation.takeoverMode === 'human') {
                          console.log('💬 Conversa em modo humano, cancelando follow-up');
                          conversationFollowUpTimers.delete(followUpKeySched);
                          return;
                        }

                        // Buscar últimas mensagens para contexto
                        const recentMsgs = await storage.getRecentMessages(followUpConversationId, 10);
                        const lastMessages = recentMsgs
                          .reverse()
                          .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
                          .map((msg: any) => ({
                            role: msg.role as 'user' | 'assistant',
                            content: msg.content
                          }));

                        // Usar IA para gerar mensagem contextual de follow-up
                        const OpenAIFollowUp = (await import('openai')).default;
                        const followUpOpenai = new OpenAIFollowUp({ apiKey: followUpOpenaiKey });

                        const followUpCompletion = await followUpOpenai.chat.completions.create({
                          model: followUpModel,
                          messages: [
                            {
                              role: 'system',
                              content: `Você é um assistente de atendimento via WhatsApp. O cliente parou de responder há 30 minutos durante a conversa. Gere UMA mensagem curta e amigável (máximo 2 frases) pedindo para o cliente continuar o atendimento. A mensagem deve ser contextual baseada no histórico da conversa. Não repita informações já dadas. Use tom amigável e informal. Não use markdown. Não mencione o tempo que passou. IMPORTANTE: NÃO use nenhum nome na mensagem — nem o nome do cliente, nem o nome da empresa, nem nome de profissional ou atendente. Comece a mensagem de forma genérica (ex: "Oi!", "Olá!", "E aí!").`
                            },
                            ...lastMessages,
                            {
                              role: 'user',
                              content: '[SISTEMA: O cliente não respondeu há 30 minutos. Gere uma mensagem de follow-up contextual para retomar o atendimento.]'
                            }
                          ],
                          temperature: 0.7,
                          max_tokens: 100,
                        });

                        const followUpMessage = followUpCompletion.choices[0]?.message?.content || 'Oi! 😊 Estou por aqui caso precise de algo. Posso te ajudar em alguma coisa?';

                        // Formatar número para API
                        let followUpPhone = followUpPhoneNumber.replace(/\D/g, '');
                        if (!followUpPhone.startsWith('55') && followUpPhone.length >= 10) {
                          followUpPhone = '55' + followUpPhone;
                        }

                        // Enviar presença "digitando"
                        await uazapiSendTyping(followUpInstanceName, followUpPhone, 2000);
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // Enviar follow-up via WhatsApp
                        const followUpResponse = await uazapiSendText(followUpInstanceName, followUpPhone, followUpMessage);

                        if (followUpResponse.ok) {
                          console.log(`✅ Follow-up de conversa enviado para ${followUpPhoneNumber}: ${followUpMessage}`);
                          // Registrar no cache para detectar eco no Chatwoot
                          cacheAIResponse(followUpConversationId, followUpMessage);

                          // Salvar no histórico da conversa
                          await storage.createMessage({
                            conversationId: followUpConversationId,
                            content: followUpMessage,
                            role: 'assistant',
                            messageType: 'text',
                            delivered: true,
                            timestamp: new Date(),
                          });
                          console.log('✅ Follow-up salvo no histórico da conversa');
                        } else {
                          console.error(`❌ Falha ao enviar follow-up: Status ${followUpResponse.status}`);
                        }
                      } catch (error) {
                        console.error('❌ Erro ao enviar follow-up de conversa:', error);
                      } finally {
                        conversationFollowUpTimers.delete(followUpKeySched);
                      }
                    }, 30 * 60 * 1000); // 30 minutos

                    conversationFollowUpTimers.set(followUpKeySched, {
                      timer: followUpTimer,
                      conversationId: followUpConversationId,
                      instanceName: followUpInstanceName,
                      companyId: followUpCompanyId,
                      phoneNumber: followUpPhoneNumber,
                    });

                    console.log(`💬 Follow-up agendado. Total de follow-ups ativos: ${conversationFollowUpTimers.size}`);
                  } else {
                    console.log(`💬 Follow-up já enviado para ${followUpKeySched}, não agendar novamente`);
                  }
                } else {
                  // Conversa concluída (agendamento confirmado, cancelado, etc) ou confirmação pendente
                  // Cancelar qualquer timer de follow-up pendente - não faz sentido enviar
                  const followUpKeyCancel = `${company.id}:${phoneNumber}`;
                  if (conversationFollowUpTimers.has(followUpKeyCancel)) {
                    const pendingFollowUp = conversationFollowUpTimers.get(followUpKeyCancel)!;
                    clearTimeout(pendingFollowUp.timer);
                    conversationFollowUpTimers.delete(followUpKeyCancel);
                    console.log(`💬 Timer de follow-up CANCELADO (conversa concluída/confirmação) para ${followUpKeyCancel}`);
                  }
                }

                // ========================================
                // 📎 ENVIAR ARQUIVOS DE CURSO (SE HOUVER)
                // ========================================
                if (courseFilesToSend.length > 0) {
                  console.log('==================================================');
                  console.log('📎 ENVIANDO ARQUIVOS DE CURSO');
                  console.log('==================================================');
                  console.log('📎 Total de arquivos a enviar:', courseFilesToSend.length);

                  for (const fileUrl of courseFilesToSend) {
                    try {
                      console.log('📤 Enviando arquivo:', fileUrl);

                      // Detectar tipo de arquivo pela extensão
                      const fileExtension = fileUrl.split('.').pop()?.toLowerCase();
                      let mediaType = 'image'; // padrão para imagens

                      if (['pdf'].includes(fileExtension || '')) {
                        mediaType = 'document';
                      }

                      console.log('📎 Tipo de mídia detectado:', mediaType);

                      // Extrair caminho do arquivo da URL
                      let filePath = fileUrl;
                      try {
                        const urlObj = new URL(fileUrl);
                        filePath = urlObj.pathname.substring(1); // Remove leading slash
                      } catch {
                        filePath = fileUrl.replace(/^\//, '');
                      }

                      // Caminho completo no servidor com proteção contra path traversal
                      const fullPath = path.resolve(process.cwd(), filePath);
                      const uploadsDir = path.resolve(process.cwd(), 'uploads');
                      if (!fullPath.startsWith(uploadsDir)) {
                        console.error('[COURSE-FILE] Path traversal blocked');
                        continue;
                      }

                      // Verificar se arquivo existe
                      if (!fs.existsSync(fullPath)) {
                        console.error('❌ Arquivo não encontrado:', fullPath);
                        continue;
                      }

                      // Ler arquivo e converter para base64 PURO
                      const fileBuffer = fs.readFileSync(fullPath);
                      const base64Data = fileBuffer.toString('base64');

                      console.log('📦 Arquivo convertido para base64');
                      console.log('📦 Tamanho do base64:', base64Data.length, 'caracteres');

                      // Adicionar delay antes de enviar (para simular digitação)
                      await new Promise(resolve => setTimeout(resolve, 1000));

                      // Extrair nome do arquivo
                      const fileName = path.basename(filePath);

                      const mediaCaption = mediaType === 'image' ? '' : 'Informações do curso';

                      // Para documentos (PDFs), log do fileName
                      if (mediaType === 'document') {
                        console.log('📄 Nome do arquivo PDF:', fileName);
                      }

                      // Log do payload (sem mostrar base64 completo)
                      console.log('📤 Payload para UAZAPI:', {
                        number: formattedPhoneForApi,
                        mediatype: mediaType,
                        caption: mediaCaption,
                        media: `${base64Data.substring(0, 50)}... (${base64Data.length} chars total)`
                      });

                      // Enviar arquivo usando UAZAPI helper
                      const mediaResponse = await uazapiSendMedia(instanceName, formattedPhoneForApi, mediaType, base64Data, mediaCaption);

                      console.log('📥 Resposta da UAZAPI:', {
                        status: mediaResponse.status,
                        ok: mediaResponse.ok,
                      });

                      if (mediaResponse.ok) {
                        console.log('✅ Arquivo enviado com sucesso:', fileUrl);

                        // Salvar registro do envio de mídia no banco
                        await storage.createMessage({
                          conversationId: conversation.id,
                          content: `[Arquivo enviado: ${fileUrl}]`,
                          role: 'assistant',
                          messageType: mediaType,
                          delivered: true,
                          timestamp: new Date(),
                        });
                      } else {
                        console.error('❌ Erro ao enviar arquivo:', {
                          fileUrl,
                          status: mediaResponse.status,
                          error: responseText
                        });
                      }
                    } catch (fileError) {
                      console.error('❌ Erro ao processar arquivo:', fileUrl, fileError);
                    }
                  }

                  console.log('==================================================');
                  console.log('✅ ENVIO DE ARQUIVOS DE CURSO CONCLUÍDO');
                  console.log('==================================================');
                }
                // ========================================
                // FIM DO ENVIO DE ARQUIVOS
                // ========================================

                // Limpar lock de processamento
                const lockKey = `${company.id}:${instanceName}:${phoneNumber}`;
                if (processingLocks.has(lockKey)) {
                  processingLocks.delete(lockKey);
                  console.log('🔓 Lock liberado');
                }

                // ========================================
                // 🤝 PROCESS HUMAN REQUEST AFTER AI RESPONSE
                // ========================================
                if ((req as any).humanRequestDetected) {
                  console.log('✅ [HUMAN-REQUEST] Processing human request AFTER AI response...');
                  const humanData = (req as any).humanRequestData;

                  // Update conversation to human mode
                  await storage.updateConversation(conversation.id, {
                    takeoverMode: 'human',
                    lastMessageAt: new Date(),
                  });
                  console.log('✅ [HUMAN-REQUEST] Conversation switched to human mode');

                  // Send notification to configured contact
                  if (humanData.humanRequestContact) {
                    console.log('📤 [HUMAN-REQUEST] Sending notification to:', humanData.humanRequestContact);

                    try {
                      const globalSettings = await storage.getGlobalSettings();
                      if (globalSettings?.uazapiUrl && globalSettings?.uazapiAdminToken) {
                        // Prepare notification message
                        let notificationMessage = humanData.humanRequestMessage ||
                          'Olá! Um cliente está solicitando atendimento humano.\n\n👤 Cliente: {clientName}\n📞 Telefone: {clientPhone}\n⏰ Horário: {time}\n\nPor favor, entre em contato o mais rápido possível.';

                        // Replace variables
                        const now = new Date();
                        notificationMessage = notificationMessage
                          .replace('{clientName}', humanData.contactName)
                          .replace('{clientPhone}', humanData.phoneNumber)
                          .replace('{time}', now.toLocaleString('pt-BR'));

                        // Send message to configured contact
                        const notificationResponse = await uazapiSendText(humanData.instanceName, humanData.humanRequestContact, notificationMessage);

                        if (notificationResponse.ok) {
                          console.log('✅ [HUMAN-REQUEST] Notification sent successfully');
                        } else {
                          console.log('❌ [HUMAN-REQUEST] Failed to send notification:', notificationResponse.status);
                        }
                      }
                    } catch (error) {
                      console.error('❌ [HUMAN-REQUEST] Error sending notification:', error);
                    }
                  }
                }

                // ========================================
                // 🎓 PROCESS COURSE NOTIFICATION AFTER AI RESPONSE
                // ========================================
                // Note: PDFs are now sent directly BEFORE AI response when keyword is detected
                // This section only handles cases where there are no PDFs (AI responds normally)
                if ((req as any).courseNotificationData?.shouldSendNotification) {
                  console.log('✅ [COURSE-NOTIFICATION] Processing course notification AFTER AI response (no PDF case)...');
                  const courseData = (req as any).courseNotificationData;

                  // Send notification to configured contact
                  if (courseData.courseNotificationContact) {
                    console.log('📤 [COURSE-NOTIFICATION] Sending notification to:', courseData.courseNotificationContact);

                    try {
                      const globalSettings = await storage.getGlobalSettings();
                      if (globalSettings?.uazapiUrl && globalSettings?.uazapiAdminToken) {
                        // Adjust default message based on whether AI will pause
                        const defaultMessage = courseData.shouldPauseAI
                          ? '🎓 *Interesse em Curso Detectado!*\n\n👤 Cliente: {clientName}\n📞 Telefone: {clientPhone}\n💬 Mensagem: {message}\n⏰ Horário: {time}\n\n⏸️ O agente IA foi pausado por ' + courseData.timeoutMinutes + ' minutos.'
                          : '🎓 *Interesse em Curso Detectado!*\n\n👤 Cliente: {clientName}\n📞 Telefone: {clientPhone}\n💬 Mensagem: {message}\n⏰ Horário: {time}\n\n✅ O agente IA respondeu sobre os cursos.';

                        let notificationMessage = courseData.courseNotificationMessage || defaultMessage;

                        const now = new Date();
                        notificationMessage = notificationMessage
                          .replace('{clientName}', courseData.contactName)
                          .replace('{clientPhone}', courseData.phoneNumber)
                          .replace('{message}', courseData.messageText?.substring(0, 200) || '')
                          .replace('{time}', now.toLocaleString('pt-BR'));

                        await uazapiSendText(courseData.instanceName, courseData.courseNotificationContact, notificationMessage);
                        console.log('✅ [COURSE-NOTIFICATION] Notification sent');
                      }
                    } catch (error) {
                      console.error('❌ [COURSE-NOTIFICATION] Error sending notification:', error);
                    }
                  }

                  // Mark course as sent and pause AI if configured
                  if (conversation) {
                    const updateData: any = {
                      courseSentAt: new Date(),
                      lastMessageAt: new Date(),
                    };
                    if (courseData.shouldPauseAI) {
                      updateData.takeoverMode = 'human';
                      console.log(`⏸️ [COURSE-NOTIFICATION] Pausing AI for ${courseData.timeoutMinutes} minutes`);
                    }
                    await storage.updateConversation(conversation.id, updateData);
                    console.log('✅ [COURSE-NOTIFICATION] Marked courseSentAt to prevent future duplicate sends');
                    if (courseData.shouldPauseAI) {
                      console.log('✅ [COURSE-NOTIFICATION] AI paused');
                    }
                  }
                }

                // Check for appointment confirmation in AI response
                const confirmationKeywords = [
                  'agendamento está confirmado',
                  'agendamento realizado com sucesso',
                  'realizado com sucesso',
                  'confirmado para',
                  'agendado para',
                  'seu agendamento',
                  'aguardamos você',
                  'perfeito',
                  'confirmado'
                ];
                
                const hasConfirmation = confirmationKeywords.some(keyword => 
                  aiResponse.toLowerCase().includes(keyword.toLowerCase())
                );
                
                console.log('🔍 AI Response analysis:', {
                  hasConfirmation,
                  hasAppointmentData: false,
                  aiResponse: aiResponse.substring(0, 100) + '...'
                });
                
                // Always check conversation for appointment data after AI response
                console.log('🔍 Verificando conversa para dados de agendamento...');
                
                // Check if this is a confirmation response (SIM/OK) after AI summary
                const confirmationPatterns = [
                  /^(sim|s|ok|confirmo|confirmar|confirmado)$/i,
                  /^(sim|ok),?\s*(pode|por favor|obrigado|está correto|confirmo)?$/i,
                  /^(está correto|tudo certo|tudo correto|pode confirmar|confirmo sim)$/i,
                  /^sim,?\s*(tudo correto|tudo certo|tudo)$/i,
                  /^tudo\s*(ok|certo|correto)$/i
                ];

                // Verificar confirmação na mensagem inteira E em cada linha individual
                // (para mensagens agrupadas via debounce, ex: "Tudo ok\nSim")
                const msgLines = messageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const isConfirmationResponse = confirmationPatterns.some(pattern =>
                  pattern.test(messageText.toLowerCase().trim())
                ) || (msgLines.length > 1 && msgLines.some(line =>
                  confirmationPatterns.some(pattern => pattern.test(line.toLowerCase()))
                ));

                console.log('==================================================');
                console.log('🔍 VERIFICANDO SE MENSAGEM É CONFIRMAÇÃO');
                console.log('==================================================');
                console.log('📩 Mensagem recebida:', messageText);
                console.log('📩 Mensagem lowercase:', messageText.toLowerCase().trim());
                console.log('✅ É confirmação?', isConfirmationResponse);
                console.log('==================================================');

                if ((isConfirmationResponse || confirmationDetected) && !isPostConfirmationContext) {
                  console.log('==================================================');
                  console.log(`🎯 CONFIRMAÇÃO DETECTADA! (regex: ${isConfirmationResponse}, IA: ${confirmationDetected})`);
                  console.log('==================================================');
                  console.log('📩 Mensagem que confirmou:', messageText);
                  console.log('🔍 AI Response atual:', aiResponse.substring(0, 200));

                  // PRIMEIRO: Verificar se a resposta atual da IA (aiResponse) contém dados de agendamento
                  // Isso é mais confiável porque a IA acabou de responder à confirmação do usuário
                  const currentAIHasAppointmentData = (
                    !aiResponse.includes('Agendamento Confirmado!') &&
                    !aiResponse.includes('Obrigado por escolher nossos serviços') &&
                    !aiResponse.includes('remarcação foi realizada') &&
                    !aiResponse.includes('Remarcação realizada') &&
                    !aiResponse.includes('Sua remarcação foi realizada') &&
                    (
                      (aiResponse.includes('agendamento foi confirmado') ||
                       aiResponse.includes('Agendamento realizado com sucesso') ||
                       aiResponse.includes('realizado com sucesso') ||
                       aiResponse.includes('Nos vemos') ||
                       aiResponse.includes('está confirmado') ||
                       aiResponse.includes('confirmado para')) &&
                      (aiResponse.match(/\d{2}\/\d{2}\/\d{4}/) || aiResponse.match(/segunda|terça|quarta|quinta|sexta|sábado|domingo/i)) &&
                      (aiResponse.match(/\d{1,2}:\d{2}/) || aiResponse.includes('às'))
                    )
                  );

                  console.log('🔍 Resposta atual da IA tem dados de agendamento?', currentAIHasAppointmentData);
                  console.log('🔍 aiResponse:', aiResponse.substring(0, 200) + '...');

                  // Se a resposta atual da IA contém dados de agendamento, usar ela diretamente
                  let summaryMessage: { content: string } | undefined;

                  if (currentAIHasAppointmentData) {
                    console.log('✅ Usando resposta atual da IA como fonte de dados do agendamento');
                    summaryMessage = { content: aiResponse };
                  } else {
                    // Caso contrário, buscar nas mensagens anteriores
                    const conversationMessages = await storage.getMessagesByConversation(conversation.id);
                    // Query retorna DESC (mais recentes primeiro), então pegamos as primeiras 15
                    const recentMessages = conversationMessages.slice(0, 15); // First 15 messages (most recent)

                    console.log('📚 Buscando nas últimas mensagens da conversa (MAIS RECENTE → MAIS ANTIGA):');
                    recentMessages.forEach((msg, idx) => {
                      console.log(`  ${idx + 1}. [${msg.role}]: ${msg.content.substring(0, 80)}...`);
                    });

                    // Buscar mensagem que PEDE confirmação
                    // Primeiro: verificar se é mensagem de cancelamento ou reagendamento (mais flexível)
                    summaryMessage = recentMessages.find(m =>
                      m.role === 'assistant' &&
                      !m.content.includes('Agendamento Confirmado!') &&
                      !m.content.includes('Obrigado por escolher nossos serviços') &&
                      !m.content.includes('remarcação foi realizada com sucesso') && // Ignora mensagem de sucesso
                      (
                        // Padrões de remarcação/cancelamento (mais flexíveis)
                        (
                          (m.content.includes('Responda SIM para cancelar') ||
                           m.content.includes('CANCELAR* para confirmar') ||
                           m.content.includes('CANCELAR para confirmar') ||
                           m.content.includes('Confirma o cancelamento?') ||
                           m.content.includes('Confirma a remarcação?') ||
                           // Novos padrões mais flexíveis
                           (m.content.match(/deseja remarcar|você quer remarcar/i) && m.content.match(/correto|confirme|confirmar/i)) ||
                           (m.content.match(/confirme|confirmar/i) && m.content.match(/remarcação|remarcar/i)) ||
                           (m.content.match(/correto\?/i) && m.content.match(/remarcar|remarcação|agendamento/i)))
                        ) &&
                        // Para cancelamento/reagendamento, só exigir data e hora
                        (m.content.match(/\d{2}\/\d{2}\/\d{4}/) || m.content.match(/segunda|terça|quarta|quinta|sexta|sábado|domingo/i)) &&
                        (m.content.match(/\d{1,2}:\d{2}/) || m.content.includes('às'))
                        // Não exigir 'Serviço:' ou 'Profissional:' pois a IA pode usar formato livre
                      )
                    );

                    // Se não encontrou cancelamento/reagendamento, buscar mensagem de agendamento normal
                    if (!summaryMessage) {
                      summaryMessage = recentMessages.find(m =>
                        m.role === 'assistant' &&
                        !m.content.includes('Agendamento Confirmado!') &&
                        !m.content.includes('Obrigado por escolher nossos serviços') &&
                        !m.content.includes('Agendamento realizado com sucesso') &&
                        !m.content.includes('Nos vemos no dia') &&
                        (
                          ((m.content.includes('Está tudo correto?') ||
                            m.content.includes('Responda SIM para confirmar') ||
                            m.content.includes('Digite SIM ou OK para confirmar') ||
                            m.content.includes('confirmar seu agendamento') ||
                            m.content.includes('Vou confirmar')) &&
                           (m.content.includes('👤') || m.content.includes('Nome:')) &&
                           (m.content.includes('📅') || m.content.includes('Data:')) &&
                           (m.content.includes('🕐') || m.content.includes('Horário:')))
                        )
                      );
                    }

                    // Se não encontrou, buscar mensagem de sucesso nas mensagens anteriores
                    // IMPORTANTE: Excluir mensagens de confirmação final que não têm dados completos
                    if (!summaryMessage) {
                      summaryMessage = recentMessages.find(m =>
                        m.role === 'assistant' &&
                        !m.content.includes('Agendamento Confirmado!') &&
                        !m.content.includes('Obrigado por escolher nossos serviços') &&
                        !m.content.includes('Agendamento realizado com sucesso') &&
                        !m.content.includes('Nos vemos no dia') &&
                        (m.content.includes('agendamento foi confirmado') ||
                         m.content.includes('está confirmado')) &&
                        (m.content.match(/\d{2}\/\d{2}\/\d{4}/) || m.content.match(/segunda|terça|quarta|quinta|sexta|sábado|domingo/i)) &&
                        (m.content.match(/\d{1,2}:\d{2}/) || m.content.includes('às'))
                      );
                    }
                  }

                  console.log('📋 Mensagem de resumo encontrada:', summaryMessage ? 'SIM' : 'NÃO');
                  if (summaryMessage) {
                    console.log('📋 Conteúdo do resumo:', summaryMessage.content.substring(0, 200) + '...');
                    console.log('🔍 VERIFICANDO TIPO DE OPERAÇÃO:');
                    console.log('   - É cancelamento?', summaryMessage.content.includes('Confirma o cancelamento?') || summaryMessage.content.includes('Responda SIM para cancelar') || summaryMessage.content.includes('CANCELAR para confirmar'));
                    console.log('   - É remarcação?', summaryMessage.content.includes('Confirma a remarcação?') || (summaryMessage.content.includes('DE:') && summaryMessage.content.includes('PARA:')));
                    console.log('   - É agendamento normal?', !summaryMessage.content.includes('Confirma o cancelamento?') && !summaryMessage.content.includes('Confirma a remarcação?'));
                  } else {
                    // Debug each assistant message to see why none matched
                    console.log('🔍 DEBUGGING: Testando cada mensagem assistant:');
                    recentMessages.filter(m => m.role === 'assistant').forEach((msg, idx) => {
                      console.log(`  Assistant msg ${idx + 1}:`, msg.content);
                      console.log(`    - Contém 'Está tudo correto?':`, msg.content.includes('Está tudo correto?'));
                      console.log(`    - Contém 'Responda SIM para confirmar':`, msg.content.includes('Responda SIM para confirmar'));
                      console.log(`    - Contém 'Responda SIM para cancelar':`, msg.content.includes('Responda SIM para cancelar'));
                      console.log(`    - Contém 'Confirma a remarcação?':`, msg.content.includes('Confirma a remarcação?'));
                      console.log(`    - Contém 'Perfeito!' && 'agendamento':`, msg.content.includes('Perfeito!') && msg.content.includes('agendamento'));
                      console.log(`    - Contém '👤' && '📅':`, msg.content.includes('👤') && msg.content.includes('📅'));
                      console.log(`    - Contém 'Nome:' && 'Profissional:':`, msg.content.includes('Nome:') && msg.content.includes('Profissional:'));
                    });
                  }

                  if (summaryMessage) {
                    console.log('✅ Resumo do agendamento encontrado...');
                    console.log('🔍 DEBUG: summaryMessage.content:', summaryMessage.content);

                    // Extract appointment details from summary
                    const extractDetails = (text: string) => {
                      // Try structured format first (with labels)
                      let nameMatch = text.match(/(?:Nome|👤):\s*([^\n]*)/i);
                      let serviceMatch = text.match(/(?:Serviço|✂️|💼):\s*([^\n]*)/i);
                      let professionalMatch = text.match(/(?:Profissional|👨‍💼|🏢):\s*([^\n]*)/i);
                      let dateMatch = text.match(/(?:Data|📅):\s*([^\n]*)/i);
                      let timeMatch = text.match(/(?:Horário|Hora|🕐):\s*([^\n]*)/i);

                      // If not found, try free-form extraction
                      // Extract date anywhere in text: DD/MM/YYYY
                      if (!dateMatch || !dateMatch[1]) {
                        const freeDateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
                        if (freeDateMatch) {
                          dateMatch = [freeDateMatch[0], freeDateMatch[1]];
                        }
                      }

                      // Extract time: HH:MM or "às HH:MM"
                      if (!timeMatch || !timeMatch[1]) {
                        const freeTimeMatch = text.match(/(?:às\s+)?(\d{1,2}:\d{2})/i);
                        if (freeTimeMatch) {
                          timeMatch = [freeTimeMatch[0], freeTimeMatch[1]];
                        }
                      }

                      // Extract service from emoji-only format: "💼 Massagem" (without colon)
                      if (!serviceMatch || !serviceMatch[1]) {
                        const emojiServiceMatch = text.match(/💼\s+([A-Za-zÀ-ÿ\s]+?)(?:\n|$)/);
                        if (emojiServiceMatch) {
                          serviceMatch = [emojiServiceMatch[0], emojiServiceMatch[1].trim()];
                        }
                      }

                      // Extract professional from emoji-only format: "👤 Erica" (without colon)
                      if (!professionalMatch || !professionalMatch[1]) {
                        const emojiProfMatch = text.match(/👤\s+([A-Za-zÀ-ÿ\s]+?)(?:\n|$)/);
                        if (emojiProfMatch) {
                          professionalMatch = [emojiProfMatch[0], emojiProfMatch[1].trim()];
                        }
                      }

                      // Extract from format "Service com Professional" or "Service, Professional"
                      if ((!serviceMatch || !serviceMatch[1]) && (!professionalMatch || !professionalMatch[1])) {
                        // Try pattern: "Massagem com Erica" or "Massagem, Erica"
                        const freeFormatMatch = text.match(/([A-Za-zÀ-ÿ\s]+)\s+com\s+([A-Za-zÀ-ÿ\s]+)/i);
                        if (freeFormatMatch) {
                          serviceMatch = [freeFormatMatch[0], freeFormatMatch[1].trim()];
                          professionalMatch = [freeFormatMatch[0], freeFormatMatch[2].trim()];
                        }
                      }

                      return {
                        name: nameMatch?.[1]?.trim() || '',
                        service: serviceMatch?.[1]?.trim() || '',
                        professional: professionalMatch?.[1]?.trim() || '',
                        date: dateMatch?.[1]?.trim() || '',
                        time: timeMatch?.[1]?.trim() || ''
                      };
                    };

                    const details = extractDetails(summaryMessage.content);
                    console.log('📋 Detalhes extraídos:', details);

                    // ========================================
                    // DETECTAR SE É CANCELAMENTO
                    // ========================================
                    const isCancellation = (
                      summaryMessage.content.includes('Confirma o cancelamento?') ||
                      summaryMessage.content.includes('CANCELAR* para confirmar') ||
                      summaryMessage.content.includes('CANCELAR para confirmar') ||
                      summaryMessage.content.includes('Responda SIM para cancelar')
                    );

                    console.log('🔍 É cancelamento?', isCancellation);

                    if (isCancellation) {
                      console.log('==================================================');
                      console.log('❌ PROCESSANDO CANCELAMENTO');
                      console.log('==================================================');
                      console.log('📋 Detalhes:', details);

                      // Parse date from DD/MM/YYYY to YYYY-MM-DD
                      let parsedDate = '';
                      if (details.date) {
                        const dateMatch = details.date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                        if (dateMatch) {
                          parsedDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
                        }
                      }

                      // Extract time (HH:MM)
                      let parsedTime = '';
                      if (details.time) {
                        const timeMatch = details.time.match(/(\d{1,2}):(\d{2})/);
                        if (timeMatch) {
                          const hour = timeMatch[1].padStart(2, '0');
                          const minute = timeMatch[2];
                          parsedTime = `${hour}:${minute}`;
                        }
                      }

                      console.log('📅 Data parseada:', parsedDate);
                      console.log('🕐 Hora parseada:', parsedTime);

                      // Find the appointment to cancel
                      const services = await storage.getServicesByCompany(company.id);

                      // Normalize strings for comparison
                      const normalizeString = (str: string) => {
                        return str
                          .toLowerCase()
                          .normalize('NFD')
                          .replace(/[\u0300-\u036f]/g, '') // Remove accents
                          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                          .trim();
                      };

                      const normalizedSearchService = normalizeString(details.service);
                      const normalizedSearchProfessional = normalizeString(details.professional);

                      const service = services.find(s => {
                        const normalizedServiceName = normalizeString(s.name);
                        return normalizedServiceName.includes(normalizedSearchService) ||
                               normalizedSearchService.includes(normalizedServiceName);
                      });

                      const professionals = await storage.getProfessionalsByCompany(company.id);
                      const professional = professionals.find(p => {
                        const normalizedProfName = normalizeString(p.name);
                        return normalizedProfName.includes(normalizedSearchProfessional) ||
                               normalizedSearchProfessional.includes(normalizedProfName);
                      });

                      console.log('🔍 Serviço encontrado:', service?.name || 'não encontrado');
                      console.log('🔍 Profissional encontrado:', professional?.name || 'não encontrado');

                      if (service && professional && parsedDate && parsedTime) {
                        // Find appointment matching these criteria
                        const allAppointments = await storage.getAppointmentsByCompany(company.id);
                        const appointmentToCancel = allAppointments.find(apt =>
                          apt.serviceId === service.id &&
                          apt.professionalId === professional.id &&
                          apt.appointmentDate === parsedDate &&
                          apt.appointmentTime === parsedTime &&
                          apt.status !== 'cancelado' &&
                          apt.status !== 'Cancelado'
                        );

                        console.log('🔍 Agendamento encontrado:', appointmentToCancel ? `ID ${appointmentToCancel.id}` : 'não encontrado');

                        if (appointmentToCancel) {
                          // Cancel the appointment
                          const cancelResult = await cancelAppointmentById(appointmentToCancel.id, company.id);
                          console.log('✅ Resultado do cancelamento:', cancelResult);

                          // Broadcast cancellation event for real-time updates (filtered by company)
                          broadcastEvent({
                            type: 'cancelled_appointment',
                            appointmentId: appointmentToCancel.id,
                            companyId: company.id
                          }, company.id);

                          // The cancelResult.message already contains the success message
                          // No need to call createAppointmentFromAIConfirmation
                        } else {
                          console.log('❌ Agendamento não encontrado para cancelar');
                        }
                      } else {
                        console.log('❌ Faltam dados para encontrar o agendamento:');
                        console.log('   - Serviço:', service?.name || 'não encontrado');
                        console.log('   - Profissional:', professional?.name || 'não encontrado');
                        console.log('   - Data:', parsedDate || 'não encontrada');
                        console.log('   - Hora:', parsedTime || 'não encontrada');
                      }
                    } else {
                      // ========================================
                      // FLUXO NORMAL - CRIAR AGENDAMENTO
                      // ========================================
                      // Import payment functions (Mercado Pago)
                      const { createPixPayment, createCardPayment, isPaymentEnabled, schedulePixExpirationCheck } = await import('./mp-routes');

                      // Check if company has Asaas configured
                      const companyWithAsaas = await storage.getCompany(company.id);
                      const asaasEnabled = companyWithAsaas?.asaasEnabled && companyWithAsaas?.asaasApiKey;
                    console.log('🏢 Verificando configuração Asaas da empresa:');
                    console.log('   - Asaas habilitado:', companyWithAsaas?.asaasEnabled);
                    console.log('   - Tem API Key:', !!companyWithAsaas?.asaasApiKey);

                    // ========================================
                    // VERIFICAR SE É RESPOSTA DE FORMA DE PAGAMENTO
                    // ========================================
                    // Verificar se a última mensagem do assistente perguntou sobre forma de pagamento
                    // Buscar nas mensagens do banco (mais atualizado que conversationHistory)
                    const allMsgsForPaymentCheck = await storage.getMessagesByConversation(conversation.id);
                    const recentAssistantMsgsFromDb = allMsgsForPaymentCheck.filter(m => m.role === 'assistant');
                    const lastAssistantMsgFromDb = recentAssistantMsgsFromDb.length > 0 ? recentAssistantMsgsFromDb[recentAssistantMsgsFromDb.length - 1].content : '';

                    console.log('💳 DEBUG - Última mensagem do assistente:', lastAssistantMsgFromDb.substring(0, 100) + '...');

                    const askedForPaymentMethod = lastAssistantMsgFromDb.includes('Forma de Pagamento') ||
                                                   lastAssistantMsgFromDb.includes('como você prefere pagar') ||
                                                   lastAssistantMsgFromDb.includes('Digite 1 para PIX') ||
                                                   lastAssistantMsgFromDb.includes('1️⃣') ||
                                                   lastAssistantMsgFromDb.includes('PIX') && lastAssistantMsgFromDb.includes('Cartão');

                    console.log('💳 DEBUG - askedForPaymentMethod:', askedForPaymentMethod);

                    if (false) { // CPF flow removed - Mercado Pago não precisa de CPF
                      console.log('💳 ========================================');
                      console.log('💳 CPF RECEBIDO - GERANDO QR CODE PIX');
                      console.log('💳 CPF:', cleanedCpfInput);
                      console.log('💳 ========================================');

                      // Buscar dados pendentes do PIX na mensagem anterior
                      const pendingPixDataMsg = allMsgsForPaymentCheck.find(m =>
                        m.role === 'assistant' && m.content.includes('AGUARDANDO_CPF_PIX:')
                      );

                      if (pendingPixDataMsg) {
                        try {
                          const jsonMatch = pendingPixDataMsg.content.match(/AGUARDANDO_CPF_PIX:(\{.*\})/);
                          if (jsonMatch) {
                            const pendingPixData = JSON.parse(jsonMatch[1]);
                            console.log('📋 Dados pendentes recuperados:', pendingPixData);

                            // Importar função Asaas
                            const { createPixPayment: createAsaasPixPayment } = await import('./mp-routes');

                            // Criar cobrança PIX COM o CPF
                            const pixPaymentWithCpf = await createAsaasPixPayment(company.id, {
                              clientName: pendingPixData.clientName,
                              clientPhone: phoneNumber,
                              clientCpf: cleanedCpfInput, // CPF informado pelo usuário
                              serviceName: pendingPixData.serviceName,
                              servicePrice: pendingPixData.servicePrice,
                              appointmentId: 0,
                              externalReference: pendingPixData.externalReference
                            });

                            let formattedPhoneForCpf = phoneNumber.replace(/\D/g, '');
                            if (!formattedPhoneForCpf.startsWith('55') && formattedPhoneForCpf.length >= 10) {
                              formattedPhoneForCpf = '55' + formattedPhoneForCpf;
                            }
                            if (pixPaymentWithCpf && pixPaymentWithCpf.pixQrCode) {
                              console.log('✅ PIX com CPF criado com sucesso!');

                              await uazapiSendTyping(instanceName, formattedPhoneForCpf, 2000);

                              // Enviar QR Code
                              const pixCaptionCpf = `📱 *Pagamento via PIX*\n\n💰 Valor: R$ ${pendingPixData.servicePrice.toFixed(2)}\n⏰ Válido por 10 minutos`;
                              await uazapiSendMedia(instanceName, formattedPhoneForCpf, 'image', pixPaymentWithCpf.pixQrCode.encodedImage, pixCaptionCpf);

                              // Enviar código PIX sozinho para facilitar cópia
                              await new Promise(resolve => setTimeout(resolve, 1000));
                              const pixCodeOnlyCpf = pixPaymentWithCpf.pixQrCode.payload;

                              await uazapiSendText(instanceName, formattedPhoneForCpf, pixCodeOnlyCpf);
                              cacheAIResponse(conversation.id, pixCodeOnlyCpf);

                              // Enviar orientações em mensagem separada
                              await new Promise(resolve => setTimeout(resolve, 500));
                              const pixInstructionsCpf = `👆 *Copie o código acima* e cole no seu app de banco para pagar via PIX.\n\n✅ Após o pagamento, seu agendamento será confirmado automaticamente!`;

                              await uazapiSendText(instanceName, formattedPhoneForCpf, pixInstructionsCpf);
                              cacheAIResponse(conversation.id, pixInstructionsCpf);

                              // Salvar mensagens no banco
                              await storage.createMessage({
                                conversationId: conversation.id,
                                content: '[QR Code PIX enviado]',
                                role: 'assistant',
                                messageType: 'image',
                                delivered: true,
                                timestamp: new Date(),
                              });

                              await storage.createMessage({
                                conversationId: conversation.id,
                                content: pixCodeOnlyCpf,
                                role: 'assistant',
                                messageType: 'text',
                                delivered: true,
                                timestamp: new Date(),
                              });

                              await storage.createMessage({
                                conversationId: conversation.id,
                                content: pixInstructionsCpf,
                                role: 'assistant',
                                messageType: 'text',
                                delivered: true,
                                timestamp: new Date(),
                              });

                              // Agendar verificação de expiração do PIX (10 min)
                              schedulePixExpirationCheck(
                                pixPaymentWithCpf.id,
                                company.id,
                                phoneNumber,
                                conversation.id
                              );

                              console.log('✅ QR Code PIX enviado com sucesso após CPF!');
                            } else {
                              console.log('❌ Falha ao criar cobrança PIX com CPF');
                              const errorMsg = '❌ Não foi possível gerar o QR Code PIX. Por favor, tente novamente ou escolha outra forma de pagamento.';
                              await uazapiSendText(instanceName, formattedPhoneForCpf, errorMsg);
                            }

                            return res.status(200).json({ received: true, processed: true, cpfProcessed: true });
                          }
                        } catch (parseError) {
                          console.error('Erro ao processar dados pendentes do PIX:', parseError);
                        }
                      }
                    }

                    // Verificar se a mensagem atual é uma escolha de forma de pagamento
                    const normalizedPaymentMsg = messageText.toLowerCase().trim().replace(/[!?.,:;'"]+$/g, '');
                    const isPaymentChoice = /\b(1|2|pix|cart[aã]o|credito|crédito|credit)\b/i.test(normalizedPaymentMsg);
                    const isPixMethod = /\b(1|pix)\b/i.test(normalizedPaymentMsg) && !/cart[aã]o|credito|crédito|credit/i.test(normalizedPaymentMsg);
                    const paymentMethod = isPaymentChoice ?
                      (isPixMethod ? 'PIX' : 'CREDIT_CARD') : null;

                    if (askedForPaymentMethod && isPaymentChoice && paymentMethod) {
                      console.log('💳 ========================================');
                      console.log('💳 PROCESSANDO ESCOLHA DE FORMA DE PAGAMENTO');
                      console.log('💳 Método escolhido:', paymentMethod);
                      console.log('💳 ========================================');

                      // ========================================
                      // NOVO FLUXO: Extrair dados e gerar cobrança
                      // Agendamento será criado pelo webhook APÓS pagamento confirmado
                      // ========================================

                      // Buscar todas as mensagens para encontrar dados do agendamento
                      const allMsgsForPayment = await storage.getMessagesByConversation(conversation.id);

                      // Buscar mensagem com dados do agendamento (mais flexível)
                      const summaryMsgForPayment = allMsgsForPayment.find(m =>
                        m.role === 'assistant' &&
                        (m.content.includes('👤') || m.content.includes('Nome:')) &&
                        (m.content.includes('📅') || m.content.match(/\d{2}\/\d{2}\/\d{4}/))
                      ) || allMsgsForPayment.find(m =>
                        m.role === 'assistant' &&
                        (m.content.includes('Nos vemos') || m.content.includes('confirmado')) &&
                        m.content.match(/\d{2}\/\d{2}\/\d{4}/)
                      );

                      if (summaryMsgForPayment) {
                        // Função robusta de extração
                        const extractPaymentData = (text: string) => {
                          const data: any = {};
                          const nameMatch = text.match(/(?:👤\s*)?Nome:\s*([^\n]+)/i);
                          if (nameMatch) data.name = nameMatch[1].trim();
                          const serviceMatch = text.match(/(?:💼|✂️)\s*(?:Serviço:)?\s*([^\n]+)/i) || text.match(/Serviço:\s*([^\n]+)/i);
                          if (serviceMatch) data.service = serviceMatch[1].trim();
                          const profMatch = text.match(/(?:🏢|👨‍💼)\s*(?:Profissional:)?\s*([^\n]+)/i) || text.match(/com\s+(?:a\s+|o\s+)?([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)(?:\.|$|\n)/i);
                          if (profMatch) data.professional = profMatch[1].trim();
                          const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
                          if (dateMatch) data.date = dateMatch[1];
                          const timeMatch = text.match(/(?:🕐\s*)?(?:Horário:)?\s*(\d{2}:\d{2})/i) || text.match(/às\s+(\d{2}:\d{2})/i);
                          if (timeMatch) data.time = timeMatch[1];
                          return data;
                        };

                        const paymentDetails = extractPaymentData(summaryMsgForPayment.content);
                        console.log('📋 Dados extraídos para pagamento:', paymentDetails);

                        // Buscar serviço e profissional no banco
                        const servicesForPayment = await storage.getServicesByCompany(company.id);
                        const professionalsForPayment = await storage.getProfessionalsByCompany(company.id);

                        // Encontrar serviço (busca mais flexível)
                        let serviceForPayment = servicesForPayment.find(s =>
                          s.name.toLowerCase().includes((paymentDetails.service || '').toLowerCase()) ||
                          (paymentDetails.service || '').toLowerCase().includes(s.name.toLowerCase())
                        );
                        // Fallback: buscar nas mensagens do usuário
                        if (!serviceForPayment) {
                          const userText = allMsgsForPayment.filter(m => m.role === 'user').map(m => m.content.toLowerCase()).join(' ');
                          serviceForPayment = servicesForPayment.find(s => userText.includes(s.name.toLowerCase()));
                        }

                        // Encontrar profissional
                        const professionalForPayment = professionalsForPayment.find(p =>
                          p.name.toLowerCase().includes((paymentDetails.professional || '').toLowerCase()) ||
                          (paymentDetails.professional || '').toLowerCase().includes(p.name.toLowerCase())
                        );

                        if (serviceForPayment && serviceForPayment.price > 0) {
                          // Criar dados do agendamento para salvar no externalReference (JSON)
                          const pendingAppointmentData = {
                            type: 'pending_appointment',
                            companyId: company.id,
                            conversationId: conversation.id,
                            clientName: paymentDetails.name || conversation.contactName || 'Cliente',
                            clientPhone: phoneNumber,
                            professionalId: professionalForPayment?.id || null,
                            professionalName: professionalForPayment?.name || paymentDetails.professional || '',
                            serviceId: serviceForPayment.id,
                            serviceName: serviceForPayment.name,
                            servicePrice: serviceForPayment.price,
                            date: paymentDetails.date,
                            time: paymentDetails.time
                          };
                          const externalRef = JSON.stringify(pendingAppointmentData);
                          console.log('💾 Dados salvos no externalReference para webhook criar agendamento após pagamento');

                          // NÃO criar agendamento aqui - será criado pelo webhook após pagamento
                          const canProceed = true; // Removida criação de agendamento

                          if (canProceed) {
                            let formattedPhoneForPaymentMsg = phoneNumber.replace(/\D/g, '');
                            if (!formattedPhoneForPaymentMsg.startsWith('55') && formattedPhoneForPaymentMsg.length >= 10) {
                              formattedPhoneForPaymentMsg = '55' + formattedPhoneForPaymentMsg;
                            }

                            if (paymentMethod === 'PIX') {
                              // Criar cobrança PIX via Mercado Pago (sem CPF!)
                              console.log('💳 Gerando cobrança PIX via Mercado Pago...');

                              const pixPayment = await createPixPayment(company.id, {
                                clientName: pendingAppointmentData.clientName,
                                clientPhone: phoneNumber,
                                serviceName: serviceForPayment.name,
                                servicePrice: Number(serviceForPayment.price),
                                appointmentId: 0,
                                externalReference: externalRef
                              });

                              if (pixPayment && pixPayment.pixQrCode) {
                                console.log('✅ PIX criado com sucesso!');

                                await uazapiSendTyping(instanceName, formattedPhoneForPaymentMsg, 2000);

                                // Enviar QR Code como imagem
                                const pixCaption = `📱 *Pagamento via PIX*\n\n💰 Valor: R$ ${serviceForPayment.price.toFixed(2)}\n⏰ Válido por 10 minutos`;
                                await uazapiSendMedia(instanceName, formattedPhoneForPaymentMsg, 'image', pixPayment.pixQrCode.encodedImage, pixCaption);

                                // Enviar código PIX sozinho para facilitar cópia
                                await new Promise(resolve => setTimeout(resolve, 1000));
                                const pixCodeOnly = pixPayment.pixQrCode.payload;

                                await uazapiSendText(instanceName, formattedPhoneForPaymentMsg, pixCodeOnly);
                                cacheAIResponse(conversation.id, pixCodeOnly);

                                // Enviar orientações em mensagem separada
                                await new Promise(resolve => setTimeout(resolve, 500));
                                const pixInstructions = `👆 *Copie o código acima* e cole no seu app de banco para pagar via PIX.\n\n✅ Após o pagamento, seu agendamento será confirmado automaticamente!`;

                                await uazapiSendText(instanceName, formattedPhoneForPaymentMsg, pixInstructions);
                                cacheAIResponse(conversation.id, pixInstructions);

                                await storage.createMessage({
                                  conversationId: conversation.id,
                                  content: '[QR Code PIX enviado]',
                                  role: 'assistant',
                                  messageType: 'image',
                                  delivered: true,
                                  timestamp: new Date(),
                                });
                                await storage.createMessage({
                                  conversationId: conversation.id,
                                  content: pixCodeOnly,
                                  role: 'assistant',
                                  messageType: 'text',
                                  delivered: true,
                                  timestamp: new Date(),
                                });
                                await storage.createMessage({
                                  conversationId: conversation.id,
                                  content: pixInstructions,
                                  role: 'assistant',
                                  messageType: 'text',
                                  delivered: true,
                                  timestamp: new Date(),
                                });

                                // Agendar verificação de expiração do PIX (10 min)
                                schedulePixExpirationCheck(
                                  pixPayment.id,
                                  company.id,
                                  phoneNumber,
                                  conversation.id
                                );
                              } else {
                                console.log('❌ Falha ao criar cobrança PIX');
                              }
                            } else {
                              // Criar cobrança de cartão de crédito
                              console.log('💳 Gerando link de pagamento com cartão...');
                              const cardPayment = await createCardPayment(company.id, {
                                clientName: pendingAppointmentData.clientName,
                                clientPhone: phoneNumber,
                                serviceName: serviceForPayment.name,
                                servicePrice: Number(serviceForPayment.price),
                                appointmentId: 0, // Agendamento será criado após pagamento
                                externalReference: externalRef // JSON com dados do agendamento
                              });

                              if (cardPayment) {
                                console.log('✅ Link de cartão criado:', cardPayment.invoiceUrl);
                                console.log('📋 Payment ID:', cardPayment.id);
                                // Agendamento será criado pelo webhook após confirmação do pagamento

                                // Enviar link de pagamento
                                await uazapiSendTyping(instanceName, formattedPhoneForPaymentMsg, 2000);

                                const cardMessage = `💳 *Pagamento com Cartão de Crédito*\n\nClique no link abaixo para pagar de forma segura:\n\n🔗 ${cardPayment.invoiceUrl}\n\n💰 Valor: R$ ${serviceForPayment.price.toFixed(2)}\n✅ Parcele em até 12x\n🔒 Ambiente 100% seguro\n\n_Após o pagamento, seu agendamento será confirmado automaticamente!_`;

                                await uazapiSendText(instanceName, formattedPhoneForPaymentMsg, cardMessage);

                                // Salvar mensagem no banco
                                await storage.createMessage({
                                  conversationId: conversation.id,
                                  content: cardMessage,
                                  role: 'assistant',
                                  messageType: 'text',
                                  delivered: true,
                                  timestamp: new Date(),
                                });

                              } else {
                                console.log('❌ Falha ao criar link de cartão');
                              }
                            }

                            // Limpar cache de disponibilidade
                            clearAvailabilityCache(company.id);

                            // IMPORTANTE: Liberar o lock antes de retornar!
                            const lockKeyPaymentSent = `${company.id}:${instanceName}:${phoneNumber}`;
                            if (processingLocks.has(lockKeyPaymentSent)) {
                              processingLocks.delete(lockKeyPaymentSent);
                              console.log('🔓 Lock liberado (pagamento enviado)');
                            }

                            // Retornar sem continuar o fluxo normal
                            return res.status(200).json({ received: true, processed: true, paymentSent: true });
                          }
                        } else {
                          console.log('❌ Serviço não encontrado ou sem preço para pagamento');
                        }
                      } else {
                        console.log('❌ Mensagem com dados do agendamento não encontrada');
                      }
                    }
                    // FIM DA VERIFICAÇÃO DE FORMA DE PAGAMENTO

                    // ========================================
                    // FLUXO CORRETO: SE ASAAS HABILITADO, NÃO CRIAR AGENDAMENTO
                    // Agendamento será criado pelo webhook APÓS pagamento
                    // ========================================

                    if (asaasEnabled) {
                      console.log('💳 ========================================');
                      console.log('💳 NOVO FLUXO ASAAS - VERSÃO CORRIGIDA V2');
                      console.log('💳 Asaas habilitado - verificando se serviço tem preço...');
                      console.log('💳 ========================================');

                      const servicesForCheck = await storage.getServicesByCompany(company.id);
                      console.log('📋 Serviços da empresa:', servicesForCheck.map(s => `${s.name} (R$${s.price})`).join(', '));

                      // USAR A MENSAGEM DE RESUMO DA IA (summaryMessage) como fonte de dados
                      // O summaryMessage já foi encontrado anteriormente e contém os dados do agendamento
                      // Buscar a mensagem de resumo que a IA enviou ANTES da confirmação
                      const allMsgsForService = await storage.getMessagesByConversation(conversation.id);
                      const aiSummaryMsg = allMsgsForService.find(m =>
                        m.role === 'assistant' &&
                        !m.content.includes('Agendamento realizado com sucesso') &&
                        !m.content.includes('Nos vemos') &&
                        (m.content.includes('💼') || m.content.includes('Serviço:')) &&
                        (m.content.includes('📅') || m.content.includes('Data:')) &&
                        (m.content.includes('Está tudo correto?') || m.content.includes('Responda SIM') || m.content.includes('confirmar'))
                      );

                      console.log('📋 Mensagem de resumo da IA encontrada:', aiSummaryMsg ? 'SIM' : 'NÃO');
                      if (aiSummaryMsg) {
                        console.log('📋 Conteúdo:', aiSummaryMsg.content.substring(0, 200) + '...');
                      }

                      // Extrair serviço da mensagem de resumo da IA
                      let serviceWithPrice = null;
                      if (aiSummaryMsg) {
                        // Extrair nome do serviço da mensagem da IA
                        const serviceMatch = aiSummaryMsg.content.match(/(?:💼|✂️)\s*(?:Serviço:?)?\s*([^\n]+)/i) ||
                                            aiSummaryMsg.content.match(/Serviço:\s*([^\n]+)/i);
                        if (serviceMatch) {
                          const extractedServiceName = serviceMatch[1].trim();
                          console.log('🔍 Serviço extraído da mensagem da IA:', extractedServiceName);

                          // 1. PRIMEIRO: Buscar match EXATO (case-insensitive)
                          serviceWithPrice = servicesForCheck.find(s =>
                            s.name.toLowerCase() === extractedServiceName.toLowerCase() &&
                            s.price && Number(s.price) > 0
                          );

                          if (serviceWithPrice) {
                            console.log(`   ✅ Match EXATO encontrado: ${serviceWithPrice.name}`);
                          } else {
                            // 2. SEGUNDO: Buscar match parcial apenas se não houver exato
                            console.log('   🔄 Nenhum match exato, tentando parcial...');
                            serviceWithPrice = servicesForCheck.find(s => {
                              const partialMatch = extractedServiceName.toLowerCase().includes(s.name.toLowerCase()) ||
                                                  s.name.toLowerCase().includes(extractedServiceName.toLowerCase());
                              return partialMatch && s.price && Number(s.price) > 0;
                            });
                            if (serviceWithPrice) {
                              console.log(`   ✅ Match PARCIAL encontrado: ${serviceWithPrice.name}`);
                            }
                          }
                        }
                      }

                      // Fallback: buscar nas últimas mensagens do usuário (só as mais recentes)
                      if (!serviceWithPrice) {
                        console.log('🔄 Fallback: buscando serviço nas últimas 3 mensagens do usuário...');
                        const recentUserMsgs = allMsgsForService
                          .filter(m => m.role === 'user')
                          .slice(0, 3) // Apenas as 3 mais recentes
                          .map(m => m.content.toLowerCase())
                          .join(' ');

                        console.log('📝 Últimas mensagens do usuário:', recentUserMsgs);

                        serviceWithPrice = servicesForCheck.find(s => {
                          const found = recentUserMsgs.includes(s.name.toLowerCase());
                          if (found) console.log(`   🔍 Encontrado nas mensagens do usuário: ${s.name}`);
                          return found && s.price && Number(s.price) > 0;
                        });
                      }

                      if (serviceWithPrice) {
                        console.log('💰 Serviço com preço encontrado:', serviceWithPrice.name, 'R$', serviceWithPrice.price);
                        console.log('✅ NÃO criando agendamento - será criado após pagamento');

                        // Enviar mensagem perguntando forma de pagamento
                        let formattedPhone = phoneNumber.replace(/\D/g, '');
                        if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10) {
                          formattedPhone = '55' + formattedPhone;
                        }

                        const paymentQuestion = `💳 *Forma de Pagamento*\n\nPara confirmar seu agendamento, como você prefere pagar?\n\n1️⃣ *PIX* - Pagamento instantâneo\n2️⃣ *Cartão de Crédito* - Parcele em até 12x\n\n💰 Valor: R$ ${Number(serviceWithPrice.price).toFixed(2)}\n\n_Digite 1 para PIX ou 2 para Cartão_`;

                        await uazapiSendTyping(whatsappInstance.instanceName, formattedPhone, 1500);

                        await uazapiSendText(whatsappInstance.instanceName, formattedPhone, paymentQuestion);

                        await storage.createMessage({
                          conversationId: conversation.id,
                          content: paymentQuestion,
                          role: 'assistant',
                          messageType: 'text',
                          delivered: true,
                          timestamp: new Date(),
                        });

                        // IMPORTANTE: Liberar o lock antes de retornar!
                        const lockKeyForPaymentFlow = `${company.id}:${instanceName}:${phoneNumber}`;
                        if (processingLocks.has(lockKeyForPaymentFlow)) {
                          processingLocks.delete(lockKeyForPaymentFlow);
                          console.log('🔓 Lock liberado (fluxo Asaas)');
                        }

                        // Retornar para não deixar a IA enviar outra mensagem
                        return res.status(200).json({ received: true, processed: true, awaitingPaymentChoice: true });
                      } else {
                        console.log('ℹ️ Serviço sem preço ou não encontrado - criando agendamento normal');
                        // Cair no fluxo normal de criação de agendamento abaixo
                      }
                    }

                    // ========================================
                    // CRIAR AGENDAMENTO (se Asaas não habilitado ou serviço sem preço)
                    // ========================================
                    if (!asaasEnabled || true) { // Só chega aqui se não retornou acima
                      console.log('📝 Criando agendamento...');
                      const appointmentId = await createAppointmentFromAIConfirmation(
                        conversation.id,
                        company.id,
                        aiResponse,
                        phoneNumber,
                        'agendado',
                        conversation.contactName || undefined
                      );

                      if (appointmentId === null) {
                        console.log('❌ Conflito de horário detectado');

                        const errorMessage = `❌ *Conflito de Horário Detectado*\n\nDesculpe, mas não foi possível confirmar seu agendamento pois o horário solicitado já está ocupado por outro cliente.\n\nPor favor, escolha outro horário disponível e tente novamente.`;

                        await sendAppointmentErrorWebhook(company.id, 'CONFLICT', 'Horário já está ocupado', {
                          conversationId: conversation.id,
                          phoneNumber,
                          additionalInfo: 'Conflito detectado'
                        });

                        let formattedPhoneForError = phoneNumber.replace(/\D/g, '');
                        if (!formattedPhoneForError.startsWith('55') && formattedPhoneForError.length >= 10) {
                          formattedPhoneForError = '55' + formattedPhoneForError;
                        }

                        await uazapiSendText(activeInstance.instanceName, formattedPhoneForError, errorMessage);

                        await storage.createMessage({
                          conversationId: conversation.id,
                          content: errorMessage,
                          role: 'assistant',
                          messageType: 'text',
                          delivered: true,
                          timestamp: new Date(),
                        });
                      } else if (appointmentId) {
                        console.log('✅ Agendamento criado com ID:', appointmentId);

                        // 🗑️ Agendar limpeza da conversa após 2 horas
                        const cleanupKey = `${company.id}:${phoneNumber}`;
                        const existingCleanupTimer = conversationCleanupTimers.get(cleanupKey);
                        if (existingCleanupTimer) {
                          clearTimeout(existingCleanupTimer);
                        }
                        const cleanupTimer = setTimeout(async () => {
                          try {
                            console.log(`🗑️ Executando limpeza de conversa para ${phoneNumber} (empresa ${company.id}) - 2h após agendamento`);
                            await storage.deleteConversationsByPhone(company.id, phoneNumber);
                          } catch (err) {
                            console.error(`❌ Erro ao limpar conversa para ${phoneNumber}:`, err);
                          } finally {
                            conversationCleanupTimers.delete(cleanupKey);
                          }
                        }, 2 * 60 * 60 * 1000); // 2 horas
                        conversationCleanupTimers.set(cleanupKey, cleanupTimer);
                        console.log(`⏰ Limpeza de conversa agendada para ${phoneNumber} em 2 horas`);
                      }
                    }
                    } // Fim do else (FLUXO NORMAL - CRIAR AGENDAMENTO)
                  } else {
                    console.log('⚠️ Nenhum resumo de agendamento pendente encontrado nas últimas mensagens');
                    // NÃO tentar criar do contexto geral para evitar duplicatas
                  }
                }
                // REMOVIDO: Não chamar createAppointmentFromConversation quando não é confirmação
                // Só deve criar agendamento quando o usuário explicitamente confirmar com SIM/OK
                
              } else {
                console.error('❌ Failed to send message via UAZAPI:', {
                  status: uazapiResponse.status,
                  ok: uazapiResponse.ok,
                });
                console.log('ℹ️  Note: This is normal for test numbers. Real WhatsApp numbers will work.');
                
                // Still save the AI response even if sending failed (for debugging)
                await storage.createMessage({
                  conversationId: conversation.id,
                  content: aiResponse,
                  role: 'assistant',
                  messageType: 'text',
                  delivered: false,
                  timestamp: new Date(),
                });
              }
              } else {
                // shouldSkipAIResponse is true - user is selecting payment method
                // Process the payment choice here!
                console.log('💳 ========================================');
                console.log('💳 PROCESSANDO ESCOLHA DE FORMA DE PAGAMENTO');
                console.log('💳 Mensagem do usuário:', messageText);
                console.log('💳 ========================================');

                try {
                  // Determine payment method from user message
                  const normalizedPaymentMsg = messageText.toLowerCase().trim().replace(/[!?.,:;'"]+$/g, '');
                  const isPixChoice = /\b(1|pix)\b/i.test(normalizedPaymentMsg) && !/cart[aã]o|credito|crédito|credit/i.test(normalizedPaymentMsg);
                  const paymentMethod = isPixChoice ? 'PIX' : 'CREDIT_CARD';
                  console.log('💳 Método de pagamento:', paymentMethod);

                  // Import payment functions (Mercado Pago)
                  const { createPixPayment, createCardPayment, schedulePixExpirationCheck } = await import('./mp-routes');

                  // Check if company has Asaas configured
                  const companyWithAsaas = await storage.getCompany(company.id);
                  const asaasEnabled = companyWithAsaas?.asaasEnabled && companyWithAsaas?.asaasApiKey;

                  if (!asaasEnabled) {
                    console.log('❌ Asaas não está habilitado para esta empresa');
                    // Release lock and return
                    const lockKeyForSkip = `${company.id}:${instanceName}:${phoneNumber}`;
                    if (processingLocks.has(lockKeyForSkip)) {
                      processingLocks.delete(lockKeyForSkip);
                      console.log('🔓 Lock liberado');
                    }
                  } else {
                    // Get all messages to find appointment data
                    const allMsgsForPaymentProcess = await storage.getMessagesByConversation(conversation.id);

                    // Find message with appointment summary
                    const summaryMsgForPaymentProcess = allMsgsForPaymentProcess.find(m =>
                      m.role === 'assistant' &&
                      (m.content.includes('👤') || m.content.includes('Nome:')) &&
                      (m.content.includes('📅') || m.content.match(/\d{2}\/\d{2}\/\d{4}/))
                    ) || allMsgsForPaymentProcess.find(m =>
                      m.role === 'assistant' &&
                      (m.content.includes('Nos vemos') || m.content.includes('confirmado')) &&
                      m.content.match(/\d{2}\/\d{2}\/\d{4}/)
                    );

                    console.log('📋 Mensagem de resumo encontrada:', summaryMsgForPaymentProcess ? 'SIM' : 'NÃO');

                    if (summaryMsgForPaymentProcess) {
                      // Extract appointment data
                      const extractPaymentDataFromMsg = (text: string) => {
                        const data: any = {};
                        const nameMatch = text.match(/(?:👤\s*)?Nome:\s*([^\n]+)/i);
                        if (nameMatch) data.name = nameMatch[1].trim();
                        const serviceMatch = text.match(/(?:💼|✂️)\s*(?:Serviço:)?\s*([^\n]+)/i) || text.match(/Serviço:\s*([^\n]+)/i);
                        if (serviceMatch) data.service = serviceMatch[1].trim();
                        const profMatch = text.match(/(?:🏢|👨‍💼)\s*(?:Profissional:)?\s*([^\n]+)/i) || text.match(/com\s+(?:a\s+|o\s+)?([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)(?:\.|$|\n)/i);
                        if (profMatch) data.professional = profMatch[1].trim();
                        const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})/);
                        if (dateMatch) data.date = dateMatch[1];
                        const timeMatch = text.match(/(?:🕐\s*)?(?:Horário:)?\s*(\d{2}:\d{2})/i) || text.match(/às\s+(\d{2}:\d{2})/i);
                        if (timeMatch) data.time = timeMatch[1];
                        return data;
                      };

                      const paymentDetailsExtracted = extractPaymentDataFromMsg(summaryMsgForPaymentProcess.content);
                      console.log('📋 Dados extraídos:', paymentDetailsExtracted);

                      // Find service and professional
                      const servicesForPaymentProcess = await storage.getServicesByCompany(company.id);
                      const professionalsForPaymentProcess = await storage.getProfessionalsByCompany(company.id);

                      // Find service with exact match first
                      let serviceForPaymentProcess = servicesForPaymentProcess.find(s =>
                        s.name.toLowerCase() === (paymentDetailsExtracted.service || '').toLowerCase() &&
                        s.price && Number(s.price) > 0
                      );

                      // Fallback to partial match
                      if (!serviceForPaymentProcess) {
                        serviceForPaymentProcess = servicesForPaymentProcess.find(s =>
                          s.name.toLowerCase().includes((paymentDetailsExtracted.service || '').toLowerCase()) ||
                          (paymentDetailsExtracted.service || '').toLowerCase().includes(s.name.toLowerCase())
                        );
                      }

                      // Fallback: search in user messages
                      if (!serviceForPaymentProcess) {
                        const userTextForPayment = allMsgsForPaymentProcess.filter(m => m.role === 'user').map(m => m.content.toLowerCase()).join(' ');
                        serviceForPaymentProcess = servicesForPaymentProcess.find(s =>
                          s.price && Number(s.price) > 0 && userTextForPayment.includes(s.name.toLowerCase())
                        );
                      }

                      // Find professional
                      let professionalForPaymentProcess = professionalsForPaymentProcess.find(p =>
                        p.name.toLowerCase().includes((paymentDetailsExtracted.professional || '').toLowerCase()) ||
                        (paymentDetailsExtracted.professional || '').toLowerCase().includes(p.name.toLowerCase())
                      );

                      // Fallback: first active professional
                      if (!professionalForPaymentProcess && professionalsForPaymentProcess.length > 0) {
                        professionalForPaymentProcess = professionalsForPaymentProcess[0];
                      }

                      console.log('💼 Serviço encontrado:', serviceForPaymentProcess?.name || 'NÃO');
                      console.log('👤 Profissional encontrado:', professionalForPaymentProcess?.name || 'NÃO');

                      if (serviceForPaymentProcess && serviceForPaymentProcess.price && Number(serviceForPaymentProcess.price) > 0) {
                        // Get client info - find by phone in company's clients
                        const allClientsForPayment = await storage.getClientsByCompany(company.id);
                        const normalizedPhoneForSearch = phoneNumber.replace(/\D/g, '');
                        const clientForPayment = allClientsForPayment.find(c =>
                          c.phone && c.phone.replace(/\D/g, '').includes(normalizedPhoneForSearch.slice(-9)) ||
                          normalizedPhoneForSearch.includes((c.phone || '').replace(/\D/g, '').slice(-9))
                        );
                        const clientNameForPayment = clientForPayment?.name || paymentDetailsExtracted.name || 'Cliente';

                        // Parse date
                        let parsedDateForPayment = '';
                        if (paymentDetailsExtracted.date) {
                          const dateMatchParsed = paymentDetailsExtracted.date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                          if (dateMatchParsed) {
                            parsedDateForPayment = `${dateMatchParsed[3]}-${dateMatchParsed[2]}-${dateMatchParsed[1]}`;
                          }
                        }

                        // Build appointment data for externalReference
                        const pendingAppointmentDataForPayment = {
                          type: 'pending_appointment',
                          companyId: company.id,
                          clientName: clientNameForPayment,
                          clientPhone: phoneNumber,
                          serviceId: serviceForPaymentProcess.id,
                          serviceName: serviceForPaymentProcess.name,
                          servicePrice: serviceForPaymentProcess.price,
                          professionalId: professionalForPaymentProcess?.id,
                          professionalName: professionalForPaymentProcess?.name || '',
                          date: paymentDetailsExtracted.date || '',
                          time: paymentDetailsExtracted.time || '',
                          conversationId: conversation.id,
                          instanceName: instanceName
                        };

                        console.log('📋 Dados do agendamento pendente:', pendingAppointmentDataForPayment);

                        // Create externalReference JSON
                        const externalRefForPayment = JSON.stringify(pendingAppointmentDataForPayment);

                        // Format phone for API
                        let formattedPhoneForPaymentProcess = phoneNumber.replace(/\D/g, '');
                        if (!formattedPhoneForPaymentProcess.startsWith('55') && formattedPhoneForPaymentProcess.length >= 10) {
                          formattedPhoneForPaymentProcess = '55' + formattedPhoneForPaymentProcess;
                        }

                        if (paymentMethod === 'PIX') {
                          // Criar cobrança PIX via Mercado Pago (sem CPF!)
                          console.log('💳 Gerando cobrança PIX via Mercado Pago...');

                          const pixPaymentResult = await createPixPayment(company.id, {
                            clientName: clientNameForPayment,
                            clientPhone: phoneNumber,
                            serviceName: serviceForPaymentProcess.name,
                            servicePrice: Number(serviceForPaymentProcess.price),
                            appointmentId: 0,
                            externalReference: externalRefForPayment
                          });

                          if (pixPaymentResult && pixPaymentResult.pixQrCode) {
                            console.log('✅ PIX criado com sucesso!');

                            await uazapiSendTyping(instanceName, formattedPhoneForPaymentProcess, 2000);

                            const pixCaptionProcess = `📱 *Pagamento via PIX*\n\n💰 Valor: R$ ${Number(serviceForPaymentProcess.price).toFixed(2)}\n⏰ Válido por 10 minutos`;
                            await uazapiSendMedia(instanceName, formattedPhoneForPaymentProcess, 'image', pixPaymentResult.pixQrCode.encodedImage, pixCaptionProcess);

                            // Enviar código PIX sozinho para facilitar cópia
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            const pixCodeOnly2 = pixPaymentResult.pixQrCode.payload;

                            await uazapiSendText(instanceName, formattedPhoneForPaymentProcess, pixCodeOnly2);
                            cacheAIResponse(conversation.id, pixCodeOnly2);

                            // Enviar orientações em mensagem separada
                            await new Promise(resolve => setTimeout(resolve, 500));
                            const pixInstructions2 = `👆 *Copie o código acima* e cole no seu app de banco para pagar via PIX.\n\n✅ Após o pagamento, seu agendamento será confirmado automaticamente!`;

                            await uazapiSendText(instanceName, formattedPhoneForPaymentProcess, pixInstructions2);
                            cacheAIResponse(conversation.id, pixInstructions2);

                            await storage.createMessage({
                              conversationId: conversation.id,
                              content: '[QR Code PIX enviado]',
                              role: 'assistant',
                              messageType: 'image',
                              delivered: true,
                              timestamp: new Date(),
                            });
                            await storage.createMessage({
                              conversationId: conversation.id,
                              content: pixCodeOnly2,
                              role: 'assistant',
                              messageType: 'text',
                              delivered: true,
                              timestamp: new Date(),
                            });
                            await storage.createMessage({
                              conversationId: conversation.id,
                              content: pixInstructions2,
                              role: 'assistant',
                              messageType: 'text',
                              delivered: true,
                              timestamp: new Date(),
                            });

                            // Agendar verificação de expiração do PIX (10 min)
                            schedulePixExpirationCheck(
                              pixPaymentResult.id,
                              company.id,
                              phoneNumber,
                              conversation.id
                            );
                          } else {
                            console.log('❌ Falha ao criar cobrança PIX');
                          }
                        } else {
                          // Create credit card payment
                          console.log('💳 Gerando link de pagamento com cartão...');
                          const cardPaymentResult = await createCardPayment(company.id, {
                            clientName: clientNameForPayment,
                            clientPhone: phoneNumber,
                            serviceName: serviceForPaymentProcess.name,
                            servicePrice: Number(serviceForPaymentProcess.price),
                            appointmentId: 0,
                            externalReference: externalRefForPayment
                          });

                          if (cardPaymentResult) {
                            console.log('✅ Link de cartão criado:', cardPaymentResult.invoiceUrl);
                            console.log('📋 Payment ID:', cardPaymentResult.id);

                            // Send payment link
                            await uazapiSendTyping(instanceName, formattedPhoneForPaymentProcess, 2000);

                            const cardMessageResult = `💳 *Pagamento com Cartão de Crédito*\n\nClique no link abaixo para pagar de forma segura:\n\n🔗 ${cardPaymentResult.invoiceUrl}\n\n💰 Valor: R$ ${Number(serviceForPaymentProcess.price).toFixed(2)}\n✅ Parcele em até 12x\n🔒 Ambiente 100% seguro\n\n_Após o pagamento, seu agendamento será confirmado automaticamente!_`;

                            await uazapiSendText(instanceName, formattedPhoneForPaymentProcess, cardMessageResult);

                            // Save message to database
                            await storage.createMessage({
                              conversationId: conversation.id,
                              content: cardMessageResult,
                              role: 'assistant',
                              messageType: 'text',
                              delivered: true,
                              timestamp: new Date(),
                            });

                            console.log('✅ Link de cartão enviado com sucesso!');
                          } else {
                            console.log('❌ Falha ao criar link de cartão');
                          }
                        }
                      } else {
                        console.log('❌ Serviço não encontrado ou sem preço para processar pagamento');
                      }
                    } else {
                      console.log('❌ Nenhuma mensagem com dados do agendamento encontrada');
                    }

                    // Release lock
                    const lockKeyForSkip = `${company.id}:${instanceName}:${phoneNumber}`;
                    if (processingLocks.has(lockKeyForSkip)) {
                      processingLocks.delete(lockKeyForSkip);
                      console.log('🔓 Lock liberado (payment choice processed)');
                    }
                  }
                } catch (paymentProcessError) {
                  console.error('❌ Erro ao processar escolha de pagamento:', paymentProcessError);
                  // Release lock even on error
                  const lockKeyForError = `${company.id}:${instanceName}:${phoneNumber}`;
                  if (processingLocks.has(lockKeyForError)) {
                    processingLocks.delete(lockKeyForError);
                    console.log('🔓 Lock liberado (erro no processamento de pagamento)');
                  }
                }
              }

            } catch (aiError: any) {
              console.error('Error generating AI response:', aiError);

              // Enviar webhook de erro para N8N
              try {
                await sendAppointmentErrorWebhook(company.id, 'AI_ERROR', `Erro na IA: ${aiError.message || 'Erro desconhecido'}`, {
                  conversationId: conversation.id,
                  phoneNumber,
                  additionalInfo: `Tipo: ${aiError.code || aiError.status || 'unknown'} | Stack: ${aiError.stack?.substring(0, 500) || 'N/A'}`
                });
              } catch (webhookErr) {
                console.error('⚠️ Falha ao enviar webhook de erro:', webhookErr);
              }

              // Send fallback response when AI is not available
              let fallbackMessage = `Olá! 👋

Parece que ocorreu uma falha inesperada em nosso sistema.
Pedimos, por gentileza, que aguarde alguns instantes e tente novamente.

Se o erro persistir, você pode entrar em contato com nosso Suporte pelo WhatsApp: (81) 9 9316-7159
ou pelo e-mail: contato@inhouseaida.com

Agradecemos a compreensão e pedimos desculpas pelo transtorno.
Obrigado pela preferência! 🙏`;

              // Check for specific OpenAI quota error
              if (aiError.status === 429 || aiError.code === 'insufficient_quota') {
                console.error('🚨 OpenAI API quota exceeded - need to add billing credits');
              }
              
              // Send fallback response
              try {
                // Format phone number for UAZAPI - needs country code 55
                let formattedPhoneForError = phoneNumber.replace(/\D/g, '');
                if (!formattedPhoneForError.startsWith('55') && formattedPhoneForError.length >= 10) {
                  formattedPhoneForError = '55' + formattedPhoneForError;
                }

                // Send "typing" presence and wait 2 seconds
                await uazapiSendTyping(instanceName, formattedPhoneForError, 2000);
                await new Promise(resolve => setTimeout(resolve, 2000));
                const uazapiResponse = await uazapiSendText(instanceName, formattedPhoneForError, fallbackMessage);

                if (uazapiResponse.ok) {
                  console.log('✅ Fallback message sent successfully');
                  // Registrar no cache para detectar eco no Chatwoot
                  cacheAIResponse(conversation.id, fallbackMessage);

                  // Save the fallback message to conversation
                  await storage.createMessage({
                    conversationId: conversation.id,
                    content: fallbackMessage,
                    role: 'assistant',
                    messageType: 'text',
                    delivered: true,
                    timestamp: new Date(),
                  });
                } else {
                  console.error('❌ Failed to send fallback message');
                }
              } catch (sendError) {
                console.error('❌ Error sending fallback message:', sendError);
              }

              // 🔓 IMPORTANTE: Liberar o lock após erro da IA para que próximas mensagens sejam processadas
              const lockKeyAfterError = `${company.id}:${instanceName}:${phoneNumber}`;
              if (processingLocks.has(lockKeyAfterError)) {
                processingLocks.delete(lockKeyAfterError);
                console.log(`🔓 Lock liberado após erro da IA: ${lockKeyAfterError}`);
              }
            }
          }
        }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('❌ Webhook processing error:', error);

      // Liberar lock se existir para evitar que fique travado
      try {
        const instanceName = req.params?.instanceName;
        const webhookData = req.body;
        const message = webhookData?.data;

        if (instanceName && message) {
          // Extrair número de telefone
          const remoteJid = message.key?.remoteJid || message.remoteJid;
          if (remoteJid) {
            const phoneNumber = remoteJid.split('@')[0];

            // Buscar companyId via whatsappInstance para construir lockKey correto
            const whatsappInstance = await storage.getWhatsappInstanceByName(instanceName);
            if (whatsappInstance) {
              const lockKey = `${whatsappInstance.companyId}:${instanceName}:${phoneNumber}`;
              if (processingLocks.has(lockKey)) {
                processingLocks.delete(lockKey);
                console.log(`🔓 Lock liberado após erro: ${lockKey}`);
              }
            } else {
              // Fallback: tentar liberar com padrão antigo (para locks criados antes da atualização)
              const oldLockKey = `${instanceName}:${phoneNumber}`;
              if (processingLocks.has(oldLockKey)) {
                processingLocks.delete(oldLockKey);
                console.log(`🔓 Lock (legado) liberado após erro: ${oldLockKey}`);
              }
            }
          }
        }
      } catch (unlockError) {
        console.error('⚠️ Erro ao tentar liberar lock:', unlockError);
      }

      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET endpoint for webhook verification
  app.get('/api/webhook/whatsapp/:instanceName', (req, res) => {
    const { instanceName } = req.params;
    console.log('🔔 GET request to webhook for instance:', instanceName);
    console.log('🔍 Query params:', req.query);
    res.status(200).send('Webhook endpoint is active');
  });

  // Company Status API
  app.get('/api/company/status', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const statuses = await storage.getStatus();
      res.json(statuses);
    } catch (error) {
      console.error("Error fetching status:", error);
      res.status(500).json({ message: "Erro ao buscar status" });
    }
  });

  // Company Appointments API
  app.get('/api/company/appointments', isCompanyAuthenticated, checkSubscriptionStatus, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const month = req.query.month as string;
      const appointments = await storage.getAppointmentsByCompany(companyId, month);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ message: "Erro ao buscar agendamentos" });
    }
  });

  // Get detailed appointments for reports (must be before :id route)
  app.get('/api/company/appointments/detailed', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const appointments = await storage.getDetailedAppointmentsForReports(companyId);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching detailed appointments:", error);
      res.status(500).json({ message: "Erro ao buscar agendamentos detalhados" });
    }
  });

  // Auto-complete old pending appointments (more than 3 days old)
  app.post('/api/company/appointments/auto-complete-old', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      console.log(`🔄 Executando auto-conclusão de agendamentos pendentes antigos para empresa ${companyId}`);
      const result = await storage.autoCompleteOldPendingAppointments(companyId);

      console.log(`✅ Auto-conclusão concluída: ${result.updated} agendamentos atualizados`);
      res.json({
        success: true,
        updated: result.updated,
        appointments: result.appointments,
        message: result.updated > 0
          ? `${result.updated} agendamento(s) pendente(s) antigo(s) foram marcados como concluídos automaticamente.`
          : 'Nenhum agendamento pendente antigo encontrado.'
      });
    } catch (error) {
      console.error("Error auto-completing old pending appointments:", error);
      res.status(500).json({ message: "Erro ao auto-completar agendamentos antigos" });
    }
  });

  // Get appointments by client
  app.get('/api/company/appointments/client/:clientId', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const clientId = parseInt(req.params.clientId);
      if (isNaN(clientId)) {
        return res.status(400).json({ message: "ID do cliente inválido" });
      }

      const appointments = await storage.getAppointmentsByClient(clientId, companyId);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching client appointments:", error);
      res.status(500).json({ message: "Erro ao buscar histórico do cliente" });
    }
  });

  // Get appointments by professional
  app.get('/api/company/appointments/professional/:professionalId', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);
      if (isNaN(professionalId)) {
        return res.status(400).json({ message: "ID do profissional inválido" });
      }

      const appointments = await storage.getAppointmentsByProfessional(professionalId, companyId);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching professional appointments:", error);
      res.status(500).json({ message: "Erro ao buscar histórico do profissional" });
    }
  });

  // Get single appointment by ID (must be after specific routes)
  app.get('/api/company/appointments/:id', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID do agendamento inválido" });
      }

      const appointment = await storage.getAppointmentById(id, companyId);
      if (!appointment) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }

      res.json(appointment);
    } catch (error) {
      console.error("Error fetching appointment:", error);
      res.status(500).json({ message: "Erro ao buscar agendamento" });
    }
  });

  // Fix appointment date (temporary route)

  app.post('/api/company/appointments', isCompanyAuthenticated, validateBody(createAppointmentSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const {
        professionalId,
        serviceId,
        clientName,
        clientPhone,
        appointmentDate,
        appointmentTime,
        status = 'agendado',
        notes,
        clientEmail
      } = req.body;

      // Get service details for duration and price - verify belongs to same company
      const service = await storage.getService(serviceId);
      if (!service || service.companyId !== companyId) {
        return res.status(400).json({ message: "Serviço não encontrado" });
      }

      // Verify professional belongs to same company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(400).json({ message: "Profissional não encontrado" });
      }

      // Create/find client
      let client;
      try {
        // Normalize phone number for comparison (remove all non-digits)
        const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
        const normalizedClientPhone = normalizePhone(clientPhone);
        
        const existingClients = await storage.getClientsByCompany(companyId);
        client = existingClients.find(c => 
          c.phone && normalizePhone(c.phone) === normalizedClientPhone
        );
        
        if (!client) {
          client = await storage.createClient({
            companyId,
            name: clientName,
            phone: clientPhone,
            email: clientEmail || null,
            notes: notes || null,
            birthDate: null
          });
          console.log('👤 New client created:', client.name);
        } else {
          console.log('👤 Existing client found:', client.name);
        }
      } catch (clientError) {
        console.error('Error handling client:', clientError);
        return res.status(500).json({ message: "Erro ao processar cliente" });
      }

      // NOTA: Painel da empresa tem autonomia total para criar agendamentos
      // Não verifica conflitos de horário - empresa pode gerenciar conforme necessário
      // Validação de conflitos continua ativa apenas para agendamentos via WhatsApp

      // Create appointment with all required fields
      const appointmentData = {
        companyId,
        professionalId: parseInt(professionalId),
        serviceId: parseInt(serviceId),
        clientName,
        clientPhone,
        clientEmail: clientEmail || null,
        appointmentDate: appointmentDate, // Mantém como string YYYY-MM-DD para evitar conversão de timezone
        appointmentTime,
        status,
        duration: service.duration || 60,
        totalPrice: service.price ? String(service.price) : '0',
        expense: service.expense ? String(service.expense) : '0',
        notes: notes || null,
        reminderSent: 0
      };

      console.log('📋 Final appointment data - companyId:', appointmentData.companyId, 'serviceId:', appointmentData.serviceId, 'date:', appointmentData.appointmentDate);

      const appointment = await storage.createAppointment(appointmentData);

      if (!appointment) {
        throw new Error('Failed to create appointment - no appointment returned');
      }

      console.log('✅ Appointment created successfully with ID:', appointment.id);

      // 🔔 Send to n8n webhook if configured and enabled
      try {
        const company = await storage.getCompanyById(companyId);

        if (company?.n8nWebhookEnabled && company?.n8nWebhookUrl) {
          const [professional] = await db.select().from(professionals).where(eq(professionals.id, professionalId));

          const webhookPayload = {
            event: 'appointment.created',
            timestamp: new Date().toISOString(),
            createdBy: 'company',
            appointment: {
              id: appointment.id,
              clientName: appointment.clientName,
              clientPhone: appointment.clientPhone,
              clientEmail: appointment.clientEmail,
              appointmentDate: appointment.appointmentDate,
              appointmentTime: appointment.appointmentTime,
              status: appointment.status,
              duration: appointment.duration,
              totalPrice: appointment.totalPrice,
              notes: appointment.notes
            },
            service: {
              id: service.id,
              name: service.name,
              price: service.price
            },
            professional: {
              id: professional?.id,
              name: professional?.name
            },
            company: {
              id: companyId,
              name: company.fantasyName
            }
          };

          // Set DEBUG_N8N_WEBHOOK=true in .env to see detailed logs
          if (process.env.DEBUG_N8N_WEBHOOK === 'true') {
            console.log('🔍 [COMPANY] Sending to n8n webhook');
            console.log('📦 [COMPANY] Payload keys:', Object.keys(webhookPayload).join(', '));
          }

          const response = await fetch(company.n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
          });

          if (!response.ok) {
            console.error('⚠️ N8N webhook error:', response.status, response.statusText);
          } else if (process.env.DEBUG_N8N_WEBHOOK === 'true') {
            console.log('✅ [COMPANY] N8N webhook sent successfully');
          }
        }
      } catch (webhookError) {
        console.error('⚠️ Error processing n8n webhook:', webhookError);
      }

      res.status(201).json(appointment);
    } catch (error) {
      console.error("Error creating appointment:", error);
      res.status(500).json({ message: "Erro ao criar agendamento", error: error.message });
    }
  });

  // Dedicated endpoint for status updates (lightweight for Kanban)
  app.patch('/api/company/appointments/:id/status', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);
      const { status } = req.body;
      
      console.log('🎯 Kanban: Updating appointment', id, 'status to:', status);
      
      if (!status) {
        return res.status(400).json({ message: "Status é obrigatório" });
      }

      // Verify appointment belongs to company
      const appointment = await storage.getAppointment(id);
      if (!appointment || appointment.companyId !== companyId) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }

      // Use storage interface for consistent error handling and retry logic
      const updatedAppointment = await storage.updateAppointment(id, { status });

      // Limpar cache de disponibilidade
      clearAvailabilityCache(companyId);

      console.log('🎯 Kanban: Status updated successfully');
      res.json({
        id: updatedAppointment.id,
        status: updatedAppointment.status,
        success: true
      });
      
    } catch (error) {
      console.error("🎯 Kanban: Error updating status:", error);
      res.status(500).json({ message: "Erro ao atualizar status", error: error.message });
    }
  });

  app.patch('/api/company/appointments/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verify appointment belongs to company
      const existingAppointment = await storage.getAppointment(id);
      if (!existingAppointment || existingAppointment.companyId !== companyId) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }

      console.log('📋 Updating appointment ID:', id, '- fields:', Object.keys(req.body).join(', '));

      // Process the update data
      const updateData: any = {};

      if (req.body.serviceId) {
        updateData.serviceId = parseInt(req.body.serviceId);
        // Get service details for pricing - verify service belongs to same company
        const service = await storage.getService(updateData.serviceId);
        if (!service || service.companyId !== companyId) {
          return res.status(400).json({ message: "Serviço não encontrado" });
        }
        updateData.duration = service.duration;
        updateData.totalPrice = String(service.price);
      }
      
      if (req.body.professionalId) {
        updateData.professionalId = parseInt(req.body.professionalId);
      }
      
      if (req.body.appointmentDate) {
        updateData.appointmentDate = req.body.appointmentDate; // Mantém como string YYYY-MM-DD
      }
      
      if (req.body.appointmentTime) {
        updateData.appointmentTime = req.body.appointmentTime;
      }
      
      if (req.body.status) {
        updateData.status = req.body.status;
      }
      
      if (req.body.notes !== undefined) {
        updateData.notes = req.body.notes || null;
      }
      
      if (req.body.clientName) {
        updateData.clientName = req.body.clientName;
      }
      
      if (req.body.clientPhone) {
        updateData.clientPhone = req.body.clientPhone;
      }
      
      if (req.body.clientEmail !== undefined) {
        updateData.clientEmail = req.body.clientEmail || null;
      }
      
      updateData.updatedAt = new Date();
      
      console.log('📋 Processed update data - fields:', Object.keys(updateData).join(', '));
      
      const appointment = await storage.updateAppointment(id, updateData);

      // Limpar cache de disponibilidade
      clearAvailabilityCache(companyId);

      console.log('✅ Appointment updated successfully:', appointment.id);
      res.json(appointment);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ message: "Erro ao atualizar agendamento", error: error.message });
    }
  });

  // DELETE appointment
  app.delete('/api/company/appointments/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);
      console.log('🗑️ Deleting appointment ID:', id);

      // Verify appointment belongs to company before deleting
      const appointments = await storage.getAppointmentsByCompany(companyId);
      const appointment = appointments.find(apt => apt.id === id);

      if (!appointment) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }

      await storage.deleteAppointment(id);

      // Limpar cache de disponibilidade
      clearAvailabilityCache(companyId);

      console.log('✅ Appointment deleted successfully:', id);
      res.json({ message: "Agendamento excluído com sucesso", id });
    } catch (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ message: "Erro ao excluir agendamento", error: error.message });
    }
  });

  // UPDATE appointment price
  app.put('/api/company/appointments/:id/price', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);
      const { price } = req.body;

      if (price === undefined || price === null || isNaN(parseFloat(price))) {
        return res.status(400).json({ message: "Preço inválido" });
      }

      console.log('💰 Updating appointment price - ID:', id, 'New price:', price);

      // Verify appointment belongs to company
      const appointments = await storage.getAppointmentsByCompany(companyId);
      const appointment = appointments.find(apt => apt.id === id);

      if (!appointment) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }

      // Update price in database
      await pool.execute(
        'UPDATE appointments SET total_price = ? WHERE id = ?',
        [parseFloat(price), id]
      );

      console.log('✅ Appointment price updated successfully:', id);
      res.json({
        message: "Preço atualizado com sucesso",
        id,
        newPrice: parseFloat(price)
      });
    } catch (error) {
      console.error("Error updating appointment price:", error);
      res.status(500).json({ message: "Erro ao atualizar preço", error: error.message });
    }
  });

  app.put('/api/company/appointments/:id/expense', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);
      const { expense } = req.body;

      if (expense === undefined || expense === null || isNaN(parseFloat(expense))) {
        return res.status(400).json({ message: "Despesa inválida" });
      }

      // Verify appointment belongs to company
      const appointments = await storage.getAppointmentsByCompany(companyId);
      const appointment = appointments.find(apt => apt.id === id);

      if (!appointment) {
        return res.status(404).json({ message: "Agendamento não encontrado" });
      }

      // Update expense in database
      await pool.execute(
        'UPDATE appointments SET expense = ? WHERE id = ?',
        [parseFloat(expense), id]
      );

      res.json({
        message: "Despesa atualizada com sucesso",
        id,
        newExpense: parseFloat(expense)
      });
    } catch (error) {
      console.error("Error updating appointment expense:", error);
      res.status(500).json({ message: "Erro ao atualizar despesa", error: error.message });
    }
  });

  // ==================== API DE DISPONIBILIDADE DE HORÁRIOS ====================
  // Estes endpoints fornecem cálculos precisos de disponibilidade para o agente de IA
  // e para o dashboard, removendo a necessidade de cálculos manuais pelo agente

  /**
   * GET /api/company/availability/slots
   * Retorna todos os horários disponíveis para um serviço/profissional/data
   *
   * Query params:
   * - professionalId: ID do profissional (obrigatório)
   * - serviceId: ID do serviço (obrigatório)
   * - date: Data no formato YYYY-MM-DD (obrigatório)
   */
  app.get('/api/company/availability/slots', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { professionalId, serviceId, date } = req.query;

      if (!professionalId || !serviceId || !date) {
        return res.status(400).json({
          message: "Parâmetros obrigatórios: professionalId, serviceId, date",
          example: "/api/company/availability/slots?professionalId=1&serviceId=1&date=2025-01-30"
        });
      }

      const result = await getAvailableSlots(
        companyId,
        parseInt(professionalId as string),
        parseInt(serviceId as string),
        date as string
      );

      res.json(result);
    } catch (error) {
      console.error("Erro ao buscar disponibilidade:", error);
      res.status(500).json({ message: "Erro ao buscar disponibilidade" });
    }
  });

  /**
   * POST /api/company/availability/validate
   * Valida se um horário específico está disponível
   *
   * Body:
   * - professionalId: ID do profissional
   * - serviceId: ID do serviço
   * - date: Data no formato YYYY-MM-DD
   * - time: Horário no formato HH:MM
   */
  app.post('/api/company/availability/validate', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { professionalId, serviceId, date, time } = req.body;

      if (!professionalId || !serviceId || !date || !time) {
        return res.status(400).json({
          message: "Campos obrigatórios: professionalId, serviceId, date, time"
        });
      }

      const result = await validateSlot(
        companyId,
        parseInt(professionalId),
        parseInt(serviceId),
        date,
        time
      );

      res.json(result);
    } catch (error) {
      console.error("Erro ao validar horário:", error);
      res.status(500).json({ message: "Erro ao validar horário" });
    }
  });

  /**
   * GET /api/company/availability/summary
   * Retorna um resumo de disponibilidade para os próximos X dias
   *
   * Query params:
   * - professionalId: ID do profissional
   * - serviceId: ID do serviço
   * - startDate: Data inicial no formato YYYY-MM-DD (opcional, padrão: hoje)
   * - days: Número de dias (opcional, padrão: 7)
   */
  app.get('/api/company/availability/summary', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { professionalId, serviceId, startDate, days } = req.query;

      if (!professionalId || !serviceId) {
        return res.status(400).json({
          message: "Parâmetros obrigatórios: professionalId, serviceId"
        });
      }

      // Se não passar startDate, usar hoje no fuso horário do Brasil
      const today = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
      const defaultStartDate = new Date(today).toISOString().split('T')[0];

      const result = await getAvailabilitySummary(
        companyId,
        parseInt(professionalId as string),
        parseInt(serviceId as string),
        (startDate as string) || defaultStartDate,
        days ? parseInt(days as string) : 7
      );

      res.json(result);
    } catch (error) {
      console.error("Erro ao buscar resumo de disponibilidade:", error);
      res.status(500).json({ message: "Erro ao buscar resumo de disponibilidade" });
    }
  });

  /**
   * GET /api/availability/slots (Público - para uso do agente de IA)
   * Mesmo endpoint mas autenticado por companyId na query
   *
   * Query params:
   * - companyId: ID da empresa (obrigatório)
   * - professionalId: ID do profissional (obrigatório)
   * - serviceId: ID do serviço (obrigatório)
   * - date: Data no formato YYYY-MM-DD (obrigatório)
   */
  app.get('/api/availability/slots', async (req: any, res) => {
    try {
      const { companyId, professionalId, serviceId, date } = req.query;

      if (!companyId || !professionalId || !serviceId || !date) {
        return res.status(400).json({
          message: "Parâmetros obrigatórios: companyId, professionalId, serviceId, date",
          example: "/api/availability/slots?companyId=1&professionalId=1&serviceId=1&date=2025-01-30"
        });
      }

      const result = await getAvailableSlots(
        parseInt(companyId as string),
        parseInt(professionalId as string),
        parseInt(serviceId as string),
        date as string
      );

      res.json(result);
    } catch (error) {
      console.error("Erro ao buscar disponibilidade:", error);
      res.status(500).json({ message: "Erro ao buscar disponibilidade" });
    }
  });

  /**
   * POST /api/availability/validate (Público - para uso do agente de IA)
   * Valida se um horário específico está disponível
   */
  app.post('/api/availability/validate', async (req: any, res) => {
    try {
      const { companyId, professionalId, serviceId, date, time } = req.body;

      if (!companyId || !professionalId || !serviceId || !date || !time) {
        return res.status(400).json({
          message: "Campos obrigatórios: companyId, professionalId, serviceId, date, time"
        });
      }

      const result = await validateSlot(
        parseInt(companyId),
        parseInt(professionalId),
        parseInt(serviceId),
        date,
        time
      );

      res.json(result);
    } catch (error) {
      console.error("Erro ao validar horário:", error);
      res.status(500).json({ message: "Erro ao validar horário" });
    }
  });

  /**
   * GET /api/availability/text (Público - para uso do agente de IA)
   * Retorna texto formatado de disponibilidade para o agente usar diretamente
   */
  app.get('/api/availability/text', async (req: any, res) => {
    try {
      const { companyId, professionalId, serviceId, date } = req.query;

      if (!companyId || !professionalId || !serviceId || !date) {
        return res.status(400).json({
          message: "Parâmetros obrigatórios: companyId, professionalId, serviceId, date"
        });
      }

      const text = await generateAvailabilityTextForAI(
        parseInt(companyId as string),
        parseInt(professionalId as string),
        parseInt(serviceId as string),
        date as string
      );

      res.json({ text });
    } catch (error) {
      console.error("Erro ao gerar texto de disponibilidade:", error);
      res.status(500).json({ message: "Erro ao gerar texto de disponibilidade" });
    }
  });

  // ==================== FIM DA API DE DISPONIBILIDADE ====================

  // Company Reviews API
  app.get('/api/company/reviews', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const reviews = await storage.getProfessionalReviewsByCompany(companyId);
      res.json(reviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      res.status(500).json({ message: "Erro ao buscar avaliações" });
    }
  });

  app.get('/api/company/review-invitations', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const invitations = await storage.getReviewInvitationsByCompany(companyId);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching review invitations:", error);
      res.status(500).json({ message: "Erro ao buscar convites de avaliação" });
    }
  });

  // Company Services API
  app.get('/api/company/services', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const services = await storage.getServicesByCompany(companyId);
      res.json(services);
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ message: "Erro ao buscar serviços" });
    }
  });

  app.post('/api/company/services', validateBody(createServiceSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const service = await storage.createService({
        ...req.body,
        companyId,
      });
      res.status(201).json(service);
    } catch (error) {
      console.error("Error creating service:", error);
      res.status(500).json({ message: "Erro ao criar serviço" });
    }
  });

  app.put('/api/company/services/:id', validateBody(updateServiceSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verificar se o serviço pertence à empresa
      const existingService = await storage.getService(id);
      if (!existingService) {
        return res.status(404).json({ message: "Serviço não encontrado" });
      }
      if (existingService.companyId !== companyId) {
        return res.status(403).json({ message: "Acesso negado" });
      }

      const service = await storage.updateService(id, req.body);
      console.log('Service updated successfully:', service);

      res.json(service);
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ message: "Erro ao atualizar serviço", error: error.message });
    }
  });

  app.delete('/api/company/services/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verify service belongs to company
      const existingService = await storage.getService(id);
      if (!existingService || existingService.companyId !== companyId) {
        return res.status(404).json({ message: "Serviço não encontrado" });
      }

      await storage.deleteService(id);
      res.json({ message: "Serviço excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ message: "Erro ao excluir serviço" });
    }
  });

  // Company Professionals API
  app.get('/api/company/professionals', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionals = await storage.getProfessionalsByCompany(companyId);
      res.json(professionals);
    } catch (error) {
      console.error("Error fetching professionals:", error);
      res.status(500).json({ message: "Erro ao buscar profissionais" });
    }
  });

  app.post('/api/company/professionals', loadCompanyPlan, requirePermission('professionals'), checkProfessionalsLimit, validateBody(createProfessionalSchema), async (req: RequestWithPlan, res) => {
    try {
      const companyId = (req.session as any).companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professional = await storage.createProfessional({
        ...req.body,
        companyId,
      });
      res.status(201).json(professional);
    } catch (error) {
      console.error("Error creating professional:", error);
      res.status(500).json({ message: "Erro ao criar profissional" });
    }
  });

  app.put('/api/company/professionals/:id', loadCompanyPlan, requirePermission('professionals'), validateBody(updateProfessionalSchema), async (req: RequestWithPlan, res) => {
    try {
      const companyId = (req.session as any).companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verify professional belongs to company
      const existingProfessional = await storage.getProfessional(id);
      if (!existingProfessional || existingProfessional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const professional = await storage.updateProfessional(id, req.body);
      res.json(professional);
    } catch (error) {
      console.error("Error updating professional:", error);
      res.status(500).json({ message: "Erro ao atualizar profissional" });
    }
  });

  app.delete('/api/company/professionals/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verify professional belongs to company
      const existingProfessional = await storage.getProfessional(id);
      if (!existingProfessional || existingProfessional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      await storage.deleteProfessional(id);
      res.json({ message: "Profissional excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting professional:", error);
      res.status(500).json({ message: "Erro ao excluir profissional" });
    }
  });

  // Archive professional (soft delete)
  app.patch('/api/company/professionals/:id/archive', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verificar se profissional pertence à empresa
      const professional = await storage.getProfessional(id);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      await storage.archiveProfessional(id);
      res.json({ message: "Profissional arquivado com sucesso" });
    } catch (error) {
      console.error("Error archiving professional:", error);
      res.status(500).json({ message: "Erro ao arquivar profissional" });
    }
  });

  // Unarchive professional
  app.patch('/api/company/professionals/:id/unarchive', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verificar se profissional pertence à empresa
      const professional = await storage.getProfessional(id);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      await storage.unarchiveProfessional(id);
      res.json({ message: "Profissional desarquivado com sucesso" });
    } catch (error) {
      console.error("Error unarchiving professional:", error);
      res.status(500).json({ message: "Erro ao desarquivar profissional" });
    }
  });

  // Professional Breaks API
  app.get('/api/company/professionals/:professionalId/breaks', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const breaks = await storage.getProfessionalBreaks(professionalId);
      res.json(breaks);
    } catch (error) {
      console.error("Error fetching professional breaks:", error);
      res.status(500).json({ message: "Erro ao buscar pausas" });
    }
  });

  app.post('/api/company/professionals/:professionalId/breaks', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const { dayOfWeek, startTime, endTime } = req.body;

      if (!dayOfWeek || !startTime || !endTime) {
        return res.status(400).json({ message: "Dia da semana, hora início e hora fim são obrigatórios" });
      }

      const newBreak = await storage.createProfessionalBreak({
        professionalId,
        dayOfWeek,
        startTime,
        endTime,
      });

      res.status(201).json(newBreak);
    } catch (error) {
      console.error("Error creating professional break:", error);
      res.status(500).json({ message: "Erro ao criar pausa" });
    }
  });

  app.delete('/api/company/professionals/:professionalId/breaks/:breakId', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const breakId = parseInt(req.params.breakId);
      await storage.deleteProfessionalBreak(breakId);
      res.json({ message: "Pausa excluída com sucesso" });
    } catch (error) {
      console.error("Error deleting professional break:", error);
      res.status(500).json({ message: "Erro ao excluir pausa" });
    }
  });

  // Professional Days Off API
  app.get('/api/company/professionals/:professionalId/days-off', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const daysOff = await storage.getProfessionalDaysOff(professionalId);
      res.json(daysOff);
    } catch (error) {
      console.error("Error fetching professional days off:", error);
      res.status(500).json({ message: "Erro ao buscar dias indisponíveis" });
    }
  });

  app.post('/api/company/professionals/:professionalId/days-off', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const { dateOff, reason } = req.body;

      if (!dateOff) {
        return res.status(400).json({ message: "Data é obrigatória" });
      }

      // Parse date correctly to avoid timezone offset
      // dateOff comes as "YYYY-MM-DD" from frontend
      const dateParts = dateOff.split('-');
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed in JS
      const day = parseInt(dateParts[2]);
      const parsedDate = new Date(year, month, day);

      const newDayOff = await storage.createProfessionalDayOff({
        professionalId,
        dateOff: parsedDate,
        reason: reason || null,
      });

      res.status(201).json(newDayOff);
    } catch (error) {
      console.error("Error creating professional day off:", error);
      res.status(500).json({ message: "Erro ao criar dia indisponível" });
    }
  });

  app.delete('/api/company/professionals/:professionalId/days-off/:dayOffId', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const dayOffId = parseInt(req.params.dayOffId);
      await storage.deleteProfessionalDayOff(dayOffId);
      res.json({ message: "Dia indisponível excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting professional day off:", error);
      res.status(500).json({ message: "Erro ao excluir dia indisponível" });
    }
  });

  // Professional Exceptional Schedules API
  app.get('/api/company/professionals/:professionalId/exceptional-schedules', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const exceptionalSchedules = await storage.getProfessionalExceptionalSchedules(professionalId);
      res.json(exceptionalSchedules);
    } catch (error) {
      console.error("Error fetching professional exceptional schedules:", error);
      res.status(500).json({ message: "Erro ao buscar horários excepcionais" });
    }
  });

  app.post('/api/company/professionals/:professionalId/exceptional-schedules', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const { exceptionDate, startTime, endTime, reason } = req.body;

      if (!exceptionDate || !startTime || !endTime) {
        return res.status(400).json({ message: "Data, horário de início e horário de fim são obrigatórios" });
      }

      // Parse date correctly to avoid timezone offset
      // exceptionDate comes as "YYYY-MM-DD" from frontend
      const dateParts = exceptionDate.split('-');
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed in JS
      const day = parseInt(dateParts[2]);
      const parsedDate = new Date(year, month, day);

      const newExceptionalSchedule = await storage.createProfessionalExceptionalSchedule({
        professionalId,
        exceptionDate: parsedDate,
        startTime,
        endTime,
        reason: reason || null,
      });

      // Clear availability cache after adding exceptional schedule
      clearAvailabilityCache(companyId);

      res.status(201).json(newExceptionalSchedule);
    } catch (error) {
      console.error("Error creating professional exceptional schedule:", error);
      res.status(500).json({ message: "Erro ao criar horário excepcional" });
    }
  });

  app.delete('/api/company/professionals/:professionalId/exceptional-schedules/:scheduleId', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const scheduleId = parseInt(req.params.scheduleId);
      await storage.deleteProfessionalExceptionalSchedule(scheduleId);

      // Clear availability cache after deleting exceptional schedule
      clearAvailabilityCache(companyId);

      res.json({ message: "Horário excepcional excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting professional exceptional schedule:", error);
      res.status(500).json({ message: "Erro ao excluir horário excepcional" });
    }
  });

  // Professional Exception Breaks API (breaks/pauses for exceptional schedules)
  app.get('/api/company/professionals/:professionalId/exceptional-schedules/:scheduleId/breaks', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const scheduleId = parseInt(req.params.scheduleId);
      const breaks = await storage.getExceptionBreaks(scheduleId);
      res.json(breaks);
    } catch (error) {
      console.error("Error fetching exception breaks:", error);
      res.status(500).json({ message: "Erro ao buscar pausas do horário excepcional" });
    }
  });

  app.post('/api/company/professionals/:professionalId/exceptional-schedules/:scheduleId/breaks', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const scheduleId = parseInt(req.params.scheduleId);
      const { startTime, endTime } = req.body;

      if (!startTime || !endTime) {
        return res.status(400).json({ message: "Hora início e hora fim são obrigatórios" });
      }

      const newBreak = await storage.createExceptionBreak({
        exceptionalScheduleId: scheduleId,
        startTime,
        endTime,
      });

      // Clear availability cache after adding exception break
      clearAvailabilityCache(companyId);

      res.status(201).json(newBreak);
    } catch (error) {
      console.error("Error creating exception break:", error);
      res.status(500).json({ message: "Erro ao criar pausa do horário excepcional" });
    }
  });

  app.delete('/api/company/professionals/:professionalId/exceptional-schedules/:scheduleId/breaks/:breakId', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const breakId = parseInt(req.params.breakId);
      await storage.deleteExceptionBreak(breakId);

      // Clear availability cache after deleting exception break
      clearAvailabilityCache(companyId);

      res.json({ message: "Pausa do horário excepcional excluída com sucesso" });
    } catch (error) {
      console.error("Error deleting exception break:", error);
      res.status(500).json({ message: "Erro ao excluir pausa do horário excepcional" });
    }
  });

  // Professional Schedules API (individual hours per day)
  app.get('/api/company/professionals/:professionalId/schedules', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const schedules = await storage.getProfessionalSchedules(professionalId);
      res.json(schedules);
    } catch (error) {
      console.error("Error fetching professional schedules:", error);
      res.status(500).json({ message: "Erro ao buscar horários" });
    }
  });

  app.post('/api/company/professionals/:professionalId/schedules', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const { dayOfWeek, startTime, endTime, isEnabled } = req.body;

      if (dayOfWeek === undefined || !startTime || !endTime) {
        return res.status(400).json({ message: "Dia, horário de início e fim são obrigatórios" });
      }

      const schedule = await storage.saveProfessionalSchedule({
        professionalId,
        dayOfWeek,
        startTime,
        endTime,
        isEnabled: isEnabled !== undefined ? (isEnabled ? 1 : 0) : 1,
      });

      res.status(200).json(schedule);
    } catch (error) {
      console.error("Error saving professional schedule:", error);
      res.status(500).json({ message: "Erro ao salvar horário" });
    }
  });

  app.delete('/api/company/professionals/:professionalId/schedules/:scheduleId', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const professionalId = parseInt(req.params.professionalId);

      // Verify professional belongs to company
      const professional = await storage.getProfessional(professionalId);
      if (!professional || professional.companyId !== companyId) {
        return res.status(404).json({ message: "Profissional não encontrado" });
      }

      const scheduleId = parseInt(req.params.scheduleId);
      await storage.deleteProfessionalSchedule(scheduleId);
      res.json({ message: "Horário excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting professional schedule:", error);
      res.status(500).json({ message: "Erro ao excluir horário" });
    }
  });

  // Migrate old professionals to new schedule system
  app.post('/api/company/professionals/migrate-schedules', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      console.log('🔄 Iniciando migração de horários para empresa:', companyId);

      // Get all active professionals from this company
      const professionals = await storage.getProfessionalsByCompany(companyId);

      let migratedCount = 0;
      let skippedCount = 0;

      for (const prof of professionals) {
        if (!prof.active || prof.archived) continue;

        // Check if already has schedules
        const existing = await storage.getProfessionalSchedules(prof.id);

        if (existing.length > 0) {
          console.log(`⏭️  ${prof.name}: já tem ${existing.length} horário(s)`);
          skippedCount++;
          continue;
        }

        // Get work days or use default
        const workDays = prof.workDays || [1, 2, 3, 4, 5, 6]; // Monday to Saturday
        const workStart = prof.workStartTime || '09:00';
        const workEnd = prof.workEndTime || '18:00';

        console.log(`📅 ${prof.name}: Criando horários para dias ${workDays.join(', ')} (${workStart}-${workEnd})`);

        // Create schedule for each work day
        for (const dayOfWeek of workDays) {
          await storage.saveProfessionalSchedule({
            professionalId: prof.id,
            dayOfWeek,
            startTime: workStart,
            endTime: workEnd,
            isEnabled: 1,
          });
        }

        migratedCount++;
      }

      const result = {
        success: true,
        migrated: migratedCount,
        skipped: skippedCount,
        total: professionals.length,
      };

      console.log('✅ Migração concluída:', result);
      res.json(result);
    } catch (error) {
      console.error("Error migrating schedules:", error);
      res.status(500).json({ message: "Erro ao migrar horários" });
    }
  });

  // Company Clients API
  app.get('/api/company/clients', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const clients = await storage.getClientsByCompany(companyId);
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Erro ao buscar clientes" });
    }
  });

  app.post('/api/company/clients', validateBody(createClientSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      // Clean up empty fields to prevent MySQL errors
      const clientData = {
        ...req.body,
        companyId,
        email: req.body.email === '' ? null : req.body.email,
        phone: req.body.phone === '' ? null : req.body.phone,
        birthDate: req.body.birthDate === '' ? null : (req.body.birthDate ? new Date(req.body.birthDate + 'T12:00:00') : null),
        notes: req.body.notes === '' ? null : req.body.notes,
      };

      const client = await storage.createClient(clientData);
      res.status(201).json(client);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ message: "Erro ao criar cliente" });
    }
  });

  app.put('/api/company/clients/:id', isCompanyAuthenticated, validateBody(updateClientSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verify client belongs to company
      const existingClient = await storage.getClient(id);
      if (!existingClient || existingClient.companyId !== companyId) {
        return res.status(404).json({ message: "Cliente não encontrado" });
      }

      // Clean up empty fields to prevent MySQL errors
      const clientData = {
        ...req.body,
        email: req.body.email === '' ? null : req.body.email,
        phone: req.body.phone === '' ? null : req.body.phone,
        birthDate: req.body.birthDate === '' ? null : (req.body.birthDate ? new Date(req.body.birthDate + 'T12:00:00') : null),
        notes: req.body.notes === '' ? null : req.body.notes,
      };

      const client = await storage.updateClient(id, clientData);
      res.json(client);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ message: "Erro ao atualizar cliente" });
    }
  });

  app.delete('/api/company/clients/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verify client belongs to company
      const existingClient = await storage.getClient(id);
      if (!existingClient || existingClient.companyId !== companyId) {
        return res.status(404).json({ message: "Cliente não encontrado" });
      }

      await storage.deleteClient(id);
      res.json({ message: "Cliente excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ message: "Erro ao excluir cliente" });
    }
  });

  // Status API
  app.get('/api/status', isAuthenticated, async (req, res) => {
    try {
      const statusList = await storage.getStatus();
      res.json(statusList);
    } catch (error) {
      console.error("Error fetching status:", error);
      res.status(500).json({ message: "Erro ao buscar status" });
    }
  });

  app.post('/api/status', isAuthenticated, async (req, res) => {
    try {
      const status = await storage.createStatus(req.body);
      res.status(201).json(status);
    } catch (error) {
      console.error("Error creating status:", error);
      res.status(500).json({ message: "Erro ao criar status" });
    }
  });

  app.put('/api/status/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const status = await storage.updateStatus(id, req.body);
      res.json(status);
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ message: "Erro ao atualizar status" });
    }
  });

  app.delete('/api/status/:id', isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteStatus(id);
      res.json({ message: "Status excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting status:", error);
      res.status(500).json({ message: "Erro ao excluir status" });
    }
  });

  // Birthday Messages API
  app.get('/api/company/birthday-messages', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const messages = await storage.getBirthdayMessagesByCompany(companyId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching birthday messages:", error);
      res.status(500).json({ message: "Erro ao buscar mensagens de aniversário" });
    }
  });

  app.post('/api/company/birthday-messages', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const messageData = { ...req.body, companyId };
      const message = await storage.createBirthdayMessage(messageData);
      res.status(201).json(message);
    } catch (error) {
      console.error("Error creating birthday message:", error);
      res.status(500).json({ message: "Erro ao criar mensagem de aniversário" });
    }
  });

  app.put('/api/company/birthday-messages/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verify birthday message belongs to company
      const existingMessage = await storage.getBirthdayMessage(id);
      if (!existingMessage || existingMessage.companyId !== companyId) {
        return res.status(404).json({ message: "Mensagem não encontrada" });
      }

      const message = await storage.updateBirthdayMessage(id, req.body);
      res.json(message);
    } catch (error) {
      console.error("Error updating birthday message:", error);
      res.status(500).json({ message: "Erro ao atualizar mensagem de aniversário" });
    }
  });

  app.delete('/api/company/birthday-messages/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);

      // Verify birthday message belongs to company
      const existingMessage = await storage.getBirthdayMessage(id);
      if (!existingMessage || existingMessage.companyId !== companyId) {
        return res.status(404).json({ message: "Mensagem não encontrada" });
      }

      await storage.deleteBirthdayMessage(id);
      res.json({ message: "Mensagem de aniversário excluída com sucesso" });
    } catch (error) {
      console.error("Error deleting birthday message:", error);
      res.status(500).json({ message: "Erro ao excluir mensagem de aniversário" });
    }
  });

  // Birthday Message History API
  app.get('/api/company/birthday-message-history', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const history = await storage.getBirthdayMessageHistory(companyId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching birthday message history:", error);
      res.status(500).json({ message: "Erro ao buscar histórico de mensagens de aniversário" });
    }
  });

  // Message Campaigns API
  app.get('/api/company/campaigns', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const campaigns = await storage.getMessageCampaigns(companyId);

      // Parse selectedClients JSON string to array
      const parsedCampaigns = campaigns.map(campaign => ({
        ...campaign,
        selectedClients: typeof campaign.selectedClients === 'string'
          ? JSON.parse(campaign.selectedClients)
          : campaign.selectedClients
      }));

      res.json(parsedCampaigns);
    } catch (error) {
      console.error("Error fetching message campaigns:", error);
      res.status(500).json({ message: "Erro ao buscar campanhas" });
    }
  });

  app.post('/api/company/campaigns', validateBody(createCampaignSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      // Convert datetime-local string to Date with Brazil timezone offset (UTC-3)
      // datetime-local format: "2025-12-19T01:51"
      // User selects time in Brazil timezone, but server is in UTC
      const dateStr = req.body.scheduledDate;
      const [datePart, timePart] = dateStr.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);

      // Create Date and subtract 3 hours to adjust for Brazil timezone (UTC-3)
      // This way when saved to MySQL, it will be stored in the correct local time
      const localDate = new Date(year, month - 1, day, hour, minute, 0);
      const scheduledDate = new Date(localDate.getTime() - (3 * 60 * 60 * 1000));

      console.log('🕐 Original (Brazil time):', localDate);
      console.log('🕐 Adjusted (UTC-3):', scheduledDate);
      console.log('🕐 MySQL format:', scheduledDate.toISOString().slice(0, 19).replace('T', ' '));

      const campaignData = {
        ...req.body,
        companyId,
        status: 'pending',
        sentCount: 0,
        totalTargets: 0,
        scheduledDate: scheduledDate,
        // Don't JSON.stringify - Drizzle does this automatically for JSON fields
        selectedClients: req.body.selectedClients || null,
      };

      const campaign = await storage.createMessageCampaign(campaignData);
      console.log('✅ Campaign created:', campaign.id);

      res.status(201).json(campaign);
    } catch (error) {
      console.error("Error creating message campaign:", error);
      res.status(500).json({ message: "Erro ao criar campanha" });
    }
  });

  app.delete('/api/company/campaigns/:id', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const id = parseInt(req.params.id);
      await storage.deleteMessageCampaign(id, companyId);
      res.json({ message: "Campanha excluída com sucesso" });
    } catch (error) {
      console.error("Error deleting message campaign:", error);
      res.status(500).json({ message: "Erro ao excluir campanha" });
    }
  });

  // Asaas Configuration APIs
  // GET - Obter configurações do Asaas
  app.get('/api/company/asaas-config', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const [company] = await db.execute(
        sql`SELECT asaas_api_key, asaas_environment, asaas_enabled
            FROM companies
            WHERE id = ${companyId}`
      );

      if (!company) {
        return res.status(404).json({ error: "Empresa não encontrada" });
      }

      // Mascarar a chave da API para segurança
      const config = {
        hasAsaasApiKey: !!company.asaas_api_key,
        asaasEnvironment: company.asaas_environment,
        asaasEnabled: Boolean(company.asaas_enabled),
        hasApiKey: !!company.asaas_api_key,
      };

      res.json(config);
    } catch (error) {
      console.error("Erro ao buscar configurações do Asaas:", error);
      res.status(500).json({ error: "Erro ao buscar configurações" });
    }
  });

  // PUT - Atualizar configurações do Asaas
  app.put('/api/company/asaas-config', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { asaasApiKey, asaasEnvironment, asaasEnabled } = req.body;

      // Se a key não foi enviada, verificar se já existe
      if (!asaasApiKey || asaasApiKey.trim().length === 0) {
        const existingCompany = await storage.getCompanyById(companyId);
        if (!existingCompany?.asaasApiKey) {
          return res.status(400).json({ error: "Chave da API é obrigatória" });
        }
        // Atualizar apenas environment e enabled, mantendo a key existente
        await db.execute(
          sql`UPDATE companies
              SET asaas_environment = ${asaasEnvironment || "sandbox"},
                  asaas_enabled = ${asaasEnabled ? 1 : 0}
              WHERE id = ${companyId}`
        );
      } else {
        // Atualizar tudo incluindo a nova key
        await db.execute(
          sql`UPDATE companies
              SET asaas_api_key = ${asaasApiKey.trim()},
                  asaas_environment = ${asaasEnvironment || "sandbox"},
                  asaas_enabled = ${asaasEnabled ? 1 : 0}
              WHERE id = ${companyId}`
        );
      }

      res.json({
        success: true,
        message: "Configurações do Asaas atualizadas com sucesso"
      });
    } catch (error) {
      console.error("Erro ao atualizar configurações do Asaas:", error);
      res.status(500).json({ error: "Erro ao atualizar configurações" });
    }
  });

  // POST - Webhook do Asaas
  app.post('/api/webhook/asaas/:companyId', async (req: any, res) => {
    try {
      const { companyId } = req.params;
      const event = req.body;

      console.log(`[Asaas Webhook] Evento recebido para empresa ${companyId}:`, event.event);

      // Verificar se a empresa existe e tem Asaas habilitado
      const [company] = await db.execute(
        sql`SELECT id, asaas_enabled
            FROM companies
            WHERE id = ${parseInt(companyId)}`
      );

      if (!company || !company.asaas_enabled) {
        console.log(`[Asaas Webhook] Empresa ${companyId} não encontrada ou Asaas desabilitado`);
        return res.status(404).json({ error: "Empresa não encontrada ou integração desabilitada" });
      }

      // Processar diferentes tipos de eventos
      switch (event.event) {
        case "PAYMENT_CREATED":
          console.log(`[Asaas] Pagamento criado: ${event.payment?.id}`);
          // TODO: Implementar lógica para pagamento criado
          break;

        case "PAYMENT_CONFIRMED":
          console.log(`[Asaas] Pagamento confirmado: ${event.payment?.id}`);
          // TODO: Implementar lógica para pagamento confirmado
          break;

        case "PAYMENT_RECEIVED":
          console.log(`[Asaas] Pagamento recebido: ${event.payment?.id}`);
          // TODO: Implementar lógica para pagamento recebido
          break;

        case "PAYMENT_OVERDUE":
          console.log(`[Asaas] Pagamento vencido: ${event.payment?.id}`);
          // TODO: Implementar lógica para pagamento vencido
          break;

        case "PAYMENT_DELETED":
          console.log(`[Asaas] Pagamento cancelado: ${event.payment?.id}`);
          // TODO: Implementar lógica para pagamento cancelado
          break;

        case "PAYMENT_REFUNDED":
          console.log(`[Asaas] Pagamento estornado: ${event.payment?.id}`);
          // TODO: Implementar lógica para pagamento estornado
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

  // Company Plan Info API
  app.get('/api/company/plan-info', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      // Buscar empresa e seu plano
      const company = await storage.getCompany(companyId);
      if (!company || !company.planId) {
        return res.status(404).json({ message: "Empresa ou plano não encontrado" });
      }

      // Buscar detalhes do plano
      const plan = await storage.getPlan(company.planId);
      if (!plan) {
        return res.status(404).json({ message: "Plano não encontrado" });
      }

      // Buscar contagem de profissionais
      const professionalsCount = await storage.getProfessionalsCount(companyId);

      // Parse das permissões
      let permissions = {};
      try {
        if (typeof plan.permissions === 'string') {
          permissions = JSON.parse(plan.permissions);
        } else if (typeof plan.permissions === 'object' && plan.permissions !== null) {
          permissions = plan.permissions;
        } else {
          // Permissões padrão se não estiverem definidas
          permissions = {
            dashboard: true,
            appointments: true,
            services: true,
            professionals: true,
            clients: true,
            reviews: true,
            tasks: true,
            pointsProgram: true,
            loyalty: true,
            inventory: true,
            messages: true,
            coupons: true,
            financial: true,
            reports: true,
            settings: true,
          };
        }
      } catch (e) {
        console.error(`Erro ao fazer parse das permissões do plano ${plan.id}:`, e);
        // Fallback para permissões padrão
        permissions = {
          dashboard: true,
          appointments: true,
          services: true,
          professionals: true,
          clients: true,
          reviews: true,
          tasks: true,
          pointsProgram: true,
          loyalty: true,
          inventory: true,
          messages: true,
          coupons: true,
          financial: true,
          reports: true,
          settings: true,
        };
      }

      const response = {
        plan: {
          id: plan.id,
          name: plan.name,
          maxProfessionals: plan.maxProfessionals || 1,
          permissions: permissions
        },
        usage: {
          professionalsCount: professionalsCount,
          professionalsLimit: plan.maxProfessionals || 1
        }
      };

      res.json(response);
    } catch (error) {
      console.error("Error fetching company plan info:", error);
      res.status(500).json({ message: "Erro ao buscar informações do plano" });
    }
  });

// Temporary in-memory storage for WhatsApp instances
const tempWhatsappInstances: any[] = [];

// Configure multer for file uploads
const storage_multer = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `logo-${uniqueSuffix}${ext}`);
  }
});

// Function to transcribe audio using OpenAI Whisper
async function transcribeAudio(audioBase64: string, openaiApiKey: string): Promise<string | null> {
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: openaiApiKey });
    
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    // WhatsApp typically sends audio as OGG Opus format, but we'll try to detect
    let extension = 'ogg'; // Default to ogg for WhatsApp
    if (audioBuffer.length > 4) {
      const header = audioBuffer.subarray(0, 4);
      const headerStr = header.toString('ascii', 0, 4);
      
      if (header[0] === 0xFF && (header[1] & 0xF0) === 0xF0) {
        extension = 'mp3';
      } else if (headerStr === 'OggS') {
        extension = 'ogg';
      } else if (headerStr === 'RIFF') {
        extension = 'wav';
      } else if (headerStr.includes('ftyp')) {
        extension = 'm4a';
      } else {
        // WhatsApp commonly uses OGG format even without proper header
        extension = 'ogg';
      }
    }
    
    const tempFilePath = path.join('/tmp', `audio_${Date.now()}.${extension}`);
    
    // Ensure /tmp directory exists
    if (!fs.existsSync('/tmp')) {
      fs.mkdirSync('/tmp', { recursive: true });
    }
    
    fs.writeFileSync(tempFilePath, audioBuffer);
    
    // Create a readable stream for OpenAI
    const audioStream = fs.createReadStream(tempFilePath);
    
    console.log(`🎵 Transcribing audio file: ${extension} format, size: ${audioBuffer.length} bytes`);
    
    // Transcribe using OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: "whisper-1",
      language: "pt", // Portuguese language
    });
    
    // Clean up temporary file
    fs.unlinkSync(tempFilePath);
    
    return transcription.text;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return null;
  }
}


// Helper function to generate public webhook URLs
// Prioriza system_url das configurações globais para garantir URL pública acessível
async function generateWebhookUrl(req: any, instanceName: string): Promise<string> {
  // Tentar usar system_url das configurações globais (URL pública)
  try {
    const settings = await storage.getGlobalSettings();
    if (settings?.systemUrl) {
      const baseUrl = settings.systemUrl.replace(/\/+$/, '');
      return `${baseUrl}/api/webhook/whatsapp/${encodeURIComponent(instanceName)}`;
    }
  } catch (e) {
    console.warn('⚠️ Could not get system_url from global settings');
  }

  // Fallback: usar host do request
  const host = req.get('host');
  if (host?.includes('replit.dev') || host?.includes('replit.app')) {
    return `https://${host}/api/webhook/whatsapp/${encodeURIComponent(instanceName)}`;
  }
  return `${req.protocol}://${host}/api/webhook/whatsapp/${encodeURIComponent(instanceName)}`;
}

async function generateAvailabilityInfo(professionals: any[], existingAppointments: any[]): Promise<string> {
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const dayKeysMap: { [key: number]: string } = {
    0: 'domingo',
    1: 'segunda',
    2: 'terca',
    3: 'quarta',
    4: 'quinta',
    5: 'sexta',
    6: 'sabado'
  };

  // Generate next 7 days for display (user can still book up to 30 days ahead on request)
  const nextDays = [];
  for (let i = 0; i < 7; i++) {
    const date = getBrazilDate(); // Use Brazil timezone
    date.setDate(date.getDate() + i);
    const dateStr = formatDateLocal(date);
    // Parse back to get correct day of week in Brazil timezone
    const dateParts = dateStr.split('-');
    const brazilDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    const dayOfWeek = brazilDate.getDay(); // Pre-calculated correctly in day object (already in Brazil timezone)
    nextDays.push({
      date: dateStr,
      dayName: dayNames[dayOfWeek],
      dayKey: dayKeysMap[dayOfWeek],
      dayOfWeek: dayOfWeek, // Add this for later use
      formatted: brazilDate.toLocaleDateString('pt-BR')
    });
  }

  let availabilityText = 'DISPONIBILIDADE REAL DOS PROFISSIONAIS POR DATA:\n\n';

  for (const prof of professionals) {
    if (!prof.active || prof.archived) continue;

    availabilityText += `${prof.name} (ID: ${prof.id}):\n`;

    // Get individual schedules for each day
    const professionalSchedules = await storage.getProfessionalSchedules(prof.id);

    // Get professional breaks
    const professionalBreaks = await storage.getProfessionalBreaks(prof.id);

    // Get professional days off for the date range
    const startDate = nextDays[0].date;
    const endDate = nextDays[nextDays.length - 1].date;
    const professionalDaysOff = await storage.getProfessionalDaysOffByDateRange(prof.id, startDate, endDate);

    // Get professional exceptional schedules for the date range
    const professionalExceptionalSchedules = await storage.getProfessionalExceptionalSchedulesByDateRange(prof.id, startDate, endDate);

    // Display schedule by day
    if (professionalSchedules.length > 0) {
      availabilityText += `- Horários por dia:\n`;
      professionalSchedules
        .filter(s => s.isEnabled)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .forEach(schedule => {
          availabilityText += `  * ${dayNames[schedule.dayOfWeek]}: ${schedule.startTime} às ${schedule.endTime}\n`;
        });
    } else {
      // Fallback to old system if no schedules configured
      const workDays = prof.workDays || [1, 2, 3, 4, 5, 6];
      const workStart = prof.workStartTime || '09:00';
      const workEnd = prof.workEndTime || '18:00';
      availabilityText += `- Horário de trabalho: ${workStart} às ${workEnd}\n`;
      availabilityText += `- Dias de trabalho: ${workDays.map((day: number) => dayNames[day]).join(', ')}\n`;
    }

    // Add time interval information
    const configuredInterval = prof.timeInterval || 0;
    if (configuredInterval === 0) {
      availabilityText += `- Intervalo de agendamento: Sem intervalo fixo (usa a duração do serviço)\n`;
    } else {
      const timeInterval = configuredInterval;
      availabilityText += `- Intervalo de agendamento: ${timeInterval} minutos (APENAS sugira horários que sejam múltiplos de ${timeInterval} minutos. Ex: `;

      // Generate example times based on interval
      // Get a reference start time for examples (use first enabled schedule or fallback)
      let exampleStartTime = '09:00';
      if (professionalSchedules.length > 0) {
        const firstSchedule = professionalSchedules.find(s => s.isEnabled);
        if (firstSchedule) {
          exampleStartTime = firstSchedule.startTime;
        }
      } else {
        exampleStartTime = prof.workStartTime || '09:00';
      }

      const startHour = parseInt(exampleStartTime.split(':')[0]);
      const exampleTimes: string[] = [];
      let currentHour = startHour;
      let currentMinute = 0;

      for (let i = 0; i < 4; i++) {
        exampleTimes.push(`${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`);
        currentMinute += timeInterval;
        if (currentMinute >= 60) {
          currentHour += Math.floor(currentMinute / 60);
          currentMinute = currentMinute % 60;
        }
      }

      availabilityText += `${exampleTimes.join(', ')}, etc.)\n`;
    }

    // Add minimum advance hours information
    const minimumAdvanceHours = Number(prof.minimumAdvanceHours) || 0;
    if (minimumAdvanceHours > 0) {
      // Formatar corretamente: 0.5 = "30 minutos", 1 = "1 hora", 2 = "2 horas"
      const advanceText = minimumAdvanceHours < 1
        ? `${Math.round(minimumAdvanceHours * 60)} minutos`
        : minimumAdvanceHours === 1
          ? '1 hora'
          : `${minimumAdvanceHours} horas`;
      availabilityText += `- Antecedência mínima: ${advanceText} (válido apenas para agendamentos HOJE - dias futuros sempre permitidos)\n`;
    } else {
      availabilityText += `- Antecedência mínima: Nenhuma\n`;
    }

    // Show breaks if any
    if (professionalBreaks.length > 0) {
      const breaksByDay: { [key: string]: string[] } = {};
      for (const brk of professionalBreaks) {
        if (!breaksByDay[brk.dayOfWeek]) {
          breaksByDay[brk.dayOfWeek] = [];
        }
        breaksByDay[brk.dayOfWeek].push(`${brk.startTime}-${brk.endTime}`);
      }

      const breakInfo = Object.entries(breaksByDay)
        .map(([day, times]) => `${day}: ${times.join(', ')}`)
        .join('; ');
      availabilityText += `- PAUSAS/INTERVALOS (NÃO AGENDAR): ${breakInfo}\n`;
    }

    // Show days off if any
    if (professionalDaysOff.length > 0) {
      const daysOffInfo = professionalDaysOff.map(d => {
        // d.dateOff comes from MySQL as Date object
        // Extract date parts directly to avoid timezone conversion issues
        let displayDate: string;

        if (typeof d.dateOff === 'string') {
          // If it's already a string (YYYY-MM-DD), parse and format
          const parts = d.dateOff.split('-');
          displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          // If it's a Date object, use UTC methods to avoid timezone offset
          const date = new Date(d.dateOff);
          const day = String(date.getUTCDate()).padStart(2, '0');
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const year = date.getUTCFullYear();
          displayDate = `${day}/${month}/${year}`;
        }

        return d.reason ? `${displayDate} (${d.reason})` : displayDate;
      }).join(', ');
      availabilityText += `- DIAS INDISPONÍVEIS (NÃO AGENDAR): ${daysOffInfo}\n`;
    }

    // Show exceptional schedules if any
    if (professionalExceptionalSchedules.length > 0) {
      const exceptionalInfo = professionalExceptionalSchedules.map(exc => {
        // exc.exceptionDate comes from MySQL as Date object
        // Extract date parts directly to avoid timezone conversion issues
        let displayDate: string;

        if (typeof exc.exceptionDate === 'string') {
          // If it's already a string (YYYY-MM-DD), parse and format
          const parts = exc.exceptionDate.split('-');
          displayDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
        } else {
          // If it's a Date object, use UTC methods to avoid timezone offset
          const date = new Date(exc.exceptionDate);
          const day = String(date.getUTCDate()).padStart(2, '0');
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const year = date.getUTCFullYear();
          displayDate = `${day}/${month}/${year}`;
        }

        const reasonText = exc.reason ? ` - ${exc.reason}` : '';
        return `${displayDate}: ${exc.startTime} às ${exc.endTime}${reasonText}`;
      }).join(', ');
      // IMPORTANTE: Mostrar horários excepcionais para a IA considerar na disponibilidade
      availabilityText += `- ⚠️ HORÁRIOS ESPECIAIS (diferente do normal): ${exceptionalInfo}\n`;
    }
    availabilityText += '\n';

    // Check availability for next 7 days (detailed view)
    for (const day of nextDays) {
      // Use pre-calculated dayOfWeek from Brazil timezone (avoid recalculating with local timezone)
      const dayOfWeek = day.dayOfWeek;

      // Check if this day is a day off
      const isDayOff = professionalDaysOff.some(d => {
        // Use UTC methods to extract date without timezone conversion
        const dateObj = new Date(d.dateOff);
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const dayNum = String(dateObj.getUTCDate()).padStart(2, '0');
        const dayOffDate = `${year}-${month}-${dayNum}`;
        return dayOffDate === day.date;
      });

      if (isDayOff) {
        const dayOffInfo = professionalDaysOff.find(d => {
          // Use UTC methods to extract date without timezone conversion
          const dateObj = new Date(d.dateOff);
          const year = dateObj.getUTCFullYear();
          const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
          const dayNum = String(dateObj.getUTCDate()).padStart(2, '0');
          const dayOffDate = `${year}-${month}-${dayNum}`;
          return dayOffDate === day.date;
        });
        const reason = dayOffInfo?.reason ? ` - ${dayOffInfo.reason}` : '';
        availabilityText += `  ${day.dayName} (${day.formatted}): INDISPONÍVEL${reason} (NÃO AGENDAR)\n`;
        continue;
      }

      // Check if there's an exceptional schedule for this specific date
      const exceptionalSchedule = professionalExceptionalSchedules.find(exc => {
        // Use UTC methods to extract date without timezone conversion
        const dateObj = new Date(exc.exceptionDate);
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const dayNum = String(dateObj.getUTCDate()).padStart(2, '0');
        const excDate = `${year}-${month}-${dayNum}`;
        return excDate === day.date;
      });

      let workStart: string;
      let workEnd: string;
      let isExceptional = false;

      if (exceptionalSchedule) {
        // Use exceptional schedule hours
        workStart = exceptionalSchedule.startTime;
        workEnd = exceptionalSchedule.endTime;
        isExceptional = true;
      } else {
        // Check if professional has regular schedule for this day
        const daySchedule = professionalSchedules.find(s => s.dayOfWeek === dayOfWeek && s.isEnabled);
        if (!daySchedule) {
          availabilityText += `  ${day.dayName} (${day.formatted}): NÃO TRABALHA\n`;
          continue;
        }
        workStart = daySchedule.startTime;
        workEnd = daySchedule.endTime;
      }

      // Get breaks for this specific day (exception breaks or regular day-of-week breaks)
      let dayBreaks: { startTime: string; endTime: string }[] = [];
      if (isExceptional && exceptionalSchedule) {
        dayBreaks = await storage.getExceptionBreaks(exceptionalSchedule.id);
      } else {
        dayBreaks = professionalBreaks.filter(brk => brk.dayOfWeek === day.dayKey);
      }

      // Find appointments for this specific date
      const dayAppointments = existingAppointments.filter(apt => {
        if (apt.professionalId !== prof.id ||
            apt.status === 'Cancelado' ||
            apt.status === 'cancelado') {
          return false;
        }
        // appointmentDate already comes as YYYY-MM-DD string from database (via DATE_FORMAT)
        // No need to convert - just compare directly to avoid timezone issues

        // Debug log to see the comparison
        if (prof.id === 4 || prof.id === 5) {
          console.log(`🔍 Comparing appointment: ${apt.appointmentDate} vs ${day.date} for professional ${prof.name} (${prof.id})`);
        }

        return apt.appointmentDate === day.date;
      });

      let statusParts: string[] = [];

      if (dayAppointments.length > 0) {
        // Show appointments with duration to help AI understand time blocks
        const appointmentDetails = dayAppointments
          .map(apt => {
            const duration = apt.duration || 30;
            const [startHour, startMin] = apt.appointmentTime.split(':').map(Number);
            const startInMinutes = startHour * 60 + startMin;
            const endInMinutes = startInMinutes + duration;
            const endHour = Math.floor(endInMinutes / 60);
            const endMin = endInMinutes % 60;
            const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
            return `${apt.appointmentTime}-${endTime} (${duration}min)`;
          })
          .sort()
          .join(', ');
        statusParts.push(`OCUPADO ${appointmentDetails}`);
      }

      if (dayBreaks.length > 0) {
        const breakTimes = dayBreaks.map(brk => `${brk.startTime}-${brk.endTime}`);
        statusParts.push(`PAUSA às ${breakTimes.join(', ')} (NÃO AGENDAR)`);
      }

      // Removido exceptionalNote: não mencionar horários excepcionais ao cliente

      if (statusParts.length > 0) {
        availabilityText += `  ${day.dayName} (${day.formatted}): ${statusParts.join(' | ')} (trabalha ${workStart} às ${workEnd})\n`;
      } else {
        availabilityText += `  ${day.dayName} (${day.formatted}): LIVRE (${workStart} às ${workEnd})\n`;
      }
    }

    availabilityText += '\n';
  }

  return availabilityText;
}

// ==================== VERIFICAÇÃO DE DISPONIBILIDADE PARA DATAS ESPECÍFICAS ====================

/**
 * Extrai data específica mencionada na mensagem do usuário
 * Retorna a data em formato YYYY-MM-DD ou null se não encontrar
 */
function extractSpecificDateFromMessage(messageText: string, conversationHistory: any[]): string | null {
  const today = getBrazilDate();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  // Padrões para detectar datas específicas
  const datePatterns = [
    // Formato DD/MM/YYYY
    /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
    // Formato DD/MM
    /\b(\d{1,2})\/(\d{1,2})\b/,
    // "dia DD" ou "dia DD de"
    /\bdia\s+(\d{1,2})\b/i,
    // "DD de [mês]"
    /\b(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i,
  ];

  const monthNames: { [key: string]: number } = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
    'outubro': 10, 'novembro': 11, 'dezembro': 12
  };

  // Combina mensagem atual com últimas 3 mensagens do usuário para contexto
  const recentUserMessages = conversationHistory
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content)
    .join(' ');

  const fullText = `${messageText} ${recentUserMessages}`.toLowerCase();

  // Tenta encontrar data no formato DD/MM/YYYY
  let match = fullText.match(datePatterns[0]);
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Tenta encontrar data no formato DD/MM (usa ano atual)
  match = fullText.match(datePatterns[1]);
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    // Se o mês for menor que o mês atual, assume próximo ano
    const year = month < currentMonth ? currentYear + 1 : currentYear;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Tenta encontrar "dia DD"
  match = fullText.match(datePatterns[2]);
  if (match) {
    const day = parseInt(match[1]);
    // Se o dia já passou no mês atual, assume próximo mês
    const targetMonth = day < today.getDate() ? currentMonth + 1 : currentMonth;
    const year = targetMonth > 12 ? currentYear + 1 : currentYear;
    const month = targetMonth > 12 ? 1 : targetMonth;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // Tenta encontrar "DD de [mês]"
  match = fullText.match(datePatterns[3]);
  if (match) {
    const day = parseInt(match[1]);
    const monthName = match[2].toLowerCase();
    const month = monthNames[monthName] || currentMonth;
    // Se o mês for menor que o mês atual, assume próximo ano
    const year = month < currentMonth ? currentYear + 1 : currentYear;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Calcula diferença de dias entre hoje e data específica
 */
function getDaysDifference(targetDate: string): number {
  const today = getBrazilDate();
  today.setHours(0, 0, 0, 0);

  const [year, month, day] = targetDate.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  target.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Busca disponibilidade em tempo real para uma data específica
 */
async function getSpecificDateAvailability(
  targetDate: string,
  professionals: any[],
  existingAppointments: any[]
): Promise<string> {
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const dayKeysMap: { [key: number]: string } = {
    0: 'domingo',
    1: 'segunda',
    2: 'terca',
    3: 'quarta',
    4: 'quinta',
    5: 'sexta',
    6: 'sabado'
  };

  // Parse target date
  const [year, month, day] = targetDate.split('-').map(Number);
  const targetDateObj = new Date(year, month - 1, day);
  const dayOfWeek = targetDateObj.getDay();
  const dayName = dayNames[dayOfWeek];
  const dayKey = dayKeysMap[dayOfWeek];
  const formatted = targetDateObj.toLocaleDateString('pt-BR');

  let availabilityText = `\n\n🔍 DISPONIBILIDADE PARA DATA ESPECÍFICA SOLICITADA:\n`;
  availabilityText += `📅 Data: ${dayName}, ${formatted}\n\n`;

  for (const prof of professionals) {
    if (!prof.active || prof.archived) continue;

    availabilityText += `${prof.name} (ID: ${prof.id}):\n`;

    // Get professional schedules
    const professionalSchedules = await storage.getProfessionalSchedules(prof.id);

    // Get professional breaks
    const professionalBreaks = await storage.getProfessionalBreaks(prof.id);

    // Check for days off on this specific date
    const professionalDaysOff = await storage.getProfessionalDaysOffByDateRange(prof.id, targetDate, targetDate);

    // Check if this day is a day off
    const isDayOff = professionalDaysOff.some(d => {
      const dateObj = new Date(d.dateOff);
      const dateOffYear = dateObj.getUTCFullYear();
      const dateOffMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const dateOffDay = String(dateObj.getUTCDate()).padStart(2, '0');
      const dayOffDate = `${dateOffYear}-${dateOffMonth}-${dateOffDay}`;
      return dayOffDate === targetDate;
    });

    if (isDayOff) {
      const dayOffInfo = professionalDaysOff.find(d => {
        const dateObj = new Date(d.dateOff);
        const dateOffYear = dateObj.getUTCFullYear();
        const dateOffMonth = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const dateOffDay = String(dateObj.getUTCDate()).padStart(2, '0');
        const dayOffDate = `${dateOffYear}-${dateOffMonth}-${dateOffDay}`;
        return dayOffDate === targetDate;
      });
      const reason = dayOffInfo?.reason ? ` - ${dayOffInfo.reason}` : '';
      availabilityText += `  ❌ INDISPONÍVEL${reason} (NÃO AGENDAR NESTE DIA)\n\n`;
      continue;
    }

    // Check if there's an exceptional schedule for this specific date
    const exceptionalSchedules = await storage.getProfessionalExceptionalSchedulesByDateRange(prof.id, targetDate, targetDate);
    let workStart: string;
    let workEnd: string;
    let isExceptionalDay = false;

    if (exceptionalSchedules.length > 0) {
      workStart = exceptionalSchedules[0].startTime;
      workEnd = exceptionalSchedules[0].endTime;
      isExceptionalDay = true;
    } else {
      // Check if professional has schedule for this day
      const daySchedule = professionalSchedules.find(s => s.dayOfWeek === dayOfWeek && s.isEnabled);
      if (!daySchedule) {
        availabilityText += `  ❌ NÃO TRABALHA NESTE DIA DA SEMANA\n\n`;
        continue;
      }
      workStart = daySchedule.startTime;
      workEnd = daySchedule.endTime;
    }

    availabilityText += `  ✅ Horário de trabalho: ${workStart} às ${workEnd}\n`;

    // Get breaks for this specific day (exception breaks or regular day-of-week breaks)
    let dayBreaks: { startTime: string; endTime: string }[] = [];
    if (isExceptionalDay && exceptionalSchedules.length > 0) {
      dayBreaks = await storage.getExceptionBreaks(exceptionalSchedules[0].id);
    } else {
      dayBreaks = professionalBreaks.filter(brk => brk.dayOfWeek === dayKey);
    }

    // Get appointments for this specific date
    const dayAppointments = existingAppointments.filter(apt => {
      return apt.professionalId === prof.id &&
             apt.status !== 'Cancelado' &&
             apt.status !== 'cancelado' &&
             apt.appointmentDate === targetDate;
    });

    // Show busy times with duration (same format as the first 7 days)
    if (dayAppointments.length > 0) {
      // Show appointments with duration to help AI understand time blocks
      const appointmentDetails = dayAppointments
        .map(apt => {
          const duration = apt.duration || 30;
          const [startHour, startMin] = apt.appointmentTime.split(':').map(Number);
          const startInMinutes = startHour * 60 + startMin;
          const endInMinutes = startInMinutes + duration;
          const endHour = Math.floor(endInMinutes / 60);
          const endMin = endInMinutes % 60;
          const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
          return `${apt.appointmentTime}-${endTime} (${duration}min)`;
        })
        .sort()
        .join(', ');
      availabilityText += `  🚫 OCUPADO ${appointmentDetails}\n`;
    } else {
      availabilityText += `  ✅ Sem agendamentos ainda - horários disponíveis\n`;
    }

    // Show break times
    if (dayBreaks.length > 0) {
      const breakTimes = dayBreaks
        .map(brk => `${brk.startTime}-${brk.endTime}`)
        .join(', ');
      availabilityText += `  ⏸️ PAUSA/INTERVALO: ${breakTimes} (NÃO AGENDAR)\n`;
    }

    availabilityText += '\n';
  }

  availabilityText += `⚠️ IMPORTANTE: Antes de confirmar qualquer horário para ${formatted}, verifique se o horário NÃO está marcado como OCUPADO ou PAUSA acima.\n`;

  return availabilityText;
}

/**
 * Verifica se precisa buscar disponibilidade de data específica
 * Retorna informações adicionais se necessário
 */
async function checkSpecificDateAvailability(
  messageText: string,
  conversationHistory: any[],
  professionals: any[],
  existingAppointments: any[]
): Promise<string> {
  // Extrai data específica mencionada
  const specificDate = extractSpecificDateFromMessage(messageText, conversationHistory);

  if (!specificDate) {
    return ''; // Não encontrou data específica
  }

  console.log(`📅 Data específica detectada: ${specificDate}`);

  // Calcula diferença de dias
  const daysDiff = getDaysDifference(specificDate);

  console.log(`📊 Diferença de dias: ${daysDiff}`);

  // Se for data passada, informa
  if (daysDiff < 0) {
    return '\n\n⚠️ ATENÇÃO: A data mencionada já passou. Por favor, solicite uma data futura.\n';
  }

  // Se for dentro dos próximos 7 dias, não precisa buscar (já está no contexto padrão)
  if (daysDiff <= 7) {
    console.log(`⚡ Data dentro dos próximos 7 dias - usando disponibilidade padrão`);
    return '';
  }

  // Se for além de 30 dias, bloqueia
  if (daysDiff > 30) {
    const [year, month, day] = specificDate.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    const formatted = dateObj.toLocaleDateString('pt-BR');
    return `\n\n⚠️ ATENÇÃO: A data ${formatted} está além do período de agendamento permitido (máximo 30 dias). Por favor, escolha uma data dentro dos próximos 30 dias.\n`;
  }

  // Se for entre 8-30 dias, busca disponibilidade em tempo real
  console.log(`🔍 Buscando disponibilidade em tempo real para ${specificDate}`);
  const availability = await getSpecificDateAvailability(specificDate, professionals, existingAppointments);

  return availability;
}

// ==================== FIM DA VERIFICAÇÃO DE DISPONIBILIDADE PARA DATAS ESPECÍFICAS ====================

async function createAppointmentFromAIConfirmation(conversationId: number, companyId: number, aiResponse: string, phoneNumber: string, initialStatus: string = 'agendado', contactName?: string): Promise<number | null> {
  try {
    console.log('==================================================');
    console.log('🎯 INICIANDO CRIAÇÃO DE AGENDAMENTO VIA CONFIRMAÇÃO');
    console.log('==================================================');
    console.log('🔍 AI Response to analyze:', aiResponse);
    console.log('📱 Phone number:', phoneNumber);
    console.log('🏢 Company ID:', companyId);
    console.log('💬 Conversation ID:', conversationId);
    console.log('👤 Contact Name (pushName):', contactName || 'não disponível');

    // IMPORTANTE: NÃO processar mensagens que são do TEMPLATE de confirmação (já enviadas pelo sistema)
    const isTemplateConfirmationMessage = aiResponse.includes('Agendamento Confirmado!') &&
                                          aiResponse.includes('Obrigado por escolher nossos serviços');

    if (isTemplateConfirmationMessage) {
      console.log('⚠️ Mensagem é template de confirmação já enviado, não criando duplicata');
      return null;
    }

    // Check if it's a summary message with appointment details (asking for confirmation)
    const hasSummaryFormat = (
      (aiResponse.includes('👤') || aiResponse.includes('Nome:')) &&
      (aiResponse.includes('📅') || aiResponse.includes('Data:')) &&
      (aiResponse.includes('🕐') || aiResponse.includes('Horário:'))
    );

    const isAskingConfirmation = (
      aiResponse.includes('Está tudo correto?') ||
      aiResponse.includes('Responda SIM para confirmar') ||
      aiResponse.includes('Responda SIM para cancelar') ||
      aiResponse.includes('CANCELAR* para confirmar') ||
      aiResponse.includes('CANCELAR para confirmar') ||
      aiResponse.includes('Confirma a remarcação?') ||
      aiResponse.includes('Confirma o cancelamento?') ||
      aiResponse.includes('confirmar seu agendamento') ||
      aiResponse.includes('Vou confirmar')
    );

    // Check if it's AI confirming the appointment (after user said SIM)
    const isAIConfirmingAppointment = (
      (aiResponse.includes('agendamento foi confirmado') ||
       aiResponse.includes('Nos vemos') ||
       aiResponse.includes('está confirmado') ||
       aiResponse.includes('confirmado para')) &&
      (aiResponse.match(/\d{2}\/\d{2}\/\d{4}/) || aiResponse.match(/segunda|terça|quarta|quinta|sexta|sábado|domingo/i)) &&
      (aiResponse.match(/\d{1,2}:\d{2}/) || aiResponse.includes('às'))
    );

    // Check if message has appointment data (date/time)
    const hasAppointmentData = (
      (aiResponse.match(/\d{2}\/\d{2}\/\d{4}/) || aiResponse.match(/segunda|terça|quarta|quinta|sexta|sábado|domingo/i)) &&
      (aiResponse.match(/\d{1,2}:\d{2}/) || aiResponse.includes('às'))
    );

    console.log('🔍 Verificações:', {
      hasSummaryFormat,
      isAskingConfirmation,
      isAIConfirmingAppointment,
      hasAppointmentData,
      willProceed: (hasSummaryFormat && isAskingConfirmation) || isAIConfirmingAppointment || hasAppointmentData
    });

    // Proceed if: asking for confirmation with summary, OR AI is confirming, OR has appointment data
    if (!((hasSummaryFormat && isAskingConfirmation) || isAIConfirmingAppointment || hasAppointmentData)) {
      console.log('❌ Mensagem não contém dados de agendamento válidos. Não criando agendamento.');
      return null;
    }
    console.log('✅ Resumo de agendamento encontrado, processando extração de dados');

    // Get conversation history to extract appointment data
    const allMessages = await storage.getMessagesByConversation(conversationId);

    // ========================================
    // 🔄 REUTILIZAR DADOS DA PRÉ-VALIDAÇÃO
    // ========================================
    // Se a mensagem atual é uma CONFIRMAÇÃO (ex: "Agendamento realizado com sucesso!"),
    // precisamos buscar a mensagem de RESUMO anterior para extrair dados corretamente.
    // A mensagem de confirmação tem formato diferente e não tem os emojis/estrutura do resumo.
    let messageToExtractFrom = aiResponse;

    const isConfirmationResponse = (
      aiResponse.includes('Agendamento realizado com sucesso') ||
      aiResponse.includes('agendamento foi confirmado') ||
      aiResponse.includes('Nos vemos') ||
      aiResponse.includes('está confirmado')
    );

    if (isConfirmationResponse) {
      console.log('🔄 Resposta atual é CONFIRMAÇÃO, buscando mensagem de RESUMO anterior...');

      // Buscar mensagem de resumo nas últimas 5 mensagens do assistente
      const recentAssistantMessages = allMessages
        .filter(m => m.role === 'assistant')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);

      const summaryMessage = recentAssistantMessages.find(m =>
        !m.content.includes('Agendamento Confirmado!') &&
        !m.content.includes('Obrigado por escolher nossos serviços') &&
        !m.content.includes('Agendamento realizado com sucesso') &&
        (
          ((m.content.includes('Está tudo correto?') ||
            m.content.includes('Responda SIM para confirmar') ||
            m.content.includes('Digite SIM ou OK para confirmar') ||
            m.content.includes('confirmar seu agendamento') ||
            m.content.includes('Vou confirmar')) &&
           (m.content.includes('👤') || m.content.includes('Nome:')) &&
           (m.content.includes('📅') || m.content.includes('Data:')) &&
           (m.content.includes('🕐') || m.content.includes('Horário:')))
        )
      );

      if (summaryMessage) {
        console.log('✅ Mensagem de RESUMO encontrada, usando ela para extração de dados');
        console.log('📋 Resumo (primeiros 200 chars):', summaryMessage.content.substring(0, 200));
        messageToExtractFrom = summaryMessage.content;
      } else {
        console.log('⚠️ Mensagem de RESUMO não encontrada, usando resposta atual');
      }
    }
    // ========================================

    // ========================================
    // 🔄 DETECTAR MÚLTIPLOS AGENDAMENTOS
    // ========================================
    // Método 1: Marcadores numéricos (1️⃣, 2️⃣, etc.)
    const numericMarkers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
    const foundNumericMarkers = numericMarkers.filter(marker => messageToExtractFrom.includes(marker));

    // Método 2: Contar ocorrências de campos-chave (👤 Nome:, 🕐 Horário:)
    const nameMatches = (messageToExtractFrom.match(/👤\s*Nome:/gi) || []).length;
    const timeMatches = (messageToExtractFrom.match(/🕐\s*Horário:/gi) || []).length;

    // Detecta múltiplos se: tem 2+ marcadores numéricos OU tem 2+ nomes E 2+ horários
    const hasMultipleByMarkers = foundNumericMarkers.length >= 2;
    const hasMultipleByFields = nameMatches >= 2 && timeMatches >= 2;

    if (hasMultipleByMarkers || hasMultipleByFields) {
      console.log('🔄 MÚLTIPLOS AGENDAMENTOS DETECTADOS!');
      console.log(`   - Marcadores numéricos: ${foundNumericMarkers.length}`);
      console.log(`   - Campos Nome: ${nameMatches}, Horário: ${timeMatches}`);

      // Escolher método de divisão baseado no que foi detectado
      let appointmentBlocks: string[];

      // Função auxiliar para validar se um bloco tem dados mínimos de agendamento
      const isValidAppointmentBlock = (block: string): boolean => {
        const trimmed = block.trim();
        // Bloco válido deve ter Nome (label OU nome próprio após marcador) E (Data ou Horário ou HH:MM)
        const hasNameLabel = /Nome:/i.test(trimmed);
        const hasNameAfterMarker = /(?:1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)\s*[A-ZÀ-Ÿ][a-záéíóúâêôãõüç]/i.test(trimmed);
        const hasName = hasNameLabel || hasNameAfterMarker;
        const hasDateOrTime = /Data:/i.test(trimmed) || /Horário:/i.test(trimmed) || /\d{1,2}:\d{2}/.test(trimmed) || /\d{1,2}:\s*$/.test(trimmed) || /às\s+\d{1,2}/i.test(trimmed);
        return !!trimmed && hasName && hasDateOrTime;
      };

      // Extrair data do header (texto completo) para propagar aos blocos sem data
      let headerDate = '';
      const headerDateMatch = messageToExtractFrom.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (headerDateMatch) {
        const hDateParts = headerDateMatch[1].split('/');
        if (hDateParts.length === 3) {
          headerDate = `${hDateParts[0].padStart(2, '0')}/${hDateParts[1].padStart(2, '0')}/${hDateParts[2]}`;
        }
      }

      // Extrair profissional do texto geral (ex: "todos com o profissional Estevão")
      let headerProfessional = '';
      const headerProfMatch = messageToExtractFrom.match(/todos\s+com\s+(?:o\s+)?(?:profissional\s+)?([A-ZÀ-Ÿ][a-záéíóúâêôãõüç]+(?:\s+[A-ZÀ-Ÿa-záéíóúâêôãõüç]+)*)/i) ||
                              messageToExtractFrom.match(/com\s+(?:o\s+)?profissional\s+([A-ZÀ-Ÿ][a-záéíóúâêôãõüç]+(?:\s+[A-ZÀ-Ÿa-záéíóúâêôãõüç]+)*)/i);
      if (headerProfMatch) {
        headerProfessional = headerProfMatch[1].trim();
      }

      console.log('📅 Data do header para propagação:', headerDate || 'não encontrada');
      console.log('👤 Profissional do header:', headerProfessional || 'não encontrado');

      if (hasMultipleByMarkers) {
        // Dividir por marcadores numéricos
        const splitPattern = /(?=1️⃣|2️⃣|3️⃣|4️⃣|5️⃣|6️⃣|7️⃣|8️⃣|9️⃣|🔟|①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)/;
        appointmentBlocks = messageToExtractFrom.split(splitPattern).filter(isValidAppointmentBlock);
        console.log('   - Método de divisão: marcadores numéricos');
      } else {
        // Dividir por ocorrências de "👤 Nome:" (cada bloco começa com um nome)
        const splitPattern = /(?=👤\s*Nome:)/gi;
        appointmentBlocks = messageToExtractFrom.split(splitPattern).filter(isValidAppointmentBlock);
        console.log('   - Método de divisão: campos Nome:');
      }

      console.log(`📋 Total de ${appointmentBlocks.length} blocos de agendamento VÁLIDOS encontrados`);

      const createdAppointmentIds: number[] = [];

      for (let i = 0; i < appointmentBlocks.length; i++) {
        const block = appointmentBlocks[i];
        console.log(`\n========== PROCESSANDO AGENDAMENTO ${i + 1} ==========`);
        console.log('Bloco (primeiros 300 chars):', block.substring(0, 300));

        const blockData = extractDataFromAppointmentBlock(block);

        // Propagar data do header se o bloco não tem data própria
        if (!blockData.date && headerDate) {
          blockData.date = headerDate;
          console.log(`📅 Data propagada do header: ${headerDate}`);
        }

        // Propagar profissional do header se o bloco não tem profissional
        if (!blockData.professional && headerProfessional) {
          blockData.professional = headerProfessional;
          console.log(`👤 Profissional propagado do header: ${headerProfessional}`);
        }

        if (blockData.clientName && blockData.date && blockData.time) {
          console.log(`✅ Dados extraídos - date: ${blockData.date}, time: ${blockData.time}, client: ${blockData.clientName}, prof: ${blockData.professional || 'N/A'}`);

          const singleAppointmentId = await createSingleAppointmentFromExtractedData(
            companyId,
            blockData,
            phoneNumber,
            initialStatus,
            contactName
          );

          if (singleAppointmentId) {
            createdAppointmentIds.push(singleAppointmentId);
            console.log(`✅ Agendamento ${i + 1} criado com ID: ${singleAppointmentId}`);

            // 🔔 Enviar webhook N8N e broadcast para CADA agendamento múltiplo
            try {
              const multiCompany = await storage.getCompanyById(companyId);
              const multiServices = await storage.getServicesByCompany(companyId);
              const multiProfessionals = await storage.getProfessionalsByCompany(companyId);

              const multiService = multiServices.find(s => s.name.toLowerCase() === (blockData.service || '').toLowerCase()) ||
                                   multiServices.find(s => s.name.toLowerCase().includes((blockData.service || '').toLowerCase()) || (blockData.service || '').toLowerCase().includes(s.name.toLowerCase()));
              const multiProfessional = multiProfessionals.find(p => p.name.toLowerCase() === (blockData.professional || '').toLowerCase()) ||
                                        multiProfessionals.find(p => p.name.toLowerCase().includes((blockData.professional || '').toLowerCase()) || (blockData.professional || '').toLowerCase().includes(p.name.toLowerCase()));

              // Converter data DD/MM/YYYY para YYYY-MM-DD
              let multiDateStr = '';
              if (blockData.date) {
                const dp = blockData.date.split('/');
                if (dp.length === 3) multiDateStr = `${dp[2]}-${dp[1]}-${dp[0]}`;
              }

              // Broadcast para dashboard em tempo real
              try {
                broadcastEvent({
                  type: 'appointment_created',
                  data: {
                    appointment: {
                      id: singleAppointmentId,
                      clientName: blockData.clientName || contactName || 'Cliente',
                      clientPhone: phoneNumber,
                      appointmentDate: multiDateStr,
                      appointmentTime: blockData.time,
                      professionalId: multiProfessional?.id,
                      serviceId: multiService?.id,
                      status: 'Pendente'
                    }
                  }
                }, companyId);
              } catch (broadcastErr) {
                console.error('⚠️ [Multi] Broadcast error:', broadcastErr);
              }

              // Webhook N8N
              if (multiCompany?.n8nWebhookEnabled && multiCompany?.n8nWebhookUrl) {
                const multiWebhookPayload = {
                  event: 'appointment.created',
                  timestamp: new Date().toISOString(),
                  createdBy: 'whatsapp_ai',
                  conversationId: conversationId,
                  appointment: {
                    id: singleAppointmentId,
                    clientName: blockData.clientName || contactName || 'Cliente',
                    clientPhone: phoneNumber,
                    clientEmail: null,
                    appointmentDate: multiDateStr,
                    appointmentTime: blockData.time,
                    status: initialStatus === 'payment_pending' ? 'Aguardando Pagamento' : 'Pendente',
                    duration: multiService?.duration || 30,
                    totalPrice: multiService?.price || 0,
                    notes: `Agendamento via WhatsApp (múltiplos)`
                  },
                  service: {
                    id: multiService?.id || null,
                    name: multiService?.name || blockData.service || 'Serviço',
                    price: multiService?.price || 0
                  },
                  professional: {
                    id: multiProfessional?.id || null,
                    name: multiProfessional?.name || blockData.professional || 'Profissional'
                  },
                  company: {
                    id: companyId,
                    name: multiCompany.fantasyName
                  }
                };

                const multiWebhookResponse = await fetch(multiCompany.n8nWebhookUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(multiWebhookPayload)
                });

                if (!multiWebhookResponse.ok) {
                  console.error(`⚠️ [Multi] N8N webhook error for appointment ${i + 1}:`, multiWebhookResponse.status);
                } else {
                  console.log(`✅ [Multi] N8N webhook sent for appointment ${i + 1} (ID: ${singleAppointmentId})`);
                }
              }
            } catch (multiWebhookError) {
              console.error(`⚠️ [Multi] Error sending webhook/broadcast for appointment ${i + 1}:`, multiWebhookError);
            }
          } else {
            console.log(`❌ Falha ao criar agendamento ${i + 1}`);
          }
        } else {
          console.log(`⚠️ Dados incompletos no bloco ${i + 1}:`, blockData);
          console.log(`   - clientName: ${blockData.clientName || 'FALTANDO'}`);
          console.log(`   - date: ${blockData.date || 'FALTANDO'}`);
          console.log(`   - time: ${blockData.time || 'FALTANDO'}`);
        }
      }

      if (createdAppointmentIds.length > 0) {
        console.log(`\n✅ TOTAL: ${createdAppointmentIds.length} agendamentos criados: [${createdAppointmentIds.join(', ')}]`);
        return createdAppointmentIds[0]; // Retorna o primeiro ID para compatibilidade
      } else {
        console.log('❌ Nenhum agendamento foi criado dos múltiplos blocos');
        return null;
      }
    }
    // ========================================

    // Extract data directly from the summary message
    const extractDataFromSummary = (summaryText: string) => {
      const data: any = {};

      // Extract service FIRST (needed for cleaning name later)
      const servicePatterns = [
        /💼\s*Serviço:\s*(.+?)(?:\n|$)/i,
        /Serviço:\s*(.+?)(?:\n|$)/i,
      ];
      for (const pattern of servicePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.service = match[1].trim();
          break;
        }
      }

      // Extract name
      const namePatterns = [
        /👤\s*Nome:\s*(.+?)(?:\n|$)/i,
        /Nome:\s*(.+?)(?:\n|$)/i,
      ];
      for (const pattern of namePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.clientName = match[1].trim();
          break;
        }
      }

      // Clean client name - remove service name if accidentally included
      // Example: "Gabriel Cabelo" when service is "Cabelo" should become "Gabriel"
      if (data.clientName && data.service) {
        const serviceWords = data.service.toLowerCase().split(/\s+/);
        const nameWords = data.clientName.split(/\s+/);

        // Filter out words that match service name (case insensitive)
        const cleanedNameWords = nameWords.filter((word: string) =>
          !serviceWords.some((serviceWord: string) =>
            word.toLowerCase() === serviceWord.toLowerCase()
          )
        );

        if (cleanedNameWords.length > 0 && cleanedNameWords.length < nameWords.length) {
          const originalName = data.clientName;
          data.clientName = cleanedNameWords.join(' ');
          console.log(`🧹 Nome limpo: "${originalName}" -> "${data.clientName}" (removido serviço "${data.service}")`);
        }
      }

      // Extract professional - múltiplos formatos possíveis
      const profPatterns = [
        /🏢\s*Profissional:\s*(.+?)(?:\n|$)/i,
        /Profissional:\s*(.+?)(?:\n|$)/i,
        /👨‍💼\s*Profissional:\s*(.+?)(?:\n|$)/i,
        /👨‍💼\s*:\s*(.+?)(?:\n|$)/i,
        /👨‍💼\s+(.+?)(?:\n|$)/i,
        /🏢\s+(.+?)(?:\n|$)/i,
        /com\s+(?:a\s+|o\s+)?([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)(?:\.|$|\n)/i, // "com Mariana", "com o Jack"
      ];
      for (const pattern of profPatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.professional = match[1].trim();
          console.log(`🔍 Profissional extraído do resumo: "${data.professional}" usando pattern: ${pattern}`);
          break;
        }
      }

      // Extract date - multiple formats supported
      const datePatterns = [
        // With emoji: 📅 Data: quinta-feira, 18/12/2025
        /📅\s*Data:\s*(?:[^,\d]+,\s*)?(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // Without emoji: Data: quinta-feira, 18/12/2025
        /Data:\s*(?:[^,\d]+,\s*)?(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // With emoji: 📅 Data: 18/12/2025
        /📅\s*Data:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // Without emoji: Data: 18/12/2025
        /Data:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // In text: dia 18/12/2025
        /dia\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // In text: para o dia 18/12/2025
        /para\s+o?\s*dia\s+(\d{1,2}\/\d{1,2}\/\d{4})/i,
        // Date anywhere in text: 18/12/2025
        /(\d{1,2}\/\d{1,2}\/\d{4})/,
      ];
      for (const pattern of datePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          // Normalize to DD/MM/YYYY format
          const dateParts = match[1].trim().split('/');
          if (dateParts.length === 3) {
            const day = dateParts[0].padStart(2, '0');
            const month = dateParts[1].padStart(2, '0');
            const year = dateParts[2];
            data.date = `${day}/${month}/${year}`;
            console.log(`📅 Data extraída: ${data.date} (pattern: ${pattern})`);
          }
          break;
        }
      }

      // Extract time
      const timePatterns = [
        /🕐\s*Horário:\s*(\d{1,2}:\d{2})/i,
        /Horário:\s*(\d{1,2}:\d{2})/i,
      ];
      for (const pattern of timePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.time = match[1].trim();
          break;
        }
      }

      // Fallback para horários TRUNCADOS: "12:" ou "12" (IA cortou os minutos)
      if (!data.time) {
        const truncatedMatch = summaryText.match(/🕐\s*Horário:\s*(\d{1,2}):\s*(?:\n|,|$)/im) ||
                               summaryText.match(/Horário:\s*(\d{1,2}):\s*(?:\n|,|$)/im) ||
                               summaryText.match(/🕐\s*Horário:\s*(\d{1,2})\s*(?:\n|,|$)/im) ||
                               summaryText.match(/Horário:\s*(\d{1,2})\s*(?:\n|,|$)/im);
        if (truncatedMatch) {
          const hour = truncatedMatch[1].padStart(2, '0');
          data.time = `${hour}:00`;
          console.log(`⚠️ Horário truncado detectado → normalizado para ${data.time}`);
        }
      }

      // Extract phone
      const phonePatterns = [
        /📱\s*Telefone:\s*(.+?)(?:\n|$)/i,
        /Telefone:\s*(.+?)(?:\n|$)/i,
      ];
      for (const pattern of phonePatterns) {
        const match = summaryText.match(pattern);
        if (match) {
          data.phone = match[1].trim();
          break;
        }
      }

      return data;
    };

    // First try to extract from the correct message (summary if confirmation, or aiResponse if not)
    let extractedFromSummary = extractDataFromSummary(messageToExtractFrom);

    // If date is missing, search in all assistant messages (the date might be in an earlier message)
    if (!extractedFromSummary.date) {
      console.log('📅 Data não encontrada na resposta atual, buscando em mensagens anteriores...');
      const assistantMessages = allMessages.filter(m => m.role === 'assistant').map(m => m.content);
      for (const msg of assistantMessages.reverse()) { // Start from most recent
        const tempData = extractDataFromSummary(msg);
        if (tempData.date) {
          extractedFromSummary.date = tempData.date;
          console.log(`📅 Data encontrada em mensagem anterior: ${tempData.date}`);
          break;
        }
      }
    }

    // Also try to find date from user messages (user might have typed "dia 18")
    if (!extractedFromSummary.date) {
      console.log('📅 Buscando data nas mensagens do usuário...');
      const userMessagesForDate = allMessages.filter(m => m.role === 'user').map(m => m.content);
      const allUserTextForDate = userMessagesForDate.join(' ');

      // Try to find date in user messages
      const userDatePatterns = [
        /dia\s+(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{4}))?/i,
        /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/,
      ];

      for (const pattern of userDatePatterns) {
        const match = allUserTextForDate.match(pattern);
        if (match) {
          const today = getBrazilDate(); // Use Brazil timezone
          const day = match[1].padStart(2, '0');
          const month = match[2] ? match[2].padStart(2, '0') : String(today.getMonth() + 1).padStart(2, '0');
          const year = match[3] || String(today.getFullYear());
          extractedFromSummary.date = `${day}/${month}/${year}`;
          console.log(`📅 Data encontrada na mensagem do usuário: ${extractedFromSummary.date}`);
          break;
        }
      }
    }

    console.log('📋 DADOS EXTRAÍDOS DO RESUMO - fields:', Object.keys(extractedFromSummary).join(', '));

    // CRÍTICO: Pegar apenas as últimas 12 mensagens do USUÁRIO para evitar contaminar com dados muito antigos
    // IMPORTANTE: allMessages vem DESC do banco (mais recente primeiro), então slice(0,12) pega as 12 mais recentes
    const recentMessages = allMessages
      .filter(m => m.role === 'user')  // Apenas mensagens do usuário
      .slice(0, 12);  // Pega as primeiras 12 do array (que são as 12 mais recentes)
    const userMessages = recentMessages.map(m => m.content);
    const allConversationText = userMessages.join(' ');

    console.log(`📊 Total de mensagens: ${allMessages.length}, usando últimas ${recentMessages.length} do USUÁRIO (máx 12)`);

    // 🎯 FUNÇÃO AUXILIAR: Procura item nas mensagens (MAIS RECENTE → MAIS ANTIGA)
    // Garante 100% de acurácia pegando sempre o dado do agendamento atual
    const findInRecentMessages = (items: any[], getName: (item: any) => string): any | null => {
      // Helper to normalize strings for comparison
      const normalizeForSearch = (str: string) => {
        return str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .replace(/\s+/g, ' ')
          .trim();
      };

      // Processa mensagens da MAIS RECENTE (índice 0) para a MAIS ANTIGA
      for (const message of userMessages) {
        const normalizedMessage = normalizeForSearch(message);
        for (const item of items) {
          const normalizedItemName = normalizeForSearch(getName(item));
          if (normalizedMessage.includes(normalizedItemName)) {
            return item; // Retorna PRIMEIRA ocorrência (que é a mais recente)
          }
        }
      }
      return null;
    };

    // Check if user has explicitly confirmed with SIM/OK - but be more lenient
    // since we're already in the confirmation flow
    const hasExplicitConfirmation = /\b(sim|ok|confirmo|confirma|s|yes)\b/i.test(allConversationText);
    console.log('🔍 Verificando confirmação do usuário:', {
      allConversationText: allConversationText.substring(0, 200) + '...',
      hasExplicitConfirmation: hasExplicitConfirmation
    });

    // Comment out the strict check for now since we know user confirmed
    // if (!hasExplicitConfirmation) {
    //   console.log('❌ User has not explicitly confirmed with SIM/OK. Not creating appointment.');
    //   console.log('💬 Texto completo da conversa:', allConversationText);
    //   return;
    // }
    console.log('✅ Prosseguindo com criação do agendamento (confirmação implícita)');
    
    console.log('📚 User conversation text:', allConversationText);
    
    // Enhanced patterns for better extraction from AI response and conversation
    const patterns = {
      clientName: /\b([A-Z][a-zA-ZÀ-ÿ]+\s+[A-Z][a-zA-ZÀ-ÿ]+)\b/g, // Matches "João Silva" pattern
      time: /(?:às|as)\s+(\d{1,2}:?\d{0,2})/i,
      day: /(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i
    };
    
    // Extract client name - prioritize summary extraction
    let extractedName: string | null = extractedFromSummary.clientName || null;

    if (!extractedName) {
      // Fallback: try to extract name from AI response
      // Priority patterns - AI confirmation of name
      let aiNameMatch = aiResponse.match(/(?:Ok|Ótimo|Perfeito|Excelente),\s+([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+(?:\s+[A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)*)(?:\.|!|,)/);

      if (!aiNameMatch) {
        // Try "Nome:" pattern
        aiNameMatch = aiResponse.match(/(?:👤\s*)?Nome:\s*([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+(?:\s+[A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)*)/);
      }

      if (!aiNameMatch) {
        // Try greeting patterns
        aiNameMatch = aiResponse.match(/(?:Ótimo|Perfeito|Excelente),\s+([A-ZÀÁÉÍÓÚ][a-záéíóúâêôã]+)/);
      }

      if (aiNameMatch) {
        extractedName = aiNameMatch[1].trim();
        console.log(`📝 Nome encontrado na resposta da IA: "${extractedName}"`);
      }
    } else {
      console.log(`📝 Usando nome do resumo: "${extractedName}"`);
    }
    
    // If no name in AI response, try to extract from user messages
    if (!extractedName) {
      // Lista de palavras que NÃO devem ser consideradas nomes
      // IMPORTANTE: Não incluir serviços específicos aqui, pois cada empresa tem seus próprios serviços
      // Mantemos apenas uma versão (com acento) pois a normalização remove acentos automaticamente
      const invalidNames = [
        // Confirmações e saudações
        'sim', 'ok', 'não', 'claro', 'perfeito', 'ótimo',
        'excelente', 'certo', 'beleza', 'legal', 'show', 'confirmo', 'confirmar',
        'obrigado', 'obrigada', 'valeu', 'tchau', 'oi', 'olá', 'bom', 'dia', 'tarde', 'noite',
        // Palavras do sistema e comuns
        'whatsapp', 'profissional', 'serviço', 'agendar', 'agendamento',
        'atendimento', 'com', 'para', 'por', 'mais', 'menos', 'tem', 'qual', 'quais',
        'pode', 'ser', 'esta', 'está', 'esse', 'essa', 'aqui', 'ali', 'que', 'quero',
        'fazer', 'gostaria', 'preciso', 'queria', 'quer', 'vou', 'vai',
        // Dias da semana
        'hoje', 'amanhã', 'ontem',
        'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'
      ];

      // Normaliza palavras inválidas uma vez (para performance)
      const normalizeForComparison = (str: string) => {
        return str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove accents
          .trim();
      };

      const normalizedInvalidNames = invalidNames.map(normalizeForComparison);

      // Analyze user messages to find name
      for (const message of userMessages) {
        // Priority 1: Explicit name context - captura nomes completos (até 5 palavras)
        const explicitPatterns = [
          /(?:nome|chamo|cliente)\s*:?\s*([A-ZÀÁÉÍÓÚ][a-záéíóúâêôãç]+(?:\s+(?:dos|das|de|do|da|e)?\s*[A-ZÀÁÉÍÓÚa-záéíóúâêôãç]+){0,4})/i,
          /(?:me chamo|sou o|sou a|nome é|eu sou|meu nome)\s+([A-ZÀÁÉÍÓÚ][a-záéíóúâêôãç]+(?:\s+(?:dos|das|de|do|da|e)?\s*[A-ZÀÁÉÍÓÚa-záéíóúâêôãç]+){0,4})/i,
        ];

        for (const pattern of explicitPatterns) {
          const match = message.match(pattern);
          if (match && match[1]) {
            const name = match[1].trim();
            const words = name.split(/\s+/);

            // Verifica se não é apenas palavras inválidas (com normalização)
            const hasValidWord = words.some(word => {
              const normalizedWord = normalizeForComparison(word);
              return !normalizedInvalidNames.includes(normalizedWord) && word.length >= 3;
            });

            if (hasValidWord) {
              extractedName = name;
              console.log(`📝 ✅ Nome encontrado em contexto explícito: "${extractedName}"`);
              break;
            }
          }
        }

        if (extractedName) break;

        // Priority 2: Nome completo digitado sozinho (captura até 60 caracteres e até 5 palavras)
        const trimmedMsg = message.trim();
        if (trimmedMsg.length >= 3 && trimmedMsg.length <= 60) {
          // Captura nomes completos incluindo preposições
          const fullNameMatch = trimmedMsg.match(/^([A-ZÀÁÉÍÓÚ][a-záéíóúâêôãç]+(?:\s+(?:dos|das|de|do|da|e)?\s*[A-ZÀÁÉÍÓÚa-záéíóúâêôãç]+){0,4})$/);
          if (fullNameMatch) {
            const name = fullNameMatch[1].trim();
            const words = name.split(/\s+/);

            // Verifica se não é apenas palavras inválidas (com normalização)
            const hasValidWord = words.some(word => {
              const normalizedWord = normalizeForComparison(word);
              return !normalizedInvalidNames.includes(normalizedWord) && word.length >= 3;
            });

            if (hasValidWord) {
              extractedName = name;
              console.log(`📝 ✅ Nome completo digitado: "${extractedName}"`);
              break;
            }
          }
        }
      }

      if (!extractedName) {
        console.log(`📝 ❌ Nenhum nome válido encontrado na conversa`);
      }
    }

    // Fallback: Use pushName from WhatsApp if no name was extracted from conversation
    if (!extractedName && contactName && contactName.trim().length > 0) {
      extractedName = contactName.trim();
      console.log(`📝 ✅ Usando pushName do WhatsApp como fallback: "${extractedName}"`);
    }
    
    // Enhanced time extraction - prioritize summary extraction
    let extractedTime: string | null = extractedFromSummary.time || null;

    if (!extractedTime) {
      // Try multiple time patterns in order of specificity
      const timePatterns = [
        // AI response patterns
        /Horário:\s*(\d{1,2}:\d{2})/i,           // "Horário: 09:00"
        /(?:às|as)\s+(\d{1,2}:\d{2})/i,          // "às 09:00"
        /(\d{1,2}:\d{2})/g,                      // Any "09:00" format
        // Conversation patterns
        /(?:às|as)\s+(\d{1,2})/i,                // "às 9"
        /(\d{1,2})h/i,                           // "9h"
        /(\d{1,2})(?=\s|$)/                      // Single digit followed by space or end
      ];

      // Check AI response first (more reliable), then conversation
      const searchTexts = [aiResponse, allConversationText];
    
    for (const text of searchTexts) {
      for (const pattern of timePatterns) {
        const matches = text.match(pattern);
        if (matches) {
          let timeCandidate = matches[1];
          
          // Validate time format
          if (timeCandidate && timeCandidate.includes(':')) {
            // Already in HH:MM format
            const [hour, minute] = timeCandidate.split(':');
            const h = parseInt(hour);
            const m = parseInt(minute);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
              extractedTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
              console.log(`🕐 Extracted time from ${text === aiResponse ? 'AI response' : 'conversation'}: "${extractedTime}"`);
              break;
            }
          } else if (timeCandidate) {
            // Hour only, add :00
            const hour = parseInt(timeCandidate);
            if (hour >= 0 && hour <= 23) {
              extractedTime = `${hour.toString().padStart(2, '0')}:00`;
              console.log(`🕐 Extracted hour from ${text === aiResponse ? 'AI response' : 'conversation'}: "${extractedTime}"`);
              break;
            }
          }
        }
      }
      if (extractedTime) break;
    }
    } else {
      console.log(`🕐 Usando horário do resumo: "${extractedTime}"`);
    }
    
    // Get recent user messages for better context
    const conversationMessages = await storage.getMessagesByConversation(conversationId);
    const recentUserMessages = conversationMessages
      .filter(m => m.role === 'user')
      .slice(0, 8) // First 8 user messages (most recent, query is DESC)
      .map(m => m.content)
      .join(' ');
    
    console.log(`🔍 Analisando mensagens recentes: ${recentUserMessages}`);
    
    // Priority extraction - use summary data first, then patterns
    let extractedDay = extractedFromSummary.date ? null : aiResponse.match(patterns.day)?.[1]; // We'll handle date conversion separately
    let extractedProfessional = extractedFromSummary.professional || null;
    let extractedService = extractedFromSummary.service || null;

    // Check for "hoje" and "amanhã" in recent messages with higher priority
    const todayPattern = /\bhoje\b/i;
    const tomorrowPattern = /\bamanhã\b/i;

    if (todayPattern.test(recentUserMessages)) {
      extractedDay = "hoje";
      console.log(`📅 Detectado "hoje" nas mensagens recentes`);
    } else if (tomorrowPattern.test(recentUserMessages)) {
      extractedDay = "amanhã";
      console.log(`📅 Detectado "amanhã" nas mensagens recentes`);
    } else if (!extractedDay) {
      // Only fallback to all conversation if nothing found in recent messages
      extractedDay = recentUserMessages.match(patterns.day)?.[1] || allConversationText.match(patterns.day)?.[1];
    }
    
    // If no name found, check existing clients by phone
    if (!extractedName) {
      const clients = await storage.getClientsByCompany(companyId);
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      const existingClient = clients.find(c => 
        c.phone && c.phone.replace(/\D/g, '') === normalizedPhone
      );
      extractedName = existingClient?.name || null;
    }
    
    console.log('📋 Extracted from AI response and conversation:', {
      clientName: extractedName,
      time: extractedTime,
      day: extractedDay,
      professional: extractedProfessional,
      service: extractedService
    });

    // Validate required data before proceeding
    if (!extractedTime || extractedTime === 'undefined:00') {
      console.log('❌ Invalid time extracted, cannot create appointment');
      return;
    }
    
    // Get professionals and services to match extracted data
    const professionals = await storage.getProfessionalsByCompany(companyId);
    const services = await storage.getServicesByCompany(companyId);

    console.log('🔍 Buscando profissional e serviço...');
    console.log('📋 Professionals disponíveis:', professionals.map(p => p.name).join(', '));
    console.log('📋 Services disponíveis:', services.map(s => s.name).join(', '));
    console.log('🔍 Buscando por professional:', extractedProfessional);
    console.log('🔍 Buscando por service:', extractedService);

    // Find matching professional - PRIORIDADE: buscar primeiro na resposta da IA
    let professional = null;

    console.log('🔍 Buscando profissional - PRIORIDADE 1: Resposta da IA');
    // Helper function to normalize strings for comparison
    const normalizeString = (str: string) => {
      return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();
    };

    // PRIORIDADE 1: Buscar na resposta da IA (mensagem de confirmação)
    for (const prof of professionals) {
      const normalizedProfName = normalizeString(prof.name);
      const normalizedAiResponse = normalizeString(aiResponse);

      if (normalizedAiResponse.includes(normalizedProfName)) {
        professional = prof;
        console.log(`✅ Profissional encontrado na resposta da IA: ${prof.name}`);
        break;
      }
    }

    // PRIORIDADE 2: Se não encontrou na IA, tentar com dados do resumo
    if (!professional && extractedProfessional) {
      console.log('🔍 Buscando profissional - PRIORIDADE 2: Dados extraídos do resumo');
      const normalizedSearch = normalizeString(extractedProfessional);

      professional = professionals.find(p => {
        const normalizedProfName = normalizeString(p.name);
        console.log(`  Comparando "${normalizedSearch}" com "${normalizedProfName}"`);
        return normalizedProfName === normalizedSearch;
      });

      if (!professional) {
        // Try partial match with normalization
        professional = professionals.find(p => {
          const normalizedProfName = normalizeString(p.name);
          return normalizedProfName.includes(normalizedSearch) ||
                 normalizedSearch.includes(normalizedProfName);
        });
      }

      if (professional) {
        console.log(`✅ Profissional encontrado com dados do resumo: ${professional.name}`);
      } else {
        console.log(`⚠️ Profissional "${extractedProfessional}" extraído do resumo mas não encontrado no banco de dados`);
        console.log(`📋 Profissionais disponíveis: ${professionals.map(p => p.name).join(', ')}`);
      }
    }

    // PRIORIDADE 3: Buscar nas mensagens RECENTES do usuário (últimas 8 mensagens)
    if (!professional) {
      console.log('🔍 Buscando profissional - PRIORIDADE 3: Mensagens recentes do usuário');
      const normalizedRecent = normalizeString(recentUserMessages);

      for (const prof of professionals) {
        const normalizedProfName = normalizeString(prof.name);
        if (normalizedRecent.includes(normalizedProfName)) {
          professional = prof;
          console.log(`✅ Profissional encontrado nas mensagens recentes: ${prof.name}`);
          break;
        }
      }
    }

    // Find matching service - PRIORIDADE: buscar primeiro na resposta da IA
    let service = null;

    console.log('🔍 Buscando serviço - PRIORIDADE 1: Resposta da IA');
    // PRIORIDADE 1: Buscar na resposta da IA (mensagem de confirmação)
    for (const serv of services) {
      const normalizedServiceName = normalizeString(serv.name);
      const normalizedAiResponse = normalizeString(aiResponse);

      if (normalizedAiResponse.includes(normalizedServiceName)) {
        service = serv;
        console.log(`✅ Serviço encontrado na resposta da IA: ${serv.name}`);
        break;
      }
    }

    // PRIORIDADE 2: Se não encontrou na IA, tentar com dados do resumo
    if (!service && extractedService) {
      console.log('🔍 Buscando serviço - PRIORIDADE 2: Dados extraídos do resumo');
      const normalizedSearch = normalizeString(extractedService);

      service = services.find(s => {
        const normalizedServiceName = normalizeString(s.name);
        console.log(`  Comparando "${normalizedSearch}" com "${normalizedServiceName}"`);
        return normalizedServiceName === normalizedSearch;
      });

      if (!service) {
        // Try partial match with normalization
        service = services.find(s => {
          const normalizedServiceName = normalizeString(s.name);
          return normalizedServiceName.includes(normalizedSearch) ||
                 normalizedSearch.includes(normalizedServiceName);
        });
      }

      if (service) {
        console.log(`✅ Serviço encontrado com dados do resumo: ${service.name}`);
      } else {
        console.log(`⚠️ Serviço "${extractedService}" extraído do resumo mas não encontrado no banco de dados`);
        console.log(`📋 Serviços disponíveis: ${services.map(s => s.name).join(', ')}`);
      }
    }

    // PRIORIDADE 3: Buscar nas mensagens RECENTES do usuário (últimas 8 mensagens)
    if (!service) {
      console.log('🔍 Buscando serviço - PRIORIDADE 3: Mensagens recentes do usuário');
      const normalizedRecent = normalizeString(recentUserMessages);

      for (const serv of services) {
        const normalizedServiceName = normalizeString(serv.name);
        if (normalizedRecent.includes(normalizedServiceName)) {
          service = serv;
          console.log(`✅ Serviço encontrado nas mensagens recentes: ${serv.name}`);
          break;
        }
      }
    }

    console.log('==================================================');
    console.log('🔍 VALIDAÇÃO CRÍTICA - Verificando dados extraídos');
    console.log('==================================================');
    console.log('Professional:', professional ? `✅ ${professional.name} (ID: ${professional.id})` : '❌ MISSING');
    console.log('Service:', service ? `✅ ${service.name} (ID: ${service.id})` : '❌ MISSING');
    console.log('Time:', extractedTime ? `✅ ${extractedTime}` : '❌ MISSING');
    console.log('Name:', extractedName ? `✅ ${extractedName}` : '❌ MISSING');
    console.log('Day:', extractedDay || '❌ MISSING');
    console.log('Summary Data fields:', Object.keys(extractedFromSummary).join(', '));
    console.log('==================================================');

    if (!professional || !service || !extractedTime) {
      console.log('❌❌❌ ERRO CRÍTICO: Dados insuficientes para criar agendamento');
      console.log('Missing:', {
        professional: !professional ? '❌ MISSING' : `✅ ID: ${professional.id}`,
        service: !service ? '❌ MISSING' : `✅ ID: ${service.id}`,
        time: !extractedTime ? '❌ MISSING' : `✅ ${extractedTime}`
      });
      console.log('📋 Available professionals count:', professionals.length);
      console.log('📋 Available services:', services.map(s => `${s.name} (ID: ${s.id})`).join(', '));
      console.log('❌ ABORTANDO criação de agendamento');

      // Generic error message
      const errorMessage = `Erro ❌

Houve uma falha inesperada no sistema e não foi possível concluir seu agendamento.
Pedimos desculpas pelo transtorno. Aguarde alguns instantes e tente novamente.`;

      console.log('📤 Enviando mensagem de erro ao usuário:', errorMessage);

      // Send error message to user via WhatsApp
      try {
        // Get company WhatsApp instance
        const instances = await storage.getWhatsappInstancesByCompany(companyId);
        const activeInstance = instances.find(i => i.status === 'connected');

        if (activeInstance) {
          // Get global settings for UAZAPI
          const globalSettings = await storage.getGlobalSettings();

          if (globalSettings?.uazapiUrl && globalSettings?.uazapiAdminToken) {
            let formattedPhone = phoneNumber.replace(/\D/g, '');
            if (!formattedPhone.startsWith('55') && formattedPhone.length >= 10) {
              formattedPhone = '55' + formattedPhone;
            }

            await uazapiSendTyping(activeInstance.instanceName, formattedPhone, 2000);
            await new Promise(resolve => setTimeout(resolve, 2000));

            const response = await uazapiSendText(activeInstance.instanceName, formattedPhone, errorMessage);

            if (response.ok) {
              console.log('✅ Mensagem de erro enviada com sucesso');
              await storage.createMessage({
                conversationId: conversationId,
                content: errorMessage,
                role: 'assistant',
                messageType: 'text',
                delivered: true,
                timestamp: new Date(),
              });
            } else {
              console.error('❌ Falha ao enviar mensagem de erro');
            }
          } else {
            console.error('❌ Configurações globais da UAZAPI não encontradas');
          }
        } else {
          console.error('❌ Nenhuma instância do WhatsApp conectada encontrada para esta empresa');
        }
      } catch (error) {
        console.error('❌ Erro ao enviar mensagem de erro:', error);
      }

      return;
    }
    
    // Calculate appointment date using the EXACT same logic from system prompt
    const today = getBrazilDate(); // Use Brazil timezone
    const dayMap = { 'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6 };
    let appointmentDate = getBrazilDate();

    // If we have a date from summary (DD/MM/YYYY format), use it
    if (extractedFromSummary.date) {
      const [day, month, year] = extractedFromSummary.date.split('/').map(Number);
      // Create date at noon (12:00) to avoid timezone conversion issues
      // When converting to UTC, 12:00 Brazil (UTC-3) = 15:00 UTC (same day)
      appointmentDate = new Date(year, month - 1, day, 12, 0, 0);
      console.log(`📅 Usando data do resumo: ${appointmentDate.toLocaleDateString('pt-BR')}`);
    }
    // Handle special cases first
    else if (extractedDay?.toLowerCase() === "hoje") {
      appointmentDate = new Date(today);
      appointmentDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues
      console.log(`📅 Agendamento para HOJE: ${appointmentDate.toLocaleDateString('pt-BR')}`);
    } else if (extractedDay?.toLowerCase() === "amanhã") {
      appointmentDate = new Date(today);
      appointmentDate.setDate(today.getDate() + 1);
      appointmentDate.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues
      console.log(`📅 Agendamento para AMANHÃ: ${appointmentDate.toLocaleDateString('pt-BR')}`);
    } else {
      // Handle regular day names
      const targetDay = dayMap[extractedDay?.toLowerCase() as keyof typeof dayMap];
      
      if (targetDay !== undefined) {
        const currentDay = today.getDay();
        let daysUntilTarget = targetDay - currentDay;
        
        // If it's the same day but later time, keep today
        // Otherwise, get next week's occurrence if day has passed
        if (daysUntilTarget < 0) {
          daysUntilTarget += 7;
        } else if (daysUntilTarget === 0) {
          // Same day - check if it's still possible today or next week
          // For now, assume same day means today
          daysUntilTarget = 0;
        }
        
        // Set the correct date
        appointmentDate.setDate(today.getDate() + daysUntilTarget);
        appointmentDate.setHours(0, 0, 0, 0); // Reset time to start of day
        
        console.log(`📅 Cálculo de data: Hoje é ${today.toLocaleDateString('pt-BR')} (${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][currentDay]})`);
        console.log(`📅 Dia alvo: ${extractedDay} (${targetDay}), Dias até o alvo: ${daysUntilTarget}`);
        console.log(`📅 Data calculada do agendamento: ${appointmentDate.toLocaleDateString('pt-BR')}`);
      }
    }
    
    // Format time
    const formattedTime = extractedTime.includes(':') ? extractedTime : `${extractedTime}:00`;
    
    // Find or create client
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const existingClients = await storage.getClientsByCompany(companyId);
    
    console.log(`🔍 Looking for existing client with phone: ${normalizedPhone}`);
    console.log(`📋 Existing clients:`, existingClients.map(c => ({ name: c.name, phone: c.phone })));
    
    // Try to find existing client by phone or name
    let client = existingClients.find(c => 
      (c.phone && c.phone.replace(/\D/g, '') === normalizedPhone) ||
      (c.name && extractedName && c.name.toLowerCase() === extractedName.toLowerCase())
    );
    
    if (!client) {
      // Use proper Brazilian phone formatting from phone-utils
      console.log(`📞 Processing phone: ${phoneNumber}`);
      const normalizedPhone = normalizePhone(phoneNumber);
      console.log(`📞 Normalized: ${normalizedPhone}`);
      const formattedPhone = formatBrazilianPhone(normalizedPhone);
      console.log(`📞 Formatted: ${formattedPhone}`);
      
      if (!formattedPhone) {
        console.log(`❌ Invalid phone number format: ${phoneNumber}`);
        throw new Error('Formato de telefone inválido');
      }
      
      // Usar contactName (pushName) como fallback se não tiver nome extraído
      const clientName = extractedName || contactName || `Cliente ${formattedPhone}`;
      console.log(`🆕 Creating new client: ${clientName} with phone ${formattedPhone}`);
      
      client = await storage.createClient({
        companyId,
        name: clientName,
        phone: formattedPhone,
        email: null,
        notes: null,
        birthDate: null
      });
    } else {
      console.log(`✅ Found existing client: ${client.name} (ID: ${client.id})`);
      // Se não temos nome extraído, usar o nome do cliente existente
      if (!extractedName && client.name) {
        extractedName = client.name;
        console.log(`📝 Usando nome do cliente existente: "${extractedName}"`);
      }
    }

    // Fallback final: usar contactName (pushName) da UAZAPI
    if (!extractedName && contactName) {
      extractedName = contactName;
      console.log(`📝 Usando contactName (pushName) da UAZAPI: "${extractedName}"`);
    }

    // Format date for conflict check without timezone conversion
    const conflictCheckDate = `${appointmentDate.getFullYear()}-${String(appointmentDate.getMonth() + 1).padStart(2, '0')}-${String(appointmentDate.getDate()).padStart(2, '0')}`;

    // Check for appointment conflicts before creating
    console.log(`🔍 Checking for appointment conflicts: ${professional.name} on ${formatDateLocal(appointmentDate)} at ${formattedTime}`);

    try {
      // Parse the requested time to minutes for overlap calculation
      const [requestedHour, requestedMin] = formattedTime.split(':').map(Number);
      const requestedTimeInMinutes = requestedHour * 60 + requestedMin;
      const serviceDuration = service.duration || 30; // Default 30 minutes if not specified
      const requestedEndTimeInMinutes = requestedTimeInMinutes + serviceDuration;
      
      console.log(`📊 Novo agendamento: ${formattedTime} (${requestedTimeInMinutes}min) - Duração: ${serviceDuration}min - Fim: ${Math.floor(requestedEndTimeInMinutes/60)}:${String(requestedEndTimeInMinutes%60).padStart(2,'0')}`);
      
      // Get all appointments for this professional on this date (not just exact time match)
      const [existingRows] = await pool.execute(
        `SELECT id, client_name, client_phone, appointment_time, duration
         FROM appointments
         WHERE company_id = ?
           AND professional_id = ?
           AND appointment_date = ?
           AND status != 'Cancelado'`,
        [companyId, professional.id, formatDateLocal(appointmentDate)]
      ) as any;
      
      let hasConflict = false;
      let conflictingAppointment = null;
      
      for (const existing of existingRows) {
        const [existingHour, existingMin] = existing.appointment_time.split(':').map(Number);
        const existingTimeInMinutes = existingHour * 60 + existingMin;
        const existingDuration = existing.duration || 30;
        const existingEndTimeInMinutes = existingTimeInMinutes + existingDuration;
        
        console.log(`📋 Agendamento existente: ${existing.appointment_time} (${existingTimeInMinutes}min) - Duração: ${existingDuration}min - Fim: ${Math.floor(existingEndTimeInMinutes/60)}:${String(existingEndTimeInMinutes%60).padStart(2,'0')}`);
        
        // Check for time overlap: new appointment overlaps if it starts before existing ends AND ends after existing starts
        const hasOverlap = (
          (requestedTimeInMinutes < existingEndTimeInMinutes) && 
          (requestedEndTimeInMinutes > existingTimeInMinutes)
        );
        
        if (hasOverlap) {
          console.log(`⚠️ Conflito de horário detectado: ${existing.client_name} (${existing.appointment_time}-${Math.floor(existingEndTimeInMinutes/60)}:${String(existingEndTimeInMinutes%60).padStart(2,'0')}) vs novo (${formattedTime}-${Math.floor(requestedEndTimeInMinutes/60)}:${String(requestedEndTimeInMinutes%60).padStart(2,'0')})`);

          // Sempre bloquear em caso de sobreposição, independente de ser o mesmo cliente
          // Cliente pode estar agendando para amigo usando mesmo telefone
          hasConflict = true;
          conflictingAppointment = existing;
          break;
        }
      }

      if (hasConflict && conflictingAppointment) {
        const conflictEndTime = conflictingAppointment.appointment_time.split(':').map(Number);
        const conflictEndMinutes = (conflictEndTime[0] * 60 + conflictEndTime[1]) + (conflictingAppointment.duration || 30);
        const conflictEndFormatted = `${Math.floor(conflictEndMinutes/60)}:${String(conflictEndMinutes%60).padStart(2,'0')}`;

        console.log(`❌ Conflito de horário detectado! Cliente ${conflictingAppointment.client_name} já possui agendamento das ${conflictingAppointment.appointment_time} às ${conflictEndFormatted}`);
        console.log(`❌ Agendamento NÃO será criado devido ao conflito de horário`);

        // Return null to indicate appointment was NOT created due to conflict
        return null;
      }

      console.log(`✅ Nenhum conflito encontrado. Criando agendamento para ${extractedName}`);
    } catch (dbError) {
      console.error('❌ Error checking appointment conflicts:', dbError);
      // Continue with appointment creation if conflict check fails
    }

    // Create or get existing client before creating appointment
    try {
      console.log('👤 Criando/verificando cliente:', { name: extractedName, phone: phoneNumber, companyId });
      const client = await storage.createClient({
        companyId,
        name: extractedName,
        phone: phoneNumber,
        email: null,
        birthDate: null,
        notes: 'Cliente criado automaticamente via WhatsApp'
      });
      console.log('✅ Cliente criado/encontrado:', client.id, client.name);
    } catch (clientError) {
      console.error('⚠️ Erro ao criar cliente (continuando com agendamento):', clientError);
      // Continue with appointment creation even if client creation fails
    }

    // Create appointment with initial status
    const appointment = await storage.createAppointment({
      companyId,
      professionalId: professional.id,
      serviceId: service.id,
      clientName: extractedName,
      clientPhone: phoneNumber,
      clientEmail: null,
      appointmentDate: formatDateLocal(appointmentDate),
      appointmentTime: formattedTime,
      duration: service.duration || 30,
      totalPrice: service.price || 0,
      status: initialStatus === 'payment_pending' ? 'Aguardando Pagamento' : 'Pendente',
      notes: `Agendamento confirmado via WhatsApp - Conversa ID: ${conversationId}`,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log('🎉🎉🎉 AGENDAMENTO CRIADO COM SUCESSO! 🎉🎉🎉');
    console.log(`✅ Appointment created from AI confirmation: ${extractedName} - ${service.name} - ${appointmentDate.toLocaleDateString()} ${formattedTime}`);

    // Limpar cache de disponibilidade para esta empresa
    clearAvailabilityCache(companyId);

    console.log('📊 Detalhes do agendamento:', {
      id: appointment?.id,
      clientName: extractedName,
      professional: professional.name,
      service: service.name,
      date: appointmentDate.toLocaleDateString('pt-BR'),
      time: formattedTime
    });

    // Force immediate refresh of appointments list
    console.log('📡 Broadcasting new appointment notification...');

    // Broadcast notification with complete appointment data
    // Format date without timezone conversion to avoid losing a day
    const year = appointmentDate.getFullYear();
    const month = String(appointmentDate.getMonth() + 1).padStart(2, '0');
    const day = String(appointmentDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;

    const appointmentNotification = {
      type: 'new_appointment',
      appointment: {
        id: appointment?.id || Date.now(),
        clientName: extractedName,
        serviceName: service.name,
        professionalName: professional?.name || 'Profissional',
        appointmentDate: formatDateLocal(appointmentDate),
        appointmentTime: formattedTime,
        professionalId: professional.id,
        serviceId: service.id,
        status: 'Pendente'
      }
    };

    try {
      broadcastEvent(appointmentNotification, companyId);
      console.log('✅ Broadcast notification sent for appointment type:', appointmentNotification?.type, 'companyId:', companyId);
    } catch (broadcastError) {
      console.error('⚠️ Broadcast error:', broadcastError);
    }

    // 🚫 Cancelar follow-up de inatividade — cliente já agendou, não precisa ser cobrado
    const suppressKey = `${companyId}:${phoneNumber}`;
    if (conversationFollowUpTimers.has(suppressKey)) {
      const pendingFollowUp = conversationFollowUpTimers.get(suppressKey)!;
      clearTimeout(pendingFollowUp.timer);
      conversationFollowUpTimers.delete(suppressKey);
      console.log(`🚫 [FOLLOW-UP] Timer de follow-up CANCELADO para ${suppressKey} (agendamento criado)`);
    }

    // 🔔 Send to n8n webhook if configured and enabled
    try {
      const company = await storage.getCompanyById(companyId);

      if (company?.n8nWebhookEnabled && company?.n8nWebhookUrl) {
        const webhookPayload = {
          event: 'appointment.created',
          timestamp: new Date().toISOString(),
          createdBy: 'whatsapp_ai',
          conversationId: conversationId,
          appointment: {
            id: appointment.id,
            clientName: extractedName,
            clientPhone: phoneNumber,
            clientEmail: null,
            appointmentDate: formatDateLocal(appointmentDate),
            appointmentTime: formattedTime,
            status: appointment.status,
            duration: service.duration || 30,
            totalPrice: service.price || 0,
            notes: appointment.notes
          },
          service: {
            id: service.id,
            name: service.name,
            price: service.price
          },
          professional: {
            id: professional?.id,
            name: professional?.name
          },
          company: {
            id: companyId,
            name: company.fantasyName
          }
        };

        // Set DEBUG_N8N_WEBHOOK=true in .env to see detailed logs
        if (process.env.DEBUG_N8N_WEBHOOK === 'true') {
          console.log('🔍 [AI/WHATSAPP] Sending to n8n webhook');
          console.log('📦 [AI/WHATSAPP] Payload keys:', Object.keys(webhookPayload).join(', '));
        }

        const response = await fetch(company.n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload)
        });

        if (!response.ok) {
          console.error('⚠️ N8N webhook error:', response.status, response.statusText);
        } else if (process.env.DEBUG_N8N_WEBHOOK === 'true') {
          console.log('✅ [AI/WHATSAPP] N8N webhook sent successfully');
        }
      }
    } catch (webhookError) {
      console.error('⚠️ Error processing n8n webhook:', webhookError);
    }

    // Return the appointment ID after broadcasting
    return appointment.id;

  } catch (error) {
    console.error('❌ Error creating appointment from AI confirmation:', error);

    // Enviar webhook de erro geral
    try {
      await sendAppointmentErrorWebhook(companyId, 'DATABASE_ERROR', `Erro ao criar agendamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, {
        conversationId,
        phoneNumber,
        additionalInfo: `Stack: ${error instanceof Error ? error.stack : 'N/A'}`
      });
    } catch (webhookErr) {
      console.error('⚠️ Falha ao enviar webhook de erro:', webhookErr);
    }

    return null;
  }
}

async function createAppointmentFromConversation(conversationId: number, companyId: number) {
  try {
    console.log('📅 Checking conversation for complete appointment confirmation:', conversationId);
    
    // Check if appointment already exists for this conversation within the last 5 minutes (only to prevent duplicates)
    const existingAppointments = await storage.getAppointmentsByCompany(companyId);
    console.log(`🔍 DEBUG: Found ${existingAppointments.length} total appointments for company ${companyId}`);

    // Filter appointments that mention this conversation
    const conversationAppointments = existingAppointments.filter(apt =>
      apt.notes && apt.notes.includes(`Conversa ID: ${conversationId}`)
    );
    console.log(`🔍 DEBUG: Found ${conversationAppointments.length} appointments mentioning Conversa ID: ${conversationId}`);

    // Log all conversation-related appointments for debugging
    conversationAppointments.forEach((apt, index) => {
      const createdTime = apt.createdAt ? new Date(apt.createdAt).getTime() : 0;
      const timeDiff = Date.now() - createdTime;
      const minutesAgo = Math.floor(timeDiff / (1000 * 60));
      console.log(`🔍 DEBUG: Appointment ${index + 1}:`, {
        id: apt.id,
        status: apt.status,
        clientName: apt.clientName,
        createdAt: apt.createdAt,
        minutesAgo: minutesAgo,
        notes: apt.notes?.substring(0, 100) + '...'
      });
    });

    // Check for recent appointments (within 5 minutes) but only if they are active/pending
    // We'll do a more detailed check after extracting the appointment data
    const recentActiveAppointments = conversationAppointments.filter(apt =>
      apt.createdAt &&
      new Date(apt.createdAt).getTime() > (Date.now() - 5 * 60 * 1000) &&
      apt.status &&
      !['Cancelado', 'Rejeitado', 'Excluído'].includes(apt.status)
    );

    if (recentActiveAppointments.length > 0) {
      console.log(`ℹ️ Found ${recentActiveAppointments.length} recent ACTIVE appointments for this conversation (within 5 min)`);
      console.log('📋 Will check if new appointment data differs from existing ones after extraction');
    } else {
      console.log('✅ No recent active appointments found for this conversation, proceeding with creation');
    }
    
    // Get conversation and messages
    const allConversations = await storage.getConversationsByCompany(companyId);
    const conversation = allConversations.find(conv => conv.id === conversationId);
    if (!conversation) {
      console.log('⚠️ Conversa não encontrada:', conversationId);
      return;
    }
    
    const messages = await storage.getMessagesByConversation(conversationId);
    const conversationText = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // REGRA CRÍTICA: Só criar agendamento se houver confirmação explícita final
    const finalConfirmationPhrases = [
      'sim',
      'ok', 
      'confirmo',
      'sim, confirmo',
      'sim, está correto',
      'sim, pode agendar',
      'ok, confirmo',
      'ok, está correto',
      'ok, pode agendar',
      'confirmo sim',
      'está correto sim',
      'pode agendar sim'
    ];

    // Normaliza a mensagem removendo pontuação (!, ., ?, etc.) para aceitar "sim!", "sim.", etc.
    const normalizeForComparison = (text: string) => {
      return text.toLowerCase().trim().replace(/[!?.,:;'"]+$/g, '').trim();
    };

    // Get last user message to check for recent confirmation
    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    const hasRecentConfirmation = lastUserMessage &&
      finalConfirmationPhrases.some(phrase =>
        normalizeForComparison(lastUserMessage.content) === phrase.toLowerCase()
      );

    // Buscar confirmação apenas nas mensagens do USUÁRIO (não do assistente)
    // A frase "Responda SIM para confirmar" do assistente contém "sim" e causava falso positivo
    const userMessagesText = messages.filter(m => m.role === 'user').map(m => m.content.toLowerCase()).join(' ');
    const hasAnyConfirmation = finalConfirmationPhrases.some(phrase =>
      userMessagesText.includes(phrase.toLowerCase())
    );

    if (!hasRecentConfirmation && !hasAnyConfirmation) {
      console.log('⚠️ Nenhuma confirmação final (sim/ok) encontrada na conversa, pulando criação de agendamento');
      return;
    }
    
    console.log('✅ Confirmação detectada na conversa, prosseguindo com criação de agendamento');

    // VERIFICAÇÃO ADICIONAL: Deve ter data específica mencionada na mesma mensagem ou contexto próximo
    const dateSpecificPhrases = [
      'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo',
      'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira',
      'amanhã', 'hoje', 'depois de amanhã'
    ];
    
    const hasSpecificDate = dateSpecificPhrases.some(phrase => 
      conversationText.toLowerCase().includes(phrase.toLowerCase())
    );
    
    if (!hasSpecificDate) {
      console.log('⚠️ No specific date mentioned in conversation, skipping appointment creation');
      return;
    }

    // VERIFICAÇÃO CRÍTICA: Se a última resposta do AI contém pergunta, dados ainda estão incompletos
    const lastAIMessage = messages.filter(m => m.role === 'assistant').pop();
    if (lastAIMessage && lastAIMessage.content) {
      // IMPORTANTE: Se a mensagem já é uma confirmação de agendamento anterior, NÃO criar outro
      const isAlreadyConfirmedAppointment = lastAIMessage.content.includes('Agendamento Confirmado!') ||
                                            lastAIMessage.content.includes('Obrigado por escolher nossos serviços');

      if (isAlreadyConfirmedAppointment) {
        console.log('⚠️ Última mensagem é de agendamento já confirmado anteriormente, não criando duplicata');
        return;
      }

       // Check if AI is ASKING for confirmation (waiting for user to say SIM)
      const isAskingForConfirmation = lastAIMessage.content.includes('Está tudo correto?') ||
                                      lastAIMessage.content.includes('Responda SIM para confirmar') ||
                                      lastAIMessage.content.includes('Responda SIM para cancelar') ||
                                      lastAIMessage.content.includes('CANCELAR* para confirmar') ||
                                      lastAIMessage.content.includes('CANCELAR para confirmar') ||
                                      lastAIMessage.content.includes('Confirma a remarcação?') ||
                                      lastAIMessage.content.includes('Confirma o cancelamento?') ||
                                      lastAIMessage.content.includes('confirmar seu agendamento');

      // Check if AI is confirming appointment (skip question check if it's a confirmation)
      const isConfirmingAppointment = lastAIMessage.content.toLowerCase().includes('agendamento realizado') ||
                                      lastAIMessage.content.toLowerCase().includes('nos vemos');

      // 🛑 NÃO criar agendamento quando a IA está PEDINDO confirmação (aguardando SIM do cliente)
      // Sem esta verificação, a IA envia "Responda SIM" e o sistema cria o agendamento prematuramente,
      // gerando um "fantasma" que causa conflito quando o cliente realmente confirma.
      if (isAskingForConfirmation && !isConfirmingAppointment) {
        console.log('⏳ AI está pedindo confirmação ao cliente (SIM/OK), aguardando resposta antes de criar agendamento');
        return null;
      }

      if (!isConfirmingAppointment && !isAskingForConfirmation) {
        const hasQuestion = lastAIMessage.content.includes('?') ||
                           lastAIMessage.content.toLowerCase().includes('qual') ||
                           lastAIMessage.content.toLowerCase().includes('escolha') ||
                           lastAIMessage.content.toLowerCase().includes('prefere') ||
                           lastAIMessage.content.toLowerCase().includes('gostaria');

        // For "informe", only consider it a blocking question if it's asking for critical missing data
        // and not just asking for phone when other data is complete
        const hasInformeQuestion = lastAIMessage.content.toLowerCase().includes('informe');
        const isAskingForPhone = lastAIMessage.content.toLowerCase().includes('telefone') ||
                                lastAIMessage.content.toLowerCase().includes('número');

        // Check if we have enough appointment data in the conversation to proceed despite AI questions
        const hasAppointmentData = messages.some(m =>
          m.role === 'assistant' && (
            (m.content.toLowerCase().includes('está disponível') &&
             m.content.toLowerCase().includes('para') &&
             (m.content.toLowerCase().includes('às') || m.content.toLowerCase().includes('horário'))) ||
            (m.content.includes('Nome:') ||
             (m.content.toLowerCase().includes('obrigad') && m.content.toLowerCase().includes('nome')))
          )
        );

        console.log('🔍 DEBUG Question Detection:', {
          hasQuestion,
          hasInformeQuestion,
          isAskingForPhone,
          hasAppointmentData,
          shouldBlock: (hasQuestion || (hasInformeQuestion && !isAskingForPhone)) && !hasAppointmentData,
          lastAIMessage: lastAIMessage.content.substring(0, 100) + '...'
        });

        // Only block if asking questions AND we don't have enough appointment data
        if ((hasQuestion || (hasInformeQuestion && !isAskingForPhone)) && !hasAppointmentData) {
          console.log('⚠️ AI is asking questions to client, appointment data incomplete, skipping creation');
          return;
        }

        if (hasInformeQuestion && isAskingForPhone) {
          console.log('ℹ️ AI asking for phone, but other appointment data may be complete, continuing with extraction');
        }
      } else {
        console.log('✅ AI is confirming appointment, proceeding with creation');
      }
    }
    
    // Get available professionals and services to match
    const professionals = await storage.getProfessionalsByCompany(companyId);
    const services = await storage.getServicesByCompany(companyId);
    
    console.log('💬 Analyzing conversation with explicit confirmation for appointment data...');

    // Get company for OpenAI configuration
    const company = await storage.getCompany(companyId);
    if (!company?.openaiApiKey) {
      throw new Error('Company does not have OpenAI API key configured');
    }

    // Extract appointment data using AI
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: company.openaiApiKey });
    
    // Calculate correct dates for relative day names
    const today = getBrazilDate(); // Use Brazil timezone
    const dayMap = {
      'domingo': 0, 'segunda': 1, 'terça': 2, 'quarta': 3,
      'quinta': 4, 'sexta': 5, 'sábado': 6
    };
    
    function getNextWeekdayDate(dayName: string): string {
      const targetDay = dayMap[dayName.toLowerCase()];
      if (targetDay === undefined) return '';
      
      const date = new Date();
      const currentDay = date.getDay();
      let daysUntilTarget = targetDay - currentDay;
      
      // Se o dia alvo é hoje, usar o próximo
      if (daysUntilTarget === 0) {
        daysUntilTarget = 7; // Próxima semana
      }
      
      // Se o dia já passou esta semana, pegar a próxima ocorrência
      if (daysUntilTarget < 0) {
        daysUntilTarget += 7;
      }
      
      // Criar nova data para evitar modificar a original
      const resultDate = new Date(date);
      resultDate.setDate(resultDate.getDate() + daysUntilTarget);
      return formatDateLocal(resultDate);
    }

    const extractionPrompt = `Analise esta conversa de WhatsApp e extraia os dados do agendamento APENAS SE HOUVER CONFIRMAÇÃO EXPLÍCITA COMPLETA.

HOJE É: ${today.toLocaleDateString('pt-BR')} (${['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][today.getDay()]})
ANO ATUAL: ${today.getFullYear()}
MÊS ATUAL: ${today.getMonth() + 1} (${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][today.getMonth()]})

PRÓXIMOS DIAS DA SEMANA (use apenas se cliente NÃO especificou data exata):
- Domingo: ${getNextWeekdayDate('domingo')}
- Segunda-feira: ${getNextWeekdayDate('segunda')}
- Terça-feira: ${getNextWeekdayDate('terça')}
- Quarta-feira: ${getNextWeekdayDate('quarta')}
- Quinta-feira: ${getNextWeekdayDate('quinta')}
- Sexta-feira: ${getNextWeekdayDate('sexta')}
- Sábado: ${getNextWeekdayDate('sábado')}

PROFISSIONAIS DISPONÍVEIS:
${professionals.map(p => `- ${p.name} (ID: ${p.id})`).join('\n')}

SERVIÇOS DISPONÍVEIS:
${services.map(s => `- ${s.name} (ID: ${s.id})`).join('\n')}

CONVERSA:
${conversationText}

🔍 COMO EXTRAIR OS DADOS:

1. PRIMEIRO: Procure se o cliente confirmou com "sim" ou "ok" no final da conversa
2. SEGUNDO: Se confirmou, procure o RESUMO do agendamento que o ASSISTANT enviou ANTES da confirmação
3. TERCEIRO: Extraia os dados do RESUMO (que pode conter emojis como 👤, 📅, 🕐) ou das mensagens do USUÁRIO
4. QUARTO: Se algum dado estiver faltando no resumo, busque nas mensagens anteriores do USUÁRIO

⚠️ INSTRUÇÕES CRÍTICAS:

IMPORTANTE: Se a IA mencionar dados diferentes do que o cliente escolheu, SEMPRE priorize as escolhas do CLIENTE.
- Se cliente disse "hidratação" e IA disse "escova", use HIDRATAÇÃO
- Se cliente disse "terça" e IA disse "quarta", use TERÇA
- Se cliente disse "15:00" e IA disse "10:00", use 15:00
- A IA pode alucinar dados incorretos, mas as escolhas do cliente são sempre corretas
- BUSQUE nos RESUMOS do assistant E nas mensagens do usuário
- O assistant geralmente envia um resumo com formato "Resumo do agendamento:" ou com emojis (👤 📅 🕐)

REGRAS CRÍTICAS - SÓ EXTRAIA SE TODAS AS CONDIÇÕES FOREM ATENDIDAS:

1. DEVE haver confirmação final com "SIM" ou "OK":
   - Cliente deve responder "sim", "ok", "sim, confirmo", "ok, confirmo", "sim, está correto"
   - NUNCA extraia dados se cliente não confirmou com SIM/OK

2. TODOS os dados devem estar presentes na conversa (mesmo que espalhados):
   - Nome do cliente (primeiro nome é suficiente, pode estar no resumo ou nas mensagens do usuário)
   - IMPORTANTE: NÃO aceite palavras de confirmação como nome (sim, ok, não, nao, claro, perfeito, ótimo, excelente, certo, beleza, etc.)
   - Se o nome for uma palavra de confirmação, considere DADOS_INCOMPLETOS
   - Profissional ESPECÍFICO escolhido
   - Serviço ESPECÍFICO escolhido
   - Data ESPECÍFICA (dia da semana + data)
   - Horário ESPECÍFICO
   - TELEFONE: NÃO é necessário na conversa (será preenchido automaticamente com o número do WhatsApp)

3. INSTRUÇÕES PARA DATAS - MUITO IMPORTANTE:
   - PRIORIZE a data EXATA mencionada na conversa, especialmente no RESUMO do agendamento
   - Se no resumo aparece "📅 Data: quinta-feira, 18/12/2025", a data é 2025-12-18
   - Se cliente disse "dia 18" e estamos em dezembro, a data é 2025-12-18
   - SEMPRE converta para formato YYYY-MM-DD (ano-mês-dia)
   - Exemplos de conversão:
     * "18/12/2025" ou "18/12" -> "2025-12-18"
     * "dia 18" (dezembro atual) -> "2025-12-18"
     * "25 de janeiro" -> "2026-01-25"
   - Se mencionado APENAS dia da semana sem data específica:
     * "sábado" -> ${getNextWeekdayDate('sábado')}
     * "segunda" -> ${getNextWeekdayDate('segunda')}
     * "terça" -> ${getNextWeekdayDate('terça')}
     * "quarta" -> ${getNextWeekdayDate('quarta')}
     * "quinta" -> ${getNextWeekdayDate('quinta')}
     * "sexta" -> ${getNextWeekdayDate('sexta')}
     * "domingo" -> ${getNextWeekdayDate('domingo')}
   - ATENÇÃO: NÃO confunda o dia da semana com a data numérica!
   - Se resumo mostra "18/12/2025" mas diz "quinta-feira", USE A DATA 2025-12-18
   - Aceite QUALQUER data futura válida

4. CASOS QUE DEVEM RETORNAR "DADOS_INCOMPLETOS":
   - Cliente não confirmou com "sim" ou "ok"
   - Falta qualquer dado obrigatório (nome do cliente, data específica, horário)
   - Dados estão inconsistentes ou contraditórios na conversa

IMPORTANTE: Responda APENAS com JSON puro, sem explicações, sem formatação markdown, sem comentários.
NÃO use \`\`\`json, NÃO use \`\`\`, NÃO adicione texto antes ou depois.

Retorne EXATAMENTE um destes dois formatos:
1. Se os dados estão completos, retorne APENAS o JSON:
{"clientName":"Nome do cliente","professionalId":123,"serviceId":456,"appointmentDate":"YYYY-MM-DD","appointmentTime":"HH:MM"}

2. Se falta algum dado ou não há confirmação, retorne APENAS:
DADOS_INCOMPLETOS

Exemplo de resposta válida (sem aspas externas, sem formatação):
{"clientName":"Maria Silva","professionalId":1,"serviceId":2,"appointmentDate":"2025-12-18","appointmentTime":"14:00"}

NOTA: O telefone NÃO precisa estar no JSON - será preenchido automaticamente pelo sistema.

ATENÇÃO FINAL: Se no resumo do agendamento aparece uma data como "18/12/2025", você DEVE retornar appointmentDate como "2025-12-18" (formato YYYY-MM-DD). NÃO use o dia da semana para calcular a data, use a DATA EXATA mostrada!`;

    const extraction = await openai.chat.completions.create({
      model: company.openaiModel || "gpt-4o-mini",
      messages: [{ role: "user", content: extractionPrompt }],
      temperature: company.openaiTemperature ? parseFloat(company.openaiTemperature.toString()) : 0.7,
      max_tokens: company.openaiMaxTokens || 180
    });

    const extractedData = extraction.choices[0]?.message?.content?.trim();
    console.log('🤖 AI Extraction result:', extractedData);

    if (!extractedData || extractedData === 'DADOS_INCOMPLETOS' || extractedData.includes('DADOS_INCOMPLETOS')) {
      console.log('⚠️ Incomplete appointment data or missing confirmation, skipping creation');

      // Enviar webhook de erro
      await sendAppointmentErrorWebhook(companyId, 'EXTRACTION_FAILED', 'Dados do agendamento incompletos ou cliente não confirmou', {
        conversationId,
        phoneNumber: conversation.phoneNumber,
        additionalInfo: 'Cliente pode não ter confirmado com SIM/OK ou faltam dados obrigatórios'
      });

      return;
    }

    try {
      // Limpar a resposta da IA para extrair apenas o JSON
      let cleanedData = extractedData;

      // Remover possíveis marcações de código (```json, ```)
      cleanedData = cleanedData.replace(/```json\s*/gi, '');
      cleanedData = cleanedData.replace(/```\s*/g, '');

      // Remover possíveis aspas extras no início e fim
      cleanedData = cleanedData.replace(/^["']|["']$/g, '');

      // Extrair apenas o objeto JSON se houver texto adicional
      const jsonMatch = cleanedData.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedData = jsonMatch[0];
      }

      // Remover caracteres invisíveis, BOM e espaços extras
      cleanedData = cleanedData.trim()
        .replace(/^\uFEFF/, '') // Remove BOM
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove caracteres de controle
        .replace(/\r\n/g, '\n') // Normaliza quebras de linha
        .replace(/\s+/g, ' '); // Normaliza espaços

      // Validar se parece um JSON antes de tentar fazer parse
      if (!cleanedData.startsWith('{') || !cleanedData.endsWith('}')) {
        console.error('❌ Invalid JSON structure - not starting with { or ending with }');
        console.error('📊 Cleaned data:', cleanedData);
        return;
      }

      console.log('🧹 Cleaned data for parsing:', cleanedData);

      const appointmentData = JSON.parse(cleanedData);

      // SEMPRE usar o telefone do WhatsApp automaticamente
      appointmentData.clientPhone = conversation.phoneNumber;
      console.log('📱 Usando telefone do WhatsApp automaticamente:', appointmentData.clientPhone);

      // Validação final de todos os campos obrigatórios (sem exigir telefone pois é automático)
      if (!appointmentData.clientName ||
          !appointmentData.professionalId || !appointmentData.serviceId ||
          !appointmentData.appointmentDate || !appointmentData.appointmentTime) {
        console.log('⚠️ Missing required appointment fields after extraction, skipping creation');

        // Identificar quais campos estão faltando
        const missingFields = [];
        if (!appointmentData.clientName) missingFields.push('nome do cliente');
        if (!appointmentData.professionalId) missingFields.push('profissional');
        if (!appointmentData.serviceId) missingFields.push('serviço');
        if (!appointmentData.appointmentDate) missingFields.push('data');
        if (!appointmentData.appointmentTime) missingFields.push('horário');

        // Enviar webhook de erro
        await sendAppointmentErrorWebhook(companyId, 'VALIDATION_FAILED', `Campos obrigatórios faltando: ${missingFields.join(', ')}`, {
          conversationId,
          phoneNumber: conversation.phoneNumber,
          clientName: appointmentData.clientName,
          professionalId: appointmentData.professionalId,
          serviceId: appointmentData.serviceId,
          requestedDate: appointmentData.appointmentDate,
          requestedTime: appointmentData.appointmentTime,
          additionalInfo: `Campos extraídos: ${JSON.stringify(appointmentData)}`
        });

        return;
      }

      console.log('✅ Valid appointment data extracted - serviceId:', appointmentData.serviceId, 'date:', appointmentData.date, 'time:', appointmentData.time);

      // Find the service to get duration
      const service = services.find(s => s.id === appointmentData.serviceId);
      if (!service) {
        console.log('⚠️ Service not found');

        // Enviar webhook de erro
        await sendAppointmentErrorWebhook(companyId, 'SERVICE_NOT_FOUND', `Serviço ID ${appointmentData.serviceId} não encontrado`, {
          conversationId,
          phoneNumber: conversation.phoneNumber,
          clientName: appointmentData.clientName,
          serviceId: appointmentData.serviceId,
          requestedDate: appointmentData.appointmentDate,
          requestedTime: appointmentData.appointmentTime
        });

        return;
      }

      // Create client if doesn't exist
      let client;
      try {
        // Use imported normalizePhone function that handles missing 9th digit
        const normalizedClientPhone = normalizePhone(appointmentData.clientPhone);

        const existingClients = await storage.getClientsByCompany(companyId);
        client = existingClients.find(c =>
          c.phone && normalizePhone(c.phone) === normalizedClientPhone
        );
        
        if (!client) {
          client = await storage.createClient({
            companyId,
            name: appointmentData.clientName,
            phone: appointmentData.clientPhone,
            email: null,
            notes: 'Cliente criado via WhatsApp',
            birthDate: null
          });
          console.log('👤 New client created:', client.name);
        } else {
          console.log('👤 Existing client found:', client.name);
        }
      } catch (error) {
        console.error('Error creating/finding client:', error);
        return;
      }

      // Create appointment with correct date
      const appointmentDate = new Date(appointmentData.appointmentDate + 'T00:00:00.000Z');
      
      const appointmentPayload = {
        companyId,
        serviceId: appointmentData.serviceId,
        professionalId: appointmentData.professionalId,
        clientName: appointmentData.clientName,
        clientPhone: appointmentData.clientPhone,
        appointmentDate: formatDateLocal(appointmentDate),
        appointmentTime: appointmentData.appointmentTime,
        duration: service.duration || 60,
        status: 'Pendente',
        totalPrice: String(service.price || 0),
        notes: `Agendamento confirmado via WhatsApp - Conversa ID: ${conversationId}`,
        reminderSent: 0
      };

      console.log('📋 Creating appointment - companyId:', appointmentPayload.companyId, 'serviceId:', appointmentPayload.serviceId, 'date:', appointmentPayload.appointmentDate);
      
      let appointment;
      try {
        appointment = await storage.createAppointment(appointmentPayload);
        console.log('✅ Appointment created successfully with ID:', appointment.id);
        console.log('🎯 SUCCESS: Appointment saved to database with explicit confirmation');
      } catch (createError) {
        console.error('❌ CRITICAL ERROR: Failed to create appointment in database:', createError);
        throw createError;
      }
      
      console.log(`📅 CONFIRMED APPOINTMENT: ${appointmentData.clientName} - ${service.name} - ${appointmentDate.toLocaleDateString('pt-BR')} ${appointmentData.appointmentTime}`);

      // Get professional name for notification
      const professional = await storage.getProfessional(appointmentData.professionalId);
      
      // Broadcast new appointment event only to connections of the same company
      broadcastEvent({
        type: 'new_appointment',
        appointment: {
          id: appointment.id,
          clientName: appointmentData.clientName,
          serviceName: service.name,
          professionalName: professional?.name || 'Profissional',
          appointmentDate: appointmentData.appointmentDate,
          appointmentTime: appointmentData.appointmentTime
        }
      }, companyId);

    } catch (parseError) {
      console.error('❌ Error parsing extracted appointment data:', parseError);
      console.error('📊 Original extracted data:', extractedData);
      if (extractedData) {
        console.error('📏 Data length:', extractedData.length);
        console.error('🔤 First 200 chars:', extractedData.substring(0, 200));
        console.error('🔢 Last 200 chars:', extractedData.substring(Math.max(0, extractedData.length - 200)));
      }
    }

  } catch (error) {
    console.error('❌ Error in createAppointmentFromConversation:', error);
    throw error;
  }
}

// Store SSE connections with companyId for multi-tenant isolation
const sseConnections = new Map<any, number>();

// Function to broadcast events only to connections of the same company
const broadcastEvent = (eventData: any, targetCompanyId?: number) => {
  const data = JSON.stringify(eventData);
  sseConnections.forEach((companyId, res) => {
    try {
      // Only send to connections of the same company
      if (!targetCompanyId || companyId === targetCompanyId) {
        res.write(`data: ${data}\n\n`);
      }
    } catch (error) {
      // Remove dead connections
      sseConnections.delete(res);
    }
  });
};

  // Public settings endpoint for companies
  app.get('/api/company/public-settings', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const settings = await storage.getGlobalSettings();
      // Return only public fields
      res.json({
        supportWhatsapp: settings?.supportWhatsapp || null,
      });
    } catch (error) {
      console.error("Error fetching public settings:", error);
      res.status(500).json({ message: "Falha ao buscar configurações" });
    }
  });

  // Support tickets routes
  app.get('/api/company/support-tickets', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      console.log('Fetching tickets for company:', companyId);
      
      const query = `
        SELECT 
          st.id, st.company_id as companyId, st.type_id as typeId, st.status_id as statusId,
          st.title, st.description, st.priority, st.admin_response as adminResponse,
          st.attachments, st.created_at as createdAt, st.updated_at as updatedAt, 
          st.resolved_at as resolvedAt,
          stt.name as category,
          sts.name as status, sts.color as statusColor
        FROM support_tickets st
        LEFT JOIN support_ticket_types stt ON st.type_id = stt.id
        LEFT JOIN support_ticket_statuses sts ON st.status_id = sts.id
        WHERE st.company_id = ?
        ORDER BY st.created_at DESC
      `;

      const [tickets] = await pool.execute(query, [companyId]);
      console.log('Found tickets:', Array.isArray(tickets) ? tickets.length : 0);
      
      if (Array.isArray(tickets) && tickets.length > 0) {
        console.log('First ticket attachments:', (tickets[0] as any).attachments);
      }
      
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching support tickets:", error);
      res.status(500).json({ message: "Erro ao buscar tickets de suporte" });
    }
  });

  app.post('/api/company/support-tickets', supportTicketUpload.array('images', 3), validateUploadContent(IMAGE_MIMES), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      const { title, description, typeId } = req.body;

      // Debug logging
      console.log('Files received:', req.files ? req.files.length : 0);
      if (req.files) {
        req.files.forEach((file: any, index: number) => {
          console.log(`File ${index}:`, file.filename, file.originalname);
        });
      }

      // Handle file attachments - save as comma-separated filenames
      const attachmentFilenames = req.files ? req.files.map((file: any) => file.filename).join(',') : '';
      console.log('Attachment filenames to save:', attachmentFilenames);

      // Get the first available status ID (usually 'Aberto')
      const [statusRows] = await pool.execute(
        'SELECT id FROM support_ticket_statuses ORDER BY sort_order LIMIT 1'
      ) as any;
      
      const defaultStatusId = statusRows.length > 0 ? statusRows[0].id : null;

      if (!defaultStatusId) {
        return res.status(500).json({ message: "Nenhum status de ticket disponível. Contate o administrador." });
      }

      // Check if attachments column exists first
      const [columns] = await pool.execute('SHOW COLUMNS FROM support_tickets') as any;
      const hasAttachments = columns.some((col: any) => col.Field === 'attachments');
      
      let result;
      if (hasAttachments) {
        [result] = await pool.execute(
          'INSERT INTO support_tickets (company_id, type_id, status_id, title, description, attachments) VALUES (?, ?, ?, ?, ?, ?)',
          [companyId, typeId ? parseInt(typeId) : null, defaultStatusId, title, description, attachmentFilenames]
        ) as any;
      } else {
        // Add attachments column if it doesn't exist
        try {
          await pool.execute('ALTER TABLE support_tickets ADD COLUMN attachments TEXT');
          console.log('✅ Attachments column added during ticket creation');
        } catch (error: any) {
          if (error.code !== 'ER_DUP_FIELDNAME') {
            console.log('Error adding attachments column:', error.message);
          }
        }
        
        // Insert with attachments column
        [result] = await pool.execute(
          'INSERT INTO support_tickets (company_id, type_id, status_id, title, description, attachments) VALUES (?, ?, ?, ?, ?, ?)',
          [companyId, typeId ? parseInt(typeId) : null, defaultStatusId, title, description, attachmentFilenames]
        ) as any;
      }

      res.json({ 
        message: "Ticket criado com sucesso", 
        id: result.insertId,
        attachments: req.files ? req.files.length : 0
      });
    } catch (error) {
      console.error("Error creating support ticket:", error);
      res.status(500).json({ message: "Erro ao criar ticket de suporte" });
    }
  });

  app.put('/api/company/support-tickets/:id', async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const companyId = req.session.companyId;
      const { title, description, priority, category } = req.body;

      await db.update(supportTickets)
        .set({
          title,
          description,
          priority,
          category,
          updatedAt: new Date()
        })
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.companyId, companyId)));

      res.json({ message: "Ticket atualizado com sucesso" });
    } catch (error) {
      console.error("Error updating support ticket:", error);
      res.status(500).json({ message: "Erro ao atualizar ticket de suporte" });
    }
  });

  app.delete('/api/company/support-tickets/:id', async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const companyId = req.session.companyId;

      await db.delete(supportTickets)
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.companyId, companyId)));

      res.json({ message: "Ticket excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting support ticket:", error);
      res.status(500).json({ message: "Erro ao excluir ticket de suporte" });
    }
  });

  // Company route to fetch support ticket types
  app.get('/api/company/support-ticket-types', async (req: any, res) => {
    try {
      const ticketTypes = await db.select().from(supportTicketTypes)
        .where(eq(supportTicketTypes.isActive, true))
        .orderBy(supportTicketTypes.name);
      res.json(ticketTypes);
    } catch (error) {
      console.error("Error fetching support ticket types:", error);
      res.status(500).json({ message: "Erro ao buscar tipos de tickets" });
    }
  });

  // Admin routes for support ticket types
  app.get('/api/admin/support-ticket-types', isAuthenticated, async (req, res) => {
    try {
      const ticketTypes = await db.select().from(supportTicketTypes).orderBy(supportTicketTypes.name);
      res.json(ticketTypes);
    } catch (error) {
      console.error("Error fetching support ticket types:", error);
      res.status(500).json({ message: "Erro ao buscar tipos de tickets" });
    }
  });

  app.post('/api/admin/support-ticket-types', isAuthenticated, async (req, res) => {
    try {
      const { name, description, isActive } = req.body;

      const newType = await db.insert(supportTicketTypes).values({
        name,
        description,
        isActive: isActive !== undefined ? isActive : true
      });

      res.json({ message: "Tipo de ticket criado com sucesso", id: newType.insertId });
    } catch (error) {
      console.error("Error creating support ticket type:", error);
      res.status(500).json({ message: "Erro ao criar tipo de ticket" });
    }
  });

  app.put('/api/admin/support-ticket-types/:id', isAuthenticated, async (req, res) => {
    try {
      const typeId = parseInt(req.params.id);
      const { name, description, isActive } = req.body;

      await db.update(supportTicketTypes)
        .set({
          name,
          description,
          isActive,
          updatedAt: new Date()
        })
        .where(eq(supportTicketTypes.id, typeId));

      res.json({ message: "Tipo de ticket atualizado com sucesso" });
    } catch (error) {
      console.error("Error updating support ticket type:", error);
      res.status(500).json({ message: "Erro ao atualizar tipo de ticket" });
    }
  });

  app.delete('/api/admin/support-ticket-types/:id', isAuthenticated, async (req, res) => {
    try {
      const typeId = parseInt(req.params.id);

      await db.delete(supportTicketTypes).where(eq(supportTicketTypes.id, typeId));

      res.json({ message: "Tipo de ticket excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting support ticket type:", error);
      res.status(500).json({ message: "Erro ao excluir tipo de ticket" });
    }
  });

  // UAZAPI diagnostic endpoint
  app.get('/api/admin/uazapi/test', isAuthenticated, async (req, res) => {
    try {
      const settings = await storage.getGlobalSettings();

      if (!settings?.uazapiUrl || !settings?.uazapiAdminToken) {
        return res.json({
          success: false,
          message: "UAZAPI não configurada",
          details: {
            hasUrl: !!settings?.uazapiUrl,
            hasKey: !!settings?.uazapiAdminToken
          }
        });
      }

      console.log('Testing UAZAPI connection...');

      const uazapi = await getUazapiService();
      const instances = await uazapi.listAllInstances();

      res.json({
        success: true,
        message: "Conexão com UAZAPI estabelecida",
        details: {
          status: 200,
          instances: instances.length
        }
      });

    } catch (error: any) {
      console.error("Error testing UAZAPI:", error);
      res.json({
        success: false,
        message: "Erro ao testar UAZAPI",
        details: {
          error: error.message
        }
      });
    }
  });

  // Admin routes for support ticket statuses
  app.get('/api/admin/support-ticket-statuses', isAuthenticated, async (req, res) => {
    try {
      const statuses = await db.select().from(supportTicketStatuses).orderBy(asc(supportTicketStatuses.sortOrder));
      res.json(statuses);
    } catch (error) {
      console.error("Error fetching support ticket statuses:", error);
      res.status(500).json({ message: "Erro ao buscar status de tickets" });
    }
  });

  app.post('/api/admin/support-ticket-statuses', isAuthenticated, async (req, res) => {
    try {
      const { name, description, color, isActive, sortOrder } = req.body;

      await db.insert(supportTicketStatuses).values({
        name,
        description,
        color: color || '#6b7280',
        isActive: isActive !== undefined ? isActive : true,
        sortOrder: sortOrder || 0
      });

      res.status(201).json({ message: "Status de ticket criado com sucesso" });
    } catch (error) {
      console.error("Error creating support ticket status:", error);
      res.status(500).json({ message: "Erro ao criar status de ticket" });
    }
  });

  app.put('/api/admin/support-ticket-statuses/:id', isAuthenticated, async (req, res) => {
    try {
      const statusId = parseInt(req.params.id);
      const { name, description, color, isActive, sortOrder } = req.body;

      await db.update(supportTicketStatuses)
        .set({
          name,
          description,
          color,
          isActive,
          sortOrder,
          updatedAt: new Date()
        })
        .where(eq(supportTicketStatuses.id, statusId));

      res.json({ message: "Status de ticket atualizado com sucesso" });
    } catch (error) {
      console.error("Error updating support ticket status:", error);
      res.status(500).json({ message: "Erro ao atualizar status de ticket" });
    }
  });

  app.delete('/api/admin/support-ticket-statuses/:id', isAuthenticated, async (req, res) => {
    try {
      const statusId = parseInt(req.params.id);

      await db.delete(supportTicketStatuses).where(eq(supportTicketStatuses.id, statusId));

      res.json({ message: "Status de ticket excluído com sucesso" });
    } catch (error) {
      console.error("Error deleting support ticket status:", error);
      res.status(500).json({ message: "Erro ao excluir status de ticket" });
    }
  });

  // Admin routes for support tickets
  app.get('/api/admin/support-tickets', isAuthenticated, async (req, res) => {
    try {
      console.log("Fetching admin support tickets...");
      
      const query = `
        SELECT 
          st.id, st.company_id as companyId, st.type_id as typeId, st.status_id as statusId,
          st.title, st.description, st.priority, st.category, st.admin_response as adminResponse,
          st.attachments, st.created_at as createdAt, st.updated_at as updatedAt, 
          st.resolved_at as resolvedAt,
          c.fantasy_name as companyName, c.email as companyEmail,
          stt.name as typeName,
          sts.name as statusName, sts.color as statusColor
        FROM support_tickets st
        LEFT JOIN companies c ON st.company_id = c.id
        LEFT JOIN support_ticket_types stt ON st.type_id = stt.id
        LEFT JOIN support_ticket_statuses sts ON st.status_id = sts.id
        ORDER BY st.created_at DESC
      `;

      const [tickets] = await pool.execute(query);
      console.log(`Found ${Array.isArray(tickets) ? tickets.length : 0} admin tickets`);
      
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching admin support tickets:", error);
      res.status(500).json({ message: "Erro ao buscar tickets de suporte" });
    }
  });


  app.put('/api/admin/support-tickets/:id', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const { statusId, adminResponse, attachments } = req.body;

      const updateData: any = {};
      if (statusId) updateData.statusId = statusId;
      if (adminResponse !== undefined) updateData.adminResponse = adminResponse;
      if (attachments !== undefined) updateData.attachments = attachments;
      updateData.updatedAt = new Date();

      await db.update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, ticketId));

      res.json({ message: "Ticket atualizado com sucesso" });
    } catch (error) {
      console.error("Error updating admin support ticket:", error);
      res.status(500).json({ message: "Erro ao atualizar ticket" });
    }
  });

  // Admin route for uploading files to support tickets
  app.post('/api/admin/support-tickets/upload', isAuthenticated, supportTicketUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo enviado" });
      }

      const { ticketId, type } = req.body;
      
      console.log(`Admin file upload: ${req.file.filename} for ticket ${ticketId}`);

      res.json({
        message: "Arquivo enviado com sucesso",
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        ticketId: ticketId,
        type: type
      });
    } catch (error) {
      console.error("Error uploading admin file:", error);
      res.status(500).json({ message: "Erro ao fazer upload do arquivo" });
    }
  });

  // Routes for support ticket comments
  app.get('/api/company/support-tickets/:ticketId/comments', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const companyId = req.session.companyId;

      // Verify ticket belongs to company
      const [ticket] = await pool.execute(
        'SELECT id FROM support_tickets WHERE id = ? AND company_id = ?',
        [ticketId, companyId]
      ) as any;

      if (!ticket.length) {
        return res.status(404).json({ message: "Ticket não encontrado" });
      }

      const [comments] = await pool.execute(`
        SELECT id, comment, created_at
        FROM support_ticket_comments 
        WHERE ticket_id = ? 
        ORDER BY created_at ASC
      `, [ticketId]) as any;

      res.json(comments);
    } catch (error) {
      console.error("Error fetching ticket comments:", error);
      res.status(500).json({ message: "Erro ao buscar comentários do ticket" });
    }
  });

  app.post('/api/company/support-tickets/:ticketId/comments', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const companyId = req.session.companyId;
      const { comment } = req.body;

      if (!comment || !comment.trim()) {
        return res.status(400).json({ message: "Comentário é obrigatório" });
      }

      // Verify ticket belongs to company
      const [ticket] = await pool.execute(
        'SELECT id FROM support_tickets WHERE id = ? AND company_id = ?',
        [ticketId, companyId]
      ) as any;

      if (!ticket.length) {
        return res.status(404).json({ message: "Ticket não encontrado" });
      }

      // Insert comment
      await pool.execute(`
        INSERT INTO support_ticket_comments (ticket_id, company_id, comment)
        VALUES (?, ?, ?)
      `, [ticketId, companyId, comment.trim()]);

      res.json({ message: "Comentário adicionado com sucesso" });
    } catch (error) {
      console.error("Error adding ticket comment:", error);
      res.status(500).json({ message: "Erro ao adicionar comentário" });
    }
  });

  // Route to add additional information to existing ticket
  app.post('/api/company/support-tickets/:ticketId/add-info', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const ticketId = parseInt(req.params.ticketId);
      const companyId = req.session.companyId;
      const { additionalInfo } = req.body;

      if (!additionalInfo || !additionalInfo.trim()) {
        return res.status(400).json({ message: "Informação adicional é obrigatória" });
      }

      // Verify ticket belongs to company
      const [ticket] = await pool.execute(
        'SELECT id, description FROM support_tickets WHERE id = ? AND company_id = ?',
        [ticketId, companyId]
      ) as any;

      if (!ticket.length) {
        return res.status(404).json({ message: "Ticket não encontrado" });
      }

      const currentDescription = ticket[0].description || '';
      const separator = currentDescription.trim() ? '\n\n--- Informação Adicional ---\n' : '';
      const updatedDescription = currentDescription + separator + additionalInfo.trim();

      // Update ticket with additional information
      await pool.execute(
        'UPDATE support_tickets SET description = ?, updated_at = NOW() WHERE id = ?',
        [updatedDescription, ticketId]
      );

      res.json({ message: "Informação adicional adicionada com sucesso" });
    } catch (error) {
      console.error("Error adding additional info to ticket:", error);
      res.status(500).json({ message: "Erro ao adicionar informação adicional" });
    }
  });

  // WhatsApp Instances Management API
  app.get('/api/company/whatsapp/instances', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const instances = await storage.getWhatsappInstancesByCompany(companyId);
      res.json(instances);
    } catch (error) {
      console.error("Error fetching WhatsApp instances:", error);
      res.status(500).json({ message: "Erro ao buscar instâncias do WhatsApp" });
    }
  });

  app.post('/api/company/whatsapp/instances', validateBody(createWhatsAppInstanceSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { instanceName, phoneNumber } = req.body;

      // Create instance in UAZAPI via service
      const uazapi = await getUazapiService();
      console.log(`📤 Creating UAZAPI instance: ${instanceName}`);

      const result = await uazapi.createInstance(instanceName);
      console.log(`✅ UAZAPI instance created successfully:`, result);

      // Generate webhook URL (uses system_url for public accessibility)
      const webhookUrl = await generateWebhookUrl(req, instanceName);
      console.log(`🔗 Generated webhook URL: ${webhookUrl}`);

      // Create instance in database - store the returned instanceToken
      const instanceData = {
        companyId,
        instanceName,
        phoneNumber,
        status: 'connecting',
        instanceToken: result.token || null,
        webhook: webhookUrl,
        qrCode: null
      };

      const dbInstance = await storage.createWhatsappInstance(instanceData);
      console.log(`✅ Database instance created with ID: ${dbInstance.id}`);

      // Configure webhook if we got a token
      if (result.token) {
        try {
          await uazapi.configureWebhook(result.token, {
            url: webhookUrl,
            events: ['messages', 'connection'],
            excludeMessages: ['wasSentByApi']
          });
          console.log(`✅ Webhook configured for instance: ${instanceName}`);
        } catch (webhookError) {
          console.warn(`⚠️ Failed to configure webhook (will retry later):`, webhookError);
        }
      }

      res.status(201).json({
        message: "Instância do WhatsApp criada com sucesso",
        instance: dbInstance,
        uazapiResponse: result
      });

    } catch (error: any) {
      console.error("Error creating WhatsApp instance:", error);
      res.status(500).json({
        message: "Erro ao criar instância do WhatsApp",
        details: error.message
      });
    }
  });

  // Get QR Code for WhatsApp instance
  app.get('/api/company/whatsapp/instances/:instanceName/qrcode', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const instanceName = req.params.instanceName;

      // Verify instance belongs to company
      const instance = await storage.getWhatsappInstanceByName(instanceName, companyId);
      if (!instance) {
        return res.status(404).json({ message: "Instância não encontrada" });
      }

      if (!instance.instanceToken) {
        return res.status(400).json({ message: "Token da instância não encontrado. Recrie a instância." });
      }

      console.log(`📱 Getting QR code for instance: ${instanceName}`);

      const uazapi = await getUazapiService();
      const result = await uazapi.connect(instance.instanceToken);
      console.log(`✅ QR code retrieved for instance: ${instanceName}`);

      res.json({
        qrcode: result.qrcode || result.instance?.qrcode,
        pairingCode: result.paircode || result.instance?.paircode,
        status: result.instance?.status || result.status || 'connecting'
      });

    } catch (error: any) {
      console.error("Error getting QR code:", error);
      res.status(500).json({
        message: "Erro ao buscar QR code",
        details: error.message
      });
    }
  });

  // Get Pairing Code for WhatsApp instance (alternativa ao QR Code)
  app.post('/api/company/whatsapp/instances/:instanceName/pairingcode', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const instanceName = req.params.instanceName;
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Número de telefone é obrigatório" });
      }

      // Limpar o número - remover caracteres especiais e espaços
      const cleanNumber = phoneNumber.replace(/\D/g, '');

      if (cleanNumber.length < 10 || cleanNumber.length > 15) {
        return res.status(400).json({ message: "Número de telefone inválido. Use o formato com DDI e DDD (ex: 5511999999999)" });
      }

      // Verify instance belongs to company
      const instance = await storage.getWhatsappInstanceByName(instanceName, companyId);
      if (!instance) {
        return res.status(404).json({ message: "Instância não encontrada" });
      }

      if (!instance.instanceToken) {
        return res.status(400).json({ message: "Token da instância não encontrado. Recrie a instância." });
      }

      console.log(`📱 Getting Pairing Code for instance: ${instanceName}, phone: ${cleanNumber}`);

      const uazapi = await getUazapiService();

      // Step 1: Desconectar a instância para garantir que está pronta para pairing
      console.log(`📱 Step 1: Disconnecting instance ${instanceName} to prepare for pairing code`);
      try {
        await uazapi.disconnect(instance.instanceToken);
        console.log(`✅ Disconnect request sent`);
        // Aguardar um pouco para a instância processar o disconnect
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (disconnectError) {
        console.log(`⚠️ Disconnect failed (may already be disconnected):`, disconnectError);
      }

      // Step 2: Obter pairing code com o número via service
      console.log(`📱 Step 2: Connecting with phone number for pairing code`);
      const responseData = await uazapi.connect(instance.instanceToken, cleanNumber);
      console.log(`📱 UAZAPI pairing response:`, responseData);

      // Extrair o pairing code da resposta
      const code = responseData.paircode ||
                   responseData.instance?.paircode ||
                   (responseData as any).pairingCode ||
                   (responseData as any).code;

      if (code && typeof code === 'string' && code.length >= 6 && code.length <= 10) {
        console.log(`✅ Pairing code retrieved: ${code}`);
        return res.json({ code, status: 'pending' });
      }

      // Se não encontrou pairing code, verificar se retornou qrcode
      if (responseData.qrcode || responseData.instance?.qrcode) {
        console.log(`⚠️ UAZAPI returned QR code instead of pairing code`);
        return res.status(400).json({
          message: "A UAZAPI retornou QR code em vez de código de pareamento. Verifique se o número está correto e se a instância está desconectada.",
          hint: "Tente desconectar a instância primeiro e depois gerar o código novamente."
        });
      }

      console.log(`⚠️ Pairing code not found in response:`, responseData);
      return res.json({
        code: null,
        message: "Código de pareamento não encontrado na resposta. Verifique se a instância está desconectada.",
        rawResponse: responseData
      });

    } catch (error: any) {
      console.error("Error getting pairing code:", error);
      res.status(500).json({
        message: "Erro ao gerar código de pareamento",
        details: error.message
      });
    }
  });

  // Refresh instance status from UAZAPI
  app.get('/api/company/whatsapp/instances/:instanceName/refresh-status', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const instanceName = req.params.instanceName;

      // Verify instance belongs to company
      const instance = await storage.getWhatsappInstanceByName(instanceName, companyId);
      if (!instance) {
        return res.status(404).json({ message: "Instância não encontrada" });
      }

      if (!instance.instanceToken) {
        return res.status(400).json({ message: "Token da instância não encontrado. Recrie a instância." });
      }

      console.log(`🔄 Refreshing status for instance: ${instanceName}`);

      const uazapi = await getUazapiService();
      const statusData = await uazapi.getStatus(instance.instanceToken);
      console.log(`✅ Status retrieved for instance: ${instanceName}`, statusData);

      // Map status from UAZAPI response
      const status = statusData.instance?.status || statusData.status || 'unknown';

      // Update status in database
      await storage.updateWhatsappInstance(instance.id, { status });

      res.json({
        status,
        connectionState: statusData
      });

    } catch (error: any) {
      console.error("Error refreshing instance status:", error);
      res.status(500).json({
        message: "Erro ao atualizar status",
        details: error.message
      });
    }
  });

  // Configure webhook for WhatsApp instance
  app.post('/api/company/whatsapp/instances/:id/configure-webhook', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const instanceId = parseInt(req.params.id);
      const instance = await storage.getWhatsappInstance(instanceId);

      if (!instance || instance.companyId !== companyId) {
        return res.status(404).json({ message: "Instância não encontrada" });
      }

      if (!instance.instanceToken) {
        return res.status(400).json({ message: "Token da instância não encontrado. Recrie a instância." });
      }

      console.log(`🔧 Configuring webhook for instance: ${instance.instanceName}`);

      // Generate webhook URL (uses system_url for public accessibility)
      const webhookUrl = await generateWebhookUrl(req, instance.instanceName);
      console.log(`📡 Webhook URL: ${webhookUrl}`);

      const uazapi = await getUazapiService();
      const webhookData = await uazapi.configureWebhook(instance.instanceToken, {
        url: webhookUrl,
        events: ['messages', 'connection'],
        excludeMessages: ['wasSentByApi']
      });

      console.log(`✅ Webhook configured successfully for instance: ${instance.instanceName}`);

      // Update instance with webhook URL
      await storage.updateWhatsappInstance(instanceId, { webhook: webhookUrl });

      res.json({
        message: "Webhook configurado com sucesso",
        webhookUrl,
        uazapiResponse: webhookData
      });

    } catch (error: any) {
      console.error("Error configuring webhook:", error);
      res.status(500).json({
        message: "Erro ao configurar webhook",
        details: error.message
      });
    }
  });

  // Update n8n webhook URL for instance
  app.put('/api/company/whatsapp/instances/:id/n8n-webhook', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const instanceId = parseInt(req.params.id);
      const { n8nWebhookUrl, n8nWebhookEnabled } = req.body;

      // Verify instance belongs to company
      const instance = await storage.getWhatsappInstance(instanceId);
      if (!instance || instance.companyId !== companyId) {
        return res.status(404).json({ message: "Instância não encontrada" });
      }

      // Build update object
      const updateData: any = {};
      if (n8nWebhookUrl !== undefined) {
        updateData.n8nWebhookUrl = n8nWebhookUrl || null;
      }
      if (n8nWebhookEnabled !== undefined) {
        updateData.n8nWebhookEnabled = n8nWebhookEnabled;
      }

      // Update n8n webhook settings
      await db.update(whatsappInstances)
        .set(updateData)
        .where(eq(whatsappInstances.id, instanceId));

      console.log(`🔗 Updated n8n webhook for instance ${instance.instanceName}:`, {
        url: n8nWebhookUrl,
        enabled: n8nWebhookEnabled
      });

      res.json({
        message: "Webhook N8N atualizado com sucesso",
        n8nWebhookUrl,
        n8nWebhookEnabled
      });

    } catch (error: any) {
      console.error("Error updating n8n webhook:", error);
      res.status(500).json({
        message: "Erro ao atualizar webhook N8N",
        details: error.message
      });
    }
  });

  app.delete('/api/company/whatsapp/instances/:id', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const instanceId = parseInt(req.params.id);
      const instance = await storage.getWhatsappInstance(instanceId);
      
      if (!instance || instance.companyId !== companyId) {
        return res.status(404).json({ message: "Instância não encontrada" });
      }

      console.log(`🗑️ Deleting WhatsApp instance: ${instance.instanceName}`);

      // Delete from UAZAPI first (if we have a token)
      if (instance.instanceToken) {
        try {
          const uazapi = await getUazapiService();
          await uazapi.deleteInstance(instance.instanceToken);
          console.log(`✅ Instance deleted from UAZAPI`);
        } catch (uazapiError) {
          console.error("⚠️ Error deleting from UAZAPI:", uazapiError);
          // Continue with database deletion even if UAZAPI fails
        }
      }

      // Delete from database
      await storage.deleteWhatsappInstance(instanceId);
      console.log(`✅ Instance deleted from database`);

      res.json({ message: "Instância do WhatsApp excluída com sucesso" });
    } catch (error) {
      console.error("Error deleting WhatsApp instance:", error);
      res.status(500).json({ message: "Erro ao excluir instância do WhatsApp" });
    }
  });

  // Configure WhatsApp instance settings
  // UAZAPI não tem /settings/set genérico — configura webhook e delay settings
  app.post('/api/company/whatsapp/instances/:instanceName/configure', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { instanceName } = req.params;

      console.log(`⚙️ Configuring WhatsApp instance: ${instanceName}`);

      // Get global settings for UAZAPI
      const globalSettings = await storage.getGlobalSettings();
      if (!globalSettings?.uazapiUrl || !globalSettings?.uazapiAdminToken) {
        return res.status(400).json({ message: "Configurações da UAZAPI não encontradas" });
      }

      // Verify instance belongs to company
      const instances = await storage.getWhatsappInstancesByCompany(companyId);
      const instance = instances.find(i => i.instanceName === instanceName);

      if (!instance) {
        return res.status(404).json({ message: "Instância não encontrada" });
      }

      if (!instance.instanceToken) {
        return res.status(400).json({ message: "Token da instância não encontrado. Recrie a instância." });
      }

      const uazapi = await getUazapiService();
      const results: any = {};

      // 1. Configure webhook (most important)
      try {
        const webhookUrl = await generateWebhookUrl(req, instanceName);
        await uazapi.configureWebhook(instance.instanceToken, {
          url: webhookUrl,
          events: ['messages', 'connection'],
          excludeMessages: ['wasSentByApi']
        });
        results.webhook = { success: true, url: webhookUrl };
        console.log(`✅ Webhook configured: ${webhookUrl}`);

        // Update webhook URL in database
        await storage.updateWhatsappInstance(instance.id, { webhook: webhookUrl });
      } catch (webhookError: any) {
        console.error(`❌ Webhook configure error:`, webhookError);
        results.webhook = { success: false, error: webhookError.message };
      }

      // 2. Configure delay settings (optional)
      try {
        const baseUrl = globalSettings.uazapiUrl.replace(/\/+$/, '');
        const delayRes = await fetch(`${baseUrl}/instance/updateDelaySettings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instance.instanceToken },
          body: JSON.stringify({ msg_delay_min: 1, msg_delay_max: 3 })
        });
        if (delayRes.ok) {
          results.delay = { success: true };
          console.log(`✅ Delay settings configured`);
        }
      } catch (delayError) {
        console.warn(`⚠️ Delay settings failed (non-critical):`, delayError);
      }

      // 3. Get instance status
      try {
        const status = await uazapi.getStatus(instance.instanceToken);
        results.status = status;
      } catch (statusError) {
        console.warn(`⚠️ Could not get status:`, statusError);
      }

      const allSuccess = results.webhook?.success !== false;

      console.log(`${allSuccess ? '✅' : '⚠️'} WhatsApp instance configuration completed:`, results);

      res.json({
        message: allSuccess
          ? "Configurações do WhatsApp aplicadas com sucesso"
          : "Configuração parcial — verifique os detalhes",
        result: results
      });
    } catch (error) {
      console.error("Error configuring WhatsApp instance:", error);
      res.status(500).json({ message: "Erro ao configurar instância do WhatsApp" });
    }
  });

  // Send review invitation
  app.post('/api/appointments/:id/send-review-invitation', async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const appointmentId = parseInt(req.params.id);
      console.log(`📧 Sending review invitation for appointment: ${appointmentId}`);

      const result = await storage.sendReviewInvitation(appointmentId);

      if (result.success) {
        res.json({ message: result.message });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error: any) {
      console.error("Error sending review invitation:", error);
      res.status(500).json({ message: "Erro interno ao enviar convite de avaliação" });
    }
  });

  // Public route to get review invitation data
  app.get('/api/public/review/:token', async (req, res) => {
    try {
      const token = req.params.token;
      console.log(`📋 Fetching review invitation data for token: ${token ? token.substring(0, 8) + '...' : 'none'}`);

      const result = await storage.getReviewInvitationByToken(token);

      if (result) {
        res.json(result);
      } else {
        res.status(404).json({ message: "Convite de avaliação não encontrado ou já expirado" });
      }
    } catch (error: any) {
      console.error("Error fetching review invitation:", error);
      res.status(500).json({ message: "Erro ao carregar dados da avaliação" });
    }
  });

  // Public route to submit review
  app.post('/api/public/review/:token', async (req, res) => {
    try {
      const token = req.params.token;
      const { rating, comment } = req.body;

      console.log(`⭐ Submitting review for token: ${token ? token.substring(0, 8) + '...' : 'none'}, rating: ${rating}`);

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Avaliação deve ser entre 1 e 5 estrelas" });
      }

      const result = await storage.submitReview(token, rating, comment);

      if (result.success) {
        res.json({ message: result.message });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error: any) {
      console.error("Error submitting review:", error);
      res.status(500).json({ message: "Erro ao enviar avaliação" });
    }
  });



  // Get admin plans (admin only)
  app.get('/api/admin/plans', isAuthenticated, async (req, res) => {
    try {
      console.log('🎯 Fetching admin plans...');

      // Get all plans from database
      const plans = await db.execute(sql`
        SELECT
          id,
          name,
          price,
          is_active
        FROM plans
        ORDER BY price ASC
      `);

      const plansArray = Array.isArray(plans[0]) ? plans[0] : plans as any[];
      console.log(`Found ${plansArray.length} plans for admin`);

      const formattedPlans = plansArray.map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        price: plan.price.toString(),
        isActive: plan.is_active === 1
      }));

      res.json(formattedPlans);

    } catch (error: any) {
      console.error("Error fetching admin plans:", error);
      res.status(500).json({
        message: "Erro ao buscar planos",
        error: error.message
      });
    }
  });

  // Get available plans for company subscription upgrade (public endpoint)
  app.get('/api/plans', async (req, res) => {
    try {
      console.log('🎯 Fetching available plans for subscription...');
      
      const plans = await db.execute(sql`
        SELECT 
          id,
          name,
          price,
          annual_price,
          max_professionals,
          CASE 
            WHEN name LIKE '%Premium%' OR name LIKE '%Profissional%' THEN 1
            ELSE 0
          END as is_recommended
        FROM plans 
        WHERE is_active = 1
        ORDER BY 
          CAST(REPLACE(price, '.', '') AS UNSIGNED) ASC
      `);

      const plansArray = Array.isArray(plans[0]) ? plans[0] : plans as any[];
      console.log(`Found ${plansArray.length} available plans`);

      const formattedPlans = plansArray.map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        price: plan.price,
        annualPrice: plan.annual_price,
        maxProfessionals: plan.max_professionals || 1,
        isRecommended: plan.is_recommended === 1
      }));

      res.json(formattedPlans);

    } catch (error: any) {
      console.error("Error fetching available plans:", error);
      res.status(500).json({ 
        message: "Erro ao buscar planos disponíveis",
        error: error.message 
      });
    }
  });

  // Upgrade company subscription
  app.post('/api/subscription/upgrade', isCompanyAuthenticated, async (req, res) => {
    try {
      const { planId, billingPeriod, installments } = req.body;
      const companyId = req.session.companyId;

      console.log(`🔄 Starting subscription upgrade for company ${companyId} to plan ${planId} (${billingPeriod})`);

      // Get the target plan
      const planResult = await db.execute(sql`
        SELECT * FROM plans WHERE id = ${planId} AND is_active = 1
      `);

      const plansArray = Array.isArray(planResult[0]) ? planResult[0] : planResult as any[];
      if (plansArray.length === 0) {
        return res.status(404).json({ message: "Plano não encontrado" });
      }

      const plan = plansArray[0];
      const isAnnual = billingPeriod === 'annual';
      const basePrice = isAnnual && plan.annual_price ? parseFloat(plan.annual_price) : parseFloat(plan.price);

      // TODO: Integrar com Asaas
      res.json({
        message: 'Integração de pagamento em desenvolvimento (Asaas)',
        planName: plan.name,
        amount: basePrice,
        billingPeriod: isAnnual ? 'annual' : 'monthly',
        freeDays: plan.free_days || 0
      });

    } catch (error: any) {
      console.error("Error upgrading subscription:", error);
      res.status(500).json({
        message: "Erro ao fazer upgrade da assinatura",
        error: error.message
      });
    }
  });

  // Create Asaas customer and start subscription
  app.post('/api/company/subscribe', isCompanyAuthenticated, async (req, res) => {
    try {
      const { planId, billingType, paymentMethod, installments, creditCard } = req.body;
      const companyId = req.session.companyId;

      console.log(`🔄 Starting subscription for company ${companyId} to plan ${planId}`);

      // Get company data
      const companyResult = await db.execute(sql`
        SELECT * FROM companies WHERE id = ${companyId}
      `);
      const companiesArray = Array.isArray(companyResult[0]) ? companyResult[0] : companyResult as any[];
      if (companiesArray.length === 0) {
        return res.status(404).json({ message: "Empresa não encontrada" });
      }
      const company = companiesArray[0];

      // Get plan data
      const planResult = await db.execute(sql`
        SELECT * FROM plans WHERE id = ${planId} AND is_active = 1
      `);
      const plansArray = Array.isArray(planResult[0]) ? planResult[0] : planResult as any[];
      if (plansArray.length === 0) {
        return res.status(404).json({ message: "Plano não encontrado" });
      }
      const plan = plansArray[0];

      // Calculate price
      const isAnnual = billingType === 'annual';
      const totalAmount = isAnnual && plan.annual_price
        ? parseFloat(plan.annual_price)
        : parseFloat(plan.price);

      // Step 1: Create or get Asaas customer
      let asaasCustomerId = company.asaas_customer_id;

      if (!asaasCustomerId) {
        console.log('📝 Creating customer in Asaas...');

        const asaasCustomer = await asaasService.createCustomer({
          name: company.fantasy_name,
          email: company.email,
          cpfCnpj: company.document,
          mobilePhone: company.phone,
          postalCode: company.zip_code,
          addressNumber: company.number,
          externalReference: `company_${companyId}`,
          notificationDisabled: false
        });

        asaasCustomerId = asaasCustomer.id;

        // Save Asaas customer ID to database
        await db.execute(sql`
          UPDATE companies
          SET asaas_customer_id = ${asaasCustomerId}
          WHERE id = ${companyId}
        `);

        console.log('✅ Customer created in Asaas:', asaasCustomerId);
      } else {
        console.log('ℹ️ Customer already exists in Asaas:', asaasCustomerId);
      }

      // Step 2: Create subscription in Asaas
      console.log('📝 Creating subscription in Asaas...');

      // Calculate next due date (today for immediate billing)
      const today = new Date();
      const nextDueDate = formatDateLocal(today); // YYYY-MM-DD

      // Determine cycle
      const cycle = isAnnual ? 'YEARLY' : 'MONTHLY';

      // Prepare subscription data
      const subscriptionData: any = {
        customer: asaasCustomerId,
        billingType: 'CREDIT_CARD',
        value: totalAmount,
        nextDueDate: nextDueDate,
        cycle: cycle,
        description: `Assinatura ${plan.name} - ${isAnnual ? 'Anual' : 'Mensal'}`,
        externalReference: `subscription_company_${companyId}_plan_${planId}`,
      };

      // Add credit card data if provided
      if (creditCard) {
        subscriptionData.creditCard = {
          holderName: creditCard.holderName,
          number: creditCard.number,
          expiryMonth: creditCard.expiryMonth,
          expiryYear: creditCard.expiryYear,
          ccv: creditCard.ccv
        };

        // Add credit card holder info (required by Asaas)
        subscriptionData.creditCardHolderInfo = {
          name: company.fantasy_name,
          email: company.email,
          cpfCnpj: company.document,
          postalCode: company.zip_code,
          addressNumber: company.number,
          phone: company.phone,
          mobilePhone: company.phone
        };

        console.log('💳 Including credit card data in subscription');
      }

      // Create subscription
      const asaasSubscription = await asaasService.createSubscription(subscriptionData);

      console.log('✅ Subscription created in Asaas:', asaasSubscription.id);

      // Save subscription ID to database
      await db.execute(sql`
        UPDATE companies
        SET
          asaas_subscription_id = ${asaasSubscription.id},
          plan_id = ${planId},
          plan_status = 'active',
          subscription_status = 'active'
        WHERE id = ${companyId}
      `);

      res.json({
        success: true,
        message: 'Assinatura criada com sucesso',
        asaasCustomerId,
        asaasSubscriptionId: asaasSubscription.id,
        planName: plan.name,
        amount: totalAmount,
        billingType,
        cycle,
        nextDueDate,
        paymentMethod,
        installments: paymentMethod === 'credit_card' ? installments : 1
      });

    } catch (error: any) {
      console.error("❌ Error creating subscription:", error);
      res.status(500).json({
        message: "Erro ao criar assinatura",
        error: error.message
      });
    }
  });

  // Get company subscription status from Asaas
  app.get('/api/company/subscription-status', isCompanyAuthenticated, async (req, res) => {
    try {
      const companyId = req.session.companyId;
      console.log('🔍 Fetching subscription status for company:', companyId);

      // Get company data
      const companyResult = await db.execute(sql`
        SELECT
          c.*,
          p.name as plan_name,
          p.price as plan_price
        FROM companies c
        LEFT JOIN plans p ON c.plan_id = p.id
        WHERE c.id = ${companyId}
      `);
      const companiesArray = Array.isArray(companyResult[0]) ? companyResult[0] : companyResult as any[];
      if (companiesArray.length === 0) {
        return res.status(404).json({ message: "Empresa não encontrada" });
      }
      const company = companiesArray[0];

      console.log('📊 Company data:', {
        id: company.id,
        fantasy_name: company.fantasy_name,
        plan_id: company.plan_id,
        asaas_customer_id: company.asaas_customer_id,
        asaas_subscription_id: company.asaas_subscription_id,
        subscription_status: company.subscription_status
      });

      let asaasSubscriptionData = null;

      // If company has an Asaas subscription ID, fetch details from Asaas
      if (company.asaas_subscription_id) {
        try {
          console.log('📡 Fetching subscription from Asaas:', company.asaas_subscription_id);
          asaasSubscriptionData = await asaasService.getSubscription(company.asaas_subscription_id);
          console.log('✅ Asaas subscription data:', asaasSubscriptionData);
        } catch (error: any) {
          console.error('⚠️ Error fetching Asaas subscription:', error.message);
          // Continue without Asaas data if there's an error
        }
      } else {
        console.log('⚠️ No asaas_subscription_id found for company');
      }

      res.json({
        isActive: company.is_active === 1,
        status: company.subscription_status || 'inactive',
        planId: company.plan_id,
        planName: company.plan_name || 'Nenhum',
        planPrice: company.plan_price ? parseFloat(company.plan_price).toFixed(2) : '0.00',
        planStatus: company.plan_status,
        asaasSubscriptionId: company.asaas_subscription_id,
        asaasCustomerId: company.asaas_customer_id,
        // Asaas subscription details
        asaasData: asaasSubscriptionData ? {
          id: asaasSubscriptionData.id,
          status: asaasSubscriptionData.status,
          value: asaasSubscriptionData.value,
          cycle: asaasSubscriptionData.cycle,
          nextDueDate: asaasSubscriptionData.nextDueDate,
          billingType: asaasSubscriptionData.billingType,
          description: asaasSubscriptionData.description
        } : null
      });

    } catch (error: any) {
      console.error("❌ Error fetching subscription status:", error);
      res.status(500).json({
        message: "Erro ao buscar status da assinatura",
        error: error.message
      });
    }
  });

  // Cancel company subscription
  app.post('/api/company/cancel-subscription', isCompanyAuthenticated, async (req, res) => {
    try {
      const companyId = req.session.companyId;
      console.log('🔴 Cancelando assinatura para empresa:', companyId);

      // Get company data
      const companyResult = await db.execute(sql`
        SELECT asaas_subscription_id, asaas_customer_id, fantasy_name
        FROM companies
        WHERE id = ${companyId}
      `);
      const companiesArray = Array.isArray(companyResult[0]) ? companyResult[0] : companyResult as any[];
      if (companiesArray.length === 0) {
        return res.status(404).json({ message: "Empresa não encontrada" });
      }
      const company = companiesArray[0];

      if (!company.asaas_subscription_id) {
        return res.status(400).json({ message: "Nenhuma assinatura ativa encontrada" });
      }

      console.log('📋 Dados da empresa:', {
        id: companyId,
        fantasy_name: company.fantasy_name,
        asaas_subscription_id: company.asaas_subscription_id
      });

      // Cancel subscription in Asaas
      try {
        await asaasService.cancelSubscription(company.asaas_subscription_id);
        console.log('✅ Assinatura cancelada no Asaas');
      } catch (error: any) {
        console.error('⚠️ Erro ao cancelar assinatura no Asaas:', error.message);
        return res.status(500).json({
          message: "Erro ao cancelar assinatura no Asaas",
          error: error.message
        });
      }

      // Update company status in database
      await db.execute(sql`
        UPDATE companies
        SET
          subscription_status = 'inactive',
          plan_status = 'inactive',
          plan_id = NULL,
          asaas_subscription_id = NULL
        WHERE id = ${companyId}
      `);

      console.log('✅ Status da assinatura atualizado no banco de dados');

      res.json({
        success: true,
        message: 'Assinatura cancelada com sucesso'
      });

    } catch (error: any) {
      console.error("❌ Error cancelling subscription:", error);
      res.status(500).json({
        message: "Erro ao cancelar assinatura",
        error: error.message
      });
    }
  });

  // Test reminder function
  app.post('/api/company/test-reminder', isCompanyAuthenticated, async (req, res) => {
    try {
      const companyId = req.session.companyId;
      const { testPhone } = req.body;
      
      console.log(`🧪 Testing reminder function for company ${companyId}`, testPhone ? `with custom phone: ${testPhone}` : '');
      
      const result = await storage.testReminderFunction(companyId, testPhone);
      
      res.json(result);
    } catch (error: any) {
      console.error("Error testing reminder function:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor: " + error.message
      });
    }
  });

  // Test birthday message function
  app.post('/api/company/test-birthday-message', isCompanyAuthenticated, async (req, res) => {
    try {
      const companyId = req.session.companyId;
      const { testPhoneNumber } = req.body;
      
      if (!testPhoneNumber?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Número de telefone é obrigatório para o teste"
        });
      }
      
      console.log(`🎂 Testing birthday message for company ${companyId} to phone: ${testPhoneNumber}`);
      
      // Get birthday message template
      const birthdayMessages = await storage.getBirthdayMessagesByCompany(companyId);
      const activeMessage = birthdayMessages.find(msg => msg.isActive) || birthdayMessages[0];
      
      if (!activeMessage) {
        return res.status(400).json({
          success: false,
          message: "Nenhuma mensagem de aniversário configurada"
        });
      }
      
      // Get WhatsApp instance
      const whatsappInstances = await storage.getWhatsappInstancesByCompany(companyId);
      const whatsappInstance = whatsappInstances[0];
      
      if (!whatsappInstance) {
        return res.status(400).json({
          success: false,
          message: "Nenhuma instância do WhatsApp configurada"
        });
      }
      
      // Get global settings for UAZAPI
      const settings = await storage.getGlobalSettings();
      if (!settings?.uazapiUrl || !settings?.uazapiAdminToken) {
        return res.status(400).json({
          success: false,
          message: "Configurações da UAZAPI não encontradas"
        });
      }
      
      // Prepare test message
      let cleanPhone = testPhoneNumber.replace(/\D/g, '');
      if (cleanPhone.length >= 10 && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      }

      const testMessage = `🎂 TESTE - ${activeMessage.messageTemplate.replace('{NOME}', 'Cliente Teste').replace('{EMPRESA}', 'Empresa Teste')}`;

      // Send via UAZAPI
      // Send "typing" presence and wait 2 seconds
      await uazapiSendTyping(whatsappInstance.instanceName, cleanPhone, 2000);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const response = await uazapiSendText(whatsappInstance.instanceName, cleanPhone, testMessage);

      if (!response.ok) {
        console.log(`❌ API Error - Status: ${response.status}`);

        return res.json({
          success: false,
          message: `Erro da UAZAPI: Status ${response.status}`
        });
      }
      
      res.json({
        success: true,
        message: `Mensagem de teste enviada com sucesso para ${testPhoneNumber}!`
      });
      
    } catch (error: any) {
      console.error("Error testing birthday message:", error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor: " + error.message
      });
    }
  });

  // ===== PROFESSIONAL AUTHENTICATION ROUTES =====

  // Professional login
  app.post('/api/auth/professional/login', loginLimiter, validateBody(professionalLoginSchema), async (req, res) => {
    try {
      const { email, password } = req.body;

      // Use storage function instead of raw query
      const professional = await storage.getProfessionalByEmail(email);
      
      if (!professional) {
        console.log('❌ Professional not found for login attempt');
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }
      console.log(`👤 Found professional ID: ${professional.id}, hasPassword: ${!!professional.password}`);

      // Check if professional has a password set
      if (!professional.password) {
        console.log(`❌ No password set for professional ID: ${professional.id}`);
        return res.status(401).json({ message: "Acesso não configurado. Entre em contato com a empresa." });
      }

      // Verify password
      let passwordMatch = false;

      if (professional.password.startsWith('$2b$')) {
        // Password is hashed, use bcrypt compare
        passwordMatch = await bcrypt.compare(password, professional.password);
      } else {
        // Password is plain text, compare directly and then hash it
        if (password === professional.password) {
          passwordMatch = true;
          // Hash the password for future use
          const hashedPassword = await bcrypt.hash(password, 10);
          await storage.updateProfessional(professional.id, { password: hashedPassword });
        }
      }

      if (!passwordMatch) {
        return res.status(401).json({ message: "Email ou senha incorretos" });
      }

      // Check if professional is active
      if (!professional.active) {
        return res.status(401).json({ message: "Profissional inativo" });
      }

      // Regenerate session to prevent session fixation attacks
      const profToReturn = professional;
      req.session.regenerate((err: any) => {
        if (err) {
          console.error("Error regenerating session:", err);
          return res.status(500).json({ message: "Erro interno do servidor" });
        }
        req.session.professionalId = profToReturn.id;
        req.session.companyId = profToReturn.companyId;
        req.session.professionalName = profToReturn.name;
        req.session.professionalEmail = profToReturn.email;

        res.json({
          message: "Login realizado com sucesso",
          professional: {
            id: profToReturn.id,
            name: profToReturn.name,
            email: profToReturn.email,
            companyId: profToReturn.companyId
          }
        });
      });
    } catch (error) {
      console.error("Error in professional login:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Professional logout
  app.post('/api/auth/professional/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).json({ message: "Erro ao fazer logout" });
      }
      res.clearCookie('connect.sid');
      res.json({ message: "Logout realizado com sucesso" });
    });
  });

  // Check professional authentication status
  app.get('/api/auth/professional/status', (req: any, res) => {
    if (req.session.professionalId) {
      res.json({
        isAuthenticated: true,
        professional: {
          id: req.session.professionalId,
          name: req.session.professionalName,
          email: req.session.professionalEmail,
          companyId: req.session.companyId
        }
      });
    } else {
      res.json({ isAuthenticated: false });
    }
  });

  // Middleware to check professional authentication
  const isProfessionalAuthenticated = (req: any, res: any, next: any) => {
    console.log('🔐 Professional auth check:', { 
      professionalId: req.session.professionalId, 
      companyId: req.session.companyId 
    });
    
    if (req.session.professionalId && req.session.companyId) {
      next();
    } else {
      res.status(401).json({ message: "Acesso negado. Faça login como profissional." });
    }
  };

  // ===== PROFESSIONAL DASHBOARD ROUTES =====

  // Get professional's appointments
  app.get('/api/professional/appointments', isProfessionalAuthenticated, async (req: any, res) => {
    try {
      const professionalId = req.session.professionalId;
      const companyId = req.session.companyId;
      const appointments = await storage.getAppointmentsByProfessional(professionalId, companyId);
      res.json(appointments);
    } catch (error) {
      console.error("Error fetching professional appointments:", error);
      res.status(500).json({ message: "Erro ao buscar agendamentos" });
    }
  });

  // Get professional's company services
  app.get('/api/professional/services', isProfessionalAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      const services = await storage.getServicesByCompany(companyId);
      res.json(services);
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ message: "Erro ao buscar serviços" });
    }
  });

  // Get professional's clients (apenas clientes que agendaram com este profissional)
  app.get('/api/professional/clients', isProfessionalAuthenticated, async (req: any, res) => {
    try {
      const professionalId = req.session.professionalId;
      const companyId = req.session.companyId;

      if (!professionalId || !companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      // Buscar todos os agendamentos do profissional (passa os 2 parâmetros)
      const appointments = await storage.getAppointmentsByProfessional(professionalId, companyId);

      // Extrair telefones únicos dos clientes que agendaram com este profissional
      const clientPhones = [...new Set(appointments.map((apt: any) => apt.clientPhone).filter(Boolean))];

      // Se não houver agendamentos, retorna array vazio
      if (clientPhones.length === 0) {
        return res.json([]);
      }

      // Buscar todos os clientes da empresa
      const allClients = await storage.getClientsByCompany(companyId);

      // Filtrar apenas os clientes que têm telefone nos agendamentos do profissional
      const professionalClients = allClients.filter((client: any) =>
        client.phone && clientPhones.includes(client.phone)
      );

      res.json(professionalClients);
    } catch (error) {
      console.error("Error fetching professional clients:", error);
      res.status(500).json({ message: "Erro ao buscar clientes" });
    }
  });

  // Create new client (professional)
  app.post('/api/professional/clients', isProfessionalAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      
      const clientData = {
        ...req.body,
        companyId,
        email: req.body.email === '' ? null : req.body.email,
        phone: req.body.phone === '' ? null : req.body.phone,
      };

      const client = await storage.createClient(clientData);
      res.status(201).json(client);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ message: "Erro ao criar cliente" });
    }
  });

  // Get professional's company appointment statuses
  app.get('/api/professional/appointment-statuses', isProfessionalAuthenticated, async (req: any, res) => {
    try {
      const professionalId = req.session.professionalId;
      console.log('🔍 Professional requesting statuses, ID:', professionalId);
      
      if (!professionalId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      // Get all available status (they are global, not company-specific)
      const statuses = await storage.getStatus();
      console.log('📋 Found statuses:', statuses.length);
      
      res.json(statuses);
    } catch (error) {
      console.error("Error fetching appointment statuses:", error);
      res.status(500).json({ message: "Erro ao buscar status de agendamentos" });
    }
  });

  // Create new appointment (professional)
  app.post('/api/professional/appointments', isProfessionalAuthenticated, async (req: any, res) => {
    try {
      const professionalId = req.session.professionalId;
      const companyId = req.session.companyId;
      const { clientName, clientPhone, clientEmail, serviceId, appointmentDate, appointmentTime, notes } = req.body;

      console.log('🔄 Professional creating appointment:', { clientName, serviceId, appointmentDate });

      // Validate required fields
      if (!clientName || !clientPhone || !serviceId || !appointmentDate || !appointmentTime) {
        return res.status(400).json({ message: "Preencha todos os campos obrigatórios" });
      }

      // Create or get existing client before creating appointment
      try {
        const normalizePhoneForClient = (phone: string) => phone.replace(/\D/g, '');
        const normalizedClientPhone = normalizePhoneForClient(clientPhone);

        const existingClients = await storage.getClientsByCompany(companyId);
        const existingClient = existingClients.find(c =>
          c.phone && normalizePhoneForClient(c.phone) === normalizedClientPhone
        );

        if (!existingClient) {
          const client = await storage.createClient({
            companyId,
            name: clientName,
            phone: clientPhone,
            email: clientEmail || null,
            birthDate: null,
            notes: 'Cliente criado via agendamento do profissional'
          });
          console.log('👤 Novo cliente criado:', client.name);
        } else {
          console.log('👤 Cliente existente encontrado:', existingClient.name);
        }
      } catch (clientError) {
        console.error('⚠️ Erro ao criar cliente (continuando com agendamento):', clientError);
      }

      // Get service details for duration, price and expense
      const service = await storage.getService(parseInt(serviceId));

      // Create appointment with all required fields
      const appointmentData = {
        companyId,
        professionalId: parseInt(professionalId),
        serviceId: parseInt(serviceId),
        clientName,
        clientPhone,
        clientEmail: clientEmail || null,
        appointmentDate: appointmentDate, // Mantém como string YYYY-MM-DD para evitar conversão de timezone
        appointmentTime,
        duration: service?.duration || 60,
        status: "Agendado", // default status
        totalPrice: service?.price ? String(service.price) : "0.00",
        expense: service?.expense ? String(service.expense) : "0.00",
        notes: notes || "",
        reminderSent: 0
      };

      const appointment = await storage.createAppointment(appointmentData);
      console.log('✅ Appointment created successfully by professional');

      // 🔔 Send to n8n webhook if configured and enabled
      try {
        const company = await storage.getCompanyById(companyId);

        if (company?.n8nWebhookEnabled && company?.n8nWebhookUrl) {
          const [service] = await db.select().from(services).where(eq(services.id, parseInt(serviceId)));
          const [professional] = await db.select().from(professionals).where(eq(professionals.id, professionalId));

          const webhookPayload = {
            event: 'appointment.created',
            timestamp: new Date().toISOString(),
            createdBy: 'professional',
            appointment: {
              id: appointment.id,
              clientName: appointment.clientName,
              clientPhone: appointment.clientPhone,
              clientEmail: appointment.clientEmail,
              appointmentDate: appointment.appointmentDate,
              appointmentTime: appointment.appointmentTime,
              status: appointment.status,
              duration: appointment.duration,
              totalPrice: appointment.totalPrice,
              notes: appointment.notes
            },
            service: {
              id: service?.id,
              name: service?.name,
              price: service?.price
            },
            professional: {
              id: professional?.id,
              name: professional?.name
            },
            company: {
              id: companyId,
              name: company.fantasyName
            }
          };

          // Set DEBUG_N8N_WEBHOOK=true in .env to see detailed logs
          if (process.env.DEBUG_N8N_WEBHOOK === 'true') {
            console.log('🔍 [PROFESSIONAL] Sending to n8n webhook');
            console.log('📦 [PROFESSIONAL] Payload keys:', Object.keys(webhookPayload).join(', '));
          }

          const response = await fetch(company.n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload)
          });

          if (!response.ok) {
            console.error('⚠️ N8N webhook error:', response.status, response.statusText);
          } else if (process.env.DEBUG_N8N_WEBHOOK === 'true') {
            console.log('✅ [PROFESSIONAL] N8N webhook sent successfully');
          }
        }
      } catch (webhookError) {
        console.error('⚠️ Error processing n8n webhook:', webhookError);
      }

      res.status(201).json(appointment);
    } catch (error) {
      console.error("Error creating appointment:", error);
      res.status(500).json({ message: "Erro ao criar agendamento" });
    }
  });

  // Update appointment (professional)
  app.put('/api/professional/appointments/:id', isProfessionalAuthenticated, async (req: any, res) => {
    try {
      const appointmentId = parseInt(req.params.id);
      const professionalId = req.session.professionalId;
      const { clientName, clientPhone, notes, status, appointmentDate, appointmentTime } = req.body;

      console.log('🔄 Professional updating appointment:', appointmentId, '- fields:', Object.keys(req.body).join(', '));

      // Verify appointment belongs to this professional
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment || appointment.professionalId !== professionalId) {
        return res.status(403).json({ message: "Acesso negado a este agendamento" });
      }

      const updateData: any = {};
      if (clientName) updateData.clientName = clientName;
      if (clientPhone) updateData.clientPhone = clientPhone;
      if (notes !== undefined) updateData.notes = notes;
      if (status) updateData.status = status;
      if (appointmentDate) updateData.appointmentDate = appointmentDate; // Mantém como string YYYY-MM-DD
      if (appointmentTime) updateData.appointmentTime = appointmentTime;

      console.log('🔄 Update data prepared:', updateData);

      const updatedAppointment = await storage.updateAppointment(appointmentId, updateData);
      console.log('✅ Appointment updated successfully');
      res.json(updatedAppointment);
    } catch (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ message: "Erro ao atualizar agendamento" });
    }
  });

  // Update appointment status (professional)
  app.patch('/api/professional/appointments/:id/status', isProfessionalAuthenticated, async (req: any, res) => {
    try {
      const appointmentId = parseInt(req.params.id);
      const professionalId = req.session.professionalId;
      const { statusId } = req.body;

      // Verify appointment belongs to this professional
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment || appointment.professionalId !== professionalId) {
        return res.status(403).json({ message: "Acesso negado a este agendamento" });
      }

      const updatedAppointment = await storage.updateAppointmentStatus(appointmentId, statusId);
      res.json(updatedAppointment);
    } catch (error) {
      console.error("Error updating appointment status:", error);
      res.status(500).json({ message: "Erro ao atualizar status do agendamento" });
    }
  });


  // Public company registration endpoint
  app.post('/api/public/register', validateBody(publicRegisterSchema), async (req, res) => {
    try {
      const {
        fantasyName,
        document,
        email,
        password,
        phone
      } = req.body;

      // Check if company already exists
      const [existingCompany] = await pool.execute(
        'SELECT id FROM companies WHERE email = ?',
        [email]
      );

      if ((existingCompany as any[]).length > 0) {
        return res.status(400).json({ message: 'Email já está em uso' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Get default plan (first active plan)
      const [plans] = await pool.execute(
        'SELECT id FROM plans WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
      );
      
      const defaultPlanId = plans && (plans as any[]).length > 0 ? (plans as any[])[0].id : 1;

      // Get plan free days to calculate trial expiration
      const [planDetails] = await pool.execute(
        'SELECT free_days FROM plans WHERE id = ?',
        [defaultPlanId]
      );
      
      const freeDays = planDetails && (planDetails as any[]).length > 0 ? (planDetails as any[])[0].free_days : 7;
      
      // Create company with trial status and expiration date
      const [companyResult] = await pool.execute(`
        INSERT INTO companies (
          fantasy_name, document, email, password, phone, plan_id, is_active, 
          plan_status, subscription_status, trial_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 'trial', 'trial', DATE_ADD(NOW(), INTERVAL ? DAY))
      `, [
        fantasyName, document, email, hashedPassword, phone, defaultPlanId, freeDays
      ]);

      const companyId = (companyResult as any).insertId;
      console.log('Company created with ID:', companyId);

      // Set default birthday message and AI prompt from admin settings
      try {
        const [globalSettings] = await pool.execute(
          'SELECT default_birthday_message, default_ai_prompt FROM global_settings LIMIT 1'
        );
        
        if ((globalSettings as any[]).length > 0) {
          const settings = (globalSettings as any[])[0];
          
          if (settings.default_birthday_message) {
            await pool.execute(
              'UPDATE companies SET birthday_message = ? WHERE id = ?',
              [settings.default_birthday_message, companyId]
            );
          }
          
          if (settings.default_ai_prompt) {
            await pool.execute(
              'UPDATE companies SET ai_agent_prompt = ? WHERE id = ?',
              [settings.default_ai_prompt, companyId]
            );
          }
          
          console.log('Default settings applied to new company:', companyId);
        }
      } catch (settingsError) {
        console.error('Error applying default settings:', settingsError);
        // Continue with registration even if default settings fail
      }

      res.json({
        message: 'Empresa cadastrada com sucesso',
        companyId
      });

    } catch (error: any) {
      console.error('Public registration error:', error);
      res.status(500).json({ 
        message: 'Erro ao cadastrar empresa',
        error: error.message 
      });
    }
  });


  // Register Mercado Pago routes
  const asaasRouter = await import('./mp-routes');
  app.use(asaasRouter.default);

  // ===== TRAINING VIDEOS ROUTES =====

  // Get all training videos
  app.get('/api/admin/training-videos', isAuthenticated, async (req, res) => {
    try {
      const videos = await db.select().from(trainingVideos).orderBy(desc(trainingVideos.createdAt));
      res.json(videos);
    } catch (error: any) {
      console.error('Error fetching training videos:', error);
      res.status(500).json({ message: 'Erro ao buscar vídeos de treinamento' });
    }
  });

  // Get single training video
  app.get('/api/admin/training-videos/:id', isAuthenticated, async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const [video] = await db.select().from(trainingVideos).where(eq(trainingVideos.id, videoId));

      if (!video) {
        return res.status(404).json({ message: 'Vídeo não encontrado' });
      }

      res.json(video);
    } catch (error: any) {
      console.error('Error fetching training video:', error);
      res.status(500).json({ message: 'Erro ao buscar vídeo de treinamento' });
    }
  });

  // Create training video
  app.post('/api/admin/training-videos', isAuthenticated, async (req, res) => {
    try {
      const { name, youtubeUrl, description, menuLocation } = req.body;

      if (!name || !youtubeUrl || !menuLocation) {
        return res.status(400).json({ message: 'Nome, URL do YouTube e Menu são obrigatórios' });
      }

      const result = await db.insert(trainingVideos).values({
        name,
        youtubeUrl,
        description: description || null,
        menuLocation,
        isActive: true,
      });

      const insertId = (result as any).insertId;
      const [newVideo] = await db.select().from(trainingVideos).where(eq(trainingVideos.id, insertId));

      res.json(newVideo);
    } catch (error: any) {
      console.error('Error creating training video:', error);
      res.status(500).json({ message: 'Erro ao criar vídeo de treinamento' });
    }
  });

  // Update training video
  app.put('/api/admin/training-videos/:id', isAuthenticated, async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      const { name, youtubeUrl, description, menuLocation, isActive } = req.body;

      await db
        .update(trainingVideos)
        .set({
          name,
          youtubeUrl,
          description,
          menuLocation,
          isActive,
        })
        .where(eq(trainingVideos.id, videoId));

      const [updatedVideo] = await db.select().from(trainingVideos).where(eq(trainingVideos.id, videoId));
      res.json(updatedVideo);
    } catch (error: any) {
      console.error('Error updating training video:', error);
      res.status(500).json({ message: 'Erro ao atualizar vídeo de treinamento' });
    }
  });

  // Delete training video
  app.delete('/api/admin/training-videos/:id', isAuthenticated, async (req, res) => {
    try {
      const videoId = parseInt(req.params.id);
      await db.delete(trainingVideos).where(eq(trainingVideos.id, videoId));
      res.json({ message: 'Vídeo excluído com sucesso' });
    } catch (error: any) {
      console.error('Error deleting training video:', error);
      res.status(500).json({ message: 'Erro ao excluir vídeo de treinamento' });
    }
  });

  // Get training video by menu location (for company users)
  app.get('/api/training-videos/by-menu/:menuLocation', async (req, res) => {
    try {
      const menuLocation = req.params.menuLocation;
      const [video] = await db
        .select()
        .from(trainingVideos)
        .where(and(
          eq(trainingVideos.menuLocation, menuLocation),
          eq(trainingVideos.isActive, true)
        ))
        .orderBy(desc(trainingVideos.createdAt))
        .limit(1);

      if (!video) {
        return res.status(404).json({ message: 'Nenhum vídeo de treinamento encontrado para este menu' });
      }

      res.json(video);
    } catch (error: any) {
      console.error('Error fetching training video by menu:', error);
      res.status(500).json({ message: 'Erro ao buscar vídeo de treinamento' });
    }
  });

  // ====================================
  // Admin Alerts Routes
  // ====================================

  // Get all admin alerts
  app.get('/api/admin/alerts', isAuthenticated, async (req, res) => {
    try {
      const alerts = await db.select().from(adminAlerts).orderBy(desc(adminAlerts.createdAt));
      res.json(alerts);
    } catch (error: any) {
      console.error('Error fetching admin alerts:', error);
      res.status(500).json({ message: 'Erro ao buscar alertas' });
    }
  });

  // Create admin alert
  app.post('/api/admin/alerts', isAuthenticated, validateBody(createAlertSchema), async (req, res) => {
    try {
      const { title, message, type, showToAllCompanies, targetCompanyIds, startDate, endDate } = req.body;

      const result = await db.insert(adminAlerts).values({
        title,
        message,
        type: type || 'info',
        isActive: 1,
        showToAllCompanies: showToAllCompanies ? 1 : 0,
        targetCompanyIds: targetCompanyIds || [],
        startDate: startDate || null,
        endDate: endDate || null,
      });

      const insertId = (result as any).insertId;
      const [newAlert] = await db.select().from(adminAlerts).where(eq(adminAlerts.id, insertId));

      res.json(newAlert);
    } catch (error: any) {
      console.error('Error creating admin alert:', error);
      res.status(500).json({ message: 'Erro ao criar alerta' });
    }
  });

  // Update admin alert
  app.put('/api/admin/alerts/:id', isAuthenticated, async (req, res) => {
    try {
      const alertId = parseInt(req.params.id);
      const { title, message, type, showToAllCompanies, targetCompanyIds, startDate, endDate } = req.body;

      await db
        .update(adminAlerts)
        .set({
          title,
          message,
          type: type || 'info',
          showToAllCompanies: showToAllCompanies ? 1 : 0,
          targetCompanyIds: targetCompanyIds || [],
          startDate: startDate || null,
          endDate: endDate || null,
        })
        .where(eq(adminAlerts.id, alertId));

      const [updatedAlert] = await db.select().from(adminAlerts).where(eq(adminAlerts.id, alertId));
      res.json(updatedAlert);
    } catch (error: any) {
      console.error('Error updating admin alert:', error);
      res.status(500).json({ message: 'Erro ao atualizar alerta' });
    }
  });

  // Delete admin alert
  app.delete('/api/admin/alerts/:id', isAuthenticated, async (req, res) => {
    try {
      const alertId = parseInt(req.params.id);

      await db.delete(adminAlerts).where(eq(adminAlerts.id, alertId));
      res.json({ message: 'Alerta removido com sucesso' });
    } catch (error: any) {
      console.error('Error deleting admin alert:', error);
      res.status(500).json({ message: 'Erro ao remover alerta' });
    }
  });

  // Get company alerts (for companies to view)
  app.get('/api/company/alerts', isCompanyAuthenticated, async (req, res) => {
    try {
      const companyId = (req as any).session?.companyId;
      if (!companyId) {
        return res.status(401).json({ message: 'Não autenticado' });
      }

      const today = new Date();


      // Get active alerts
      const allAlerts = await db.select().from(adminAlerts).where(eq(adminAlerts.isActive, 1));

      // Filter alerts for this company
      const relevantAlerts = allAlerts.filter((alert: any) => {
        try {
          // Safely parse targetCompanyIds if it's a string
          let targetIds: number[] = [];
          if (alert.targetCompanyIds) {
            if (typeof alert.targetCompanyIds === 'string') {
              try {
                targetIds = JSON.parse(alert.targetCompanyIds);
              } catch (parseError) {
              }
            } else if (Array.isArray(alert.targetCompanyIds)) {
              targetIds = alert.targetCompanyIds;
            }
          }

          // Check if alert is for all companies or this specific company
          const isForCompany = alert.showToAllCompanies === 1 || targetIds.includes(companyId);

          if (!isForCompany) {
            return false;
          }

          // Check date range
          if (alert.startDate && new Date(alert.startDate) > today) {
            return false;
          }
          if (alert.endDate && new Date(alert.endDate) < today) {
            return false;
          }

          return true;
        } catch (err) {
          return false;
        }
      });


      // Get already viewed alerts
      const viewedAlerts = await db
        .select()
        .from(companyAlertViews)
        .where(eq(companyAlertViews.companyId, companyId));

      const viewedAlertIds = new Set(viewedAlerts.map((v: any) => v.alertId));

      // Filter out already viewed alerts
      const unseenAlerts = relevantAlerts.filter((alert: any) => !viewedAlertIds.has(alert.id));

      // Mark as viewed
      for (const alert of unseenAlerts) {
        try {
          await db.insert(companyAlertViews).values({
            companyId,
            alertId: alert.id,
          });
        } catch (insertError: any) {
          // Ignore duplicate key errors
          if (!insertError.message?.includes('Duplicate') && !insertError.message?.includes('duplicate')) {
          }
        }
      }

      res.json(unseenAlerts);
    } catch (error: any) {
      res.status(500).json({ message: 'Erro ao buscar alertas', error: error.message });
    }
  });

  // Get all companies (for alert targeting)
  app.get('/api/admin/companies', isAuthenticated, async (req, res) => {
    try {
      const allCompanies = await db.select().from(companies).orderBy(companies.fantasyName);
      res.json(allCompanies);
    } catch (error: any) {
      console.error('Error fetching companies:', error);
      res.status(500).json({ message: 'Erro ao buscar empresas' });
    }
  });

  // ============ FINANCIAL PASSWORD ENDPOINTS ============

  // Admin: Reset financial password for a company
  app.post('/api/companies/:id/reset-financial-password', isAuthenticated, async (req: any, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ message: "ID inválido" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada" });
      }

      await storage.updateCompany(companyId, {
        financialPassword: null,
      } as any);

      res.json({ message: "Senha financeiro resetada com sucesso. A empresa precisará criar uma nova senha." });
    } catch (error) {
      console.error("Error resetting financial password:", error);
      res.status(500).json({ message: "Erro ao resetar senha financeiro" });
    }
  });

  // Check financial password status
  app.get('/api/company/financial-password/status', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const company = await storage.getCompanyById(companyId);
      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada" });
      }

      res.json({
        enabled: company.financialPasswordEnabled === 1,
        hasPassword: !!company.financialPassword,
        verified: !!req.session.financialPasswordVerified,
      });
    } catch (error) {
      console.error("Error checking financial password status:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });

  // Set financial password (first time setup)
  app.post('/api/company/financial-password/set', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { password, confirmPassword } = req.body;

      if (!password || password.length < 4) {
        return res.status(400).json({ message: "Senha deve ter pelo menos 4 caracteres" });
      }

      if (password !== confirmPassword) {
        return res.status(400).json({ message: "Senhas não coincidem" });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      await storage.updateCompany(companyId, {
        financialPassword: hashedPassword,
      } as any);

      // Mark as verified in session since they just set it
      req.session.financialPasswordVerified = true;

      res.json({ message: "Senha financeiro definida com sucesso" });
    } catch (error) {
      console.error("Error setting financial password:", error);
      res.status(500).json({ message: "Erro ao definir senha financeiro" });
    }
  });

  // Verify financial password
  app.post('/api/company/financial-password/verify', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "Senha é obrigatória" });
      }

      const company = await storage.getCompanyById(companyId);
      if (!company || !company.financialPassword) {
        return res.status(400).json({ message: "Senha financeiro não configurada" });
      }

      const isValid = await bcrypt.compare(password, company.financialPassword);

      if (!isValid) {
        return res.status(401).json({ message: "Senha financeiro incorreta" });
      }

      // Store verification in session
      req.session.financialPasswordVerified = true;

      res.json({ message: "Senha verificada com sucesso", verified: true });
    } catch (error) {
      console.error("Error verifying financial password:", error);
      res.status(500).json({ message: "Erro ao verificar senha financeiro" });
    }
  });

  // ============ FINANCIAL API ENDPOINTS ============

  // Get financial categories
  app.get('/api/company/financial/categories', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const categories = await db
        .select()
        .from(financialCategories)
        .where(eq(financialCategories.companyId, companyId));

      res.json(categories);
    } catch (error: any) {
      console.error('Error fetching financial categories:', error);
      res.status(500).json({ message: 'Erro ao buscar categorias' });
    }
  });

  // Create financial category
  app.post('/api/company/financial/categories', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { name, description, color, isRecurring, recurringDay } = req.body;

      const [newCategory] = await db
        .insert(financialCategories)
        .values({
          companyId,
          name,
          description,
          color,
          isRecurring: isRecurring ? 1 : 0,
          recurringDay
        });

      res.json(newCategory);
    } catch (error: any) {
      console.error('Error creating financial category:', error);
      res.status(500).json({ message: 'Erro ao criar categoria' });
    }
  });

  // Update financial category
  app.put('/api/company/financial/categories/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const categoryId = parseInt(req.params.id);
      const { name, description, color, isRecurring, recurringDay } = req.body;

      await db
        .update(financialCategories)
        .set({
          name,
          description,
          color,
          isRecurring: isRecurring ? 1 : 0,
          recurringDay
        })
        .where(and(
          eq(financialCategories.id, categoryId),
          eq(financialCategories.companyId, companyId)
        ));

      const [updatedCategory] = await db
        .select()
        .from(financialCategories)
        .where(eq(financialCategories.id, categoryId));

      res.json(updatedCategory);
    } catch (error: any) {
      console.error('Error updating financial category:', error);
      res.status(500).json({ message: 'Erro ao atualizar categoria' });
    }
  });

  // Delete financial category
  app.delete('/api/company/financial/categories/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const categoryId = parseInt(req.params.id);

      await db
        .delete(financialCategories)
        .where(and(
          eq(financialCategories.id, categoryId),
          eq(financialCategories.companyId, companyId)
        ));

      res.json({ message: 'Categoria removida com sucesso' });
    } catch (error: any) {
      console.error('Error deleting financial category:', error);
      res.status(500).json({ message: 'Erro ao remover categoria' });
    }
  });

  // Get payment methods
  app.get('/api/company/financial/payment-methods', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const methods = await db
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.companyId, companyId));

      res.json(methods);
    } catch (error: any) {
      console.error('Error fetching payment methods:', error);
      res.status(500).json({ message: 'Erro ao buscar métodos de pagamento' });
    }
  });

  // Create payment method
  app.post('/api/company/financial/payment-methods', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { name, description, type, isActive } = req.body;

      const [newMethod] = await db
        .insert(paymentMethods)
        .values({ companyId, name, description, type, isActive: isActive ? 1 : 0 });

      res.json(newMethod);
    } catch (error: any) {
      console.error('Error creating payment method:', error);
      res.status(500).json({ message: 'Erro ao criar método de pagamento' });
    }
  });

  // Update payment method
  app.put('/api/company/financial/payment-methods/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const methodId = parseInt(req.params.id);
      const { name, description, type, isActive } = req.body;

      await db
        .update(paymentMethods)
        .set({ name, description, type, isActive: isActive ? 1 : 0 })
        .where(and(
          eq(paymentMethods.id, methodId),
          eq(paymentMethods.companyId, companyId)
        ));

      const [updatedMethod] = await db
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.id, methodId));

      res.json(updatedMethod);
    } catch (error: any) {
      console.error('Error updating payment method:', error);
      res.status(500).json({ message: 'Erro ao atualizar método de pagamento' });
    }
  });

  // Delete payment method
  app.delete('/api/company/financial/payment-methods/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const methodId = parseInt(req.params.id);

      await db
        .delete(paymentMethods)
        .where(and(
          eq(paymentMethods.id, methodId),
          eq(paymentMethods.companyId, companyId)
        ));

      res.json({ message: 'Método de pagamento removido com sucesso' });
    } catch (error: any) {
      console.error('Error deleting payment method:', error);
      res.status(500).json({ message: 'Erro ao remover método de pagamento' });
    }
  });

  // Get financial transactions
  app.get('/api/company/financial/transactions', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const transactions = await db
        .select({
          id: financialTransactions.id,
          description: financialTransactions.description,
          amount: financialTransactions.amount,
          type: financialTransactions.type,
          categoryId: financialTransactions.categoryId,
          date: financialTransactions.date,
          notes: financialTransactions.notes,
          createdAt: financialTransactions.createdAt,
          category: {
            id: financialCategories.id,
            name: financialCategories.name,
            color: financialCategories.color,
          },
        })
        .from(financialTransactions)
        .leftJoin(
          financialCategories,
          eq(financialTransactions.categoryId, financialCategories.id)
        )
        .where(eq(financialTransactions.companyId, companyId))
        .orderBy(desc(financialTransactions.date));

      // Formatar datas para YYYY-MM-DD
      const formattedTransactions = transactions.map((t: any) => {
        if (!t.date) return { ...t, date: null };

        // Se já for string YYYY-MM-DD, mantém como está
        if (typeof t.date === 'string') {
          // Extrai apenas YYYY-MM-DD se tiver timestamp
          return { ...t, date: t.date.split('T')[0] };
        }

        // Se for objeto Date, usa UTC para evitar offset de timezone
        // O MySQL armazena DATE sem timezone, então devemos usar UTC
        const d = t.date instanceof Date ? t.date : new Date(t.date);
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return { ...t, date: `${year}-${month}-${day}` };
      });

      res.json(formattedTransactions);
    } catch (error: any) {
      console.error('Error fetching transactions:', error);
      res.status(500).json({ message: 'Erro ao buscar transações' });
    }
  });

  // Create financial transaction
  app.post('/api/company/financial/transactions', isCompanyAuthenticated, validateBody(createTransactionSchema), async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const { description, amount, type, categoryId, date, notes } = req.body;

      const [newTransaction] = await db
        .insert(financialTransactions)
        .values({ companyId, description, amount, type, categoryId, date, notes });

      res.json(newTransaction);
    } catch (error: any) {
      console.error('Error creating transaction:', error);
      res.status(500).json({ message: 'Erro ao criar transação' });
    }
  });

  // Update financial transaction
  app.put('/api/company/financial/transactions/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const transactionId = parseInt(req.params.id);
      const { description, amount, type, categoryId, date, notes } = req.body;

      await db
        .update(financialTransactions)
        .set({ description, amount, type, categoryId, date, notes })
        .where(and(
          eq(financialTransactions.id, transactionId),
          eq(financialTransactions.companyId, companyId)
        ));

      const [updatedTransaction] = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.id, transactionId));

      res.json(updatedTransaction);
    } catch (error: any) {
      console.error('Error updating transaction:', error);
      res.status(500).json({ message: 'Erro ao atualizar transação' });
    }
  });

  // Delete financial transaction
  app.delete('/api/company/financial/transactions/:id', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const transactionId = parseInt(req.params.id);

      await db
        .delete(financialTransactions)
        .where(and(
          eq(financialTransactions.id, transactionId),
          eq(financialTransactions.companyId, companyId)
        ));

      res.json({ message: 'Transação removida com sucesso' });
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      res.status(500).json({ message: 'Erro ao remover transação' });
    }
  });

  // Get financial dashboard data
  app.get('/api/company/financial/dashboard', isCompanyAuthenticated, async (req: any, res) => {
    try {
      const companyId = req.session.companyId;
      if (!companyId) {
        return res.status(401).json({ message: "Não autenticado" });
      }

      const monthFilter = req.query.month as string; // Format: YYYY-MM or "all-all", "YYYY-all", "all-MM"

      // Parse month filter
      const [yearStr, monthStr] = monthFilter ? monthFilter.split('-') : [new Date().getFullYear().toString(), (new Date().getMonth() + 1).toString()];
      const year = yearStr === 'all' ? null : parseInt(yearStr);
      const month = monthStr === 'all' ? null : parseInt(monthStr);

      // Calculate revenue from completed appointments in the selected month
      const allAppointments = await storage.getAppointmentsByCompany(companyId);
      const monthlyAppointments = allAppointments.filter((apt: any) => {
        const aptDate = new Date(apt.appointmentDate);

        // Se ambos forem "all", retorna todos
        if (year === null && month === null) {
          return true;
        }

        // Se apenas mês for "all", filtra apenas por ano
        if (month === null && year !== null) {
          return aptDate.getFullYear() === year;
        }

        // Se apenas ano for "all", filtra apenas por mês
        if (year === null && month !== null) {
          return aptDate.getMonth() + 1 === month;
        }

        // Filtra por mês e ano específicos
        return aptDate.getFullYear() === year && aptDate.getMonth() + 1 === month;
      });

      const appointmentRevenue = monthlyAppointments
        .filter((apt: any) => ['Concluído', 'concluido'].includes(apt.status))
        .reduce((sum: number, apt: any) => sum + (parseFloat(apt.totalPrice) || 0), 0);

      // Calculate transaction-based income and expenses
      const allTransactions = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.companyId, companyId));

      const monthlyTransactions = allTransactions.filter((t: any) => {
        if (!t.date) return false;

        // Extrai ano e mês diretamente da data (evita problemas de timezone)
        let transYear: number, transMonth: number;
        if (typeof t.date === 'string') {
          const parts = t.date.split('T')[0].split('-');
          transYear = parseInt(parts[0]);
          transMonth = parseInt(parts[1]);
        } else {
          // Se for objeto Date, usa UTC
          const d = t.date instanceof Date ? t.date : new Date(t.date);
          transYear = d.getUTCFullYear();
          transMonth = d.getUTCMonth() + 1;
        }

        // Se ambos forem "all", retorna todos
        if (year === null && month === null) {
          return true;
        }

        // Se apenas mês for "all", filtra apenas por ano
        if (month === null && year !== null) {
          return transYear === year;
        }

        // Se apenas ano for "all", filtra apenas por mês
        if (year === null && month !== null) {
          return transMonth === month;
        }

        // Filtra por mês e ano específicos
        return transYear === year && transMonth === month;
      });

      const transactionIncome = monthlyTransactions
        .filter((t: any) => t.type === 'income')
        .reduce((sum: number, t: any) => sum + parseFloat(t.amount.toString()), 0);

      const transactionExpenses = monthlyTransactions
        .filter((t: any) => t.type === 'expense')
        .reduce((sum: number, t: any) => sum + parseFloat(t.amount.toString()), 0);

      // Calculate service expenses from appointments
      const serviceExpenses = monthlyAppointments
        .reduce((sum: number, apt: any) => sum + (parseFloat(apt.expense) || 0), 0);

      // Total calculations
      const totalIncome = appointmentRevenue + transactionIncome;
      const totalExpenses = transactionExpenses + serviceExpenses;
      const netProfit = totalIncome - totalExpenses;

      // Calculate previous month data for growth comparison
      let prevYear = year;
      let prevMonth = month;

      // Se não estiver em modo "all", calcular o mês anterior
      if (year !== null && month !== null) {
        if (month === 1) {
          prevMonth = 12;
          prevYear = year - 1;
        } else {
          prevMonth = month - 1;
        }
      }

      let incomeGrowth = 0;
      let expenseGrowth = 0;

      // Calcular crescimento apenas se não estiver em modo "all"
      if (year !== null && month !== null && prevYear !== null && prevMonth !== null) {
        // Buscar dados do mês anterior
        const prevMonthAppointments = allAppointments.filter((apt: any) => {
          const aptDate = new Date(apt.appointmentDate);
          return aptDate.getFullYear() === prevYear && aptDate.getMonth() + 1 === prevMonth;
        });

        const prevMonthTransactions = allTransactions.filter((t: any) => {
          if (!t.date) return false;

          // Extrai ano e mês diretamente da data (evita problemas de timezone)
          let transYear: number, transMonth: number;
          if (typeof t.date === 'string') {
            const parts = t.date.split('T')[0].split('-');
            transYear = parseInt(parts[0]);
            transMonth = parseInt(parts[1]);
          } else {
            const d = t.date instanceof Date ? t.date : new Date(t.date);
            transYear = d.getUTCFullYear();
            transMonth = d.getUTCMonth() + 1;
          }
          return transYear === prevYear && transMonth === prevMonth;
        });

        const prevAppointmentRevenue = prevMonthAppointments
          .reduce((sum: number, apt: any) => sum + (parseFloat(apt.totalPrice) || 0), 0);

        const prevTransactionIncome = prevMonthTransactions
          .filter((t: any) => t.type === 'income')
          .reduce((sum: number, t: any) => sum + parseFloat(t.amount.toString()), 0);

        const prevTransactionExpenses = prevMonthTransactions
          .filter((t: any) => t.type === 'expense')
          .reduce((sum: number, t: any) => sum + parseFloat(t.amount.toString()), 0);

        const prevServiceExpenses = prevMonthAppointments
          .reduce((sum: number, apt: any) => sum + (parseFloat(apt.expense) || 0), 0);

        const prevTotalIncome = prevAppointmentRevenue + prevTransactionIncome;
        const prevTotalExpenses = prevTransactionExpenses + prevServiceExpenses;

        // Calcular variação percentual
        if (prevTotalIncome > 0) {
          incomeGrowth = Number((((totalIncome - prevTotalIncome) / prevTotalIncome) * 100).toFixed(1));
        } else if (totalIncome > 0) {
          incomeGrowth = 100; // Se não havia receita no mês anterior e agora há, é 100% de crescimento
        }

        if (prevTotalExpenses > 0) {
          expenseGrowth = Number((((totalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100).toFixed(1));
        } else if (totalExpenses > 0) {
          expenseGrowth = 100; // Se não havia despesa no mês anterior e agora há, é 100% de crescimento
        }
      }

      res.json({
        monthlyIncome: totalIncome,
        incomeGrowth,
        monthlyExpenses: totalExpenses,
        expenseGrowth,
        netProfit,
        appointmentRevenue,
        transactionIncome,
        serviceExpenses,
        transactionExpenses,
        appointmentsCount: monthlyAppointments.length,
        transactionsCount: monthlyTransactions.length,
        totalTransactions: monthlyTransactions.length
      });
    } catch (error: any) {
      console.error('Error fetching dashboard data:', error);
      res.status(500).json({ message: 'Erro ao buscar dados do dashboard' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
