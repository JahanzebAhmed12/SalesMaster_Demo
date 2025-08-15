import { useState, useEffect } from "react";
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
import { CalendarIcon, Users, FileText, Download, Copy, Printer, Search, Loader2 } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CustomerData {
  id: number;
  slNo: number;
  customerName: string;
  accountInvoice: number;  // Changed from creditInvoice to accountInvoice
  cashInvoice: number;
  amountReceived: number;
  returnsDiscount: number;
  onAccount: number;
  balanceOutstanding: number;
  creditLimit: number;
  currency: string;
  isBadDebt: boolean;
  customerCode: string;
  address?: string;
  telephone?: string;
  email?: string;
}

interface ExcelDataRow {
  'Sl.No': number | string;
  'Customer Name': string;
  'Customer Code': string;
  'Account Invoice': number;  // Changed from 'Credit Invoice' to 'Account Invoice'
  'Cash Invoice': number;
  'Amount Received': number;
  'Returns/Discount': number;
  'On Account': number;
  'Balance Outstanding': number;
  'Credit Limit': number | string;
  'Currency': string;
}

interface ApiResponse {
  data: CustomerData[];
  totals: {
    accountInvoice: number;  // Changed from creditInvoice to accountInvoice
    cashInvoice: number;
    amountReceived: number;
    returnsDiscount: number;
    onAccount: number;
    balanceOutstanding: number;
  };
  currencyTotals: Record<string, {
    accountInvoice: number;  // Changed from creditInvoice to accountInvoice
    cashInvoice: number;
    amountReceived: number;
    returnsDiscount: number;
    onAccount: number;
    balanceOutstanding: number;
  }>;
  pagination: {
    currentPage: number;
    perPage: number;
    totalRecords: number;
    totalPages: number;
    showingFrom: number;
    showingTo: number;
  };
  filters: {
    fromDate: string;
    toDate: string;
    customerFilter: string;
    searchTerm: string;
    currency: string;
  };
}

