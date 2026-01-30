import { useState, useCallback, useRef, useEffect } from 'react';
import { NotificationPopup } from '@/components/notification-popup';

interface NotificationData {
  id: string;
  type: 'new_appointment' | 'appointment_update';
  title: string;
  message: string;
  appointment?: {
    clientName: string;
    serviceName: string;
    appointmentDate: string;
    appointmentTime: string;
    professionalName: string;
  };
  timestamp: Date;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());
  const audioContextRef = useRef<AudioContext | null>(null);

  // Inicializar AudioContext uma única vez
  useEffect(() => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      // Silently fail if AudioContext is not available
    }
  }, []);

  // Criar som de campainha alta usando Web Audio API
  const createBellSound = useCallback(() => {
    try {
      const audioContext = audioContextRef.current;
      if (!audioContext) {
        return;
      }

      // Resume o contexto se estiver suspenso (política de autoplay do navegador)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Criar som de campainha com múltiplas frequências e volume alto
      const createBellTone = (frequency: number, startTime: number, duration: number, volume: number = 0.8) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(frequency, startTime);
        oscillator.type = 'triangle'; // Som mais metálico como campainha

        // Volume alto com decay natural de campainha
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };

      const currentTime = audioContext.currentTime;

      // Primeira batida da campainha (3 tons sobrepostos para som rico)
      createBellTone(1200, currentTime, 0.8, 0.9); // Tom principal alto
      createBellTone(1800, currentTime, 0.6, 0.6); // Harmônico agudo
      createBellTone(800, currentTime, 0.4, 0.5);  // Tom grave de suporte

      // Segunda batida mais intensa
      createBellTone(1200, currentTime + 0.4, 0.8, 1.0);
      createBellTone(1800, currentTime + 0.4, 0.6, 0.7);
      createBellTone(800, currentTime + 0.4, 0.4, 0.6);

      // Terceira batida para dar mais presença
      createBellTone(1200, currentTime + 0.8, 0.6, 0.8);
      createBellTone(1800, currentTime + 0.8, 0.4, 0.5);
    } catch (error) {
      // Silently fail if audio creation fails
    }
  }, []);

  const playNotificationSound = useCallback(() => {
    createBellSound();
  }, [createBellSound]);

  const addNotification = useCallback((notification: Omit<NotificationData, 'id' | 'timestamp'>) => {
    // Criar uma chave única para identificar a notificação baseada no conteúdo
    const notificationKey = notification.appointment 
      ? `${notification.appointment.clientName}-${notification.appointment.appointmentDate}-${notification.appointment.appointmentTime}`
      : `${notification.type}-${notification.title}-${notification.message}`;

    // Verificar se esta notificação já foi dispensada
    if (dismissedNotifications.has(notificationKey)) {
      return;
    }

    const newNotification: NotificationData = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
    };

    setNotifications(prev => [...prev, newNotification]);
    playNotificationSound();
  }, [playNotificationSound, dismissedNotifications]);

  const removeNotification = useCallback((id: string) => {
    // Encontrar a notificação que está sendo removida para adicionar à lista de dispensadas
    const notification = notifications.find(n => n.id === id);
    if (notification?.appointment) {
      const notificationKey = `${notification.appointment.clientName}-${notification.appointment.appointmentDate}-${notification.appointment.appointmentTime}`;
      setDismissedNotifications(prev => new Set([...prev, notificationKey]));
    }
    
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, [notifications]);

  const showNewAppointmentNotification = useCallback((appointment: {
    clientName: string;
    serviceName: string;
    appointmentDate: string;
    appointmentTime: string;
    professionalName: string;
  }) => {
    addNotification({
      type: 'new_appointment',
      title: 'Novo Agendamento',
      message: `${appointment.clientName} agendou ${appointment.serviceName}`,
      appointment,
    });
  }, [addNotification]);

  const NotificationContainer = useCallback(() => (
    <div className="fixed top-0 right-0 z-[9999] pointer-events-none">
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          className="pointer-events-auto"
          style={{
            transform: `translateY(${index * 10}px)`,
            zIndex: 9999 - index,
          }}
        >
          <NotificationPopup
            notification={notification}
            onClose={() => removeNotification(notification.id)}
            onView={() => {
              // Aqui você pode adicionar lógica para navegar para o agendamento
            }}
          />
        </div>
      ))}
    </div>
  ), [notifications, removeNotification]);

  return {
    notifications,
    addNotification,
    removeNotification,
    showNewAppointmentNotification,
    NotificationContainer,
  };
}