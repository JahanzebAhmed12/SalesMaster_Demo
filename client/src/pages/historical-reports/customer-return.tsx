import { useState } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, RotateCcw, FileText, Download, Copy, Printer, Search } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import React from 'react';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu';

interface CustomerReturnData {
  id: number;
  slNo: number;
  returnDate: string;
  customerName: string;
  invoiceNo: string;
  productName: string;
  quantity: number;
  returnReason: string;
  returnAmount: number;
  refundStatus: string;
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

function toLocalDateString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function CustomerReturn() {
  const [fromDate, setFromDate] = useState<Date>(subWeeks(new Date(), 1));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [customerFilter, setCustomerFilter] = useState("All Customer");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchClicked, setSearchClicked] = useState(false);
  const tableRef = React.useRef<HTMLDivElement>(null);

  // Fetch customers from database
  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  const { data: returnData = [], isLoading } = useQuery<CustomerReturnData[]>({
    queryKey: [
      "customer-returns",
      fromDate && toLocalDateString(fromDate),
      toDate && toLocalDateString(toDate),
      customerFilter,
      searchTerm,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      if (customerFilter && customerFilter !== "All Customer") params.append("customerId", customerFilter);
      if (searchTerm) params.append("search", searchTerm);
      return apiRequest("GET", `/api/reports/customer-returns?${params.toString()}`);
    },
    enabled: !!searchClicked,
  });

