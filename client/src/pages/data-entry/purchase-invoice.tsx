import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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

const queryParams = new URLSearchParams(window.location.search);
const purchaseId = queryParams.get("purchaseId");

export default function PurchaseInvoice() {
  const { toast } = useToast();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [items, setItems] = useState<any[]>([]);
  const [remarks, setRemarks] = useState("");
  const [, setLocation] = useLocation();

  // Fetch purchase details
  const { data: purchase, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/purchases", purchaseId],
    queryFn: () => apiRequest("GET", `/api/purchases/${purchaseId}`),
    enabled: !!purchaseId,
    retry: 3,
    retryDelay: 1000, // Retry after 1 second
  });

  // Fetch products
  const { data: productsData } = useQuery({
    queryKey: ["/api/products"],
    queryFn: () => apiRequest("GET", "/api/products"),
  });
  const regularProducts = productsData?.regularProducts || [];
  const nonProducts = productsData?.nonProducts || [];

  // Save invoice mutation
  const createInvoiceMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/purchase-invoices", data),
    onSuccess: (invoice) => {
      toast({
        title: "Success",
        description: "Purchase invoice saved successfully!",
      });
      setLocation(`/data-entry/purchase-invoice?purchaseId=${purchaseId}&invoiceId=${invoice.id}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save purchase invoice",
        variant: "destructive",
      });
    }
  });

  // When product changes, set unit price
  const handleProductChange = (value: string) => {
    setSelectedProductId(value);
    
    // Check if it's a regular product (starts with 'regular-') or non-product
    let product = null;
    
    if (value.startsWith('regular-')) {
      const productId = value.replace('regular-', '');
      product = regularProducts.find((p: any) => String(p.id) === productId);
    } else if (value.startsWith('non-')) {
      const productId = value.replace('non-', '');
      product = nonProducts.find((p: any) => String(p.id) === productId);
    }
    
    if (product) {
      console.log('Selected product:', product);
      console.log('Product sellingPrice:', product.sellingPrice, 'Type:', typeof product.sellingPrice);
      // Convert to number and ensure it's not multiplied incorrectly
      const price = Number(product.sellingPrice);
      console.log('Converted price:', price);
      setUnitPrice(price);
    } else {
      setUnitPrice(0);
    }
  };

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
      totalPrice
    }]);
    setSelectedProductId("");
    setQuantity(1);
    setUnitPrice(0);
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

    // Format purchase date as YYYY-MM-DD for the invoice
    let invoiceDate = undefined;
    if (purchase && purchase.date) {
      const d = new Date(purchase.date);
      invoiceDate = d.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    createInvoiceMutation.mutate({
      purchaseId: purchaseId,
      remarks,
      items,
      date: invoiceDate
    });
  };

  const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <PageLayout title="Purchase Invoice" breadcrumb="Data Entry / Purchase Invoice">
      <div className="space-y-6">
        {/* Purchase Details Card */}
        <Card>
          <CardHeader>
            <CardTitle>Purchase Details</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4">Loading purchase details...</div>
            ) : isError ? (
              <div className="text-center py-4 text-red-500">Error loading purchase details</div>
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
            {/* Remarks */}
            <div>
              <Label htmlFor="remarks">Remarks</Label>
              <Input
                id="remarks"
                placeholder="Enter invoice remarks (optional)"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                className="mt-1"
              />
            </div>

            <Separator />

            {/* Add Product Section */}
            <div>
              <Label className="text-base font-medium">Add Products</Label>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <Label htmlFor="product">Product</Label>
                  <Select value={selectedProductId} onValueChange={handleProductChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select Product" />
                    </SelectTrigger>
                    <SelectContent>
                      {regularProducts.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-sm font-semibold text-gray-500 bg-gray-50">
                            Regular Products
                          </div>
                          {regularProducts.map((p: any) => (
                            <SelectItem key={`regular-${p.id}`} value={`regular-${p.id}`}>
                              {p.description}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {nonProducts.length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-sm font-semibold text-gray-500 bg-gray-50">
                            Non Products
                          </div>
                          {nonProducts.map((p: any) => (
                            <SelectItem key={`non-${p.id}`} value={`non-${p.id}`}>
                              {p.description}
                            </SelectItem>
                          ))}
                        </>
                      )}
                      {regularProducts.length === 0 && nonProducts.length === 0 && (
                        <SelectItem value="no-products" disabled>
                          No products available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
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
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">£{item.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium">£{item.totalPrice.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right font-bold">
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
            <div className="flex justify-end pt-4">
              <Button 
                onClick={handleSaveInvoice}
                disabled={createInvoiceMutation.isPending || items.length === 0}
                className="px-8"
              >
                {createInvoiceMutation.isPending ? "Saving..." : "Save Purchase Invoice"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
