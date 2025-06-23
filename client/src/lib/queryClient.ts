import { QueryClient, useMutation, useQueryClient, UseMutationOptions, UseMutationResult } from "@tanstack/react-query";

const API_BASE_URL = 'http://localhost:5000';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true,
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 3,
    },
  },
});

// Helper hook to DRY query invalidation after mutations
// Usage: useInvalidateMutation(mutationFn, [['users'], ['payroll']], options)
export function useInvalidateMutation<TData, TVariables = void, TError = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  keysToInvalidate: Array<Parameters<ReturnType<typeof useQueryClient>["invalidateQueries"]>[0]>,
  options?: UseMutationOptions<TData, TError, TVariables>
): UseMutationResult<TData, TError, TVariables> {
  const queryClient = useQueryClient();
  return useMutation<TData, TError, TVariables>({
    mutationFn,
    ...options,
    onSuccess: (...args: any[]) => {
      keysToInvalidate.forEach((key) => queryClient.invalidateQueries(key));
      if (options && options.onSuccess) {
        (options.onSuccess as Function)(...args);
      }
    },
  });
}

export const apiRequest = async <T = any>(method: string, endpoint: string, data?: any): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = localStorage.getItem('jwt_token');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: data ? JSON.stringify(data) : undefined,
  });

  const responseData = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('jwt_token');
      window.location.href = '/';
      throw new Error('Session expired. Please login again.');
    }
    throw new Error(responseData.message || `HTTP error! status: ${response.status}`);
  }

  return responseData;
};