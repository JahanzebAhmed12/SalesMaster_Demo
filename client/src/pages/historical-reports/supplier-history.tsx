import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Supplier } from "@shared/schema";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useLocation } from 'wouter';
import { parseISO, subDays } from 'date-fns';

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

export default function SupplierHistory() {
  const { toast } = useToast();
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
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
  const { data: companyDetails, isLoading: isLoadingCompany } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

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
      suppliers.some(s => s.id.toString() === urlParams.supplierId)
    ) {
      setSelectedSupplier(urlParams.supplierId!);
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
            `/api/reports/supplier-statement?supplierId=${selectedSupplier}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&type=All`
          );
          setStatementData(res);
        } catch (err) {
          // handle error
        }
        setLoading(false);
      })();
    }
  }, [autoFetched, selectedSupplier, fromDate, toDate, statementType]);

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
    const supplier = suppliers.find(s => s.id.toString() === selectedSupplier);
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
    if (!tableRef.current) return;
    
    // Get supplier details
    const selectedSupplierData = suppliers.find(s => s.id.toString() === selectedSupplier);
    
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Supplier Statement</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.company-info{text-align:center;margin-bottom:10px;font-size:14px;}');
      printWindow.document.write('.supplier-info{margin-bottom:15px;}');
      printWindow.document.write('.period-info{margin-bottom:15px;font-weight:bold;}');
      printWindow.document.write('.totals{font-weight:bold;background-color:#f9f9f9;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      
      // Add company header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>SUPPLIER STATEMENT</h2>');
      if (companyDetails) {
        printWindow.document.write(`<div class="company-info">${companyDetails.companyName}, ${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}</div>`);
      }
      printWindow.document.write('</div>');
      
      // Add supplier information
      if (selectedSupplierData) {
        printWindow.document.write('<div class="supplier-info">');
        printWindow.document.write(`<strong>Supplier:</strong> ${selectedSupplierData.supplier_name}<br>`);
        if (selectedSupplierData.address) {
          printWindow.document.write(`<strong>Address:</strong> ${selectedSupplierData.address}<br>`);
        }
        if (selectedSupplierData.telephone) {
          printWindow.document.write(`<strong>Phone:</strong> ${selectedSupplierData.telephone}<br>`);
        }
        if (selectedSupplierData.email) {
          printWindow.document.write(`<strong>Email:</strong> ${selectedSupplierData.email}`);
        }
        printWindow.document.write('</div>');
      }
      
      // Add period information
      printWindow.document.write('<div class="period-info">');
      printWindow.document.write(`<strong>Period:</strong> ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`);
      printWindow.document.write('</div>');
      
      // Add the table content
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    // Get supplier details
    const selectedSupplierData = suppliers.find(s => s.id.toString() === selectedSupplier);
    
    // Create workbook with multiple sheets
    const wb = XLSX.utils.book_new();
    
    // Add supplier info sheet
    const supplierInfo = [
      ['SUPPLIER STATEMENT'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      [''],
      ['Supplier Information:'],
      ['Name:', selectedSupplierData?.supplier_name || ''],
      ['Address:', selectedSupplierData?.address || ''],
      ['Phone:', selectedSupplierData?.telephone || ''],
      ['Email:', selectedSupplierData?.email || ''],
      [''],
      ['Period:', `${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`],
      [''],
    ];
    
    const wsInfo = XLSX.utils.aoa_to_sheet(supplierInfo);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Supplier Info');
    
    // Add data sheet
    const ws = XLSX.utils.json_to_sheet(statementData.map((row: any) => ({
      'Sl.No': row.slNo,
      'Date': row.date,
      'Invoice #': row.invoiceNo,
      'Description': row.description,
      'Purchase Inv.': row.purchaseInv,
      'Paid': row.paid,
      'Credit Adj.': row.creditAdj,
      'Discount Adj.': row.discountAdj,
      'Balance': row.balance,
      'Running Balance': row.runningBalance
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier Statement');
    
    XLSX.writeFile(wb, 'supplier-statement.xlsx');
  };

  const handlePDF = () => {
    // Get supplier details
    const selectedSupplierData = suppliers.find(s => s.id.toString() === selectedSupplier);
    
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
    
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Success",
        description: "Data copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy data to clipboard",
        variant: "destructive"
      });
    }
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

    const selectedSupplierData = suppliers.find(s => s.id.toString() === selectedSupplier);
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
        supplierId: parseInt(selectedSupplier),
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
                        {fromDate ? format(fromDate, "yyyyMMdd") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={fromDate}
                        onSelect={(date) => date && setFromDate(date)}
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
                        {toDate ? format(toDate, "yyyyMMdd") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={toDate}
                        onSelect={(date) => date && setToDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>Supplier:</Label>
                  <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingSuppliers ? (
                        <SelectItem value="loading" disabled>Loading...</SelectItem>
                      ) : suppliersError ? (
                        <SelectItem value="error" disabled>Error loading suppliers</SelectItem>
                      ) : (
                        suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id.toString()}>
                            {supplier.supplier_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
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
                        `/api/reports/supplier-statement?supplierId=${selectedSupplier}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&type=${encodeURIComponent(statementType)}`
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
                {suppliers.find(s => s.id.toString() === selectedSupplier)?.supplier_name || ""},
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
                              <Button size="sm" variant="outline" className="h-6 w-6 p-0 bg-cyan-500 text-white" onClick={() => handlePrintInvoice(row.invoiceNo)} title="Print Invoice">
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