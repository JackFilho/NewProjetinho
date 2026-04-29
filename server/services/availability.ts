/**
 * Serviço de Disponibilidade de Horários
 *
 * Este serviço centraliza toda a lógica de cálculo de disponibilidade de horários,
 * removendo a responsabilidade do agente de IA de fazer cálculos complexos.
 *
 * O agente de IA agora apenas consulta este serviço para obter horários disponíveis
 * com 100% de assertividade.
 */

import { storage } from '../storage';
import { pool } from '../db';

// ==================== TIPOS ====================

export interface TimeSlot {
  time: string;           // Formato HH:MM
  timeInMinutes: number;  // Minutos desde meia-noite
  available: boolean;     // Se está disponível
  reason?: string;        // Razão se não disponível
}

export interface AvailabilityResult {
  success: boolean;
  professionalId: number;
  professionalName: string;
  serviceId: number;
  serviceName: string;
  serviceDuration: number;
  date: string;           // Formato YYYY-MM-DD
  dateFormatted: string;  // Formato DD/MM/YYYY
  dayOfWeek: string;
  workingHours: {
    start: string;
    end: string;
  } | null;
  availableSlots: string[];       // Lista de horários disponíveis (HH:MM)
  occupiedSlots: OccupiedSlot[];  // Lista de horários ocupados com detalhes
  breaks: BreakInfo[];            // Pausas do dia
  message: string;                // Mensagem formatada para o usuário
  error?: string;
}

export interface OccupiedSlot {
  start: string;
  end: string;
  duration: number;
  clientName?: string;
}

export interface BreakInfo {
  start: string;
  end: string;
}

export interface SlotValidationResult {
  valid: boolean;
  reason?: string;
  suggestedSlots?: string[];
}

// ==================== FUNÇÕES AUXILIARES ====================

/**
 * Obtém a data atual no fuso horário do Brasil
 */
function getBrazilDate(): Date {
  // Usar toLocaleString com timezone para garantir o horário correto do Brasil
  const nowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  return new Date(nowStr);
}

/**
 * Converte horário HH:MM para minutos desde meia-noite
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Converte minutos desde meia-noite para HH:MM
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Verifica se dois intervalos de tempo se sobrepõem
 */
function hasOverlap(
  start1: number, end1: number,
  start2: number, end2: number
): boolean {
  return start1 < end2 && end1 > start2;
}

/**
 * Formata data YYYY-MM-DD para DD/MM/YYYY
 */
function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Obtém nome do dia da semana em português
 */
function getDayName(dayOfWeek: number): string {
  const days = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return days[dayOfWeek];
}

// ==================== FUNÇÕES PRINCIPAIS ====================

/**
 * Calcula todos os horários disponíveis para um serviço com um profissional em uma data específica
 */
