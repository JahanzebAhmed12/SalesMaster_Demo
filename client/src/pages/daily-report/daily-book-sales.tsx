import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "shared/schema";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, BarChart3, FileText, Download, Copy, Search, Eye, Info, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Mail, Printer, Package, MessageCircle, CreditCard, Banknote } from "lucide-react";
import classNames from 'classnames';

interface SalesEntry {
  id: number;
  slNo: number;
  date: string;
  salesman: string;
  boxes: number;
  invoiceNo: string;
  customerName: string;
  customerId: number;
  vat: number;
  amount: number;
  cash: number;
  bank?: number;
  credit?: number;
}

export default function DailyBookSales() {
  // Set default state to today and all filters
  const today = new Date();
  const [fromDate, setFromDate] = useState<Date>(today);
  const [toDate, setToDate] = useState<Date>(today);
  const [paymentType, setPaymentType] = useState("All");
  const [userFilter, setUserFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [user, setUser] = useState<any>(null);
  const [dailyBookType, setDailyBookType] = useState<'all' | 'own' | null>(null);
  const [loadingUserType, setLoadingUserType] = useState(true);
  const [selectedSales, setSelectedSales] = useState<Set<number>>(new Set());
  const [isUpdatingPayments, setIsUpdatingPayments] = useState(false);
  
  // Fetch users for the salesman dropdown
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users"),
  });

  // Fetch sales data from backend
  const { data: rawSalesData = [], isLoading: isLoadingSales, refetch: refetchSales } = useQuery<any[]>({
    queryKey: [
      "daily-book-sales",
      fromDate,
      toDate,
      paymentType,
      userFilter,
      searchTerm,
    ],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/reports/daily-book-sales?fromDate=${fromDate ? format(fromDate, "yyyy-MM-dd") : ""}` +
          `&toDate=${toDate ? format(toDate, "yyyy-MM-dd") : ""}` +
          `&paymentType=${paymentType}` +
          `&salesman=${userFilter}` +
          `&search=${encodeURIComponent(searchTerm)}`
      ),
  });

  // Map 'account' to 'amount' for compatibility
  const salesData: SalesEntry[] = rawSalesData.map((item: any) => ({
    ...item,
    amount: item.amount !== undefined ? item.amount : item.account !== undefined ? item.account : 0,
    credit: item.credit !== undefined ? item.credit : 0,
  }));

  const totalBoxes = useMemo(() => salesData.reduce((sum, item) => sum + item.boxes, 0), [salesData]);
  const totalVAT = useMemo(() => salesData.reduce((sum, item) => sum + item.vat, 0), [salesData]);
  const totalAmount = useMemo(() => salesData.reduce((sum, item) => sum + item.amount, 0), [salesData]);
  const totalCash = useMemo(() => salesData.reduce((sum, item) => sum + item.cash, 0), [salesData]);
  const totalBank = useMemo(() => salesData.reduce((sum, item) => sum + (item.bank || 0), 0), [salesData]);
  const totalCredit = useMemo(() => salesData.reduce((sum, item) => sum + (item.credit || 0), 0), [salesData]);

  const tableRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    async function fetchUserAndType() {
      setLoadingUserType(true);
      try {
        const userRes = await apiRequest("GET", "/api/auth/me");
        setUser(userRes);
        const typeRes = await apiRequest("GET", `/api/user-daily-book-type/${userRes.id}`);
        setDailyBookType(typeRes.type || 'all');
        if (typeRes.type === 'own') {
          setUserFilter(userRes.username);
        } else {
          setUserFilter('all');
        }
      } catch (e) {
        setDailyBookType('all');
        setUserFilter('all');
      } finally {
        setLoadingUserType(false);
      }
    }
    fetchUserAndType();
    // eslint-disable-next-line
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
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(salesData.map((item: SalesEntry) => ({
      'Sl.No': item.slNo,
      'Date': item.date,
      'Boxes': item.boxes,
      'Invoice No': item.invoiceNo,
      'Customer Name': item.customerName,
      'Account': item.amount,
      'Cash': item.cash,
      'Bank Transfer': item.bank || 0,
      'Credit': item.credit || 0
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Book Sales');
    XLSX.writeFile(wb, 'daily-book-sales.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Daily Book Sales', 14, 16);
    doc.setFontSize(10);
    // Table first
    autoTable(doc, {
      head: [[
        'Sl.No', 'Date', 'Boxes', 'Invoice No', 'Customer Name', 'Account', 'Cash', 'Bank Transfer', 'Credit'
      ]],
      body: salesData.map((item: SalesEntry) => [
        item.slNo,
        item.date,
        item.boxes,
        item.invoiceNo,
        item.customerName,
        item.amount,
        item.cash,
        item.bank || 0,
        item.credit || 0
      ]),
      startY: 22,
    });
    // Add summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || 22;
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(12, finalY + 6, 185, 18, 'F');
    doc.setTextColor(40);
    doc.setFont('helvetica', 'bold');
    doc.text(`Date Range:`, 16, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`${fromDate ? format(fromDate, 'yyyy-MM-dd') : '-'} to ${toDate ? format(toDate, 'yyyy-MM-dd') : '-'}`, 46, finalY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Boxes:`, 90, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`${totalBoxes}`, 115, finalY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total VAT:`, 140, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`£${totalVAT.toFixed(2)}`, 165, finalY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Amount:`, 16, finalY + 22);
    doc.setFont('helvetica', 'normal');
    doc.text(`£${totalAmount.toFixed(2)}`, 46, finalY + 22);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Cash:`, 90, finalY + 22);
    doc.setFont('helvetica', 'normal');
    doc.text(`£${totalCash.toFixed(2)}`, 115, finalY + 22);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.save('daily-book-sales.pdf');
  };

  const handleCopy = () => {
    const header = ['Sl.No', 'Date', 'Boxes', 'Invoice No', 'Customer Name', 'Account', 'Cash', 'Bank Transfer', 'Credit'];
    const rows = salesData.map((item: SalesEntry) => [
      item.slNo,
      item.date,
      item.boxes,
      item.invoiceNo,
      item.customerName,
      item.amount,
      item.cash,
      0, // Placeholder for bank transfer
      item.credit || 0
    ]);
    const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    alert('Table copied to clipboard!');
  };

  // Handle checkbox selection
  const handleCheckboxChange = (saleId: number, checked: boolean) => {
    setSelectedSales(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(saleId);
      } else {
        newSet.delete(saleId);
      }
      return newSet;
    });
  };

  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSales(new Set(salesData.map(sale => sale.id)));
    } else {
      setSelectedSales(new Set());
    }
  };

  // Update selected sales to cash payment
  const handleUpdateToCash = async () => {
    if (selectedSales.size === 0) {
      alert('Please select at least one sale to update.');
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to cash payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
      
      // Process each selected sale
      for (const sale of selectedSalesData) {
        if (sale.amount > 0) { // Only process sales with account amounts
          const paymentData = {
            customerId: sale.customerId,
            saleId: sale.id,
            amount: sale.amount,
            paymentMode: 'cash',
            paymentDate: format(new Date(), 'yyyy-MM-dd'),
            remarks: `Updated from account to cash via daily book sales`
          };

          await apiRequest('POST', '/api/payments', paymentData);
        }
      }

      alert(`Successfully updated ${selectedSales.size} sales to cash payment.`);
      setSelectedSales(new Set()); // Clear selection
      refetchSales(); // Refresh the data
    } catch (error) {
      console.error('Error updating payments:', error);
      alert('Error updating payments. Please try again.');
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Update selected sales to card payment
  const handleUpdateToCard = async () => {
    if (selectedSales.size === 0) {
      alert('Please select at least one sale to update.');
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to card payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
      
      // Process each selected sale
      for (const sale of selectedSalesData) {
        if (sale.amount > 0) { // Only process sales with account amounts
          const paymentData = {
            customerId: sale.customerId,
            saleId: sale.id,
            amount: sale.amount,
            paymentMode: 'bank',
            paymentDate: format(new Date(), 'yyyy-MM-dd'),
            remarks: `Updated from account to card via daily book sales`
          };

          await apiRequest('POST', '/api/payments', paymentData);
        }
      }

      alert(`Successfully updated ${selectedSales.size} sales to card payment.`);
      setSelectedSales(new Set()); // Clear selection
      refetchSales(); // Refresh the data
    } catch (error) {
      console.error('Error updating payments:', error);
      alert('Error updating payments. Please try again.');
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Update selected sales to account payment
  const handleUpdateToAccount = async () => {
    if (selectedSales.size === 0) {
      alert('Please select at least one sale to update.');
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to account payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
      
      // Process each selected sale - reverse any existing payments back to account
      for (const sale of selectedSalesData) {
        if (sale.cash > 0 || (sale.bank && sale.bank > 0)) { // Only process sales with cash/bank payments
          // Calculate total paid amount to reverse
          const totalPaidAmount = (sale.cash || 0) + (sale.bank || 0);
          
          if (totalPaidAmount > 0) {
            const paymentData = {
              customer_id: sale.customerId,
              sale_id: sale.id,
              amount: -totalPaidAmount, // Negative amount to reverse payment
              payment_mode: 'account',
              payment_date: format(new Date(), 'yyyy-MM-dd'),
              remarks: `Reversed to account via daily book sales - was ${sale.cash > 0 ? 'cash' : 'card'} payment`
            };
            
            console.log('Reversing payment:', paymentData); // Debug log
            await apiRequest('POST', '/api/payments', paymentData);
          }
        }
      }

      alert(`Successfully updated ${selectedSales.size} sales to account payment.`);
      setSelectedSales(new Set()); // Clear selection
      refetchSales(); // Refresh the data
    } catch (error) {
      console.error('Error updating to account payment:', error);
      alert('Failed to update some sales to account payment. Check console for details.');
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Helper for WhatsApp and Email
  const sendInvoiceEmail = async (sale: SalesEntry) => {
    try {
      // Call backend endpoint to send invoice email for this sale
      await apiRequest('POST', `/api/sales/${sale.invoiceNo}/send`, {
        customerId: sale.customerId
      });
      alert('Invoice email sent!');
    } catch (e) {
      alert('Failed to send invoice email.');
    }
  };
  const sendWhatsApp = async (sale: SalesEntry) => {
    // You need to get the phone number and invoice URL (assume invoice PDF is at `/print/invoice/:invoiceNo`)
    const phone = prompt('Enter WhatsApp number (E.164 format, e.g. +441234567890):');
    if (!phone) return;
    const invoiceUrl = `${window.location.origin}/print/invoice/${sale.invoiceNo}`;
    try {
      await apiRequest('POST', '/api/send/whatsapp-invoice', {
        phoneNumber: phone,
        invoiceUrl,
        message: 'Your invoice is attached.'
      });
      alert('WhatsApp message sent!');
    } catch (e) {
      alert('Failed to send WhatsApp message.');
    }
  };
  const pay = async (sale: SalesEntry, mode: 'cash' | 'bank') => {
    try {
      await apiRequest('POST', '/api/payments', {
        customer_id: sale.customerId,
        sale_id: sale.id,
        amount: sale.amount,
        payment_mode: mode,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        remarks: `Paid via daily book sales (${mode})`
      });
      alert(`Payment (${mode}) successful!`);
      refetchSales();
    } catch (e) {
      alert('Payment failed.');
      return; // Don't open receipt if payment failed
    }
    
    // Open payment receipt instead of invoice
    const paymentType = mode === 'cash' ? 'cash' : 'card';
    window.open(`/print/payment-receipt/${sale.id}/${paymentType}`, '_blank');
  };

  if (loadingUserType) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin mr-2" /> Loading user settings...
      </div>
    );
  }

  return (
    <PageLayout title="Daily Book" breadcrumb="Daily Report > Daily Book Sales">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Daily Book Sales</CardTitle>
            <div className="flex gap-2 items-center">
            
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:grid md:grid-cols-6 gap-4 items-end">
              <div className="w-full">
                <Label>From Date:</Label>
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
              
              <div className="w-full">
                <Label>To Date:</Label>
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
              
              <div className="w-full">
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-full">
                <Select value={userFilter} onValueChange={setUserFilter} disabled={dailyBookType === 'own'}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Salesmen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {isLoadingUsers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      users?.map((user: User) => (
                        <SelectItem key={user.id} value={user.username}>
                          {user.username}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-full">
                <Button className="bg-blue-500 hover:bg-blue-600 w-full">
                  Search
                </Button>
              </div>
              
              <div className="flex gap-2 w-full md:w-auto">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2 w-full md:w-auto"
                variant="default"
                onClick={() => navigate("/daily-report/daily-sales-full-view")}>
                  
                  <Eye size={16} />
                  Full View
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                  <FileText size={14} /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                  <Download size={14} /> Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                  <Copy size={14} /> Copy
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                  <Printer size={14} /> Print
                </Button>
              </div>
              <div className="flex items-center gap-2">
                {/* Action bar above table */}
                <div className="flex items-center gap-2">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleUpdateToCash}
                    disabled={selectedSales.size === 0}
                  >
                    Paid (Cash) - {selectedSales.size}
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleUpdateToCard}
                    disabled={selectedSales.size === 0}
                  >
                    Pay Card - {selectedSales.size}
                  </Button>
                  <Button
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={handleUpdateToAccount}
                    disabled={selectedSales.size === 0}
                  >
                    Paid Account - {selectedSales.size}
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
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto" ref={tableRef}>
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 min-w-[48px]">
                      <input 
                        type="checkbox" 
                        className="rounded"
                        checked={selectedSales.size === salesData.length && salesData.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="min-w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[80px]"># Boxes</TableHead>
                    <TableHead className="min-w-[140px]">Invoice No</TableHead>
                    <TableHead className="min-w-[180px]">Customer Name</TableHead>
                    <TableHead className="min-w-[130px] text-right">Accounts</TableHead>
                    <TableHead className="min-w-[120px] text-right">Cash</TableHead>
                    <TableHead className="min-w-[120px] text-right">Card Payment</TableHead>
                    <TableHead className="min-w-[120px] text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingSales ? (
                    <TableRow>
                      <TableCell colSpan={10}>Loading...</TableCell>
                    </TableRow>
                  ) : (
                    salesData.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>
                          <input 
                            type="checkbox" 
                            className="rounded"
                            checked={selectedSales.has(sale.id)}
                            onChange={(e) => handleCheckboxChange(sale.id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>{format(new Date(sale.date), "yyyy-MM-dd")}</TableCell>
                        <TableCell className="text-center">{sale.boxes}</TableCell>
                        <TableCell>{/* Invoice No as link */}
                          <Button variant="link" className="p-0 text-blue-600 underline" onClick={() => window.open(`/data-entry/sales-invoice?invoiceNumber=${sale.invoiceNo}`, '_self')}>
                            {sale.invoiceNo}
                          </Button>
                        </TableCell>
                        <TableCell className="text-blue-600">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="link" className="p-0 text-blue-600 underline cursor-pointer">
                                {sale.customerName}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem className="text-lg py-3" onClick={() => window.open(`/print/invoice/${sale.invoiceNo}`, '_blank')}>
                                <Printer className="mr-2 h-5 w-5" /> Print Ticket
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => window.open(`/print/packing-list/${sale.invoiceNo}`, '_blank')}>
                                <Package className="mr-2 h-5 w-5" /> Print Pickingticket
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => sendInvoiceEmail(sale)}>
                                <Mail className="mr-2 h-5 w-5" /> Email
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => sendWhatsApp(sale)}>
                                <MessageCircle className="mr-2 h-5 w-5" /> WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => pay(sale, 'cash')}>
                                <Banknote className="mr-2 h-5 w-5" /> Pay (Cash)
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => pay(sale, 'bank')}>
                                <CreditCard className="mr-2 h-5 w-5" /> Pay (Bank)
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell className="text-right">£{Number(sale.amount ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">£{Number(sale.cash ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">£{Number(sale.bank ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-red-600">{sale.credit?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "0.00"}</TableCell>
                      </TableRow>
                    ))
                  )}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">{salesData.length} Items</TableCell>
                    <TableCell className="text-center font-bold">{totalBoxes}</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-bold">£{totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold">£{totalCash.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold">£{totalBank.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold text-red-600">£{totalCredit.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {/* Summary moved below table, styled for print and screen */}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mt-6 p-4 bg-gray-50 rounded-lg border print:mt-6 print:p-4 print:bg-white print:border print:rounded-lg print:flex-row print:items-center print:gap-x-8 print:gap-y-2">
                <div className="flex items-center font-semibold mr-2">Date Range:</div>
                <div className="mr-6">{fromDate ? format(fromDate, 'yyyy-MM-dd') : '-'} to {toDate ? format(toDate, 'yyyy-MM-dd') : '-'}</div>
                <div className="flex items-center font-semibold mr-2">Total Boxes:</div>
                <div className="mr-6">{totalBoxes}</div>
                <div className="flex items-center font-semibold mr-2">Total VAT:</div>
                <div className="mr-6">£{totalVAT.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Amount:</div>
                <div className="mr-6">£{totalAmount.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Cash:</div>
                <div>£{totalCash.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Bank:</div>
                <div>£{totalBank.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Credit:</div>
                <div>£{totalCredit.toFixed(2)}</div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to 1 of 1 entries</div>
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