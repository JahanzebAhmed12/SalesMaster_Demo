import { useState, useEffect, useRef } from "react";
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
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useBusinessDate } from "@/hooks/use-business-date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CompanyDetails {
  id: number;
  companyName: string;
  address1: string;
  address2?: string;
  telephone?: string;
  mobile?: string;
  fax?: string;
  website?: string;
  email?: string;
  vatNo?: string;
  compRegNo?: string;
  bankDetails?: string;
  einlNumber?: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

interface StatementData {
  id: number;
  slNo: number;
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

export default function CustomerStatement() {
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  
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
  const { data: companyDetails, isLoading: isLoadingCompany } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // Fetch customers for dropdown
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  const totals = {
    accountInv: statementData.reduce((sum, item) => sum + (item.accountInv || 0), 0),
    cashInv: statementData.reduce((sum, item) => sum + (item.cashInv || 0), 0),
    paid: statementData.reduce((sum, item) => sum + (item.paid || 0), 0),
    accountAdj: statementData.reduce((sum, item) => sum + (item.accountAdj || 0), 0),
    discountAdj: statementData.reduce((sum, item) => sum + (item.discountAdj || 0), 0),
    balance: statementData.reduce((sum, item) => sum + (item.balance || 0), 0)
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
    if (!selectedCustomer || statementData.length === 0) {
      alert('Please select a customer and generate a statement first');
      return;
    }
    
    // Get customer email from selected customer
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    if (!selectedCustomerData?.email) {
      alert('Customer email not found. Please ensure the customer has an email address.');
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/send/customer-statement", {
        customerId: parseInt(selectedCustomer),
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
    
    // Get customer details
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    
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
      if (selectedCustomerData) {
        printWindow.document.write('<div class="customer-info">');
        printWindow.document.write(`<strong>Customer:</strong> ${selectedCustomerData.customer_name}<br>`);
        if (selectedCustomerData.address) {
          printWindow.document.write(`<strong>Address:</strong> ${selectedCustomerData.address}<br>`);
        }
        if (selectedCustomerData.telephone) {
          printWindow.document.write(`<strong>Phone:</strong> ${selectedCustomerData.telephone}<br>`);
        }
        if (selectedCustomerData.email) {
          printWindow.document.write(`<strong>Email:</strong> ${selectedCustomerData.email}`);
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
    if (statementData.length === 0) {
      alert('No data to export. Please generate the statement first.');
      return;
    }

    // Get customer details
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    
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
      'Credit/Adj', 
      'Discount/Adj', 
      'Balance', 
      'Running Balance'
    ];

    // Convert data to array of arrays for better control
    const dataArray = [
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
      ['Name:', selectedCustomerData?.customer_name || ''],
      ['Address:', selectedCustomerData?.address || ''],
      ['Phone:', selectedCustomerData?.telephone || ''],
      ['Email:', selectedCustomerData?.email || ''],
      [''],
      ['Statement Details:'],
      ['Period:', `${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`],
      ['Type:', statementType],
      [''],
      header // Add header row
    );

    // Add data rows
    statementData.forEach((row) => {
      dataArray.push([
        row.slNo || '',
        row.date ? format(new Date(row.date), 'dd/MM/yyyy') : '',
        row.invoiceNo || '',
        row.description || '',
        parseFloat(row.accountInv || 0).toFixed(2),
        parseFloat(row.cashInv || 0).toFixed(2),
        parseFloat(row.paid || 0).toFixed(2),
        parseFloat(row.accountAdj || 0).toFixed(2),
        parseFloat(row.discountAdj || 0).toFixed(2),
        parseFloat(row.balance || 0).toFixed(2),
        parseFloat(row.runningBalance || 0).toFixed(2)
      ]);
    });

    // Add totals row
    dataArray.push([
      '',
      'TOTAL',
      '',
      '',
      parseFloat(totals.accountInv.toString()).toFixed(2),
      parseFloat(totals.cashInv.toString()).toFixed(2),
      parseFloat(totals.paid.toString()).toFixed(2),
      parseFloat(totals.accountAdj.toString()).toFixed(2),
      parseFloat(totals.discountAdj.toString()).toFixed(2),
      parseFloat(totals.balance.toString()).toFixed(2),
      statementData.length > 0 ? parseFloat(statementData[statementData.length - 1].runningBalance || 0).toFixed(2) : '0.00'
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
      { wch: 12 },  // Credit/Adj
      { wch: 12 },  // Discount/Adj
      { wch: 12 },  // Balance
      { wch: 15 }   // Running Balance
    ];
    
    // Apply styles to header row
    const headerRow = dataArray.findIndex(row => row[0] === 'Sl.No');
    if (headerRow !== -1) {
      const range = XLSX.utils.decode_range(ws['!ref']);
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
    const range = XLSX.utils.decode_range(ws['!ref']);
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
    const customerName = selectedCustomerData?.customer_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'customer';
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    
    // Save the workbook
    XLSX.writeFile(wb, `customer_statement_${customerName}_${dateStr}.xlsx`);
  };

  const handlePDF = () => {
    if (statementData.length === 0) {
      alert('No data to export. Please generate the statement first.');
      return;
    }

    // Get customer details
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    
    // Initialize PDF with margins
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    // Set margins
    const margin = 15; // 15mm margin on all sides
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - (2 * margin);
    
    // Add title
    doc.setFontSize(16);
    doc.text('CUSTOMER STATEMENT', pageWidth / 2, margin + 10, { align: 'center' });
    
    // Add company info
    doc.setFontSize(10);
    if (companyDetails) {
      const companyInfo = `${companyDetails.companyName}, ${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}`;
      doc.text(companyInfo, pageWidth / 2, margin + 20, { 
        align: 'center',
        maxWidth: contentWidth
      });
    }
    
    // Add customer info
    doc.setFontSize(12);
    doc.text('Customer Information:', margin, margin + 35);
    doc.setFontSize(10);
    if (selectedCustomerData) {
      doc.text(`Name: ${selectedCustomerData.customer_name || ''}`, margin, margin + 45, { maxWidth: contentWidth });
      if (selectedCustomerData.address) {
        doc.text(`Address: ${selectedCustomerData.address}`, margin, margin + 55, { maxWidth: contentWidth });
      }
      if (selectedCustomerData.telephone || selectedCustomerData.email) {
        const contactInfo = [];
        if (selectedCustomerData.telephone) contactInfo.push(`Phone: ${selectedCustomerData.telephone}`);
        if (selectedCustomerData.email) contactInfo.push(`Email: ${selectedCustomerData.email}`);
        doc.text(contactInfo.join(' | '), margin, margin + 65, { maxWidth: contentWidth });
      }
    }
    
    // Add period info
    doc.setFontSize(12);
    doc.text(`Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, margin, margin + 80);
    // doc.text(`Type: ${statementType}`, margin + 50, margin + 80);
    
    // Prepare table data
    const tableColumn = [
      'Sl.No', 
      'Date', 
      'Invoice #', 
      'Description', 
      'Credit Inv.', 
      'Cash Inv.', 
      'Paid', 
      'Credit/Adj', 
      'Discount/Adj', 
      'Balance', 
      'Running Balance'
    ];
    
    const tableRows = statementData.map(row => [
      row.slNo || '',
      row.date ? format(new Date(row.date), 'dd/MM/yyyy') : '',
      row.invoiceNo || '',
      row.description || '',
      parseFloat(row.accountInv || 0).toFixed(2),
      parseFloat(row.cashInv || 0).toFixed(2),
      parseFloat(row.paid || 0).toFixed(2),
      parseFloat(row.accountAdj || 0).toFixed(2),
      parseFloat(row.discountAdj || 0).toFixed(2),
      parseFloat(row.balance || 0).toFixed(2),
      parseFloat(row.runningBalance || 0).toFixed(2)
    ]);
    
    // Add totals row
    tableRows.push([
      '',
      'TOTAL',
      '',
      '',
      parseFloat(totals.accountInv.toString()).toFixed(2),
      parseFloat(totals.cashInv.toString()).toFixed(2),
      parseFloat(totals.paid.toString()).toFixed(2),
      parseFloat(totals.accountAdj.toString()).toFixed(2),
      parseFloat(totals.discountAdj.toString()).toFixed(2),
      parseFloat(totals.balance.toString()).toFixed(2),
      statementData.length > 0 ? parseFloat(statementData[statementData.length - 1].runningBalance || 0).toFixed(2) : '0.00'
    ]);
    
    // Add table to PDF with proper margins
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: margin + 90,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: 'linebreak',
        lineWidth: 0.1,
        cellWidth: 'wrap',
        valign: 'middle',
        textColor: [0, 0, 0]
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        lineWidth: 0.1,
        fontSize: 7
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },  // Sl.No
        1: { cellWidth: 20, halign: 'center' }, // Date
        2: { cellWidth: 17, halign: 'center' }, // Invoice #
        3: { cellWidth: 25 },  // Description
        4: { cellWidth: 15, halign: 'right' },  // Credit Inv.
        5: { cellWidth: 15, halign: 'right' },  // Cash Inv.
        6: { cellWidth: 15, halign: 'right' },  // Paid
        7: { cellWidth: 15, halign: 'right' },  // Credit/Adj
        8: { cellWidth: 15, halign: 'right' },  // Discount/Adj
        9: { cellWidth: 15, halign: 'right' },  // Balance
        10: { cellWidth: 20, halign: 'right' }  // Running Balance
      },
      tableWidth: 'auto',
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.1,
      didDrawPage: function(data) {
        // Footer on each page
        doc.setFontSize(8);
        doc.text(
          'stand100', 
          pageWidth - margin, 
          pageHeight - margin, 
          { align: 'right' }
        );
        
        // Page number
        doc.text(
          `Page ${data.pageNumber} of ${data.pageCount}`, 
          pageWidth / 2, 
          pageHeight - margin,
          { align: 'center' }
        );
      }
    });
    
    // Save the PDF
    const fileName = `customer-statement-${selectedCustomerData?.customer_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'customer'}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    doc.save(fileName);
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tInvoice #\tDescription\tCredit Inv.\tCash Inv.\tPaid\tCredit/Adj\tDiscount/Adj\tBalance\tRunning Balance\n';
    text += statementData.map((row: StatementData) => [
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
    await navigator.clipboard.writeText(text);
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
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingCustomers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.customer_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>From:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !fromDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fromDate ? formatDateForDisplay(fromDate, "yyyyMMdd") : "Pick date"}
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
              
              <div>
                <Label>To:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !toDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {toDate ? formatDateForDisplay(toDate, "yyyyMMdd") : "Pick date"}
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
              
              <div>
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
              
              <div>
                <Button
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  disabled={!selectedCustomer || loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await apiRequest(
                        "GET",
                        `/api/reports/customer-statement?customerId=${selectedCustomer}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&type=${encodeURIComponent(statementType)}`
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
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2" onClick={handleSendStatement}>
                  <Mail size={16} />
                  Email
                </Button>
                <Button 
                  className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2"
                  disabled={!selectedCustomer || statementData.length === 0}
                  onClick={handlePrint}
                >
                  <Printer size={16} />
                  Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statement Details Section */}
        <Card>
          <CardHeader>
            <div className="bg-green-600 text-white text-center py-2 rounded">
              ACCOUNT STATEMENT - {selectedCustomer}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-semibold">Customer Details:</div>
                <div>{customers.find(c => c.id.toString() === selectedCustomer)?.customer_name || ''}</div>
                <div>Account No: C-{selectedCustomer}</div>
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
                    <TableHead className="text-center">Credit/Adj</TableHead>
                    <TableHead className="text-center">Discount/Adj</TableHead>
                    <TableHead className="text-center">Balance</TableHead>
                    <TableHead className="text-center">Running Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statementData.map((statement) => (
                    <TableRow key={statement.id} className="hover:bg-gray-50">
                      <TableCell>{statement.slNo}</TableCell>
                      <TableCell>{format(new Date(statement.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{statement.invoiceNo}</TableCell>
                      <TableCell>{statement.description}</TableCell>
                      <TableCell className="text-center">£{(statement.accountInv || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{(statement.cashInv || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{(statement.paid || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{(statement.accountAdj || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{(statement.discountAdj || 0).toFixed(2)}</TableCell>
                      <TableCell className={`text-center font-medium ${(statement.balance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        £{(statement.balance || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-center font-bold ${(statement.runningBalance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        £{(statement.runningBalance || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-indigo-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">TOTAL</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center font-bold">£{totals.accountInv.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.cashInv.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.paid.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.accountAdj.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.discountAdj.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.balance.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold text-red-600">£{(statementData[statementData.length - 1]?.runningBalance || 0).toFixed(2)}</TableCell>
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
                  <div className={`text-2xl font-bold ${(statementData[statementData.length - 1]?.runningBalance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    £{(statementData[statementData.length - 1]?.runningBalance || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {statementData.length} of {statementData.length} entries</div>
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