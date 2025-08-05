import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, FileText, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import PageLayout from "@/components/common/page-layout";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface DailySummaryData {
  date: string;
  sales_summary: Array<{
    customer_name: string;
    ticket_no: string;
    cash_sales: number;
    card_paid: number;
    account_sales: number;
    account_paid_cash: number;
    account_paid_cheque: number;
    account_credits: number;
  }>;
  customer_payments: Array<{
    customer_name: string;
    invoice_no: string;
    cash_amount: number;
    card_amount: number;
    total_amount: number;
    date: string;
  }>;
  supplier_payments: Array<{
    supplier_name: string;
    supplier_invoice_number: string;
    amount: number;
    payment_mode: string;
    date: string;
  }>;
  expense_entries: Array<{
    ref_number: string;
    description: string;
    supplier_name: string;
    expense_name: string;
    amount: number;
    payment_mode: string;
    date: string;
  }>;
  cash_cf: {
    pounds: number;
    coins: number;
    total: number;
    date: string;
  };
  banking_records: Array<{
    date: string;
    remarks: string;
    payment_type: string;
    amount: number;
    paying_number: string;
    cheque_number: string;
    bag_details: Array<{
      bag_number: string;
      paying_number: string;
      amount: number;
    }>;
  }>;
  totals: {
    cash_sales: number;
    card_sales: number;
    account_sales: number;
    account_credits: number;
    total_sales: number;
    customer_payments_total: number;
    supplier_payments_total: number;
    expense_total: number;
    cash_cf_total: number;
    banking_total: number;
  };
}

