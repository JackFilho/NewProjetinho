import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, X, CreditCard } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PaymentAlert {
  id: number;
  company_id: number;
  alert_type: string;
  is_shown: boolean;
  created_at: string;
  shown_at?: string;
}

interface TrialInfo {
  daysRemaining: number;
  trialExpiresAt: string;
  planName: string;
  showAlert: boolean;
}

export function PaymentAlerts() {
  const [alerts, setAlerts] = useState<PaymentAlert[]>([]);
  const [trialInfo, setTrialInfo] = useState<TrialInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchAlerts();
    fetchTrialInfo();
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await fetch("/api/company/payment-alerts");
      if (response.ok) {
        const data = await response.json();
        setAlerts(data);
      }
    } catch (error) {
      // Silently handle error
    }
  };

  const fetchTrialInfo = async () => {
    try {
      const response = await fetch("/api/company/trial-info");
      if (response.ok) {
        const data = await response.json();
        setTrialInfo(data);
      }
    } catch (error) {
      // Silently handle error
    } finally {
      setLoading(false);
    }
  };

  const dismissAlert = async (alertId: number) => {
    try {
      await apiRequest(`/api/company/payment-alerts/${alertId}/mark-shown`, "POST");
      setAlerts(alerts.filter(alert => alert.id !== alertId));
      toast({
        title: "Alerta dispensado",
        description: "Alerta marcado como visualizado",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao dispensar alerta",
        variant: "destructive",
      });
    }
  };

  const getAlertMessage = (alertType: string, planName?: string) => {
    const days = alertType.replace("_days", "").replace("_day", "");
    const dayText = days === "1" ? "dia" : "dias";
    
    return `Seu período gratuito do plano ${planName || ""} expira em ${days} ${dayText}. Configure seu pagamento para continuar usando o sistema.`;
  };

  if (loading) {
    return null;
  }

  // Se não há alertas e não deve mostrar alerta de trial, não renderizar nada
  if (alerts.length === 0 && (!trialInfo?.showAlert || trialInfo.daysRemaining <= 0)) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Alerta de Trial Info */}
      {trialInfo?.showAlert && trialInfo.daysRemaining > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2 text-orange-800">
              <AlertTriangle className="h-5 w-5" />
              <span>Período de Teste</span>
              <Badge variant="outline" className="text-orange-700 border-orange-300">
                {trialInfo.daysRemaining} {trialInfo.daysRemaining === 1 ? "dia restante" : "dias restantes"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-orange-700">
                Seu período gratuito do plano <strong>{trialInfo.planName}</strong> expira em{" "}
                <strong>{trialInfo.daysRemaining} {trialInfo.daysRemaining === 1 ? "dia" : "dias"}</strong>.
              </p>
              <p className="text-sm text-orange-600">
                Para continuar usando todas as funcionalidades do sistema, escolha um plano e configure seu pagamento.
              </p>
              <div className="flex space-x-2">
                <Button size="sm" className="bg-orange-600 hover:bg-orange-700">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Configurar Pagamento
                </Button>
                <Button size="sm" variant="outline">
                  Ver Planos
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alertas de Pagamento */}
      {alerts.map((alert) => (
        <Card key={alert.id} className="border-red-200 bg-red-50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center space-x-2 text-red-800">
                <AlertTriangle className="h-5 w-5" />
                <span>Alerta de Pagamento</span>
                <Badge variant="destructive">
                  Urgente
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dismissAlert(alert.id)}
                className="text-red-600 hover:text-red-800"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-red-700">
                {getAlertMessage(alert.alert_type, trialInfo?.planName)}
              </p>
              <div className="flex space-x-2">
                <Button size="sm" variant="destructive">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Pagar Agora
                </Button>
                <Button size="sm" variant="outline" onClick={() => dismissAlert(alert.id)}>
                  Dispensar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}