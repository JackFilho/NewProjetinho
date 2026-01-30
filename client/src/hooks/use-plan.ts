import { useQuery } from "@tanstack/react-query";

export interface PlanPermissions {
  dashboard: boolean;
  appointments: boolean;
  services: boolean;
  professionals: boolean;
  clients: boolean;
  reviews: boolean;
  tasks: boolean;
  pointsProgram: boolean;
  loyalty: boolean;
  inventory: boolean;
  messages: boolean;
  coupons: boolean;
  financial: boolean;
  reports: boolean;
  settings: boolean;
  subscription: boolean;
}

interface PlanInfo {
  id: number;
  name: string;
  maxProfessionals: number;
  permissions: PlanPermissions;
}

interface PlanUsage {
  professionalsCount: number;
  professionalsLimit: number;
}

interface PlanData {
  plan: PlanInfo;
  usage: PlanUsage;
}

export function usePlan() {
  const { data, isLoading, error } = useQuery<PlanData>({
    queryKey: ['/api/company/plan-info'],
    queryFn: async () => {
      const response = await fetch('/api/company/plan-info');
      if (!response.ok) {
        throw new Error('Erro ao buscar informações do plano');
      }
      return response.json();
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const hasPermission = (permission: keyof PlanPermissions): boolean => {
    return data?.plan?.permissions?.[permission] ?? false;
  };

  const canAddProfessional = (): boolean => {
    if (!data?.usage) return false;
    return data.usage.professionalsCount < data.usage.professionalsLimit;
  };

  const getProfessionalsLimitInfo = () => {
    if (!data?.usage) return null;
    return {
      current: data.usage.professionalsCount,
      limit: data.usage.professionalsLimit,
      canAdd: canAddProfessional(),
      remaining: data.usage.professionalsLimit - data.usage.professionalsCount
    };
  };

  return {
    planData: data,
    isLoading,
    error,
    hasPermission,
    canAddProfessional,
    getProfessionalsLimitInfo,
    planName: data?.plan?.name || 'Plano não identificado',
    permissions: data?.plan?.permissions || {} as PlanPermissions
  };
}

// Hook para controle de acesso a rotas
export function usePermissionGuard(requiredPermission: keyof PlanPermissions) {
  const { hasPermission, isLoading } = usePlan();
  
  return {
    hasAccess: hasPermission(requiredPermission),
    isLoading,
    deniedMessage: `Seu plano não inclui acesso a esta funcionalidade. Entre em contato para fazer upgrade.`
  };
}