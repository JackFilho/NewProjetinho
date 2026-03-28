import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { FloatingHelpButton } from "@/components/floating-help-button";
import {
  FileText,
  Plus,
  Send,
  Trash2,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Info,
  Search,
  Variable,
  Check,
  ChevronsUpDown,
  User
} from 'lucide-react';

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
}

interface MetaTemplateComponent {
  type: string;
  text?: string;
  format?: string;
  example?: any;
  buttons?: any[];
}

// Labels descritivos para as variaveis dos templates
const VARIABLE_LABELS: { [key: string]: string } = {
  '{{1}}': 'Nome do cliente',
  '{{2}}': 'Data (ex: 20/03/2026)',
  '{{3}}': 'Horario (ex: 14:30)',
  '{{4}}': 'Nome do servico',
  '{{5}}': 'Nome do profissional',
  '{{6}}': 'Nome da empresa',
};

export default function CompanyTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<MetaTemplate | null>(null);
  const [sendPhone, setSendPhone] = useState('');
  const [sendParams, setSendParams] = useState<{ [key: string]: string }>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clientComboboxOpen, setClientComboboxOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [sendMode, setSendMode] = useState<'client' | 'manual'>('client');

  // New template form state
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    category: 'UTILITY' as 'UTILITY' | 'MARKETING' | 'AUTHENTICATION',
    language: 'pt_BR',
    headerText: '',
    bodyText: '',
    footerText: '',
    buttons: [] as { type: 'QUICK_REPLY'; text: string }[],
  });

  // Fetch templates from Meta API
  const { data: templates = [], isLoading, isError, error } = useQuery<MetaTemplate[]>({
    queryKey: ['/api/company/meta-templates', statusFilter],
    queryFn: async () => {
      const url = statusFilter && statusFilter !== 'all'
        ? `/api/company/meta-templates?status=${statusFilter}`
        : '/api/company/meta-templates';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao carregar templates');
      }
      return response.json();
    },
  });

  // Fetch clients for combobox
  const { data: clients = [] } = useQuery<{ id: number; name: string; phone: string | null; email: string | null }[]>({
    queryKey: ['/api/company/clients'],
  });

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newTemplate) => {
      const components: any[] = [];

      if (data.headerText.trim()) {
        components.push({
          type: 'HEADER',
          format: 'TEXT',
          text: data.headerText,
        });
      }

      components.push({
        type: 'BODY',
        text: data.bodyText,
      });

      if (data.footerText.trim()) {
        components.push({
          type: 'FOOTER',
          text: data.footerText,
        });
      }

      if (data.buttons.length > 0) {
        components.push({
          type: 'BUTTONS',
          buttons: data.buttons.map((btn) => ({
            type: btn.type,
            text: btn.text,
          })),
        });
      }

      const response = await fetch('/api/company/meta-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: data.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
          category: data.category,
          language: data.language,
          components,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao criar template');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/meta-templates'] });
      toast({ title: 'Template criado', description: 'O template foi enviado para aprovacao da Meta.' });
      setNewTemplate({ name: '', category: 'UTILITY', language: 'pt_BR', headerText: '', bodyText: '', footerText: '', buttons: [] });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar template', description: error.message, variant: 'destructive' });
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (templateName: string) => {
      const response = await fetch(`/api/company/meta-templates/${templateName}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao deletar template');
      }
      return response.json();
    },
    onSuccess: (_, templateName) => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/meta-templates'] });
      toast({ title: 'Template deletado', description: `Template "${templateName}" removido com sucesso.` });
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao deletar', description: error.message, variant: 'destructive' });
    },
  });

  // Send template mutation
  const sendMutation = useMutation({
    mutationFn: async (data: { templateName: string; to: string; languageCode: string; components?: any[] }) => {
      const response = await fetch('/api/company/meta-templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao enviar template');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Mensagem enviada', description: data.message });
      setSendDialogOpen(false);
      setSendPhone('');
      setSendParams({});
      setSelectedTemplate(null);
      setSelectedClientId(null);
      setSendMode('client');
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case 'APPROVED':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'REJECTED':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
      case 'PAUSED':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><AlertTriangle className="h-3 w-3 mr-1" />Pausado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category.toUpperCase()) {
      case 'UTILITY':
        return <Badge variant="outline" className="border-blue-300 text-blue-700">Utilidade</Badge>;
      case 'MARKETING':
        return <Badge variant="outline" className="border-purple-300 text-purple-700">Marketing</Badge>;
      case 'AUTHENTICATION':
        return <Badge variant="outline" className="border-gray-300 text-gray-700">Autenticacao</Badge>;
      default:
        return <Badge variant="outline">{category}</Badge>;
    }
  };

  const getTemplateBodyText = (template: MetaTemplate): string => {
    const bodyComponent = template.components?.find(c => c.type === 'BODY');
    return bodyComponent?.text || '';
  };

  const getTemplateHeaderText = (template: MetaTemplate): string => {
    const headerComponent = template.components?.find(c => c.type === 'HEADER');
    return headerComponent?.text || '';
  };

  const getTemplateFooterText = (template: MetaTemplate): string => {
    const footerComponent = template.components?.find(c => c.type === 'FOOTER');
    return footerComponent?.text || '';
  };

  // Extract {{1}}, {{2}} etc. variable placeholders from body and header
  const extractVariables = (template: MetaTemplate): string[] => {
    const body = getTemplateBodyText(template);
    const header = getTemplateHeaderText(template);
    const allText = `${header} ${body}`;
    const matches = allText.match(/\{\{\d+\}\}/g);
    return matches ? [...new Set(matches)].sort() : [];
  };

  const getVariableLabel = (variable: string): string => {
    return VARIABLE_LABELS[variable] || `Variavel ${variable}`;
  };

  const handleSendTemplate = () => {
    if (!selectedTemplate || !sendPhone.trim()) return;

    const variables = extractVariables(selectedTemplate);
    const bodyComponents: any[] = [];

    if (variables.length > 0) {
      const parameters = variables.map((v) => ({
        type: 'text' as const,
        text: sendParams[v] || v,
      }));
      bodyComponents.push({
        type: 'body',
        parameters,
      });
    }

    sendMutation.mutate({
      templateName: selectedTemplate.name,
      to: sendPhone,
      languageCode: selectedTemplate.language || 'pt_BR',
      components: bodyComponents.length > 0 ? bodyComponents : undefined,
    });
  };

  const filteredTemplates = templates.filter((t: MetaTemplate) => {
    if (searchTerm) {
      return t.name.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight ml-16 sm:ml-0">Templates de Mensagens</h1>
          <p className="text-muted-foreground">
            Crie, gerencie e envie templates de mensagem via WhatsApp com variaveis personalizadas
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/company/meta-templates'] })}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Sincronizar
        </Button>
      </div>

      <Tabs defaultValue="templates" className="space-y-4">
        <TabsList>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Meus Templates
          </TabsTrigger>
          <TabsTrigger value="create" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Criar Template
          </TabsTrigger>
          <TabsTrigger value="variables" className="flex items-center gap-2">
            <Variable className="h-4 w-4" />
            Variaveis
          </TabsTrigger>
        </TabsList>

        {/* Tab: Lista de Templates */}
        <TabsContent value="templates" className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Selecione um template aprovado e clique em <strong>"Enviar"</strong> para enviar manualmente a mensagem para um cliente, preenchendo as variaveis na hora do envio.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar template pelo nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="APPROVED">Aprovados</SelectItem>
                <SelectItem value="PENDING">Pendentes</SelectItem>
                <SelectItem value="REJECTED">Rejeitados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Carregando templates da Meta...
            </div>
          ) : isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {(error as Error)?.message || 'Erro ao carregar templates. Verifique se a instancia WhatsApp esta configurada.'}
              </AlertDescription>
            </Alert>
          ) : filteredTemplates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-lg font-medium">Nenhum template encontrado</p>
                <p className="text-sm">Crie seu primeiro template na aba "Criar Template"</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredTemplates.map((template: MetaTemplate) => {
                const bodyText = getTemplateBodyText(template);
                const headerText = getTemplateHeaderText(template);
                const footerText = getTemplateFooterText(template);
                const variables = extractVariables(template);
                const isApproved = template.status?.toUpperCase() === 'APPROVED';

                return (
                  <Card key={template.id} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            {template.name}
                          </CardTitle>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusBadge(template.status)}
                            {getCategoryBadge(template.category)}
                            <Badge variant="outline" className="text-xs">{template.language}</Badge>
                            {variables.length > 0 && (
                              <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-700">
                                {variables.length} {variables.length === 1 ? 'variavel' : 'variaveis'}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isApproved && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedTemplate(template);
                                setSendParams({});
                                setSendPhone('');
                                setSelectedClientId(null);
                                setSendMode('client');
                                setSendDialogOpen(true);
                              }}
                              className="flex items-center gap-1"
                            >
                              <Send className="h-3 w-3" />
                              Enviar
                            </Button>
                          )}
                          {deleteConfirm === template.name ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteMutation.mutate(template.name)}
                                disabled={deleteMutation.isPending}
                              >
                                Confirmar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeleteConfirm(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteConfirm(template.name)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-muted rounded-lg p-4 space-y-2">
                        {headerText && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Cabecalho</span>
                            <p className="font-medium">{headerText}</p>
                          </div>
                        )}
                        {bodyText && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Corpo</span>
                            <p className="whitespace-pre-wrap text-sm">{bodyText}</p>
                          </div>
                        )}
                        {footerText && (
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground uppercase">Rodape</span>
                            <p className="text-xs text-muted-foreground">{footerText}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab: Criar Template */}
        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Criar Novo Template
              </CardTitle>
              <CardDescription>
                Preencha os campos abaixo para submeter um novo template para aprovacao da Meta.
                A aprovacao leva geralmente de 24 a 48 horas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Nome do Template *</Label>
                  <Input
                    id="template-name"
                    placeholder="ex: confirmacao_agendamento"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Apenas letras minusculas, numeros e underscores
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-category">Categoria *</Label>
                  <Select
                    value={newTemplate.category}
                    onValueChange={(value) => setNewTemplate(prev => ({ ...prev, category: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTILITY">Utilidade (confirmacoes, lembretes)</SelectItem>
                      <SelectItem value="MARKETING">Marketing (campanhas, promocoes)</SelectItem>
                      <SelectItem value="AUTHENTICATION">Autenticacao (codigos OTP)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-language">Idioma *</Label>
                  <Select
                    value={newTemplate.language}
                    onValueChange={(value) => setNewTemplate(prev => ({ ...prev, language: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt_BR">Portugues (Brasil)</SelectItem>
                      <SelectItem value="en_US">English (US)</SelectItem>
                      <SelectItem value="es">Espanol</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="template-header">Cabecalho (opcional)</Label>
                <Input
                  id="template-header"
                  placeholder="ex: Confirmacao de Agendamento"
                  value={newTemplate.headerText}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, headerText: e.target.value }))}
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground">Maximo 60 caracteres</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-body">Corpo da Mensagem *</Label>
                <Textarea
                  id="template-body"
                  placeholder={`ex: Ola {{1}}! Seu agendamento esta confirmado:\n\nData: {{2}}\nHorario: {{3}}\n\nAguardamos voce!`}
                  value={newTemplate.bodyText}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, bodyText: e.target.value }))}
                  rows={8}
                  maxLength={1024}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <p>Use {'{{1}}'}, {'{{2}}'}, {'{{3}}'} etc. para variaveis dinamicas — veja a aba "Variaveis" para mais detalhes</p>
                  <p>{newTemplate.bodyText.length}/1024</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="template-footer">Rodape (opcional)</Label>
                <Input
                  id="template-footer"
                  placeholder="ex: Enviado pelo sistema"
                  value={newTemplate.footerText}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, footerText: e.target.value }))}
                  maxLength={60}
                />
                <p className="text-xs text-muted-foreground">Maximo 60 caracteres</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Botoes Quick Reply (opcional)</Label>
                  {newTemplate.buttons.length < 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setNewTemplate(prev => ({
                        ...prev,
                        buttons: [...prev.buttons, { type: 'QUICK_REPLY', text: '' }],
                      }))}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar botao
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Maximo 3 botoes. O cliente pode clicar para responder rapidamente.</p>
                {newTemplate.buttons.map((btn, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder={`ex: ${index === 0 ? 'Confirmar' : index === 1 ? 'Reagendar' : 'Cancelar'}`}
                      value={btn.text}
                      onChange={(e) => {
                        const updated = [...newTemplate.buttons];
                        updated[index] = { ...updated[index], text: e.target.value };
                        setNewTemplate(prev => ({ ...prev, buttons: updated }));
                      }}
                      maxLength={25}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = newTemplate.buttons.filter((_, i) => i !== index);
                        setNewTemplate(prev => ({ ...prev, buttons: updated }));
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>

              {newTemplate.bodyText && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-sm font-semibold">Pre-visualizacao</Label>
                    <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-4 max-w-sm">
                      {newTemplate.headerText && (
                        <p className="font-bold text-sm mb-1">{newTemplate.headerText}</p>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{newTemplate.bodyText}</p>
                      {newTemplate.footerText && (
                        <p className="text-xs text-muted-foreground mt-2">{newTemplate.footerText}</p>
                      )}
                      {newTemplate.buttons.length > 0 && (
                        <div className="mt-3 border-t border-green-200 pt-2 space-y-1">
                          {newTemplate.buttons.map((btn, i) => (
                            <div key={i} className="text-center text-sm text-blue-600 py-1 border border-green-200 rounded bg-white">
                              {btn.text || `Botao ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Button
                onClick={() => createMutation.mutate(newTemplate)}
                disabled={createMutation.isPending || !newTemplate.name.trim() || !newTemplate.bodyText.trim()}
                className="w-full sm:w-auto"
              >
                {createMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Submeter Template para Aprovacao
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p><strong>Dicas para aprovacao rapida:</strong></p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Use a categoria correta (UTILITY para servicos, MARKETING para promocoes)</li>
                <li>Nao inclua conteudo ofensivo ou enganoso</li>
                <li>Templates de UTILITY tem menor custo por conversa</li>
                <li>Variaveis (<code>{'{{1}}'}</code>) permitem personalizar cada envio</li>
                <li>O nome do template deve ser unico e usar apenas letras minusculas e underscores</li>
              </ul>
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* Tab: Variaveis */}
        <TabsContent value="variables" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Variable className="h-5 w-5" />
                Guia de Variaveis
              </CardTitle>
              <CardDescription>
                Variaveis permitem personalizar cada mensagem no momento do envio.
                Ao enviar um template, voce preenche o valor de cada variavel manualmente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Como funciona:</strong> Ao criar um template, insira variaveis como <code className="bg-blue-100 px-1 rounded">{'{{1}}'}</code>, <code className="bg-blue-100 px-1 rounded">{'{{2}}'}</code>, etc. no corpo da mensagem.
                  Na hora de enviar, voce preenchera cada variavel com o valor desejado (ex: nome do cliente, data, horario).
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Sugestoes de uso para variaveis</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(VARIABLE_LABELS).map(([variable, label]) => (
                    <div key={variable} className="flex items-center gap-3 p-3 border rounded-lg">
                      <code className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-mono text-sm font-bold min-w-[50px] text-center">
                        {variable}
                      </code>
                      <span className="text-sm text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Estas sao apenas sugestoes. Voce pode usar as variaveis para qualquer finalidade — o valor e definido por voce na hora do envio.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Exemplo de template</h3>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md">
                  <p className="font-bold text-sm mb-1">Confirmacao de Agendamento</p>
                  <p className="text-sm whitespace-pre-wrap">
                    Ola <span className="bg-emerald-200 px-1 rounded">{'{{1}}'}</span>! Seu agendamento esta confirmado.{'\n\n'}Data: <span className="bg-emerald-200 px-1 rounded">{'{{2}}'}</span>{'\n'}Horario: <span className="bg-emerald-200 px-1 rounded">{'{{3}}'}</span>{'\n\n'}Aguardamos voce!
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ao enviar este template, voce preenchera: <code>{'{{1}}'}</code> = Nome do cliente, <code>{'{{2}}'}</code> = Data, <code>{'{{3}}'}</code> = Horario.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Dialog: Enviar Template */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Enviar Template
            </DialogTitle>
            <DialogDescription>
              Preencha as variaveis e envie o template <strong>{selectedTemplate?.name}</strong> para um cliente via WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Destinatario *</Label>
              <div className="flex gap-2 mb-2">
                <Button
                  type="button"
                  variant={sendMode === 'client' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSendMode('client')}
                >
                  <User className="h-4 w-4 mr-1" />
                  Buscar cliente
                </Button>
                <Button
                  type="button"
                  variant={sendMode === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSendMode('manual');
                    setSelectedClientId(null);
                  }}
                >
                  Digitar numero
                </Button>
              </div>

              {sendMode === 'client' ? (
                <div className="space-y-2">
                  <Popover open={clientComboboxOpen} onOpenChange={setClientComboboxOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={clientComboboxOpen}
                        className="w-full justify-between font-normal"
                      >
                        {selectedClientId
                          ? clients.find(c => c.id === selectedClientId)?.name || "Selecione um cliente"
                          : "Selecione um cliente"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar cliente..." />
                        <CommandList>
                          <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                          <CommandGroup>
                            {clients.map((client) => (
                              <CommandItem
                                key={client.id}
                                value={`${client.name} ${client.phone || ''}`}
                                onSelect={() => {
                                  setSelectedClientId(client.id);
                                  setSendPhone(client.phone?.replace(/\D/g, '') || '');
                                  // Auto-preencher {{1}} com nome do cliente
                                  if (client.name) {
                                    setSendParams(prev => ({ ...prev, '{{1}}': client.name }));
                                  }
                                  setClientComboboxOpen(false);
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${selectedClientId === client.id ? "opacity-100" : "opacity-0"}`}
                                />
                                <div className="flex flex-col">
                                  <span>{client.name}</span>
                                  {client.phone && (
                                    <span className="text-xs text-muted-foreground">{client.phone}</span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {selectedClientId && (
                    <p className="text-xs text-muted-foreground">
                      Numero: {sendPhone || 'Cliente sem telefone cadastrado'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    id="send-phone"
                    placeholder="ex: 11999999999"
                    value={sendPhone}
                    onChange={(e) => setSendPhone(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    DDD + numero (o codigo do pais 55 sera adicionado automaticamente)
                  </p>
                </div>
              )}
            </div>

            {selectedTemplate && extractVariables(selectedTemplate).length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label className="font-semibold">Preencha as variaveis do template</Label>
                  {extractVariables(selectedTemplate).map((variable) => (
                    <div key={variable} className="space-y-1">
                      <Label htmlFor={`param-${variable}`} className="text-sm flex items-center gap-2">
                        <code className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono text-xs">
                          {variable}
                        </code>
                        <span className="text-muted-foreground">— {getVariableLabel(variable)}</span>
                      </Label>
                      <Input
                        id={`param-${variable}`}
                        placeholder={getVariableLabel(variable)}
                        value={sendParams[variable] || ''}
                        onChange={(e) => setSendParams(prev => ({ ...prev, [variable]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {selectedTemplate && (
              <>
                <Separator />
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground">Pre-visualizacao da mensagem</Label>
                  <div className="mt-1 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                    {getTemplateHeaderText(selectedTemplate) && (
                      <p className="font-bold mb-1">{getTemplateHeaderText(selectedTemplate)}</p>
                    )}
                    <p className="whitespace-pre-wrap">
                      {(() => {
                        let body = getTemplateBodyText(selectedTemplate);
                        Object.entries(sendParams).forEach(([key, value]) => {
                          if (value) body = body.replaceAll(key, value);
                        });
                        return body;
                      })()}
                    </p>
                    {getTemplateFooterText(selectedTemplate) && (
                      <p className="text-xs text-muted-foreground mt-2">{getTemplateFooterText(selectedTemplate)}</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendTemplate}
              disabled={sendMutation.isPending || !sendPhone.trim()}
            >
              {sendMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Enviar Mensagem
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FloatingHelpButton menuLocation="templates" />
    </div>
  );
}