  const { data: companyDetails } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  const totals = {
    totalQuantity: returnData.reduce((sum, item) => sum + (item.quantity || 0), 0),
    totalAmount: returnData.reduce((sum, item) => sum + (item.returnAmount || 0), 0)
  };

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Customer Returns</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.company-details{text-align:center;margin-bottom:30px;line-height:1.4;}.totals{font-weight:bold;background-color:#f9f9f9;}</style>');
      printWindow.document.write('</head><body>');
      
      // Add company details header
      printWindow.document.write('<div class="company-details">');
      if (companyDetails) {
        printWindow.document.write(`<h2>${companyDetails.companyName || ''}</h2>`);
        if (companyDetails.address1) printWindow.document.write(`<p>${companyDetails.address1}</p>`);
        if (companyDetails.address2) printWindow.document.write(`<p>${companyDetails.address2}</p>`);
        
        // Only include mobile and fax, exclude telephone
        let contactInfo = [];
        if (companyDetails.mobile) contactInfo.push(`Mobile: ${companyDetails.mobile}`);
        if (companyDetails.fax) contactInfo.push(`Fax: ${companyDetails.fax}`);
        if (contactInfo.length > 0) printWindow.document.write(`<p>${contactInfo.join(' | ')}</p>`);
        
        // Removed email and website
        
        // Only keep EINL if needed, removed VAT No and Reg No
        let regInfo = [];
        if (companyDetails.einlNumber) regInfo.push(`EINL: ${companyDetails.einlNumber}`);
        if (regInfo.length > 0) printWindow.document.write(`<p>${regInfo.join(' | ')}</p>`);
        
        if (companyDetails.bankDetails) printWindow.document.write(`<p><strong>Bank Details:</strong> ${companyDetails.bankDetails}</p>`);
      }
      printWindow.document.write('</div>');
      
      // Add report title
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h3>CUSTOMER RETURNS</h3>');
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}</p>`);
      printWindow.document.write('</div>');
      
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Sl.No</th>');
      printWindow.document.write('<th>Return Date</th>');
      printWindow.document.write('<th>Customer Name</th>');
      printWindow.document.write('<th>Product Name</th>');
      printWindow.document.write('<th>Quantity</th>');
      printWindow.document.write('<th>Return Reason</th>');
      printWindow.document.write('<th>Return Amount</th>');
      printWindow.document.write('<th>Status</th>');
      printWindow.document.write('</tr></thead><tbody>');
      returnData.forEach((item) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.slNo}</td>`);
        printWindow.document.write(`<td>${format(new Date(item.returnDate), "dd/MM/yyyy")}</td>`);
        printWindow.document.write(`<td>${item.customerName}</td>`);
        printWindow.document.write(`<td>${item.productName}</td>`);
        printWindow.document.write(`<td>${item.quantity}</td>`);
        printWindow.document.write(`<td>${item.returnReason}</td>`);
        printWindow.document.write(`<td>£${item.returnAmount.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${item.refundStatus}</td>`);
        printWindow.document.write('</tr>');
      });
      printWindow.document.write('</tbody></table>');
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    try {
      if (!returnData || returnData.length === 0) {
        alert('No data available to export');
        return;
      }

      const wb = XLSX.utils.book_new();
      
      // 1. Create Info Sheet
      const info = [
        ['CUSTOMER RETURNS REPORT'],
        [''],
        ['Company:', companyDetails?.companyName || ''],
        ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
        ['', companyDetails?.telephone ? `Tel: ${companyDetails.telephone}` : ''],
        ['', companyDetails?.mobile ? `Mobile: ${companyDetails.mobile}` : ''],
        ['', companyDetails?.email ? `Email: ${companyDetails.email}` : ''],
        ['', companyDetails?.website ? `Website: ${companyDetails.website}` : ''],
        ['', companyDetails?.vatNo ? `VAT No: ${companyDetails.vatNo}` : ''],
        ['', companyDetails?.compRegNo ? `Reg No: ${companyDetails.compRegNo}` : ''],
        ['', companyDetails?.einlNumber ? `EINL: ${companyDetails.einlNumber}` : ''],
        [''],
        ['Period:', `${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`],
        ['Generated on:', format(new Date(), 'dd/MM/yyyy hh:mm a')],
        ['']
      ];
      
      const wsInfo = XLSX.utils.aoa_to_sheet(info);
      wsInfo['!cols'] = [{ wch: 15 }, { wch: 50 }];
      XLSX.utils.book_append_sheet(wb, wsInfo, 'Report Info');
      
      // 2. Create Data Sheet
      const headers = [
        'Sl.No',
        'Return Date',
        'Customer Name',
        'Invoice No',
        'Product Name',
        'Quantity',
        'Return Reason',
        'Return Amount',
        'Status'
      ];
      
      // Prepare data rows
      const data = returnData.map(item => [
        item.slNo || '',
        item.returnDate ? format(new Date(item.returnDate), 'dd/MM/yyyy') : '',
        item.customerName || '',
        item.invoiceNo || '',
        item.productName || '',
        item.quantity || 0,
        item.returnReason || '',
        item.returnAmount || 0,
        item.refundStatus || ''
      ]);
      
      // Add headers as first row
      data.unshift(headers);
      
      // Create worksheet with all data
      const ws = XLSX.utils.aoa_to_sheet(data);
      
      // Set column widths
      ws['!cols'] = [
        { wch: 8 },  // Sl.No
        { wch: 15 }, // Return Date
        { wch: 30 }, // Customer Name
        { wch: 15 }, // Invoice No
        { wch: 30 }, // Product Name
        { wch: 10, alignment: { horizontal: 'right' } }, // Quantity
        { wch: 40 }, // Return Reason
        { wch: 15, alignment: { horizontal: 'right' } }, // Return Amount
        { wch: 15 }  // Status
      ];
      
      // Add number formatting for numeric columns
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let R = 1; R <= range.e.r; R++) {
        // Format quantity column (0-based index 5)
        const qtyCell = XLSX.utils.encode_cell({ r: R, c: 5 });
        if (!ws[qtyCell]) ws[qtyCell] = {};
        ws[qtyCell].t = 'n'; // Number type
        
        // Format amount column (0-based index 7)
        const amtCell = XLSX.utils.encode_cell({ r: R, c: 7 });
        if (!ws[amtCell]) ws[amtCell] = {};
        ws[amtCell].t = 'n'; // Number type
        ws[amtCell].z = '#,##0.00'; // Format as number with 2 decimal places
      }
      
      // Add totals row
      const totalRow = [
        '', '', '', '', '',
        { v: totals.totalQuantity, t: 'n' },
        'Total:',
        { v: totals.totalAmount, t: 'n', z: '#,##0.00' },
        ''
      ];
      
      XLSX.utils.sheet_add_aoa(ws, [totalRow], { origin: -1 });
      
      // Style header and total rows
      for (let C = 0; C < headers.length; C++) {
        // Style header row (row 0)
        const headerCell = XLSX.utils.encode_cell({ r: 0, c: C });
        ws[headerCell].s = { 
          font: { bold: true }, 
          fill: { fgColor: { rgb: 'FFF2CC' } }, // Light orange background
          alignment: { horizontal: 'center', vertical: 'center' }
        };
        
        // Style total row (last row)
        const totalCell = XLSX.utils.encode_cell({ r: data.length, c: C });
        if (ws[totalCell]) {
          ws[totalCell].s = { 
            font: { bold: true },
            fill: { fgColor: { rgb: 'E6E6E6' } } // Light gray background
          };
        }
      }
      
      // Add borders to all cells
      const fullRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let R = fullRange.s.r; R <= fullRange.e.r; R++) {
        for (let C = fullRange.s.c; C <= fullRange.e.c; C++) {
          const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddress]) ws[cellAddress] = { v: '' };
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        }
      }
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Customer Returns');
      
      // Generate filename and save
      const filename = `Customer_Returns_${fromDate ? format(fromDate, 'yyyyMMdd') : ''}_${toDate ? format(toDate, 'yyyyMMdd') : ''}.xlsx`;
      XLSX.writeFile(wb, filename);
      
    } catch (error) {
      console.error('Error generating Excel file:', error);
      alert('Failed to generate Excel file. Please try again.');
    }
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('CUSTOMER RETURNS REPORT', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`, 105, 40, { align: 'center' });
    const tableData = returnData.map((item) => [
      item.slNo,
      format(new Date(item.returnDate), "dd/MM/yyyy"),
      item.customerName,
      item.invoiceNo,
      item.productName,
      item.quantity,
      item.returnReason,
      `£${item.returnAmount.toFixed(2)}`,
      item.refundStatus
    ]);
    autoTable(doc, {
      head: [[
        'Sl.No', 'Return Date', 'Customer Name', 'Invoice No', 'Product Name', 'Quantity', 'Return Reason', 'Return Amount', 'Status'
      ]],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 20 },
        2: { cellWidth: 30 },
        3: { cellWidth: 20 },
        4: { cellWidth: 30 },
        5: { cellWidth: 15 },
        6: { cellWidth: 30 },
        7: { cellWidth: 20 },
        8: { cellWidth: 20 }
      }
    });
    doc.save(`customer_returns_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tReturn Date\tCustomer Name\tInvoice No\tProduct Name\tQuantity\tReturn Reason\tReturn Amount\tStatus\n';
    text += returnData.map((item) => [
      item.slNo,
      format(new Date(item.returnDate), "dd/MM/yyyy"),
      item.customerName,
      item.invoiceNo,
      item.productName,
      item.quantity,
      item.returnReason,
      item.returnAmount,
      item.refundStatus
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
  };

  return (
    <PageLayout title="Customer Returns" breadcrumb="Historical Reports > Customer Returns">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <RotateCcw size={20} />
                Customer Returns
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
                <Label>Customer:</Label>
                <Select value={customerFilter} onValueChange={setCustomerFilter} disabled={loadingCustomers}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCustomers ? "Loading..." : "All Customer"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Customer">All Customer</SelectItem>
                    {customers.map((customer: any) => (
                      <SelectItem key={customer.id} value={String(customer.id)}>
                        {customer.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full" onClick={() => setSearchClicked(v => !v)} disabled={loadingCustomers}>
                  {loadingCustomers ? "Loading..." : "Search"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Returns Report Section */}
        <Card>
          <CardHeader>
            <div className="bg-orange-500 text-white text-center py-2 rounded">
              CUSTOMER RETURNS REPORT
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">Show all rows</Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                  PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                  Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                  Copy
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
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
            <div ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-orange-100">
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Return Date</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead>Return Reason</TableHead>
                    <TableHead className="text-center">Return Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : returnData.map((returnItem) => (
                    <TableRow key={returnItem.id} className="hover:bg-gray-50">
                      <TableCell>{returnItem.slNo}</TableCell>
                      <TableCell>{format(new Date(returnItem.returnDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{returnItem.customerName}</TableCell>
                      <TableCell>{returnItem.productName}</TableCell>
                      <TableCell className="text-center">{returnItem.quantity}</TableCell>
                      <TableCell>{returnItem.returnReason}</TableCell>
                      <TableCell className="text-center">£{returnItem.returnAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-1 rounded text-xs ${
                          returnItem.refundStatus === 'Processed' ? 'bg-green-100 text-green-800' :
                          returnItem.refundStatus === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {returnItem.refundStatus}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-purple-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">TOTAL</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center font-bold">{totals.totalQuantity}</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center font-bold">£{totals.totalAmount.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to 2 of 2 entries</div>
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