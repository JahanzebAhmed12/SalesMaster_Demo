import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Plus, MoreHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "wouter";
import type { Customer } from "@shared/schema";

const salesSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  vehicleDetails: z.string().optional(),
  gateNumber: z.string().optional(),
});

type SalesFormData = z.infer<typeof salesSchema>;

export default function SalesEntry() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showMoreFields, setShowMoreFields] = useState(false);
  
  const form = useForm<SalesFormData>({
    resolver: zodResolver(salesSchema),
    defaultValues: {
      customerId: "",
      vehicleDetails: "",
      gateNumber: "",
    },
  });

  const { data: customers, isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  const onSubmit = (data: SalesFormData) => {
    const queryParams = new URLSearchParams();
    queryParams.append("customerId", data.customerId);
    if (data.vehicleDetails) queryParams.append("vehicleDetails", data.vehicleDetails);
    if (data.gateNumber) queryParams.append("gateNumber", data.gateNumber);
    setLocation(`/data-entry/sales-invoice?${queryParams.toString()}`);
  };

  return (
    <PageLayout title="Sales Entry" breadcrumb="Sales Entry">
      <div className="space-y-6">
        {/* Form Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus size={20} />
              New Sale Entry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div></div>
                <div>
                  <Label htmlFor="customerId">Customer</Label>
                  <Select
                    value={form.watch("customerId")}
                    onValueChange={(value) => form.setValue("customerId", value)}
                    disabled={isLoadingCustomers}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingCustomers ? (
                        <SelectItem value="disabled" disabled>Loading customers...</SelectItem>
                      ) : customers && customers.length > 0 ? (
                        customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id.toString()}>
                            {customer.customer_name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="disabled" disabled>No customers found</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.customerId && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.customerId.message}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div></div> {/* Empty div to align layout */}
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowMoreFields(!showMoreFields)}
                    className="flex items-center gap-2"
                  >
                    <MoreHorizontal size={16} />
                    More
                    {showMoreFields ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </Button>
                </div>
              </div>

              {showMoreFields && (
                <div className="border-t pt-4 mt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="vehicleDetails">Vehicle Details</Label>
                      <Input
                        id="vehicleDetails"
                        {...form.register("vehicleDetails")}
                        placeholder="Enter vehicle details"
                      />
                    </div>
                    <div>
                      <Label htmlFor="gateNumber">Gate Number</Label>
                      <Input
                        id="gateNumber"
                        {...form.register("gateNumber")}
                        placeholder="Enter gate number"
                      />
                    </div>
                  </div>
                </div>
              )}
              <Button 
                type="submit" 
                className="w-full md:w-auto"
              >
                Create Sale Entry
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sales List is removed from here as per the new workflow */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">Sales data will be displayed on the Sales Invoice page after creation.</div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
