import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Grid, List, User, Mail, Phone, Eye, EyeOff, Clock, Save, Coffee, CalendarOff, Calendar, Archive, ArchiveRestore, MapPin } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/hooks/use-plan";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";
import { ProfessionalServiceHistory } from "@/components/professional-service-history";
import { FloatingHelpButton } from "@/components/floating-help-button";

interface Professional {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  timeInterval?: number; // Appointment interval in minutes
  minimumAdvanceHours?: number; // Minimum hours in advance required for booking
  specialties?: string[];
  workDays?: string[];
  workStartTime?: string;
  workEndTime?: string;
  active: boolean;
  archived?: number; // 0 = active, 1 = archived
  createdAt: string;
  updatedAt: string;
}

interface ProfessionalBreak {
  id: number;
  professionalId: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ProfessionalDayOff {
  id: number;
  professionalId: number;
  dateOff: string;
  reason?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ProfessionalExceptionalSchedule {
  id: number;
  professionalId: number;
  exceptionDate: string;
  startTime: string;
  endTime: string;
  reason?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ProfessionalExceptionBreak {
  id: number;
  exceptionalScheduleId: number;
  startTime: string;
  endTime: string;
  createdAt?: string;
  updatedAt?: string;
}

const createProfessionalSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().min(1, "Email é obrigatório").email("Email inválido"),
  phone: z.string().optional(),
  timeInterval: z.number().min(0, "Intervalo não pode ser negativo").max(240, "Intervalo máximo é 240 minutos").default(30),
  minimumAdvanceHours: z.number().min(0, "Antecedência não pode ser negativa").max(168, "Antecedência máxima é 7 dias (168 horas)").default(0),
  workStartTime: z.string().optional(),
  workEndTime: z.string().optional(),
  workDays: z.array(z.number()).optional(),
  specialties: z.array(z.string()).optional(),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  active: z.boolean().default(true),
});

const updateProfessionalSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido").or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  timeInterval: z.number().min(0, "Intervalo não pode ser negativo").max(240, "Intervalo máximo é 240 minutos").default(30),
  minimumAdvanceHours: z.number().min(0, "Antecedência não pode ser negativa").max(168, "Antecedência máxima é 7 dias (168 horas)").default(0),
  workStartTime: z.string().optional().or(z.literal("")),
  workEndTime: z.string().optional().or(z.literal("")),
  workDays: z.array(z.number()).optional(),
  specialties: z.array(z.string()).optional(),
  password: z.string().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

type ProfessionalFormData = z.infer<typeof updateProfessionalSchema>;

// Sub-componente para gerenciar pausas de um horário excepcional específico
function ExceptionBreaksSection({ professionalId, scheduleId }: { professionalId: number; scheduleId: number }) {
  const queryClient = useQueryClient();
  const [newBreak, setNewBreak] = useState({ startTime: '12:00', endTime: '13:00' });

  const { data: breaks = [] } = useQuery<ProfessionalExceptionBreak[]>({
    queryKey: ['/api/company/professionals', professionalId, 'exception-breaks', scheduleId],
    queryFn: async () => {
      const response = await fetch(`/api/company/professionals/${professionalId}/exceptional-schedules/${scheduleId}/breaks`);
      if (!response.ok) throw new Error('Erro ao buscar pausas');
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { startTime: string; endTime: string }) => {
      const response = await fetch(`/api/company/professionals/${professionalId}/exceptional-schedules/${scheduleId}/breaks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Erro ao criar pausa');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/company/professionals', professionalId, 'exception-breaks', scheduleId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (breakId: number) => {
      const response = await fetch(`/api/company/professionals/${professionalId}/exceptional-schedules/${scheduleId}/breaks/${breakId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Erro ao excluir pausa');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/company/professionals', professionalId, 'exception-breaks', scheduleId],
      });
    },
  });

  return (
    <div className="mt-2 pt-2 border-t border-blue-200">
      <div className="flex items-center space-x-1 mb-1.5">
        <Coffee className="h-3 w-3 text-orange-500" />
        <span className="text-xs font-medium text-gray-600">Pausas</span>
      </div>

      {/* Lista de pausas existentes */}
      {breaks.length > 0 && (
        <div className="space-y-1 mb-1.5">
          {breaks.map((brk) => (
            <div key={brk.id} className="flex items-center justify-between bg-orange-50 rounded px-2 py-1">
              <span className="text-xs text-gray-700">{brk.startTime} - {brk.endTime}</span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => deleteMutation.mutate(brk.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Formulário para adicionar pausa */}
      <div className="flex items-center gap-1">
        <Input
          type="time"
          value={newBreak.startTime}
          onChange={(e) => setNewBreak(prev => ({ ...prev, startTime: e.target.value }))}
          className="w-[90px] h-7 text-xs"
        />
        <span className="text-gray-500 text-xs">-</span>
        <Input
          type="time"
          value={newBreak.endTime}
          onChange={(e) => setNewBreak(prev => ({ ...prev, endTime: e.target.value }))}
          className="w-[90px] h-7 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs text-orange-600 border-orange-300 hover:bg-orange-50 px-2"
          onClick={() => createMutation.mutate({ startTime: newBreak.startTime, endTime: newBreak.endTime })}
          disabled={createMutation.isPending}
        >
          <Plus className="h-3 w-3 mr-1" />
          Pausa
        </Button>
      </div>
    </div>
  );
}

export default function CompanyProfessionals() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showPassword, setShowPassword] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveConfirmId, setArchiveConfirmId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canAddProfessional, getProfessionalsLimitInfo } = usePlan();

  // Schedule management state
  const [schedules, setSchedules] = useState(() => {
    const defaultSchedule = {
      enabled: false,
      startTime: "09:00",
      endTime: "18:00",
      locationId: null as number | null,
    };
    return {
      domingo: defaultSchedule,
      segunda: defaultSchedule,
      terca: defaultSchedule,
      quarta: defaultSchedule,
      quinta: defaultSchedule,
      sexta: defaultSchedule,
      sabado: defaultSchedule
    };
  });

  // Generate time options in 30-minute intervals
  const generateTimeOptions = () => {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        options.push(timeStr);
      }
    }
    return options;
  };

