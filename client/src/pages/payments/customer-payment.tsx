import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, CreditCard, FileText, Download, Copy, Printer, Search, Receipt, FileCheck } from "lucide-react";
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
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
  const [invoicePaymentModes, setInvoicePaymentModes] = useState<Map<number, string>>(new Map());
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

  // Fetch payment history for the selected customer
  const { data: paymentHistory, refetch: refetchPaymentHistory } = useQuery<Payment[]>({
    queryKey: ["/api/payments/history", selectedCustomerId],
    queryFn: () => apiRequest("GET", `/api/payments/history?customerId=${selectedCustomerId}`),
    enabled: !!selectedCustomerId,
  });

  // Mutation for creating a new payment
  const createPaymentMutation = useMutation<any, Error, any>({
    mutationFn: (paymentData) => apiRequest("POST", "/api/payments/bulk", paymentData),
    onSuccess: (response) => {
      const cashAmount = selectedInvoices.filter(inv => invoicePaymentModes.get(inv.id) === 'cash').reduce((sum, inv) => sum + inv.balance, 0);
      const cardAmount = selectedInvoices.filter(inv => invoicePaymentModes.get(inv.id) === 'bank').reduce((sum, inv) => sum + inv.balance, 0);
      
      let paymentSummary = `ID: ${response.paymentId}`;
      if (cashAmount > 0 && cardAmount > 0) {
        paymentSummary += ` (Cash: £${cashAmount.toFixed(2)}, Card: £${cardAmount.toFixed(2)})`;
      } else if (cashAmount > 0) {
        paymentSummary += ` (Cash: £${cashAmount.toFixed(2)})`;
      } else if (cardAmount > 0) {
        paymentSummary += ` (Card: £${cardAmount.toFixed(2)})`;
      }
      
      toast({
        title: "Success",
        description: `Payment recorded successfully. Batch ${paymentSummary}`,
      });
      refetchOutstandingInvoices();
      refetchPaymentHistory();
      setReceivedAmount(0);
      setRemarks("");
      setSelectedInvoiceIds(new Set());
      setInvoicePaymentModes(new Map());
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment.",
        variant: "destructive",
      });
    },
  });

  // Handle checkbox selection
  const handleInvoiceSelection = (invoiceId: number, checked: boolean) => {
    const newSelection = new Set(selectedInvoiceIds);
    const newPaymentModes = new Map(invoicePaymentModes);
    
    if (checked) {
      newSelection.add(invoiceId);
      // Set default payment mode to cash for new selections
      if (!newPaymentModes.has(invoiceId)) {
        newPaymentModes.set(invoiceId, 'cash');
      }
    } else {
      newSelection.delete(invoiceId);
      newPaymentModes.delete(invoiceId);
    }
    
    setSelectedInvoiceIds(newSelection);
    setInvoicePaymentModes(newPaymentModes);
    
    // Auto-calculate total amount for selected invoices
    const selectedInvoices = displayedInvoices.filter(inv => newSelection.has(inv.id));
    const totalAmount = selectedInvoices.reduce((sum, inv) => sum + inv.balance, 0);
    setReceivedAmount(totalAmount);
  };

  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(displayedInvoices.map(inv => inv.id));
      const newPaymentModes = new Map(invoicePaymentModes);
      
      // Set default payment mode for all invoices
      displayedInvoices.forEach(inv => {
        if (!newPaymentModes.has(inv.id)) {
          newPaymentModes.set(inv.id, 'cash');
        }
      });
      
      setSelectedInvoiceIds(allIds);
      setInvoicePaymentModes(newPaymentModes);
      const totalAmount = displayedInvoices.reduce((sum, inv) => sum + inv.balance, 0);
      setReceivedAmount(totalAmount);
    } else {
      setSelectedInvoiceIds(new Set());
      setInvoicePaymentModes(new Map());
      setReceivedAmount(0);
    }
  };

  // Handle payment mode change for individual invoice
  const handleInvoicePaymentModeChange = (invoiceId: number, paymentMode: string) => {
    const newPaymentModes = new Map(invoicePaymentModes);
    newPaymentModes.set(invoiceId, paymentMode);
    setInvoicePaymentModes(newPaymentModes);
  };

  const handlePaymentSubmit = () => {
    if (!selectedCustomerId || receivedAmount <= 0 || !paymentDate) {
      toast({
        title: "Validation Error",
        description: "Please select a customer, enter a valid amount, and select a payment date.",
        variant: "destructive",
      });
      return;
    }

    const selectedInvoices = displayedInvoices.filter(inv => selectedInvoiceIds.has(inv.id));
    
    const paymentPayload = {
      customerId: parseInt(selectedCustomerId),
      amount: receivedAmount,
      paymentDate: format(paymentDate, "yyyy-MM-dd"),
      remarks: remarks,
      invoiceIds: Array.from(selectedInvoiceIds),
      invoices: selectedInvoices.map(inv => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        balance: inv.balance,
        paymentMode: invoicePaymentModes.get(inv.id) || 'cash'
      }))
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
  
  // Calculate selected invoices total
  const selectedInvoices = displayedInvoices.filter(inv => selectedInvoiceIds.has(inv.id));
  const selectedTotal = selectedInvoices.reduce((sum, inv) => sum + inv.balance, 0);
  const remainingBalance = selectedTotal - receivedAmount;

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
                <Label>Selected Invoices Total:</Label>
                <div className="p-2 border rounded bg-gray-50">
                  <span className="font-semibold text-lg">£{selectedTotal.toFixed(2)}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({selectedInvoiceIds.size} invoice{selectedInvoiceIds.size !== 1 ? 's' : ''} selected)
                  </span>
                </div>
              </div>

              <div>
                <Label>Payment Summary:</Label>
                <div className="p-2 border rounded bg-gray-50">
                  <div className="text-sm">
                    <div>Cash: £{selectedInvoices.filter(inv => invoicePaymentModes.get(inv.id) === 'cash').reduce((sum, inv) => sum + inv.balance, 0).toFixed(2)}</div>
                    <div>Card: £{selectedInvoices.filter(inv => invoicePaymentModes.get(inv.id) === 'bank').reduce((sum, inv) => sum + inv.balance, 0).toFixed(2)}</div>
                  </div>
                </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <Label htmlFor="remarks">Remarks:</Label>
                <Input
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter remarks"
                />
              </div>

              <div>
                <Label>Remaining Balance:</Label>
                <div className="p-2 border rounded bg-gray-50">
                  <span className={`font-semibold text-lg ${remainingBalance > 0 ? 'text-red-600' : remainingBalance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                    £{Math.abs(remainingBalance).toFixed(2)}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    {remainingBalance > 0 ? 'remaining' : remainingBalance < 0 ? 'overpaid' : 'exact'}
                  </span>
                </div>
              </div>

              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={handlePaymentSubmit}
                  disabled={createPaymentMutation.isPending || selectedInvoiceIds.size === 0}
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
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedInvoiceIds.size === displayedInvoices.length && displayedInvoices.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Payment Mode</TableHead>
                  <TableHead className="text-right">Running Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className={selectedInvoiceIds.has(invoice.id) ? 'bg-blue-50' : ''}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.has(invoice.id)}
                        onChange={(e) => handleInvoiceSelection(invoice.id, e.target.checked)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell>{format(new Date(invoice.date || ''), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-right">£{invoice.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{invoice.paid.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{invoice.balance.toFixed(2)}</TableCell>
                    <TableCell>
                      {selectedInvoiceIds.has(invoice.id) ? (
                        <Select 
                          value={invoicePaymentModes.get(invoice.id) || 'cash'} 
                          onValueChange={(value) => handleInvoicePaymentModeChange(invoice.id, value)}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="bank">Card</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">£{invoice.runningBal.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {displayedInvoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-4">
                      No outstanding invoices found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Payment History Table */}
        {selectedCustomerId && (
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Payment Mode</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentHistory?.sort((a: any, b: any) => (b.batchId || 0) - (a.batchId || 0)).map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono">{payment.batchId || '-'}</TableCell>
                      <TableCell>{format(new Date(payment.paymentDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{payment.invoiceNumber || 'On Account'}</TableCell>
                      <TableCell className="capitalize">{payment.paymentMode}</TableCell>
                      <TableCell className="text-right">£{payment.amount.toFixed(2)}</TableCell>
                      <TableCell>{payment.remarks || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {payment.batchId && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => window.open(`/print/dot-matrix-payment/${payment.batchId}`, '_blank')}
                                title="Print Dot Matrix Receipt"
                              >
                                <Receipt className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const paymentType = payment.paymentMode === 'bank' ? 'card' : 'cash';
                                  window.open(`/print/payment-receipt/${payment.batchId}/${paymentType}`, '_blank');
                                }}
                                title="Print Payment Receipt"
                              >
                                <FileCheck className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!paymentHistory || paymentHistory.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4">
                        No payment history found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}