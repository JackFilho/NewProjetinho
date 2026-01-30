import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { FloatingHelpButton } from "@/components/floating-help-button";
import { queryClient } from '@/lib/queryClient';
import { MessageSquare, Plus, Clock, CheckCircle, XCircle, AlertCircle, Upload, X, Send, MessageCircle } from 'lucide-react';

interface SupportTicket {
  id: number;
  companyId: number;
  typeId?: number;
  statusId?: number;
  title: string;
  description: string;
  status: string;
  statusColor?: string;
  priority: string;
  category: string;
  adminResponse?: string;
  attachments?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

interface SupportTicketComment {
  id: number;
  comment: string;
  created_at: string;
}

interface SupportTicketType {
  id: number;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function CompanySupport() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [ticketForm, setTicketForm] = useState({
    title: '',
    description: '',
    typeId: '',
    attachments: []
  });
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  // Fetch company support tickets
  const { data: tickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ['/api/company/support-tickets'],
  });

  // Fetch support ticket types
  const { data: ticketTypes = [], isLoading: typesLoading } = useQuery({
    queryKey: ['/api/company/support-ticket-types'],
  });

  // Fetch public settings to get support WhatsApp
  const { data: publicSettings } = useQuery({
    queryKey: ['/api/company/public-settings'],
  });