export default function AllCustomerHistory() {
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState<Date>(subWeeks(new Date(), 1));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [customerFilter, setCustomerFilter] = useState("All Customer");
  const [searchTerm, setSearchTerm] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([]);
  
  // API state
  const [customerData, setCustomerData] = useState<CustomerData[]>([]);
  const [totals, setTotals] = useState({
    accountInvoice: 0,  // Changed from creditInvoice to accountInvoice
    cashInvoice: 0,
    amountReceived: 0,
    returnsDiscount: 0,
    onAccount: 0,
    balanceOutstanding: 0
  });
  const [currencyTotals, setCurrencyTotals] = useState<Record<string, any>>({});
  const [pagination, setPagination] = useState({
    currentPage: 1,
    perPage: 10,
    totalRecords: 0,
    totalPages: 0,
    showingFrom: 0,
    showingTo: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available currencies
  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const currencies = await apiRequest<string[]>("GET", "/api/reports/customer-currencies");
        setAvailableCurrencies(currencies);
      } catch (error) {
        console.error('Error fetching currencies:', error);
      }
    };
    fetchCurrencies();
  }, []);

  // Fetch customer history data
  const fetchCustomerHistory = async (page = 1) => {
    setLoading(true);
    setError(null);
    
    try {
      const formattedFromDate = fromDate ? format(fromDate, "yyyy-MM-dd") : "";
      const formattedToDate = toDate ? format(toDate, "yyyy-MM-dd") : "";
      
      const params = new URLSearchParams({
        fromDate: formattedFromDate,
        toDate: formattedToDate,
        customerFilter,
        search: searchTerm,
        currency: currencyFilter === "all" ? "" : currencyFilter,
        page: page.toString(),
        perPage: pagination.perPage.toString()
      });

      const result: ApiResponse = await apiRequest(
        "GET",
        `/api/reports/all-customer-history?${params}`
      );
      
      setCustomerData(result.data);
      setTotals(result.totals);
      setCurrencyTotals(result.currencyTotals);
      setPagination(result.pagination);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
      toast({
        title: "Error",
        description: "Failed to fetch customer history data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle search
  const handleSearch = () => {
    fetchCustomerHistory(1);
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    fetchCustomerHistory(page);
  };

  // Handle search term change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== "") {
        fetchCustomerHistory(1);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Initial load
  useEffect(() => {
    fetchCustomerHistory();
  }, [customerFilter, currencyFilter]);

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>All Customer History</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.totals{font-weight:bold;background-color:#f9f9f9;}');
      printWindow.document.write('.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>ALL CUSTOMER HISTORY</h2>');
      printWindow.document.write('<p>TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ</p>');
      printWindow.document.write(`<p>Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}</p>`);
      printWindow.document.write('</div>');
      
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Sl.No</th>');
      printWindow.document.write('<th>Customer Name</th>');
      printWindow.document.write('<th>Account Invoice</th>');
      printWindow.document.write('<th>Cash Invoice</th>');
      printWindow.document.write('<th>Amount Received</th>');
      printWindow.document.write('<th>Returns/Discount</th>');
      printWindow.document.write('<th>On Account</th>');
      printWindow.document.write('<th>Balance Outstanding</th>');
      printWindow.document.write('<th>Credit Limit</th>');
      printWindow.document.write('<th>Currency</th>');
      printWindow.document.write('</tr></thead>');
      
      printWindow.document.write('<tbody>');
      
      // Add customer rows
      customerData.forEach(customer => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${customer.slNo}</td>`);
        printWindow.document.write(`<td>${customer.customerName} (${customer.customerCode})</td>`);
        printWindow.document.write(`<td>${customer.accountInvoice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${customer.cashInvoice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${customer.amountReceived.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${customer.returnsDiscount.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${customer.onAccount.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${customer.balanceOutstanding.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${customer.creditLimit.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${customer.currency}</td>`);
        printWindow.document.write('</tr>');
      });
      
      // Add currency totals
      Object.entries(currencyTotals).forEach(([currency, currencyTotal]) => {
        printWindow.document.write('<tr class="totals">');
        printWindow.document.write('<td></td>');
        printWindow.document.write(`<td>TOTAL (${currency})</td>`);
        printWindow.document.write(`<td>${currencyTotal.accountInvoice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${currencyTotal.cashInvoice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${currencyTotal.amountReceived.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${currencyTotal.returnsDiscount.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${currencyTotal.onAccount.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${currencyTotal.balanceOutstanding.toFixed(2)}</td>`);
        printWindow.document.write('<td></td>');
        printWindow.document.write(`<td>${currency}</td>`);
        printWindow.document.write('</tr>');
      });
      
      // Add grand total
      printWindow.document.write('<tr class="totals">');
      printWindow.document.write('<td></td>');
      printWindow.document.write('<td>GRAND TOTAL</td>');
      printWindow.document.write(`<td>${totals.accountInvoice.toFixed(2)}</td>`);
      printWindow.document.write(`<td>${totals.cashInvoice.toFixed(2)}</td>`);
      printWindow.document.write(`<td>${totals.amountReceived.toFixed(2)}</td>`);
      printWindow.document.write(`<td>${totals.returnsDiscount.toFixed(2)}</td>`);
      printWindow.document.write(`<td>${totals.onAccount.toFixed(2)}</td>`);
      printWindow.document.write(`<td>${totals.balanceOutstanding.toFixed(2)}</td>`);
      printWindow.document.write('<td></td>');
      printWindow.document.write('<td></td>');
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

  const handleExcel = () => {
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Prepare data for Excel
    const excelData: ExcelDataRow[] = customerData.map(customer => ({
      'Sl.No': customer.slNo,
      'Customer Name': customer.customerName,
      'Customer Code': customer.customerCode,
      'Account Invoice': customer.accountInvoice,  // Changed from 'Credit Invoice'
      'Cash Invoice': customer.cashInvoice,
      'Amount Received': customer.amountReceived,
      'Returns/Discount': customer.returnsDiscount,
      'On Account': customer.onAccount,
      'Balance Outstanding': customer.balanceOutstanding,
      'Credit Limit': customer.creditLimit,
      'Currency': customer.currency
    }));
    
    // Add currency totals
    Object.entries(currencyTotals).forEach(([currency, currencyTotal]) => {
      excelData.push({
        'Sl.No': '',
        'Customer Name': `TOTAL (${currency})`,
        'Customer Code': '',
        'Account Invoice': currencyTotal.accountInvoice,
        'Cash Invoice': currencyTotal.cashInvoice,
        'Amount Received': currencyTotal.amountReceived,
        'Returns/Discount': currencyTotal.returnsDiscount,
        'On Account': currencyTotal.onAccount,
        'Balance Outstanding': currencyTotal.balanceOutstanding,
        'Credit Limit': '',
        'Currency': currency
      });
    });
    
    // Add grand total
    excelData.push({
      'Sl.No': '',
      'Customer Name': 'GRAND TOTAL',
      'Customer Code': '',
      'Account Invoice': totals.accountInvoice,
      'Cash Invoice': totals.cashInvoice,
      'Amount Received': totals.amountReceived,
      'Returns/Discount': totals.returnsDiscount,
      'On Account': totals.onAccount,
      'Balance Outstanding': totals.balanceOutstanding,
      'Credit Limit': '',
      'Currency': ''
    });
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, 'All Customer History');
    
    // Save file
    XLSX.writeFile(wb, `all_customer_history_${format(fromDate, "yyyyMMdd")}_${format(toDate, "yyyyMMdd")}.xlsx`);
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text('ALL CUSTOMER HISTORY', 105, 20, { align: 'center' });
    
    // Add company info
    doc.setFontSize(10);
    doc.text('TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ', 105, 30, { align: 'center' });
    
    // Add period info
    doc.text(`Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, 105, 40, { align: 'center' });
    
    // Prepare table data
    const tableData = customerData.map(customer => [
      customer.slNo.toString(),
      `${customer.customerName} (${customer.customerCode})`,
      customer.accountInvoice.toFixed(2),
      customer.cashInvoice.toFixed(2),
      customer.amountReceived.toFixed(2),
      customer.returnsDiscount.toFixed(2),
      customer.onAccount.toFixed(2),
      customer.balanceOutstanding.toFixed(2),
      customer.creditLimit.toFixed(2),
      customer.currency
    ]);
    
    // Add currency totals
    Object.entries(currencyTotals).forEach(([currency, currencyTotal]) => {
      tableData.push([
        '',
        `TOTAL (${currency})`,
        currencyTotal.accountInvoice.toFixed(2),
        currencyTotal.cashInvoice.toFixed(2),
        currencyTotal.amountReceived.toFixed(2),
        currencyTotal.returnsDiscount.toFixed(2),
        currencyTotal.onAccount.toFixed(2),
        currencyTotal.balanceOutstanding.toFixed(2),
        '',
        currency
      ]);
    });
    
    // Add grand total
    tableData.push([
      '',
      'GRAND TOTAL',
      totals.accountInvoice.toFixed(2),
      totals.cashInvoice.toFixed(2),
      totals.amountReceived.toFixed(2),
      totals.returnsDiscount.toFixed(2),
      totals.onAccount.toFixed(2),
      totals.balanceOutstanding.toFixed(2),
      '',
      ''
    ]);
    
    // Create table
    autoTable(doc, {
      head: [[
        'Sl.No', 'Customer Name', 'Account Inv.', 'Cash Inv.', 'Amount Rec.', 
        'Returns/Disc.', 'On Account', 'Balance Out.', 'Credit Limit', 'Currency'
      ]],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 7,
        cellPadding: 1
      },
      columnStyles: {
        0: { cellWidth: 12 },  // Sl.No
        1: { cellWidth: 35 },  // Customer Name
        2: { cellWidth: 18 },  // Account Inv.
        3: { cellWidth: 18 },  // Cash Inv.
        4: { cellWidth: 18 },  // Amount Rec.
        5: { cellWidth: 18 },  // Returns/Disc.
        6: { cellWidth: 18 },  // On Account
        7: { cellWidth: 18 },  // Balance Out.
        8: { cellWidth: 18 },  // Credit Limit
        9: { cellWidth: 12 }   // Currency
      },
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontSize: 7
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      }
    });
    
    // Add footer text "stand100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10, { align: 'right' });
    
    doc.save(`all_customer_history_${format(fromDate, "yyyyMMdd")}_${format(toDate, "yyyyMMdd")}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tCustomer Name\tCustomer Code\tAccount Invoice\tCash Invoice\tAmount Received\tReturns/Discount\tOn Account\tBalance Outstanding\tCredit Limit\tCurrency\n';
    
    // Add customer data
    customerData.forEach(customer => {
      text += `${customer.slNo}\t${customer.customerName}\t${customer.customerCode}\t${customer.accountInvoice.toFixed(2)}\t${customer.cashInvoice.toFixed(2)}\t${customer.amountReceived.toFixed(2)}\t${customer.returnsDiscount.toFixed(2)}\t${customer.onAccount.toFixed(2)}\t${customer.balanceOutstanding.toFixed(2)}\t${customer.creditLimit.toFixed(2)}\t${customer.currency}\n`;
    });
    
    // Add currency totals
    Object.entries(currencyTotals).forEach(([currency, currencyTotal]) => {
      text += `\tTOTAL (${currency})\t\t${currencyTotal.accountInvoice.toFixed(2)}\t${currencyTotal.cashInvoice.toFixed(2)}\t${currencyTotal.amountReceived.toFixed(2)}\t${currencyTotal.returnsDiscount.toFixed(2)}\t${currencyTotal.onAccount.toFixed(2)}\t${currencyTotal.balanceOutstanding.toFixed(2)}\t\t${currency}\n`;
    });
    
    // Add grand total
    text += `\tGRAND TOTAL\t\t${totals.accountInvoice.toFixed(2)}\t${totals.cashInvoice.toFixed(2)}\t${totals.amountReceived.toFixed(2)}\t${totals.returnsDiscount.toFixed(2)}\t${totals.onAccount.toFixed(2)}\t${totals.balanceOutstanding.toFixed(2)}\t\t\n`;
    
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

  return (
    <PageLayout title="All Customer History" breadcrumb="Historical Reports > All Customer History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Users size={20} />
                All Customer History
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-end md:gap-8">
              <div className="flex gap-4">
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
              </div>
              <div className="mt-4 md:mt-0">
                <Button 
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={handleSearch}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Search
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Customer">All Customer</SelectItem>
                    <SelectItem value="Exclude Bad Debt" className="bg-cyan-500 text-white">Exclude Bad Debt</SelectItem>
                    <SelectItem value="Show Bad Debt">Show Bad Debt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Currencies</SelectItem>
                    {availableCurrencies.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2" onClick={handlePrint}>
                  <Printer size={16} />
                  Print
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  Weekly statement
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Statement Section */}
        <Card>
          <CardHeader>
            <div className="bg-cyan-500 text-white text-center py-2 rounded">
              CUSTOMER STATEMENT (IN Respective Currency)
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

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">Loading customer data...</span>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-blue-100">
                      <TableHead>Sl.No</TableHead>
                      <TableHead>Customer name</TableHead>
                      <TableHead className="text-center">Account Invoice</TableHead>
                      <TableHead className="text-center">Cash Invoice</TableHead>
                      <TableHead className="text-center">Amount Received</TableHead>
                      <TableHead className="text-center">Returns/ Discount</TableHead>
                      <TableHead className="text-center">On Account</TableHead>
                      <TableHead className="text-center">Balance/ outstanding</TableHead>
                      <TableHead className="text-center">Credit Limit</TableHead>
                      <TableHead className="text-center">Curr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerData.map((customer) => (
                      <TableRow 
                        key={customer.id} 
                        className={cn(
                          "hover:bg-gray-50",
                          customer.isBadDebt && "bg-red-50"
                        )}
                      >
                        <TableCell>{customer.slNo}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{customer.customerName}</div>
                            <div className="text-sm text-gray-500">{customer.customerCode}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{customer.accountInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.cashInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.amountReceived.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.returnsDiscount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.onAccount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.balanceOutstanding.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.creditLimit.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.currency}</TableCell>
                      </TableRow>
                    ))}
                    
                    {/* Currency-wise totals */}
                    {Object.entries(currencyTotals).map(([currency, currencyTotal]) => (
                      <TableRow key={`currency-${currency}`} className="bg-gray-100 border-t">
                        <TableCell></TableCell>
                        <TableCell className="font-bold">{currency}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.accountInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.cashInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.amountReceived.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.returnsDiscount.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.onAccount.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.balanceOutstanding.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currency}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                    
                    {/* Total Row */}
                    <TableRow className="border-t-2 border-gray-300 bg-green-50">
                      <TableCell></TableCell>
                      <TableCell className="font-bold">TOTAL</TableCell>
                      <TableCell className="text-center font-bold">{totals.accountInvoice.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.cashInvoice.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.amountReceived.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.returnsDiscount.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.onAccount.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.balanceOutstanding.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">0.00</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                
                <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
                  <div>
                    Showing {pagination.showingFrom} to {pagination.showingTo} of {pagination.totalRecords} entries
                    {pagination.totalRecords > 0 && ` (filtered from ${pagination.totalRecords} total entries)`}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage - 1)}
                        disabled={pagination.currentPage <= 1}
                      >
                        Previous
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="bg-blue-500 text-white"
                      >
                        {pagination.currentPage}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage + 1)}
                        disabled={pagination.currentPage >= pagination.totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}