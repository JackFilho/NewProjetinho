/**
 * Instagram AI Handler
 *
 * Processa mensagens recebidas do Instagram DM através do agente de IA,
 * replicando o mesmo fluxo do WhatsApp (routes.ts).
 *
 * Funcionalidades:
 * - Resposta automática via IA (OpenAI)
 * - Comandos especiais (MOSTRAR_HORARIOS_LIVRES, LISTAR_AGENDAMENTOS, etc.)
 * - Detecção de confirmação e criação de agendamento
 * - Cancelamento e reagendamento
 * - Human takeover check
 * - Sync com Chatwoot
 */

import { storage } from '../storage';
import { pool } from '../db';
import {
  getBrazilDate,
  getAvailabilityInfoSmart,
  checkSpecificDateAvailability,
  checkSpecificTimeAvailability,
  getAvailableTimesForService,
  getAvailableTimesForMultipleServices,
  createAppointmentFromAIConfirmation,
  cacheAIResponse,
  syncMessageToChatwoot,
  listClientAppointments,
  listClientAppointmentsNumbered,
  cancelAppointmentById,
  validateAvailabilityInResponse,
  isConfirmationSummary,
  isConversationConcluded,
  clientHasFutureAppointment,
} from '../routes';
import { createMetaInstagramService } from './meta-instagram';
import type { NormalizedInstagramMessage } from './meta-instagram-webhook-handler';

// ===== Processing lock (evita processamento duplo) =====
const igProcessingLocks = new Map<string, boolean>();

// ===== Debounce de mensagens Instagram =====
const igMessageBuffers = new Map<string, { messages: string[]; timer: NodeJS.Timeout }>();
const IG_DEBOUNCE_MS = 5000; // 5 segundos

export interface InstagramAIHandlerParams {
  message: NormalizedInstagramMessage;
  company: any;
  instance: any;
  conversation: any;
}

/**
 * Handler principal: processa mensagem do Instagram via IA
 */
export async function handleInstagramAIMessage(params: InstagramAIHandlerParams): Promise<void> {
  const { message, company, instance, conversation } = params;
  const senderId = message.senderId;
  const contactName = message.contactName || message.username || senderId;
  const lockKey = `ig:${company.id}:${instance.id}:${senderId}`;

  // Ignorar ecos (mensagens enviadas por nós)
  if (message.isEcho) {
    console.log('[ig-ai] Ignoring echo message');
    return;
  }

  // Ignorar tipos não-texto que não precisam de resposta da IA
  if (message.type === 'reaction' || message.type === 'postback') {
    console.log(`[ig-ai] Ignoring ${message.type} message`);
    return;
  }

  // Verificar se empresa tem IA configurada
  if (!company.openaiApiKey) {
    console.log('[ig-ai] Company does not have OpenAI API key configured');
    return;
  }

  // Obter texto da mensagem
  let messageText = message.text || '';
  if (!messageText && message.media) {
    messageText = `[${message.media.type}]`;
  }
  if (!messageText) {
    console.log('[ig-ai] Empty message text, skipping AI processing');
    return;
  }

  // ===== Debounce: agrupar mensagens rápidas =====
  const bufferKey = `${company.id}:${senderId}`;

  return new Promise<void>((resolve) => {
    const existing = igMessageBuffers.get(bufferKey);

    if (existing) {
      existing.messages.push(messageText);
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        igMessageBuffers.delete(bufferKey);
        const grouped = existing.messages.join('\n');
        processInstagramAIMessage({ ...params, groupedText: grouped }).then(resolve).catch((err) => {
          console.error('[ig-ai] Error processing grouped messages:', err);
          resolve();
        });
      }, IG_DEBOUNCE_MS);
    } else {
      const buffer = {
        messages: [messageText],
        timer: setTimeout(() => {
          igMessageBuffers.delete(bufferKey);
          processInstagramAIMessage({ ...params, groupedText: buffer.messages.join('\n') }).then(resolve).catch((err) => {
            console.error('[ig-ai] Error processing message:', err);
            resolve();
          });
        }, IG_DEBOUNCE_MS),
      };
      igMessageBuffers.set(bufferKey, buffer);
    }
  });
}

/**
 * Processa a mensagem após debounce
 */
