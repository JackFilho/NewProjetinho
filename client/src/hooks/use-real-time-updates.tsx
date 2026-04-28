import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface UseRealTimeUpdatesProps {
  onNewAppointment?: (appointmentData: any) => void;
}

export function useRealTimeUpdates({ onNewAppointment }: UseRealTimeUpdatesProps = {}) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Create SSE connection
    eventSourceRef.current = new EventSource('/api/events');

    eventSourceRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'new_appointment') {
          // Invalidate appointments query to refetch data
          queryClient.invalidateQueries({ queryKey: ['/api/company/appointments'] });

          // Trigger notification callback if provided
          if (onNewAppointment && data.appointment) {
            onNewAppointment(data.appointment);
          }
        } else if (data.type === 'cancelled_appointment') {
          // Invalidate appointments query to refetch data
          queryClient.invalidateQueries({ queryKey: ['/api/company/appointments'] });
        } else if (data.type === 'rescheduled_appointment') {
          // Invalidate appointments query to refetch data
          queryClient.invalidateQueries({ queryKey: ['/api/company/appointments'] });
        }
      } catch (error) {
        // Silently fail on parse errors
      }
    };

    eventSourceRef.current.onerror = (error) => {
      // Silently handle connection errors
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [queryClient, onNewAppointment]);

  return null;
}