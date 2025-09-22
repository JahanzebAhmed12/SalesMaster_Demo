import React, { createContext, useContext, useEffect } from 'react';
import { useAdminStateManager } from '@/hooks/useAdminStateManager';

interface AdminStateContextType {
  adminState: ReturnType<typeof useAdminStateManager>;
}

const AdminStateContext = createContext<AdminStateContextType | null>(null);

export const useAdminState = () => {
  const context = useContext(AdminStateContext);
  if (!context) {
    throw new Error('useAdminState must be used within AdminStateProvider');
  }
  return context.adminState;
};

interface AdminStateProviderProps {
  children: React.ReactNode;
}

export const AdminStateProvider: React.FC<AdminStateProviderProps> = ({ children }) => {
  const adminState = useAdminStateManager();

  // Debug logging in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(() => {
        const status = adminState.getAdminCacheStatus();
        if (status.staleQueries > 0 || status.errorQueries > 0) {
          console.log('Admin State Status:', status);
        }
      }, 30000); // Check every 30 seconds

      return () => clearInterval(interval);
    }
  }, [adminState]);

  // Handle visibility change to refresh data when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible, refresh stale data
        const status = adminState.getAdminCacheStatus();
        if (status.staleQueries > 0) {
          console.log('Tab became active, refreshing stale admin data');
          adminState.bulkOperations.refreshAdminData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [adminState]);

  return (
    <AdminStateContext.Provider value={{ adminState }}>
      {children}
    </AdminStateContext.Provider>
  );
};