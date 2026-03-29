import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import PageLayout from "@/components/common/page-layout";
import BusinessDateDisplay from "@/components/common/business-date-display";
import SupplierSearch from "@/components/ui/supplier-search";
import { useSupplierSearch } from "@/hooks/useSupplierSearch";
import { Plus } from "lucide-react";
import { useLocation } from "wouter";
import { useBusinessDate } from "@/hooks/use-business-date";

const purchaseSchema = z.object({
  invoiceDate: z.string().min(1, "Invoice date is required"),
  supplierId: z.string().min(1, "Supplier is required"),
  deliveryNo: z.string().optional(),
  supplierInvoice: z.string().optional(),
  awb: z.string().optional(),
  remarks: z.string().optional(),
});

type PurchaseFormData = z.infer<typeof purchaseSchema>;

export default function PurchaseEntry() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { currentDate: businessDate } = useBusinessDate();
  const { selectedSupplier, handleSupplierSelect, supplierId } = useSupplierSearch();
  
  const form = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      invoiceDate: businessDate || new Date().toISOString().split('T')[0],
      deliveryNo: "",
      supplierInvoice: "",
      awb: "",
      remarks: "",
      supplierId: "",
    },
  });

  // Update supplierId in form when supplier is selected
  useEffect(() => {
    if (supplierId) {
      form.setValue("supplierId", supplierId.toString());
    }
  }, [supplierId, form]);

  // Sync invoice date to business date once it loads
  useEffect(() => {
    if (businessDate) {
      form.setValue("invoiceDate", businessDate);
    }
  }, [businessDate, form]);

  // Fetch suppliers from backend (not needed anymore but keeping for compatibility)
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["/api/purchases"],
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      
      // Add the newly created purchase to the cache for immediate access
      queryClient.setQueryData(["/api/purchases", purchase.id.toString()], purchase);
      
      toast({
        title: "Success",
        description: "Purchase entry created successfully",
      });
      form.reset();
      
      // Add a small delay to ensure the cache is set before navigation
      setTimeout(() => {
        setLocation(`/data-entry/purchase-invoice?purchaseId=${purchase.id}`);
      }, 100);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create purchase entry",
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
        {/* Business Date Display */}
        <BusinessDateDisplay />
        
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
                  <SupplierSearch
                    placeholder="Search supplier by code or name..."
                    onSupplierSelect={(supplier) => {
                      handleSupplierSelect(supplier);
                      if (supplier) {
                        form.setValue("supplierId", supplier.id.toString());
                      } else {
                        form.setValue("supplierId", "");
                      }
                    }}
                    required
                    showCode
                    allowClear
                  />
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
        
      </div>
    </PageLayout>
  );
}