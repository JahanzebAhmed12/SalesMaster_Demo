import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, checkAuth } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
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
      }
    };

    checkAuthentication();
  }, [checkAuth, requireAdmin, setLocation, toast, user?.userType]);

  if (!isAuthenticated) {
    return <div>Loading...</div>;
  }

  if (requireAdmin && user?.userType !== "admin") {
    return <div>Loading...</div>;
  }

  return <>{children}</>;
} 