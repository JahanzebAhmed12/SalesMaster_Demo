import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface BusinessDateResponse {
  currentDate: string;
  nextDate: string;
  isNextDay: boolean;
}

export function useBusinessDate() {
  const { data, isLoading, error, refetch } = useQuery<BusinessDateResponse>({
    queryKey: ["/api/business-date"],
    queryFn: () => apiRequest("GET", "/api/business-date"),
    refetchInterval: 60000, // Refetch every minute to keep date current
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  return {
    businessDate: data?.currentDate ? new Date(data.currentDate) : new Date(),
    nextBusinessDate: data?.nextDate ? new Date(data.nextDate) : new Date(),
    isNextDay: data?.isNextDay ?? false,
    isLoading,
    error,
    refetch,
  };
}