async function processInstagramAIMessage(
  params: InstagramAIHandlerParams & { groupedText: string }
): Promise<void> {
  const { message, company, instance, conversation, groupedText } = params;
  const senderId = message.senderId;
  const contactName = message.contactName || message.username || senderId;
  const lockKey = `ig:${company.id}:${instance.id}:${senderId}`;
  const messageText = groupedText;

  // ===== Lock de processamento =====
  if (igProcessingLocks.has(lockKey)) {
    console.log('[ig-ai] Already processing message for this sender, skipping');
    return;
  }
  igProcessingLocks.set(lockKey, true);

  try {
    // Criar serviço Instagram para enviar respostas
    const igService = createMetaInstagramService({
      igBusinessAccountId: instance.igBusinessAccountId,
      facebookPageId: instance.facebookPageId,
      pageAccessToken: instance.pageAccessToken,
    });

    // ===== Human takeover check =====
    if (conversation.takeoverMode === 'human') {
      const timeoutMs = (company.agentInactivityTimeout || 30) * 60 * 1000;
      const lastMessageTime = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
      const now = Date.now();

      if (now - lastMessageTime < timeoutMs) {
        console.log('[ig-ai] Conversation in human takeover mode, skipping AI');
        return;
      } else {
        console.log('[ig-ai] Human takeover timeout exceeded, reverting to AI mode');
        await storage.updateConversation(conversation.id, { takeoverMode: 'agent' });
      }
    }

    // ===== Buscar histórico da conversa =====
    const allMessages = await storage.getMessagesByConversation(conversation.id);
    const conversationHistory = allMessages
      .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
      .filter((msg: any) => {
        if (msg.role === 'assistant') {
          const isOldConfirmation = msg.content.includes('Agendamento Confirmado!') ||
            msg.content.includes('Obrigado por escolher nossos serviços');
          if (isOldConfirmation) return false;
        }
        return true;
      })
      .map((msg: any) => {
        const isLikelyHumanMessage = msg.role === 'assistant' &&
          conversation.takeoverMode === 'human' &&
          !msg.content.includes('Perfeito!') &&
          !msg.content.includes('Está tudo correto?') &&
          !msg.content.includes('Responda SIM') &&
          !msg.content.includes('👤') &&
          !msg.content.includes('📅');

        if (isLikelyHumanMessage) {
          return { role: msg.role as 'user' | 'assistant', content: `[MENSAGEM DO ATENDENTE HUMANO]: ${msg.content}` };
        }
        return { role: msg.role as 'user' | 'assistant', content: msg.content };
      });

    // ===== Detectar confirmação =====
    const confirmationPatterns = [
      /^(sim|sin|sím|sii|s|ok|confirmo|confirmar|confirmado)[!.?]*$/i,
      /^(sim|sin|sím|ok)[!.?]?,?\s*(pode|por favor|obrigado|está correto|confirmo)?[!.?]*$/i,
      /^(está correto|tudo certo|tudo correto|pode confirmar|confirmo sim)[!.?]*$/i,
      /^(sim|sin)[!.?]?,?\s*(tudo correto|tudo certo|tudo)[!.?]*$/i,
      /^tudo\s*(ok|certo|correto)[!.?]*$/i
    ];

    const messageLines = messageText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const isUserConfirming = confirmationPatterns.some(pattern =>
      pattern.test(messageText.toLowerCase().trim())
    ) || (messageLines.length > 1 && messageLines.some((line: string) =>
      confirmationPatterns.some(pattern => pattern.test(line.toLowerCase()))
    ));

    // ===== Interceptação de cancelamento/reagendamento =====
    const lowerMsg = messageText.toLowerCase().trim();
    const cancelKeywords = ['cancelar', 'desmarcar', 'não vou poder ir', 'preciso cancelar', 'não vou conseguir ir', 'não vou mais', 'quero desmarcar', 'preciso desmarcar'];
    const rescheduleKeywords = ['remarcar', 'reagendar', 'alterar horário', 'alterar horario', 'mudar data', 'trocar horário', 'trocar horario', 'mudar horário', 'mudar horario', 'adiar'];
    const hasCancelKeyword = cancelKeywords.some(kw => lowerMsg.includes(kw));
    const hasRescheduleKeyword = rescheduleKeywords.some(kw => lowerMsg.includes(kw));

    const lastBotMsg = conversationHistory.filter((m: any) => m.role === 'assistant').slice(-1)[0]?.content || '';
    const isAlreadyInCancelConfirmation = lastBotMsg.includes('Confirma o cancelamento?') ||
      lastBotMsg.includes('CANCELAR para confirmar') ||
      lastBotMsg.includes('SIM para cancelar');
    const isCancelAsConfirmation = isAlreadyInCancelConfirmation && /^(cancelar|cancela|cancelamento)$/i.test(lowerMsg);

    // Para Instagram, usamos o senderId como "phoneNumber" para lookup de agendamentos
    const igPhoneIdentifier = `ig:${senderId}`;

    let interceptedResponse: string | null = null;

    if (hasCancelKeyword && !hasRescheduleKeyword && !isCancelAsConfirmation) {
      console.log('[ig-ai] Cancel keyword detected');
      const appointmentsList = await listClientAppointmentsNumbered(igPhoneIdentifier, company.id, 'cancelar');
      interceptedResponse = appointmentsList;
    } else if (hasRescheduleKeyword) {
      console.log('[ig-ai] Reschedule keyword detected');
      const appointmentsList = await listClientAppointmentsNumbered(igPhoneIdentifier, company.id, 'cancelar');
      interceptedResponse = `Para reagendar, é necessário cancelar o agendamento atual e fazer um novo.\n\n${appointmentsList}`;
    }

    if (interceptedResponse) {
      await igService.sendTyping(senderId);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await igService.sendText({ recipientId: senderId, text: interceptedResponse });

      await storage.createMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: interceptedResponse,
        messageType: 'text',
        delivered: 1,
        timestamp: new Date(),
      });

      cacheAIResponse(conversation.id, interceptedResponse);
      syncMessageToChatwoot(company, igPhoneIdentifier, 'Bot', interceptedResponse, 'outgoing');
      return;
    }

    // ===== Verificar contextos especiais =====
    const isConfirmationReminderContext =
      lastBotMsg.includes('agendamento ainda não foi confirmado') ||
      (lastBotMsg.includes('Basta responder') && lastBotMsg.includes('para confirmar')) ||
      (lastBotMsg.includes('Responda') && lastBotMsg.includes('SIM') && lastBotMsg.includes('confirmar') && !lastBotMsg.includes('cancelar')) ||
      (lastBotMsg.includes('Está tudo correto') && lastBotMsg.includes('confirmar'));

    const isCancelContext = lastBotMsg.includes('Confirma o cancelamento?') ||
      lastBotMsg.includes('CANCELAR para confirmar') ||
      lastBotMsg.includes('SIM para cancelar') ||
      lastBotMsg.includes('Qual agendamento você deseja cancelar');

    const isUserConfirmingCancelWord = /^(cancelar|cancela|cancelamento)$/i.test(messageText.toLowerCase().trim());
    const isConfirmingCancel = (isUserConfirming || isUserConfirmingCancelWord) && isCancelContext;

    const isRescheduleContext =
      lastBotMsg.includes('Para reagendar') ||
      lastBotMsg.includes('necessário cancelar o agendamento atual') ||
      (lastBotMsg.includes('cancelar') && lastBotMsg.includes('nova data'));

    const isPostConfirmationContext =
      lastBotMsg.includes('Agendamento realizado com sucesso') ||
      lastBotMsg.includes('Nos vemos no dia') ||
      lastBotMsg.includes('agendamento foi confirmado') ||
      (lastBotMsg.includes('confirmado para') && lastBotMsg.includes('às'));

    // Interceptar reagendamento
    if (isRescheduleContext && isUserConfirming && !isConfirmationReminderContext) {
      console.log('[ig-ai] Reschedule context - listing appointments');
      const appointmentsList = await listClientAppointmentsNumbered(igPhoneIdentifier, company.id, 'cancelar');
      const response = `Para reagendar, primeiro vamos cancelar o agendamento atual.\n\n${appointmentsList}`;

      await igService.sendTyping(senderId);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await igService.sendText({ recipientId: senderId, text: response });

      await storage.createMessage({ conversationId: conversation.id, role: 'assistant', content: response, messageType: 'text', delivered: 1, timestamp: new Date() });
      cacheAIResponse(conversation.id, response);
      syncMessageToChatwoot(company, igPhoneIdentifier, 'Bot', response, 'outgoing');
      return;
    }

    // ===== Buscar profissionais e serviços =====
    const professionals = await storage.getProfessionalsByCompany(company.id);
    const activeProfessionals = professionals.filter((prof: any) => prof.active && !prof.archived);
    const availableProfessionals = activeProfessionals.map((prof: any) => `- ${prof.name}`).join('\n');

    const autoSelectEnabled = company.autoSelectProfessional === 1;
    const hasOnlyOneProfessional = activeProfessionals.length === 1;
    const shouldAutoSelect = autoSelectEnabled && hasOnlyOneProfessional;

    const services = await storage.getServicesByCompany(company.id);

    // Detectar profissional mencionado
    let selectedProfessional: any = null;
    if (shouldAutoSelect) {
      selectedProfessional = activeProfessionals[0];
    } else {
      const lastUserMsg = messageText.toLowerCase();
      for (const prof of activeProfessionals) {
        if (lastUserMsg.includes(prof.name.toLowerCase())) {
          selectedProfessional = prof;
          break;
        }
      }
    }

    let filteredServices = services.filter((service: any) => service.isActive !== false);
    if (selectedProfessional) {
      filteredServices = filteredServices.filter((service: any) => {
        const isGlobal = !service.professionalId;
        const isForProfessional = service.professionalId === selectedProfessional.id;
        return isGlobal || isForProfessional;
      });
    }

    const formatDuration = (minutes: number): string => {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      let result = '';
      if (hours > 0) result += `${hours}h`;
      if (mins > 0) result += `${mins}min`;
      return result || '0min';
    };

    const availableServices = filteredServices
      .map((service: any) => `- ${service.name} (${formatDuration(service.duration || 60)})`)
      .join('\n');

    const availableServicesWithPrices = filteredServices
      .map((service: any) => {
        const durationText = formatDuration(service.duration || 60);
        const priceText = service.price ? ` - R$ ${service.price}` : '';
        return `- ${service.name} (${durationText})${priceText}`;
      })
      .join('\n');

    // ===== Disponibilidade =====
    const existingAppointments = await storage.getAppointmentsByCompany(company.id);
    const availabilityInfo = await getAvailabilityInfoSmart(
      messageText, conversationHistory, professionals, existingAppointments,
      company.id, false, filteredServices
    );

    const specificDateInfo = await checkSpecificDateAvailability(
      messageText, conversationHistory, professionals, existingAppointments
    );

    // ===== Chamar OpenAI =====
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: company.openaiApiKey });

    const today = getBrazilDate();
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
      if (daysUntilTarget === 0) daysUntilTarget = 7;
      if (daysUntilTarget < 0) daysUntilTarget += 7;
      date.setDate(date.getDate() + daysUntilTarget);
      return date.toLocaleDateString('pt-BR');
    };

    const exampleService = filteredServices[0]?.name || 'seu serviço';
    const exampleProfessional = professionals.find((p: any) => p.active)?.name || 'profissional';

    const systemPrompt = `${company.aiAgentPrompt}

Importante: Você está representando a empresa "${company.fantasyName}" via Instagram DM.

⚠️ REGRAS DE FORMATAÇÃO DE MENSAGENS:
- Envie APENAS texto simples, SEM formatação markdown
- NÃO use *negrito*, _itálico_ ou ~tachado~
- NÃO use formatação [texto](link) para links
- Envie URLs completas e diretas quando necessário
- Use emojis quando apropriado para deixar a conversa mais amigável

🤝 INTERVENÇÕES DE ATENDENTES HUMANOS:
- Algumas mensagens no histórico podem ter o prefixo "[MENSAGEM DO ATENDENTE HUMANO]:"
- Essas mensagens foram enviadas por um atendente real da empresa, NÃO por você
- Continue a conversa de forma natural, levando em conta tudo que o atendente humano disse

INFORMAÇÕES DA EMPRESA:
- Nome: ${company.fantasyName}
- Endereço: ${[
  company.address,
  company.number ? `nº ${company.number}` : null,
  company.neighborhood,
  company.city && company.state ? `${company.city}/${company.state}` : company.city || company.state
].filter(Boolean).join(', ') || 'Não informado'}${company.googleMapsLocation ? `\n- Localização Google Maps: ${company.googleMapsLocation}` : ''}
- Telefone: ${company.phone || 'Não informado'}
- CEP: ${company.zipCode || 'Não informado'}${company.coursesDescription ? `\n\n🎓 INFORMAÇÕES SOBRE CURSOS:\n${company.coursesDescription}` : ''}

HOJE É: ${today.toLocaleDateString('pt-BR')} (${['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][today.getDay()]})
HORÁRIO ATUAL: ${today.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

IMPORTANTE: NÃO aceite agendamentos para horários que já passaram!

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
Cliente quer: "Corte de cabelo com Estevão amanhã"
→ Sua resposta: "Vou verificar os horários disponíveis para amanhã!

[MOSTRAR_HORARIOS_LIVRES:Corte de cabelo:Estevão:2026-01-31]"

APÓS o comando ser processado:
- Se HOUVER horários: pergunte "Qual horário você prefere?"
- Se NÃO houver: a mensagem já contém pergunta sobre outro dia

⚠️ Use o NOME EXATO do serviço e profissional
⚠️ A data DEVE estar no formato YYYY-MM-DD
🚫 NUNCA invente horários

🚨 REGRA CRÍTICA - MUDANÇA DE DATA:
Quando o cliente perguntar sobre OUTRO DIA: SEMPRE use o comando novamente com a NOVA data

═══════════════════════════════════════════════════════════════════
🕐 COMANDO ESPECIAL - VERIFICAR HORÁRIO NA SEMANA
═══════════════════════════════════════════════════════════════════

Quando o cliente perguntar se tem um HORÁRIO ESPECÍFICO disponível na semana:
Use o comando: [VERIFICAR_HORARIO_SEMANA:NOME_PROFISSIONAL:HH:MM]

═══════════════════════════════════════════════════════════════════

🚨🚨🚨 ORDEM OBRIGATÓRIA DE COLETA DE DADOS 🚨🚨🚨

${shouldAutoSelect ?
`ETAPA 1 - SERVIÇO (profissional único: ${activeProfessionals[0]?.name}):
   → Mostre a lista de serviços IMEDIATAMENTE
   → AGUARDE o cliente escolher o serviço`
:
`ETAPA 1 - PROFISSIONAL:
   → Mostre a lista de profissionais PRIMEIRO
   → AGUARDE o cliente escolher o profissional

