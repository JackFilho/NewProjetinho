import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    FB: any;
    fbAsyncInit: () => void;
  }
}

interface EmbeddedSignupProps {
  /** ID da instância existente (se estiver reconfigurando) */
  instanceId?: number;
  /** Callback quando signup é concluído */
  onComplete?: (result: any) => void;
}

type SignupState = "idle" | "loading_sdk" | "ready" | "signing_up" | "processing" | "success" | "error";

export function MetaEmbeddedSignup({ instanceId, onComplete }: EmbeddedSignupProps) {
  const [state, setState] = useState<SignupState>("idle");
  const [error, setError] = useState<string>("");
  const [appId, setAppId] = useState<string>("");
  const [configId, setConfigId] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  // Fetch Meta App config from backend
  useEffect(() => {
    async function fetchConfig() {
      try {
        const config = await apiRequest("/api/company/meta/embedded-signup/config", "GET");
        setAppId(config.appId);
        setConfigId(config.configId || "");
        loadFacebookSDK(config.appId);
      } catch (err: any) {
        setError(err.message || "Erro ao carregar configuração Meta");
        setState("error");
      }
    }
    fetchConfig();
  }, []);

  // Load Facebook JS SDK
  const loadFacebookSDK = useCallback((fbAppId: string) => {
    setState("loading_sdk");

    // If SDK already loaded
    if (window.FB) {
      window.FB.init({
        appId: fbAppId,
        cookie: true,
        xfbml: true,
        version: "v21.0",
      });
      setState("ready");
      return;
    }

    window.fbAsyncInit = function () {
      window.FB.init({
        appId: fbAppId,
        cookie: true,
        xfbml: true,
        version: "v21.0",
      });
      setState("ready");
    };

    // Inject SDK script
    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, []);

  // Launch Embedded Signup
  const launchSignup = useCallback(() => {
    if (!window.FB) {
      setError("Facebook SDK não carregado. Recarregue a página.");
      setState("error");
      return;
    }

    setState("signing_up");
    setError("");

    window.FB.login(
      function (response: any) {
        if (response.authResponse?.code) {
          // Got the authorization code - send to backend
          processSignupCode(response.authResponse.code);
        } else {
          console.warn("Embedded Signup cancelled or failed:", response);
          setState("ready");
          if (response.status === "unknown") {
            // User cancelled
            toast({
              title: "Signup cancelado",
              description: "Você pode tentar novamente quando quiser.",
            });
          }
        }
      },
      {
        config_id: configId || undefined,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: "4",
        },
      }
    );
  }, [configId, instanceId, toast]);

  // Process the code from Embedded Signup
  const processSignupCode = async (code: string) => {
    setState("processing");
    try {
      const response = await apiRequest("/api/company/meta/embedded-signup/callback", "POST", {
        code,
        instanceId: instanceId || null,
      });

      if (response.success) {
        setResult(response.instance);
        setState("success");
        toast({
          title: "WhatsApp conectado!",
          description: `Numero ${response.instance.displayPhoneNumber} configurado com sucesso.`,
        });
        onComplete?.(response.instance);
      } else {
        throw new Error(response.error || "Erro desconhecido");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao processar Embedded Signup");
      setState("error");
      toast({
        title: "Erro no Embedded Signup",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageSquare className="h-5 w-5 text-green-600" />
          Conectar WhatsApp (Oficial Meta)
        </CardTitle>
        <CardDescription>
          Conecte sua conta WhatsApp Business usando o fluxo oficial da Meta.
          Seus dados ficam seguros e a conexao e feita diretamente com a Meta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error state */}
        {state === "error" && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Success state */}
        {state === "success" && result && (
          <Alert className="border-green-300 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <div className="space-y-1">
                <p className="font-medium">WhatsApp conectado com sucesso!</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Badge variant="outline" className="bg-white">
                    {result.displayPhoneNumber}
                  </Badge>
                  {result.verifiedName && (
                    <Badge variant="outline" className="bg-white">
                      {result.verifiedName}
                    </Badge>
                  )}
                  <Badge variant="outline" className="bg-white text-green-700 border-green-300">
                    {result.qualityRating}
                  </Badge>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Loading SDK */}
        {state === "loading_sdk" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando Facebook SDK...
          </div>
        )}

        {/* Processing */}
        {state === "processing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processando... Trocando token, resolvendo WABA e configurando webhook...
          </div>
        )}

        {/* Ready - show connect button */}
        {(state === "ready" || state === "error") && (
          <div className="space-y-3">
            <Button
              onClick={launchSignup}
              className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white"
              size="lg"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Conectar WhatsApp Business
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Ao clicar, voce sera redirecionado para o fluxo oficial da Meta.
              Selecione ou crie sua conta WhatsApp Business.
            </p>
          </div>
        )}

        {/* Signing up - waiting for user */}
        {state === "signing_up" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Aguardando... Complete o fluxo na janela do Facebook.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
