import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Video, Plus, Pencil, Trash2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { TrainingVideo } from "@shared/schema";
import { FloatingHelpButton } from "@/components/floating-help-button";

const menuOptions = [
  // Páginas da Empresa
  { value: "dashboard", label: "Dashboard" },
  { value: "appointments", label: "Agendamentos" },
  { value: "services", label: "Serviços" },
  { value: "professionals", label: "Profissionais" },
  { value: "clients", label: "Clientes" },
  { value: "reminders", label: "Lembretes" },
  { value: "reviews", label: "Avaliações" },
  { value: "tasks", label: "Tarefas" },
  { value: "points-program", label: "Programa de Pontos" },
  { value: "loyalty", label: "Fidelidade" },
  { value: "inventory", label: "Estoque" },
  { value: "messages", label: "Mensagens" },
  { value: "coupons", label: "Cupons" },
  { value: "financial", label: "Financeiro" },
  { value: "reports", label: "Relatórios" },
  { value: "settings", label: "Configurações" },
  { value: "support", label: "Suporte" },
  { value: "subscription", label: "Assinatura" },
  // Páginas do Admin
  { value: "admin-dashboard", label: "Admin - Dashboard" },
  { value: "admin-companies", label: "Admin - Empresas" },
  { value: "admin-plans", label: "Admin - Planos" },
  { value: "admin-status", label: "Admin - Status" },
  { value: "admin-settings", label: "Admin - Configurações" },
  { value: "admin-admins", label: "Admin - Administradores" },
  { value: "admin-alerts", label: "Admin - Alertas" },
  { value: "admin-coupons", label: "Admin - Cupons" },
  { value: "admin-subscriptions", label: "Admin - Assinaturas" },
  { value: "admin-support", label: "Admin - Suporte" },
  { value: "admin-affiliates", label: "Admin - Afiliados" },
  { value: "admin-training-videos", label: "Admin - Vídeos de Treinamento" },
  { value: "admin-plan-embed", label: "Admin - Embed de Planos" },
  { value: "admin-analytics", label: "Admin - Analytics" },
  { value: "admin-test-subscription", label: "Admin - Teste de Assinatura" },
];

export default function AdminTrainingVideos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<TrainingVideo | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const [formData, setFormData] = useState({
    name: "",
    youtubeUrl: "",
    description: "",
    menuLocation: "",
  });

  const { data: videos = [], isLoading } = useQuery<TrainingVideo[]>({
    queryKey: ["/api/admin/training-videos"],
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      apiRequest("/api/admin/training-videos", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/training-videos"] });
      toast({ title: "Vídeo criado com sucesso!" });
      handleCloseModal();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar vídeo",
        description: error?.message || "Erro desconhecido",
        variant: "destructive"
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof formData }) =>
      apiRequest(`/api/admin/training-videos/${id}`, "PUT", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/training-videos"] });
      toast({ title: "Vídeo atualizado com sucesso!" });
      handleCloseModal();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar vídeo",
        description: error?.message || "Erro desconhecido",
        variant: "destructive"
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/admin/training-videos/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/training-videos"] });
      toast({ title: "Vídeo excluído com sucesso!" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao excluir vídeo",
        description: error?.message || "Erro desconhecido",
        variant: "destructive"
      });
    },
  });

  const handleOpenModal = (video?: TrainingVideo) => {
    if (video) {
      setEditingVideo(video);
      setFormData({
        name: video.name,
        youtubeUrl: video.youtubeUrl,
        description: video.description || "",
        menuLocation: video.menuLocation || "",
      });
    } else {
      setEditingVideo(null);
      setFormData({ name: "", youtubeUrl: "", description: "", menuLocation: "" });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingVideo(null);
    setFormData({ name: "", youtubeUrl: "", description: "", menuLocation: "" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingVideo) {
      updateMutation.mutate({ id: editingVideo.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Tem certeza que deseja excluir este vídeo?")) {
      deleteMutation.mutate(id);
    }
  };

  const getYouTubeEmbedUrl = (url: string) => {
    const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)?.[1];
    return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-6 w-6" />
                Vídeos de Treinamento
              </CardTitle>
              <CardDescription>
                Gerencie os vídeos de treinamento do YouTube
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Vídeo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {videos.length === 0 ? (
            <div className="text-center py-12">
              <Video className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">Nenhum vídeo cadastrado ainda</p>
              <Button onClick={() => handleOpenModal()} className="mt-4">
                Adicionar Primeiro Vídeo
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Menu</TableHead>
                  <TableHead>URL do YouTube</TableHead>
                  <TableHead>Data de Criação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videos.map((video) => (
                  <TableRow key={video.id}>
                    <TableCell className="font-medium">{video.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {menuOptions.find(m => m.value === video.menuLocation)?.label || video.menuLocation}
                      </span>
                    </TableCell>
                    <TableCell>
                      <a
                        href={video.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-sm"
                      >
                        {video.youtubeUrl.slice(0, 40)}...
                      </a>
                    </TableCell>
                    <TableCell>
                      {new Date(video.createdAt).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewUrl(video.youtubeUrl)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenModal(video)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(video.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingVideo ? "Editar Vídeo" : "Novo Vídeo"}
            </DialogTitle>
            <DialogDescription>
              Adicione as informações do vídeo do YouTube
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome do Vídeo *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Como configurar o sistema"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="youtubeUrl">URL do YouTube *</Label>
                <Input
                  id="youtubeUrl"
                  value={formData.youtubeUrl}
                  onChange={(e) => setFormData({ ...formData, youtubeUrl: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
                <p className="text-sm text-gray-500">
                  Cole a URL completa do vídeo do YouTube
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="menuLocation">Menu do Sistema *</Label>
                <Select
                  value={formData.menuLocation}
                  onValueChange={(value) => setFormData({ ...formData, menuLocation: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione onde o vídeo aparecerá" />
                  </SelectTrigger>
                  <SelectContent>
                    {menuOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500">
                  Escolha em qual menu do sistema o vídeo será exibido
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descreva o conteúdo do vídeo..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingVideo ? "Salvar Alterações" : "Criar Vídeo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl("")}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Preview do Vídeo</DialogTitle>
          </DialogHeader>
          <div className="aspect-video">
            {previewUrl && (
              <iframe
                src={getYouTubeEmbedUrl(previewUrl)}
                className="w-full h-full rounded-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <FloatingHelpButton menuLocation="admin-training-videos" />
    </div>
  );
}
