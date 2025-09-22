import React, { createContext, useContext, useEffect } from 'react';
import { usePaymentsStateManager } from '@/hooks/usePaymentsStateManager';

interface PaymentsStateContextType {
  paymentsState: ReturnType<typeof usePaymentsStateManager>;
}

const PaymentsStateContext = createContext<PaymentsStateContextType | null>(null);

export const usePaymentsState = () => {
  const context = useContext(PaymentsStateContext);
  if (!context) {
    throw new Error('usePaymentsState must be used within PaymentsStateProvider');
  }
  return context.paymentsState;
};

interface PaymentsStateProviderProps {
  children: React.ReactNode;
}

export const PaymentsStateProvider: React.FC<PaymentsStateProviderProps> = ({ children }) => {
  const paymentsState = usePaymentsStateManager();

  // Debug logging in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(() => {
        const status = paymentsState.getPaymentsCacheStatus();
        if (status.staleQueries > 0 || status.errorQueries > 0) {
          console.log('Payments State Status:', status);
        }
      }, 30000); // Check every 30 seconds

      return () => clearInterval(interval);
    }
  }, [paymentsState]);

  // Handle visibility change to refresh data when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible, refresh stale data
        const status = paymentsState.getPaymentsCacheStatus();
        if (status.staleQueries > 0) {
          console.log('Tab became active, refreshing stale payments data');
          paymentsState.bulkOperations.refreshPaymentsData();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [paymentsState]);

  return (
    <PaymentsStateContext.Provider value={{ paymentsState }}>
      {children}
    </PaymentsStateContext.Provider>
  );
};