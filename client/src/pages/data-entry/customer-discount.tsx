import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import PageLayout from "@/components/common/page-layout";
import CustomerSearch from "@/components/ui/customer-search";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useBackdatePermissions, usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, Printer, Search, Trash2 } from "lucide-react";

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

interface DiscountProductCandidate extends DiscountLine {
  saleId: number;
  invoiceNumber: string;
  invoiceDate: string;
  availableDiscountAmount: number;
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
  productId: number;
  productType: "regular" | "non";
  invoiceNumber: string;
  documentInvoiceNumber?: string | null;
  productName: string;
  amount: number;
  date: string;
  reason: string;
  isDeleted: boolean;
}

interface DiscountTicketLine {
  saleId: number;
  saleItemId: number;
  invoiceNumber: string;
  invoiceDate: string;
  productName: string;
  amount: number;
  reason: string;
}

interface DiscountTicketGroup {
  key: string;
  documentInvoiceNumber: string | null;
  lines: CustomerDiscount[];
  activeLines: CustomerDiscount[];
  dates: string[];
  invoiceNumbers: string[];
  amount: number;
}

const money = (value: number) => `£${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
const productKey = (productType: string, productId: number) => `${productType}:${productId}`;

export default function CustomerDiscountPage() {
  const { selectedCustomer, handleCustomerSelect, customerId } = useCustomerSearch();
  const { currentDate, isLoading: isLoadingBusinessDate } = useBusinessDate();
  const { canEditBackdate, canDeleteBackdate, canEditCurrentDate } = useBackdatePermissions();
  const permissions = usePermissions();
  const showDiscountDate = permissions.customer_discount_date !== false;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const businessDateString = currentDate || "";
  const [fromDate, setFromDate] = useState("");
  const [discountFromDate, setDiscountFromDate] = useState("");
  const [discountToDate, setDiscountToDate] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [selectedProductKey, setSelectedProductKey] = useState("");
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [editingDiscount, setEditingDiscount] = useState<CustomerDiscount | null>(null);
  const [ticketLines, setTicketLines] = useState<DiscountTicketLine[]>([]);

  useEffect(() => {
    if (!businessDateString) return;
    setTransactionDate(previous => !showDiscountDate || !previous ? businessDateString : previous);
    setFromDate(previous => previous || format(subDays(parseISO(businessDateString), 30), "yyyy-MM-dd"));
    setDiscountFromDate(previous => previous || businessDateString);
    setDiscountToDate(previous => previous || businessDateString);
  }, [businessDateString, showDiscountDate]);

  useEffect(() => {
    setSearchEnabled(false);
    setSelectedProductKey("");
    setSelectedSaleId("");
    setSelectedLineId("");
    setAmount("");
    setReason("");
    setEditingDiscount(null);
    setTicketLines([]);
  }, [customerId]);

  const productsQuery = useQuery<DiscountProductCandidate[]>({
    queryKey: ["customer-discount-products", customerId, fromDate, businessDateString],
    queryFn: () => apiRequest(
      "GET",
      `/api/customer-discounts/products?customerId=${customerId}&fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(businessDateString)}`
    ),
    enabled: !!customerId && !!businessDateString && searchEnabled,
  });

  const invoiceQuery = useQuery<DiscountInvoice>({
    queryKey: ["customer-discount-invoice-lines", selectedSaleId],
    queryFn: () => apiRequest("GET", `/api/customer-discounts/invoices/${selectedSaleId}`),
    enabled: !!selectedSaleId,
  });

  const discountsQuery = useQuery<CustomerDiscount[]>({
    queryKey: ["customer-discounts", customerId, discountFromDate, discountToDate],
    queryFn: () => apiRequest(
      "GET",
      `/api/customer-discounts?customerId=${customerId}&fromDate=${encodeURIComponent(discountFromDate)}&toDate=${encodeURIComponent(discountToDate)}`
    ),
    enabled: !!customerId && !!discountFromDate && !!discountToDate && discountFromDate <= discountToDate,
  });

  const productOptions = useMemo(() => {
    const options = new Map<string, Pick<DiscountProductCandidate, "productId" | "productType" | "productName">>();
    for (const candidate of productsQuery.data || []) {
      options.set(productKey(candidate.productType, candidate.productId), {
        productId: candidate.productId,
        productType: candidate.productType,
        productName: candidate.productName,
      });
    }
    if (editingDiscount) {
      options.set(productKey(editingDiscount.productType, editingDiscount.productId), {
        productId: editingDiscount.productId,
        productType: editingDiscount.productType,
        productName: editingDiscount.productName,
      });
    }
    return Array.from(options.entries()).map(([key, product]) => ({ key, ...product }));
  }, [productsQuery.data, editingDiscount]);

  const matchingInvoices = useMemo(() => {
    const invoices = new Map<number, DiscountProductCandidate>();
    for (const candidate of productsQuery.data || []) {
      if (productKey(candidate.productType, candidate.productId) === selectedProductKey) {
        invoices.set(candidate.saleId, candidate);
      }
    }
    return Array.from(invoices.values());
  }, [productsQuery.data, selectedProductKey]);

  const discountTickets = useMemo<DiscountTicketGroup[]>(() => {
    const groups = new Map<string, CustomerDiscount[]>();
    for (const discount of discountsQuery.data || []) {
      const key = discount.documentInvoiceNumber || `line-${discount.id}`;
      const lines = groups.get(key) || [];
      lines.push(discount);
      groups.set(key, lines);
    }
    return Array.from(groups.entries()).map(([key, lines]) => {
      const activeLines = lines.filter(line => !line.isDeleted);
      return {
        key,
        documentInvoiceNumber: lines[0].documentInvoiceNumber || null,
        lines,
        activeLines,
        dates: Array.from(new Set(lines.map(line => line.date))).sort(),
        invoiceNumbers: Array.from(new Set(lines.map(line => line.invoiceNumber).filter(Boolean))),
        amount: activeLines.reduce((total, line) => total + Number(line.amount || 0), 0),
      };
    });
  }, [discountsQuery.data]);

  const visibleDiscountTickets = useMemo(() => {
    const filter = invoiceFilter.trim().toLowerCase();
    if (!filter) return discountTickets;
    return discountTickets.filter(ticket =>
      [ticket.documentInvoiceNumber, ...ticket.invoiceNumbers]
        .some(invoiceNumber => invoiceNumber?.toLowerCase().includes(filter))
    );
  }, [discountTickets, invoiceFilter]);

  const selectedLine = useMemo(
    () => invoiceQuery.data?.items.find(line =>
      line.id.toString() === selectedLineId &&
      productKey(line.productType, line.productId) === selectedProductKey
    ),
    [invoiceQuery.data, selectedLineId, selectedProductKey]
  );

  const ticketInvoiceAmount = ticketLines
    .filter(line => line.saleId.toString() === selectedSaleId)
    .reduce((total, line) => total + line.amount, 0);
  const editingAmount = editingDiscount?.amount || 0;
  const maxLineDiscount = selectedLine
    ? selectedLine.remainingValue + editingAmount
    : 0;
  const maxInvoiceDiscount = invoiceQuery.data
    ? Math.max(0, invoiceQuery.data.availableDiscountAmount - ticketInvoiceAmount + editingAmount)
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
      queryClient.invalidateQueries({ queryKey: ["customer-discount-products"] }),
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
    setSelectedProductKey("");
    setSelectedSaleId("");
    setSelectedLineId("");
    setAmount("");
    setReason("");
    setTransactionDate(businessDateString);
    setEditingDiscount(null);
    setTicketLines([]);
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
      toast({ title: "Business date unavailable", description: "Wait for the business date to load before searching for products.", variant: "destructive" });
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
    void productsQuery.refetch();
  };

  const handleProductChange = (value: string) => {
    setSelectedProductKey(value);
    setSelectedSaleId("");
    setSelectedLineId("");
    setAmount("");
    setReason("");
    setEditingDiscount(null);
  };

  const handleInvoiceChange = (value: string) => {
    setSelectedSaleId(value);
    setSelectedLineId("");
    setAmount("");
    setEditingDiscount(null);
  };

  const handleAddTicketLine = () => {
    const invoice = invoiceQuery.data;
    const line = selectedLine;
    if (!selectedCustomer || !invoice || !line) {
      toast({ title: "Incomplete entry", description: "Select an invoice product line before adding it to the ticket.", variant: "destructive" });
      return;
    }
    if (!transactionDate || transactionDate > businessDateString || !canCreateForDate) {
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
      toast({ title: "Reason required", description: "Enter a reason for this discount line.", variant: "destructive" });
      return;
    }
    if (ticketLines.some(ticketLine => ticketLine.saleItemId === line.id)) {
      toast({ title: "Product line already added", description: "A product line can only appear once in a discount ticket.", variant: "destructive" });
      return;
    }

    setTicketLines(previous => [...previous, {
      saleId: invoice.saleId,
      saleItemId: line.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.date,
      productName: line.productName,
      amount: parsedAmount,
      reason: reason.trim(),
    }]);
    setSelectedLineId("");
    setAmount("");
    setReason("");
  };

  const handleEdit = (discount: CustomerDiscount) => {
    if (!canEditEntry(discount.date)) {
      toast({ title: "Permission denied", description: "You cannot edit a discount for this date.", variant: "destructive" });
      return;
    }
    setEditingDiscount(discount);
    setTicketLines([]);
    setSelectedProductKey(productKey(discount.productType, discount.productId));
    setSelectedSaleId(discount.saleId.toString());
    setSelectedLineId(discount.saleItemId.toString());
    setAmount(discount.amount.toFixed(2));
    setReason(discount.reason);
    setTransactionDate(showDiscountDate ? discount.date : businessDateString);
  };

  const handleSave = async () => {
    if (!selectedCustomer || (editingDiscount && (!selectedProductKey || !selectedSaleId || !selectedLineId))) {
      toast({ title: "Incomplete entry", description: "Select a customer, product, invoice, and invoice product line.", variant: "destructive" });
      return;
    }
    if (!editingDiscount && ticketLines.length === 0) {
      toast({ title: "Empty discount ticket", description: "Add at least one product line before recording the ticket.", variant: "destructive" });
      return;
    }
    if (!transactionDate || transactionDate > businessDateString || !canSaveForDate) {
      toast({ title: "Date not permitted", description: "Choose the current business date or a backdate you are authorized to enter.", variant: "destructive" });
      return;
    }
    try {
      if (editingDiscount) {
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
        const saved = await apiRequest<CustomerDiscount>("PUT", `/api/customer-discounts/${editingDiscount.id}`, {
          customerId: selectedCustomer.id,
          saleId: Number(selectedSaleId),
          saleItemId: Number(selectedLineId),
          amount: parsedAmount,
          date: transactionDate,
          reason: reason.trim(),
        });
        await invalidateDiscountData(editingDiscount);
        toast({ title: "Discount updated", description: `${saved.reference} was saved for ${saved.date}.` });
      } else {
        const result = await apiRequest<{ documentInvoiceNumber: string; discounts: CustomerDiscount[] }>(
          "POST",
          "/api/customer-discounts",
          {
            customerId: selectedCustomer.id,
            date: transactionDate,
            items: ticketLines.map(line => ({
              saleId: line.saleId,
              saleItemId: line.saleItemId,
              amount: line.amount,
              reason: line.reason,
            })),
          },
        );
        await invalidateDiscountData(null);
        toast({
          title: "Discount ticket recorded",
          description: `Ticket ${result.documentInvoiceNumber} with ${result.discounts.length} product line${result.discounts.length === 1 ? "" : "s"} was saved.`,
        });
      }
      resetForm();
    } catch (error: any) {
      toast({
        title: "Unable to save discount",
        description: error?.message || "The server rejected the discount.",
        variant: "destructive",
      });
    }
  };

  const earliestInvoiceDate = [
    invoiceQuery.data?.date,
    ...ticketLines.map(line => line.invoiceDate),
  ].filter((value): value is string => !!value).sort().slice(-1)[0];
  const visibleInvoiceLines = (invoiceQuery.data?.items || []).filter(
    line => productKey(line.productType, line.productId) === selectedProductKey
  );

  const handleDelete = async (ticket: DiscountTicketGroup) => {
    const activeLine = ticket.activeLines[0];
    if (!activeLine) return;
    if (!ticket.activeLines.every(line => canDeleteEntry(line.date))) {
      toast({ title: "Permission denied", description: "You cannot delete every discount line in this ticket.", variant: "destructive" });
      return;
    }
    const ticketNumber = ticket.documentInvoiceNumber || activeLine.reference;
    if (!window.confirm(`Delete ticket ${ticketNumber} (${ticket.activeLines.length} active line${ticket.activeLines.length === 1 ? "" : "s"}, ${money(ticket.amount)})? This reverses the ticket's balance and report effect.`)) return;
    try {
      await apiRequest("DELETE", `/api/customer-discounts/${activeLine.id}`);
      await invalidateDiscountData(activeLine);
      toast({ title: "Discount ticket deleted", description: `Ticket ${ticketNumber} was reversed.` });
      if (ticket.activeLines.some(line => line.id === editingDiscount?.id)) resetForm();
    } catch (error: any) {
      toast({
        title: "Unable to delete discount",
        description: error?.message || "The server rejected the deletion.",
        variant: "destructive",
      });
    }
  };

  const handlePrint = (ticket: DiscountTicketGroup) => {
    const activeLine = ticket.activeLines[0];
    if (!activeLine) return;
    const ticketNumber = ticket.documentInvoiceNumber || activeLine.reference;
    window.open(
      `/print/invoice/${encodeURIComponent(ticketNumber)}?discountId=${activeLine.id}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <PageLayout title="Customer Discount" breadcrumb="Data Entry > Customer Discount">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Find Customer Products</CardTitle></CardHeader>
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
            <Button onClick={handleSearch} disabled={!selectedCustomer || productsQuery.isFetching}>
              {productsQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Find Products
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{editingDiscount ? `Edit ${editingDiscount.reference}` : "Create a Discount Ticket"}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="discount-product">Product</Label>
                <select
                  id="discount-product"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedProductKey}
                  onChange={event => handleProductChange(event.target.value)}
                  disabled={editingDiscount !== null || !searchEnabled || productsQuery.isFetching}
                >
                  <option value="">Select a product</option>
                  {productOptions.map(product => (
                    <option key={product.key} value={product.key}>{product.productName}</option>
                  ))}
                </select>
                {searchEnabled && !productsQuery.isFetching && !(productsQuery.data || []).length && (
                  <p className="text-sm text-muted-foreground">No discountable products were found in finalized invoices for this date range.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount-invoice">Matching invoice</Label>
                <select
                  id="discount-invoice"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedSaleId}
                  onChange={event => handleInvoiceChange(event.target.value)}
                  disabled={editingDiscount !== null || !selectedProductKey || productsQuery.isFetching}
                >
                  <option value="">Select an invoice</option>
                  {selectedSaleId && invoiceQuery.data &&
                    !matchingInvoices.some(invoice => invoice.saleId.toString() === selectedSaleId) && (
                      <option value={selectedSaleId}>
                        {invoiceQuery.data.invoiceNumber} — {format(new Date(invoiceQuery.data.date), "dd/MM/yyyy")}
                      </option>
                    )}
                  {matchingInvoices.map(invoice => (
                    <option key={invoice.saleId} value={invoice.saleId}>
                      {invoice.invoiceNumber} — {format(new Date(invoice.invoiceDate), "dd/MM/yyyy")} — discountable {money(invoice.availableDiscountAmount)}
                    </option>
                  ))}
                </select>
                {selectedProductKey && searchEnabled && !productsQuery.isFetching && matchingInvoices.length === 0 && !editingDiscount && (
                  <p className="text-sm text-muted-foreground">No eligible invoice contains this product in the selected date range.</p>
                )}
              </div>
            </div>

            {showDiscountDate && (
              <div className="max-w-sm space-y-2">
                <Label htmlFor="discount-date">Discount transaction date</Label>
                <Input
                  id="discount-date"
                  type="date"
                  value={transactionDate}
                  max={businessDateString}
                  min={earliestInvoiceDate}
                  onChange={event => setTransactionDate(event.target.value)}
                  disabled={isLoadingBusinessDate || !businessDateString || (!!editingDiscount && !canEditEntry(editingDiscount.date))}
                />
                {transactionDate < businessDateString && !canEditBackdate && (
                  <p className="text-sm text-destructive">Backdated discount entry permission is required.</p>
                )}
              </div>
            )}

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
              <Label htmlFor="discount-line">Product line on selected invoice</Label>
              <select
                id="discount-line"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedLineId}
                onChange={event => setSelectedLineId(event.target.value)}
                disabled={!invoiceQuery.data}
              >
                <option value="">Select the invoice product line</option>
                {visibleInvoiceLines.map(line => (
                  <option
                    key={line.id}
                    value={line.id}
                    disabled={
                      (line.remainingValue <= 0 && line.id.toString() !== editingDiscount?.saleItemId.toString()) ||
                      (!editingDiscount && ticketLines.some(ticketLine => ticketLine.saleItemId === line.id))
                    }
                  >
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
                After this discount: line total <strong>{money(previewLineTotal)}</strong> · effective average unit price <strong>{money(previewUnitPrice)}</strong> · invoice balance <strong>{money((invoiceQuery.data?.outstandingAmount || 0) - ticketInvoiceAmount - parsedAmount + editingAmount)}</strong>
                {(invoiceQuery.data?.outstandingAmount || 0) - ticketInvoiceAmount - parsedAmount + editingAmount < 0 && <> · customer credit <strong>{money(Math.abs((invoiceQuery.data?.outstandingAmount || 0) - ticketInvoiceAmount - parsedAmount + editingAmount))}</strong></>}
              </div>
            )}

            {!editingDiscount && ticketLines.length > 0 && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">Discount Ticket Draft</h3>
                  <span className="text-sm font-semibold">
                    Total: {money(ticketLines.reduce((total, line) => total + line.amount, 0))}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Discount</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ticketLines.map(line => (
                        <TableRow key={line.saleItemId}>
                          <TableCell>{line.invoiceNumber}</TableCell>
                          <TableCell>{line.productName}</TableCell>
                          <TableCell className="max-w-xs whitespace-normal">{line.reason}</TableCell>
                          <TableCell className="text-right">{money(line.amount)}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setTicketLines(previous => previous.filter(item => item.saleItemId !== line.saleItemId))}
                              aria-label={`Remove ${line.productName} from discount ticket`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!editingDiscount && (
                <Button
                  variant="outline"
                  onClick={handleAddTicketLine}
                  disabled={!selectedLine || !reason.trim() || !amount || !canCreateForDate || invoiceQuery.isFetching}
                >
                  Add Product to Ticket
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={
                  editingDiscount
                    ? !selectedLine || !reason.trim() || !amount || !canSaveForDate || invoiceQuery.isFetching
                    : ticketLines.length === 0 || !canCreateForDate || invoiceQuery.isFetching
                }
              >
                {invoiceQuery.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingDiscount ? "Save Changes" : "Record Discount Ticket"}
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
            ) : (
              <>
                <div className="mb-4 grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="discount-history-from">Date from</Label>
                    <Input
                      id="discount-history-from"
                      type="date"
                      value={discountFromDate}
                      max={businessDateString}
                      onChange={event => setDiscountFromDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discount-history-to">Date to</Label>
                    <Input
                      id="discount-history-to"
                      type="date"
                      value={discountToDate}
                      max={businessDateString}
                      onChange={event => setDiscountToDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discount-history-invoice">Invoice number</Label>
                    <Input
                      id="discount-history-invoice"
                      value={invoiceFilter}
                      onChange={event => setInvoiceFilter(event.target.value)}
                      placeholder="Filter by invoice or ticket number"
                    />
                  </div>
                </div>
                {discountFromDate > discountToDate ? (
                  <p className="text-sm text-destructive">The start date must be on or before the end date.</p>
                ) : discountsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading discount history…</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead><TableHead>Reference(s)</TableHead><TableHead>Ticket No</TableHead><TableHead>Invoice(s)</TableHead>
                          <TableHead>Products</TableHead><TableHead>Reasons</TableHead><TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead><TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleDiscountTickets.map(ticket => (
                          <TableRow key={ticket.key} className={ticket.activeLines.length === 0 ? "opacity-60" : ""}>
                            <TableCell>{ticket.dates.join(", ")}</TableCell>
                            <TableCell>{ticket.lines.map(line => line.reference).join(", ")}</TableCell>
                            <TableCell>{ticket.documentInvoiceNumber || "-"}</TableCell>
                            <TableCell>{ticket.invoiceNumbers.join(", ") || "-"}</TableCell>
                            <TableCell className="whitespace-normal">
                              {ticket.lines.map(line => (
                                <div key={line.id} className={line.isDeleted ? "line-through text-muted-foreground" : ""}>
                                  {line.productName}
                                </div>
                              ))}
                            </TableCell>
                            <TableCell className="max-w-xs whitespace-normal">
                              {ticket.lines.map(line => (
                                <div key={line.id} className={line.isDeleted ? "line-through text-muted-foreground" : ""}>
                                  {line.reason}
                                </div>
                              ))}
                            </TableCell>
                            <TableCell className="text-right">{money(ticket.amount)}</TableCell>
                            <TableCell>
                              {ticket.activeLines.length === 0
                                ? "Deleted"
                                : ticket.activeLines.length === ticket.lines.length
                                  ? "Active"
                                  : "Partially Deleted"}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {ticket.activeLines.length > 0 && (
                                  <Button size="sm" variant="outline" onClick={() => handlePrint(ticket)} aria-label={`Print ticket ${ticket.documentInvoiceNumber || ticket.key}`}>
                                    <Printer className="mr-1 h-4 w-4" />Print
                                  </Button>
                                )}
                                {ticket.activeLines.map(line => (
                                  <Button key={line.id} size="sm" variant="outline" onClick={() => handleEdit(line)} disabled={!canEditEntry(line.date)} aria-label={`Edit ${line.reference}`}>
                                    <Pencil className="mr-1 h-4 w-4" />{line.productName}
                                  </Button>
                                ))}
                                {ticket.activeLines.length > 0 && (
                                  <Button size="sm" variant="destructive" onClick={() => void handleDelete(ticket)} disabled={!ticket.activeLines.every(line => canDeleteEntry(line.date))} aria-label={`Delete ticket ${ticket.documentInvoiceNumber || ticket.key}`}>
                                    <Trash2 className="mr-1 h-4 w-4" />Delete Ticket
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {!visibleDiscountTickets.length && (
                          <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No discounts match the selected filters.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
