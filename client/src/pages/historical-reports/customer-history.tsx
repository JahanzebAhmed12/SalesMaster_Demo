import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Customer } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, User, FileText, Download, Copy, Printer, Search, Mail, Save, User2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLocation } from 'wouter';
import { parseISO } from 'date-fns';
import { useInvoicePermissions } from "@/hooks/useInvoicePermissions";
import { useBusinessDate } from "@/hooks/use-business-date";

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

export default function CustomerHistory() {
  const { user } = useAuth();
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
  
  const [filterType, setFilterType] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLDivElement>(null);
  const [wouterLocation] = useLocation();
  const [autoFetched, setAutoFetched] = useState(false);
  const [urlParams, setUrlParams] = useState<{customerId?: string, fromDate?: string, toDate?: string, autoSearch?: string} | null>(null);

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

  // Fetch company details
  const { data: companyDetails, isLoading: isLoadingCompany } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // Fetch user permissions
  const { data: userPermissions } = useQuery<any>({
    queryKey: ['/api/user-backdate-options', user?.id],
    queryFn: () => apiRequest('GET', `/api/user-backdate-options/${user?.id}`),
    enabled: !!user?.id,
  });

  const { canEditInvoice: canEditInvoiceGlobal } = useInvoicePermissions();

  // Check if user can edit an invoice based on date and invoice locking
  const canEditInvoice = (invoiceDate: string) => {
    // First check if invoice locking allows editing
    if (!canEditInvoiceGlobal) return false;
    
    if (!userPermissions) return false;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const invoiceDateFormatted = format(new Date(invoiceDate), 'yyyy-MM-dd');
    
    if (invoiceDateFormatted === today) {
      // For current date entries, check current_editing permission
      return userPermissions.current_editing !== false;
    } else {
      // For back date entries, check editing permission
      return userPermissions.editing === true;
    }
  };

  // Calculate totals from history data
  const totals = useMemo(() => ({
    accountInv: historyData.reduce((sum, row) => sum + (row.accountInv || 0), 0),
    cashInv: historyData.reduce((sum, row) => sum + (row.cashInv || 0), 0),
    paid: historyData.reduce((sum, row) => sum + (row.paid || 0), 0),
    balance: historyData.reduce((sum, row) => sum + (row.balance || 0), 0),
    runningBalance: historyData.length > 0 ? historyData[historyData.length - 1]?.runningBalance || 0 : 0
  }), [historyData]);

  // Handle checkbox selection
  const handleCheckboxChange = (invoiceNo: string, checked: boolean) => {
    const newSelected = new Set(selectedInvoices);
    if (checked) {
      newSelected.add(invoiceNo);
    } else {
      newSelected.delete(invoiceNo);
    }
    setSelectedInvoices(newSelected);
  };

  // Handle select all checkboxes
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allInvoices = historyData.map(row => row.invoiceNo).filter(Boolean);
      setSelectedInvoices(new Set(allInvoices));
    } else {
      setSelectedInvoices(new Set());
    }
  };

  // Print selected invoices
  const handlePrintSelected = () => {
    if (selectedInvoices.size === 0) {
      alert('Please select at least one invoice to print');
      return;
    }
    
    selectedInvoices.forEach((invoiceNo) => {
      window.open(`/print/invoice/${invoiceNo}`, '_blank');
    });
  };

  // Send selected invoices via email
  const handleSendSelected = async () => {
    if (selectedInvoices.size === 0) {
      alert('Please select at least one invoice to send');
      return;
    }
    
    // Get customer email from selected customer
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    if (!selectedCustomerData?.email) {
      alert('Customer email not found. Please ensure the customer has an email address.');
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/send/selected-invoices", {
        customerId: parseInt(selectedCustomer),
        invoiceNumbers: Array.from(selectedInvoices),
        customerEmails: selectedCustomerData.email
      });

      if (response.success) {
        alert('Selected invoices sent successfully!');
        setSelectedInvoices(new Set()); // Clear selection after successful send
      } else {
        alert('Failed to send email: ' + (response.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Please try again.');
    }
  };

  // Send customer history via email
  const handleSendHistory = async () => {
    if (!selectedCustomer || historyData.length === 0) {
      alert('Please select a customer and generate history first');
      return;
    }
    
    // Get customer email from selected customer
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    if (!selectedCustomerData?.email) {
      alert('Customer email not found. Please ensure the customer has an email address.');
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/send/customer-history", {
        customerId: parseInt(selectedCustomer),
        fromDate: format(fromDate, "yyyy-MM-dd"),
        toDate: format(toDate, "yyyy-MM-dd"),
        filterType: filterType
      });

      if (response.success) {
        alert('Customer history email sent successfully!');
      } else {
        alert('Failed to send email: ' + (response.message || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error sending email:', error);
      alert('Failed to send email: ' + (error.message || 'Please try again.'));
    }
  };

  // Send individual invoice via email
  const handleSendInvoice = (invoiceNo: string) => {
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    if (!selectedCustomerData?.email) {
      alert('Customer email not found. Please ensure the customer has an email address.');
      return;
    }

    const subject = encodeURIComponent(`Invoice: ${invoiceNo}`);
    const body = encodeURIComponent(`Please find attached invoice: ${invoiceNo}`);
    const mailtoLink = `mailto:${selectedCustomerData.email}?subject=${subject}&body=${body}`;
    
    window.open(mailtoLink, '_blank');
  };

  // Fetch customers for dropdown
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Parse URL params once
  useEffect(() => {
    const url = new URL(window.location.href);
    const customerId = url.searchParams.get('customerId');
    const fromDate = url.searchParams.get('fromDate');
    const toDate = url.searchParams.get('toDate');
    const autoSearch = url.searchParams.get('autoSearch');
    console.log('[DEBUG] URL params:', { customerId, fromDate, toDate, autoSearch });
    if (customerId && fromDate && toDate && autoSearch === 'true') {
      setUrlParams({ customerId, fromDate, toDate, autoSearch });
    }
  }, [wouterLocation]);

  // Set state from URL params when customers are loaded
  useEffect(() => {
    console.log('[DEBUG] Customers loaded:', customers);
    if (
      !autoFetched &&
      urlParams &&
      customers.length > 0 &&
      customers.some(c => c.id.toString() === urlParams.customerId)
    ) {
      setSelectedCustomer(urlParams.customerId!);
      setFromDate(parseISO(urlParams.fromDate!));
      setToDate(parseISO(urlParams.toDate!));
      setFilterType('All');
      setAutoFetched(true);
      console.log('[DEBUG] Auto-filling state and ready to fetch:', urlParams);
    }
  }, [urlParams, customers, autoFetched]);

  // Trigger fetch when all state is set
  useEffect(() => {
    console.log('[DEBUG] State for fetch:', { autoFetched, selectedCustomer, fromDate, toDate, filterType });
    if (
      autoFetched &&
      selectedCustomer &&
      fromDate &&
      toDate &&
      filterType === 'All'
    ) {
      console.log('[DEBUG] Triggering fetch with:', { selectedCustomer, fromDate, toDate, filterType });
      (async () => {
        setLoading(true);
        try {
          const res = await apiRequest(
            "GET",
            `/api/reports/customer-history?customerId=${selectedCustomer}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&filterType=All`
          );
          setHistoryData(res);
          console.log('[DEBUG] Fetched data:', res);
        } catch (err) {
          console.error('[DEBUG] Fetch error:', err);
        }
        setLoading(false);
      })();
    }
  }, [autoFetched, selectedCustomer, fromDate, toDate, filterType]);



  // Export handlers
  const handlePrint = () => {
    if (!tableRef.current) return;
    
    // Get customer details
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Customer History Statement</title>');
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
      printWindow.document.write('<h2>CUSTOMER HISTORY STATEMENT</h2>');
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
      printWindow.document.write(`<strong>Period:</strong> ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`);
      printWindow.document.write('</div>');
      
      // Add custom table without checkboxes
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Sl.No</th><th>Date</th><th>Invoice #</th><th>Account Inv.</th><th>Cash Inv.</th><th>Paid</th><th>Credit/Adj</th><th>Discount/Adj</th><th>Balance</th><th>Running Balance</th>');
      printWindow.document.write('</tr></thead><tbody>');
      
      historyData.forEach((row: any) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${row.slNo}</td>`);
        printWindow.document.write(`<td>${format(new Date(row.date), "yyyy-MM-dd")}</td>`);
        printWindow.document.write(`<td>${row.invoiceNo}</td>`);
        printWindow.document.write(`<td>£${(row.accountInv || 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${(row.cashInv || 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${(row.paid || 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£0.00</td>`);
        printWindow.document.write(`<td>£0.00</td>`);
        printWindow.document.write(`<td>£${(row.balance || 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${(row.runningBalance || 0).toFixed(2)}</td>`);
        printWindow.document.write('</tr>');
      });
      
      // Add totals row
      printWindow.document.write('<tr class="totals">');
      printWindow.document.write('<td></td><td><strong>TOTAL</strong></td><td></td>');
      printWindow.document.write(`<td><strong>£${totals.accountInv.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td><strong>£${totals.cashInv.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td><strong>£${totals.paid.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td><strong>£0.00</strong></td>`);
      printWindow.document.write(`<td><strong>£0.00</strong></td>`);
      printWindow.document.write(`<td><strong>£${totals.balance.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td><strong>£${totals.runningBalance.toFixed(2)}</strong></td>`);
      printWindow.document.write('</tr>');
      
      printWindow.document.write('</tbody></table>');
      
      // Add footer text
      printWindow.document.write('<div class="footer">stand100</div>');
      
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handlePDF = () => {
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
    const contentWidth = pageWidth - margin;
    
    // Add title
    doc.setFontSize(16);
    doc.text('CUSTOMER HISTORY STATEMENT', pageWidth / 2, margin + 10, { align: 'center' });
    
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
      doc.text(`Name: ${selectedCustomerData.customer_name}`, margin, margin + 45, { maxWidth: contentWidth });
      if (selectedCustomerData.address) {
        doc.text(`Address: ${selectedCustomerData.address}`, margin, margin + 55, { maxWidth: contentWidth });
      }
      if (selectedCustomerData.telephone) {
        doc.text(`Phone: ${selectedCustomerData.telephone}`, 20, 75);
      }
      if (selectedCustomerData.email) {
        doc.text(`Email: ${selectedCustomerData.email}`, 20, 85);
      }
    }
    
    // Add period info
    doc.setFontSize(12);
    doc.text(`Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, margin, margin + 65);
    
    // Prepare table data
    const tableColumn = ['Sl.No', 'Date', 'Invoice #', 'Account Inv.', 'Cash Inv.', 'Paid', 'Balance', 'Running Balance'];
    const tableRows = historyData.map(row => [
      row.slNo || '',
      row.date ? format(new Date(row.date), 'dd/MM/yyyy') : '',
      row.invoiceNo || '',
      parseFloat(row.accountInv || 0).toFixed(2),
      parseFloat(row.cashInv || 0).toFixed(2),
      parseFloat(row.paid || 0).toFixed(2),
      parseFloat(row.balance || 0).toFixed(2),
      parseFloat(row.runningBalance || 0).toFixed(2)
    ]);
    
    // Add totals row
    tableRows.push([
      '',
      'TOTAL',
      '',
      parseFloat(totals.accountInv.toString()).toFixed(2),
      parseFloat(totals.cashInv.toString()).toFixed(2),
      parseFloat(totals.paid.toString()).toFixed(2),
      parseFloat(totals.balance.toString()).toFixed(2),
      parseFloat(totals.runningBalance.toString()).toFixed(2)
    ]);
    
    // Add table to PDF with proper margins
    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: margin + 80,
      margin: { left: margin, right: margin },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: 'linebreak',
        lineWidth: 0.1,
        cellWidth: 'wrap',
        valign: 'middle'
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: 'bold',
        lineWidth: 0.1
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      columnStyles: {
        0: { cellWidth: 13, halign: 'center' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 23, halign: 'right' },
        4: { cellWidth: 23, halign: 'right' },
        5: { cellWidth: 23, halign: 'right' },
        6: { cellWidth: 23, halign: 'right' },
        7: { cellWidth: 30, halign: 'right' }
      },
      tableWidth: 'auto',
      tableLineColor: [0, 0, 0],
      tableLineWidth: 0.1
    });
    
    // Add footer text "stand100" on bottom right with margin
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - margin, pageHeight - margin, { align: 'right' });
    
    // Save the PDF
    const fileName = `customer-history-${selectedCustomerData?.customer_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'customer'}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
    doc.save(fileName);
  };

  const handleExcel = () => {
    if (historyData.length === 0) {
      alert('No data to export. Please generate the report first.');
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
      'Account Inv.', 
      'Cash Inv.', 
      'Paid', 
      'Balance', 
      'Running Balance'
    ];

    // Convert data to array of arrays for better control
    const dataArray = [
      ['CUSTOMER HISTORY STATEMENT'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      [''],
      ['Customer Information:'],
      ['Name:', selectedCustomerData?.customer_name || ''],
      ['Address:', selectedCustomerData?.address || ''],
      ['Phone:', selectedCustomerData?.telephone || ''],
      ['Email:', selectedCustomerData?.email || ''],
      [''],
      ['Period:', `${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`],
      [''],
      header // Add header row
    ];

    // Add data rows
    historyData.forEach((row: any) => {
      dataArray.push([
        row.slNo || '',
        row.date ? format(new Date(row.date), 'dd/MM/yyyy') : '',
        row.invoiceNo || '',
        parseFloat(row.accountInv || 0).toFixed(2),
        parseFloat(row.cashInv || 0).toFixed(2),
        parseFloat(row.paid || 0).toFixed(2),
        parseFloat(row.balance || 0).toFixed(2),
        parseFloat(row.runningBalance || 0).toFixed(2)
      ]);
    });

    // Add totals row
    dataArray.push([
      '',
      'TOTAL',
      '',
      parseFloat(totals.accountInv.toString()).toFixed(2),
      parseFloat(totals.cashInv.toString()).toFixed(2),
      parseFloat(totals.paid.toString()).toFixed(2),
      parseFloat(totals.balance.toString()).toFixed(2),
      parseFloat(totals.runningBalance.toString()).toFixed(2)
    ]);

    // Create worksheet from array data
    const ws = XLSX.utils.aoa_to_sheet(dataArray);
    
    // Set column widths
    const colWidths = [
      { wch: 8 },  // Sl.No
      { wch: 12 }, // Date
      { wch: 15 }, // Invoice #
      { wch: 15 }, // Account Inv.
      { wch: 12 }, // Cash Inv.
      { wch: 12 }, // Paid
      { wch: 12 }, // Balance
      { wch: 15 }  // Running Balance
    ];
    ws['!cols'] = colWidths;
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Customer History');
    
    // Generate the Excel file
    const fileName = `customer-history-${selectedCustomerData?.customer_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'customer'}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tInvoice #\tAccount Inv.\tCash Inv.\tPaid\tBalance\tRunning Balance\n';
    text += historyData.map((row: any) => [
      row.slNo,
      row.date,
      row.invoiceNo,
      row.accountInv,
      row.cashInv,
      row.paid,
      row.balance,
      row.runningBalance
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
    // Optionally show a toast
  };

  return (
    <PageLayout title="Customer History" breadcrumb="Historical Reports > Customer History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <User size={20} />
                Customer History
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
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Account">Account</SelectItem>
                    <SelectItem value="All">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                className="bg-blue-500 hover:bg-blue-600 "
                disabled={!selectedCustomer || loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await apiRequest(
                      "GET",
                      `/api/reports/customer-history?customerId=${selectedCustomer}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&filterType=${encodeURIComponent(filterType)}`
                    );
                    setHistoryData(res);
                  } catch (err) {
                    // handle error, e.g. show toast
                  }
                  setLoading(false);
                }}
              >
                {loading ? "Loading..." : "Search"}
              </Button>

            </div>
          </CardContent>
        </Card>

        {/* Statement Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">STATEMENT</CardTitle>
            <div className="text-left">
              <div className="font-medium">{selectedCustomer},</div>
              <div className="text-sm text-gray-600 mt-1">📧</div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
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
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                  <Printer size={14} />
                  Print
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="flex items-center gap-1"
                  disabled={!selectedCustomer || historyData.length === 0}
                  onClick={handleSendHistory}
                >
                  <Mail size={14} />
                  Email History
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
              <div className="mb-4">
                <div className="font-medium text-sm">BROUGHT FORWARD</div>
                <div className="text-right text-sm">0.00</div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead className="text-center">
                      <input
                        type="checkbox"
                        checked={selectedInvoices.size === historyData.length && historyData.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-4 h-4"
                      />
                    </TableHead>
                    <TableHead className="text-center">Account Inv.</TableHead>
                    <TableHead className="text-center">Cash Inv.</TableHead>
                    <TableHead className="text-center">Paid</TableHead>
                    <TableHead className="text-center">Credit /Adj</TableHead>
                    <TableHead className="text-center">Discount /Adj</TableHead>
                    <TableHead className="text-center">Balance</TableHead>
                    <TableHead className="text-center">Running Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-gray-500 py-8">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyData.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.slNo}</TableCell>
                        <TableCell>{format(new Date(row.date), "yyyy-MM-dd")}</TableCell>
                        <TableCell>
                          {canEditInvoice(row.date) ? (
                            <Button 
                              variant="link" 
                              className="p-0 text-blue-600 underline" 
                              onClick={() => {
                                const url = canEditInvoiceGlobal 
                                  ? `/data-entry/sales-invoice?invoiceNumber=${row.invoiceNo}`
                                  : `/data-entry/sales-invoice?invoiceNumber=${row.invoiceNo}&readonly=true`;
                                window.open(url, '_self');
                              }}
                              title={canEditInvoiceGlobal ? "Edit invoice" : "View invoice (Read-Only)"}
                            >
                              {row.invoiceNo}
                            </Button>
                          ) : (
                            <span 
                              className="text-gray-500 cursor-not-allowed" 
                              title="You don't have permission to edit this invoice"
                            >
                              {row.invoiceNo}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            checked={selectedInvoices.has(row.invoiceNo)}
                            onChange={(e) => handleCheckboxChange(row.invoiceNo, e.target.checked)}
                            className="w-4 h-4"
                          />
                        </TableCell>
                        <TableCell className="text-center">£{(row.accountInv ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{(row.cashInv ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{(row.paid ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£0.00</TableCell>
                        <TableCell className="text-center">£0.00</TableCell>
                        <TableCell className="text-center font-medium">£{(row.balance ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">£{(row.runningBalance ?? 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-cyan-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="flex justify-center gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 w-6 p-0 bg-cyan-500 text-white"
                        onClick={handlePrintSelected}
                        title="Print Selected Invoices"
                      >
                        📄
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 w-6 p-0 bg-cyan-500 text-white"
                        onClick={handleSendSelected}
                        title="Send Selected Invoices"
                      >
                        📧
                      </Button>
                    </TableCell>
                    <TableCell className="text-center font-bold">£{totals.accountInv.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.cashInv.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.paid.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£0.00</TableCell>
                    <TableCell className="text-center font-bold">£0.00</TableCell>
                    <TableCell className="text-center font-bold">£{totals.balance.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.runningBalance.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 0 to 0 of 0 entries</div>
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