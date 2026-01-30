import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Calendar,
  User,
  Building,
  Eye,
  Ban,
  Play
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FloatingHelpButton } from "@/components/floating-help-button";

interface SubscriptionData {
  companyId: number;
  companyName: string;
  companyEmail: string;
  companyStatus: string;
  asaasCustomerId?: string;
  asaasSubscriptionId?: string;
  asaasStatus?: string;
  value?: number;
  nextDueDate?: string;
  cycle?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';
  billingType?: 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';
  description?: string;
  deleted?: boolean;
  error?: string;
  createdAt: Date;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return 'default';
    case 'OVERDUE':
      return 'destructive';
    case 'EXPIRED':
      return 'secondary';
    case 'INACTIVE':
      return 'outline';
    default:
      return 'outline';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return 'Ativa';
    case 'OVERDUE':
      return 'Em Atraso';
    case 'EXPIRED':
      return 'Expirada';
    case 'INACTIVE':
      return 'Inativa';
    default:
      return status || 'N/A';
  }
};

const getCycleText = (cycle: string) => {
  switch (cycle) {
    case 'WEEKLY':
      return 'Semanal';
    case 'BIWEEKLY':
      return 'Quinzenal';
    case 'MONTHLY':
      return 'Mensal';
    case 'QUARTERLY':
      return 'Trimestral';
    case 'SEMIANNUALLY':
      return 'Semestral';
    case 'YEARLY':
      return 'Anual';
    default:
      return cycle || 'N/A';
  }
};

const getBillingTypeText = (type: string) => {
  switch (type) {
    case 'BOLETO':
      return 'Boleto';
    case 'CREDIT_CARD':
      return 'Cartão de Crédito';
    case 'PIX':
      return 'PIX';
    case 'UNDEFINED':
      return 'Não Definido';
    default:
      return type || 'N/A';
  }
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount);
};

