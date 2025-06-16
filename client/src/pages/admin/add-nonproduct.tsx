import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toast, ToastTitle, ToastDescription } from "@/components/ui/toast";
import { apiRequest } from "@/lib/queryClient";
import { insertNonProductSchema, NonProduct, InsertNonProduct, nonProductSchema } from "@shared/schema";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const AddNonProducts = () => {
  const { id } = useParams<{ id: string }>();
  const nonProductId = id ? parseInt(id) : undefined;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const form = useForm<InsertNonProduct>({
    resolver: zodResolver(insertNonProductSchema),
    defaultValues: {
      productCode: "",
      sageCode: "",
      description: "",
      sellingPrice: 0,
      taxRate: 0,
      vatCode: "",
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
        const response = await apiRequest("POST", "/api/products/non", newNonProduct);
        console.log('Server response:', response);
        return response;
      } catch (error) {
        console.error('Error in mutation:', error);
        if (error instanceof Error) {
          throw new Error(`Failed to create non-product: ${error.message}`);
        }
        throw new Error('Failed to create non-product: Unknown error');
      }
    },
    onSuccess: (data) => {
      console.log('Mutation successful, response:', data);
      queryClient.invalidateQueries({ queryKey: ["nonProducts"] });
      Toast({
        children: (
          <>
            <ToastTitle>Success!</ToastTitle>
            <ToastDescription>Non-product created successfully.</ToastDescription>
          </>
        ),
      });
      form.reset();
      setLocation("/admin/view-nonproduct");
    },
    onError: (error) => {
      console.error('Error creating non-product:', error);
      Toast({
        variant: "destructive",
        children: (
          <>
            <ToastTitle>Error</ToastTitle>
            <ToastDescription>Failed to create non-product: {error.message}</ToastDescription>
          </>
        ),
      });
    },
  });

  const updateNonProductMutation = useMutation({
    mutationFn: (updatedNonProduct: NonProduct) => {
      console.log('Updating non-product:', updatedNonProduct);
      return apiRequest("PUT", `/api/products/non/${nonProductId}`, updatedNonProduct);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nonProduct", nonProductId] });
      queryClient.invalidateQueries({ queryKey: ["nonProducts"] });
      Toast({
        children: (
          <>
            <ToastTitle>Success!</ToastTitle>
            <ToastDescription>Non-product updated successfully.</ToastDescription>
          </>
        ),
      });
      setLocation("/admin/view-nonproduct");
    },
    onError: (error) => {
      console.error('Error updating non-product:', error);
      Toast({
        variant: "destructive",
        children: (
          <>
            <ToastTitle>Error</ToastTitle>
            <ToastDescription>Failed to update non-product: {error.message}</ToastDescription>
          </>
        ),
      });
    },
  });

  useEffect(() => {
    if (existingNonProduct) {
      console.log('Loading existing non-product:', existingNonProduct);
      form.reset(existingNonProduct);
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
      Toast({
        variant: "destructive",
        children: (
          <>
            <ToastTitle>Error</ToastTitle>
            <ToastDescription>Invalid numeric values for price or tax rate.</ToastDescription>
          </>
        ),
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
                      placeholder="Z1018" 
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
                      placeholder="Z1018" 
                      {...form.register("sageCode")}
                    />
                    {form.formState.errors.sageCode && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.sageCode.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm font-medium mb-2">Product Description</label>
                    <Input 
                      id="description" 
                      placeholder="Enter description" 
                      {...form.register("description")}
                    />
                    {form.formState.errors.description && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.description.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="sellingPrice" className="block text-sm font-medium mb-2">Selling Price</label>
                    <Input 
                      id="sellingPrice" 
                      type="number" 
                      step="0.01" 
                      {...form.register("sellingPrice", { valueAsNumber: true })}
                    />
                    {form.formState.errors.sellingPrice && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.sellingPrice.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="taxRate" className="block text-sm font-medium mb-2">Tax/Vat %</label>
                    <Input 
                      id="taxRate" 
                      type="number" 
                      step="0.01" 
                      {...form.register("taxRate", { valueAsNumber: true })}
                    />
                    {form.formState.errors.taxRate && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.taxRate.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="vatCode" className="block text-sm font-medium mb-2">VAT Code</label>
                    <Input 
                      id="vatCode" 
                      placeholder="VAT Code" 
                      {...form.register("vatCode")}
                    />
                    {form.formState.errors.vatCode && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.vatCode.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="status" className="block text-sm font-medium mb-2">Status</label>
                    <Select 
                      onValueChange={(value) => form.setValue("status", value)} 
                      defaultValue={form.watch("status")}
                    >
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.formState.errors.status && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.status.message}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-center">
                <Button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white px-8"
                  disabled={createNonProductMutation.isPending || updateNonProductMutation.isPending}
                  onClick={() => console.log('Save button clicked')}
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
