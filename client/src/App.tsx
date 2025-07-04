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
import MonthlyReports from "@/pages/payroll/monthly-reports";
import Payroll from "@/pages/payroll/payroll";

// Data Entry Pages
import SalesEntry from "@/pages/data-entry/sales-entry";
import SalesInvoice from "./pages/data-entry/sales-invoice";
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
import SalesAnalysis from "@/pages/daily-report/sales-analysis";

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
import SupplierReturn from "@/pages/historical-reports/supplier-return";
import DailyBookHistory from "@/pages/historical-reports/daily-book-history";
import FullAnalysis from "@/pages/historical-reports/full-analysis";
import EecReport from "@/pages/historical-reports/eec-report";

// Payment Pages
import CustomerPayment from "@/pages/payments/customer-payment";
import SupplierPayment from "@/pages/payments/supplier-payment";
import CustomerPaymentHistory from "@/pages/payments/customer-payment-history";
import SupPaymentHistory from "@/pages/payments/sup-payment-history";

// Admin Pages
import ProductsDatabase from "@/pages/admin/products-database";
import ViewNonProducts from "./pages/admin/view-nonproduct";
import AddNonProducts from "./pages/admin/add-nonproduct";
import UserDatabase from "@/pages/admin/user-database";
import UserDatabaseEdit from "@/pages/admin/user-database-edit";
import CustomerDatabase from "@/pages/admin/customer-database";
import CustomerDatabaseEdit from "@/pages/admin/customer-database-edit";
import SupplierDatabase from "@/pages/admin/supplier-database";
import SupplierDatabaseEdit from "@/pages/admin/supplier-database-edit";
import ExpensesDatabase from "@/pages/admin/expenses-database";
import ExpensesDatabaseEdit from "@/pages/admin/expenses-database-edit";
import CompanyDetails from "@/pages/admin/company-details";
import AdminFunctions from "./pages/admin/admin-functions";
import UserAdd from "./pages/admin/user-database-add";

// Admin Setup
import ClosingTime from "@/pages/closing-time";
import PurchaseInvoice from "./pages/data-entry/purchase-invoice";
import InvoicePrintPage from "@/pages/print/invoice";
import DotMatrixInvoicePrintPage from "@/pages/print/dot-matrix-invoice";
import PurchaseInvoicePrintPage from "@/pages/print/purchase-invoice";
import DeliveryNotePrintPage from "./pages/print/delivery-note";
import PackingListPrintPage from "./pages/print/packing-list";

