import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bell, Plus, Trash2, AlertTriangle, Info, CheckCircle, XCircle, PartyPopper } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FloatingHelpButton } from "@/components/floating-help-button";

const alertSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  message: z.string().min(1, "Mensagem é obrigatória"),
  type: z.enum(["info", "warning", "success", "error", "holiday"]),
  showToAllCompanies: z.boolean(),
  targetCompanyIds: z.array(z.number()).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type AlertFormData = z.infer<typeof alertSchema>;

const alertTypeConfig = {
  info: { icon: Info, color: "bg-blue-500", label: "Informação" },
  warning: { icon: AlertTriangle, color: "bg-yellow-500", label: "Aviso" },
  success: { icon: CheckCircle, color: "bg-green-500", label: "Sucesso" },
  error: { icon: XCircle, color: "bg-red-500", label: "Erro" },
  holiday: { icon: PartyPopper, color: "bg-purple-500", label: "Feriado" },
};

export default function AdminAlerts() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<AlertFormData>({
    resolver: zodResolver(alertSchema),
    defaultValues: {
      title: "",
      message: "",
      type: "info",
      showToAllCompanies: true,
      targetCompanyIds: [],
      startDate: "",
      endDate: "",
    },
  });

  // Buscar alertas
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["/api/admin/alerts"],
    queryFn: async () => {
      return await apiRequest("/api/admin/alerts", "GET");
    },
  });

  // Buscar empresas para seleção
  const { data: companies } = useQuery({
    queryKey: ["/api/admin/companies"],
    queryFn: async () => {
      return await apiRequest("/api/admin/companies", "GET");
    },
  });

  // Criar alerta
  const createMutation = useMutation({
    mutationFn: async (data: AlertFormData) => {
      return await apiRequest("/api/admin/alerts", "POST", data);
    },
    onSuccess: () => {
      toast({ title: "Alerta criado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar alerta",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Deletar alerta
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/admin/alerts/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({ title: "Alerta removido com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/alerts"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover alerta",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AlertFormData) => {
    // Convert empty strings to undefined for optional fields
    const cleanedData = {
      ...data,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      targetCompanyIds: data.showToAllCompanies ? undefined : data.targetCompanyIds,
    };

    createMutation.mutate(cleanedData);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja remover este alerta?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleOpenDialog = () => {
    form.reset();
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="w-8 h-8" />
            Alertas e Avisos
          </h1>
          <p className="text-gray-600 mt-2">
            Gerencie alertas e avisos que serão exibidos para as empresas após o login.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenDialog} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Novo Alerta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Novo Alerta</DialogTitle>
              <DialogDescription>
                Crie um novo alerta para ser exibido às empresas.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl>
                        <Input placeholder="Digite o título do alerta" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Digite a mensagem do alerta"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo do Alerta</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="info">
                            <div className="flex items-center gap-2">
                              <Info className="w-4 h-4" />
                              Informação
                            </div>
                          </SelectItem>
                          <SelectItem value="warning">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              Aviso
                            </div>
                          </SelectItem>
                          <SelectItem value="success">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              Sucesso
                            </div>
                          </SelectItem>
                          <SelectItem value="error">
                            <div className="flex items-center gap-2">
                              <XCircle className="w-4 h-4" />
                              Erro
                            </div>
                          </SelectItem>
                          <SelectItem value="holiday">
                            <div className="flex items-center gap-2">
                              <PartyPopper className="w-4 h-4" />
                              Feriado
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="showToAllCompanies"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Exibir para todas as empresas
                        </FormLabel>
                        <div className="text-sm text-gray-500">
                          Se desabilitado, você pode selecionar empresas específicas
                        </div>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {!form.watch("showToAllCompanies") && (
                  <FormField
                    control={form.control}
                    name="targetCompanyIds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Selecionar Empresas</FormLabel>
                        <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                          {companies && companies.length > 0 ? (
                            companies.map((company: any) => (
                              <div key={company.id} className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`company-${company.id}`}
                                  checked={field.value?.includes(company.id) || false}
                                  onChange={(e) => {
                                    const currentIds = field.value || [];
                                    if (e.target.checked) {
                                      field.onChange([...currentIds, company.id]);
                                    } else {
                                      field.onChange(currentIds.filter((id: number) => id !== company.id));
                                    }
                                  }}
                                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                                />
                                <label htmlFor={`company-${company.id}`} className="text-sm cursor-pointer">
                                  {company.fantasyName || company.email}
                                </label>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-500">Nenhuma empresa cadastrada</p>
                          )}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Início (opcional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Término (opcional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                  >
                    Criar Alerta
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {alerts && alerts.length > 0 ? (
          alerts.map((alert: any) => {
            // Validação de segurança para tipos inválidos
            const alertType = alert?.type && alertTypeConfig[alert.type as keyof typeof alertTypeConfig]
              ? alert.type as keyof typeof alertTypeConfig
              : 'info';

            const config = alertTypeConfig[alertType];
            const Icon = config.icon;
            
            return (
              <Card key={alert.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${config.color} text-white`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{alert.title}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={alert.isActive ? "default" : "secondary"}>
                            {alert.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                          <Badge variant="outline">
                            {config.label}
                          </Badge>
                          {alert.showToAllCompanies ? (
                            <Badge variant="outline">Todas as empresas</Badge>
                          ) : (
                            <Badge variant="outline">Empresas específicas</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(alert.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 mb-4">{alert.message}</p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>
                      Criado em: {format(new Date(alert.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    {alert.startDate && (
                      <span>
                        Início: {format(new Date(alert.startDate), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    )}
                    {alert.endDate && (
                      <span>
                        Término: {format(new Date(alert.endDate), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">
                Nenhum alerta criado
              </h3>
              <p className="text-gray-500 mb-4">
                Crie seu primeiro alerta para começar a comunicar-se com as empresas.
              </p>
              <Button onClick={handleOpenDialog}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeiro Alerta
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <FloatingHelpButton menuLocation="admin-alerts" />
    </div>
  );
}