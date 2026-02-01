import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { useLocation } from "wouter";
import { Eye, EyeOff } from "lucide-react";

const companyLoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

type CompanyLoginFormData = z.infer<typeof companyLoginSchema>;
type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function CompanyLogin() {
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string>("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [isSubscriptionSuspended, setIsSubscriptionSuspended] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Busca configurações públicas para obter a logo e cores
  const { data: settings } = useQuery({
    queryKey: ["/api/public-settings"],
    retry: false,
  });
  
  // Define o título da página
  useDocumentTitle();

  // Aplica cores da configuração pública
  useEffect(() => {
    if (settings?.primaryColor) {
      const root = document.documentElement;
      
      const hexToHsl = (hex: string) => {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
          h = s = 0;
        } else {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
            default: h = 0;
          }
          h /= 6;
        }

        return `${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
      };

      const primaryHsl = hexToHsl(settings.primaryColor);
      root.style.setProperty('--primary', `hsl(${primaryHsl})`);
      root.style.setProperty('--ring', `hsl(${primaryHsl})`);
      
      // Criar versão clara para accent
      if (primaryHsl) {
        const parts = primaryHsl.split(',');
        if (parts.length >= 2) {
          const [h, s] = parts;
          root.style.setProperty('--accent', `hsl(${h}, ${s}, 96%)`);
          root.style.setProperty('--accent-foreground', `hsl(${primaryHsl})`);
        }
      }
    }
  }, [settings]);
  


  const form = useForm<CompanyLoginFormData>({
    resolver: zodResolver(companyLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const forgotPasswordForm = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: CompanyLoginFormData) => {
      const response = await apiRequest("/api/company/auth/login", "POST", data);
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "Login realizado",
        description: "Bem-vindo ao painel da empresa!",
      });
      setLocation("/dashboard");
    },
    onError: (error: any) => {

      let errorMessage = "Email ou senha errada";
      let errorTitle = "Erro no login";

      // Verificar se a assinatura foi cancelada - redirecionar para página de planos
      if (error.status === 403) {
        toast({
          title: "Assinatura Cancelada",
          description: "Sua assinatura foi cancelada. Redirecionando para escolher um novo plano...",
          variant: "destructive",
        });
        // Redirecionar imediatamente para a página de assinatura da empresa
        setTimeout(() => {
          setLocation("/company/assinatura");
        }, 1500);
        return;
      }

      // Verificar se é erro de assinatura suspensa
      if (error.status === 402) {
        errorMessage = "ASSINATURA SUSPENSA, ENTRE EM CONTATO COM O SUPORTE";
        errorTitle = "Acesso Bloqueado";
        setIsSubscriptionSuspended(true);
      }

      setLoginError(errorMessage);
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordFormData) => {
      const response = await apiRequest("/api/auth/forgot-password", "POST", data);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Email enviado",
        description: "Se o email estiver registrado, você receberá instruções para redefinir sua senha.",
      });
      setShowForgotPassword(false);
      forgotPasswordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao enviar email de recuperação",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CompanyLoginFormData) => {
    setLoginError("");
    loginMutation.mutate(data);
  };

  const onForgotPasswordSubmit = (data: ForgotPasswordFormData) => {
    forgotPasswordMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 pb-16">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="pb-4">
            {settings?.logoUrl && (
              <div className="text-center mb-4">
                <img 
                  src={settings.logoUrl} 
                  alt="Logo" 
                  className="w-full h-32 object-contain mx-auto"
                />
              </div>
            )}
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Acesso da Empresa
              </h1>
              <p className="text-muted-foreground">
                {showForgotPassword ? "Recuperar Senha" : "Entre com suas credenciais"}
              </p>
            </div>
          </CardHeader>
          
          <CardContent>
            {loginError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{loginError}</AlertDescription>
              </Alert>
            )}

            {!showForgotPassword ? (
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...form.register("email")}
                    placeholder="Digite seu email"
                    disabled={loginMutation.isPending}
                    className="border-input focus:border-primary focus:ring-primary"
                  />
                  {form.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      {...form.register("password")}
                      placeholder="Digite sua senha"
                      disabled={loginMutation.isPending}
                      className="border-input focus:border-primary focus:ring-primary pr-12"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={loginMutation.isPending}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto text-primary hover:underline"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Esqueceu a senha?
                  </Button>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Entrando..." : "Entrar"}
                </Button>

                {isSubscriptionSuspended && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center">
                      <div className="h-px bg-border flex-1"></div>
                      <span className="px-2 text-xs text-muted-foreground">ou</span>
                      <div className="h-px bg-border flex-1"></div>
                    </div>
                    <Button 
                      type="button" 
                      variant="outline"
                      className="w-full border-orange-500 text-orange-600 hover:bg-orange-50"
                      onClick={() => setLocation("/empresa/assinatura")}
                    >
                      Renovar Assinatura
                    </Button>
                  </div>
                )}
              </form>
            ) : (
              <form onSubmit={forgotPasswordForm.handleSubmit(onForgotPasswordSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    {...forgotPasswordForm.register("email")}
                    placeholder="Digite seu email para recuperação"
                    disabled={forgotPasswordMutation.isPending}
                    className="border-input focus:border-primary focus:ring-primary"
                  />
                  {forgotPasswordForm.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {forgotPasswordForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-3">
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                    disabled={forgotPasswordMutation.isPending}
                  >
                    {forgotPasswordMutation.isPending ? "Enviando..." : "Enviar Link de Recuperação"}
                  </Button>
                  
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12"
                    onClick={() => {
                      setShowForgotPassword(false);
                      forgotPasswordForm.reset();
                    }}
                    disabled={forgotPasswordMutation.isPending}
                  >
                    Voltar ao Login
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
          
          {/* Links para Acesso do Profissional e Afiliado - sempre visível */}
          <div className="px-6 pb-6">
            <div className="text-center text-sm border-t pt-4 space-y-2">
              <div>
                <span className="text-muted-foreground">É um profissional? </span>
                <Button
                  type="button"
                  variant="link"
                  className="text-blue-600 hover:text-blue-800 p-0 h-auto font-medium"
                  onClick={() => setLocation("/profissional/login")}
                >
                  Acesso do Profissional
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
      
      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 z-40">
        <div className="text-xs text-gray-500 text-center">
          {settings?.customHtml ? (
            <div dangerouslySetInnerHTML={{ __html: settings.customHtml }} />
          ) : (
            <>{settings?.systemName || "AIDA"} ©2025 - Versão 1.0 - Powered by Halarum</>
          )}
        </div>
      </footer>
    </div>
  );
}