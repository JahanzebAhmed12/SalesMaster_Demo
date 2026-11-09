import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import PageLayout from "@/components/common/page-layout";
import CustomerSearch from "@/components/ui/customer-search";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useBackdatePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, Search, Trash2 } from "lucide-react";

interface CustomerInvoice {
  id: number;
  invoiceNumber: string;
  date: string;
  totalAmount: number;
  paidAmount: number;
  discountAmount: number;
  outstandingAmount: number;
  availableDiscountAmount: number;
  discountEligible: boolean;
}

interface DiscountLine {
  id: number;
  productId: number;
  productType: "regular" | "non";
  productName: string;
  quantity: number;
  unitPrice: number;
  originalTotal: number;
  discountTotal: number;
  remainingValue: number;
  effectiveUnitPrice: number;
}

interface DiscountInvoice {
  saleId: number;
  invoiceNumber: string;
  date: string;
  totalAmount: number;
  paidAmount: number;
  discountTotal: number;
  outstandingAmount: number;
  availableDiscountAmount: number;
  discountEligible: boolean;
  items: DiscountLine[];
}

interface CustomerDiscount {
  id: number;
  reference: string;
  customerId: number;
  customerName: string;
  saleId: number;
  saleItemId: number;
  invoiceNumber: string;
  productName: string;
  amount: number;
  date: string;
  reason: string;
  isDeleted: boolean;
}

const money = (value: number) => `£${(Number.isFinite(value) ? value : 0).toFixed(2)}`;

