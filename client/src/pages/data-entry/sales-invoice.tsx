import { useState, useEffect } from "react";
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

const SalesInvoice = () => {
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);
  const [location] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Extract invoiceNumber and other initial data from URL
  const queryParams = new URLSearchParams(window.location.search);
  const invoiceNumberFromUrl = queryParams.get('invoiceNumber');
  const customerIdFromUrl = queryParams.get('customerId');
  const vehicleDetailsFromUrl = queryParams.get('vehicleDetails');
  const gateNumberFromUrl = queryParams.get('gateNumber');

  console.log('URL Parameters:', {
    invoiceNumberFromUrl,
    customerIdFromUrl,
    vehicleDetailsFromUrl,
    gateNumberFromUrl
  });

  // State for current sale and items
  const [currentSale, setCurrentSale] = useState<Sale | null>(null);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [selectedProductType, setSelectedProductType] = useState<"regular" | "non_product">("regular");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemUnitPrice, setItemUnitPrice] = useState<number>(0);
  const [isCreatingSale, setIsCreatingSale] = useState(false);

  // Fetch sale details by invoice number
  const { data: fetchedSale, isLoading: isLoadingSale, isError: isErrorSale } = useQuery<Sale>({
    queryKey: ["/api/sales", invoiceNumberFromUrl],
    queryFn: () => apiRequest("GET", `/api/sales/${invoiceNumberFromUrl}`),
    enabled: !!invoiceNumberFromUrl,
    retry: (failureCount, error: any) => {
        // Only retry if it's not a 404 (Sale not found)
        return error.response && error.response.status !== 404 && failureCount < 3;
    }
  });

  // Mutation to create a new sale if it doesn't exist
  const createSaleMutation = useMutation({
    mutationFn: (data: BackendSalePayload) => {
      return apiRequest("POST", "/api/sales", data);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales", response.invoiceNumber] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setCurrentSale(response);
      setIsCreatingSale(false);
      toast({
        title: "Success",
        description: "New sale created successfully",
      });
    },
    onError: (error: any) => {
      setIsCreatingSale(false);
      toast({
        title: "Error",
        description: error.message || "Failed to create new sale",
        variant: "destructive",
      });
    },
  });

  // Use useEffect to handle fetchedSale data or create new sale if needed
  useEffect(() => {
    console.log('useEffect triggered with:', {
      fetchedSale,
      invoiceNumberFromUrl,
      isLoadingSale,
      currentSale,
      customerIdFromUrl,
      isCreatingSale
    });

    if (fetchedSale) {
      console.log('Setting fetched sale:', fetchedSale);
      setCurrentSale(fetchedSale);
      setSaleItems(fetchedSale.items || []);
    } else if (
      !isCreatingSale && 
      invoiceNumberFromUrl && 
      !isLoadingSale && 
      !fetchedSale && 
      !currentSale && 
      customerIdFromUrl
    ) {
      console.log('Creating new sale with payload');
      setIsCreatingSale(true);
      
      // If no sale found by invoiceNumber, but we have data from URL, create a new sale
      const initialSalePayload: BackendSalePayload = {
        invoice_number: invoiceNumberFromUrl,
        customer_id: parseInt(customerIdFromUrl),
        customer_type: "credit",
        payment_status: "pending",
        subtotal: 0,
        total_amount: 0,
        porterage: 0,
        vat_rate: 0,
        vat_amount: 0,
        vehicle_details: vehicleDetailsFromUrl || null,
        gate_number: gateNumberFromUrl || null,
        notes: null,
        status: "draft",
        items: []
      };
      createSaleMutation.mutate(initialSalePayload);
    } else {
      console.log('Conditions not met for sale creation:', {
        isCreatingSale,
        hasInvoiceNumber: !!invoiceNumberFromUrl,
        isLoadingSale,
        hasFetchedSale: !!fetchedSale,
        hasCurrentSale: !!currentSale,
        hasCustomerId: !!customerIdFromUrl,
      });
    }
  }, [
    fetchedSale, 
    invoiceNumberFromUrl, 
    isLoadingSale, 
    currentSale, 
    customerIdFromUrl, 
    vehicleDetailsFromUrl, 
    gateNumberFromUrl, 
    createSaleMutation,
    isCreatingSale
  ]);

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

  // Mutation to update sale (add/remove items, finalize)
  const updateSaleMutation = useMutation<Sale, Error, BackendSalePayload>({
    mutationFn: (payload) => apiRequest("PUT", `/api/sales/${currentSale?.id}`, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales", data.invoiceNumber] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      toast({
        title: "Success",
        description: "Invoice updated successfully",
      });
      setCurrentSale(data);
      setSaleItems(data.items || []);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update invoice",
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

  const customerName = customers?.find(c => c.id === currentSale?.customerId)?.customer_name || 'N/A';

  const handleProductSelection = (value: string) => {
    setSelectedProductId(value);
    const productId = parseInt(value);
    const isRegular = selectedProductType === "regular";
    const productList = isRegular ? regularProducts : nonProducts;
    const product = productList?.find(p => p.id === productId);

    if (product) {
      setItemUnitPrice(product.sellingPrice / 100);
    } else {
      setItemUnitPrice(0); // Reset if product not found
    }
  };

  const handleAddItem = () => {
    console.log("handleAddItem triggered");
    console.log("Current values:", { selectedProductId, itemQuantity, itemUnitPrice });

    if (!selectedProductId || itemQuantity <= 0 || itemUnitPrice <= 0) {
      toast({
        title: "Validation Error",
        description: "Please select a product, and enter valid quantity and unit price.",
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
      console.log("Product not found for selectedProductId:", selectedProductId);
      return;
    }

    const newItem: SaleItem = {
      productId: isRegular ? product.id : null,
      nonProductId: isRegular ? null : product.id,
      quantity: itemQuantity,
      unitPrice: itemUnitPrice,
      totalPrice: itemQuantity * itemUnitPrice,
      productName: product.description || null,
      // These fields are required by backend but not used in frontend add
      id: 0, // Dummy ID, will be set by backend
      saleId: currentSale?.id || 0, // Dummy sale_id
      createdAt: new Date().toISOString(), // Dummy date
      updatedAt: new Date().toISOString() // Dummy date
    };

    console.log("New item to add:", newItem);
    const updatedItems = [...saleItems, newItem];
    setSaleItems(updatedItems);
    console.log("Sale items after adding:", updatedItems);

    // Update the current sale with the new items and persist to backend
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
    } else {
      console.log("Cannot update sale: currentSale is null.");
      toast({
        title: "Error",
        description: "Cannot update sale: Please refresh the page.",
        variant: "destructive",
      });
    }

    // Reset fields
    setSelectedProductId("");
    setItemQuantity(1);
    setItemUnitPrice(0);
  };

  const handleSaveInvoice = () => {
    if (!currentSale) return;

    const updatedSalePayload: BackendSalePayload = {
      invoice_number: currentSale.invoiceNumber,
      customer_id: currentSale.customerId,
      customer_type: currentSale.customerType,
      payment_status: currentSale.paymentStatus,
      subtotal: saleItems.reduce((sum, item) => sum + item.totalPrice, 0),
      porterage: currentSale.porterage,
      vat_rate: currentSale.vatRate,
      vat_amount: currentSale.vatAmount,
      total_amount: saleItems.reduce((sum, item) => sum + item.totalPrice, 0),
      vehicle_details: currentSale.vehicleDetails,
      gate_number: currentSale.gateNumber,
      notes: currentSale.notes,
      status: "finalized", // Change status to finalized on save
      items: saleItems.map(item => ({
        product_id: item.productId,
        non_product_id: item.nonProductId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
      })), // Ensure correct schema for backend
    };

    updateSaleMutation.mutate(updatedSalePayload);
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

  if (isLoadingSale) {
    return <div className="text-center py-8">Loading invoice...</div>;
  }

  if (!invoiceNumberFromUrl || (!currentSale && !isLoadingSale)) {
    return <div className="text-center py-8">No invoice found. Please go back to sales entry.</div>;
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
                  <span>Date: {new Date(currentSale?.date || '').toLocaleDateString('en-GB')}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Invoice: {currentSale?.invoiceNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Customer type: {currentSale?.customerType}</span>
                  <Badge className="bg-green-600 text-white">{currentSale?.paymentStatus}</Badge>
                </div>
                <div>
                  <span>Customer Name: </span>
                  <span className="font-semibold">{customerName}</span>
                </div>
                {currentSale?.vehicleDetails && (
                  <div>
                    <span>Vehicle Details: </span>
                    <span className="font-semibold">{currentSale?.vehicleDetails}</span>
                  </div>
                )}
                {currentSale?.gateNumber && (
                  <div>
                    <span>Gate Number: </span>
                    <span className="font-semibold">{currentSale?.gateNumber}</span>
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
              <Button variant="outline" size="sm">Print</Button>
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

          {/* Print/Action Icons */}
          <div className="flex justify-center gap-2 mb-6">
            <Button variant="outline" size="sm">🖨️</Button>
            <Button variant="outline" size="sm">🖨️</Button>
            <Button variant="outline" size="sm">📁</Button>
            <Button variant="outline" size="sm">✉️</Button>
            <Button variant="outline" size="sm" className="bg-blue-600 text-white">⚡</Button>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
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
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-center">£{item.unitPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{item.totalPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="destructive" onClick={() => {
                        const updatedItems = saleItems.filter((_, i) => i !== index);
                        setSaleItems(updatedItems);
                        
                        // Update the backend
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
                        
                        toast({title: "Item Removed", description: "Sale item has been removed."});
                      }}>Remove</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {/* New item entry row */}
                <TableRow>
                  <TableCell>
                    <Select
                      value={selectedProductId}
                      onValueChange={handleProductSelection}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedProductType === "regular" ? (
                          regularProducts?.map(product => (
                            <SelectItem key={product.id} value={product.id.toString()}>
                              {product.description}
                            </SelectItem>
                          ))
                        ) : (
                          nonProducts?.map(product => (
                            <SelectItem key={product.id} value={product.id.toString()}>
                              {product.description}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
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
                        console.log("Add button clicked!");
                        handleAddItem();
                      }}
                    >
                      Add
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

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
              <div className="mt-4">
                <Button variant="outline" size="sm" className="w-full" onClick={handleSaveInvoice}>
                  Save Invoice
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
