import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useCompanyDetails } from "@/hooks/use-company-details";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Customer } from "@shared/schema";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Download, Copy, Printer, Search, Mail, Receipt } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useBusinessDate } from "@/hooks/use-business-date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CustomerSearch from "@/components/ui/customer-search";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { copyToClipboard } from "@/lib/export-utils";

interface StatementData {
  id: number;
  slNo: number;
  batchId?: number | null;
  transactionType?: string;
  transactionId?: number | null;
  paymentId?: number | null;
  ref?: string;
  date: string;
  invoiceNo: string;
  description: string;
  accountInv: number;  // Changed from creditInv to accountInv to match backend
  cashInv: number;
  paid: number;
  accountAdj: number;  // Changed from creditAdj to accountAdj to match backend
  discountAdj: number;
  balance: number;
  runningBalance: number;
}

interface CustomerAgingResponse {
  data: Array<{
    id: number;
    current: number;
    days30: number;
    days60: number;
    days90: number;
  }>;
}

const formatStatementAmount = (value: number) =>
  Math.abs(Number(value) || 0) < 0.005 ? "-" : `£${Number(value).toFixed(2)}`;

const formatSignedStatementAmount = (value: number) =>
  Math.abs(Number(value) || 0) < 0.005
    ? "-"
    : `${value < 0 ? "-£" : "£"}${Math.abs(Number(value)).toFixed(2)}`;

