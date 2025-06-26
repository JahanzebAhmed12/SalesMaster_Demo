import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PageLayout from "@/components/common/page-layout";
import { Plus } from "lucide-react";
import { useLocation } from "wouter";

const purchaseSchema = z.object({
  invoiceDate: z.string().min(1, "Invoice date is required"),
  deliveryNo: z.string().min(1, "Delivery number is required"),
  supplierInvoice: z.string().min(1, "Supplier invoice is required"),
  awb: z.string().min(1, "AWB is required"),
  remarks: z.string().optional(),
  supplierId: z.string().min(1, "Supplier is required"),
});

type PurchaseFormData = z.infer<typeof purchaseSchema>;

export default function PurchaseEntry() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [shouldRefetch, setShouldRefetch] = useState(false);
  
  const form = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      invoiceDate: "", // Will be set after fetching business date
      deliveryNo: "",
      supplierInvoice: "",
      awb: "",
      remarks: "",
      supplierId: "",
    },
  });

  // Fetch business date from backend and set as default invoiceDate
  useEffect(() => {
    apiRequest("GET", "/api/business-date").then((res) => {
      if (res.businessDate && !form.getValues("invoiceDate")) {
        form.setValue("invoiceDate", res.businessDate);
      }
    });
    // eslint-disable-next-line
  }, []);

  // Fetch suppliers from backend
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Query for fetching purchases
  const { data: purchases, refetch, isLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => apiRequest('GET', '/api/purchases')
  });

  // Effect for handling refetching
  useEffect(() => {
    if (shouldRefetch) {
      refetch().then(() => {
        setShouldRefetch(false);
      }).catch((error) => {
        toast({
          title: "Error",
          description: "Failed to refresh purchase data",
          variant: "destructive",
        });
      });
    }
  }, [shouldRefetch, refetch, toast]);

  // Mutation for creating purchase
  const createPurchaseMutation = useMutation({
    mutationFn: (data: PurchaseFormData) => {
      // Convert supplierId to integer and add default amount
      const purchaseData = {
        ...data,
        supplierId: parseInt(data.supplierId),
        amount: 0 // Default amount, will be calculated from invoice items
      };
      return apiRequest("POST", "/api/purchases", purchaseData);
    },
    onSuccess: (purchase) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard/stats'] });
      
      toast({
        title: "Success",
        description: "Purchase entry created successfully",
      });
      form.reset();
      navigate(`/data-entry/purchase-invoice?purchaseId=${purchase.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create purchase",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PurchaseFormData) => {
    createPurchaseMutation.mutate(data);
  };

  return (
    <PageLayout title="Purchase Entry" breadcrumb="Purchase Entry">
      <div className="space-y-6">
        {/* Form Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus size={20} />
              New Purchase Entry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="invoiceDate">Invoice Date</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    {...form.register("invoiceDate")}
                  />
                  {form.formState.errors.invoiceDate && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.invoiceDate.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="deliveryNo">Delivery No</Label>
                  <Input
                    id="deliveryNo"
                    {...form.register("deliveryNo")}
                    placeholder="Enter delivery number"
                  />
                  {form.formState.errors.deliveryNo && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.deliveryNo.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="supplierInvoice">Supplier Invoice</Label>
                  <Input
                    id="supplierInvoice"
                    {...form.register("supplierInvoice")}
                    placeholder="Enter supplier invoice"
                  />
                  {form.formState.errors.supplierInvoice && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.supplierInvoice.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="awb">AWB</Label>
                  <Input
                    id="awb"
                    {...form.register("awb")}
                    placeholder="Enter AWB number"
                  />
                  {form.formState.errors.awb && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.awb.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="remarks">Remarks</Label>
                  <Input
                    id="remarks"
                    {...form.register("remarks")}
                    placeholder="Enter remarks (optional)"
                  />
                </div>
                <div>
                  <Label htmlFor="supplierId">Supplier</Label>
                  <Select
                    value={form.watch("supplierId")}
                    onValueChange={(value) => form.setValue("supplierId", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliersLoading ? (
                        <SelectItem value="loading" disabled>Loading suppliers...</SelectItem>
                      ) : suppliers.length === 0 ? (
                        <SelectItem value="no-suppliers" disabled>No suppliers available</SelectItem>
                      ) : (
                        suppliers.map((supplier: any) => (
                          <SelectItem key={supplier.id} value={String(supplier.id)}>
                            {supplier.supplier_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.supplierId && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.supplierId.message}
                    </p>
                  )}
                </div>
              </div>
              <Button 
                type="submit" 
                disabled={createPurchaseMutation.isPending}
                className="w-full md:w-auto"
              >
                {createPurchaseMutation.isPending ? "Creating..." : "Create Purchase Entry"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Purchase List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.isArray(purchases) && purchases.length > 0 ? (
                    purchases.map((purchase: any) => (
                      <TableRow key={purchase.id}>
                        <TableCell className="font-medium">#{purchase.id}</TableCell>
                        <TableCell>{purchase.supplierName}</TableCell>
                        <TableCell className="font-medium text-orange-600">
                          ${parseFloat(purchase.amount).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {new Date(purchase.date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                            {purchase.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                        No purchases found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}