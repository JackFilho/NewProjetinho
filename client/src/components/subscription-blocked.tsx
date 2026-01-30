import { AlertTriangle, CreditCard, Phone } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SubscriptionBlockedProps {
  reason?: string;
  subscriptionStatus?: string;
  paymentStatus?: string;
}

export default function SubscriptionBlocked({ 
  reason = "payment_failed", 
  subscriptionStatus,
  paymentStatus 
}: SubscriptionBlockedProps) {
  const handleContactSupport = () => {
    // You can customize this to redirect to your support system
    window.open('mailto:suporte@seusistema.com?subject=Problema com Pagamento', '_blank');
  };

  const getStatusMessage = () => {
    if (subscriptionStatus === 'past_due') {
      return "Sua assinatura está com pagamento em atraso";
    }
    if (subscriptionStatus === 'canceled') {
      return "Sua assinatura foi cancelada";
    }
    if (paymentStatus === 'requires_payment_method') {
      return "Método de pagamento inválido ou expirado";
    }
    if (paymentStatus === 'failed') {
      return "O pagamento da sua assinatura foi recusado";
    }
    return "Problema detectado com sua assinatura";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="border-destructive">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-xl font-semibold text-destructive">
              Acesso Bloqueado
            </CardTitle>
            <CardDescription className="text-base">
              {getStatusMessage()}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertDescription>
                Entre em contato com o suporte para resolver este problema e reativar seu acesso ao sistema.
              </AlertDescription>
            </Alert>

            {subscriptionStatus && (
              <div className="text-sm text-muted-foreground">
                <p><strong>Status da Assinatura:</strong> {subscriptionStatus}</p>
                {paymentStatus && (
                  <p><strong>Status do Pagamento:</strong> {paymentStatus}</p>
                )}
              </div>
            )}

            <div className="space-y-3 pt-4">
              <Button 
                onClick={handleContactSupport} 
                className="w-full"
                size="lg"
              >
                <Phone className="w-4 h-4 mr-2" />
                Contatar Suporte
              </Button>
              
              <div className="text-center text-sm text-muted-foreground">
                <p>Email: suporte@seusistema.com</p>
                <p>Telefone: (11) 99999-9999</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}