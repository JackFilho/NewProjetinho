import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Plus, Tags, Edit, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { planSchema } from "@/lib/validations";
import type { Plan } from "@shared/schema";
import { z } from "zod";
import { FloatingHelpButton } from "@/components/floating-help-button";

type PlanFormData = z.infer<typeof planSchema>;

export default function Plans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
  });

  const form = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: "",
      freeDays: 0,
      price: "",
      annualPrice: "",
      maxProfessionals: 1,
      isActive: true,
      permissions: {},
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PlanFormData) => {
      await apiRequest("/api/plans", "POST", {
        ...data,
        price: parseFloat(data.price).toFixed(2),
        annualPrice: data.annualPrice ? parseFloat(data.annualPrice).toFixed(2) : null,
        isActive: data.isActive ? 1 : 0,
      });
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Plano cadastrado com sucesso!",
      });
      form.reset();
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao cadastrar plano",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<PlanFormData> }) => {
      const payload = { ...data };
      if (payload.price) {
        payload.price = parseFloat(payload.price).toFixed(2);
      }
      if (payload.annualPrice) {
        payload.annualPrice = parseFloat(payload.annualPrice).toFixed(2);
      }
      if (payload.isActive !== undefined) {
        (payload as any).isActive = payload.isActive ? 1 : 0;
      }
      await apiRequest(`/api/plans/${id}`, "PUT", payload);
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Plano atualizado com sucesso!",
      });
      form.reset();
      setEditingPlan(null);
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar plano",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/plans/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Plano excluído com sucesso!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao excluir plano",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PlanFormData) => {
    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (plan: Plan) => {
    setEditingPlan(plan);
    form.reset({
      name: plan.name,
      freeDays: plan.freeDays,
      price: plan.price.toString(),
      annualPrice: plan.annualPrice ? plan.annualPrice.toString() : "",
      maxProfessionals: plan.maxProfessionals || 1,
      isActive: Boolean(plan.isActive),
      permissions: plan.permissions || {},
    });
    setIsModalOpen(true);
  };

  const handleNewPlan = () => {
    setEditingPlan(null);
    form.reset({
      name: "",
      freeDays: 0,
      price: "",
      annualPrice: "",
      isActive: true,
      permissions: {
        dashboard: true,
        appointments: true,
        services: true,
        professionals: true,
        clients: true,
        reviews: true,
        messages: true,
        financial: true,
        reports: true,
        settings: true,
        subscription: true,
      },
    });
    setIsModalOpen(true);
  };

  const handleCancelEdit = () => {
    setEditingPlan(null);
    setIsModalOpen(false);
    form.reset();
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planos de Assinatura</h1>
          <p className="text-slate-600 mt-1">Gerencie os planos disponíveis</p>
        </div>
        <Button onClick={handleNewPlan} className="mt-4 sm:mt-0">
          <Plus className="w-4 h-4 mr-2" />
          Novo Plano
        </Button>
      </div>

      {/* Modal de Cadastro/Edição de Planos */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingPlan ? "Editar Plano" : "Novo Plano"}
            </DialogTitle>
            <DialogDescription>
              {editingPlan 
                ? "Atualize as informações do plano selecionado"
                : "Configure um novo plano de assinatura"
              }
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Plano</Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="Ex: Plano Premium"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="freeDays">Dias Grátis</Label>
                <Input
                  id="freeDays"
                  type="number"
                  min="0"
                  {...form.register("freeDays", { valueAsNumber: true })}
                  placeholder="0"
                />
                {form.formState.errors.freeDays && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.freeDays.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="price">Valor Mensal (R$)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("price")}
                  placeholder="49.90"
                />
                {form.formState.errors.price && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.price.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="annualPrice">Valor Anual (R$) - Opcional</Label>
                <Input
                  id="annualPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("annualPrice")}
                  placeholder="499.90"
                />
                {form.formState.errors.annualPrice && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.annualPrice.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="maxProfessionals">Máximo de Profissionais</Label>
                <Input
                  id="maxProfessionals"
                  type="number"
                  min="1"
                  {...form.register("maxProfessionals", { valueAsNumber: true })}
                  placeholder="1"
                />
                {form.formState.errors.maxProfessionals && (
                  <p className="text-sm text-red-600">
                    {form.formState.errors.maxProfessionals.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="isActive">Status</Label>
                <div className="flex items-center space-x-2 mt-2">
                  <Switch
                    id="isActive"
                    checked={form.watch("isActive")}
                    onCheckedChange={(checked) => form.setValue("isActive", checked)}
                  />
                  <Label htmlFor="isActive" className="text-sm">
                    {form.watch("isActive") ? "Ativo" : "Inativo"}
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-base font-medium">Permissões do Plano</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 border rounded-lg bg-slate-50">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="dashboard"
                    checked={form.watch("permissions.dashboard")}
                    onCheckedChange={(checked) => form.setValue("permissions.dashboard", !!checked)}
                  />
                  <Label htmlFor="dashboard" className="text-sm">Dashboard</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="appointments"
                    checked={form.watch("permissions.appointments")}
                    onCheckedChange={(checked) => form.setValue("permissions.appointments", !!checked)}
                  />
                  <Label htmlFor="appointments" className="text-sm">Agendamentos</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="services"
                    checked={form.watch("permissions.services")}
                    onCheckedChange={(checked) => form.setValue("permissions.services", !!checked)}
                  />
                  <Label htmlFor="services" className="text-sm">Serviços</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="professionals"
                    checked={form.watch("permissions.professionals")}
                    onCheckedChange={(checked) => form.setValue("permissions.professionals", !!checked)}
                  />
                  <Label htmlFor="professionals" className="text-sm">Profissionais</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="clients"
                    checked={form.watch("permissions.clients")}
                    onCheckedChange={(checked) => form.setValue("permissions.clients", !!checked)}
                  />
                  <Label htmlFor="clients" className="text-sm">Clientes</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reviews"
                    checked={form.watch("permissions.reviews")}
                    onCheckedChange={(checked) => form.setValue("permissions.reviews", !!checked)}
                  />
                  <Label htmlFor="reviews" className="text-sm">Avaliações</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="messages"
                    checked={form.watch("permissions.messages")}
                    onCheckedChange={(checked) => form.setValue("permissions.messages", !!checked)}
                  />
                  <Label htmlFor="messages" className="text-sm">Mensagens</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="financial"
                    checked={form.watch("permissions.financial")}
                    onCheckedChange={(checked) => form.setValue("permissions.financial", !!checked)}
                  />
                  <Label htmlFor="financial" className="text-sm">Financeiro</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="reports"
                    checked={form.watch("permissions.reports")}
                    onCheckedChange={(checked) => form.setValue("permissions.reports", !!checked)}
                  />
                  <Label htmlFor="reports" className="text-sm">Relatórios</Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="settings"
                    checked={form.watch("permissions.settings")}
                    onCheckedChange={(checked) => form.setValue("permissions.settings", !!checked)}
                  />
                  <Label htmlFor="settings" className="text-sm">Configurações</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="subscription"
                    checked={form.watch("permissions.subscription")}
                    onCheckedChange={(checked) => form.setValue("permissions.subscription", !!checked)}
                  />
                  <Label htmlFor="subscription" className="text-sm">Assinatura</Label>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <Button type="button" variant="outline" onClick={handleCancelEdit}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}

              >
                {editingPlan ? "Atualizar Plano" : "Criar Plano"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Plans Grid */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Planos Cadastrados</h2>
        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-slate-600">Carregando planos...</p>
          </div>
        ) : plans.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <Tags className="mx-auto h-12 w-12 text-slate-400" />
              <h3 className="mt-2 text-sm font-medium text-slate-900">
                Nenhum plano cadastrado
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Comece criando seu primeiro plano de assinatura
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <Card key={plan.id} className="relative">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <Badge variant={plan.isActive ? "default" : "secondary"}>
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Valor mensal:</span>
                      <span className="text-lg font-bold text-slate-900">
                        R$ {parseFloat(plan.price).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                    {plan.annualPrice && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-600">Valor anual:</span>
                        <span className="text-lg font-bold text-green-600">
                          R$ {parseFloat(plan.annualPrice).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Dias grátis:</span>
                      <span className="text-sm font-medium text-slate-900">
                        {plan.freeDays} dias
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Máx. profissionais:</span>
                      <span className="text-sm font-medium text-slate-900">
                        {plan.maxProfessionals || 1}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEdit(plan)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-red-600 hover:bg-red-50"
                      onClick={() => deleteMutation.mutate(plan.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <FloatingHelpButton menuLocation="admin-plans" />
    </div>
  );
}