export async function getAvailableSlots(
  companyId: number,
  professionalId: number,
  serviceId: number,
  dateStr: string // Formato YYYY-MM-DD
): Promise<AvailabilityResult> {
  try {

    // 1. Buscar informações do serviço (lookup direto por ID)
    const service = await storage.getService(serviceId);

    if (!service) {
      return {
        success: false,
        professionalId,
        professionalName: '',
        serviceId,
        serviceName: '',
        serviceDuration: 0,
        date: dateStr,
        dateFormatted: formatDateBR(dateStr),
        dayOfWeek: '',
        workingHours: null,
        availableSlots: [],
        occupiedSlots: [],
        breaks: [],
        message: 'Serviço não encontrado',
        error: 'SERVICE_NOT_FOUND'
      };
    }

    const serviceDuration = service.duration || 30;

    // 2. Buscar informações do profissional
    const professionals = await storage.getProfessionalsByCompany(companyId);
    const professional = professionals.find(p => p.id === professionalId);

    if (!professional) {
      return {
        success: false,
        professionalId,
        professionalName: '',
        serviceId,
        serviceName: service.name,
        serviceDuration,
        date: dateStr,
        dateFormatted: formatDateBR(dateStr),
        dayOfWeek: '',
        workingHours: null,
        availableSlots: [],
        occupiedSlots: [],
        breaks: [],
        message: 'Mentor não encontrado',
        error: 'PROFESSIONAL_NOT_FOUND'
      };
    }

    // 3. Verificar dia da semana
    const date = new Date(dateStr + 'T12:00:00');
    const dayOfWeek = date.getDay();
    const dayName = getDayName(dayOfWeek);

    // 4. Verificar se é dia de folga
    const daysOff = await storage.getProfessionalDaysOffByDateRange(professionalId, dateStr, dateStr);
    if (daysOff.length > 0) {
      const reason = daysOff[0].reason || 'Indisponível';
      return {
        success: true,
        professionalId,
        professionalName: professional.name,
        serviceId,
        serviceName: service.name,
        serviceDuration,
        date: dateStr,
        dateFormatted: formatDateBR(dateStr),
        dayOfWeek: dayName,
        workingHours: null,
        availableSlots: [],
        occupiedSlots: [],
        breaks: [],
        message: `❌ ${professional.name} não está disponível no dia ${formatDateBR(dateStr)} (${reason})`,
        error: 'DAY_OFF'
      };
    }

    // 5. Buscar horário de trabalho (normal ou excepcional)
    const exceptionalSchedules = await storage.getProfessionalExceptionalSchedulesByDateRange(professionalId, dateStr, dateStr);
    const regularSchedules = await storage.getProfessionalSchedules(professionalId);

    let workStartTime: string;
    let workEndTime: string;
    let isExceptional = false;

    if (exceptionalSchedules.length > 0) {
      const sorted = [...exceptionalSchedules].sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
      workStartTime = sorted[0].startTime;
      workEndTime = sorted.reduce((max: string, s: any) => s.endTime > max ? s.endTime : max, sorted[0].endTime);
      isExceptional = true;
    } else {
      // Usar horário regular
      const daySchedule = regularSchedules.find(s => s.dayOfWeek === dayOfWeek && s.isEnabled);

      if (!daySchedule) {
        return {
          success: true,
          professionalId,
          professionalName: professional.name,
          serviceId,
          serviceName: service.name,
          serviceDuration,
          date: dateStr,
          dateFormatted: formatDateBR(dateStr),
          dayOfWeek: dayName,
          workingHours: null,
          availableSlots: [],
          occupiedSlots: [],
          breaks: [],
          message: `❌ ${professional.name} não trabalha às ${dayName}`,
          error: 'NOT_WORKING_DAY'
        };
      }

      workStartTime = daySchedule.startTime;
      workEndTime = daySchedule.endTime;
    }

    // 6. Buscar pausas do dia (excepcionais ou regulares)
    let dayBreaks: { startTime: string; endTime: string }[] = [];

    if (isExceptional && exceptionalSchedules.length > 0) {
      // Combinar pausas de todos os horários excepcionais + gaps entre eles
      const sorted = [...exceptionalSchedules].sort((a: any, b: any) => a.startTime.localeCompare(b.startTime));
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].endTime < sorted[i + 1].startTime) {
          dayBreaks.push({ startTime: sorted[i].endTime, endTime: sorted[i + 1].startTime });
        }
      }
      for (const exc of exceptionalSchedules) {
        const excBreaks = await storage.getExceptionBreaks(exc.id);
        dayBreaks.push(...excBreaks);
      }
    } else {
      // Usar pausas regulares por dia da semana
      const dayOfWeekKeyMap: { [key: number]: string } = {
        0: 'domingo', 1: 'segunda', 2: 'terca', 3: 'quarta',
        4: 'quinta', 5: 'sexta', 6: 'sabado'
      };
      const dayKey = dayOfWeekKeyMap[dayOfWeek];
      const allBreaks = await storage.getProfessionalBreaks(professionalId);
      dayBreaks = allBreaks.filter(b => b.dayOfWeek === dayKey);
    }

    const breaksInfo: BreakInfo[] = dayBreaks.map(b => ({
      start: b.startTime,
      end: b.endTime
    }));

    // 7. Buscar agendamentos existentes (excluindo apenas cancelados)
    const [existingAppointments] = await pool.execute(
      `SELECT appointment_time, duration, client_name, status FROM appointments
       WHERE company_id = ? AND professional_id = ? AND appointment_date = ?
       AND status NOT IN ('Cancelado', 'cancelado', 'cancelled')
       ORDER BY appointment_time`,
      [companyId, professionalId, dateStr]
    ) as any;

    const occupiedSlots: OccupiedSlot[] = existingAppointments.map((apt: any) => {
      const startMinutes = timeToMinutes(apt.appointment_time);
      const duration = apt.duration || 30;
      const endMinutes = startMinutes + duration;
      return {
        start: apt.appointment_time,
        end: minutesToTime(endMinutes),
        duration,
        clientName: apt.client_name
      };
    });

    // 8. Calcular horários disponíveis
    const workStartMinutes = timeToMinutes(workStartTime);
    const workEndMinutes = timeToMinutes(workEndTime);
    // Se timeInterval for 0 (sem intervalo), usar a duração do serviço como intervalo
    const configuredInterval = professional.timeInterval || 0;
    const timeInterval = configuredInterval === 0 ? serviceDuration : configuredInterval;
    const minimumAdvanceHours = Number(professional.minimumAdvanceHours) || 0;

    // Calcular horário mínimo considerando antecedência
    const now = getBrazilDate();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let minTimeMinutes = workStartMinutes;

    // Para agendamentos HOJE, filtrar horários passados e aplicar antecedência mínima
    if (dateStr === todayStr) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const advanceMinutes = minimumAdvanceHours * 60;
      const minAdvanceMinutes = currentMinutes + advanceMinutes;
      minTimeMinutes = Math.max(workStartMinutes, minAdvanceMinutes);

      if (timeInterval > 0) {
        minTimeMinutes = Math.ceil(minTimeMinutes / timeInterval) * timeInterval;
      }
    }

    const availableSlots: string[] = [];
    let currentMinutes = workStartMinutes;

    // Alinhar ao intervalo se necessário (se houver intervalo configurado)
    if (timeInterval > 0 && currentMinutes % timeInterval !== 0) {
      currentMinutes = Math.ceil(currentMinutes / timeInterval) * timeInterval;
    }

    while (currentMinutes + serviceDuration <= workEndMinutes) {
      const slotStart = currentMinutes;
      const slotEnd = currentMinutes + serviceDuration;
      const timeStr = minutesToTime(currentMinutes);

      // Verificar antecedência mínima (para hoje)
      if (slotStart < minTimeMinutes) {
        currentMinutes += timeInterval;
        continue;
      }

      // Verificar conflito com agendamentos existentes
      let hasAppointmentConflict = false;
      for (const apt of existingAppointments) {
        const aptStart = timeToMinutes(apt.appointment_time);
        const aptDuration = apt.duration || 30;
        const aptEnd = aptStart + aptDuration;

        if (hasOverlap(slotStart, slotEnd, aptStart, aptEnd)) {
          hasAppointmentConflict = true;
          break;
        }
      }

      if (hasAppointmentConflict) {
        currentMinutes += timeInterval;
        continue;
      }

      // Verificar conflito com pausas
      let hasBreakConflict = false;
      for (const brk of dayBreaks) {
        const brkStart = timeToMinutes(brk.startTime);
        const brkEnd = timeToMinutes(brk.endTime);

        if (hasOverlap(slotStart, slotEnd, brkStart, brkEnd)) {
          hasBreakConflict = true;
          break;
        }
      }

      if (hasBreakConflict) {
        currentMinutes += timeInterval;
        continue;
      }

      // Slot disponível!
      availableSlots.push(timeStr);
      currentMinutes += timeInterval;
    }

    // 9. Formatar mensagem de resposta
    let message: string;

    if (availableSlots.length === 0) {
      message = `❌ Não há horários disponíveis para ${service.name} (${serviceDuration}min) com ${professional.name} no dia ${formatDateBR(dateStr)} (${dayName}).\n\nTodos os horários estão ocupados ou não há espaço suficiente para este serviço.`;
    } else {
      message = `✅ Horários disponíveis para ${service.name} (${serviceDuration}min)\n`;
      message += `👤 Mentor: ${professional.name}\n`;
      message += `📅 Data: ${formatDateBR(dateStr)} (${dayName})\n`;
      message += `⏰ Horário de trabalho: ${workStartTime} às ${workEndTime}\n\n`;
      message += `📋 Horários livres:\n`;

      // Agrupar horários em linhas de 5
      for (let i = 0; i < availableSlots.length; i += 5) {
        const group = availableSlots.slice(i, i + 5);
        message += `${group.join(' | ')}\n`;
      }

      message += `\n_Total: ${availableSlots.length} horário(s) disponível(is)_`;
    }

    return {
      success: true,
      professionalId,
      professionalName: professional.name,
      serviceId,
      serviceName: service.name,
      serviceDuration,
      date: dateStr,
      dateFormatted: formatDateBR(dateStr),
      dayOfWeek: dayName,
      workingHours: {
        start: workStartTime,
        end: workEndTime
      },
      availableSlots,
      occupiedSlots,
      breaks: breaksInfo,
      message
    };

  } catch (error) {
    console.error('❌ Erro ao calcular disponibilidade:', error);
    return {
      success: false,
      professionalId,
      professionalName: '',
      serviceId,
      serviceName: '',
      serviceDuration: 0,
      date: dateStr,
      dateFormatted: formatDateBR(dateStr),
      dayOfWeek: '',
      workingHours: null,
      availableSlots: [],
      occupiedSlots: [],
      breaks: [],
      message: 'Erro ao calcular disponibilidade. Por favor, tente novamente.',
      error: 'INTERNAL_ERROR'
    };
  }
}

