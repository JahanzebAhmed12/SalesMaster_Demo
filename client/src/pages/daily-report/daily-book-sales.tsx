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
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { BarChart3, FileText, Download, Copy, Search, Eye, Info, Loader2, Split, Mail, Printer, Package, MessageCircle, CreditCard, Banknote, Pencil, Building2, Receipt, RefreshCw, ChevronDown, Tag } from "lucide-react";
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
import { useCompanyDetails } from "@/hooks/use-company-details";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";
import { useToast } from "@/hooks/use-toast";
import {
  downloadCustomerDiscountPdf,
  downloadCustomerReturnPdf,
  sendCustomerDiscountPdfEmail,
  sendCustomerReturnPdfEmail,
  sendInvoicePdfEmail,
} from "@/lib/invoice-pdf";
import { copyToClipboard, printHtmlTable } from "@/lib/export-utils";
import { CreditDocumentDetailsDialog } from "@/components/common/credit-document-details-dialog";

interface SalesEntry {
  id: number;
  slNo: number;
  date: string | null;
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
  isCustomerReturn?: boolean;
  isCustomerDiscount?: boolean;
  isVoid?: boolean;
  isUnknownDate?: boolean;
  voidedDocumentType?: string;
  discountReference?: string;
  originalInvoiceNo?: string;
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

const getInvoiceLabel = (sale: SalesEntry): string => {
  const discountSources = sale.isCustomerDiscount && sale.originalInvoiceNo
    ? ` (Credit/Adj; invoices ${sale.originalInvoiceNo})`
    : "";
  const voidStatus = sale.isVoid
    ? sale.isUnknownDate ? " (VOID - DATE UNKNOWN)" : " (VOID)"
    : "";
  return `${sale.invoiceNo}${discountSources}${voidStatus}`;
};

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

  const [creditDetailsTarget, setCreditDetailsTarget] = useState<{
    kind: "discount" | "return";
    lineId: number;
  } | null>(null);

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

