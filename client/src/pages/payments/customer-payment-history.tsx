import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Customer } from "@shared/schema";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface PaymentHistoryData {
  id: number;
  paymentDate: string;
  paymentMode: string;
  amount: number;
  customerName: string;
  customerId: number;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAmount: number | null;
  remarks: string | null;
  createdAt: string | null;
}

export default function CustomerPaymentHistory() {
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [fromDate, setFromDate] = useState<Date | undefined>(new Date());
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [selectedFilter, setSelectedFilter] = useState<string>("All");

  // Fetch customers for the dropdown
  const { data: customers, isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Build query parameters for payment history
  const queryParams = new URLSearchParams();
  if (selectedCustomer && selectedCustomer !== "all") {
    queryParams.append("customerId", selectedCustomer);
  }
  if (fromDate) {
    queryParams.append("fromDate", format(fromDate, "yyyy-MM-dd"));
  }
  if (toDate) {
    queryParams.append("toDate", format(toDate, "yyyy-MM-dd"));
  }
  if (selectedFilter && selectedFilter !== "All") {
    queryParams.append("paymentMode", selectedFilter);
  }

  // Fetch payment history
  const { data: paymentHistory, isLoading: isLoadingPayments, refetch } = useQuery<PaymentHistoryData[]>({
    queryKey: ["/api/payments/history", queryParams.toString()],
    queryFn: () => apiRequest("GET", `/api/payments/history?${queryParams.toString()}`),
  });

  const handleSubmit = () => {
    refetch();
  };

  useEffect(() => {
    // Auto search on mount with default values
    handleSubmit();
    // eslint-disable-next-line
  }, []);

  const totalAmount = paymentHistory?.reduce((sum, payment) => sum + payment.amount, 0) || 0;

  // Export handlers
  const handlePrint = () => {
    const printContents = document.getElementById('customer-payment-table')?.innerHTML;
    if (!printContents) return;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}@media print{body{margin:0;}}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write('<div style="font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;">TROPIFRUIT UK LTD</div>');
      printWindow.document.write('<div style="font-size:16px;font-weight:bold;text-align:center;margin-bottom:8px;">Customer Payment History</div>');
      // Remove serial number and payment id columns from print
      let tableHtml = printContents
        .replace(/<th[^>]*>\s*Sl\.No\.?\s*<\/th>/gi, '')
        .replace(/<th[^>]*>\s*Payment Id\s*<\/th>/gi, '')
        .replace(/<td[^>]*>\s*\d+\s*<\/td>/gi, '') // Remove serial number cells
        .replace(/<td[^>]*>\s*\d+\s*<\/td>/gi, ''); // Remove payment id cells (if needed)
      printWindow.document.write(tableHtml);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('TROPIFRUIT UK LTD', 14, 16);
    doc.setFontSize(13);
    doc.text('Customer Payment History', 14, 24);
    autoTable(doc, {
      head: [[
        //'Sl.No',
        'Payment Date', 'Payment mode', /*'Payment Id',*/ 'Recd Amt', 'Inv No.', 'Inv Dt.', 'Customer', 'Invoice Amt', 'Allocated', 'Remarks'
      ]],
      body: (Array.isArray(paymentHistory) ? paymentHistory : []).map((payment) => [
        // skip serial number and payment id
        payment.paymentDate ? format(new Date(payment.paymentDate), 'dd/MM/yyyy') : '',
        payment.paymentMode,
        // payment.id, // removed
        `£${Number(payment.amount).toFixed(2)}`,
        payment.invoiceNumber || '-',
        payment.invoiceDate ? format(new Date(payment.invoiceDate), 'dd/MM/yyyy') : '-',
        payment.customerName,
        payment.invoiceAmount ? `£${Number(payment.invoiceAmount).toFixed(2)}` : '-',
        `£${Number(payment.amount).toFixed(2)}`,
        payment.remarks || '-'
      ]),
      startY: 30,
    });
    doc.save('customer-payment-history.pdf');
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet((paymentHistory || []).map((payment) => ({
      //'Sl.No': idx + 1,
      'Payment Date': payment.paymentDate ? format(new Date(payment.paymentDate), 'dd/MM/yyyy') : '',
      'Payment mode': payment.paymentMode,
      // 'Payment Id': payment.id,
      'Recd Amt': payment.amount,
      'Inv No.': payment.invoiceNumber || '-',
      'Inv Dt.': payment.invoiceDate ? format(new Date(payment.invoiceDate), 'dd/MM/yyyy') : '-',
      'Customer': payment.customerName,
      'Invoice Amt': payment.invoiceAmount || '',
      'Allocated': payment.amount,
      'Remarks': payment.remarks || '-'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Payment History');
    XLSX.writeFile(wb, 'customer-payment-history.xlsx');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">TROPIFRUIT UK LTD</h1>
            <div className="text-sm text-gray-500">
              3 Dolphin Way, Purfleet, RM19 1NZ, ...
            </div>
          </div>
          <div className="text-lg font-bold text-center mt-2">Customer Payment History</div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Filter Section */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">All Customer</label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customer</SelectItem>
                    {isLoadingCustomers ? (
                      <SelectItem value="loading" disabled>Loading customers...</SelectItem>
                    ) : (
                      customers?.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.customer_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
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
                      {toDate ? format(toDate, "yyyy-MM-dd") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="flex gap-2">
                <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="BANK">Bank</SelectItem>
                  </SelectContent>
                </Select>
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmit}>
                  Submit
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handlePrint}>Print</Button>
                <Button variant="outline" onClick={handlePDF}>PDF</Button>
                <Button variant="outline" onClick={handleExcel}>Excel</Button>
              </div>
            </div>
            {/* Responsive Table Container */}
            <div className="overflow-x-auto" id="customer-payment-table">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[120px]">Payment Date</TableHead>
                    <TableHead className="text-center min-w-[120px]">Payment mode</TableHead>
                    <TableHead className="text-center min-w-[100px]">Recd Amt</TableHead>
                    <TableHead className="text-center min-w-[80px]">Inv No.</TableHead>
                    <TableHead className="text-center min-w-[80px]">Inv Dt.</TableHead>
                    <TableHead className="text-center min-w-[120px]">Customer</TableHead>
                    <TableHead className="text-center min-w-[120px]">Invoice Amt</TableHead>
                    <TableHead className="text-center min-w-[100px]">Allocated</TableHead>
                    <TableHead className="text-center min-w-[120px]">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingPayments ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">
                        Loading payment history...
                      </TableCell>
                    </TableRow>
                  ) : paymentHistory && paymentHistory.length > 0 ? (
                    paymentHistory.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="text-center">
                          {payment.paymentDate ? format(new Date(payment.paymentDate), "dd/MM/yyyy") : ''}
                        </TableCell>
                        <TableCell className="text-center">{payment.paymentMode}</TableCell>
                        <TableCell className="text-center">£{payment.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          {payment.invoiceNumber || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {payment.invoiceDate ? format(new Date(payment.invoiceDate), "dd/MM/yyyy") : '-'}
                        </TableCell>
                        <TableCell className="text-center">{payment.customerName}</TableCell>
                        <TableCell className="text-center">
                          {payment.invoiceAmount ? `£${payment.invoiceAmount.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className="text-center">£{payment.amount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          {payment.remarks || '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">
                        No payment history found.
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="bg-blue-100 font-semibold">
                    <TableCell className="text-center">TOTAL</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center">£{totalAmount.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
              <div className="text-sm text-gray-600">
                Showing {paymentHistory?.length || 0} entries
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Previous</span>
                <Button variant="outline" size="sm" disabled>1</Button>
                <span className="text-sm">Next</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