/**
 * Valida se um horário específico está disponível
 */
export async function validateSlot(
  companyId: number,
  professionalId: number,
  serviceId: number,
  dateStr: string,
  timeStr: string
): Promise<SlotValidationResult> {
  try {
    console.log(`\n========================================`);
    console.log(`🔍 VALIDANDO HORÁRIO`);
    console.log(`========================================`);
    console.log(`📌 Professional: ${professionalId}, Service: ${serviceId}, Date: ${dateStr}, Time: ${timeStr}`);

    // Obter disponibilidade completa
    const availability = await getAvailableSlots(companyId, professionalId, serviceId, dateStr);

    if (!availability.success) {
      return {
        valid: false,
        reason: availability.message
      };
    }

    // Normalizar horário para comparação
    const normalizedTime = timeStr.length === 4 ? '0' + timeStr : timeStr;

    // Verificar se o horário está na lista de disponíveis
    if (availability.availableSlots.includes(normalizedTime)) {
      console.log(`✅ Horário ${normalizedTime} está DISPONÍVEL`);
      return {
        valid: true
      };
    }

    // Horário não disponível - retornar sugestões
    console.log(`❌ Horário ${normalizedTime} NÃO está disponível`);

    // Encontrar horários próximos disponíveis
    const requestedMinutes = timeToMinutes(normalizedTime);
    const suggestedSlots = availability.availableSlots
      .map(slot => ({ slot, diff: Math.abs(timeToMinutes(slot) - requestedMinutes) }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 5)
      .map(s => s.slot);

    let reason = `O horário ${timeStr} não está disponível para ${availability.professionalName} no dia ${availability.dateFormatted}.`;

    // Verificar motivo específico
    const slotStart = requestedMinutes;
    const slotEnd = requestedMinutes + availability.serviceDuration;

    // Verificar se é pausa
    for (const brk of availability.breaks) {
      const brkStart = timeToMinutes(brk.start);
      const brkEnd = timeToMinutes(brk.end);
      if (hasOverlap(slotStart, slotEnd, brkStart, brkEnd)) {
        reason = `O horário ${timeStr} está no intervalo de pausa do profissional (${brk.start} às ${brk.end}).`;
        break;
      }
    }

    // Verificar se é ocupado
    for (const apt of availability.occupiedSlots) {
      const aptStart = timeToMinutes(apt.start);
      const aptEnd = timeToMinutes(apt.end);
      if (hasOverlap(slotStart, slotEnd, aptStart, aptEnd)) {
        reason = `O horário ${timeStr} conflita com um agendamento existente (${apt.start} às ${apt.end}).`;
        break;
      }
    }

    return {
      valid: false,
      reason,
      suggestedSlots
    };

  } catch (error) {
    console.error('❌ Erro ao validar horário:', error);
    return {
      valid: false,
      reason: 'Erro ao validar horário. Por favor, tente novamente.'
    };
  }
}

/**
 * Obtém disponibilidade resumida para múltiplas datas (visão geral)
 */
export async function getAvailabilitySummary(
  companyId: number,
  professionalId: number,
  serviceId: number,
  startDate: string,
  days: number = 7
): Promise<{ date: string; dateFormatted: string; dayName: string; status: 'available' | 'partial' | 'unavailable' | 'day_off'; slotsCount: number; message: string }[]> {
  const results = [];
  const start = new Date(startDate + 'T12:00:00');

  for (let i = 0; i < days; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(start.getDate() + i);
    const dateStr = currentDate.toISOString().split('T')[0];

    const availability = await getAvailableSlots(companyId, professionalId, serviceId, dateStr);

    let status: 'available' | 'partial' | 'unavailable' | 'day_off';

    if (availability.error === 'DAY_OFF' || availability.error === 'NOT_WORKING_DAY') {
      status = 'day_off';
    } else if (availability.availableSlots.length === 0) {
      status = 'unavailable';
    } else if (availability.occupiedSlots.length > 0) {
      status = 'partial';
    } else {
      status = 'available';
    }

    results.push({
      date: dateStr,
      dateFormatted: availability.dateFormatted,
      dayName: availability.dayOfWeek,
      status,
      slotsCount: availability.availableSlots.length,
      message: availability.message
    });
  }

  return results;
}

/**
 * Gera texto de disponibilidade formatado para o agente de IA
 * Este texto substitui as instruções complexas que o agente precisava interpretar
 */
export async function generateAvailabilityTextForAI(
  companyId: number,
  professionalId: number,
  serviceId: number,
  dateStr: string
): Promise<string> {
  const availability = await getAvailableSlots(companyId, professionalId, serviceId, dateStr);

  if (!availability.success) {
    return `DISPONIBILIDADE PARA ${availability.dateFormatted}:\n❌ ${availability.message}`;
  }

  let text = `DISPONIBILIDADE PARA ${availability.serviceName} COM ${availability.professionalName.toUpperCase()}:\n`;
  text += `📅 Data: ${availability.dateFormatted} (${availability.dayOfWeek})\n`;
  text += `⏱️ Duração do serviço: ${availability.serviceDuration} minutos\n`;

  if (availability.workingHours) {
    text += `🕐 Horário de trabalho: ${availability.workingHours.start} às ${availability.workingHours.end}\n`;
  }

  text += `\n`;

  if (availability.availableSlots.length === 0) {
    text += `❌ NENHUM HORÁRIO DISPONÍVEL NESTA DATA\n`;

    if (availability.occupiedSlots.length > 0) {
      text += `\nMotivo: Todos os horários estão ocupados.\n`;
    }
  } else {
    text += `✅ HORÁRIOS DISPONÍVEIS (${availability.availableSlots.length}):\n`;
    text += availability.availableSlots.join(', ') + '\n';
    text += `\n⚠️ APENAS estes horários podem ser agendados. Qualquer outro horário resultará em conflito.\n`;
  }

  if (availability.occupiedSlots.length > 0) {
    text += `\n🚫 HORÁRIOS OCUPADOS:\n`;
    availability.occupiedSlots.forEach(slot => {
      text += `- ${slot.start} às ${slot.end} (${slot.duration}min)\n`;
    });
  }

  if (availability.breaks.length > 0) {
    text += `\n☕ PAUSAS DO DIA:\n`;
    availability.breaks.forEach(brk => {
      text += `- ${brk.start} às ${brk.end}\n`;
    });
  }

  return text;
}