ETAPA 2 - SERVIÇO:
   → APÓS escolher o profissional, mostre a lista de serviços
   → AGUARDE o cliente escolher o serviço`}

ETAPA ${shouldAutoSelect ? '2' : '3'} - DATA:
   → APÓS o cliente escolher o SERVIÇO, pergunte a data
   → AGUARDE o cliente informar a data

ETAPA ${shouldAutoSelect ? '3' : '4'} - HORÁRIO:
   → APÓS ter a data, use o comando para buscar horários
   → Se for UM serviço: [MOSTRAR_HORARIOS_LIVRES:NOME_SERVICO:NOME_PROFISSIONAL:DATA_YYYY-MM-DD]
   → Se MÚLTIPLOS serviços: [MOSTRAR_HORARIOS_LIVRES_MULTI:SERVICO1,SERVICO2:NOME_PROFISSIONAL:DATA_YYYY-MM-DD]

ETAPA ${shouldAutoSelect ? '4' : '5'} - NOME:
   → SOMENTE APÓS o cliente escolher o HORÁRIO, pergunte o nome
   → ⚠️ NUNCA pergunte o nome ANTES do horário!

ETAPA ${shouldAutoSelect ? '5' : '6'} - CONFIRMAÇÃO:
   → APÓS ter todos os dados, mostre o RESUMO e peça confirmação com "SIM"

⚠️ REGRAS CRÍTICAS:
- NUNCA pule etapas
- NUNCA pergunte o NOME antes de ter o HORÁRIO
- NÃO peça o telefone do cliente - use o identificador do Instagram automaticamente
- REGRA OBRIGATÓRIA DE RESUMO:
  * Quando tiver TODOS os dados, envie o RESUMO: "Perfeito! Vou confirmar seu agendamento:\\n\\n👤 Nome: [nome]\\n🏢 Profissional: [profissional]\\n💼 Serviço: [serviço]\\n📅 Data: [dia da semana], [data]\\n🕐 Horário: [horário]\\n\\nEstá tudo correto? Responda SIM para confirmar."
  * AGUARDE o cliente responder "SIM", "OK", "CONFIRMO"
  * APENAS APÓS confirmação explícita, confirme o agendamento

═══════════════════════════════════════════════════════════════════
🎯 MÚLTIPLOS AGENDAMENTOS / MÚLTIPLOS SERVIÇOS
═══════════════════════════════════════════════════════════════════
Suporte completo a múltiplas pessoas e múltiplos serviços.
Use 1️⃣, 2️⃣, 3️⃣, etc. para separar cada agendamento no resumo.
Para múltiplos serviços: [MOSTRAR_HORARIOS_LIVRES_MULTI:Servico1,Servico2:Profissional:YYYY-MM-DD]

═══════════════════════════════════════════════════════════════════

CANCELAMENTO DE AGENDAMENTOS:
Quando o cliente mencionar "cancelar", "desmarcar", etc.:
→ Responda: "Vou verificar seus agendamentos... [LISTAR_AGENDAMENTOS_CANCELAR]"

REAGENDAMENTO:
→ "Para remarcar, primeiro preciso cancelar o agendamento atual. [LISTAR_AGENDAMENTOS_CANCELAR]"

INSTRUÇÕES ADICIONAIS:
- Mantenha respostas concisas e adequadas para mensagens de texto
- Seja profissional mas amigável
- Use o histórico da conversa para dar respostas contextualizadas
- Limite respostas a no máximo 200 palavras por mensagem`;

    // ===== Prepare messages para OpenAI =====
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory.slice(-15),
      { role: 'user' as const, content: messageText }
    ];

    console.log('[ig-ai] Generating AI response with', conversationHistory.length, 'messages of context');

    // ===== Chamar OpenAI (ou usar resposta interceptada) =====
    const completion = !isConfirmingCancel ? await openai.chat.completions.create({
      model: company.openaiModel || 'gpt-4o-mini',
      messages: messages,
      temperature: company.openaiTemperature ? parseFloat(company.openaiTemperature.toString()) : 0.7,
      max_tokens: company.openaiMaxTokens || 180,
    }) : null;

    let aiResponse = isConfirmingCancel
      ? ''
      : (completion?.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.');

    // ===== Processar comandos especiais =====
    aiResponse = await processSpecialCommands(aiResponse, igPhoneIdentifier, company, conversation, messageText, conversationHistory);

    // ===== Processar confirmação de cancelamento =====
    if (isConfirmingCancel) {
      aiResponse = await processCancelConfirmation(conversation, messageText, igPhoneIdentifier, company);
    }

    // ===== Validar disponibilidade na resposta =====
    aiResponse = await validateAvailabilityInResponse(aiResponse, company.id, activeProfessionals);

    // ===== Enviar resposta via Instagram =====
    console.log('[ig-ai] Sending AI response:', aiResponse.substring(0, 200));

    try {
      await igService.sendTyping(senderId);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await igService.sendText({ recipientId: senderId, text: aiResponse });

      console.log('[ig-ai] AI response sent successfully');

      // Salvar resposta no banco
      await storage.createMessage({
        conversationId: conversation.id,
        content: aiResponse,
        role: 'assistant',
        messageType: 'text',
        delivered: 1,
        timestamp: new Date(),
      });

      // Sync com Chatwoot
      cacheAIResponse(conversation.id, aiResponse);
      syncMessageToChatwoot(company, igPhoneIdentifier, 'Bot', aiResponse, 'outgoing');

      // ===== Criar agendamento se for confirmação =====
      const confirmationKeywords = [
        'agendamento está confirmado', 'agendamento realizado com sucesso',
        'realizado com sucesso', 'confirmado para', 'agendado para',
        'nos vemos', 'te aguardo', 'aguardamos você'
      ];

      const isConfirmingAppointment = confirmationKeywords.some(kw =>
        aiResponse.toLowerCase().includes(kw.toLowerCase())
      );

      if (isConfirmingAppointment && !isPostConfirmationContext) {
        console.log('[ig-ai] AI confirmed appointment - creating in DB');

        // Buscar mensagem de resumo nas últimas mensagens
        const recentMessages = await storage.getMessagesByConversation(conversation.id);
        const recentAssistantMessages = recentMessages
          .filter((m: any) => m.role === 'assistant')
          .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 5);

        const summaryMessage = recentAssistantMessages.find((m: any) =>
          !m.content.includes('Agendamento Confirmado!') &&
          !m.content.includes('Obrigado por escolher nossos serviços') &&
          !m.content.includes('Agendamento realizado com sucesso') &&
          (
            (m.content.includes('Está tudo correto?') || m.content.includes('Responda SIM para confirmar') ||
              m.content.includes('confirmar seu agendamento') || m.content.includes('Vou confirmar')) &&
            (m.content.includes('👤') || m.content.includes('Nome:')) &&
            (m.content.includes('📅') || m.content.includes('Data:')) &&
            (m.content.includes('🕐') || m.content.includes('Horário:'))
          )
        );

        if (summaryMessage) {
          const appointmentId = await createAppointmentFromAIConfirmation(
            conversation.id,
            company.id,
            summaryMessage.content,
            igPhoneIdentifier,
            'agendado',
            contactName
          );

          if (appointmentId) {
            console.log('[ig-ai] Appointment created with ID:', appointmentId);
          } else {
            console.log('[ig-ai] Appointment creation returned null (conflict or error)');

            // Enviar mensagem de conflito
            const errorMessage = '❌ Conflito de Horário Detectado\n\nDesculpe, mas não foi possível confirmar seu agendamento pois o horário solicitado já está ocupado.\n\nPor favor, escolha outro horário disponível.';
            await igService.sendText({ recipientId: senderId, text: errorMessage });
            await storage.createMessage({
              conversationId: conversation.id,
              content: errorMessage,
              role: 'assistant',
              messageType: 'text',
              delivered: 1,
              timestamp: new Date(),
            });
          }
        }
      }

    } catch (sendError) {
      console.error('[ig-ai] Error sending response:', sendError);

      // Salvar mesmo se falhou o envio
      await storage.createMessage({
        conversationId: conversation.id,
        content: aiResponse,
        role: 'assistant',
        messageType: 'text',
        delivered: 0,
        timestamp: new Date(),
      });
    }

  } catch (error) {
    console.error('[ig-ai] Error processing message:', error);
  } finally {
    igProcessingLocks.delete(lockKey);
  }
}

