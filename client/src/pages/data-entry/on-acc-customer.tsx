import { useState, useMemo, useEffect } from "react";
import PageLayout from "@/components/common/page-layout";
import { useBusinessDate } from "@/hooks/use-business-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { CalendarIcon, Users, Search, Info, Save, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Customer, Payment, InsertPayment } from "@shared/schema";
import { toast } from "@/hooks/use-toast";
import type { Sale } from "@shared/schema";

// Extended Payment type that includes batchId from API response
type PaymentWithBatch = Payment & {
  batchId?: number;
  invoiceNumber?: string;
};

export default function OnAccCustomer() {
  const { currentDate: businessDate } = useBusinessDate();
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());

  // Initialize dates with business date when available
  useEffect(() => {
    if (businessDate) {
      const businessDateObj = new Date(businessDate);
      setFromDate(businessDateObj);
      setToDate(businessDateObj);
    } else {
      const today = new Date();
      setFromDate(today);
      setToDate(today);
    }
  }, [businessDate]);

  const [searchTerm, setSearchTerm] = useState("");
  const [recordsPerPage, setRecordsPerPage] = useState("10");
  const [newPayment, setNewPayment] = useState<{
    paymentDate: Date;
    amount: number;
    paymentMode: string;
    remarks: string;
    saleId: number | null;
  }>({
    paymentDate: businessDate ? new Date(businessDate) : new Date(),
    amount: 0,
    paymentMode: "CASH",
    remarks: "",
    saleId: null,
  });
  const [customerInvoices, setCustomerInvoices] = useState<Sale[]>([]);
  const [invoicePopoverOpen, setInvoicePopoverOpen] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState("");

  // Fetch customers
  const { data: customersData = [], isLoading: loadingCustomers } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Sort customers alphabetically by name
  const customers = useMemo(() => {
    if (!customersData) return [];
    return [...customersData].sort((a, b) => 
      a.customer_name.localeCompare(b.customer_name, undefined, { sensitivity: 'base' })
    );
  }, [customersData]);

  // Get selected customer object
  const selectedCustomerObj = useMemo(() => customers.find(c => c.id.toString() === selectedCustomer), [customers, selectedCustomer]);
  const currency = selectedCustomerObj?.customer_currency || "GBP";

  // Fetch on-account payments for selected customer and date range
  const {
    data: payments = [],
    isLoading: loadingPayments,
    isError: errorPayments,
    refetch: refetchPayments
  } = useQuery<PaymentWithBatch[]>({
    queryKey: ["on-acc-payments", selectedCustomer, fromDate, toDate],
    enabled: !!selectedCustomer,
    queryFn: async () => {
      const params = new URLSearchParams({
        customerId: selectedCustomer,
        fromDate: format(fromDate, "yyyy-MM-dd"),
        toDate: format(toDate, "yyyy-MM-dd"),
        paymentType: "on-account" // Filter to show only on-account payments
      });
      const all = await apiRequest("GET", `/api/payments/history?${params}`);
      return all;
    }
  });

  // Add new on-account payment using batch system
  const addPaymentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      return apiRequest("POST", "/api/payments/bulk", paymentData);
    },
    onSuccess: (response) => {
      toast({ 
        title: "Success", 
        description: `Payment added successfully. Batch ID: ${response.paymentId}` 
      });
      setNewPayment({ paymentDate: new Date(), amount: 0, paymentMode: "CASH", remarks: "", saleId: null });
      refetchPayments();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Failed to add payment." });
    }
  });

  const handleAddPayment = () => {
    if (!selectedCustomer) return toast({ title: "Select a customer" });
    if (!newPayment.amount || newPayment.amount <= 0) return toast({ title: "Enter a valid amount" });
    
    // Structure payment data for batch system
    const splitPayment = {
      cash: newPayment.paymentMode === 'CASH' ? newPayment.amount : 0,
      card: newPayment.paymentMode === 'CARD' ? newPayment.amount : 0,
      bankTransfer: newPayment.paymentMode === 'BANK' ? newPayment.amount : 0,
      cheque: newPayment.paymentMode === 'CHEQUE' ? newPayment.amount : 0
    };

    // Map payment mode to backend expected values
    const getBackendPaymentMode = (mode: string) => {
      switch (mode) {
        case 'CASH': return 'cash';
        case 'CARD': return 'bank'; // Card payments are stored as 'bank' in backend
        case 'BANK': return 'bank_transfer';
        case 'CHEQUE': return 'cheque';
        default: return 'cash';
      }
    };

    const paymentPayload = {
      customerId: Number(selectedCustomer),
      amount: newPayment.amount,
      paymentDate: format(newPayment.paymentDate, "yyyy-MM-dd"),
      remarks: newPayment.remarks || "On-account payment",
      invoiceIds: newPayment.saleId ? [newPayment.saleId] : [], // Include invoice ID if selected
      splitPayment: splitPayment,
      invoices: newPayment.saleId ? [{
        invoiceId: newPayment.saleId,
        invoiceNumber: customerInvoices.find(inv => inv.id === newPayment.saleId)?.invoiceNumber || 'Unknown',
        balance: newPayment.amount, // For on-account, use the payment amount
        paymentMode: getBackendPaymentMode(newPayment.paymentMode)
      }] : [] // Empty array for pure on-account payments
    };

    addPaymentMutation.mutate(paymentPayload);
  };

  const filteredPayments = useMemo(() =>
    payments.filter(p =>
      (!searchTerm || (p.remarks?.toLowerCase().includes(searchTerm.toLowerCase()) || ""))
    ),
    [payments, searchTerm]
  );

  const totalAmount = filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Fetch company details for dynamic address
  const { data: companyDetails } = useQuery({
    queryKey: ["company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // Fetch business date for new payment
  const { data: businessDateData } = useQuery({
    queryKey: ["business-date"],
    queryFn: () => apiRequest("GET", "/api/business-date"),
  });

  useEffect(() => {
    if (businessDateData?.business_date) {
      setNewPayment((prev) => ({ ...prev, paymentDate: new Date(businessDateData.business_date) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessDateData?.business_date]);

  // Fetch invoices when customer changes
  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerInvoices([]);
      return;
    }
    const fetchInvoices = async () => {
      const fromDate = "2000-01-01";
      const toDate = "2100-01-01";
      const invoices = await apiRequest(
        "GET",
        `/api/customers/${selectedCustomer}/invoices?fromDate=${fromDate}&toDate=${toDate}`
      );
      setCustomerInvoices(invoices);
    };
    fetchInvoices();
  }, [selectedCustomer]);

  // Map backend payment modes back to display values
  const getDisplayPaymentMode = (mode: string) => {
    switch (mode) {
      case 'cash': return 'CASH';
      case 'bank': return 'CARD';
      case 'bank_transfer': return 'BANK';
      case 'cheque': return 'CHEQUE';
      default: return mode.toUpperCase();
    }
  };

  // Debug logs before rendering the payments table
  console.log('customerInvoices', customerInvoices);
  console.log('filteredPayments', filteredPayments);

  return (
    <PageLayout title="On A/c Customer Payments" breadcrumb="On A/c Customer">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Users size={20} />
                On A/c Customer Payments
              </CardTitle>
              <div className="text-sm text-gray-500">
                {companyDetails?.companyName || "Company Name"}, {companyDetails?.address1 || ""}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ""}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer} disabled={loadingCustomers}>
                  <SelectTrigger>
                    <SelectValue placeholder={loadingCustomers ? "Loading..." : "Select customer"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.customer_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 items-end">
                <div>
                  <Label className="text-xs">From Date:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-28 justify-start text-left font-normal text-xs", !fromDate && "text-muted-foreground")}>{fromDate ? format(fromDate, "yyyy-MM-dd") : "Pick date"}</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={fromDate} onSelect={date => date && setFromDate(date)} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">To Date:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-28 justify-start text-left font-normal text-xs", !toDate && "text-muted-foreground")}>{toDate ? format(toDate, "yyyy-MM-dd") : "Pick date"}</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={toDate} onSelect={date => date && setToDate(date)} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <Button className="bg-blue-500 hover:bg-blue-600" onClick={() => refetchPayments()} disabled={loadingPayments}>
                  {loadingPayments ? <Loader2 className="animate-spin h-4 w-4" /> : "Search"}
                </Button>
              </div>
              <div></div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex items-center gap-2">
                  <Info size={16} />
                  Options
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Add Payment Section */}
        <Card>
          <CardHeader>
            <CardTitle>Add On A/c Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-32 justify-start text-left font-normal">
                      {format(newPayment.paymentDate, "yyyy-MM-dd")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={newPayment.paymentDate} onSelect={date => date && setNewPayment(np => ({ ...np, paymentDate: date }))} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Amount ({currency})</Label>
                <Input type="number" value={newPayment.amount} onChange={e => setNewPayment(np => ({ ...np, amount: Number(e.target.value) }))} min={0} />
              </div>
              <div>
                <Label>Payment Mode</Label>
                <Select value={newPayment.paymentMode} onValueChange={val => setNewPayment(np => ({ ...np, paymentMode: val }))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="BANK">Bank</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                    <SelectItem value="OTHERS">Others</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Remarks</Label>
                <Input value={newPayment.remarks} onChange={e => setNewPayment(np => ({ ...np, remarks: e.target.value }))} />
              </div>
              {/* Remove the separate Input for invoice search. Use only the Select for searching and selecting invoices. */}
              <div>
                <Label>Invoice (optional)</Label>
                <Popover open={invoicePopoverOpen} onOpenChange={setInvoicePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                      aria-expanded={invoicePopoverOpen}
                    >
                      {newPayment.saleId
                        ? customerInvoices.find(inv => inv.id === newPayment.saleId)?.invoiceNumber
                        : "Type to search and select invoice"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search invoice number..."
                        value={invoiceQuery}
                        onValueChange={setInvoiceQuery}
                      />
                      <CommandList>
                        <CommandItem
                          key="none"
                          value="none"
                          onSelect={() => {
                            setNewPayment(np => ({ ...np, saleId: null }));
                            setInvoicePopoverOpen(false);
                            setInvoiceQuery("");
                          }}
                        >
                          No Invoice
                        </CommandItem>
                        <CommandEmpty>No invoices found.</CommandEmpty>
                        {customerInvoices
                          .filter(inv =>
                            invoiceQuery === "" ||
                            inv.invoiceNumber.toLowerCase().includes(invoiceQuery.toLowerCase())
                          )
                          .map(inv => (
                            <CommandItem
                              key={inv.id}
                              value={inv.invoiceNumber}
                              onSelect={() => {
                                setNewPayment(np => ({ ...np, saleId: inv.id }));
                                setInvoicePopoverOpen(false);
                                setInvoiceQuery("");
                              }}
                            >
                              {inv.invoiceNumber}
                            </CommandItem>
                          ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <Button onClick={handleAddPayment} disabled={addPaymentMutation.isPending || !selectedCustomer} className="bg-green-600 hover:bg-green-700 flex gap-2">
                {addPaymentMutation.isPending && <Loader2 className="animate-spin h-4 w-4" />}<Save size={16} /> Save
              </Button>
            </div>
          </CardContent>
        </Card>
        {/* Payments Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex gap-2 items-center">
                <Select value={recordsPerPage} onValueChange={setRecordsPerPage}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 records per page</SelectItem>
                    <SelectItem value="25">25 records per page</SelectItem>
                    <SelectItem value="50">50 records per page</SelectItem>
                    <SelectItem value="100">100 records per page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input placeholder="Search remarks..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 w-48" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingPayments ? (
              <div className="flex justify-center items-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>
            ) : errorPayments ? (
              <div className="text-red-600">Failed to load payments.</div>
            ) : (
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Batch ID</TableHead>
                      <TableHead>Invoice No</TableHead>
                      <TableHead>Amount ({currency})</TableHead>
                      <TableHead>Payment Mode</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.slice(0, Number(recordsPerPage)).map((p, idx) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.paymentDate}</TableCell>
                        <TableCell className="font-mono">{p.batchId || '-'}</TableCell>
                        <TableCell>{p.saleId ? (customerInvoices.find(inv => Number(inv.id) === Number(p.saleId))?.invoiceNumber || p.saleId) : '-'}</TableCell>
                        <TableCell>{p.amount}</TableCell>
                        <TableCell>{getDisplayPaymentMode(p.paymentMode)}</TableCell>
                        <TableCell>{p.remarks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex justify-end mt-4 font-bold">Total: {currency} {totalAmount.toFixed(2)}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}