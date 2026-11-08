import { useState } from "react";
import { Link, useLocation } from "wouter";

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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";

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
  // {
  //   title: "Dashboard",
  //   icon: LayoutDashboard,
  //   items: [
  //     { title: "Dashboard", path: "/dashboard" },
  //   ],
  // },
  {
    title: "Data Entry",
    icon: Edit,
    items: [
      { title: "Sales Entry", path: "/data-entry/sales-entry" },
      { title: "Purchase Entry", path: "/data-entry/purchase-entry" },
      { title: "Closing Stock", path: "/data-entry/closing-stock" },
      { title: "Return from Customer", path: "/data-entry/return-from-customer" },
      { title: "Customer Discount", path: "/data-entry/customer-discount" },
      { title: "Return to Supplier", path: "/data-entry/return-to-supplier" },
      { title: "Dumps", path: "/data-entry/dumps" },
      { title: "Till/Float(C/F)", path: "/data-entry/cash-cf" },
      { title: "Banking", path: "/data-entry/banking" },
      { title: "Expenses", path: "/data-entry/expenses" },
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
      { title: "Print Service Settings", path: "/admin/print-service-settings" },
      { title: "Admin Functions", path: "/admin/admin-functions" },
    ],
  },
];

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const permissions = usePermissions();

  const toggleSection = (title: string, event?: React.MouseEvent) => {
    // Prevent event propagation to avoid conflicts
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    setExpandedSections(prev =>
      prev.includes(title)
        ? prev.filter(s => s !== title)
        : [...prev, title]
    );
  };

  const handleLogout = (event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    logout('manual');
  };

  // Handle navigation clicks - close mobile menu on navigation
  const handleNavClick = () => {
    // Close mobile menu when navigating on mobile/tablet
    if (window.innerWidth < 1024) { // lg breakpoint
      onToggle();
    }
  };

  // Helper function to check if user has permission for a section
  const hasPermission = (sectionKey: string) => {
    // If no permissions are loaded yet, allow access (fallback)
    if (!permissions || Object.keys(permissions).length === 0) {
      return true;
    }
    return permissions[sectionKey] !== false; // Default to true if not explicitly set to false
  };

  // Filter menu sections based on permissions
  const filteredMenuSections = menuSections
    .map(section => {
      const sectionKey = section.title.toLowerCase().replace(/\s+/g, '_');

      // Skip section if no permission
      if (!hasPermission(sectionKey)) return null;

      // Filter items based on permissions
      const filteredItems = section.items.filter(item => {
        const itemKey = item.title.toLowerCase().replace(/\s+/g, '_');
        return hasPermission(itemKey);
      });

      // Only include section if it has visible items or is the Dashboard section
      if (filteredItems.length > 0 || section.title === 'Dashboard') {
        return { ...section, items: filteredItems };
      }
      return null;
    })
    .filter(Boolean);


  return (
    <>
      {/* Mobile/Tablet menu button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white shadow-lg"
      >
        {isOpen ? <X /> : <Menu />}
      </Button>

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white shadow-lg transform transition-transform duration-300 z-40 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0`}
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
          {hasPermission('dashboard') && (
            <Link href="/dashboard">
              <a 
                className={`nav-item flex items-center px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-primary ${location === '/dashboard' ? 'active' : ''
                }`}
                onClick={handleNavClick}
              >
                <LayoutDashboard size={20} />
                <span className="ml-3 font-medium">Dashboard</span>
              </a>
            </Link>
          )}

          {/* Menu Sections */}
          {filteredMenuSections.map((section) => {
            if (!section) return null;

            const Icon = section.icon;
            const isExpanded = expandedSections.includes(section.title);

            return (
              <div key={section.title} className="nav-section">
                <button
                  onClick={(e) => toggleSection(section.title, e)}
                  className="nav-item w-full flex items-center justify-between px-6 py-3 text-gray-700 hover:bg-gray-50 focus:outline-none focus:bg-gray-50"
                  type="button"
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

                {isExpanded && section.items.length > 0 && (
                  <div className="bg-gray-50">
                    {section.items.map((item) => (
                      <Link key={item.path} href={item.path}>
                        <a
                          className={`nav-sub-item block px-12 py-2 text-sm text-gray-600 hover:text-primary transition-colors ${location === item.path ? 'text-primary bg-blue-50 font-medium' : ''
                            }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNavClick();
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
          {hasPermission('daily_attendance') && (
            <Link href="/daily-attendance">
              <a 
                className={`nav-item flex items-center px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-primary ${location === '/daily-attendance' ? 'active' : ''
                }`}
                onClick={handleNavClick}
              >
                <Clock size={20} />
                <span className="ml-3 font-medium">Daily Attendance</span>
              </a>
            </Link>
          )}

          {/* Timings Setup */}
          {hasPermission('timings_setup') && (
            <Link href="/closing-time">
              <a 
                className={`nav-item flex items-center px-6 py-3 text-gray-700 hover:bg-gray-50 ${location === '/closing-time' ? 'active' : ''
                }`}
                onClick={handleNavClick}
              >
                <Clock size={20} />
                <span className="ml-3 font-medium">Timings Setup</span>
              </a>
            </Link>
          )}

          {/* Daily Summary */}
          {hasPermission('daily_summary') && (
            <Link href="/daily-report/daily-summary">
              <a 
                className={`nav-item flex items-center px-6 py-3 text-gray-700 hover:bg-blue-50 hover:text-primary ${location === '/daily-report/daily-summary' ? 'active' : ''
                }`}
                onClick={handleNavClick}
              >
                <BarChart3 size={20} />
                <span className="ml-3 font-medium">Daily Summary</span>
              </a>
            </Link>
          )}
        </nav>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={(e) => handleLogout(e)}
            className="w-full flex items-center text-gray-500 hover:text-gray-700 focus:outline-none focus:text-gray-700"
            type="button"
          >
            <LogOut size={20} />
            <span className="ml-3">Logout</span>
          </button>
        </div>
      </div>

      {/* Mobile/Tablet overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggle();
          }}
        />
      )}
    </>
  );
}
