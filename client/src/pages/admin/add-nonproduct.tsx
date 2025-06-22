import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertNonProductSchema, NonProduct, InsertNonProduct, nonProductSchema } from "@shared/schema";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const AddNonProducts = () => {
  const { id } = useParams<{ id: string }>();
  const nonProductId = id ? parseInt(id) : undefined;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<InsertNonProduct>({
    resolver: zodResolver(insertNonProductSchema),
    defaultValues: {
      productCode: "",
      sageCode: "",
      description: "",
      sellingPrice: 0,
      taxRate: 0,
      vatCode: "",
      unitOfPurchase: "",
      unitOfSale: "",
      location: "",
      nominalCode: "",
      stockCategory: "",
      departmentNumber: "",
      supplierRef: "",
      supplierPartNumber: "",
      reorderLevel: 0,
      stockLevelFlag: false,
      commodityCode: "",
      unitWeight: 0,
      stockTakeDate: null,
      reorderQuantity: 0,
      lastStockTake: 0,
      initialStock: 0,
      status: "active",
    },
    mode: "onChange",
  });

  const { data: existingNonProduct, isLoading, isError, error } = useQuery({
    queryKey: ["nonProduct", nonProductId],
    queryFn: () => apiRequest("GET", `/api/products/non/${nonProductId}`),
    enabled: !!nonProductId,
  });

  const createNonProductMutation = useMutation({
    mutationFn: async (newNonProduct: InsertNonProduct) => {
      console.log('Creating non-product with data:', newNonProduct);
      try {
        // Convert date to YYYY-MM-DD format if it exists
        const dataToSend = {
          ...newNonProduct,
          stockTakeDate: newNonProduct.stockTakeDate 
            ? newNonProduct.stockTakeDate.toISOString().split('T')[0]  // Get only the date part
            : null
        };
        console.log('Data being sent to server:', dataToSend);
        const response = await apiRequest("POST", "/api/products/non", dataToSend);
        console.log('Server response:', response);
        return response;
      } catch (error) {
        console.error('Error in mutation:', error);
        if (error instanceof Error) {
          // Log the full error details
          console.error('Full error details:', {
            message: error.message,
            name: error.name,
            stack: error.stack
          });
          throw new Error(`Failed to create non-product: ${error.message}`);
        }
        throw new Error('Failed to create non-product: Unknown error');
      }
    },
    onSuccess: (data) => {
      console.log('Mutation successful, response:', data);
      queryClient.invalidateQueries({ queryKey: ["nonProducts"] });
      toast({
        title: "Success!",
        description: "Non-product created successfully.",
      });
      form.reset();
      // Use setTimeout to ensure the toast is shown before navigation
      setTimeout(() => {
        setLocation("/admin/view-nonproduct");
      }, 100);
    },
    onError: (error) => {
      console.error('Error creating non-product:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to create non-product: ${error.message}`,
      });
    },
  });

  const updateNonProductMutation = useMutation({
    mutationFn: (updatedNonProduct: NonProduct) => {
      console.log('Updating non-product:', updatedNonProduct);
      // Convert date to ISO string if it exists
      const dataToSend = {
        ...updatedNonProduct,
        stockTakeDate: updatedNonProduct.stockTakeDate ? new Date(updatedNonProduct.stockTakeDate).toISOString() : null
      };
      return apiRequest("PUT", `/api/products/non/${nonProductId}`, dataToSend);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nonProduct", nonProductId] });
      queryClient.invalidateQueries({ queryKey: ["nonProducts"] });
      toast({
        title: "Success!",
        description: "Non-product updated successfully.",
      });
      setLocation("/admin/view-nonproduct");
    },
    onError: (error) => {
      console.error('Error updating non-product:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to update non-product: ${error.message}`,
      });
    },
  });

  useEffect(() => {
    if (existingNonProduct) {
      console.log('Loading existing non-product:', existingNonProduct);
      // Convert string date to Date object if it exists
      const data = {
        ...existingNonProduct,
        stockTakeDate: existingNonProduct.stockTakeDate ? new Date(existingNonProduct.stockTakeDate) : null
      };
      form.reset(data);
    }
  }, [existingNonProduct, form]);

  // Add form state logging
  useEffect(() => {
    const subscription = form.watch((value) => {
      console.log('Form values changed:', value);
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const onSubmit = (data: InsertNonProduct) => {
    console.log('Form submitted with data:', data);
    console.log('Form is valid:', form.formState.isValid);
    console.log('Form errors:', form.formState.errors);
    
    // Validate numeric fields
    const sellingPrice = Number(data.sellingPrice);
    const taxRate = Number(data.taxRate);
    
    if (isNaN(sellingPrice) || isNaN(taxRate)) {
      console.error('Invalid numeric values:', { sellingPrice, taxRate });
      toast({
        variant: "destructive",
        title: "Error",
        description: "Invalid numeric values for price or tax rate.",
      });
      return;
    }

    // Convert numeric fields to numbers and ensure they're not negative
    const formData = {
      ...data,
      sellingPrice: Math.max(0, sellingPrice),
      taxRate: Math.max(0, taxRate)
    };
    
    console.log('Processed form data:', formData);
    console.log('Form validation state:', form.formState);
    console.log('Form errors:', form.formState.errors);

    if (nonProductId) {
      console.log('Updating existing non-product:', nonProductId);
      updateNonProductMutation.mutate({ ...formData, id: nonProductId } as NonProduct);
    } else {
      console.log('Creating new non-product');
      createNonProductMutation.mutate(formData);
    }
  };

  const formTitle = nonProductId ? "Edit NonProduct" : "Add NonProduct";
  const buttonText = nonProductId ? (updateNonProductMutation.isPending ? "Updating..." : "Update") : (createNonProductMutation.isPending ? "Saving..." : "Save");

  if (isLoading && nonProductId) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading non-product details...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-500">Error loading non-product: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Non Products</h1>
            <p className="text-sm text-gray-500">{formTitle}</p>
          </div>
          <div className="flex space-x-2">
            <Link href="/admin/products-database">
              <Button variant="outline" className="bg-blue-600 text-white hover:bg-blue-700">
                View Products
              </Button>
            </Link>
            <Link href="/admin/products-database">
              <Button variant="outline" className="bg-blue-600 text-white hover:bg-blue-700">
                Add Products
              </Button>
            </Link>
            <Link href="/admin/view-nonproduct">
              <Button variant="outline" className="bg-blue-600 text-white hover:bg-blue-700">
                View NonProducts
              </Button>
            </Link>
            <Link href="/admin/add-nonproduct">
              <Button className="bg-blue-600 text-white hover:bg-blue-700">
                Add NonProducts
              </Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-blue-600">{formTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="productCode" className="block text-sm font-medium mb-2">Product Code</label>
                    <Input 
                      id="productCode" 
                      placeholder="Enter product code" 
                      {...form.register("productCode")}
                      disabled={!!nonProductId}
                    />
                    {form.formState.errors.productCode && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.productCode.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="sageCode" className="block text-sm font-medium mb-2">Sage Code</label>
                    <Input 
                      id="sageCode" 
                      placeholder="Enter sage code" 
                      {...form.register("sageCode")}
                    />
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm font-medium mb-2">Product Description</label>
                    <div className="space-y-2">
                      <Input 
                        id="description" 
                        placeholder="Enter description" 
                        {...form.register("description")}
                      />
                      <Select 
                        onValueChange={(value) => form.setValue("description", value)}
                        defaultValue={form.watch("description")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select from existing descriptions" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Service">Service</SelectItem>
                          <SelectItem value="Consultation">Consultation</SelectItem>
                          <SelectItem value="Maintenance">Maintenance</SelectItem>
                          <SelectItem value="Installation">Installation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="sellingPrice" className="block text-sm font-medium mb-2">Selling Price</label>
                    <Input 
                      id="sellingPrice" 
                      type="number" 
                      step="0.01" 
                      {...form.register("sellingPrice", { valueAsNumber: true })}
                    />
                  </div>

                  <div>
                    <label htmlFor="taxRate" className="block text-sm font-medium mb-2">Tax/VAT %</label>
                    <Input 
                      id="taxRate" 
                      type="number" 
                      step="0.01" 
                      {...form.register("taxRate", { valueAsNumber: true })}
                    />
                  </div>

                  <div>
                    <label htmlFor="vatCode" className="block text-sm font-medium mb-2">VAT Code</label>
                    <Input 
                      id="vatCode" 
                      placeholder="Enter VAT code" 
                      {...form.register("vatCode")}
                    />
                  </div>

                  <div>
                    <label htmlFor="unitOfPurchase" className="block text-sm font-medium mb-2">Unit of Purchase</label>
                    <Input 
                      id="unitOfPurchase" 
                      placeholder="Enter unit of purchase" 
                      {...form.register("unitOfPurchase")}
                    />
                  </div>

                  <div>
                    <label htmlFor="unitOfSale" className="block text-sm font-medium mb-2">Unit of Sale</label>
                    <Input 
                      id="unitOfSale" 
                      placeholder="Enter unit of sale" 
                      {...form.register("unitOfSale")}
                    />
                  </div>

                  <div>
                    <label htmlFor="location" className="block text-sm font-medium mb-2">Location</label>
                    <Input 
                      id="location" 
                      placeholder="Enter location" 
                      {...form.register("location")}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="nominalCode" className="block text-sm font-medium mb-2">Nominal Code</label>
                    <Input 
                      id="nominalCode" 
                      placeholder="Enter nominal code" 
                      {...form.register("nominalCode")}
                    />
                  </div>

                  <div>
                    <label htmlFor="stockCategory" className="block text-sm font-medium mb-2">Stock Category Number</label>
                    <Input 
                      id="stockCategory" 
                      placeholder="Enter stock category" 
                      {...form.register("stockCategory")}
                    />
                  </div>

                  <div>
                    <label htmlFor="departmentNumber" className="block text-sm font-medium mb-2">Department Number</label>
                    <Input 
                      id="departmentNumber" 
                      placeholder="Enter department number" 
                      {...form.register("departmentNumber")}
                    />
                  </div>

                  <div>
                    <label htmlFor="supplierRef" className="block text-sm font-medium mb-2">Supplier Ref</label>
                    <Input 
                      id="supplierRef" 
                      placeholder="Enter supplier reference" 
                      {...form.register("supplierRef")}
                    />
                  </div>

                  <div>
                    <label htmlFor="supplierPartNumber" className="block text-sm font-medium mb-2">Supplier Part Number</label>
                    <Input 
                      id="supplierPartNumber" 
                      placeholder="Enter supplier part number" 
                      {...form.register("supplierPartNumber")}
                    />
                  </div>

                  <div>
                    <label htmlFor="reorderLevel" className="block text-sm font-medium mb-2">Reorder Level</label>
                    <Input 
                      id="reorderLevel" 
                      type="number" 
                      {...form.register("reorderLevel", { valueAsNumber: true })}
                    />
                  </div>

                  <div>
                    <label htmlFor="stockLevelFlag" className="block text-sm font-medium mb-2">Ignore Stock Level Flag</label>
                    <Select 
                      onValueChange={(value) => form.setValue("stockLevelFlag", value === "true")}
                      defaultValue={form.watch("stockLevelFlag") ? "true" : "false"}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label htmlFor="commodityCode" className="block text-sm font-medium mb-2">Commodity Code</label>
                    <Input 
                      id="commodityCode" 
                      placeholder="Enter commodity code" 
                      {...form.register("commodityCode")}
                    />
                  </div>

                  <div>
                    <label htmlFor="unitWeight" className="block text-sm font-medium mb-2">Unit Weight</label>
                    <Input 
                      id="unitWeight" 
                      type="number" 
                      step="0.01" 
                      {...form.register("unitWeight", { valueAsNumber: true })}
                    />
                  </div>

                  <div>
                    <label htmlFor="stockTakeDate" className="block text-sm font-medium mb-2">Stock Take Date</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !form.watch("stockTakeDate") && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {form.watch("stockTakeDate") ? (
                            format(form.watch("stockTakeDate") as Date, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={form.watch("stockTakeDate") || undefined}
                          onSelect={(date) => form.setValue("stockTakeDate", date || null)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <label htmlFor="reorderQuantity" className="block text-sm font-medium mb-2">Reorder Quantity</label>
                    <Input 
                      id="reorderQuantity" 
                      type="number" 
                      {...form.register("reorderQuantity", { valueAsNumber: true })}
                    />
                  </div>

                  <div>
                    <label htmlFor="lastStockTake" className="block text-sm font-medium mb-2">Qty Last Stock Take</label>
                    <Input 
                      id="lastStockTake" 
                      type="number" 
                      {...form.register("lastStockTake", { valueAsNumber: true })}
                    />
                  </div>

                  <div>
                    <label htmlFor="initialStock" className="block text-sm font-medium mb-2">Initial Stock</label>
                    <Input 
                      id="initialStock" 
                      type="number" 
                      min="0"
                      placeholder="0"
                      {...form.register("initialStock", { valueAsNumber: true })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white px-8"
                  disabled={createNonProductMutation.isPending || updateNonProductMutation.isPending}
                >
                  {buttonText}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AddNonProducts;
