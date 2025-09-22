import React from 'react';
import { AdminStateProvider } from './AdminStateProvider';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  return (
    <AdminStateProvider>
      <div className="admin-layout">
        {children}
      </div>
    </AdminStateProvider>
  );
};