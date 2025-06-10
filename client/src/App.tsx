import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/layout/dashboard-layout";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

// Data Entry Pages
import SalesEntry from "@/pages/data-entry/sales-entry";
import PurchaseEntry from "@/pages/data-entry/purchase-entry";
import ClosingStock from "@/pages/data-entry/closing-stock";
import ReturnFromCustomer from "@/pages/data-entry/return-from-customer";
import ReturnToSupplier from "@/pages/data-entry/return-to-supplier";
import Dumps from "@/pages/data-entry/dumps";
import CashCF from "@/pages/data-entry/cash-cf";
import Banking from "@/pages/data-entry/banking";
import Expenses from "@/pages/data-entry/expenses";
import OnAccCustomer from "@/pages/data-entry/on-acc-customer";
import OnAccSupplier from "@/pages/data-entry/on-acc-supplier";

// Daily Report Pages
import DailyBookSales from "@/pages/daily-report/daily-book-sales";
import DailyBookPurchase from "@/pages/daily-report/daily-book-purchase";
import StockCheck from "@/pages/daily-report/stock-check";
import ProductSalesReport from "@/pages/daily-report/product-sales-report";
import ProductPurchaseReport from "@/pages/daily-report/product-purchase-report";
import ProfitLoss from "@/pages/daily-report/profit-loss";
import StockTemplate from "@/pages/daily-report/stock-template";
import DailyAccounts from "@/pages/daily-report/daily-accounts";

// Historical Reports Pages
import CustomerHistory from "@/pages/historical-reports/customer-history";
import CustomerStatement from "@/pages/historical-reports/customer-statement";
import AllCustomerHistory from "@/pages/historical-reports/all-customer-history";
import CustomerAgingRpt from "@/pages/historical-reports/customer-aging-rpt";
import SupplierAgingRpt from "@/pages/historical-reports/supplier-aging-rpt";
import SupplierHistory from "@/pages/historical-reports/supplier-history";
import AllSupplierHistory from "@/pages/historical-reports/all-supplier-history";
import PurchaseHistory from "@/pages/historical-reports/purchase-history";
import ProductHistory from "@/pages/historical-reports/product-history";
import ProdCustomerHistory from "@/pages/historical-reports/prod-customer-history";
import DateWiseSales from "@/pages/historical-reports/date-wise-sales";
import CustomerReturn from "@/pages/historical-reports/customer-return";
import SupplierReturns from "@/pages/historical-reports/supplier-returns";
import SupplierReturn from "@/pages/historical-reports/supplier-return";
import DailyBookHistory from "@/pages/historical-reports/daily-book-history";
import FullAnalysis from "@/pages/historical-reports/full-analysis";
import EecReport from "@/pages/historical-reports/eec-report";

// Payment Pages
import CustomerPayment from "@/pages/payments/customer-payment";
import SupplierPayment from "@/pages/payments/supplier-payment";
import CustomerPaymentHistory from "@/pages/payments/customer-payment-history";
import SupPaymentHistory from "@/pages/payments/sup-payment-history";

// Admin Setup
import AdminSetup from "@/pages/admin-setup";

