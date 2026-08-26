import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useCompanyDetails } from "@/hooks/use-company-details";
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Supplier } from "@shared/schema";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SupplierSearch from "@/components/ui/supplier-search";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, User, FileText, Download, Copy, Printer, Search, Mail } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useLocation } from 'wouter';
import { parseISO, subDays } from 'date-fns';
import { copyToClipboard } from "@/lib/export-utils";

interface StatementData {
  id: number;
  slNo: number;
  date: string;
  invoiceNo: string | number | null;
  description: string;
  purchaseInv: number;
  paid: number;
  creditAdj: number;
  discountAdj: number;
  balance: number;
  runningBalance: number;
}

export default function SupplierHistory() {
  const { toast } = useToast();
  const [selectedSupplier, setSelectedSupplier] = useState<number | null>(null);
  
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
  const [statementType, setStatementType] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [statementData, setStatementData] = useState<StatementData[]>([]);
  const [loading, setLoading] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string | number | null>>(new Set());
  const [wouterLocation] = useLocation();
  const [autoFetched, setAutoFetched] = useState(false);
  const [urlParams, setUrlParams] = useState<{supplierId?: string, fromDate?: string, toDate?: string, autoSearch?: string} | null>(null);

  // Fetch suppliers for dropdown
  const { data: suppliers = [], isLoading: isLoadingSuppliers, error: suppliersError } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Fetch company details
  const { companyDetails, isLoadingCompany } = useCompanyDetails();

  // Parse URL params once
  useEffect(() => {
    const url = new URL(window.location.href);
    const supplierId = url.searchParams.get('supplierId');
    const fromDate = url.searchParams.get('fromDate');
    const toDate = url.searchParams.get('toDate');
    const autoSearch = url.searchParams.get('autoSearch');
    if (supplierId && fromDate && toDate && autoSearch === 'true') {
      setUrlParams({ supplierId, fromDate, toDate, autoSearch });
    }
  }, [wouterLocation]);

  // Set state from URL params when suppliers are loaded
  useEffect(() => {
    if (
      !autoFetched &&
      urlParams &&
      suppliers.length > 0 &&
      suppliers.some(s => s.id === parseInt(urlParams.supplierId!))
    ) {
      setSelectedSupplier(parseInt(urlParams.supplierId!));
      setFromDate(parseISO(urlParams.fromDate!));
      setToDate(parseISO(urlParams.toDate!));
      setStatementType('All');
      setAutoFetched(true);
    }
  }, [urlParams, suppliers, autoFetched]);

  // Trigger fetch when all state is set
  useEffect(() => {
    if (
      autoFetched &&
      selectedSupplier &&
      fromDate &&
      toDate &&
      statementType === 'All'
    ) {
      (async () => {
        setLoading(true);
        try {
          const res = await apiRequest(
            "GET",
            `/api/reports/supplier-statement?supplierId=${selectedSupplier!}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&type=All`
          );
          setStatementData(res);
        } catch (err) {
          // handle error
        }
        setLoading(false);
      })();
    }
  }, [autoFetched, selectedSupplier, fromDate, toDate, statementType]);

  // Update dates when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate && !autoFetched) {
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
  }, [businessDate, isLoadingBusinessDate, autoFetched]);

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

  // Calculate totals
  const totals = useMemo(() => ({
    purchaseInv: statementData.reduce((sum, row) => sum + (row.purchaseInv || 0), 0),
    paid: statementData.reduce((sum, row) => sum + (row.paid || 0), 0),
    creditAdj: statementData.reduce((sum, row) => sum + (row.creditAdj || 0), 0),
    discountAdj: statementData.reduce((sum, row) => sum + (row.discountAdj || 0), 0),
    balance: statementData.reduce((sum, row) => sum + (row.balance || 0), 0),
    runningBalance: statementData.length > 0 ? statementData[statementData.length - 1]?.runningBalance || 0 : 0
  }), [statementData]);

  // Handle checkbox selection
  const handleCheckboxChange = (invoiceNo: string | number | null, checked: boolean) => {
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
      const allInvoices = statementData.map(row => row.invoiceNo).filter(Boolean);
      setSelectedInvoices(new Set(allInvoices));
    } else {
      setSelectedInvoices(new Set());
    }
  };

  // Print individual invoice
  const handlePrintInvoice = (invoiceNo: string | number | null) => {
    if (invoiceNo) {
      window.open(`/print/purchase-invoice/${invoiceNo}`, '_blank');
    }
  };

  // Send individual invoice via email
  const handleSendInvoice = async (invoiceNo: string | number | null) => {
    if (!invoiceNo) return;
    const row = statementData.find(r => r.invoiceNo === invoiceNo);
    if (!row) return;
    const supplier = suppliers.find(s => s.id === selectedSupplier);
    if (!supplier?.email) {
      toast({
        title: "Error",
        description: "Supplier email not found. Please ensure the supplier has an email address.",
        variant: "destructive"
      });
      return;
    }
    try {
      const response = await apiRequest("POST", `/api/purchase-invoices/${invoiceNo}/send`, {
        supplierId: supplier.id
      });
      if (response.success) {
        toast({
          title: "Success",
          description: "Purchase invoice email sent successfully!",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to send email: " + response.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send email. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Export handlers
  const handlePrint = () => {
    // Get supplier details
    const selectedSupplierData = suppliers.find(s => s.id === selectedSupplier);
    
    // Create a print window
    const printWindow = window.open('', '', 'height=600,width=900');
    if (!printWindow) return;
    
    // Create the print content
    let printContent = `
      <html>
        <head>
          <title>Supplier Statement</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 20px; }
            .company-info { text-align: center; margin-bottom: 10px; font-size: 14px; }
            .supplier-info { margin-bottom: 15px; }
            .period-info { margin-bottom: 15px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f8f9fa; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .footer { position: fixed; bottom: 10px; right: 10px; font-size: 8px; color: #666; }
            @media print {
              .no-print { display: none; }
              body { margin: 0; padding: 10px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>SUPPLIER STATEMENT</h2>
            ${companyDetails ? `<div class="company-info">${companyDetails.companyName}, ${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}</div>` : ''}
          </div>
          
          <div class="supplier-info">
            <strong>Supplier:</strong> ${selectedSupplierData?.supplier_name || ''}<br>
            ${selectedSupplierData?.address ? `<strong>Address:</strong> ${selectedSupplierData.address}<br>` : ''}
            ${selectedSupplierData?.telephone ? `<strong>Phone:</strong> ${selectedSupplierData.telephone}<br>` : ''}
            ${selectedSupplierData?.email ? `<strong>Email:</strong> ${selectedSupplierData.email}` : ''}
          </div>
          
          <div class="period-info">
            <strong>Period:</strong> ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Sl.No</th>
                <th>Date</th>
                <th>Invoice #</th>
                <th>Description</th>
                <th class="text-right">Purchase Inv.</th>
                <th class="text-right">Paid</th>
                <th class="text-right">Credit Adj.</th>
                <th class="text-right">Discount Adj.</th>
                <th class="text-right">Balance</th>
                <th class="text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              ${statementData.map(row => `
                <tr>
                  <td>${row.slNo || ''}</td>
                  <td>${row.date ? format(new Date(row.date), 'dd/MM/yyyy') : ''}</td>
                  <td>${row.invoiceNo || ''}</td>
                  <td>${row.description || ''}</td>
                  <td class="text-right">£${(row.purchaseInv || 0).toFixed(2)}</td>
                  <td class="text-right">£${(row.paid || 0).toFixed(2)}</td>
                  <td class="text-right">£${(row.creditAdj || 0).toFixed(2)}</td>
                  <td class="text-right">£${(row.discountAdj || 0).toFixed(2)}</td>
                  <td class="text-right">£${(row.balance || 0).toFixed(2)}</td>
                  <td class="text-right">£${(row.runningBalance || 0).toFixed(2)}</td>
                </tr>
              `).join('')}
              
              <!-- Totals Row -->
              <tr style="font-weight: bold; background-color: #f8f9fa;">
                <td colspan="4" class="text-right">TOTAL</td>
                <td class="text-right">£${totals.purchaseInv.toFixed(2)}</td>
                <td class="text-right">£${totals.paid.toFixed(2)}</td>
                <td class="text-right">£${totals.creditAdj.toFixed(2)}</td>
                <td class="text-right">£${totals.discountAdj.toFixed(2)}</td>
                <td class="text-right">£${totals.balance.toFixed(2)}</td>
                <td class="text-right">£${(statementData[statementData.length - 1]?.runningBalance || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="footer">stand100</div>
          
          <script>
            // Auto-print and close after loading
            window.onload = function() {
              setTimeout(function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              }, 500);
            };
          </script>
        </body>
      </html>
    `;
    
    // Write the content and open print dialog
    printWindow.document.open();
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const handleExcel = () => {
    // Get supplier details
    const selectedSupplierData = suppliers.find(s => s.id === selectedSupplier);
    
    // Create a new workbook
    const wb = XLSX.utils.book_new();
    
    // Prepare the data for the main sheet
    const header = [
      'Sl.No', 
      'Date', 
      'Invoice #', 
      'Description', 
      'Purchase Inv.', 
      'Paid', 
      'Credit Adj.', 
      'Discount Adj.', 
      'Balance', 
      'Running Balance'
    ];

    // Convert data to array of arrays for better control
    const dataArray: Array<Array<string | number>> = [
      ['SUPPLIER STATEMENT'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      ['']
    ];
    
    // Add contact info if available
    const contactInfo = [];
    if (companyDetails?.telephone) contactInfo.push(`Tel: ${companyDetails.telephone}`);
    if (companyDetails?.email) contactInfo.push(`Email: ${companyDetails.email}`);
    if (contactInfo.length > 0) dataArray.push([contactInfo.join(' | ')], ['']);
    
    // Add supplier information
    dataArray.push(
      ['Supplier Information:'],
      ['Name:', selectedSupplierData?.supplier_name || ''],
      ['Address:', selectedSupplierData?.address || ''],
      ['Phone:', selectedSupplierData?.telephone || ''],
      ['Email:', selectedSupplierData?.email || ''],
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
        Number(row.purchaseInv || 0).toFixed(2),
        Number(row.paid || 0).toFixed(2),
        Number(row.creditAdj || 0).toFixed(2),
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
      Number(totals.purchaseInv.toString()).toFixed(2),
      Number(totals.paid.toString()).toFixed(2),
      Number(totals.creditAdj.toString()).toFixed(2),
      Number(totals.discountAdj.toString()).toFixed(2),
      Number(totals.balance.toString()).toFixed(2),
      statementData.length > 0 ? Number(statementData[statementData.length - 1].runningBalance || 0).toFixed(2) : '0.00'
    ]);

    // Create worksheet from array data
    const ws = XLSX.utils.aoa_to_sheet(dataArray);
    
    // Set column widths
    const colWidths = [
      { wch: 8 },   // Sl.No
      { wch: 12 },  // Date
      { wch: 15 },  // Invoice #
      { wch: 40 },  // Description
      { wch: 15 },  // Purchase Inv.
      { wch: 12 },  // Paid
      { wch: 12 },  // Credit Adj.
      { wch: 12 },  // Discount Adj.
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
        
        // Right align numeric columns (indices 4-9)
        if (C >= 4 && C <= 9) {
          ws[cellAddress].s.alignment = ws[cellAddress].s.alignment || {};
          ws[cellAddress].s.alignment.horizontal = 'right';
        }
      }
    }
    
    // Style the title
    ws['A1'].s = { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } };
    
    // Merge title cells
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
    
    // Set column widths
    ws['!cols'] = colWidths;
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier Statement');
    
    // Generate filename with supplier name and date
    const supplierName = selectedSupplierData?.supplier_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'supplier';
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    
    // Save the workbook
    XLSX.writeFile(wb, `supplier-statement-${supplierName}-${dateStr}.xlsx`);
  };

  const handlePDF = () => {
    // Get supplier details
    const selectedSupplierData = suppliers.find(s => s.id === selectedSupplier);
    
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text('SUPPLIER STATEMENT', 105, 20, { align: 'center' });
    
    // Add company info
    doc.setFontSize(10);
    if (companyDetails) {
      doc.text(`${companyDetails.companyName}, ${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    }
    
    // Add supplier info
    doc.setFontSize(12);
    doc.text('Supplier Information:', 20, 45);
    doc.setFontSize(10);
    if (selectedSupplierData) {
      doc.text(`Name: ${selectedSupplierData.supplier_name}`, 20, 55);
      if (selectedSupplierData.address) {
        doc.text(`Address: ${selectedSupplierData.address}`, 20, 65);
      }
      if (selectedSupplierData.telephone) {
        doc.text(`Phone: ${selectedSupplierData.telephone}`, 20, 75);
      }
      if (selectedSupplierData.email) {
        doc.text(`Email: ${selectedSupplierData.email}`, 20, 85);
      }
    }
    
    // Add period info
    doc.setFontSize(12);
    doc.text(`Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, 20, 100);
    
    // Add table
    autoTable(doc, {
      head: [[
        'Sl.No', 'Date', 'Invoice #', 'Description', 'Purchase Inv.', 'Paid', 'Credit Adj.', 'Discount Adj.', 'Balance', 'Running Balance'
      ]],
      body: statementData.map((row: any) => [
        row.slNo,
        row.date,
        row.invoiceNo,
        row.description,
        row.purchaseInv,
        row.paid,
        row.creditAdj,
        row.discountAdj,
        row.balance,
        row.runningBalance
      ]),
      startY: 110,
    });
    
    // Add footer text "stand100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10, { align: 'right' });
    
    doc.save('supplier-statement.pdf');
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tInvoice #\tDescription\tPurchase Inv.\tPaid\tCredit Adj.\tDiscount Adj.\tBalance\tRunning Balance\n';
    text += statementData.map((row: any) => [
      row.slNo,
      row.date,
      row.invoiceNo,
      row.description,
      row.purchaseInv,
      row.paid,
      row.creditAdj,
      row.discountAdj,
      row.balance,
      row.runningBalance
    ].join('\t')).join('\n');
    
    copyToClipboard(text, { toast });
  };

  const handleEmail = async () => {
    if (!selectedSupplier) {
      toast({
        title: "Error",
        description: "Please select a supplier first",
        variant: "destructive"
      });
      return;
    }

    const selectedSupplierData = suppliers.find(s => s.id === selectedSupplier);
    if (!selectedSupplierData?.email) {
      toast({
        title: "Error",
        description: "Supplier email not found. Please ensure the supplier has an email address.",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/send/supplier-statement", {
        supplierId: selectedSupplier!,
        fromDate: fromDate.toISOString().split('T')[0],
        toDate: toDate.toISOString().split('T')[0],
        type: statementType
      });

      if (response.success) {
        toast({
          title: "Success",
          description: "Supplier statement email sent successfully!",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to send email: " + response.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Error",
        description: "Failed to send email. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <PageLayout title="Supplier History" breadcrumb="Historical Reports > Supplier History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <User size={20} />
                Supplier History
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Date fields and dropdowns in one row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <DateRangeFilter
                from={fromDate}
                to={toDate}
                onFromChange={handleFromDateChange}
                onToChange={handleToDateChange}
                fromLabel="From:"
                toLabel="To:"
                dateFormat="yyyyMMdd"
                fromManuallyChanged={fromDateManuallyChanged}
                toManuallyChanged={toDateManuallyChanged}
              />
                <div>
                  <SupplierSearch
                    onSupplierSelect={(supplier) => setSelectedSupplier(supplier?.id ?? null)}
                    placeholder="Select supplier"
                    allowClear={false}
                  />
                </div>
                <div>
                  <Label>Type:</Label>
                  <Select value={statementType} onValueChange={setStatementType}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All</SelectItem>
                      <SelectItem value="Paid Only">Paid</SelectItem>
                      <SelectItem value="Outstanding Only">Outstanding</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Buttons below the row */}
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-blue-500 hover:bg-blue-600"
                  disabled={!selectedSupplier || loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await apiRequest(
                        "GET",
                        `/api/reports/supplier-statement?supplierId=${selectedSupplier!}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&type=${encodeURIComponent(statementType)}`
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
            </div>
          </CardContent>
        </Card>

        {/* Statement Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">SUPPLIER STATEMENT</CardTitle>
            <div className="text-left">
              <div className="font-medium">
                {suppliers.find(s => s.id === selectedSupplier)?.supplier_name || ""},
              </div>
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
                  disabled={!selectedSupplier || statementData.length === 0}
                  onClick={handleEmail}
                >
                  <Mail size={14} />
                  Email
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
                  <TableRow className="bg-indigo-50">
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead className="text-center">
                      <input
                        type="checkbox"
                        checked={selectedInvoices.size === statementData.length && statementData.length > 0}
                        onChange={e => handleSelectAll(e.target.checked)}
                        className="w-4 h-4"
                      />
                    </TableHead>
                    <TableHead className="text-center">📊</TableHead>
                    <TableHead className="text-center">Purchase Inv.</TableHead>
                    <TableHead className="text-center">Paid</TableHead>
                    <TableHead className="text-center">Credit /Adj</TableHead>
                    <TableHead className="text-center">Discount /Adj</TableHead>
                    <TableHead className="text-center">Balance</TableHead>
                    <TableHead className="text-center">Running Balance</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statementData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-gray-500 py-8">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    statementData
                      .filter(row => {
                        if (!searchTerm) return true;
                        const term = searchTerm.toLowerCase();
                        return (
                          (row.invoiceNo?.toString() || "").toLowerCase().includes(term) ||
                          (row.description || "").toLowerCase().includes(term)
                        );
                      })
                      .map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.slNo}</TableCell>
                          <TableCell>{row.date}</TableCell>
                          <TableCell>{row.invoiceNo}</TableCell>
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              checked={selectedInvoices.has(row.invoiceNo)}
                              onChange={e => handleCheckboxChange(row.invoiceNo, e.target.checked)}
                              className="w-4 h-4"
                            />
                          </TableCell>
                          <TableCell className="text-center">{row.description}</TableCell>
                          <TableCell className="text-center">£ {row.purchaseInv.toFixed(2)}</TableCell>
                          <TableCell className="text-center">£ {row.paid.toFixed(2)}</TableCell>
                          <TableCell className="text-center">£ {row.creditAdj.toFixed(2)}</TableCell>
                          <TableCell className="text-center">£ {row.discountAdj.toFixed(2)}</TableCell>
                          <TableCell className="text-center">£ {row.balance.toFixed(2)}</TableCell>
                          <TableCell className="text-center">£ {row.runningBalance.toFixed(2)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center gap-2">
                              <Button size="icon" variant="outline" className="h-6 w-6 p-0" onClick={() => handlePrintInvoice(row.invoiceNo)} title="Print Invoice">
                                <Printer size={14} />
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 w-6 p-0 bg-cyan-500 text-white" onClick={() => handleSendInvoice(row.invoiceNo)} title="Send Invoice">
                                <Mail size={14} />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-indigo-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center font-bold">£ {totals.purchaseInv.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£ {totals.paid.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£ {totals.creditAdj.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£ {totals.discountAdj.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£ {totals.balance.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold"></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
                <div>
                  Showing {statementData.length > 0 ? 1 : 0} to {statementData.length} of {statementData.length} entries
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">Previous</Button>
                    <Button variant="outline" size="sm" className="bg-blue-500 text-white">1</Button>
                    <Button variant="outline" size="sm">Next</Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}