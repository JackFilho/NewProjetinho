import { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";
import { usePermissionGuard, usePlan, type PlanPermissions } from "@/hooks/use-plan";

interface PlanGuardProps {
  permission: keyof import("@/hooks/use-plan").PlanPermissions;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PlanGuard({ permission, children, fallback }: PlanGuardProps) {
  const { hasAccess, isLoading, deniedMessage } = usePermissionGuard(permission);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasAccess) {
    return fallback || (
      <Alert className="border-orange-200 bg-orange-50">
        <Lock className="h-4 w-4 text-orange-600" />
        <AlertDescription className="text-orange-800">
          {deniedMessage}
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}

// Component para verificar limite de profissionais
interface ProfessionalLimitGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ProfessionalLimitGuard({ children, fallback }: ProfessionalLimitGuardProps) {
  const { canAddProfessional, getProfessionalsLimitInfo, isLoading } = usePlan();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  const limitInfo = getProfessionalsLimitInfo();

  if (!canAddProfessional()) {
    return fallback || (
      <Alert className="border-red-200 bg-red-50">
        <Lock className="h-4 w-4 text-red-600" />
        <AlertDescription className="text-red-800">
          Limite de profissionais atingido ({limitInfo?.current}/{limitInfo?.limit}). 
          Faça upgrade do seu plano para adicionar mais profissionais.
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}