export default function CustomerStatement() {
  const { selectedCustomer, handleCustomerSelect, customerId } = useCustomerSearch();
  
  // Initialize with current date, will be updated when businessDate loads
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  
  // Track if dates were manually changed
  const fromDateManuallyChanged = useRef(false);
  const toDateManuallyChanged = useRef(false);
  
  // Get business date with formatting utilities
  const { 
    businessDate, 
    isLoading: isLoadingBusinessDate, 
    formatForApi 
  } = useBusinessDate();
  const [statementType, setStatementType] = useState("Full Statement");
  const [searchTerm, setSearchTerm] = useState("");
  const [statementData, setStatementData] = useState<StatementData[]>([]);
  const [loading, setLoading] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Fetch company details
  const { companyDetails, isLoadingCompany } = useCompanyDetails();

  // Fetch customers for dropdown - remove this as we're using CustomerSearch now

  // Process and consolidate statement data
  const processedStatementData = useMemo(() => {
    if (!statementData || statementData.length === 0) return [];

    // Group payments by invoice number and date
    const groupedData: { [key: string]: StatementData[] } = {};
    const invoiceRecords: StatementData[] = [];
    const paymentRecords: StatementData[] = [];
    const batchPaymentRecords: StatementData[] = [];

    // Separate invoices and payments
    statementData.forEach(record => {
      if (record.description && record.description.toLowerCase().includes('payment received')) {
        if (record.batchId != null) {
          batchPaymentRecords.push(record);
        } else {
          paymentRecords.push(record);
        }
      } else {
        invoiceRecords.push(record);
      }
    });

    // Group payments by invoice number and date
    const consolidatedPayments: { [key: string]: StatementData } = {};
    
    paymentRecords.forEach(payment => {
      const invoiceMatch = payment.description.match(/Payment Received - (\d+)/);
      const invoiceNo = invoiceMatch ? invoiceMatch[1] : payment.invoiceNo;
      const key = `${payment.date}_${invoiceNo}`;
      
      if (consolidatedPayments[key]) {
        // Consolidate multiple payment methods into single record
        consolidatedPayments[key].paid += payment.paid;
        consolidatedPayments[key].balance += payment.balance;
        
        // Update description to show consolidated payment
        const existingDesc = consolidatedPayments[key].description;
        if (!existingDesc.includes('(Multiple Methods)')) {
          consolidatedPayments[key].description = `Payment Received - ${invoiceNo} (Multiple Methods)`;
        }
      } else {
        consolidatedPayments[key] = { ...payment };
      }
    });

    // Combine invoices and consolidated payments
    const allRecords = [
      ...invoiceRecords,
      ...Object.values(consolidatedPayments),
      ...batchPaymentRecords
    ];

    // Sort by date, then by type (invoices first, then payments)
    const sortedRecords = allRecords.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      
      // First sort by date
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      
      // If same date, invoices come before payments
      const aIsPayment = a.description && a.description.toLowerCase().includes('payment received');
      const bIsPayment = b.description && b.description.toLowerCase().includes('payment received');
      
      if (aIsPayment && !bIsPayment) return 1;  // Payment after invoice
      if (!aIsPayment && bIsPayment) return -1; // Invoice before payment
      
      // If both are same type, maintain original order
      return a.slNo - b.slNo;
    });

    // Recalculate running balance
    let runningBalance = 0;
    return sortedRecords.map((record, index) => {
      runningBalance += record.balance;
      return {
        ...record,
        slNo: index + 1,
        runningBalance: runningBalance
      };
    });
  }, [statementData]);

  const totals = {
    accountInv: processedStatementData.reduce((sum, item) => sum + (item.accountInv || 0), 0),
    cashInv: processedStatementData.reduce((sum, item) => sum + (item.cashInv || 0), 0),
    paid: processedStatementData.reduce((sum, item) => sum + (item.paid || 0), 0),
    accountAdj: processedStatementData.reduce((sum, item) => sum + (item.accountAdj || 0), 0),
    discountAdj: processedStatementData.reduce((sum, item) => sum + (item.discountAdj || 0), 0),
    balance: processedStatementData.reduce((sum, item) => sum + (item.balance || 0), 0)
  };

  // Update dates when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      try {
        // Only update fromDate if it hasn't been manually changed
        if (!fromDateManuallyChanged.current && (!fromDate || fromDate.getTime() !== businessDate.getTime())) {
          setFromDate(new Date(businessDate));
        }
        // Only update toDate if it hasn't been manually changed
        if (!toDateManuallyChanged.current && (!toDate || toDate.getTime() !== businessDate.getTime())) {
          setToDate(new Date(businessDate));
        }
      } catch (error) {
        console.error('Error processing business date:', error);
      }
    }
  }, [businessDate, isLoadingBusinessDate]);

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

  // Format date for display
  const formatDateForDisplay = (date: Date | string | null | undefined, formatStr = 'dd/MM/yyyy') => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      return isNaN(d.getTime()) ? '' : format(d, formatStr);
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  // Send statement via email
  const handleSendStatement = async () => {
    if (!selectedCustomer || processedStatementData.length === 0) {
      alert('Please select a customer and generate a statement first');
      return;
    }
    
    // Get customer email from selected customer
    if (!selectedCustomer?.email) {
      alert('Customer email not found. Please ensure the customer has an email address.');
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/send/customer-statement", {
        customerId: selectedCustomer.id,
        fromDate: format(fromDate, "yyyy-MM-dd"),
        toDate: format(toDate, "yyyy-MM-dd"),
        statementType: statementType
      });

      if (response.success) {
        alert('Customer statement email sent successfully!');
      } else {
        alert('Failed to send email: ' + (response.message || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error sending email:', error);
      alert('Failed to send email: ' + (error.message || 'Please try again.'));
    }
  };

  // Export handlers
  const handlePrint = () => {
    if (!tableRef.current) return;
    
    // Get customer details from selected customer
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Customer Statement</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.company-info{text-align:center;margin-bottom:10px;font-size:14px;}');
      printWindow.document.write('.customer-info{margin-bottom:15px;}');
      printWindow.document.write('.period-info{margin-bottom:15px;font-weight:bold;}');
      printWindow.document.write('.totals{font-weight:bold;background-color:#f9f9f9;}');
      printWindow.document.write('.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      
      // Add company header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>CUSTOMER STATEMENT</h2>');
      if (companyDetails) {
        printWindow.document.write(`<div class="company-info">${companyDetails.companyName}, ${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}</div>`);
      }
      printWindow.document.write('</div>');
      
      // Add customer information
      if (selectedCustomer) {
        printWindow.document.write('<div class="customer-info">');
        printWindow.document.write(`<strong>Customer:</strong> ${selectedCustomer.customer_name}<br>`);
        if (selectedCustomer.address) {
          printWindow.document.write(`<strong>Address:</strong> ${selectedCustomer.address}<br>`);
        }
        if (selectedCustomer.telephone) {
          printWindow.document.write(`<strong>Phone:</strong> ${selectedCustomer.telephone}<br>`);
        }
        if (selectedCustomer.email) {
          printWindow.document.write(`<strong>Email:</strong> ${selectedCustomer.email}`);
        }
        printWindow.document.write('</div>');
      }
      
      // Add period information
      printWindow.document.write('<div class="period-info">');
      printWindow.document.write(`<strong>Statement Period:</strong> ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`);
      printWindow.document.write('</div>');
      
      // Add the table content
      printWindow.document.write(printContents);
      
      // Add footer text
      printWindow.document.write('<div class="footer">stand100</div>');
      
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    if (processedStatementData.length === 0) {
      alert('No data to export. Please generate the statement first.');
      return;
    }

    // Create a new workbook
    const wb = XLSX.utils.book_new();
    
    // Prepare the data for the main sheet
    const header = [
      'Sl.No', 
      'Date', 
      'Invoice #', 
      'Description', 
      'Credit Inv.', 
      'Cash Inv.', 
      'Paid', 
      'Credit',
      'Credit/Adj', 
      'Balance', 
      'Running Balance'
    ];

    // Convert data to array of arrays for better control
    const dataArray: Array<Array<string | number>> = [
      ['CUSTOMER STATEMENT'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`]
    ];
    
    // Add contact info if available
    const contactInfo = [];
    if (companyDetails?.telephone) contactInfo.push(`Tel: ${companyDetails.telephone}`);
    if (companyDetails?.email) contactInfo.push(`Email: ${companyDetails.email}`);
    if (contactInfo.length > 0) dataArray.push([contactInfo.join(' | ')], ['']);
    
    // Add customer information
    dataArray.push(
      ['Customer Information:'],
      ['Name:', selectedCustomer?.customer_name || ''],
      ['Address:', selectedCustomer?.address || ''],
      ['Phone:', selectedCustomer?.telephone || ''],
      ['Email:', selectedCustomer?.email || ''],
      [''],
      ['Statement Details:'],
      ['Period:', `${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`],
      ['Type:', statementType],
      [''],
      header // Add header row
    );

    // Add data rows
    processedStatementData.forEach((row) => {
      dataArray.push([
        row.slNo || '',
        row.date ? format(new Date(row.date), 'dd/MM/yyyy') : '',
        row.invoiceNo || '',
        row.description || '',
        Number(row.accountInv || 0).toFixed(2),
        Number(row.cashInv || 0).toFixed(2),
        Number(row.paid || 0).toFixed(2),
        Number(row.accountAdj || 0).toFixed(2),
        Number(row.discountAdj || 0).toFixed(2),
        Number(row.balance || 0).toFixed(2),
        Number(row.runningBalance || 0).toFixed(2)
      ]);
    });

    // Add totals row
    dataArray.push([
      '',
      'TOTAL',
      '',
      '',
      Number(totals.accountInv.toString()).toFixed(2),
      Number(totals.cashInv.toString()).toFixed(2),
      Number(totals.paid.toString()).toFixed(2),
      Number(totals.accountAdj.toString()).toFixed(2),
      Number(totals.discountAdj.toString()).toFixed(2),
      Number(totals.balance.toString()).toFixed(2),
      processedStatementData.length > 0 ? Number(processedStatementData[processedStatementData.length - 1].runningBalance || 0).toFixed(2) : '0.00'
    ]);

    // Create worksheet from array data
    const ws = XLSX.utils.aoa_to_sheet(dataArray);
    
    // Set column widths
    const colWidths = [
      { wch: 8 },   // Sl.No
      { wch: 12 },  // Date
      { wch: 15 },  // Invoice #
      { wch: 40 },  // Description
      { wch: 12 },  // Credit Inv.
      { wch: 12 },  // Cash Inv.
      { wch: 12 },  // Paid
      { wch: 12 },  // Credit
      { wch: 12 },  // Credit/Adj
      { wch: 12 },  // Balance
      { wch: 15 }   // Running Balance
    ];
    
    // Apply styles to header row
    const headerRow = dataArray.findIndex(row => row[0] === 'Sl.No');
    if (headerRow !== -1) {
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let C = 0; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({r: headerRow, c: C});
        if (!ws[cellAddress]) continue;
        ws[cellAddress].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '2B7BB9' } },
          alignment: { horizontal: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        };
      }
    }
    
    // Right align numeric columns and add borders to all cells
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = 0; R <= range.e.r; ++R) {
      for (let C = 0; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({r: R, c: C});
        if (!ws[cellAddress]) continue;
        
        // Initialize cell style if it doesn't exist
        if (!ws[cellAddress].s) ws[cellAddress].s = {};
        
        // Add borders to all cells
        ws[cellAddress].s.border = {
          top: { style: 'thin', color: { rgb: 'D3D3D3' } },
          bottom: { style: 'thin', color: { rgb: 'D3D3D3' } },
          left: { style: 'thin', color: { rgb: 'D3D3D3' } },
          right: { style: 'thin', color: { rgb: 'D3D3D3' } }
        };
        
        // Right align numeric columns (indices 4-10)
        if (C >= 4 && C <= 10) {
          ws[cellAddress].s.alignment = ws[cellAddress].s.alignment || {};
          ws[cellAddress].s.alignment.horizontal = 'right';
        }
      }
    }
    
    // Style the title
    ws['A1'].s = { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } };
    
    // Merge title cells
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } });
    
    // Set column widths
    ws['!cols'] = colWidths;
    
    // Freeze header row
    ws['!freeze'] = { xSplit: 0, ySplit: headerRow + 1, topLeftCell: 'A' + (headerRow + 2), activePane: 'bottomRight' };
    
    // Add filter to header row
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Statement');
    
    // Generate filename with customer name and date
    const customerName = selectedCustomer?.customer_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'customer';
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    
    // Save the workbook
    XLSX.writeFile(wb, `customer_statement_${customerName}_${dateStr}.xlsx`);
  };

  const handlePDF = async () => {
    if (processedStatementData.length === 0) {
      alert('No data to export. Please generate the statement first.');
      return;
    }

    if (!selectedCustomer || !customerId) {
      alert('Select a customer before exporting the statement.');
      return;
    }

    try {
      const startDate = format(fromDate, "yyyy-MM-dd");
      const endDate = format(toDate, "yyyy-MM-dd");
      const priorEndDate = format(subDays(fromDate, 1), "yyyy-MM-dd");
      const [openingRows, fullPeriodRows, agingResponse] = await Promise.all([
        apiRequest<StatementData[]>(
          "GET",
          `/api/reports/customer-statement?customerId=${customerId}&fromDate=1900-01-01&toDate=${priorEndDate}&type=Full%20Statement`
        ),
        apiRequest<StatementData[]>(
          "GET",
          `/api/reports/customer-statement?customerId=${customerId}&fromDate=${startDate}&toDate=${endDate}&type=Full%20Statement`
        ),
        apiRequest<CustomerAgingResponse>(
          "GET",
          `/api/reports/customer-aging?asOfDate=${endDate}&customerId=${customerId}&perPage=1&page=1`
        ),
      ]);

      const broughtForward = openingRows.reduce((total, row) => total + Number(row.balance || 0), 0);
      const amountDue = broughtForward +
        fullPeriodRows.reduce((total, row) => total + Number(row.balance || 0), 0);
      const aging = agingResponse.data.find(item => item.id === Number(customerId));
      const periodBalances = [
        Number(aging?.current || 0),
        Number(aging?.days30 || 0),
        Number(aging?.days60 || 0),
        Number(aging?.days90 || 0),
      ];
      const olderBalance = amountDue - periodBalances.reduce((total, value) => total + value, 0);

      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      const rightColumnX = 112;
      let headerY = 16;
      const companyAddress = [
        companyDetails?.address1,
        companyDetails?.address2,
      ].filter(Boolean).flatMap(line => String(line).split(/\s*,\s*/));
      const customerAddress = (selectedCustomer.address || "")
        .split(/\s*,\s*|\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("Statement", margin, headerY);
      headerY += 9;
      doc.setFontSize(9);
      doc.text("From:", margin, headerY);
      doc.text("To:", rightColumnX, headerY);
      doc.setFont("helvetica", "normal");
      headerY += 5;

      doc.setFont("helvetica", "bold");
      doc.text(companyDetails?.companyName || "", margin, headerY);
      doc.text(selectedCustomer.customer_name || "", rightColumnX, headerY);
      doc.setFont("helvetica", "normal");
      headerY += 4.5;

      companyAddress.forEach(line => {
        doc.text(line, margin, headerY);
        headerY += 4;
      });
      customerAddress.forEach(line => {
        doc.text(line, rightColumnX, headerY);
        headerY += 4;
      });

      const detailsY = Math.max(headerY, 42);
      doc.setFont("helvetica", "bold");
      doc.text(`A/c Ref.  ${selectedCustomer.sage_code || selectedCustomer.customer_code || customerId}`, rightColumnX, detailsY);
      doc.text("Date", pageWidth - margin - 31, 25);
      doc.setFont("helvetica", "normal");
      doc.text(format(businessDate || toDate, "dd/MM/yyyy"), pageWidth - margin, 25, { align: "right" });
      doc.text("NOTE: All values are shown in Pound Sterling", margin, detailsY + 8);
      doc.setFont("helvetica", "bold");
      doc.text("Transactions", margin, detailsY + 17);
      doc.setFont("helvetica", "normal");

      const transactionRows: Array<Array<string>> = [[
        format(subDays(fromDate, 1), "dd/MM/yyyy"),
        "",
        "Brought Forward",
        broughtForward > 0.004 ? `£${broughtForward.toFixed(2)}` : "-",
        broughtForward < -0.004 ? `£${Math.abs(broughtForward).toFixed(2)}` : "-",
      ]];
      statementData.forEach(row => {
        const isPayment = row.transactionType === "payment" ||
          row.description.toLowerCase().includes("payment received");
        const isDiscount = row.transactionType === "customer_discount" ||
          row.description.toLowerCase().includes("customer discount");
        const isReturn = row.transactionType === "customer_return" ||
          row.description.toLowerCase().includes("customer return");
        const debit = Math.max(0, Number(row.accountInv || 0)) +
          Math.max(0, Number(row.cashInv || 0));
        const credit = Math.max(0, Number(row.paid || 0)) +
          Math.max(0, Number(row.accountAdj || 0)) +
          Math.max(0, Number(row.discountAdj || 0));
        const reference = isPayment
          ? String(row.batchId ?? row.paymentId ?? row.transactionId ?? row.ref ?? "")
          : String(row.ref || row.invoiceNo || "");
        const details = isPayment
          ? "Payment"
          : isDiscount
            ? row.description.replace(/^Customer Discount/i, "Discount")
            : isReturn
              ? row.description.replace(/^Customer Return/i, "Return")
              : debit > 0
                ? "Goods/Services"
                : "Credit";

        transactionRows.push([
          row.date ? format(new Date(`${row.date}T00:00:00`), "dd/MM/yyyy") : "",
          reference,
          details,
          debit > 0.004 ? `£${debit.toFixed(2)}` : "-",
          credit > 0.004 ? `£${credit.toFixed(2)}` : "-",
        ]);
      });

      autoTable(doc, {
        head: [["Date", "Ref.", "Details", "Debit", "Credit"]],
        body: transactionRows,
        startY: detailsY + 20,
        margin: { left: margin, right: margin },
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 1.8,
          textColor: [0, 0, 0],
          lineColor: [110, 110, 110],
          lineWidth: 0.1,
          overflow: "linebreak",
        },
        headStyles: {
          fontStyle: "bold",
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          lineWidth: 0.15,
        },
        columnStyles: {
          0: { cellWidth: 27 },
          1: { cellWidth: 27 },
          2: { cellWidth: "auto" },
          3: { cellWidth: 34, halign: "right" },
          4: { cellWidth: 34, halign: "right" },
        },
        didParseCell: data => {
          if (data.section === "body" && data.row.index === 0) {
            data.cell.styles.fontStyle = "bold";
          }
        },
      });

      let summaryY = ((doc as any).lastAutoTable?.finalY || detailsY + 20) + 8;
      if (summaryY > doc.internal.pageSize.getHeight() - 34) {
        doc.addPage();
        summaryY = 18;
      }
      autoTable(doc, {
        head: [["Current", "Period 1", "Period 2", "Period 3", "Older"]],
        body: [[
          formatStatementAmount(periodBalances[0]),
          formatStatementAmount(periodBalances[1]),
          formatStatementAmount(periodBalances[2]),
          formatStatementAmount(periodBalances[3]),
          formatSignedStatementAmount(olderBalance),
        ]],
        startY: summaryY,
        margin: { left: margin, right: margin },
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 2,
          textColor: [0, 0, 0],
          lineColor: [110, 110, 110],
          lineWidth: 0.1,
          halign: "right",
        },
        headStyles: {
          fontStyle: "bold",
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          halign: "center",
        },
      });
      const dueY = ((doc as any).lastAutoTable?.finalY || summaryY) + 8;
      doc.setFont("helvetica", "bold");
      doc.text("Amount Due", pageWidth - margin - 55, dueY);
      doc.text(formatSignedStatementAmount(amountDue), pageWidth - margin, dueY, { align: "right" });

      const fileName = `customer-statement-${selectedCustomer.customer_name?.replace(/[^a-zA-Z0-9]/g, "_") || "customer"}-${format(toDate, "yyyy-MM-dd")}.pdf`;
      doc.save(fileName);
    } catch (error) {
      console.error("Unable to create customer statement PDF:", error);
      alert(error instanceof Error ? `Unable to create PDF: ${error.message}` : "Unable to create the customer statement PDF.");
    }
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tInvoice #\tDescription\tCredit Inv.\tCash Inv.\tPaid\tCredit\tCredit/Adj\tBalance\tRunning Balance\n';
    text += processedStatementData.map((row: StatementData) => [
      row.slNo,
      row.date,
      row.invoiceNo,
      row.description,
      row.accountInv,
      row.cashInv,
      row.paid,
      row.accountAdj,
      row.discountAdj,
      row.balance,
      row.runningBalance
    ].join('\t')).join('\n');
    copyToClipboard(text);
    // Optionally show a toast
  };

  return (
    <PageLayout title="Customer Statement" breadcrumb="Historical Reports > Customer Statement">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Receipt size={20} />
                Customer Statement
              </CardTitle>
              <div className="text-sm text-gray-500">
                {companyDetails ? (
                  <>
                    {companyDetails.companyName}, {companyDetails.address1}
                    {companyDetails.address2 && `, ${companyDetails.address2}`}
                  </>
                ) : (
                  "Loading company details..."
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* First row - Form controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Customer</Label>
                  <CustomerSearch
                    placeholder="Search customer by code or name..."
                    onCustomerSelect={handleCustomerSelect}
                    required
                    showCode
                    allowClear
                  />
                </div>
                
                <DateRangeFilter
                from={fromDate}
                to={toDate}
                onFromChange={handleFromDateChange}
                onToChange={handleToDateChange}
                fromLabel="From:"
                toLabel="To:"
                dateFormat="dd/MM/yyyy"
                fromManuallyChanged={fromDateManuallyChanged}
                toManuallyChanged={toDateManuallyChanged}
              />
                
                <div>
                  <Label className="text-sm font-medium mb-2 block">Type</Label>
                  <Select value={statementType} onValueChange={setStatementType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full Statement">Full Statement</SelectItem>
                      <SelectItem value="Outstanding Only">Outstanding Only</SelectItem>
                      <SelectItem value="Paid Only">Paid Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Second row - Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  className="bg-blue-500 hover:bg-blue-600 flex-1 sm:flex-none sm:min-w-[120px]"
                  disabled={!selectedCustomer || loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await apiRequest(
                        "GET",
                        `/api/reports/customer-statement?customerId=${customerId}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&type=${encodeURIComponent(statementType)}`
                      );
                      setStatementData(res);
                    } catch (err) {
                      // handle error, e.g. show toast
                    }
                    setLoading(false);
                  }}
                >
                  {loading ? "Loading..." : "Generate"}
                </Button>
                
                <div className="flex gap-2 flex-wrap">
                  <Button 
                    className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2 flex-1 sm:flex-none" 
                    onClick={handleSendStatement}
                    disabled={!selectedCustomer || processedStatementData.length === 0}
                  >
                    <Mail size={16} />
                    <span className="hidden sm:inline">Email</span>
                  </Button>
                  <Button 
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-1 flex-1 sm:flex-none"
                    disabled={!selectedCustomer || processedStatementData.length === 0}
                    onClick={handlePDF}
                  >
                    <FileText size={16} />
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                  <Button 
                    size="sm"
                    variant="outline"
                    className="flex items-center gap-1 flex-1 sm:flex-none"
                    disabled={!selectedCustomer || processedStatementData.length === 0}
                    onClick={handlePrint}
                  >
                    <Printer size={16} />
                    <span className="hidden sm:inline">Print</span>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statement Details Section */}
        <Card>
          <CardHeader>
            <div className="bg-green-600 text-white text-center py-2 rounded">
              ACCOUNT STATEMENT - {selectedCustomer?.customer_name || 'No customer selected'}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-semibold">Customer Details:</div>
                <div>{selectedCustomer?.customer_name || ''}</div>
                <div>Account No: C-{customerId || ''}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">Statement Period:</div>
                <div>From: {fromDate ? format(fromDate, "dd/MM/yyyy") : ""}</div>
                <div>To: {toDate ? format(toDate, "dd/MM/yyyy") : ""}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">Show all rows</Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                  <FileText size={14} />
                  PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                  <Download size={14} />
                  Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                  <Copy size={14} />
                  Copy
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search:"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-48"
                />
              </div>
            </div>

            <div ref={tableRef}>
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <div className="flex justify-between">
                  <span className="font-medium">BROUGHT FORWARD:</span>
                  <span className="font-bold">£ 0.00</span>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="bg-green-100">
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Credit Inv.</TableHead>
                    <TableHead className="text-center">Cash Inv.</TableHead>
                    <TableHead className="text-center">Paid</TableHead>
                    <TableHead className="text-center">Credit</TableHead>
                    <TableHead className="text-center">Credit/Adj</TableHead>
                    <TableHead className="text-center">Balance</TableHead>
                    <TableHead className="text-center">Running Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedStatementData.map((statement) => (
                    <TableRow key={statement.id} className="hover:bg-gray-50">
                      <TableCell>{statement.slNo}</TableCell>
                      <TableCell>{format(new Date(statement.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{statement.invoiceNo}</TableCell>
                      <TableCell>{statement.description}</TableCell>
                      <TableCell className="text-center">{formatStatementAmount(statement.accountInv)}</TableCell>
                      <TableCell className="text-center">{formatStatementAmount(statement.cashInv)}</TableCell>
                      <TableCell className="text-center">{formatStatementAmount(statement.paid)}</TableCell>
                      <TableCell className="text-center">{formatStatementAmount(statement.accountAdj)}</TableCell>
                      <TableCell className="text-center">{formatStatementAmount(statement.discountAdj)}</TableCell>
                      <TableCell className={`text-center font-medium ${(statement.balance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatSignedStatementAmount(statement.balance)}
                      </TableCell>
                      <TableCell className={`text-center font-bold ${(statement.runningBalance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatSignedStatementAmount(statement.runningBalance)}
                        {(statement.runningBalance || 0) < 0 && (
                          <span className="ml-1 text-xs bg-green-100 text-green-800 px-1 rounded">CREDIT</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-indigo-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">TOTAL</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center font-bold">{formatStatementAmount(totals.accountInv)}</TableCell>
                    <TableCell className="text-center font-bold">{formatStatementAmount(totals.cashInv)}</TableCell>
                    <TableCell className="text-center font-bold">{formatStatementAmount(totals.paid)}</TableCell>
                    <TableCell className="text-center font-bold">{formatStatementAmount(totals.accountAdj)}</TableCell>
                    <TableCell className="text-center font-bold">{formatStatementAmount(totals.discountAdj)}</TableCell>
                    <TableCell className="text-center font-bold">{formatSignedStatementAmount(totals.balance)}</TableCell>
                    <TableCell className={`text-center font-bold ${(processedStatementData[processedStatementData.length - 1]?.runningBalance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatSignedStatementAmount(processedStatementData[processedStatementData.length - 1]?.runningBalance || 0)}
                      {(processedStatementData[processedStatementData.length - 1]?.runningBalance || 0) < 0 && (
                        <span className="ml-1 text-xs bg-green-100 text-green-800 px-1 rounded">CREDIT</span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            <div className="mt-6 p-4 bg-gray-50 rounded">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold mb-2">Summary:</div>
                  <div>Total Credit Sales: £{totals.accountInv.toFixed(2)}</div>
                  <div>Total Payments: £{totals.paid.toFixed(2)}</div>
                  <div>Total Adjustments: £{(totals.accountAdj + totals.discountAdj).toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold mb-2 text-lg">Current Balance:</div>
                  <div className={`text-2xl font-bold ${(processedStatementData[processedStatementData.length - 1]?.runningBalance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {(processedStatementData[processedStatementData.length - 1]?.runningBalance || 0) >= 0 ? '£' : '-£'}{Math.abs(processedStatementData[processedStatementData.length - 1]?.runningBalance || 0).toFixed(2)}
                  </div>
                  {(processedStatementData[processedStatementData.length - 1]?.runningBalance || 0) < 0 && (
                    <div className="text-sm text-green-600 font-medium mt-1">
                      Customer has credit balance
                    </div>
                  )}
                  {(processedStatementData[processedStatementData.length - 1]?.runningBalance || 0) > 0 && (
                    <div className="text-sm text-red-600 font-medium mt-1">
                      Amount due from customer
                    </div>
                  )}
                  {(processedStatementData[processedStatementData.length - 1]?.runningBalance || 0) === 0 && (
                    <div className="text-sm text-gray-600 font-medium mt-1">
                      Account balanced
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {processedStatementData.length} of {processedStatementData.length} entries</div>
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Previous</Button>
                  <Button variant="outline" size="sm" className="bg-blue-500 text-white">1</Button>
                  <Button variant="outline" size="sm">Next</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}