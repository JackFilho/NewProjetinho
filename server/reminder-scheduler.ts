import { storage } from "./storage";
import { db } from "./db";
import { appointments, reminderSettings } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";

interface ScheduledReminder {
  appointmentId: number;
  reminderType: string;
  scheduledTime: Date;
}

class ReminderScheduler {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor() {
    this.startScheduler();
  }

  startScheduler() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🔔 Sistema de lembretes iniciado');
    
    // Executa verificação a cada 5 minutos
    this.scheduleCheck();
    setInterval(() => {
      this.scheduleCheck();
    }, 5 * 60 * 1000); // 5 minutos
  }

  private async scheduleCheck() {
    try {
      const now = new Date();
      const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000); // 25 horas à frente
      const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 horas à frente

      // Busca agendamentos nas próximas 25 horas
      const upcomingAppointments = await db.select({
        id: appointments.id,
        companyId: appointments.companyId,
        appointmentDate: appointments.appointmentDate,
        appointmentTime: appointments.appointmentTime,
        clientName: appointments.clientName,
        clientPhone: appointments.clientPhone,
      }).from(appointments)
        .where(and(
          gte(appointments.appointmentDate, now),
          lte(appointments.appointmentDate, in25Hours)
        ));

      console.log(`📅 Verificando ${upcomingAppointments.length} agendamentos próximos`);

      for (const appointment of upcomingAppointments) {
        const appointmentDateTime = new Date(`${appointment.appointmentDate.toISOString().split('T')[0]}T${appointment.appointmentTime}`);
        
        // Verifica se precisa agendar lembrete de 24h
        const reminder24h = new Date(appointmentDateTime.getTime() - 24 * 60 * 60 * 1000);
        if (reminder24h > now && reminder24h <= in2Hours) {
          await this.scheduleReminder(appointment.id, '24h', reminder24h);
        }

        // Verifica se precisa agendar lembrete de 1h
        const reminder1h = new Date(appointmentDateTime.getTime() - 60 * 60 * 1000);
        if (reminder1h > now && reminder1h <= in2Hours) {
          await this.scheduleReminder(appointment.id, '1h', reminder1h);
        }
      }

    } catch (error) {
      console.error('❌ Erro no agendador de lembretes:', error);
    }
  }

  private async scheduleReminder(appointmentId: number, reminderType: string, scheduledTime: Date) {
    const timerId = `${appointmentId}-${reminderType}`;
    
    // Evita agendar o mesmo lembrete múltiplas vezes
    if (this.timers.has(timerId)) {
      return;
    }

    const delay = scheduledTime.getTime() - Date.now();
    
    if (delay <= 0) {
      // Se o tempo já passou, envia imediatamente
      await storage.sendAppointmentReminder(appointmentId, reminderType);
      return;
    }

    console.log(`⏰ Agendando lembrete ${reminderType} para agendamento ${appointmentId} em ${Math.round(delay / 1000 / 60)} minutos`);

    const timer = setTimeout(async () => {
      try {
        await storage.sendAppointmentReminder(appointmentId, reminderType);
        this.timers.delete(timerId);
      } catch (error) {
        console.error(`❌ Erro ao enviar lembrete ${reminderType} para agendamento ${appointmentId}:`, error);
        this.timers.delete(timerId);
      }
    }, delay);

    this.timers.set(timerId, timer);
  }

  public cancelReminder(appointmentId: number, reminderType: string) {
    const timerId = `${appointmentId}-${reminderType}`;
    const timer = this.timers.get(timerId);
    
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(timerId);
      console.log(`❌ Lembrete ${reminderType} cancelado para agendamento ${appointmentId}`);
    }
  }

  public cancelAllRemindersForAppointment(appointmentId: number) {
    const types = ['24h', '1h'];
    types.forEach(type => {
      this.cancelReminder(appointmentId, type);
    });
  }

  public getScheduledReminders(): ScheduledReminder[] {
    const reminders: ScheduledReminder[] = [];
    
    this.timers.forEach((timer, timerId) => {
      const [appointmentId, reminderType] = timerId.split('-');
      reminders.push({
        appointmentId: parseInt(appointmentId),
        reminderType,
        scheduledTime: new Date() // Aproximação, seria melhor armazenar o tempo exato
      });
    });

    return reminders;
  }

  public stop() {
    this.isRunning = false;
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    console.log('🛑 Sistema de lembretes parado');
  }
}

// Instância singleton do agendador
export const reminderScheduler = new ReminderScheduler();

// Função para reagendar lembretes quando um agendamento é alterado
export async function rescheduleRemindersForAppointment(appointmentId: number) {
  // Cancela lembretes existentes
  reminderScheduler.cancelAllRemindersForAppointment(appointmentId);
  
  // Busca o agendamento atualizado
  const [appointment] = await db.select()
    .from(appointments)
    .where(eq(appointments.id, appointmentId));

  if (!appointment) {
    console.log(`❌ Agendamento ${appointmentId} não encontrado para reagendar lembretes`);
    return;
  }

  const now = new Date();
  const appointmentDateTime = new Date(`${appointment.appointmentDate.toISOString().split('T')[0]}T${appointment.appointmentTime}`);
  
  // Reagenda lembretes se o agendamento for no futuro
  if (appointmentDateTime > now) {
    const reminder24h = new Date(appointmentDateTime.getTime() - 24 * 60 * 60 * 1000);
    const reminder1h = new Date(appointmentDateTime.getTime() - 60 * 60 * 1000);

    if (reminder24h > now) {
      await reminderScheduler['scheduleReminder'](appointmentId, '24h', reminder24h);
    }

    if (reminder1h > now) {
      await reminderScheduler['scheduleReminder'](appointmentId, '1h', reminder1h);
    }
  }
}