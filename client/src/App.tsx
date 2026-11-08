import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { useAutoLogout } from "@/hooks/useAutoLogout";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";
import { SessionStatus } from "@/components/session-status";
import DashboardLayout from "@/components/layout/dashboard-layout";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import MonthlyReports from "@/pages/payroll/monthly-reports";
import Payroll from "@/pages/payroll/payroll";
import HolidayRequests from "@/pages/payroll/holiday-requests";
import HolidayRequestForm from "@/pages/payroll/holiday-request-form";
import HolidayRequestView from "@/pages/payroll/holiday-request-view";
import HolidayRequestPrint from "@/pages/print/holiday-request-print";
import EmployeeContractPrint from "@/pages/print/employee-contract-print";
import EmployeeJoiningForm from "@/pages/print/employee-joining-form";
import PaymentReceiptPrint from "@/pages/print/payment-receipt-print";
import SupplierPaymentReceiptPrint from "@/pages/print/supplier-payment-receipt";
import SupplierReturnPrintPage from "@/pages/print/supplier-return";

// Data Entry Pages
import SalesEntry from "@/pages/data-entry/sales-entry";
import SalesInvoice from "./pages/data-entry/sales-invoice";
import PurchaseEntry from "@/pages/data-entry/purchase-entry";
import ClosingStock from "@/pages/data-entry/closing-stock";
import ReturnFromCustomer from "@/pages/data-entry/return-from-customer";
import CustomerDiscount from "@/pages/data-entry/customer-discount";
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
import DailySummary from "@/pages/daily-report/daily-summary";
import SalesAnalysis from "@/pages/daily-report/sales-analysis";
import DailySalesFullView from "@/pages/daily-report/daily-sales-full-view";
import ProductPurchaseFullView from "@/pages/daily-report/product-purchase-full-view";
import ProductSalesHistoryPage from './pages/daily-report/product-sales-history';
import ProductPurchaseHistoryPage from './pages/daily-report/product-purchase-history';
import CompareWithPurchasePage from './pages/daily-report/compare-with-purchase';
import SupplierPurchaseHistoryPage from './pages/daily-report/supplier-purchase-history';

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
import CustomerDatabase from "@/pages/admin/customer-database";
import CustomerDatabaseEdit from "@/pages/admin/customer-database-edit";
import SupplierDatabase from "@/pages/admin/supplier-database";
import SupplierDatabaseEdit from "@/pages/admin/supplier-database-edit";
import ExpensesDatabase from "@/pages/admin/expenses-database";
import ExpensesDatabaseEdit from "@/pages/admin/expenses-database-edit";
import CompanyDetails from "@/pages/admin/company-details";
import PrintServiceSettings from "@/pages/admin/print-service-settings";
import AdminFunctions from "./pages/admin/admin-functions";
import UserAdd from "./pages/admin/user-database-add";
import EmployeeDatabase from "@/pages/admin/employee-database";
import EmployeeDatabaseEdit from "@/pages/admin/employee-database-edit";
import EquipmentDatabase from "@/pages/admin/equipment-database";
import EquipmentDatabaseEdit from "@/pages/admin/equipment-database-edit";

// Admin Setup
import ClosingTime from "@/pages/closing-time";
import PurchaseInvoice from "./pages/data-entry/purchase-invoice";
import InvoicePrintPage from "@/pages/print/invoice";
import A5InvoicePrintPage from "@/pages/print/a5-invoice";
import DotMatrixInvoicePrintPage from "@/pages/print/dot-matrix-invoice";
import CustomerLabelPrintPage from "@/pages/print/customer-label";
import DotMatrixPaymentPrintPage from "@/pages/print/dot-matrix-payment";
import PurchaseInvoicePrintPage from "@/pages/print/purchase-invoice";
import DeliveryNotePrintPage from "./pages/print/delivery-note";
import PackingListPrintPage from "./pages/print/packing-list";
import DailySummaryPrintPage from "@/pages/print/daily-summary-print";
import BulkDotMatrixPrintPage from "@/pages/print/bulk-dot-matrix";
import BulkA4InvoicePrintPage from "@/pages/print/bulk-a4-invoice";
import BulkA5InvoicePrintPage from "@/pages/print/bulk-a5-invoice";
import BulkPackingListPrintPage from "@/pages/print/bulk-packing-list";
import BulkCustomerLabelPrintPage from "@/pages/print/bulk-customer-label";

// User Profile
import UserProfile from "./pages/profile/user-profile";
import ProtectedRoute from "@/components/protected-route";
import RestrictedLanding from "./pages/restricted-landing";
import TestPermissions from "./pages/test-permissions";
import { useRouteProtection } from "@/hooks/useRouteProtection";
import { PayrollStateProvider } from "@/components/payroll/PayrollStateProvider";
import { PaymentsStateProvider } from "@/components/payments/PaymentsStateProvider";

