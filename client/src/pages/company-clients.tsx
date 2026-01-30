import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Grid, List, User, Mail, Phone, Calendar, Search, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { validateBrazilianPhone } from "../../../shared/phone-utils";
import { useGlobalTheme } from "@/hooks/use-global-theme";
import { FloatingHelpButton } from "@/components/floating-help-button";

interface Client {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface Professional {
  id: number;
  name: string;
}

interface SimpleAppointment {
  clientPhone: string;
  professionalId: number;
}

const clientSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional().refine((phone) => {
    if (!phone || phone === "") return true;
    return validateBrazilianPhone(phone);
  }, "Telefone deve estar no formato brasileiro: (XX) XXXXX-XXXX"),
  birthDate: z.string().optional(),
  notes: z.string().optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface AppointmentHistory {
  id: number;
  serviceName: string;
  professionalName: string;
  appointmentDate: string;
  appointmentTime: string;
  price: number;
  expense?: number;
  statusName: string;
  statusColor: string;
  notes?: string;
}

interface ClientServiceHistoryProps {
  clientId: number;
  clientName: string;
}

function ClientServiceHistory({ clientId, clientName }: ClientServiceHistoryProps) {
  const [editingPrice, setEditingPrice] = useState<{id: number, currentPrice: number} | null>(null);
  const [newPrice, setNewPrice] = useState<string>('');
  const [editingExpense, setEditingExpense] = useState<{id: number, currentExpense: number} | null>(null);
  const [newExpense, setNewExpense] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: appointments = [], isLoading } = useQuery<AppointmentHistory[]>({
    queryKey: ['/api/company/appointments/client', clientId],
    queryFn: async () => {
      const response = await fetch(`/api/company/appointments/client/${clientId}`);
      if (!response.ok) {
        throw new Error('Erro ao buscar histórico do cliente');
      }
      return response.json();
    },
    enabled: !!clientId,
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ appointmentId, price }: { appointmentId: number, price: number }) => {
      const response = await fetch(`/api/company/appointments/${appointmentId}/price`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ price }),
      });
      if (!response.ok) {
        throw new Error('Erro ao atualizar preço');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/appointments/client', clientId] });
      setEditingPrice(null);
      setNewPrice('');
      toast({
        title: "Sucesso",
        description: "Preço atualizado com sucesso",
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

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ appointmentId, expense }: { appointmentId: number, expense: number }) => {
      const response = await fetch(`/api/company/appointments/${appointmentId}/expense`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expense }),
      });
      if (!response.ok) {
        throw new Error('Erro ao atualizar despesa');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/appointments/client', clientId] });
      setEditingExpense(null);
      setNewExpense('');
      toast({
        title: "Sucesso",
        description: "Despesa atualizada com sucesso",
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

  const handleEditPrice = (appointment: AppointmentHistory) => {
    setEditingPrice({ id: appointment.id, currentPrice: appointment.price });
    setNewPrice(appointment.price.toFixed(2));
  };

  const handleSavePrice = () => {
    if (!editingPrice) return;
    const price = parseFloat(newPrice.replace(',', '.'));
    if (isNaN(price) || price < 0) {
      toast({
        title: "Erro",
        description: "Digite um preço válido",
        variant: "destructive",
      });
      return;
    }
    updatePriceMutation.mutate({ appointmentId: editingPrice.id, price });
  };

  const handleEditExpense = (appointment: AppointmentHistory) => {
    setEditingExpense({ id: appointment.id, currentExpense: appointment.expense || 0 });
    setNewExpense((appointment.expense || 0).toFixed(2));
  };

  const handleSaveExpense = () => {
    if (!editingExpense) return;
    const expense = parseFloat(newExpense.replace(',', '.'));
    if (isNaN(expense) || expense < 0) {
      toast({
        title: "Erro",
        description: "Digite uma despesa válida",
        variant: "destructive",
      });
      return;
    }
    updateExpenseMutation.mutate({ appointmentId: editingExpense.id, expense });
  };

  // Calculate total for all appointments
  const totalSpent = appointments
    .reduce((total, apt) => total + (apt.price || 0), 0);

  // Pagination logic
  const totalPages = Math.ceil(appointments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedAppointments = appointments.slice(startIndex, endIndex);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Carregando histórico...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-green-600 break-words">
                R$ {totalSpent.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-xs sm:text-sm text-gray-500">Total Gasto</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="text-center">
              <div className="text-lg sm:text-2xl font-bold text-blue-600">
                {appointments.length}
              </div>
              <div className="text-xs sm:text-sm text-gray-500">Serviços Realizados</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Service History List */}
      <div className="space-y-3">
        {appointments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="mx-auto h-12 w-12 mb-3 text-gray-300" />
            <p>Nenhum serviço encontrado para {clientName}</p>
          </div>
        ) : (
          paginatedAppointments.map((appointment) => (
            <Card key={appointment.id} className="border-l-4" style={{ borderLeftColor: appointment.statusColor }}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{appointment.serviceName}</h4>
                      <Badge
                        className="text-xs"
                        style={{
                          backgroundColor: appointment.statusColor + '20',
                          color: appointment.statusColor,
                          border: `1px solid ${appointment.statusColor}40`
                        }}
                      >
                        {appointment.statusName}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">{appointment.professionalName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="truncate">
                          {appointment.appointmentDate ? (() => {
                            // Extract date part to avoid timezone issues
                            const dateStr = appointment.appointmentDate;
                            if (typeof dateStr === 'string' && dateStr.includes('T')) {
                              const datePart = dateStr.split('T')[0];
                              const [year, month, day] = datePart.split('-');
                              return `${day}/${month}/${year}`;
                            }
                            return format(parseISO(dateStr), 'dd/MM/yyyy');
                          })() : 'Data não informada'} às {appointment.appointmentTime || 'Horário não informado'}
                        </span>
                      </div>
                      {appointment.notes && (
                        <div className="text-xs text-gray-500 mt-2 italic line-clamp-2">
                          {appointment.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-start gap-2 sm:text-right">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-green-600 text-sm sm:text-base whitespace-nowrap">
                          R$ {appointment.price.toFixed(2).replace('.', ',')}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditPrice(appointment)}
                          className="h-6 w-6 p-0 flex-shrink-0"
                          title="Editar preço"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                      {appointment.expense !== undefined && appointment.expense > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-red-600 whitespace-nowrap">
                            Despesa: R$ {appointment.expense.toFixed(2).replace('.', ',')}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditExpense(appointment)}
                            className="h-5 w-5 p-0 flex-shrink-0"
                            title="Editar despesa"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      {(appointment.expense === undefined || appointment.expense === 0) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditExpense(appointment)}
                          className="h-6 text-xs flex-shrink-0"
                          title="Adicionar despesa"
                        >
                          + Despesa
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {appointments.length > itemsPerPage && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t">
          <div className="text-xs sm:text-sm text-gray-600 text-center sm:text-left">
            Mostrando {startIndex + 1} a {Math.min(endIndex, appointments.length)} de {appointments.length} serviços
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="h-8"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Anterior</span>
            </Button>
            <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap px-2">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="h-8"
            >
              <span className="hidden sm:inline mr-1">Próxima</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Price Dialog */}
      <Dialog open={!!editingPrice} onOpenChange={(open) => !open && setEditingPrice(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Preço do Serviço</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="price">Novo Preço (R$)</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="price"
                  type="text"
                  placeholder="0,00"
                  value={newPrice}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9,\.]/g, '');
                    setNewPrice(value);
                  }}
                  className="pl-10"
                  autoFocus
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSavePrice();
                    }
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Use vírgula ou ponto para decimais (ex: 50,00 ou 50.00)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingPrice(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSavePrice}
              disabled={updatePriceMutation.isPending}
            >
              {updatePriceMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Despesa do Serviço</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="expense">Despesa (R$)</Label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="expense"
                  type="text"
                  placeholder="0,00"
                  value={newExpense}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9,\.]/g, '');
                    setNewExpense(value);
                  }}
                  className="pl-10"
                  autoFocus
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveExpense();
                    }
                  }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Use vírgula ou ponto para decimais (ex: 50,00 ou 50.00)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingExpense(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveExpense}
              disabled={updateExpenseMutation.isPending}
            >
              {updateExpenseMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CompanyClients() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProfessional, setFilterProfessional] = useState<string>('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const globalSettings = useGlobalTheme();

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['/api/company/clients'],
  });

  const { data: professionals = [] } = useQuery<Professional[]>({
    queryKey: ['/api/company/professionals'],
  });

  const { data: appointments = [] } = useQuery<SimpleAppointment[]>({
    queryKey: ['/api/company/appointments/simple'],
    queryFn: async () => {
      const response = await fetch('/api/company/appointments');
      if (!response.ok) throw new Error('Erro ao buscar agendamentos');
      const data = await response.json();

      // Normalizar telefones para remover formatação e código do país
      const normalizePhone = (phone: string) => {
        if (!phone) return '';
        const numbers = phone.replace(/\D/g, ''); // Remove tudo que não é número

        // Remove código do país (55) se existir
        if (numbers.startsWith('55') && numbers.length > 11) {
          return numbers.slice(2); // Pega apenas os últimos dígitos após o 55
        }

        return numbers;
      };

      return data.map((apt: any) => ({
        clientPhone: normalizePhone(apt.clientPhone),
        professionalId: apt.professionalId
      }));
    }
  });

  // Função auxiliar para normalizar telefone
  const normalizePhone = (phone: string | undefined) => {
    if (!phone) return '';
    const numbers = phone.replace(/\D/g, ''); // Remove tudo que não é número

    // Remove código do país (55) se existir
    if (numbers.startsWith('55') && numbers.length > 11) {
      return numbers.slice(2); // Pega apenas os últimos dígitos após o 55
    }

    return numbers;
  };

  // Filter clients by name, phone, and professional
  const filteredClients = clients.filter((client) => {
    // Filtro de texto (nome ou telefone)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        client.name?.toLowerCase().includes(searchLower) ||
        client.phone?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Filtro de profissional
    if (filterProfessional !== 'all') {
      // Verifica se appointments já carregou e se o cliente tem telefone
      if (!appointments || !client.phone) return false;

      // Normaliza ambos os telefones antes de comparar
      const clientPhoneNormalized = normalizePhone(client.phone);

      // Verifica se o cliente tem algum agendamento com este profissional
      const hasAppointmentWithProfessional = appointments.some(
        apt => apt.clientPhone === clientPhoneNormalized &&
               apt.professionalId &&
               apt.professionalId.toString() === filterProfessional
      );

      if (!hasAppointmentWithProfessional) return false;
    }

    return true;
  });

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      birthDate: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      const response = await fetch('/api/company/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Erro ao criar cliente');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/clients'] });
      setIsDialogOpen(false);
      form.reset();
      toast({
        title: "Sucesso",
        description: "Cliente criado com sucesso",
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
    mutationFn: async (data: ClientFormData) => {
      const response = await fetch(`/api/company/clients/${editingClient?.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Erro ao atualizar cliente');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/clients'] });
      setIsDialogOpen(false);
      setEditingClient(null);
      form.reset();
      toast({
        title: "Sucesso",
        description: "Cliente atualizado com sucesso",
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
      const response = await fetch(`/api/company/clients/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Erro ao excluir cliente');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/clients'] });
      toast({
        title: "Sucesso",
        description: "Cliente excluído com sucesso",
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

  const handleEdit = (client: Client) => {
    setEditingClient(client);

    // Format birth date for HTML date input (YYYY-MM-DD)
    // Extract date components directly from ISO string to avoid timezone issues
    let formattedBirthDate = "";
    if (client.birthDate) {
      const dateString = client.birthDate.toString();

      if (dateString.includes('T')) {
        // Extract YYYY-MM-DD part from ISO string (before the 'T')
        formattedBirthDate = dateString.split('T')[0];
      } else if (dateString.includes('-') && dateString.length === 10) {
        // Already in YYYY-MM-DD format
        formattedBirthDate = dateString;
      } else {
        // Fallback to date conversion
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          formattedBirthDate = `${year}-${month}-${day}`;
        }
      }
    }

    form.reset({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      birthDate: formattedBirthDate,
      notes: client.notes || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
      deleteMutation.mutate(id);
    }
  };

  const onSubmit = (data: ClientFormData) => {
    if (editingClient) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';

    // For birthday dates, extract the date components from the ISO string directly
    // to avoid timezone conversion issues
    if (typeof dateString === 'string' && dateString.includes('T')) {
      // Extract YYYY-MM-DD part from ISO string (before the 'T')
      const datePart = dateString.split('T')[0];
      const parts = datePart.split('-');

      if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];

        return `${day}/${month}/${year}`;
      }
    }

    // Fallback for other date formats
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  };

  if (isLoading) {
    return <div className="p-6">Carregando clientes...</div>;
  }

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 ml-16 sm:ml-0">Clientes</h1>

        <div className="flex items-center space-x-4">
          {/* Professional Filter */}
          <Select value={filterProfessional} onValueChange={setFilterProfessional}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por profissional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {professionals.map((prof) => (
                <SelectItem key={prof.id} value={prof.id.toString()}>
                  {prof.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 w-64"
            />
          </div>

          <div className="flex bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className={viewMode === 'grid' ? 'text-white' : ''}
              style={viewMode === 'grid' ? { backgroundColor: globalSettings?.primaryColor || '#5e6d8d' } : {}}
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'text-white' : ''}
              style={viewMode === 'list' ? { backgroundColor: globalSettings?.primaryColor || '#5e6d8d' } : {}}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>

          <Button
            onClick={() => {
              setEditingClient(null);
              form.reset();
              setIsDialogOpen(true);
            }}
            className="text-white"
            style={{ backgroundColor: globalSettings?.primaryColor || '#5e6d8d' }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo Cliente
          </Button>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="dados" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="dados">Dados do Cliente</TabsTrigger>
                <TabsTrigger value="servicos">Histórico de Serviços</TabsTrigger>
              </TabsList>

              <TabsContent value="dados" className="space-y-4">
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right">
                        Nome *
                      </Label>
                      <div className="col-span-3">
                        <Input
                          id="name"
                          placeholder="Nome completo do cliente"
                          {...form.register('name')}
                        />
                        {form.formState.errors.name && (
                          <p className="text-sm text-red-500 mt-1">
                            {form.formState.errors.name.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="email" className="text-right">
                        Email
                      </Label>
                      <div className="col-span-3">
                        <Input
                          id="email"
                          type="email"
                          placeholder="email@exemplo.com"
                          {...form.register('email')}
                        />
                        {form.formState.errors.email && (
                          <p className="text-sm text-red-500 mt-1">
                            {form.formState.errors.email.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="phone" className="text-right">
                        Telefone
                      </Label>
                      <div className="col-span-3 flex">
                        <div className="flex items-center px-3 py-2 bg-gray-50 border border-r-0 rounded-l-md text-sm text-gray-600">
                          55
                        </div>
                        <Input
                          id="phone"
                          className="rounded-l-none"
                          placeholder="(11) 99999-9999"
                          {...form.register('phone')}
                        />
                      </div>
                      {form.formState.errors.phone && (
                        <div className="col-span-3 col-start-2">
                          <p className="text-sm text-red-500 mt-1">
                            {form.formState.errors.phone.message}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="birthDate" className="text-right">
                        Aniversário
                      </Label>
                      <Input
                        id="birthDate"
                        type="date"
                        className="col-span-3"
                        {...form.register('birthDate')}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      className="text-white"
                      style={{ backgroundColor: globalSettings?.primaryColor || '#5e6d8d' }}
                    >
                      {editingClient ? 'Atualizar' : 'Cadastrar'}
                    </Button>
                  </DialogFooter>
                </form>
              </TabsContent>

              <TabsContent value="servicos" className="space-y-4">
                {editingClient ? (
                  <ClientServiceHistory clientId={editingClient.id} clientName={editingClient.name} />
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>Salve o cliente primeiro para ver o histórico de serviços</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClients.map((client) => (
            <Card key={client.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{client.name}</CardTitle>
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(client)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(client.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600">
                  {client.email && (
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4" />
                      <span>{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center space-x-2">
                      <Phone className="w-4 h-4" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {client.birthDate && (
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4" />
                      <span>Aniversário: {formatDate(client.birthDate)}</span>
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-3">
                    Cadastrado em {formatDate(client.createdAt)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredClients.map((client) => (
            <Card key={client.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{client.name}</h3>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        {client.email && (
                          <div className="flex items-center space-x-1">
                            <Mail className="w-3 h-3" />
                            <span>{client.email}</span>
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center space-x-1">
                            <Phone className="w-3 h-3" />
                            <span>{client.phone}</span>
                          </div>
                        )}
                        <span>Cadastrado em {formatDate(client.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(client)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(client.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredClients.length === 0 && clients.length > 0 && (
        <div className="text-center py-12">
          <Search className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum resultado encontrado</h3>
          <p className="mt-1 text-sm text-gray-500">Tente buscar com outro nome ou telefone.</p>
        </div>
      )}

      {clients.length === 0 && (
        <div className="text-center py-12">
          <User className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Nenhum cliente</h3>
          <p className="mt-1 text-sm text-gray-500">Comece criando seu primeiro cliente.</p>
          <div className="mt-6">
            <Button
              onClick={() => {
                setEditingClient(null);
                form.reset();
                setIsDialogOpen(true);
              }}
              className="text-white"
              style={{ backgroundColor: globalSettings?.primaryColor || '#5e6d8d' }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Button>
          </div>
        </div>
      )}
      <FloatingHelpButton menuLocation="clients" />
    </div>
  );
}