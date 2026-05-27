import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ShoppingCart, FileText, Download, Copy, Printer, Search, ChevronUp, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn, formatQuantity } from "@/lib/utils";
import { useBusinessDate } from "@/hooks/use-business-date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PurchaseHistoryData {
  id: number;
  slNo: number;
  date: string;
  supplierName: string;
  invoiceNo: string;
  deliveryNo: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentStatus: string;
  isCompany?: boolean;
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

export default function PurchaseHistory() {
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
  const [supplierFilter, setSupplierFilter] = useState<string>("All Suppliers");
  const [paymentFilter, setPaymentFilter] = useState<string>("All Payments");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [trigger, setTrigger] = useState(0);
  const [sortField, setSortField] = useState<string>("");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Fetch suppliers for dropdown
  const { data: suppliers, isLoading: loadingSuppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Fetch purchase history
  const {
    data: purchaseResponse = { data: [], totals: { totalQuantity: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0 } },
    isLoading: loadingPurchases,
    error: purchaseError,
  } = useQuery({
    queryKey: [
      "purchase-history",
      fromDate,
      toDate,
      supplierFilter,
      paymentFilter,
      searchTerm,
      trigger,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("fromDate", fromDate.toISOString().slice(0, 10));
      params.append("toDate", toDate.toISOString().slice(0, 10));
      if (supplierFilter !== "All Suppliers") {
        const supplier = suppliers?.find((s: any) => s.supplier_name === supplierFilter);
        if (supplier) params.append("supplierId", supplier.id);
      }
      if (paymentFilter !== "All Payments") params.append("paymentStatus", paymentFilter);
      if (searchTerm) params.append("search", searchTerm);
      return apiRequest("GET", `/api/reports/purchase-history?${params.toString()}`);
    },
    enabled: !!fromDate && !!toDate && !!suppliers,
  });

  const purchaseData = Array.isArray(purchaseResponse.data) ? purchaseResponse.data : [];
  const totals = purchaseResponse.totals || { totalQuantity: 0, totalAmount: 0, paidAmount: 0, pendingAmount: 0 };

  const { data: companyDetails } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

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

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Purchase History Report</title>');
      printWindow.document.write(`
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #2C7A7B; text-align: center; margin-bottom: 5px; }
          .company-info { text-align: center; margin-bottom: 10px; font-size: 14px; }
          .report-info { margin-bottom: 15px; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th { background-color: #2C7A7B; color: white; padding: 8px; text-align: left; }
          td { padding: 6px; border: 1px solid #ddd; }
          .total-row { font-weight: bold; background-color: #f5f5f5; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .footer { margin-top: 20px; font-size: 12px; text-align: center; color: #666; }
          .page-break { page-break-after: always; }
        </style>
      `);
      printWindow.document.write('</head><body>');
      
      // Header with company info
      printWindow.document.write(`
        <h1>PURCHASE HISTORY REPORT</h1>
        <div class="company-info">
          <div>${companyDetails?.companyName || ''}</div>
          <div>${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</div>
          <div>${companyDetails?.telephone ? 'Tel: ' + companyDetails.telephone : ''} ${companyDetails?.email ? '| Email: ' + companyDetails.email : ''}</div>
        </div>
        <div class="report-info">
          <div><strong>Period:</strong> ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}</div>
          <div><strong>Supplier:</strong> ${supplierFilter || 'All'}</div>
          <div><strong>Payment Status:</strong> ${paymentFilter || 'All'}</div>
        </div>
      `);
      
      // Table
      printWindow.document.write(`
        <table>
          <thead>
            <tr>
              <th>Sl.No</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Invoice No</th>
              <th>Product Name</th>
              <th class="text-center">Qty</th>
              <th class="text-right">Unit Price</th>
              <th class="text-right">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
      `);
      
      // Table rows
      purchaseData.forEach((purchase: PurchaseHistoryData) => {
        printWindow.document.write(`
          <tr>
            <td>${purchase.slNo}</td>
            <td>${format(new Date(purchase.date), 'dd/MM/yyyy')}</td>
            <td>${purchase.supplierName}</td>
            <td>${purchase.invoiceNo}</td>
            <td>${purchase.productName}</td>
            <td class="text-center">${formatQuantity(purchase.quantity)}</td>
            <td class="text-right">£${purchase.unitPrice.toFixed(2)}</td>
            <td class="text-right">£${purchase.totalAmount.toFixed(2)}</td>
            <td>${purchase.paymentStatus}</td>
          </tr>
        `);
      });
      
      // Totals row
      printWindow.document.write(`
          <tr class="total-row">
            <td colspan="5" class="text-right"><strong>TOTALS:</strong></td>
            <td class="text-center">${formatQuantity(totals.totalQuantity)}</td>
            <td></td>
            <td class="text-right">£${totals.totalAmount.toFixed(2)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      `);
      
      // Footer
      printWindow.document.write(`
        <div class="footer">
          <div>Generated on ${format(new Date(), 'dd/MM/yyyy hh:mm a')}</div>
          <div>${window.location.href}</div>
        </div>
      `);
      
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Prepare the data for the main sheet
    const header = [
      'Sl.No', 
      'Date', 
      'Supplier Name',
      'Invoice No',
      'Product Name',
      'Quantity',
      'Unit Price',
      'Total Amount',
      'Payment Status'
    ];

    // Convert data to array of arrays for better control
    const dataArray = [
      ['PURCHASE HISTORY REPORT'],
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
    
    // Add period information
    dataArray.push(
      ['Report Details:'],
      ['Period:', `${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`],
      ['Supplier:', supplierFilter],
      ['Payment Status:', paymentFilter],
      [''],
      header // Add header row
    );

    // Add data rows
    purchaseData.forEach((purchase: PurchaseHistoryData) => {
      dataArray.push([
        purchase.slNo || '',
        format(new Date(purchase.date), "dd/MM/yyyy"),
        purchase.supplierName || '',
        purchase.invoiceNo || '',
        purchase.productName || '',
        formatQuantity(purchase.quantity) || 0,
        parseFloat(purchase.unitPrice?.toString() || '0').toFixed(2),
        parseFloat(purchase.totalAmount?.toString() || '0').toFixed(2),
        purchase.paymentStatus || ''
      ]);
    });

    // Add totals row
    dataArray.push([
      '', '', '', '', '',
      formatQuantity(totals.totalQuantity) || 0,
      '',
      parseFloat(totals.totalAmount?.toString() || '0').toFixed(2),
      ''
    ]);

    // Create worksheet from array data
    const ws = XLSX.utils.aoa_to_sheet(dataArray);
    
    // Set column widths
    const colWidths = [
      { wch: 8 },   // Sl.No
      { wch: 15 },  // Date
      { wch: 30 },  // Supplier Name
      { wch: 20 },  // Invoice No
      { wch: 40 },  // Product Name
      { wch: 10 },  // Quantity
      { wch: 12 },  // Unit Price
      { wch: 15 },  // Total Amount
      { wch: 15 }   // Payment Status
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
        
        // Right align numeric columns (indices 5-7)
        if (C >= 5 && C <= 7) {
          ws[cellAddress].s.alignment = ws[cellAddress].s.alignment || {};
          ws[cellAddress].s.alignment.horizontal = 'right';
        }
      }
    }
    
    // Style the title
    ws['A1'].s = { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } };
    
    // Merge title cells
    if (!ws['!merges']) ws['!merges'] = [];
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } });
    
    // Set column widths
    ws['!cols'] = colWidths;
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Purchase History');
    
    // Generate filename with date
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    
    // Save the workbook
    XLSX.writeFile(wb, `purchase-history-${dateStr}.xlsx`);
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    
    // Add header
    doc.setFontSize(16);
    doc.setTextColor(44, 122, 123); // Teal color
    doc.setFont('helvetica', 'bold');
    doc.text('PURCHASE HISTORY REPORT', 105, 20, { align: 'center' });
    
    // Add company info
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0); // Black color
    doc.setFont('helvetica', 'normal');
    doc.text(companyDetails?.companyName || '', 105, 28, { align: 'center' });
    
    // Add address
    const addressLine1 = companyDetails?.address1 || '';
    const addressLine2 = companyDetails?.address2 ? `, ${companyDetails.address2}` : '';
    doc.text(`${addressLine1}${addressLine2}`, 105, 32, { align: 'center' });
    
    // Add contact info
    const contactInfo = [];
    if (companyDetails?.telephone) contactInfo.push(`Tel: ${companyDetails.telephone}`);
    if (companyDetails?.email) contactInfo.push(`Email: ${companyDetails.email}`);
    doc.text(contactInfo.join(' | '), 105, 36, { align: 'center' });
    
    // Add report details
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(20, 42, 190, 42);
    
    doc.setFontSize(9);
    doc.text([
      `Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`,
      `Supplier: ${supplierFilter || 'All'}`,
      `Payment Status: ${paymentFilter || 'All'}`
    ], 20, 48);
    
    // Prepare table data
    const tableData = purchaseData.map((purchase: PurchaseHistoryData) => [
      purchase.slNo.toString(),
      format(new Date(purchase.date), "dd/MM/yyyy"),
      purchase.supplierName,
      purchase.invoiceNo,
      purchase.productName,
      formatQuantity(purchase.quantity),
      `£${parseFloat(purchase.unitPrice?.toString() || '0').toFixed(2)}`,
      `£${parseFloat(purchase.totalAmount?.toString() || '0').toFixed(2)}`,
      purchase.paymentStatus
    ]);
    
    // Add main table
    autoTable(doc, {
      head: [[
        'Sl.No', 'Date', 'Supplier', 'Invoice No', 'Product', 'Qty', 'Unit Price', 'Total', 'Status'
      ]],
      body: tableData,
      startY: 60,
      styles: {
        fontSize: 7,
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.2
      },
      headStyles: {
        fillColor: [44, 122, 123], // Teal header
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7,
        lineWidth: 0.2
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' }, // Sl.No
        1: { cellWidth: 15, halign: 'left' },   // Date
        2: { cellWidth: 25, halign: 'left' },   // Supplier
        3: { cellWidth: 20, halign: 'left' },   // Invoice No
        4: { cellWidth: 40, halign: 'left' },   // Product
        5: { cellWidth: 10, halign: 'right' },  // Qty
        6: { cellWidth: 15, halign: 'right' },  // Unit Price
        7: { cellWidth: 18, halign: 'right' },  // Total
        8: { cellWidth: 15, halign: 'center' }  // Status
      },
      margin: { left: 10, right: 10 },
      didDrawPage: function(data) {
        // Footer on each page
        const pageCount = doc.internal.getNumberOfPages();
        const currentPage = data.pageNumber;
        
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(
          `Page ${currentPage} of ${pageCount}`, 
          data.settings.margin.left, 
          doc.internal.pageSize.height - 10
        );
        
        doc.text(
          `Generated on ${format(new Date(), 'dd/MM/yyyy hh:mm a')}`, 
          doc.internal.pageSize.width - data.settings.margin.right, 
          doc.internal.pageSize.height - 10,
          { align: 'right' }
        );
      }
    });
    
    // Add totals row
    const finalY = (doc as any).lastAutoTable.finalY || 60;
    
    doc.autoTable({
      head: [['', '', '', '', 'TOTALS', formatQuantity(totals.totalQuantity), '', `£${parseFloat(totals.totalAmount?.toString() || '0').toFixed(2)}`, '']],
      body: [],
      startY: finalY + 5,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        fontStyle: 'bold',
        fillColor: [245, 245, 245],
        lineColor: [200, 200, 200],
        lineWidth: 0.2
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 15 },
        2: { cellWidth: 25 },
        3: { cellWidth: 20 },
        4: { cellWidth: 40, fontStyle: 'bold', halign: 'right' },
        5: { cellWidth: 10, halign: 'right' },
        6: { cellWidth: 15 },
        7: { cellWidth: 18, halign: 'right' },
        8: { cellWidth: 15 }
      },
      margin: { left: 10, right: 10 }
    });
    
    // Generate filename with date range
    const dateStr = `${format(fromDate, 'yyyyMMdd')}_to_${format(toDate, 'yyyyMMdd')}`;
    doc.save(`purchase_history_${dateStr}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tSupplier Name\tInvoice No\tProduct Name\tQuantity\tUnit Price\tTotal Amount\tPayment Status\n';
    text += purchaseData.map((purchase: PurchaseHistoryData) => [
      purchase.slNo,
      format(new Date(purchase.date), "dd/MM/yyyy"),
      purchase.supplierName,
      purchase.invoiceNo,
      purchase.productName,
      formatQuantity(purchase.quantity),
      purchase.unitPrice,
      purchase.totalAmount,
      purchase.paymentStatus
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
  };

  return (
    <PageLayout title="Purchase History" breadcrumb="Historical Reports > Purchase History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart size={20} />
                Purchase History Report
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
                <Select value={supplierFilter} onValueChange={setSupplierFilter} disabled={loadingSuppliers}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Suppliers">All Suppliers</SelectItem>
                    {suppliers?.map((s: any) => (
                      <SelectItem key={s.id} value={s.supplier_name}>{s.supplier_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Payments">All Payments</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full" onClick={() => setTrigger(t => t + 1)} disabled={loadingPurchases || loadingSuppliers}>
                  {loadingPurchases ? "Loading..." : "Generate Report"}
                </Button>
              </div>
            </div>
            {purchaseError && <div className="text-red-500 mt-2">Error loading data: {purchaseError.message}</div>}
          </CardContent>
        </Card>
        {/* Purchase Report Section */}
        <Card>
          <CardHeader>
            <div className="bg-teal-600 text-white text-center py-2 rounded">
              PURCHASE HISTORY REPORT
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
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                  <Printer size={14} />
                  Print
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
            {loadingPurchases ? (
              <div className="text-center py-8">Loading purchase history...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-teal-100">
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-center">Unit Price</TableHead>
                    <TableHead className="text-center">Total Amount</TableHead>
                    <TableHead className="text-center">Payment Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(Array.isArray(purchaseData) ? purchaseData : []).map((purchase: PurchaseHistoryData) => (
                    <TableRow key={purchase.id} className={cn("hover:bg-gray-50", purchase.isCompany && "bg-amber-50")}>
                      <TableCell>{purchase.slNo}</TableCell>
                      <TableCell>{format(new Date(purchase.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="flex items-center gap-1">
                        {purchase.supplierName}
                        {purchase.isCompany && (
                          <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 font-medium">CO</span>
                        )}
                      </TableCell>
                      <TableCell>{purchase.invoiceNo}</TableCell>
                      <TableCell>{purchase.productName}</TableCell>
                      <TableCell className="text-center">{formatQuantity(purchase.quantity)}</TableCell>
                      <TableCell className="text-center">£{purchase.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-medium">£{purchase.totalAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          purchase.paymentStatus === 'Paid' 
                            ? 'bg-green-100 text-green-800' 
                            : purchase.paymentStatus === 'Pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}>
                          {purchase.paymentStatus}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-amber-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">TOTAL</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center font-bold">{formatQuantity(totals.totalQuantity)}</TableCell>
                    <TableCell className="text-center font-bold">-</TableCell>
                    <TableCell className="text-center font-bold">£{totals.totalAmount.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-blue-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Total Purchases</div>
                <div className="text-2xl font-bold text-blue-600">£{totals.totalAmount.toFixed(2)}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Amount Paid</div>
                <div className="text-2xl font-bold text-green-600">£{totals.paidAmount.toFixed(2)}</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Amount Pending</div>
                <div className="text-2xl font-bold text-yellow-600">£{totals.pendingAmount.toFixed(2)}</div>
              </div>
              <div className="bg-teal-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Total Items</div>
                <div className="text-2xl font-bold text-teal-600">{formatQuantity(totals.totalQuantity)}</div>
              </div>
            </div>
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {purchaseData.length} of {purchaseData.length} entries</div>
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