  // Mutation for adding additional info to ticket
  const addInfoMutation = useMutation({
    mutationFn: async (data: { ticketId: number; additionalInfo: string }) => {
      const response = await fetch(`/api/company/support-tickets/${data.ticketId}/add-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalInfo: data.additionalInfo }),
      });
      if (!response.ok) throw new Error('Erro ao adicionar informação');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/support-tickets'] });
      toast({
        title: "Informação adicionada",
        description: "Suas informações adicionais foram salvas com sucesso.",
      });
      setAdditionalInfo('');
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar as informações.",
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const validFiles = Array.from(files).filter(file => {
        const isValidType = file.type.startsWith('image/');
        const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB limit
        
        if (!isValidType) {
          toast({
            title: "Erro",
            description: "Apenas imagens são permitidas.",
            variant: "destructive",
          });
          return false;
        }
        
        if (!isValidSize) {
          toast({
            title: "Erro",
            description: "Imagem deve ter no máximo 5MB.",
            variant: "destructive",
          });
          return false;
        }
        
        return true;
      });
      
      setImageFiles(prev => [...prev, ...validFiles].slice(0, 3)); // Max 3 images
    }
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Create ticket mutation
  const createTicketMutation = useMutation({
    mutationFn: (data: any) => {
      const formData = new FormData();
      formData.append('title', data.title);
      formData.append('description', data.description);
      formData.append('typeId', data.typeId);
      
      imageFiles.forEach((file) => {
        formData.append('images', file);
      });

      return fetch('/api/company/support-tickets', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      }).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company/support-tickets'] });
      setIsCreateDialogOpen(false);
      setTicketForm({
        title: '',
        description: '',
        typeId: '',
        attachments: []
      });
      setImageFiles([]);
      toast({
        title: "Sucesso",
        description: "Ticket criado com sucesso!",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao criar ticket.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTicketMutation.mutate(ticketForm);
  };

  const getStatusBadge = (status: string, statusColor?: string) => {
    // Use the dynamic color from the database if available
    const colorStyle = statusColor ? { backgroundColor: statusColor, color: '#fff' } : {};
    
    return (
      <Badge 
        className={statusColor ? 'text-white' : 'bg-blue-100 text-blue-800'}
        style={colorStyle}
      >
        {status || 'Aberto'}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const priorityConfig = {
      low: { color: 'bg-green-100 text-green-800', label: 'Baixa' },
      medium: { color: 'bg-yellow-100 text-yellow-800', label: 'Média' },
      high: { color: 'bg-red-100 text-red-800', label: 'Alta' },
      urgent: { color: 'bg-red-200 text-red-900', label: 'Urgente' },
    };
    
    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.medium;
    
    return (
      <Badge className={config.color}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 ml-16 sm:ml-0">
          <MessageSquare className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Suporte</h1>
        </div>

        <div className="flex items-center gap-2">
          {publicSettings?.supportWhatsapp && (
            <Button
              variant="outline"
              className="flex items-center gap-2 text-green-600 border-green-600 hover:bg-green-50"
              onClick={() => {
                const whatsappUrl = `https://wa.me/${publicSettings.supportWhatsapp}`;
                window.open(whatsappUrl, '_blank');
              }}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </Button>
          )}

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Novo Ticket
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Ticket</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Assunto *</Label>
                  <Input
                    id="title"
                    value={ticketForm.title}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, title: e.target.value }))}
                    required
                    placeholder="Assunto do ticket"
                  />
                </div>
                <div>
                  <Label htmlFor="typeId">Tipo de Ticket</Label>
                  <Select onValueChange={(value) => setTicketForm(prev => ({ ...prev, typeId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {(ticketTypes as SupportTicketType[]).map((type: SupportTicketType) => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="description">Descrição *</Label>
                <Textarea
                  id="description"
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, description: e.target.value }))}
                  required
                  placeholder="Descreva detalhadamente o problema ou solicitação"
                  rows={6}
                />
              </div>

              <div>
                <Label htmlFor="images">Imagens (opcional)</Label>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      id="images"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('images')?.click()}
                      className="flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Adicionar Imagem
                    </Button>
                    <span className="text-sm text-gray-500">
                      Máximo 3 imagens, até 5MB cada
                    </span>
                  </div>
                  
                  {imageFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {imageFiles.map((file, index) => (
                        <div key={index} className="relative">
                          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
                            <span className="text-sm truncate max-w-[150px]">
                              {file.name}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeImage(index)}
                              className="h-5 w-5 p-0 hover:bg-red-100"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createTicketMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Criar Ticket
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meus Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {ticketsLoading ? (
            <div className="text-center py-8">Carregando tickets...</div>
          ) : (
            <div className="space-y-4">
              {(tickets as SupportTicket[]).map((ticket: SupportTicket) => (
                <div
                  key={ticket.id}
                  className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-lg">{ticket.title}</h3>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(ticket.status, ticket.statusColor)}
                    </div>
                  </div>
                  <p className="text-gray-600 text-sm mb-2 line-clamp-2">{ticket.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Categoria: {ticket.category}</span>
                    <span>Criado em: {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              ))}
              
              {tickets.length === 0 && (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-600 mb-2">Nenhum ticket encontrado</h3>
                  <p className="text-gray-500">Crie seu primeiro ticket de suporte clicando no botão "Novo Ticket"</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Ticket #{selectedTicket.id} - {selectedTicket.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                {getStatusBadge(selectedTicket.status, selectedTicket.statusColor)}
                <span className="text-sm text-gray-500">
                  Criado em: {new Date(selectedTicket.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
              
              <div>
                <Label className="text-sm font-semibold">Categoria</Label>
                <p className="text-sm mt-1">{selectedTicket.category}</p>
              </div>
              
              <div>
                <Label className="text-sm font-semibold">Descrição</Label>
                <div className="mt-1 p-3 bg-gray-50 rounded border">
                  <p className="text-sm whitespace-pre-wrap">{selectedTicket.description}</p>
                </div>
              </div>
              
              {/* Display attached images */}
              {selectedTicket.attachments && (
                <div>
                  <Label className="text-sm font-semibold">Imagens Anexadas</Label>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-4">
                    {selectedTicket.attachments.split(',').map((filename, index) => {
                      const imageUrl = `/uploads/support-tickets/${filename.trim()}`;
                      return (
                        <div key={index} className="border rounded-lg overflow-hidden">
                          <img
                            src={imageUrl}
                            alt={`Anexo ${index + 1}`}
                            className="w-full h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => window.open(imageUrl, '_blank')}
                            onError={(e) => {
                              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDkuNVYxOC41QzIxIDE5LjYwNDYgMjAuMTA0NiAyMC41IDE5IDIwLjVINUMzLjg5NTQzIDIwLjUgMyAxOS42MDQ2IDMgMTguNVY5LjVNMjEgOS41VjZDMjEgNC44OTU0MyAyMC4xMDQ2IDQgMTkgNEg1QzMuODk1NDMgNCAzIDQuODk1NDMgMyA2VjkuNU0yMSA5LjVMMTMuNSAxNS41TDEwIDEyTDMgMTkuNSIgc3Ryb2tlPSIjOTk5IiBzdHJva2Utd2lkdGg9IjIiIGZpbGw9Im5vbmUiLz4KPHN2Zz4=';
                            }}
                          />
                          <div className="p-2 bg-gray-50 text-xs text-gray-600 truncate">
                            {filename.trim()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {selectedTicket.adminResponse && (
                <div>
                  <Label className="text-sm font-semibold">Resposta do Suporte</Label>
                  <div className="mt-1 p-3 bg-blue-50 rounded border">
                    <p className="text-sm whitespace-pre-wrap">{selectedTicket.adminResponse}</p>
                  </div>
                </div>
              )}
              
              {selectedTicket.resolvedAt && (
                <div>
                  <Label className="text-sm font-semibold">Resolvido em</Label>
                  <p className="text-sm mt-1">{new Date(selectedTicket.resolvedAt).toLocaleDateString('pt-BR')}</p>
                </div>
              )}
              
              {/* Additional information section */}
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold">Adicionar Informações</Label>
                <div className="mt-2 space-y-3">
                  <Textarea
                    placeholder="Digite informações adicionais sobre este ticket..."
                    value={additionalInfo}
                    onChange={(e) => setAdditionalInfo(e.target.value)}
                    className="min-h-[100px]"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => {
                        if (selectedTicket && additionalInfo.trim()) {
                          addInfoMutation.mutate({
                            ticketId: selectedTicket.id,
                            additionalInfo: additionalInfo
                          });
                        }
                      }}
                      disabled={!additionalInfo.trim() || addInfoMutation.isPending}
                      className="flex items-center gap-2"
                    >
                      <Send className="h-4 w-4" />
                      {addInfoMutation.isPending ? "Enviando..." : "Enviar Informação"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <FloatingHelpButton menuLocation="support" />
    </div>
  );
}