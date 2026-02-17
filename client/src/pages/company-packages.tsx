import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Plus,
  Package,
  Check,
  ChevronsUpDown,
  AlertTriangle,
  Calendar,
  Clock,
  User,
  Pause,
  Play,
  X,
  Trash2,
  Eye,
} from "lucide-react";

interface TreatmentPackage {
  id: number;
  companyId: number;
  clientId: number;
  professionalId: number;
  serviceId: number;
  totalSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  recurrenceType: string;
  recurrenceDays: number[];
  preferredTime: string;
  startDate: string;
  endDate: string | null;
  status: string;
  notes: string | null;
  totalPrice: string;
  clientName: string;
  professionalName: string;
  serviceName: string;
  serviceColor: string;
  createdAt: string;
}

interface PackageDetail extends TreatmentPackage {
  clientPhone: string;
  serviceDuration: number;
  sessions: PackageSession[];
}

interface PackageSession {
  id: number;
  appointmentDate: string;
  appointmentTime: string;
  status: string;
  sessionNumber: number;
  duration: number;
  hasConflict?: boolean;
}

interface Service {
  id: number;
  name: string;
  price: string;
  duration: number;
  color: string;
  professionalId: number | null;
  isActive: number;
}

interface Professional {
  id: number;
  name: string;
  active: number;
  archived: number;
}

interface Client {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
}

const DAYS_OF_WEEK = [
  { value: 0, label: "Dom", fullLabel: "Domingo" },
  { value: 1, label: "Seg", fullLabel: "Segunda" },
  { value: 2, label: "Ter", fullLabel: "Terça" },
  { value: 3, label: "Qua", fullLabel: "Quarta" },
  { value: 4, label: "Qui", fullLabel: "Quinta" },
  { value: 5, label: "Sex", fullLabel: "Sexta" },
  { value: 6, label: "Sáb", fullLabel: "Sábado" },
];

const packageFormSchema = z.object({
  clientId: z.number().min(1, "Selecione um paciente"),
  professionalId: z.number().min(1, "Selecione um profissional"),
  serviceId: z.number().min(1, "Selecione um serviço"),
  totalSessions: z.coerce.number().int().min(1, "Mínimo 1 sessão").max(100, "Máximo 100 sessões"),
  recurrenceType: z.enum(["weekly", "biweekly"]).default("weekly"),
  recurrenceDays: z.array(z.number()).min(1, "Selecione pelo menos um dia"),
  preferredTime: z.string().min(1, "Horário é obrigatório"),
  startDate: z.string().min(1, "Data de início é obrigatória"),
  notes: z.string().optional(),
  totalPrice: z.coerce.number().min(0).optional(),
});

type PackageFormData = z.infer<typeof packageFormSchema>;

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ativo</Badge>;
    case "paused":
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pausado</Badge>;
    case "completed":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Concluído</Badge>;
    case "cancelled":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getSessionStatusBadge(status: string) {
  const lower = status.toLowerCase();
  if (lower === "concluído" || lower === "concluido") {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">Concluído</Badge>;
  }
  if (lower === "cancelado") {
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 text-xs">Cancelado</Badge>;
  }
  if (lower === "confirmado") {
    return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs">Confirmado</Badge>;
  }
  return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 text-xs">{status}</Badge>;
}

