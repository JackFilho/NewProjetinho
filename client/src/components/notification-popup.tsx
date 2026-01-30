import { useState, useEffect } from 'react';
import { X, Calendar, Clock, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';

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

interface NotificationPopupProps {
  notification: NotificationData;
  onClose: () => void;
  onView?: () => void;
}

export function NotificationPopup({ notification, onClose, onView }: NotificationPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Animação de entrada
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Auto-close após 8 segundos
    const timer = setTimeout(() => {
      handleClose();
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleView = () => {
    if (onView) {
      onView();
    }
    handleClose();
  };

  return (
    <div 
      className={`fixed top-4 right-4 z-[9999] transition-all duration-300 ease-in-out transform ${
        isVisible && !isLeaving 
          ? 'translate-x-0 opacity-100' 
          : 'translate-x-full opacity-0'
      }`}
    >
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-w-sm w-80 overflow-hidden">
        {/* Header */}
        <div className="bg-green-500 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-white" />
            <span className="text-white font-medium text-sm">Novo Agendamento</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-white hover:bg-green-600"
            onClick={handleClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {notification.title}
          </h3>
          
          {notification.appointment && (
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <User className="h-3 w-3" />
                <span>{notification.appointment.clientName}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Calendar className="h-3 w-3" />
                <span>{notification.appointment.serviceName}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <Clock className="h-3 w-3" />
                <span>
                  {format(parseISO(notification.appointment.appointmentDate), 'dd/MM/yyyy')} às {notification.appointment.appointmentTime}
                </span>
              </div>
              
              <div className="text-xs text-gray-500 dark:text-gray-500">
                Profissional: {notification.appointment.professionalName}
              </div>
            </div>
          )}

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {notification.message}
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              className="flex-1"
            >
              Dispensar
            </Button>
            <Button
              size="sm"
              onClick={handleView}
              className="flex-1 bg-green-500 hover:bg-green-600"
            >
              Visualizar
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-200 dark:bg-gray-700">
          <div 
            className="h-full bg-green-500 transition-all ease-linear"
            style={{ 
              width: isVisible ? '0%' : '100%',
              transitionDuration: '8000ms'
            }}
          />
        </div>
      </div>
    </div>
  );
}