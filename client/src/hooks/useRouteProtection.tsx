import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";

// Define all protected routes and their required permissions
// Keys should match the backend format: title.toLowerCase().replace(/\s+/g, '_')
const ROUTE_PERMISSIONS: Record<string, string> = {
  // Dashboard
  "/dashboard": "dashboard",
  
  // Data Entry section and items
  "/data-entry/sales-entry": "sales_entry",
  "/data-entry/sales-invoice": "sales_entry", 
  "/data-entry/purchase-entry": "purchase_entry",
  "/data-entry/purchase-invoice": "purchase_entry",
  "/data-entry/closing-stock": "closing_stock",
  "/data-entry/return-from-customer": "return_from_customer",
  "/data-entry/return-to-supplier": "return_to_supplier",
  "/data-entry/dumps": "dumps",
  "/data-entry/cash-cf": "till/float(c/f)",
  "/data-entry/banking": "banking",
  "/data-entry/expenses": "expenses",
  "/data-entry/on-acc-customer": "on_a/c_customer",
  "/data-entry/on-acc-supplier": "on_a/c_supplier",
  
  // Daily Report section and items
  "/daily-report/daily-book-sales": "daily_book_sales",
  "/daily-report/daily-book-purchase": "daily_book_purchase",
  "/daily-report/stock-check": "stock_check",
  "/daily-report/stock-template": "stock_template",
  "/daily-report/product-sales-report": "product_sales_report",
  "/daily-report/product-purchase-report": "product_purchase_report",
  "/daily-report/profit-loss": "profit_loss",
  "/daily-report/sales-analysis": "sales_analysis",
  "/daily-report/daily-accounts": "daily_accounts",
  "/daily-report/daily-summary": "daily_summary",
  "/daily-report/daily-sales-full-view": "daily_sales_full_view",
  "/daily-report/product-purchase-full-view": "product_purchase_full_view",
  "/daily-report/compare-with-purchase": "compare_with_purchase",
  
  // Historical Reports section and items
  "/historical-reports/customer-history": "customer_history",
  "/historical-reports/customer-statement": "customer_statement",
  "/historical-reports/all-customer-history": "all_customer_history",
  "/historical-reports/customer-aging-rpt": "customer_aging_rpt",
  "/historical-reports/supplier-aging-rpt": "supplier_aging_rpt",
  "/historical-reports/supplier-history": "supplier_history",
  "/historical-reports/all-supplier-history": "all_supplier_history",
  "/historical-reports/purchase-history": "purchase_history",
  "/historical-reports/product-history": "product_history",
  "/historical-reports/prod-customer-history": "prod/customer_history",
  "/historical-reports/date-wise-sales": "date_wise_sales",
  "/historical-reports/customer-return": "customer_return",
  "/historical-reports/supplier-return": "supplier_returns",
  "/historical-reports/daily-book-history": "daily_book_history",
  "/historical-reports/full-analysis": "full_analysis",
  "/historical-reports/eec-report": "eec_report",
  
  // Payments section and items
  "/payments/customer-payment": "customer_payment",
  "/payments/supplier-payment": "supplier_payment",
  "/payments/customer-payment-history": "customer_payment_history",
  "/payments/sup-payment-history": "sup_payment_history",
  
  // Payroll section and items
  "/payroll/monthly-report": "monthly_reports",
  "/payroll/holiday-requests": "holiday_requests",
  
  // Daily Attendance
  "/daily-attendance": "daily_attendance",
  
  // Timings Setup
  "/timings-setup": "timings_setup",
  
  // Admin Setup section and items
  "/admin/user-setup": "user_setup",
  "/admin/employee-database": "employee_database",
  "/admin/equipment-database": "equipment_database",
  "/admin/products-database": "products_database",
  "/admin/customer-database": "customer_database",
  "/admin/supplier-database": "supplier_database",
  "/admin/expenses-database": "expenses_database",
  "/admin/company-details": "company_details",
  "/admin/admin-functions": "admin_functions",
};

export function useRouteProtection() {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Check if current route requires permission
    const requiredPermission = ROUTE_PERMISSIONS[location];
    if (!requiredPermission) return; // Public route

    // Check if user has permission
    const hasPermission = permissions[requiredPermission] !== false;
    
    if (!hasPermission) {
      // Check if user has dashboard access for fallback
      const hasDashboardAccess = permissions['dashboard'] !== false;
      const redirectTo = hasDashboardAccess ? "/dashboard" : "/restricted-landing";
      
      setLocation(redirectTo);
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page",
        variant: "destructive",
      });
    }
  }, [location, permissions, user, isAuthenticated, setLocation, toast]);

  return {
    hasPermission: (route: string) => {
      const requiredPermission = ROUTE_PERMISSIONS[route];
      if (!requiredPermission) return true; // Public route
      return permissions[requiredPermission] !== false;
    },
    getRedirectPath: () => {
      const hasDashboardAccess = permissions['dashboard'] !== false;
      return hasDashboardAccess ? "/dashboard" : "/restricted-landing";
    }
  };
}