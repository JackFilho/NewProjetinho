import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowLeft, HeartPulse, FileText, Activity, Calendar, Plus, Phone, Mail, Cake } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AnamnesisTemplate, AnamnesisTemplateField, AnamnesisRecord, ClinicalEvolution, Client, Professional } from "@shared/schema";
import { AnamnesisForm } from "@/components/health/anamnesis-form";
import { EvolutionForm } from "@/components/health/evolution-form";
import { EvolutionTimeline } from "@/components/health/evolution-timeline";

interface HealthProfile {
  client: Client;
  anamnesis: AnamnesisRecord[];
  evolutions: ClinicalEvolution[];
  appointments: any[];
}

function formatDateBR(dateVal: string | Date | null): string {
  if (!dateVal) return "";
  const raw = typeof dateVal === "string" ? dateVal : dateVal.toISOString();
  const dateStr = raw.includes("T") ? raw.split("T")[0] : raw;
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

export default function CompanyPatientProfile() {
  const { clientId } = useParams<{ clientId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showEvolutionForm, setShowEvolutionForm] = useState(false);
  const [editingEvolution, setEditingEvolution] = useState<ClinicalEvolution | null>(null);
  const [showAnamnesisForm, setShowAnamnesisForm] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [viewingAnamnesisId, setViewingAnamnesisId] = useState<number | null>(null);

  // Fetch health profile
  const { data: profile, isLoading } = useQuery<HealthProfile>({
    queryKey: [`/api/company/clients/${clientId}/health-profile`],
    enabled: !!clientId,
  });

  // Fetch templates
  const { data: templates = [] } = useQuery<AnamnesisTemplate[]>({
    queryKey: ['/api/company/anamnesis-templates'],
  });

  // Fetch professionals
  const { data: professionals = [] } = useQuery<Professional[]>({
    queryKey: ['/api/company/professionals'],
  });

  // Fetch template fields when viewing anamnesis
  const { data: viewingAnamnesis } = useQuery<{ fields: AnamnesisTemplateField[] } & AnamnesisRecord>({
    queryKey: [`/api/company/anamnesis-records/${viewingAnamnesisId}`],
    enabled: !!viewingAnamnesisId,
  });

  // Fetch template fields when creating new anamnesis
  const { data: selectedTemplate } = useQuery<{ fields: AnamnesisTemplateField[] } & AnamnesisTemplate>({
    queryKey: [`/api/company/anamnesis-templates/${selectedTemplateId}`],
    enabled: !!selectedTemplateId,
  });

  // Create evolution mutation
  const createEvolutionMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/company/clients/${clientId}/evolutions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao criar evolução');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/company/clients/${clientId}/health-profile`] });
      toast({ title: "Evolução registrada com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao registrar evolução", variant: "destructive" });
    },
  });

  // Update evolution mutation
  const updateEvolutionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/company/evolutions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao atualizar evolução');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/company/clients/${clientId}/health-profile`] });
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
      const res = await fetch(`/api/company/evolutions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir evolução');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/company/clients/${clientId}/health-profile`] });
      toast({ title: "Evolução excluída com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir evolução", variant: "destructive" });
    },
  });

  // Create anamnesis record mutation
  const createAnamnesisMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/company/clients/${clientId}/anamnesis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Erro ao salvar anamnese');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/company/clients/${clientId}/health-profile`] });
      setShowAnamnesisForm(false);
      setSelectedTemplateId(null);
      toast({ title: "Anamnese salva com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao salvar anamnese", variant: "destructive" });
    },
  });

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
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Paciente não encontrado.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/company/saude")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  const { client, anamnesis, evolutions, appointments } = profile;

  return (
    <div className="p-6 space-y-6">
      {/* Back button + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/company/saude")}>
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
                  <Card key={record.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setViewingAnamnesisId(record.id)}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{template?.name || `Modelo #${record.templateId}`}</p>
                          <p className="text-xs text-muted-foreground">
                            Preenchida em {record.createdAt ? new Date(record.createdAt).toLocaleDateString('pt-BR') : '-'}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs">Ver ficha</Badge>
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
            professionals={professionals}
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
        professionals={professionals}
        appointments={appointments}
      />

      {/* Edit Evolution Dialog */}
      {editingEvolution && (
        <EvolutionForm
          open={!!editingEvolution}
          onOpenChange={(open) => !open && setEditingEvolution(null)}
          onSubmit={(data) => updateEvolutionMutation.mutate({ id: editingEvolution.id, data })}
          professionals={professionals}
          appointments={appointments}
          initialData={{
            title: editingEvolution.title || "",
            content: editingEvolution.content,
            evolutionDate: typeof editingEvolution.evolutionDate === "string" ? editingEvolution.evolutionDate : editingEvolution.evolutionDate?.toISOString().split("T")[0] || "",
            professionalId: editingEvolution.professionalId,
            appointmentId: editingEvolution.appointmentId,
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
                Nenhum modelo disponível. Crie um modelo na aba Saúde primeiro.
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
      <Dialog open={!!viewingAnamnesisId && !!viewingAnamnesis} onOpenChange={(open) => { if (!open) setViewingAnamnesisId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ficha de Anamnese</DialogTitle>
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
    </div>
  );
}
