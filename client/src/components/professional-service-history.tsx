import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";

interface AppointmentHistory {
  id: number;
  serviceName: string;
  professionalName: string;
  appointmentDate: string;
  appointmentTime: string;
  price: number;
  statusName: string;
  statusColor: string;
  notes?: string;
}

interface ProfessionalServiceHistoryProps {
  professionalId: number;
}

export function ProfessionalServiceHistory({ professionalId }: ProfessionalServiceHistoryProps) {
  const { data: appointments = [], isLoading } = useQuery<AppointmentHistory[]>({
    queryKey: ['/api/company/appointments/professional', professionalId],
    queryFn: async () => {
      const response = await fetch(`/api/company/appointments/professional/${professionalId}`);
      if (!response.ok) {
        throw new Error('Erro ao buscar histórico do profissional');
      }
      return response.json();
    },
    enabled: !!professionalId,
  });

  const completedAppointments = appointments.filter(apt => 
    apt.statusName === 'Concluído' || apt.statusName === 'Finalizado' || apt.statusName === 'Confirmado'
  );

  const totalRevenue = completedAppointments
    .reduce((total, apt) => total + (apt.price || 0), 0);
  
  const completedServicesCount = completedAppointments.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Carregando histórico...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {completedServicesCount}
              </div>
              <div className="text-sm text-gray-500">Serviços Realizados</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                R$ {totalRevenue.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-sm text-gray-500">Total Gerado</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 