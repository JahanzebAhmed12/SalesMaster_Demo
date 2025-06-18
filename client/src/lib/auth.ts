import { create } from "zustand";
import { persist } from "zustand/middleware";

const API_URL = "http://localhost:5000";

interface User {
  id: number;
  username: string;
  userType: string;
  status: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: async (username: string, password: string) => {
        try {
          const response = await fetch(`${API_URL}/api/auth/login`, {
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
            return true;
          }
          return false;
        } catch (error) {
          console.error("Login error:", error);
          return false;
        }
      },
      logout: async () => {
        try {
          await fetch(`${API_URL}/api/auth/logout`, {
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
      checkAuth: async () => {
        try {
          const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
            },
            credentials: "include",
          });

          if (response.ok) {
            const data = await response.json();
            set({
              user: data,
              isAuthenticated: true,
            });
            return true;
          }
          set({
            user: null,
            isAuthenticated: false,
          });
          return false;
        } catch (error) {
          console.error("Auth check error:", error);
          set({
            user: null,
            isAuthenticated: false,
          });
          return false;
        }
      },
    }),
    {
      name: "auth-storage",
    }
  )
);
