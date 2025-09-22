import React, { createContext, useContext, useEffect } from 'react';
import { usePayrollStateManager } from '@/hooks/usePayrollStateManager';

interface PayrollStateContextType {
  payrollState: ReturnType<typeof usePayrollStateManager>;
}

const PayrollStateContext = createContext<PayrollStateContextType | null>(null);

export const usePayrollState = () => {
  const context = useContext(PayrollStateContext);
  if (!context) {
    throw new Error('usePayrollState must be used within PayrollStateProvider');
  }
  return context.payrollState;
};

interface PayrollStateProviderProps {
  children: React.ReactNode;
}

export const PayrollStateProvider: React.FC<PayrollStateProviderProps> = ({ children }) => {
  const payrollState = usePayrollStateManager();

  // Debug logging in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(() => {
        const status = payrollState.getPayrollCacheStatus();
        if (status.staleQueries > 0 || status.errorQueries > 0) {
          console.log('Payroll State Status:', status);
        }
      }, 30000); // Check every 30 seconds

      return () => clearInterval(interval);
    }
  }, [payrollState]);

  // Handle visibility change to refresh data when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible, refresh stale data
        const status = payrollState.getPayrollCacheStatus();
        if (status.staleQueries > 0) {
          console.log('Tab became active, refreshing stale payroll data');
          payrollState.bulkOperations.refreshPayrollData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [payrollState]);

  return (
    <PayrollStateContext.Provider value={{ payrollState }}>
      {children}
    </PayrollStateContext.Provider>
  );
};