export default function DailySummary() {
  const { currentDate: businessDate } = useBusinessDate();
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    // Safely initialize the date
    try {
      return businessDate ? new Date(businessDate) : new Date();
    } catch {
      return new Date();
    }
  });
  const { toast } = useToast();

  // Update selectedDate when businessDate changes
  useEffect(() => {
    if (businessDate) {
      try {
        const newDate = new Date(businessDate);
        if (!isNaN(newDate.getTime())) {
          setSelectedDate(newDate);
        }
      } catch {
        // Keep current selectedDate if businessDate is invalid
      }
    }
  }, [businessDate]);

  // Fetch daily summary data with fresh data on mount and date changes
  const { data: summaryData, isLoading, error } = useQuery<DailySummaryData>({
    queryKey: ["/api/reports/daily-summary", selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""],
    queryFn: () => {
      if (!selectedDate) return Promise.resolve(null);
      return apiRequest("GET", `/api/reports/daily-summary?date=${format(selectedDate, "yyyy-MM-dd")}`);
    },
    enabled: !!selectedDate,
    staleTime: 0, // Always consider data stale to ensure fresh fetch
    gcTime: 0, // Don't cache the data (replaces deprecated cacheTime)
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Fetch company details for PDF header
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  const handleGeneratePDF = async () => {
    if (!selectedDate) {
      toast({
        title: "Error",
        description: "Please select a valid date",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = localStorage.getItem('jwt_token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Use the correct backend URL
      const backendUrl = window.location.origin.replace(':5173', ':5000');
      const url = `${backendUrl}/api/reports/daily-summary/pdf?date=${format(selectedDate, "yyyy-MM-dd")}&token=${token}`;

      // Open in new window for printing
      const printWindow = window.open(
        url,
        '_blank',
        'width=800,height=600,scrollbars=yes,resizable=yes'
      );

      if (!printWindow) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      toast({
        title: "Success",
        description: "PDF opened in new window for printing",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    }
  };

  const handleGenerateCleanPDF = () => {
    if (!selectedDate || !summaryData) {
      toast({
        title: "Error",
        description: "Please select a valid date and ensure data is loaded",
        variant: "destructive",
      });
      return;
    }

    const doc = new jsPDF();
    let yPosition = 20;
    
    // Add company details header
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || 'Company Name', 105, yPosition, { align: 'center' });
      yPosition += 8;
      
      doc.setFontSize(10);
      if (companyDetails.email) {
        doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }
      if (companyDetails.bankDetails) {
        doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }
      let regInfo = [];
      if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
      if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
      if (regInfo.length > 0) {
        doc.text(regInfo.join(' | '), 105, yPosition, { align: 'center' });
        yPosition += 10;
      } else {
        yPosition += 5;
      }
    }
    
    // Add report title
    doc.setFontSize(14);
    doc.text('DAILY SUMMARY REPORT', 105, yPosition, { align: 'center' });
    yPosition += 8;
    doc.setFontSize(10);
    doc.text(`Date: ${format(selectedDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
    yPosition += 15;

    // Daily Sales Summary (always included)
    doc.setFontSize(12);
    doc.text('Daily Sales Summary', 14, yPosition);
    yPosition += 5;
    
    autoTable(doc, {
      head: [['Customer', 'TKT No', 'Cash Sales', 'Card Paid', 'Account Sales', 'Account Credits']],
      body: [
        ...summaryData.sales_summary.map(sale => [
          sale.customer_name,
          sale.ticket_no,
          sale.cash_sales > 0 ? sale.cash_sales.toFixed(2) : '-',
          sale.card_paid > 0 ? sale.card_paid.toFixed(2) : '-',
          sale.account_sales > 0 ? sale.account_sales.toFixed(2) : '-',
          sale.account_credits > 0 ? sale.account_credits.toFixed(2) : '-'
        ]),
        ['TOTALS', '', summaryData.totals.cash_sales.toFixed(2), summaryData.totals.card_sales.toFixed(2), summaryData.totals.account_sales.toFixed(2), (summaryData.totals.account_credits || 0).toFixed(2)]
      ],
      startY: yPosition,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
    });
    
    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Customer Payments (only if has data)
    if (summaryData.customer_payments && summaryData.customer_payments.length > 0) {
      doc.setFontSize(12);
      doc.text('Customer Payments', 14, yPosition);
      yPosition += 5;
      
      autoTable(doc, {
        head: [['Customer Name', 'Invoice No', 'Cash Amount', 'Card Amount', 'Total Amount']],
        body: [
          ...summaryData.customer_payments.map(payment => [
            payment.customer_name,
            payment.invoice_no,
            payment.cash_amount > 0 ? payment.cash_amount.toFixed(2) : '-',
            payment.card_amount > 0 ? payment.card_amount.toFixed(2) : '-',
            payment.total_amount.toFixed(2)
          ]),
          ['TOTAL', '', 
            summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2),
            summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2),
            summaryData.totals.customer_payments_total.toFixed(2)
          ]
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });
      
      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Supplier Payments (only if has data)
    if (summaryData.supplier_payments && summaryData.supplier_payments.length > 0) {
      doc.setFontSize(12);
      doc.text('Supplier Payments', 14, yPosition);
      yPosition += 5;
      
      autoTable(doc, {
        head: [['Supplier Name', 'Supplier Invoice No', 'Amount', 'Payment Mode']],
        body: [
          ...summaryData.supplier_payments.map(payment => [
            payment.supplier_name,
            payment.supplier_invoice_number || '-',
            payment.amount.toFixed(2),
            payment.payment_mode
          ]),
          ['TOTAL', '', summaryData.totals.supplier_payments_total.toFixed(2), '']
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });
      
      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Expense Entries (only if has data)
    if (summaryData.expense_entries && summaryData.expense_entries.length > 0) {
      doc.setFontSize(12);
      doc.text('Expense Entries', 14, yPosition);
      yPosition += 5;
      
      autoTable(doc, {
        head: [['Ref Number', 'Description', 'Supplier Name', 'Expense Name', 'Amount', 'Payment Mode']],
        body: [
          ...summaryData.expense_entries.map(expense => [
            expense.ref_number,
            expense.description,
            expense.supplier_name,
            expense.expense_name,
            expense.amount.toFixed(2),
            expense.payment_mode
          ]),
          ['TOTAL', '', '', '', summaryData.expense_entries.reduce((sum, e) => sum + e.amount, 0).toFixed(2), '']
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });
      
      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Banking Records (only if has data)
    if (summaryData.banking_records && summaryData.banking_records.length > 0) {
      doc.setFontSize(12);
      doc.text('Banking Records', 14, yPosition);
      yPosition += 5;
      
      autoTable(doc, {
        head: [['Date', 'Remarks', 'Payment Type', 'Amount', 'Details']],
        body: [
          ...summaryData.banking_records.map(record => [
            record.date ? format(new Date(record.date), "dd/MM/yyyy") : "N/A",
            record.remarks,
            record.payment_type,
            record.amount.toFixed(2),
            record.bag_details.length > 0 
              ? record.bag_details.map(bag => `Bag: ${bag.bag_number}`).join(', ')
              : `${record.paying_number ? `Pay: ${record.paying_number}` : ''}${record.cheque_number ? ` | Cheque: ${record.cheque_number}` : ''}`
          ]),
          ['TOTAL', '', '', summaryData.totals.banking_total.toFixed(2), '']
        ],
        startY: yPosition,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' }
      });
      
      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Daily Summary Totals (always included)
    doc.setFontSize(12);
    doc.text('Daily Summary Totals', 14, yPosition);
    yPosition += 5;
    
    const totalsData = [
      ['Total Cash Sales', `£${summaryData.totals.cash_sales.toFixed(2)}`],
      ['Total Card Sales', `£${summaryData.totals.card_sales.toFixed(2)}`],
      ['Total Cheque', `£${summaryData.sales_summary.reduce((sum, s) => sum + s.account_paid_cheque, 0).toFixed(2)}`],
      ['Account Payments/Customer Cash Payments', `£${summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2)}`],
      ['Account Payment/Customer Card Payment (Backdate)', `£${summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2)}`],
      ['Till/Float(C/F)', `£${(summaryData.totals.cash_cf_total || 0).toFixed(2)}`],
      ['Total Supplier Payment (Paid Out)', `£${summaryData.supplier_payments.filter(p => p.payment_mode.toLowerCase() === 'cash' || p.payment_mode.toLowerCase() === 'bank').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}`],
      ['Total Expense (Paid Out)', `£${(summaryData.expense_entries || []).filter(e => e.payment_mode.toLowerCase() === 'cash' || e.payment_mode.toLowerCase() === 'bank').reduce((sum, e) => sum + e.amount, 0).toFixed(2)}`],
      ['Total Banking', `£${summaryData.totals.banking_total.toFixed(2)}`]
    ];
    
    autoTable(doc, {
      body: totalsData,
      startY: yPosition,
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { fontStyle: 'bold', halign: 'right' }
      }
    });

    doc.save(`daily-summary-${format(selectedDate, "yyyy-MM-dd")}.pdf`);
    
    toast({
      title: "Success",
      description: "Clean PDF generated successfully (empty tables excluded)",
    });
  };

  return (
    <PageLayout title="Daily Summary" breadcrumb="Daily Report / Daily Summary">
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Daily Summary Report
              </CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Date:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-40 justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "PPP") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleGeneratePDF} className="bg-red-600 hover:bg-red-700">
                    <Printer className="w-4 h-4 mr-2" />
                    Print PDF
                  </Button>
                  <Button onClick={handleGenerateCleanPDF} className="bg-blue-600 hover:bg-blue-700">
                    <Download className="w-4 h-4 mr-2" />
                    Clean PDF
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center">Loading daily summary...</div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-red-500">Failed to load daily summary</div>
            </CardContent>
          </Card>
        ) : summaryData ? (
          <div className="space-y-6">
            {/* Daily Sales Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Daily Sales Summary - {selectedDate && !isNaN(selectedDate.getTime()) ? format(selectedDate, "dd/MM/yyyy") : "Invalid Date"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold border">Customer</TableHead>
                        <TableHead className="font-semibold border">TKT No</TableHead>
                        <TableHead className="font-semibold border text-right">Cash Sales</TableHead>
                        <TableHead className="font-semibold border text-right">Card Paid</TableHead>
                        <TableHead className="font-semibold border text-right">Account Sales</TableHead>
                        <TableHead className="font-semibold border text-right">Account Credits</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.sales_summary.map((sale, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">{sale.customer_name}</TableCell>
                          <TableCell className="border">{sale.ticket_no}</TableCell>
                          <TableCell className="border text-right">
                            {sale.cash_sales > 0 ? sale.cash_sales.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">
                            {sale.card_paid > 0 ? sale.card_paid.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">
                            {sale.account_sales > 0 ? sale.account_sales.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">
                            {sale.account_credits > 0 ? sale.account_credits.toFixed(2) : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals Row */}
                      <TableRow className="bg-gray-100 font-semibold">
                        <TableCell className="border" colSpan={2}>TOTALS</TableCell>
                        <TableCell className="border text-right">{summaryData.totals.cash_sales.toFixed(2)}</TableCell>
                        <TableCell className="border text-right">{summaryData.totals.card_sales.toFixed(2)}</TableCell>
                        <TableCell className="border text-right">{summaryData.totals.account_sales.toFixed(2)}</TableCell>
                        <TableCell className="border text-right">{(summaryData.totals.account_credits || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Customer Payments */}
            <Card className={summaryData.customer_payments && summaryData.customer_payments.length === 0 ? "print:hidden" : ""}>
              <CardHeader>
                <CardTitle>Customer Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold border">Customer Name</TableHead>
                        <TableHead className="font-semibold border">Invoice No</TableHead>
                        <TableHead className="font-semibold border text-right">Cash Amount</TableHead>
                        <TableHead className="font-semibold border text-right">Card Amount</TableHead>
                        <TableHead className="font-semibold border text-right">Total Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.customer_payments.map((payment, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">{payment.customer_name}</TableCell>
                          <TableCell className="border">{payment.invoice_no}</TableCell>
                          <TableCell className="border text-right">
                            {payment.cash_amount > 0 ? payment.cash_amount.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">
                            {payment.card_amount > 0 ? payment.card_amount.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">{payment.total_amount.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      {summaryData.customer_payments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="border text-center text-gray-500 py-4">
                            No customer payments found
                          </TableCell>
                        </TableRow>
                      )}
                      {summaryData.customer_payments.length > 0 && (
                        <TableRow className="bg-gray-100 font-semibold">
                          <TableCell className="border" colSpan={2}>TOTAL</TableCell>
                          <TableCell className="border text-right">
                            {summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="border text-right">
                            {summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="border text-right">{summaryData.totals.customer_payments_total.toFixed(2)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Supplier Payments */}
            <Card className={summaryData.supplier_payments && summaryData.supplier_payments.length === 0 ? "print:hidden" : ""}>
              <CardHeader>
                <CardTitle>Supplier Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold border">Supplier Name</TableHead>
                        <TableHead className="font-semibold border">Supplier Invoice No</TableHead>
                        <TableHead className="font-semibold border text-right">Amount</TableHead>
                        <TableHead className="font-semibold border">Payment Mode</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.supplier_payments.map((payment, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">{payment.supplier_name}</TableCell>
                          <TableCell className="border">{payment.supplier_invoice_number || '-'}</TableCell>
                          <TableCell className="border text-right">{payment.amount.toFixed(2)}</TableCell>
                          <TableCell className="border capitalize">{payment.payment_mode}</TableCell>
                        </TableRow>
                      ))}
                      {summaryData.supplier_payments.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="border text-center text-gray-500 py-4">
                            No supplier payments found
                          </TableCell>
                        </TableRow>
                      )}
                      {summaryData.supplier_payments.length > 0 && (
                        <TableRow className="bg-gray-100 font-semibold">
                          <TableCell className="border" colSpan={2}>TOTAL</TableCell>
                          <TableCell className="border text-right">{summaryData.totals.supplier_payments_total.toFixed(2)}</TableCell>
                          <TableCell className="border"></TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Expense Entries */}
            <Card className={summaryData.expense_entries && summaryData.expense_entries.length === 0 ? "print:hidden" : ""}>
              <CardHeader>
                <CardTitle>Expense Entries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold border">Ref Number</TableHead>
                        <TableHead className="font-semibold border">Description</TableHead>
                        <TableHead className="font-semibold border">Supplier Name</TableHead>
                        <TableHead className="font-semibold border">Expense Name</TableHead>
                        <TableHead className="font-semibold border text-right">Amount</TableHead>
                        <TableHead className="font-semibold border">Payment Mode</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.expense_entries.map((expense, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">{expense.ref_number}</TableCell>
                          <TableCell className="border">{expense.description}</TableCell>
                          <TableCell className="border">{expense.supplier_name}</TableCell>
                          <TableCell className="border">{expense.expense_name}</TableCell>
                          <TableCell className="border text-right">{expense.amount.toFixed(2)}</TableCell>
                          <TableCell className="border capitalize">{expense.payment_mode}</TableCell>
                        </TableRow>
                      ))}
                      {summaryData.expense_entries.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="border text-center text-gray-500 py-4">
                            No expense entries found
                          </TableCell>
                        </TableRow>
                      )}
                      {summaryData.expense_entries.length > 0 && (
                        <TableRow className="bg-gray-100 font-semibold">
                          <TableCell className="border" colSpan={4}>TOTAL</TableCell>
                          <TableCell className="border text-right">{summaryData.expense_entries.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</TableCell>
                          <TableCell className="border"></TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Daily Summary Totals */}
            <Card>
              <CardHeader>
                <CardTitle>Daily Summary Totals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-lg">
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Cash Sales:</span>
                    <span className="font-bold">£{summaryData.totals.cash_sales.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Card Sales:</span>
                    <span className="font-bold">£{summaryData.totals.card_sales.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Cheque :</span>
                    <span className="font-bold">£{summaryData.sales_summary.reduce((sum, s) => sum + s.account_paid_cheque, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Account Payments/Customer Cash Payments:</span>
                    <span className="font-bold">£{summaryData.customer_payments.reduce((sum, p) => sum + p.cash_amount, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Account Payment/Customer Card Payment (Backdate):</span>
                    <span className="font-bold">£{summaryData.customer_payments.reduce((sum, p) => sum + p.card_amount, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Till/Float(C/F):</span>
                    <span className="font-bold">£{(summaryData.totals.cash_cf_total || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Supplier Payment (Paid Out):</span>
                    <span className="font-bold">£{summaryData.supplier_payments.filter(p => p.payment_mode.toLowerCase() === 'cash' || p.payment_mode.toLowerCase() === 'bank').reduce((sum, p) => sum + p.amount, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Expense (Paid Out):</span>
                    <span className="font-bold">£{(summaryData.expense_entries || []).filter(e => e.payment_mode.toLowerCase() === 'cash' || e.payment_mode.toLowerCase() === 'bank').reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="font-medium">Total Banking:</span>
                    <span className="font-bold">£{summaryData.totals.banking_total.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Banking Records */}
            <Card className={summaryData.banking_records && summaryData.banking_records.length === 0 ? "print:hidden" : ""}>
              <CardHeader>
                <CardTitle>Banking Records</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold border">Date</TableHead>
                        <TableHead className="font-semibold border">Remarks</TableHead>
                        <TableHead className="font-semibold border">Payment Type</TableHead>
                        <TableHead className="font-semibold border text-right">Amount</TableHead>
                        <TableHead className="font-semibold border">Bag Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.banking_records.map((record, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">
                            {record.date ? format(new Date(record.date), "dd/MM/yyyy") : "N/A"}
                          </TableCell>
                          <TableCell className="border">{record.remarks}</TableCell>
                          <TableCell className="border capitalize">{record.payment_type}</TableCell>
                          <TableCell className="border text-right">{record.amount.toFixed(2)}</TableCell>
                          <TableCell className="border">
                            {record.bag_details.length > 0 ? (
                              <div className="space-y-1">
                                {record.bag_details.map((bag, bagIndex) => (
                                  <div key={bagIndex} className="text-sm">
                                    Bag: {bag.bag_number} | Pay: {bag.paying_number} | {bag.amount.toFixed(2)}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm">
                                {record.paying_number && `Pay: ${record.paying_number}`}
                                {record.cheque_number && ` | Cheque: ${record.cheque_number}`}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {summaryData.banking_records.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="border text-center text-gray-500 py-4">
                            No banking records found
                          </TableCell>
                        </TableRow>
                      )}
                      {summaryData.banking_records.length > 0 && (
                        <TableRow className="bg-gray-100 font-semibold">
                          <TableCell className="border" colSpan={3}>TOTAL</TableCell>
                          <TableCell className="border text-right">{summaryData.totals.banking_total.toFixed(2)}</TableCell>
                          <TableCell className="border"></TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}