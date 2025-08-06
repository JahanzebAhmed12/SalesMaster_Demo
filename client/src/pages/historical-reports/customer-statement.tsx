import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Customer } from "@shared/schema";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Download, Copy, Printer, Search, Mail, Receipt } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

interface StatementData {
  id: number;
  slNo: number;
  date: string;
  invoiceNo: string;
  description: string;
  accountInv: number;  // Changed from creditInv to accountInv to match backend
  cashInv: number;
  paid: number;
  accountAdj: number;  // Changed from creditAdj to accountAdj to match backend
  discountAdj: number;
  balance: number;
  runningBalance: number;
}

export default function CustomerStatement() {
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [statementType, setStatementType] = useState("Full Statement");
  const [searchTerm, setSearchTerm] = useState("");
  const [statementData, setStatementData] = useState<StatementData[]>([]);
  const [loading, setLoading] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Fetch company details
  const { data: companyDetails, isLoading: isLoadingCompany } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // Fetch customers for dropdown
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  const totals = {
    accountInv: statementData.reduce((sum, item) => sum + (item.accountInv || 0), 0),
    cashInv: statementData.reduce((sum, item) => sum + (item.cashInv || 0), 0),
    paid: statementData.reduce((sum, item) => sum + (item.paid || 0), 0),
    accountAdj: statementData.reduce((sum, item) => sum + (item.accountAdj || 0), 0),
    discountAdj: statementData.reduce((sum, item) => sum + (item.discountAdj || 0), 0),
    balance: statementData.reduce((sum, item) => sum + (item.balance || 0), 0)
  };

  // Reset date fields to today every time the page is opened
  useEffect(() => {
    setFromDate(new Date());
    setToDate(new Date());
  }, []);

  // Send statement via email
  const handleSendStatement = async () => {
    if (!selectedCustomer || statementData.length === 0) {
      alert('Please select a customer and generate a statement first');
      return;
    }
    
    // Get customer email from selected customer
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    if (!selectedCustomerData?.email) {
      alert('Customer email not found. Please ensure the customer has an email address.');
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/send/customer-statement", {
        customerId: parseInt(selectedCustomer),
        fromDate: fromDate.toISOString().split('T')[0],
        toDate: toDate.toISOString().split('T')[0],
        statementType: 'Full Statement'
      });

      if (response.success) {
        alert('Customer statement email sent successfully!');
      } else {
        alert('Failed to send email: ' + response.message);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Please try again.');
    }
  };

  // Export handlers
  const handlePrint = () => {
    if (!tableRef.current) return;
    
    // Get customer details
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Customer Statement</title>');
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
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      
      // Add company header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>CUSTOMER STATEMENT</h2>');
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
      printWindow.document.write(`<strong>Statement Period:</strong> ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`);
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
    // Get customer details
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    
    // Create workbook with multiple sheets
    const wb = XLSX.utils.book_new();
    
    // Add customer info sheet
    const customerInfo = [
      ['CUSTOMER STATEMENT'],
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
      ['Statement Period:', `${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`],
      ['Statement Type:', statementType],
      [''],
    ];
    
    const wsInfo = XLSX.utils.aoa_to_sheet(customerInfo);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Customer Info');
    
    // Add data sheet
    const ws = XLSX.utils.json_to_sheet(statementData.map((row: StatementData) => ({
      'Sl.No': row.slNo,
      'Date': row.date,
      'Invoice #': row.invoiceNo,
      'Description': row.description,
      'Credit Inv.': row.accountInv,
      'Cash Inv.': row.cashInv,
      'Paid': row.paid,
      'Credit/Adj': row.accountAdj,
      'Discount/Adj': row.discountAdj,
      'Balance': row.balance,
      'Running Balance': row.runningBalance
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Statement');
    
    XLSX.writeFile(wb, 'customer-statement.xlsx');
  };

  const handlePDF = () => {
    // Get customer details
    const selectedCustomerData = customers.find(c => c.id.toString() === selectedCustomer);
    
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text('CUSTOMER STATEMENT', 105, 20, { align: 'center' });
    
    // Add company info
    doc.setFontSize(10);
    if (companyDetails) {
      doc.text(`${companyDetails.companyName}, ${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    }
    
    // Add customer info
    doc.setFontSize(12);
    doc.text('Customer Information:', 20, 45);
    doc.setFontSize(10);
    if (selectedCustomerData) {
      doc.text(`Name: ${selectedCustomerData.customer_name}`, 20, 55);
      if (selectedCustomerData.address) {
        doc.text(`Address: ${selectedCustomerData.address}`, 20, 65);
      }
      if (selectedCustomerData.telephone) {
        doc.text(`Phone: ${selectedCustomerData.telephone}`, 20, 75);
      }
      if (selectedCustomerData.email) {
        doc.text(`Email: ${selectedCustomerData.email}`, 20, 85);
      }
    }
    
    // Add period and statement type info
    doc.setFontSize(12);
    doc.text(`Statement Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, 20, 100);
    doc.text(`Statement Type: ${statementType}`, 20, 110);
    
    // Add table
    autoTable(doc, {
      head: [[
        'Sl.No', 'Date', 'Invoice #', 'Description', 'Credit Inv.', 'Cash Inv.', 'Paid', 'Credit/Adj', 'Discount/Adj', 'Balance', 'Running Balance'
      ]],
      body: statementData.map((row: StatementData) => [
        row.slNo,
        row.date,
        row.invoiceNo,
        row.description,
        row.accountInv,
        row.cashInv,
        row.paid,
        row.accountAdj,
        row.discountAdj,
        row.balance,
        row.runningBalance
      ]),
      startY: 120,
    });
    
    doc.save('customer-statement.pdf');
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tInvoice #\tDescription\tCredit Inv.\tCash Inv.\tPaid\tCredit/Adj\tDiscount/Adj\tBalance\tRunning Balance\n';
    text += statementData.map((row: StatementData) => [
      row.slNo,
      row.date,
      row.invoiceNo,
      row.description,
      row.accountInv,
      row.cashInv,
      row.paid,
      row.accountAdj,
      row.discountAdj,
      row.balance,
      row.runningBalance
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
    // Optionally show a toast
  };

  return (
    <PageLayout title="Customer Statement" breadcrumb="Historical Reports > Customer Statement">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Receipt size={20} />
                Customer Statement
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
                <Select value={statementType} onValueChange={setStatementType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full Statement">Full Statement</SelectItem>
                    <SelectItem value="Outstanding Only">Outstanding Only</SelectItem>
                    <SelectItem value="Paid Only">Paid Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Button
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  disabled={!selectedCustomer || loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await apiRequest(
                        "GET",
                        `/api/reports/customer-statement?customerId=${selectedCustomer}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&type=${encodeURIComponent(statementType)}`
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
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2" onClick={handleSendStatement}>
                  <Mail size={16} />
                  Email
                </Button>
                <Button 
                  className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2"
                  disabled={!selectedCustomer || statementData.length === 0}
                  onClick={handlePrint}
                >
                  <Printer size={16} />
                  Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statement Details Section */}
        <Card>
          <CardHeader>
            <div className="bg-green-600 text-white text-center py-2 rounded">
              ACCOUNT STATEMENT - {selectedCustomer}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-semibold">Customer Details:</div>
                <div>{customers.find(c => c.id.toString() === selectedCustomer)?.customer_name || ''}</div>
                <div>Account No: C-{selectedCustomer}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">Statement Period:</div>
                <div>From: {fromDate ? format(fromDate, "dd/MM/yyyy") : ""}</div>
                <div>To: {toDate ? format(toDate, "dd/MM/yyyy") : ""}</div>
              </div>
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
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <div className="flex justify-between">
                  <span className="font-medium">BROUGHT FORWARD:</span>
                  <span className="font-bold">£ 0.00</span>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="bg-green-100">
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Credit Inv.</TableHead>
                    <TableHead className="text-center">Cash Inv.</TableHead>
                    <TableHead className="text-center">Paid</TableHead>
                    <TableHead className="text-center">Credit/Adj</TableHead>
                    <TableHead className="text-center">Discount/Adj</TableHead>
                    <TableHead className="text-center">Balance</TableHead>
                    <TableHead className="text-center">Running Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statementData.map((statement) => (
                    <TableRow key={statement.id} className="hover:bg-gray-50">
                      <TableCell>{statement.slNo}</TableCell>
                      <TableCell>{format(new Date(statement.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{statement.invoiceNo}</TableCell>
                      <TableCell>{statement.description}</TableCell>
                      <TableCell className="text-center">£{(statement.accountInv || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{(statement.cashInv || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{(statement.paid || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{(statement.accountAdj || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{(statement.discountAdj || 0).toFixed(2)}</TableCell>
                      <TableCell className={`text-center font-medium ${(statement.balance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        £{(statement.balance || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-center font-bold ${(statement.runningBalance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        £{(statement.runningBalance || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-indigo-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">TOTAL</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center font-bold">£{totals.accountInv.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.cashInv.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.paid.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.accountAdj.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.discountAdj.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£{totals.balance.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold text-red-600">£{(statementData[statementData.length - 1]?.runningBalance || 0).toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            <div className="mt-6 p-4 bg-gray-50 rounded">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold mb-2">Summary:</div>
                  <div>Total Credit Sales: £{totals.accountInv.toFixed(2)}</div>
                  <div>Total Payments: £{totals.paid.toFixed(2)}</div>
                  <div>Total Adjustments: £{(totals.accountAdj + totals.discountAdj).toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold mb-2 text-lg">Current Balance:</div>
                  <div className={`text-2xl font-bold ${(statementData[statementData.length - 1]?.runningBalance || 0) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    £{(statementData[statementData.length - 1]?.runningBalance || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {statementData.length} of {statementData.length} entries</div>
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