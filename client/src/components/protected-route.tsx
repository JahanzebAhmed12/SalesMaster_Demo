import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import DashboardLayout from "@/components/layout/dashboard-layout";
import RestrictedLanding from "@/pages/restricted-landing";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requiredSection?: string;
  title: string;
  breadcrumb: string;
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
  requiredSection,
  title,
  breadcrumb,
}: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, checkAuth } = useAuth();
  const { toast } = useToast();
  const permissions = usePermissions();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Only run auth check when component mounts or when auth state changes
  useEffect(() => {
    if (!hydrated) return;
    
    // If not authenticated, redirect to login
    if (!isAuthenticated || !user) {
      setLocation("/");
      return;
    }
  }, [hydrated, isAuthenticated, user, setLocation]);
  
  // Check permissions after auth is verified
  useEffect(() => {
    if (!hydrated || !user) return;
    
    if (requireAdmin && user.userType !== "admin") {
      // Check if user has dashboard access, if not redirect to restricted landing
      const hasDashboardAccess = permissions['dashboard'] !== false;
      const redirectTo = hasDashboardAccess ? "/dashboard" : "/restricted-landing";
      setLocation(redirectTo);
      toast({
        title: "Access Denied",
        description: "You need admin privileges to access this page",
        variant: "destructive",
      });
      return;
    }
    
    if (requiredSection) {
      const sectionKey = requiredSection.toLowerCase().replace(/\s+/g, '_');
      const hasAccess = permissions[sectionKey] !== false;
      
      if (!hasAccess) {
        // Check if user has dashboard access, if not redirect to restricted landing
        const hasDashboardAccess = permissions['dashboard'] !== false;
        const redirectTo = hasDashboardAccess ? "/dashboard" : "/restricted-landing";
        setLocation(redirectTo);
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page",
          variant: "destructive",
        });
      }
    }
  }, [hydrated, user, requireAdmin, requiredSection, permissions, setLocation, toast]);

  // Show loading state while checking permissions
  if (!hydrated || !permissions) {
    return <DashboardLayout title={title} breadcrumb={breadcrumb}><div>Loading...</div></DashboardLayout>;
  }

  // Check permissions for the required section
  if (requiredSection) {
    const sectionKey = requiredSection.toLowerCase().replace(/\s+/g, '_');
    const hasAccess = permissions[sectionKey] !== false;
    
    if (!hasAccess) {
      // If this is the dashboard and user doesn't have access, show restricted landing
      if (requiredSection === 'dashboard') {
        return <RestrictedLanding />;
      }
      
      return (
        <DashboardLayout title={title} breadcrumb={breadcrumb}>
          <div className="p-8 text-center text-red-600 font-bold text-lg">
            You do not have permission to access this page.
          </div>
        </DashboardLayout>
      );
    }
  }

  return <DashboardLayout title={title} breadcrumb={breadcrumb}>{children}</DashboardLayout>;
}