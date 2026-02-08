import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface FinancialPasswordGateProps {
  children: React.ReactNode;
}

export default function FinancialPasswordGate({ children }: FinancialPasswordGateProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { data: status, isLoading } = useQuery<{
    enabled: boolean;
    hasPassword: boolean;
    verified: boolean;
  }>({
    queryKey: ["/api/company/financial-password/status"],
  });

  const verifyMutation = useMutation({
    mutationFn: async (pwd: string) => {
      const res = await apiRequest("/api/company/financial-password/verify", "POST", { password: pwd });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial-password/status"] });
      setPassword("");
      toast({ title: "Sucesso", description: "Acesso liberado" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Senha incorreta",
        variant: "destructive",
      });
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (data: { password: string; confirmPassword: string }) => {
      const res = await apiRequest("/api/company/financial-password/set", "POST", data);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company/financial-password/status"] });
      setPassword("");
      setConfirmPassword("");
      toast({ title: "Sucesso", description: "Senha financeiro criada com sucesso" });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao criar senha",
        variant: "destructive",
      });
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Feature disabled or already verified -> show content
  if (!status?.enabled || status?.verified) {
    return <>{children}</>;
  }

  // Feature enabled, no password set -> show CREATE password dialog
  const isSetupMode = !status.hasPassword;

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {isSetupMode ? "Criar Senha Financeiro" : "Senha Financeiro"}
          </DialogTitle>
          <DialogDescription>
            {isSetupMode
              ? "Defina uma senha para proteger o acesso ao financeiro e relatórios."
              : "Digite sua senha financeiro para acessar esta área."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isSetupMode) {
              setPasswordMutation.mutate({ password, confirmPassword });
            } else {
              verifyMutation.mutate(password);
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="financialPassword">Senha</Label>
            <Input
              id="financialPassword"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite a senha"
              autoFocus
            />
          </div>

          {isSetupMode && (
            <div className="space-y-2">
              <Label htmlFor="confirmFinancialPassword">Confirmar Senha</Label>
              <Input
                id="confirmFinancialPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirme a senha"
              />
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={verifyMutation.isPending || setPasswordMutation.isPending}
          >
            {verifyMutation.isPending || setPasswordMutation.isPending
              ? "Verificando..."
              : isSetupMode
                ? "Criar Senha"
                : "Entrar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
