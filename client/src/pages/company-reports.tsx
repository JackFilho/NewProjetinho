import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FloatingHelpButton } from "@/components/floating-help-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Users, Scissors, TrendingUp, Phone, Mail, User, Clock, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Appointment {
  id: number;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  professionalName: string;
  date: string;
  time: string;
  status: string;
  price?: number;
}

interface ClientReport {
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  totalAppointments: number;
  totalSpent: number;
  lastAppointment: string;
  appointments: Appointment[];
  professionals: string[]; // Lista de profissionais únicos
}

interface ProfessionalReport {
  professionalName: string;
  totalAppointments: number;
  totalRevenue: number;
  services: {
    serviceName: string;
    count: number;
    revenue: number;
  }[];
  appointments: Appointment[];
}

interface ServiceReport {
  serviceName: string;
  totalAppointments: number;
  totalRevenue: number;
  averagePrice: number;
  appointments: Appointment[];
}

interface TotalReport {
  totalAppointments: number;
  totalRevenue: number;
  totalClients: number;
  totalProfessionals: number;
  averageAppointmentValue: number;
  topService: string;
  topProfessional: string;
  topClient: string;
}

export default function CompanyReports() {
  const [activeTab, setActiveTab] = useState("clients");
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>((currentDate.getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState<string>(currentDate.getFullYear().toString());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/company/appointments/detailed"],
    queryFn: () => {
      return fetch('/api/company/appointments/detailed', {
        method: 'GET',
        credentials: 'include',
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Erro ao buscar agendamentos');
        }
        return res.json();
      });
    },
  });

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["/api/company/clients"],
    queryFn: () => {
      return fetch('/api/company/clients', {
        method: 'GET',
        credentials: 'include',
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Erro ao buscar clientes');
        }
        return res.json();
      });
    },
  });

  const { data: professionals = [], isLoading: professionalsLoading } = useQuery({
    queryKey: ["/api/company/professionals"],
    queryFn: () => {
      return fetch('/api/company/professionals', {
        method: 'GET',
        credentials: 'include',
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Erro ao buscar profissionais');
        }
        return res.json();
      });
    },
  });

  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ["/api/company/services"],
    queryFn: () => {
      return fetch('/api/company/services', {
        method: 'GET',
        credentials: 'include',
      }).then(async (res) => {
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.message || 'Erro ao buscar serviços');
        }
        return res.json();
      });
    },
  });

  // Função para filtrar agendamentos por mês e ano
  const filterAppointmentsByDate = (appointments: Appointment[]): Appointment[] => {
    // Se ambos forem "all", retorna todos os agendamentos (todo o período)
    if (selectedMonth === "all" && selectedYear === "all") {
      return appointments;
    }

    return appointments.filter(appointment => {
      const appointmentDate = parseISO(appointment.date);
      const appointmentMonth = appointmentDate.getMonth() + 1; // getMonth() retorna 0-11
      const appointmentYear = appointmentDate.getFullYear();

      // Se mês for "all", filtra apenas por ano
      if (selectedMonth === "all") {
        return appointmentYear === parseInt(selectedYear);
      }

      // Se ano for "all", filtra apenas por mês
      if (selectedYear === "all") {
        return appointmentMonth === parseInt(selectedMonth);
      }

      // Filtra por mês e ano específicos
      return appointmentMonth === parseInt(selectedMonth) && appointmentYear === parseInt(selectedYear);
    });
  };

  // Aplicar filtro de data aos agendamentos
  const filteredAppointments = filterAppointmentsByDate(appointments);

  // Processar dados para relatórios
  const generateClientReports = (): ClientReport[] => {
    const clientMap = new Map<string, ClientReport>();

    filteredAppointments.forEach(appointment => {
      // Agrupar por TELEFONE (identificador único), não por nome
      const key = appointment.clientPhone;
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          clientName: appointment.clientName,
          clientPhone: appointment.clientPhone,
          totalAppointments: 0,
          totalSpent: 0,
          lastAppointment: appointment.date,
          appointments: [],
          professionals: []
        });
      }

      const clientReport = clientMap.get(key)!;
      clientReport.totalAppointments++;
      const clientAptStatus = (appointment.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (clientAptStatus === 'concluido') {
        clientReport.totalSpent += appointment.price || 0;
      }
      clientReport.appointments.push(appointment);

      // Adicionar profissional à lista se ainda não estiver lá
      if (appointment.professionalName && !clientReport.professionals.includes(appointment.professionalName)) {
        clientReport.professionals.push(appointment.professionalName);
      }

      // Atualizar nome para o mais completo (maior length)
      if (appointment.clientName.length > clientReport.clientName.length) {
        clientReport.clientName = appointment.clientName;
      }

      // Atualizar último agendamento
      if (new Date(appointment.date) > new Date(clientReport.lastAppointment)) {
        clientReport.lastAppointment = appointment.date;
      }
    });

    return Array.from(clientMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  };

  const generateProfessionalReports = (): ProfessionalReport[] => {
    const professionalMap = new Map<string, ProfessionalReport>();

    filteredAppointments.forEach(appointment => {
      const key = appointment.professionalName;
      if (!professionalMap.has(key)) {
        professionalMap.set(key, {
          professionalName: appointment.professionalName,
          totalAppointments: 0,
          totalRevenue: 0,
          services: [],
          appointments: []
        });
      }

      const professionalReport = professionalMap.get(key)!;
      professionalReport.totalAppointments++;
      const profAptStatus = (appointment.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const profAptCompleted = profAptStatus === 'concluido';
      if (profAptCompleted) {
        professionalReport.totalRevenue += appointment.price || 0;
      }
      professionalReport.appointments.push(appointment);

      // Processar serviços
      const existingService = professionalReport.services.find(s => s.serviceName === appointment.serviceName);
      if (existingService) {
        existingService.count++;
        if (profAptCompleted) existingService.revenue += appointment.price || 0;
      } else {
        professionalReport.services.push({
          serviceName: appointment.serviceName,
          count: 1,
          revenue: profAptCompleted ? appointment.price || 0 : 0
        });
      }
    });

    return Array.from(professionalMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  };

  const generateServiceReports = (): ServiceReport[] => {
    const serviceMap = new Map<string, ServiceReport>();

    filteredAppointments.forEach(appointment => {
      const key = appointment.serviceName;
      if (!serviceMap.has(key)) {
        serviceMap.set(key, {
          serviceName: appointment.serviceName,
          totalAppointments: 0,
          totalRevenue: 0,
          averagePrice: 0,
          appointments: []
        });
      }

      const serviceReport = serviceMap.get(key)!;
      serviceReport.totalAppointments++;
      const svcAptStatus = (appointment.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (svcAptStatus === 'concluido') {
        serviceReport.totalRevenue += appointment.price || 0;
      }
      serviceReport.appointments.push(appointment);
    });

    // Calcular preço médio
    serviceMap.forEach(serviceReport => {
      serviceReport.averagePrice = serviceReport.totalRevenue / serviceReport.totalAppointments;
    });

    return Array.from(serviceMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  };

  const generateTotalReport = (): TotalReport => {
    const clientReports = generateClientReports();
    const professionalReports = generateProfessionalReports();
    const serviceReports = generateServiceReports();

    const totalRevenue = filteredAppointments
      .filter(apt => (apt.status || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'concluido')
      .reduce((sum, apt) => sum + (apt.price || 0), 0);
    const totalAppointments = filteredAppointments.length;

    return {
      totalAppointments,
      totalRevenue,
      totalClients: clientReports.length,
      totalProfessionals: professionalReports.length,
      averageAppointmentValue: totalAppointments > 0 ? totalRevenue / totalAppointments : 0,
      topService: serviceReports[0]?.serviceName || "N/A",
      topProfessional: professionalReports[0]?.professionalName || "N/A",
      topClient: clientReports[0]?.clientName || "N/A"
    };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      'confirmado': 'bg-green-100 text-green-800',
      'agendado': 'bg-blue-100 text-blue-800',
      'cancelado': 'bg-red-100 text-red-800',
      'concluido': 'bg-gray-100 text-gray-800'
    };

    return (
      <Badge className={statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'}>
        {status}
      </Badge>
    );
  };

  if (appointmentsLoading || clientsLoading || professionalsLoading || servicesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Carregando relatórios...</div>
      </div>
    );
  }

  const clientReports = generateClientReports();
  const professionalReports = generateProfessionalReports();
  const serviceReports = generateServiceReports();
  const totalReport = generateTotalReport();

  // Paginação para clientes
  const totalPages = Math.ceil(clientReports.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClientReports = clientReports.slice(startIndex, endIndex);

  // Resetar para página 1 quando os filtros mudarem
  const handleFilterChange = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setCurrentPage(1);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold ml-16 sm:ml-0">Relatórios</h1>
        <div className="flex items-center gap-4">
          {/* Filtros de Mês e Ano */}
          <Select value={selectedMonth} onValueChange={handleFilterChange(setSelectedMonth)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="1">Janeiro</SelectItem>
              <SelectItem value="2">Fevereiro</SelectItem>
              <SelectItem value="3">Março</SelectItem>
              <SelectItem value="4">Abril</SelectItem>
              <SelectItem value="5">Maio</SelectItem>
              <SelectItem value="6">Junho</SelectItem>
              <SelectItem value="7">Julho</SelectItem>
              <SelectItem value="8">Agosto</SelectItem>
              <SelectItem value="9">Setembro</SelectItem>
              <SelectItem value="10">Outubro</SelectItem>
              <SelectItem value="11">Novembro</SelectItem>
              <SelectItem value="12">Dezembro</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={handleFilterChange(setSelectedYear)}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CalendarIcon className="w-4 h-4" />
            Atualizado em: {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="professionals" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            Profissionais
          </TabsTrigger>
          <TabsTrigger value="services" className="flex items-center gap-2">
            <Scissors className="w-4 h-4" />
            Serviços
          </TabsTrigger>
          <TabsTrigger value="total" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Total
          </TabsTrigger>
        </TabsList>

        {/* Aba Clientes */}
        <TabsContent value="clients">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold">{clientReports.length}</p>
                      <p className="text-sm text-gray-600">Total de Clientes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold">{formatCurrency(totalReport.totalRevenue)}</p>
                      <p className="text-sm text-gray-600">Faturamento Total</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="text-2xl font-bold">{formatCurrency(totalReport.averageAppointmentValue)}</p>
                      <p className="text-sm text-gray-600">Ticket Médio</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Relatório Detalhado por Cliente</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Profissionais</TableHead>
                      <TableHead>Total de Agendamentos</TableHead>
                      <TableHead>Total Gasto</TableHead>
                      <TableHead>Último Agendamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedClientReports.map((client, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{client.clientName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {client.clientPhone}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {client.professionals.map((prof, idx) => (
                              <Badge
                                key={idx}
                                variant="secondary"
                                className="bg-blue-100 text-blue-800 hover:bg-blue-200"
                              >
                                <User className="w-3 h-3 mr-1" />
                                {prof}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>{client.totalAppointments}</TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatCurrency(client.totalSpent)}
                        </TableCell>
                        <TableCell>{formatDate(client.lastAppointment)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Paginação */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-2 py-4">
                    <div className="text-sm text-gray-500">
                      Mostrando {startIndex + 1} a {Math.min(endIndex, clientReports.length)} de {clientReports.length} clientes
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Anterior
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <Button
                            key={page}
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCurrentPage(page)}
                            className="w-8 h-8 p-0"
                          >
                            {page}
                          </Button>
                        ))}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                      >
                        Próxima
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Aba Profissionais */}
        <TabsContent value="professionals">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold">{professionalReports.length}</p>
                      <p className="text-sm text-gray-600">Total de Profissionais</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Scissors className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold">{totalReport.totalAppointments}</p>
                      <p className="text-sm text-gray-600">Total de Serviços</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="text-2xl font-bold">{totalReport.topProfessional}</p>
                      <p className="text-sm text-gray-600">Top Profissional</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Relatório por Profissional</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profissional</TableHead>
                      <TableHead>Total de Serviços</TableHead>
                      <TableHead>Faturamento</TableHead>
                      <TableHead>Ticket Médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {professionalReports.map((professional, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{professional.professionalName}</TableCell>
                        <TableCell>{professional.totalAppointments}</TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatCurrency(professional.totalRevenue)}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(professional.totalRevenue / professional.totalAppointments)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Aba Serviços */}
        <TabsContent value="services">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Scissors className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold">{serviceReports.length}</p>
                      <p className="text-sm text-gray-600">Tipos de Serviços</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold">{totalReport.totalAppointments}</p>
                      <p className="text-sm text-gray-600">Total Executados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="text-2xl font-bold">{totalReport.topService}</p>
                      <p className="text-sm text-gray-600">Serviço Mais Popular</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Relatório Detalhado por Serviço</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Total Executado</TableHead>
                      <TableHead>Faturamento Total</TableHead>
                      <TableHead>Preço Médio</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceReports.map((service, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{service.serviceName}</TableCell>
                        <TableCell>{service.totalAppointments}</TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatCurrency(service.totalRevenue)}
                        </TableCell>
                        <TableCell>{formatCurrency(service.averagePrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Aba Total */}
        <TabsContent value="total">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="text-2xl font-bold">{totalReport.totalAppointments}</p>
                      <p className="text-sm text-gray-600">Total de Agendamentos</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-2xl font-bold">{formatCurrency(totalReport.totalRevenue)}</p>
                      <p className="text-sm text-gray-600">Faturamento Total</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="text-2xl font-bold">{totalReport.totalClients}</p>
                      <p className="text-sm text-gray-600">Total de Clientes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    <div>
                      <p className="text-2xl font-bold">{formatCurrency(totalReport.averageAppointmentValue)}</p>
                      <p className="text-sm text-gray-600">Ticket Médio</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <p className="text-xl font-bold text-blue-600">{totalReport.topClient}</p>
                    <p className="text-sm text-gray-600">Maior faturamento</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Profissional</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <p className="text-xl font-bold text-green-600">{totalReport.topProfessional}</p>
                    <p className="text-sm text-gray-600">Maior faturamento</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Serviço</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <p className="text-xl font-bold text-purple-600">{totalReport.topService}</p>
                    <p className="text-sm text-gray-600">Mais executado</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Resumo Geral do Período</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-3">Métricas de Performance</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total de Agendamentos:</span>
                        <span className="font-medium">{totalReport.totalAppointments}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Faturamento Total:</span>
                        <span className="font-medium text-green-600">{formatCurrency(totalReport.totalRevenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ticket Médio:</span>
                        <span className="font-medium">{formatCurrency(totalReport.averageAppointmentValue)}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3">Recursos Ativos</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total de Clientes:</span>
                        <span className="font-medium">{totalReport.totalClients}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total de Profissionais:</span>
                        <span className="font-medium">{totalReport.totalProfessionals}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tipos de Serviços:</span>
                        <span className="font-medium">{serviceReports.length}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      <FloatingHelpButton menuLocation="reports" />
    </div>
  );
}