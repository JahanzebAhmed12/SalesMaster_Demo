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
import { format } from "date-fns";
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
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [customerFilter, setCustomerFilter] = useState("All Customer");
  const [returnTypeFilter, setReturnTypeFilter] = useState("All Returns");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchClicked, setSearchClicked] = useState(false);
  const tableRef = React.useRef<HTMLDivElement>(null);

  const { data: returnData = [], isLoading } = useQuery<CustomerReturnData[]>({
    queryKey: [
      "customer-returns",
      fromDate && toLocalDateString(fromDate),
      toDate && toLocalDateString(toDate),
      customerFilter,
      returnTypeFilter,
      searchTerm,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      if (customerFilter && customerFilter !== "All Customer") params.append("customerId", customerFilter);
      if (returnTypeFilter && returnTypeFilter !== "All Returns") params.append("status", returnTypeFilter);
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
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.totals{font-weight:bold;background-color:#f9f9f9;}</style>');
      printWindow.document.write('</head><body>');
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>CUSTOMER RETURNS REPORT</h2>');
      printWindow.document.write(`<p>${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</p>`);
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}</p>`);
      printWindow.document.write('</div>');
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Sl.No</th>');
      printWindow.document.write('<th>Return Date</th>');
      printWindow.document.write('<th>Customer Name</th>');
      printWindow.document.write('<th>Invoice No</th>');
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
        printWindow.document.write(`<td>${item.invoiceNo}</td>`);
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
    const wb = XLSX.utils.book_new();
    // Info sheet
    const info = [
      ['CUSTOMER RETURNS REPORT'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      [''],
      ['Period:', `${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`],
      [''],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(info);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');
    // Data sheet
    const ws = XLSX.utils.json_to_sheet(returnData.map((item) => ({
      'Sl.No': item.slNo,
      'Return Date': format(new Date(item.returnDate), "dd/MM/yyyy"),
      'Customer Name': item.customerName,
      'Invoice No': item.invoiceNo,
      'Product Name': item.productName,
      'Quantity': item.quantity,
      'Return Reason': item.returnReason,
      'Return Amount': item.returnAmount,
      'Status': item.refundStatus
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Returns');
    XLSX.writeFile(wb, `customer_returns_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.xlsx`);
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
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Customer">All Customer</SelectItem>
                    <SelectItem value="TROPIFRUIT STAND 100">TROPIFRUIT STAND 100</SelectItem>
                    <SelectItem value="F&R ENTERPRISE LTD">F&R ENTERPRISE LTD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Select value={returnTypeFilter} onValueChange={setReturnTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Returns">All Returns</SelectItem>
                    <SelectItem value="Processed">Processed</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full" onClick={() => setSearchClicked(v => !v)}>
                  Search
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
                    <TableHead>Invoice No</TableHead>
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
                      <TableCell>{returnItem.invoiceNo}</TableCell>
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