import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building, Edit, Trash2, Search, CheckCircle, XCircle, KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { companySchema, companyProfileSchema, companyEditSchema } from "@/lib/validations";
import { formatDocument } from "@/lib/validations";
import type { Company, Plan } from "@shared/schema";
import { z } from "zod";
import { FloatingHelpButton } from "@/components/floating-help-button";

type CompanyFormData = z.infer<typeof companySchema>;
type CompanyEditFormData = z.infer<typeof companyEditSchema>;

export default function Companies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const { data: plans = [] } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const form = useForm<CompanyFormData>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      fantasyName: "",
      document: "",
      address: "",
      phone: "",
      zipCode: "",
      number: "",
      neighborhood: "",
      city: "",
      state: "",
      email: "",
      password: "",
      planId: undefined,
      isActive: true,
      tourEnabled: true,
      financialPasswordEnabled: false,
    },
  });

  const editForm = useForm<CompanyEditFormData>({
    resolver: zodResolver(companyEditSchema),
    defaultValues: {
      fantasyName: "",
      document: "",
      address: "",
      phone: "",
      zipCode: "",
      number: "",
      neighborhood: "",
      city: "",
      state: "",
      email: "",
      planId: null,
      isActive: true,
      tourEnabled: true,
      financialPasswordEnabled: false,
      password: "", // Adicionar password com valor vazio
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CompanyFormData) => {
      await apiRequest("/api/companies", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Empresa cadastrada com sucesso!",
      });
      form.reset();
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao cadastrar empresa",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CompanyEditFormData> }) => {
      const payload = { ...data };
      if (payload.isActive !== undefined) {
        (payload as any).isActive = payload.isActive ? 1 : 0;
      }
      if (payload.financialPasswordEnabled !== undefined) {
        (payload as any).financialPasswordEnabled = payload.financialPasswordEnabled ? 1 : 0;
      }
      await apiRequest(`/api/companies/${id}`, "PUT", payload);
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Empresa atualizada com sucesso!",
      });
      editForm.reset();
      setEditingCompany(null);
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar empresa",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/companies/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Empresa excluída com sucesso!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setIsDeleteDialogOpen(false);
      setDeletingCompany(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao excluir empresa",
        variant: "destructive",
      });
      setIsDeleteDialogOpen(false);
      setDeletingCompany(null);
    },
  });

  const handleDeleteClick = (company: Company) => {
    setDeletingCompany(company);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingCompany) {
      deleteMutation.mutate(deletingCompany.id);
    }
  };

  const toggleCompanyStatusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'activate' | 'block' }) => {
      return await apiRequest(`/api/companies/${id}/status`, "PATCH", { action });
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Sucesso",
        description: variables.action === 'activate' ? "Empresa liberada com sucesso!" : "Empresa bloqueada com sucesso!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar status da empresa",
        variant: "destructive",
      });
    },
  });

  const resetFinancialPasswordMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/companies/${id}/reset-financial-password`, "POST");
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Senha financeiro resetada! A empresa precisará criar uma nova senha.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao resetar senha financeiro",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CompanyFormData) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: CompanyEditFormData) => {
    // Validação manual da senha
    if (data.password && data.password.trim() !== '' && data.password.length < 6) {
      editForm.setError('password', {
        type: 'manual',
        message: 'Senha deve ter pelo menos 6 caracteres'
      });
      return;
    }

    // Remove password field if it's empty or undefined
    const cleanData = { ...data };
    if (!cleanData.password || cleanData.password.trim() === '') {
      delete cleanData.password;
    }

    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany.id, data: cleanData });
    }
  };

  const handleEdit = (company: any) => {
    setEditingCompany(company);
    editForm.reset({
      fantasyName: company.fantasyName || company.fantasy_name || "",
      document: company.document || "",
      address: company.address || "",
      phone: company.phone || "",
      zipCode: company.zipCode || company.zip_code || "",
      number: company.number || "",
      neighborhood: company.neighborhood || "",
      city: company.city || "",
      state: company.state || "",
      email: company.email || "",
      planId: company.planId || company.plan_id || null,
      isActive: Boolean(company.isActive || company.is_active),
      tourEnabled: Boolean(company.tourEnabled ?? company.tour_enabled ?? true),
      financialPasswordEnabled: Boolean(company.financialPasswordEnabled || company.financial_password_enabled),
      password: "", // Sempre iniciar com string vazia
    });
    setIsModalOpen(true);
  };

  const handleCancelEdit = () => {
    setEditingCompany(null);
    form.reset();
    editForm.reset();
    setIsModalOpen(false);
  };

  const handleNewCompany = () => {
    setEditingCompany(null);
    form.reset();
    setIsModalOpen(true);
  };

  const filteredCompanies = companies.filter(company =>
    (company.fantasyName || company.fantasy_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (company.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (company.document || '').includes(searchTerm)
  );

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^\d]/g, '');
    const formatted = formatDocument(value);
    form.setValue('document', formatted);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empresas</h1>
          <p className="text-slate-600 mt-1">Gerencie as empresas cadastradas</p>
        </div>
        <Button className="mt-4 sm:mt-0" onClick={handleNewCompany}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Empresa
        </Button>
      </div>

      {/* Company Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCompany ? "Editar Empresa" : "Cadastro de Empresa"}
            </DialogTitle>
            <DialogDescription>
              {editingCompany 
                ? "Atualize as informações da empresa selecionada"
                : "Preencha os dados para cadastrar uma nova empresa"
              }
            </DialogDescription>
          </DialogHeader>
{editingCompany ? (
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="fantasyName">Nome Fantasia</Label>
                  <Input
                    id="fantasyName"
                    {...editForm.register("fantasyName")}
                    placeholder="Digite o nome fantasia"
                  />
                  {editForm.formState.errors.fantasyName && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.fantasyName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="document">CNPJ / CPF</Label>
                  <Input
                    id="document"
                    {...editForm.register("document")}
                    placeholder="00.000.000/0000-00"
                    disabled
                  />
                  {editForm.formState.errors.document && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.document.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  {...editForm.register("address")}
                  placeholder="Digite o endereço completo"
                />
                {editForm.formState.errors.address && (
                  <p className="text-sm text-red-600">
                    {editForm.formState.errors.address.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="phone">Celular</Label>
                  <Input
                    id="phone"
                    {...editForm.register("phone")}
                    placeholder="(11) 99999-9999"
                  />
                  {editForm.formState.errors.phone && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.phone.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zipCode">CEP</Label>
                  <Input
                    id="zipCode"
                    {...editForm.register("zipCode")}
                    placeholder="00000-000"
                  />
                  {editForm.formState.errors.zipCode && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.zipCode.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  <Input
                    id="number"
                    {...editForm.register("number")}
                    placeholder="123"
                  />
                  {editForm.formState.errors.number && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.number.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Bairro</Label>
                  <Input
                    id="neighborhood"
                    {...editForm.register("neighborhood")}
                    placeholder="Centro"
                  />
                  {editForm.formState.errors.neighborhood && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.neighborhood.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    {...editForm.register("city")}
                    placeholder="São Paulo"
                  />
                  {editForm.formState.errors.city && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.city.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input
                    id="state"
                    {...editForm.register("state")}
                    placeholder="SP"
                    maxLength={2}
                  />
                  {editForm.formState.errors.state && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.state.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    {...editForm.register("email")}
                    placeholder="contato@empresa.com"
                  />
                  {editForm.formState.errors.email && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Nova Senha (opcional)</Label>
                  <Input
                    id="password"
                    type="password"
                    {...editForm.register("password")}
                    placeholder="Digite uma nova senha (deixe vazio para manter atual)"
                  />
                  {editForm.formState.errors.password && (
                    <p className="text-sm text-red-600">
                      {editForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="planId">Plano</Label>
                <Select 
                  value={editForm.watch("planId")?.toString() || "none"} 
                  onValueChange={(value) => editForm.setValue("planId", value === "none" ? null : parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um plano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum plano</SelectItem>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id.toString()}>
                        {plan.name} - R$ {parseFloat(plan.price).toFixed(2).replace('.', ',')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editForm.formState.errors.planId && (
                  <p className="text-sm text-red-600">
                    {editForm.formState.errors.planId.message}
                  </p>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={editForm.watch("isActive")}
                    onCheckedChange={(checked) => editForm.setValue("isActive", checked)}
                  />
                  <Label htmlFor="isActive">Empresa ativa</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="tourEnabled"
                    checked={editForm.watch("tourEnabled") ?? true}
                    onCheckedChange={(checked) => editForm.setValue("tourEnabled", checked)}
                  />
                  <Label htmlFor="tourEnabled">Tour guiado habilitado</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="financialPasswordEnabled"
                    checked={editForm.watch("financialPasswordEnabled") ?? false}
                    onCheckedChange={(checked) => editForm.setValue("financialPasswordEnabled", checked)}
                  />
                  <Label htmlFor="financialPasswordEnabled">Senha financeiro habilitada</Label>
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <Button type="button" variant="outline" onClick={handleCancelEdit}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                >
                  Atualizar Empresa
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="fantasyName">Nome Fantasia</Label>
                  <Input
                    id="fantasyName"
                    {...form.register("fantasyName")}
                    placeholder="Digite o nome fantasia"
                  />
                  {form.formState.errors.fantasyName && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.fantasyName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="document">CNPJ / CPF</Label>
                  <Input
                    id="document"
                    {...form.register("document")}
                    onChange={handleDocumentChange}
                    placeholder="00.000.000/0000-00"
                  />
                  {form.formState.errors.document && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.document.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  {...form.register("address")}
                  placeholder="Digite o endereço completo"
                />
                {form.formState.errors.address && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.address.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="phone">Celular</Label>
                  <Input
                    id="phone"
                    {...form.register("phone")}
                    placeholder="(11) 99999-9999"
                  />
                  {form.formState.errors.phone && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.phone.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zipCode">CEP</Label>
                  <Input
                    id="zipCode"
                    {...form.register("zipCode")}
                    placeholder="00000-000"
                  />
                  {form.formState.errors.zipCode && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.zipCode.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="number">Número</Label>
                  <Input
                    id="number"
                    {...form.register("number")}
                    placeholder="123"
                  />
                  {form.formState.errors.number && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.number.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Bairro</Label>
                  <Input
                    id="neighborhood"
                    {...form.register("neighborhood")}
                    placeholder="Centro"
                  />
                  {form.formState.errors.neighborhood && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.neighborhood.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    {...form.register("city")}
                    placeholder="São Paulo"
                  />
                  {form.formState.errors.city && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.city.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input
                    id="state"
                    {...form.register("state")}
                    placeholder="SP"
                    maxLength={2}
                  />
                  {form.formState.errors.state && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.state.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    {...form.register("email")}
                    placeholder="contato@empresa.com"
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    {...form.register("password")}
                    placeholder="Digite a senha"
                  />
                  {form.formState.errors.password && (
                    <p className="text-sm text-red-600">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="planId">Plano</Label>
                <Select 
                  value={form.watch("planId")?.toString() || ""} 
                  onValueChange={(value) => form.setValue("planId", parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id.toString()}>
                        {plan.name} - R$ {plan.price}/mês
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.planId && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.planId.message}
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="tourEnabled"
                  checked={form.watch("tourEnabled") ?? true}
                  onCheckedChange={(checked) => form.setValue("tourEnabled", checked)}
                />
                <Label htmlFor="tourEnabled">Tour guiado habilitado</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="financialPasswordEnabledCreate"
                  checked={form.watch("financialPasswordEnabled") ?? false}
                  onCheckedChange={(checked) => form.setValue("financialPasswordEnabled", checked)}
                />
                <Label htmlFor="financialPasswordEnabledCreate">Senha financeiro habilitada</Label>
              </div>

              <div className="flex justify-end space-x-4">
                <Button type="button" variant="outline" onClick={handleCancelEdit}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending}
                >
                  Cadastrar Empresa
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Companies Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Empresas Cadastradas</CardTitle>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar empresas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-slate-600">Carregando empresas...</p>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="text-center py-8">
              <Building className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-2 text-sm font-medium text-slate-900">
                {searchTerm ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {searchTerm ? "Tente alterar os termos de busca" : "Comece cadastrando sua primeira empresa"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>CNPJ/CPF</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompanies.map((company: any) => (
                    <TableRow 
                      key={company.id}
                      className={company.is_blocked ? "bg-red-50 border-red-200" : ""}
                    >
                      <TableCell>
                        <div>
                          <div className={`font-medium ${company.is_blocked ? "text-red-900" : "text-slate-900"}`}>
                            {company.fantasy_name}
                            {company.is_blocked && (
                              <span className="ml-2 text-xs text-red-600 font-normal">
                                (BLOQUEADA)
                              </span>
                            )}
                          </div>
                          <div className={`text-sm ${company.is_blocked ? "text-red-600" : "text-slate-500"}`}>
                            {company.address && company.address}
                            {company.days_remaining && company.days_remaining > 0 && (
                              <span className="ml-2 text-orange-600 font-medium">
                                ({company.days_remaining} dias restantes)
                              </span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {company.document}
                      </TableCell>
                      <TableCell className={company.is_blocked ? "text-red-700" : ""}>
                        {company.email}
                      </TableCell>
                      <TableCell>
                        {company.plan_name ? (
                          <Badge variant={company.is_blocked ? "destructive" : "default"}>
                            {company.plan_name}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Sem plano</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={company.is_blocked ? "destructive" : (company.is_active ? "default" : "secondary")} 
                          className={
                            company.is_blocked 
                              ? "bg-red-100 text-red-800" 
                              : (company.is_active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")
                          }
                        >
                          {company.is_blocked ? "Bloqueada" : (company.is_active ? "Ativo" : "Inativo")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {/* Botão de Liberar/Bloquear */}
                          {company.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCompanyStatusMutation.mutate({ id: company.id, action: 'block' })}
                              disabled={toggleCompanyStatusMutation.isPending}
                              title="Bloquear empresa"
                            >
                              <XCircle className="w-4 h-4 text-red-600" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleCompanyStatusMutation.mutate({ id: company.id, action: 'activate' })}
                              disabled={toggleCompanyStatusMutation.isPending}
                              title="Liberar empresa"
                            >
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </Button>
                          )}
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(company)}
                            title="Editar empresa"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {(company.financialPasswordEnabled || company.financial_password_enabled) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Tem certeza que deseja resetar a senha financeiro desta empresa? Ela precisará criar uma nova senha.")) {
                                  resetFinancialPasswordMutation.mutate(company.id);
                                }
                              }}
                              disabled={resetFinancialPasswordMutation.isPending}
                              title="Resetar senha financeiro"
                            >
                              <KeyRound className="w-4 h-4 text-orange-500" />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(company)}
                            disabled={deleteMutation.isPending}
                            title="Excluir empresa"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a empresa <strong>{deletingCompany?.fantasy_name || deletingCompany?.fantasyName}</strong>?
              <br />
              <br />
              Esta ação não pode ser desfeita e todos os dados associados à empresa serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingCompany(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FloatingHelpButton menuLocation="admin-companies" />
    </div>
  );
}