function AuthenticatedRoute({ component: Component, title, breadcrumb }: { component: React.ComponentType; title: string; breadcrumb: string }) {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <DashboardLayout title={title} breadcrumb={breadcrumb}>
      <Component />
    </DashboardLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/dashboard">
        <AuthenticatedRoute component={Dashboard} title="Dashboard" breadcrumb="Dashboard" />
      </Route>
      
      {/* Data Entry Routes */}
      <Route path="/data-entry/sales-entry">
        <AuthenticatedRoute component={SalesEntry} title="Sales Entry" breadcrumb="Data Entry > Sales Entry" />
      </Route>
      <Route path="/data-entry/purchase-entry">
        <AuthenticatedRoute component={PurchaseEntry} title="Purchase Entry" breadcrumb="Data Entry > Purchase Entry" />
      </Route>
      <Route path="/data-entry/closing-stock">
        <AuthenticatedRoute component={ClosingStock} title="Closing Stock" breadcrumb="Data Entry > Closing Stock" />
      </Route>
      <Route path="/data-entry/return-from-customer">
        <AuthenticatedRoute component={ReturnFromCustomer} title="Return from Customer" breadcrumb="Data Entry > Return from Customer" />
      </Route>
      <Route path="/data-entry/return-to-supplier">
        <AuthenticatedRoute component={ReturnToSupplier} title="Return to Supplier" breadcrumb="Data Entry > Return to Supplier" />
      </Route>
      <Route path="/data-entry/dumps">
        <AuthenticatedRoute component={Dumps} title="Dumps" breadcrumb="Data Entry > Dumps" />
      </Route>
      <Route path="/data-entry/cash-cf">
        <AuthenticatedRoute component={CashCF} title="Cash C/F" breadcrumb="Data Entry > Cash C/F" />
      </Route>
      <Route path="/data-entry/banking">
        <AuthenticatedRoute component={Banking} title="Banking" breadcrumb="Data Entry > Banking" />
      </Route>
      <Route path="/data-entry/expenses">
        <AuthenticatedRoute component={Expenses} title="Expenses" breadcrumb="Data Entry > Expenses" />
      </Route>
      <Route path="/data-entry/on-acc-customer">
        <AuthenticatedRoute component={OnAccCustomer} title="On A/c Customer" breadcrumb="Data Entry > On A/c Customer" />
      </Route>
      <Route path="/data-entry/on-acc-supplier">
        <AuthenticatedRoute component={OnAccSupplier} title="On A/c Supplier" breadcrumb="Data Entry > On A/c Supplier" />
      </Route>
      
      {/* Daily Report Routes */}
      <Route path="/daily-report/daily-book-sales">
        <AuthenticatedRoute component={DailyBookSales} title="Daily Book Sales" breadcrumb="Daily Report > Daily Book Sales" />
      </Route>
      <Route path="/daily-report/daily-book-purchase">
        <AuthenticatedRoute component={DailyBookPurchase} title="Daily Book Purchase" breadcrumb="Daily Report > Daily Book Purchase" />
      </Route>
      <Route path="/daily-report/stock-check">
        <AuthenticatedRoute component={StockCheck} title="Stock Check" breadcrumb="Daily Report > Stock Check" />
      </Route>
      <Route path="/daily-report/product-sales-report">
        <AuthenticatedRoute component={ProductSalesReport} title="Product Sales Report" breadcrumb="Daily Report > Product Sales Report" />
      </Route>
      <Route path="/daily-report/product-purchase-report">
        <AuthenticatedRoute component={ProductPurchaseReport} title="Product Purchase Report" breadcrumb="Daily Report > Product Purchase Report" />
      </Route>
      <Route path="/daily-report/profit-loss">
        <AuthenticatedRoute component={ProfitLoss} title="Profit/Loss Report" breadcrumb="Daily Report > Profit/Loss Report" />
      </Route>
      <Route path="/daily-report/stock-template">
        <AuthenticatedRoute component={StockTemplate} title="Stock Template" breadcrumb="Daily Report > Stock Template" />
      </Route>
      <Route path="/daily-report/daily-accounts">
        <AuthenticatedRoute component={DailyAccounts} title="Daily Accounts" breadcrumb="Daily Report > Daily Accounts" />
      </Route>
      
      {/* Historical Reports Routes */}
      <Route path="/historical-reports/customer-history">
        <AuthenticatedRoute component={CustomerHistory} title="Customer History" breadcrumb="Historical Reports > Customer History" />
      </Route>
      <Route path="/historical-reports/customer-statement">
        <AuthenticatedRoute component={CustomerStatement} title="Customer Statement" breadcrumb="Historical Reports > Customer Statement" />
      </Route>
      <Route path="/historical-reports/all-customer-history">
        <AuthenticatedRoute component={AllCustomerHistory} title="All Customer History" breadcrumb="Historical Reports > All Customer History" />
      </Route>
      <Route path="/historical-reports/customer-aging-rpt">
        <AuthenticatedRoute component={CustomerAgingRpt} title="Customer Aging Report" breadcrumb="Historical Reports > Customer Aging Report" />
      </Route>
      <Route path="/historical-reports/supplier-aging-rpt">
        <AuthenticatedRoute component={SupplierAgingRpt} title="Supplier Aging Report" breadcrumb="Historical Reports > Supplier Aging Report" />
      </Route>
      <Route path="/historical-reports/supplier-history">
        <AuthenticatedRoute component={SupplierHistory} title="Supplier History" breadcrumb="Historical Reports > Supplier History" />
      </Route>
      <Route path="/historical-reports/all-supplier-history">
        <AuthenticatedRoute component={AllSupplierHistory} title="All Supplier History" breadcrumb="Historical Reports > All Supplier History" />
      </Route>
      <Route path="/historical-reports/purchase-history">
        <AuthenticatedRoute component={PurchaseHistory} title="Purchase History" breadcrumb="Historical Reports > Purchase History" />
      </Route>
      <Route path="/historical-reports/product-history">
        <AuthenticatedRoute component={ProductHistory} title="Product History" breadcrumb="Historical Reports > Product History" />
      </Route>
      <Route path="/historical-reports/prod-customer-history">
        <AuthenticatedRoute component={ProdCustomerHistory} title="Product/Customer History" breadcrumb="Historical Reports > Product/Customer History" />
      </Route>
      <Route path="/historical-reports/date-wise-sales">
        <AuthenticatedRoute component={DateWiseSales} title="Date Wise Sales" breadcrumb="Historical Reports > Date Wise Sales" />
      </Route>
      <Route path="/historical-reports/customer-return">
        <AuthenticatedRoute component={CustomerReturn} title="Customer Return" breadcrumb="Historical Reports > Customer Return" />
      </Route>
      <Route path="/historical-reports/supplier-returns">
        <AuthenticatedRoute component={SupplierReturns} title="Supplier Returns" breadcrumb="Historical Reports > Supplier Returns" />
      </Route>
      <Route path="/historical-reports/daily-book-history">
        <AuthenticatedRoute component={DailyBookHistory} title="Daily Book History" breadcrumb="Historical Reports > Daily Book History" />
      </Route>
      <Route path="/historical-reports/full-analysis">
        <AuthenticatedRoute component={FullAnalysis} title="Full Analysis" breadcrumb="Historical Reports > Full Analysis" />
      </Route>
      <Route path="/historical-reports/eec-report">
        <AuthenticatedRoute component={EecReport} title="EEC Report" breadcrumb="Historical Reports > EEC Report" />
      </Route>
      <Route path="/historical-reports/supplier-return">
        <AuthenticatedRoute component={SupplierReturn} title="Supplier Return" breadcrumb="Historical Reports > Supplier Return" />
      </Route>
      
      {/* Payment Routes */}
      <Route path="/payments/customer-payment">
        <AuthenticatedRoute component={CustomerPayment} title="Customer Payment" breadcrumb="Payments > Customer Payment" />
      </Route>
      <Route path="/payments/supplier-payment">
        <AuthenticatedRoute component={SupplierPayment} title="Supplier Payment" breadcrumb="Payments > Supplier Payment" />
      </Route>
      <Route path="/payments/customer-payment-history">
        <AuthenticatedRoute component={CustomerPaymentHistory} title="Customer Payment History" breadcrumb="Payments > Customer Payment History" />
      </Route>
      <Route path="/payments/sup-payment-history">
        <AuthenticatedRoute component={SupPaymentHistory} title="Supplier Payment History" breadcrumb="Payments > Supplier Payment History" />
      </Route>
      
      {/* Admin Setup */}
      <Route path="/admin-setup">
        <AuthenticatedRoute component={AdminSetup} title="Admin Setup" breadcrumb="Admin Setup" />
      </Route>
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
