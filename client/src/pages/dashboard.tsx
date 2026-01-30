import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Tags, TrendingUp, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { FloatingHelpButton } from "@/components/floating-help-button";

interface DashboardStats {
  totalCompanies: number;
  activePlans: number;
  activeCompanies: number;
  monthlyRevenue: string;
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-1">Visão geral do sistema</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="h-12 w-12 rounded-lg" />
                </div>
                <div className="mt-4">
                  <Skeleton className="h-4 w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">Visão geral do sistema</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Total de Empresas</p>
                <p className="text-2xl font-bold text-slate-900">{stats?.totalCompanies || 0}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Building className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-slate-600">Empresas cadastradas</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Planos Ativos</p>
                <p className="text-2xl font-bold text-slate-900">{stats?.activePlans || 0}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <Tags className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-slate-600">Planos disponíveis</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Receita Estimada</p>
                <p className="text-2xl font-bold text-slate-900">R$ {stats?.monthlyRevenue || "0,00"}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <TrendingUp className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-slate-600">Base mensal</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600">Empresas Ativas</p>
                <p className="text-2xl font-bold text-slate-900">{stats?.activeCompanies || 0}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center text-sm">
              <span className="text-slate-600">Total ativo</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Welcome Card */}
      <Card>
        <CardHeader>
          <CardTitle>Bem-vindo ao Painel Administrativo</CardTitle>
          <CardDescription>
            Use o menu lateral para navegar entre as funcionalidades do sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start space-x-4">
              <div className="w-2 h-2 rounded-full bg-blue-600 mt-2"></div>
              <div>
                <h4 className="font-medium">Gestão de Empresas</h4>
                <p className="text-sm text-slate-600">
                  Cadastre novas empresas com validação automática de CNPJ/CPF
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-2 h-2 rounded-full bg-green-600 mt-2"></div>
              <div>
                <h4 className="font-medium">Planos de Assinatura</h4>
                <p className="text-sm text-slate-600">
                  Configure planos com períodos gratuitos e preços personalizados
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-2 h-2 rounded-full bg-purple-600 mt-2"></div>
              <div>
                <h4 className="font-medium">Configurações Globais</h4>
                <p className="text-sm text-slate-600">
                  Personalize a aparência e configurações gerais do sistema
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <FloatingHelpButton menuLocation="admin-dashboard" />
    </div>
  );
}
