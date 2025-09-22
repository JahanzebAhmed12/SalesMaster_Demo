import React from 'react';
import { PaymentsStateProvider } from './PaymentsStateProvider';

interface PaymentsLayoutProps {
  children: React.ReactNode;
}

export const PaymentsLayout: React.FC<PaymentsLayoutProps> = ({ children }) => {
  return (
    <PaymentsStateProvider>
      <div className="payments-layout">
        {children}
      </div>
    </PaymentsStateProvider>
  );
};