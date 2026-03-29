import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import PageLayout from "@/components/common/page-layout";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { subDays, format } from 'date-fns';

export default function PurchaseInvoice() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [unitPrice, setUnitPrice] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [remarks, setRemarks] = useState("");
  const [productRemarks, setProductRemarks] = useState("");
  const [locationStr, setLocation] = useLocation();
  const [purchaseId, setPurchaseId] = useState<string | null>(null);
  // Add state to track invoiceId from URL
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productOptions, setProductOptions] = useState<any[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [highlightedProduct, setHighlightedProduct] = useState(-1);
  const productInputRef = useRef<HTMLInputElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const remarksInputRef = useRef<HTMLInputElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Extract purchaseId from URL on component mount and URL changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("purchaseId");
    const invId = params.get("invoiceId");
    const editMode = params.get("edit");
    console.log("PurchaseInvoice: Extracted purchaseId from URL:", id, "invoiceId:", invId, "Edit mode:", editMode);

    if (invId && !id) {
      // Opened directly by invoiceId (e.g. from daily book purchase link)
      // Fetch purchase info via the invoice
      apiRequest("GET", `/api/purchase-invoices/by-invoice/${invId}`).then((response: any) => {
        if (response.purchase) {
          setPurchaseId(response.purchase.id.toString());
        }
        if (response.invoice) {
          setIsEditMode(true);
          setInvoiceId(response.invoice.id);
          setRemarks(response.invoice.remarks || "");
          const items = response.invoice.items || [];
          setItems(items.map((item: any) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            remarks: item.remarks || ""
          })));
        }
      }).catch(console.error);
    } else {
      setPurchaseId(id);
      if (editMode === "true" && id) {
        fetchExistingInvoiceData(id);
      }
    }
  }, [locationStr]);

  // Extract invoiceId from URL on mount and URL changes — handled in purchaseId effect above
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invId = params.get("invoiceId");
    if (invId) setInvoiceId(invId);
  }, [locationStr]);

  // Function to fetch existing invoice data for editing
  const fetchExistingInvoiceData = async (purchaseId: string) => {
    try {
      const response = await apiRequest("GET", `/api/purchase-invoices/by-purchase/${purchaseId}`);
      if (response.invoice) {
        setIsEditMode(true);
        setInvoiceId(response.invoice.id);
        setRemarks(response.invoice.remarks || "");

        // Pre-fill items if they exist
        if (response.invoice.items && response.invoice.items.length > 0) {
          const formattedItems = response.invoice.items.map((item: any) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            remarks: item.remarks || ""
          }));
          setItems(formattedItems);
        }

        toast({
          title: "Invoice Loaded",
          description: "Existing invoice data has been loaded for editing.",
        });
      }
    } catch (error) {
      console.error("Error fetching existing invoice:", error);
      toast({
        title: "Info",
        description: "No existing invoice found. Creating a new one.",
      });
    }
  };

  // Fetch purchase details
  const { data: purchase, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/purchases", purchaseId],
    queryFn: () => apiRequest("GET", `/api/purchases/${purchaseId}`),
    enabled: !!purchaseId,
    retry: 3,
    retryDelay: 1000,
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
    // Add placeholder data to prevent loading state when data is in cache
    placeholderData: (previousData) => previousData,
  });

  // Debug logging for query state
  useEffect(() => {
    console.log("PurchaseInvoice: Query state - purchaseId:", purchaseId, "isLoading:", isLoading, "isError:", isError, "data:", purchase);
  }, [purchaseId, isLoading, isError, purchase]);

  // Fetch products
  const { data: productsData } = useQuery({
    queryKey: ["/api/products"],
    queryFn: () => apiRequest("GET", "/api/products"),
  });
  const regularProducts = productsData?.regularProducts || [];
  const nonProducts = productsData?.nonProducts || [];

  // Filter products by search
  useEffect(() => {
    let list = [
      ...regularProducts.map((p: any) => ({ ...p, productType: 'regular' })),
      ...nonProducts.map((p: any) => ({ ...p, productType: 'non' }))
    ];
    if (productSearch) {
      const term = productSearch.toLowerCase();
      list = list.filter(
        (p: any) =>
          p.productCode?.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term)
      );
    }
    setProductOptions(list);
    setHighlightedProduct(-1);
  }, [productSearch, regularProducts, nonProducts]);

  // Keyboard navigation for product dropdown
  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showProductDropdown || productOptions.length === 0) {
      // If no dropdown is showing and user presses Enter, move to quantity
      if (e.key === "Enter" && selectedProductId) {
        e.preventDefault();
        quantityInputRef.current?.focus();
        return;
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedProduct((prev) => (prev < productOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedProduct((prev) => (prev > 0 ? prev - 1 : productOptions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedProduct >= 0 && highlightedProduct < productOptions.length) {
        const p = productOptions[highlightedProduct];
        setSelectedProductId(`${p.productType}-${p.id}`);
        setProductSearch(`${p.productCode} - ${p.description}`);
        // Keep unit price empty for manual entry
        setUnitPrice("");
        setShowProductDropdown(false);
        // Auto-focus to quantity input after product selection
        setTimeout(() => {
          quantityInputRef.current?.focus();
        }, 100);
      }
    } else if (e.key === "Escape") {
      setShowProductDropdown(false);
    }
  };

  // Keyboard handler for quantity input
  const handleQuantityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Move to price input
      priceInputRef.current?.focus();
    }
  };

  // Keyboard handler for price input
  const handlePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Move to remarks input
      remarksInputRef.current?.focus();
    }
  };

  // Keyboard handler for remarks input
  const handleRemarksKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Add the item and return focus to product search
      handleAddProduct();
    }
  };

  // Close dropdown on blur (with delay to allow click)
  const handleProductBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => setShowProductDropdown(false), 100);
  };

  // When productId changes, update productSearch but keep unit price empty
  useEffect(() => {
    if (!selectedProductId) return;
    let list = [
      ...regularProducts.map((p: any) => ({ ...p, productType: 'regular' })),
      ...nonProducts.map((p: any) => ({ ...p, productType: 'non' }))
    ];
    const [type, id] = selectedProductId.split('-');
    const p = list.find((x: any) => x.id.toString() === id && x.productType === type);
    if (p) {
      setProductSearch(`${p.productCode} - ${p.description}`);
      // Keep unit price empty for manual entry
      setUnitPrice("");
    }
  }, [selectedProductId, regularProducts, nonProducts]);

  // Save invoice mutation
  const createInvoiceMutation = useMutation({
    mutationFn: (data: any) => {
      if (isEditMode && invoiceId) {
        return apiRequest("PUT", `/api/purchase-invoices/${invoiceId}`, data);
      } else {
        return apiRequest("POST", "/api/purchase-invoices", data);
      }
    },
    onSuccess: (invoice) => {
      // Invalidate all relevant queries to update stock and other data
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-movements"] });

      toast({
        title: "Success",
        description: isEditMode ? "Purchase invoice updated successfully!" : "Purchase invoice saved successfully!",
      });

      if (!isEditMode) {
        setLocation(`/data-entry/purchase-invoice?purchaseId=${purchaseId}&invoiceId=${invoice.id}`);
        setInvoiceId(invoice.id);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: isEditMode ? "Failed to update purchase invoice" : "Failed to save purchase invoice",
        variant: "destructive",
      });
    }
  });

  // Delete invoice mutation
  const deleteInvoiceMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/purchase-invoices/${invoiceId}`),
    onSuccess: () => {
      // Invalidate all relevant queries to update data across the app
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-movements"] });
      // Invalidate daily book purchase queries
      queryClient.invalidateQueries({ queryKey: ["daily-book-purchase"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/daily-book-purchase"] });
      // Invalidate stock check queries
      queryClient.invalidateQueries({ queryKey: ["stock-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/stock-check"] });

      toast({ title: "Deleted", description: "Invoice deleted successfully" });
      setLocation("/data-entry/purchase-entry");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete invoice", variant: "destructive" });
    }
  });

  // Add product to invoice
  const handleAddProduct = () => {
    let product = null;

    // Check if it's a regular product (starts with 'regular-') or non-product
    if (selectedProductId.startsWith('regular-')) {
      const productId = selectedProductId.replace('regular-', '');
      product = regularProducts.find((p: any) => String(p.id) === productId);
    } else if (selectedProductId.startsWith('non-')) {
      const productId = selectedProductId.replace('non-', '');
      product = nonProducts.find((p: any) => String(p.id) === productId);
    }

    if (!product) {
      toast({
        title: "Validation Error",
        description: "Please select a product.",
        variant: "destructive",
      });
      productInputRef.current?.focus();
      return;
    }

    if (quantity <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid quantity greater than 0.",
        variant: "destructive",
      });
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
      return;
    }

    if (!unitPrice || Number(unitPrice) < 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid unit price (0 or greater).",
        variant: "destructive",
      });
      priceInputRef.current?.focus();
      priceInputRef.current?.select();
      return;
    }

    const totalPrice = quantity * Number(unitPrice);
    console.log('Adding product:', {
      productId: product.id,
      productName: product.description,
      quantity,
      unitPrice,
      totalPrice,
      calculation: `${quantity} * ${unitPrice} = ${totalPrice}`
    });

    setItems([...items, {
      productId: product.id,
      productName: product.description,
      quantity,
      unitPrice,
      totalPrice,
      remarks: productRemarks // Add remarks to item
    }]);

    // Show success message
    toast({
      title: "Product Added",
      description: `${product.description} (Qty: ${quantity}) added to invoice.`,
    });

    setSelectedProductId("");
    setProductSearch(""); // Clear the product search field
    setQuantity(0); // Reset to 0 for completely manual entry
    setUnitPrice(""); // Keep unit price empty for next product
    setProductRemarks(""); // Clear remarks after adding

    // Focus back to product input field for next item
    setTimeout(() => {
      if (productInputRef.current) {
        productInputRef.current.focus();
        productInputRef.current.select(); // Select all text for easy replacement
      }
    }, 100);
  };

  // Save invoice
  const handleSaveInvoice = () => {
    if (items.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one product to the invoice",
        variant: "destructive",
      });
      return;
    }

    createInvoiceMutation.mutate({
      purchaseId: purchaseId,
      supplierId: purchase?.supplierId, // <-- Add this line
      remarks,
      items
    }, {
      onSuccess: () => {
        // After saving, auto-navigate to purchase entry page
        setLocation("/data-entry/purchase-entry");
      }
    });
  };

  const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + P to focus on product search
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        productInputRef.current?.focus();
        productInputRef.current?.select();
      }
      // Escape to clear current inputs and focus on product search
      if (e.key === 'Escape' && !showProductDropdown) {
        e.preventDefault();
        setSelectedProductId("");
        setQuantity(0);
        setUnitPrice("");
        setProductRemarks("");
        setProductSearch("");
        productInputRef.current?.focus();
      }
      // Ctrl/Cmd + Enter to add product
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAddProduct();
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showProductDropdown, selectedProductId, quantity, unitPrice, productRemarks]);

  // Auto-focus product input on component mount
  useEffect(() => {
    if (productInputRef.current && !isEditMode) {
      // Only auto-focus for new invoices, not when editing existing ones
      setTimeout(() => {
        productInputRef.current?.focus();
      }, 500); // Small delay to ensure component is fully rendered
    }
  }, [isEditMode]);

  // Handler for Supplier History navigation
  const handleSupplierHistory = () => {
    if (!purchase || !purchase.supplierId) {
      toast({ title: 'No supplier', description: 'No supplier found for this purchase.' });
      return;
    }
    const today = new Date();
    const lastWeek = subDays(today, 7);
    const searchParams = new URLSearchParams([
      ['supplierId', String(purchase.supplierId)],
      ['fromDate', format(lastWeek, 'yyyy-MM-dd')],
      ['toDate', format(today, 'yyyy-MM-dd')],
      ['autoSearch', 'true']
    ]);
    setLocation(`/historical-reports/supplier-history?${searchParams.toString()}`);
  };

  return (
    <PageLayout title="Purchase Invoice" breadcrumb="Data Entry / Purchase Invoice">
      <div className="space-y-6">
        {/* Purchase Details Card */}
        <Card>
          <CardHeader className="flex flex-row justify-between items-center">
            <CardTitle>Purchase Details</CardTitle>
            {/* More Dropdown for Supplier History */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">More</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={handleSupplierHistory}>
                  Supplier History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/data-entry/purchase-entry")}>
                  Close Invoice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p>Loading purchase details...</p>
                {purchaseId && <p className="text-sm text-gray-500">Purchase ID: {purchaseId}</p>}
              </div>
            ) : isError ? (
              <div className="text-center py-4 text-red-500">
                <p>Error loading purchase details</p>
                <Button
                  onClick={() => refetch()}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            ) : purchase ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Date</Label>
                  <p className="text-sm">{format(new Date(purchase.date), "dd/MM/yyyy")}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Supplier</Label>
                  <p className="text-sm font-medium">{purchase.supplierName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Amount</Label>
                  <p className="text-sm font-medium">£{parseFloat(purchase.amount).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Status</Label>
                  <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                    {purchase.status}
                  </Badge>
                </div>
              </div>
            ) : !purchaseId ? (
              <div className="text-center py-4 text-gray-500">
                <p>No purchase ID provided in URL</p>
                <p className="text-sm">Please navigate from a purchase entry</p>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p>No purchase found</p>
                <Button
                  onClick={() => refetch()}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Invoice Form Card */}
        <Card>
          <CardHeader>
            <CardTitle>{isEditMode ? "Edit Purchase Invoice" : "Create Purchase Invoice"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">


            <Separator />

            {/* Add Product Section */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <Label className="text-base font-medium">Add Products</Label>
                <div className="text-xs text-gray-500 bg-gray-50 px-3 py-1 rounded-md">
                  <span className="font-medium">Flow:</span> Product → Quantity → Price → Remarks → Add | <span className="font-medium">Shortcuts:</span> Ctrl+P (Focus Product) | Ctrl+Enter (Add Product) | Esc (Clear)
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
                <div>
                  <Label htmlFor="product">Product</Label>
                  {/* Replace dropdown with search input and dropdown */}
                  <div className="relative">
                    <Input
                      ref={productInputRef}
                      placeholder="Type to search products..."
                      value={productSearch}
                      onChange={e => {
                        setProductSearch(e.target.value);
                        setShowProductDropdown(true);
                        setSelectedProductId("");
                      }}
                      onFocus={() => setShowProductDropdown(!!productSearch)}
                      onBlur={handleProductBlur}
                      onKeyDown={handleProductKeyDown}
                      autoComplete="off"
                    />
                    {showProductDropdown && productOptions.length > 0 && (
                      <div ref={productDropdownRef} className="absolute z-[9999] bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto shadow-lg border-gray-300">
                        {productOptions.map((p, idx) => (
                          <div
                            key={p.productType + '-' + p.id}
                            className={`p-2 cursor-pointer flex items-center ${highlightedProduct === idx ? "bg-blue-100" : ""}`}
                            onMouseDown={() => {
                              setSelectedProductId(`${p.productType}-${p.id}`);
                              setProductSearch(`${p.productCode} - ${p.description}`);
                              // Keep unit price empty for manual entry
                              setUnitPrice("");
                              setShowProductDropdown(false);
                            }}
                            onMouseEnter={() => setHighlightedProduct(idx)}
                          >
                            <span className="font-mono text-xs text-gray-600">{p.productCode}</span>
                            <span className="ml-2">{p.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    ref={quantityInputRef}
                    id="quantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Qty"
                    value={quantity === 0 ? "" : quantity}
                    onChange={e => setQuantity(e.target.value === "" ? 0 : Number(e.target.value) || 0)}
                    onKeyDown={handleQuantityKeyDown}
                    onKeyPress={(e) => {
                      // Allow numbers, decimal point, backspace, delete, and arrow keys
                      if (!/[0-9.]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                        e.preventDefault();
                      }
                      // Prevent multiple decimal points
                      if (e.key === '.' && e.currentTarget.value.includes('.')) {
                        e.preventDefault();
                      }
                    }}
                    onPaste={(e) => {
                      // Allow pasting decimal numbers
                      const paste = e.clipboardData?.getData('text');
                      if (paste && !/^\d*\.?\d*$/.test(paste)) {
                        e.preventDefault();
                      }
                    }}
                    onFocus={(e) => e.target.select()}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="unitPrice">Unit Price</Label>
                  <Input
                    ref={priceInputRef}
                    id="unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="£0.00"
                    value={unitPrice}
                    onChange={e => setUnitPrice(e.target.value)}
                    onKeyDown={handlePriceKeyDown}
                    onFocus={(e) => e.target.select()}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="productRemarks">Remarks</Label>
                  <Input
                    ref={remarksInputRef}
                    id="productRemarks"
                    placeholder="Remarks (optional)"
                    value={productRemarks}
                    onChange={e => setProductRemarks(e.target.value)}
                    onKeyDown={handleRemarksKeyDown}
                    onFocus={(e) => e.target.select()}
                    className="mt-1"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAddProduct}
                    className="w-full"
                    disabled={!selectedProductId || quantity <= 0 || !unitPrice || Number(unitPrice) < 0}
                  >
                    Add Product
                  </Button>
                </div>
              </div>

              {/* Live calculation display */}
              {selectedProductId && quantity > 0 && unitPrice && Number(unitPrice) >= 0 && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="text-sm text-blue-800">
                    <span className="font-medium">Preview:</span> {quantity} × £{Number(unitPrice).toFixed(2)} = <span className="font-bold">£{(quantity * Number(unitPrice)).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Products Table */}
            {items.length > 0 && (
              <div>
                <Label className="text-base font-medium">Invoice Items</Label>
                <Table className="mt-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Remarks</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell>{item.remarks || "-"}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">£{(Number(item.unitPrice) || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">£{(Number(item.totalPrice) || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const newItems = items.filter((_, index) => index !== idx);
                              setItems(newItems);
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-bold">
                        Total Amount:
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg">
                        £{totalAmount.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Save Button */}
            <div className="flex justify-between pt-4 gap-2">
              {/* PDF Button on the left bottom */}
              <div>
                {invoiceId && (
                  <Button
                    variant="outline"
                    onClick={() => window.open(`/print/purchase-invoice/${invoiceId}`, "_blank")}
                    className="px-8"
                  >
                    PDF
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {invoiceId && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this invoice?")) {
                        deleteInvoiceMutation.mutate();
                      }
                    }}
                    className="px-8"
                    disabled={deleteInvoiceMutation.isPending}
                  >
                    {deleteInvoiceMutation.isPending ? "Deleting..." : "Delete"}
                  </Button>
                )}
                <Button
                  onClick={handleSaveInvoice}
                  disabled={createInvoiceMutation.isPending || items.length === 0}
                  className="px-8"
                >
                  {createInvoiceMutation.isPending
                    ? (isEditMode ? "Updating..." : "Saving...")
                    : (isEditMode ? "Update Purchase Invoice" : "Save Purchase Invoice")
                  }
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}