/**
 * Processa comandos especiais na resposta da IA
 */
async function processSpecialCommands(
  aiResponse: string,
  phoneNumber: string,
  company: any,
  conversation: any,
  messageText: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  // [LISTAR_AGENDAMENTOS]
  if (aiResponse.includes('[LISTAR_AGENDAMENTOS]')) {
    const list = await listClientAppointments(phoneNumber, company.id);
    aiResponse = aiResponse.replace('[LISTAR_AGENDAMENTOS]', list);
  }

  // [LISTAR_AGENDAMENTOS_CANCELAR]
  if (aiResponse.includes('[LISTAR_AGENDAMENTOS_CANCELAR]')) {
    const list = await listClientAppointmentsNumbered(phoneNumber, company.id, 'cancelar');
    aiResponse = aiResponse.replace(/.*\[LISTAR_AGENDAMENTOS_CANCELAR\].*/g, list);
  }

  // [VERIFICAR_HORARIO_SEMANA:professionalName:time]
  const verificarHorarioMatch = aiResponse.match(/\[VERIFICAR_HORARIO_SEMANA:([^:]+):(\d{1,2}:\d{2})\]/);
  if (verificarHorarioMatch) {
    const [fullMatch, professionalIdentifier, targetTime] = verificarHorarioMatch;
    const companyProfessionals = await storage.getProfessionalsByCompany(company.id);
    const profName = professionalIdentifier.trim().toLowerCase();
    let foundProfessional = companyProfessionals.find((p: any) => p.name.toLowerCase() === profName) ||
      companyProfessionals.find((p: any) => p.name.toLowerCase().includes(profName) || p.name.toLowerCase().split(' ')[0] === profName);

    if (foundProfessional) {
      const resultado = await checkSpecificTimeAvailability(company.id, foundProfessional.id, targetTime, 7);
      aiResponse = aiResponse.replace(fullMatch, resultado);
    } else {
      aiResponse = aiResponse.replace(fullMatch, `Desculpe, não consegui identificar o profissional "${professionalIdentifier}".`);
    }
  }

  // [MOSTRAR_HORARIOS_LIVRES_MULTI:service1,service2:professional:date]
  {
    let match;
    let companyServices: any[] | null = null;
    let companyProfessionals: any[] | null = null;

    while ((match = aiResponse.match(/\[MOSTRAR_HORARIOS_LIVRES_MULTI:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})\]/)) !== null) {
      const [fullMatch, servicesStr, professionalIdentifier, dateStr] = match;
      const serviceNames = servicesStr.split(',').map((s: string) => s.trim());

      if (!companyServices) companyServices = await storage.getServicesByCompany(company.id);
      if (!companyProfessionals) companyProfessionals = await storage.getProfessionalsByCompany(company.id);

      const resolvedServiceIds: number[] = [];
      let allFound = true;

      for (const svcName of serviceNames) {
        const searchName = svcName.toLowerCase();
        let found = companyServices.find((s: any) => s.name.toLowerCase() === searchName) ||
          companyServices.find((s: any) => s.name.toLowerCase().includes(searchName) || searchName.includes(s.name.toLowerCase()));
        if (found) { resolvedServiceIds.push(found.id); } else { allFound = false; }
      }

      let professionalId: number | null = null;
      const profName = professionalIdentifier.trim().toLowerCase();
      const foundProf = companyProfessionals.find((p: any) => p.name.toLowerCase() === profName) ||
        companyProfessionals.find((p: any) => p.name.toLowerCase().includes(profName) || p.name.toLowerCase().split(' ')[0] === profName);
      if (foundProf) professionalId = foundProf.id;

      if (allFound && resolvedServiceIds.length > 0 && professionalId) {
        const horariosLivres = await getAvailableTimesForMultipleServices(company.id, resolvedServiceIds, professionalId, dateStr);
        aiResponse = aiResponse.replace(fullMatch, horariosLivres);
      } else {
        aiResponse = aiResponse.replace(fullMatch, 'Desculpe, não consegui identificar todos os serviços ou profissional. Pode me informar novamente?');
      }
    }
  }

  // [MOSTRAR_HORARIOS_LIVRES:service:professional:date]
  // Fallback para comandos malformados (sem data)
  let malformed;
  while ((malformed = aiResponse.match(/\[MOSTRAR_HORARIOS_LIVRES:([^\]]+)\]/)) !== null) {
    if (/\d{4}-\d{2}-\d{2}/.test(malformed[1])) break;
    aiResponse = aiResponse.replace(malformed[0], 'Em qual dia você gostaria de agendar? 😊');
  }

  // Processar comandos com data
  {
    let match;
    let companyServices: any[] | null = null;
    let companyProfessionals: any[] | null = null;

    while ((match = aiResponse.match(/\[MOSTRAR_HORARIOS_LIVRES:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})\]/)) !== null) {
      const [fullMatch, serviceIdentifier, professionalIdentifier, dateStr] = match;

      if (!companyServices) companyServices = await storage.getServicesByCompany(company.id);
      if (!companyProfessionals) companyProfessionals = await storage.getProfessionalsByCompany(company.id);

      // Resolver serviço
      let serviceId: number | null = null;
      if (/^\d+$/.test(serviceIdentifier.trim())) {
        serviceId = parseInt(serviceIdentifier.trim());
      } else {
        const serviceName = serviceIdentifier.trim().toLowerCase();
        let found = companyServices.find((s: any) => s.name.toLowerCase() === serviceName);
        if (!found) {
          const matches = companyServices.filter((s: any) =>
            s.name.toLowerCase().includes(serviceName) || serviceName.includes(s.name.toLowerCase())
          );
          if (matches.length === 1) found = matches[0];
          else if (matches.length > 1) {
            found = matches.find((s: any) => s.name.toLowerCase().startsWith(serviceName)) ||
              matches.sort((a: any, b: any) => a.name.length - b.name.length)[0];
          }
        }
        if (found) serviceId = found.id;
      }

      // Resolver profissional
      let professionalId: number | null = null;
      if (/^\d+$/.test(professionalIdentifier.trim())) {
        professionalId = parseInt(professionalIdentifier.trim());
      } else {
        const profName = professionalIdentifier.trim().toLowerCase();
        let found = companyProfessionals.find((p: any) => p.name.toLowerCase() === profName);
        if (!found) {
          const matches = companyProfessionals.filter((p: any) =>
            p.name.toLowerCase().includes(profName) || profName.includes(p.name.toLowerCase()) ||
            p.name.toLowerCase().split(' ')[0] === profName
          );
          found = matches.length === 1 ? matches[0] :
            matches.find((p: any) => p.name.toLowerCase().startsWith(profName)) || matches[0];
        }
        if (found) professionalId = found.id;
      }

      if (serviceId && professionalId) {
        const horariosLivres = await getAvailableTimesForService(company.id, serviceId, professionalId, dateStr);
        aiResponse = aiResponse.replace(fullMatch, horariosLivres);
      } else {
        let errorMsg = '';
        if (!serviceId && !professionalId) errorMsg = `Desculpe, não consegui identificar o serviço "${serviceIdentifier}" nem o profissional "${professionalIdentifier}". Pode me informar novamente?`;
        else if (!serviceId) errorMsg = `Desculpe, não consegui identificar o serviço "${serviceIdentifier}". Pode me informar novamente?`;
        else errorMsg = `Desculpe, não consegui identificar o profissional "${professionalIdentifier}". Pode me informar novamente?`;
        aiResponse = aiResponse.replace(fullMatch, errorMsg);
      }
    }
  }

  // Detectar escolha por número (após listagem de cancelamento)
  const lastAssistantMessage = conversationHistory.filter((m: any) => m.role === 'assistant').slice(-1)[0]?.content || '';
  const wasListingForCancel = lastAssistantMessage.includes('Qual agendamento você deseja cancelar?');

  if (wasListingForCancel) {
    const selectedNumber = extractNumberFromText(messageText, lastAssistantMessage);
    if (selectedNumber) {
      console.log(`[ig-ai] User selected appointment number: ${selectedNumber}`);
      const cleanPhone = phoneNumber.replace('ig:', '');
      const nowBrasilia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const todayStr = nowBrasilia.toISOString().split('T')[0];

      const [appointmentRows] = await pool.execute(`
        SELECT a.id, a.appointment_date as appointmentDate, a.appointment_time as appointmentTime,
               a.status, a.professional_id as professionalId, a.service_id as serviceId
        FROM appointments a
        LEFT JOIN professionals p ON a.professional_id = p.id
        WHERE (a.client_phone LIKE ? OR a.client_phone LIKE ?)
          AND a.appointment_date >= ?
          AND a.status IN ('Pendente', 'Confirmado', 'confirmado', 'pendente', 'agendado', 'Agendado', 'scheduled', 'confirmed')
          AND p.company_id = ?
        ORDER BY a.appointment_date ASC, a.appointment_time ASC
        LIMIT 10
      `, [`%${cleanPhone}%`, `%ig:${cleanPhone}%`, todayStr, company.id]);

      const clientAppointments = appointmentRows as any[];
      if (selectedNumber <= clientAppointments.length) {
        const selectedAppointment = clientAppointments[selectedNumber - 1];
        const professional = await storage.getProfessional(selectedAppointment.professionalId);
        const service = await storage.getService(selectedAppointment.serviceId);
        const date = new Date(selectedAppointment.appointmentDate);
        const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

        aiResponse = `✅ Agendamento selecionado:\n\n📅 ${dayNames[date.getDay()]}, ${date.toLocaleDateString('pt-BR')} às ${selectedAppointment.appointmentTime}\n💼 ${service?.name || 'Serviço'}\n👤 ${professional?.name || 'Profissional'}\n\nConfirma o cancelamento? Digite CANCELAR para confirmar ou NÃO para manter o agendamento.`;

        await pool.execute(
          `INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)`,
          [conversation.id, 'system', `[PENDING_CANCEL_ID:${selectedAppointment.id}]`]
        );
      } else {
        aiResponse = `❌ Número inválido. Por favor, escolha um número entre 1 e ${clientAppointments.length}.`;
      }
    }
  }

  return aiResponse;
}

