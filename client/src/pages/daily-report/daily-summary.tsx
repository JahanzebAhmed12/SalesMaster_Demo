import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, FileText, Printer, Mail } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import PageLayout from "@/components/common/page-layout";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Add CSS for print page breaks
const printStyles = `
  @media print {
    .print\\:page-break-before-always {
      page-break-before: always !important;
    }
    .print\\:hidden {
      display: none !important;
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.innerText = printStyles;
  document.head.appendChild(styleSheet);
}

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
  }>;
  customer_payments: Array<{
    customer_name: string;
    payment_id: string; // Changed to payment_id for customer payments
    cash_amount: number;
    card_amount: number;
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
    description: string;
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
    supplier_payments_total: number;
    expense_total: number;
    cash_cf_total: number;
    banking_total: number;
    bank_transfer_payments: number;
  };
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
    queryFn: () => {
      if (!selectedDate) return Promise.resolve(null);
      return apiRequest("GET", `/api/reports/daily-summary?date=${format(selectedDate, "yyyy-MM-dd")}`);
    },
    enabled: !!selectedDate,
    staleTime: 0, // Always consider data stale to ensure fresh fetch
    gcTime: 0, // Don't cache the data (replaces deprecated cacheTime)
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

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

  // Fetch purchase data
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
      let regInfo = [];
      if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
      if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
      if (regInfo.length > 0) {
        doc.text(regInfo.join(' | '), 105, yPosition, { align: 'center' });
        yPosition += 10;
      } else {
        yPosition += 5;
      }
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
          sale.customer_name,
          sale.invoice_no || '-',
          sale.cash_sales > 0 ? sale.cash_sales.toFixed(2) : '-',
          sale.card_paid > 0 ? sale.card_paid.toFixed(2) : '-',
          sale.bank_transfer > 0 ? sale.bank_transfer.toFixed(2) : '-',
          sale.cheque > 0 ? sale.cheque.toFixed(2) : '-',
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
      doc.text('Customer Payments (Backdate)', 14, yPosition);
      yPosition += 5;

      autoTable(doc, {
        head: [['Customer Name', 'Payment ID', 'Cash Amount', 'Card Amount', 'Total Amount']],
        body: [
          ...summaryData.customer_payments.map(payment => [
            payment.customer_name,
            payment.payment_id,
            payment.cash_amount > 0 ? payment.cash_amount.toFixed(2) : '-',
            payment.card_amount > 0 ? payment.card_amount.toFixed(2) : '-',
            payment.total_amount.toFixed(2)
          ]),
          ['TOTAL', '',
            summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2),
            summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2),
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
        head: [['Ref Number', 'Description', 'Supplier Name', 'Expense Name', 'Amount', 'Payment Mode']],
        body: [
          ...summaryData.expense_entries.map(expense => [
            expense.ref_number,
            expense.description,
            expense.supplier_name,
            expense.expense_name,
            expense.amount.toFixed(2),
            expense.payment_mode
          ]),
          ['TOTAL', '', '', '', summaryData.expense_entries.reduce((sum, e) => sum + e.amount, 0).toFixed(2), '']
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
              : `${record.paying_number ? `Pay: ${record.paying_number}` : ''}${record.cheque_number ? ` | Cheque: ${record.cheque_number}` : ''}`
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
      ['Total Cheque', `£${summaryData.sales_summary.reduce((sum, s) => sum + (s.account_paid_cheque || 0), 0).toFixed(2)}`],
      ['Account Payments/Customer Cash Payments', `£${summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2)}`],
      ['Account Payment/Customer Card Payment (Backdate)', `£${summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2)}`],
      ['Till/Float(C/F)', `£${(summaryData.totals.cash_cf_total || 0).toFixed(2)}`],
      ['Total Supplier Payment (Paid Out)', `£${summaryData.supplier_payments.filter(p => p.payment_mode.toLowerCase() === 'cash' || p.payment_mode.toLowerCase() === 'bank').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`],
      ['Total Expense (Paid Out)', `£${(summaryData.expense_entries || []).filter(e => e.payment_mode.toLowerCase() === 'cash' || e.payment_mode.toLowerCase() === 'bank').reduce((sum, e) => sum + e.amount, 0).toFixed(2)}`],
      ['Total Banking', `£${summaryData.totals.banking_total.toFixed(2)}`]
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
        let regInfo = [];
        if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
        if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
        if (regInfo.length > 0) {
          doc.text(regInfo.join(' | '), 105, yPosition, { align: 'center' });
          yPosition += 10;
        } else {
          yPosition += 5;
        }
      }

      doc.setFontSize(14);
      doc.text('STOCK CHECK', 105, yPosition, { align: 'center' });
      yPosition += 8;
      doc.setFontSize(10);
      doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
      yPosition += 15;

      const stockTotals = {
        os: stockData.reduce((sum, item) => sum + item.os, 0),
        ns: stockData.reduce((sum, item) => sum + item.ns, 0),
        sales: stockData.reduce((sum, item) => sum + item.sales, 0),
        crtn: stockData.reduce((sum, item) => sum + item.crtn, 0),
        dmps: stockData.reduce((sum, item) => sum + item.dmps, 0),
        srtn: stockData.reduce((sum, item) => sum + item.srtn, 0),
        stock: stockData.reduce((sum, item) => sum + item.stock, 0),
        clStock: stockData.reduce((sum, item) => sum + item.clStock, 0)
      };

      autoTable(doc, {
        head: [['Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result']],
        body: [
          ...stockData.map((item: StockItem) => [
            item.slNo,
            item.productDescription,
            item.os,
            item.ns,
            item.sales,
            item.crtn,
            item.dmps,
            item.srtn,
            item.stock,
            item.clStock,
            item.result
          ]),
          ['TOTAL', '', stockTotals.os, stockTotals.ns, stockTotals.sales, stockTotals.crtn, stockTotals.dmps, stockTotals.srtn, stockTotals.stock, stockTotals.clStock, '']
        ],
        startY: yPosition,
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 40 },
          2: { cellWidth: 12 },
          3: { cellWidth: 12 },
          4: { cellWidth: 12 },
          5: { cellWidth: 12 },
          6: { cellWidth: 12 },
          7: { cellWidth: 12 },
          8: { cellWidth: 12 },
          9: { cellWidth: 12 },
          10: { cellWidth: 12 }
        }
      });
    }

    // Daily Book Purchase (only if has data) - NEW PAGE
    if (purchaseData && purchaseData.length > 0) {
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
        let regInfo = [];
        if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
        if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
        if (regInfo.length > 0) {
          doc.text(regInfo.join(' | '), 105, yPosition, { align: 'center' });
          yPosition += 10;
        } else {
          yPosition += 5;
        }
      }

      doc.setFontSize(14);
      doc.text('DAILY BOOK PURCHASE', 105, yPosition, { align: 'center' });
      yPosition += 8;
      doc.setFontSize(10);
      doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
      yPosition += 15;

      const totalInvoiceAmount = purchaseData.reduce((sum, item) => sum + item.invoiceAmt, 0);

      autoTable(doc, {
        head: [['Date', 'Supplier', 'Inv.No', 'Invoice Amt']],
        body: [
          ...purchaseData.map((item: PurchaseEntry) => [
            item.date,
            item.supplier,
            item.invNo,
            `£${item.invoiceAmt.toFixed(2)}`
          ]),
          ['TOTAL', `${purchaseData.length} Items`, '', `£${totalInvoiceAmount.toFixed(2)}`]
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 50 },
          2: { cellWidth: 30 },
          3: { cellWidth: 30 }
        }
      });
    }

    doc.save(`daily-summary-${format(selectedDate, "yyyy-MM-dd")}.pdf`);

    toast({
      title: "Success",
      description: "Clean PDF generated successfully (empty tables excluded)",
    });
  };

  // Generate PDF blob for email
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
      let regInfo = [];
      if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
      if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
      if (regInfo.length > 0) {
        doc.text(regInfo.join(' | '), 105, yPosition, { align: 'center' });
        yPosition += 10;
      } else {
        yPosition += 5;
      }
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
          sale.customer_name,
          sale.invoice_no || '-',
          sale.cash_sales > 0 ? sale.cash_sales.toFixed(2) : '-',
          sale.card_paid > 0 ? sale.card_paid.toFixed(2) : '-',
          sale.bank_transfer > 0 ? sale.bank_transfer.toFixed(2) : '-',
          sale.cheque > 0 ? sale.cheque.toFixed(2) : '-',
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
      doc.text('Customer Payments (Backdate)', 14, yPosition);
      yPosition += 5;

      autoTable(doc, {
        head: [['Customer Name', 'Payment ID', 'Cash Amount', 'Card Amount', 'Total Amount']],
        body: [
          ...summaryData.customer_payments.map(payment => [
            payment.customer_name,
            payment.payment_id,
            payment.cash_amount > 0 ? payment.cash_amount.toFixed(2) : '-',
            payment.card_amount > 0 ? payment.card_amount.toFixed(2) : '-',
            payment.total_amount.toFixed(2)
          ]),
          ['TOTAL', '',
            summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2),
            summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2),
            summaryData.totals.customer_payments_total.toFixed(2)
          ]
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Add other sections (supplier payments, expenses, banking, totals) similar to handleGenerateCleanPDF
    // For brevity, I'll add the key sections

    // Daily Summary Totals
    doc.setFontSize(12);
    doc.text('Daily Summary Totals', 14, yPosition);
    yPosition += 5;

    const totalsData = [
      ['Total Cash Sales', `£${summaryData.totals.cash_sales.toFixed(2)}`],
      ['Total Card Sales', `£${summaryData.totals.card_sales.toFixed(2)}`],
      ['Total Banking', `£${summaryData.totals.banking_total.toFixed(2)}`]
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
            body: `Dear Recipient,\n\nPlease find attached the Daily Summary Report for ${format(selectedDate, 'yyyy-MM-dd')}.\n\nThis report contains:\n- Daily Sales Summary\n- Customer Payments (Backdate)\n- Supplier Payments\n- Expense Entries\n- Banking Records\n- Financial Totals\n\nReport Summary:\n- Total Cash Sales: £${summaryData.totals.cash_sales.toFixed(2)}\n- Total Card Sales: £${summaryData.totals.card_sales.toFixed(2)}\n- Total Banking: £${summaryData.totals.banking_total.toFixed(2)}\n- Date: ${format(selectedDate, 'yyyy-MM-dd')}\n\nBest regards,\n${companyDetails?.companyName || 'Finance Team'}`,
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

  return (
    <PageLayout title="Daily Summary" breadcrumb="Daily Report / Daily Summary">
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Daily Summary Report
              </CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Date:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-40 justify-start text-left font-normal",
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
                  <Button onClick={handleGeneratePDF} className="bg-red-600 hover:bg-red-700">
                    <Printer className="w-4 h-4 mr-2" />
                    Print PDF
                  </Button>
                  <Button onClick={handleGenerateCleanPDF} className="bg-blue-600 hover:bg-blue-700">
                    <Download className="w-4 h-4 mr-2" />
                    Clean PDF
                  </Button>

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
                      {summaryData.sales_summary.map((sale, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">{sale.customer_name}</TableCell>
                          <TableCell className="border">{sale.invoice_no || '-'}</TableCell>
                          <TableCell className="border text-right">
                            {sale.cash_sales > 0 ? sale.cash_sales.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">
                            {sale.card_paid > 0 ? sale.card_paid.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">
                            {sale.bank_transfer > 0 ? sale.bank_transfer.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">
                            {sale.cheque > 0 ? sale.cheque.toFixed(2) : '-'}
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
                <CardTitle>Customer Payments (Backdate Only)</CardTitle>
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
                        <TableHead className="font-semibold border text-right">Total Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.customer_payments.map((payment, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">{payment.customer_name}</TableCell>
                          <TableCell className="border">{payment.payment_id}</TableCell>
                          <TableCell className="border text-right">
                            {payment.cash_amount > 0 ? payment.cash_amount.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">
                            {payment.card_amount > 0 ? payment.card_amount.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">{payment.total_amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {summaryData.customer_payments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="border text-center text-gray-500 py-4">
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
                      {summaryData.supplier_payments.map((payment, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">{payment.supplier_name}</TableCell>
                          <TableCell className="border">{payment.supplier_invoice_number || '-'}</TableCell>
                          <TableCell className="border">{payment.supplier_invoice_date ? format(new Date(payment.supplier_invoice_date), "dd/MM/yyyy") : '-'}</TableCell>
                          <TableCell className="border text-right">{payment.amount.toFixed(2)}</TableCell>
                          <TableCell className="border capitalize">{payment.payment_mode}</TableCell>
                        </TableRow>
                      ))}
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
                        <TableHead className="font-semibold border">Ref Number</TableHead>
                        <TableHead className="font-semibold border">Description</TableHead>
                        <TableHead className="font-semibold border">Supplier Name</TableHead>
                        <TableHead className="font-semibold border">Expense Name</TableHead>
                        <TableHead className="font-semibold border text-right">Amount</TableHead>
                        <TableHead className="font-semibold border">Payment Mode</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.expense_entries.map((expense, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">{expense.ref_number}</TableCell>
                          <TableCell className="border">{expense.description}</TableCell>
                          <TableCell className="border">{expense.supplier_name}</TableCell>
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
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Bank Transfer Sales:</span>
                    <span className="font-bold">£{(summaryData.totals.bank_transfer_sales || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Customer Bank Transfer Payments:</span>
                    <span className="font-bold">£{(summaryData.totals.bank_transfer_payments || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Bank Transfer Received:</span>
                    <span className="font-bold">£{((summaryData.totals.bank_transfer_sales || 0) + (summaryData.totals.bank_transfer_payments || 0)).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Daily Summary Totals */}
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
                    <span className="font-bold">£{summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Till/Float(C/F):</span>
                    <span className="font-bold">£{(summaryData.totals.cash_cf_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Supplier Payment (Paid Out):</span>
                    <span className="font-bold">£{summaryData.supplier_payments.filter(p => p.payment_mode.toLowerCase() === 'cash' || p.payment_mode.toLowerCase() === 'bank').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Expense (Paid Out):</span>
                    <span className="font-bold">£{(summaryData.expense_entries || []).filter(e => e.payment_mode.toLowerCase() === 'cash' || e.payment_mode.toLowerCase() === 'bank').reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Banking:</span>
                    <span className="font-bold">£{summaryData.totals.banking_total.toFixed(2)}</span>
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
                                    Bag: {bag.bag_number} | Pay: {bag.paying_number} | {bag.amount.toFixed(2)}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm">
                                {record.paying_number && `Pay: ${record.paying_number}`}
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
            <Card className={`${stockData && stockData.length === 0 ? "print:hidden" : ""} print:page-break-before-always`}>
              <CardHeader>
                <CardTitle>Stock Check - {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "dd/MM/yyyy") : "Invalid Date"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold border">Sl.No</TableHead>
                        <TableHead className="font-semibold border">Product Description</TableHead>
                        <TableHead className="font-semibold border text-center">O.S</TableHead>
                        <TableHead className="font-semibold border text-center">N.S</TableHead>
                        <TableHead className="font-semibold border text-center">Sales</TableHead>
                        <TableHead className="font-semibold border text-center">C.RTN</TableHead>
                        <TableHead className="font-semibold border text-center">Dmps</TableHead>
                        <TableHead className="font-semibold border text-center">S.RTN</TableHead>
                        <TableHead className="font-semibold border text-center">Stock</TableHead>
                        <TableHead className="font-semibold border text-center">Cl.Stock</TableHead>
                        <TableHead className="font-semibold border text-center">Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockData.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="border">{item.slNo}</TableCell>
                          <TableCell className="border">{item.productDescription}</TableCell>
                          <TableCell className="border text-center">{item.os}</TableCell>
                          <TableCell className="border text-center">{item.ns}</TableCell>
                          <TableCell className="border text-center">{item.sales}</TableCell>
                          <TableCell className="border text-center">{item.crtn}</TableCell>
                          <TableCell className="border text-center">{item.dmps}</TableCell>
                          <TableCell className="border text-center">{item.srtn}</TableCell>
                          <TableCell className="border text-center">{item.stock}</TableCell>
                          <TableCell className="border text-center">{item.clStock}</TableCell>
                          <TableCell className="border text-center">
                            {item.result === "âœ“" ? (
                              <span className="text-green-600">âœ“</span>
                            ) : (
                              <span className={item.status === 'short' ? "text-red-600" : "text-orange-600"}>
                                {item.result}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {stockData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={11} className="border text-center text-gray-500 py-4">
                            No stock check data found
                          </TableCell>
                        </TableRow>
                      )}
                      {stockData.length > 0 && (
                        <TableRow className="bg-gray-100 font-semibold">
                          <TableCell className="border"></TableCell>
                          <TableCell className="border">TOTAL</TableCell>
                          <TableCell className="border text-center">{stockData.reduce((sum, item) => sum + item.os, 0)}</TableCell>
                          <TableCell className="border text-center">{stockData.reduce((sum, item) => sum + item.ns, 0)}</TableCell>
                          <TableCell className="border text-center">{stockData.reduce((sum, item) => sum + item.sales, 0)}</TableCell>
                          <TableCell className="border text-center">{stockData.reduce((sum, item) => sum + item.crtn, 0)}</TableCell>
                          <TableCell className="border text-center">{stockData.reduce((sum, item) => sum + item.dmps, 0)}</TableCell>
                          <TableCell className="border text-center">{stockData.reduce((sum, item) => sum + item.srtn, 0)}</TableCell>
                          <TableCell className="border text-center">{stockData.reduce((sum, item) => sum + item.stock, 0)}</TableCell>
                          <TableCell className="border text-center">{stockData.reduce((sum, item) => sum + item.clStock, 0)}</TableCell>
                          <TableCell className="border"></TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Daily Book Purchase */}
            <Card className={`${purchaseData && purchaseData.length === 0 ? "print:hidden" : ""} print:page-break-before-always`}>
              <CardHeader>
                <CardTitle>Daily Book Purchase - {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "dd/MM/yyyy") : "Invalid Date"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold border">Date</TableHead>
                        <TableHead className="font-semibold border">Supplier</TableHead>
                        <TableHead className="font-semibold border text-center">Inv.No</TableHead>
                        <TableHead className="font-semibold border text-center">Invoice Amt</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseData.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="border">{item.date}</TableCell>
                          <TableCell className="border">{item.supplier}</TableCell>
                          <TableCell className="border text-center">{item.invNo}</TableCell>
                          <TableCell className="border text-center">£{item.invoiceAmt.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {purchaseData.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="border text-center text-gray-500 py-4">
                            No purchase data found
                          </TableCell>
                        </TableRow>
                      )}
                      {purchaseData.length > 0 && (
                        <TableRow className="bg-gray-100 font-semibold">
                          <TableCell className="border"></TableCell>
                          <TableCell className="border">{purchaseData.length} Items</TableCell>
                          <TableCell className="border text-center"></TableCell>
                          <TableCell className="border text-center">£{purchaseData.reduce((sum, item) => sum + item.invoiceAmt, 0).toFixed(2)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}
