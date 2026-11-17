import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import PageLayout from "@/components/common/page-layout";
import CustomerSearch from "@/components/ui/customer-search";
import ProductSearch from "@/components/ui/product-search";
import type { RegularProduct } from "@shared/schema";
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
import { Loader2, Pencil, Printer, Search, Trash2, Undo2, X, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CreditDocumentDetailsDialog } from "@/components/common/credit-document-details-dialog";

interface DiscountLine {
  id: number;
  productId: number;
  productType: "regular" | "non";
  productName: string;
  productCode?: string;
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

interface EditDiscountLine {
  key: string;
  discountId?: number;
  saleId: number;
  saleItemId: number;
  invoiceNumber: string;
  productName: string;
  amount: string;
  reason: string;
  removed?: boolean;
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
  const [editingTicket, setEditingTicket] = useState<DiscountTicketGroup | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<{ kind: "discount" | "return"; lineId: number } | null>(null);
  const [editLines, setEditLines] = useState<EditDiscountLine[]>([]);
  const [productSearchKey, setProductSearchKey] = useState(0);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
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
    setEditingTicket(null);
    setEditLines([]);
    setTicketLines([]);
    setProductSearchKey(key => key + 1);
  }, [customerId]);

  useEffect(() => {
    const element = reasonRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [reason]);

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
    const options = new Map<string, Pick<DiscountProductCandidate, "productId" | "productType" | "productName" | "productCode">>();
    for (const candidate of productsQuery.data || []) {
      options.set(productKey(candidate.productType, candidate.productId), {
        productId: candidate.productId,
        productType: candidate.productType,
        productName: candidate.productName,
        productCode: candidate.productCode || "",
      });
    }
    return Array.from(options.entries()).map(([key, product]) => ({ key, ...product }));
  }, [productsQuery.data]);

  const searchableDiscountProducts = useMemo(
    () => productOptions.map((option, index) => ({
      id: index + 1,
      productCode: option.productCode,
      name: option.productName,
      description: option.productName,
      returnKey: option.key,
    } as unknown as RegularProduct & { returnKey: string })),
    [productOptions],
  );

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
  const isLegacyTicketEdit = !!editingTicket && !editingTicket.documentInvoiceNumber;
  const editingAmount = isLegacyTicketEdit ? (Number(editLines[0]?.amount) || 0) : 0;
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
    setEditingTicket(null);
    setEditLines([]);
    setTicketLines([]);
    setProductSearchKey(key => key + 1);
  };

  const canEditEntry = (entryDate: string) =>
    entryDate < businessDateString ? canEditBackdate : canEditCurrentDate;
  const canDeleteEntry = (entryDate: string) =>
    entryDate < businessDateString ? canDeleteBackdate : canEditCurrentDate;
  const canCreateForDate = transactionDate === businessDateString
    ? true
    : transactionDate < businessDateString && canEditBackdate;
  const canEditTicket = !!editingTicket
    && editingTicket.activeLines.every(line => canEditEntry(line.date));
  const canSaveForDate = editingTicket
    ? canEditTicket && canEditEntry(transactionDate)
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
  };

  const handleInvoiceChange = (value: string) => {
    setSelectedSaleId(value);
    setSelectedLineId("");
    setAmount("");
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
    setSelectedProductKey("");
    setSelectedSaleId("");
    setSelectedLineId("");
    setAmount("");
    setReason("");
    setProductSearchKey(key => key + 1);
  };

  const handleEditTicket = (ticket: DiscountTicketGroup) => {
    if (!ticket.activeLines.every(line => canEditEntry(line.date))) {
      toast({ title: "Permission denied", description: "You cannot edit every discount line in this ticket.", variant: "destructive" });
      return;
    }
    setEditingTicket(ticket);
    setEditLines(ticket.activeLines.map(line => ({
      key: `edit-${line.id}`,
      discountId: line.id,
      saleId: line.saleId,
      saleItemId: line.saleItemId,
      invoiceNumber: line.invoiceNumber,
      productName: line.productName,
      amount: Number(line.amount || 0).toFixed(2),
      reason: line.reason || "",
    })));
    setTicketLines([]);
    setSelectedProductKey("");
    setSelectedSaleId("");
    setSelectedLineId("");
    setAmount("");
    setReason("");
    setTransactionDate(showDiscountDate ? (ticket.dates[0] || businessDateString) : businessDateString);
    setProductSearchKey(key => key + 1);
  };

  const updateEditLine = (key: string, updates: Partial<EditDiscountLine>) => {
    setEditLines(previous => previous.map(line =>
      line.key === key ? { ...line, ...updates } : line
    ));
  };

  const handleAddEditLine = () => {
    const invoice = invoiceQuery.data;
    const line = selectedLine;
    if (!editingTicket || !invoice || !line) {
      toast({ title: "Incomplete entry", description: "Select an invoice product line before adding it to the ticket.", variant: "destructive" });
      return;
    }
    if (editLines.some(editLine => !editLine.removed && editLine.saleItemId === line.id)) {
      toast({ title: "Product line already added", description: "A product line can only appear once in a discount ticket.", variant: "destructive" });
      return;
    }
    const parsedNewAmount = Number(amount);
    if (!Number.isFinite(parsedNewAmount) || parsedNewAmount <= 0 || !/^\d+(\.\d{1,2})?$/.test(amount)) {
      toast({ title: "Invalid amount", description: "Enter a positive discount amount with no more than two decimal places.", variant: "destructive" });
      return;
    }
    if (parsedNewAmount > maxLineDiscount || parsedNewAmount > maxInvoiceDiscount) {
      toast({ title: "Discount exceeds the limit", description: "The amount cannot exceed the remaining line value or undiscounted invoice value.", variant: "destructive" });
      return;
    }
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "Enter a reason for this discount line.", variant: "destructive" });
      return;
    }
    setEditLines(previous => [...previous, {
      key: `new-${line.id}-${Date.now()}`,
      saleId: invoice.saleId,
      saleItemId: line.id,
      invoiceNumber: invoice.invoiceNumber,
      productName: line.productName,
      amount: parsedNewAmount.toFixed(2),
      reason: reason.trim(),
    }]);
    setSelectedProductKey("");
    setSelectedSaleId("");
    setSelectedLineId("");
    setAmount("");
    setReason("");
    setProductSearchKey(key => key + 1);
  };

  const handleSave = async () => {
    if (!selectedCustomer) {
      toast({ title: "Incomplete entry", description: "Select a customer before saving.", variant: "destructive" });
      return;
    }
    if (!editingTicket && ticketLines.length === 0) {
      toast({ title: "Empty discount ticket", description: "Add at least one product line before recording the ticket.", variant: "destructive" });
      return;
    }
    if (!transactionDate || transactionDate > businessDateString || !canSaveForDate) {
      toast({ title: "Date not permitted", description: "Choose the current business date or a backdate you are authorized to enter.", variant: "destructive" });
      return;
    }
    try {
      if (editingTicket) {
        const activeEditLines = editLines.filter(line => !line.removed);
        if (activeEditLines.length === 0) {
          toast({ title: "Empty discount ticket", description: "A discount ticket must keep at least one line.", variant: "destructive" });
          return;
        }
        const seenItemIds = new Set<number>();
        for (const line of activeEditLines) {
          if (seenItemIds.has(line.saleItemId)) {
            toast({ title: "Duplicate product line", description: "A product line can only appear once in a discount ticket.", variant: "destructive" });
            return;
          }
          seenItemIds.add(line.saleItemId);
          if (!Number.isFinite(Number(line.amount)) || Number(line.amount) <= 0 || !/^\d+(\.\d{1,2})?$/.test(line.amount)) {
            toast({ title: "Invalid amount", description: `Enter a positive discount amount for ${line.productName} with no more than two decimal places.`, variant: "destructive" });
            return;
          }
          if (!line.reason.trim()) {
            toast({ title: "Reason required", description: `Enter a reason for ${line.productName}.`, variant: "destructive" });
            return;
          }
        }
        if (editingTicket.documentInvoiceNumber) {
          await apiRequest("PUT", `/api/customer-discounts/document/${encodeURIComponent(editingTicket.documentInvoiceNumber)}`, {
            customerId: selectedCustomer.id,
            date: transactionDate,
            items: editLines.map(line => line.discountId !== undefined
              ? (line.removed
                ? { id: line.discountId, delete: true }
                : { id: line.discountId, amount: Number(line.amount), reason: line.reason.trim() })
              : {
                saleId: line.saleId,
                saleItemId: line.saleItemId,
                amount: Number(line.amount),
                reason: line.reason.trim(),
              }),
          });
          await invalidateDiscountData(editingTicket.activeLines[0] || null);
          toast({ title: "Discount ticket updated", description: `Ticket ${editingTicket.documentInvoiceNumber} was saved.` });
        } else {
          const line = activeEditLines[0];
          if (activeEditLines.length !== 1 || !line.discountId) {
            toast({ title: "Unable to edit discount", description: "This legacy ticket can only edit its single product line.", variant: "destructive" });
            return;
          }
          const saved = await apiRequest<CustomerDiscount>("PUT", `/api/customer-discounts/${line.discountId}`, {
            customerId: selectedCustomer.id,
            saleId: line.saleId,
            saleItemId: line.saleItemId,
            amount: Number(line.amount),
            date: transactionDate,
            reason: line.reason.trim(),
          });
          await invalidateDiscountData(saved);
          toast({ title: "Discount updated", description: `${saved.reference} was saved for ${saved.date}.` });
        }
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

  useEffect(() => {
    if (!invoiceQuery.data || selectedLineId || !selectedProductKey) return;
    const lines = invoiceQuery.data.items.filter(
      line => productKey(line.productType, line.productId) === selectedProductKey
    );
    if (lines.length === 1) {
      setSelectedLineId(lines[0].id.toString());
    }
  }, [invoiceQuery.data, selectedProductKey, selectedLineId]);

  const editLineItemIds = useMemo(
    () => new Set(editLines.filter(line => !line.removed).map(line => line.saleItemId)),
    [editLines],
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
      if (editingTicket && ticket.key === editingTicket.key) resetForm();
    } catch (error: any) {
      toast({
        title: "Unable to delete discount",
        description: error?.message || "The server rejected the deletion.",
        variant: "destructive",
      });
    }
  };

  const handlePrint = (ticket: DiscountTicketGroup, format: "a4" | "a5" | "dot-matrix") => {
    const activeLine = ticket.activeLines[0];
    if (!activeLine) return;
    const ticketNumber = ticket.documentInvoiceNumber || activeLine.reference;
    const basePath = format === "dot-matrix"
      ? "/print/dot-matrix-invoice"
      : format === "a5"
        ? "/print/a5-invoice"
        : "/print/invoice";
    window.open(
      `${basePath}/${encodeURIComponent(ticketNumber)}?discountId=${activeLine.id}`,
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
          <CardHeader><CardTitle>{editingTicket ? `Edit Ticket ${editingTicket.documentInvoiceNumber || editingTicket.lines[0]?.reference || ""}` : "Create a Discount Ticket"}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {editingTicket && (
              <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                {editingTicket.documentInvoiceNumber
                  ? "Update the ticket lines below, or add new invoice products using the pickers. The ticket number stays unchanged."
                  : "Update this discount line below."}
              </p>
            )}
            {(!editingTicket || editingTicket.documentInvoiceNumber) && (
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div className="space-y-2">
                <ProductSearch
                  key={productSearchKey}
                  label="Product"
                  value=""
                  products={searchableDiscountProducts}
                  placeholder="Search product by code or name..."
                  onProductSelect={(product) => {
                    handleProductChange(
                      (product as (RegularProduct & { returnKey?: string }) | null)?.returnKey || "",
                    );
                  }}
                  showCode
                  allowClear
                  disabled={isLegacyTicketEdit || !searchEnabled || productsQuery.isFetching}
                />
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
                  disabled={isLegacyTicketEdit || !selectedProductKey || productsQuery.isFetching}
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
                {selectedProductKey && searchEnabled && !productsQuery.isFetching && matchingInvoices.length === 0 && !editingTicket && (
                  <p className="text-sm text-muted-foreground">No eligible invoice contains this product in the selected date range.</p>
                )}
              </div>
              <div className="hidden md:block" />
            </div>
            )}

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
                  disabled={isLoadingBusinessDate || !businessDateString || (!!editingTicket && !canEditTicket)}
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
                    {!invoiceQuery.data.discountEligible && <span className="text-destructive sm:col-span-3">This invoice has no remaining value eligible for a discount.</span>}
                  </div>
                ) : null}
              </div>
            )}

            {(!editingTicket || editingTicket.documentInvoiceNumber) && selectedSaleId && visibleInvoiceLines.length > 1 && (
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
                        (line.remainingValue <= 0 && !editLineItemIds.has(line.id)) ||
                        (!editingTicket && ticketLines.some(ticketLine => ticketLine.saleItemId === line.id)) ||
                        editLineItemIds.has(line.id)
                      }
                    >
                      {line.productName} — Qty {line.quantity} — remaining {money(line.remainingValue)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedLine && (
              <div className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="text-muted-foreground">Quantity</span><div className="font-medium">{selectedLine.quantity}</div></div>
                <div><span className="text-muted-foreground">Original unit price</span><div className="font-medium">{money(selectedLine.unitPrice)}</div></div>
                <div><span className="text-muted-foreground">Original line total</span><div className="font-medium">{money(selectedLine.originalTotal)}</div></div>
                <div><span className="text-muted-foreground">Prior line discounts</span><div className="font-medium">{money(selectedLine.discountTotal)}</div></div>
              </div>
            )}

            {(!editingTicket || editingTicket.documentInvoiceNumber) && selectedLine && (
              <div className="grid gap-4 md:grid-cols-[minmax(180px,260px)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="discount-amount">Discount amount (£)</Label>
                  <Input
                    id="discount-amount"
                    type="text"
                    inputMode="decimal"
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
                    ref={reasonRef}
                    maxLength={500}
                    rows={1}
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    placeholder="Reason for the customer discount"
                    className="min-h-10 resize-none overflow-hidden"
                  />
                </div>
              </div>
            )}

            {selectedLine && Number.isFinite(parsedAmount) && parsedAmount > 0 && (
              <div className="rounded-md bg-blue-50 p-3 text-sm">
                After this discount: line total <strong>{money(previewLineTotal)}</strong> · effective average unit price <strong>{money(previewUnitPrice)}</strong> · invoice balance <strong>{money((invoiceQuery.data?.outstandingAmount || 0) - ticketInvoiceAmount - parsedAmount + editingAmount)}</strong>
                {(invoiceQuery.data?.outstandingAmount || 0) - ticketInvoiceAmount - parsedAmount + editingAmount < 0 && <> · customer credit <strong>{money(Math.abs((invoiceQuery.data?.outstandingAmount || 0) - ticketInvoiceAmount - parsedAmount + editingAmount))}</strong></>}
              </div>
            )}

            {!editingTicket && ticketLines.length > 0 && (
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

            {editingTicket && editLines.length > 0 && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">{editingTicket.documentInvoiceNumber ? `Discount Ticket ${editingTicket.documentInvoiceNumber}` : "Discount Line"}</h3>
                  <span className="text-sm font-semibold">
                    Total: {money(editLines.filter(line => !line.removed).reduce((total, line) => total + (Number(line.amount) || 0), 0))}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="w-32">Amount (£)</TableHead>
                        <TableHead className="min-w-48">Reason</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editLines.map(line => (
                        <TableRow key={line.key} className={line.removed ? "opacity-60" : ""}>
                          <TableCell className="whitespace-nowrap">{line.invoiceNumber}</TableCell>
                          <TableCell className="max-w-52">
                            <div className={line.removed ? "line-through" : "truncate"} title={line.productName}>{line.productName}</div>
                          </TableCell>
                          <TableCell>
                            {line.removed ? (
                              <span className="text-sm text-muted-foreground line-through">{money(Number(line.amount) || 0)}</span>
                            ) : (
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={line.amount}
                                onChange={event => updateEditLine(line.key, { amount: event.target.value })}
                                aria-label={`${line.productName} discount amount`}
                                className="h-8 px-2 text-right"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {line.removed ? (
                              <span className="text-sm text-muted-foreground line-through">{line.reason}</span>
                            ) : (
                              <Input
                                value={line.reason}
                                onChange={event => updateEditLine(line.key, { reason: event.target.value })}
                                aria-label={`${line.productName} reason`}
                                className="h-8 min-w-40 px-2 text-xs"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {line.discountId !== undefined ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateEditLine(line.key, { removed: !line.removed })}
                                aria-label={line.removed ? `Restore ${line.productName}` : `Remove ${line.productName} from ticket`}
                                title={line.removed ? "Restore line" : "Remove line from ticket"}
                              >
                                {line.removed
                                  ? <Undo2 className="h-4 w-4 text-blue-600" />
                                  : <Trash2 className="h-4 w-4 text-red-600" />}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setEditLines(previous => previous.filter(item => item.key !== line.key))}
                                aria-label={`Remove ${line.productName}`}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(!editingTicket || editingTicket.documentInvoiceNumber) && selectedLine && (
                <Button
                  variant="outline"
                  onClick={editingTicket ? handleAddEditLine : handleAddTicketLine}
                  disabled={!reason.trim() || !amount || (editingTicket ? !canSaveForDate : !canCreateForDate) || invoiceQuery.isFetching}
                >
                  {editingTicket ? "Add Line to Ticket" : "Add Product to Ticket"}
                </Button>
              )}
              <Button
                onClick={handleSave}
                disabled={
                  editingTicket
                    ? editLines.filter(line => !line.removed).length === 0 || !canSaveForDate || invoiceQuery.isFetching
                    : ticketLines.length === 0 || !canCreateForDate || invoiceQuery.isFetching
                }
              >
                {invoiceQuery.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingTicket ? "Update Ticket" : "Record Discount Ticket"}
              </Button>
              {editingTicket && <Button variant="outline" onClick={resetForm}>Cancel Edit</Button>}
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
                            <TableCell>
                              {ticket.activeLines.length > 0 ? (
                                <button
                                  type="button"
                                  className="text-blue-600 underline"
                                  onClick={() => setDetailsTarget({ kind: "discount", lineId: ticket.activeLines[0].id })}
                                >
                                  {ticket.documentInvoiceNumber || "-"}
                                </button>
                              ) : (ticket.documentInvoiceNumber || "-")}
                            </TableCell>
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
                              <div className="flex items-center gap-1">
                                {ticket.activeLines.length > 0 && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-1.5"
                                        title={`Print ticket ${ticket.documentInvoiceNumber || ticket.key}`}
                                        aria-label={`Print ticket ${ticket.documentInvoiceNumber || ticket.key}`}
                                      >
                                        <Printer className="h-4 w-4 text-blue-600" />
                                        <ChevronDown className="h-3 w-3 text-blue-600" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handlePrint(ticket, "a4")}>A4 Invoice</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handlePrint(ticket, "a5")}>A5 Invoice</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handlePrint(ticket, "dot-matrix")}>Dot Matrix</DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                                {ticket.activeLines.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => handleEditTicket(ticket)}
                                    disabled={!ticket.activeLines.every(line => canEditEntry(line.date))}
                                    title={ticket.activeLines.every(line => canEditEntry(line.date)) ? "Edit discount ticket" : "You don't have permission to edit this ticket"}
                                    aria-label={`Edit ticket ${ticket.documentInvoiceNumber || ticket.key}`}
                                  >
                                    <Pencil className={`h-4 w-4 ${ticket.activeLines.every(line => canEditEntry(line.date)) ? "text-blue-600" : "text-gray-400"}`} />
                                  </Button>
                                )}
                                {ticket.activeLines.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => void handleDelete(ticket)}
                                    disabled={!ticket.activeLines.every(line => canDeleteEntry(line.date))}
                                    title={ticket.activeLines.every(line => canDeleteEntry(line.date)) ? "Delete discount ticket" : "You don't have permission to delete this ticket"}
                                    aria-label={`Delete ticket ${ticket.documentInvoiceNumber || ticket.key}`}
                                  >
                                    <Trash2 className={`h-4 w-4 ${ticket.activeLines.every(line => canDeleteEntry(line.date)) ? "text-red-600" : "text-gray-400"}`} />
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

      <CreditDocumentDetailsDialog
        open={!!detailsTarget}
        onOpenChange={(open) => { if (!open) setDetailsTarget(null); }}
        kind={detailsTarget?.kind ?? "discount"}
        lineId={detailsTarget?.lineId ?? null}
      />
    </PageLayout>
  );
}
