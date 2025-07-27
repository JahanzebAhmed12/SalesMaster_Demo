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
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
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

  // Extract purchaseId from URL on component mount and URL changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("purchaseId");
    console.log("PurchaseInvoice: Extracted purchaseId from URL:", id);
    setPurchaseId(id);
  }, [locationStr]);

  // Extract invoiceId from URL on mount and URL changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invId = params.get("invoiceId");
    setInvoiceId(invId);
  }, [locationStr]);

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
    if (!showProductDropdown || productOptions.length === 0) return;
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
        setUnitPrice(Number(p.sellingPrice));
        setShowProductDropdown(false);
      }
    } else if (e.key === "Escape") {
      setShowProductDropdown(false);
    }
  };

  // Close dropdown on blur (with delay to allow click)
  const handleProductBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => setShowProductDropdown(false), 100);
  };

  // When productId changes, update productSearch and unit price
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
      setUnitPrice(Number(p.sellingPrice));
    }
  }, [selectedProductId, regularProducts, nonProducts]);

  // Save invoice mutation
  const createInvoiceMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/purchase-invoices", data),
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
        description: "Purchase invoice saved successfully!",
      });
      setLocation(`/data-entry/purchase-invoice?purchaseId=${purchaseId}&invoiceId=${invoice.id}`);
      setInvoiceId(invoice.id);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save purchase invoice",
        variant: "destructive",
      });
    }
  });

  // Delete invoice mutation
  const deleteInvoiceMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/purchase-invoices/${invoiceId}`),
    onSuccess: () => {
      toast({ title: "Deleted", description: "Invoice deleted" });
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
    
    if (!product || quantity <= 0 || unitPrice <= 0) {
      toast({
        title: "Error",
        description: "Please select a product and enter valid quantity and price",
        variant: "destructive",
      });
      return;
    }

    const totalPrice = quantity * unitPrice;
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
    setSelectedProductId("");
    setQuantity(1);
    setUnitPrice(0);
    setProductRemarks(""); // Clear remarks after adding
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
                  <p className="text-sm">{new Date(purchase.date).toLocaleDateString()}</p>
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
            <CardTitle>Create Purchase Invoice</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
          

            <Separator />

            {/* Add Product Section */}
            <div>
              <Label className="text-base font-medium">Add Products</Label>
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
                      <div ref={productDropdownRef} className="absolute z-50 bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto shadow">
                        {productOptions.map((p, idx) => (
                          <div
                            key={p.productType + '-' + p.id}
                            className={`p-2 cursor-pointer flex items-center ${highlightedProduct === idx ? "bg-blue-100" : ""}`}
                            onMouseDown={() => {
                              setSelectedProductId(`${p.productType}-${p.id}`);
                              setProductSearch(`${p.productCode} - ${p.description}`);
                              setUnitPrice(Number(p.sellingPrice));
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
                    id="quantity"
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={quantity}
                    onChange={e => setQuantity(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="unitPrice">Unit Price</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="£0.00"
                    value={unitPrice}
                    onChange={e => setUnitPrice(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="productRemarks">Remarks</Label>
                  <Input
                    id="productRemarks"
                    placeholder="Remarks (optional)"
                    value={productRemarks}
                    onChange={e => setProductRemarks(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddProduct} className="w-full">
                    Add Product
                  </Button>
                </div>
              </div>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell>{item.remarks || "-"}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">£{item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">£{item.totalPrice.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={4} className="text-right font-bold">
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
                  {createInvoiceMutation.isPending ? "Saving..." : "Save Purchase Invoice"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}