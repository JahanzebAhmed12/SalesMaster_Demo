import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

export interface BusinessDateResponse {
  currentDate: string;
  nextDate: string;
  isNextDay: boolean;
}

export interface UseBusinessDateOptions {
  /** How often to refresh the server business date. Set to false to disable polling. */
  refetchInterval?: number | false;
  /** How long the business-date query remains fresh. */
  staleTime?: number;
}

export interface UseBusinessDateResult {
  /** Parsed current business date, or null until a valid server date is available. */
  businessDate: Date | null;
  /** Raw server date values retained for callers that need string values. */
  currentDate?: string;
  nextDate?: string;
  /** Parsed alias retained for callers that prefer an explicit next-date name. */
  nextBusinessDate: Date | null;
  isNextDay: boolean;
  isLoading: boolean;
  error: unknown;
  refetch: ReturnType<typeof useQuery<BusinessDateResponse>>["refetch"];
  formatBusinessDate: (date: Date | string | null | undefined) => string;
  formatShortDate: (date: Date | string | null | undefined) => string;
  formatForApi: (date: Date | string | null | undefined) => string;
}

const parseDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

const formatBusinessDate = (value: Date | string | null | undefined): string => {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
};

const formatShortDate = (value: Date | string | null | undefined): string => {
  const date = parseDate(value);
  return date ? format(date, "dd/MM/yyyy") : "";
};

const formatForApi = (value: Date | string | null | undefined): string => {
  const date = parseDate(value);
  return date ? format(date, "yyyy-MM-dd") : "";
};

export function useBusinessDate(
  options: UseBusinessDateOptions = {},
): UseBusinessDateResult {
  const { refetchInterval = 30000, staleTime = 10000 } = options;
  const { data, isLoading, error, refetch } = useQuery<BusinessDateResponse>({
    queryKey: ["/api/business-date"],
    queryFn: () => apiRequest<BusinessDateResponse>("GET", "/api/business-date"),
    refetchInterval,
    staleTime,
  });

  const businessDate = parseDate(data?.currentDate);

  return {
    businessDate,
    currentDate: data?.currentDate,
    nextDate: data?.nextDate,
    nextBusinessDate: parseDate(data?.nextDate),
    isNextDay: data?.isNextDay ?? false,
    isLoading,
    error,
    refetch,
    formatBusinessDate,
    formatShortDate,
    formatForApi,
  };
}
