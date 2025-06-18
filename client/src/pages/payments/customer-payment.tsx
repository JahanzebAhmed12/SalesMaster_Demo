import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, CreditCard, FileText, Download, Copy, Printer, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Sale, Payment, InsertPayment } from "@shared/schema";

type InvoiceWithBalance = Sale & {
  balance: number;
  paid: number;
  runningBal: number;
};

export default function CustomerPayment() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<string>("CASH");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const [remarks, setRemarks] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch customers
  const { data: customers, isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Fetch outstanding invoices for the selected customer
  const { data: outstandingInvoices, isLoading: isLoadingInvoices, refetch: refetchOutstandingInvoices } = useQuery<Sale[]>({
    queryKey: ["/api/customers", selectedCustomerId, "outstanding_invoices"],
    queryFn: () => apiRequest("GET", `/api/customers/${selectedCustomerId}/outstanding_invoices`),
    enabled: !!selectedCustomerId,
  });

  // Mutation for creating a new payment
  const createPaymentMutation = useMutation<Payment, Error, InsertPayment>({
    mutationFn: (paymentData) => apiRequest("POST", "/api/payments", paymentData),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment recorded successfully.",
      });
      refetchOutstandingInvoices();
      setReceivedAmount(0);
      setRemarks("");
      setSelectedInvoiceId("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment.",
        variant: "destructive",
      });
    },
  });

  const handlePaymentSubmit = () => {
    if (!selectedCustomerId || receivedAmount <= 0 || !paymentDate) {
      toast({
        title: "Validation Error",
        description: "Please select a customer, enter a valid amount, and select a payment date.",
        variant: "destructive",
      });
      return;
    }

    const paymentPayload: InsertPayment = {
      customerId: parseInt(selectedCustomerId),
      amount: receivedAmount,
      paymentMode: paymentMode,
      paymentDate: format(paymentDate, "yyyy-MM-dd"),
      remarks: remarks,
      saleId: selectedInvoiceId ? parseInt(selectedInvoiceId) : null,
    };

    createPaymentMutation.mutate(paymentPayload);
  };

  // Calculate balances for each invoice
  const invoicesWithBalance = outstandingInvoices?.map((invoice) => {
    const paid = invoice.paidAmount || 0;
    const balance = invoice.totalAmount - paid;
    return { ...invoice, balance, paid };
  }) || [];

  const filteredInvoices = invoicesWithBalance.filter((invoice) =>
    invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateRunningBalance = () => {
    let runningBal = 0;
    return filteredInvoices.map((invoice) => {
      runningBal += invoice.balance;
      return { ...invoice, runningBal };
    });
  };

  const displayedInvoices = calculateRunningBalance();
  const totalOutstandingBalance = displayedInvoices.reduce((sum, invoice) => sum + invoice.balance, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Customer Payment</h1>
            <div className="text-sm text-gray-500">
              TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ, ...
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Payment Form */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <div>
                <Label htmlFor="customer">Select Customer:</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingCustomers ? (
                      <SelectItem value="disabled" disabled>Loading customers...</SelectItem>
                    ) : customers && customers.length > 0 ? (
                      customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.customer_name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="disabled" disabled>No customers found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="invoice">Select Invoice (Optional):</Label>
                <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingInvoices ? (
                      <SelectItem value="disabled" disabled>Loading invoices...</SelectItem>
                    ) : displayedInvoices && displayedInvoices.length > 0 ? (
                      displayedInvoices.map((invoice) => (
                        <SelectItem key={invoice.id} value={invoice.id.toString()}>
                          {invoice.invoiceNumber} - £{invoice.balance.toFixed(2)} remaining
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="disabled" disabled>No outstanding invoices</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="payment-mode">Payment Mode:</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">CASH</SelectItem>
                    <SelectItem value="CARD">CARD</SelectItem>
                    <SelectItem value="BANK">BANK</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Payment Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !paymentDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {paymentDate ? format(paymentDate, "dd/MM/yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={paymentDate}
                      onSelect={setPaymentDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="received-amount">Received Amount:</Label>
                <Input
                  id="received-amount"
                  type="number"
                  value={receivedAmount}
                  onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)}
                  placeholder="Enter amount"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <Label htmlFor="remarks">Remarks:</Label>
                <Input
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter remarks"
                />
              </div>

              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={handlePaymentSubmit}
                  disabled={createPaymentMutation.isPending}
                >
                  {createPaymentMutation.isPending ? "Processing..." : "Record Payment"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Invoices Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Outstanding Invoices</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
                <Button variant="outline" size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Running Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{format(new Date(invoice.date || ''), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-right">£{invoice.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{invoice.paid.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{invoice.balance.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{invoice.runningBal.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {displayedInvoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4">
                      No outstanding invoices found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
