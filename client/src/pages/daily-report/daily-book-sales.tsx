import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "shared/schema";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, BarChart3, FileText, Download, Copy, Search, Eye, Info, Loader2, Split, Mail, Printer, Package, MessageCircle, CreditCard, Banknote, Pencil, Building2, Receipt, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { cn, isPastDate, formatQuantity, formatPrice } from "@/lib/utils";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import Pagination from "@/components/ui/pagination";
import { useTablePagination } from "@/hooks/useTablePagination";

import { useBackdatePermissions, useDailyBookSalesPermissions } from "@/hooks/usePermissions";
import { useInvoicePermissions } from "@/hooks/useInvoicePermissions";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";
import { useToast } from "@/hooks/use-toast";
import { sendInvoicePdfEmail } from "@/lib/invoice-pdf";

interface SalesEntry {
  id: number;
  slNo: number;
  date: string;
  salesman: string;
  boxes: number;
  invoiceNo: string;
  customerName: string;
  customerOthers?: string;
  gateNumber?: string;
  customerId: number;
  vat: number;
  amount: number;
  cash: number;
  bank?: number;
  bankTransfer?: number;
  cheque?: number;
  credit?: number;
  hasPayments?: boolean;
  paymentSource?: string;
  isPaidViaCustomerPayment?: boolean;
  isFullyPaid?: boolean;
  totalPaid?: number;
  customerType?: string; // Add this to help identify cash customers
  isCompany?: boolean;
}

// Helper function to determine display name for cash customers
const getDisplayCustomerName = (sale: SalesEntry): string => {
  // Check if this is a cash customer by customer type (most reliable)
  const isCashCustomer = sale.customerType === 'cash';
  
  // Fallback: Check if customer name matches common cash sale patterns
  const cashSalePatterns = [
    'cash sale',
    'cash sales', 
    'cash customer',
    'walk-in customer',
    'walk in customer',
    'cash',
    'walk-in',
    'walkin'
  ];
  
  const customerNameLower = (sale.customerName || '').toLowerCase().trim();
  const isCashByName = cashSalePatterns.includes(customerNameLower);
  
  // If it's a cash customer (by type or name) and has a gate number, show gate number
  if ((isCashCustomer || isCashByName) && sale.gateNumber && sale.gateNumber.trim()) {
    return `${sale.gateNumber.trim()}`;
  }
  
  // Otherwise, show the customer name as usual
  return sale.customerName || 'Unknown Customer';
};

// Gate numbers only show for cash customers (handled by getDisplayCustomerName)
// Saved customers' gate numbers are hidden — unsaved means zero stock next day
const shouldShowGateInParentheses = (_sale: SalesEntry): boolean => false;

