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
import { CalendarIcon, Calendar as CalendarIconTwo, FileText, Download, Copy, Printer, Search, TrendingUp } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DateWiseSalesData {
  id: number;
  date: string;
  totalSales: number;
  accountSales: number;
  cashSales: number;
  totalInvoices: number;
  averageSale: number;
  topProduct: string;
  topCustomer: string;
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

export default function DateWiseSales() {
  const [fromDate, setFromDate] = useState<Date>(subWeeks(new Date(), 1));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [salesType, setSalesType] = useState("All Sales");
  const [groupBy, setGroupBy] = useState("Daily");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchClicked, setSearchClicked] = useState(false);

  const { data: salesData = [], isLoading } = useQuery<DateWiseSalesData[]>({
    queryKey: [
      "date-wise-sales",
      fromDate && toLocalDateString(fromDate),
      toDate && toLocalDateString(toDate),
      salesType,
      groupBy,
      searchTerm,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      if (salesType) params.append("salesType", salesType);
      if (groupBy) params.append("groupBy", groupBy);
      if (searchTerm) params.append("search", searchTerm);
      return apiRequest("GET", `/api/reports/date-wise-sales?${params.toString()}`);
    },
    enabled: !!searchClicked,
  });

  const { data: companyDetails } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  const totals = {
    totalSales: salesData.reduce((sum, item) => sum + (item.totalSales || 0), 0),
    accountSales: salesData.reduce((sum, item) => sum + (item.accountSales || 0), 0),
    cashSales: salesData.reduce((sum, item) => sum + (item.cashSales || 0), 0),
    totalInvoices: salesData.reduce((sum, item) => sum + (item.totalInvoices || 0), 0),
    averageSale: salesData.length ? salesData.reduce((sum, item) => sum + (item.averageSale || 0), 0) / salesData.length : 0
  };

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Date Wise Sales Report</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.totals{font-weight:bold;background-color:#f9f9f9;}.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}</style>');
      printWindow.document.write('</head><body>');
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>DATE WISE SALES REPORT</h2>');
      printWindow.document.write(`<p>${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</p>`);
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}</p>`);
      printWindow.document.write('</div>');
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Date</th>');
      printWindow.document.write('<th>Total Sales</th>');
      printWindow.document.write('<th>Account Sales</th>');
      printWindow.document.write('<th>Cash Sales</th>');
      printWindow.document.write('<th>Total Invoices</th>');
      printWindow.document.write('<th>Average Sale</th>');
      printWindow.document.write('<th>Top Product</th>');
      printWindow.document.write('<th>Top Customer</th>');
      printWindow.document.write('</tr></thead><tbody>');
      salesData.forEach((sale) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${format(new Date(sale.date), "dd/MM/yyyy")}</td>`);
        printWindow.document.write(`<td>£${sale.totalSales.toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${(sale.accountSales || 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${sale.cashSales.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${sale.totalInvoices}</td>`);
        printWindow.document.write(`<td>£${sale.averageSale.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${sale.topProduct}</td>`);
        printWindow.document.write(`<td>${sale.topCustomer}</td>`);
        printWindow.document.write('</tr>');
      });
      printWindow.document.write('</tbody></table>');
      
      // Add footer text
      printWindow.document.write('<div class="footer">stand100</div>');
      
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
      ['DATE WISE SALES REPORT'],
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
    const ws = XLSX.utils.json_to_sheet(salesData.map((sale) => ({
      'Date': format(new Date(sale.date), "dd/MM/yyyy"),
      'Total Sales': sale.totalSales,
      'Account Sales': sale.accountSales || 0,
      'Cash Sales': sale.cashSales,
      'Total Invoices': sale.totalInvoices,
      'Average Sale': sale.averageSale,
      'Top Product': sale.topProduct,
      'Top Customer': sale.topCustomer
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Date Wise Sales');
    XLSX.writeFile(wb, `date_wise_sales_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.xlsx`);
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('DATE WISE SALES REPORT', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`, 105, 40, { align: 'center' });
    const tableData = salesData.map((sale) => [
      format(new Date(sale.date), "dd/MM/yyyy"),
      `£${sale.totalSales.toFixed(2)}`,
      `£${(sale.accountSales || 0).toFixed(2)}`,
      `£${sale.cashSales.toFixed(2)}`,
      sale.totalInvoices,
      `£${sale.averageSale.toFixed(2)}`,
      sale.topProduct,
      sale.topCustomer
    ]);
    autoTable(doc, {
      head: [[
        'Date', 'Total Sales', 'Account Sales', 'Cash Sales', 'Invoices', 'Avg Sale', 'Top Product', 'Top Customer'
      ]],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        halign: 'center'
      },
      headStyles: {
        fillColor: [147, 51, 234], // Purple color to match the theme
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center' }, // Date
        1: { cellWidth: 22, halign: 'center' }, // Total Sales
        2: { cellWidth: 22, halign: 'center' }, // Account Sales
        3: { cellWidth: 22, halign: 'center' }, // Cash Sales
        4: { cellWidth: 16, halign: 'center' }, // Total Invoices
        5: { cellWidth: 20, halign: 'center' }, // Average Sale
        6: { cellWidth: 25, halign: 'center' }, // Top Product
        7: { cellWidth: 25, halign: 'center' }  // Top Customer
      },
      margin: { left: 10, right: 10 }
    });
    
    // Add footer text "stand100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10, { align: 'right' });
    
    doc.save(`date_wise_sales_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Date\tTotal Sales\tAccount Sales\tCash Sales\tTotal Invoices\tAverage Sale\tTop Product\tTop Customer\n';
    text += salesData.map((sale) => [
      format(new Date(sale.date), "dd/MM/yyyy"),
      sale.totalSales,
      sale.accountSales || 0,
      sale.cashSales,
      sale.totalInvoices,
      sale.averageSale,
      sale.topProduct,
      sale.topCustomer
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
  };

  return (
    <PageLayout title="Date Wise Sales" breadcrumb="Historical Reports > Date Wise Sales">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <CalendarIconTwo size={20} />
                Date Wise Sales Report
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
                <Select value={salesType} onValueChange={setSalesType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Sales">All Sales</SelectItem>
                    <SelectItem value="Account Sales">Account Sales</SelectItem>
                    <SelectItem value="Cash Sales">Cash Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
           
              
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full" onClick={() => setSearchClicked(v => !v)}>
                  Generate Report
                </Button>
              </div>
             
            </div>
          </CardContent>
        </Card>

        {/* Sales Report Section */}
        <Card>
          <CardHeader>
            <div className="bg-purple-600 text-white text-center py-2 rounded">
              DATE WISE SALES ANALYSIS
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

            <Table>
              <TableHeader>
                <TableRow className="bg-purple-100">
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Total Sales</TableHead>
                  <TableHead className="text-center">Account Sales</TableHead>
                  <TableHead className="text-center">Cash Sales</TableHead>
                  <TableHead className="text-center">Total Invoices</TableHead>
                  <TableHead className="text-center">Average Sale</TableHead>
                  <TableHead>Top Product</TableHead>
                  <TableHead>Top Customer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-4">Loading...</TableCell>
                  </TableRow>
                ) : salesData.map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{format(new Date(sale.date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-center font-bold text-green-600">£{(sale.totalSales || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{(sale.accountSales || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{(sale.cashSales || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-center">{sale.totalInvoices || 0}</TableCell>
                    <TableCell className="text-center">£{(sale.averageSale || 0).toFixed(2)}</TableCell>
                    <TableCell>{sale.topProduct || ''}</TableCell>
                    <TableCell>{sale.topCustomer || ''}</TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-pink-50">
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-center font-bold text-green-600">£{(totals.totalSales || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£{(totals.accountSales || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£{(totals.cashSales || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.totalInvoices || 0}</TableCell>
                  <TableCell className="text-center font-bold">£{(totals.averageSale || 0).toFixed(2)}</TableCell>
                  <TableCell className="font-bold">-</TableCell>
                  <TableCell className="font-bold">-</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-blue-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Total Sales Period</div>
                <div className="text-2xl font-bold text-blue-600">£{totals.totalSales.toFixed(2)}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Daily Average</div>
                <div className="text-2xl font-bold text-green-600">£{(totals.totalSales / salesData.length).toFixed(2)}</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Total Invoices</div>
                <div className="text-2xl font-bold text-purple-600">{totals.totalInvoices}</div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Best Day</div>
                <div className="text-lg font-bold text-orange-600">
                  {salesData.length > 0
                    ? format(
                        new Date(
                          salesData.reduce(
                            (max, sale) => sale.totalSales > max.totalSales ? sale : max,
                            salesData[0]
                          ).date
                        ),
                        "dd/MM"
                      )
                    : "-"}
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {salesData.length} of {salesData.length} entries</div>
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