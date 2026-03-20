import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { FloatingHelpButton } from "@/components/floating-help-button";
import { Bell, Clock, MessageSquare, Send, CheckCircle, XCircle } from 'lucide-react';

interface ReminderSettings {
  id: number;
  companyId: number;
  reminderType: string;
  isActive: boolean;
  messageTemplate: string;
  createdAt: string;
  updatedAt: string;
}

interface ReminderHistory {
  id: number;
  companyId: number;
  appointmentId: number;
  reminderType: string;
  clientPhone: string;
  message: string;
  sentAt: string;
  status: string;
  whatsappInstanceId: number;
}

export default function CompanyReminders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingSettings, setEditingSettings] = useState<{ [key: string]: ReminderSettings }>({});

  // Fetch reminder settings
  const { data: reminderSettings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['/api/company/reminder-settings'],
  });

  // Fetch reminder history
  const { data: reminderHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ['/api/company/reminder-history'],
  });

  // Update reminder settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ReminderSettings> }) => {
      const response = await fetch(`/api/company/reminder-settings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Falha ao atualizar configurações');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/reminder-settings'] });
      toast({
        title: "Configurações atualizadas",
        description: "As configurações de lembrete foram atualizadas com sucesso.",
      });
      setEditingSettings({});
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar configurações de lembrete.",
        variant: "destructive",
      });
    },
  });

  // Test reminder function mutation
  const testReminderMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/company/test-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Falha ao testar lembrete');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/reminder-history'] });
      toast({
        title: data.success ? "Teste realizado" : "Erro no teste",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao testar função de lembrete.",
        variant: "destructive",
      });
    },
  });

  const handleSaveSettings = (reminderType: string) => {
    const settings = editingSettings[reminderType];
    if (settings) {
      updateSettingsMutation.mutate({
        id: settings.id,
        data: {
          isActive: settings.isActive,
          messageTemplate: settings.messageTemplate,
        },
      });
    }
  };

  const handleToggleActive = (reminderType: string, isActive: boolean) => {
    const settings = reminderSettings.find((s: ReminderSettings) => s.reminderType === reminderType);
    if (settings) {
      setEditingSettings(prev => ({
        ...prev,
        [reminderType]: { ...settings, isActive },
      }));
    }
  };

  const handleMessageChange = (reminderType: string, messageTemplate: string) => {
    const settings = reminderSettings.find((s: ReminderSettings) => s.reminderType === reminderType);
    if (settings) {
      setEditingSettings(prev => ({
        ...prev,
        [reminderType]: { ...settings, messageTemplate },
      }));
    }
  };

  const getReminderTypeLabel = (type: string) => {
    switch (type) {
      case 'confirmation': return 'Confirmação';
      case '24h': return '24 horas antes';
      case '1h': return '1 hora antes';
      default: return type;
    }
  };

  const getReminderTypeIcon = (type: string) => {
    switch (type) {
      case 'confirmation': return <CheckCircle className="h-4 w-4" />;
      case '24h': return <Clock className="h-4 w-4" />;
      case '1h': return <Bell className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('pt-BR');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge variant="default" className="bg-green-100 text-green-800">Enviado</Badge>;
      case 'failed':
        return <Badge variant="destructive">Falhou</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pendente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (settingsLoading) {
    return <div className="p-6">Carregando configurações...</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight ml-16 sm:ml-0">Sistema de Lembretes</h1>
          <p className="text-muted-foreground">
            Configure lembretes automáticos via WhatsApp para agendamentos
          </p>
        </div>
        <Button
          onClick={() => testReminderMutation.mutate()}
          disabled={testReminderMutation.isPending}
          className="flex items-center gap-2"
        >
          <Send className="h-4 w-4" />
          {testReminderMutation.isPending ? 'Testando...' : 'Testar Função'}
        </Button>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4">
          <div className="grid gap-6">
            {reminderSettings.map((setting: ReminderSettings) => {
              const isEditing = !!editingSettings[setting.reminderType];
              const currentSettings = isEditing ? editingSettings[setting.reminderType] : setting;
              
              return (
                <Card key={setting.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getReminderTypeIcon(setting.reminderType)}
                        <CardTitle>{getReminderTypeLabel(setting.reminderType)}</CardTitle>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={currentSettings.isActive}
                            onCheckedChange={(checked) => handleToggleActive(setting.reminderType, checked)}
                          />
                          <Label>Sistema Ativo</Label>
                        </div>
                        {isEditing && (
                          <Button
                            onClick={() => handleSaveSettings(setting.reminderType)}
                            disabled={updateSettingsMutation.isPending}
                            size="sm"
                          >
                            Salvar
                          </Button>
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      {setting.reminderType === 'confirmation' && 'Enviado imediatamente após confirmação do agendamento'}
                      {setting.reminderType === '24h' && 'Enviado 24 horas antes do agendamento'}
                      {setting.reminderType === '1h' && 'Enviado 1 hora antes do agendamento'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor={`message-${setting.reminderType}`}>Modelo da Mensagem</Label>
                      <Textarea
                        id={`message-${setting.reminderType}`}
                        value={currentSettings.messageTemplate}
                        onChange={(e) => handleMessageChange(setting.reminderType, e.target.value)}
                        rows={6}
                        className="mt-2"
                        placeholder="Digite o modelo da mensagem..."
                      />
                      <div className="mt-2 text-sm text-muted-foreground">
                        <p><strong>Variáveis disponíveis:</strong></p>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li><code>{'{clientName}'}</code> - Nome do cliente</li>
                          <li><code>{'{companyName}'}</code> - Nome da empresa</li>
                          <li><code>{'{serviceName}'}</code> - Nome do serviço</li>
                          <li><code>{'{professionalName}'}</code> - Nome do profissional</li>
                          <li><code>{'{appointmentDate}'}</code> - Data do agendamento</li>
                          <li><code>{'{appointmentTime}'}</code> - Horário do agendamento</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Lembretes</CardTitle>
              <CardDescription>
                Visualize todos os lembretes enviados via WhatsApp
              </CardDescription>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div>Carregando histórico...</div>
              ) : reminderHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum lembrete enviado ainda
                </div>
              ) : (
                <div className="space-y-4">
                  {reminderHistory.map((history: ReminderHistory) => (
                    <div key={history.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getReminderTypeIcon(history.reminderType)}
                          <span className="font-medium">
                            {getReminderTypeLabel(history.reminderType)}
                          </span>
                          {getStatusBadge(history.status)}
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(history.sentAt)}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <strong>Telefone:</strong> {history.clientPhone}
                        </div>
                        <div>
                          <strong>Agendamento ID:</strong> {history.appointmentId}
                        </div>
                      </div>
                      
                      <Separator />
                      
                      <div>
                        <strong>Mensagem enviada:</strong>
                        <div className="mt-2 p-3 bg-muted rounded text-sm whitespace-pre-wrap">
                          {history.message}
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
      <FloatingHelpButton menuLocation="reminders" />
    </div>
  );
}