export default function DailyBookSales() {
  // Get business date with formatting utilities
  const {
    businessDate,
    isLoading: isLoadingBusinessDate,
    formatForApi
  } = useBusinessDate();

  // Use refs to track if dates have been manually changed
  const fromDateManuallyChanged = useRef(false);
  const toDateManuallyChanged = useRef(false);

  // Initialize state with business date
  const [fromDate, setFromDate] = useState<Date>(() => 
    businessDate ? new Date(businessDate) : new Date()
  );
  const [toDate, setToDate] = useState<Date>(() => 
    businessDate ? new Date(businessDate) : new Date()
  );

  // Handle date changes
  const handleFromDateChange = (date: Date | undefined) => {
    if (date) {
      fromDateManuallyChanged.current = true;
      setFromDate(date);
    }
  };

  const handleToDateChange = (date: Date | undefined) => {
    if (date) {
      toDateManuallyChanged.current = true;
      setToDate(date);
    }
  };

  // Update from date when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate && !fromDateManuallyChanged.current) {
      const newBusinessDate = new Date(businessDate);
      if (fromDate.getTime() !== newBusinessDate.getTime()) {
        setFromDate(newBusinessDate);
      }
    }
  }, [businessDate, isLoadingBusinessDate]);

  // Update to date when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate && !toDateManuallyChanged.current) {
      const newBusinessDate = new Date(businessDate);
      if (toDate.getTime() !== newBusinessDate.getTime()) {
        setToDate(newBusinessDate);
      }
    }
  }, [businessDate, isLoadingBusinessDate]);

  // Format date for display with different formats
  const formatDateForDisplay = (date: Date | string | null | undefined, formatStr = 'MM/dd/yy') => {
    try {
      if (!date) return '';

      // Handle string dates
      if (typeof date === 'string') {
        // Try parsing the date string
        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) return '';
        return format(parsedDate, formatStr);
      }

      // Handle Date objects
      if (date instanceof Date) {
        if (isNaN(date.getTime())) return '';
        return format(date, formatStr);
      }

      return '';
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };


  // Use formatForApi from useBusinessDate hook

  const { toast } = useToast();
  const [paymentType, setPaymentType] = useState("All");
  const [userFilter, setUserFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [user, setUser] = useState<any>(null);
  const [dailyBookType, setDailyBookType] = useState<'all' | 'own' | null>(null);
  const [loadingUserType, setLoadingUserType] = useState(true);
  const [selectedSales, setSelectedSales] = useState<Set<number>>(new Set());
  const [isUpdatingPayments, setIsUpdatingPayments] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'invoiceNo', direction: 'desc' });

  // Fetch settings including invoice print format
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiRequest("GET", "/api/settings"),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  const invoicePrintFormat = settings?.invoicePrintFormat || "A4";

  // Split payment dialog state
  const [splitPaymentDialog, setSplitPaymentDialog] = useState<{
    isOpen: boolean;
    sale: SalesEntry | null;
  }>({ isOpen: false, sale: null });
  const [splitPaymentData, setSplitPaymentData] = useState({
    cashAmount: 0,
    cardAmount: 0
  });

  // Fetch users for the salesman dropdown
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users"),
  });

  // Fetch sales data from backend with auto-refresh every 20 seconds
  const { data: rawSalesData = [] as SalesEntry[], isLoading: isLoadingSales, refetch: refetchSales } = useQuery<SalesEntry[]>({
    queryKey: [
      "daily-book-sales",
      fromDate,
      toDate,
      paymentType,
      userFilter,
      searchTerm,
    ],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/reports/daily-book-sales?fromDate=${fromDate ? format(fromDate, "yyyy-MM-dd") : ""}` +
        `&toDate=${toDate ? format(toDate, "yyyy-MM-dd") : ""}` +
        `&paymentType=${paymentType}` +
        `&salesman=${userFilter}` +
        `&search=${encodeURIComponent(searchTerm)}`
      ),
    staleTime: 0, // Consider data stale immediately to ensure fresh data
    gcTime: 1000 * 60 * 5, // Keep in cache for 5 minutes (renamed from cacheTime)
    refetchInterval: 20000, // Auto-refresh every 20 seconds
    refetchIntervalInBackground: true, // Continue refreshing even when tab is not active
    refetchOnWindowFocus: true, // Refetch when window gains focus
    refetchOnMount: true, // Always refetch on mount
  });

  // Sort data with special handling for invoice numbers
  const sortedData = useMemo(() => {
    return [...rawSalesData].sort((a, b) => {
      if (!sortConfig) return 0;
      
      const key = sortConfig.key as keyof typeof a;
      let aValue = a[key];
      let bValue = b[key];

      // Special handling for invoice number sorting
      if (key === 'invoiceNo') {
        // Extract numeric part from invoice numbers for proper sorting
        const extractNumber = (invoiceNo: string) => {
          const match = invoiceNo.match(/(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        };
        
        const aNum = extractNumber(String(aValue));
        const bNum = extractNumber(String(bValue));
        
        if (aNum !== bNum) {
          return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        // If numbers are the same, fall back to string comparison
        aValue = String(aValue);
        bValue = String(bValue);
      }

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return sortConfig.direction === 'asc' ? -1 : 1;
      if (bValue === null || bValue === undefined) return sortConfig.direction === 'asc' ? 1 : -1;

      // For numeric fields, convert to numbers for proper sorting
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // For string comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (aStr < bStr) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aStr > bStr) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [rawSalesData, sortConfig]);

  // Map 'account' to 'amount' for compatibility
  const salesData: SalesEntry[] = sortedData.map((item: any) => {
    // Debug: Check if payment status fields exist
    if (item.id === 1) {
      console.log('Sample data item:', {
        id: item.id,
        invoiceNo: item.invoiceNo,
        hasPayments: item.hasPayments,
        paymentSource: item.paymentSource,
        isPaidViaCustomerPayment: item.isPaidViaCustomerPayment,
        isFullyPaid: item.isFullyPaid,

        cash: item.cash,
        bank: item.bank,
        bankTransfer: item.bankTransfer,
        cheque: item.cheque,
        credit: item.credit
      });
    }

    return {
      ...item,
      amount: item.amount || 0,
      cash: item.cash || 0,
      bank: item.bank || 0,
      bankTransfer: item.bankTransfer || 0,
      cheque: item.cheque || 0,
      credit: item.credit || 0,
      // Ensure these fields are properly set
      hasPayments: item.hasPayments || false,
      isPaidViaCustomerPayment: item.isPaidViaCustomerPayment || false,
      isFullyPaid: item.isFullyPaid || false
    };
  });

  const totalBoxes = useMemo(() => salesData.reduce((sum, item) => sum + item.boxes, 0), [salesData]);
  const totalVAT = useMemo(() => salesData.reduce((sum, item) => sum + item.vat, 0), [salesData]);
  const totalAmount = useMemo(() => salesData.filter(i => !i.isCompany).reduce((sum, item) => sum + item.amount, 0), [salesData]);
  const totalCash = useMemo(() => salesData.filter(i => !i.isCompany).reduce((sum, item) => sum + item.cash, 0), [salesData]);
  const totalBank = useMemo(() => salesData.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.bank || 0), 0), [salesData]);
  const totalBankTransfer = useMemo(() => salesData.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.bankTransfer || 0), 0), [salesData]);
  const totalCheque = useMemo(() => salesData.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.cheque || 0), 0), [salesData]);
  const totalCredit = useMemo(() => salesData.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.credit || 0), 0), [salesData]);

  const tableRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();


  // Backdate permissions
  const { canEditBackdate, canEditCurrentDate } = useBackdatePermissions();

  // Daily Book Sales permissions
  const { canViewTotals, canMakePayments } = useDailyBookSalesPermissions();

  // Invoice permissions
  const { canEditInvoice, isInvoiceLocked } = useInvoicePermissions();

  // Cross-tab synchronization
  useCrossTabSync();

  useEffect(() => {
    async function fetchUserAndType() {
      setLoadingUserType(true);
      try {
        const userRes = await apiRequest("GET", "/api/auth/me");
        setUser(userRes);
        const typeRes = await apiRequest("GET", `/api/user-daily-book-type/${userRes.id}`);
        setDailyBookType(typeRes.type || 'all');
        if (typeRes.type === 'own') {
          setUserFilter(userRes.username);
        } else {
          setUserFilter('all');
        }
      } catch (e) {
        setDailyBookType('all');
        setUserFilter('all');
      } finally {
        setLoadingUserType(false);
      }
    }
    fetchUserAndType();
    // eslint-disable-next-line
  }, []);

  // Add window focus and visibility change listeners to refetch data when user returns to tab
  useEffect(() => {
    const handleFocus = () => {
      // Refetch sales data when window gains focus
      refetchSales();
    };

    const handleVisibilityChange = () => {
      // Refetch when tab becomes visible
      if (!document.hidden) {
        refetchSales();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refetchSales]);

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Daily Book Sales</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:10px;font-size:12px;}table{width:100%;border-collapse:collapse;margin-top:20px;table-layout:fixed;}th,td{border:1px solid #ccc;padding:4px;text-align:left;word-wrap:break-word;overflow:hidden;}th{background-color:#f0f0f0;font-weight:bold;font-size:11px;}td{font-size:10px;}.header{text-align:center;margin-bottom:20px;}.company-details{text-align:center;margin-bottom:30px;line-height:1.4;}.totals{font-weight:bold;background-color:#f9f9f9;}th:nth-child(1),td:nth-child(1){width:8%;}th:nth-child(2),td:nth-child(2){width:10%;}th:nth-child(3),td:nth-child(3){width:20%;}th:nth-child(4),td:nth-child(4){width:12%;}th:nth-child(5),td:nth-child(5){width:10%;}th:nth-child(6),td:nth-child(6){width:10%;}th:nth-child(7),td:nth-child(7){width:12%;}th:nth-child(8),td:nth-child(8){width:10%;}th:nth-child(9),td:nth-child(9){width:8%;}</style>');
      printWindow.document.write('</head><body>');

      // Add company details header following the specific structure
      printWindow.document.write('<div class="company-details">');
      if (companyDetails) {
        // Company name
        printWindow.document.write(`<h2>${companyDetails.companyName || ''}</h2>`);

        // Email
        if (companyDetails.email) {
          printWindow.document.write(`<p>${companyDetails.email}</p>`);
        }

        // Bank details
        if (companyDetails.bankDetails) {
          printWindow.document.write(`<p>${companyDetails.bankDetails}</p>`);
        }

        // VAT and Registration info

      }
      printWindow.document.write('</div>');

      // Add report title
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h3>DAILY BOOK SALES</h3>');
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : 'All'} to ${toDate ? format(toDate, "dd/MM/yyyy") : 'All'}</p>`);
      printWindow.document.write('</div>');

      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      const headers = ['Date', 'Invoice', 'Customer Name', 'Accounts', 'Cash', 'Card', 'Transfer', 'Cheque', 'Credit'];
      headers.forEach(h => {
        printWindow.document.write(`<th>${h}</th>`);
      });
      printWindow.document.write('</tr></thead><tbody>');
      salesData.forEach(sale => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${formatDateForDisplay(sale.date)}</td>`);
        printWindow.document.write(`<td>${sale.invoiceNo}</td>`);
        printWindow.document.write(`<td>${getDisplayCustomerName(sale)}</td>`);
        printWindow.document.write(`<td>£${Number(sale.amount ?? 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(sale.cash ?? 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(sale.bank ?? 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(sale.bankTransfer ?? 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(sale.cheque ?? 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(sale.credit ?? 0).toFixed(2)}</td>`);
        printWindow.document.write('</tr>');
      });
      printWindow.document.write('</tbody></table>');
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(salesData.map((item: SalesEntry) => ({
      'Sl.No': item.slNo,
      'Date': item.date,
      'Invoice No': item.invoiceNo,
      'Customer Name': getDisplayCustomerName(item),
      'Account': item.amount,
      'Cash': item.cash,
      'Card Payment': item.bank || 0,
      'Bank Transfer': item.bankTransfer || 0,
      'Cheque': item.cheque || 0,
      'Credit': item.credit || 0
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Book Sales');
    XLSX.writeFile(wb, 'daily-book-sales.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    let yPosition = 20;

    // Format dates for PDF title
    const fromDateStr = fromDate ? formatDateForDisplay(fromDate, 'dd/MM/yyyy') : 'All';
    const toDateStr = toDate ? formatDateForDisplay(toDate, 'dd/MM/yyyy') : 'All';

    // Add company details following the specific structure
    if (companyDetails) {
      // Company name
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || '', 105, yPosition, { align: 'center' });
      yPosition += 8;

      doc.setFontSize(10);

      // Email
      if (companyDetails.email) {
        doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }

      // Bank details
      if (companyDetails.bankDetails) {
        doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }

      // VAT and Registration info

    }

    // Add report title
    doc.setFontSize(14);
    doc.text('DAILY BOOK SALES', 105, yPosition, { align: 'center' });
    yPosition += 10;

    doc.setFontSize(10);
    doc.text(`Period: ${fromDateStr} to ${toDateStr}`, 105, yPosition, { align: 'center' });
    yPosition += 12;

    // Add table with proper column widths that fit on page
    autoTable(doc, {
      head: [[
        'Date', 'Invoice', 'Customer Name', 'Accounts', 'Cash', 'Card', 'Transfer', 'Cheque', 'Credit'
      ]],
      body: salesData.map((item: SalesEntry) => {
        // Use the business date from the item if available, otherwise use the current business date
        const saleDate = item.date ? new Date(item.date) : businessDate;
        return [
          format(saleDate, "MM/dd/yy"),
          item.invoiceNo,
          getDisplayCustomerName(item),
          `£${Number(item.amount ?? 0).toFixed(2)}`,
          `£${Number(item.cash ?? 0).toFixed(2)}`,
          `£${Number(item.bank ?? 0).toFixed(2)}`,
          `£${Number(item.bankTransfer ?? 0).toFixed(2)}`,
          `£${Number(item.cheque ?? 0).toFixed(2)}`,
          `£${Number(item.credit ?? 0).toFixed(2)}`
        ];
      }),
      startY: yPosition,
      styles: {
        fontSize: 7,
        cellPadding: 1.5
      },
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7
      },
      columnStyles: {
        0: { cellWidth: 18 }, // Date - shorter
        1: { cellWidth: 18 }, // Invoice
        2: { cellWidth: 35 }, // Customer Name - wider
        3: { cellWidth: 20 }, // Accounts
        4: { cellWidth: 18 }, // Cash
        5: { cellWidth: 18 }, // Card
        6: { cellWidth: 20 }, // Transfer
        7: { cellWidth: 18 }, // Cheque
        8: { cellWidth: 18 }  // Credit
      },
      margin: { left: 14, right: 14 }
    });

    doc.save(`daily-book-sales-${fromDate ? format(fromDate, "yyyyMMdd") : 'all'}-${toDate ? format(toDate, "yyyyMMdd") : 'all'}.pdf`);
  };

  const handleCopy = () => {
    const header = ['Sl.No', 'Date', 'Invoice No', 'Customer Name', 'Account', 'Cash', 'Card Payment', 'Bank Transfer', 'Cheque', 'Credit'];
    const rows = salesData.map((item: SalesEntry) => [
      item.slNo,
      item.date,
      item.invoiceNo,
      getDisplayCustomerName(item),
      item.amount,
      item.cash,
      item.bank || 0,
      item.bankTransfer || 0,
      item.cheque || 0,
      item.credit || 0
    ]);
    const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    toast({ title: "Copied", description: "Table copied to clipboard!" });
  };

  // Handle checkbox selection
  const handleCheckboxChange = (saleId: number, checked: boolean) => {
    setSelectedSales(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(saleId);
      } else {
        newSet.delete(saleId);
      }
      return newSet;
    });
  };

  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSales(new Set(salesData.map(sale => sale.id)));
    } else {
      setSelectedSales(new Set());
    }
  };

  // Update selected sales to cash payment
  const handleUpdateToCash = async () => {
    if (selectedSales.size === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to cash payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const validSaleIds = selectedSalesData
        .filter(sale => !sale.isPaidViaCustomerPayment)
        .map(sale => sale.id);

      // Use the new dedicated endpoint for updating payment methods
      const response = await apiRequest('POST', '/api/sales/update-payment-method', {
        saleIds: validSaleIds,
        paymentMethod: 'cash'
      });

      toast({ title: "Success", description: response.message });
      setSelectedSales(new Set()); // Clear selection
      refetchSales(); // Refresh the data
    } catch (error) {
      console.error('Error updating payments:', error);
      toast({ title: "Error", description: "Error updating payments. Please try again.", variant: "destructive" });
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Update selected sales to card payment
  const handleUpdateToCard = async () => {
    if (selectedSales.size === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to card payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const validSaleIds = selectedSalesData
        .filter(sale => !sale.isPaidViaCustomerPayment)
        .map(sale => sale.id);

      // Use the new dedicated endpoint for updating payment methods
      const response = await apiRequest('POST', '/api/sales/update-payment-method', {
        saleIds: validSaleIds,
        paymentMethod: 'bank'
      });

      toast({ title: "Success", description: response.message });
      setSelectedSales(new Set()); // Clear selection
      refetchSales(); // Refresh the data
    } catch (error) {
      console.error('Error updating payments:', error);
      toast({ title: "Error", description: "Error updating payments. Please try again.", variant: "destructive" });
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Update selected sales to account payment
  const handleUpdateToAccount = async () => {
    if (selectedSales.size === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to account payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const validSaleIds = selectedSalesData
        .filter(sale => !sale.isPaidViaCustomerPayment)
        .map(sale => sale.id);

      // Use the new dedicated endpoint for updating payment methods
      const response = await apiRequest('POST', '/api/sales/update-payment-method', {
        saleIds: validSaleIds,
        paymentMethod: 'account'
      });

      toast({ title: "Success", description: response.message });
      setSelectedSales(new Set()); // Clear selection
      refetchSales(); // Refresh the data
    } catch (error) {
      console.error('Error updating to account payment:', error);
      toast({ title: "Error", description: "Failed to update some sales to account payment.", variant: "destructive" });
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Update selected sales to bank transfer payment
  const handleUpdateToBankTransfer = async () => {
    if (selectedSales.size === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to bank transfer payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const validSaleIds = selectedSalesData
        .filter(sale => !sale.isPaidViaCustomerPayment)
        .map(sale => sale.id);

      // Use the new dedicated endpoint for updating payment methods
      const response = await apiRequest('POST', '/api/sales/update-payment-method', {
        saleIds: validSaleIds,
        paymentMethod: 'bank_transfer'
      });

      toast({ title: "Success", description: response.message });
      setSelectedSales(new Set());
      refetchSales();
    } catch (error) {
      console.error('Error updating payments:', error);
      toast({ title: "Error", description: "Error updating payments. Please try again.", variant: "destructive" });
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Update selected sales to cheque payment
  const handleUpdateToCheque = async () => {
    if (selectedSales.size === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to cheque payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const validSaleIds = selectedSalesData
        .filter(sale => !sale.isPaidViaCustomerPayment)
        .map(sale => sale.id);

      // Use the new dedicated endpoint for updating payment methods
      const response = await apiRequest('POST', '/api/sales/update-payment-method', {
        saleIds: validSaleIds,
        paymentMethod: 'cheque'
      });

      toast({ title: "Success", description: response.message });
      setSelectedSales(new Set());
      refetchSales();
    } catch (error) {
      console.error('Error updating payments:', error);
      toast({ title: "Error", description: "Error updating payments. Please try again.", variant: "destructive" });
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Helper for WhatsApp and Email
  const sendInvoiceEmail = async (sale: SalesEntry) => {
    try {
      await sendInvoicePdfEmail(sale.invoiceNo);
      toast({ title: "Success", description: "Invoice email sent!" });
    } catch (e: any) {
      toast({ title: "Error", description: e?.error || "Failed to send invoice email.", variant: "destructive" });
    }
  };
  const handleBulkEmail = async () => {
    if (selectedSales.size === 0) return;
    const selected = salesData.filter(s => selectedSales.has(s.id));
    const invoiceNumbers = selected.map(s => s.invoiceNo);
    const total = invoiceNumbers.length;

    const progressToast = toast({
      title: "Sending emails...",
      description: `0 / ${total} sent`,
      duration: 999999999,
    });

    let sent = 0;
    let failed = 0;
    const failedInvoices: string[] = [];

    for (const invNo of invoiceNumbers) {
      try {
        await sendInvoicePdfEmail(invNo);
        sent++;
      } catch {
        failed++;
        failedInvoices.push(invNo);
      }
      progressToast.update({
        title: "Sending emails...",
        description: `${sent + failed} / ${total} processed (${sent} sent, ${failed} failed)`,
      });
    }

    progressToast.update({
      title: failed === 0 ? "All emails sent" : "Emails sent with errors",
      description: failed === 0
        ? `${sent} invoice(s) sent successfully.`
        : `${sent} sent, ${failed} failed. Failed: ${failedInvoices.join(', ')}`,
      variant: failed === 0 ? "default" : "destructive",
    });
  };

  const handleBulkPrint = async () => {
    if (selectedSales.size === 0) return;
    const selected = salesData.filter(s => selectedSales.has(s.id));
    const invoiceNumbers = selected.map(s => s.invoiceNo);
    window.open(`/print/bulk-dot-matrix?invs=${invoiceNumbers.join(',')}`, '_blank');
  };

  const sendWhatsApp = async (sale: SalesEntry) => {
    const phone = prompt('Enter WhatsApp number (E.164 format, e.g. +441234567890):');
    if (!phone) return;
    const invoiceUrl = `${window.location.origin}/print/invoice/${sale.invoiceNo}`;
    try {
      await apiRequest('POST', '/api/send/whatsapp-invoice', {
        phoneNumber: phone,
        invoiceUrl,
        message: 'Your invoice is attached.'
      });
      toast({ title: "Success", description: "WhatsApp message sent!" });
    } catch (e) {
      toast({ title: "Error", description: "Failed to send WhatsApp message.", variant: "destructive" });
    }
  };
  const pay = async (sale: SalesEntry, mode: 'cash' | 'bank' | 'bank_transfer' | 'cheque') => {
    try {
      if (sale.isPaidViaCustomerPayment) {
        toast({ title: "Error", description: "Cannot update payment method for invoices paid via Customer Payment page. Please use the Customer Payment page to modify this payment.", variant: "destructive" });
        return;
      }

      const modeDisplayName = mode === 'cash' ? 'Cash' :
        mode === 'bank' ? 'Card' :
          mode === 'bank_transfer' ? 'Bank Transfer' :
            mode === 'cheque' ? 'Cheque' : mode;

      await apiRequest('POST', '/api/sales/update-payment-method', {
        saleIds: [sale.id],
        paymentMethod: mode
      });

      toast({ title: "Success", description: `Payment updated to ${modeDisplayName} successfully!` });
      refetchSales();
    } catch (e) {
      console.error('Payment failed:', e);
      toast({ title: "Error", description: "Payment failed. Please try again.", variant: "destructive" });
    }
  };

  // Handle split payment
  const handleSplitPayment = (sale: SalesEntry) => {
    const totalAmount = (sale.amount || 0) + (sale.cash || 0) + (sale.bank || 0);
    setSplitPaymentDialog({ isOpen: true, sale });
    setSplitPaymentData({
      cashAmount: 0,
      cardAmount: 0
    });
  };

  // Submit split payment
  const handleSplitPaymentSubmit = async () => {
    if (!splitPaymentDialog.sale) return;

    const { cashAmount, cardAmount } = splitPaymentData;
    const sale = splitPaymentDialog.sale;
    const totalAmount = (sale.amount || 0) + (sale.cash || 0) + (sale.bank || 0);

    // Validate amounts
    if (cashAmount + cardAmount !== totalAmount) {
      toast({ title: "Error", description: `Total split amount (£${(cashAmount + cardAmount).toFixed(2)}) must equal the invoice total (£${totalAmount.toFixed(2)})`, variant: "destructive" });
      return;
    }

    if (cashAmount < 0 || cardAmount < 0) {
      toast({ title: "Error", description: "Payment amounts cannot be negative", variant: "destructive" });
      return;
    }

    try {
      setIsUpdatingPayments(true);

      // Use the new dedicated endpoint for split payments
      const response = await apiRequest('POST', '/api/sales/split-payment', {
        saleId: sale.id,
        cashAmount: cashAmount,
        cardAmount: cardAmount
      });

      toast({ title: "Success", description: "Split payment applied successfully!" });
      setSplitPaymentDialog({ isOpen: false, sale: null });
      refetchSales();

    } catch (error) {
      console.error('Error applying split payment:', error);
      toast({ title: "Error", description: "Error applying split payment. Please try again.", variant: "destructive" });
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  const handlePrintTicket = (invoiceNo: string) => {
    const printUrl = invoicePrintFormat === 'DOTMATRIX'
      ? `/print/dot-matrix-invoice/${invoiceNo}`
      : invoicePrintFormat === 'A5'
        ? `/print/a5-invoice/${invoiceNo}`
        : `/print/invoice/${invoiceNo}`;
    window.open(printUrl, '_blank');
  };

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortableHeader = ({ label, sortKey }: { label: string; sortKey: string }) => (
    <div
      className="flex items-center cursor-pointer hover:text-primary"
      onClick={() => requestSort(sortKey)}
    >
      {label}
      {sortConfig?.key === sortKey && (
        <span className="ml-1">
          {sortConfig.direction === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </div>
  );

  if (loadingUserType) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin mr-2" /> Loading user settings...
      </div>
    );
  }

  return (
    <PageLayout title="Daily Book" breadcrumb="Daily Report > Daily Book Sales">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex flex-col space-y-2">
              <CardTitle className="text-lg sm:text-xl">Daily Book Sales</CardTitle>
              <div className="text-xs sm:text-sm text-gray-500 break-words">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="w-full space-y-2">
                <Label className="text-sm font-medium">From Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10",
                        !fromDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fromDate ? formatDateForDisplay(fromDate, 'yyyyMMdd') : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={handleFromDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="w-full space-y-2">
                <Label className="text-sm font-medium">To Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10",
                        !toDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {toDate ? formatDateForDisplay(toDate, 'yyyyMMdd') : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={handleToDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="w-full space-y-2">
                <Label className="text-sm font-medium">Payment Type:</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full space-y-2">
                <Label className="text-sm font-medium">Salesman:</Label>
                <Select value={userFilter} onValueChange={setUserFilter} disabled={dailyBookType === 'own'}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="All Salesmen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {isLoadingUsers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      users?.map((user: User) => (
                        <SelectItem key={user.id} value={user.username}>
                          {user.username}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full space-y-2">
                <Label className="text-sm font-medium invisible">Action:</Label>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full h-10">
                  Search
                </Button>
              </div>

              {canEditCurrentDate && (
                <div className="col-span-1 sm:col-span-2 lg:col-span-3 xl:col-span-1 space-y-2">
                  <Label className="text-sm font-medium invisible">View:</Label>
                  <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2 w-full h-10"
                    variant="default"
                    onClick={() => navigate("/daily-report/daily-sales-full-view")}>
                    <Eye size={16} />
                    <span className="hidden sm:inline">Full View</span>
                    <span className="sm:hidden">View</span>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sales Table */}
        <Card>
          <CardHeader>
            <div className="space-y-4">
              {/* Combined buttons row - Export buttons on left, Payment buttons on right */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                {/* Export buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                    <FileText size={14} />
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                  <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                    <Download size={14} />
                    <span className="hidden sm:inline">Excel</span>
                  </Button>
                  <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                    <Copy size={14} />
                    <span className="hidden sm:inline">Copy</span>
                  </Button>
                  <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                    <Printer size={14} />
                    <span className="hidden sm:inline">Print</span>
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="flex items-center gap-1" 
                    onClick={() => refetchSales()}
                    disabled={isLoadingSales}
                  >
                    <RefreshCw size={14} className={isLoadingSales ? "animate-spin" : ""} />
                    <span className="hidden sm:inline">Refresh</span>
                  </Button>
                  {selectedSales.size > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex items-center gap-1 border-green-500 text-green-700 hover:bg-green-50"
                        onClick={handleBulkEmail}
                      >
                        <Mail size={14} />
                        <span className="hidden sm:inline">Email Selected</span>
                        <span className="sm:hidden">Email</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex items-center gap-1 border-blue-500 text-blue-700 hover:bg-blue-50"
                        onClick={handleBulkPrint}
                      >
                        <Printer size={14} />
                        <span className="hidden sm:inline">Print Selected</span>
                        <span className="sm:hidden">Print</span>
                      </Button>
                    </>
                  )}
                </div>

                {/* Payment action buttons - smaller and on the right */}
                <div className="flex flex-wrap gap-1">
                  {canMakePayments && (
                    <>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 h-7"
                        onClick={handleUpdateToCash}
                        disabled={selectedSales.size === 0}
                      >
                        <span className="hidden sm:inline">Paid (Cash) - </span>
                        <span className="sm:hidden">Cash - </span>
                        {selectedSales.size}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 h-7"
                        onClick={handleUpdateToCard}
                        disabled={selectedSales.size === 0}
                      >
                        <span className="hidden sm:inline">Pay Card - </span>
                        <span className="sm:hidden">Card - </span>
                        {selectedSales.size}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-2 py-1 h-7"
                        onClick={handleUpdateToBankTransfer}
                        disabled={selectedSales.size === 0}
                      >
                        <span className="hidden sm:inline">Transfer - </span>
                        <span className="sm:hidden">Trans - </span>
                        {selectedSales.size}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2 py-1 h-7"
                        onClick={handleUpdateToCheque}
                        disabled={selectedSales.size === 0}
                      >
                        <span className="hidden sm:inline">Cheque - </span>
                        <span className="sm:hidden">Chq - </span>
                        {selectedSales.size}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs px-2 py-1 h-7"
                        onClick={handleUpdateToAccount}
                        disabled={selectedSales.size === 0}
                      >
                        <span className="hidden sm:inline">Account - </span>
                        <span className="sm:hidden">Acc - </span>
                        {selectedSales.size}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Search row and legend */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                {/* Payment status legend */}
                <div className="flex flex-wrap gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-100 border border-red-200 rounded"></div>
                    <span>Unpaid</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-100 border border-green-200 rounded"></div>
                    <span>Paid (Customer Payment)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-100 border border-blue-200 rounded"></div>
                    <span>Paid (Daily Book)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-amber-100 border border-amber-300 rounded"></div>
                    <span>Company Customer</span>
                  </div>
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-48">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Search:"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto" ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 sm:w-12">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selectedSales.size === salesData.length && salesData.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="min-w-[80px] sm:min-w-[100px]">Date</TableHead>
                    <TableHead className="w-[150px]">
                      <SortableHeader label="Invoice No" sortKey="invoiceNo" />
                    </TableHead>
                    <TableHead className="min-w-[120px] sm:min-w-[200px]">Customer</TableHead>
                    <TableHead className="min-w-[80px] sm:min-w-[100px] text-right">
                      <span className="hidden sm:inline">Accounts</span>
                      <span className="sm:hidden">Acc</span>
                    </TableHead>
                    <TableHead className="min-w-[70px] sm:min-w-[90px] text-right">Cash</TableHead>
                    <TableHead className="min-w-[70px] sm:min-w-[90px] text-right">
                      <span className="hidden sm:inline">Card</span>
                      <span className="sm:hidden">Card</span>
                    </TableHead>
                    <TableHead className="min-w-[70px] sm:min-w-[90px] text-right">
                      <span className="hidden sm:inline">Transfer</span>
                      <span className="sm:hidden">Trans</span>
                    </TableHead>
                    <TableHead className="min-w-[70px] sm:min-w-[90px] text-right">
                      <span className="hidden sm:inline">Cheque</span>
                      <span className="sm:hidden">Chq</span>
                    </TableHead>
                    <TableHead className="min-w-[70px] sm:min-w-[90px] text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingSales ? (
                    <TableRow>
                      <TableCell colSpan={9}>Loading...</TableCell>
                    </TableRow>
                  ) : (
                    salesData.map((sale) => (
                      <TableRow
                        key={sale.id}
                        className={cn(
                          '',
                          sale.isCompany && 'bg-amber-50 border-amber-200',
                          !sale.isCompany && !sale.isFullyPaid && !sale.isPaidViaCustomerPayment && 'bg-red-50 border-red-200',
                          !sale.isCompany && sale.isFullyPaid && sale.isPaidViaCustomerPayment && 'bg-green-50 border-green-200',
                          !sale.isCompany && sale.isFullyPaid && !sale.isPaidViaCustomerPayment && 'bg-blue-50 border-blue-200'
                        )}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedSales.has(sale.id)}
                            onChange={(e) => handleCheckboxChange(sale.id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm">{formatDateForDisplay(sale.date, 'MM/dd/yy')}</TableCell>
                        <TableCell className="text-xs sm:text-sm">{sale.invoiceNo}</TableCell>
                        <TableCell className="text-blue-600 text-xs sm:text-sm">

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="link" className="p-0 text-blue-600 underline cursor-pointer text-left">
                                <span className="flex items-center gap-1">
                                  {getDisplayCustomerName(sale)}
                                  {shouldShowGateInParentheses(sale) && (
                                    <span className="text-xs text-gray-500 font-normal ml-1">
                                      ({sale.gateNumber})
                                    </span>
                                  )}
                                </span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-48">
                              {(isPastDate(sale.date) ? canEditBackdate : canEditCurrentDate) && (
                                <DropdownMenuItem
                                  className="text-sm py-2"
                                  onClick={() => {
                                    const url = canEditInvoice
                                      ? `/data-entry/sales-invoice?invoiceNumber=${sale.invoiceNo}`
                                      : `/data-entry/sales-invoice?invoiceNumber=${sale.invoiceNo}&readonly=true`;
                                    window.open(url, '_self');
                                  }}
                                >
                                  <Pencil className="mr-2 h-4 w-4" />
                                  {canEditInvoice ? 'Edit Invoice' : 'View Invoice (Read-Only)'}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-sm py-2"
                                onClick={() => {
                                  const printUrl = invoicePrintFormat === 'DOTMATRIX'
                                    ? `/print/dot-matrix-invoice/${sale.invoiceNo}`
                                    : invoicePrintFormat === 'A5'
                                      ? `/print/a5-invoice/${sale.invoiceNo}`
                                      : `/print/invoice/${sale.invoiceNo}`;
                                  window.open(printUrl, '_blank');
                                }}
                              >
                                <Printer className="mr-2 h-4 w-4" /> Print Ticket
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-sm py-2" onClick={() => sendInvoiceEmail(sale)}>
                                <Mail className="mr-2 h-4 w-4" /> Email
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-sm py-2" onClick={() => window.open(`/print/packing-list/${sale.invoiceNo}`, '_blank')}>
                                <Package className="mr-2 h-4 w-4" /> Picking List
                              </DropdownMenuItem>
                              {canMakePayments && (
                                <>
                                  <DropdownMenuItem className="text-sm py-2" onClick={() => pay(sale, 'cash')}>
                                    <Banknote className="mr-2 h-4 w-4" /> Pay (Cash)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-sm py-2" onClick={() => pay(sale, 'bank')}>
                                    <CreditCard className="mr-2 h-4 w-4" /> Pay (Card)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-sm py-2" onClick={() => pay(sale, 'bank_transfer')}>
                                    <Building2 className="mr-2 h-4 w-4" /> Pay (Transfer)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-sm py-2" onClick={() => pay(sale, 'cheque')}>
                                    <Receipt className="mr-2 h-4 w-4" /> Pay (Cheque)
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-sm py-2" onClick={() => handleSplitPayment(sale)}>
                                    <Split className="mr-2 h-4 w-4" /> Split Payment
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell className="text-right text-xs sm:text-sm">
                          {Number(sale.amount ?? 0) === 0 ? "-" : (
                            <>
                              <span className="hidden sm:inline">£</span>{Number(sale.amount ?? 0).toFixed(2)}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs sm:text-sm">
                          {Number(sale.cash ?? 0) === 0 ? "-" : (
                            <>
                              <span className="hidden sm:inline">£</span>{Number(sale.cash ?? 0).toFixed(2)}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs sm:text-sm">
                          {Number(sale.bank ?? 0) === 0 ? "-" : (
                            <>
                              <span className="hidden sm:inline">£</span>{Number(sale.bank ?? 0).toFixed(2)}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs sm:text-sm">
                          {Number(sale.bankTransfer ?? 0) === 0 ? "-" : (
                            <>
                              <span className="hidden sm:inline">£</span>{Number(sale.bankTransfer ?? 0).toFixed(2)}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs sm:text-sm">
                          {Number(sale.cheque ?? 0) === 0 ? "-" : (
                            <>
                              <span className="hidden sm:inline">£</span>{Number(sale.cheque ?? 0).toFixed(2)}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-red-600 text-xs sm:text-sm">
                          {Number(sale.credit ?? 0) === 0 ? "-" : (
                            <>
                              <span className="hidden sm:inline">£</span>{Number(sale.credit ?? 0).toFixed(2)}
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}

                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold text-xs sm:text-sm">{salesData.length} Items</TableCell>
                    <TableCell className="text-center font-bold text-xs sm:text-sm">{formatQuantity(totalBoxes)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {totalAmount === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{totalAmount.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {totalCash === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{totalCash.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {totalBank === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{totalBank.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {totalBankTransfer === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{totalBankTransfer.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {totalCheque === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{totalCheque.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-red-600 text-xs sm:text-sm">
                      {totalCredit === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{totalCredit.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {/* Summary moved below table, styled for print and screen */}
              {canViewTotals && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border space-y-2 sm:space-y-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                    <div className="flex justify-between sm:block">
                      <span className="font-semibold">Date Range:</span>
                      <span className="sm:block">{formatDateForDisplay(fromDate, 'MM-dd')} to {formatDateForDisplay(toDate, 'MM-dd')}</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="font-semibold">Total Boxes:</span>
                      <span className="sm:block">{formatQuantity(totalBoxes)}</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="font-semibold">Total VAT:</span>
                      <span className="sm:block">£{totalVAT.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="font-semibold">Total Amount:</span>
                      <span className="sm:block">£{totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="font-semibold">Total Cash:</span>
                      <span className="sm:block">£{totalCash.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="font-semibold">Total Bank:</span>
                      <span className="sm:block">£{totalBank.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="font-semibold">Total Transfer:</span>
                      <span className="sm:block">£{totalBankTransfer.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="font-semibold">Total Credit:</span>
                      <span className="sm:block text-red-600">£{totalCredit.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 text-sm text-gray-600 gap-2">
              <div className="text-center sm:text-left">Showing {salesData.length} entries</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs">Previous</Button>
                <Button variant="outline" size="sm" className="bg-blue-500 text-white text-xs">1</Button>
                <Button variant="outline" size="sm" className="text-xs">Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>



        {/* Split Payment Dialog */}
        <Dialog open={splitPaymentDialog.isOpen} onOpenChange={(open) => {
          if (!open) {
            setSplitPaymentDialog({ isOpen: false, sale: null });
            setSplitPaymentData({ cashAmount: 0, cardAmount: 0 });
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Split Payment</DialogTitle>
            </DialogHeader>

            {splitPaymentDialog.sale && (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  <p><strong>Invoice:</strong> {splitPaymentDialog.sale.invoiceNo}</p>
                  <p><strong>Customer:</strong> {getDisplayCustomerName(splitPaymentDialog.sale)}</p>
                  <p><strong>Total Amount:</strong> £{((splitPaymentDialog.sale.amount || 0) + (splitPaymentDialog.sale.cash || 0) + (splitPaymentDialog.sale.bank || 0)).toFixed(2)}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cashAmount">Cash Amount</Label>
                    <Input
                      id="cashAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={splitPaymentData.cashAmount}
                      onChange={(e) => setSplitPaymentData(prev => ({
                        ...prev,
                        cashAmount: parseFloat(e.target.value) || 0
                      }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <Label htmlFor="cardAmount">Card Amount</Label>
                    <Input
                      id="cardAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={splitPaymentData.cardAmount}
                      onChange={(e) => setSplitPaymentData(prev => ({
                        ...prev,
                        cardAmount: parseFloat(e.target.value) || 0
                      }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="text-sm">
                  <p><strong>Total Split:</strong> £{(splitPaymentData.cashAmount + splitPaymentData.cardAmount).toFixed(2)}</p>
                  <p className={`${(splitPaymentData.cashAmount + splitPaymentData.cardAmount) ===
                    ((splitPaymentDialog.sale.amount || 0) + (splitPaymentDialog.sale.cash || 0) + (splitPaymentDialog.sale.bank || 0))
                    ? 'text-green-600' : 'text-red-600'
                    }`}>
                    <strong>Difference:</strong> £{(
                      ((splitPaymentDialog.sale.amount || 0) + (splitPaymentDialog.sale.cash || 0) + (splitPaymentDialog.sale.bank || 0)) -
                      (splitPaymentData.cashAmount + splitPaymentData.cardAmount)
                    ).toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setSplitPaymentDialog({ isOpen: false, sale: null });
                  setSplitPaymentData({ cashAmount: 0, cardAmount: 0 });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSplitPaymentSubmit}
                disabled={isUpdatingPayments}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isUpdatingPayments ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Apply Split Payment'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}