/**
 * Processa confirmação de cancelamento
 */
async function processCancelConfirmation(
  conversation: any,
  messageText: string,
  phoneNumber: string,
  company: any
): Promise<string> {
  const allMessages = await storage.getMessagesByConversation(conversation.id);
  const pendingCancelMsg = allMessages.find((m: any) => m.content.includes('[PENDING_CANCEL_ID:'));

  if (pendingCancelMsg) {
    const idMatch = pendingCancelMsg.content.match(/\[PENDING_CANCEL_ID:(\d+)\]/);
    if (idMatch) {
      const appointmentId = parseInt(idMatch[1]);
      console.log(`[ig-ai] Cancelling appointment ID: ${appointmentId}`);
      const cancelResult = await cancelAppointmentById(appointmentId, company.id);

      if (cancelResult.success) {
        await pool.execute(
          `DELETE FROM messages WHERE conversation_id = ? AND content LIKE '%[PENDING_CANCEL_ID:%'`,
          [conversation.id]
        );
        return '✅ Agendamento cancelado com sucesso!\n\nSeu agendamento foi removido da nossa agenda. Se precisar agendar novamente, é só me avisar! 😊';
      } else {
        return `❌ ${cancelResult.message}`;
      }
    }
  }

  return '❌ Ocorreu um erro ao processar o cancelamento. Por favor, tente novamente.';
}