  const nonCreditSales = useMemo(() => salesData.filter(i => !i.credit && !i.isCustomerReturn), [salesData]);
  const totalBoxes = useMemo(() => nonCreditSales.reduce((sum, item) => sum + item.boxes, 0), [nonCreditSales]);
  const totalVAT = useMemo(() => nonCreditSales.reduce((sum, item) => sum + item.vat, 0), [nonCreditSales]);
  const totalAmount = useMemo(() => nonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + item.amount, 0), [nonCreditSales]);
  const totalCash = useMemo(() => nonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + item.cash, 0), [nonCreditSales]);
  const totalBank = useMemo(() => nonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.bank || 0), 0), [nonCreditSales]);
  const totalBankTransfer = useMemo(() => nonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.bankTransfer || 0), 0), [nonCreditSales]);
  const totalCheque = useMemo(() => nonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.cheque || 0), 0), [nonCreditSales]);
  const totalCredit = useMemo(() => salesData.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.credit || 0), 0), [salesData]);

  const filteredData = useMemo(() => salesData, [salesData]);
  const selectableData = filteredData.filter(sale => !sale.isVoid);
  const selectedPaymentSales = useMemo(
    () => salesData.filter(sale => selectedSales.has(sale.id) && !sale.isVoid && !sale.isCustomerReturn && !sale.isCustomerDiscount),
    [salesData, selectedSales]
  );

  // Filtered totals for table footer
  const filteredNonCreditSales = useMemo(() => filteredData.filter(i => !i.credit && !i.isCustomerReturn), [filteredData]);
  const filteredTotalBoxes = useMemo(() => filteredNonCreditSales.reduce((sum, item) => sum + item.boxes, 0), [filteredNonCreditSales]);
  const filteredTotalAmount = useMemo(() => filteredNonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + item.amount, 0), [filteredNonCreditSales]);
  const filteredTotalCash = useMemo(() => filteredNonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + item.cash, 0), [filteredNonCreditSales]);
  const filteredTotalBank = useMemo(() => filteredNonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.bank || 0), 0), [filteredNonCreditSales]);
  const filteredTotalBankTransfer = useMemo(() => filteredNonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.bankTransfer || 0), 0), [filteredNonCreditSales]);
  const filteredTotalCheque = useMemo(() => filteredNonCreditSales.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.cheque || 0), 0), [filteredNonCreditSales]);
  const filteredTotalCredit = useMemo(() => filteredData.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.credit || 0), 0), [filteredData]);

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
  const { companyDetails } = useCompanyDetails();

  // Export handlers
  const handlePrint = () => {
    let html = '';

    // Add company details header following the specific structure
    html += '<div class="company-details">';
    if (companyDetails) {
      // Company name
      html += `<h2>${companyDetails.companyName || ''}</h2>`;

      // Email
      if (companyDetails.email) {
        html += `<p>${companyDetails.email}</p>`;
      }

      // Bank details
      if (companyDetails.bankDetails) {
        html += `<p>${companyDetails.bankDetails}</p>`;
      }

      // VAT and Registration info

    }
    html += '</div>';

    // Add report title
    html += '<div class="header">';
    html += '<h3>DAILY BOOK SALES</h3>';
    html += `<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : 'All'} to ${toDate ? format(toDate, "dd/MM/yyyy") : 'All'}</p>`;
    html += '</div>';

    // Add table
    html += '<table>';
    html += '<thead><tr>';
    const headers = ['Date', 'Invoice', 'Customer Name', 'Accounts', 'Cash', 'Card', 'Transfer', 'Cheque', 'Credit'];
    headers.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += '</tr></thead><tbody>';
    salesData.forEach(sale => {
      html += '<tr>';
      html += `<td>${sale.isUnknownDate ? 'Unknown' : formatDateForDisplay(sale.date)}</td>`;
      html += `<td>${getInvoiceLabel(sale)}</td>`;
      html += `<td>${getDisplayCustomerName(sale)}</td>`;
      html += `<td>£${Number(sale.amount ?? 0).toFixed(2)}</td>`;
      html += `<td>£${Number(sale.cash ?? 0).toFixed(2)}</td>`;
      html += `<td>£${Number(sale.bank ?? 0).toFixed(2)}</td>`;
      html += `<td>£${Number(sale.bankTransfer ?? 0).toFixed(2)}</td>`;
      html += `<td>£${Number(sale.cheque ?? 0).toFixed(2)}</td>`;
      html += `<td>£${Number(sale.credit ?? 0).toFixed(2)}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    printHtmlTable('Daily Book Sales', html, { autoClose: true });
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(salesData.map((item: SalesEntry) => ({
      'Sl.No': item.slNo,
      'Date': item.isUnknownDate ? 'Unknown' : item.date,
      'Invoice No': getInvoiceLabel(item),
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
        const saleDate = item.date ? new Date(item.date) : (businessDate ?? new Date());
        return [
          item.isUnknownDate ? 'Unknown' : format(saleDate, "MM/dd/yy"),
          getInvoiceLabel(item),
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
      item.isUnknownDate ? 'Unknown' : item.date,
      getInvoiceLabel(item),
      getDisplayCustomerName(item),
      item.amount,
      item.cash,
      item.bank || 0,
      item.bankTransfer || 0,
      item.cheque || 0,
      item.credit || 0
    ]);
    const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
    copyToClipboard(tsv, { toast });
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
      setSelectedSales(new Set(selectableData.map(sale => sale.id)));
    } else {
      setSelectedSales(new Set());
    }
  };

  // Update selected sales to cash payment
  const handleUpdateToCash = async () => {
    if (selectedPaymentSales.length === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = selectedPaymentSales;
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSalesData.length} selected sales to cash payment?`)) {
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
    if (selectedPaymentSales.length === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = selectedPaymentSales;
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSalesData.length} selected sales to card payment?`)) {
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
    if (selectedPaymentSales.length === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = selectedPaymentSales;
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSalesData.length} selected sales to account payment?`)) {
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
    if (selectedPaymentSales.length === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = selectedPaymentSales;
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSalesData.length} selected sales to bank transfer payment?`)) {
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
    if (selectedPaymentSales.length === 0) {
      toast({ title: "Error", description: "Please select at least one sale to update.", variant: "destructive" });
      return;
    }

    // Check if any selected sales were paid via customer payment page
    const selectedSalesData = selectedPaymentSales;
    const customerPaymentSales = selectedSalesData.filter(sale => sale.isPaidViaCustomerPayment);

    if (customerPaymentSales.length > 0) {
      toast({ title: "Error", description: `Cannot update payment method for ${customerPaymentSales.length} invoice(s) that were paid via Customer Payment page. Please use the Customer Payment page to modify these payments.`, variant: "destructive" });
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSalesData.length} selected sales to cheque payment?`)) {
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
      if (sale.isCustomerDiscount) {
        await sendCustomerDiscountPdfEmail(-(sale.id + 1_000_000_000));
      } else if (sale.isCustomerReturn) {
        await sendCustomerReturnPdfEmail(Math.abs(sale.id));
      } else {
        await sendInvoicePdfEmail(sale.invoiceNo);
      }
      toast({
        title: "Success",
        description: sale.isCustomerDiscount
          ? "Customer discount email sent!"
          : sale.isCustomerReturn ? "Customer return email sent!" : "Invoice email sent!",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || e?.error || "Failed to send invoice email.", variant: "destructive" });
    }
  };
  const handleBulkEmail = async () => {
    if (selectedSales.size === 0) return;
    const selected = salesData.filter(s => selectedSales.has(s.id));
    const total = selected.length;

    const progressToast = toast({
      title: "Sending emails...",
      description: `0 / ${total} sent`,
      duration: 999999999,
    });

    let sent = 0;
    let failed = 0;
    const failedDocuments: string[] = [];

    for (const sale of selected) {
      try {
        if (sale.isCustomerDiscount) {
          await sendCustomerDiscountPdfEmail(-(sale.id + 1_000_000_000));
        } else if (sale.isCustomerReturn) {
          await sendCustomerReturnPdfEmail(Math.abs(sale.id));
        } else {
          await sendInvoicePdfEmail(sale.invoiceNo);
        }
        sent++;
      } catch {
        failed++;
        failedDocuments.push(
          sale.isCustomerDiscount ? `Discount ${sale.invoiceNo}` :
            sale.isCustomerReturn ? `Return ${sale.invoiceNo}` : sale.invoiceNo,
        );
      }
      progressToast.update({
        id: progressToast.id,
        title: "Sending emails...",
        description: `${sent + failed} / ${total} processed (${sent} sent, ${failed} failed)`,
      });
    }

    progressToast.update({
      id: progressToast.id,
      title: failed === 0 ? "All emails sent" : "Emails sent with errors",
      description: failed === 0
        ? `${sent} document(s) sent successfully.`
        : `${sent} sent, ${failed} failed. Failed: ${failedDocuments.join(', ')}`,
      variant: failed === 0 ? "default" : "destructive",
    });
  };

  const getSelectedInvoiceNumbers = () => salesData
    .filter(sale => selectedSales.has(sale.id) && !sale.isCustomerReturn && !sale.isCustomerDiscount)
    .map(sale => sale.invoiceNo);

  const getSelectedPrintItems = () => {
    const selected = salesData.filter(sale => selectedSales.has(sale.id));
    return {
      invoiceNumbers: selected.filter(sale => !sale.isCustomerReturn && !sale.isCustomerDiscount).map(sale => sale.invoiceNo),
      returnIds: selected
        .filter(sale => sale.isCustomerReturn)
        .map(sale => Math.abs(sale.id).toString()),
      discountIds: selected
        .filter(sale => sale.isCustomerDiscount)
        .map(sale => (-(sale.id + 1_000_000_000)).toString()),
    };
  };

  const openSelectedPrintItems = (invoicePrintPath: string) => {
    const { invoiceNumbers, returnIds, discountIds } = getSelectedPrintItems();
    if (returnIds.length === 0 && discountIds.length === 0 && invoiceNumbers.length === 0) return;
    const query = new URLSearchParams();
    if (invoiceNumbers.length > 0) query.set("invs", invoiceNumbers.join(","));
    if (returnIds.length > 0) query.set("returnIds", returnIds.join(","));
    if (discountIds.length > 0) query.set("discountIds", discountIds.join(","));
    window.open(`${invoicePrintPath}?${query.toString()}`, '_blank');
  };

  const handleBulkPrint = async () => {
    openSelectedPrintItems('/print/bulk-dot-matrix');
  };

  const handleBulkA4Print = () => {
    openSelectedPrintItems('/print/bulk-a4-invoice');
  };

  const handleBulkA5Print = () => {
    openSelectedPrintItems('/print/bulk-a5-invoice');
  };

  const handleBulkPickingPrint = () => {
    const { invoiceNumbers, returnIds } = getSelectedPrintItems();
    if (invoiceNumbers.length === 0 && returnIds.length === 0) return;
    const query = new URLSearchParams();
    if (invoiceNumbers.length > 0) query.set("invs", invoiceNumbers.join(","));
    if (returnIds.length > 0) query.set("returnIds", returnIds.join(","));
    window.open(`/print/bulk-packing-list?${query.toString()}`, '_blank');
  };

  const handleBulkLabelPrint = () => {
    const invoiceNumbers = getSelectedInvoiceNumbers();
    if (invoiceNumbers.length === 0) return;
    window.open(`/print/bulk-customer-label?invs=${encodeURIComponent(invoiceNumbers.join(','))}`, '_blank');
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
    if (Math.round(cashAmount * 100) + Math.round(cardAmount * 100) !== Math.round(totalAmount * 100)) {
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

  const handlePrintTicket = (sale: SalesEntry) => {
    const printPath = invoicePrintFormat === 'DOTMATRIX'
      ? `/print/dot-matrix-invoice/${sale.invoiceNo}`
      : invoicePrintFormat === 'A5'
        ? `/print/a5-invoice/${sale.invoiceNo}`
        : `/print/invoice/${sale.invoiceNo}`;
    const printUrl = sale.isCustomerDiscount
      ? `${printPath}?discountId=${-(sale.id + 1_000_000_000)}`
      : sale.isCustomerReturn ? `${printPath}?returnId=${Math.abs(sale.id)}` : printPath;
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
              <DateRangeFilter
                from={fromDate}
                to={toDate}
                onFromChange={handleFromDateChange}
                onToChange={handleToDateChange}
                fromLabel="From Date:"
                toLabel="To Date:"
                fromManuallyChanged={fromDateManuallyChanged}
                toManuallyChanged={toDateManuallyChanged}
                wrapperClassName="w-full space-y-2"
              />

              <div className="w-full space-y-2">
                <Label className="text-sm font-medium">Payment Type:</Label>
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Account">Account</SelectItem>
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
                <div className="h-10"></div>
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center gap-1"
                          >
                            <Printer size={14} />
                            <span className="hidden sm:inline">Bulk Print</span>
                            <span className="sm:hidden">Print</span>
                            <ChevronDown size={12} className="ml-1 opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={handleBulkPrint} className="cursor-pointer">
                            <Printer size={14} className="mr-2" />
                            Dot Matrix
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleBulkA4Print} className="cursor-pointer">
                            <FileText size={14} className="mr-2" />
                            A4 Invoices
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleBulkA5Print} className="cursor-pointer">
                            <FileText size={14} className="mr-2" />
                            A5 Invoices
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleBulkPickingPrint} className="cursor-pointer">
                            <Package size={14} className="mr-2" />
                            Picking Notes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={handleBulkLabelPrint} className="cursor-pointer">
                            <Tag size={14} className="mr-2" />
                            Labels
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                        disabled={selectedPaymentSales.length === 0}
                      >
                        <span className="hidden sm:inline">Paid (Cash) - </span>
                        <span className="sm:hidden">Cash - </span>
                        {selectedPaymentSales.length}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 h-7"
                        onClick={handleUpdateToCard}
                        disabled={selectedPaymentSales.length === 0}
                      >
                        <span className="hidden sm:inline">Pay Card - </span>
                        <span className="sm:hidden">Card - </span>
                        {selectedPaymentSales.length}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-2 py-1 h-7"
                        onClick={handleUpdateToBankTransfer}
                        disabled={selectedPaymentSales.length === 0}
                      >
                        <span className="hidden sm:inline">Transfer - </span>
                        <span className="sm:hidden">Trans - </span>
                        {selectedPaymentSales.length}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-2 py-1 h-7"
                        onClick={handleUpdateToCheque}
                        disabled={selectedPaymentSales.length === 0}
                      >
                        <span className="hidden sm:inline">Cheque - </span>
                        <span className="sm:hidden">Chq - </span>
                        {selectedPaymentSales.length}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs px-2 py-1 h-7"
                        onClick={handleUpdateToAccount}
                        disabled={selectedPaymentSales.length === 0}
                      >
                        <span className="hidden sm:inline">Account - </span>
                        <span className="sm:hidden">Acc - </span>
                        {selectedPaymentSales.length}
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
                        checked={selectableData.every(sale => selectedSales.has(sale.id)) && selectableData.length > 0}
                        disabled={selectableData.length === 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="w-8 sm:w-10 text-center">#</TableHead>
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
                      <TableCell colSpan={11}>Loading...</TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((sale, idx) => (
                      <TableRow
                        key={sale.id}
                        className={cn(
                          sale.isVoid && 'bg-gray-100 text-gray-500',
                          sale.isCustomerReturn && 'bg-red-50 border-red-200',
                          sale.isCustomerDiscount && 'bg-orange-50 border-orange-200',
                          sale.isCompany && 'bg-amber-50 border-amber-200',
                          !sale.isVoid && !sale.isCustomerReturn && !sale.isCustomerDiscount && !sale.isCompany && !sale.isFullyPaid && !sale.isPaidViaCustomerPayment && 'bg-red-50 border-red-200',
                          !sale.isVoid && !sale.isCustomerReturn && !sale.isCustomerDiscount && !sale.isCompany && sale.isFullyPaid && sale.isPaidViaCustomerPayment && 'bg-green-50 border-green-200',
                          !sale.isVoid && !sale.isCustomerReturn && !sale.isCustomerDiscount && !sale.isCompany && sale.isFullyPaid && !sale.isPaidViaCustomerPayment && 'bg-blue-50 border-blue-200'
                        )}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedSales.has(sale.id)}
                            disabled={sale.isVoid}
                            onChange={(e) => handleCheckboxChange(sale.id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell className="text-center text-xs sm:text-sm text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-xs sm:text-sm">
                          {sale.isUnknownDate ? 'Unknown' : formatDateForDisplay(sale.date, 'MM/dd/yy')}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm">
                          {sale.isCustomerReturn || sale.isCustomerDiscount ? (
                            <button
                              type="button"
                              className="text-blue-600 underline"
                              onClick={() => setCreditDetailsTarget(
                                sale.isCustomerDiscount
                                  ? { kind: "discount", lineId: -(sale.id + 1_000_000_000) }
                                  : { kind: "return", lineId: Math.abs(sale.id) },
                              )}
                            >
                              {sale.invoiceNo}
                            </button>
                          ) : sale.invoiceNo}
                          {sale.isCustomerReturn && <span className="ml-1 text-xs text-red-600">(Return)</span>}
                          {sale.isCustomerDiscount && <span className="ml-1 text-xs text-orange-700">(Credit/Adj)</span>}
                          {sale.isVoid && (
                            <span className="ml-1 text-xs font-semibold text-gray-600">
                              {sale.isUnknownDate ? "(VOID - DATE UNKNOWN)" : "(VOID)"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-blue-600 text-xs sm:text-sm">
                          {sale.isVoid ? (
                            <span className="text-gray-500">{getDisplayCustomerName(sale)}</span>
                          ) : sale.isCustomerReturn || sale.isCustomerDiscount ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="link" className="p-0 text-blue-600 underline cursor-pointer text-left">
                                  {getDisplayCustomerName(sale)}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuItem
                                  className="text-sm py-2"
                                  onClick={() => setCreditDetailsTarget(
                                    sale.isCustomerDiscount
                                      ? { kind: "discount", lineId: -(sale.id + 1_000_000_000) }
                                      : { kind: "return", lineId: Math.abs(sale.id) },
                                  )}
                                >
                                  <Eye className="mr-2 h-4 w-4" /> View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-sm py-2" onClick={() => handlePrintTicket(sale)}>
                                  <Printer className="mr-2 h-4 w-4" /> Print
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-sm py-2"
                                  onClick={() => {
                                    const documentId = sale.isCustomerDiscount
                                      ? -(sale.id + 1_000_000_000)
                                      : Math.abs(sale.id);
                                    const download = sale.isCustomerDiscount
                                      ? downloadCustomerDiscountPdf(documentId)
                                      : downloadCustomerReturnPdf(documentId);
                                    void download.catch((error: unknown) => {
                                      toast({
                                        title: "Error",
                                        description: error instanceof Error ? error.message : "Failed to download PDF.",
                                        variant: "destructive",
                                      });
                                    });
                                  }}
                                >
                                  <FileText className="mr-2 h-4 w-4" /> Download PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-sm py-2" onClick={() => sendInvoiceEmail(sale)}>
                                  <Mail className="mr-2 h-4 w-4" /> Email
                                </DropdownMenuItem>
                                {sale.isCustomerReturn && (
                                  <DropdownMenuItem
                                    className="text-sm py-2"
                                    onClick={() => window.open(`/print/packing-list/${encodeURIComponent(sale.invoiceNo)}?returnId=${Math.abs(sale.id)}`, '_blank')}
                                  >
                                    <Package className="mr-2 h-4 w-4" /> Picking List
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
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
                              {(isPastDate(sale.date || '') ? canEditBackdate : canEditCurrentDate) && (
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
                                onClick={() => handlePrintTicket(sale)}
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
                          )}
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
                    <TableCell></TableCell>
                    <TableCell className="font-bold text-xs sm:text-sm">{filteredData.length} Items</TableCell>
                    <TableCell className="text-center font-bold text-xs sm:text-sm">{formatQuantity(filteredTotalBoxes)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {filteredTotalAmount === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{filteredTotalAmount.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {filteredTotalCash === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{filteredTotalCash.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {filteredTotalBank === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{filteredTotalBank.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {filteredTotalBankTransfer === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{filteredTotalBankTransfer.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs sm:text-sm">
                      {filteredTotalCheque === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{filteredTotalCheque.toFixed(2)}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-red-600 text-xs sm:text-sm">
                      {filteredTotalCredit === 0 ? "-" : (
                        <>
                          <span className="hidden sm:inline">£</span>{filteredTotalCredit.toFixed(2)}
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
              <div className="text-center sm:text-left">Showing {filteredData.length} entries</div>
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
                  <p className={`${Math.round(splitPaymentData.cashAmount * 100) + Math.round(splitPaymentData.cardAmount * 100) ===
                    Math.round(((splitPaymentDialog.sale.amount || 0) + (splitPaymentDialog.sale.cash || 0) + (splitPaymentDialog.sale.bank || 0)) * 100)
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

        <CreditDocumentDetailsDialog
          open={!!creditDetailsTarget}
          onOpenChange={(open) => { if (!open) setCreditDetailsTarget(null); }}
          kind={creditDetailsTarget?.kind ?? "discount"}
          lineId={creditDetailsTarget?.lineId ?? null}
        />
      </div>
    </PageLayout>
  );
}