export default function AdminSubscriptions() {
  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionData | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subscriptions, isLoading, error, refetch } = useQuery<SubscriptionData[]>({
    queryKey: ["/api/admin/asaas/subscriptions"],
    refetchInterval: 30000, // Auto-refresh a cada 30 segundos
  });

  // Auto-refresh automático
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);

    return () => clearInterval(interval);
  }, [refetch]);

  const handleViewDetails = (subscription: SubscriptionData) => {
    setSelectedSubscription(subscription);
    setIsDetailsOpen(true);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin" />
            <span>Carregando assinaturas...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar assinaturas. Verifique se as chaves do Asaas estão configuradas corretamente.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Função para filtrar assinaturas por data e status
  const filteredSubscriptions = subscriptions?.filter(sub => {
    // Filtro por status
    if (statusFilter !== "all" && sub.asaasStatus !== statusFilter) {
      return false;
    }

    // Filtro por data de início
    if (startDate && sub.nextDueDate) {
      const subDate = new Date(sub.nextDueDate);
      const filterDate = new Date(startDate);
      if (subDate < filterDate) {
        return false;
      }
    }

    // Filtro por data de fim
    if (endDate && sub.nextDueDate) {
      const subDate = new Date(sub.nextDueDate);
      const filterDate = new Date(endDate);
      if (subDate > filterDate) {
        return false;
      }
    }

    return true;
  }) || [];

  const activeSubscriptions = filteredSubscriptions.filter(sub => sub.asaasStatus === 'ACTIVE');
  const overdueSubscriptions = filteredSubscriptions.filter(sub => sub.asaasStatus === 'OVERDUE');
  const expiredSubscriptions = filteredSubscriptions.filter(sub => sub.asaasStatus === 'EXPIRED');
  const totalRevenue = activeSubscriptions.reduce((total, sub) => {
    if (sub.value) {
      return total + sub.value;
    }
    return total;
  }, 0);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Gerenciar Assinaturas Asaas
          </h1>
          <p className="text-gray-600 mt-2">
            Status em tempo real de todas as assinaturas do sistema
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Filtros</CardTitle>
          <CardDescription>
            Filtre as assinaturas por data e status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Data de Início</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endDate">Data de Fim</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="status">Status da Assinatura</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="ACTIVE">Ativa</SelectItem>
                  <SelectItem value="OVERDUE">Em Atraso</SelectItem>
                  <SelectItem value="EXPIRED">Expirada</SelectItem>
                  <SelectItem value="INACTIVE">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setStatusFilter("all");
                }}
                className="w-full"
              >
                Limpar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Resumo */}
      <div className="grid gap-6 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Assinaturas</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredSubscriptions.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredSubscriptions.length !== subscriptions?.length ? 
                `de ${subscriptions?.length || 0} total` : 
                ''
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeSubscriptions.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Atraso</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overdueSubscriptions.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalRevenue)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Assinaturas */}
      <Card>
        <CardHeader>
          <CardTitle>Todas as Assinaturas</CardTitle>
          <CardDescription>
            Lista completa de empresas com assinaturas no Asaas
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status Assinatura</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Ciclo</TableHead>
                  <TableHead>Próximo Vencimento</TableHead>
                  <TableHead>Status da Empresa</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscriptions.map((subscription) => (
                  <TableRow key={subscription.companyId}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-gray-500" />
                        {subscription.companyName}
                      </div>
                    </TableCell>
                    <TableCell>{subscription.companyEmail}</TableCell>
                    <TableCell>
                      {subscription.asaasStatus ? (
                        <Badge variant={getStatusColor(subscription.asaasStatus)}>
                          {getStatusText(subscription.asaasStatus)}
                        </Badge>
                      ) : subscription.error ? (
                        <Badge variant="destructive">Erro</Badge>
                      ) : (
                        <Badge variant="outline">Sem Assinatura</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {subscription.value ?
                        formatCurrency(subscription.value) :
                        '-'
                      }
                    </TableCell>
                    <TableCell>
                      {subscription.cycle ? getCycleText(subscription.cycle) : '-'}
                    </TableCell>
                    <TableCell>
                      {subscription.nextDueDate ?
                        format(new Date(subscription.nextDueDate), 'dd/MM/yyyy', { locale: ptBR }) :
                        '-'
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant={subscription.companyStatus === 'active' ? 'default' : 'destructive'}>
                        {subscription.companyStatus === 'active' ? 'Ativa' : 'Suspensa'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetails(subscription)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Ver
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Detalhes */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Assinatura</DialogTitle>
            <DialogDescription>
              Informações completas da assinatura no Asaas
            </DialogDescription>
          </DialogHeader>

          {selectedSubscription && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Informações da Empresa</h4>
                  <div className="space-y-2 text-sm">
                    <p><strong>Nome:</strong> {selectedSubscription.companyName}</p>
                    <p><strong>Email:</strong> {selectedSubscription.companyEmail}</p>
                    <p><strong>Status da Empresa:</strong> {selectedSubscription.companyStatus === 'active' ? 'Ativa' : 'Suspensa'}</p>
                    <p><strong>Criada em:</strong> {format(new Date(selectedSubscription.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Informações do Asaas</h4>
                  <div className="space-y-2 text-sm">
                    <p><strong>Customer ID:</strong> {selectedSubscription.asaasCustomerId || 'N/A'}</p>
                    <p><strong>Subscription ID:</strong> {selectedSubscription.asaasSubscriptionId || 'N/A'}</p>
                    <p><strong>Status:</strong> {selectedSubscription.asaasStatus ? getStatusText(selectedSubscription.asaasStatus) : 'N/A'}</p>
                  </div>
                </div>
              </div>

              {selectedSubscription.asaasStatus && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-semibold mb-2">Cobrança</h4>
                      <div className="space-y-2 text-sm">
                        <p><strong>Valor:</strong> {selectedSubscription.value ? formatCurrency(selectedSubscription.value) : 'N/A'}</p>
                        <p><strong>Ciclo:</strong> {selectedSubscription.cycle ? getCycleText(selectedSubscription.cycle) : 'N/A'}</p>
                        <p><strong>Forma de Pagamento:</strong> {selectedSubscription.billingType ? getBillingTypeText(selectedSubscription.billingType) : 'N/A'}</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-2">Datas</h4>
                      <div className="space-y-2 text-sm">
                        <p><strong>Próximo Vencimento:</strong> {selectedSubscription.nextDueDate ? format(new Date(selectedSubscription.nextDueDate), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}</p>
                        <p><strong>Deletada:</strong> {selectedSubscription.deleted ? 'Sim' : 'Não'}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {selectedSubscription.description && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-semibold mb-2">Descrição</h4>
                    <p className="text-sm">{selectedSubscription.description}</p>
                  </div>
                </>
              )}

              {selectedSubscription.error && (
                <>
                  <Separator />
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {selectedSubscription.error}
                    </AlertDescription>
                  </Alert>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <FloatingHelpButton menuLocation="admin-subscriptions" />
    </div>
  );
}