import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, User, Mail, Phone, Key, LogOut, Edit, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Professional {
  id: number;
  name: string;
  email: string;
  phone?: string;
}

export default function ProfessionalProfile() {
  const [, setLocation] = useLocation();
  const [professional, setProfessional] = useState<Professional | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const { toast } = useToast();

  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  // Check authentication
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/professional/status");
        const data = await response.json();

        if (data.isAuthenticated) {
          setProfessional(data.professional);
          setEditForm({
            name: data.professional.name,
            email: data.professional.email,
            phone: data.professional.phone || "",
          });
        } else {
          setLocation("/profissional/login");
        }
      } catch (error) {
        setLocation("/profissional/login");
      }
    };

    checkAuth();
  }, [setLocation]);

  const handleSaveInfo = async () => {
    if (!editForm.name.trim() || !editForm.email.trim()) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }

    // Simulate API call
    toast({
      title: "Informações atualizadas!",
      description: "Suas informações foram salvas com sucesso.",
    });

    setProfessional((prev) =>
      prev ? { ...prev, name: editForm.name, email: editForm.email, phone: editForm.phone } : null
    );
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (professional) {
      setEditForm({
        name: professional.name,
        email: professional.email,
        phone: professional.phone || "",
      });
    }
    setIsEditing(false);
  };

  const handleChangePassword = () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast({
        title: "Erro",
        description: "Por favor, preencha todos os campos de senha",
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast({
        title: "Erro",
        description: "A nova senha deve ter pelo menos 6 caracteres",
        variant: "destructive",
      });
      return;
    }

    // Simulate API call
    toast({
      title: "Senha atualizada!",
      description: "Sua senha foi alterada com sucesso.",
    });

    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setShowPasswordSection(false);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/professional/logout", { method: "POST" });
      toast({ title: "Logout realizado com sucesso" });
      setLocation("/profissional/login");
    } catch (error) {
      toast({ title: "Erro ao fazer logout", variant: "destructive" });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  if (!professional) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200/60">
        <div className="flex items-center justify-between px-4 h-14" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <button
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setLocation("/profissional/dashboard")}
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold truncate flex-1 text-center px-4">Perfil</h1>
          <div className="w-[44px]" />
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-14 pb-6 px-4" style={{ paddingBottom: "env(safe-area-inset-bottom, 24px)" }}>
        {/* Profile Header */}
        <div className="flex flex-col items-center text-center py-8 px-4">
          <div className="w-24 h-24 rounded-full bg-blue-500 text-white flex items-center justify-center text-2xl font-bold mb-4 shadow-lg">
            {getInitials(professional.name)}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{professional.name}</h2>
          <p className="text-gray-600 text-sm">{professional.email}</p>
        </div>

        {/* Personal Information Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Informações Pessoais</h3>
            {!isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="text-blue-500 hover:text-blue-600"
              >
                <Edit className="w-4 h-4 mr-1" />
                Editar
              </Button>
            )}
          </div>

          {!isEditing ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 py-3 border-b border-gray-200 last:border-b-0">
                <User className="w-5 h-5 text-blue-500" />
                <div className="flex-1">
                  <div className="text-sm text-gray-600">Nome</div>
                  <div className="font-medium text-gray-900">{professional.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 py-3 border-b border-gray-200 last:border-b-0">
                <Mail className="w-5 h-5 text-blue-500" />
                <div className="flex-1">
                  <div className="text-sm text-gray-600">Email</div>
                  <div className="font-medium text-gray-900">{professional.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 py-3 border-b border-gray-200 last:border-b-0">
                <Phone className="w-5 h-5 text-blue-500" />
                <div className="flex-1">
                  <div className="text-sm text-gray-600">Telefone</div>
                  <div className="font-medium text-gray-900">{professional.phone || "Não informado"}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-500" />
                  Nome
                </Label>
                <Input
                  id="name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Seu nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-500" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="seu@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-500" />
                  Telefone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button onClick={handleSaveInfo} className="flex-1 bg-blue-500 hover:bg-blue-600">
                  <Check className="w-4 h-4 mr-1" />
                  Salvar
                </Button>
                <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
                  <X className="w-4 h-4 mr-1" />
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Security Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Segurança da Conta</h3>

          <button
            onClick={() => setShowPasswordSection(!showPasswordSection)}
            className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-blue-500" />
              <span className="font-medium text-gray-900">Alterar Senha</span>
            </div>
            <span className="text-gray-400">{showPasswordSection ? "▲" : "▼"}</span>
          </button>

          {showPasswordSection && (
            <div className="mt-4 space-y-4 p-4 bg-gray-50 rounded-lg">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Senha Atual</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder="Digite sua senha atual"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="Digite a nova senha"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="Confirme a nova senha"
                />
              </div>
              <Button onClick={handleChangePassword} className="w-full bg-blue-500 hover:bg-blue-600">
                <Check className="w-4 h-4 mr-2" />
                Atualizar Senha
              </Button>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <div className="px-4">
          <Button
            variant="outline"
            onClick={() => setShowLogoutDialog(true)}
            className="w-full text-red-600 border-red-600 hover:bg-red-50"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Sair
          </Button>
        </div>
      </div>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Saída</DialogTitle>
            <DialogDescription>Tem certeza de que deseja sair da sua conta?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowLogoutDialog(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleLogout} className="flex-1 bg-red-600 hover:bg-red-700">
              Sair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
