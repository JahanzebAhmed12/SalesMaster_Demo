import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getApiUrl } from "./config";

interface User {
  id: number;
  username: string;
  userType: string;
  status: string;
}

interface LoginResult {
  success: boolean;
  error?: string;
  status?: number;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  checkAuth: () => Promise<boolean>;
}

// Centralized handler for authentication errors (401)
// This ensures both localStorage token and Zustand store are always in sync.
// Called by the de-bounced 401 handler in queryClient — not on every single 401.
export function handleAuthError() {
  // Don't redirect if we're already on the login page
  if (window.location.pathname === '/' || window.location.pathname === '/login') return;

  localStorage.removeItem('jwt_token');
  // Update the Zustand store directly (not calling logout() which makes a network request)
  useAuth.setState({ user: null, isAuthenticated: false });
  window.location.href = '/';
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: async (username: string, password: string) => {
        try {
          const response = await fetch(getApiUrl("/api/auth/login"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password }),
            credentials: "include",
          });

          if (response.ok) {
            const data = await response.json();
            // Store JWT token
            if (data.token) {
              localStorage.setItem('jwt_token', data.token);
            }
            set({
              user: data,
              isAuthenticated: true,
            });
            return { success: true };
          } else {
            const errorData = await response.json();
            return { 
              success: false, 
              error: errorData.error || "Invalid credentials",
              status: response.status 
            };
          }
        } catch (error) {
          console.error("Login error:", error);
          return { success: false, error: "Network error occurred" };
        }
      },
      logout: async () => {
        try {
          await fetch(getApiUrl("/api/auth/logout"), {
            method: "POST",
            credentials: "include",
          });
        } catch (error) {
          console.error("Logout error:", error);
        } finally {
          localStorage.removeItem('jwt_token');
          set({
            user: null,
            isAuthenticated: false,
          });
        }
      },
      refreshToken: async () => {
        // Silently exchange the current token for a fresh one.
        // Called periodically while the user is active so the token
        // never expires during a working session.
        const token = localStorage.getItem('jwt_token');
        if (!token) return false;
        try {
          const response = await fetch(getApiUrl("/api/auth/refresh"), {
            method: "POST",
            headers: { 'Authorization': `Bearer ${token}` },
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json();
            if (data.token) {
              localStorage.setItem('jwt_token', data.token);
              console.log('[Auth] Token refreshed silently');
              return true;
            }
          }
          return false;
        } catch {
          return false;
        }
      },
      checkAuth: async () => {
        try {
          const token = localStorage.getItem('jwt_token');

          // No token stored — definitely not authenticated, but don't redirect.
          // The user simply hasn't logged in yet (or already logged out cleanly).
          if (!token) {
            set({ user: null, isAuthenticated: false });
            return false;
          }

          const response = await fetch(getApiUrl("/api/auth/me"), {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            credentials: "include",
          });

          if (response.ok) {
            const data = await response.json();
            set({ user: data, isAuthenticated: true });
            return true;
          }

          // 401 = token expired/invalid, 422 = malformed token (e.g. "Bearer null")
          // Both mean the stored token is no good — clear it but only redirect if
          // the user was previously authenticated (preserve current page experience).
          if (response.status === 401 || response.status === 422) {
            localStorage.removeItem('jwt_token');
            set({ user: null, isAuthenticated: false });
            return false;
          }

          // Any other error (500, network timeout, etc.) — do NOT log the user out.
          // The server may be temporarily unavailable; keep existing auth state.
          console.warn(`[checkAuth] Non-auth error ${response.status} — keeping existing session`);
          return true;
        } catch (error) {
          // Network error — do NOT log the user out. The server may be restarting.
          console.warn('[checkAuth] Network error — keeping existing session:', error);
          // Return current auth state without touching the store
          return useAuth.getState().isAuthenticated;
        }
      },
    }),
    {
      name: "auth-storage",
    }
  )
);
