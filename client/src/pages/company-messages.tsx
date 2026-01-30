import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { FloatingHelpButton } from "@/components/floating-help-button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  MessageSquare,
  Calendar,
  Users,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// Schema para criação de campanha
const campaignFormSchema = z.object({
  name: z.string().min(1, "Nome da campanha é obrigatório"),
  message: z.string().min(1, "Mensagem é obrigatória"),
  scheduledDate: z.string().min(1, "Data de envio é obrigatória"),
  targetType: z.enum(["all", "specific"], {
    required_error: "Selecione o tipo de destinatário",
  }),
  selectedClients: z.array(z.number()).optional(),
});

type CampaignFormData = z.infer<typeof campaignFormSchema>;

type Campaign = {
  id: number;
  companyId: number;
  name: string;
  message: string;
  scheduledDate: string;
  status: string;
  targetType: string;
  selectedClients: number[] | null;
  sentCount: number;
  totalTargets: number;
  createdAt: string;
};

type Client = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
};

export default function CompanyMessages() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedClients, setSelectedClients] = useState<number[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      name: "",
      message: "",
      scheduledDate: "",
      targetType: "all",
      selectedClients: [],
    },
  });

  // Buscar campanhas
  const { data: campaigns = [], isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ["/api/company/campaigns"],
  });

  // Buscar clientes
  const { data: clients = [], isLoading: isLoadingClients } = useQuery({
    queryKey: ["/api/company/clients"],
  });

  // Mutation para criar campanha
  const createCampaignMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      // Send datetime as is - the browser datetime-local input already provides local time
      const payload = {
        ...data,
        scheduledDate: data.scheduledDate,
        selectedClients: data.targetType === "specific" ? selectedClients : null,
      };
      return apiRequest("/api/company/campaigns", "POST", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/campaigns"] });
      setIsCreateModalOpen(false);
      form.reset();
      setSelectedClients([]);
      toast({
        title: "Campanha criada",
        description: "A campanha foi criada com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar campanha",
        variant: "destructive",
      });
    },
  });

  // Mutation para deletar campanha
  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/company/campaigns/${id}`, "DELETE");
    },
    onSuccess: (_, deletedId) => {
      // Clear all campaign cache
      queryClient.removeQueries({ queryKey: ["/api/company/campaigns"] });
      
      // Force fresh fetch
      queryClient.invalidateQueries({ queryKey: ["/api/company/campaigns"] });
      queryClient.refetchQueries({ queryKey: ["/api/company/campaigns"] });
      
      toast({
        title: "Campanha excluída",
        description: "A campanha foi excluída com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao excluir campanha",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CampaignFormData) => {
    if (data.targetType === "specific" && selectedClients.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione pelo menos um cliente",
        variant: "destructive",
      });
      return;
    }
    createCampaignMutation.mutate(data);
  };

  const handleClientSelection = (clientId: number, checked: boolean) => {
    if (checked) {
      setSelectedClients(prev => [...prev, clientId]);
      // Auto-change to "specific" when selecting clients
      form.setValue('targetType', 'specific');
    } else {
      setSelectedClients(prev => prev.filter(id => id !== clientId));
    }
  };

  const handleSelectAllClients = (checked: boolean) => {
    if (checked) {
      setSelectedClients(clients.map((client: Client) => client.id));
      // Auto-change to "specific" when selecting all clients
      form.setValue('targetType', 'specific');
    } else {
      setSelectedClients([]);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
      case "sending":
        return <Badge variant="outline"><Send className="w-3 h-3 mr-1" />Enviando</Badge>;
      case "completed":
        return <Badge variant="default"><CheckCircle className="w-3 h-3 mr-1" />Concluída</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Falhou</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const targetType = form.watch("targetType");

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight ml-16 sm:ml-0">Campanhas de Mensagens</h1>
          <p className="text-muted-foreground">
            Gerencie suas campanhas de mensagens via WhatsApp
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Campanhas</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns.filter((c: Campaign) => c.status === "pending").length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns.filter((c: Campaign) => c.status === "completed").length}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de campanhas */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold">Campanhas</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoadingCampaigns ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Carregando campanhas...</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-16">
              <MessageSquare className="w-16 h-16 mx-auto text-gray-400 mb-6" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma campanha criada</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Comece criando sua primeira campanha de mensagens
              </p>
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Campanha
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {campaigns.map((campaign: Campaign) => (
                <div
                  key={campaign.id}
                  className="border rounded-lg p-6 space-y-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-2 flex-1 min-w-0">
                      <h3 className="font-semibold text-lg">{campaign.name}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 pr-4">
                        {campaign.message}
                      </p>
                    </div>
                    <div className="flex space-x-2 shrink-0">
                      {getStatusBadge(campaign.status)}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          deleteCampaignMutation.mutate(campaign.id);
                        }}
                        disabled={deleteCampaignMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-6 text-sm text-muted-foreground pt-2">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      {format(new Date(campaign.scheduledDate), "dd/MM/yyyy 'às' HH:mm", {
                        locale: ptBR,
                      })}
                    </div>
                    <div className="flex items-center">
                      <Users className="w-4 h-4 mr-2" />
                      {campaign.targetType === "all" 
                        ? "Todos os clientes" 
                        : `${campaign.selectedClients?.length || 0} clientes selecionados`}
                    </div>
                    <div className="flex items-center">
                      <Send className="w-4 h-4 mr-2" />
                      {campaign.sentCount || 0} de {campaign.totalTargets || 0} enviadas
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de criação de campanha */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Campanha de Mensagens</DialogTitle>
            <DialogDescription>
              Crie uma nova campanha para enviar mensagens via WhatsApp
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Campanha *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Promoção de Natal" {...field} />
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
                    <FormLabel>Mensagem *</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Digite sua mensagem aqui..." 
                        rows={4}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data e Hora do Envio *</FormLabel>
                    <FormControl>
                      <Input 
                        type="datetime-local" 
                        min={(() => {
                          const now = new Date();
                          // Get local time in YYYY-MM-DDTHH:MM format for datetime-local input
                          const year = now.getFullYear();
                          const month = String(now.getMonth() + 1).padStart(2, '0');
                          const day = String(now.getDate()).padStart(2, '0');
                          const hours = String(now.getHours()).padStart(2, '0');
                          const minutes = String(now.getMinutes()).padStart(2, '0');
                          return `${year}-${month}-${day}T${hours}:${minutes}`;
                        })()}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="targetType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Destinatários *</FormLabel>
                    <FormControl>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione os destinatários" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os clientes</SelectItem>
                          <SelectItem value="specific">Clientes específicos</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {targetType === "specific" && (
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedClients.length === clients.length && clients.length > 0}
                      onCheckedChange={handleSelectAllClients}
                    />
                    <label htmlFor="select-all" className="text-sm font-medium">
                      Selecionar todos os clientes
                    </label>
                  </div>
                  
                  <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                    {isLoadingClients ? (
                      <p className="text-center text-muted-foreground">Carregando clientes...</p>
                    ) : clients.length === 0 ? (
                      <p className="text-center text-muted-foreground">Nenhum cliente cadastrado</p>
                    ) : (
                      <div className="space-y-2">
                        {clients.map((client: Client) => (
                          <div key={client.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`client-${client.id}`}
                              checked={selectedClients.includes(client.id)}
                              onCheckedChange={(checked) => 
                                handleClientSelection(client.id, checked as boolean)
                              }
                            />
                            <label 
                              htmlFor={`client-${client.id}`} 
                              className="text-sm flex-1 cursor-pointer"
                            >
                              {client.name} - {client.phone}
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {selectedClients.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {selectedClients.length} cliente(s) selecionado(s)
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createCampaignMutation.isPending}
                >
                  {createCampaignMutation.isPending ? "Criando..." : "Criar Campanha"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <FloatingHelpButton menuLocation="messages" />
    </div>
  );
}