export default function CustomerDiscountPage() {
  const { selectedCustomer, handleCustomerSelect, customerId } = useCustomerSearch();
  const { currentDate, isLoading: isLoadingBusinessDate } = useBusinessDate();
  const { canEditBackdate, canDeleteBackdate, canEditCurrentDate } = useBackdatePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const businessDateString = currentDate || "";
  const [fromDate, setFromDate] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [editingDiscount, setEditingDiscount] = useState<CustomerDiscount | null>(null);

  useEffect(() => {
    if (!businessDateString) return;
    setTransactionDate(previous => previous || businessDateString);
    setFromDate(previous => previous || format(subDays(parseISO(businessDateString), 30), "yyyy-MM-dd"));
  }, [businessDateString]);

  useEffect(() => {
    setSearchEnabled(false);
    setSelectedSaleId("");
    setSelectedLineId("");
    setAmount("");
    setReason("");
    setEditingDiscount(null);
  }, [customerId]);

  const invoicesQuery = useQuery<CustomerInvoice[]>({
    queryKey: ["customer-discount-invoices", customerId, fromDate, businessDateString],
    queryFn: () => apiRequest(
      "GET",
      `/api/customers/${customerId}/invoices?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(businessDateString)}`
    ),
    enabled: !!customerId && !!businessDateString && searchEnabled,
  });

  const invoiceQuery = useQuery<DiscountInvoice>({
    queryKey: ["customer-discount-invoice-lines", selectedSaleId],
    queryFn: () => apiRequest("GET", `/api/customer-discounts/invoices/${selectedSaleId}`),
    enabled: !!selectedSaleId,
  });

  const discountsQuery = useQuery<CustomerDiscount[]>({
    queryKey: ["customer-discounts", customerId, fromDate, businessDateString],
    queryFn: () => apiRequest(
      "GET",
      `/api/customer-discounts?customerId=${customerId}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(businessDateString)}`
    ),
    enabled: !!customerId,
  });

  const selectedLine = useMemo(
    () => invoiceQuery.data?.items.find(line => line.id.toString() === selectedLineId),
    [invoiceQuery.data, selectedLineId]
  );

  const editingAmount = editingDiscount?.amount || 0;
  const maxLineDiscount = selectedLine
    ? selectedLine.remainingValue + editingAmount
    : 0;
  const maxInvoiceDiscount = invoiceQuery.data
    ? invoiceQuery.data.availableDiscountAmount + editingAmount
    : 0;
  const parsedAmount = Number(amount);
  const previewLineTotal = selectedLine
    ? Math.max(0, selectedLine.originalTotal - selectedLine.discountTotal - parsedAmount + editingAmount)
    : 0;
  const previewUnitPrice = selectedLine?.quantity
    ? previewLineTotal / selectedLine.quantity
    : 0;

  const invalidateDiscountData = async (discount?: CustomerDiscount | null) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["customer-discounts"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-discount-invoices"] }),
      queryClient.invalidateQueries({ queryKey: ["customer-discount-invoice-lines"] }),
      queryClient.invalidateQueries({ queryKey: ["daily-book-sales"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/daily-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/customer-history"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/customer-statement"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/customer-aging"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/all-customer-history"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/product-sales-history"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/product-sales"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/prod-customer-history"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/date-wise-sales"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/reports/sales-analysis"] }),
      queryClient.invalidateQueries({ queryKey: ["product-history"] }),
      queryClient.invalidateQueries({ queryKey: ["product-sales-history"] }),
      queryClient.invalidateQueries({ queryKey: ["product-sales-report"] }),
      queryClient.invalidateQueries({ queryKey: ["prod-customer-history"] }),
      queryClient.invalidateQueries({ queryKey: ["date-wise-sales"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] }),
    ]);
    if (discount?.date) {
      await queryClient.invalidateQueries({
        queryKey: ["/api/reports/daily-summary", discount.date],
      });
    }
  };

  const resetForm = () => {
    setSelectedSaleId("");
    setSelectedLineId("");
    setAmount("");
    setReason("");
    setTransactionDate(businessDateString);
    setEditingDiscount(null);
  };

  const canEditEntry = (entryDate: string) =>
    entryDate < businessDateString ? canEditBackdate : canEditCurrentDate;
  const canDeleteEntry = (entryDate: string) =>
    entryDate < businessDateString ? canDeleteBackdate : canEditCurrentDate;
  const canCreateForDate = transactionDate === businessDateString
    ? true
    : transactionDate < businessDateString && canEditBackdate;
  const canSaveForDate = editingDiscount
    ? canEditEntry(editingDiscount.date) && canEditEntry(transactionDate)
    : canCreateForDate;

  const handleSearch = () => {
    if (!businessDateString) {
      toast({ title: "Business date unavailable", description: "Wait for the business date to load before searching invoices.", variant: "destructive" });
      return;
    }
    if (!selectedCustomer) {
      toast({ title: "Select a customer", description: "Choose a customer before searching invoices.", variant: "destructive" });
      return;
    }
    if (!fromDate || fromDate > businessDateString) {
      toast({ title: "Invalid date range", description: "The start date must be on or before the current business date.", variant: "destructive" });
      return;
    }
    setSearchEnabled(true);
    void invoicesQuery.refetch();
  };

  const handleInvoiceChange = (value: string) => {
    setSelectedSaleId(value);
    setSelectedLineId("");
    setAmount("");
    setEditingDiscount(null);
  };

  const handleEdit = (discount: CustomerDiscount) => {
    if (!canEditEntry(discount.date)) {
      toast({ title: "Permission denied", description: "You cannot edit a discount for this date.", variant: "destructive" });
      return;
    }
    setEditingDiscount(discount);
    setSelectedSaleId(discount.saleId.toString());
    setSelectedLineId(discount.saleItemId.toString());
    setAmount(discount.amount.toFixed(2));
    setReason(discount.reason);
    setTransactionDate(discount.date);
  };

  const handleSave = async () => {
    if (!selectedCustomer || !selectedSaleId || !selectedLineId) {
      toast({ title: "Incomplete entry", description: "Select a customer, invoice, and invoice product line.", variant: "destructive" });
      return;
    }
    if (!transactionDate || transactionDate > businessDateString || !canSaveForDate) {
      toast({ title: "Date not permitted", description: "Choose the current business date or a backdate you are authorized to enter.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !/^\d+(\.\d{1,2})?$/.test(amount)) {
      toast({ title: "Invalid amount", description: "Enter a positive discount amount with no more than two decimal places.", variant: "destructive" });
      return;
    }
    if (parsedAmount > maxLineDiscount || parsedAmount > maxInvoiceDiscount) {
      toast({ title: "Discount exceeds the limit", description: "The amount cannot exceed the remaining line value or undiscounted invoice value.", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "Enter a reason for this discount.", variant: "destructive" });
      return;
    }

    const payload = {
      customerId: selectedCustomer.id,
      saleId: Number(selectedSaleId),
      saleItemId: Number(selectedLineId),
      amount: parsedAmount,
      date: transactionDate,
      reason: reason.trim(),
    };
    try {
      const saved = editingDiscount
        ? await apiRequest<CustomerDiscount>("PUT", `/api/customer-discounts/${editingDiscount.id}`, payload)
        : await apiRequest<CustomerDiscount>("POST", "/api/customer-discounts", payload);
      await invalidateDiscountData(editingDiscount);
      toast({
        title: editingDiscount ? "Discount updated" : "Discount recorded",
        description: `${saved.reference} was saved for ${saved.date}.`,
      });
      resetForm();
    } catch (error: any) {
      toast({
        title: "Unable to save discount",
        description: error?.message || "The server rejected the discount.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (discount: CustomerDiscount) => {
    if (!canDeleteEntry(discount.date)) {
      toast({ title: "Permission denied", description: "You cannot delete a discount for this date.", variant: "destructive" });
      return;
    }
    if (!window.confirm(`Delete ${discount.reference} for ${money(discount.amount)}? This reverses its balance and report effect.`)) return;
    try {
      await apiRequest("DELETE", `/api/customer-discounts/${discount.id}`);
      await invalidateDiscountData(discount);
      toast({ title: "Discount deleted", description: `${discount.reference} was reversed.` });
      if (editingDiscount?.id === discount.id) resetForm();
    } catch (error: any) {
      toast({
        title: "Unable to delete discount",
        description: error?.message || "The server rejected the deletion.",
        variant: "destructive",
      });
    }
  };

  return (
    <PageLayout title="Customer Discount" breadcrumb="Data Entry > Customer Discount">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Find Customer Invoices</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
            <CustomerSearch
              label="Customer"
              onCustomerSelect={handleCustomerSelect}
              required
              showCode
              allowClear
            />
            <div className="space-y-2">
              <Label htmlFor="discount-from-date">Invoice date from</Label>
              <Input
                id="discount-from-date"
                type="date"
                value={fromDate}
                max={businessDateString}
                onChange={event => setFromDate(event.target.value)}
              />
            </div>
            <Button onClick={handleSearch} disabled={!selectedCustomer || invoicesQuery.isFetching}>
              {invoicesQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Get Invoices
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{editingDiscount ? `Edit ${editingDiscount.reference}` : "Record a Discount"}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="discount-invoice">Invoice</Label>
                <select
                  id="discount-invoice"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedSaleId}
                  onChange={event => handleInvoiceChange(event.target.value)}
                  disabled={!searchEnabled && !editingDiscount}
                >
                  <option value="">Select an invoice</option>
                  {selectedSaleId && invoiceQuery.data && !invoicesQuery.data?.some(item => item.id.toString() === selectedSaleId) && (
                    <option value={selectedSaleId}>{invoiceQuery.data.invoiceNumber}</option>
                  )}
                  {(invoicesQuery.data || []).map(invoice => (
                    <option key={invoice.id} value={invoice.id} disabled={!invoice.discountEligible}>
                      {invoice.invoiceNumber} — {format(new Date(invoice.date), "dd/MM/yyyy")} — outstanding {money(invoice.outstandingAmount)} — discountable {money(invoice.availableDiscountAmount)}
                      {!invoice.discountEligible ? " (not eligible)" : ""}
                    </option>
                  ))}
                </select>
                {searchEnabled && !invoicesQuery.isFetching && !(invoicesQuery.data || []).length && (
                  <p className="text-sm text-muted-foreground">No finalized invoices found in this date range.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount-date">Discount transaction date</Label>
                <Input
                  id="discount-date"
                  type="date"
                  value={transactionDate}
                  max={businessDateString}
                  min={invoiceQuery.data?.date}
                  onChange={event => setTransactionDate(event.target.value)}
                  disabled={isLoadingBusinessDate || !businessDateString || (!!editingDiscount && !canEditEntry(editingDiscount.date))}
                />
                {transactionDate < businessDateString && !canEditBackdate && (
                  <p className="text-sm text-destructive">Backdated discount entry permission is required.</p>
                )}
              </div>
            </div>

            {selectedSaleId && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                {invoiceQuery.isLoading ? "Loading invoice lines…" : invoiceQuery.data ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <span>Invoice total: <strong>{money(invoiceQuery.data.totalAmount)}</strong></span>
                    <span>Paid: <strong>{money(invoiceQuery.data.paidAmount)}</strong></span>
                    <span>Outstanding: <strong>{money(invoiceQuery.data.outstandingAmount)}</strong></span>
                    <span>Discounts already applied: <strong>{money(invoiceQuery.data.discountTotal)}</strong></span>
                    <span>Remaining value available for discounts: <strong>{money(invoiceQuery.data.availableDiscountAmount)}</strong></span>
                    <span className="text-muted-foreground sm:col-span-3">Payment status does not limit discounts. A discount on a paid invoice may create customer credit.</span>
                    {!invoiceQuery.data.discountEligible && <span className="text-destructive sm:col-span-3">This invoice has no remaining value eligible for a discount.</span>}
                  </div>
                ) : null}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="discount-line">Invoice product line</Label>
              <select
                id="discount-line"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedLineId}
                onChange={event => setSelectedLineId(event.target.value)}
                disabled={!invoiceQuery.data}
              >
                <option value="">Select a product line</option>
                {(invoiceQuery.data?.items || []).map(line => (
                <option key={line.id} value={line.id} disabled={line.remainingValue <= 0 && line.id.toString() !== editingDiscount?.saleItemId.toString()}>
                    {line.productName} — Qty {line.quantity} — remaining {money(line.remainingValue)}
                  </option>
                ))}
              </select>
            </div>

            {selectedLine && (
              <div className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="text-muted-foreground">Quantity</span><div className="font-medium">{selectedLine.quantity}</div></div>
                <div><span className="text-muted-foreground">Original unit price</span><div className="font-medium">{money(selectedLine.unitPrice)}</div></div>
                <div><span className="text-muted-foreground">Original line total</span><div className="font-medium">{money(selectedLine.originalTotal)}</div></div>
                <div><span className="text-muted-foreground">Prior line discounts</span><div className="font-medium">{money(selectedLine.discountTotal)}</div></div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="discount-amount">Discount amount (£)</Label>
                <Input
                  id="discount-amount"
                  type="number"
                  min="0.01"
                  max={Math.min(maxLineDiscount, maxInvoiceDiscount)}
                  step="0.01"
                  value={amount}
                  onChange={event => setAmount(event.target.value)}
                  disabled={!selectedLine}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum: {money(Math.max(0, Math.min(maxLineDiscount, maxInvoiceDiscount)))}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount-reason">Reason</Label>
                <Textarea
                  id="discount-reason"
                  maxLength={500}
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  placeholder="Reason for the customer discount"
                />
              </div>
            </div>

            {selectedLine && Number.isFinite(parsedAmount) && parsedAmount > 0 && (
              <div className="rounded-md bg-blue-50 p-3 text-sm">
                After this discount: line total <strong>{money(previewLineTotal)}</strong> · effective average unit price <strong>{money(previewUnitPrice)}</strong> · invoice balance <strong>{money((invoiceQuery.data?.outstandingAmount || 0) - parsedAmount + editingAmount)}</strong>
                {(invoiceQuery.data?.outstandingAmount || 0) - parsedAmount + editingAmount < 0 && <> · customer credit <strong>{money(Math.abs((invoiceQuery.data?.outstandingAmount || 0) - parsedAmount + editingAmount))}</strong></>}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSave}
                disabled={!selectedLine || !reason.trim() || !amount || !canSaveForDate || invoiceQuery.isFetching}
              >
                {invoiceQuery.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingDiscount ? "Save Changes" : "Record Discount"}
              </Button>
              {editingDiscount && <Button variant="outline" onClick={resetForm}>Cancel Edit</Button>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Discount History</CardTitle></CardHeader>
          <CardContent>
            {!selectedCustomer ? (
              <p className="text-sm text-muted-foreground">Select a customer to view discounts.</p>
            ) : discountsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading discount history…</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead>Invoice</TableHead>
                      <TableHead>Product</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead><TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(discountsQuery.data || []).map(discount => (
                      <TableRow key={discount.id} className={discount.isDeleted ? "opacity-60" : ""}>
                        <TableCell>{discount.date}</TableCell>
                        <TableCell>{discount.reference}</TableCell>
                        <TableCell>{discount.invoiceNumber}</TableCell>
                        <TableCell>{discount.productName}</TableCell>
                        <TableCell className="max-w-xs whitespace-normal">{discount.reason}</TableCell>
                        <TableCell className="text-right">{money(discount.amount)}</TableCell>
                        <TableCell>{discount.isDeleted ? "Deleted" : "Active"}</TableCell>
                        <TableCell>
                          {!discount.isDeleted && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => handleEdit(discount)} disabled={!canEditEntry(discount.date)} aria-label={`Edit ${discount.reference}`}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => void handleDelete(discount)} disabled={!canDeleteEntry(discount.date)} aria-label={`Delete ${discount.reference}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!(discountsQuery.data || []).length && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No discounts in this date range.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
