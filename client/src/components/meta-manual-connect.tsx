import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, CheckCircle2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ManualConnectProps {
  onComplete?: (result: any) => void;
}

export function MetaManualConnect({ onComplete }: ManualConnectProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<any>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    phone_number_id: "",
    waba_id: "",
    display_phone_number: "",
    verified_name: "",
    access_token: "",
    business_id: "",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await apiRequest("/api/company/meta/manual-connect", "POST", form);

      if (response.success) {
        setSuccess(response.instance);
        toast({
          title: "WhatsApp conectado!",
          description: `Numero ${response.instance.displayPhoneNumber} configurado com sucesso.`,
        });
        onComplete?.(response.instance);
      } else {
        throw new Error(response.error || "Erro desconhecido");
      }
    } catch (err: any) {
      const msg = err.message || "Erro ao salvar integração";
      setError(msg);
      toast({
        title: "Erro na conexão",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            WhatsApp Conectado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="border-green-300 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <div className="space-y-1">
                <p className="font-medium">Integração salva com sucesso!</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="bg-white">
                    {success.displayPhoneNumber}
                  </Badge>
                  {success.verifiedName && (
                    <Badge variant="outline" className="bg-white">
                      {success.verifiedName}
                    </Badge>
                  )}
                  <Badge variant="outline" className="bg-white text-green-700 border-green-300">
                    {success.status}
                  </Badge>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5 text-green-600" />
          Conectar WhatsApp Manualmente
        </CardTitle>
        <CardDescription>
          Conecte sua conta WhatsApp Business informando os dados do Meta Business Manager.
          Esse fluxo é temporário até a aprovação do Embedded Signup.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone_number_id">Phone Number ID *</Label>
              <Input
                id="phone_number_id"
                placeholder="Ex: 123456789012345"
                value={form.phone_number_id}
                onChange={(e) => handleChange("phone_number_id", e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Encontre em Meta Business Manager &gt; WhatsApp &gt; Configurações da API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="waba_id">WABA ID *</Label>
              <Input
                id="waba_id"
                placeholder="Ex: 123456789012345"
                value={form.waba_id}
                onChange={(e) => handleChange("waba_id", e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                ID da conta WhatsApp Business (Business Manager &gt; Contas &gt; WhatsApp)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="display_phone_number">Numero do WhatsApp *</Label>
              <Input
                id="display_phone_number"
                placeholder="Ex: +55 11 99999-9999"
                value={form.display_phone_number}
                onChange={(e) => handleChange("display_phone_number", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="verified_name">Nome Verificado</Label>
              <Input
                id="verified_name"
                placeholder="Ex: Minha Empresa"
                value={form.verified_name}
                onChange={(e) => handleChange("verified_name", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Nome verificado que aparece no perfil do WhatsApp
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="business_id">Business ID</Label>
              <Input
                id="business_id"
                placeholder="Ex: 123456789012345"
                value={form.business_id}
                onChange={(e) => handleChange("business_id", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                ID do portfólio de negócios (opcional)
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access_token">Access Token (System User Token) *</Label>
            <Input
              id="access_token"
              type="password"
              placeholder="Token do System User com permissão whatsapp_business_messaging"
              value={form.access_token}
              onChange={(e) => handleChange("access_token", e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Gere em Business Manager &gt; Configurações &gt; Usuários do sistema &gt; Gerar token
            </p>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validando e salvando...
              </>
            ) : (
              "Salvar Integração"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}