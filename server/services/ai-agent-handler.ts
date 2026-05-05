/**
 * AI Agent Handler Service
 *
 * Processa mensagens recebidas via Meta webhook e gera respostas usando OpenAI.
 * Este serviço é chamado pelo callback onMessageReceived do meta-webhook-handler.
 */

import { storage } from '../storage';
import { createWhatsAppProvider, type NormalizedIncomingMessage } from './whatsapp-provider';
import { getAvailabilitySummary } from './availability';
import {
  getBrazilDate,
  isConfirmationSummary,
  cacheAIResponse,
  listClientAppointments,
  listClientAppointmentsNumbered,
  checkSpecificTimeAvailability,
  getAvailableTimesForService,
  getAvailableTimesForMultipleServices,
  getAvailabilityInfoSmart,
  checkSpecificDateAvailability,
} from '../routes';

// ==================== TIPOS ====================

interface AIAgentParams {
  message: NormalizedIncomingMessage & { originalType?: string };
  company: any;
  instance: any;
  conversation: any;
}

// ==================== HANDLER PRINCIPAL ====================

export async function handleAIAgentResponse(params: AIAgentParams): Promise<void> {
  const { message, company, instance, conversation } = params;

  const phoneNumber = message.from;
  const messageText = message.text || '';

  console.log(`\n🤖 [AI-AGENT] Processing message from ${phoneNumber}`);
  console.log(`📝 [AI-AGENT] Text: "${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}"`);

  // 1. Check if AI agent is paused
  if (company.agentPaused === 1 || company.agentPaused === true) {
    console.log('⏸️  [AI-AGENT] AI agent is PAUSED for company', company.id, '- skipping');
    return;
  }

  // 2. Check if conversation is in human takeover mode
  if (conversation.takeoverMode === 'human') {
    console.log('👨‍💼 [AI-AGENT] Conversation in HUMAN takeover mode - skipping AI response');
    return;
  }

  // 3. Check OpenAI configuration
  if (!company.openaiApiKey) {
    console.log('❌ [AI-AGENT] Company does not have OpenAI API key configured');
    return;
  }

  // 4. Skip empty messages or non-text types without transcription
  if (!messageText) {
    console.log('⚠️ [AI-AGENT] Empty message text, skipping AI processing');
    return;
  }

  try {
    // 5. Load conversation history
    console.log('📚 [AI-AGENT] Loading conversation history');
    const recentMessages = await storage.getRecentMessages(conversation.id, 15);

    const conversationHistory = recentMessages
      .reverse() // Oldest first
      .filter(msg => {
        if (msg.role === 'system' || !msg.role || msg.role === '') return false;
        if (msg.content?.includes('[PENDING_CANCEL_ID:') || msg.content?.includes('[PENDING_RESCHEDULE_ID:')) return false;
        if (msg.role === 'assistant') {
          const isOldConfirmation = msg.content?.includes('Agendamento Confirmado!') ||
                                    msg.content?.includes('Obrigado por escolher nossos serviços');
          if (isOldConfirmation) return false;
        }
        return true;
      })
      .map(msg => {
        const isLikelyHumanMessage = msg.role === 'assistant' &&
          conversation.takeoverMode === 'human' &&
          !msg.content?.includes('Perfeito!') &&
          !msg.content?.includes('Está tudo correto?') &&
          !msg.content?.includes('Responda SIM') &&
          !msg.content?.includes('👤') &&
          !msg.content?.includes('📅');

        if (isLikelyHumanMessage) {
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

    // 6. Get professionals and services
    const professionals = await storage.getProfessionalsByCompany(company.id);
    const activeProfessionals = professionals.filter((prof: any) => prof.active && !prof.archived);
    const availableProfessionals = activeProfessionals
      .map((prof: any) => `- ${prof.name}`)
      .join('\n');

    const autoSelectEnabled = company.autoSelectProfessional === 1;
    const hasOnlyOneProfessional = activeProfessionals.length === 1;
    const shouldAutoSelect = autoSelectEnabled && hasOnlyOneProfessional;

    const allServices = await storage.getServicesByCompany(company.id);

    // Detect professional from last user message
    const lastUserMessage = messageText.toLowerCase();
    let selectedProfessional: any = null;

    if (shouldAutoSelect) {
      selectedProfessional = activeProfessionals[0];
    } else {
      for (const prof of activeProfessionals) {
        if (lastUserMessage.includes(prof.name.toLowerCase())) {
          selectedProfessional = prof;
          break;
        }
      }
    }

    // Filter services based on selected professional
    let filteredServices = allServices.filter((service: any) => service.isActive !== false);
    if (selectedProfessional) {
      filteredServices = filteredServices.filter((service: any) => {
        const isGlobal = !service.professionalId;
        const isForProfessional = service.professionalId === selectedProfessional.id;
        return isGlobal || isForProfessional;
      });
    }

    // Format duration helper
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

    // 7. Get availability info
    const existingAppointments = await storage.getAppointmentsByCompany(company.id);

    const availabilityInfo = await getAvailabilityInfoSmart(
      messageText,
      conversationHistory,
      professionals,
      existingAppointments,
      company.id,
      false,
      filteredServices
    );

    const specificDateInfo = await checkSpecificDateAvailability(
      messageText,
      conversationHistory,
      professionals,
      existingAppointments
    );

    // 8. Build system prompt
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

    // Check Asaas payment config
    const isAsaasEnabled = company.asaasEnabled && company.asaasApiKey;
    const asaasPaymentInstructions = isAsaasEnabled ? `
- REGRA DE PAGAMENTO OBRIGATÓRIA:
  * APÓS o cliente confirmar com SIM/OK/CONFIRMO, NÃO confirme o agendamento ainda
  * Pergunte a forma de pagamento: "Ótimo! Como você prefere pagar?\\n\\n1️⃣ PIX (aprovação instantânea)\\n2️⃣ Cartão de Crédito (parcele em até 12x)\\n\\nDigite 1 para PIX ou 2 para Cartão."
  * AGUARDE o cliente responder com a forma de pagamento (1, 2, pix, cartão, etc.)
  * NÃO confirme o agendamento até o cliente escolher a forma de pagamento
  * Após o cliente escolher, responda: "Perfeito! Estou gerando seu [PIX/link de pagamento]. Aguarde um momento..."
  * O sistema enviará automaticamente o QR Code (para PIX) ou link (para cartão)
  * NUNCA diga que o agendamento foi confirmado antes do pagamento ser processado` : '';

    const systemPrompt = `${company.aiAgentPrompt || 'Você é um assistente virtual de agendamento.'}

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

Use essas informações para responder perguntas sobre localização, endereço, telefone e como chegar ao estabelecimento.${company.googleMapsLocation ? '\n\nIMPORTANTE: Quando o cliente perguntar sobre o endereço ou localização, envie também o link do Google Maps.' : ''}

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
${specificDateInfo || ''}

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
→ Serviço: Corte de cabelo
→ Profissional: Estevão

Sua resposta deve ser:
"Vou verificar os horários disponíveis para amanhã!

[MOSTRAR_HORARIOS_LIVRES:Corte de cabelo:Estevão:YYYY-MM-DD]"

APÓS o comando ser processado, o sistema vai retornar:
- Se HOUVER horários: uma lista de horários → pergunte "Qual horário você prefere?"
- Se NÃO houver horários: uma mensagem já perguntando outro dia → NUNCA adicione "Qual horário você prefere?"

⚠️ Use o NOME EXATO do serviço e profissional
🚨 REGRA CRÍTICA - MUDANÇA DE DATA: Quando o cliente perguntar sobre OUTRO DIA, SEMPRE use o comando novamente com a NOVA data

═══════════════════════════════════════════════════════════════════
🕐 COMANDO ESPECIAL - VERIFICAR HORÁRIO NA SEMANA
═══════════════════════════════════════════════════════════════════

Quando o cliente perguntar se tem um HORÁRIO ESPECÍFICO disponível na semana:
Use o comando: [VERIFICAR_HORARIO_SEMANA:NOME_PROFISSIONAL:HH:MM]

═══════════════════════════════════════════════════════════════════

🚨🚨🚨 ORDEM OBRIGATÓRIA DE COLETA DE DADOS 🚨🚨🚨

${shouldAutoSelect ?
`ETAPA 1 - SERVIÇO (profissional único: ${activeProfessionals[0]?.name}):
   → Quando cliente quiser agendar, mostre a lista de serviços IMEDIATAMENTE`
:
`ETAPA 1 - PROFISSIONAL:
   → Quando cliente quiser agendar, mostre a lista de profissionais PRIMEIRO

ETAPA 2 - SERVIÇO:
   → APÓS escolher o profissional, mostre a lista de serviços`}

ETAPA ${shouldAutoSelect ? '2' : '3'} - DATA:
   → APÓS o cliente escolher o SERVIÇO, pergunte a data

ETAPA ${shouldAutoSelect ? '3' : '4'} - HORÁRIO:
   → APÓS ter a data, use o comando para buscar horários:
   → Se for UM serviço: [MOSTRAR_HORARIOS_LIVRES:NOME_SERVICO:NOME_PROFISSIONAL:DATA_YYYY-MM-DD]
   → Se o cliente pediu MÚLTIPLOS serviços: [MOSTRAR_HORARIOS_LIVRES_MULTI:SERVICO1,SERVICO2:NOME_PROFISSIONAL:DATA_YYYY-MM-DD]

ETAPA ${shouldAutoSelect ? '4' : '5'} - NOME:
   → SOMENTE APÓS o cliente escolher o HORÁRIO, pergunte o nome

ETAPA ${shouldAutoSelect ? '5' : '6'} - CONFIRMAÇÃO:
   → APÓS ter todos os dados, mostre o RESUMO e peça confirmação com "SIM"

⚠️ REGRAS CRÍTICAS:
- NUNCA pule etapas
- NUNCA pergunte o NOME antes de ter o HORÁRIO
- NUNCA pergunte a DATA antes de ter o SERVIÇO
- NÃO peça o telefone do cliente - o sistema usará automaticamente o número do WhatsApp
- REGRA OBRIGATÓRIA DE RESUMO E CONFIRMAÇÃO:
  * Quando tiver TODOS os dados, envie um RESUMO COMPLETO:
    "Perfeito! Vou confirmar seu agendamento:\\n\\n👤 Nome: [nome]\\n🏢 Profissional: [profissional]\\n💼 Serviço: [serviço]\\n📅 Data: [dia da semana], [data]\\n🕐 Horário: [horário]\\n\\nEstá tudo correto? Responda SIM para confirmar."
  * AGUARDE o cliente responder "SIM", "OK", "CONFIRMO"
  * NUNCA diga "Agendamento realizado com sucesso" sem antes receber SIM/OK/CONFIRMO
${asaasPaymentInstructions}

CANCELAMENTO DE AGENDAMENTOS:
Quando o cliente mencionar "cancelar", "desmarcar", etc:
→ Responda: "Vou verificar seus agendamentos... [LISTAR_AGENDAMENTOS_CANCELAR]"

REAGENDAMENTO:
Quando o cliente mencionar "remarcar", "reagendar", etc:
→ Responda: "Para remarcar, primeiro preciso cancelar o agendamento atual. Vou verificar seus agendamentos... [LISTAR_AGENDAMENTOS_CANCELAR]"

- NÃO invente serviços - use APENAS os serviços listados
- NÃO confirme horários sem verificar disponibilidade real
- Mantenha respostas concisas e adequadas para mensagens de texto
- Seja profissional mas amigável
- Use o histórico da conversa para dar respostas contextualizadas
- Limite respostas a no máximo 200 palavras por mensagem`;

    // 9. Build messages array for OpenAI
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-15),
      { role: 'user', content: messageText }
    ];

    console.log('🤖 [AI-AGENT] Generating AI response with', conversationHistory.length, 'history messages');

    // 10. Call OpenAI
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: company.openaiApiKey });

    // Modelos de raciocínio (o1, o3, etc.) não suportam o parâmetro temperature
    const selectedModel = company.openaiModel || 'gpt-4o-mini';
    const isReasoningModel = /^o\d/i.test(selectedModel);

    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: messages,
      ...(isReasoningModel ? {} : {
        temperature: company.openaiTemperature ? parseFloat(company.openaiTemperature.toString()) : 0.7,
      }),
      max_tokens: company.openaiMaxTokens || 180,
    });

    let aiResponse = completion.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';
    console.log('📝 [AI-AGENT] AI Response (first 500 chars):', aiResponse.substring(0, 500));

    // 11. Process special commands
    aiResponse = await processSpecialCommands(aiResponse, phoneNumber, company, professionals, allServices);

    // 12. Send response via WhatsApp
    const provider = createWhatsAppProvider({
      metaPhoneNumberId: instance.metaPhoneNumberId,
      metaWabaId: instance.metaWabaId,
      metaAccessToken: instance.metaAccessToken,
      metaAppId: instance.metaAppId,
      metaAppSecret: instance.metaAppSecret,
    });

    // Small delay to simulate typing
    await new Promise(resolve => setTimeout(resolve, 2000));

    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const formattedPhone = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`;

    console.log('📞 [AI-AGENT] Sending response to:', formattedPhone);
    const sendResult = await provider.sendText(formattedPhone, aiResponse);

    if (sendResult.success) {
      console.log('✅ [AI-AGENT] Response sent successfully');

      // 13. Save AI response to database
      await storage.createMessage({
        conversationId: conversation.id,
        content: aiResponse,
        role: 'assistant',
        messageType: 'text',
        delivered: true,
        timestamp: new Date(),
      });
      console.log('💾 [AI-AGENT] Response saved to conversation history');

      // Cache for Chatwoot echo detection
      cacheAIResponse(conversation.id, aiResponse);
    } else {
      console.error('❌ [AI-AGENT] Failed to send response:', sendResult.error);
    }

  } catch (error) {
    console.error('❌ [AI-AGENT] Error processing message:', error);
  }
}

// ==================== PROCESSAMENTO DE COMANDOS ESPECIAIS ====================

async function processSpecialCommands(
  aiResponse: string,
  phoneNumber: string,
  company: any,
  professionals: any[],
  allServices: any[]
): Promise<string> {
  try {
    // Process [LISTAR_AGENDAMENTOS]
    if (aiResponse.includes('[LISTAR_AGENDAMENTOS]')) {
      console.log('📋 [AI-AGENT] Listing client appointments...');
      const appointmentsList = await listClientAppointments(phoneNumber, company.id);
      aiResponse = aiResponse.replace('[LISTAR_AGENDAMENTOS]', appointmentsList);
    }

    // Process [LISTAR_AGENDAMENTOS_CANCELAR]
    if (aiResponse.includes('[LISTAR_AGENDAMENTOS_CANCELAR]')) {
      console.log('📋 [AI-AGENT] Listing appointments for cancellation...');
      const appointmentsList = await listClientAppointmentsNumbered(phoneNumber, company.id, 'cancelar');
      aiResponse = aiResponse.replace(/.*\[LISTAR_AGENDAMENTOS_CANCELAR\].*/g, appointmentsList);
    }

    // Process [VERIFICAR_HORARIO_SEMANA:professionalName:time]
    const verificarHorarioMatch = aiResponse.match(/\[VERIFICAR_HORARIO_SEMANA:([^:]+):(\d{1,2}:\d{2})\]/);
    if (verificarHorarioMatch) {
      const [fullMatch, professionalIdentifier, targetTime] = verificarHorarioMatch;
      console.log(`🕐 [AI-AGENT] Checking time ${targetTime} for "${professionalIdentifier}"`);

      const profName = professionalIdentifier.trim().toLowerCase();
      const foundProfessional = professionals.find((p: any) =>
        p.active && !p.archived && p.name.toLowerCase().includes(profName)
      );

      if (foundProfessional) {
        const resultado = await checkSpecificTimeAvailability(company.id, foundProfessional.id, targetTime, 7);
        aiResponse = aiResponse.replace(fullMatch, resultado);
      } else {
        aiResponse = aiResponse.replace(fullMatch, 'Profissional não encontrado.');
      }
    }

    // Process [MOSTRAR_HORARIOS_LIVRES_MULTI:service1,service2:professional:date]
    let horariosMultiMatch;
    while ((horariosMultiMatch = aiResponse.match(/\[MOSTRAR_HORARIOS_LIVRES_MULTI:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})\]/)) !== null) {
      const [fullMatch, servicesStr, professionalIdentifier, dateStr] = horariosMultiMatch;
      console.log(`📦 [AI-AGENT] Multi-service availability: ${servicesStr} with ${professionalIdentifier} on ${dateStr}`);

      const serviceNames = servicesStr.split(',').map((s: string) => s.trim());
      const profName = professionalIdentifier.trim().toLowerCase();
      const foundProfessional = professionals.find((p: any) =>
        p.active && !p.archived && (
          p.name.toLowerCase() === profName ||
          p.name.toLowerCase().includes(profName) ||
          profName.includes(p.name.toLowerCase())
        )
      );

      if (!foundProfessional) {
        aiResponse = aiResponse.replace(fullMatch, 'Profissional não encontrado.');
        continue;
      }

      const resolvedServiceIds: number[] = [];
      let serviceNotFound = false;

      for (const svcName of serviceNames) {
        const svc = allServices.find((s: any) =>
          s.isActive !== false && (
            s.name.toLowerCase() === svcName.toLowerCase() ||
            s.name.toLowerCase().includes(svcName.toLowerCase()) ||
            svcName.toLowerCase().includes(s.name.toLowerCase())
          )
        );
        if (svc) {
          resolvedServiceIds.push(svc.id);
        } else {
          serviceNotFound = true;
          break;
        }
      }

      if (serviceNotFound || resolvedServiceIds.length === 0) {
        aiResponse = aiResponse.replace(fullMatch, 'Um ou mais serviços não foram encontrados.');
        continue;
      }

      const horariosLivres = await getAvailableTimesForMultipleServices(
        company.id, resolvedServiceIds, foundProfessional.id, dateStr
      );
      aiResponse = aiResponse.replace(fullMatch, horariosLivres);
    }

    // Process [MOSTRAR_HORARIOS_LIVRES:service:professional:date]
    let horariosLivresMatch;
    while ((horariosLivresMatch = aiResponse.match(/\[MOSTRAR_HORARIOS_LIVRES:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})\]/)) !== null) {
      const [fullMatch, serviceIdentifier, professionalIdentifier, dateStr] = horariosLivresMatch;
      console.log(`📅 [AI-AGENT] Availability: ${serviceIdentifier} with ${professionalIdentifier} on ${dateStr}`);

      const profName = professionalIdentifier.trim().toLowerCase();
      const foundProfessional = professionals.find((p: any) =>
        p.active && !p.archived && (
          p.name.toLowerCase() === profName ||
          p.name.toLowerCase().includes(profName) ||
          profName.includes(p.name.toLowerCase())
        )
      );

      if (!foundProfessional) {
        aiResponse = aiResponse.replace(fullMatch, 'Profissional não encontrado.');
        continue;
      }

      const svcName = serviceIdentifier.trim().toLowerCase();
      const foundService = allServices.find((s: any) =>
        s.isActive !== false && (
          s.name.toLowerCase() === svcName ||
          s.name.toLowerCase().includes(svcName) ||
          svcName.includes(s.name.toLowerCase())
        )
      );

      if (!foundService) {
        aiResponse = aiResponse.replace(fullMatch, 'Serviço não encontrado.');
        continue;
      }

      const horariosLivres = await getAvailableTimesForService(
        company.id, foundService.id, foundProfessional.id, dateStr
      );
      aiResponse = aiResponse.replace(fullMatch, horariosLivres);
    }

    return aiResponse;
  } catch (error) {
    console.error('❌ [AI-AGENT] Error processing special commands:', error);
    return aiResponse;
  }
}
