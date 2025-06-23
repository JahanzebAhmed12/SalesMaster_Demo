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
import { CalendarIcon, User, FileText, Download, Copy, Printer, Search, Mail, Save, User2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function CustomerHistory() {
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [filterType, setFilterType] = useState("Cast");
  const [searchTerm, setSearchTerm] = useState("");
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Fetch customers for dropdown
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Reset date fields to today every time the page is opened
  useEffect(() => {
    setFromDate(new Date());
    setToDate(new Date());
  }, []);

  // Export handlers
  const handlePrint = () => {
    if (!tableRef.current) return;
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(historyData.map((row: any) => ({
      'Sl.No': row.slNo,
      'Date': row.date,
      'Invoice #': row.invoiceNo,
      'Credit Inv.': row.creditInv,
      'Cash Inv.': row.cashInv,
      'Paid': row.paid,
      'Balance': row.balance,
      'Running Balance': row.runningBalance
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customer History');
    XLSX.writeFile(wb, 'customer-history.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.text('Customer History Statement', 10, 10);
    autoTable(doc, {
      head: [[
        'Sl.No', 'Date', 'Invoice #', 'Credit Inv.', 'Cash Inv.', 'Paid', 'Balance', 'Running Balance'
      ]],
      body: historyData.map((row: any) => [
        row.slNo,
        row.date,
        row.invoiceNo,
        row.creditInv,
        row.cashInv,
        row.paid,
        row.balance,
        row.runningBalance
      ]),
      startY: 20
    });
    doc.save('customer-history.pdf');
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tInvoice #\tCredit Inv.\tCash Inv.\tPaid\tBalance\tRunning Balance\n';
    text += historyData.map((row: any) => [
      row.slNo,
      row.date,
      row.invoiceNo,
      row.creditInv,
      row.cashInv,
      row.paid,
      row.balance,
      row.runningBalance
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
    // Optionally show a toast
  };

  return (
    <PageLayout title="Customer History" breadcrumb="Historical Reports > Customer History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <User size={20} />
                Customer History
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
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
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cast">Cash</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                    <SelectItem value="All">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                className="bg-blue-500 hover:bg-blue-600 "
                disabled={!selectedCustomer || loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await apiRequest(
                      "GET",
                      `/api/reports/customer-history?customerId=${selectedCustomer}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&filterType=${encodeURIComponent(filterType)}`
                    );
                    setHistoryData(res);
                  } catch (err) {
                    // handle error, e.g. show toast
                  }
                  setLoading(false);
                }}
              >
                {loading ? "Loading..." : "Search"}
              </Button>
              <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                <Mail size={16} />
                Send
              </Button>
              <Button className="bg-orange-500 hover:bg-orange-600 flex items-center gap-2 text-white">
                <Save size={16} />
                Save
              </Button>
              <Button className="bg-orange-500 hover:bg-orange-600 flex items-center gap-2 text-white">
                Full
              </Button>
              <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                <User2 size={16} />
                Statement
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Statement Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-lg">STATEMENT</CardTitle>
            <div className="text-left">
              <div className="font-medium">{selectedCustomer},</div>
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
                <Button size="sm" variant="outline" className="flex items-center gap-1">
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
                  <TableRow className="bg-blue-50">
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead className="text-center">📊</TableHead>
                    <TableHead className="text-center">Credit Inv.</TableHead>
                    <TableHead className="text-center">Cash Inv.</TableHead>
                    <TableHead className="text-center">Paid</TableHead>
                    <TableHead className="text-center">Credit /Adj</TableHead>
                    <TableHead className="text-center">Discount /Adj</TableHead>
                    <TableHead className="text-center">Balance</TableHead>
                    <TableHead className="text-center">Running Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-gray-500 py-8">
                        No data available in table
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyData.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.slNo}</TableCell>
                        <TableCell>{format(new Date(row.date), "yyyy-MM-dd")}</TableCell>
                        <TableCell>{row.invoiceNo}</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-center">£{row.creditInv.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{row.cashInv.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{row.paid.toFixed(2)}</TableCell>
                        <TableCell className="text-center"></TableCell>
                        <TableCell className="text-center"></TableCell>
                        <TableCell className="text-center font-medium">{row.balance.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{row.runningBalance.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-cyan-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell></TableCell>
                    <TableCell className="flex justify-center gap-1">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 bg-cyan-500 text-white">
                        📧
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 bg-cyan-500 text-white">
                        📄
                      </Button>
                    </TableCell>
                    <TableCell className="text-center font-bold">£ 0.00</TableCell>
                    <TableCell className="text-center font-bold">£ 0.00</TableCell>
                    <TableCell className="text-center font-bold">£ 0.00</TableCell>
                    <TableCell className="text-center font-bold">£ 0.00</TableCell>
                    <TableCell className="text-center font-bold">£ 0.00</TableCell>
                    <TableCell className="text-center font-bold">£ 0.00</TableCell>
                    <TableCell className="text-center font-bold">£ 0.00</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 0 to 0 of 0 entries</div>
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