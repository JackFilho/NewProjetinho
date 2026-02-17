import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, HeartPulse, FileText, Activity, Calendar, Plus, Phone, Mail, Cake, Pencil, Download, FileDown, Trash2, Home, Users, User, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AnamnesisTemplate, AnamnesisTemplateField, AnamnesisRecord, ClinicalEvolution, Client, Professional } from "@shared/schema";
import { AnamnesisForm } from "@/components/health/anamnesis-form";
import { EvolutionForm } from "@/components/health/evolution-form";
import { EvolutionTimeline } from "@/components/health/evolution-timeline";
import { generateAnamnesisPdf } from "@/components/health/anamnesis-pdf";

interface HealthProfile {
  client: Client;
  anamnesis: AnamnesisRecord[];
  evolutions: ClinicalEvolution[];
  appointments: any[];
}

interface CompanyInfo {
  logoUrl: string | null;
  fantasyName: string;
  primaryColor: string | null;
}

function formatDateBR(dateVal: string | Date | null): string {
  if (!dateVal) return "";
  const raw = typeof dateVal === "string" ? dateVal : dateVal.toISOString();
  const dateStr = raw.includes("T") ? raw.split("T")[0] : raw;
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

export default function ProfessionalPatientProfile() {
  const { clientId } = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showEvolutionForm, setShowEvolutionForm] = useState(false);
  const [editingEvolution, setEditingEvolution] = useState<ClinicalEvolution | null>(null);
  const [showAnamnesisForm, setShowAnamnesisForm] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [viewingAnamnesisId, setViewingAnamnesisId] = useState<number | null>(null);
  const [editingAnamnesisId, setEditingAnamnesisId] = useState<number | null>(null);
  const [pdfExportType, setPdfExportType] = useState<"digital" | "manual" | null>(null);
  const [deleteAnamnesisId, setDeleteAnamnesisId] = useState<number | null>(null);

  // Fetch company info (for PDF)
  const { data: companyInfo } = useQuery<CompanyInfo>({
    queryKey: ['/api/professional/company-info'],
  });

  // Fetch current professional
  const { data: currentProfessional } = useQuery<Professional>({
    queryKey: ['/api/auth/professional/status'],
    select: (data: any) => data.professional,
  });

  // Fetch health profile
  const { data: profile, isLoading, error: profileError } = useQuery<HealthProfile>({
    queryKey: [`/api/professional/clients/${clientId}/health-profile`],
    enabled: !!clientId,
  });

  // Fetch templates (filtered by professional specialties)
  const { data: templates = [] } = useQuery<AnamnesisTemplate[]>({
    queryKey: ['/api/professional/anamnesis-templates'],
  });

  // Fetch template fields when viewing anamnesis
  const { data: viewingAnamnesis } = useQuery<{ fields: AnamnesisTemplateField[] } & AnamnesisRecord>({
    queryKey: [`/api/professional/anamnesis-records/${viewingAnamnesisId}`],
    enabled: !!viewingAnamnesisId,
  });

  // Fetch anamnesis record for editing
  const { data: editingAnamnesis } = useQuery<{ fields: AnamnesisTemplateField[] } & AnamnesisRecord>({
    queryKey: [`/api/professional/anamnesis-records/${editingAnamnesisId}`],
    enabled: !!editingAnamnesisId,
  });

  // Fetch template fields when creating new anamnesis
  const { data: selectedTemplate } = useQuery<{ fields: AnamnesisTemplateField[] } & AnamnesisTemplate>({
    queryKey: [`/api/professional/anamnesis-templates/${selectedTemplateId}`],
    enabled: !!selectedTemplateId,
  });

  // Professional as array for EvolutionTimeline
  const professionalsForTimeline = currentProfessional
    ? [{ id: currentProfessional.id, name: currentProfessional.name }]
    : [];

  // Create evolution mutation
  const createEvolutionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/professional/clients/${clientId}/evolutions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao criar evolução');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/professional/clients/${clientId}/health-profile`] });
      toast({ title: "Evolução registrada com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao registrar evolução", variant: "destructive" });
    },
  });

  // Update evolution mutation
  const updateEvolutionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/professional/evolutions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao atualizar evolução');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/professional/clients/${clientId}/health-profile`] });
      setEditingEvolution(null);
      toast({ title: "Evolução atualizada com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar evolução", variant: "destructive" });
    },
  });

  // Delete evolution mutation
  const deleteEvolutionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/professional/evolutions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir evolução');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/professional/clients/${clientId}/health-profile`] });
      toast({ title: "Evolução excluída com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir evolução", variant: "destructive" });
    },
  });

  // Update anamnesis record mutation
  const updateAnamnesisMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/professional/anamnesis-records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao atualizar anamnese');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/professional/clients/${clientId}/health-profile`] });
      setEditingAnamnesisId(null);
      toast({ title: "Anamnese atualizada com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar anamnese", variant: "destructive" });
    },
  });

  // Delete anamnesis record mutation
  const deleteAnamnesisMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/professional/anamnesis-records/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Erro ao excluir ficha');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/professional/clients/${clientId}/health-profile`] });
      toast({ title: "Ficha de anamnese excluída com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  // Create anamnesis record mutation
  const createAnamnesisMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/professional/clients/${clientId}/anamnesis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao salvar anamnese');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/professional/clients/${clientId}/health-profile`] });
      setShowAnamnesisForm(false);
      setSelectedTemplateId(null);
      toast({ title: "Anamnese salva com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar anamnese", variant: "destructive" });
    },
  });

  // Auto-export PDF when data is ready from list click
  useEffect(() => {
    if (pdfExportType && viewingAnamnesis?.fields && profile?.client) {
      generateAnamnesisPdf({
        fields: viewingAnamnesis.fields,
        answers: pdfExportType === "digital" ? (viewingAnamnesis.answers as Record<string, any>) : {},
        notes: pdfExportType === "digital" ? (viewingAnamnesis.notes || "") : "",
        patient: profile.client,
        mode: pdfExportType,
        logoUrl: companyInfo?.logoUrl,
        companyName: companyInfo?.fantasyName,
        primaryColor: companyInfo?.primaryColor,
      })
        .catch((err) => {
          console.error("Erro ao gerar PDF:", err);
          toast({ title: "Erro ao gerar PDF", variant: "destructive" });
        })
        .finally(() => {
          setPdfExportType(null);
          setViewingAnamnesisId(null);
        });
    }
  }, [pdfExportType, viewingAnamnesis, profile, companyInfo]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!profile) {
    let errorMsg = "Paciente não encontrado.";
    if (profileError) {
      const status = (profileError as any)?.status;
      if (status === 401) {
        errorMsg = "Sessão expirada. Faça login novamente.";
      } else {
        // Try to extract the API error message from the response
        try {
          const responseText = (profileError as any)?.response;
          if (responseText) {
            const parsed = JSON.parse(responseText);
            errorMsg = parsed.message || "Erro ao carregar dados do paciente.";
          } else {
            errorMsg = "Erro ao carregar dados do paciente.";
          }
        } catch {
          errorMsg = "Erro ao carregar dados do paciente.";
        }
      }
    }
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">{errorMsg}</p>
        <div className="flex items-center justify-center gap-2 mt-4">
          {(profileError as any)?.status === 401 ? (
            <Button variant="outline" onClick={() => navigate("/profissional/login")}>
              Fazer Login
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => navigate("/profissional/clientes")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              {profileError && (
                <Button
                  variant="outline"
                  onClick={() => queryClient.invalidateQueries({ queryKey: [`/api/professional/clients/${clientId}/health-profile`] })}
                >
                  <RefreshCw className="h-4 w-4 mr-1" /> Tentar novamente
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const { client, anamnesis, evolutions, appointments } = profile;

  return (
    <div className="min-h-screen pb-20">
      <div className="p-6 space-y-6">
        {/* Back button + Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/profissional/clientes")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <HeartPulse className="h-6 w-6" />
              {client.name}
            </h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
              {client.phone && (
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {client.phone}</span>
              )}
              {client.email && (
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {client.email}</span>
              )}
              {client.birthDate && (
                <span className="flex items-center gap-1"><Cake className="h-3 w-3" /> {formatDateBR(client.birthDate)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold">{anamnesis.length}</p>
              <p className="text-xs text-muted-foreground">Fichas de Anamnese</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold">{evolutions.length}</p>
              <p className="text-xs text-muted-foreground">Evoluções</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-bold">{appointments.length}</p>
              <p className="text-xs text-muted-foreground">Atendimentos</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="anamnese">
          <TabsList>
            <TabsTrigger value="anamnese" className="gap-1">
              <FileText className="h-4 w-4" /> Anamnese
            </TabsTrigger>
            <TabsTrigger value="evolucoes" className="gap-1">
              <Activity className="h-4 w-4" /> Evoluções
            </TabsTrigger>
            <TabsTrigger value="historico" className="gap-1">
              <Calendar className="h-4 w-4" /> Histórico
            </TabsTrigger>
          </TabsList>

          {/* Anamnesis Tab */}
          <TabsContent value="anamnese" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowAnamnesisForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> Nova Anamnese
              </Button>
            </div>

            {anamnesis.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhuma ficha de anamnese preenchida.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {anamnesis.map((record) => {
                  const template = templates.find(t => t.id === record.templateId);
                  return (
                    <Card key={record.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div className="cursor-pointer flex-1" onClick={() => setViewingAnamnesisId(record.id)}>
                            <p className="font-medium">{template?.name || `Modelo #${record.templateId}`}</p>
                            <p className="text-xs text-muted-foreground">
                              Preenchida em {record.createdAt ? new Date(record.createdAt).toLocaleDateString('pt-BR') : '-'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar ficha"
                              onClick={(e) => { e.stopPropagation(); setEditingAnamnesisId(record.id); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Exportar PDF preenchido"
                              onClick={(e) => { e.stopPropagation(); setViewingAnamnesisId(record.id); setPdfExportType("digital"); }}>
                              <FileDown className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Exportar PDF em branco"
                              onClick={(e) => { e.stopPropagation(); setViewingAnamnesisId(record.id); setPdfExportType("manual"); }}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" title="Excluir ficha"
                              onClick={(e) => { e.stopPropagation(); setDeleteAnamnesisId(record.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Badge variant="outline" className="text-xs cursor-pointer" onClick={() => setViewingAnamnesisId(record.id)}>Ver ficha</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Evolutions Tab */}
          <TabsContent value="evolucoes" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowEvolutionForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> Nova Evolução
              </Button>
            </div>

            <EvolutionTimeline
              evolutions={evolutions}
              professionals={professionalsForTimeline}
              onEdit={(ev) => setEditingEvolution(ev)}
              onDelete={(id) => {
                if (confirm("Excluir esta evolução?")) {
                  deleteEvolutionMutation.mutate(id);
                }
              }}
            />
          </TabsContent>

          {/* Appointments History Tab */}
          <TabsContent value="historico" className="space-y-4">
            {appointments.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Nenhum atendimento encontrado.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {appointments.map((apt: any) => (
                  <Card key={apt.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{apt.serviceName || "Serviço"}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateBR(apt.appointmentDate)} às {apt.appointmentTime}
                            {apt.professionalName && ` - ${apt.professionalName}`}
                          </p>
                        </div>
                        <Badge variant={apt.status === "agendado" ? "default" : "secondary"} className="text-xs">
                          {apt.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* New Evolution Dialog */}
        <EvolutionForm
          open={showEvolutionForm}
          onOpenChange={setShowEvolutionForm}
          onSubmit={(data) => createEvolutionMutation.mutate(data)}
          professionals={professionalsForTimeline}
        />

        {/* Edit Evolution Dialog */}
        {editingEvolution && (
          <EvolutionForm
            open={!!editingEvolution}
            onOpenChange={(open) => !open && setEditingEvolution(null)}
            onSubmit={(data) => updateEvolutionMutation.mutate({ id: editingEvolution.id, data })}
            professionals={professionalsForTimeline}
            initialData={{
              title: editingEvolution.title || "",
              content: editingEvolution.content,
              evolutionDate: typeof editingEvolution.evolutionDate === "string" ? editingEvolution.evolutionDate : editingEvolution.evolutionDate?.toISOString().split("T")[0] || "",
              professionalId: editingEvolution.professionalId,
            }}
            isEditing
          />
        )}

        {/* New Anamnesis Dialog - Template Selection */}
        <Dialog open={showAnamnesisForm && !selectedTemplateId} onOpenChange={(open) => { if (!open) setShowAnamnesisForm(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Selecione o modelo de anamnese</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Modelo</Label>
              <Select onValueChange={(val) => setSelectedTemplateId(Number(val))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um modelo..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nenhum modelo disponível para suas especialidades. Verifique com o administrador.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* New Anamnesis Dialog - Fill Form */}
        <Dialog open={!!selectedTemplateId && !!selectedTemplate} onOpenChange={(open) => { if (!open) { setSelectedTemplateId(null); setShowAnamnesisForm(false); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Preencher Anamnese - {selectedTemplate?.name}</DialogTitle>
            </DialogHeader>
            {selectedTemplate?.fields && (
              <AnamnesisForm
                templateFields={selectedTemplate.fields}
                patient={client}
                onSubmit={(answers, notes) => {
                  createAnamnesisMutation.mutate({
                    templateId: selectedTemplateId,
                    answers,
                    notes,
                  });
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* View Anamnesis Record Dialog */}
        <Dialog open={!!viewingAnamnesisId && !!viewingAnamnesis && !pdfExportType} onOpenChange={(open) => { if (!open) setViewingAnamnesisId(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Ficha de Anamnese</span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => {
                    if (viewingAnamnesis?.fields) {
                      generateAnamnesisPdf({
                        fields: viewingAnamnesis.fields,
                        answers: viewingAnamnesis.answers as Record<string, any>,
                        notes: viewingAnamnesis.notes || "",
                        patient: client,
                        mode: "digital",
                        logoUrl: companyInfo?.logoUrl,
                        companyName: companyInfo?.fantasyName,
                        primaryColor: companyInfo?.primaryColor,
                      }).catch(() => toast({ title: "Erro ao gerar PDF", variant: "destructive" }));
                    }
                  }}>
                    <FileDown className="h-4 w-4 mr-1" /> PDF Preenchido
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    if (viewingAnamnesis?.fields) {
                      generateAnamnesisPdf({
                        fields: viewingAnamnesis.fields,
                        answers: {},
                        notes: "",
                        patient: client,
                        mode: "manual",
                        logoUrl: companyInfo?.logoUrl,
                        companyName: companyInfo?.fantasyName,
                        primaryColor: companyInfo?.primaryColor,
                      }).catch(() => toast({ title: "Erro ao gerar PDF", variant: "destructive" }));
                    }
                  }}>
                    <Download className="h-4 w-4 mr-1" /> PDF Manual
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>
            {viewingAnamnesis?.fields && (
              <AnamnesisForm
                templateFields={viewingAnamnesis.fields}
                existingAnswers={viewingAnamnesis.answers as Record<string, any>}
                notes={viewingAnamnesis.notes || ""}
                isReadOnly
                patient={client}
                onSubmit={() => {}}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Anamnesis Record Dialog */}
        <Dialog open={!!editingAnamnesisId && !!editingAnamnesis} onOpenChange={(open) => { if (!open) setEditingAnamnesisId(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Anamnese</DialogTitle>
            </DialogHeader>
            {editingAnamnesis?.fields && (
              <AnamnesisForm
                templateFields={editingAnamnesis.fields}
                existingAnswers={editingAnamnesis.answers as Record<string, any>}
                notes={editingAnamnesis.notes || ""}
                patient={client}
                onSubmit={(answers, notes) => {
                  updateAnamnesisMutation.mutate({
                    id: editingAnamnesisId!,
                    data: { answers, notes },
                  });
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de confirmação para excluir ficha */}
        <AlertDialog open={deleteAnamnesisId !== null} onOpenChange={(open) => !open && setDeleteAnamnesisId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir ficha de anamnese?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todos os dados preenchidos nesta ficha serão perdidos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => {
                if (deleteAnamnesisId) deleteAnamnesisMutation.mutate(deleteAnamnesisId);
                setDeleteAnamnesisId(null);
              }}>
                Excluir
              </AlertDialogAction>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50">
        <div className="flex justify-around py-2">
          <button onClick={() => navigate("/profissional/dashboard")} className="flex flex-col items-center gap-1 px-4 py-1 text-gray-400">
            <Home className="w-5 h-5" />
            <span className="text-xs">Início</span>
          </button>
          <button onClick={() => navigate("/profissional/clientes")} className="flex flex-col items-center gap-1 px-4 py-1 text-primary">
            <Users className="w-5 h-5" />
            <span className="text-xs font-medium">Pacientes</span>
          </button>
          <button onClick={() => navigate("/profissional/perfil")} className="flex flex-col items-center gap-1 px-4 py-1 text-gray-400">
            <User className="w-5 h-5" />
            <span className="text-xs">Perfil</span>
          </button>
        </div>
      </div>
    </div>
  );
}
