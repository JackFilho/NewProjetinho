import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, CreditCard, Play, RefreshCw } from "lucide-react";
import { FloatingHelpButton } from "@/components/floating-help-button";

export default function AdminTestSubscription() {
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const { toast } = useToast();

  const simulatePaymentFailure = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("/api/test/simulate-payment-failure", "POST");
      const result = await response.json();
      
      setTestResult({
        type: "failure",
        message: result.message,
        status: result.status
      });

      toast({
        title: "Falha de Pagamento Simulada",
        description: "O sistema agora deve bloquear o acesso da empresa.",
        variant: "destructive",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao simular falha de pagamento",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const simulatePaymentSuccess = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("/api/test/simulate-payment-success", "POST");
      const result = await response.json();
      
      setTestResult({
        type: "success",
        message: result.message,
        status: result.status
      });

      toast({
        title: "Sucesso de Pagamento Simulado",
        description: "O acesso da empresa foi reativado.",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao simular sucesso de pagamento",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const checkSubscriptionStatus = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("GET", "/api/subscription/status");
      const result = await response.json();
      
      setTestResult({
        type: "status",
        ...result
      });

      toast({
        title: "Status Verificado",
        description: `Status da assinatura: ${result.isActive ? 'Ativa' : 'Bloqueada'}`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao verificar status da assinatura",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Teste do Sistema de Bloqueio de Assinatura
          </h1>
          <p className="text-gray-600 mt-2">
            Simule diferentes estados de pagamento para testar o sistema de controle de acesso.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                Simular Falha de Pagamento
              </CardTitle>
              <CardDescription>
                Testa o bloqueio de acesso quando o pagamento falha
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Isso irá alterar o status da empresa para "suspended" e bloquear o acesso.
                </AlertDescription>
              </Alert>
              <Button 
                onClick={simulatePaymentFailure} 
                disabled={isLoading}
                variant="destructive"
                className="w-full"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Simular Falha de Pagamento
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Simular Sucesso de Pagamento
              </CardTitle>
              <CardDescription>
                Restaura o acesso após pagamento bem-sucedido
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Isso irá alterar o status da empresa para "active" e liberar o acesso.
                </AlertDescription>
              </Alert>
              <Button 
                onClick={simulatePaymentSuccess} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Simular Sucesso de Pagamento
              </Button>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-500" />
                Verificar Status da Assinatura
              </CardTitle>
              <CardDescription>
                Consulta o status atual da assinatura no sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={checkSubscriptionStatus} 
                disabled={isLoading}
                variant="outline"
                className="w-full"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="w-4 h-4 mr-2" />
                )}
                Verificar Status
              </Button>
              
              {testResult && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-2">Resultado do Teste:</h3>
                  {testResult.type === "status" ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span>Status:</span>
                        <Badge variant={testResult.isActive ? "default" : "destructive"}>
                          {testResult.isActive ? "Ativa" : "Bloqueada"}
                        </Badge>
                      </div>
                      {testResult.message && (
                        <p className="text-sm text-gray-600">{testResult.message}</p>
                      )}
                      {testResult.subscriptionStatus && (
                        <p className="text-sm">
                          <strong>Status da Assinatura:</strong> {testResult.subscriptionStatus}
                        </p>
                      )}
                      {testResult.paymentStatus && (
                        <p className="text-sm">
                          <strong>Status do Pagamento:</strong> {testResult.paymentStatus}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Badge variant={testResult.type === "success" ? "default" : "destructive"}>
                        {testResult.type === "success" ? "Sucesso" : "Falha"}
                      </Badge>
                      <p className="text-sm">{testResult.message}</p>
                      <p className="text-sm">
                        <strong>Status:</strong> {testResult.status}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Como Testar o Sistema</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h4 className="font-semibold text-green-600 mb-2">✅ Para testar o bloqueio:</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Clique em "Simular Falha de Pagamento"</li>
                    <li>Acesse uma página da empresa em outra aba</li>
                    <li>Observe a tela de bloqueio</li>
                  </ol>
                </div>
                <div>
                  <h4 className="font-semibold text-blue-600 mb-2">🔄 Para restaurar o acesso:</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>Clique em "Simular Sucesso de Pagamento"</li>
                    <li>Recarregue a página da empresa</li>
                    <li>O acesso deve ser restaurado</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <FloatingHelpButton menuLocation="admin-test-subscription" />
    </div>
  );
}