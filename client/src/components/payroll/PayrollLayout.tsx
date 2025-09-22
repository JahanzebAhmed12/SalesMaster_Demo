import React from 'react';
import { PayrollStateProvider } from './PayrollStateProvider';

interface PayrollLayoutProps {
  children: React.ReactNode;
}

export const PayrollLayout: React.FC<PayrollLayoutProps> = ({ children }) => {
  return (
    <PayrollStateProvider>
      <div className="payroll-layout">
        {children}
      </div>
    </PayrollStateProvider>
  );
};