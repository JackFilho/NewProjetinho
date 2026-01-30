import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { TrendingUp, Clock, Calendar as CalendarIcon, CalendarDays, User, MoreHorizontal, LogOut, Menu, Edit, ChevronLeft, ChevronRight, Check, ChevronsUpDown, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGlobalTheme } from "@/hooks/use-global-theme";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface Professional {
  id: number;
  name: string;
  email: string;
  companyId: number;
}

interface DashboardMetrics {
  today: number;
  todayTrend: string;
  week: number;
  weekTrend: string;
  month: number;
  monthTrend: string;
  weeklyData: Array<{
    week: string;
    appointments: number;
    height: number;
  }>;
}

export default function ProfessionalDashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [activeNav, setActiveNav] = useState<'dashboard' | 'calendar' | 'profile'>('dashboard');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<any>(null);
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editForm, setEditForm] = useState({ date: '', time: '', service: '' });
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newAppointment, setNewAppointment] = useState({
    clientId: '',
    serviceId: '',
    date: '',
    time: '',
  });
  const [clientComboOpen, setClientComboOpen] = useState(false);
  const { toast } = useToast();

  // Aplica as cores globais do sistema
  useGlobalTheme();

  // Função para navegar entre meses
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  // Função para obter dias da semana atual
  const getCurrentWeekDays = () => {
    const today = selectedDate || new Date();
    const dayOfWeek = today.getDay(); // 0 = Domingo, 6 = Sábado
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      weekDays.push(day);
    }
    return weekDays;
  };

  // Função para contar agendamentos por dia
  const getAppointmentCount = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    const count = appointments.filter(apt => apt.date === dateStr).length;
    return count;
  };

  // Função para abrir modal de edição
  const handleEditAppointment = (appointment: any) => {
    setEditingAppointment(appointment);
    setEditForm({
      date: appointment.date,
      time: appointment.time,
      service: appointment.service
    });
    setEditModalOpen(true);
  };

  // Mutation to update appointment
  const updateAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/professional/appointments/${data.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update appointment');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/professional/appointments"] });
      toast({
        title: "Agendamento atualizado!",
        description: `${editingAppointment?.clientName} - ${editForm.service}`,
      });
      setEditModalOpen(false);
      setEditingAppointment(null);
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar agendamento",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  // Função para salvar edição
  const handleSaveEdit = () => {
    if (!editingAppointment) return;

    updateAppointmentMutation.mutate({
      id: editingAppointment.id,
      appointmentDate: editForm.date,
      appointmentTime: editForm.time,
      clientName: editingAppointment.clientName,
      clientPhone: editingAppointment.clientPhone || '',
    });
  };

  // Gerar horários disponíveis (08:00 - 18:00)
  const getAvailableTimeSlots = (selectedDate: string) => {
    const slots = [];
    for (let hour = 8; hour < 18; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        // Verificar se o horário está ocupado
        const isOccupied = appointments.some(
          apt => apt.date === selectedDate && apt.time === time
        );
        if (!isOccupied) {
          slots.push(time);
        }
      }
    }
    return slots;
  };

  // Abrir modal de adicionar agendamento
  const handleOpenAddModal = () => {
    setNewAppointment({
      clientId: '',
      serviceId: '',
      date: selectedDate?.toISOString().split('T')[0] || '',
      time: '',
    });
    setAddModalOpen(true);
  };

  // Mutation to create appointment
  const createAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/professional/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create appointment');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/professional/appointments"] });

      const client = clients.find((c: any) => c.id === parseInt(variables.clientId));
      const service = services.find((s: any) => s.id === parseInt(variables.serviceId));

      toast({
        title: "Agendamento criado!",
        description: `${client?.name} - ${service?.name}`,
      });

      setAddModalOpen(false);
      setNewAppointment({
        clientId: '',
        serviceId: '',
        date: '',
        time: '',
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao criar agendamento",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  // Adicionar novo agendamento
  const handleAddAppointment = () => {
    if (!newAppointment.clientId || !newAppointment.serviceId || !newAppointment.date || !newAppointment.time) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    const client = clients.find((c: any) => c.id === parseInt(newAppointment.clientId));

    createAppointmentMutation.mutate({
      serviceId: parseInt(newAppointment.serviceId),
      clientName: client?.name,
      clientPhone: client?.phone,
      clientEmail: client?.email || '',
      appointmentDate: newAppointment.date,
      appointmentTime: newAppointment.time,
      notes: ''
    });
  };

  // Fetch global settings for logo
  const { data: settings } = useQuery({
    queryKey: ["/api/public-settings"],
    staleTime: 1000 * 60 * 5,
  });

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/professional/status");
        const data = await response.json();

        if (data.isAuthenticated) {
          setProfessional(data.professional);
        } else {
          setLocation("/profissional/login");
        }
      } catch (error) {
        setLocation("/profissional/login");
      }
    };

    checkAuth();
  }, [setLocation]);

  // Fetch appointments for metrics (real data from API)
  const { data: apiAppointments = [], isLoading: isLoadingAppointments, error: appointmentsError } = useQuery({
    queryKey: ["/api/professional/appointments"],
    enabled: !!professional,
  });

  // Convert API appointments to local format for calendar
  const appointments = apiAppointments.map((apt: any) => {
    // Convert date to "YYYY-MM-DD" format consistently
    let dateStr = '';

    if (apt.appointmentDate instanceof Date) {
      dateStr = apt.appointmentDate.toISOString().split('T')[0];
    } else if (typeof apt.appointmentDate === 'string') {
      // Handle both "YYYY-MM-DD" and "YYYY-MM-DDTHH:mm:ss.sssZ" formats
      dateStr = apt.appointmentDate.split('T')[0];
    } else {
      dateStr = new Date().toISOString().split('T')[0]; // fallback to today
    }

    return {
      id: apt.id,
      clientName: apt.clientName,
      date: dateStr,
      time: apt.appointmentTime,
      service: apt.serviceName,
      professionalId: professional?.id || 0
    };
  });


  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["/api/professional/clients"],
    enabled: !!professional,
  });

  // Fetch services
  const { data: services = [] } = useQuery({
    queryKey: ["/api/professional/services"],
    enabled: !!professional,
  });

  // Helper function to parse appointment date as local date (avoiding timezone issues)
  const parseLocalDate = (dateInput: any): Date => {
    const dateStr = typeof dateInput === 'string'
      ? dateInput.split('T')[0]
      : dateInput.toISOString().split('T')[0];
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Calculate metrics from appointments
  const metrics: DashboardMetrics = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate today's appointments
    const todayCount = apiAppointments.filter((apt: any) => {
      const aptDate = parseLocalDate(apt.appointmentDate);
      aptDate.setHours(0, 0, 0, 0);
      return aptDate.getTime() === today.getTime();
    }).length;

    // Calculate this week's appointments
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
    weekStart.setHours(0, 0, 0, 0);
    const weekCount = apiAppointments.filter((apt: any) => {
      const aptDate = parseLocalDate(apt.appointmentDate);
      return aptDate >= weekStart;
    }).length;

    // Calculate this month's appointments
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthCount = apiAppointments.filter((apt: any) => {
      const aptDate = parseLocalDate(apt.appointmentDate);
      return aptDate >= monthStart;
    }).length;

    // Calculate weekly data for the current month
    const weeklyData = [];
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Get first day of the month
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);

    // Get last day of the month
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    // Find the Sunday of the week containing the first day
    const firstWeekStart = new Date(firstDayOfMonth);
    firstWeekStart.setDate(firstDayOfMonth.getDate() - firstDayOfMonth.getDay());
    firstWeekStart.setHours(0, 0, 0, 0);

    // Calculate all weeks in the month
    const weeks = [];
    let currentWeekStart = new Date(firstWeekStart);

    while (currentWeekStart <= lastDayOfMonth) {
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      weeks.push({
        start: new Date(currentWeekStart),
        end: new Date(weekEnd)
      });

      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }

    // Count appointments for each week
    const counts = weeks.map((week, weekIndex) => {
      const count = apiAppointments.filter((apt: any) => {
        const aptDate = parseLocalDate(apt.appointmentDate);
        const isInRange = aptDate >= week.start && aptDate <= week.end;

        return isInRange;
      }).length;

      return count;
    });

    const maxCount = Math.max(...counts, 1);

    // Build weekly data
    weeks.forEach((week, index) => {
      const count = counts[index];
      // Calculate height: if count > 0, minimum 20%, otherwise 0%
      const height = count > 0 ? Math.max((count / maxCount) * 100, 20) : 0;

      // Determine if this is the current week
      const isCurrentWeek = today >= week.start && today <= week.end;

      weeklyData.push({
        week: isCurrentWeek ? 'Atual' : `Sem ${index + 1}`,
        appointments: count,
        height: height
      });
    });

    return {
      today: todayCount,
      todayTrend: "+8%",
      week: weekCount,
      weekTrend: "+12%",
      month: monthCount,
      monthTrend: "+5%",
      weeklyData
    };
  })();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/professional/logout", { method: "POST" });
      toast({ title: "Logout realizado com sucesso" });
      setLocation("/profissional/login");
    } catch (error) {
      toast({ title: "Erro ao fazer logout", variant: "destructive" });
    }
  };

  const showMetricModal = (type: 'today' | 'week' | 'month') => {
    const modalData = {
      today: {
        title: "Atendimentos de Hoje",
        value: metrics.today,
        details: "Próximo agendamento às 14:30",
        trend: "+8% comparado a ontem"
      },
      week: {
        title: "Atendimentos da Semana",
        value: metrics.week,
        details: "Meta semanal: 90 atendimentos",
        trend: "+12% comparado à semana passada"
      },
      month: {
        title: "Atendimentos do Mês",
        value: metrics.month,
        details: "Meta mensal: 400 atendimentos",
        trend: "+5% comparado ao mês passado"
      }
    };

    setModalContent(modalData[type]);
    setModalOpen(true);
  };

  const showWeekModal = (weekData: any) => {
    setModalContent({
      title: `Detalhes - ${weekData.week}`,
      value: weekData.appointments,
      details: "Atendimentos",
      trend: "+5% em relação à semana anterior"
    });
    setModalOpen(true);
  };

  if (!professional) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Debug info panel (temporary)
  const showDebugInfo = new URLSearchParams(window.location.search).get('debug') === 'true';

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Top Navbar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200/60">
        <div className="flex items-center justify-between px-4 h-14" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          {/* Left: Logout button */}
          <button
            className="p-2 hover:bg-red-50 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-red-600"
            onClick={handleLogout}
            title="Sair"
          >
            <LogOut className="w-6 h-6" />
          </button>

          {/* Center: Title */}
          <h1 className="text-lg font-semibold truncate flex-1 text-center px-4">
            Bem vindo, {professional?.name || 'Profissional'}!
          </h1>

          {/* Right: Menu button */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                <Menu className="w-6 h-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[350px]">
              <SheetHeader>
                <SheetTitle className="text-left">Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-8 space-y-4">
                {/* User info */}
                <div className="pb-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{professional?.name}</p>
                      <p className="text-sm text-gray-600">{professional?.email}</p>
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setSidebarOpen(false);
                      setLocation('/profissional/perfil');
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  >
                    <User className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-900">Meu Perfil</span>
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Debug Panel */}
      {showDebugInfo && (
        <div className="fixed top-20 left-4 right-4 bg-yellow-100 border-2 border-yellow-600 p-4 rounded-lg z-50 max-h-96 overflow-auto">
          <h3 className="font-bold mb-2">🐛 Debug Info</h3>
          <div className="text-xs space-y-2">
            <div className="bg-white p-2 rounded">
              <p><strong>Professional ID:</strong> {professional?.id}</p>
              <p><strong>Professional Name:</strong> {professional?.name}</p>
              <p><strong>Company ID:</strong> {professional?.companyId}</p>
            </div>
            <div className="bg-white p-2 rounded">
              <p><strong>Loading:</strong> {isLoadingAppointments ? 'Yes ⏳' : 'No ✅'}</p>
              <p><strong>Error:</strong> {appointmentsError ? '❌ Yes' : '✅ No'}</p>
              {appointmentsError && <p className="text-red-600 text-[10px]">{String(appointmentsError)}</p>}
              <p><strong>API Appointments Count:</strong> {apiAppointments.length}</p>
              <p><strong>Converted Appointments Count:</strong> {appointments.length}</p>
              <p><strong>Metrics Today:</strong> {metrics.today}</p>
              <p><strong>Metrics Week:</strong> {metrics.week}</p>
              <p><strong>Metrics Month:</strong> {metrics.month}</p>
            </div>
            {apiAppointments.length > 0 && (
              <div className="bg-white p-2 rounded">
                <strong>First API Appointment (raw):</strong>
                <pre className="text-[10px] mt-1 overflow-x-auto">{JSON.stringify(apiAppointments[0], null, 2)}</pre>
              </div>
            )}
            {appointments.length > 0 && (
              <div className="bg-white p-2 rounded">
                <strong>First Converted Appointment:</strong>
                <pre className="text-[10px] mt-1 overflow-x-auto">{JSON.stringify(appointments[0], null, 2)}</pre>
              </div>
            )}
            {apiAppointments.length === 0 && (
              <div className="bg-red-100 p-2 rounded border border-red-400">
                <strong>⚠️ No appointments found!</strong>
                <p className="mt-1">Possible reasons:</p>
                <ul className="list-disc ml-4 mt-1">
                  <li>No appointments in database for this professional</li>
                  <li>professionalId or companyId mismatch</li>
                  <li>API endpoint returning empty array</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 pt-14 pb-20 overflow-x-hidden">
        {/* Dashboard View */}
        {activeNav === 'dashboard' && (
          <>
            {/* Dashboard Metrics Section */}
            <div className="px-4 py-6">
              <h1 className="text-2xl font-semibold mb-6 text-gray-900">
                Dashboard
              </h1>

          {/* Revenue Cards Section */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {/* Today Revenue Card */}
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-4">
              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  Faturamento Hoje
                </h3>
                <div className="text-2xl font-bold text-primary mb-1">
                  R$ 0,00
                </div>
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <TrendingUp className="w-3 h-3" />
                  <span>+15%</span>
                </div>
              </div>
            </div>

            {/* Week Revenue Card */}
            <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-4">
              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  Faturamento Semana
                </h3>
                <div className="text-2xl font-bold text-primary mb-1">
                  R$ 0,00
                </div>
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <TrendingUp className="w-3 h-3" />
                  <span>+20%</span>
                </div>
              </div>
            </div>

            {/* Month Revenue Card */}
            <div className="bg-gradient-to-br from-primary/5 to-white border border-primary/20 rounded-xl p-4">
              <div className="flex flex-col items-center text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  Faturamento Mês
                </h3>
                <div className="text-2xl font-bold text-primary mb-1">
                  R$ 0,00
                </div>
                <div className="flex items-center gap-1 text-xs text-green-600">
                  <TrendingUp className="w-3 h-3" />
                  <span>+18%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Metrics Cards Grid */}
          <div className="grid grid-cols-1 gap-4 mb-8">
            {/* Today Card */}
            <div
              className="bg-gradient-to-br from-white to-gray-50 border border-gray-200/40 rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer active:translate-y-0 active:scale-98"
              onClick={() => showMetricModal('today')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Hoje
                    </h3>
                    <p className="text-sm text-gray-600">
                      Atendimentos de hoje
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    {metrics.today}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <TrendingUp className="w-4 h-4" />
                    <span>{metrics.todayTrend}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Week Card */}
            <div
              className="bg-gradient-to-br from-white to-gray-50 border border-gray-200/40 rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer active:translate-y-0 active:scale-98"
              onClick={() => showMetricModal('week')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CalendarDays className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Semana
                    </h3>
                    <p className="text-sm text-gray-600">
                      Últimos 7 dias
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    {metrics.week}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <TrendingUp className="w-4 h-4" />
                    <span>{metrics.weekTrend}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Month Card */}
            <div
              className="bg-gradient-to-br from-white to-gray-50 border border-gray-200/40 rounded-xl p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer active:translate-y-0 active:scale-98"
              onClick={() => showMetricModal('month')}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <CalendarIcon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Mês
                    </h3>
                    <p className="text-sm text-gray-600">
                      Últimos 30 dias
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    {metrics.month}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <TrendingUp className="w-4 h-4" />
                    <span>{metrics.monthTrend}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Appointments Section */}
        <div className="px-4 pb-6">
          <div className="bg-gradient-to-br from-white to-gray-50 border border-gray-200/40 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Próximos Agendamentos
            </h2>
            {(() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              const upcomingAppointments = appointments
                .filter(apt => {
                  // Parse date as local date (YYYY-MM-DD format)
                  const [year, month, day] = apt.date.split('-').map(Number);
                  const aptDate = new Date(year, month - 1, day);
                  aptDate.setHours(0, 0, 0, 0);
                  return aptDate >= today;
                })
                .sort((a, b) => {
                  // Parse dates as local dates for sorting
                  const [yearA, monthA, dayA] = a.date.split('-').map(Number);
                  const [yearB, monthB, dayB] = b.date.split('-').map(Number);
                  const dateA = new Date(yearA, monthA - 1, dayA, ...a.time.split(':').map(Number));
                  const dateB = new Date(yearB, monthB - 1, dayB, ...b.time.split(':').map(Number));
                  return dateA.getTime() - dateB.getTime();
                })
                .slice(0, 5);

              return upcomingAppointments.length > 0 ? (
              <div className="space-y-3">
                {upcomingAppointments.map((apt) => {
                  // Parse date as local date for display
                  const [year, month, day] = apt.date.split('-').map(Number);
                  const aptDate = new Date(year, month - 1, day);

                  return (
                    <div
                      key={apt.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{apt.clientName}</h3>
                          <p className="text-sm text-gray-600 mt-1">{apt.service}</p>
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                            <div className="flex items-center gap-1">
                              <CalendarIcon className="w-4 h-4" />
                              <span>{aptDate.toLocaleDateString('pt-BR')}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              <span>{apt.time}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhum agendamento próximo</p>
                  <p className="text-xs mt-2">Total de agendamentos: {appointments.length}</p>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Attendance Chart Section */}
        <div className="px-4 pb-6">
          <div className="bg-gradient-to-br from-white to-gray-50 border border-gray-200/40 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Atendimentos por Semana
              </h2>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>

            {/* Chart Container */}
            <div className="w-full h-64 bg-gradient-to-br from-white to-gray-50 rounded-lg p-4 overflow-x-auto">
              <div className="flex items-end justify-between h-full min-w-full gap-2">
                {metrics.weeklyData.map((data, index) => {
                  const isCurrentWeek = data.week === 'Atual';
                  return (
                    <div
                      key={index}
                      className="flex flex-col items-center gap-2 flex-1 cursor-pointer"
                      onClick={() => showWeekModal(data)}
                    >
                      {data.appointments > 0 ? (
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 hover:opacity-80 ${
                            isCurrentWeek ? 'bg-primary/60' : 'bg-primary'
                          }`}
                          style={{
                            height: `${data.height}%`,
                            minHeight: data.appointments > 0 ? '20%' : '0'
                          }}
                        >
                          <div className="text-white text-xs font-bold pt-1 text-center">
                            {data.appointments}
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-0" />
                      )}
                      <span className="text-xs text-gray-600 font-medium">{data.week}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chart Legend */}
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary rounded-full"></div>
                <span className="text-sm text-gray-600">Atendimentos</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary/60 rounded-full"></div>
                <span className="text-sm text-gray-600">Semana Atual</span>
              </div>
            </div>
          </div>
        </div>
          </>
        )}

        {/* Calendar View */}
        {activeNav === 'calendar' && (
          <div className="px-4 py-6">
            {/* Calendar Card */}
            <div className="bg-white rounded-3xl shadow-sm p-6 mb-6">
              {/* Calendar Header */}
              <div className="flex items-center justify-between mb-6 gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <button
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    onClick={() => navigateMonth('prev')}
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-700" />
                  </button>
                  <h2 className="text-base font-semibold text-gray-900 text-center flex-1 min-w-0">
                    {currentMonth.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                      .replace(/^\w/, c => c.toUpperCase())
                      .replace('.', '')}
                  </h2>
                  <button
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                    onClick={() => navigateMonth('next')}
                  >
                    <ChevronRight className="w-5 h-5 text-gray-700" />
                  </button>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      calendarView === 'month'
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => setCalendarView('month')}
                  >
                    Mês
                  </button>
                  <button
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      calendarView === 'week'
                        ? 'bg-primary text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => setCalendarView('week')}
                  >
                    Semana
                  </button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="w-full">
                {/* Days of week header */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                    <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar days - Month View */}
                {calendarView === 'month' && (() => {
                  const year = currentMonth.getFullYear();
                  const month = currentMonth.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const lastDay = new Date(year, month + 1, 0);
                  const daysInMonth = lastDay.getDate();
                  const startingDayOfWeek = firstDay.getDay();

                  const days = [];

                  // Dias do mês anterior
                  const prevMonthLastDay = new Date(year, month, 0).getDate();
                  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
                    const day = prevMonthLastDay - i;
                    const date = new Date(year, month - 1, day);
                    days.push({ date, isCurrentMonth: false });
                  }

                  // Dias do mês atual
                  for (let i = 1; i <= daysInMonth; i++) {
                    const date = new Date(year, month, i);
                    days.push({ date, isCurrentMonth: true });
                  }

                  // Dias do próximo mês para completar a grade
                  const remainingDays = 42 - days.length; // 6 semanas * 7 dias
                  for (let i = 1; i <= remainingDays; i++) {
                    const date = new Date(year, month + 1, i);
                    days.push({ date, isCurrentMonth: false });
                  }

                  return (
                    <div className="grid grid-cols-7 gap-1">
                      {days.map(({ date, isCurrentMonth }, index) => {
                        const isSelected = selectedDate?.toDateString() === date.toDateString();
                        const isToday = new Date().toDateString() === date.toDateString();
                        const appointmentCount = getAppointmentCount(date);

                        return (
                          <div
                            key={index}
                            className={`h-14 flex flex-col items-center justify-center relative cursor-pointer rounded-lg transition-colors ${
                              isSelected
                                ? ''
                                : isCurrentMonth
                                ? 'hover:bg-gray-50 text-gray-900'
                                : 'text-gray-400'
                            }`}
                            onClick={() => setSelectedDate(date)}
                          >
                            {isSelected ? (
                              <div className="bg-primary text-white rounded-2xl w-12 h-12 flex flex-col items-center justify-center">
                                <span className="text-sm font-semibold">{date.getDate()}</span>
                                {appointmentCount > 0 && (
                                  <span className="text-[10px] font-medium mt-0.5">{appointmentCount}</span>
                                )}
                              </div>
                            ) : (
                              <>
                                <span className={`text-sm ${isCurrentMonth ? 'font-medium' : ''}`}>
                                  {date.getDate()}
                                </span>
                                {appointmentCount > 0 && (
                                  <span className="absolute bottom-2 text-[10px] font-semibold bg-primary text-white rounded-full w-4 h-4 flex items-center justify-center">
                                    {appointmentCount}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Calendar days - Week View */}
                {calendarView === 'week' && (() => {
                  const weekDays = getCurrentWeekDays();

                  return (
                    <div className="grid grid-cols-7 gap-2">
                      {weekDays.map((date, index) => {
                        const isSelected = selectedDate?.toDateString() === date.toDateString();
                        const isToday = new Date().toDateString() === date.toDateString();
                        const appointmentCount = getAppointmentCount(date);

                        return (
                          <div
                            key={index}
                            className={`flex flex-col items-center p-3 rounded-xl cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-primary text-white shadow-md'
                                : isToday
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-gray-50'
                            }`}
                            onClick={() => setSelectedDate(date)}
                          >
                            <span className="text-xs font-medium mb-1">
                              {date.toLocaleDateString('pt-BR', { weekday: 'short' })}
                            </span>
                            <span className={`text-2xl font-bold mb-1 ${isSelected ? 'text-white' : ''}`}>
                              {date.getDate()}
                            </span>
                            {appointmentCount > 0 && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                isSelected
                                  ? 'bg-white text-primary'
                                  : 'bg-primary text-white'
                              }`}>
                                {appointmentCount} {appointmentCount === 1 ? 'agend.' : 'agends.'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Appointments Section */}
            <div className="bg-white rounded-3xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Agendamentos para {selectedDate.toLocaleDateString('pt-BR', {
                    day: 'numeric',
                    month: 'long'
                  })}
                </h3>
                <button
                  className="btn btn-sm bg-primary text-white hover:bg-primary/90 rounded-lg px-4 py-1.5 flex items-center gap-1"
                  onClick={handleOpenAddModal}
                >
                  <span className="text-lg font-bold">+</span>
                  <span className="text-sm font-medium">Adicionar</span>
                </button>
              </div>

              {(() => {
                const selectedDateStr = selectedDate.toISOString().split('T')[0];
                const filteredAppointments = appointments.filter(
                  apt => apt.date === selectedDateStr
                );

                if (filteredAppointments.length === 0) {
                  return (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                        <CalendarIcon className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-600 mb-4">
                        Nenhum agendamento para este dia
                      </p>
                      <button
                        className="btn btn-sm bg-primary text-white hover:bg-primary/90 rounded-lg px-4 py-1.5"
                        onClick={handleOpenAddModal}
                      >
                        <span className="text-lg">+</span> Adicionar Agendamento
                      </button>
                    </div>
                  );
                }

                const appointmentConfigs = [
                  {
                    bgColor: 'bg-primary/20',
                    iconColor: 'text-primary',
                    badgeColor: 'bg-primary',
                    badgeText: 'Reunião',
                    icon: User
                  },
                  {
                    bgColor: 'bg-green-100',
                    iconColor: 'text-primary',
                    badgeColor: 'bg-primary',
                    badgeText: 'Consulta',
                    icon: CalendarIcon
                  },
                  {
                    bgColor: 'bg-purple-100',
                    iconColor: 'text-purple-500',
                    badgeColor: 'bg-purple-500',
                    badgeText: 'Ligação',
                    icon: Clock
                  },
                ];

                return (
                  <div className="space-y-3">
                    {filteredAppointments.map((appointment, index) => {
                      const config = appointmentConfigs[index % appointmentConfigs.length];
                      const IconComponent = config.icon;

                      return (
                        <div
                          key={appointment.id}
                          className="bg-gray-50 rounded-2xl p-4 hover:shadow-sm transition-all"
                        >
                          <div className="flex items-start gap-3">
                            {/* Icon Circle */}
                            <div className={`${config.bgColor} w-10 h-10 rounded-full flex items-center justify-center shrink-0`}>
                              <IconComponent className={`${config.iconColor} w-5 h-5`} />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900 mb-1 text-sm">
                                {appointment.service}
                              </h4>
                              <p className="text-sm text-gray-600 mb-2">
                                {(() => {
                                  // Parse date as local date (YYYY-MM-DD format)
                                  const [year, month, day] = appointment.date.split('-').map(Number);
                                  const aptDate = new Date(year, month - 1, day);
                                  return `${appointment.time} - ${aptDate.toLocaleDateString('pt-BR')}`;
                                })()}
                              </p>
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-gray-400" />
                                <span className="text-xs text-gray-600">
                                  {appointment.clientName}
                                </span>
                              </div>
                            </div>

                            {/* Edit Button */}
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <button
                                onClick={() => handleEditAppointment(appointment)}
                                className="text-gray-500 hover:text-primary transition-colors p-1"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-around items-center h-16 px-2">
          <button
            className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] py-2 px-3 transition-colors rounded-lg ${
              activeNav === 'dashboard' ? 'text-primary' : 'text-gray-600'
            }`}
            onClick={() => setActiveNav('dashboard')}
          >
            <div className="w-6 h-6 mb-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
            <span className="text-xs">Dashboard</span>
          </button>

          <button
            className={`flex flex-col items-center justify-center min-w-[44px] min-h-[44px] py-2 px-3 transition-colors rounded-lg ${
              activeNav === 'calendar' ? 'text-primary' : 'text-gray-600'
            }`}
            onClick={() => setActiveNav('calendar')}
          >
            <CalendarDays className="w-6 h-6 mb-1" />
            <span className="text-xs">Calendário</span>
          </button>

          <button
            className="flex flex-col items-center justify-center min-w-[44px] min-h-[44px] py-2 px-3 transition-colors rounded-lg text-gray-600"
            onClick={() => setLocation('/profissional/clientes')}
          >
            <User className="w-6 h-6 mb-1" />
            <span className="text-xs">Clientes</span>
          </button>
        </div>
      </div>

      {/* Metrics Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{modalContent?.title}</DialogTitle>
          </DialogHeader>
          <div className="text-center py-4">
            <div className="text-5xl font-bold text-primary mb-4">
              {modalContent?.value}
            </div>
            <div className="text-base text-gray-600 mb-4">
              {modalContent?.details}
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-green-600">
              <TrendingUp className="w-4 h-4" />
              <span>{modalContent?.trend}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setModalOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Appointment Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Agendamento</DialogTitle>
          </DialogHeader>
          {editingAppointment && (
            <>
              <div className="mb-3 p-3 bg-primary/10 rounded-lg">
                <p className="text-sm font-medium text-blue-900">
                  Cliente: {editingAppointment.clientName}
                </p>
              </div>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Data</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-time">Horário</Label>
                  <Input
                    id="edit-time"
                    type="time"
                    value={editForm.time}
                    onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-service">Serviço</Label>
                  <Select
                    value={editForm.service}
                    onValueChange={(value) => setEditForm({ ...editForm, service: value })}
                  >
                    <SelectTrigger id="edit-service">
                      <SelectValue placeholder="Selecione o serviço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Corte de Cabelo">Corte de Cabelo</SelectItem>
                      <SelectItem value="Manicure">Manicure</SelectItem>
                      <SelectItem value="Barba">Barba</SelectItem>
                      <SelectItem value="Corte + Barba">Corte + Barba</SelectItem>
                      <SelectItem value="Pedicure">Pedicure</SelectItem>
                      <SelectItem value="Coloração">Coloração</SelectItem>
                      <SelectItem value="Massagem">Massagem</SelectItem>
                      <SelectItem value="Escova">Escova</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setEditModalOpen(false);
                    setEditingAppointment(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-primary hover:bg-primary/90"
                  onClick={handleSaveEdit}
                >
                  Salvar Alterações
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Appointment Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Agendamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-client">Cliente *</Label>
              <Popover open={clientComboOpen} onOpenChange={setClientComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientComboOpen}
                    className="w-full justify-between"
                  >
                    {newAppointment.clientId
                      ? clients.find((client: any) => client.id.toString() === newAppointment.clientId)?.name
                      : "Selecione o cliente"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar cliente..." />
                    <CommandList>
                      <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                      <CommandGroup>
                        {clients.map((client: any) => (
                          <CommandItem
                            key={client.id}
                            value={client.name}
                            onSelect={() => {
                              setNewAppointment({ ...newAppointment, clientId: client.id.toString() });
                              setClientComboOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                newAppointment.clientId === client.id.toString() ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {client.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-service">Serviço *</Label>
              <Select
                value={newAppointment.serviceId}
                onValueChange={(value) => setNewAppointment({ ...newAppointment, serviceId: value })}
              >
                <SelectTrigger id="add-service">
                  <SelectValue placeholder="Selecione o serviço" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service: any) => (
                    <SelectItem key={service.id} value={service.id.toString()}>
                      {service.name}{service.price ? ` - R$ ${Number(service.price).toFixed(2)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-date">Data *</Label>
              <Input
                id="add-date"
                type="date"
                value={newAppointment.date}
                onChange={(e) => setNewAppointment({ ...newAppointment, date: e.target.value, time: '' })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-time">Horário Disponível *</Label>
              <Select
                value={newAppointment.time}
                onValueChange={(value) => setNewAppointment({ ...newAppointment, time: value })}
                disabled={!newAppointment.date}
              >
                <SelectTrigger id="add-time">
                  <SelectValue placeholder={newAppointment.date ? "Selecione o horário" : "Selecione uma data primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {newAppointment.date && getAvailableTimeSlots(newAppointment.date).length > 0 ? (
                    getAvailableTimeSlots(newAppointment.date).map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-slots" disabled>
                      Nenhum horário disponível
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {newAppointment.date && getAvailableTimeSlots(newAppointment.date).length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Todos os horários estão ocupados neste dia
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setAddModalOpen(false);
                setNewAppointment({
                  clientId: '',
                  serviceId: '',
                  date: '',
                  time: '',
                });
              }}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90"
              onClick={handleAddAppointment}
            >
              Criar Agendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
