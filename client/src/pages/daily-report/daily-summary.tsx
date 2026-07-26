import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, FileText, Printer, Mail, Receipt, FileCheck, Pencil } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { cn, formatQuantity, formatSmartQuantity } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useCompanyDetails } from "@/hooks/use-company-details";
import { useBackdatePermissions } from "@/hooks/usePermissions";
import PageLayout from "@/components/common/page-layout";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import "./styles.css";
// Add CSS for print page breaks
const printStyles = `
  @media print {
    .print\\:page-break-before-always {
      page-break-before: always !important;
    }
    .print\\:hidden {
      display: none !important;
    }
    .footer-text {
      position: fixed;
      bottom: 10px;
      right: 10px;
      font-size: 8px;
      color: #666;
    }
    .total-banking-print {
      font-size: 18px !important;
      font-weight: bold !important;
      background-color: #e3f2fd !important;
      border: 2px solid #1976d2 !important;
      padding: 8px !important;
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.innerText = printStyles;
  document.head.appendChild(styleSheet);
}

// Utility: small class to hide elements during print; used via Tailwind-like class names already injected

interface StockItem {
  id: number;
  slNo: number;
  productDescription: string;
  os: number;
  ns: number;
  sales: number;
  crtn: number;
  dmps: number;
  srtn: number;
  stock: number;
  clStock: number;
  result: string;
  status: 'correct' | 'short' | 'excess';
  productType: 'regular' | 'non';
}

interface PurchaseEntry {
  id: number;
  slNo: number;
  date: string;
  supplier: string;
  supplierId: number;
  invNo: number;
  invoiceAmt: number;
}

interface PurchaseFullViewRow {
  date: string;
  supplier: string;
  invNo: string;
  awb: string;
  product: string;
  productId?: number;
  quantity: number;
  unitPrice: number;
  sellingPrice: number;
  total: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isCompany?: boolean;
}

interface DailySummaryData {
  date: string;
  sales_summary: Array<{
    customer_name: string;
    invoice_no: string; // Changed to invoice_no for sales summary
    cash_sales: number;
    card_paid: number;
    bank_transfer: number;
    cheque: number;
    account_sales: number;
    account_paid_cash: number;
    account_paid_cheque: number;
    account_credits: number;
    customer_type?: string;
    gate_number?: string;
    is_company?: boolean;
  }>;
  customer_payments: Array<{
    customer_name: string;
    customer_id: number;
    payment_id: string; // Changed to payment_id for customer payments
    cash_amount: number;
    card_amount: number;
    bank_transfer_amount: number;
    cheque_amount: number;
    total_amount: number;
    date: string;
  }>;
  supplier_payments: Array<{
    supplier_name: string;
    supplier_invoice_number: string;
    supplier_invoice_date: string;
    amount: number;
    payment_mode: string;
    date: string;
  }>;
  expense_entries: Array<{
    ref_number: string;
    invoice_number: string;
    supplier_name: string;
    supplier_invoice_date: string;
    expense_name: string;
    amount: number;
    payment_mode: string;
    date: string;
  }>;
  cash_cf: {
    pounds: number;
    coins: number;
    total: number;
    till_float: number;
    carry_forward: number;
    date: string;
  };
  banking_records: Array<{
    date: string;
    remarks: string;
    payment_type: string;
    amount: number;
    paying_number: string;
    cheque_number: string;
    bag_details: Array<{
      bag_number: string;
      paying_number: string;
      amount: number;
    }>;
  }>;
  totals: {
    cash_sales: number;
    card_sales: number;
    bank_transfer_sales: number;
    cheque_sales: number;
    account_sales: number;
    account_credits: number;
    total_sales: number;
    customer_payments_total: number;
    customer_cash_payments: number;
    supplier_payments_total: number;
    supplier_payments_paid_out: number;
    expense_total: number;
    expense_payments_paid_out: number;
    cash_cf_total: number;
    banking_total: number;
    bank_transfer_payments: number;
  };
}

// Helper function to determine display name for cash customers (same logic as Daily Book Sales)
const getDisplayCustomerName = (sale: {
  customer_name: string;
  customer_type?: string;
  gate_number?: string;
}): string => {
  // Check if this is a cash customer by customer type (most reliable)
  const isCashCustomer = sale.customer_type === 'cash';
  
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
  
  const customerNameLower = (sale.customer_name || '').toLowerCase().trim();
  const isCashByName = cashSalePatterns.includes(customerNameLower);
  
  // If it's a cash customer (by type or name) and has a gate number, show gate number
  if ((isCashCustomer || isCashByName) && sale.gate_number && sale.gate_number.trim()) {
    return `${sale.gate_number.trim()}`;
  }
  
  // Otherwise, show the customer name as usual
  return sale.customer_name || 'Unknown Customer';
};

function PrintButton() {
  const handlePrint = () => {
    window.print();
  };

  return (
    <button
      onClick={handlePrint}
      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors print:hidden"
    >
      <Printer className="w-4 h-4" />
      Print Report
    </button>
  );
}
export default function DailySummary() {
  const { currentDate: businessDate } = useBusinessDate();
  const { canEditCurrentDate, canEditBackdate } = useBackdatePermissions();

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Safely initialize the date
    try {
      return businessDate ? new Date(businessDate) : new Date();
    } catch {
      return new Date();
    }
  });

  // Helper: can the user edit/click records for the currently selected date?
  // Uses current-date permission if selectedDate == businessDate, backdate permission otherwise.
  const canEditForSelectedDate = (() => {
    if (!selectedDate || !businessDate) return false;
    const selected = format(selectedDate, "yyyy-MM-dd");
    const business = format(new Date(businessDate), "yyyy-MM-dd");
    return selected === business ? canEditCurrentDate : canEditBackdate;
  })();
  const { toast } = useToast();
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);

  // Update selectedDate when businessDate changes
  useEffect(() => {
    if (businessDate) {
      try {
        const newDate = new Date(businessDate);
        if (!isNaN(newDate.getTime())) {
          setSelectedDate(newDate);
        }
      } catch {
        // Keep current selectedDate if businessDate is invalid
      }
    }
  }, [businessDate]);

  // Fetch daily summary data with fresh data on mount and date changes
  const { data: summaryData, isLoading, error } = useQuery<DailySummaryData>({
    queryKey: ["/api/reports/daily-summary", selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""],
    queryFn: () => apiRequest("GET", `/api/reports/daily-summary?date=${format(selectedDate, "yyyy-MM-dd")}`),
    enabled: !!selectedDate,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Sort sales summary by invoice number ascending
  const sortedSalesSummary = useMemo(() => {
    if (!summaryData?.sales_summary) return [];
    return [...summaryData.sales_summary].sort((a, b) => {
      const aNum = parseInt(a.invoice_no, 10);
      const bNum = parseInt(b.invoice_no, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return String(a.invoice_no).localeCompare(String(b.invoice_no), undefined, { numeric: true });
    });
  }, [summaryData?.sales_summary]);

  // Debug: Log the sales summary data to understand the structure
  useEffect(() => {
    if (summaryData?.sales_summary) {
      console.log('Sales Summary Data:', summaryData.sales_summary);
      console.log('First sale item:', summaryData.sales_summary[0]);
    }
  }, [summaryData]);

  // Fetch company details for PDF header
  const { companyDetails } = useCompanyDetails();

  // Fetch stock check data
  const { data: stockData = [] } = useQuery<StockItem[]>({
    queryKey: ["stock-check", selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""],
    queryFn: async () => {
      if (!selectedDate) return [];
      const params = new URLSearchParams({
        fromDate: format(selectedDate, "yyyy-MM-dd"),
        toDate: format(selectedDate, "yyyy-MM-dd"),
        search: ""
      });
      return apiRequest("GET", `/api/reports/stock-check?${params}`);
    },
    enabled: !!selectedDate,
    staleTime: 0,
    gcTime: 0,
  });

  // Filter stock data to only show entries with non-zero values
  const filteredStockData = stockData.filter((item) =>
    item.os !== 0 ||
    item.ns !== 0 ||
    item.sales !== 0 ||
    item.crtn !== 0 ||
    item.dmps !== 0 ||
    item.srtn !== 0 ||
    item.stock !== 0 ||
    item.clStock !== 0
  );

  // Fetch purchase data (legacy - keeping for backward compatibility)
  const { data: purchaseData = [] } = useQuery<PurchaseEntry[]>({
    queryKey: ["/api/reports/daily-book-purchase", selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""],
    queryFn: () => {
      if (!selectedDate) return [];
      const params = new URLSearchParams();
      params.append("fromDate", format(selectedDate, "yyyy-MM-dd"));
      params.append("toDate", format(selectedDate, "yyyy-MM-dd"));
      params.append("search", "");
      return apiRequest("GET", `/api/reports/daily-book-purchase?${params.toString()}`);
    },
    enabled: !!selectedDate,
    staleTime: 0,
    gcTime: 0,
  });

  // Fetch product purchase full view data
  const { data: productPurchaseData = [] } = useQuery<PurchaseFullViewRow[]>({
    queryKey: ['product-purchase-full-view', selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""],
    queryFn: async () => {
      if (!selectedDate) return [];
      const fromDateStr = format(selectedDate, "yyyy-MM-dd");
      const toDateStr = format(selectedDate, "yyyy-MM-dd");
      const response = await apiRequest('GET', `/api/reports/product-purchase-full-view?fromDate=${fromDateStr}&toDate=${toDateStr}&search=`);
      return response;
    },
    enabled: !!selectedDate,
    staleTime: 0,
    gcTime: 0,
  });

  // Fetch cheque payments data
  const { data: chequePaymentsData = [] } = useQuery<any[]>({
    queryKey: ["/api/reports/daily-book-sales-cheque", selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""],
    queryFn: () => {
      if (!selectedDate) return [];
      const params = new URLSearchParams();
      params.append("fromDate", format(selectedDate, "yyyy-MM-dd"));
      params.append("toDate", format(selectedDate, "yyyy-MM-dd"));
      params.append("paymentType", "cheque");
      params.append("salesman", "all");
      params.append("search", "");
      return apiRequest("GET", `/api/reports/daily-book-sales?${params.toString()}`);
    },
    enabled: !!selectedDate,
    staleTime: 0,
    gcTime: 0,
  });

  // Fetch bank transfer payments data
  const { data: bankTransferPaymentsData = [] } = useQuery<any[]>({
    queryKey: ["/api/reports/daily-book-sales-bank-transfer", selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""],
    queryFn: () => {
      if (!selectedDate) return [];
      const params = new URLSearchParams();
      params.append("fromDate", format(selectedDate, "yyyy-MM-dd"));
      params.append("toDate", format(selectedDate, "yyyy-MM-dd"));
      params.append("paymentType", "bank_transfer");
      params.append("salesman", "all");
      params.append("search", "");
      return apiRequest("GET", `/api/reports/daily-book-sales?${params.toString()}`);
    },
    enabled: !!selectedDate,
    staleTime: 0,
    gcTime: 0,
  });

  // Calculate total cheque payments
  const totalChequePayments = chequePaymentsData.reduce((sum, payment) => sum + (payment.cheque || 0), 0);

  // Calculate total bank transfer payments
  const totalBankTransferPayments = bankTransferPaymentsData.reduce((sum, payment) => sum + (payment.bank_transfer || 0), 0);

  const handleGeneratePDF = async () => {
    if (!selectedDate) {
      toast({
        title: "Error",
        description: "Please select a valid date",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = localStorage.getItem('jwt_token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Use the correct backend URL
      const backendUrl = window.location.origin.replace(':5173', ':5000');
      const url = `${backendUrl}/api/reports/daily-summary/pdf?date=${format(selectedDate, "yyyy-MM-dd")}&token=${token}&includeStock=true&includePurchase=true`;

      // Open in new window for printing
      const printWindow = window.open(
        url,
        '_blank',
        'width=800,height=600,scrollbars=yes,resizable=yes'
      );

      if (!printWindow) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      toast({
        title: "Success",
        description: "PDF opened in new window for printing (includes Stock Check and Purchase data)",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    }
  };

  // ── Single PDF builder — matches the screen layout exactly ──────────────
  const buildPDF = async (): Promise<jsPDF | null> => {
    if (!selectedDate || !summaryData) return null;

    // Always fetch stock data fresh so PDF always includes it
    let pdfStockData: StockItem[] = stockData;
    try {
      const params = new URLSearchParams({
        fromDate: format(selectedDate, "yyyy-MM-dd"),
        toDate: format(selectedDate, "yyyy-MM-dd"),
        search: ""
      });
      const freshStock = await apiRequest("GET", `/api/reports/stock-check?${params}`);
      if (Array.isArray(freshStock) && freshStock.length > 0) {
        pdfStockData = freshStock;
      }
    } catch {
      // fall back to cached stockData
    }

    const doc = new jsPDF();
    let y = 20;

    const tbl = (head: string[][], body: any[], opts?: any) => {
      const { didParseCell: userDidParseCell, ...restOpts } = opts || {};
      autoTable(doc, {
        head, body,
        startY: y,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.1 },
        headStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], fontStyle: 'bold', lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.2 },
        bodyStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [0, 0, 0] as [number, number, number] },
        alternateRowStyles: { fillColor: [255, 255, 255] as [number, number, number] },
        ...restOpts,
        didParseCell: (data: any) => {
          const row = body[data.row.index];
          if (row && row[0] === 'VOID') {
            data.cell.styles.textColor = [180, 180, 180];
            data.cell.styles.fontStyle = 'italic';
          }
          if (userDidParseCell) userDidParseCell(data);
        }
      });
      y = (doc as any).lastAutoTable.finalY + 12;
    };

    const section = (title: string) => {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 14, y);
      doc.setFont('helvetica', 'normal');
      y += 8;
    };

    // ── Page 1 header ────────────────────────────────────────────────────
    // Company name from company details
    if (companyDetails?.companyName) {
      doc.setFontSize(13);
      doc.setFont('helvetica', 'normal');
      doc.text(companyDetails.companyName, 14, y);
      y += 8;
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Daily Summary Report', 14, y);
    doc.setFont('helvetica', 'normal');
    y += 12;

    // 1. Daily Sales Summary — with "stand 100" on the right
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Daily Sales Summary - ${format(selectedDate, "EEEE, dd/MM/yyyy")}`, 14, y);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Stand-100', pageWidth - 14, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    y += 8;
    tbl(
      [['Customer', 'Invoice No', 'Cash Sales', 'Card Paid', 'Bank Transfer', 'Cheque', 'Account Sales', 'Account Credits']],
      [
        ...sortedSalesSummary.map(s => [
          getDisplayCustomerName(s),
          s.invoice_no || '-',
          s.cash_sales > 0 ? s.cash_sales.toFixed(2) : '-',
          s.card_paid > 0 ? s.card_paid.toFixed(2) : '-',
          (s.bank_transfer || 0) > 0 ? (s.bank_transfer || 0).toFixed(2) : '-',
          (s.cheque || 0) > 0 ? (s.cheque || 0).toFixed(2) : '-',
          s.account_sales > 0 ? s.account_sales.toFixed(2) : '-',
          s.account_credits > 0 ? s.account_credits.toFixed(2) : '-',
        ]),
        ['TOTALS', '',
          summaryData.totals.cash_sales.toFixed(2),
          summaryData.totals.card_sales.toFixed(2),
          (summaryData.totals.bank_transfer_sales || 0).toFixed(2),
          (summaryData.totals.cheque_sales || 0).toFixed(2),
          summaryData.totals.account_sales.toFixed(2),
          (summaryData.totals.account_credits || 0).toFixed(2),
        ],
      ]
    );

    // 2. Customer Payments (with VOID gap rows)
    if (summaryData.customer_payments.length > 0) {
      section('Customer Payments');
      const sorted = [...summaryData.customer_payments].sort((a, b) => parseInt(a.payment_id) - parseInt(b.payment_id));
      const cpBody: any[] = [];
      sorted.forEach((p, i) => {
        if (i > 0) {
          const prev = parseInt(sorted[i - 1].payment_id);
          const curr = parseInt(p.payment_id);
          for (let m = prev + 1; m < curr; m++) {
            cpBody.push(['VOID', String(m), '-', '-', '-', '-', '-']);
          }
        }
        cpBody.push([
          p.customer_name, p.payment_id,
          p.cash_amount > 0 ? p.cash_amount.toFixed(2) : '-',
          p.card_amount > 0 ? p.card_amount.toFixed(2) : '-',
          p.bank_transfer_amount > 0 ? p.bank_transfer_amount.toFixed(2) : '-',
          p.cheque_amount > 0 ? p.cheque_amount.toFixed(2) : '-',
          p.total_amount.toFixed(2),
        ]);
      });
      cpBody.push(['TOTAL', '',
        summaryData.customer_payments.reduce((s, p) => s + p.cash_amount, 0).toFixed(2),
        summaryData.customer_payments.reduce((s, p) => s + p.card_amount, 0).toFixed(2),
        summaryData.customer_payments.reduce((s, p) => s + (p.bank_transfer_amount || 0), 0).toFixed(2),
        summaryData.customer_payments.reduce((s, p) => s + (p.cheque_amount || 0), 0).toFixed(2),
        summaryData.totals.customer_payments_total.toFixed(2),
      ]);
      tbl([['Customer Name', 'Payment ID', 'Cash', 'Card', 'Bank Transfer', 'Cheque', 'Total']], cpBody);
    }

    // 3. Supplier Payments
    if (summaryData.supplier_payments.length > 0) {
      section('Supplier Payments');
      tbl(
        [['Supplier Name', 'Supplier Invoice No', 'Supplier Invoice Date', 'Amount', 'Payment Mode']],
        [
          ...summaryData.supplier_payments.map(p => [
            p.supplier_name,
            p.supplier_invoice_number || '-',
            p.supplier_invoice_date ? format(new Date(p.supplier_invoice_date), "dd/MM/yyyy") : '-',
            p.amount.toFixed(2),
            p.payment_mode,
          ]),
          ['TOTAL', '', '', summaryData.totals.supplier_payments_total.toFixed(2), ''],
        ]
      );
    }

    // 4. Expense Entries
    if (summaryData.expense_entries.length > 0) {
      section('Expense Entries');
      tbl(
        [['Supplier Name', 'Supplier Invoice No', 'Supplier Invoice Date', 'Expense Name', 'Amount', 'Payment Mode']],
        [
          ...summaryData.expense_entries.map(e => [
            e.supplier_name,
            e.invoice_number || '-',
            e.supplier_invoice_date ? format(new Date(e.supplier_invoice_date), 'dd/MM/yyyy') : '-',
            e.expense_name,
            e.amount.toFixed(2),
            e.payment_mode,
          ]),
          ['TOTAL', '', '', '', summaryData.expense_entries.reduce((s, e) => s + e.amount, 0).toFixed(2), ''],
        ]
      );
    }

    // 5. Total Sales Summary
    section('Total Sales Summary');
    const totalAllSales = summaryData.totals.cash_sales + summaryData.totals.card_sales +
      (summaryData.totals.bank_transfer_sales || 0) + (summaryData.totals.cheque_sales || 0) +
      summaryData.totals.account_sales;
    tbl([], [['Daily Sales (All Payment Methods)', `£${totalAllSales.toFixed(2)}`]], {
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { fontStyle: 'bold', halign: 'right' } }
    });

    // 6. Card Sales & Customer Card Payments
    section('Card Sales & Customer Card Payments');
    tbl([], [
      ['Total Card Sales', `£${summaryData.totals.card_sales.toFixed(2)}`],
      ['Account Paid Card (Backdate)', `£${summaryData.customer_payments.reduce((s, p) => s + p.card_amount, 0).toFixed(2)}`],
    ], {
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { fontStyle: 'bold', halign: 'right' } }
    });

    // 7. Payment Received via Bank Transfer
    section('Payment Received via Bank Transfer');
    const totalBankTransfer = (summaryData.totals.bank_transfer_sales || 0) + (summaryData.totals.bank_transfer_payments || 0);
    tbl([], [
      ['Current Day Invoice Bank Transfers', `£${(summaryData.totals.bank_transfer_sales || 0).toFixed(2)}`],
      ['Customer Bank Transfer Payments', `£${(summaryData.totals.bank_transfer_payments || 0).toFixed(2)}`],
      ['Total Bank Transfer Received', `£${totalBankTransfer.toFixed(2)}`],
    ], {
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { fontStyle: 'bold', halign: 'right' } }
    });

    // 8. Total Banking
    section('Total Banking');
    tbl([], [
      ['Total Cash Sales', `£${summaryData.totals.cash_sales.toFixed(2)}`],
      ['Total Cheque', `£${(summaryData.totals.cheque_sales || 0).toFixed(2)}`],
      ['Account Paid Cash (Backdate)', `£${(summaryData.totals.customer_cash_payments || 0).toFixed(2)}`],
      ['Cash Held (From Previous Day)', `+£${(summaryData.cash_cf?.carry_forward || 0).toFixed(2)}`],
      ['Till Float (Set Aside Today)', `-£${(summaryData.cash_cf?.till_float || 0).toFixed(2)}`],
      ['Total Supplier Payment (Paid Out)', `-£${(summaryData.totals.supplier_payments_paid_out || 0).toFixed(2)}`],
      ['Total Expense (Paid Out)', `-£${(summaryData.totals.expense_payments_paid_out || 0).toFixed(2)}`],
      ['Total Banking', `£${summaryData.totals.banking_total.toFixed(2)}`],
    ], {
      styles: { fontSize: 10, cellPadding: 3, lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.15 },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { fontStyle: 'bold', halign: 'right' } },
      didParseCell: (data: any) => {
        if (data.row.index === 7) {
          data.cell.styles.fillColor = [173, 216, 230];
          data.cell.styles.fontSize = 12;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    // 9. Banking Records
    if (summaryData.banking_records.length > 0) {
      const recordsSum = summaryData.banking_records.reduce((s, r) => s + r.amount, 0);
      const calcTotal = summaryData.totals.banking_total;
      const diff = recordsSum - calcTotal;
      section('Banking Records');
      tbl(
        [['Date', 'Remarks', 'Payment Type', 'Amount', 'Details']],
        [
          ...summaryData.banking_records.map(r => [
            r.date ? format(new Date(r.date), "dd/MM/yyyy") : 'N/A',
            r.remarks, r.payment_type, r.amount.toFixed(2),
            r.bag_details.length > 0
              ? r.bag_details.map(b => `Bag: ${b.bag_number}`).join(', ')
              : `${r.paying_number ? `Pay In: ${r.paying_number}` : ''}${r.cheque_number ? ` | Cheque: ${r.cheque_number}` : ''}`,
          ]),
          ['TOTAL', '', '', recordsSum.toFixed(2), ''],
        ]
      );
      if (diff !== 0) {
        y += 2;
        const label = diff > 0 ? 'Extra' : 'Short';
        doc.setTextColor(diff > 0 ? 0 : 180, diff > 0 ? 128 : 0, 0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`Note: Banking records sum (£${recordsSum.toFixed(2)}) ${diff > 0 ? 'exceeds' : 'falls short of'} calculated total (£${calcTotal.toFixed(2)}) — ${label}: £${Math.abs(diff).toFixed(2)}`, 14, y);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        y += 8;
      }
    }

    // 10. Product Purchase Full View — new page
    if (productPurchaseData.length > 0) {
      doc.addPage();
      y = 20;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Product Purchase Full View', 14, y);
      doc.setFont('helvetica', 'normal');
      y += 8;
      doc.setFontSize(10);
      doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 14, y);
      y += 10;

      const displayData = Array.isArray(productPurchaseData) ? productPurchaseData : [];
      const processedData: any[] = [];
      let pdfGrandQty = 0, pdfGrandTotal = 0;
      displayData.forEach((row, index) => {
        if (row.isHeader) {
          processedData.push([row.date, row.supplier, row.invNo, '', '', '', '', '']);
        } else if (row.isTotal) {
          processedData.push(['', '', '', '', row.product?.replace(/\.000/g, ''), formatSmartQuantity(row.quantity), '', Number(row.total).toFixed(2)]);
          if (index < displayData.length - 1) processedData.push(['', '', '', '', '', '', '', '']);
        } else {
          processedData.push(['', '', row.invNo, '', row.product, formatSmartQuantity(row.quantity), Number(row.unitPrice).toFixed(2), Number(row.total).toFixed(2)]);
          pdfGrandQty += Number(row.quantity || 0);
          pdfGrandTotal += Number(row.total || 0);
        }
      });
      const pdfAvgPrice = pdfGrandQty > 0 ? pdfGrandTotal / pdfGrandQty : 0;
      processedData.push(['GRAND TOTAL', '', '', '', '', formatSmartQuantity(pdfGrandQty), `£${pdfAvgPrice.toFixed(2)}`, `£${pdfGrandTotal.toFixed(2)}`]);
      tbl(
        [['Date', 'Supplier', 'Ref No', 'Invoice No', 'Product', 'Quantity', 'Unit Price', 'Total']],
        processedData,
        {
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1, lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.1 },
          headStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], fontStyle: 'bold', lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.2 },
          columnStyles: {
            0: { cellWidth: 25 }, 1: { cellWidth: 35 }, 2: { cellWidth: 18 },
            3: { cellWidth: 18 }, 4: { cellWidth: 35 }, 5: { cellWidth: 18 },
            6: { cellWidth: 22 }, 7: { cellWidth: 22 },
          },
          didParseCell: (data: any) => {
            const r = processedData[data.row.index];
            if (r && r[0] && r[1] && !r[4]) data.cell.styles.fontStyle = 'bold';
            if (r && r[4] && r[7] && !r[0] && !r[1]) data.cell.styles.fontStyle = 'bold';
          }
        }
      );
    }

    // 11. Stock Check — new page
    const filteredStock = pdfStockData.filter((item: StockItem) =>
      item.os !== 0 || item.ns !== 0 || item.sales !== 0 || item.crtn !== 0 ||
      item.dmps !== 0 || item.srtn !== 0 || item.stock !== 0 || item.clStock !== 0
    );
    if (filteredStock.length > 0) {
      doc.addPage();
      y = 20;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Stock Check', 14, y);
      doc.setFont('helvetica', 'normal');
      y += 8;
      doc.setFontSize(10);
      doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 14, y);
      y += 10;

      const st = {
        os: filteredStock.reduce((s, i) => s + i.os, 0),
        ns: filteredStock.reduce((s, i) => s + i.ns, 0),
        sales: filteredStock.reduce((s, i) => s + i.sales, 0),
        crtn: filteredStock.reduce((s, i) => s + i.crtn, 0),
        dmps: filteredStock.reduce((s, i) => s + i.dmps, 0),
        srtn: filteredStock.reduce((s, i) => s + i.srtn, 0),
        stock: filteredStock.reduce((s, i) => s + i.stock, 0),
        clStock: filteredStock.reduce((s, i) => s + i.clStock, 0),
      };
      tbl(
        [['Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result']],
        [
          ...filteredStock.map((item: StockItem) => [
            item.slNo, item.productDescription,
            formatQuantity(item.os), formatQuantity(item.ns), formatQuantity(item.sales),
            formatQuantity(item.crtn), formatQuantity(item.dmps), formatQuantity(item.srtn),
            formatQuantity(item.stock), formatQuantity(item.clStock), item.result,
          ]),
          ['TOTAL', '',
            formatQuantity(st.os), formatQuantity(st.ns), formatQuantity(st.sales),
            formatQuantity(st.crtn), formatQuantity(st.dmps), formatQuantity(st.srtn),
            formatQuantity(st.stock), formatQuantity(st.clStock), '',
          ],
        ],
        {
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1, lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.1 },
          headStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [0, 0, 0] as [number, number, number], fontStyle: 'bold', lineColor: [0, 0, 0] as [number, number, number], lineWidth: 0.2 },
          columnStyles: {
            0: { cellWidth: 12 }, 1: { cellWidth: 38 }, 2: { cellWidth: 14 }, 3: { cellWidth: 14 },
            4: { cellWidth: 14 }, 5: { cellWidth: 14 }, 6: { cellWidth: 14 }, 7: { cellWidth: 14 },
            8: { cellWidth: 14 }, 9: { cellWidth: 14 }, 10: { cellWidth: 14 },
          }
        }
      );
    }

    // Footer on last page
    const ph = doc.internal.pageSize.height;
    const pw = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('Stand-100', pw - 30, ph - 10, { align: 'right' });

    return doc;
  };

  const handleGenerateCleanPDF = async () => {
    if (!selectedDate || !summaryData) {
      toast({ title: "Error", description: "Please select a valid date and ensure data is loaded", variant: "destructive" });
      return;
    }
    const doc = await buildPDF();
    if (!doc) return;
    doc.save(`daily-summary-${format(selectedDate, "yyyy-MM-dd")}.pdf`);
    toast({ title: "Success", description: "PDF downloaded successfully" });
  };

  // Generate PDF blob for email
  const generatePDFBlob = async (): Promise<Blob | null> => {
    const doc = await buildPDF();
    return doc ? doc.output('blob') : null;
  };
  // Email PDF handler
  const handleEmailPDF = async () => {
    if (!emails.trim()) {
      toast({
        title: "Error",
        description: "Please enter at least one email address",
        variant: "destructive",
      });
      return;
    }

    // Parse and validate emails
    const emailList = emails.split(',').map(email => email.trim()).filter(email => email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter(email => !emailRegex.test(email));

    if (invalidEmails.length > 0) {
      toast({
        title: "Error",
        description: `Invalid email addresses: ${invalidEmails.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    if (!summaryData) {
      toast({
        title: "Error",
        description: "No daily summary data available to send. Please select a date first.",
        variant: "destructive",
      });
      return;
    }

    setIsEmailSending(true);

    try {
      // Generate PDF blob
      const pdfBlob = await generatePDFBlob();

      if (!pdfBlob) {
        throw new Error('Failed to generate PDF');
      }

      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64data = reader.result as string;
          const base64PDF = base64data.split(',')[1]; // Remove data:application/pdf;base64, prefix

          // Send email with PDF attachment
          const emailData = {
            to: emailList,
            subject: `Daily Summary Report - ${format(selectedDate, 'yyyy-MM-dd')}`,
            body: `Dear Recipient,\n\nPlease find attached the Daily Summary Report for ${format(selectedDate, 'yyyy-MM-dd')}.\n\nThis report contains:\n- Daily Sales Summary\n- Customer Payments\n- Supplier Payments\n- Expense Entries\n- Banking Records\n- Financial Totals\n- Product Purchase Full View (detailed purchase information)\n\nReport Summary:\n- Total Cash Sales: £${summaryData.totals.cash_sales.toFixed(2)}\n- Total Card Sales: £${summaryData.totals.card_sales.toFixed(2)}\n- Total Banking: £${summaryData.totals.banking_total.toFixed(2)}\n- Date: ${format(selectedDate, 'yyyy-MM-dd')}\n\nBest regards,\n${companyDetails?.companyName || 'Finance Team'}`,
            attachment: {
              filename: `daily-summary-${format(selectedDate, 'yyyy-MM-dd')}.pdf`,
              content: base64PDF,
              contentType: 'application/pdf'
            }
          };

          const response = await apiRequest('POST', '/api/send-email', emailData);

          if (response.message) {
            toast({
              title: "Success",
              description: response.message,
            });
            if (response.warnings) {
              toast({
                title: "Warning",
                description: response.warnings,
                variant: "destructive",
              });
            }
          } else {
            toast({
              title: "Success",
              description: `Daily summary report sent successfully to ${emailList.length} email(s)`,
            });
          }

          setEmails(''); // Clear email field after successful send

        } catch (emailError) {
          console.error('Error sending email:', emailError);

          // Handle specific error messages
          let errorMessage = 'Failed to send email. Please try again.';
          if (emailError && typeof emailError === 'object' && 'error' in emailError) {
            errorMessage = `Email Error: ${(emailError as any).error}`;
          } else if (emailError && typeof emailError === 'string') {
            errorMessage = `Email Error: ${emailError}`;
          }

          toast({
            title: "Error",
            description: errorMessage,
            variant: "destructive",
          });
        } finally {
          setIsEmailSending(false);
        }
      };

      reader.onerror = () => {
        toast({
          title: "Error",
          description: "Failed to process PDF file. Please try again.",
          variant: "destructive",
        });
        setIsEmailSending(false);
      };

      reader.readAsDataURL(pdfBlob);

    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
      setIsEmailSending(false);
    }
  };

  // Add/remove class to body for print styling
  useEffect(() => {
    const handleBeforePrint = () => {
      document.body.classList.add('daily-summary-print');
    };

    const handleAfterPrint = () => {
      document.body.classList.remove('daily-summary-print');
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('daily-summary-print');
    };
  }, []);

  return (
    <PageLayout title="Daily Summary" breadcrumb="Daily Report / Daily Summary">
      <div id="daily-summary-page" className="space-y-6">
        {/* Header */}
        <div className="print-content">
          <Card>
            <CardHeader>
              {companyDetails?.companyName && (
                <div className="text-lg font-semibold mb-1">
                  {companyDetails.companyName}
                </div>
              )}
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Daily Summary Report
                </CardTitle>
                <div className="flex items-center gap-4 print:hidden">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-sm">Date:</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-50 justify-start text-left font-normal",
                            !selectedDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "PPP") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={(date) => date && setSelectedDate(date)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex gap-2 items-center">
                    {/* <Button onClick={handleGeneratePDF} className="bg-red-600 hover:bg-red-700">
                    <Printer className="w-4 h-4 mr-2" />
                    Print PDF
                  </Button> */}
                    <PrintButton />
                    <Button onClick={handleGenerateCleanPDF} className="bg-blue-600 hover:bg-blue-700">
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </Button>
                    {/* <PrintButton /> */}

                    {/* Email Section */}
                    <div className="flex items-center gap-2 ml-2">
                      <input
                        type="text"
                        placeholder="Enter emails (comma separated)"
                        value={emails}
                        onChange={(e) => setEmails(e.target.value)}
                        className="w-48 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                        disabled={isEmailSending}
                      />
                      <Button
                        variant="outline"
                        onClick={handleEmailPDF}
                        className="flex items-center gap-1"
                        disabled={isEmailSending}
                        size="sm"
                      >
                        <Mail size={14} />
                        <span>{isEmailSending ? 'Sending...' : 'Email'}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {isLoading ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center">Loading daily summary...</div>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-red-500">Failed to load daily summary</div>
              </CardContent>
            </Card>
          ) : summaryData ? (
            <div className="space-y-6">
              {/* Daily Sales Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Daily Sales Summary - {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "EEEE, dd/MM/yyyy") : "Invalid Date"}</span>
                    <span className="hidden print:block text-sm font-normal text-gray-500">Stand-100</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold border">Customer</TableHead>
                          <TableHead className="font-semibold border">Invoice No</TableHead>
                          <TableHead className="font-semibold border text-right">Cash Sales</TableHead>
                          <TableHead className="font-semibold border text-right">Card Paid</TableHead>
                          <TableHead className="font-semibold border text-right">Bank Transfer</TableHead>
                          <TableHead className="font-semibold border text-right">Cheque</TableHead>
                          <TableHead className="font-semibold border text-right">Account Sales</TableHead>
                          <TableHead className="font-semibold border text-right">Account Credits</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedSalesSummary.map((sale, index) => (
                          <TableRow key={index} className={sale.is_company ? 'bg-amber-50' : ''}>
                            <TableCell className="border">
                              <span className="flex items-center gap-1">
                                {getDisplayCustomerName(sale)}
                                {sale.is_company && (
                                  <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 py-0 font-medium">CO</span>
                                )}
                              </span>

                            </TableCell>
                            <TableCell className="border">
                              {sale.invoice_no ? (
                                canEditForSelectedDate ? (
                                  <button
                                    className="text-blue-600 underline hover:text-blue-800 cursor-pointer"
                                    onClick={() => window.open(`/data-entry/sales-invoice?invoiceNumber=${sale.invoice_no}&readonly=true`, '_self')}
                                  >
                                    {sale.invoice_no}
                                  </button>
                                ) : (
                                  <span className="text-gray-600">{sale.invoice_no}</span>
                                )
                              ) : '-'}
                            </TableCell>
                            <TableCell className="border text-right">
                              {sale.cash_sales > 0 ? sale.cash_sales.toFixed(2) : '-'}
                            </TableCell>
                            <TableCell className="border text-right">
                              {sale.card_paid > 0 ? sale.card_paid.toFixed(2) : '-'}
                            </TableCell>
                            <TableCell className="border text-right">
                              {(() => {
                                // Use the bank_transfer value from the sales summary data
                                const amount = sale.bank_transfer || 0;
                                console.log('Bank transfer for', sale.customer_name, 'invoice', sale.invoice_no, ':', amount, typeof amount);
                                return amount > 0 ? amount.toFixed(2) : '-';
                              })()}
                            </TableCell>
                            <TableCell className="border text-right">
                              {(() => {
                                // Use the cheque value from the sales summary data
                                const amount = sale.cheque || 0;
                                console.log('Cheque for', sale.customer_name, 'invoice', sale.invoice_no, ':', amount, typeof amount);
                                return amount > 0 ? amount.toFixed(2) : '-';
                              })()}
                            </TableCell>
                            <TableCell className="border text-right">
                              {sale.account_sales > 0 ? sale.account_sales.toFixed(2) : '-'}
                            </TableCell>
                            <TableCell className="border text-right">
                              {sale.account_credits > 0 ? sale.account_credits.toFixed(2) : '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Totals Row */}
                        <TableRow className="bg-gray-100 font-semibold">
                          <TableCell className="border" colSpan={2}>TOTALS</TableCell>
                          <TableCell className="border text-right">{summaryData.totals.cash_sales.toFixed(2)}</TableCell>
                          <TableCell className="border text-right">{summaryData.totals.card_sales.toFixed(2)}</TableCell>
                          <TableCell className="border text-right">{(summaryData.totals.bank_transfer_sales || 0).toFixed(2)}</TableCell>
                          <TableCell className="border text-right">{(summaryData.totals.cheque_sales || 0).toFixed(2)}</TableCell>
                          <TableCell className="border text-right">{summaryData.totals.account_sales.toFixed(2)}</TableCell>
                          <TableCell className="border text-right">{(summaryData.totals.account_credits || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>



              {/* Customer Payments */}
              <Card className={summaryData.customer_payments && summaryData.customer_payments.length === 0 ? "print:hidden" : ""}>
                <CardHeader>
                  <CardTitle>Customer Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold border">Customer Name</TableHead>
                          <TableHead className="font-semibold border">Payment ID</TableHead>
                          <TableHead className="font-semibold border text-right">Cash Amount</TableHead>
                          <TableHead className="font-semibold border text-right">Card Amount</TableHead>
                          <TableHead className="font-semibold border text-right">Bank Transfer</TableHead>
                          <TableHead className="font-semibold border text-right">Cheque</TableHead>
                          <TableHead className="font-semibold border text-right">Total Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const sorted = [...summaryData.customer_payments].sort(
                            (a, b) => parseInt(a.payment_id) - parseInt(b.payment_id)
                          );
                          const rows: React.ReactNode[] = [];
                          sorted.forEach((payment, index) => {
                            // Insert VOID rows for any gaps before this payment
                            if (index > 0) {
                              const prev = parseInt(sorted[index - 1].payment_id);
                              const curr = parseInt(payment.payment_id);
                              for (let missing = prev + 1; missing < curr; missing++) {
                                rows.push(
                                  <TableRow key={`void-${missing}`} className="bg-red-50 text-gray-400 italic">
                                    <TableCell className="border">VOID</TableCell>
                                    <TableCell className="border">{missing}</TableCell>
                                    <TableCell className="border text-right">-</TableCell>
                                    <TableCell className="border text-right">-</TableCell>
                                    <TableCell className="border text-right">-</TableCell>
                                    <TableCell className="border text-right">-</TableCell>
                                    <TableCell className="border text-right">-</TableCell>
                                  </TableRow>
                                );
                              }
                            }
                            rows.push(
                              <TableRow key={payment.payment_id}>
                                <TableCell className="border">
                                  <button
                                    className="text-blue-600 underline hover:text-blue-800 cursor-pointer text-left"
                                    onClick={() => window.open(`/payments/customer-payment-history?customerId=${payment.customer_id}`, '_self')}
                                  >
                                    {payment.customer_name}
                                  </button>
                                </TableCell>
                                <TableCell className="border">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="link" className="p-0 text-blue-600 underline cursor-pointer text-left font-normal h-auto min-h-0">
                                        {payment.payment_id}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-48">
                                      <DropdownMenuItem
                                        className="text-sm py-2"
                                        onClick={() => {
                                          const primaryType = payment.cash_amount >= payment.card_amount
                                            && payment.cash_amount >= payment.bank_transfer_amount
                                            && payment.cash_amount >= payment.cheque_amount ? 'cash' :
                                            payment.card_amount >= payment.bank_transfer_amount
                                            && payment.card_amount >= payment.cheque_amount ? 'bank_transfer' : 'cheque';
                                          window.open(`/print/payment-receipt/${payment.payment_id}/${primaryType}`, '_blank');
                                        }}
                                      >
                                        <FileCheck className="mr-2 h-4 w-4" />
                                        Print A4
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="text-sm py-2"
                                        onClick={() => window.open(`/print/dot-matrix-payment/${payment.payment_id}`, '_blank')}
                                      >
                                        <Receipt className="mr-2 h-4 w-4" />
                                        Print Dot Matrix
                                      </DropdownMenuItem>
                                      {canEditForSelectedDate && (
                                        <DropdownMenuItem
                                          className="text-sm py-2"
                                          onClick={() => window.open(`/payments/customer-payment?customerId=${payment.customer_id}&editBatchId=${payment.payment_id}`, '_self')}
                                        >
                                          <Pencil className="mr-2 h-4 w-4" />
                                          Edit
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        className="text-sm py-2"
                                        onClick={() => window.open(`/payments/customer-payment?customerId=${payment.customer_id}`, '_self')}
                                      >
                                        <FileText className="mr-2 h-4 w-4" />
                                        Invoice
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                                <TableCell className="border text-right">
                                  {payment.cash_amount > 0 ? payment.cash_amount.toFixed(2) : '-'}
                                </TableCell>
                                <TableCell className="border text-right">
                                  {payment.card_amount > 0 ? payment.card_amount.toFixed(2) : '-'}
                                </TableCell>
                                <TableCell className="border text-right">
                                  {payment.bank_transfer_amount > 0 ? payment.bank_transfer_amount.toFixed(2) : '-'}
                                </TableCell>
                                <TableCell className="border text-right">
                                  {payment.cheque_amount > 0 ? payment.cheque_amount.toFixed(2) : '-'}
                                </TableCell>
                                <TableCell className="border text-right">{payment.total_amount.toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          });
                          return rows;
                        })()}
                        {summaryData.customer_payments.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="border text-center text-gray-500 py-4">
                              No customer payments found
                            </TableCell>
                          </TableRow>
                        )}
                        {summaryData.customer_payments.length > 0 && (
                          <TableRow className="bg-gray-100 font-semibold">
                            <TableCell className="border" colSpan={2}>TOTAL</TableCell>
                            <TableCell className="border text-right">
                              {summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="border text-right">
                              {summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="border text-right">
                              {summaryData.customer_payments.reduce((sum, p) => sum + (p.bank_transfer_amount || 0), 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="border text-right">
                              {summaryData.customer_payments.reduce((sum, p) => sum + (p.cheque_amount || 0), 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="border text-right">{summaryData.totals.customer_payments_total.toFixed(2)}</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Supplier Payments */}
              <Card className={summaryData.supplier_payments && summaryData.supplier_payments.length === 0 ? "print:hidden" : ""}>
                <CardHeader>
                  <CardTitle>Supplier Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold border">Supplier Name</TableHead>
                          <TableHead className="font-semibold border">Supplier Invoice No</TableHead>
                          <TableHead className="font-semibold border">Supplier Invoice Date</TableHead>
                          <TableHead className="font-semibold border text-right">Amount</TableHead>
                          <TableHead className="font-semibold border">Payment Mode</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summaryData.supplier_payments.map((payment, index) => {
                          // Check if this is a different supplier from the previous row
                          const isDifferentSupplier = index > 0 && 
                            summaryData.supplier_payments[index - 1].supplier_name !== payment.supplier_name;
                          
                          return (
                            <TableRow 
                              key={index} 
                              className={isDifferentSupplier ? "border-t-4 border-black" : ""}
                            >
                              <TableCell className="border">{payment.supplier_name}</TableCell>
                              <TableCell className="border">{payment.supplier_invoice_number || '-'}</TableCell>
                              <TableCell className="border">{payment.supplier_invoice_date ? format(new Date(payment.supplier_invoice_date), "dd/MM/yyyy") : '-'}</TableCell>
                              <TableCell className="border text-right">{payment.amount.toFixed(2)}</TableCell>
                              <TableCell className="border capitalize">{payment.payment_mode}</TableCell>
                            </TableRow>
                          );
                        })}
                        {summaryData.supplier_payments.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="border text-center text-gray-500 py-4">
                              No supplier payments found
                            </TableCell>
                          </TableRow>
                        )}
                        {summaryData.supplier_payments.length > 0 && (
                          <TableRow className="bg-gray-100 font-semibold">
                            <TableCell className="border" colSpan={3}>TOTAL</TableCell>
                            <TableCell className="border text-right">{summaryData.totals.supplier_payments_total.toFixed(2)}</TableCell>
                            <TableCell className="border"></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Expense Entries */}
              <Card className={summaryData.expense_entries && summaryData.expense_entries.length === 0 ? "print:hidden" : ""}>
                <CardHeader>
                  <CardTitle>Expense Entries</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold border">Supplier Name</TableHead>
                          <TableHead className="font-semibold border">Supplier Invoice No</TableHead>
                          <TableHead className="font-semibold border">Supplier Invoice Date</TableHead>
                          <TableHead className="font-semibold border">Expense Name</TableHead>
                          <TableHead className="font-semibold border text-right">Amount</TableHead>
                          <TableHead className="font-semibold border">Payment Mode</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summaryData.expense_entries.map((expense, index) => (
                          <TableRow key={index}>
                            <TableCell className="border">{expense.supplier_name}</TableCell>
                            <TableCell className="border">{expense.invoice_number || '-'}</TableCell>
                            <TableCell className="border">{expense.supplier_invoice_date ? format(new Date(expense.supplier_invoice_date), 'dd/MM/yyyy') : '-'}</TableCell>
                            <TableCell className="border">{expense.expense_name}</TableCell>
                            <TableCell className="border text-right">{expense.amount.toFixed(2)}</TableCell>
                            <TableCell className="border capitalize">{expense.payment_mode}</TableCell>
                          </TableRow>
                        ))}
                        {summaryData.expense_entries.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="border text-center text-gray-500 py-4">
                              No expense entries found
                            </TableCell>
                          </TableRow>
                        )}
                        {summaryData.expense_entries.length > 0 && (
                          <TableRow className="bg-gray-100 font-semibold">
                            <TableCell className="border" colSpan={4}>TOTAL</TableCell>
                            <TableCell className="border text-right">{summaryData.expense_entries.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</TableCell>
                            <TableCell className="border"></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Total Sales Summary Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Total Sales Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-lg">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="font-medium">Daily Sales (All Payment Methods):</span>
                      <span className="font-bold">£{(summaryData.totals.cash_sales + summaryData.totals.card_sales + (summaryData.totals.bank_transfer_sales || 0) + (summaryData.totals.cheque_sales || 0) + summaryData.totals.account_sales).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Card Sales & Customer Card Payments */}
              <Card>
                <CardHeader>
                  <CardTitle>Card Sales & Customer Card Payments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-lg">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="font-medium">Total Card Sales:</span>
                      <span className="font-bold">£{summaryData.totals.card_sales.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="font-medium">Account Paid Card(Backdate):</span>
                      <span className="font-bold">£{summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Received via Bank Transfer */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment Received via Bank Transfer</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-lg">
                    {/* <div className="flex justify-between items-center py-2 border-b">
                      <span className="font-medium">Current Day Bank Transfers:</span>
                      <span className="font-bold">£{(summaryData.totals.bank_transfer_sales || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="font-medium">Bank Transfer (Backdate):</span>
                      <span className="font-bold">£{(summaryData.totals.bank_transfer_payments || 0).toFixed(2)}</span>
                    </div> */}
                    <div className="flex justify-between items-center py-2 border-b font-semibold">
                      <span>Total Bank Transfer:</span>
                      <span>£{((summaryData.totals.bank_transfer_sales || 0) + (summaryData.totals.bank_transfer_payments || 0)).toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Total Banking */}
              <Card>
                <CardHeader>
                  <CardTitle>Total Banking</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-lg">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="font-medium">Total Cash Sales:</span>
                      <span className="font-bold">£{summaryData.totals.cash_sales.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="font-medium">Total Cheque:</span>
                      <span className="font-bold">£{(summaryData.totals.cheque_sales || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="font-medium">Account Paid Cash(Backdate):</span>
                      <span className="font-bold">£{(summaryData.totals.customer_cash_payments || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b text-green-700">
                      <span className="font-medium">Cash Held (From Previous Day):</span>
                      <span className="font-bold">+£{(summaryData.cash_cf?.carry_forward || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b text-red-600">
                      <span className="font-medium">Till Float (Set Aside Today):</span>
                      <span className="font-bold">-£{(summaryData.cash_cf?.till_float || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b text-red-600">
                      <span className="font-medium">Total Supplier Payment (Paid Out):</span>
                      <span className="font-bold">-£{(summaryData.totals.supplier_payments_paid_out || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b text-red-600">
                      <span className="font-medium">Total Expense (Paid Out):</span>
                      <span className="font-bold">-£{(summaryData.totals.expense_payments_paid_out || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-t-2 border-gray-400 bg-blue-50 total-banking-print">
                      <span className="font-bold text-xl">Total Banking:</span>
                      <span className="font-bold text-xl text-blue-600">£{summaryData.totals.banking_total.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Banking Records */}
              <Card className={summaryData.banking_records && summaryData.banking_records.length === 0 ? "print:hidden" : ""}>
                <CardHeader>
                  <CardTitle>Banking Records</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold border">Date</TableHead>
                          <TableHead className="font-semibold border">Remarks</TableHead>
                          <TableHead className="font-semibold border">Payment Type</TableHead>
                          <TableHead className="font-semibold border text-right">Amount</TableHead>
                          <TableHead className="font-semibold border">Bag Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summaryData.banking_records.map((record, index) => (
                          <TableRow key={index}>
                            <TableCell className="border">
                              {record.date ? format(new Date(record.date), "dd/MM/yyyy") : "N/A"}
                            </TableCell>
                            <TableCell className="border">{record.remarks}</TableCell>
                            <TableCell className="border capitalize">{record.payment_type}</TableCell>
                            <TableCell className="border text-right">{record.amount.toFixed(2)}</TableCell>
                            <TableCell className="border">
                              {record.bag_details.length > 0 ? (
                                <div className="space-y-1">
                                  {record.bag_details.map((bag, bagIndex) => (
                                    <div key={bagIndex} className="text-sm">
                                      Bag: {bag.bag_number} | Pay In: {bag.paying_number} | {bag.amount.toFixed(2)}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm">
                                  {record.paying_number && `Pay In: ${record.paying_number}`}
                                  {record.cheque_number && ` | Cheque: ${record.cheque_number}`}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {summaryData.banking_records.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="border text-center text-gray-500 py-4">
                              No banking records found
                            </TableCell>
                          </TableRow>
                        )}
                        {summaryData.banking_records.length > 0 && (
                          (() => {
                            const recordsSum = summaryData.banking_records.reduce((s, r) => s + r.amount, 0);
                            const calcTotal = summaryData.totals.banking_total;
                            const diff = recordsSum - calcTotal;
                            return (
                              <>
                                <TableRow className="bg-gray-100 font-semibold">
                                  <TableCell className="border" colSpan={3}>TOTAL</TableCell>
                                  <TableCell className="border text-right">{recordsSum.toFixed(2)}</TableCell>
                                  <TableCell className="border"></TableCell>
                                </TableRow>
                                {diff !== 0 && (
                                  <TableRow className="bg-yellow-50">
                                    <TableCell className="border text-sm font-medium" colSpan={5}>
                                      Note: Banking records sum (£{recordsSum.toFixed(2)}) {diff > 0 ? 'exceeds' : 'falls short of'} calculated total (£{calcTotal.toFixed(2)}) by{' '}
                                      <span className={diff > 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                        {diff > 0 ? 'Extra' : 'Short'}: £{Math.abs(diff).toFixed(2)}
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </>
                            );
                          })()
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Product Purchase Full View */}
              <div className={`${productPurchaseData && productPurchaseData.length === 0 ? "print:hidden" : ""} print-page-break`}>
                <div className="print-section-inner">
                  <h2 className="text-xl font-bold mb-3 print-section-title">Product Purchase Full View - {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "dd/MM/yyyy") : "Invalid Date"}</h2>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold border">Date</TableHead>
                          <TableHead className="font-semibold border">Supplier</TableHead>
                          <TableHead className="font-semibold border">Ref No</TableHead>
                          <TableHead className="font-semibold border">Invoice No</TableHead>
                          <TableHead className="font-semibold border">Product</TableHead>
                          <TableHead className="font-semibold border text-right">Quantity</TableHead>
                          <TableHead className="font-semibold border text-right">Unit Price</TableHead>
                          <TableHead className="font-semibold border text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                          {productPurchaseData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="border text-center text-gray-500 py-4">
                              No product purchase data found
                            </TableCell>
                          </TableRow>
                        ) : (() => {
                          const dataRows = productPurchaseData.filter(r => !r.isHeader && !r.isTotal);
                          const grandQty = dataRows.reduce((s, r) => s + Number(r.quantity || 0), 0);
                          const grandTotal = dataRows.reduce((s, r) => s + Number(r.total || 0), 0);
                          const avgPrice = grandQty > 0 ? grandTotal / grandQty : 0;
                          return [...productPurchaseData.map((row, idx) => {
                            if (row.isHeader) {
                              return (
                                <TableRow key={idx} className={cn("font-semibold border-t-2 border-gray-200", row.isCompany ? "bg-amber-50" : "bg-gray-50")}>
                                  <TableCell className="border py-1">{row.date}</TableCell>
                                  <TableCell className="border py-1">
                                    <span className="flex items-center gap-1">
                                      {row.supplier}
                                      {row.isCompany && (
                                        <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 font-medium">CO</span>
                                      )}
                                    </span>
                                  </TableCell>
                                  <TableCell className="border py-1">{row.invNo}</TableCell>
                                  <TableCell className="border py-1"></TableCell>
                                  <TableCell className="border py-1" colSpan={3}></TableCell>
                                  <TableCell className="border py-1"></TableCell>
                                </TableRow>
                              );
                            } else if (row.isTotal) {
                              return (
                                <TableRow key={idx} className={cn("font-bold border-b-2 border-gray-300", row.isCompany ? "bg-amber-50" : "bg-white")}>
                                  <TableCell className="border py-1" colSpan={4}></TableCell>
                                  <TableCell className="border text-right py-1">{row.product?.replace(/\.000/g, '')}</TableCell>
                                  <TableCell className="border text-right py-1">{formatSmartQuantity(row.quantity)}</TableCell>
                                  <TableCell className="border py-1"></TableCell>
                                  <TableCell className="border text-right py-1">£{Number(row.total).toFixed(2)}</TableCell>
                                </TableRow>
                              );
                            } else {
                              return (
                                <TableRow key={idx} className={row.isCompany ? "bg-amber-50" : "bg-white"}>
                                  <TableCell className="border py-1"></TableCell>
                                  <TableCell className="border py-1"></TableCell>
                                  <TableCell className="border py-1">
                                    {row.invNo ? (
                                      canEditForSelectedDate ? (
                                        <Button
                                          variant="link"
                                          className="p-0 text-blue-600 underline"
                                          onClick={() => window.open(`/data-entry/purchase-invoice?invoiceId=${row.invNo}&edit=true`, '_self')}
                                        >
                                          {row.invNo}
                                        </Button>
                                      ) : (
                                        <span className="text-gray-600">{row.invNo}</span>
                                      )
                                    ) : '-'}
                                  </TableCell>
                                  <TableCell className="border py-1"></TableCell>
                                  <TableCell className="border py-1">
                                    <span className="text-blue-600 cursor-pointer hover:text-blue-800 transition-colors">
                                      {row.product}
                                    </span>
                                  </TableCell>
                                  <TableCell className="border text-right py-1">{formatSmartQuantity(row.quantity)}</TableCell>
                                  <TableCell className="border text-right py-1">£{Number(row.unitPrice).toFixed(2)}</TableCell>
                                  <TableCell className="border text-right py-1">£{Number(row.total).toFixed(2)}</TableCell>
                                </TableRow>
                              );
                            }
                          }), ...(dataRows.length > 0 ? [(
                            <TableRow key="grand-total" className="font-bold border-t-2 border-gray-400 bg-blue-50">
                              <TableCell className="border py-1" colSpan={5}>GRAND TOTAL</TableCell>
                              <TableCell className="border text-right py-1">{formatSmartQuantity(grandQty)}</TableCell>
                              <TableCell className="border text-right py-1">£{avgPrice.toFixed(2)}</TableCell>
                              <TableCell className="border text-right py-1">£{grandTotal.toFixed(2)}</TableCell>
                            </TableRow>
                          )] : [])];
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              {/* Stock Check */}
              <div className={`${filteredStockData && filteredStockData.length === 0 ? "print:hidden" : ""} print-page-break stock-check-print`}>
                <div className="print-section-inner">
                  <h2 className="text-xl font-bold mb-3 print-section-title">Stock Check - {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "dd/MM/yyyy") : "Invalid Date"}</h2>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold border w-16">Sl.No</TableHead>
                          <TableHead className="font-semibold border min-w-48">Product Description</TableHead>
                          <TableHead className="font-semibold border text-center w-16">O.S</TableHead>
                          <TableHead className="font-semibold border text-center w-16">N.S</TableHead>
                          <TableHead className="font-semibold border text-center w-16">Sales</TableHead>
                          <TableHead className="font-semibold border text-center w-16">C.RTN</TableHead>
                          <TableHead className="font-semibold border text-center w-16">Dmps</TableHead>
                          <TableHead className="font-semibold border text-center w-16">S.RTN</TableHead>
                          <TableHead className="font-semibold border text-center w-16">Stock</TableHead>
                          <TableHead className="font-semibold border text-center w-16">Cl.Stock</TableHead>
                          <TableHead className="font-semibold border text-center w-16">Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStockData.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="border w-16">{item.slNo}</TableCell>
                            <TableCell className="border min-w-48">{item.productDescription}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(item.os)}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(item.ns)}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(item.sales)}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(item.crtn)}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(item.dmps)}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(item.srtn)}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(item.stock)}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(item.clStock)}</TableCell>
                            <TableCell className="border text-center">
                              {item.result === "✓" ? (
                                <span className="text-green-600">✓</span>
                              ) : (
                                <span className={item.status === 'short' ? "text-red-600" : "text-orange-600"}>
                                  {item.result}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredStockData.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={11} className="border text-center text-gray-500 py-4">
                              No stock check data found (entries with all zero values are hidden)
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredStockData.length > 0 && (
                          <TableRow className="bg-gray-100 font-semibold">
                            <TableCell className="border w-16"></TableCell>
                            <TableCell className="border min-w-48">TOTAL</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(filteredStockData.reduce((sum, item) => sum + item.os, 0))}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(filteredStockData.reduce((sum, item) => sum + item.ns, 0))}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(filteredStockData.reduce((sum, item) => sum + item.sales, 0))}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(filteredStockData.reduce((sum, item) => sum + item.crtn, 0))}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(filteredStockData.reduce((sum, item) => sum + item.dmps, 0))}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(filteredStockData.reduce((sum, item) => sum + item.srtn, 0))}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(filteredStockData.reduce((sum, item) => sum + item.stock, 0))}</TableCell>
                            <TableCell className="border text-center w-16">{formatQuantity(filteredStockData.reduce((sum, item) => sum + item.clStock, 0))}</TableCell>
                            <TableCell className="border w-16"></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer text for print */}
      <div className="footer-text">Stand-100</div>
    </PageLayout>
  );
}