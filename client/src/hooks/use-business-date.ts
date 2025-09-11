import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

export interface BusinessDate {
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

  const getBusinessDate = (): Date | null => {
    if (!data?.currentDate) return null;
    const date = new Date(data.currentDate);
    return isNaN(date.getTime()) ? null : date;
  };

  const formatBusinessDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) 
        ? '' 
        : date.toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
    } catch (error) {
      console.error('Error formatting business date:', error);
      return '';
    }
  };

  const formatShortDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime())
        ? ''
        : format(date, 'dd/MM/yyyy');
    } catch (error) {
      console.error('Error formatting short date:', error);
      return '';
    }
  };

  const formatForApi = (date: Date | string | null | undefined): string => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      return isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd');
    } catch (error) {
      console.error('Error formatting date for API:', error);
      return '';
    }
  };

  return {
    businessDate: getBusinessDate(),
    currentDate: data?.currentDate,
    nextDate: data?.nextDate,
    isNextDay: data?.isNextDay ?? false,
    isLoading,
    error,
    refetch,
    formatBusinessDate,
    formatShortDate,
    formatForApi,
  };
}