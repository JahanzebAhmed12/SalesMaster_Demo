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
import { RotateCcw, Search, Save, Trash2, Loader2, X, Pencil, Printer, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { formatQuantity } from "@/lib/utils";
import { useBusinessDate } from "@/hooks/use-business-date";
import CustomerSearch from "@/components/ui/customer-search";
import ProductSearch from "@/components/ui/product-search";
import type { RegularProduct } from "@shared/schema";
import { useCustomerSearch } from "@/hooks/useCustomerSearch";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";
import { groupCustomerReturnDocuments, type CustomerReturnDocument } from "@/lib/customer-return-documents";
import { CreditDocumentDetailsDialog } from "@/components/common/credit-document-details-dialog";

interface ReturnableInvoiceLine {
  id: number;
  saleId: number;
  invoiceNumber: string;
  invoiceDate: string;
  productId: number;
  productType: "regular" | "non";
  productName: string;
  productCode?: string;
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
  returnId?: number;
  productId: number;
  productType: "regular" | "non";
  description: string;
  quantity: string;
  unitPrice: string;
  sourceSaleItemId: number | null;
  availableQuantity?: number;
  itemRemarks?: string;
  invoiceNumber: string;
  invoiceDate: string;
  soldQuantity?: number;
  returnedQuantity?: number;
  originalQuantity?: number;
}

interface CustomerReturn {
  id: number;
  refNumber: string;
  customerId: number;
  date: string;
  customerName: string;
  saleId: number | null;
  sourceSaleItemId: number | null;
  productId: number;
  productType: "regular" | "non";
  description: string;
  productDescription: string;
  invoiceNumber: string | null;
  documentInvoiceNumber?: string | null;
  status: string;
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
  const [productSearchKey, setProductSearchKey] = useState(0);
  const [selectedInvoiceLineId, setSelectedInvoiceLineId] = useState("");
  const [returnsFromDate, setReturnsFromDate] = useState(businessDateString);
  const [returnsToDate, setReturnsToDate] = useState(businessDateString);
  const [returnsInvoiceSearch, setReturnsInvoiceSearch] = useState("");
  const [returnsPage, setReturnsPage] = useState(1);
  const [returnsPageSize, setReturnsPageSize] = useState(10);
  const [selectedInvoiceLines, setSelectedInvoiceLines] = useState<Record<string, DraftReturnItem>>({});
  const [editingReturn, setEditingReturn] = useState<CustomerReturnDocument<CustomerReturn> | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<{ kind: "discount" | "return"; lineId: number } | null>(null);

  useEffect(() => {
    setInvoicesFetched(false);
    setSelectedProductKey("");
    setProductSearchKey((key) => key + 1);
    setSelectedInvoiceLineId("");
    setSelectedInvoiceLines({});
    setEditingReturn(null);
    setRemarks("");
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
  const returnDocuments = useMemo(() => {
    const documents = groupCustomerReturnDocuments(returns);
    return documents.sort((a, b) => {
      const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateDiff !== 0) return dateDiff;
      const invoiceDiff = String(b.invoiceNumber || "").localeCompare(String(a.invoiceNumber || ""));
      if (invoiceDiff !== 0) return invoiceDiff;
      return b.id - a.id;
    });
  }, [returns]);

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

  const {
    data: editReturnableLines = [],
    isLoading: editReturnableLinesLoading,
    isFetched: editReturnableLinesFetched,
    error: editReturnableLinesError,
  } = useQuery<ReturnableInvoiceLine[]>({
    queryKey: ["customer-returnable-products-edit", customerId, businessDateString],
    queryFn: () => apiRequest(
      "GET",
      `/api/customer-returns/products?customerId=${customerId}&fromDate=2000-01-01&toDate=${encodeURIComponent(businessDateString)}`,
    ),
    enabled: !!editingReturn && !!customerId,
  });

  const editSourceLineMap = useMemo(() => {
    const map = new Map<number, ReturnableInvoiceLine>();
    editReturnableLines.forEach((line) => map.set(line.id, line));
    return map;
  }, [editReturnableLines]);

  const pickerLines = editingReturn ? editReturnableLines : returnableInvoiceLines;
  const pickerLoading = editingReturn ? editReturnableLinesLoading : returnableInvoiceLinesLoading;
  const pickerError = editingReturn ? editReturnableLinesError : returnableInvoiceLinesError;
  const pickerReady = editingReturn ? editReturnableLinesFetched : invoicesFetched;

  const activeInvoiceItems = Object.values(selectedInvoiceLines).filter(
    (item) => item.returnId !== undefined || item.sourceSaleItemId != null,
  );
  const itemsToSubmit = activeInvoiceItems;
  const estimatedTotal = itemsToSubmit.reduce(
    (total, item) => total + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );
  const usedSourceItemIds = new Set(
    Object.values(selectedInvoiceLines)
      .map((item) => item.sourceSaleItemId)
      .filter((value): value is number => value != null),
  );
  const selectedProductLines = pickerLines.filter((line) =>
    `${line.productType}:${line.productId}` === selectedProductKey
    && line.returnableQuantity > 0
    && !usedSourceItemIds.has(line.id)
  );
  const availableProductLines = pickerLines.filter((line) =>
    line.returnableQuantity > 0 && !usedSourceItemIds.has(line.id)
  );
  const productOptions = Array.from(new Map(
    availableProductLines.map((line) => [
      `${line.productType}:${line.productId}`,
      { key: `${line.productType}:${line.productId}`, name: line.productName, productCode: line.productCode || "" },
    ]),
  ).values());
  const searchableReturnProducts = useMemo(
    () => productOptions.map((option, index) => ({
      id: index + 1,
      productCode: option.productCode,
      name: option.name,
      description: option.name,
      returnKey: option.key,
    } as unknown as RegularProduct & { returnKey: string })),
    [productOptions],
  );

  const storedReturnQtyBySource = useMemo(() => {
    const totals = new Map<number, number>();
    Object.values(selectedInvoiceLines).forEach((item) => {
      if (item.returnId === undefined || item.sourceSaleItemId == null) return;
      totals.set(
        item.sourceSaleItemId,
        (totals.get(item.sourceSaleItemId) || 0) + (item.originalQuantity ?? (Number(item.quantity) || 0)),
      );
    });
    return totals;
  }, [selectedInvoiceLines]);

  const quantityLimitFor = (item: DraftReturnItem): number | undefined => {
    if (item.returnId !== undefined) {
      if (item.sourceSaleItemId == null) return undefined;
      const sourceLine = editSourceLineMap.get(item.sourceSaleItemId);
      if (!sourceLine) return undefined;
      return sourceLine.returnableQuantity + (storedReturnQtyBySource.get(item.sourceSaleItemId) || 0);
    }
    return item.availableQuantity;
  };
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
          ["customer-returnable-products-edit"],
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
      setEditingReturn(null);
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
        ["customer-returnable-products-edit"],
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

  const updateReturnMutation = useMutation({
    mutationFn: (data: {
      id: number;
      remarks: string;
      items: Array<{
        id?: number;
        productId?: number;
        productType?: "regular" | "non";
        description?: string;
        quantity: number;
        unitPrice: number;
        sourceSaleItemId?: number;
        itemRemarks?: string;
      }>;
    }) => apiRequest(
      "PUT",
      `/api/customer-returns/${data.id}/document`,
      { remarks: data.remarks, items: data.items },
    ),
    onSuccess: async () => {
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
          ["customer-returnable-products-edit"],
          ["customer-returns"],
          ["stock-check"],
          ["product-history"],
          ["product-sales-history"],
          ["product-sales-report"],
          ["prod-customer-history"],
          ["date-wise-sales"],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        refetchReturns(),
        refetchReturnableInvoiceLines(),
      ]);
      setEditingReturn(null);
      setSelectedInvoiceLines({});
      setRemarks("");
      toast({ title: "Success", description: "Customer return document updated successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.error || error?.message || "Failed to update customer return",
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
  const canEditReturn = (date: string) => {
    if (!userPermissions) return false;
    const returnDate = format(new Date(date), "yyyy-MM-dd");
    return returnDate === businessDateString
      ? userPermissions.current_editing !== false
      : userPermissions.editing === true;
  };

  const addInvoiceLine = (lineId: string) => {
    const line = pickerLines.find((item) => item.id.toString() === lineId);
    if (!line || line.returnableQuantity <= 0) return;
    setSelectedInvoiceLines((current) => ({
      ...current,
      [`invoice-${line.id}`]: {
        key: `invoice-${line.id}`,
        productId: line.productId,
        productType: line.productType,
        description: line.productName,
        quantity: String(line.returnableQuantity),
        unitPrice: roundMoney(line.effectiveUnitPrice).toFixed(2),
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
    setProductSearchKey((key) => key + 1);
    setSelectedInvoiceLineId("");
  };

  const removeInvoiceLine = (lineId: string) => {
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
    setProductSearchKey((key) => key + 1);
    setSelectedInvoiceLineId("");
    setSelectedInvoiceLines({});
    setEditingReturn(null);
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

  const updateInvoiceLine = (lineKey: string, updates: Partial<DraftReturnItem>) => {
    setSelectedInvoiceLines((current) => ({
      ...current,
      [lineKey]: { ...current[lineKey], ...updates },
    }));
  };

  const handlePrintReturn = (
    returnDocument: CustomerReturnDocument<CustomerReturn>,
    format: "a4" | "a5" | "dot-matrix",
  ) => {
    const returnId = returnDocument.items[0]?.id ?? returnDocument.id;
    const documentNumber = returnDocument.documentInvoiceNumber
      || returnDocument.refNumber
      || returnDocument.invoiceNumber
      || String(returnDocument.id);
    const basePath = format === "dot-matrix"
      ? "/print/dot-matrix-invoice"
      : format === "a5"
        ? "/print/a5-invoice"
        : "/print/invoice";
    window.open(
      `${basePath}/${encodeURIComponent(documentNumber)}?returnId=${returnId}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handleEditReturn = (returnDocument: CustomerReturnDocument<CustomerReturn>) => {
    if (!canEditReturn(returnDocument.date)) {
      toast({ title: "Permission denied", description: "You cannot edit a return for this date.", variant: "destructive" });
      return;
    }

    const lines = Object.fromEntries(returnDocument.items.map((item) => {
      const key = `return-${item.id}`;
      return [key, {
        key,
        returnId: item.id,
        productId: item.productId,
        productType: item.productType,
        description: item.productDescription || item.description,
        quantity: String(item.quantity),
        unitPrice: String(item.unitPrice ?? 0),
        sourceSaleItemId: item.sourceSaleItemId,
        itemRemarks: item.itemRemarks || "",
        invoiceNumber: item.invoiceNumber || "",
        invoiceDate: item.date,
        originalQuantity: item.quantity,
      }];
    }));
    setEditingReturn(returnDocument);
    setSelectedInvoiceLines(lines);
    setSelectedProductKey("");
    setProductSearchKey((key) => key + 1);
    setSelectedInvoiceLineId("");
    setRemarks(returnDocument.remarks || "");
  };

  const cancelEditReturn = () => {
    setEditingReturn(null);
    setSelectedInvoiceLines({});
    setRemarks("");
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
    const invalidQuantity = itemsToSubmit.some((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const limit = quantityLimitFor(item);
      return !/^\d+(?:\.\d{1,3})?$/.test(item.quantity)
      || !Number.isFinite(quantity)
      || quantity <= 0
      || (limit !== undefined && quantity > limit)
      || !/^\d+(?:\.\d{1,2})?$/.test(item.unitPrice)
      || !Number.isFinite(unitPrice)
      || unitPrice < 0;
    });
    if (invalidQuantity) {
      toast({ title: "Invalid return item", description: "Check each quantity and unit price. Invoice quantities cannot exceed the remaining returnable amount.", variant: "destructive" });
      return;
    }
    if (editingReturn) {
      const existingItems = itemsToSubmit.filter(
        (item): item is DraftReturnItem & { returnId: number } => item.returnId !== undefined,
      );
      const newItems = itemsToSubmit.filter((item) => item.returnId === undefined);
      const existingIds = new Set(existingItems.map((item) => item.returnId));
      if (
        existingItems.length !== editingReturn.items.length
        || editingReturn.items.some((item) => !existingIds.has(item.id))
      ) {
        toast({ title: "Unable to edit return", description: "The complete return document must be loaded before saving.", variant: "destructive" });
        return;
      }
      if (newItems.some((item) => item.sourceSaleItemId == null)) {
        toast({ title: "Invoice product required", description: "Every new customer return item must come from an invoice.", variant: "destructive" });
        return;
      }
      updateReturnMutation.mutate({
        id: editingReturn.items[0].id,
        remarks,
        items: [
          ...existingItems.map((item) => ({
            id: item.returnId,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            itemRemarks: item.itemRemarks?.trim(),
          })),
          ...newItems.map((item) => ({
            productId: item.productId,
            productType: item.productType,
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            sourceSaleItemId: item.sourceSaleItemId ?? undefined,
            itemRemarks: item.itemRemarks?.trim(),
          })),
        ],
      });
      return;
    }
    if (itemsToSubmit.some((item) => item.sourceSaleItemId === null)) {
      toast({ title: "Invoice product required", description: "Every new customer return item must come from an invoice.", variant: "destructive" });
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
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        ...(item.sourceSaleItemId === null ? {} : { sourceSaleItemId: item.sourceSaleItemId }),
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
                <Input type="date" value={searchFromDate} onChange={(event) => setSearchFromDate(event.target.value)} disabled={!!editingReturn} />
              </div>
              <div>
                <Button className="w-full bg-blue-500 hover:bg-blue-600" onClick={handleGetInvoices} disabled={!selectedCustomer || returnableInvoiceLinesLoading || !!editingReturn}>
                  {returnableInvoiceLinesLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Get Invoices
                </Button>
              </div>

            </div>
          </CardContent>
        </Card>

        {customerSearched && (
          <Card>
            <CardHeader><CardTitle>{editingReturn ? `Edit Return ${editingReturn.documentInvoiceNumber || editingReturn.items[0]?.refNumber}` : "Step 2: Add New Return"}</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-5">
                {editingReturn && (
                  <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                    Update the existing product quantities, prices, and remarks, or add new invoice products below. The return date and invoice links stay unchanged.
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <div>
                    <ProductSearch
                      key={productSearchKey}
                      label="Product"
                      value=""
                      products={searchableReturnProducts}
                      placeholder="Search product by code or name..."
                      onProductSelect={(product) => {
                        setSelectedProductKey(
                          (product as (RegularProduct & { returnKey?: string }) | null)?.returnKey || "",
                        );
                        setSelectedInvoiceLineId("");
                      }}
                      showCode
                      allowClear
                      disabled={!pickerReady || pickerLoading || productOptions.length === 0}
                    />
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
                {pickerLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />Loading invoices and returnable products...
                  </div>
                ) : pickerError ? (
                  <p className="text-sm text-red-600">Failed to load invoice products. Please search again.</p>
                ) : pickerReady && availableProductLines.length === 0 && activeInvoiceItems.length === 0 ? (
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
                              {(() => {
                                const sourceLine = item.sourceSaleItemId != null
                                  ? editSourceLineMap.get(item.sourceSaleItemId)
                                  : undefined;
                                if (sourceLine) {
                                  const maxQty = sourceLine.returnableQuantity
                                    + (storedReturnQtyBySource.get(item.sourceSaleItemId as number) || 0);
                                  return (
                                    <>
                                      <div>{`${formatQuantity(sourceLine.quantity)} / ${formatQuantity(sourceLine.returnedQuantity)}`}</div>
                                      <div className="text-[11px] text-muted-foreground">Invoice max {formatQuantity(maxQty)}</div>
                                    </>
                                  );
                                }
                                if (item.soldQuantity !== undefined && item.returnedQuantity !== undefined) {
                                  return `${formatQuantity(item.soldQuantity)} / ${formatQuantity(item.returnedQuantity)}`;
                                }
                                return `Current return ${formatQuantity(Number(item.quantity) || 0)}`;
                              })()}
                              {item.availableQuantity !== undefined && (
                                <div className="text-[11px] text-muted-foreground">Available {formatQuantity(item.availableQuantity)}</div>
                              )}
                            </TableCell>
                            <TableCell className="w-24">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={item.quantity}
                                onChange={(event) => updateInvoiceLine(item.key, { quantity: event.target.value })}
                                aria-label={`${item.description} return quantity`}
                                className="h-8 px-2 text-right"
                              />
                            </TableCell>
                            <TableCell className="w-28">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={item.unitPrice}
                                onChange={(event) => updateInvoiceLine(item.key, { unitPrice: event.target.value })}
                                aria-label={`${item.description} unit price`}
                                className="h-8 px-2 text-right"
                              />
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right text-sm">
                              {money((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.itemRemarks || ""}
                                onChange={(event) => updateInvoiceLine(item.key, { itemRemarks: event.target.value })}
                                placeholder="Optional"
                                aria-label={`${item.description} remarks`}
                                className="h-8 min-w-36 px-2 text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              {item.returnId === undefined && (
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeInvoiceLine(item.key)} aria-label={`Remove ${item.description}`}>
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
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
                  <div className="flex gap-2">
                    {editingReturn && (
                      <Button type="button" variant="outline" onClick={cancelEditReturn} disabled={updateReturnMutation.isPending}>
                        Cancel
                      </Button>
                    )}
                    <Button
                      type="submit"
                      disabled={
                        createReturnMutation.isPending
                        || updateReturnMutation.isPending
                        || pickerLoading
                      }
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {createReturnMutation.isPending || updateReturnMutation.isPending
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <Save className="mr-2 h-4 w-4" />}
                      {updateReturnMutation.isPending
                        ? "Updating..."
                        : createReturnMutation.isPending
                          ? "Saving..."
                          : editingReturn
                            ? "Update Return"
                            : `Save Return${itemsToSubmit.length ? ` (${itemsToSubmit.length} item${itemsToSubmit.length === 1 ? "" : "s"})` : ""}`}
                    </Button>
                  </div>
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
                        <TableCell>
                          {returnItem.invoiceNumber ? (
                            <button
                              type="button"
                              className="text-blue-600 underline"
                              onClick={() => setDetailsTarget({
                                kind: "return",
                                lineId: returnItem.items[0]?.id ?? returnItem.id,
                              })}
                            >
                              {returnItem.invoiceNumber}
                            </button>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-center">{formatQuantity(returnItem.quantity)}</TableCell>
                        <TableCell className="text-center">{money(returnItem.unitPrice)}</TableCell>
                        <TableCell className="text-center">{money(returnItem.totalValue)}</TableCell>
                        <TableCell>{returnItem.itemRemarks || "-"}</TableCell>
                        <TableCell>{returnItem.remarks || "-"}</TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex items-center gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-1.5"
                                  title="Print return document"
                                  aria-label={`Print return ${returnItem.documentInvoiceNumber || returnItem.refNumber || returnItem.id}`}
                                >
                                  <Printer className="h-4 w-4 text-blue-600" />
                                  <ChevronDown className="h-3 w-3 text-blue-600" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handlePrintReturn(returnItem, "a4")}>A4 Invoice</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrintReturn(returnItem, "a5")}>A5 Invoice</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrintReturn(returnItem, "dot-matrix")}>Dot Matrix</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={
                                !canEditReturn(returnItem.date)
                                || updateReturnMutation.isPending
                                || (!!editingReturn && editingReturn.id !== returnItem.id)
                              }
                              title={canEditReturn(returnItem.date) ? "Edit return document" : "You don't have permission to edit this return"}
                              onClick={() => handleEditReturn(returnItem)}
                            >
                              <Pencil className={`h-4 w-4 ${canEditReturn(returnItem.date) ? "text-blue-600" : "text-gray-400"}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={
                                !canDeleteReturn(returnItem.date)
                                || deleteReturnMutation.isPending
                                || (!!editingReturn && editingReturn.id === returnItem.id)
                              }
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
                          </div>
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

      <CreditDocumentDetailsDialog
        open={!!detailsTarget}
        onOpenChange={(open) => { if (!open) setDetailsTarget(null); }}
        kind={detailsTarget?.kind ?? "return"}
        lineId={detailsTarget?.lineId ?? null}
      />
    </PageLayout>
  );
}
