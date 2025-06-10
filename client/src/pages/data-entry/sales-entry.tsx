import { useState } from "react";
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
import { Plus, MoreHorizontal, ChevronDown, ChevronUp } from "lucide-react";

const salesSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  customerName: z.string().min(1, "Customer is required"),
  amount: z.string().min(1, "Amount is required").transform(val => parseFloat(val)),
  vehicleDetails: z.string().optional(),
  gateNumber: z.string().optional(),
});

type SalesFormData = z.infer<typeof salesSchema>;

export default function SalesEntry() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showMoreFields, setShowMoreFields] = useState(false);
  
  const form = useForm<SalesFormData>({
    resolver: zodResolver(salesSchema),
    defaultValues: {
      invoiceNumber: "",
      customerName: "",
      amount: "" as any,
      vehicleDetails: "",
      gateNumber: "",
    },
  });

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["/api/sales"],
  });

  const createSaleMutation = useMutation({
    mutationFn: (data: SalesFormData) => apiRequest("POST", "/api/sales", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Sale entry created successfully",
      });
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create sale entry",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SalesFormData) => {
    createSaleMutation.mutate(data);
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
                <div>
                  <Label htmlFor="invoiceNumber">Invoice Number</Label>
                  <Input
                    id="invoiceNumber"
                    {...form.register("invoiceNumber")}
                    placeholder="Enter invoice number"
                  />
                  {form.formState.errors.invoiceNumber && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.invoiceNumber.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="customerName">Customer</Label>
                  <Select
                    value={form.watch("customerName")}
                    onValueChange={(value) => form.setValue("customerName", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Walk-in Customer">Walk-in Customer</SelectItem>
                      <SelectItem value="ABC Corp">ABC Corp</SelectItem>
                      <SelectItem value="XYZ Ltd">XYZ Ltd</SelectItem>
                      <SelectItem value="John Doe">John Doe</SelectItem>
                      <SelectItem value="Jane Smith">Jane Smith</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.formState.errors.customerName && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.customerName.message}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="amount">Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    {...form.register("amount")}
                    placeholder="Enter amount"
                  />
                  {form.formState.errors.amount && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.amount.message}
                    </p>
                  )}
                </div>
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
                  <div className="flex gap-2 mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        form.setValue("vehicleDetails", "");
                        form.setValue("gateNumber", "");
                        toast({
                          title: "Fields Saved",
                          description: "Additional fields have been saved",
                        });
                      }}
                    >
                      Save Additional Fields
                    </Button>
                  </div>
                </div>
              )}
              <Button 
                type="submit" 
                disabled={createSaleMutation.isPending}
                className="w-full md:w-auto"
              >
                {createSaleMutation.isPending ? "Creating..." : "Create Sale Entry"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sales List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[80px]">ID</TableHead>
                      <TableHead className="min-w-[150px]">Customer Name</TableHead>
                      <TableHead className="min-w-[100px]">Amount</TableHead>
                      <TableHead className="min-w-[100px]">Date</TableHead>
                      <TableHead className="min-w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.isArray(sales) && sales.length > 0 ? (
                      sales.map((sale: any) => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-medium">#{sale.id}</TableCell>
                          <TableCell>{sale.customerName}</TableCell>
                          <TableCell className="font-medium text-green-600">
                            ${parseFloat(sale.amount).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {new Date(sale.date).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant="default" className="bg-green-100 text-green-800">
                              {sale.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                          No sales found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
