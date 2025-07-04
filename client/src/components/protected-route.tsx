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

  useEffect(() => {
    if (!hydrated) return;
    const checkAuthentication = async () => {
      const isAuth = await checkAuth();

      if (!isAuth) {
        setLocation("/");
        toast({
          title: "Access Denied",
          description: "Please log in to access this page",
          variant: "destructive",
        });
      } else if (requireAdmin && user?.userType !== "admin") {
        setLocation("/dashboard");
        toast({
          title: "Access Denied",
          description: "You need admin privileges to access this page",
          variant: "destructive",
        });
      } else if (requiredSection && permissions && permissions[requiredSection] === false) {
        setLocation("/dashboard");
        toast({
          title: "Access Denied",
          description: "You do not have permission to access this page",
          variant: "destructive",
        });
      }
    };

    checkAuthentication();
  }, [hydrated]);

  if (!hydrated) {
    return <DashboardLayout title={title} breadcrumb={breadcrumb}><div>Loading...</div></DashboardLayout>;
  }

  if (!isAuthenticated) {
    return <DashboardLayout title={title} breadcrumb={breadcrumb}><div>Loading...</div></DashboardLayout>;
  }

  if (requireAdmin && user?.userType !== "admin") {
    return <DashboardLayout title={title} breadcrumb={breadcrumb}><div>Loading...</div></DashboardLayout>;
  }

  if (requiredSection && permissions && permissions[requiredSection] === false) {
    return (
      <DashboardLayout title={title} breadcrumb={breadcrumb}>
        <div className="p-8 text-center text-red-600 font-bold text-lg">
          You do not have permission to access this page.
        </div>
      </DashboardLayout>
    );
  }

  return <DashboardLayout title={title} breadcrumb={breadcrumb}>{children}</DashboardLayout>;
}