/**
 * Extrai número de texto (escrito ou dígito)
 */
function extractNumberFromText(text: string, _listMessage: string): number | null {
  const lowerText = text.toLowerCase().trim();

  const directMatch = lowerText.match(/^[1-9]$|^10$/);
  if (directMatch) return parseInt(directMatch[0]);

  const phraseMatch = lowerText.match(/(?:o|a|opção|opcao|agendamento|número|numero)\s*(\d+)/);
  if (phraseMatch && parseInt(phraseMatch[1]) >= 1 && parseInt(phraseMatch[1]) <= 10) return parseInt(phraseMatch[1]);

  const writtenNumbers: { [key: string]: number } = {
    'um': 1, 'uma': 1, 'primeiro': 1, 'primeira': 1,
    'dois': 2, 'duas': 2, 'segundo': 2,
    'tres': 3, 'três': 3, 'terceiro': 3,
    'quatro': 4, 'cinco': 5, 'seis': 6,
    'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10
  };

  for (const [word, num] of Object.entries(writtenNumbers)) {
    if (['segunda', 'quarta', 'quinta', 'sexta'].includes(word)) continue;
    if (lowerText.includes(word)) return num;
  }

  const anyNumberMatch = lowerText.match(/\b(\d+)\b/);
  if (anyNumberMatch && parseInt(anyNumberMatch[1]) >= 1 && parseInt(anyNumberMatch[1]) <= 10) {
    return parseInt(anyNumberMatch[1]);
  }

  return null;
}