// User Profile
import UserProfile from "./pages/profile/user-profile";
import ProtectedRoute from "@/components/protected-route";

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
        <ProtectedRoute requiredSection="data_entry" title="Sales Entry" breadcrumb="Data Entry > Sales Entry">
          <SalesEntry />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/sales-invoice">
        <ProtectedRoute requiredSection="data_entry" title="Sales Invoice" breadcrumb="Data Entry > Sales Invoice">
          <SalesInvoice />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/purchase-entry">
        <ProtectedRoute requiredSection="data_entry" title="Purchase Entry" breadcrumb="Data Entry > Purchase Entry">
          <PurchaseEntry />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/purchase-invoice">
        <ProtectedRoute requiredSection="data_entry" title="Purchase Invoice" breadcrumb="Data Entry > Purchase Invoice">
          <PurchaseInvoice />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/closing-stock">
        <ProtectedRoute requiredSection="data_entry" title="Closing Stock" breadcrumb="Data Entry > Closing Stock">
          <ClosingStock />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/return-from-customer">
        <ProtectedRoute requiredSection="data_entry" title="Return from Customer" breadcrumb="Data Entry > Return from Customer">
          <ReturnFromCustomer />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/return-to-supplier">
        <ProtectedRoute requiredSection="data_entry" title="Return to Supplier" breadcrumb="Data Entry > Return to Supplier">
          <ReturnToSupplier />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/dumps">
        <ProtectedRoute requiredSection="data_entry" title="Dumps" breadcrumb="Data Entry > Dumps">
          <Dumps />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/cash-cf">
        <ProtectedRoute requiredSection="data_entry" title="Cash C/F" breadcrumb="Data Entry > Cash C/F">
          <CashCF />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/banking">
        <ProtectedRoute requiredSection="data_entry" title="Banking" breadcrumb="Data Entry > Banking">
          <Banking />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/expenses">
        <ProtectedRoute requiredSection="data_entry" title="Expenses" breadcrumb="Data Entry > Expenses">
          <Expenses />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/on-acc-customer">
        <ProtectedRoute requiredSection="data_entry" title="On A/c Customer" breadcrumb="Data Entry > On A/c Customer">
          <OnAccCustomer />
        </ProtectedRoute>
      </Route>
      <Route path="/data-entry/on-acc-supplier">
        <ProtectedRoute requiredSection="data_entry" title="On A/c Supplier" breadcrumb="Data Entry > On A/c Supplier">
          <OnAccSupplier />
        </ProtectedRoute>
      </Route>
      
      {/* Daily Report Routes */}
      <Route path="/daily-report/daily-book-sales">
        <ProtectedRoute requiredSection="daily_reports" title="Daily Book Sales" breadcrumb="Daily Report > Daily Book Sales">
          <DailyBookSales />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/daily-book-purchase">
        <ProtectedRoute requiredSection="daily_reports" title="Daily Book Purchase" breadcrumb="Daily Report > Daily Book Purchase">
          <DailyBookPurchase />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/stock-check">
        <ProtectedRoute requiredSection="daily_reports" title="Stock Check" breadcrumb="Daily Report > Stock Check">
          <StockCheck />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/product-sales-report">
        <ProtectedRoute requiredSection="daily_reports" title="Product Sales Report" breadcrumb="Daily Report > Product Sales Report">
          <ProductSalesReport />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/product-purchase-report">
        <ProtectedRoute requiredSection="daily_reports" title="Product Purchase Report" breadcrumb="Daily Report > Product Purchase Report">
          <ProductPurchaseReport />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/profit-loss">
        <ProtectedRoute requiredSection="daily_reports" title="Profit/Loss Report" breadcrumb="Daily Report > Profit/Loss Report">
          <ProfitLoss />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/stock-template">
        <ProtectedRoute requiredSection="daily_reports" title="Stock Template" breadcrumb="Daily Report > Stock Template">
          <StockTemplate />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/sales-analysis">
        <ProtectedRoute requiredSection="daily_reports" title="Sales Analysis" breadcrumb="Daily Report > Sales Analysis">
          <SalesAnalysis />
        </ProtectedRoute>
      </Route>
     
      <Route path="/daily-report/daily-accounts">
        <ProtectedRoute requiredSection="daily_reports" title="Daily Accounts" breadcrumb="Daily Report > Daily Accounts">
          <DailyAccounts />
        </ProtectedRoute>
      </Route>
      
      {/* Historical Reports Routes */}
      <Route path="/historical-reports/customer-history">
        <ProtectedRoute requiredSection="historical_reports" title="Customer History" breadcrumb="Historical Reports > Customer History">
          <CustomerHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/customer-statement">
        <ProtectedRoute requiredSection="historical_reports" title="Customer Statement" breadcrumb="Historical Reports > Customer Statement">
          <CustomerStatement />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/all-customer-history">
        <ProtectedRoute requiredSection="historical_reports" title="All Customer History" breadcrumb="Historical Reports > All Customer History">
          <AllCustomerHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/customer-aging-rpt">
        <ProtectedRoute requiredSection="historical_reports" title="Customer Aging Report" breadcrumb="Historical Reports > Customer Aging Report">
          <CustomerAgingRpt />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/supplier-aging-rpt">
        <ProtectedRoute requiredSection="historical_reports" title="Supplier Aging Report" breadcrumb="Historical Reports > Supplier Aging Report">
          <SupplierAgingRpt />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/supplier-history">
        <ProtectedRoute requiredSection="historical_reports" title="Supplier History" breadcrumb="Historical Reports > Supplier History">
          <SupplierHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/all-supplier-history">
        <ProtectedRoute requiredSection="historical_reports" title="All Supplier History" breadcrumb="Historical Reports > All Supplier History">
          <AllSupplierHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/purchase-history">
        <ProtectedRoute requiredSection="historical_reports" title="Purchase History" breadcrumb="Historical Reports > Purchase History">
          <PurchaseHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/product-history">
        <ProtectedRoute requiredSection="historical_reports" title="Product History" breadcrumb="Historical Reports > Product History">
          <ProductHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/prod-customer-history">
        <ProtectedRoute requiredSection="historical_reports" title="Product/Customer History" breadcrumb="Historical Reports > Product/Customer History">
          <ProdCustomerHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/date-wise-sales">
        <ProtectedRoute requiredSection="historical_reports" title="Date Wise Sales" breadcrumb="Historical Reports > Date Wise Sales">
          <DateWiseSales />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/customer-return">
        <ProtectedRoute requiredSection="historical_reports" title="Customer Return" breadcrumb="Historical Reports > Customer Return">
          <CustomerReturn />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/supplier-return">
        <ProtectedRoute requiredSection="historical_reports" title="Supplier Returns" breadcrumb="Historical Reports > Supplier Returns">
          <SupplierReturn />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/daily-book-history">
        <ProtectedRoute requiredSection="historical_reports" title="Daily Book History" breadcrumb="Historical Reports > Daily Book History">
          <DailyBookHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/full-analysis">
        <ProtectedRoute requiredSection="historical_reports" title="Full Analysis" breadcrumb="Historical Reports > Full Analysis">
          <FullAnalysis />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/eec-report">
        <ProtectedRoute requiredSection="historical_reports" title="EEC Report" breadcrumb="Historical Reports > EEC Report">
          <EecReport />
        </ProtectedRoute>
      </Route>
      <Route path="/historical-reports/supplier-return">
        <ProtectedRoute requiredSection="historical_reports" title="Supplier Return" breadcrumb="Historical Reports > Supplier Return">
          <SupplierReturn />
        </ProtectedRoute>
      </Route>
      
      {/* Payment Routes */}
      <Route path="/payments/customer-payment">
        <ProtectedRoute requiredSection="payments" title="Customer Payment" breadcrumb="Payments > Customer Payment">
          <CustomerPayment />
        </ProtectedRoute>
      </Route>
      <Route path="/payments/supplier-payment">
        <ProtectedRoute requiredSection="payments" title="Supplier Payment" breadcrumb="Payments > Supplier Payment">
          <SupplierPayment />
        </ProtectedRoute>
      </Route>
      <Route path="/payments/customer-payment-history">
        <ProtectedRoute requiredSection="payments" title="Customer Payment History" breadcrumb="Payments > Customer Payment History">
          <CustomerPaymentHistory />
        </ProtectedRoute>
      </Route>
      <Route path="/payments/sup-payment-history">
        <ProtectedRoute requiredSection="payments" title="Supplier Payment History" breadcrumb="Payments > Supplier Payment History">
          <SupPaymentHistory />
        </ProtectedRoute>
      </Route>
      {/* Attenedence and Payroll */}

      <Route path="/payroll/monthly-report">
        <ProtectedRoute requiredSection="payroll" title="Monthly Report" breadcrumb="Monthly Report">
          <MonthlyReports />
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/payroll">
        <ProtectedRoute requiredSection="payroll" title="Yearly Report" breadcrumb="Yearly Report">
          <Payroll />
        </ProtectedRoute>
      </Route>
      {/* Admin Pages */}
     <Route path="/admin/products-database">
        <ProtectedRoute requiredSection="admin_setup" title="Products Database" breadcrumb="Products Database">
          <ProductsDatabase />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/view-nonproduct">
        <ProtectedRoute requiredSection="admin_setup" title="View NonProduct" breadcrumb="View Non Product">
          <ViewNonProducts />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/add-nonproduct/:id?">
        <ProtectedRoute requiredSection="admin_setup" title="Add/Edit NonProduct" breadcrumb="Add/Edit NonProduct">
          <AddNonProducts />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/user-setup">
        <ProtectedRoute requiredSection="admin_setup" title="User Database" breadcrumb="User Database">
          <UserDatabase />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/user-database-add/:id?">
        <ProtectedRoute requiredSection="admin_setup" title="User Add" breadcrumb="User Add">
          <UserAdd />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer-database">
        <ProtectedRoute requiredSection="admin_setup" title="Customer Database" breadcrumb="Customer Database">
          <CustomerDatabase />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customer-database-edit/:id?">
        <ProtectedRoute requiredSection="admin_setup" title="Customer Database Edit" breadcrumb="Customer Database Edit">
          <CustomerDatabaseEdit />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/supplier-database">
        <ProtectedRoute requiredSection="admin_setup" title="Supplier Database" breadcrumb="Supplier Database">
          <SupplierDatabase />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/supplier-database-edit/:id?">
        <ProtectedRoute requiredSection="admin_setup" title="Supplier Database Edit" breadcrumb="Supplier Database Edit">
          <SupplierDatabaseEdit />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/expenses-database">
        <ProtectedRoute requiredSection="admin_setup" title="Expenses Database" breadcrumb="Expenses Database">
          <ExpensesDatabase />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/expenses-database-edit/:id?">
        <ProtectedRoute requiredSection="admin_setup" title="Expenses Database Edit" breadcrumb="Expenses Database Edit">
          <ExpensesDatabaseEdit />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/company-details">
        <ProtectedRoute requiredSection="admin_setup" title="Company Details" breadcrumb="Company Details">
          <CompanyDetails />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/admin-functions">
        <ProtectedRoute requiredSection="admin_setup" title="Admin Functions" breadcrumb="Admin Functions">
          <AdminFunctions />
        </ProtectedRoute>
      </Route>


      {/* Admin Setup */}
      <Route path="/closing-time">
        <ProtectedRoute requiredSection="admin_setup" title="Closing Time" breadcrumb="Closing Time">
          <ClosingTime />
        </ProtectedRoute>
      </Route>

      {/* User Profile */}
      <Route path="/profile/user-profile">
        <ProtectedRoute requiredSection="profile" title="User Profile" breadcrumb="User Profile">
          <UserProfile />
        </ProtectedRoute>
      </Route>
      
      {/* Print Invoice Route (public) */}
      <Route path="/print/invoice/:invoiceNumber" component={InvoicePrintPage} />
      {/* Dot Matrix Print Invoice Route (public) */}
      <Route path="/print/dot-matrix-invoice/:invoiceNumber" component={DotMatrixInvoicePrintPage} />
      <Route path="/print/purchase-invoice/:invoiceId" component={PurchaseInvoicePrintPage} />
      <Route path="/print/delivery-note/:invoiceNumber">
        <DeliveryNotePrintPage />
      </Route>
      <Route path="/print/packing-list/:invoiceNumber" component={PackingListPrintPage} />
      
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
