import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, FileText } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import PageLayout from "@/components/common/page-layout";

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
    receipt_no: string;
    amount: number;
    payment_mode: string;
    date: string;
  }>;
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
    total_sales: number;
    customer_payments_total: number;
    supplier_payments_total: number;
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

  // Fetch daily summary data
  const { data: summaryData, isLoading, error } = useQuery<DailySummaryData>({
    queryKey: ["/api/reports/daily-summary", selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""],
    queryFn: () => {
      if (!selectedDate) return Promise.resolve(null);
      return apiRequest("GET", `/api/reports/daily-summary?date=${format(selectedDate, "yyyy-MM-dd")}`);
    },
    enabled: !!selectedDate,
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
                <Button onClick={handleGeneratePDF} className="bg-red-600 hover:bg-red-700">
                  <Download className="w-4 h-4 mr-2" />
                  Generate PDF
                </Button>
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
                        <TableHead className="font-semibold border text-right">Account Paid Cash</TableHead>
                        <TableHead className="font-semibold border text-right">Account Paid Cheque</TableHead>
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
                            {sale.account_paid_cash > 0 ? sale.account_paid_cash.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="border text-right">
                            {sale.account_paid_cheque > 0 ? sale.account_paid_cheque.toFixed(2) : '-'}
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
                        <TableCell className="border text-right">-</TableCell>
                        <TableCell className="border text-right">-</TableCell>
                        <TableCell className="border text-right">-</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Total Balance Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Total Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-6">
                  <div className="text-center p-4 bg-green-50 rounded-lg border">
                    <h3 className="text-lg font-semibold text-green-800 mb-2">Cash Sales</h3>
                    <p className="text-2xl font-bold text-green-600">{summaryData.totals.cash_sales.toFixed(2)}</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg border">
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Card Sales</h3>
                    <p className="text-2xl font-bold text-blue-600">{summaryData.totals.card_sales.toFixed(2)}</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg border">
                    <h3 className="text-lg font-semibold text-purple-800 mb-2">Total Banking</h3>
                    <p className="text-2xl font-bold text-purple-600">{summaryData.totals.banking_total.toFixed(2)}</p>
                  </div>
                </div>
                <div className="mt-4 text-center p-4 bg-gray-100 rounded-lg border">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Grand Total</h3>
                  <p className="text-3xl font-bold text-gray-700">
                    {(summaryData.totals.cash_sales + summaryData.totals.card_sales + summaryData.totals.banking_total).toFixed(2)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Customer Payments */}
            <Card>
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
            <Card>
              <CardHeader>
                <CardTitle>Supplier Payments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold border">Supplier Name</TableHead>
                        <TableHead className="font-semibold border">Receipt No</TableHead>
                        <TableHead className="font-semibold border text-right">Amount</TableHead>
                        <TableHead className="font-semibold border">Payment Mode</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.supplier_payments.map((payment, index) => (
                        <TableRow key={index}>
                          <TableCell className="border">{payment.supplier_name}</TableCell>
                          <TableCell className="border">{payment.receipt_no}</TableCell>
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

            {/* Banking Records */}
            <Card>
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