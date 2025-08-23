import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import DashboardLayout from "@/components/layout/dashboard-layout";

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
    
    const verifyAuth = async () => {
      const isAuth = await checkAuth();
      
      if (!isAuth) {
        setLocation("/");
        toast({
          title: "Session Expired",
          description: "Please log in again",
          variant: "destructive",
        });
        return;
      }
    };
    
    // Only check auth if we don't have a user or if we're not authenticated
    if (!user || !isAuthenticated) {
      verifyAuth();
    }
  }, [hydrated, checkAuth, setLocation, toast, user, isAuthenticated]);
  
  // Check permissions after auth is verified
  useEffect(() => {
    if (!hydrated || !user) return;
    
    if (requireAdmin && user.userType !== "admin") {
      setLocation("/dashboard");
      toast({
        title: "Access Denized",
        description: "You need admin privileges to access this page",
        variant: "destructive",
      });
      return;
    }
    
    if (requiredSection) {
      const sectionKey = requiredSection.toLowerCase().replace(/\s+/g, '_');
      const hasAccess = permissions[sectionKey] !== false;
      
      if (!hasAccess) {
        setLocation("/dashboard");
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