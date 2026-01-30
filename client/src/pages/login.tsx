import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Lock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface LoginFormData {
  username: string;
  password: string;
}

export default function Login() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  // Busca configurações públicas para obter a logo e cores
  const { data: settings } = useQuery({
    queryKey: ["/api/public-settings"],
    retry: false,
  });
  
  // Define o título da página
  useDocumentTitle("Administrador");

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
      const [h, s] = primaryHsl.split(',');
      root.style.setProperty('--accent', `hsl(${h}, ${s}, 96%)`);
      root.style.setProperty('--accent-foreground', `hsl(${primaryHsl})`);
    }
  }, [settings]);

  const form = useForm<LoginFormData>({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      await apiRequest("/api/auth/login", "POST", data);
      
      toast({
        title: "Sucesso",
        description: "Login realizado com sucesso!",
      });
      
      // Redirect to admin dashboard
      window.location.href = "/administrador/dashboard";
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao fazer login",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuário</Label>
                <Input
                  id="username"
                  {...form.register("username", { required: "Usuário é obrigatório" })}
                  placeholder="Digite seu usuário"
                  disabled={isLoading}
                  className="border-input focus:border-primary focus:ring-primary"
                />
                {form.formState.errors.username && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.username.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  {...form.register("password", { required: "Senha é obrigatória" })}
                  placeholder="Digite sua senha"
                  disabled={isLoading}
                  className="border-input focus:border-primary focus:ring-primary"
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={isLoading}
              >
                {isLoading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
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