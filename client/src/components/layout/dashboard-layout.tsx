import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import Sidebar from "./sidebar";
import Header from "./header";
import { SessionTimer } from "@/components/ui/session-timer";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  breadcrumb: string;
}

export default function DashboardLayout({ children, title, breadcrumb }: DashboardLayoutProps) {
  const { isAuthenticated } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!isAuthenticated && location !== "/") {
    window.location.href = "/";
    return null;
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} />
      
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col md:ml-64">
        <Header title={title} breadcrumb={breadcrumb} />
        
        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
      
      {/* Session Timer */}
      <SessionTimer />
    </div>
  );
}