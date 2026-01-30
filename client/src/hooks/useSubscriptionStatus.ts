import { useQuery } from "@tanstack/react-query";

export interface SubscriptionStatus {
  isActive: boolean;
  message?: string;
  subscriptionStatus?: string;
  paymentStatus?: string;
}

export function useSubscriptionStatus() {
  const { data, isLoading, error } = useQuery<SubscriptionStatus>({
    queryKey: ["/api/subscription/status"],
    retry: false,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 60 * 1000, // 1 minute
  });

  return {
    subscriptionStatus: data,
    isLoading,
    isBlocked: data?.isActive === false,
    error,
  };
}