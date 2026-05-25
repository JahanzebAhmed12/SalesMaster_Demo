import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Copy, Printer, ChevronUp } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DailyBookData {
  slNo: number;
  date: string;
  user: string;
  invoiceNo: string;
  customerName: string;
  account: number;
  accountPaid: number;
  cash: number;
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

function toLocalDateString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function DailyBookHistory() {
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 7));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [user, setUser] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [reportType, setReportType] = useState<string>("All");
  const [searchClicked, setSearchClicked] = useState(false);

  // Fetch users for dropdown
  const { data: users = [], isLoading: loadingUsers, error: usersError } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiRequest("GET", "/api/users"),
  });

  const { data: dailyBookData = [], isLoading } = useQuery<DailyBookData[]>({
    queryKey: [
      "daily-book-history",
      fromDate && toLocalDateString(fromDate),
      toDate && toLocalDateString(toDate),
      user,
      reportType,
      searchTerm,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      if (user && user !== "all") params.append("user", user);
      if (reportType) params.append("type", reportType);
      if (searchTerm) params.append("search", searchTerm);
      return apiRequest("GET", `/api/reports/daily-book-history?${params.toString()}`);
    },
    enabled: !!searchClicked,
  });

  const totals = {
    account: dailyBookData.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.account || 0), 0),
    accountPaid: dailyBookData.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.accountPaid || 0), 0),
    cash: dailyBookData.filter(i => !i.isCompany).reduce((sum, item) => sum + (item.cash || 0), 0)
  };

  const { data: companyDetails } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Daily Book History</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.totals{font-weight:bold;background-color:#f9f9f9;}.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}</style>');
      printWindow.document.write('</head><body>');
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>DAILY BOOK HISTORY REPORT</h2>');
      printWindow.document.write(`<p>${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</p>`);
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}</p>`);
      printWindow.document.write('</div>');
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Sl.No</th>');
      printWindow.document.write('<th>Date</th>');
      printWindow.document.write('<th>User</th>');
      printWindow.document.write('<th>Invoice No</th>');
      printWindow.document.write('<th>Customer Name</th>');
      printWindow.document.write('<th>Account</th>');
      printWindow.document.write('<th>Account Paid</th>');
      printWindow.document.write('<th>Cash</th>');
      printWindow.document.write('</tr></thead><tbody>');
      dailyBookData.forEach((item) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.slNo}</td>`);
        printWindow.document.write(`<td>${format(new Date(item.date), "dd-MM-yyyy")}</td>`);
        printWindow.document.write(`<td>${item.user}</td>`);
        printWindow.document.write(`<td>${item.invoiceNo}</td>`);
        printWindow.document.write(`<td>${item.customerName}</td>`);
        printWindow.document.write(`<td>£${(item.account || 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${(item.accountPaid || 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${(item.cash || 0).toFixed(2)}</td>`);
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
      ['DAILY BOOK HISTORY REPORT'],
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
    const ws = XLSX.utils.json_to_sheet(dailyBookData.map((item) => ({
      'Sl.No': item.slNo,
      'Date': format(new Date(item.date), "dd-MM-yyyy"),
      'User': item.user,
      'Invoice No': item.invoiceNo,
      'Customer Name': item.customerName,
      'Account': item.account || 0,
      'Account Paid': item.accountPaid || 0,
      'Cash': item.cash || 0
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Book History');
    XLSX.writeFile(wb, `daily_book_history_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.xlsx`);
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('DAILY BOOK HISTORY REPORT', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`, 105, 40, { align: 'center' });
    const tableData = dailyBookData.map((item) => [
      item.slNo,
      format(new Date(item.date), "dd-MM-yyyy"),
      item.user,
      item.invoiceNo,
      item.customerName,
      `£${(item.account || 0).toFixed(2)}`,
      `£${(item.accountPaid || 0).toFixed(2)}`,
      `£${(item.cash || 0).toFixed(2)}`
    ]);
    autoTable(doc, {
      head: [[
        'Sl.No', 'Date', 'User', 'Invoice No', 'Customer Name', 'Account', 'Account Paid', 'Cash'
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
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
        4: { cellWidth: 30 },
        5: { cellWidth: 20 },
        6: { cellWidth: 20 },
        7: { cellWidth: 20 }
      }
    });
    
    // Add footer text "stand100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10, { align: 'right' });
    
    doc.save(`daily_book_history_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tUser\tInvoice No\tCustomer Name\tAccount\tAccount Paid\tCash\n';
    text += dailyBookData.map((item) => [
      item.slNo,
      format(new Date(item.date), "dd-MM-yyyy"),
      item.user,
      item.invoiceNo,
      item.customerName,
      item.account || 0,
      item.accountPaid || 0,
      item.cash || 0
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
  };

  // Invoice button logic
  const handleInvoice = (invoiceNo: string) => {
    // Always open the standard invoice print page with path param
    const url = `/print/invoice/${invoiceNo}`;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Daily Book</h1>
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
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Filter Section */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">From Date:</label>
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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "From Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={date => date && setFromDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">To Date:</label>
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
                      {toDate ? format(toDate, "yyyy-MM-dd") : "To Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={date => date && setToDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Account">Account</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select value={user} onValueChange={setUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {loadingUsers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : users.map(u => (
                      <SelectItem key={u.username} value={u.username}>{u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Button className="bg-blue-600 hover:bg-blue-700 w-full" onClick={() => setSearchClicked(v => !v)}>
                  Search
                </Button>
              </div>

           
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input 
                    type="radio" 
                    name="reportType" 
                    value="All" 
                    checked={reportType === "All"}
                    onChange={(e) => setReportType(e.target.value)}
                  />
                  <span>All</span>
                </label>
                <label className="flex items-center gap-2">
                  <input 
                    type="radio" 
                    name="reportType" 
                    value="Cash" 
                    checked={reportType === "Cash"}
                    onChange={(e) => setReportType(e.target.value)}
                  />
                  <span>Cash</span>
                </label>
                <label className="flex items-center gap-2">
                  <input 
                    type="radio" 
                    name="reportType" 
                    value="Account" 
                    checked={reportType === "Account"}
                    onChange={(e) => setReportType(e.target.value)}
                  />
                  <span>Account</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export and Search Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handlePDF}>
                  <FileText className="w-4 h-4 mr-2" />
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExcel}>
                  Excel
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <label htmlFor="search">Search:</label>
                <input
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                  placeholder=""
                />
              </div>
            </div>

            {/* Responsive Table Container */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[120px]">User</TableHead>
                    <TableHead className="text-center min-w-[120px]">Invoice No</TableHead>
                    <TableHead className="text-center min-w-[150px]">Customer Name</TableHead>
                    <TableHead className="text-center min-w-[100px]">Account</TableHead>
                    <TableHead className="text-center min-w-[100px]">Account Paid</TableHead>
                    <TableHead className="text-center min-w-[100px]">Cash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : dailyBookData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">No data available</TableCell>
                    </TableRow>
                  ) : dailyBookData.map((item) => (
                    <TableRow key={item.slNo} className={cn(item.isCompany && "bg-amber-50")}>
                      <TableCell className="text-center">{item.slNo}</TableCell>
                      <TableCell className="text-center">{format(new Date(item.date), "dd-MM-yyyy")}</TableCell>
                      <TableCell className="text-center">{item.user}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <span className="flex gap-1">
                            <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 p-1 text-xs" onClick={() => handleInvoice(item.invoiceNo)}>
                              📄
                            </Button>
                          </span>
                          {item.invoiceNo}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="flex items-center gap-1 justify-center">
                          {item.customerName}
                          {item.isCompany && (
                            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 font-medium">CO</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">£ {(item.account || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {(item.accountPaid || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {(item.cash || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-blue-100 font-semibold">
                    <TableCell className="text-center" colSpan={5}>{dailyBookData.length} Items</TableCell>
                    <TableCell className="text-center">£ {totals.account.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {totals.accountPaid.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {totals.cash.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Summary and Pagination */}
            <div className="mt-4 space-y-4">
              <div className="text-sm text-gray-600">
                Showing {dailyBookData.length > 0 ? 1 : 0} to {dailyBookData.length} of {dailyBookData.length} entries
              </div>
              
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Previous</span>
                  <Button variant="outline" size="sm">1</Button>
                  <span className="text-sm">Next</span>
                </div>
                <div className="text-right font-semibold">
                  TOTAL CASH : £ {totals.cash.toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
