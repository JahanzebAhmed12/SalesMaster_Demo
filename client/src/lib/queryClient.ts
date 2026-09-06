import { QueryClient, useMutation, useQueryClient, UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { getApiUrl } from "./config";
import { handleAuthError, useAuth } from "./auth";

// ── 401 de-bounce ────────────────────────────────────────────────────────────
// Prevent multiple simultaneous 401 responses (e.g. from parallel background
// queries) from each triggering an independent logout + redirect.
// The first 401 sets a short grace timer; subsequent 401s within that window
// are ignored. Only after the grace period fires does the actual logout run,
// giving in-flight retries a chance to succeed (e.g. if the server restarted
// and a fresh request works).

let _authErrorTimer: ReturnType<typeof setTimeout> | null = null;
let _authErrorCount = 0;
const AUTH_ERROR_GRACE_MS = 3000; // wait 3 s before acting on 401s

export function scheduleAuthError() {
  _authErrorCount++;
  if (_authErrorTimer) return; // already scheduled — don't stack
  _authErrorTimer = setTimeout(async () => {
    _authErrorTimer = null;
    const count = _authErrorCount;
    _authErrorCount = 0;
    console.warn(`[Auth] ${count} 401/422 response(s) received — attempting silent token refresh...`);

    // Try to silently refresh the token before giving up and logging out.
    // This handles the case where the token just expired mid-request.
    try {
      const { refreshToken, isAuthenticated } = useAuth.getState();
      if (isAuthenticated) {
        const refreshed = await refreshToken();
        if (refreshed) {
          console.log('[Auth] Silent refresh succeeded — not logging out');
          return; // Token refreshed — do NOT log out
        }
      }
    } catch {
      // refresh failed — fall through to logout
    }

    console.warn('[Auth] Silent refresh failed — logging out');
    handleAuthError();
  }, AUTH_ERROR_GRACE_MS);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Only refetch on window focus for queries that are stale
      // — prevents a burst of re-requests every time the user switches tabs,
      // any one of which could get a 401 and log them out.
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: true,
      staleTime: 1000 * 60 * 5, // 5 minutes
      // Only retry once on failure — repeated retries on a 401 just delay logout
      retry: (failureCount, error: any) => {
        // Never retry auth errors (401 or 422)
        if (
          error?.message?.includes('Session expired') ||
          error?.message?.includes('401') ||
          error?.message?.includes('422')
        ) return false;
        return failureCount < 1;
      },
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

export class ApiRequestError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.data = data;
  }
}

export const apiRequest = async <T = any>(method: string, endpoint: string, data?: any, options?: { signal?: AbortSignal }): Promise<T> => {
  // For production with Nginx reverse proxy, use relative URLs
  // For development, use full URL to backend server
  const url = getApiUrl(endpoint);
  const token = localStorage.getItem('jwt_token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    credentials: 'include',
    body: data ? JSON.stringify(data) : undefined,
  };

  // Add signal if provided (for timeout handling)
  if (options?.signal) {
    fetchOptions.signal = options.signal;
  }

  const response = await fetch(url, fetchOptions);

  // Handle 401/422 with de-bounce so a burst of background queries expiring at the
  // same moment doesn't fire multiple independent logout flows.
  // 401 = expired/invalid token, 422 = malformed token (Flask-JWT returns this
  // when the Authorization header is present but unparseable, e.g. "Bearer null").
  // Do NOT treat auth endpoints themselves as session expiry — a failed login
  // (POST /api/auth/login 401) should not trigger a logout loop.
  const isAuthEndpoint = endpoint.startsWith("/api/auth/");
  if ((response.status === 401 || response.status === 422) && !isAuthEndpoint) {
    scheduleAuthError();
    throw new Error('Session expired. Please login again.');
  }
  // For auth endpoints, just throw without scheduling a global logout
  if ((response.status === 401 || response.status === 422) && isAuthEndpoint) {
    const errBody = await response.json().catch(() => ({} as any));
    throw new ApiRequestError(
      (errBody as any).message || (errBody as any).error || `HTTP error! status: ${response.status}`,
      response.status,
      errBody,
    );
  }

  const responseData = await response.json();

  if (!response.ok) {
    throw new ApiRequestError(
      responseData.message || responseData.error || `HTTP error! status: ${response.status}`,
      response.status,
      responseData,
    );
  }

  return responseData;
};