  const timeOptions = generateTimeOptions();

  // Handle schedule changes
  const updateSchedule = (day: string, field: 'enabled' | 'startTime' | 'endTime' | 'locationId', value: boolean | string | number | null) => {
    setSchedules(prev => ({
      ...prev,
      [day]: {
        ...prev[day as keyof typeof prev],
        [field]: value
      }
    }));
  };

  // Save schedule for a specific day (individual hours per day)
  const saveSchedule = async (dayLabel: string) => {
    if (!editingProfessional) {
      toast({
        title: "Erro",
        description: "Nenhum profissional selecionado",
        variant: "destructive",
      });
      return;
    }

    try {
      const dayKeyMap: { [key: string]: number } = {
        'domingo': 0,
        'segunda': 1,
        'terca': 2,
        'quarta': 3,
        'quinta': 4,
        'sexta': 5,
        'sabado': 6
      };

      // Find the day that was just saved
      const savedDayKey = Object.entries(daysOfWeek).find(([_, day]) => day.label === dayLabel)?.[1]?.key;
      if (!savedDayKey) {
        throw new Error('Dia inválido');
      }

      const savedDaySchedule = schedules[savedDayKey as keyof typeof schedules];
      const dayOfWeek = dayKeyMap[savedDayKey];

      // Save individual day schedule to new API
      const response = await fetch(`/api/company/professionals/${editingProfessional.id}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dayOfWeek,
          startTime: savedDaySchedule.startTime,
          endTime: savedDaySchedule.endTime,
          isEnabled: savedDaySchedule.enabled,
          locationId: savedDaySchedule.locationId,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar horário');
      }

      toast({
        title: "Horário salvo",
        description: `${dayLabel}: ${savedDaySchedule.startTime} às ${savedDaySchedule.endTime}`,
      });
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar o horário",
        variant: "destructive",
      });
    }
  };

  // Days of the week
  const daysOfWeek = [
    { key: 'domingo', label: 'Domingo' },
    { key: 'segunda', label: 'Segunda-feira' },
    { key: 'terca', label: 'Terça-feira' },
    { key: 'quarta', label: 'Quarta-feira' },
    { key: 'quinta', label: 'Quinta-feira' },
    { key: 'sexta', label: 'Sexta-feira' },
    { key: 'sabado', label: 'Sábado' }
  ];

  // State for new break form
  const [newBreaks, setNewBreaks] = useState<{[key: string]: {startTime: string, endTime: string}}>({
    domingo: { startTime: '12:00', endTime: '13:00' },
    segunda: { startTime: '12:00', endTime: '13:00' },
    terca: { startTime: '12:00', endTime: '13:00' },
    quarta: { startTime: '12:00', endTime: '13:00' },
    quinta: { startTime: '12:00', endTime: '13:00' },
    sexta: { startTime: '12:00', endTime: '13:00' },
    sabado: { startTime: '12:00', endTime: '13:00' },
  });

  const { data: allProfessionals = [], isLoading } = useQuery<Professional[]>({
    queryKey: ['/api/company/professionals'],
  });

  // Query company profile to check enableProfessionalLocations
  const { data: companyProfile } = useQuery<any>({
    queryKey: ["/api/company/auth/profile"],
  });

  // Query professional locations
  const { data: professionalLocations = [] } = useQuery<any[]>({
    queryKey: ["/api/company/locations"],
    enabled: companyProfile?.enableProfessionalLocations === true,
  });

  // Filtrar profissionais baseado em showArchived
  const professionals = showArchived
    ? allProfessionals
    : allProfessionals.filter(p => p.archived !== 1);

  // Query for professional breaks
  const { data: professionalBreaks = [] } = useQuery<ProfessionalBreak[]>({
    queryKey: ['/api/company/professionals', editingProfessional?.id, 'breaks'],
    queryFn: async () => {
      if (!editingProfessional?.id) return [];
      const response = await fetch(`/api/company/professionals/${editingProfessional.id}/breaks`);
      if (!response.ok) throw new Error('Erro ao buscar pausas');
      return response.json();
    },
    enabled: !!editingProfessional?.id,
  });

  // Query for professional days off
  const { data: professionalDaysOff = [] } = useQuery<ProfessionalDayOff[]>({
    queryKey: ['/api/company/professionals', editingProfessional?.id, 'days-off'],
    queryFn: async () => {
      if (!editingProfessional?.id) return [];
      const response = await fetch(`/api/company/professionals/${editingProfessional.id}/days-off`);
      if (!response.ok) throw new Error('Erro ao buscar dias indisponíveis');
      return response.json();
    },
    enabled: !!editingProfessional?.id,
  });

  // State for new day off
  const [newDayOff, setNewDayOff] = useState({ date: '', reason: '' });

  // Query for professional exceptional schedules
  const { data: professionalExceptionalSchedules = [] } = useQuery<ProfessionalExceptionalSchedule[]>({
    queryKey: ['/api/company/professionals', editingProfessional?.id, 'exceptional-schedules'],
    queryFn: async () => {
      if (!editingProfessional?.id) return [];
      const response = await fetch(`/api/company/professionals/${editingProfessional.id}/exceptional-schedules`);
      if (!response.ok) throw new Error('Erro ao buscar horários excepcionais');
      return response.json();
    },
    enabled: !!editingProfessional?.id,
  });

  // State for new exceptional schedule
  const [newExceptionalSchedule, setNewExceptionalSchedule] = useState({
    date: '',
    startTime: '',
    endTime: '',
    reason: ''
  });

  // State for new exception break times (keyed by schedule id)
  const [newExceptionBreaks, setNewExceptionBreaks] = useState<{[key: number]: {startTime: string, endTime: string}}>({});

  const form = useForm<ProfessionalFormData>({
    resolver: zodResolver(updateProfessionalSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      timeInterval: 30,
      minimumAdvanceHours: 0,
      password: "",
      active: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProfessionalFormData) => {
      const response = await fetch('/api/company/professionals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Erro ao criar profissional');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/professionals'] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Sucesso",
        description: "Profissional criado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProfessionalFormData) => {
      if (!editingProfessional) return;
      
      // Remove empty password field from update data
      const updateData = { ...data };
      if (!updateData.password || updateData.password.trim() === '') {
        delete updateData.password;
      }
      
      const response = await fetch(`/api/company/professionals/${editingProfessional.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) {
        throw new Error('Erro ao atualizar profissional');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/professionals'] });
      setIsDialogOpen(false);
      setEditingProfessional(null);
      form.reset();
      toast({
        title: "Sucesso",
        description: "Profissional atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/company/professionals/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Erro ao excluir profissional');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/professionals'] });
      toast({
        title: "Sucesso",
        description: "Profissional excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/company/professionals/${id}/archive`, {
        method: 'PATCH',
      });
      if (!response.ok) {
        throw new Error('Erro ao arquivar profissional');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/professionals'] });
      toast({
        title: "Sucesso",
        description: "Profissional arquivado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/company/professionals/${id}/unarchive`, {
        method: 'PATCH',
      });
      if (!response.ok) {
        throw new Error('Erro ao desarquivar profissional');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/professionals'] });
      toast({
        title: "Sucesso",
        description: "Profissional desarquivado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to create a professional break
  const createBreakMutation = useMutation({
    mutationFn: async (breakData: { professionalId: number; dayOfWeek: string; startTime: string; endTime: string }) => {
      const response = await fetch(`/api/company/professionals/${breakData.professionalId}/breaks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dayOfWeek: breakData.dayOfWeek,
          startTime: breakData.startTime,
          endTime: breakData.endTime,
        }),
      });
      if (!response.ok) {
        throw new Error('Erro ao criar pausa');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/professionals', editingProfessional?.id, 'breaks'] });
      toast({
        title: "Sucesso",
        description: "Pausa adicionada com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a professional break
  const deleteBreakMutation = useMutation({
    mutationFn: async ({ professionalId, breakId }: { professionalId: number; breakId: number }) => {
      const response = await fetch(`/api/company/professionals/${professionalId}/breaks/${breakId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Erro ao excluir pausa');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/professionals', editingProfessional?.id, 'breaks'] });
      toast({
        title: "Sucesso",
        description: "Pausa removida com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper to add a break for a specific day
  const handleAddBreak = (dayKey: string) => {
    if (!editingProfessional?.id) return;
    const breakTime = newBreaks[dayKey];
    createBreakMutation.mutate({
      professionalId: editingProfessional.id,
      dayOfWeek: dayKey,
      startTime: breakTime.startTime,
      endTime: breakTime.endTime,
    });
  };

  // Helper to delete a break
  const handleDeleteBreak = (breakId: number) => {
    if (!editingProfessional?.id) return;
    deleteBreakMutation.mutate({
      professionalId: editingProfessional.id,
      breakId,
    });
  };

  // Helper to update new break time
  const updateNewBreak = (dayKey: string, field: 'startTime' | 'endTime', value: string) => {
    setNewBreaks(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value,
      },
    }));
  };

  // Mutation to create a day off
  const createDayOffMutation = useMutation({
    mutationFn: async (data: { professionalId: number; dateOff: string; reason?: string }) => {
      const response = await fetch(`/api/company/professionals/${data.professionalId}/days-off`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateOff: data.dateOff,
          reason: data.reason,
        }),
      });
      if (!response.ok) {
        throw new Error('Erro ao criar dia indisponível');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/professionals', editingProfessional?.id, 'days-off'] });
      setNewDayOff({ date: '', reason: '' });
      toast({
        title: "Sucesso",
        description: "Dia indisponível adicionado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a day off
  const deleteDayOffMutation = useMutation({
    mutationFn: async ({ professionalId, dayOffId }: { professionalId: number; dayOffId: number }) => {
      const response = await fetch(`/api/company/professionals/${professionalId}/days-off/${dayOffId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Erro ao excluir dia indisponível');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/professionals', editingProfessional?.id, 'days-off'] });
      toast({
        title: "Sucesso",
        description: "Dia indisponível removido com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper to add a day off
  const handleAddDayOff = () => {
    if (!editingProfessional?.id || !newDayOff.date) return;
    createDayOffMutation.mutate({
      professionalId: editingProfessional.id,
      dateOff: newDayOff.date,
      reason: newDayOff.reason || undefined,
    });
  };

  // Mutation to create an exceptional schedule
  const createExceptionalScheduleMutation = useMutation({
    mutationFn: async (data: {
      professionalId: number;
      exceptionDate: string;
      startTime: string;
      endTime: string;
      reason?: string;
    }) => {
      const response = await fetch(`/api/company/professionals/${data.professionalId}/exceptional-schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exceptionDate: data.exceptionDate,
          startTime: data.startTime,
          endTime: data.endTime,
          reason: data.reason,
        }),
      });
      if (!response.ok) {
        throw new Error('Erro ao criar horário excepcional');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/company/professionals', editingProfessional?.id, 'exceptional-schedules'],
      });
      setNewExceptionalSchedule({ date: '', startTime: '', endTime: '', reason: '' });
      toast({
        title: "Sucesso",
        description: "Horário excepcional adicionado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to delete an exceptional schedule
  const deleteExceptionalScheduleMutation = useMutation({
    mutationFn: async ({ professionalId, scheduleId }: { professionalId: number; scheduleId: number }) => {
      const response = await fetch(
        `/api/company/professionals/${professionalId}/exceptional-schedules/${scheduleId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        throw new Error('Erro ao excluir horário excepcional');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/company/professionals', editingProfessional?.id, 'exceptional-schedules'],
      });
      toast({
        title: "Sucesso",
        description: "Horário excepcional removido com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper to add an exceptional schedule
  const handleAddExceptionalSchedule = () => {
    if (
      !editingProfessional?.id ||
      !newExceptionalSchedule.date ||
      !newExceptionalSchedule.startTime ||
      !newExceptionalSchedule.endTime
    ) {
      toast({
        title: "Erro",
        description: "Data, horário de início e horário de fim são obrigatórios",
        variant: "destructive",
      });
      return;
    }
    createExceptionalScheduleMutation.mutate({
      professionalId: editingProfessional.id,
      exceptionDate: newExceptionalSchedule.date,
      startTime: newExceptionalSchedule.startTime,
      endTime: newExceptionalSchedule.endTime,
      reason: newExceptionalSchedule.reason || undefined,
    });
  };

  // Helper to delete an exceptional schedule
  const handleDeleteExceptionalSchedule = (scheduleId: number) => {
    if (!editingProfessional?.id) return;
    deleteExceptionalScheduleMutation.mutate({
      professionalId: editingProfessional.id,
      scheduleId,
    });
  };

  // Mutation to create an exception break
  const createExceptionBreakMutation = useMutation({
    mutationFn: async (data: { professionalId: number; scheduleId: number; startTime: string; endTime: string }) => {
      const response = await fetch(`/api/company/professionals/${data.professionalId}/exceptional-schedules/${data.scheduleId}/breaks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: data.startTime,
          endTime: data.endTime,
        }),
      });
      if (!response.ok) throw new Error('Erro ao criar pausa');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/company/professionals', editingProfessional?.id, 'exception-breaks'],
      });
    },
  });

  // Mutation to delete an exception break
  const deleteExceptionBreakMutation = useMutation({
    mutationFn: async (data: { professionalId: number; scheduleId: number; breakId: number }) => {
      const response = await fetch(`/api/company/professionals/${data.professionalId}/exceptional-schedules/${data.scheduleId}/breaks/${data.breakId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Erro ao excluir pausa');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/company/professionals', editingProfessional?.id, 'exception-breaks'],
      });
    },
  });

  // Helper to add an exception break
  const handleAddExceptionBreak = (scheduleId: number) => {
    if (!editingProfessional?.id) return;
    const breakTime = newExceptionBreaks[scheduleId] || { startTime: '12:00', endTime: '13:00' };
    createExceptionBreakMutation.mutate({
      professionalId: editingProfessional.id,
      scheduleId,
      startTime: breakTime.startTime,
      endTime: breakTime.endTime,
    });
  };

  // Helper to delete an exception break
  const handleDeleteExceptionBreak = (scheduleId: number, breakId: number) => {
    if (!editingProfessional?.id) return;
    deleteExceptionBreakMutation.mutate({
      professionalId: editingProfessional.id,
      scheduleId,
      breakId,
    });
  };

  // Helper to update new exception break time
  const updateNewExceptionBreak = (scheduleId: number, field: 'startTime' | 'endTime', value: string) => {
    setNewExceptionBreaks(prev => ({
      ...prev,
      [scheduleId]: {
        ...(prev[scheduleId] || { startTime: '12:00', endTime: '13:00' }),
        [field]: value,
      }
    }));
  };

  // Helper to delete a day off
  const handleDeleteDayOff = (dayOffId: number) => {
    if (!editingProfessional?.id) return;
    deleteDayOffMutation.mutate({
      professionalId: editingProfessional.id,
      dayOffId,
    });
  };

  const onSubmit = (data: ProfessionalFormData) => {
    // Validação adicional ao criar profissional
    if (!editingProfessional) {
      // Ao criar, email e senha são obrigatórios
      if (!data.email || data.email.trim() === '') {
        toast({
          title: "Erro de validação",
          description: "Email é obrigatório ao criar um profissional",
          variant: "destructive",
        });
        return;
      }
      if (!data.password || data.password.trim() === '') {
        toast({
          title: "Erro de validação",
          description: "Senha é obrigatória ao criar um profissional",
          variant: "destructive",
        });
        return;
      }
    }

    if (editingProfessional) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = async (professional: Professional) => {
    setEditingProfessional(professional);

    // Reset o formulário primeiro para limpar estados anteriores
    form.reset({
      name: professional.name,
      email: professional.email || '',
      phone: professional.phone || '',
      timeInterval: professional.timeInterval ?? 30, // Usar ?? para permitir valor 0
      minimumAdvanceHours: professional.minimumAdvanceHours ?? 0,
      password: '',
      active: professional.active,
    });

    // Load individual schedules from new API
    try {
      const response = await fetch(`/api/company/professionals/${professional.id}/schedules`);
      if (response.ok) {
        const savedSchedules = await response.json();

        const dayKeyMap: { [key: number]: string } = {
          0: 'domingo',
          1: 'segunda',
          2: 'terca',
          3: 'quarta',
          4: 'quinta',
          5: 'sexta',
          6: 'sabado'
        };

        const newSchedules: any = {
          domingo: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
          segunda: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
          terca: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
          quarta: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
          quinta: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
          sexta: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
          sabado: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
        };

        // Load individual day schedules
        savedSchedules.forEach((schedule: any) => {
          const dayKey = dayKeyMap[schedule.dayOfWeek];
          if (dayKey) {
            newSchedules[dayKey] = {
              enabled: Boolean(schedule.isEnabled),
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              locationId: schedule.locationId || null,
            };
          }
        });

        setSchedules(newSchedules);
      }
    } catch (error) {
      // Fall back to default schedules if loading fails
      setSchedules({
        domingo: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
        segunda: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
        terca: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
        quarta: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
        quinta: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
        sexta: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
        sabado: { enabled: false, startTime: '09:00', endTime: '18:00', locationId: null },
      });
    }

    // Força revalidação
    setTimeout(() => {
      form.trigger();
    }, 100);

    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Tem certeza que deseja excluir este profissional?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleArchiveConfirm = () => {
    if (archiveConfirmId !== null) {
      archiveMutation.mutate(archiveConfirmId);
      setArchiveConfirmId(null);
    }
  };

  const openCreateDialog = () => {
    setEditingProfessional(null);
    form.reset();
    setIsDialogOpen(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Carregando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 ml-16 sm:ml-0">Profissionais</h1>
          <p className="text-gray-600">Gerencie sua equipe de profissionais</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="text-sm font-normal cursor-pointer">
              Mostrar Arquivados
            </Label>
          </div>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className={viewMode === 'grid' ? 'text-white' : ''}
              style={viewMode === 'grid' ? { backgroundColor: 'var(--primary-color, #5e6d8d)' } : {}}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'text-white' : ''}
              style={viewMode === 'list' ? { backgroundColor: 'var(--primary-color, #5e6d8d)' } : {}}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                onClick={openCreateDialog} 
                className="text-white"
                style={{ backgroundColor: 'var(--primary-color, #5e6d8d)' }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo Profissional
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] flex flex-col overflow-hidden">
              <DialogHeader className="flex-shrink-0 px-1">
                <DialogTitle className="text-lg sm:text-xl">
                  {editingProfessional ? 'Editar Profissional' : 'Novo Profissional'}
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {editingProfessional
                    ? 'Edite as informações do profissional.'
                    : 'Adicione um novo profissional à sua equipe.'}
                </DialogDescription>
              </DialogHeader>
              
              {/* Alert for professional limit when creating new professional */}
              {!editingProfessional && !canAddProfessional() && (
                <Alert className="border-red-200 bg-red-50">
                  <Lock className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    Você pode adicionar somente {getProfessionalsLimitInfo()?.limit} profissionais. 
                    Atualmente você tem {getProfessionalsLimitInfo()?.current} profissionais cadastrados. 
                    Faça upgrade do seu plano para adicionar mais profissionais.
                  </AlertDescription>
                </Alert>
              )}
              
              <Tabs defaultValue="dados" className="w-full flex-1 flex flex-col min-h-0">
                <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
                  <TabsTrigger value="dados" className="text-xs sm:text-sm px-1 sm:px-3">Dados</TabsTrigger>
                  <TabsTrigger value="horarios" className="text-xs sm:text-sm px-1 sm:px-3">Horários</TabsTrigger>
                  <TabsTrigger value="servicos" className="text-xs sm:text-sm px-1 sm:px-3">Serviços</TabsTrigger>
                </TabsList>
                
                <TabsContent value="dados" className="flex-1 overflow-y-auto mt-2">
                  <form onSubmit={form.handleSubmit(onSubmit)}>
                    <div className="grid gap-4 py-2 px-1">
                      <div className="space-y-2">
                        <Label htmlFor="name">Nome *</Label>
                        <Input
                          id="name"
                          placeholder="Nome completo do profissional"
                          autoComplete="name"
                          {...form.register('name')}
                        />
                        {form.formState.errors.name && (
                          <p className="text-sm text-red-500">
                            {form.formState.errors.name.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="email">Email (Login) *</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="email@exemplo.com"
                          autoComplete="email"
                          {...form.register('email')}
                        />
                        <p className="text-xs text-gray-500">
                          Este email será usado para fazer login no sistema
                        </p>
                        {form.formState.errors.email && (
                          <p className="text-sm text-red-500">
                            {form.formState.errors.email.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Telefone</Label>
                        <Input
                          id="phone"
                          placeholder="(11) 99999-9999"
                          autoComplete="tel"
                          {...form.register('phone')}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="timeInterval">Intervalo de Tempo *</Label>
                          <Select
                            value={(form.watch('timeInterval') ?? 30).toString()}
                            onValueChange={(value) => form.setValue('timeInterval', parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o intervalo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Sem intervalo</SelectItem>
                              <SelectItem value="15">15 minutos</SelectItem>
                              <SelectItem value="30">30 minutos</SelectItem>
                              <SelectItem value="45">45 minutos</SelectItem>
                              <SelectItem value="60">60 minutos (1 hora)</SelectItem>
                              <SelectItem value="90">90 minutos (1h30)</SelectItem>
                              <SelectItem value="120">120 minutos (2 horas)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="minimumAdvanceHours">Antecedência Mínima *</Label>
                          <Select
                            value={String(parseFloat(form.watch('minimumAdvanceHours')?.toString() || '0') || 0)}
                            onValueChange={(value) => form.setValue('minimumAdvanceHours', parseFloat(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Sem antecedência</SelectItem>
                              <SelectItem value="0.5">30 minutos</SelectItem>
                              <SelectItem value="1">1 hora</SelectItem>
                              <SelectItem value="2">2 horas</SelectItem>
                              <SelectItem value="3">3 horas</SelectItem>
                              <SelectItem value="6">6 horas</SelectItem>
                              <SelectItem value="12">12 horas</SelectItem>
                              <SelectItem value="24">1 dia (24h)</SelectItem>
                              <SelectItem value="48">2 dias (48h)</SelectItem>
                              <SelectItem value="72">3 dias (72h)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="password">Senha {!editingProfessional && '*'}</Label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            placeholder={editingProfessional ? "Deixe em branco para manter" : "Digite a senha"}
                            autoComplete="current-password"
                            {...form.register('password')}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4 text-gray-400" />
                            ) : (
                              <Eye className="h-4 w-4 text-gray-400" />
                            )}
                          </Button>
                        </div>
                        {form.formState.errors.password && (
                          <p className="text-sm text-red-500">
                            {form.formState.errors.password.message}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <Label htmlFor="active">Profissional ativo</Label>
                        <Switch
                          id="active"
                          checked={form.watch('active')}
                          onCheckedChange={(checked) => form.setValue('active', checked)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        disabled={
                          createMutation.isPending ||
                          updateMutation.isPending ||
                          (!editingProfessional && !canAddProfessional())
                        }
                        className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => {
                          const formData = form.getValues();
                          onSubmit(formData);
                        }}
                      >
                        {editingProfessional ? 'Atualizar' : 'Cadastrar'}
                      </Button>
                    </DialogFooter>
                  </form>
                </TabsContent>
                
                <TabsContent value="horarios" className="flex-1 overflow-y-auto mt-2 px-1">
                  <div className="flex items-center space-x-2 mb-4">
                    <Clock className="h-5 w-5 text-purple-600" />
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900">Horários de Funcionamento</h3>
                  </div>

                  <div className="space-y-3">
                    {daysOfWeek.map((day) => {
                      const schedule = schedules[day.key as keyof typeof schedules];
                      const dayBreaks = professionalBreaks.filter(b => b.dayOfWeek === day.key);
                      return (
                        <div key={day.key} className="border rounded-lg p-3 sm:p-4 bg-gray-50">
                          {/* Header do dia - responsivo */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <div className="flex items-center justify-between sm:justify-start sm:flex-1">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${day.key}-enabled`}
                                  checked={schedule.enabled}
                                  onCheckedChange={(checked) =>
                                    updateSchedule(day.key, 'enabled', !!checked)
                                  }
                                  className="data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                />
                                <Label
                                  htmlFor={`${day.key}-enabled`}
                                  className="text-sm font-medium text-gray-700"
                                >
                                  {day.label}
                                </Label>
                              </div>

                              {/* Botões no mobile - ficam ao lado do nome do dia */}
                              <div className="flex items-center space-x-1 sm:hidden">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="bg-purple-600 hover:bg-purple-700 text-white h-7 px-2"
                                  onClick={() => saveSchedule(day.label)}
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                                  onClick={() =>
                                    updateSchedule(day.key, 'enabled', false)
                                  }
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            {/* Seletores de horário */}
                            {schedule.enabled && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center space-x-1">
                                  <Label className="text-xs text-gray-600">Início</Label>
                                  <Select
                                    value={schedule.startTime}
                                    onValueChange={(value) =>
                                      updateSchedule(day.key, 'startTime', value)
                                    }
                                  >
                                    <SelectTrigger className="w-[70px] h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {timeOptions.map((time) => (
                                        <SelectItem key={time} value={time}>
                                          {time}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="flex items-center space-x-1">
                                  <Label className="text-xs text-gray-600">Fim</Label>
                                  <Select
                                    value={schedule.endTime}
                                    onValueChange={(value) =>
                                      updateSchedule(day.key, 'endTime', value)
                                    }
                                  >
                                    <SelectTrigger className="w-[70px] h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {timeOptions.map((time) => (
                                        <SelectItem key={time} value={time}>
                                          {time}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}

                            {/* Botões desktop - ficam à direita */}
                            <div className="hidden sm:flex items-center space-x-2">
                              <Button
                                type="button"
                                size="sm"
                                className="bg-purple-600 hover:bg-purple-700 text-white"
                                onClick={() => saveSchedule(day.label)}
                              >
                                <Save className="h-4 w-4 mr-1" />
                                Salvar
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() =>
                                  updateSchedule(day.key, 'enabled', false)
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Select de Local de Atendimento */}
                          {schedule.enabled && companyProfile?.enableProfessionalLocations && professionalLocations.length > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-purple-500 flex-shrink-0" />
                              <Label className="text-xs text-gray-600 flex-shrink-0">Local:</Label>
                              <Select
                                value={schedule.locationId ? String(schedule.locationId) : "none"}
                                onValueChange={(value) =>
                                  updateSchedule(day.key, 'locationId', value === "none" ? null : Number(value))
                                }
                              >
                                <SelectTrigger className="w-[200px] h-8 text-xs">
                                  <SelectValue placeholder="Selecione o local" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Nenhum</SelectItem>
                                  {professionalLocations.map((location: any) => (
                                    <SelectItem key={location.id} value={String(location.id)}>
                                      {location.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* Seção de Pausas */}
                          {schedule.enabled && editingProfessional && (
                            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
                              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                                <Coffee className="h-4 w-4 text-orange-500" />
                                <span className="text-xs sm:text-sm font-medium text-gray-700">Pausas</span>
                              </div>

                              {/* Lista de pausas existentes */}
                              {dayBreaks.length > 0 && (
                                <div className="space-y-1 sm:space-y-2 mb-2 sm:mb-3">
                                  {dayBreaks.map((breakItem) => (
                                    <div key={breakItem.id} className="flex items-center justify-between bg-orange-50 rounded-md px-2 sm:px-3 py-1.5 sm:py-2">
                                      <span className="text-xs sm:text-sm text-gray-700">
                                        {breakItem.startTime} - {breakItem.endTime}
                                      </span>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 sm:h-7 sm:w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                        onClick={() => handleDeleteBreak(breakItem.id)}
                                      >
                                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Formulário para adicionar nova pausa */}
                              <div className="flex items-center flex-wrap gap-1 sm:gap-2">
                                <Input
                                  type="time"
                                  value={newBreaks[day.key]?.startTime || '12:00'}
                                  onChange={(e) => updateNewBreak(day.key, 'startTime', e.target.value)}
                                  className="w-[90px] sm:w-[100px] h-7 sm:h-9 text-xs sm:text-sm"
                                />
                                <span className="text-gray-500 text-xs sm:text-sm">-</span>
                                <Input
                                  type="time"
                                  value={newBreaks[day.key]?.endTime || '13:00'}
                                  onChange={(e) => updateNewBreak(day.key, 'endTime', e.target.value)}
                                  className="w-[90px] sm:w-[100px] h-7 sm:h-9 text-xs sm:text-sm"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 sm:h-9 text-xs sm:text-sm text-orange-600 border-orange-300 hover:bg-orange-50 px-2 sm:px-3"
                                  onClick={() => handleAddBreak(day.key)}
                                  disabled={createBreakMutation.isPending}
                                >
                                  <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                  Pausa
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end mt-6 pt-4 border-t">
                    <Button
                      type="button"
                      className="bg-purple-600 hover:bg-purple-700"
                      onClick={() => {
                        toast({
                          title: "Horários salvos",
                          description: "Todos os horários foram salvos com sucesso",
                        });
                      }}
                    >
                      Salvar Todos os Horários
                    </Button>
                  </div>

                  {/* Seção de Dias Indisponíveis */}
                  {editingProfessional && (
                    <div className="mt-6 pt-4 border-t">
                      <div className="flex items-center space-x-2 mb-3">
                        <CalendarOff className="h-4 sm:h-5 w-4 sm:w-5 text-red-500" />
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Dias Indisponíveis</h3>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mb-3">
                        Marque datas em que o profissional não estará disponível.
                      </p>

                      {/* Lista de dias indisponíveis existentes */}
                      {professionalDaysOff.length > 0 && (
                        <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
                          {professionalDaysOff.map((dayOff) => {
                            // Extrai apenas a parte da data (YYYY-MM-DD) caso venha com timezone
                            const dateStr = dayOff.dateOff.includes('T')
                              ? dayOff.dateOff.split('T')[0]
                              : dayOff.dateOff;
                            const dateFormatted = new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
                              weekday: 'short',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            });
                            return (
                              <div key={dayOff.id} className="flex items-center justify-between bg-red-50 rounded-md px-2 sm:px-4 py-2 sm:py-3">
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs sm:text-sm font-medium text-gray-900 capitalize block truncate">{dateFormatted}</span>
                                  {dayOff.reason && (
                                    <span className="text-xs sm:text-sm text-gray-500 block truncate">{dayOff.reason}</span>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-100 flex-shrink-0 ml-2"
                                  onClick={() => handleDeleteDayOff(dayOff.id)}
                                >
                                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Formulário para adicionar novo dia indisponível */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                        <div>
                          <Label className="text-xs sm:text-sm text-gray-600 mb-1 block">Data</Label>
                          <Input
                            type="date"
                            value={newDayOff.date}
                            onChange={(e) => setNewDayOff(prev => ({ ...prev, date: e.target.value }))}
                            className="h-8 sm:h-10"
                          />
                        </div>
                        <div>
                          <Label className="text-xs sm:text-sm text-gray-600 mb-1 block">Motivo (opcional)</Label>
                          <Input
                            type="text"
                            placeholder="Ex: Férias..."
                            value={newDayOff.reason}
                            onChange={(e) => setNewDayOff(prev => ({ ...prev, reason: e.target.value }))}
                            className="h-8 sm:h-10"
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 sm:h-10 text-xs sm:text-sm text-red-600 border-red-300 hover:bg-red-50 w-full"
                            onClick={handleAddDayOff}
                            disabled={!newDayOff.date || createDayOffMutation.isPending}
                          >
                            <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            Adicionar Folga
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Seção de Horários Excepcionais */}
                  {editingProfessional && (
                    <div className="mt-6 pt-4 border-t">
                      <div className="flex items-center space-x-2 mb-3">
                        <Calendar className="h-4 sm:h-5 w-4 sm:w-5 text-blue-500" />
                        <h3 className="text-base sm:text-lg font-semibold text-gray-900">Horários Excepcionais</h3>
                      </div>
                      <p className="text-xs sm:text-sm text-gray-500 mb-3">
                        Configure horários diferentes para datas específicas.
                      </p>

                      {/* Lista de horários excepcionais existentes */}
                      {professionalExceptionalSchedules.length > 0 && (
                        <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
                          {professionalExceptionalSchedules.map((schedule) => {
                            // Extrai apenas a parte da data (YYYY-MM-DD) caso venha com timezone
                            const dateStr = schedule.exceptionDate.includes('T')
                              ? schedule.exceptionDate.split('T')[0]
                              : schedule.exceptionDate;
                            const dateFormatted = new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
                              weekday: 'short',
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            });
                            return (
                              <div key={schedule.id} className="bg-blue-50 rounded-md px-2 sm:px-4 py-2 sm:py-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs sm:text-sm font-medium text-gray-900 capitalize block truncate">{dateFormatted}</span>
                                    <span className="text-xs sm:text-sm text-gray-700 block">
                                      {schedule.startTime} às {schedule.endTime}
                                      {schedule.reason && <span className="text-gray-500 ml-1">({schedule.reason})</span>}
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-100 flex-shrink-0 ml-2"
                                    onClick={() => handleDeleteExceptionalSchedule(schedule.id)}
                                  >
                                    <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                                  </Button>
                                </div>
                                <ExceptionBreaksSection
                                  professionalId={editingProfessional!.id}
                                  scheduleId={schedule.id}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Formulário para adicionar novo horário excepcional */}
                      <div className="grid grid-cols-1 gap-3">
                        {/* Linha 1: Data e Horários */}
                        <div className="grid grid-cols-5 gap-2">
                          <div className="col-span-2">
                            <Label className="text-xs sm:text-sm text-gray-600 mb-1 block">Data</Label>
                            <Input
                              type="date"
                              value={newExceptionalSchedule.date}
                              onChange={(e) => setNewExceptionalSchedule(prev => ({ ...prev, date: e.target.value }))}
                              className="h-10 w-full min-w-[140px]"
                            />
                          </div>
                          <div>
                            <Label className="text-xs sm:text-sm text-gray-600 mb-1 block">Início</Label>
                            <Input
                              type="time"
                              value={newExceptionalSchedule.startTime}
                              onChange={(e) => setNewExceptionalSchedule(prev => ({ ...prev, startTime: e.target.value }))}
                              className="h-10"
                            />
                          </div>
                          <div>
                            <Label className="text-xs sm:text-sm text-gray-600 mb-1 block">Fim</Label>
                            <Input
                              type="time"
                              value={newExceptionalSchedule.endTime}
                              onChange={(e) => setNewExceptionalSchedule(prev => ({ ...prev, endTime: e.target.value }))}
                              className="h-10"
                            />
                          </div>
                          <div>
                            <Label className="text-xs sm:text-sm text-gray-600 mb-1 block">Motivo</Label>
                            <Input
                              type="text"
                              placeholder="Opcional..."
                              value={newExceptionalSchedule.reason}
                              onChange={(e) => setNewExceptionalSchedule(prev => ({ ...prev, reason: e.target.value }))}
                              className="h-10"
                            />
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 sm:h-10 mt-2 sm:mt-3 text-xs sm:text-sm text-blue-600 border-blue-300 hover:bg-blue-50 w-full sm:w-auto"
                        onClick={handleAddExceptionalSchedule}
                        disabled={
                          !newExceptionalSchedule.date ||
                          !newExceptionalSchedule.startTime ||
                          !newExceptionalSchedule.endTime ||
                          createExceptionalScheduleMutation.isPending
                        }
                      >
                        <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                        Adicionar Horário Excepcional
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="servicos" className="flex-1 overflow-y-auto mt-2 px-1">
                  {editingProfessional ? (
                    <ProfessionalServiceHistory professionalId={editingProfessional.id} />
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">Salve o profissional primeiro para ver o histórico de serviços</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {professionals.map((professional) => (
            <Card key={professional.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{professional.name}</CardTitle>
                    </div>
                  </div>
                  <Badge
                    className={professional.archived === 1
                      ? "bg-gray-100 text-gray-800 hover:bg-gray-100"
                      : "bg-purple-100 text-purple-800 hover:bg-purple-100"
                    }
                  >
                    {professional.archived === 1 ? 'Arquivado' : 'Ativo'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  {professional.email && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4" />
                      <span>{professional.email}</span>
                    </div>
                  )}
                  {professional.phone && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Phone className="w-4 h-4" />
                      <span>{professional.phone}</span>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Cadastrado em {formatDate(professional.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col space-y-2">
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(professional)}
                      className="flex-1"
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    {professional.archived === 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => unarchiveMutation.mutate(professional.id)}
                        className="flex-1 text-green-600 hover:text-green-700"
                      >
                        <ArchiveRestore className="h-4 w-4 mr-1" />
                        Desarquivar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setArchiveConfirmId(professional.id)}
                        className="flex-1 text-orange-600 hover:text-orange-700"
                      >
                        <Archive className="h-4 w-4 mr-1" />
                        Arquivar
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(professional.id)}
                    className="w-full text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {professionals.map((professional) => (
            <Card key={professional.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{professional.name}</h3>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      {professional.email && (
                        <span className="flex items-center space-x-1">
                          <Mail className="w-3 h-3" />
                          <span>{professional.email}</span>
                        </span>
                      )}
                      {professional.phone && (
                        <span className="flex items-center space-x-1">
                          <Phone className="w-3 h-3" />
                          <span>{professional.phone}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge
                    className={professional.archived === 1
                      ? "bg-gray-100 text-gray-800"
                      : "bg-purple-100 text-purple-800"
                    }
                  >
                    {professional.archived === 1 ? 'Arquivado' : 'Ativo'}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(professional)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  {professional.archived === 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unarchiveMutation.mutate(professional.id)}
                      className="text-green-600 hover:text-green-700"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setArchiveConfirmId(professional.id)}
                      className="text-orange-600 hover:text-orange-700"
                      title="Arquivar"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(professional.id)}
                    className="text-red-600 hover:text-red-700"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {professionals.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <User className="h-8 w-8 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Nenhum profissional encontrado
            </h3>
            <p className="text-gray-600 text-center mb-4">
              Comece adicionando profissionais à sua equipe para organizar melhor os serviços.
            </p>
            <Button onClick={openCreateDialog} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Primeiro Profissional
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Alert Dialog para confirmar arquivamento */}
      <AlertDialog open={archiveConfirmId !== null} onOpenChange={(open) => !open && setArchiveConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar Profissional?</AlertDialogTitle>
            <AlertDialogDescription>
              O profissional será arquivado e não aparecerá na lista principal.
              Você pode desarquivá-lo a qualquer momento ativando "Mostrar Arquivados".
              <br /><br />
              <strong>Histórico preservado:</strong> Agendamentos antigos continuarão visíveis e funcionando normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveConfirm}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Arquivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FloatingHelpButton menuLocation="professionals" />
    </div>
  );
}