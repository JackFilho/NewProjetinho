import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar, Building2, Users, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FloatingHelpButton } from "@/components/floating-help-button";

interface CompanyStats {
  id: number;
  name: string;
  totalAppointments: number;
  activeClients: number;
  topProfessional: {
    name: string;
    appointments: number;
  };
  topClient: {
    name: string;
    appointments: number;
  };
}

interface ProfessionalStats {
  id: number;
  name: string;
  companyName: string;
  totalAppointments: number;
}

interface ClientStats {
  name: string;
  phone: string;
  companyName: string;
  totalAppointments: number;
}

interface AnalyticsData {
  topCompanies: CompanyStats[];
  topProfessionals: ProfessionalStats[];
  topClients: ClientStats[];
  companyDetails: CompanyStats[];
}

export default function AdminAnalytics() {
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>((currentDate.getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState<string>(currentDate.getFullYear().toString());

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['/api/admin/analytics', selectedCompany, selectedMonth, selectedYear],
    queryFn: async () => {
      const params = new URLSearchParams({
        company: selectedCompany,
        month: selectedMonth,
        year: selectedYear
      });
      const response = await fetch(`/api/admin/analytics?${params}`);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      return response.json();
    },
    refetchInterval: 30000 // Atualiza a cada 30 segundos
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['/api/companies']
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center space-x-2">
          <TrendingUp className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Carregando Analytics...</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const data = analyticsData as AnalyticsData | undefined;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <TrendingUp className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Analytics e Relatórios</h1>
        </div>

        <div className="flex gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
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

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filtrar por empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as empresas</SelectItem>
              {companies?.map((company: any) => (
                <SelectItem key={company.id} value={company.id.toString()}>
                  {company.fantasyName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resumo Geral */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Empresas</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.topCompanies?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Empresas ativas na plataforma</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Agendamentos</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.topCompanies?.reduce((sum, company) => sum + company.totalAppointments, 0) || 0}
            </div>
            <p className="text-xs text-muted-foreground">Agendamentos realizados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profissionais Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.topProfessionals?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Profissionais cadastrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Únicos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.topClients?.length || 0}</div>
            <p className="text-xs text-muted-foreground">Clientes cadastrados</p>
          </CardContent>
        </Card>
      </div>

      {/* Rankings */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Top Empresas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="h-5 w-5" />
              <span>Empresas que Mais Agendam</span>
            </CardTitle>
            <CardDescription>Ranking por número de agendamentos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.topCompanies?.slice(0, 5).map((company, index) => (
              <div key={company.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center space-x-3">
                  <Badge variant="secondary" className="w-6 h-6 p-0 flex items-center justify-center">
                    {index + 1}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{company.name}</p>
                    <p className="text-xs text-muted-foreground">{company.activeClients} clientes ativos</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{company.totalAppointments}</p>
                  <p className="text-xs text-muted-foreground">agendamentos</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Profissionais */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Profissionais que Mais Atendem</span>
            </CardTitle>
            <CardDescription>Ranking por número de atendimentos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.topProfessionals?.slice(0, 5).map((professional, index) => (
              <div key={professional.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center space-x-3">
                  <Badge variant="secondary" className="w-6 h-6 p-0 flex items-center justify-center">
                    {index + 1}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{professional.name}</p>
                    <p className="text-xs text-muted-foreground">{professional.companyName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{professional.totalAppointments}</p>
                  <p className="text-xs text-muted-foreground">atendimentos</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Clientes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Clientes que Mais Agendam</span>
            </CardTitle>
            <CardDescription>Ranking por número de agendamentos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data?.topClients?.slice(0, 5).map((client, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center space-x-3">
                  <Badge variant="secondary" className="w-6 h-6 p-0 flex items-center justify-center">
                    {index + 1}
                  </Badge>
                  <div>
                    <p className="font-medium text-sm">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.companyName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{client.totalAppointments}</p>
                  <p className="text-xs text-muted-foreground">agendamentos</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Detalhes por Empresa */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes por Empresa</CardTitle>
          <CardDescription>
            Análise detalhada de cada empresa na plataforma
            {selectedCompany !== "all" && " (filtrado por empresa)"}
            {` - ${['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][parseInt(selectedMonth) - 1]} de ${selectedYear}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data?.companyDetails?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum dado disponível para o período selecionado.</p>
              </div>
            ) : (
              data?.companyDetails
                ?.filter(company => selectedCompany === "all" || company.id.toString() === selectedCompany)
                ?.map((company) => (
              <div key={company.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{company.name}</h3>
                  <Badge variant="outline">{company.totalAppointments} agendamentos</Badge>
                </div>
                
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Clientes Ativos</p>
                    <p className="text-2xl font-bold">{company.activeClients}</p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Top Profissional</p>
                    <p className="font-semibold">{company.topProfessional?.name || "N/A"}</p>
                    <p className="text-sm text-muted-foreground">
                      {company.topProfessional?.appointments || 0} atendimentos
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Top Cliente</p>
                    <p className="font-semibold">{company.topClient?.name || "N/A"}</p>
                    <p className="text-sm text-muted-foreground">
                      {company.topClient?.appointments || 0} agendamentos
                    </p>
                  </div>
                </div>
              </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>
      <FloatingHelpButton menuLocation="admin-analytics" />
    </div>
  );
}