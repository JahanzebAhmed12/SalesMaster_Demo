import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

import { 
  LayoutDashboard, 
  Edit, 
  BarChart3, 
  History, 
  CreditCard, 
  Settings,
  ChevronRight,
  ShoppingCart,
  LogOut,
  Menu,
  X,
  Users,
  Clock,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

interface MenuSection {
  title: string;
  icon: React.ComponentType<any>;
  items: Array<{
    title: string;
    path: string;
  }>;
}

const menuSections: MenuSection[] = [
  {
    title: "Data Entry",
    icon: Edit,
    items: [
      { title: "Sales Entry", path: "/data-entry/sales-entry" },
      { title: "Purchase Entry", path: "/data-entry/purchase-entry" },
      { title: "Closing Stock", path: "/data-entry/closing-stock" },
      { title: "Return from Customer", path: "/data-entry/return-from-customer" },
      { title: "Return to Supplier", path: "/data-entry/return-to-supplier" },
      { title: "Dumps", path: "/data-entry/dumps" },
      { title: "Cash C/F", path: "/data-entry/cash-cf" },
      { title: "Banking", path: "/data-entry/banking" },
      { title: "Expenses", path: "/data-entry/expenses" },
      { title: "On A/c Customer", path: "/data-entry/on-acc-customer" },
      { title: "On A/c Supplier", path: "/data-entry/on-acc-supplier" },
    ],
  },
  {
    title: "Daily Report",
    icon: BarChart3,
    items: [
      { title: "Daily Book Sales", path: "/daily-report/daily-book-sales" },
      { title: "Daily Book Purchase", path: "/daily-report/daily-book-purchase" },
      { title: "Stock Check", path: "/daily-report/stock-check" },
      { title: "Stock Template", path: "/daily-report/stock-template" },
      { title: "Product Sales Report", path: "/daily-report/product-sales-report" },
      { title: "Product Purchase Report", path: "/daily-report/product-purchase-report" },
      { title: "Profit Loss", path: "/daily-report/profit-loss" },
      { title: "Sales Analysis", path: "/daily-report/sales-analysis" },
      { title: "Daily Accounts", path: "/daily-report/daily-accounts" },
    ],
  },
  {
    title: "Historical Reports",
    icon: History,
    items: [
      { title: "Customer History", path: "/historical-reports/customer-history" },
      { title: "Customer Statement", path: "/historical-reports/customer-statement" },
      { title: "All Customer History", path: "/historical-reports/all-customer-history" },
      { title: "Customer Aging RPT", path: "/historical-reports/customer-aging-rpt" },
      { title: "Supplier Aging Rpt", path: "/historical-reports/supplier-aging-rpt" },
      { title: "Supplier History", path: "/historical-reports/supplier-history" },
      { title: "All Supplier History", path: "/historical-reports/all-supplier-history" },
      { title: "Purchase History", path: "/historical-reports/purchase-history" },
      { title: "Product History", path: "/historical-reports/product-history" },
      { title: "Prod/Customer History", path: "/historical-reports/prod-customer-history" },
      { title: "Date Wise Sales", path: "/historical-reports/date-wise-sales" },
      { title: "Customer Return", path: "/historical-reports/customer-return" },
      { title: "Supplier Returns", path: "/historical-reports/supplier-return" },
      { title: "Daily Book History", path: "/historical-reports/daily-book-history" },
      { title: "Full Analysis", path: "/historical-reports/full-analysis" },
      { title: "EEC Report", path: "/historical-reports/eec-report" },
    ],
  },
  {
    title: "Payments",
    icon: CreditCard,
    items: [
      { title: "Customer Payment", path: "/payments/customer-payment" },
      { title: "Supplier Payment", path: "/payments/supplier-payment" },
      { title: "Customer Payment History", path: "/payments/customer-payment-history" },
      { title: "Sup Payment History", path: "/payments/sup-payment-history" },
    ],
  },
  {
    title: "Payroll",
    icon: Users,
    items: [
      { title: "Monthly Reports", path: "/payroll/monthly-report" },
      { title: "Holiday Requests", path: "/payroll/holiday-requests" },
    ],
  },
  {
    title: "Admin Setup",
    icon: Settings,
    items: [
      { title: "User Setup", path: "/admin/user-setup" },
      { title: "Employee Database", path: "/admin/employee-database" },
      { title: "Equipment Database", path: "/admin/equipment-database" },
      { title: "Products Database", path: "/admin/products-database" },
      { title: "Customer Database", path: "/admin/customer-database" },
      { title: "Supplier Database", path: "/admin/supplier-database" },
      { title: "Expenses Database", path: "/admin/expenses-database" },
      { title: "Company Details", path: "/admin/company-details" },
      { title: "Admin Functions", path: "/admin/admin-functions" },
    ],
  },
];

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);

  const toggleSection = (title: string) => {
    setExpandedSections(prev => 
      prev.includes(title) 
        ? prev.filter(s => s !== title)
        : [...prev, title]
    );
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className="fixed top-4 left-4 z-50 md:hidden bg-white shadow-lg"
      >
        {isOpen ? <X /> : <Menu />}
      </Button>

      {/* Sidebar */}
      <div 
        className={`fixed left-0 top-0 h-full w-64 bg-white shadow-lg transform transition-transform duration-300 z-40 flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <ShoppingCart className="text-white" size={20} />
            </div>
            <div className="ml-3">
              <h2 className="font-bold text-gray-900">Tropi Fruit</h2>
              <p className="text-sm text-gray-500">Management Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {/* Dashboard Home */}
          <Link href="/dashboard">
            <a className={`nav-item flex items-center px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-primary ${
              location === '/dashboard' ? 'active' : ''
            }`}>
              <LayoutDashboard size={20} />
              <span className="ml-3 font-medium">Dashboard</span>
            </a>
          </Link>

          {/* Menu Sections */}
          {menuSections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSections.includes(section.title);
            
            return (
              <div key={section.title} className="nav-section">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="nav-item w-full flex items-center justify-between px-6 py-3 text-gray-700 hover:bg-gray-50"
                >
                  <div className="flex items-center">
                    <Icon size={20} />
                    <span className="ml-3 font-medium">{section.title}</span>
                  </div>
                  <ChevronRight 
                    size={16} 
                    className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                  />
                </button>
                
                {isExpanded && (
                  <div className="bg-gray-50">
                    {section.items.map((item) => (
                      <Link key={item.path} href={item.path}>
                        <a 
                          className={`nav-sub-item block px-12 py-2 text-sm text-gray-600 hover:text-primary ${
                            location === item.path ? 'text-primary bg-blue-25' : ''
                          }`}
                          onClick={() => {
                            if (window.innerWidth < 768) {
                              onToggle();
                            }
                          }}
                        >
                          {item.title}
                        </a>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Daily Attendance */}
          <Link href="/payroll/payroll">
            <a className={`nav-item flex items-center px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-primary ${
              location === '/payroll/payroll' ? 'active' : ''
            }`}>
              <Clock size={20} />
              <span className="ml-3 font-medium">Daily Attendance</span>
            </a>
          </Link>

          {/* Closing Time */}
          <Link href="/closing-time">
            <a className={`nav-item flex items-center px-6 py-3 text-gray-700 hover:bg-gray-50 ${
              location === '/closing-time' ? 'active' : ''
            }`}>
              <Settings size={20} />
              <span className="ml-3 font-medium">Timings Setup</span>
            </a>
          </Link>

          {/* Daily Summary */}
          <Link href="/daily-report/daily-summary">
            <a className={`nav-item flex items-center px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-primary ${
              location === '/daily-report/daily-summary' ? 'active' : ''
            }`}>
              <BarChart3 size={20} />
              <span className="ml-3 font-medium">Daily Summary</span>
            </a>
          </Link>
        </nav>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex-shrink-0">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center text-gray-500 hover:text-gray-700"
          >
            <LogOut size={20} />
            <span className="ml-3">Logout</span>
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
}
