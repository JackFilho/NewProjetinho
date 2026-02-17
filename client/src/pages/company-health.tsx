import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { HeartPulse, FileText, Users, Plus, Pencil, Trash2, Search, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { HEALTH_SPECIALTY_LABELS } from "@shared/schema";
import type { AnamnesisTemplate, Client } from "@shared/schema";
import { AnamnesisTemplateBuilder } from "@/components/health/anamnesis-template-builder";

export default function CompanyHealth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null);

  // Fetch company health specialty
  const { data: specialtyData } = useQuery<{ healthSpecialty: string | null }>({
    queryKey: ['/api/company/health-specialty'],
  });

  const specialty = specialtyData?.healthSpecialty;

  // Fetch templates
  const { data: templates = [] } = useQuery<AnamnesisTemplate[]>({
    queryKey: ['/api/company/anamnesis-templates'],
    enabled: !!specialty,
  });

  // Fetch clients
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/company/clients'],
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/company/anamnesis-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, specialty }),
      });
      if (!res.ok) throw new Error('Erro ao criar modelo');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/anamnesis-templates'] });
      setShowTemplateBuilder(false);
      toast({ title: "Modelo de anamnese criado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao criar modelo", variant: "destructive" });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/company/anamnesis-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao atualizar modelo');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/anamnesis-templates'] });
      setEditingTemplate(null);
      toast({ title: "Modelo atualizado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar modelo", variant: "destructive" });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/company/anamnesis-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Erro ao excluir modelo');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/anamnesis-templates'] });
      toast({ title: "Modelo excluído com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  // Load template with fields for editing
  const loadTemplateForEdit = async (templateId: number) => {
    try {
      const res = await fetch(`/api/company/anamnesis-templates/${templateId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEditingTemplate(data);
    } catch {
      toast({ title: "Erro ao carregar modelo", variant: "destructive" });
    }
  };

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone && c.phone.includes(clientSearch))
  );

  // If no specialty is set, show message to contact admin
  if (!specialty) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <HeartPulse className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Modulo de Saude</h1>
          <p className="text-muted-foreground">
            Especialidade nao configurada. Entre em contato com o administrador para ativar o modulo de saude.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HeartPulse className="h-6 w-6" />
            Saúde
          </h1>
          <p className="text-muted-foreground">
            Especialidade: <Badge variant="secondary">{HEALTH_SPECIALTY_LABELS[specialty] || specialty}</Badge>
          </p>
        </div>
      </div>

      <Tabs defaultValue="pacientes">
        <TabsList>
          <TabsTrigger value="pacientes" className="gap-1">
            <Users className="h-4 w-4" /> Pacientes
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1">
            <FileText className="h-4 w-4" /> Modelos de Anamnese
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowTemplateBuilder(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo modelo
            </Button>
          </div>

          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Nenhum modelo de anamnese encontrado. Crie um modelo para começar.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <Card key={template.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{template.name}</CardTitle>
                        {template.description && (
                          <CardDescription className="text-xs mt-1">{template.description}</CardDescription>
                        )}
                      </div>
                      <Badge variant={template.companyId ? "default" : "outline"} className="text-xs">
                        {template.companyId ? "Customizado" : "Padrão"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-1 mt-2">
                      {template.companyId && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => loadTemplateForEdit(template.id)}>
                            <Pencil className="h-3 w-3 mr-1" /> Editar
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => setDeleteTemplateId(template.id)}>
                            <Trash2 className="h-3 w-3 mr-1" /> Excluir
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Patients Tab */}
        <TabsContent value="pacientes" className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente por nome ou telefone..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {filteredClients.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                Nenhum paciente encontrado.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredClients.map((client) => (
                <Card key={client.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/company/saude/paciente/${client.id}`)}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{client.name}</p>
                        {client.phone && <p className="text-xs text-muted-foreground">{client.phone}</p>}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Template Builder Dialog - Create */}
      <Dialog open={showTemplateBuilder} onOpenChange={setShowTemplateBuilder}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Modelo de Anamnese</DialogTitle>
          </DialogHeader>
          <AnamnesisTemplateBuilder
            onSave={(data) => createTemplateMutation.mutate(data)}
            onCancel={() => setShowTemplateBuilder(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Template Builder Dialog - Edit */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Modelo de Anamnese</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <AnamnesisTemplateBuilder
              initialName={editingTemplate.name}
              initialDescription={editingTemplate.description || ""}
              initialFields={editingTemplate.fields?.map((f: any) => ({
                section: f.section || "",
                label: f.label,
                fieldType: f.fieldType,
                options: f.options,
                isRequired: f.isRequired,
                sortOrder: f.sortOrder,
                placeholder: f.placeholder || "",
              }))}
              onSave={(data) => updateTemplateMutation.mutate({ id: editingTemplate.id, data })}
              onCancel={() => setEditingTemplate(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      {/* Modal de confirmação para excluir modelo */}
      <AlertDialog open={deleteTemplateId !== null} onOpenChange={(open) => !open && setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir modelo de anamnese?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O modelo será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteTemplateId) {
                  deleteTemplateMutation.mutate(deleteTemplateId);
                }
                setDeleteTemplateId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
