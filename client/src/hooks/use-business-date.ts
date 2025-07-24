import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface BusinessDate {
  currentDate: string;
  nextDate: string;
  isNextDay: boolean;
}

export function useBusinessDate() {
  const { data, isLoading, error, refetch } = useQuery<BusinessDate>({
    queryKey: ['/api/business-date'],
    queryFn: () => apiRequest<BusinessDate>('GET', '/api/business-date'),
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
  });

  const formatBusinessDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatShortDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return {
    businessDate: data,
    currentDate: data?.currentDate,
    nextDate: data?.nextDate,
    isLoading,
    error,
    refetch,
    formatBusinessDate,
    formatShortDate,
  };
}