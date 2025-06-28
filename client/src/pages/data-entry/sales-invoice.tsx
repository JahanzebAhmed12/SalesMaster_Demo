import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PaymentDetailsDrawer from "@/components/layout/payment-details-drawer";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Sale, RegularProduct, NonProduct, Customer, SaleItem } from "@shared/schema";

interface BackendSalePayload {
  invoice_number: string;
  customer_id: number;
  customer_type: string;
  payment_status: string;
  subtotal: number;
  porterage: number;
  vat_rate: number;
  vat_amount: number;
  total_amount: number;
  vehicle_details: string | null;
  gate_number: string | null;
  notes: string | null;
  status: string;
  items: Array<{
    product_id: number | null;
    non_product_id: number | null;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}

// Add StockItem type
interface StockItem {
  id: number;
  productCode: string;
  description: string;
  productType: 'regular' | 'non';
  currentStock: number;
  reorderLevel: number;
  unitOfSale: string | null;
  location: string | null;
}

const SalesInvoice = () => {
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Extract only customerId, vehicleDetails, gateNumber from URL
  const queryParams = new URLSearchParams(window.location.search);
  const customerIdFromUrl = queryParams.get('customerId');
  const vehicleDetailsFromUrl = queryParams.get('vehicleDetails');
  const gateNumberFromUrl = queryParams.get('gateNumber');

  // State for current sale and items
  const [currentSale, setCurrentSale] = useState<Sale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [selectedProductType, setSelectedProductType] = useState<"regular" | "non_product">("regular");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemUnitPrice, setItemUnitPrice] = useState<number>(0);
  const [isCreatingSale, setIsCreatingSale] = useState(false);
  const [customerId, setCustomerId] = useState<string>("");
  const [vehicleDetails, setVehicleDetails] = useState<string>("");
  const [gateNumber, setGateNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [status, setStatus] = useState<string>("draft");

  // Stock search state
  const [productSearch, setProductSearch] = useState("");
  const [productOptions, setProductOptions] = useState<(RegularProduct | NonProduct)[]>([]);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [highlightedProduct, setHighlightedProduct] = useState(-1);
  const productInputRef = useRef<HTMLInputElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch current stock
  const { data: currentStock = [], isLoading: isLoadingStock } = useQuery<StockItem[]>({
    queryKey: ["currentStock"],
    queryFn: async () => await apiRequest("GET", "/api/stock/current"),
  });

  // Fetch customers (needed for customer name display if not directly in sale)
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Fetch regular products
  const { data: regularProducts } = useQuery<RegularProduct[]>({
    queryKey: ["/api/regular_products"],
    queryFn: () => apiRequest("GET", "/api/regular_products"),
  });

  // Fetch non-products
  const { data: nonProducts } = useQuery<NonProduct[]>({
    queryKey: ["/api/non_products"],
    queryFn: () => apiRequest("GET", "/api/non_products"),
  });

  // Filter products by type and search (move after useQuery declarations)
  useEffect(() => {
    let list = selectedProductType === "regular" ? regularProducts || [] : nonProducts || [];
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
  }, [productSearch, selectedProductType, regularProducts, nonProducts]);

  // Get actual database stock (without frontend reduction)
  const getActualStock = (productId: number, type: 'regular' | 'non_product' | 'non') => {
    const stockType = type === 'regular' ? 'regular' : 'non';
    const item = currentStock.find(
      (s) => s.id === productId && s.productType === stockType
    );
    return item ? item.currentStock : 0;
  };

  // Find current stock for a product with real-time reduction for items in current invoice
  const getCurrentStock = (productId: number, type: 'regular' | 'non_product' | 'non') => {
    const stockType = type === 'regular' ? 'regular' : 'non';
    const item = currentStock.find(
      (s) => s.id === productId && s.productType === stockType
    );
    if (!item) return 0;
    
    // Only apply real-time reduction for new invoices (draft)
    // For saved invoices, show actual database stock to prevent double reduction
    if (!currentSale) {
      // Calculate real-time stock reduction based on items in current invoice (not yet saved)
      const reservedQuantity = saleItems
        .filter(saleItem => {
          if (type === 'regular') {
            return saleItem.productId === productId;
          } else {
            return saleItem.nonProductId === productId;
          }
        })
        .reduce((sum, saleItem) => sum + saleItem.quantity, 0);
      
      return Math.max(0, item.currentStock - reservedQuantity);
    } else {
      // For saved invoices, return actual database stock
      return item.currentStock;
    }
  };

  // Keyboard navigation for product dropdown (match sales entry logic)
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
        setSelectedProductId(p.id.toString());
        setProductSearch(`${p.productCode} - ${p.description}`);
        setItemUnitPrice(p.sellingPrice);
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
    const list = selectedProductType === "regular" ? regularProducts || [] : nonProducts || [];
    const p = list.find((x: any) => x.id.toString() === selectedProductId);
    if (p) {
      setProductSearch(`${p.productCode} - ${p.description}`);
      setItemUnitPrice(p.sellingPrice);
    }
  }, [selectedProductId, selectedProductType, regularProducts, nonProducts]);

  // Extract from URL for initial values and pre-populate customer details
  useEffect(() => {
    if (customerIdFromUrl) {
      setCustomerId(customerIdFromUrl);
    }
    if (vehicleDetailsFromUrl) {
      setVehicleDetails(vehicleDetailsFromUrl);
    }
    if (gateNumberFromUrl) {
      setGateNumber(gateNumberFromUrl);
    }
  }, [customerIdFromUrl, vehicleDetailsFromUrl, gateNumberFromUrl]);

  // Get customer details for display
  const selectedCustomer = customers?.find(c => c.id === parseInt(customerId));
  const customerName = currentSale?.customerId 
    ? customers?.find(c => c.id === currentSale.customerId)?.customer_name || 'N/A'
    : selectedCustomer?.customer_name || 'N/A';
  const customerType = currentSale?.customerType || "credit";
  const paymentStatus = currentSale?.paymentStatus || "pending";

  // Mutation to create a new sale
  const createSaleMutation = useMutation({
    mutationFn: (data: Partial<BackendSalePayload>) => {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      return apiRequest("POST", "/api/sales", data, { signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales", response.invoiceNumber] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["currentStock"] });
      setCurrentSale(response);
      setIsCreatingSale(false);
      toast({
        title: "Success",
        description: "New sale created successfully",
      });
    },
    onError: (error: any) => {
      setIsCreatingSale(false);
      let errorMessage = "Failed to create new sale";
      
      if (error.name === 'AbortError') {
        errorMessage = "Request timed out. Please try again.";
      } else if (error?.error) {
        errorMessage = error.error;
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Mutation to update sale (add/remove items, finalize)
  const updateSaleMutation = useMutation<Sale, Error, BackendSalePayload>({
    mutationFn: (payload) => apiRequest("PUT", `/api/sales/${currentSale?.id}`, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales", data.invoiceNumber] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["currentStock"] });
      toast({
        title: "Success",
        description: "Invoice updated successfully",
      });
      setCurrentSale(data);
      setSaleItems(data.items || []);
      // Force refresh stock data to show correct levels
      queryClient.refetchQueries({ queryKey: ["currentStock"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.error || error?.response?.data?.error || error.message || "Failed to update invoice",
        variant: "destructive",
      });
    },
  });

  // Add mutation for deleting the sale
  const deleteSaleMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/sales/${currentSale?.id}`),
    onSuccess: () => {
      toast({
        title: "Invoice Deleted",
        description: "The invoice has been deleted successfully.",
      });
      // Invalidate sales queries to clear cache
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["currentStock"] });
      if (currentSale?.invoiceNumber) {
        queryClient.invalidateQueries({ queryKey: ["/api/sales", currentSale.invoiceNumber] });
      }
      // Reset local state to ensure new sale logic triggers
      setCurrentSale(null);
      setSaleItems([]);
      // Auto-refresh the page by redirecting and reloading
      window.location.replace("/data-entry/sales-entry");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete invoice.",
        variant: "destructive",
      });
    },
  });

  // Helper to get product name by ID
  const getProductName = (productId: number | null, nonProductId: number | null, type: "regular" | "non_product") => {
    if (type === "regular" && productId) {
      return regularProducts?.find(p => p.id === productId)?.description || 'N/A';
    } else if (type === "non_product" && nonProductId) {
      return nonProducts?.find(p => p.id === nonProductId)?.description || 'N/A';
    }
    return 'N/A';
  };

  const handleAddItem = () => {
    if (!selectedProductId || itemQuantity <= 0 || itemUnitPrice <= 0) {
      toast({
        title: "Validation Error",
        description: "Please select a product, and enter valid quantity and unit price.",
        variant: "destructive",
      });
      return;
    }

    // Check if we have enough stock (actual database stock)
    const actualStockLevel = getActualStock(parseInt(selectedProductId), selectedProductType);
    
    // Calculate total quantity already in this invoice for this product
    const existingQuantity = saleItems
      .filter(item => {
        if (selectedProductType === 'regular') {
          return item.productId === parseInt(selectedProductId);
        } else {
          return item.nonProductId === parseInt(selectedProductId);
        }
      })
      .reduce((sum, item) => sum + item.quantity, 0);
    
    const totalRequestedQuantity = existingQuantity + itemQuantity;
    
    if (totalRequestedQuantity > actualStockLevel) {
      const availableStock = getCurrentStock(parseInt(selectedProductId), selectedProductType);
      toast({
        title: "Insufficient Stock",
        description: `Only ${availableStock} units available in stock. You already have ${existingQuantity} in this invoice.`,
        variant: "destructive",
      });
      return;
    }

    const isRegular = selectedProductType === "regular";
    const productList = isRegular ? regularProducts : nonProducts;
    const product = productList?.find(p => p.id === parseInt(selectedProductId));
    if (!product) {
      toast({
        title: "Error",
        description: "Selected product not found.",
        variant: "destructive",
      });
      return;
    }
    const newItem: SaleItem = {
      productId: isRegular ? product.id : null,
      nonProductId: isRegular ? null : product.id,
      quantity: itemQuantity,
      unitPrice: itemUnitPrice,
      totalPrice: itemQuantity * itemUnitPrice,
      productName: product.description || null,
      id: 0,
      saleId: currentSale?.id || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const updatedItems = [...saleItems, newItem];
    setSaleItems(updatedItems);
    
    // Only update backend if invoice is already saved
    if (currentSale) {
      const updatedSalePayload: BackendSalePayload = {
        invoice_number: currentSale.invoiceNumber,
        customer_id: currentSale.customerId,
        customer_type: currentSale.customerType,
        payment_status: currentSale.paymentStatus,
        subtotal: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
        porterage: currentSale.porterage,
        vat_rate: currentSale.vatRate,
        vat_amount: currentSale.vatAmount,
        total_amount: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
        vehicle_details: currentSale.vehicleDetails,
        gate_number: currentSale.gateNumber,
        notes: currentSale.notes,
        status: currentSale.status,
        items: updatedItems.map(item => ({
          product_id: item.productId,
          non_product_id: item.nonProductId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
        })),
      };
      updateSaleMutation.mutate(updatedSalePayload);
    }
    // For new invoices, stock will be reduced when the invoice is saved
    setSelectedProductId("");
    setItemQuantity(1);
    setItemUnitPrice(0);
    setProductSearch("");
  };

  // Save handler: create sale only when Save is clicked
  const handleSaveInvoice = () => {
    if (!customerId) {
      toast({
        title: "Validation Error",
        description: "Please select a customer first.",
        variant: "destructive",
      });
      return;
    }
    
    if (saleItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one item to the invoice.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingSale(true);
    const subtotal = saleItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const payload: Partial<BackendSalePayload> = {
      customer_id: parseInt(customerId),
      customer_type: "credit",
      payment_status: "pending",
      subtotal,
      total_amount: subtotal,
      porterage: 0,
      vat_rate: 0,
      vat_amount: 0,
      vehicle_details: vehicleDetails || null,
      gate_number: gateNumber || null,
      notes: notes || null,
      status: "finalized",
      items: saleItems.map(item => ({
        product_id: item.productId,
        non_product_id: item.nonProductId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
      })),
    };
    createSaleMutation.mutate(payload);
  };

  const calculateTotalSummary = () => {
    const subtotal = saleItems.reduce((sum, item) => sum + item.totalPrice, 0);
    // Assuming no VAT/Porterage for now
    const vatAmount = 0; 
    const porterage = 0; 
    const totalAmount = subtotal + vatAmount + porterage;
    return { subtotal, vatAmount, porterage, totalAmount };
  };

  const { subtotal, vatAmount, porterage, totalAmount } = calculateTotalSummary();

  // Add this handler for closing/clearing unsaved invoice
  const handleCloseInvoice = () => {
    if (window.confirm("Are you sure you want to discard this unsaved invoice?")) {
      setCurrentSale(null);
      setSaleItems([]);
      setCustomerId("");
      setVehicleDetails("");
      setGateNumber("");
      setNotes("");
      setStatus("draft");
      setLocation("/data-entry/sales-entry");
    }
  };

  if (isCreatingSale) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Creating Invoice...</h2>
          <p className="text-gray-600">Please wait while we process your sale. This may take a few seconds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        {/* Header Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">INVOICE</h1>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-4">
                  <span>Date: {new Date(currentSale?.date || Date.now()).toLocaleDateString('en-GB')}</span>
                  {/* Print Invoice Button */}
                  {currentSale?.invoiceNumber && (
                    <>
                      <a
                        href={`/print/invoice/${currentSale.invoiceNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="outline" className="ml-2">Print Invoice</Button>
                      </a>
                      <a
                        href={`/print/dot-matrix-invoice/${currentSale.invoiceNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button size="sm" variant="outline" className="ml-2">Dot Matrix Print</Button>
                      </a>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span>Invoice: {currentSale?.invoiceNumber || 'Draft'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Customer type: {customerType}</span>
                  <Badge className="bg-green-600 text-white">{paymentStatus}</Badge>
                </div>
                <div>
                  <span>Customer Name: </span>
                  <span className="font-semibold">{customerName}</span>
                </div>
                {(currentSale?.vehicleDetails || vehicleDetails) && (
                  <div>
                    <span>Vehicle Details: </span>
                    <span className="font-semibold">{currentSale?.vehicleDetails || vehicleDetails}</span>
                  </div>
                )}
                {(currentSale?.gateNumber || gateNumber) && (
                  <div>
                    <span>Gate Number: </span>
                    <span className="font-semibold">{currentSale?.gateNumber || gateNumber}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-right text-sm text-gray-600">
              <div>TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...</div>
            </div>
          </div>

          {/* Product Type Selection */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <input 
                type="radio" 
                id="regular" 
                name="productType" 
                checked={selectedProductType === "regular"}
                onChange={() => setSelectedProductType("regular")}
              />
              <label htmlFor="regular" className="text-sm">Regular Products</label>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="radio" 
                id="non_product" 
                name="productType" 
                checked={selectedProductType === "non_product"}
                onChange={() => setSelectedProductType("non_product")}
              />
              <label htmlFor="non_product" className="text-sm">Non-Products</label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Pdf</Button>
              <Button variant="outline" size="sm">Excel</Button>
              <Button variant="outline" size="sm">Copy</Button>
              <Button variant="outline" size="sm">Cust_Outstanding</Button>
            </div>
            
            <div className="flex items-center gap-4">
              <Button className="bg-blue-600 hover:bg-blue-700">More</Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setIsPaymentDrawerOpen(true)}
              >
                Payment details
              </Button>
              <Button variant="outline" size="sm">Options ℹ</Button>
            </div>
          </div>

          {/* Search */}
          <div className="flex justify-end mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">Search:</span>
              <Input className="w-48" />
            </div>
          </div>
        </div>

        {/* Products Table */}
        <Card>
          <CardContent className="p-0">
            <div className="relative w-full overflow-visible">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-center">Current Stock</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-center">Unit price</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Existing items */}
                  {saleItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="text-center">
                        {item.productId
                          ? getCurrentStock(item.productId, 'regular')
                          : item.nonProductId
                            ? getCurrentStock(item.nonProductId, 'non')
                            : '-'}
                      </TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-center">£{item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{item.totalPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" variant="destructive" onClick={() => {
                          const updatedItems = saleItems.filter((_, i) => i !== index);
                          if (currentSale) {
                            const updatedSalePayload: BackendSalePayload = {
                              invoice_number: currentSale.invoiceNumber,
                              customer_id: currentSale.customerId,
                              customer_type: currentSale.customerType,
                              payment_status: currentSale.paymentStatus,
                              subtotal: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
                              porterage: currentSale.porterage,
                              vat_rate: currentSale.vatRate,
                              vat_amount: currentSale.vatAmount,
                              total_amount: updatedItems.reduce((sum, item) => sum + item.totalPrice, 0),
                              vehicle_details: currentSale.vehicleDetails,
                              gate_number: currentSale.gateNumber,
                              notes: currentSale.notes,
                              status: currentSale.status,
                              items: updatedItems.map(item => ({
                                product_id: item.productId,
                                non_product_id: item.nonProductId,
                                quantity: item.quantity,
                                unit_price: item.unitPrice,
                                total_price: item.totalPrice,
                              })),
                            };
                            updateSaleMutation.mutate(updatedSalePayload);
                            setSaleItems(updatedItems);
                          } else {
                            setSaleItems(updatedItems);
                          }
                          toast({title: "Item Removed", description: "Sale item has been removed."});
                        }}>
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* New item entry row */}
                  <TableRow style={{ overflow: "visible" }}>
                    <TableCell colSpan={2} style={{ overflow: "visible", position: "relative" }}>
                      <div className="relative">
                        <Input
                          ref={productInputRef}
                          placeholder={`Type to search ${selectedProductType === 'regular' ? 'regular' : 'non'} products...`}
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
                                key={p.id}
                                className={`p-2 cursor-pointer flex items-center ${highlightedProduct === idx ? "bg-blue-100" : ""}`}
                                onMouseDown={() => {
                                  setSelectedProductId(p.id.toString());
                                  setProductSearch(`${p.productCode} - ${p.description}`);
                                  setItemUnitPrice(p.sellingPrice);
                                  setShowProductDropdown(false);
                                }}
                                onMouseEnter={() => setHighlightedProduct(idx)}
                              >
                                <span className="font-mono text-xs text-gray-600">{p.productCode}</span>
                                <span className="ml-2">{p.description}</span>
                                <span className="ml-auto text-xs text-gray-500">Stock: {getCurrentStock(p.id, selectedProductType)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Show current stock below input if a product is selected */}
                        {selectedProductId && (
                          <div className="text-xs text-gray-600 mt-1">Current Stock: {getCurrentStock(Number(selectedProductId), selectedProductType)}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input 
                        className="text-center" 
                        type="number" 
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(parseInt(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input 
                        className="text-center" 
                        type="number" 
                        step="0.01"
                        value={itemUnitPrice}
                        onChange={(e) => setItemUnitPrice(parseFloat(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      £{(itemQuantity * itemUnitPrice).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button 
                        size="sm" 
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          handleAddItem();
                        }}
                      >
                        Add
                      </Button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Table Summary */}
            <div className="p-4 border-t">
              <div className="flex justify-between text-sm">
                <span>{saleItems.length} Items</span>
                <span></span>
                <span>£{subtotal.toFixed(2)}</span>
              </div>
              <div className="text-sm text-gray-500 mt-2">
                Showing {saleItems.length} of {saleItems.length} entries
              </div>
              
              {/* Pagination (can be removed or simplified if not needed for sales items) */}
              <div className="flex justify-between items-center mt-4">
                <Button variant="outline" size="sm">◀</Button>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm">Previous</Button>
                  <Button variant="outline" size="sm" className="bg-blue-600 text-white">1</Button>
                  <Button variant="outline" size="sm">Next</Button>
                </div>
                <Button variant="outline" size="sm">▶</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Summary */}
        <div className="mt-6 flex justify-end">
          <Card className="w-96">
            <CardContent className="p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Sub Total:</span>
                  <span>£{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Porterage:</span>
                  <span>£{porterage.toFixed(2)} ✕</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT @ %:</span>
                  <span>£{vatAmount.toFixed(2)} ✕</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Total Amt:</span>
                  <span>£{totalAmount.toFixed(2)}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                {!currentSale && (
                  <Button variant="outline" size="sm" className="w-full" onClick={handleCloseInvoice}>
                    Close Invoice
                  </Button>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={handleSaveInvoice} disabled={!!currentSale}>
                  Save Invoice
                </Button>
                <Button variant="destructive" size="sm" className="w-full" onClick={() => deleteSaleMutation.mutate()} disabled={!currentSale}>
                  Delete Invoice
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PaymentDetailsDrawer 
        open={isPaymentDrawerOpen}
        onOpenChange={setIsPaymentDrawerOpen}
      />
    </div>
  );
};

export default SalesInvoice;
