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
import SupplierSearch from "@/components/ui/supplier-search";
import { useSupplierSearch } from "@/hooks/useSupplierSearch";
import { CalendarIcon, Truck, Search, Info, Save, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Supplier, SupplierPayment, InsertSupplierPayment } from "@shared/schema";
import { toast } from "@/hooks/use-toast";

export default function OnAccSupplier() {
  const { currentDate: businessDate } = useBusinessDate();
  const { selectedSupplier: selectedSupplierObj, handleSupplierSelect: handleSupplierSelectHook, supplierId } = useSupplierSearch();
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());

  // Sync supplierId with selectedSupplier
  useEffect(() => {
    if (supplierId) {
      setSelectedSupplier(supplierId.toString());
    }
  }, [supplierId]);

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
  const [supplierInvoices, setSupplierInvoices] = useState<any[]>([]);
  const [invoicePopoverOpen, setInvoicePopoverOpen] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [newPayment, setNewPayment] = useState({
    paymentDate: businessDate ? new Date(businessDate) : new Date(),
    amount: 0,
    paymentMode: "CASH",
    remarks: "",
    purchaseInvoiceId: null as number | null,
  });
  const queryClient = useQueryClient();

  // Fetch suppliers
  const { data: suppliersData = [], isLoading: loadingSuppliers } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Sort suppliers alphabetically by name
  const suppliers = useMemo(() => {
    if (!suppliersData) return [];
    return [...suppliersData].sort((a, b) => 
      a.supplier_name.localeCompare(b.supplier_name, undefined, { sensitivity: 'base' })
    );
  }, [suppliersData]);

  // Get selected supplier object
  const selectedSupplierObj = useMemo(() => suppliers.find(s => s.id.toString() === selectedSupplier), [suppliers, selectedSupplier]);
  const currency = selectedSupplierObj?.supplier_currency || "GBP";

  // Fetch on-account supplier payments for selected supplier and date range
  const {
    data: payments = [],
    isLoading: loadingPayments,
    isError: errorPayments,
    refetch: refetchPayments
  } = useQuery<SupplierPayment[]>({
    queryKey: ["on-acc-supplier-payments", selectedSupplier, fromDate, toDate],
    enabled: !!selectedSupplier,
    queryFn: async () => {
      const params = new URLSearchParams({
        supplierId: selectedSupplier,
        fromDate: format(fromDate, "yyyy-MM-dd"),
        toDate: format(toDate, "yyyy-MM-dd")
      });
      const all = await apiRequest("GET", `/api/supplier-payments/history?${params}`);
      return all
        .filter((p: any) => p.purchaseInvoiceId == null)
        .map((p: any) => ({ ...p, amount: p.amount ?? p.paidAmt ?? 0 }));
    }
  });

  // Add new on-account supplier payment
  const addPaymentMutation = useMutation({
    mutationFn: async (data: InsertSupplierPayment) => {
      return apiRequest("POST", "/api/supplier-payments", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Payment added." });
      setNewPayment({ paymentDate: new Date(), amount: 0, paymentMode: "CASH", remarks: "", purchaseInvoiceId: null });
      refetchPayments();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Failed to add payment." });
    }
  });

  const handleAddPayment = () => {
    if (!selectedSupplier) return toast({ title: "Select a supplier" });
    if (!newPayment.amount || newPayment.amount <= 0) return toast({ title: "Enter a valid amount" });
    const payload: InsertSupplierPayment = {
      supplierId: Number(selectedSupplier),
      purchaseInvoiceId: newPayment.purchaseInvoiceId,
      amount: newPayment.amount,
      paymentMode: newPayment.paymentMode,
      paymentDate: format(newPayment.paymentDate, "yyyy-MM-dd"),
      remarks: newPayment.remarks || null
    };
    addPaymentMutation.mutate(payload);
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

  // Fetch purchase invoices when supplier changes
  useEffect(() => {
    if (!selectedSupplier) {
      setSupplierInvoices([]);
      return;
    }
    const fetchInvoices = async () => {
      const fromDate = "2000-01-01";
      const toDate = "2100-01-01";
      const invoices = await apiRequest(
        "GET",
        `/api/suppliers/${selectedSupplier}/outstanding_invoices?fromDate=${fromDate}&toDate=${toDate}`
      );
      setSupplierInvoices(invoices);
    };
    fetchInvoices();
  }, [selectedSupplier]);

  return (
    <PageLayout title="On A/c Supplier Payments" breadcrumb="On A/c Supplier">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Truck size={20} />
                On A/c Supplier Payments
              </CardTitle>
              <div className="text-sm text-gray-500">
                {companyDetails?.companyName || "Company Name"}, {companyDetails?.address1 || ""}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ""}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label>Supplier:</Label>
                <SupplierSearch
                  placeholder="Search supplier by code or name..."
                  onSupplierSelect={(supplier) => {
                    handleSupplierSelectHook(supplier);
                    setSelectedSupplier(supplier?.id.toString() || "");
                  }}
                  showCode
                  allowClear
                />
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
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Remarks</Label>
                <Input value={newPayment.remarks} onChange={e => setNewPayment(np => ({ ...np, remarks: e.target.value }))} />
              </div>
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
                      {newPayment.purchaseInvoiceId
                        ? supplierInvoices.find(inv => inv.id === newPayment.purchaseInvoiceId)?.invoiceNumber
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
                            setNewPayment(np => ({ ...np, purchaseInvoiceId: null }));
                            setInvoicePopoverOpen(false);
                            setInvoiceQuery("");
                          }}
                        >
                          No Invoice
                        </CommandItem>
                        <CommandEmpty>No invoices found.</CommandEmpty>
                        {supplierInvoices
                          .filter(inv =>
                            invoiceQuery === "" ||
                            inv.invoiceNumber.toLowerCase().includes(invoiceQuery.toLowerCase())
                          )
                          .map(inv => (
                            <CommandItem
                              key={inv.id}
                              value={inv.invoiceNumber}
                              onSelect={() => {
                                setNewPayment(np => ({ ...np, purchaseInvoiceId: inv.id }));
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
              <Button onClick={handleAddPayment} disabled={addPaymentMutation.isPending || !selectedSupplier} className="bg-green-600 hover:bg-green-700 flex gap-2">
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
                      <TableHead>Amount ({currency})</TableHead>
                      <TableHead>Payment Mode</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead>Invoice No</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.slice(0, Number(recordsPerPage)).map((p, idx) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.paymentDate}</TableCell>
                        <TableCell>{p.amount}</TableCell>
                        <TableCell>{p.paymentMode}</TableCell>
                        <TableCell>{p.remarks}</TableCell>
                        <TableCell>{p.purchaseInvoiceId ? (supplierInvoices.find(inv => Number(inv.id) === Number(p.purchaseInvoiceId))?.invoiceNumber || p.purchaseInvoiceId) : '-'}</TableCell>
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