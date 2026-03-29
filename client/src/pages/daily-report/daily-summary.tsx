import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, FileText, Printer, Mail } from "lucide-react";
import { format } from "date-fns";
import { cn, formatQuantity } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
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
    customer_type?: string; // Add customer type for cash customer detection
    gate_number?: string; // Add gate number field
  }>;
  customer_payments: Array<{
    customer_name: string;
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
    expense_name: string;
    amount: number;
    payment_mode: string;
    date: string;
  }>;
  cash_cf: {
    pounds: number;
    coins: number;
    total: number;
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

// Helper function to check if we should show gate number in parentheses (for non-cash customers)
const shouldShowGateInParentheses = (sale: {
  customer_name: string;
  customer_type?: string;
  gate_number?: string;
}): boolean => {
  const isCashCustomer = sale.customer_type === 'cash';
  const cashSalePatterns = [
    'cash sale', 'cash sales', 'cash customer', 'walk-in customer', 
    'walk in customer', 'cash', 'walk-in', 'walkin'
  ];
  const customerNameLower = (sale.customer_name || '').toLowerCase().trim();
  const isCashByName = cashSalePatterns.includes(customerNameLower);
  
  // Don't show in parentheses if we're already showing it as the main name
  return Boolean(sale.gate_number && !((isCashCustomer || isCashByName) && sale.gate_number.trim()));
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
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Safely initialize the date
    try {
      return businessDate ? new Date(businessDate) : new Date();
    } catch {
      return new Date();
    }
  });
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

  // Debug: Log the sales summary data to understand the structure
  useEffect(() => {
    if (summaryData?.sales_summary) {
      console.log('Sales Summary Data:', summaryData.sales_summary);
      console.log('First sale item:', summaryData.sales_summary[0]);
    }
  }, [summaryData]);

  // Fetch company details for PDF header
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

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

  const handleGenerateCleanPDF = () => {
    if (!selectedDate || !summaryData) {
      toast({
        title: "Error",
        description: "Please select a valid date and ensure data is loaded",
        variant: "destructive",
      });
      return;
    }

    const doc = new jsPDF();
    let yPosition = 20;

    // Add company details header
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || 'Company Name', 105, yPosition, { align: 'center' });
      yPosition += 8;

      doc.setFontSize(10);
      if (companyDetails.email) {
        doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }
      if (companyDetails.bankDetails) {
        doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }
      yPosition += 5;
    }

    // Add report title
    doc.setFontSize(14);
    doc.text('DAILY SUMMARY REPORT', 105, yPosition, { align: 'center' });
    yPosition += 8;
    doc.setFontSize(10);
    doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
    yPosition += 15;

    // Daily Sales Summary (always included)
    doc.setFontSize(12);
    doc.text('Daily Sales Summary', 14, yPosition);
    yPosition += 5;

    autoTable(doc, {
      head: [['Customer', 'Invoice No', 'Cash Sales', 'Card Paid', 'Bank Transfer', 'Cheque', 'Account Sales', 'Account Credits']],
      body: [
        ...summaryData.sales_summary.map(sale => [
          getDisplayCustomerName(sale),
          sale.invoice_no || '-',
          sale.cash_sales > 0 ? sale.cash_sales.toFixed(2) : '-',
          sale.card_paid > 0 ? sale.card_paid.toFixed(2) : '-',
          (sale.bank_transfer || 0) > 0 ? (sale.bank_transfer || 0).toFixed(2) : '-',
          (sale.cheque || 0) > 0 ? (sale.cheque || 0).toFixed(2) : '-',
          sale.account_sales > 0 ? sale.account_sales.toFixed(2) : '-',
          sale.account_credits > 0 ? sale.account_credits.toFixed(2) : '-'
        ]),
        ['TOTALS', '', summaryData.totals.cash_sales.toFixed(2), summaryData.totals.card_sales.toFixed(2), (summaryData.totals.bank_transfer_sales || 0).toFixed(2), (summaryData.totals.cheque_sales || 0).toFixed(2), summaryData.totals.account_sales.toFixed(2), (summaryData.totals.account_credits || 0).toFixed(2)]
      ],
      startY: yPosition,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Customer Payments (only if has data)
    if (summaryData.customer_payments && summaryData.customer_payments.length > 0) {
      doc.setFontSize(12);
      doc.text('Customer Payments', 14, yPosition);
      yPosition += 5;

      autoTable(doc, {
        head: [['Customer Name', 'Payment ID', 'Cash Amount', 'Card Amount', 'Bank Transfer', 'Cheque', 'Total Amount']],
        body: [
          ...summaryData.customer_payments
            .sort((a, b) => parseInt(a.payment_id) - parseInt(b.payment_id))
            .map(payment => [
            payment.customer_name,
            payment.payment_id,
            payment.cash_amount > 0 ? payment.cash_amount.toFixed(2) : '-',
            payment.card_amount > 0 ? payment.card_amount.toFixed(2) : '-',
            payment.bank_transfer_amount > 0 ? payment.bank_transfer_amount.toFixed(2) : '-',
            payment.cheque_amount > 0 ? payment.cheque_amount.toFixed(2) : '-',
            payment.total_amount.toFixed(2)
          ]),
          ['TOTAL', '',
            summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2),
            summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2),
            summaryData.customer_payments.reduce((sum, p) => sum + (p.bank_transfer_amount || 0), 0).toFixed(2),
            summaryData.customer_payments.reduce((sum, p) => sum + (p.cheque_amount || 0), 0).toFixed(2),
            summaryData.totals.customer_payments_total.toFixed(2)
          ]
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Supplier Payments (only if has data)
    if (summaryData.supplier_payments && summaryData.supplier_payments.length > 0) {
      doc.setFontSize(12);
      doc.text('Supplier Payments', 14, yPosition);
      yPosition += 5;

      autoTable(doc, {
        head: [['Supplier Name', 'Supplier Invoice No', 'Supplier Invoice Date', 'Amount', 'Payment Mode']],
        body: [
          ...summaryData.supplier_payments.map(payment => [
            payment.supplier_name,
            payment.supplier_invoice_number || '-',
            payment.supplier_invoice_date ? format(new Date(payment.supplier_invoice_date), "dd/MM/yyyy") : '-',
            payment.amount.toFixed(2),
            payment.payment_mode
          ]),
          ['TOTAL', '', '', summaryData.totals.supplier_payments_total.toFixed(2), '']
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Expense Entries (only if has data)
    if (summaryData.expense_entries && summaryData.expense_entries.length > 0) {
      doc.setFontSize(12);
      doc.text('Expense Entries', 14, yPosition);
      yPosition += 5;

      autoTable(doc, {
        head: [['Supplier Invoice No', 'Supplier Name', 'Expense Name', 'Amount', 'Payment Mode']],
        body: [
          ...summaryData.expense_entries.map(expense => [
            expense.invoice_number || '-',
            expense.supplier_name,
            expense.expense_name,
            expense.amount.toFixed(2),
            expense.payment_mode
          ]),
          ['TOTAL', '', '', summaryData.expense_entries.reduce((sum, e) => sum + e.amount, 0).toFixed(2), '']
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Banking Records (only if has data)
    if (summaryData.banking_records && summaryData.banking_records.length > 0) {
      doc.setFontSize(12);
      doc.text('Banking Records', 14, yPosition);
      yPosition += 5;

      autoTable(doc, {
        head: [['Date', 'Remarks', 'Payment Type', 'Amount', 'Details']],
        body: [
          ...summaryData.banking_records.map(record => [
            record.date ? format(new Date(record.date), "dd/MM/yyyy") : "N/A",
            record.remarks,
            record.payment_type,
            record.amount.toFixed(2),
            record.bag_details.length > 0
              ? record.bag_details.map(bag => `Bag: ${bag.bag_number}`).join(', ')
              : `${record.paying_number ? `Pay In: ${record.paying_number}` : ''}${record.cheque_number ? ` | Cheque: ${record.cheque_number}` : ''}`
          ]),
          ['TOTAL', '', '', summaryData.totals.banking_total.toFixed(2), '']
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Get current Y position after banking records
    yPosition = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 15 : yPosition;

    // Daily Summary Totals (always included) - Same page as banking records
    doc.setFontSize(12);
    doc.text('Daily Summary Totals', 14, yPosition);
    yPosition += 5;

    const totalsData = [
      ['Total Cash Sales', `£${summaryData.totals.cash_sales.toFixed(2)}`],
      ['Total Card Sales', `£${summaryData.totals.card_sales.toFixed(2)}`],
      ['Total Cheque', `£${(summaryData.totals.cheque_sales || 0).toFixed(2)}`],
      ['Account Paid Cash(Backdate)', `£${(summaryData.totals.customer_cash_payments || 0).toFixed(2)}`],
      ['Account Payment/Customer Card Payment (Backdate)', `£${summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2)}`],
      ['Till/Float(C/F)', `£${(summaryData.totals.cash_cf_total || 0).toFixed(2)}`],
      ['Total Supplier Payment (Paid Out)', `-£${(summaryData.totals.supplier_payments_paid_out || 0).toFixed(2)}`],
      ['Total Expense (Paid Out)', `-£${(summaryData.totals.expense_payments_paid_out || 0).toFixed(2)}`]
    ];

    autoTable(doc, {
      body: totalsData,
      startY: yPosition,
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { fontStyle: 'bold', halign: 'right' }
      }
    });

    // Add Total Banking as a separate, bigger and bolder row
    yPosition = (doc as any).lastAutoTable.finalY + 10;

    autoTable(doc, {
      body: [['Total Banking', `£${summaryData.totals.banking_total.toFixed(2)}`]],
      startY: yPosition,
      styles: {
        fontSize: 14,
        cellPadding: 5,
        fontStyle: 'bold',
        fillColor: [173, 216, 230], // Light blue background
        textColor: [0, 0, 0] // Black text
      },
      columnStyles: {
        0: { fontStyle: 'bold', fontSize: 14 },
        1: { fontStyle: 'bold', halign: 'right', fontSize: 14 }
      }
    });

    // Stock Check (only if has data) - NEW PAGE
    if (stockData && stockData.length > 0) {
      doc.addPage();
      yPosition = 20;

      // Add company details header
      if (companyDetails) {
        doc.setFontSize(16);
        doc.text(companyDetails.companyName || 'Company Name', 105, yPosition, { align: 'center' });
        yPosition += 8;

        doc.setFontSize(10);
        if (companyDetails.email) {
          doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
          yPosition += 5;
        }
        if (companyDetails.bankDetails) {
          doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
          yPosition += 5;
        }
        yPosition += 5;
      }

      doc.setFontSize(14);
      doc.text('STOCK CHECK', 105, yPosition, { align: 'center' });
      yPosition += 8;
      doc.setFontSize(10);
      doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
      yPosition += 15;

      // Filter stock data to only include items with non-zero values
      const filteredStockData = stockData.filter((item: StockItem) =>
        item.os !== 0 ||
        item.ns !== 0 ||
        item.sales !== 0 ||
        item.crtn !== 0 ||
        item.dmps !== 0 ||
        item.srtn !== 0 ||
        item.stock !== 0 ||
        item.clStock !== 0
      );

      const stockTotals = {
        os: filteredStockData.reduce((sum, item) => sum + item.os, 0),
        ns: filteredStockData.reduce((sum, item) => sum + item.ns, 0),
        sales: filteredStockData.reduce((sum, item) => sum + item.sales, 0),
        crtn: filteredStockData.reduce((sum, item) => sum + item.crtn, 0),
        dmps: filteredStockData.reduce((sum, item) => sum + item.dmps, 0),
        srtn: filteredStockData.reduce((sum, item) => sum + item.srtn, 0),
        stock: filteredStockData.reduce((sum, item) => sum + item.stock, 0),
        clStock: filteredStockData.reduce((sum, item) => sum + item.clStock, 0)
      };

      autoTable(doc, {
        head: [['Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result']],
        body: [
          ...filteredStockData.map((item: StockItem) => [
            item.slNo,
            item.productDescription,
            formatQuantity(item.os),
            formatQuantity(item.ns),
            formatQuantity(item.sales),
            formatQuantity(item.crtn),
            formatQuantity(item.dmps),
            formatQuantity(item.srtn),
            formatQuantity(item.stock),
            formatQuantity(item.clStock),
            item.result
          ]),
          ['TOTAL', '', formatQuantity(stockTotals.os), formatQuantity(stockTotals.ns), formatQuantity(stockTotals.sales), formatQuantity(stockTotals.crtn), formatQuantity(stockTotals.dmps), formatQuantity(stockTotals.srtn), formatQuantity(stockTotals.stock), formatQuantity(stockTotals.clStock), '']
        ],
        startY: yPosition,
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 35 },
          2: { cellWidth: 15 },
          3: { cellWidth: 15 },
          4: { cellWidth: 15 },
          5: { cellWidth: 15 },
          6: { cellWidth: 15 },
          7: { cellWidth: 15 },
          8: { cellWidth: 15 },
          9: { cellWidth: 15 },
          10: { cellWidth: 15 }
        }
      });
    }

    // Product Purchase Full View (only if has data) - NEW PAGE
    if (productPurchaseData && productPurchaseData.length > 0) {
      doc.addPage();
      yPosition = 20;

      // Add company details header
      if (companyDetails) {
        doc.setFontSize(16);
        doc.text(companyDetails.companyName || 'Company Name', 105, yPosition, { align: 'center' });
        yPosition += 8;

        doc.setFontSize(10);
        if (companyDetails.email) {
          doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
          yPosition += 5;
        }
        if (companyDetails.bankDetails) {
          doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
          yPosition += 5;
        }
        yPosition += 5;
      }

      doc.setFontSize(14);
      doc.text('PRODUCT PURCHASE FULL VIEW', 105, yPosition, { align: 'center' });
      yPosition += 8;
      doc.setFontSize(10);
      doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
      yPosition += 15;

      // Process data for grouped display
      const processedData: any[] = [];
      const displayData = Array.isArray(productPurchaseData) ? productPurchaseData : [];

      displayData.forEach((row, index) => {
        if (row.isHeader) {
          processedData.push([
            row.date, row.supplier, row.invNo,
            '', '', '', '', ''
          ]);
        } else if (row.isTotal) {
          processedData.push([
            '', '', '', row.product, formatQuantity(row.quantity),
            '', Number(row.total).toFixed(2)
          ]);
          if (index < displayData.length - 1) {
            processedData.push(['', '', '', '', '', '', '']);
          }
        } else {
          processedData.push([
            '', '', row.invNo, row.product, formatQuantity(row.quantity),
            Number(row.unitPrice).toFixed(2), Number(row.total).toFixed(2)
          ]);
        }
      });

      autoTable(doc, {
        head: [['Date', 'Supplier', 'Inv.No', 'Product', 'Quantity', 'Unit Price', 'Total']],
        body: processedData,
        startY: yPosition,
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 20 },
          3: { cellWidth: 35 },
          4: { cellWidth: 20 },
          5: { cellWidth: 25 },
          6: { cellWidth: 25 },
        },
        didParseCell: function (data) {
          if (data.row.index < processedData.length) {
            const rowData = processedData[data.row.index];
            if (rowData[0] && rowData[1] && !rowData[3]) {
              data.cell.styles.fontStyle = 'bold';
            }
            if (rowData[3] && rowData[6] && !rowData[0] && !rowData[1]) {
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });
    }

    // Add footer text "stand 100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand 100', pageWidth - 30, pageHeight - 10, { align: 'right' });

    doc.save(`daily-summary-${format(selectedDate, "yyyy-MM-dd")}.pdf`);

    toast({
      title: "Success",
      description: "Clean PDF generated successfully (empty tables excluded)",
    });
  };

  // Generate PDF blob for email (complete daily summary)
  const generatePDFBlob = () => {
    if (!selectedDate || !summaryData) {
      return null;
    }

    const doc = new jsPDF();
    let yPosition = 20;

    // Add company details header
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || 'Company Name', 105, yPosition, { align: 'center' });
      yPosition += 8;

      doc.setFontSize(10);
      if (companyDetails.email) {
        doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }
      if (companyDetails.bankDetails) {
        doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }
      yPosition += 5;
    }

    // Add report title
    doc.setFontSize(14);
    doc.text('DAILY SUMMARY REPORT', 105, yPosition, { align: 'center' });
    yPosition += 8;
    doc.setFontSize(10);
    doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
    yPosition += 15;

    // Daily Sales Summary (always included)
    doc.setFontSize(12);
    doc.text('Daily Sales Summary', 14, yPosition);
    yPosition += 5;

    autoTable(doc, {
      head: [['Customer', 'Invoice No', 'Cash Sales', 'Card Paid', 'Bank Transfer', 'Cheque', 'Account Sales', 'Account Credits']],
      body: [
        ...summaryData.sales_summary.map(sale => [
          getDisplayCustomerName(sale),
          sale.invoice_no || '-',
          sale.cash_sales > 0 ? sale.cash_sales.toFixed(2) : '-',
          sale.card_paid > 0 ? sale.card_paid.toFixed(2) : '-',
          (sale.bank_transfer || 0) > 0 ? (sale.bank_transfer || 0).toFixed(2) : '-',
          (sale.cheque || 0) > 0 ? (sale.cheque || 0).toFixed(2) : '-',
          sale.account_sales > 0 ? sale.account_sales.toFixed(2) : '-',
          sale.account_credits > 0 ? sale.account_credits.toFixed(2) : '-'
        ]),
        ['TOTALS', '', summaryData.totals.cash_sales.toFixed(2), summaryData.totals.card_sales.toFixed(2), (summaryData.totals.bank_transfer_sales || 0).toFixed(2), (summaryData.totals.cheque_sales || 0).toFixed(2), summaryData.totals.account_sales.toFixed(2), (summaryData.totals.account_credits || 0).toFixed(2)]
      ],
      startY: yPosition,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Customer Payments (only if has data)
    if (summaryData.customer_payments && summaryData.customer_payments.length > 0) {
      doc.setFontSize(12);
      doc.text('Customer Payments', 14, yPosition);
      yPosition += 5;

      // Sort customer payments by payment_id
      const sortedPayments = summaryData.customer_payments.sort((a, b) => parseInt(a.payment_id) - parseInt(b.payment_id));

      autoTable(doc, {
        head: [['Customer Name', 'Payment ID', 'Cash Amount', 'Card Amount', 'Bank Transfer', 'Cheque', 'Total Amount']],
        body: [
          ...sortedPayments.map(payment => [
            payment.customer_name,
            payment.payment_id,
            payment.cash_amount > 0 ? payment.cash_amount.toFixed(2) : '-',
            payment.card_amount > 0 ? payment.card_amount.toFixed(2) : '-',
            payment.bank_transfer_amount > 0 ? payment.bank_transfer_amount.toFixed(2) : '-',
            payment.cheque_amount > 0 ? payment.cheque_amount.toFixed(2) : '-',
            payment.total_amount.toFixed(2)
          ]),
          ['TOTAL', '',
            summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2),
            summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2),
            summaryData.customer_payments.reduce((sum, p) => sum + (p.bank_transfer_amount || 0), 0).toFixed(2),
            summaryData.customer_payments.reduce((sum, p) => sum + (p.cheque_amount || 0), 0).toFixed(2),
            summaryData.totals.customer_payments_total.toFixed(2)
          ]
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Supplier Payments (only if has data)
    if (summaryData.supplier_payments && summaryData.supplier_payments.length > 0) {
      doc.setFontSize(12);
      doc.text('Supplier Payments', 14, yPosition);
      yPosition += 5;

      autoTable(doc, {
        head: [['Supplier Name', 'Supplier Invoice No', 'Supplier Invoice Date', 'Amount', 'Payment Mode']],
        body: [
          ...summaryData.supplier_payments.map(payment => [
            payment.supplier_name,
            payment.supplier_invoice_number || '-',
            payment.supplier_invoice_date ? format(new Date(payment.supplier_invoice_date), "dd/MM/yyyy") : '-',
            payment.amount.toFixed(2),
            payment.payment_mode
          ]),
          ['TOTAL', '', '', summaryData.totals.supplier_payments_total.toFixed(2), '']
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Expense Entries (only if has data)
    if (summaryData.expense_entries && summaryData.expense_entries.length > 0) {
      doc.setFontSize(12);
      doc.text('Expense Entries', 14, yPosition);
      yPosition += 5;

      autoTable(doc, {
        head: [['Supplier Invoice No', 'Supplier Name', 'Expense Name', 'Amount', 'Payment Mode']],
        body: [
          ...summaryData.expense_entries.map(expense => [
            expense.invoice_number || '-',
            expense.supplier_name,
            expense.expense_name,
            expense.amount.toFixed(2),
            expense.payment_mode
          ]),
          ['TOTAL', '', '', summaryData.expense_entries.reduce((sum, e) => sum + e.amount, 0).toFixed(2), '']
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Banking Records (only if has data)
    if (summaryData.banking_records && summaryData.banking_records.length > 0) {
      doc.setFontSize(12);
      doc.text('Banking Records', 14, yPosition);
      yPosition += 5;

      autoTable(doc, {
        head: [['Date', 'Remarks', 'Payment Type', 'Amount', 'Details']],
        body: [
          ...summaryData.banking_records.map(record => [
            record.date ? format(new Date(record.date), "dd/MM/yyyy") : "N/A",
            record.remarks,
            record.payment_type,
            record.amount.toFixed(2),
            record.bag_details.length > 0
              ? record.bag_details.map(bag => `Bag: ${bag.bag_number}`).join(', ')
              : `${record.paying_number ? `Pay In: ${record.paying_number}` : ''}${record.cheque_number ? ` | Cheque: ${record.cheque_number}` : ''}`
          ]),
          ['TOTAL', '', '', summaryData.totals.banking_total.toFixed(2), '']
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Get current Y position after banking records
    yPosition = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 15 : yPosition;

    // Daily Summary Totals (always included) - Same page as banking records
    doc.setFontSize(12);
    doc.text('Daily Summary Totals', 14, yPosition);
    yPosition += 5;

    const totalsData = [
      ['Total Cash Sales', `£${summaryData.totals.cash_sales.toFixed(2)}`],
      ['Total Card Sales', `£${summaryData.totals.card_sales.toFixed(2)}`],
      ['Total Cheque', `£${(summaryData.totals.cheque_sales || 0).toFixed(2)}`],
      ['Account Paid Cash(Backdate)', `£${(summaryData.totals.customer_cash_payments || 0).toFixed(2)}`],
      ['Account Payment/Customer Card Payment (Backdate)', `£${summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2)}`],
      ['Till/Float(C/F)', `£${(summaryData.totals.cash_cf_total || 0).toFixed(2)}`],
      ['Total Supplier Payment (Paid Out)', `-£${(summaryData.totals.supplier_payments_paid_out || 0).toFixed(2)}`],
      ['Total Expense (Paid Out)', `-£${(summaryData.totals.expense_payments_paid_out || 0).toFixed(2)}`]
    ];

    autoTable(doc, {
      body: totalsData,
      startY: yPosition,
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { fontStyle: 'bold', halign: 'right' }
      }
    });

    // Add Total Banking as a separate, bigger and bolder row
    yPosition = (doc as any).lastAutoTable.finalY + 10;

    autoTable(doc, {
      body: [['Total Banking', `£${summaryData.totals.banking_total.toFixed(2)}`]],
      startY: yPosition,
      styles: {
        fontSize: 14,
        cellPadding: 5,
        fontStyle: 'bold',
        fillColor: [173, 216, 230], // Light blue background
        textColor: [0, 0, 0] // Black text
      },
      columnStyles: {
        0: { fontStyle: 'bold', fontSize: 14 },
        1: { fontStyle: 'bold', halign: 'right', fontSize: 14 }
      }
    });

    // Stock Check (only if has data) - NEW PAGE
    if (stockData && stockData.length > 0) {
      doc.addPage();
      yPosition = 20;

      // Add company details header
      if (companyDetails) {
        doc.setFontSize(16);
        doc.text(companyDetails.companyName || 'Company Name', 105, yPosition, { align: 'center' });
        yPosition += 8;

        doc.setFontSize(10);
        if (companyDetails.email) {
          doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
          yPosition += 5;
        }
        if (companyDetails.bankDetails) {
          doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
          yPosition += 5;
        }
        yPosition += 5;
      }

      doc.setFontSize(14);
      doc.text('STOCK CHECK', 105, yPosition, { align: 'center' });
      yPosition += 8;
      doc.setFontSize(10);
      doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
      yPosition += 15;

      // Filter stock data to only include items with non-zero values
      const filteredStockData = stockData.filter((item: StockItem) =>
        item.os !== 0 ||
        item.ns !== 0 ||
        item.sales !== 0 ||
        item.crtn !== 0 ||
        item.dmps !== 0 ||
        item.srtn !== 0 ||
        item.stock !== 0 ||
        item.clStock !== 0
      );

      const stockTotals = {
        os: filteredStockData.reduce((sum, item) => sum + item.os, 0),
        ns: filteredStockData.reduce((sum, item) => sum + item.ns, 0),
        sales: filteredStockData.reduce((sum, item) => sum + item.sales, 0),
        crtn: filteredStockData.reduce((sum, item) => sum + item.crtn, 0),
        dmps: filteredStockData.reduce((sum, item) => sum + item.dmps, 0),
        srtn: filteredStockData.reduce((sum, item) => sum + item.srtn, 0),
        stock: filteredStockData.reduce((sum, item) => sum + item.stock, 0),
        clStock: filteredStockData.reduce((sum, item) => sum + item.clStock, 0)
      };

      autoTable(doc, {
        head: [['Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result']],
        body: [
          ...filteredStockData.map((item: StockItem) => [
            item.slNo,
            item.productDescription,
            formatQuantity(item.os),
            formatQuantity(item.ns),
            formatQuantity(item.sales),
            formatQuantity(item.crtn),
            formatQuantity(item.dmps),
            formatQuantity(item.srtn),
            formatQuantity(item.stock),
            formatQuantity(item.clStock),
            item.result
          ]),
          ['TOTAL', '', formatQuantity(stockTotals.os), formatQuantity(stockTotals.ns), formatQuantity(stockTotals.sales), formatQuantity(stockTotals.crtn), formatQuantity(stockTotals.dmps), formatQuantity(stockTotals.srtn), formatQuantity(stockTotals.stock), formatQuantity(stockTotals.clStock), '']
        ],
        startY: yPosition,
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 35 },
          2: { cellWidth: 15 },
          3: { cellWidth: 15 },
          4: { cellWidth: 15 },
          5: { cellWidth: 15 },
          6: { cellWidth: 15 },
          7: { cellWidth: 15 },
          8: { cellWidth: 15 },
          9: { cellWidth: 15 },
          10: { cellWidth: 15 }
        }
      });
    }

    // Product Purchase Full View (only if has data) - NEW PAGE
    if (productPurchaseData && productPurchaseData.length > 0) {
      doc.addPage();
      yPosition = 20;

      // Add company details header
      if (companyDetails) {
        doc.setFontSize(16);
        doc.text(companyDetails.companyName || 'Company Name', 105, yPosition, { align: 'center' });
        yPosition += 8;

        doc.setFontSize(10);
        if (companyDetails.email) {
          doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
          yPosition += 5;
        }
        if (companyDetails.bankDetails) {
          doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
          yPosition += 5;
        }
        yPosition += 5;
      }

      doc.setFontSize(14);
      doc.text('PRODUCT PURCHASE FULL VIEW', 105, yPosition, { align: 'center' });
      yPosition += 8;
      doc.setFontSize(10);
      doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
      yPosition += 15;

      // Process data for grouped display
      const processedData: any[] = [];
      const displayData = Array.isArray(productPurchaseData) ? productPurchaseData : [];

      displayData.forEach((row, index) => {
        if (row.isHeader) {
          processedData.push([
            row.date, row.supplier, row.invNo,
            '', '', '', '', ''
          ]);
        } else if (row.isTotal) {
          processedData.push([
            '', '', '', row.product, formatQuantity(row.quantity),
            '', Number(row.total).toFixed(2)
          ]);
          if (index < displayData.length - 1) {
            processedData.push(['', '', '', '', '', '', '']);
          }
        } else {
          processedData.push([
            '', '', row.invNo, row.product, formatQuantity(row.quantity),
            Number(row.unitPrice).toFixed(2), Number(row.total).toFixed(2)
          ]);
        }
      });

      autoTable(doc, {
        head: [['Date', 'Supplier', 'Inv.No', 'Product', 'Quantity', 'Unit Price', 'Total']],
        body: processedData,
        startY: yPosition,
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 35 },
          2: { cellWidth: 20 },
          3: { cellWidth: 35 },
          4: { cellWidth: 20 },
          5: { cellWidth: 25 },
          6: { cellWidth: 25 },
        },
        didParseCell: function (data) {
          if (data.row.index < processedData.length) {
            const rowData = processedData[data.row.index];
            if (rowData[0] && rowData[1] && !rowData[3]) {
              data.cell.styles.fontStyle = 'bold';
            }
            if (rowData[3] && rowData[6] && !rowData[0] && !rowData[1]) {
              data.cell.styles.fontStyle = 'bold';
            }
          }
        }
      });
    }

    // Add footer text "stand 100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand 100', pageWidth - 30, pageHeight - 10, { align: 'right' });

    return doc.output('blob');
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
      const pdfBlob = generatePDFBlob();

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
                  <CardTitle>Daily Sales Summary - {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "dd/MM/yyyy") : "Invalid Date"}</CardTitle>
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
                        {summaryData?.sales_summary.map((sale, index) => (
                          <TableRow key={index}>
                            <TableCell className="border">
                              {getDisplayCustomerName(sale)}
                              {shouldShowGateInParentheses(sale) && (
                                <span className="text-xs text-gray-500 font-normal ml-2">
                                  ({sale.gate_number})
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="border">{sale.invoice_no || '-'}</TableCell>
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
                                <TableCell className="border">{payment.customer_name}</TableCell>
                                <TableCell className="border">{payment.payment_id}</TableCell>
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
                          <TableHead className="font-semibold border">Supplier Invoice No</TableHead>
                          <TableHead className="font-semibold border">Supplier Name</TableHead>
                          <TableHead className="font-semibold border">Expense Name</TableHead>
                          <TableHead className="font-semibold border text-right">Amount</TableHead>
                          <TableHead className="font-semibold border">Payment Mode</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summaryData.expense_entries.map((expense, index) => (
                          <TableRow key={index}>
                            <TableCell className="border">{expense.invoice_number || '-'}</TableCell>
                            <TableCell className="border">{expense.supplier_name}</TableCell>
                            <TableCell className="border">{expense.expense_name}</TableCell>
                            <TableCell className="border text-right">{expense.amount.toFixed(2)}</TableCell>
                            <TableCell className="border capitalize">{expense.payment_mode}</TableCell>
                          </TableRow>
                        ))}
                        {summaryData.expense_entries.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="border text-center text-gray-500 py-4">
                              No expense entries found
                            </TableCell>
                          </TableRow>
                        )}
                        {summaryData.expense_entries.length > 0 && (
                          <TableRow className="bg-gray-100 font-semibold">
                            <TableCell className="border" colSpan={3}>TOTAL</TableCell>
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
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="font-medium">Till/Float(C/F):</span>
                      <span className="font-bold">£{(summaryData.totals.cash_cf_total || 0).toFixed(2)}</span>
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
                          <TableRow className="bg-gray-100 font-semibold">
                            <TableCell className="border" colSpan={3}>TOTAL</TableCell>
                            <TableCell className="border text-right">{summaryData.totals.banking_total.toFixed(2)}</TableCell>
                            <TableCell className="border"></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Stock Check */}
              <Card className={`${filteredStockData && filteredStockData.length === 0 ? "print:hidden" : ""} print:page-break-before-always`}>
                <CardHeader>
                  <CardTitle>Stock Check - {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "dd/MM/yyyy") : "Invalid Date"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
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
                          <TableHead className="font-semibold border text-center w-20">Cl.Stock</TableHead>
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
                            <TableCell className="border text-center w-20">{formatQuantity(item.clStock)}</TableCell>
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
                            <TableCell className="border text-center w-20">{formatQuantity(filteredStockData.reduce((sum, item) => sum + item.clStock, 0))}</TableCell>
                            <TableCell className="border w-16"></TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Product Purchase Full View */}
              <Card className={`${productPurchaseData && productPurchaseData.length === 0 ? "print:hidden" : ""} print:page-break-before-always`}>
                <CardHeader>
                  <CardTitle>Product Purchase Full View - {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "dd/MM/yyyy") : "Invalid Date"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold border">Date</TableHead>
                          <TableHead className="font-semibold border">Supplier</TableHead>
                          <TableHead className="font-semibold border">Inv.No</TableHead>
                          <TableHead className="font-semibold border">Product</TableHead>
                          <TableHead className="font-semibold border text-right">Quantity</TableHead>
                          <TableHead className="font-semibold border text-right">Unit Price</TableHead>
                          <TableHead className="font-semibold border text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productPurchaseData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="border text-center text-gray-500 py-4">
                              No product purchase data found
                            </TableCell>
                          </TableRow>
                        ) : (
                          productPurchaseData.map((row, idx) => {
                            if (row.isHeader) {
                              return (
                                <TableRow key={idx} className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                                  <TableCell className="border py-1">{row.date}</TableCell>
                                  <TableCell className="border py-1">{row.supplier}</TableCell>
                                  <TableCell className="border py-1">{row.invNo}</TableCell>
                                  <TableCell className="border py-1" colSpan={3}></TableCell>
                                  <TableCell className="border py-1"></TableCell>
                                </TableRow>
                              );
                            } else if (row.isTotal) {
                              return (
                                <TableRow key={idx} className="bg-white font-bold border-b-2 border-gray-300">
                                  <TableCell className="border py-1" colSpan={3}></TableCell>
                                  <TableCell className="border text-right py-1">{row.product}</TableCell>
                                  <TableCell className="border text-right py-1">{formatQuantity(row.quantity)}</TableCell>
                                  <TableCell className="border py-1"></TableCell>
                                  <TableCell className="border text-right py-1">£{Number(row.total).toFixed(2)}</TableCell>
                                </TableRow>
                              );
                            } else {
                              return (
                                <TableRow key={idx} className="bg-white">
                                  <TableCell className="border py-1"></TableCell>
                                  <TableCell className="border py-1"></TableCell>
                                  <TableCell className="border py-1">
                                    <Button
                                      variant="link"
                                      className="p-0 text-blue-600 underline"
                                      onClick={() => window.open(`/data-entry/purchase-invoice?invoiceId=${row.invNo}&edit=true`, '_self')}
                                    >
                                      {row.invNo}
                                    </Button>
                                  </TableCell>
                                  <TableCell className="border py-1">
                                    <span className="text-blue-600 cursor-pointer hover:text-blue-800 transition-colors">
                                      {row.product}
                                    </span>
                                  </TableCell>
                                  <TableCell className="border text-right py-1">{formatQuantity(row.quantity)}</TableCell>
                                  <TableCell className="border text-right py-1">£{Number(row.unitPrice).toFixed(2)}</TableCell>
                                  <TableCell className="border text-right py-1">£{Number(row.total).toFixed(2)}</TableCell>
                                </TableRow>
                              );
                            }
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer text for print */}
      <div className="footer-text">stand 100</div>
    </PageLayout>
  );
}
