import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, subDays } from "date-fns";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { RotateCcw, Search, Save, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Customer, RegularProduct, NonProduct } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// Simplified schema for return form
const returnSchema = z.object({
  date: z.string().min(1, "Date is required"),
  customerId: z.number().min(1, "Customer is required"),
  productId: z.number().min(1, "Product is required"),
  productType: z.enum(["regular", "non"]),
  invoiceId: z.number().optional().nullable(),
  invoiceNumber: z.string().optional().nullable(),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.coerce.number().min(0, "Unit price must be positive"),
  remarks: z.string().optional().nullable(),
});

type ReturnFormData = z.infer<typeof returnSchema>;

interface CustomerInvoice {
  id: number;
  invoiceNumber: string;
  date: string;
  totalAmount: number;
  items: Array<{
    id?: number;
    productId: number;
    productType: string;
    description: string;
    quantity: number;
    unitPrice: number;
    price?: number; // Alternative field name
    product_id?: number; // Alternative field name
    product_type?: string; // Alternative field name
  }>;
}

interface CustomerReturn {
  id: number;
  date: string;
  customerName: string;
  productDescription: string;
  invoiceNumber: string | null;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  remarks: string | null;
}

export default function ReturnFromCustomer() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [searchFromDate, setSearchFromDate] = useState<string>(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [customerSearched, setCustomerSearched] = useState(false);
  const [selectedProductType, setSelectedProductType] = useState<"regular" | "non">("regular");
  const [invoicesFetched, setInvoicesFetched] = useState(false);

  const form = useForm<ReturnFormData>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      customerId: 0,
      productId: 0,
      productType: "regular",
      quantity: 1,
      unitPrice: 0,
    },
  });

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiRequest('GET', '/api/customers')
  });

  // Fetch products
  const { data: products = { regularProducts: [], nonProducts: [] } } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiRequest('GET', '/api/products')
  });

  // Fetch customer returns (only after customer is searched)
  const { data: returns = [], refetch: refetchReturns } = useQuery({
    queryKey: ['customer-returns', selectedCustomerId, searchFromDate],
    queryFn: () => {
      if (!selectedCustomerId || !customerSearched) return [];
      return apiRequest('GET', `/api/customer-returns?customerId=${selectedCustomerId}&fromDate=${searchFromDate}`);
    },
    enabled: !!selectedCustomerId && customerSearched
  });

  // Fetch customer invoices (only when "Get Invoices" is clicked)
  const { data: customerInvoices = [], refetch: refetchInvoices } = useQuery({
    queryKey: ['customer-invoices', selectedCustomerId, searchFromDate],
    queryFn: async () => {
      if (!selectedCustomerId) return [];
      const toDate = format(new Date(), "yyyy-MM-dd");
      
      // First get the invoice list
      const invoices = await apiRequest('GET', `/api/customers/${selectedCustomerId}/invoices?fromDate=${searchFromDate}&toDate=${toDate}`);
      
      // Then fetch detailed data for each invoice to get items
      const detailedInvoices = await Promise.all(
        invoices.map(async (invoice: any) => {
          try {
            const details = await apiRequest('GET', `/api/sales/${invoice.id}`);
            return {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              date: invoice.date,
              totalAmount: invoice.totalAmount || details.totalAmount || 0,
              items: details.items || details.saleItems || []
            };
          } catch (error) {
            console.error(`Failed to fetch details for invoice ${invoice.id}:`, error);
            return {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              date: invoice.date,
              totalAmount: invoice.totalAmount || 0,
              items: []
            };
          }
        })
      );
      
      console.log("Detailed invoices with items:", detailedInvoices);
      return detailedInvoices;
    },
    enabled: false // Only fetch when manually triggered
  });

  // Create return mutation
  const createReturnMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/customer-returns', data),
    onSuccess: () => {
      refetchReturns();
      form.reset({
        date: format(new Date(), "yyyy-MM-dd"),
        customerId: parseInt(selectedCustomerId),
        productId: 0,
        productType: selectedProductType,
        quantity: 1,
        unitPrice: 0,
      });
      toast({
        title: "Success",
        description: "Customer return created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer return",
        variant: "destructive",
      });
    }
  });

  // Delete return mutation
  const deleteReturnMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/customer-returns/${id}`),
    onSuccess: () => {
      refetchReturns();
      toast({
        title: "Success",
        description: "Customer return deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer return",
        variant: "destructive",
      });
    }
  });

  // Handle customer search
  const handleCustomerSearch = () => {
    if (!selectedCustomerId) {
      toast({
        title: "Error",
        description: "Please select a customer first",
        variant: "destructive",
      });
      return;
    }
    setCustomerSearched(true);
    form.setValue("customerId", parseInt(selectedCustomerId));
  };

  // Handle get invoices
  const handleGetInvoices = async () => {
    if (!selectedCustomerId) {
      toast({
        title: "Error",
        description: "Please select a customer first",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await refetchInvoices();
      setInvoicesFetched(true);
      toast({
        title: "Success",
        description: "Invoices fetched successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch invoices",
        variant: "destructive",
      });
    }
  };

  // Handle invoice selection
  const handleInvoiceSelect = (invoiceId: string) => {
    if (invoiceId === "none") {
      form.setValue("invoiceId", null);
      form.setValue("invoiceNumber", "");
      return;
    }

    // Check if customerInvoices exists and is an array
    if (!customerInvoices || !Array.isArray(customerInvoices)) {
      console.log("No customer invoices available");
      return;
    }

    const selectedInvoice = customerInvoices.find((inv: CustomerInvoice) => inv.id.toString() === invoiceId);
    if (selectedInvoice) {
      console.log("Selected invoice:", selectedInvoice);
      form.setValue("invoiceId", selectedInvoice.id);
      form.setValue("invoiceNumber", selectedInvoice.invoiceNumber);
      
      // If a product is selected, try to auto-fill quantity and price from invoice
      const productId = form.watch("productId");
      console.log("Current product ID:", productId, "Product type:", selectedProductType);
      
      if (productId > 0 && selectedInvoice.items && Array.isArray(selectedInvoice.items)) {
        console.log("Invoice items:", selectedInvoice.items);
        
        const invoiceItem = selectedInvoice.items.find(item => {
          console.log("Checking item:", item, "against productId:", productId, "productType:", selectedProductType);
          
          // Handle different possible field names from API
          const itemProductId = item.productId || item.product_id;
          
          // Determine product type from the item structure
          let itemProductType = item.productType || item.product_type;
          if (!itemProductType) {
            // If no explicit productType, infer from the data structure
            if (item.productId && !item.nonProductId) {
              itemProductType = "regular";
            } else if (item.nonProductId && !item.productId) {
              itemProductType = "non";
            }
          }
          
          console.log("Resolved item productId:", itemProductId, "productType:", itemProductType);
          return itemProductId === productId && itemProductType === selectedProductType;
        });
        
        if (invoiceItem) {
          console.log("Found matching item:", invoiceItem);
          const quantity = invoiceItem.quantity || 1;
          const unitPrice = invoiceItem.unitPrice || invoiceItem.price || 0;
          
          form.setValue("quantity", quantity);
          form.setValue("unitPrice", unitPrice);
          toast({
            title: "Auto-filled",
            description: `Quantity (${quantity}) and price (£${unitPrice}) auto-filled from invoice`,
          });
        } else {
          console.log("No matching item found in invoice");
          toast({
            title: "Info",
            description: "No matching product found in selected invoice",
          });
        }
      } else {
        console.log("No product selected or no invoice items");
      }
    } else {
      console.log("Invoice not found");
    }
  };

  // Handle product selection
  const handleProductSelect = (productId: string) => {
    form.setValue("productId", parseInt(productId));
    
    // If an invoice is selected, try to auto-fill quantity and price
    const invoiceId = form.watch("invoiceId");
    console.log("Product selected:", productId, "Current invoice ID:", invoiceId);
    
    if (invoiceId && customerInvoices && Array.isArray(customerInvoices)) {
      const selectedInvoice = customerInvoices.find((inv: CustomerInvoice) => inv.id === invoiceId);
      if (selectedInvoice && selectedInvoice.items && Array.isArray(selectedInvoice.items)) {
        console.log("Looking for product in invoice items:", selectedInvoice.items);
        
        const invoiceItem = selectedInvoice.items.find(item => {
          console.log("Checking item:", item, "against productId:", parseInt(productId), "productType:", selectedProductType);
          
          // Handle different possible field names from API
          const itemProductId = item.productId || item.product_id;
          
          // Determine product type from the item structure
          let itemProductType = item.productType || item.product_type;
          if (!itemProductType) {
            // If no explicit productType, infer from the data structure
            if (item.productId && !item.nonProductId) {
              itemProductType = "regular";
            } else if (item.nonProductId && !item.productId) {
              itemProductType = "non";
            }
          }
          
          console.log("Resolved item productId:", itemProductId, "productType:", itemProductType);
          return itemProductId === parseInt(productId) && itemProductType === selectedProductType;
        });
        
        if (invoiceItem) {
          console.log("Found matching item for product:", invoiceItem);
          const quantity = invoiceItem.quantity || 1;
          const unitPrice = invoiceItem.unitPrice || invoiceItem.price || 0;
          
          form.setValue("quantity", quantity);
          form.setValue("unitPrice", unitPrice);
          toast({
            title: "Auto-filled",
            description: `Quantity (${quantity}) and price (£${unitPrice}) auto-filled from invoice`,
          });
        } else {
          console.log("No matching item found for product");
        }
      }
    }
  };

  // Get filtered products based on type
  const filteredProducts = selectedProductType === 'regular' 
    ? (products?.regularProducts || [])
    : (products?.nonProducts || []);

  // Handle form submission
  const onSubmit = (data: ReturnFormData) => {
    const selectedProduct = filteredProducts.find(p => p.id === data.productId);
    
    const returnData = {
      customerId: data.customerId,
      saleId: data.invoiceId,
      productId: data.productId,
      productType: data.productType,
      description: selectedProduct?.description || "",
      invoiceNumber: data.invoiceNumber,
      remarks: data.remarks,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      returnReason: data.remarks,
      creditNoteIssued: false,
      creditNoteAmount: 0,
      status: "completed", // Directly set to completed as per requirement
      date: data.date,
      refNumber: "", // Will be generated by backend
      totalValue: data.quantity * data.unitPrice
    };
    
    createReturnMutation.mutate(returnData);
  };

  const selectedCustomer = customers.find((c: Customer) => c.id.toString() === selectedCustomerId);

  return (
    <PageLayout title="Returns from Customer" breadcrumb="Data Entry > Returns from Customer">
      <div className="space-y-6">
        {/* Step 1: Customer Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw size={20} />
              Step 1: Select Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label>Customer:</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer: Customer) => (
                      <SelectItem key={customer.id} value={customer.id.toString()}>
                        {customer.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Search from date:</Label>
                <Input
                  type="date"
                  value={searchFromDate}
                  onChange={(e) => setSearchFromDate(e.target.value)}
                />
              </div>
              
              <div>
                <Button 
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={handleCustomerSearch}
                  disabled={!selectedCustomerId}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Return Entry Form (shown after customer search) */}
        {customerSearched && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Add New Return</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Product Type:</Label>
                    <Select
                      value={selectedProductType}
                      onValueChange={(value) => {
                        setSelectedProductType(value as "regular" | "non");
                        form.setValue("productType", value as "regular" | "non");
                        form.setValue("productId", 0);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular Product</SelectItem>
                        <SelectItem value="non">Non-Product</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Product:</Label>
                    <Select
                      value={form.watch("productId").toString()}
                      onValueChange={handleProductSelect}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredProducts.map((product: RegularProduct | NonProduct) => (
                          <SelectItem key={product.id} value={product.id.toString()}>
                            {product.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Label>Invoice:</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGetInvoices}
                        disabled={!selectedCustomerId}
                      >
                        Get Invoices
                      </Button>
                    </div>
                    <Select
                      value={form.watch("invoiceId")?.toString() || "none"}
                      onValueChange={handleInvoiceSelect}
                      disabled={!invoicesFetched}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select invoice (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Invoice</SelectItem>
                        {customerInvoices.map((invoice: CustomerInvoice) => (
                          <SelectItem key={invoice.id} value={invoice.id.toString()}>
                            {invoice.invoiceNumber} - {format(new Date(invoice.date), "dd/MM/yyyy")} - £{invoice.totalAmount.toFixed(2)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>Manual Invoice Number:</Label>
                    <Input
                      {...form.register("invoiceNumber")}
                      placeholder="Enter invoice number manually"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Quantity:</Label>
                    <Input
                      type="number"
                      {...form.register("quantity")}
                      min="1"
                    />
                  </div>
                  
                  <div>
                    <Label>Unit Price:</Label>
                    <Input
                      type="number"
                      step="0.01"
                      {...form.register("unitPrice")}
                      min="0"
                    />
                  </div>
                </div>

                <div>
                  <Label>Remarks:</Label>
                  <Textarea
                    {...form.register("remarks")}
                    placeholder="Enter any remarks or return reason"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => form.reset({
                      date: format(new Date(), "yyyy-MM-dd"),
                      customerId: parseInt(selectedCustomerId),
                      productId: 0,
                      productType: selectedProductType,
                      quantity: 1,
                      unitPrice: 0,
                    })}
                  >
                    Reset
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createReturnMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {createReturnMutation.isPending ? "Saving..." : "Save Return"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Customer Returns Table (shown after customer search) */}
        {customerSearched && selectedCustomer && (
          <Card>
            <CardHeader>
              <CardTitle>Step 3: Existing Returns - {selectedCustomer.customer_name}</CardTitle>
            </CardHeader>
            <CardContent>
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
                      <TableHead>Remarks</TableHead>
                      <TableHead className="text-center">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-4">
                          No returns found for this customer
                        </TableCell>
                      </TableRow>
                    ) : (
                      returns.map((returnItem: CustomerReturn) => (
                        <TableRow key={returnItem.id}>
                          <TableCell>{format(new Date(returnItem.date), "dd/MM/yyyy")}</TableCell>
                          <TableCell>{returnItem.productDescription}</TableCell>
                          <TableCell>{returnItem.invoiceNumber || "-"}</TableCell>
                          <TableCell className="text-center">{returnItem.quantity}</TableCell>
                          <TableCell className="text-center">£{returnItem.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-center">£{returnItem.totalValue.toFixed(2)}</TableCell>
                          <TableCell>{returnItem.remarks || "-"}</TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteReturnMutation.mutate(returnItem.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}