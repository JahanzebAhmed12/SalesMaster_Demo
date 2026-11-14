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
import { RotateCcw, Search, Save, Trash2, Loader2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { formatQuantity } from "@/lib/utils";
import { useBusinessDate } from "@/hooks/use-business-date";
import CustomerSearch from "@/components/ui/customer-search";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";
import { groupCustomerReturnDocuments } from "@/lib/customer-return-documents";

interface ReturnableInvoiceLine {
  id: number;
  saleId: number;
  invoiceNumber: string;
  invoiceDate: string;
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
  sourceSaleItemId: number;
  availableQuantity: number;
  itemRemarks?: string;
  invoiceNumber: string;
  invoiceDate: string;
  soldQuantity: number;
  returnedQuantity: number;
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
  sourceSaleItemId: number;
  itemRemarks?: string;
}

const money = (value: number) => `£${Number(value || 0).toFixed(2)}`;
const roundMoney = (value: number) => Number(Number(value || 0).toFixed(2));

export default function ReturnFromCustomer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notifyInventoryMutation } = useCrossTabSync({ enablePolling: false });
  const { businessDate } = useBusinessDate();
  const { selectedCustomer, handleCustomerSelect, customerId } = useCustomerSearch();

  const businessDateString = businessDate ? format(new Date(businessDate), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
  const [searchFromDate, setSearchFromDate] = useState(format(subDays(new Date(businessDateString), 30), "yyyy-MM-dd"));
  const [customerSearched, setCustomerSearched] = useState(false);
  const [invoicesFetched, setInvoicesFetched] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [selectedProductKey, setSelectedProductKey] = useState("");
  const [selectedInvoiceLineId, setSelectedInvoiceLineId] = useState("");
  const [returnsFromDate, setReturnsFromDate] = useState(format(subDays(new Date(businessDateString), 30), "yyyy-MM-dd"));
  const [returnsToDate, setReturnsToDate] = useState(businessDateString);
  const [returnsInvoiceSearch, setReturnsInvoiceSearch] = useState("");
  const [returnsPage, setReturnsPage] = useState(1);
  const [returnsPageSize, setReturnsPageSize] = useState(10);
  const [selectedInvoiceLines, setSelectedInvoiceLines] = useState<Record<number, DraftReturnItem>>({});

  useEffect(() => {
    setInvoicesFetched(false);
    setSelectedProductKey("");
    setSelectedInvoiceLineId("");
    setSelectedInvoiceLines({});
  }, [customerId, searchFromDate, businessDateString]);

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
    data: returnableInvoiceLines = [],
    refetch: refetchReturnableInvoiceLines,
    isFetching: returnableInvoiceLinesLoading,
    error: returnableInvoiceLinesError,
  } = useQuery<ReturnableInvoiceLine[]>({
    queryKey: ["customer-returnable-products", customerId, searchFromDate, businessDateString],
    queryFn: () => apiRequest(
      "GET",
      `/api/customer-returns/products?customerId=${customerId}&fromDate=${encodeURIComponent(searchFromDate)}&toDate=${encodeURIComponent(businessDateString)}`,
    ),
    enabled: false,
  });

  const activeInvoiceItems = Object.values(selectedInvoiceLines);
  const itemsToSubmit = activeInvoiceItems;
  const estimatedTotal = itemsToSubmit.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
  const selectedProductLines = returnableInvoiceLines.filter((line) =>
    `${line.productType}:${line.productId}` === selectedProductKey
    && line.returnableQuantity > 0
    && !selectedInvoiceLines[line.id]
  );
  const availableProductLines = returnableInvoiceLines.filter((line) =>
    line.returnableQuantity > 0 && !selectedInvoiceLines[line.id]
  );
  const productOptions = Array.from(new Map(
    availableProductLines.map((line) => [
      `${line.productType}:${line.productId}`,
      { key: `${line.productType}:${line.productId}`, name: line.productName },
    ]),
  ).values());
  const returnsTotalPages = Math.max(1, Math.ceil(returnDocuments.length / returnsPageSize));
  const paginatedReturns = returnDocuments.slice((returnsPage - 1) * returnsPageSize, returnsPage * returnsPageSize);

  useEffect(() => {
    setReturnsPage(1);
  }, [customerId, returnsFromDate, returnsToDate, returnsInvoiceSearch, returnsPageSize]);

  const createReturnMutation = useMutation({
    mutationFn: (data: {
      customerId: number;
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
          ["customer-returnable-products"],
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
      await refetchReturnableInvoiceLines();
      setSelectedInvoiceLines({});
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
        ["customer-returnable-products"],
        ["customer-returns"],
        ["stock-check"],
        ["product-history"],
        ["product-sales-history"],
        ["product-sales-report"],
        ["prod-customer-history"],
        ["date-wise-sales"],
      ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
      void refetchReturnableInvoiceLines();
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
    const line = returnableInvoiceLines.find((item) => item.id.toString() === lineId);
    if (!line || line.returnableQuantity <= 0) return;
    setSelectedInvoiceLines((current) => ({
      ...current,
      [line.id]: {
        key: `invoice-${line.id}`,
        productId: line.productId,
        productType: line.productType,
        description: line.productName,
        quantity: line.returnableQuantity,
        unitPrice: roundMoney(line.effectiveUnitPrice),
        sourceSaleItemId: line.id,
        availableQuantity: line.returnableQuantity,
        invoiceNumber: line.invoiceNumber,
        invoiceDate: line.invoiceDate,
        soldQuantity: line.quantity,
        returnedQuantity: line.returnedQuantity,
        itemRemarks: "",
      },
    }));
    setSelectedProductKey("");
    setSelectedInvoiceLineId("");
  };

  const removeInvoiceLine = (lineId: number) => {
    setSelectedInvoiceLines((current) => {
      const updated = { ...current };
      delete updated[lineId];
      return updated;
    });
  };

  const handleGetInvoices = async () => {
    if (!selectedCustomer) {
      toast({ title: "Error", description: "Please select a customer first", variant: "destructive" });
      return;
    }
    setInvoicesFetched(false);
    setSelectedProductKey("");
    setSelectedInvoiceLineId("");
    setSelectedInvoiceLines({});
    setCustomerSearched(true);
    const result = await refetchReturnableInvoiceLines();
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

  const updateInvoiceLine = (lineId: number, updates: Partial<DraftReturnItem>) => {
    setSelectedInvoiceLines((current) => ({
      ...current,
      [lineId]: { ...current[lineId], ...updates },
    }));
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!customerId || !selectedCustomer) {
      toast({ title: "Customer required", description: "Select a customer before saving.", variant: "destructive" });
      return;
    }
    if (!businessDate) {
      toast({ title: "Business date unavailable", description: "Wait for the current business date to load before saving.", variant: "destructive" });
      return;
    }
    if (itemsToSubmit.length === 0) {
      toast({ title: "No items selected", description: "Add at least one product from an invoice to return.", variant: "destructive" });
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
      date: businessDateString,
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
                <Button className="w-full bg-blue-500 hover:bg-blue-600" onClick={handleGetInvoices} disabled={!selectedCustomer || returnableInvoiceLinesLoading}>
                  {returnableInvoiceLinesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div>
                    <Label>Product</Label>
                    <Select
                      value={selectedProductKey}
                      onValueChange={(value) => {
                        setSelectedProductKey(value);
                        setSelectedInvoiceLineId("");
                      }}
                      disabled={!invoicesFetched || returnableInvoiceLinesLoading || productOptions.length === 0}
                    >
                      <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                      <SelectContent>
                        {productOptions.map((product) => (
                          <SelectItem key={product.key} value={product.key}>{product.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Invoice containing product</Label>
                    <Select
                      value={selectedInvoiceLineId}
                      onValueChange={setSelectedInvoiceLineId}
                      disabled={!selectedProductKey || selectedProductLines.length === 0}
                    >
                      <SelectTrigger><SelectValue placeholder="Select an invoice" /></SelectTrigger>
                      <SelectContent>
                        {selectedProductLines.map((line) => (
                          <SelectItem key={line.id} value={line.id.toString()}>
                            {line.invoiceNumber} — {format(new Date(line.invoiceDate), "dd/MM/yyyy")} · Available {formatQuantity(line.returnableQuantity)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => addInvoiceLine(selectedInvoiceLineId)}
                    disabled={!selectedInvoiceLineId}
                  >
                    Add product
                  </Button>
                </div>
                {returnableInvoiceLinesLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />Loading invoices and returnable products...
                  </div>
                ) : returnableInvoiceLinesError ? (
                  <p className="text-sm text-red-600">Failed to load invoice products. Please search again.</p>
                ) : invoicesFetched && availableProductLines.length === 0 && activeInvoiceItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No returnable products were found in this invoice date range.</p>
                ) : null}

                {activeInvoiceItems.length > 0 && (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader className="[&_th]:h-9 [&_th]:px-2 [&_th]:text-xs">
                        <TableRow>
                          <TableHead>Product / Invoice</TableHead>
                          <TableHead className="text-right">Sold / Returned</TableHead>
                          <TableHead className="w-24 text-right">Return Qty</TableHead>
                          <TableHead className="w-28 text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="min-w-40">Product Remarks</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody className="[&_td]:px-2 [&_td]:py-1.5">
                        {activeInvoiceItems.map((item) => (
                          <TableRow key={item.key}>
                            <TableCell className="max-w-56">
                              <div className="truncate text-sm font-medium" title={item.description}>{item.description}</div>
                              <div className="text-[11px] text-muted-foreground">{item.invoiceNumber}</div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-xs">
                              {formatQuantity(item.soldQuantity)} / {formatQuantity(item.returnedQuantity)}
                              <div className="text-[11px] text-muted-foreground">Available {formatQuantity(item.availableQuantity || 0)}</div>
                            </TableCell>
                            <TableCell className="w-24">
                              <Input
                                type="number"
                                min="0.001"
                                max={item.availableQuantity}
                                step="0.001"
                                value={item.quantity}
                                onChange={(event) => updateInvoiceLine(item.sourceSaleItemId, { quantity: Number(event.target.value) })}
                                aria-label={`${item.description} return quantity`}
                                className="h-8 px-2 text-right"
                              />
                            </TableCell>
                            <TableCell className="w-28">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice.toFixed(2)}
                                onChange={(event) => updateInvoiceLine(item.sourceSaleItemId, { unitPrice: roundMoney(Number(event.target.value)) })}
                                aria-label={`${item.description} unit price`}
                                className="h-8 px-2 text-right"
                              />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-sm">{money(item.quantity * item.unitPrice)}</TableCell>
                            <TableCell>
                              <Input
                                value={item.itemRemarks || ""}
                                onChange={(event) => updateInvoiceLine(item.sourceSaleItemId, { itemRemarks: event.target.value })}
                                placeholder="Optional"
                                aria-label={`${item.description} remarks`}
                                className="h-8 min-w-36 px-2 text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeInvoiceLine(item.sourceSaleItemId)} aria-label={`Remove ${item.description}`}>
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
                  <Button type="submit" disabled={createReturnMutation.isPending || returnableInvoiceLinesLoading} className="bg-green-600 hover:bg-green-700">
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
