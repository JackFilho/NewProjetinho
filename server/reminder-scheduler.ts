// Reminder scheduler desativado - envio de templates agora é manual via tela de Templates
// O arquivo é mantido apenas para não quebrar imports existentes

export const reminderScheduler = {
  cancelReminder(_appointmentId: number, _reminderType: string) {},
  cancelAllRemindersForAppointment(_appointmentId: number) {},
  getScheduledReminders() { return []; },
  stop() {},
};

export async function rescheduleRemindersForAppointment(_appointmentId: number) {
  // Desativado - envio de templates agora é manual
}