import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Plus,
  Edit,
  Trash2,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  FileText,
  Users,
  PieChart,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FloatingHelpButton } from "@/components/floating-help-button";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Schemas de validação
const categorySchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  color: z.string().min(1, "Cor é obrigatória"),
  isRecurring: z.boolean().default(false),
  recurringDay: z.number().min(1).max(31).optional().nullable(),
});

const transactionSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.number().min(0.01, "Valor deve ser maior que zero"),
  type: z.enum(["income", "expense"]),
  categoryId: z.number().min(1, "Categoria é obrigatória"),
  date: z.string().min(1, "Data é obrigatória"),
  notes: z.string().optional(),
});

type CategoryFormData = z.infer<typeof categorySchema>;
type TransactionFormData = z.infer<typeof transactionSchema>;

interface Category {
  id: number;
  name: string;
  description?: string;
  color: string;
  isRecurring?: boolean | number;
  recurringDay?: number;
  createdAt: string;
}

interface Transaction {
  id: number;
  description: string;
  amount: number | string;
  type: "income" | "expense";
  categoryId: number;
  date: string;
  notes?: string;
  createdAt: string;
  category?: Category;
}

export default function CompanyFinancial() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<string>((currentDate.getMonth() + 1).toString());
  const [selectedYear, setSelectedYear] = useState<string>(currentDate.getFullYear().toString());

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery<Category[]>({
    queryKey: ["/api/company/financial/categories"],
  });

  const { data: transactions = [], isLoading: isLoadingTransactions } = useQuery<Transaction[]>({
    queryKey: ["/api/company/financial/transactions"],
  });

  // Formatar mês e ano no formato YYYY-MM para a API
  const dashboardDateFilter = selectedMonth === "all" && selectedYear === "all"
    ? "all-all"
    : selectedMonth === "all"
    ? `${selectedYear}-all`
    : selectedYear === "all"
    ? `all-${selectedMonth.padStart(2, '0')}`
    : `${selectedYear}-${selectedMonth.padStart(2, '0')}`;

  const { data: dashboardData, isLoading: isLoadingDashboard } = useQuery({
    queryKey: [`/api/company/financial/dashboard?month=${dashboardDateFilter}`],
    enabled: !!selectedMonth && !!selectedYear,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  // Dados seguros do dashboard com valores padrão
  const safeData = {
    monthlyIncome: Number(dashboardData?.monthlyIncome) || 0,
    incomeGrowth: Number(dashboardData?.incomeGrowth) || 0,
    monthlyExpenses: Number(dashboardData?.monthlyExpenses) || 0,
    expenseGrowth: Number(dashboardData?.expenseGrowth) || 0,
    totalTransactions: Number(dashboardData?.totalTransactions) || 0,
  };

  // Dados para gráfico de barras (Receitas vs Despesas)
  const barChartData = [
    {
      name: 'Financeiro',
      Receitas: safeData.monthlyIncome,
      Despesas: safeData.monthlyExpenses,
    },
  ];

  // Dados para gráfico de pizza (Receitas vs Despesas)
  const total = safeData.monthlyIncome + safeData.monthlyExpenses;
  const pieChartData = [
    {
      name: 'Receitas',
      value: safeData.monthlyIncome,
      percentage: total > 0 ? ((safeData.monthlyIncome / total) * 100).toFixed(1) : 0,
      color: '#10b981',
    },
    {
      name: 'Despesas',
      value: safeData.monthlyExpenses,
      percentage: total > 0 ? ((safeData.monthlyExpenses / total) * 100).toFixed(1) : 0,
      color: '#ef4444',
    },
  ];

  // Filtrar transações pelo período selecionado
  const filteredTransactions = transactions.filter((t: Transaction) => {
    if (!t.date) return false;

    // Extrair ano e mês diretamente da string YYYY-MM-DD
    const [yearStr, monthStr] = t.date.split('-');
    const transYear = parseInt(yearStr);
    const transMonth = parseInt(monthStr);

    const yearNum = selectedYear === 'all' ? null : parseInt(selectedYear);
    const monthNum = selectedMonth === 'all' ? null : parseInt(selectedMonth);

    // Se ambos forem "all", retorna todos
    if (yearNum === null && monthNum === null) {
      return true;
    }

    // Se apenas mês for "all", filtra apenas por ano
    if (monthNum === null && yearNum !== null) {
      return transYear === yearNum;
    }

    // Se apenas ano for "all", filtra apenas por mês
    if (yearNum === null && monthNum !== null) {
      return transMonth === monthNum;
    }

    // Filtra por mês e ano específicos
    return transYear === yearNum && transMonth === monthNum;
  });

  // Forms
  const categoryForm = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#3B82F6",
      isRecurring: false,
      recurringDay: null,
    },
  });

  const transactionForm = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: "",
      amount: 0,
      type: "expense",
      categoryId: 0,
      date: new Date().toISOString().split("T")[0],
      notes: "",
    },
  });

  // Mutations
  const createCategoryMutation = useMutation({
    mutationFn: (data: CategoryFormData) =>
      apiRequest("/api/company/financial/categories", "POST", data),
    onSuccess: () => {
      // Invalidar e refetch imediatamente
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial/categories"] });
      queryClient.refetchQueries({ queryKey: ["/api/company/financial/categories"] });
      setIsCategoryModalOpen(false);
      categoryForm.reset();
      toast({ title: "Categoria criada com sucesso!" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar categoria",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CategoryFormData }) =>
      apiRequest(`/api/company/financial/categories/${id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial/categories"] });
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
      categoryForm.reset();
      toast({ title: "Categoria atualizada com sucesso!" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar categoria",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/company/financial/categories/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial/categories"] });
      toast({ title: "Categoria removida com sucesso!" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover categoria",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: (data: TransactionFormData) =>
      apiRequest("/api/company/financial/transactions", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial/dashboard"] });
      setIsTransactionModalOpen(false);
      transactionForm.reset();
      toast({ title: "Transação criada com sucesso!" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar transação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTransactionMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: TransactionFormData }) =>
      apiRequest(`/api/company/financial/transactions/${id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial/dashboard"] });
      setIsTransactionModalOpen(false);
      setEditingTransaction(null);
      transactionForm.reset();
      toast({ title: "Transação atualizada com sucesso!" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar transação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/company/financial/transactions/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial/dashboard"] });
      toast({ title: "Transação removida com sucesso!" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover transação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleExportCSV = () => {
    // Determinar o período
    let periodoTexto = '';
    if (selectedMonth === 'all' && selectedYear === 'all') {
      periodoTexto = 'Todo o Período';
    } else if (selectedMonth === 'all') {
      periodoTexto = `Ano ${selectedYear}`;
    } else if (selectedYear === 'all') {
      const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                     'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      periodoTexto = meses[parseInt(selectedMonth) - 1];
    } else {
      const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                     'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      periodoTexto = `${meses[parseInt(selectedMonth) - 1]} ${selectedYear}`;
    }

    // Criar conteúdo do CSV
    let csvContent = '\uFEFF'; // BOM para UTF-8
    csvContent += `RELATÓRIO FINANCEIRO - ${periodoTexto}\n`;
    csvContent += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;

    // Resumo
    csvContent += 'RESUMO FINANCEIRO\n';
    csvContent += `Receitas do Mês,${formatCurrency(safeData.monthlyIncome)}\n`;
    csvContent += `Despesas do Mês,${formatCurrency(safeData.monthlyExpenses)}\n`;
    csvContent += `Lucro Líquido,${formatCurrency(safeData.monthlyIncome - safeData.monthlyExpenses)}\n`;
    csvContent += `Total de Transações,${safeData.totalTransactions}\n\n`;

    // Transações
    csvContent += 'TRANSAÇÕES\n';
    csvContent += 'Data,Descrição,Categoria,Tipo,Valor,Observações\n';

    filteredTransactions.forEach((t: Transaction) => {
      const [year, month, day] = t.date.split('-');
      const dataFormatada = `${day}/${month}/${year}`;
      const tipo = t.type === 'income' ? 'Receita' : 'Despesa';
      const valor = formatCurrency(t.amount);
      const obs = t.notes ? `"${t.notes.replace(/"/g, '""')}"` : '';

      csvContent += `${dataFormatada},${t.description},${t.category?.name || ''},${tipo},${valor},${obs}\n`;
    });

    // Criar blob e download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio-financeiro-${periodoTexto.toLowerCase().replace(/\s+/g, '-')}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Relatório CSV exportado com sucesso!",
      description: `Relatório de ${periodoTexto} foi baixado.`,
    });
  };

  const handleExportPDF = () => {
    // Determinar o período para o toast
    let periodoTexto = '';
    if (selectedMonth === 'all' && selectedYear === 'all') {
      periodoTexto = 'Todo o Período';
    } else if (selectedMonth === 'all') {
      periodoTexto = `Ano ${selectedYear}`;
    } else if (selectedYear === 'all') {
      const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                     'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      periodoTexto = meses[parseInt(selectedMonth) - 1];
    } else {
      const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                     'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      periodoTexto = `${meses[parseInt(selectedMonth) - 1]} ${selectedYear}`;
    }

    // Usar window.print() para gerar o PDF
    window.print();

    toast({
      title: "Gerando PDF...",
      description: `Use a opção "Salvar como PDF" na janela de impressão para gerar o PDF do relatório de ${periodoTexto}.`,
    });
  };

  const handleCreateCategory = (data: CategoryFormData) => {
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, data });
    } else {
      createCategoryMutation.mutate(data);
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    const isRecurringValue = typeof category.isRecurring === 'number' ? Boolean(category.isRecurring) : category.isRecurring || false;

    categoryForm.reset({
      name: category.name,
      description: category.description || "",
      color: category.color,
      isRecurring: isRecurringValue,
      recurringDay: category.recurringDay || null,
    });
    setIsCategoryModalOpen(true);
  };

  const handleCreateTransaction = (data: TransactionFormData) => {
    if (editingTransaction) {
      updateTransactionMutation.mutate({ id: editingTransaction.id, data });
    } else {
      createTransactionMutation.mutate(data);
    }
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    transactionForm.reset({
      description: transaction.description,
      amount: typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount,
      type: transaction.type,
      categoryId: transaction.categoryId,
      date: transaction.date.split("T")[0],
      notes: transaction.notes || "",
    });
    setIsTransactionModalOpen(true);
  };

  const formatCurrency = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(numValue);
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight ml-16 sm:ml-0">Financeiro</h1>
          <p className="text-muted-foreground">
            Gerencie suas finanças, categorias e transações
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="transactions">Transações</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Header Moderno do Dashboard */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard Financeiro</h1>
              <p className="text-sm text-gray-500 mt-1">
                {new Date().toLocaleDateString('pt-BR', { 
                  day: '2-digit', 
                  month: 'long', 
                  year: 'numeric',
                  weekday: 'long'
                })}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
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

              <Select value={selectedYear} onValueChange={setSelectedYear}>
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
              <div className="flex gap-2">
                <button
                  onClick={handleExportPDF}
                  className="flex items-center space-x-2 px-4 py-2 bg-white rounded-lg shadow-sm border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <FileText className="w-4 h-4" />
                  <span>Exportar PDF</span>
                </button>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center space-x-2 px-4 py-2 bg-white rounded-lg shadow-sm border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar CSV</span>
                </button>
              </div>
            </div>
          </div>

          {isLoadingDashboard ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Carregando dashboard...</p>
            </div>
          ) : (
            <>
              {/* Gráficos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Gráfico de Barras - Receitas vs Despesas */}
                <div className="bg-white rounded shadow-sm p-5 border border-gray-100">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Receitas vs Despesas</h3>
                  </div>
                  <div className="h-80">
                    {safeData.monthlyIncome === 0 && safeData.monthlyExpenses === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <span className="text-gray-500">Sem dados para este período</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barChartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: '#666' }}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fill: '#666' }}
                            tickFormatter={(value) => `R$ ${value.toLocaleString('pt-BR')}`}
                          />
                          <Tooltip
                            formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, '']}
                            labelStyle={{ color: '#333' }}
                            contentStyle={{
                              backgroundColor: '#fff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                            }}
                          />
                          <Legend />
                          <Bar dataKey="Receitas" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={80} />
                          <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={80} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Gráfico de Pizza - Distribuição */}
                <div className="bg-white rounded shadow-sm p-5 border border-gray-100">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Distribuição Financeira</h3>
                  </div>
                  <div className="h-80">
                    {safeData.monthlyIncome === 0 && safeData.monthlyExpenses === 0 ? (
                      <div className="h-full flex items-center justify-center">
                        <span className="text-gray-500">Sem dados para este período</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {pieChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                          />
                          <Legend
                            formatter={(value, entry: any) => `${value} (${entry.payload.percentage}%)`}
                          />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>

              {/* Cards de Métricas - Estilo Moderno */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-50 hover:shadow-xl transition-all duration-300">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">Receitas do Mês</p>
                      <h3 className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(safeData.monthlyIncome)}</h3>
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center rounded-full bg-gradient-to-r from-green-400 to-green-600 text-white shadow-lg">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="flex items-center text-green-600 text-sm font-semibold">
                      <div className="w-4 h-4 flex items-center justify-center mr-2">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <span>+{safeData.incomeGrowth}%</span>
                    </div>
                    <span className="text-xs text-gray-400 ml-2">vs. mês anterior</span>
                  </div>
                </div>

                <div className="bg-white rounded shadow-sm p-5 border border-gray-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Despesas do Mês</p>
                      <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(safeData.monthlyExpenses)}</h3>
                    </div>
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-red-100 text-red-600">
                      <TrendingDown className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="flex items-center text-red-600 text-sm font-medium">
                      <div className="w-4 h-4 flex items-center justify-center mr-1">
                        <TrendingDown className="w-4 h-4" />
                      </div>
                      <span>{safeData.expenseGrowth}%</span>
                    </div>
                    <span className="text-xs text-gray-500 ml-2">vs. mês anterior</span>
                  </div>
                </div>

                <div className="bg-white rounded shadow-sm p-5 border border-gray-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Lucro Líquido</p>
                      <h3 className="text-2xl font-bold text-gray-800">{formatCurrency(safeData.monthlyIncome - safeData.monthlyExpenses)}</h3>
                    </div>
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-100 text-blue-600">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="flex items-center text-blue-600 text-sm font-medium">
                      <div className="w-4 h-4 flex items-center justify-center mr-1">
                        <DollarSign className="w-4 h-4" />
                      </div>
                      <span>Lucro</span>
                    </div>
                    <span className="text-xs text-gray-500 ml-2">receitas - despesas</span>
                  </div>
                </div>

                <div className="bg-white rounded shadow-sm p-5 border border-gray-100">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm font-medium text-gray-500">Transações</p>
                      <h3 className="text-2xl font-bold text-gray-800">{safeData.totalTransactions}</h3>
                    </div>
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-purple-100 text-purple-600">
                      <Receipt className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="flex items-center text-purple-600 text-sm font-medium">
                      <div className="w-4 h-4 flex items-center justify-center mr-1">
                        <Receipt className="w-4 h-4" />
                      </div>
                      <span>Total</span>
                    </div>
                    <span className="text-xs text-gray-500 ml-2">transações do mês</span>
                  </div>
                </div>
              </div>

              {/* Transações */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl font-semibold">Transações</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {filteredTransactions.slice(0, 5).length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                      <p className="text-muted-foreground">Nenhuma transação encontrada para este período</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredTransactions.slice(0, 5).map((transaction: Transaction) => (
                        <div
                          key={transaction.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:shadow-sm transition-shadow"
                        >
                          <div className="flex items-center space-x-4">
                            <div className={`p-2 rounded-full ${
                              transaction.type === "income" ? "bg-green-100" : "bg-red-100"
                            }`}>
                              {transaction.type === "income" ? (
                                <ArrowUpRight className="w-4 h-4 text-green-600" />
                              ) : (
                                <ArrowDownRight className="w-4 h-4 text-red-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{transaction.description}</p>
                              <p className="text-sm text-muted-foreground">
                                {transaction.category?.name}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold ${
                              transaction.type === "income" ? "text-green-600" : "text-red-600"
                            }`}>
                              {transaction.type === "income" ? "+" : "-"}{formatCurrency(transaction.amount)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {transaction.date ? (() => {
                                const [year, month, day] = transaction.date.split('-');
                                return `${day}/${month}/${year}`;
                              })() : "Data não informada"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Categorias</h2>
              <p className="text-muted-foreground">Gerencie as categorias de receitas e despesas</p>
            </div>
            <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingCategory(null);
                  categoryForm.reset();
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Categoria
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingCategory ? "Editar Categoria" : "Nova Categoria"}
                  </DialogTitle>
                </DialogHeader>
                <Form {...categoryForm}>
                  <form onSubmit={categoryForm.handleSubmit(handleCreateCategory)} className="space-y-4">
                    <FormField
                      control={categoryForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome *</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex: Vendas, Aluguel, Marketing" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={categoryForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descrição</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Descrição opcional da categoria"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={categoryForm.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cor *</FormLabel>
                          <FormControl>
                            <Input type="color" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={categoryForm.control}
                      name="isRecurring"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">Dívida Recorrente</FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Lançar automaticamente todos os meses
                            </p>
                          </div>
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={field.onChange}
                              className="h-4 w-4"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {categoryForm.watch("isRecurring") && (
                      <>
                        <FormField
                          control={categoryForm.control}
                          name="recurringDay"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Dia do Mês (opcional)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="1"
                                  max="31"
                                  placeholder="Ex: 10 (para dia 10 de cada mês)"
                                  value={field.value || ""}
                                  onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                                />
                              </FormControl>
                              <p className="text-xs text-muted-foreground">
                                Deixe em branco para lançar no início do mês
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <div className="flex space-x-2">
                      <Button
                        type="submit"
                        disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
                      >
                        {editingCategory ? "Atualizar" : "Criar"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsCategoryModalOpen(false);
                          setEditingCategory(null);
                          categoryForm.reset();
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="pt-6">
              {isLoadingCategories ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-muted-foreground">Carregando categorias...</p>
                </div>
              ) : categories.length === 0 ? (
                <div className="text-center py-12">
                  <PieChart className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhuma categoria criada</h3>
                  <p className="text-muted-foreground mb-4">
                    Comece criando suas primeiras categorias
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.map((category: Category) => (
                    <div
                      key={category.id}
                      className="border rounded-lg p-4 space-y-3 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-3">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          <div>
                            <h3 className="font-semibold">{category.name}</h3>
                            {category.description && (
                              <p className="text-sm text-gray-500">{category.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex space-x-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCategory(category)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteCategoryMutation.mutate(category.id)}
                            disabled={deleteCategoryMutation.isPending}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {category.description && (
                        <p className="text-sm text-muted-foreground">{category.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payment Methods Tab */}
        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Transações</h2>
              <p className="text-muted-foreground">Gerencie todas as transações financeiras</p>
            </div>
            <Dialog open={isTransactionModalOpen} onOpenChange={(open) => {
              setIsTransactionModalOpen(open);
              if (!open) {
                setEditingTransaction(null);
                transactionForm.reset({
                  description: "",
                  amount: 0,
                  type: "expense",
                  categoryId: 0,
                  paymentMethodId: 0,
                  date: new Date().toISOString().split("T")[0],
                  notes: "",
                });
              }
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingTransaction(null);
                  transactionForm.reset({
                    description: "",
                    amount: 0,
                    type: "expense",
                    categoryId: 0,
                    paymentMethodId: 0,
                    date: new Date().toISOString().split("T")[0],
                    notes: "",
                  });
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Transação
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingTransaction ? "Editar Transação" : "Nova Transação"}
                  </DialogTitle>
                </DialogHeader>
                <Form {...transactionForm}>
                  <form onSubmit={transactionForm.handleSubmit(handleCreateTransaction)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={transactionForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Descrição *</FormLabel>
                            <FormControl>
                              <Input placeholder="Ex: Pagamento de cliente" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={transactionForm.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor *</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={transactionForm.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione o tipo" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="income">Receita</SelectItem>
                                <SelectItem value="expense">Despesa</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={transactionForm.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data *</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={transactionForm.control}
                        name="categoryId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Categoria *</FormLabel>
                            <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione a categoria" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {categories.map((category: Category) => (
                                  <SelectItem key={category.id} value={category.id.toString()}>
                                    {category.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={transactionForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Observações</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Observações opcionais sobre a transação"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex space-x-2">
                      <Button
                        type="submit"
                        disabled={createTransactionMutation.isPending || updateTransactionMutation.isPending}
                      >
                        {editingTransaction ? "Atualizar" : "Criar"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsTransactionModalOpen(false);
                          setEditingTransaction(null);
                          transactionForm.reset();
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="pt-6">
              {isLoadingTransactions ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="mt-4 text-muted-foreground">Carregando transações...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-12">
                  <Receipt className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhuma transação criada</h3>
                  <p className="text-muted-foreground mb-4">
                    Comece registrando suas primeiras transações
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transactions.map((transaction: Transaction) => (
                    <div
                      key={transaction.id}
                      className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-4 flex-1">
                          <div className={`p-2 rounded-full ${
                            transaction.type === "income" ? "bg-green-100" : "bg-red-100"
                          }`}>
                            {transaction.type === "income" ? (
                              <ArrowUpRight className="w-4 h-4 text-green-600" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold">{transaction.description}</h3>
                            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mt-1">
                              <span key="category">{transaction.category?.name}</span>
                              <span key="sep">•</span>
                              <span key="date">{transaction.date ? (() => {
                                const [year, month, day] = transaction.date.split('-');
                                return `${day}/${month}/${year}`;
                              })() : "Data não informada"}</span>
                            </div>
                            {transaction.notes && (
                              <p className="text-sm text-muted-foreground mt-2">{transaction.notes}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <p className={`font-semibold text-lg ${
                              transaction.type === "income" ? "text-green-600" : "text-red-600"
                            }`}>
                              {transaction.type === "income" ? "+" : "-"}{formatCurrency(transaction.amount)}
                            </p>
                          </div>
                          <div className="flex space-x-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditTransaction(transaction)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteTransactionMutation.mutate(transaction.id)}
                              disabled={deleteTransactionMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <FloatingHelpButton menuLocation="financial" />
    </div>
  );
}