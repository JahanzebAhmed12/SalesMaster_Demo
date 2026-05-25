import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { RegularProduct, NonProduct, Customer, Supplier } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Download, Mail, Copy, Printer } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn, formatQuantity } from "@/lib/utils";
import { useBusinessDate } from "@/hooks/use-business-date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ProductsAPI = { regularProducts: RegularProduct[]; nonProducts: NonProduct[] };
type ProductHistoryAPI = {
  purchases: any[];
  supplierReturns: any[];
  sales: any[];
  customerReturns: any[];
  dumps: any[];
};

function toLocalDateString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toEndOfDayDateString(date: Date) {
  // Add one day to make the end date inclusive
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${nextDay.getFullYear()}-${pad(nextDay.getMonth() + 1)}-${pad(nextDay.getDate())}`;
}

export default function ProductHistory() {
  const [productLike, setProductLike] = useState("");
  const [productId, setProductId] = useState<string | undefined>(undefined);
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  
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
  const [searchClicked, setSearchClicked] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Fetch all products
  const { data: productsData = { regularProducts: [], nonProducts: [] }, isLoading: loadingProducts, error: productsError } = useQuery<ProductsAPI>({
    queryKey: ["products"],
    queryFn: () => apiRequest("GET", "/api/products"),
  });
  // Fetch all customers
  const { data: customersData = [], isLoading: loadingCustomers, error: customersError } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });
  // Fetch all suppliers
  const { data: suppliersData = [], isLoading: loadingSuppliers, error: suppliersError } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Prepare product options
  const allProducts: (RegularProduct | NonProduct)[] = [
    ...(productsData.regularProducts || []),
    ...(productsData.nonProducts || [])
  ];

  // Prepare customer options
  const allCustomers: Customer[] = customersData;
  // Prepare supplier options
  const allSuppliers: Supplier[] = suppliersData;

  // Fetch product history only when Search is clicked
  const {
    data: historyData = { purchases: [], supplierReturns: [], sales: [], customerReturns: [], dumps: [] },
    isLoading: loadingHistory,
    error: historyError
  } = useQuery<ProductHistoryAPI>({
    queryKey: [
      "product-history",
      productId,
      productLike,
      fromDate?.toISOString().slice(0, 10),
      toDate?.toISOString().slice(0, 10),
      customerId,
      supplierId,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return { purchases: [], supplierReturns: [], sales: [], customerReturns: [], dumps: [] };
      const params = new URLSearchParams();
      if (productId && productId !== "All") params.append("productId", productId);
      if (productLike) params.append("productLike", productLike);
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toEndOfDayDateString(toDate));
      if (customerId && customerId !== "All") params.append("customerId", customerId);
      if (supplierId && supplierId !== "All") params.append("supplierId", supplierId);
      return apiRequest("GET", `/api/reports/product-history?${params.toString()}`);
    },
    enabled: !!searchClicked,
  });

  // Update dates when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      try {
        // Only update fromDate if it hasn't been manually changed (set to one week before business date)
        if (!fromDateManuallyChanged.current) {
          const oneWeekBefore = subWeeks(businessDate, 1);
          if (!fromDate || fromDate.getTime() !== oneWeekBefore.getTime()) {
            setFromDate(oneWeekBefore);
          }
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

  // Table data
  const purchases = historyData.purchases;
  const supplierReturns = historyData.supplierReturns;
  const sales = historyData.sales;
  const customerReturns = historyData.customerReturns;
  const dumps = historyData.dumps;

  // Loading states
  const loading = loadingProducts || loadingCustomers || loadingSuppliers || loadingHistory;

  // Clean Export Functions - All Tables Included
  const handleExcel = () => {
    if (!searchClicked || loading) return;

    const wb = XLSX.utils.book_new();
    
    // Create comprehensive Excel with all data
    const allData = [
      // Header information
      ['PRODUCT HISTORY REPORT'],
      ['TROPIFRUIT UK LTD'],
      ['3 Dolphin Way, Purfleet, RM19 1NZ'],
      [''],
      [`Report Period: ${fromDate ? format(fromDate, 'dd/MM/yyyy') : 'All'} to ${toDate ? format(toDate, 'dd/MM/yyyy') : 'All'}`],
      [`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
      [''],
      
      // From Supplier Section
      ['FROM SUPPLIER'],
      ['Sl.No', 'Date', 'Supplier Name', 'Product', 'Quantity', 'Unit Price', 'Total'],
      ...purchases.map((row: any, idx: number) => [
        idx + 1, row.date, row.supplierName, row.product, formatQuantity(row.quantity), row.unitPrice, row.total
      ]),
      [''],
      
      // Supplier Returns Section
      ['SUPPLIER RETURNS'],
      ['Sl.No', 'Date', 'Invoice#', 'Supplier Name', 'Product', 'Quantity', 'Unit Price', 'Total'],
      ...supplierReturns.map((row: any, idx: number) => [
        idx + 1, row.date, row.invoice, row.supplierName, row.product, formatQuantity(row.quantity), row.unitPrice, row.total
      ]),
      [''],
      
      // Sales Section
      ['SALES'],
      ['Sl.No', 'Date', 'Invoice No', 'Customer Name', 'Product', 'Quantity', 'Unit Price', 'Total'],
      ...sales.map((row: any, idx: number) => [
        idx + 1, row.date, row.invoiceNo, row.customerName, row.product, formatQuantity(row.quantity), row.unitPrice, row.total
      ]),
      [''],
      
      // Customer Returns Section
      ['CUSTOMER RETURNS'],
      ['Sl.No', 'Date', 'Invoice#', 'Customer Name', 'Product', 'Quantity', 'Unit Price', 'Total'],
      ...customerReturns.map((row: any, idx: number) => [
        idx + 1, row.date, row.invoice, row.customerName, row.product, formatQuantity(row.quantity), row.unitPrice, row.total
      ]),
      [''],
      
      // Dumps Section
      ['DUMPS'],
      ['Sl.No', 'Date', 'Product', 'Total Qty'],
      ...dumps.map((row: any, idx: number) => [
        idx + 1, row.date, row.product, row.totalQty
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(allData);
    XLSX.utils.book_append_sheet(wb, ws, 'Product History');
    
    const filename = `Product_History_${fromDate ? format(fromDate, 'yyyy-MM-dd') : 'All'}_to_${toDate ? format(toDate, 'yyyy-MM-dd') : 'All'}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const handlePDF = () => {
    if (!searchClicked || loading) return;
    
    const doc = new jsPDF('landscape');
    
    // Add header
    doc.setFontSize(16);
    doc.text('PRODUCT HISTORY REPORT', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text('TROPIFRUIT UK LTD', doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
    doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', doc.internal.pageSize.getWidth() / 2, 40, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Report Period: ${fromDate ? format(fromDate, 'dd/MM/yyyy') : 'All'} to ${toDate ? format(toDate, 'dd/MM/yyyy') : 'All'}`, 20, 55);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, 65);
    
    let yPosition = 75;
    
    // Add all tables
    const tables = [
      { title: 'FROM SUPPLIER', data: purchases, headers: ['Sl.No', 'Date', 'Supplier', 'Product', 'Qty', 'Unit Price', 'Total'] },
      { title: 'SUPPLIER RETURNS', data: supplierReturns, headers: ['Sl.No', 'Date', 'Invoice#', 'Supplier', 'Product', 'Qty', 'Unit Price', 'Total'] },
      { title: 'SALES', data: sales, headers: ['Sl.No', 'Date', 'Invoice', 'Customer', 'Product', 'Qty', 'Unit Price', 'Total'] },
      { title: 'CUSTOMER RETURNS', data: customerReturns, headers: ['Sl.No', 'Date', 'Invoice#', 'Customer', 'Product', 'Qty', 'Unit Price', 'Total'] },
      { title: 'DUMPS', data: dumps, headers: ['Sl.No', 'Date', 'Product', 'Total Qty'] }
    ];
    
    tables.forEach((table, index) => {
      if (table.data.length > 0) {
        // Add section title
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(table.title, 20, yPosition);
        yPosition += 10;
        
        // Prepare table data
        const tableData = table.data.map((row: any, idx: number) => {
          if (table.title === 'DUMPS') {
            return [idx + 1, row.date, row.product, row.totalQty];
          } else if (table.title === 'FROM SUPPLIER') {
            return [idx + 1, row.date, row.supplierName, row.product, formatQuantity(row.quantity), row.unitPrice, row.total];
          } else if (table.title === 'SUPPLIER RETURNS') {
            return [idx + 1, row.date, row.invoice, row.supplierName, row.product, formatQuantity(row.quantity), row.unitPrice, row.total];
          } else if (table.title === 'SALES') {
            return [idx + 1, row.date, row.invoiceNo, row.customerName, row.product, formatQuantity(row.quantity), row.unitPrice, row.total];
          } else { // Customer Returns
            return [idx + 1, row.date, row.invoice, row.customerName, row.product, formatQuantity(row.quantity), row.unitPrice, row.total];
          }
        });
        
        autoTable(doc, {
          head: [table.headers],
          body: tableData,
          startY: yPosition,
          styles: {
            fontSize: 9,
            cellPadding: 2
          },
          headStyles: {
            fillColor: [66, 139, 202],
            textColor: 255,
            fontStyle: 'bold'
          },
          columnStyles: table.title === 'DUMPS' ? {
            0: { cellWidth: 20, halign: 'center' },
            1: { cellWidth: 30, halign: 'center' },
            2: { cellWidth: 80, halign: 'left' },
            3: { cellWidth: 25, halign: 'center' }
          } : {
            0: { cellWidth: 15, halign: 'center' },
            1: { cellWidth: 25, halign: 'center' },
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 60, halign: 'left' },
            4: { cellWidth: 60, halign: 'left' },
            5: { cellWidth: 20, halign: 'center' },
            6: { cellWidth: 25, halign: 'right' },
            7: { cellWidth: 25, halign: 'right' }
          },
          margin: { left: 20, right: 20 }
        });
        
        yPosition = (doc as any).lastAutoTable.finalY + 15;
        
        // Add page break if needed
        if (yPosition > doc.internal.pageSize.getHeight() - 50 && index < tables.length - 1) {
          doc.addPage();
          yPosition = 20;
        }
      }
    });
    
    // Add footer
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10);
    
    doc.save(`Product_History_${fromDate ? format(fromDate, 'yyyy-MM-dd') : 'All'}_to_${toDate ? format(toDate, 'yyyy-MM-dd') : 'All'}.pdf`);
  };

  const handleCopy = async () => {
    if (!searchClicked || loading) return;
    
    let text = 'PRODUCT HISTORY REPORT\n';
    text += 'TROPIFRUIT UK LTD\n';
    text += '3 Dolphin Way, Purfleet, RM19 1NZ\n\n';
    text += `Report Period: ${fromDate ? format(fromDate, 'dd/MM/yyyy') : 'All'} to ${toDate ? format(toDate, 'dd/MM/yyyy') : 'All'}\n`;
    text += `Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}\n\n`;
    
    // Add all sections
    if (purchases.length > 0) {
      text += 'FROM SUPPLIER\n';
      text += 'Sl.No\tDate\tSupplier\tProduct\tQty\tUnit Price\tTotal\n';
      purchases.forEach((row: any, idx: number) => {
        text += `${idx + 1}\t${row.date}\t${row.supplierName}\t${row.product}\t${formatQuantity(row.quantity)}\t${row.unitPrice}\t${row.total}\n`;
      });
      text += '\n';
    }
    
    if (supplierReturns.length > 0) {
      text += 'SUPPLIER RETURNS\n';
      text += 'Sl.No\tDate\tInvoice#\tSupplier\tProduct\tQty\tUnit Price\tTotal\n';
      supplierReturns.forEach((row: any, idx: number) => {
        text += `${idx + 1}\t${row.date}\t${row.invoice}\t${row.supplierName}\t${row.product}\t${formatQuantity(row.quantity)}\t${row.unitPrice}\t${row.total}\n`;
      });
      text += '\n';
    }
    
    if (sales.length > 0) {
      text += 'SALES\n';
      text += 'Sl.No\tDate\tInvoice\tCustomer\tProduct\tQty\tUnit Price\tTotal\n';
      sales.forEach((row: any, idx: number) => {
        text += `${idx + 1}\t${row.date}\t${row.invoiceNo}\t${row.customerName}\t${row.product}\t${formatQuantity(row.quantity)}\t${row.unitPrice}\t${row.total}\n`;
      });
      text += '\n';
    }
    
    if (customerReturns.length > 0) {
      text += 'CUSTOMER RETURNS\n';
      text += 'Sl.No\tDate\tInvoice#\tCustomer\tProduct\tQty\tUnit Price\tTotal\n';
      customerReturns.forEach((row: any, idx: number) => {
        text += `${idx + 1}\t${row.date}\t${row.invoice}\t${row.customerName}\t${row.product}\t${formatQuantity(row.quantity)}\t${row.unitPrice}\t${row.total}\n`;
      });
      text += '\n';
    }
    
    if (dumps.length > 0) {
      text += 'DUMPS\n';
      text += 'Sl.No\tDate\tProduct\tTotal Qty\n';
      dumps.forEach((row: any, idx: number) => {
        text += `${idx + 1}\t${row.date}\t${row.product}\t${row.totalQty}\n`;
      });
    }
    
    await navigator.clipboard.writeText(text);
    alert('Product history copied to clipboard!');
  };

  const handlePrint = () => {
    if (!searchClicked || loading) return;
    
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Product History Report</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin:20px 0;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:6px;text-align:left;font-size:12px;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.section-title{font-size:14px;font-weight:bold;margin:20px 0 10px 0;color:#333;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>PRODUCT HISTORY REPORT</h2>');
      printWindow.document.write('<p>TROPIFRUIT UK LTD<br>3 Dolphin Way, Purfleet, RM19 1NZ</p>');
      printWindow.document.write(`<p>Report Period: ${fromDate ? format(fromDate, 'dd/MM/yyyy') : 'All'} to ${toDate ? format(toDate, 'dd/MM/yyyy') : 'All'}</p>`);
      printWindow.document.write(`<p>Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>`);
      printWindow.document.write('</div>');
      
      // Add all sections
      const sections = [
        { title: 'FROM SUPPLIER', data: purchases, headers: ['Sl.No', 'Date', 'Supplier Name', 'Product', 'Quantity', 'Unit Price', 'Total'] },
        { title: 'SUPPLIER RETURNS', data: supplierReturns, headers: ['Sl.No', 'Date', 'Invoice#', 'Supplier Name', 'Product', 'Quantity', 'Unit Price', 'Total'] },
        { title: 'SALES', data: sales, headers: ['Sl.No', 'Date', 'Invoice No', 'Customer Name', 'Product', 'Quantity', 'Unit Price', 'Total'] },
        { title: 'CUSTOMER RETURNS', data: customerReturns, headers: ['Sl.No', 'Date', 'Invoice#', 'Customer Name', 'Product', 'Quantity', 'Unit Price', 'Total'] },
        { title: 'DUMPS', data: dumps, headers: ['Sl.No', 'Date', 'Product', 'Total Qty'] }
      ];
      
      sections.forEach(section => {
        if (section.data.length > 0) {
          printWindow.document.write(`<div class="section-title">${section.title}</div>`);
          printWindow.document.write('<table>');
          printWindow.document.write('<thead><tr>');
          section.headers.forEach(header => {
            printWindow.document.write(`<th>${header}</th>`);
          });
          printWindow.document.write('</tr></thead><tbody>');
          
          section.data.forEach((row: any, idx: number) => {
            printWindow.document.write('<tr>');
            printWindow.document.write(`<td>${idx + 1}</td>`);
            printWindow.document.write(`<td>${row.date}</td>`);
            
            if (section.title === 'DUMPS') {
              printWindow.document.write(`<td>${row.product}</td>`);
              printWindow.document.write(`<td>${row.totalQty}</td>`);
            } else {
              if (section.title === 'FROM SUPPLIER' || section.title === 'SUPPLIER RETURNS') {
                if (section.title === 'SUPPLIER RETURNS') {
                  printWindow.document.write(`<td>${row.invoice}</td>`);
                }
                printWindow.document.write(`<td>${row.supplierName}</td>`);
              } else {
                if (section.title === 'CUSTOMER RETURNS') {
                  printWindow.document.write(`<td>${row.invoice}</td>`);
                }
                printWindow.document.write(`<td>${row.customerName || row.invoiceNo}</td>`);
              }
              printWindow.document.write(`<td>${row.product}</td>`);
              printWindow.document.write(`<td>${formatQuantity(row.quantity)}</td>`);
              printWindow.document.write(`<td>${row.unitPrice}</td>`);
              printWindow.document.write(`<td>${row.total}</td>`);
            }
            printWindow.document.write('</tr>');
          });
          
          printWindow.document.write('</tbody></table>');
        }
      });
      
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const sendEmail = async () => {
    if (!emailAddress || !searchClicked || loading) {
      alert('Please enter an email address and ensure data is loaded.');
      return;
    }
    
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (productId && productId !== "All") params.append("productId", productId);
      if (productLike) params.append("productLike", productLike);
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toEndOfDayDateString(toDate));
      if (customerId && customerId !== "All") params.append("customerId", customerId);
      if (supplierId && supplierId !== "All") params.append("supplierId", supplierId);
      params.append("email", emailAddress);
      
      const response = await apiRequest('POST', `/api/reports/product-history/email?${params.toString()}`);
      
      alert('Email sent successfully!');
      setEmailAddress('');
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Product History</h1>
            <div className="text-sm text-gray-500">
              TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ, ...
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Filter Section */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Product Like:</label>
                <Input
                  value={productLike}
                  onChange={(e) => setProductLike(e.target.value)}
                  placeholder=""
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Product:</label>
                <Select value={productId || "All"} onValueChange={setProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Products</SelectItem>
                    {allProducts.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Customer:</label>
                <Select value={customerId || "All"} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Customers</SelectItem>
                    {allCustomers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Supplier:</label>
                <Select value={supplierId || "All"} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Suppliers</SelectItem>
                    {allSuppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.supplier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">From:</label>
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
                      {fromDate ? formatDateForDisplay(fromDate, "yyyy-MM-dd") : "Select"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
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
                <label className="block text-sm font-medium mb-2">To:</label>
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
                      {toDate ? formatDateForDisplay(toDate, "yyyy-MM-dd") : "Select"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={handleToDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="col-span-1 lg:col-span-3 flex items-end gap-2">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 flex-1"
                  disabled={loading}
                  onClick={() => setSearchClicked((v) => !v)}
                >
                  {loading ? "Loading..." : "Search"}
                </Button>
              </div>
            </div>
            
            {/* Export and Email Section */}
            {searchClicked && !loading && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="block text-sm font-medium mb-1">Email Address:</label>
                    <Input
                      type="email"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      placeholder="Enter email address"
                      className="h-8"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handlePDF}
                      disabled={isExporting}
                      className="bg-red-600 hover:bg-red-700 h-8 px-3"
                    >
                      <FileText className="mr-1 h-3 w-3" />
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleExcel}
                      disabled={isExporting}
                      className="bg-green-600 hover:bg-green-700 h-8 px-3"
                    >
                      <Download className="mr-1 h-3 w-3" />
                      Excel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCopy}
                      disabled={isExporting}
                      variant="outline"
                      className="h-8 px-3"
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      onClick={handlePrint}
                      disabled={isExporting}
                      variant="outline"
                      className="h-8 px-3"
                    >
                      <Printer className="mr-1 h-3 w-3" />
                      Print
                    </Button>
                    <Button
                      size="sm"
                      onClick={sendEmail}
                      disabled={isExporting || !emailAddress}
                      className="bg-purple-600 hover:bg-purple-700 h-8 px-3"
                    >
                      <Mail className="mr-1 h-3 w-3" />
                      {isExporting ? "Sending..." : "Email"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {/* Error handling */}
            {(productsError || customersError || suppliersError || historyError) && (
              <div className="text-red-600 mt-2">
                {productsError && <div>Failed to load products.</div>}
                {customersError && <div>Failed to load customers.</div>}
                {suppliersError && <div>Failed to load suppliers.</div>}
                {historyError && <div>Failed to load product history.</div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* From Supplier Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-green-600 border-b-2 border-green-300 pb-2">From Supplier</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-green-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[150px]">Supplier Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : purchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    purchases.map((purchase, idx) => (
                      <TableRow key={`purchase-${idx}`}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{purchase.date}</TableCell>
                        <TableCell className="text-center">{purchase.supplierName}</TableCell>
                        <TableCell className="text-center">{purchase.product}</TableCell>
                        <TableCell className="text-center">{formatQuantity(purchase.quantity)}</TableCell>
                        <TableCell className="text-center">£{Number(purchase.unitPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{Number(purchase.total).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {purchases.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="text-left">Total</TableCell>
                      <TableCell colSpan={3}></TableCell>
                      <TableCell className="text-center">
                        {formatQuantity(purchases.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0))}
                      </TableCell>
                      <TableCell className="text-center">
                        £{(purchases.reduce((sum, p) => sum + (Number(p.unitPrice) || 0) * (Number(p.quantity) || 0), 0) / 
                         (purchases.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0) || 1)).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        £{purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* From Supplier Returns Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-orange-600 border-b-2 border-orange-300 pb-2">From Supplier Returns</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-orange-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[100px]">Invoice#</TableHead>
                    <TableHead className="text-center min-w-[150px]">Supplier Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : supplierReturns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    supplierReturns.map((returnItem, idx) => (
                      <TableRow key={`return-${idx}`}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{returnItem.date}</TableCell>
                        <TableCell className="text-center">{returnItem.invoice}</TableCell>
                        <TableCell className="text-center">{returnItem.supplierName}</TableCell>
                        <TableCell className="text-center">{returnItem.product}</TableCell>
                        <TableCell className="text-center">{formatQuantity(returnItem.quantity)}</TableCell>
                        <TableCell className="text-center">£{Number(returnItem.unitPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{Number(returnItem.total).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {supplierReturns.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="text-left">Total</TableCell>
                      <TableCell colSpan={4}></TableCell>
                      <TableCell className="text-center">
                        {formatQuantity(supplierReturns.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0))}
                      </TableCell>
                      <TableCell className="text-center">
                        £{(supplierReturns.reduce((sum, r) => sum + (Number(r.unitPrice) || 0) * (Number(r.quantity) || 0), 0) / 
                         (supplierReturns.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0) || 1)).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        £{supplierReturns.reduce((sum, r) => sum + (Number(r.total) || 0), 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* From Sales Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-blue-600 border-b-2 border-blue-300 pb-2">From Sales</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[100px]">Invoice No</TableHead>
                    <TableHead className="text-center min-w-[150px]">Customer Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    sales.map((sale, idx) => (
                      <TableRow key={`sale-${idx}`} className={cn(sale.isCompany && "bg-amber-50")}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{sale.date}</TableCell>
                        <TableCell className="text-center">{sale.invoiceNo}</TableCell>
                        <TableCell className="text-center">
                          <span className="flex items-center gap-1 justify-center">
                            {sale.customerName}
                            {sale.isCompany && (
                              <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 font-medium">CO</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">{sale.product}</TableCell>
                        <TableCell className="text-center">{formatQuantity(sale.quantity)}</TableCell>
                        <TableCell className="text-center">£{Number(sale.unitPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{Number(sale.total).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {sales.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="text-left">Total</TableCell>
                      <TableCell colSpan={4}></TableCell>
                      <TableCell className="text-center">
                        {formatQuantity(sales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0))}
                      </TableCell>
                      <TableCell className="text-center">
                        £{(() => {
                          const ncSales = sales.filter((s: any) => !s.isCompany);
                          const totalQty = ncSales.reduce((sum: number, s: any) => sum + (Number(s.quantity) || 0), 0);
                          const totalVal = ncSales.reduce((sum: number, s: any) => sum + (Number(s.unitPrice) || 0) * (Number(s.quantity) || 0), 0);
                          return (totalVal / (totalQty || 1)).toFixed(2);
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        £{sales.filter((s: any) => !s.isCompany).reduce((sum: number, s: any) => sum + (Number(s.total) || 0), 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* From Customer Returns Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-purple-600 border-b-2 border-purple-300 pb-2">From Customer Returns</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-purple-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[100px]">Invoice#</TableHead>
                    <TableHead className="text-center min-w-[150px]">Customer Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : customerReturns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    customerReturns.map((returnItem, idx) => (
                      <TableRow key={`customer-return-${idx}`}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{returnItem.date}</TableCell>
                        <TableCell className="text-center">{returnItem.invoice}</TableCell>
                        <TableCell className="text-center">{returnItem.customerName}</TableCell>
                        <TableCell className="text-center">{returnItem.product}</TableCell>
                        <TableCell className="text-center">{formatQuantity(returnItem.quantity)}</TableCell>
                        <TableCell className="text-center">£{Number(returnItem.unitPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{Number(returnItem.total).toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {customerReturns.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="text-left">Total</TableCell>
                      <TableCell colSpan={4}></TableCell>
                      <TableCell className="text-center">
                        {formatQuantity(customerReturns.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0))}
                      </TableCell>
                      <TableCell className="text-center">
                        £{(customerReturns.reduce((sum, r) => sum + (Number(r.unitPrice) || 0) * (Number(r.quantity) || 0), 0) / 
                         (customerReturns.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0) || 1)).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        £{customerReturns.reduce((sum, r) => sum + (Number(r.total) || 0), 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* From Dumps Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-red-600 border-b-2 border-red-300 pb-2">From Dumps</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-red-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : dumps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    dumps.map((dump, idx) => (
                      <TableRow key={`dump-${idx}`}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{dump.date}</TableCell>
                        <TableCell className="text-center">{dump.product}</TableCell>
                        <TableCell className="text-center">{formatQuantity(dump.totalQty)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {dumps.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="text-left">Total</TableCell>
                      <TableCell colSpan={2}></TableCell>
                      <TableCell className="text-center">
                        {formatQuantity(dumps.reduce((sum, d) => sum + (Number(d.totalQty) || 0), 0))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
