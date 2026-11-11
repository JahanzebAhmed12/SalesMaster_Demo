import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Pagination } from "@/components/ui/pagination";
import { RotateCcw, Search, Save, Trash2, Loader2, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { RegularProduct, NonProduct } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { formatQuantity } from "@/lib/utils";
import { useBusinessDate } from "@/hooks/use-business-date";
import CustomerSearch from "@/components/ui/customer-search";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";
import { groupCustomerReturnDocuments } from "@/lib/customer-return-documents";

interface CustomerInvoice {
  id: number;
  invoiceNumber: string;
  date: string;
  totalAmount: number;
}

interface ReturnableInvoiceLine {
  id: number;
  productId: number;
  productType: "regular" | "non";
  productName: string;
  quantity: number;
  unitPrice: number;
  originalTotal: number;
  discountTotal: number;
  effectiveUnitPrice: number;
  returnedQuantity: number;
  returnableQuantity: number;
  itemRemarks?: string;
}

interface DraftReturnItem {
  key: string;
  productId: number;
  productType: "regular" | "non";
  description: string;
  quantity: number;
  unitPrice: number;
  selected?: boolean;
  sourceSaleItemId?: number;
  availableQuantity?: number;
  itemRemarks?: string;
}

interface CustomerReturn {
  id: number;
  date: string;
  customerName: string;
  productDescription: string;
  invoiceNumber: string | null;
  documentInvoiceNumber?: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  remarks: string | null;
  itemRemarks: string | null;
}

interface ReturnItemPayload {
  productId: number;
  productType: "regular" | "non";
  description: string;
  quantity: number;
  unitPrice: number;
  sourceSaleItemId?: number;
  itemRemarks?: string;
}

const money = (value: number) => `£${Number(value || 0).toFixed(2)}`;

export default function ReturnFromCustomer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notifyInventoryMutation } = useCrossTabSync({ enablePolling: false });
  const { businessDate, isLoading: isLoadingBusinessDate } = useBusinessDate();
  const { selectedCustomer, handleCustomerSelect, customerId } = useCustomerSearch();

  const businessDateString = businessDate ? format(new Date(businessDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const [searchFromDate, setSearchFromDate] = useState(format(subDays(new Date(businessDateString), 30), "yyyy-MM-dd"));
  const [customerSearched, setCustomerSearched] = useState(false);
  const [invoicesFetched, setInvoicesFetched] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [manualInvoiceNumber, setManualInvoiceNumber] = useState("");
  const [returnDate, setReturnDate] = useState(businessDateString);
  const [remarks, setRemarks] = useState("");
  const [invoiceProductPicker, setInvoiceProductPicker] = useState("");
  const [returnsFromDate, setReturnsFromDate] = useState(format(subDays(new Date(businessDateString), 30), "yyyy-MM-dd"));
  const [returnsToDate, setReturnsToDate] = useState(businessDateString);
  const [returnsInvoiceSearch, setReturnsInvoiceSearch] = useState("");
  const [returnsPage, setReturnsPage] = useState(1);
  const [returnsPageSize, setReturnsPageSize] = useState(10);
  const [selectedInvoiceLines, setSelectedInvoiceLines] = useState<Record<number, DraftReturnItem>>({});
  const [manualItems, setManualItems] = useState<DraftReturnItem[]>([]);
  const [manualProductType, setManualProductType] = useState<"regular" | "non">("regular");
  const [manualProductSearch, setManualProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [highlightedProduct, setHighlightedProduct] = useState(-1);
  const [pendingProduct, setPendingProduct] = useState<(RegularProduct | NonProduct) | null>(null);
  const [manualQuantity, setManualQuantity] = useState("1");
  const [manualUnitPrice, setManualUnitPrice] = useState("0");

  useEffect(() => {
    setReturnDate(businessDateString);
  }, [businessDateString]);

  useEffect(() => {
    setInvoicesFetched(false);
    setSelectedSaleId("");
    setManualInvoiceNumber("");
    setSelectedInvoiceLines({});
    setManualItems([]);
  }, [customerId, searchFromDate]);

  const { data: products = { regularProducts: [] as RegularProduct[], nonProducts: [] as NonProduct[] } } = useQuery<{
    regularProducts: RegularProduct[];
    nonProducts: NonProduct[];
  }>({
    queryKey: ["products"],
    queryFn: () => apiRequest("GET", "/api/products"),
  });

  const { data: userPermissions } = useQuery<any>({
    queryKey: ["/api/user-backdate-options", user?.id],
    queryFn: () => apiRequest("GET", `/api/user-backdate-options/${user?.id}`),
    enabled: !!user?.id,
  });

  const { data: returns = [], refetch: refetchReturns } = useQuery<CustomerReturn[]>({
    queryKey: ["customer-returns", customerId, returnsFromDate, returnsToDate, returnsInvoiceSearch],
    queryFn: () => {
      if (!customerId || !customerSearched) return [];
      const params = new URLSearchParams({
        customerId: String(customerId),
        fromDate: returnsFromDate,
        toDate: returnsToDate,
      });
      if (returnsInvoiceSearch.trim()) params.set("search", returnsInvoiceSearch.trim());
      return apiRequest("GET", `/api/customer-returns?${params.toString()}`);
    },
    enabled: !!customerId && customerSearched,
  });
  const returnDocuments = useMemo(
    () => groupCustomerReturnDocuments(returns),
    [returns],
  );

  const {
    data: customerInvoices = [],
    refetch: refetchInvoices,
    isFetching: invoicesLoading,
  } = useQuery<CustomerInvoice[]>({
    queryKey: ["customer-invoices", customerId, searchFromDate],
    queryFn: async () => {
      if (!customerId) return [];
      return apiRequest(
        "GET",
        `/api/customers/${customerId}/invoices?fromDate=${encodeURIComponent(searchFromDate)}&toDate=${encodeURIComponent(businessDateString)}`,
      );
    },
    enabled: false,
  });

  const {
    data: invoiceDetails,
    isFetching: invoiceDetailsLoading,
    error: invoiceDetailsError,
  } = useQuery<{
    items: ReturnableInvoiceLine[];
  }>({
    queryKey: ["customer-returnable-invoice-lines", selectedSaleId],
    queryFn: () => apiRequest("GET", `/api/customer-returns/invoices/${selectedSaleId}`),
    enabled: !!selectedSaleId,
  });

  useEffect(() => {
    if (!invoiceDetails) return;
    setSelectedInvoiceLines(Object.fromEntries(invoiceDetails.items.map((line) => [
      line.id,
      {
        key: `invoice-${line.id}`,
        productId: line.productId,
        productType: line.productType,
        description: line.productName,
        quantity: line.returnableQuantity,
        unitPrice: line.effectiveUnitPrice,
        selected: false,
        sourceSaleItemId: line.id,
        availableQuantity: line.returnableQuantity,
      },
    ])));
  }, [invoiceDetails]);

  const allProducts = manualProductType === "regular"
    ? products.regularProducts
    : products.nonProducts;
  const filteredProducts = useMemo(() => {
    const term = manualProductSearch.trim().toLowerCase();
    if (!term) return allProducts;
    return allProducts.filter((product) => {
      const code = String((product as any).productCode || (product as any).product_code || "").toLowerCase();
      return code.startsWith(term) || product.description.toLowerCase().startsWith(term);
    });
  }, [allProducts, manualProductSearch]);

  const chosenInvoice = customerInvoices.find((invoice) => invoice.id.toString() === selectedSaleId);
  const activeInvoiceItems = Object.values(selectedInvoiceLines).filter((item) => item.selected && item.quantity > 0);
  const itemsToSubmit = [...activeInvoiceItems, ...manualItems];
  const estimatedTotal = itemsToSubmit.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  const returnsTotalPages = Math.max(1, Math.ceil(returnDocuments.length / returnsPageSize));
  const paginatedReturns = returnDocuments.slice((returnsPage - 1) * returnsPageSize, returnsPage * returnsPageSize);

  useEffect(() => {
    setReturnsPage(1);
  }, [customerId, returnsFromDate, returnsToDate, returnsInvoiceSearch, returnsPageSize]);

  const createReturnMutation = useMutation({
    mutationFn: (data: {
      customerId: number;
      saleId: number | null;
      invoiceNumber: string;
      date: string;
      remarks: string;
      items: ReturnItemPayload[];
    }) => apiRequest("POST", "/api/customer-returns", data),
    onSuccess: async (_result, variables) => {
      notifyInventoryMutation({ source: "customer-return" });
      await Promise.all([
        ...[
          ["daily-book-sales"],
          ["/api/reports/daily-summary"],
          ["/api/reports/customer-statement"],
          ["/api/reports/customer-history"],
          ["/api/reports/all-customer-history"],
          ["/api/reports/product-sales-history"],
          ["/api/reports/product-sales"],
          ["/api/reports/prod-customer-history"],
          ["/api/reports/date-wise-sales"],
          ["/api/reports/sales-analysis"],
          ["/api/reports/stock-check"],
          ["/api/customers"],
          ["customer-returnable-invoice-lines"],
          ["customer-returns"],
          ["stock-check"],
          ["product-history"],
          ["product-sales-history"],
          ["product-sales-report"],
          ["prod-customer-history"],
          ["date-wise-sales"],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        refetchReturns(),
      ]);
      setSelectedInvoiceLines({});
      setManualItems([]);
      setRemarks("");
      toast({
        title: "Success",
        description: `${variables.items.length} customer return item(s) created successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.error || error?.message || "Failed to create customer return",
        variant: "destructive",
      });
    },
  });

  const deleteReturnMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/customer-returns/${id}`),
    onSuccess: () => {
      notifyInventoryMutation({ source: "customer-return" });
      [
        ["daily-book-sales"],
        ["/api/reports/daily-summary"],
        ["/api/reports/customer-statement"],
        ["/api/reports/customer-history"],
        ["/api/reports/all-customer-history"],
        ["/api/reports/product-sales-history"],
        ["/api/reports/product-sales"],
        ["/api/reports/prod-customer-history"],
        ["/api/reports/date-wise-sales"],
        ["/api/reports/sales-analysis"],
        ["/api/reports/stock-check"],
        ["/api/customers"],
        ["customer-returnable-invoice-lines"],
        ["customer-returns"],
        ["stock-check"],
        ["product-history"],
        ["product-sales-history"],
        ["product-sales-report"],
        ["prod-customer-history"],
        ["date-wise-sales"],
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      refetchReturns();
      toast({ title: "Success", description: "Customer return deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.error || error?.message || "Failed to delete customer return",
        variant: "destructive",
      });
    },
  });

  const canDeleteReturn = (date: string) => {
    if (!userPermissions) return false;
    const today = businessDateString;
    const returnDateForPermission = format(new Date(date), "yyyy-MM-dd");
    return returnDateForPermission === today
      ? userPermissions.current_editing !== false
      : userPermissions.deleting === true;
  };

  const addInvoiceLine = (lineId: string) => {
    const line = invoiceDetails?.items.find((item) => item.id.toString() === lineId);
    if (!line || line.returnableQuantity <= 0) return;
    updateInvoiceLine(line, {
      selected: true,
      quantity: line.returnableQuantity,
      itemRemarks: "",
    });
    setInvoiceProductPicker("");
  };

  const removeInvoiceLine = (lineId: number) => {
    setSelectedInvoiceLines((current) => ({
      ...current,
      [lineId]: { ...current[lineId], selected: false, quantity: 0 },
    }));
  };

  const handleGetInvoices = async () => {
    if (!selectedCustomer) {
      toast({ title: "Error", description: "Please select a customer first", variant: "destructive" });
      return;
    }
    setCustomerSearched(true);
    const result = await refetchInvoices();
    if (result.error) {
      toast({
        title: "Error",
        description: result.error instanceof Error ? result.error.message : "Failed to fetch invoices",
        variant: "destructive",
      });
      return;
    }
    setInvoicesFetched(true);
  };

  const handleInvoiceSelect = (saleId: string) => {
    setSelectedInvoiceLines({});
    setManualItems([]);
    setInvoiceProductPicker("");
    if (saleId === "manual") {
      setSelectedSaleId("");
      return;
    }
    const invoice = customerInvoices.find((item) => item.id.toString() === saleId);
    setSelectedSaleId(saleId);
    setManualInvoiceNumber(invoice?.invoiceNumber || "");
  };

  const handleProductSelect = (product: RegularProduct | NonProduct) => {
    setPendingProduct(product);
    const sellingPrice = Number(
      (product as any).sellingPrice ?? (product as any).selling_price ?? 0,
    );
    setManualUnitPrice(sellingPrice.toFixed(2));
    setManualProductSearch(`${(product as any).productCode || (product as any).product_code || ""} - ${product.description}`);
    setShowProductDropdown(false);
  };

  const addManualItem = () => {
    if (!pendingProduct) {
      toast({ title: "Select a product", description: "Choose a product to add to the return.", variant: "destructive" });
      return;
    }
    const quantity = Number(manualQuantity);
    const unitPrice = Number(manualUnitPrice);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      toast({ title: "Invalid item", description: "Enter a positive quantity and a non-negative unit price.", variant: "destructive" });
      return;
    }
    setManualItems((current) => [...current, {
      key: `manual-${Date.now()}-${Math.random()}`,
      productId: pendingProduct.id,
      productType: manualProductType,
      description: pendingProduct.description,
      quantity,
      unitPrice,
      itemRemarks: "",
    }]);
    setPendingProduct(null);
    setManualProductSearch("");
    setManualQuantity("1");
    setManualUnitPrice("0");
  };

  const updateInvoiceLine = (line: ReturnableInvoiceLine, updates: Partial<DraftReturnItem>) => {
    setSelectedInvoiceLines((current) => {
      const existing = current[line.id] || {
        key: `invoice-${line.id}`,
        productId: line.productId,
        productType: line.productType,
        description: line.productName,
        quantity: line.returnableQuantity,
        unitPrice: line.effectiveUnitPrice,
        selected: false,
        sourceSaleItemId: line.id,
        availableQuantity: line.returnableQuantity,
      };
      return { ...current, [line.id]: { ...existing, ...updates } };
    });
  };

  const updateManualItem = (key: string, updates: Partial<DraftReturnItem>) => {
    setManualItems((current) => current.map((item) => item.key === key ? { ...item, ...updates } : item));
  };

  const removeManualItem = (key: string) => {
    setManualItems((current) => current.filter((item) => item.key !== key));
  };

  const handleProductKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showProductDropdown || filteredProducts.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedProduct((current) => current < filteredProducts.length - 1 ? current + 1 : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedProduct((current) => current > 0 ? current - 1 : filteredProducts.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlightedProduct >= 0) handleProductSelect(filteredProducts[highlightedProduct]);
    } else if (event.key === "Escape") {
      setShowProductDropdown(false);
    }
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const invoiceNumber = chosenInvoice?.invoiceNumber || manualInvoiceNumber.trim();
    if (!customerId || !selectedCustomer) {
      toast({ title: "Customer required", description: "Select a customer before saving.", variant: "destructive" });
      return;
    }
    if (!invoiceNumber) {
      toast({ title: "Invoice required", description: "Select an invoice or enter an invoice number.", variant: "destructive" });
      return;
    }
    if (!returnDate) {
      toast({ title: "Date required", description: "Select the return date.", variant: "destructive" });
      return;
    }
    if (itemsToSubmit.length === 0) {
      toast({ title: "No items selected", description: "Select invoice items or add manual products to return.", variant: "destructive" });
      return;
    }
    const invalidQuantity = itemsToSubmit.some((item) =>
      !Number.isFinite(item.quantity)
      || item.quantity <= 0
      || (item.availableQuantity !== undefined && item.quantity > item.availableQuantity)
      || !Number.isFinite(item.unitPrice)
      || item.unitPrice < 0,
    );
    if (invalidQuantity) {
      toast({ title: "Invalid return item", description: "Check each quantity and unit price. Invoice quantities cannot exceed the remaining returnable amount.", variant: "destructive" });
      return;
    }
    createReturnMutation.mutate({
      customerId: Number(customerId),
      saleId: chosenInvoice?.id || null,
      invoiceNumber,
      date: returnDate,
      remarks,
      items: itemsToSubmit.map((item) => ({
        productId: item.productId,
        productType: item.productType,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        sourceSaleItemId: item.sourceSaleItemId,
        itemRemarks: item.itemRemarks?.trim(),
      })),
    });
  };

  return (
    <PageLayout title="Returns from Customer" breadcrumb="Data Entry > Returns from Customer">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw size={20} />
              Step 1: Select Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <CustomerSearch
                  label="Customer"
                  placeholder="Search customer by code or name..."
                  onCustomerSelect={handleCustomerSelect}
                  required
                  showCode
                  allowClear
                />
              </div>
              <div>
                <Label>Invoice from date:</Label>
                <Input type="date" value={searchFromDate} onChange={(event) => setSearchFromDate(event.target.value)} />
              </div>
              <div>
                <Button className="w-full bg-blue-500 hover:bg-blue-600" onClick={handleGetInvoices} disabled={!selectedCustomer || invoicesLoading}>
                  {invoicesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Get Invoices
                </Button>
              </div>
              <div className="md:col-span-3 -mt-2 text-sm text-muted-foreground">
                The button loads this customer's invoices from the selected date and shows their existing returns below.
              </div>
            </div>
          </CardContent>
        </Card>

        {customerSearched && (
          <Card>
            <CardHeader><CardTitle>Step 2: Add New Return</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="return-date">Return Date</Label>
                    <Input id="return-date" type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} disabled={isLoadingBusinessDate} />
                  </div>
                  <div>
                    <Label>Original Invoice</Label>
                    <Select value={selectedSaleId || "manual"} onValueChange={handleInvoiceSelect} disabled={!invoicesFetched}>
                      <SelectTrigger><SelectValue placeholder="Select invoice or enter manually" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual invoice number</SelectItem>
                        {customerInvoices.map((invoice) => (
                          <SelectItem key={invoice.id} value={invoice.id.toString()}>
                            {invoice.invoiceNumber} — {format(new Date(invoice.date), "dd/MM/yyyy")} — {money(invoice.totalAmount)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="manual-invoice-number">Invoice Number {chosenInvoice ? "(selected invoice)" : "(required)"}</Label>
                    <Input
                      id="manual-invoice-number"
                      value={chosenInvoice?.invoiceNumber || manualInvoiceNumber}
                      onChange={(event) => setManualInvoiceNumber(event.target.value)}
                      disabled={!!chosenInvoice}
                      maxLength={50}
                      placeholder="Enter invoice number"
                    />
                  </div>
                </div>

                {chosenInvoice && (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h3 className="font-semibold">Add products from {chosenInvoice.invoiceNumber}</h3>
                        <p className="text-xs text-muted-foreground">
                          Select only the products being returned. Prices include invoice discounts.
                        </p>
                      </div>
                      {!invoiceDetailsLoading && !invoiceDetailsError && (
                        <div className="w-full sm:max-w-md">
                          <Label htmlFor="invoice-product-picker" className="text-xs">Invoice product</Label>
                          <Select
                            value={invoiceProductPicker || "choose"}
                            onValueChange={(value) => value !== "choose" && addInvoiceLine(value)}
                          >
                            <SelectTrigger id="invoice-product-picker" className="h-9">
                              <SelectValue placeholder="Choose a product to add" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="choose">Choose a product to add</SelectItem>
                              {invoiceDetails?.items
                                .filter((line) => line.returnableQuantity > 0 && !selectedInvoiceLines[line.id]?.selected)
                                .map((line) => (
                                  <SelectItem key={line.id} value={line.id.toString()}>
                                    {line.productName} · Sold {formatQuantity(line.quantity)} · Returned {formatQuantity(line.returnedQuantity)} · Available {formatQuantity(line.returnableQuantity)}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {invoiceDetailsLoading ? (
                      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading invoice items...</div>
                    ) : invoiceDetailsError ? (
                      <p className="text-sm text-red-600">Failed to load invoice items. Please reselect the invoice and try again.</p>
                    ) : activeInvoiceItems.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader className="[&_th]:h-8 [&_th]:px-2 [&_th]:text-xs">
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead className="text-right">Sold / Returned</TableHead>
                              <TableHead className="w-24 text-right">Return Qty</TableHead>
                              <TableHead className="w-28 text-right">Unit Price</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="min-w-40">Product Remarks</TableHead>
                              <TableHead className="w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody className="[&_td]:px-2 [&_td]:py-1.5">
                            {invoiceDetails?.items.filter((line) => selectedInvoiceLines[line.id]?.selected).map((line) => {
                              const draft = selectedInvoiceLines[line.id];
                              return (
                                <TableRow key={line.id}>
                                  <TableCell className="max-w-52">
                                    <div className="truncate text-sm font-medium" title={line.productName}>{line.productName}</div>
                                    {line.discountTotal > 0 && <div className="text-[11px] text-muted-foreground">Discount: {money(line.discountTotal)}</div>}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right text-xs">
                                    {formatQuantity(line.quantity)} / {formatQuantity(line.returnedQuantity)}
                                    <div className="text-[11px] text-muted-foreground">Available {formatQuantity(line.returnableQuantity)}</div>
                                  </TableCell>
                                  <TableCell className="w-24">
                                    <Input
                                      type="number"
                                      min="0.001"
                                      max={line.returnableQuantity}
                                      step="0.001"
                                      value={draft?.quantity ?? 0}
                                      onChange={(event) => updateInvoiceLine(line, { quantity: Number(event.target.value) })}
                                      aria-label={`${line.productName} return quantity`}
                                      className="h-8 px-2 text-right"
                                    />
                                  </TableCell>
                                  <TableCell className="w-28">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={draft?.unitPrice ?? line.effectiveUnitPrice}
                                      onChange={(event) => updateInvoiceLine(line, { unitPrice: Number(event.target.value) })}
                                      aria-label={`${line.productName} return unit price`}
                                      className="h-8 px-2 text-right"
                                    />
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right text-sm">{money((draft?.quantity || 0) * (draft?.unitPrice ?? line.effectiveUnitPrice))}</TableCell>
                                  <TableCell>
                                    <Input
                                      value={draft?.itemRemarks || ""}
                                      onChange={(event) => updateInvoiceLine(line, { itemRemarks: event.target.value })}
                                      placeholder="Optional"
                                      aria-label={`${line.productName} remarks`}
                                      className="h-8 min-w-36 px-2 text-xs"
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeInvoiceLine(line.id)} aria-label={`Remove ${line.productName}`}>
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="py-2 text-sm text-muted-foreground">
                        {invoiceDetails?.items.some((line) => line.returnableQuantity > 0)
                          ? "Choose an invoice product above to add it to this return."
                          : "No returnable products remain on this invoice."}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-3 rounded-md border p-4">
                  <div>
                    <h3 className="font-semibold">Add Manual Product</h3>
                    <p className="text-sm text-muted-foreground">
                      Add a product not listed on the selected invoice, or build a return without selecting an invoice.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                    <div>
                      <Label>Product Type</Label>
                      <Select
                        value={manualProductType}
                        onValueChange={(value: "regular" | "non") => {
                          setManualProductType(value);
                          setManualProductSearch("");
                          setPendingProduct(null);
                        }}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="regular">Regular Product</SelectItem>
                          <SelectItem value="non">Non-Product</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="relative md:col-span-2">
                      <Label htmlFor="manual-product">Product</Label>
                      <Input
                        id="manual-product"
                        value={manualProductSearch}
                        onChange={(event) => {
                          setManualProductSearch(event.target.value);
                          setPendingProduct(null);
                          setShowProductDropdown(true);
                          setHighlightedProduct(-1);
                        }}
                        onFocus={() => setShowProductDropdown(true)}
                        onBlur={() => window.setTimeout(() => setShowProductDropdown(false), 150)}
                        onKeyDown={handleProductKeyDown}
                        placeholder="Search product by code or name"
                      />
                      {showProductDropdown && filteredProducts.length > 0 && (
                        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
                          {filteredProducts.map((product, index) => (
                            <button
                              key={product.id}
                              type="button"
                              className={`block w-full px-3 py-2 text-left text-sm ${index === highlightedProduct ? "bg-blue-100" : "hover:bg-gray-100"}`}
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleProductSelect(product)}
                            >
                              <div className="font-medium">{(product as any).productCode || (product as any).product_code || ""}</div>
                              <div className="text-gray-600">{product.description}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="manual-quantity">Quantity</Label>
                      <Input id="manual-quantity" type="number" min="0.001" step="0.001" value={manualQuantity} onChange={(event) => setManualQuantity(event.target.value)} />
                    </div>
                    <div>
                      <Label htmlFor="manual-unit-price">Unit Price</Label>
                      <Input id="manual-unit-price" type="number" min="0" step="0.01" value={manualUnitPrice} onChange={(event) => setManualUnitPrice(event.target.value)} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={addManualItem}>
                      <Plus className="mr-2 h-4 w-4" />Add Product
                    </Button>
                  </div>
                </div>

                {manualItems.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Manual Product</TableHead>
                          <TableHead className="w-36">Quantity</TableHead>
                          <TableHead className="w-36">Unit Price</TableHead>
                          <TableHead>Product Remarks</TableHead>
                          <TableHead className="text-right">Line Total</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {manualItems.map((item) => (
                          <TableRow key={item.key}>
                            <TableCell>{item.description}</TableCell>
                            <TableCell><Input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateManualItem(item.key, { quantity: Number(event.target.value) })} /></TableCell>
                            <TableCell><Input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateManualItem(item.key, { unitPrice: Number(event.target.value) })} /></TableCell>
                            <TableCell><Input value={item.itemRemarks || ""} onChange={(event) => updateManualItem(item.key, { itemRemarks: event.target.value })} placeholder="Product remarks" /></TableCell>
                            <TableCell className="text-right">{money(item.quantity * item.unitPrice)}</TableCell>
                            <TableCell>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeManualItem(item.key)} aria-label={`Remove ${item.description}`}>
                                <X className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div>
                  <Label htmlFor="return-remarks">Invoice Remarks (applies to the whole return)</Label>
                  <Textarea id="return-remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Enter a remark for the complete return document" />
                </div>
                <div className="flex items-center justify-between border-t pt-4">
                  <div className="text-lg font-semibold">Return total: {money(estimatedTotal)}</div>
                  <Button type="submit" disabled={createReturnMutation.isPending || invoiceDetailsLoading} className="bg-green-600 hover:bg-green-700">
                    {createReturnMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {createReturnMutation.isPending ? "Saving..." : `Save Return${itemsToSubmit.length ? ` (${itemsToSubmit.length} item${itemsToSubmit.length === 1 ? "" : "s"})` : ""}`}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {customerSearched && selectedCustomer && (
          <Card>
            <CardHeader><CardTitle>Step 3: Existing Returns - {selectedCustomer.customer_name}</CardTitle></CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
                <div>
                  <Label htmlFor="returns-from-date">From date</Label>
                  <Input id="returns-from-date" type="date" value={returnsFromDate} onChange={(event) => setReturnsFromDate(event.target.value)} />
                </div>
                <div>
                  <Label htmlFor="returns-to-date">To date</Label>
                  <Input id="returns-to-date" type="date" value={returnsToDate} onChange={(event) => setReturnsToDate(event.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="returns-invoice-search">Invoice number</Label>
                  <Input
                    id="returns-invoice-search"
                    value={returnsInvoiceSearch}
                    onChange={(event) => setReturnsInvoiceSearch(event.target.value)}
                    placeholder="Search original or return invoice number"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Invoice No</TableHead>
                      <TableHead className="text-center">Quantity</TableHead>
                      <TableHead className="text-center">Unit Price</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead>Product Remarks</TableHead>
                      <TableHead>Invoice Remarks</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnDocuments.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="py-4 text-center">No returns found for this customer and filter range</TableCell></TableRow>
                    ) : paginatedReturns.map((returnItem) => (
                      <TableRow key={returnItem.id}>
                        <TableCell>{format(new Date(returnItem.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell>{returnItem.productDescription}</TableCell>
                        <TableCell>{returnItem.invoiceNumber || "-"}</TableCell>
                        <TableCell className="text-center">{formatQuantity(returnItem.quantity)}</TableCell>
                        <TableCell className="text-center">{money(returnItem.unitPrice)}</TableCell>
                        <TableCell className="text-center">{money(returnItem.totalValue)}</TableCell>
                        <TableCell>{returnItem.itemRemarks || "-"}</TableCell>
                        <TableCell>{returnItem.remarks || "-"}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canDeleteReturn(returnItem.date) || deleteReturnMutation.isPending}
                            title={canDeleteReturn(returnItem.date) ? "Delete return" : "You don't have permission to delete this return"}
                            onClick={() => {
                              if (canDeleteReturn(returnItem.date) && confirm("Delete this return document and all of its product lines?")) {
                                deleteReturnMutation.mutate(returnItem.id);
                              }
                            }}
                          >
                            {deleteReturnMutation.isPending
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Trash2 className={`h-4 w-4 ${canDeleteReturn(returnItem.date) ? "text-red-600" : "text-gray-400"}`} />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                currentPage={returnsPage}
                totalPages={returnsTotalPages}
                totalItems={returnDocuments.length}
                itemsPerPage={returnsPageSize}
                onPageChange={setReturnsPage}
                onItemsPerPageChange={setReturnsPageSize}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