function Router() {
  // Initialize route protection - temporarily disabled to fix infinite refresh
  // useRouteProtection();

  return (
    <Switch>
      <Route path="/">
        <Login />
      </Route>
      <Route path="/restricted-landing">
        <DashboardLayout title="Restricted Access" breadcrumb="Dashboard > Restricted Access">
          <RestrictedLanding />
        </DashboardLayout>
      </Route>
      <Route path="/test-permissions">
        <DashboardLayout title="Test Permissions" breadcrumb="Test > Permissions">
          <TestPermissions />
        </DashboardLayout>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute requiredSection="dashboard" title="Dashboard" breadcrumb="Dashboard > Dashboard">
          <Dashboard />
        </ProtectedRoute>
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
      <Route path="/data-entry/customer-discount">
        <ProtectedRoute requiredSection="data_entry" title="Customer Discount" breadcrumb="Data Entry > Customer Discount">
          <CustomerDiscount />
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
      <Route path="/daily-report/daily-summary">
        <ProtectedRoute requiredSection="daily_summary" title="Daily Summary" breadcrumb="Daily Report > Daily Summary">
          <DailySummary />
        </ProtectedRoute>
      </Route>
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
      <Route path="/daily-report/daily-sales-full-view">
        <ProtectedRoute requiredSection="daily_reports" title="Daily Sales Full View" breadcrumb="Daily Report > Daily Sales Full View">
          <DailySalesFullView />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/product-purchase-full-view">
        <ProtectedRoute requiredSection="daily_reports" title="Product Purchase Full View" breadcrumb="Daily Report > Product Purchase Full View">
          <ProductPurchaseFullView />
        </ProtectedRoute>
      </Route>
      <Route path="/reports/product-sales-history">
        <ProtectedRoute requiredSection="historical_reports" title="Product Sales History" breadcrumb="Historical Reports > Product Sales History">
          <ProductSalesHistoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/reports/product-purchase-history">
        <ProtectedRoute requiredSection="historical_reports" title="Product Purchase History" breadcrumb="Historical Reports > Product Purchase History">
          <ProductPurchaseHistoryPage />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/compare-with-purchase">
        <ProtectedRoute requiredSection="daily_reports" title="Compare with Purchase" breadcrumb="Daily Report > Compare with Purchase">
          <CompareWithPurchasePage />
        </ProtectedRoute>
      </Route>
      <Route path="/daily-report/supplier-purchase-history/:supplierId">
        <ProtectedRoute requiredSection="daily_reports" title="Supplier Purchase History" breadcrumb="Daily Report > Supplier Purchase History">
          <SupplierPurchaseHistoryPage />
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
          <PaymentsStateProvider>
            <CustomerPayment />
          </PaymentsStateProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/payments/supplier-payment">
        <ProtectedRoute requiredSection="payments" title="Supplier Payment" breadcrumb="Payments > Supplier Payment">
          <PaymentsStateProvider>
            <SupplierPayment />
          </PaymentsStateProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/payments/customer-payment-history">
        <ProtectedRoute requiredSection="payments" title="Customer Payment History" breadcrumb="Payments > Customer Payment History">
          <PaymentsStateProvider>
            <CustomerPaymentHistory />
          </PaymentsStateProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/payments/sup-payment-history">
        <ProtectedRoute requiredSection="payments" title="Supplier Payment History" breadcrumb="Payments > Supplier Payment History">
          <PaymentsStateProvider>
            <SupPaymentHistory />
          </PaymentsStateProvider>
        </ProtectedRoute>
      </Route>
      {/* Attenedence and Payroll */}

      {/* Payroll Section */}
      <Route path="/payroll/monthly-report">
        <ProtectedRoute requiredSection="payroll" title="Monthly Reports" breadcrumb="Payroll > Monthly Reports">
          <PayrollStateProvider>
            <MonthlyReports />
          </PayrollStateProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/holiday-requests">
        <ProtectedRoute requiredSection="payroll" title="Holiday Requests" breadcrumb="Payroll > Holiday Requests">
          <PayrollStateProvider>
            <HolidayRequests />
          </PayrollStateProvider>
        </ProtectedRoute>
      </Route>

      {/* Daily Attendance Section */}
      <Route path="/daily-attendance">
        <ProtectedRoute requiredSection="daily_attendance" title="Daily Attendance" breadcrumb="Daily Attendance">
          <PayrollStateProvider>
            <Payroll />
          </PayrollStateProvider>
        </ProtectedRoute>
      </Route>

      {/* Timings Setup Section */}
      <Route path="/timings-setup">
        <ProtectedRoute requiredSection="timings_setup" title="Timings Setup" breadcrumb="Timings Setup">
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-4">Timings Setup</h1>
            <p>Timings setup page content will be implemented here.</p>
          </div>
        </ProtectedRoute>
      </Route>

      {/* Daily Summary Section */}
      <Route path="/daily-summary">
        <ProtectedRoute requiredSection="daily_summary" title="Daily Summary" breadcrumb="Daily Summary">
          <DailySummary />
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/holiday-requests/new">
        <ProtectedRoute requiredSection="payroll" title="New Holiday Request" breadcrumb="Payroll > Holiday Requests > New">
          <PayrollStateProvider>
            <HolidayRequestForm />
          </PayrollStateProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/holiday-requests/edit/:id">
        <ProtectedRoute requiredSection="payroll" title="Edit Holiday Request" breadcrumb="Payroll > Holiday Requests > Edit">
          <PayrollStateProvider>
            <HolidayRequestForm />
          </PayrollStateProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/payroll/holiday-requests/view/:id">
        <ProtectedRoute requiredSection="payroll" title="View Holiday Request" breadcrumb="Payroll > Holiday Requests > View">
          <PayrollStateProvider>
            <HolidayRequestView />
          </PayrollStateProvider>
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
      <Route path="/admin/employee-database">
        <ProtectedRoute requiredSection="admin_setup" title="Employee Database" breadcrumb="Employee Database">
          <EmployeeDatabase />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/employee-database-edit/:id?">
        <ProtectedRoute requiredSection="admin_setup" title="Employee Database Edit" breadcrumb="Employee Database Edit">
          <EmployeeDatabaseEdit />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/equipment-database">
        <ProtectedRoute requiredSection="admin_setup" title="Equipment Database" breadcrumb="Equipment Database">
          <EquipmentDatabase />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/equipment-database-edit">
        <ProtectedRoute requiredSection="admin_setup" title="Equipment Database Edit" breadcrumb="Equipment Database Edit">
          <EquipmentDatabaseEdit />
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
      <Route path="/admin/print-service-settings">
        <ProtectedRoute requiredSection="admin_setup" title="Print Service Settings" breadcrumb="Print Service Settings">
          <PrintServiceSettings />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/admin-functions">
        <ProtectedRoute requiredSection="admin_setup" title="Admin Functions" breadcrumb="Admin Functions">
          <AdminFunctions />
        </ProtectedRoute>
      </Route>


      {/* Admin Setup */}
      <Route path="/closing-time">
        <ProtectedRoute requiredSection="setup" title="Closing Time" breadcrumb="Closing Time">
          <ClosingTime />
        </ProtectedRoute>
      </Route>

      {/* User Profile */}
      <Route path="/profile/user-profile">
        <ProtectedRoute requiredSection="profile" title="User Profile" breadcrumb="User Profile">
          <UserProfile />
        </ProtectedRoute>
      </Route>

      {/* Print Routes (public) */}
      <Route path="/print/invoice/:invoiceNumber">
        <InvoicePrintPage />
      </Route>
      <Route path="/print/daily-summary">
        <DailySummaryPrintPage />
      </Route>
      <Route path="/print/a5-invoice/:invoiceNumber">
        <A5InvoicePrintPage />
      </Route>
      <Route path="/print/dot-matrix-invoice/:invoiceNumber">
        <DotMatrixInvoicePrintPage />
      </Route>
      <Route path="/print/bulk-dot-matrix">
        <BulkDotMatrixPrintPage />
      </Route>
      <Route path="/print/bulk-a4-invoice">
        <BulkA4InvoicePrintPage />
      </Route>
      <Route path="/print/bulk-a5-invoice">
        <BulkA5InvoicePrintPage />
      </Route>
      <Route path="/print/bulk-packing-list">
        <BulkPackingListPrintPage />
      </Route>
      <Route path="/print/dot-matrix-payment/:batchId">
        <DotMatrixPaymentPrintPage />
      </Route>
      <Route path="/print/purchase-invoice/:invoiceId">
        <PurchaseInvoicePrintPage />
      </Route>
      <Route path="/print/delivery-note/:invoiceNumber">
        <DeliveryNotePrintPage />
      </Route>
      <Route path="/print/packing-list/:invoiceNumber">
        <PackingListPrintPage />
      </Route>
      <Route path="/print/customer-label/:invoiceNumber">
        <CustomerLabelPrintPage />
      </Route>
      <Route path="/print/bulk-customer-label">
        <BulkCustomerLabelPrintPage />
      </Route>
      <Route path="/print/holiday-request/:id">
        <HolidayRequestPrint />
      </Route>
      <Route path="/print/employee-contract/:id">
        <EmployeeContractPrint />
      </Route>
      <Route path="/print/employee-joining-form/:id">
        <EmployeeJoiningForm />
      </Route>
      <Route path="/print/payment-receipt/:paymentId/:paymentType">
        <PaymentReceiptPrint />
      </Route>
      <Route path="/print/supplier-payment-receipt/:paymentId">
        <SupplierPaymentReceiptPrint />
      </Route>
      <Route path="/print/supplier-return/:returnId">
        <SupplierReturnPrintPage />
      </Route>

      {/* Fallback to 404 */}
      <Route>
        <NotFound />
      </Route>
    </Switch>
  );
}

function InventorySync() {
  const { isAuthenticated } = useAuth();
  useCrossTabSync({
    enabled: isAuthenticated,
    enablePolling: true,
    pollingIntervalMs: 30000,
  });
  return null;
}

function App() {
  const { checkAuth } = useAuth();
  
  // Initialize auto-logout functionality
  useAutoLogout();

  useEffect(() => {
    // Check authentication status once on app startup
    checkAuth().catch(console.error);
  }, [checkAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TooltipProvider>
          <Toaster />
          <SessionStatus />
          <InventorySync />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
