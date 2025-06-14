import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, useLocation, useParams } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { apiRequest } from "@/lib/queryClient";
import { insertNonProductSchema, NonProduct, InsertNonProduct, nonProductSchema } from "@/shared/schema";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const AddNonProducts = () => {
  const { id } = useParams<{ id: string }>();
  const nonProductId = id ? parseInt(id) : undefined;
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const form = useForm<NonProduct>({
    resolver: zodResolver(nonProductSchema),
    defaultValues: {
      productCode: "",
      sageCode: "",
      description: "",
      sellingPrice: 0,
      taxRate: 0,
      vatCode: "",
      status: "active",
    },
  });

  const { data: existingNonProduct, isLoading, isError, error } = useQuery<NonProduct>({
    queryKey: ["nonProduct", nonProductId],
    queryFn: () => apiRequest<NonProduct>(`/api/products/non/${nonProductId}`, "GET"),
    enabled: !!nonProductId,
  });

  const createNonProductMutation = useMutation<NonProduct, Error, InsertNonProduct>({
    mutationFn: (newNonProduct) => apiRequest<NonProduct>("/api/products/non", "POST", newNonProduct),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nonProducts"] });
      toast({
        title: "Success!",
        description: "Non-product created successfully.",
      });
      form.reset();
      setLocation("/admin/view-nonproduct");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create non-product: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateNonProductMutation = useMutation<NonProduct, Error, NonProduct>({
    mutationFn: (updatedNonProduct) => apiRequest<NonProduct>(`/api/products/non/${nonProductId}`, "PUT", updatedNonProduct),
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
      toast({
        title: "Error",
        description: `Failed to update non-product: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (existingNonProduct) {
      form.reset(existingNonProduct);
    }
  }, [existingNonProduct, form]);

  const onSubmit = (data: NonProduct) => {
    if (nonProductId) {
      updateNonProductMutation.mutate(data);
    } else {
      createNonProductMutation.mutate(data);
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
                    <Input id="productCode" placeholder="Z1018" {...form.register("productCode")} />
                    {form.formState.errors.productCode && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.productCode.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="sageCode" className="block text-sm font-medium mb-2">Sage Code</label>
                    <Input id="sageCode" placeholder="Z1018" {...form.register("sageCode")} />
                    {form.formState.errors.sageCode && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.sageCode.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm font-medium mb-2">Product Description</label>
                    <Input id="description" placeholder="Enter description" {...form.register("description")} />
                    {form.formState.errors.description && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.description.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="sellingPrice" className="block text-sm font-medium mb-2">Selling Price</label>
                    <Input id="sellingPrice" type="number" step="0.01" {...form.register("sellingPrice", { valueAsNumber: true })} />
                    {form.formState.errors.sellingPrice && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.sellingPrice.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="taxRate" className="block text-sm font-medium mb-2">Tax/Vat %</label>
                    <Input id="taxRate" type="number" step="0.01" {...form.register("taxRate", { valueAsNumber: true })} />
                    {form.formState.errors.taxRate && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.taxRate.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="vatCode" className="block text-sm font-medium mb-2">VAT Code</label>
                    <Input id="vatCode" placeholder="VAT Code" {...form.register("vatCode")} />
                    {form.formState.errors.vatCode && (
                      <p className="text-red-500 text-xs mt-1">{form.formState.errors.vatCode.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium mb-2">Status</label>
                    <Select onValueChange={(value) => form.setValue("status", value)} defaultValue={form.watch("status")}>
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