function formatRecurrenceDays(days: number[]) {
  if (!days || !Array.isArray(days)) return "";
  return days
    .sort((a, b) => a - b)
    .map((d) => DAYS_OF_WEEK.find((dw) => dw.value === d)?.label || "")
    .filter(Boolean)
    .join("/");
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("T")[0].split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export default function CompanyPackages() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [clientComboboxOpen, setClientComboboxOpen] = useState(false);
  const [deletePackageId, setDeletePackageId] = useState<number | null>(null);

  // Queries
  const { data: packages = [], isLoading } = useQuery<TreatmentPackage[]>({
    queryKey: ["/api/company/treatment-packages"],
  });

  const { data: packageDetail } = useQuery<PackageDetail>({
    queryKey: [`/api/company/treatment-packages/${selectedPackageId}`],
    enabled: !!selectedPackageId && isDetailOpen,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/company/clients"],
  });

  const { data: professionals = [] } = useQuery<Professional[]>({
    queryKey: ["/api/company/professionals"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/company/services"],
  });

  // Form
  const form = useForm<PackageFormData>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: {
      clientId: 0,
      professionalId: 0,
      serviceId: 0,
      totalSessions: 10,
      recurrenceType: "weekly",
      recurrenceDays: [],
      preferredTime: "",
      startDate: "",
      notes: "",
      totalPrice: undefined,
    },
  });

  const selectedProfessionalId = form.watch("professionalId");
  const selectedServiceId = form.watch("serviceId");
  const selectedRecurrenceDays = form.watch("recurrenceDays") || [];

  const availableServices = services.filter(
    (s) => s.isActive && (!s.professionalId || s.professionalId === selectedProfessionalId)
  );

  // Auto-calculate price when service or totalSessions change
  const totalSessions = form.watch("totalSessions");
  const selectedService = services.find((s) => s.id === selectedServiceId);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: PackageFormData) => {
      const response = await fetch("/api/company/treatment-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao criar sessão");
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/treatment-packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/appointments"] });
      setIsCreateOpen(false);
      form.reset();

      if (data.totalConflicts > 0) {
        toast({
          title: `Sessão criada com ${data.totalConflicts} conflito(s)`,
          description: `${data.sessions.length} sessões agendadas. Algumas possuem conflitos de horário.`,
        });
      } else {
        toast({
          title: "Sessão criada com sucesso",
          description: `${data.sessions.length} sessões agendadas automaticamente.`,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const response = await fetch(`/api/company/treatment-packages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Erro ao atualizar sessão");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/treatment-packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/appointments"] });
      toast({ title: "Sessão atualizada com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: async (appointmentId: number) => {
      const response = await fetch(`/api/company/appointments/${appointmentId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Concluído" }),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Erro ao concluir sessão");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/treatment-packages"] });
      queryClient.invalidateQueries({ queryKey: [`/api/company/treatment-packages/${selectedPackageId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/appointments"] });
      toast({ title: "Sessão concluída com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/company/treatment-packages/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Erro ao excluir sessão");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/treatment-packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/appointments"] });
      setDeletePackageId(null);
      toast({ title: "Sessão excluída com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  function toggleDay(day: number) {
    const current = form.getValues("recurrenceDays") || [];
    if (current.includes(day)) {
      form.setValue("recurrenceDays", current.filter((d) => d !== day), { shouldValidate: true });
    } else {
      form.setValue("recurrenceDays", [...current, day], { shouldValidate: true });
    }
  }

  function onSubmit(data: PackageFormData) {
    createMutation.mutate(data);
  }

  // Filter packages
  const filteredPackages = packages.filter((pkg) => {
    if (statusFilter !== "all" && pkg.status !== statusFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        pkg.clientName.toLowerCase().includes(search) ||
        pkg.professionalName.toLowerCase().includes(search) ||
        pkg.serviceName.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const activeProfessionals = professionals.filter((p) => p.active && !p.archived);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Sessões de Tratamento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie sessões recorrentes para seus pacientes
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) form.reset();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Sessão
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Novo Sessão de Tratamento</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Client Select */}
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Paciente</FormLabel>
                      <Popover open={clientComboboxOpen} onOpenChange={setClientComboboxOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between font-normal"
                            >
                              {field.value
                                ? clients.find((c) => c.id === field.value)?.name || "Selecione"
                                : "Selecione um paciente"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar paciente..." />
                            <CommandList>
                              <CommandEmpty>Nenhum paciente encontrado.</CommandEmpty>
                              <CommandGroup>
                                {clients.map((client) => (
                                  <CommandItem
                                    key={client.id}
                                    value={`${client.name} ${client.phone || ""}`}
                                    onSelect={() => {
                                      field.onChange(client.id);
                                      setClientComboboxOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${field.value === client.id ? "opacity-100" : "opacity-0"}`}
                                    />
                                    <div className="flex flex-col">
                                      <span>{client.name}</span>
                                      {client.phone && (
                                        <span className="text-xs text-muted-foreground">{client.phone}</span>
                                      )}
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Professional Select */}
                <FormField
                  control={form.control}
                  name="professionalId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profissional</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ? field.value.toString() : ""}
                          onValueChange={(value) => {
                            field.onChange(parseInt(value));
                            form.setValue("serviceId", 0);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um profissional" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeProfessionals.map((prof) => (
                              <SelectItem key={prof.id} value={prof.id.toString()}>
                                {prof.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Service Select */}
                <FormField
                  control={form.control}
                  name="serviceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Serviço</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value ? field.value.toString() : ""}
                          onValueChange={(value) => field.onChange(parseInt(value))}
                          disabled={!selectedProfessionalId}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={
                                selectedProfessionalId
                                  ? "Selecione um serviço"
                                  : "Selecione um profissional primeiro"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {availableServices.map((service) => (
                              <SelectItem key={service.id} value={service.id.toString()}>
                                {service.name} - R$ {Number(service.price).toFixed(2)} ({service.duration}min)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Total Sessions */}
                <FormField
                  control={form.control}
                  name="totalSessions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total de Sessões</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} max={100} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Recurrence Type */}
                <FormField
                  control={form.control}
                  name="recurrenceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequência</FormLabel>
                      <FormControl>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Semanal</SelectItem>
                            <SelectItem value="biweekly">Quinzenal</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Recurrence Days */}
                <FormField
                  control={form.control}
                  name="recurrenceDays"
                  render={() => (
                    <FormItem>
                      <FormLabel>Dias da Semana</FormLabel>
                      <div className="flex gap-1 flex-wrap">
                        {DAYS_OF_WEEK.map((day) => (
                          <Button
                            key={day.value}
                            type="button"
                            size="sm"
                            variant={selectedRecurrenceDays.includes(day.value) ? "default" : "outline"}
                            className="w-11 h-9 text-xs"
                            onClick={() => toggleDay(day.value)}
                          >
                            {day.label}
                          </Button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Time and Start Date */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="preferredTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Horário</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Início</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Total Price */}
                <FormField
                  control={form.control}
                  name="totalPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Valor Total (opcional)
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder={
                            selectedService && totalSessions
                              ? `Sugerido: R$ ${(Number(selectedService.price) * totalSessions).toFixed(2)}`
                              : "Deixe vazio para usar o preço do serviço"
                          }
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações (opcional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Informações sobre o tratamento" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Summary */}
                {selectedService && totalSessions > 0 && selectedRecurrenceDays.length > 0 && (
                  <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
                    <p className="font-medium">Resumo da sessão:</p>
                    <p>{totalSessions} sessões de {selectedService.name}</p>
                    <p>
                      {form.watch("recurrenceType") === "weekly" ? "Semanal" : "Quinzenal"} -{" "}
                      {formatRecurrenceDays(selectedRecurrenceDays)}
                    </p>
                    <p>
                      Valor:{" "}
                      {form.watch("totalPrice")
                        ? `R$ ${Number(form.watch("totalPrice")).toFixed(2)}`
                        : `R$ ${(Number(selectedService.price) * totalSessions).toFixed(2)} (${totalSessions} x R$ ${Number(selectedService.price).toFixed(2)})`}
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando sessões..." : "Criar Sessão"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="paused">Pausados</SelectItem>
            <SelectItem value="completed">Concluídos</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar por paciente, profissional ou serviço..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
      </div>

      {/* Package List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando sessões...</div>
      ) : filteredPackages.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-lg font-medium text-muted-foreground">
            {packages.length === 0
              ? "Nenhuma sessão de tratamento criada"
              : "Nenhuma sessão encontrada com os filtros selecionados"}
          </p>
          {packages.length === 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Crie uma sessão de tratamento para agendar automaticamente.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredPackages.map((pkg) => {
            const progressPercent =
              pkg.totalSessions > 0
                ? Math.round((pkg.completedSessions / pkg.totalSessions) * 100)
                : 0;
            const remaining = pkg.totalSessions - pkg.completedSessions - pkg.cancelledSessions;

            return (
              <Card key={pkg.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Info */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base">{pkg.clientName}</h3>
                        {getStatusBadge(pkg.status)}
                        <Badge
                          variant="outline"
                          style={{ borderColor: pkg.serviceColor, color: pkg.serviceColor }}
                        >
                          {pkg.serviceName}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {pkg.professionalName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatRecurrenceDays(pkg.recurrenceDays)}{" "}
                          {pkg.recurrenceType === "biweekly" ? "(quinzenal)" : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {pkg.preferredTime}
                        </span>
                      </div>

                      {/* Progress */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {pkg.completedSessions}/{pkg.totalSessions} sessões concluídas
                            {pkg.cancelledSessions > 0 && ` (${pkg.cancelledSessions} canceladas)`}
                          </span>
                          <span>{remaining > 0 ? `${remaining} restantes` : ""}</span>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPackageId(pkg.id);
                          setIsDetailOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Detalhes
                      </Button>

                      {pkg.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: pkg.id, status: "paused" })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <Pause className="h-4 w-4 mr-1" />
                          Pausar
                        </Button>
                      )}

                      {pkg.status === "paused" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatusMutation.mutate({ id: pkg.id, status: "active" })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Retomar
                        </Button>
                      )}

                      {(pkg.status === "active" || pkg.status === "paused") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => updateStatusMutation.mutate({ id: pkg.id, status: "cancelled" })}
                          disabled={updateStatusMutation.isPending}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancelar
                        </Button>
                      )}

                      {(pkg.status === "cancelled" || pkg.status === "completed") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setDeletePackageId(pkg.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={(open) => {
        setIsDetailOpen(open);
        if (!open) setSelectedPackageId(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Sessão</DialogTitle>
          </DialogHeader>
          {packageDetail ? (
            <div className="space-y-4">
              {/* Package Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Paciente:</span>{" "}
                  <span className="font-medium">{packageDetail.clientName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Profissional:</span>{" "}
                  <span className="font-medium">{packageDetail.professionalName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Serviço:</span>{" "}
                  <span className="font-medium">{packageDetail.serviceName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  {getStatusBadge(packageDetail.status)}
                </div>
                <div>
                  <span className="text-muted-foreground">Frequência:</span>{" "}
                  <span className="font-medium">
                    {packageDetail.recurrenceType === "weekly" ? "Semanal" : "Quinzenal"} -{" "}
                    {formatRecurrenceDays(packageDetail.recurrenceDays)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Horário:</span>{" "}
                  <span className="font-medium">{packageDetail.preferredTime}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Início:</span>{" "}
                  <span className="font-medium">{formatDate(packageDetail.startDate)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Valor:</span>{" "}
                  <span className="font-medium">R$ {Number(packageDetail.totalPrice).toFixed(2)}</span>
                </div>
              </div>

              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progresso</span>
                  <span className="font-medium">
                    {packageDetail.completedSessions}/{packageDetail.totalSessions} sessões
                  </span>
                </div>
                <Progress
                  value={
                    packageDetail.totalSessions > 0
                      ? (packageDetail.completedSessions / packageDetail.totalSessions) * 100
                      : 0
                  }
                  className="h-3"
                />
              </div>

              {packageDetail.notes && (
                <div className="bg-muted p-3 rounded-lg text-sm">
                  <span className="text-muted-foreground">Observações:</span> {packageDetail.notes}
                </div>
              )}

              {/* Sessions List */}
              <div>
                <h4 className="font-semibold mb-2">Sessões ({packageDetail.sessions.length})</h4>
                <div className="space-y-1 max-h-80 overflow-y-auto">
                  {packageDetail.sessions.map((session) => {
                    const isCompleted = ['Concluído', 'concluido'].includes(session.status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")) || ['Concluído', 'concluido'].includes(session.status);
                    const isCancelled = session.status.toLowerCase() === 'cancelado';
                    const canComplete = !isCompleted && !isCancelled;

                    return (
                      <div
                        key={session.id}
                        className={`flex items-center justify-between p-2 rounded-lg border text-sm ${isCompleted ? 'bg-green-50 border-green-200' : isCancelled ? 'bg-red-50 border-red-200' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs font-mono min-w-[52px] justify-center">
                            {session.sessionNumber}/{packageDetail.totalSessions}
                          </Badge>
                          <span>
                            {formatDate(session.appointmentDate)} - {session.appointmentTime}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {session.hasConflict && (
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                          {canComplete ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs bg-green-50 text-green-700 border-green-300 hover:bg-green-100 hover:text-green-800"
                              disabled={completeSessionMutation.isPending}
                              onClick={() => completeSessionMutation.mutate(session.id)}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Concluir
                            </Button>
                          ) : (
                            getSessionStatusBadge(session.status)
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletePackageId} onOpenChange={(open) => !open && setDeletePackageId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sessão de tratamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover a sessão e todos os agendamentos associados. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletePackageId && deleteMutation.mutate(deletePackageId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
