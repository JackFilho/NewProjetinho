import { useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { CheckCircle, ArrowRight, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';

interface PublicSettings {
  logoUrl: string | null;
  systemName: string | null;
}

export default function ThankYou() {
  const [, setLocation] = useLocation();

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["/api/public-settings"],
  });

  useEffect(() => {
    // Redirect to home after 60 seconds if user doesn't take action
    const timer = setTimeout(() => {
      setLocation('/');
    }, 60000);

    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center pb-4">
          {/* Logo */}
          {settings?.logoUrl && (
            <div className="mx-auto mb-6">
              <img 
                src={settings.logoUrl} 
                alt={settings.systemName || "Logo"} 
                className="h-16 w-auto mx-auto"
              />
            </div>
          )}
          
          <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold text-primary">
            Sua conta foi criada com sucesso!
          </CardTitle>
        </CardHeader>
        
        <CardContent className="text-center space-y-6">
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Agora você já pode fazer login em seu painel e configurar os dados do seu negócio.
            </p>
          </div>

          <div className="space-y-3">
            <Link href="/company/login">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
                <Building2 className="w-4 h-4 mr-2" />
                Clique aqui para entrar no seu portal
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            
            <Link href="/">
              <Button variant="outline" className="w-full">
                Voltar ao Início
              </Button>
            </Link>
          </div>

          <div className="text-xs text-muted-foreground mt-8">
            <p>
              Você será redirecionado automaticamente em 60 segundos.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}