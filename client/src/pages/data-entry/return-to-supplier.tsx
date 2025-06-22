import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  RotateCcw, 
  FileText, 
  Download, 
  Copy, 
  Printer, 
  Search, 
  Save, 
  Info, 
  CalendarIcon,
  Plus,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { SupplierReturn, Supplier, RegularProduct, NonProduct } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Form validation schema
const supplierReturnSchema = z.object({
  date: z.string().min(1, "Date is required"),
  supplierId: z.number().min(1, "Supplier is required"),
  purchaseInvoiceId: z.number().optional(),
  productId: z.number().min(1, "Product is required"),
  productType: z.enum(["regular", "non"]),
  description: z.string().min(1, "Description is required"),
  invoiceNumber: z.string().optional(),
  remarks: z.string().optional(),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.number().min(0, "Unit price must be non-negative"),
  returnReason: z.string().optional(),
  creditNoteIssued: z.boolean().default(false),
  creditNoteAmount: z.number().min(0, "Credit note amount must be non-negative"),
  status: z.enum(["pending", "approved", "rejected", "completed"]).default("pending")
});

type SupplierReturnFormData = z.infer<typeof supplierReturnSchema>;

// API functions
const fetchSupplierReturns = async (params: {
  fromDate?: string;
  toDate?: string;
  supplierId?: number;
  search?: string;
  status?: string;
}): Promise<SupplierReturn[]> => {
  const searchParams = new URLSearchParams();
  if (params.fromDate) searchParams.append('fromDate', params.fromDate);
  if (params.toDate) searchParams.append('toDate', params.toDate);
  if (params.supplierId) searchParams.append('supplierId', params.supplierId.toString());
  if (params.search) searchParams.append('search', params.search);
  if (params.status) searchParams.append('status', params.status);
  return apiRequest('GET', `/api/supplier-returns?${searchParams}`);
};

const fetchSuppliers = async (): Promise<Supplier[]> => {
  return apiRequest('GET', '/api/suppliers');
};

const fetchProducts = async (): Promise<{ regularProducts: RegularProduct[]; nonProducts: NonProduct[] }> => {
  return apiRequest('GET', '/api/products');
};

const fetchPurchaseInvoices = async (supplierId: number, fromDate: string, toDate: string): Promise<any[]> => {
  return apiRequest('GET', `/api/suppliers/${supplierId}/outstanding_invoices?fromDate=${fromDate}&toDate=${toDate}`);
};

const createSupplierReturn = async (data: SupplierReturnFormData): Promise<SupplierReturn> => {
  return apiRequest('POST', '/api/supplier-returns', data);
};

const updateSupplierReturn = async ({ id, data }: { id: number; data: SupplierReturnFormData }): Promise<SupplierReturn> => {
  return apiRequest('PUT', `/api/supplier-returns/${id}`, data);
};

const deleteSupplierReturn = async (id: number): Promise<void> => {
  return apiRequest('DELETE', `/api/supplier-returns/${id}`);
};

const approveSupplierReturn = async (id: number): Promise<SupplierReturn> => {
  return apiRequest('POST', `/api/supplier-returns/${id}/approve`);
};

const rejectSupplierReturn = async (id: number): Promise<SupplierReturn> => {
  return apiRequest('POST', `/api/supplier-returns/${id}/reject`, { rejectionReason: 'Return rejected' });
};

const completeSupplierReturn = async (id: number): Promise<SupplierReturn> => {
  return apiRequest('POST', `/api/supplier-returns/${id}/complete`);
};

export default function ReturnToSupplier() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State
  const [selectedSupplier, setSelectedSupplier] = useState<number | undefined>();
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReturn, setEditingReturn] = useState<SupplierReturn | null>(null);
  const [invoiceFromDate, setInvoiceFromDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [invoiceToDate, setInvoiceToDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Form
  const form = useForm<SupplierReturnFormData>({
    resolver: zodResolver(supplierReturnSchema),
    defaultValues: {
      date: format(new Date(), 'yyyy-MM-dd'),
      productType: 'regular',
      quantity: 1,
      unitPrice: 0,
      creditNoteIssued: false,
      creditNoteAmount: 0,
      status: 'pending'
    }
  });

  // Queries
  const { data: supplierReturns = [], isLoading } = useQuery({
    queryKey: ['supplier-returns', { selectedSupplier, fromDate, toDate, searchTerm, statusFilter }],
    queryFn: () => fetchSupplierReturns({
      supplierId: selectedSupplier,
      fromDate: fromDate?.toISOString().split('T')[0],
      toDate: toDate?.toISOString().split('T')[0],
      search: searchTerm,
      status: statusFilter !== 'all' ? statusFilter : undefined
    })
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers
  });

  const { data: products = { regularProducts: [], nonProducts: [] } } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts
  });

  const { data: purchaseInvoices = [] } = useQuery({
    queryKey: ['purchase-invoices', form.watch('supplierId'), invoiceFromDate, invoiceToDate],
    queryFn: () => {
      const supplierId = form.watch('supplierId');
      if (supplierId && supplierId > 0) {
        return fetchPurchaseInvoices(supplierId, invoiceFromDate, invoiceToDate);
      }
      return Promise.resolve([]);
    },
    enabled: !!form.watch('supplierId') && form.watch('supplierId') > 0
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createSupplierReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] });
      toast({ title: "Success", description: "Supplier return created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: updateSupplierReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] });
      toast({ title: "Success", description: "Supplier return updated successfully" });
      setIsDialogOpen(false);
      setEditingReturn(null);
      form.reset();
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplierReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] });
      toast({ title: "Success", description: "Supplier return deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const approveMutation = useMutation({
    mutationFn: approveSupplierReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] });
      toast({ title: "Success", description: "Supplier return approved successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: rejectSupplierReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] });
      toast({ title: "Success", description: "Supplier return rejected successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const completeMutation = useMutation({
    mutationFn: completeSupplierReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] });
      toast({ title: "Success", description: "Supplier return completed successfully" });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Computed values
  const totalValue = useMemo(() => {
    return supplierReturns.reduce((sum, item) => sum + item.totalValue, 0);
  }, [supplierReturns]);

  const totalQuantity = useMemo(() => {
    return supplierReturns.reduce((sum, item) => sum + item.quantity, 0);
  }, [supplierReturns]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    supplierReturns.forEach(item => {
      counts[item.status] = (counts[item.status] || 0) + 1;
    });
    return counts;
  }, [supplierReturns]);

  // Handlers
  const handleSubmit = (data: SupplierReturnFormData) => {
    if (editingReturn) {
      updateMutation.mutate({ id: editingReturn.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (returnItem: SupplierReturn) => {
    setEditingReturn(returnItem);
    form.reset({
      date: returnItem.date,
      supplierId: returnItem.supplierId,
      purchaseInvoiceId: returnItem.purchaseInvoiceId || undefined,
      productId: returnItem.productId,
      productType: returnItem.productType as "regular" | "non",
      description: returnItem.description,
      invoiceNumber: returnItem.invoiceNumber || "",
      remarks: returnItem.remarks || "",
      quantity: returnItem.quantity,
      unitPrice: returnItem.unitPrice,
      returnReason: returnItem.returnReason || "",
      creditNoteIssued: returnItem.creditNoteIssued,
      creditNoteAmount: returnItem.creditNoteAmount,
      status: returnItem.status as "pending" | "approved" | "rejected" | "completed"
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this supplier return?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleStatusAction = (id: number, action: 'approve' | 'reject' | 'complete') => {
    switch (action) {
      case 'approve':
        approveMutation.mutate(id);
        break;
      case 'reject':
        rejectMutation.mutate(id);
        break;
      case 'complete':
        completeMutation.mutate(id);
        break;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      approved: "default",
      rejected: "destructive",
      completed: "secondary"
    };

    const icons = {
      pending: <Clock className="w-3 h-3" />,
      approved: <CheckCircle className="w-3 h-3" />,
      rejected: <XCircle className="w-3 h-3" />,
      completed: <CheckCircle className="w-3 h-3" />
    };

    return (
      <Badge variant={variants[status] || "outline"} className="flex items-center gap-1">
        {icons[status as keyof typeof icons]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getStatusActions = (returnItem: SupplierReturn) => {
    switch (returnItem.status) {
      case 'pending':
        return (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusAction(returnItem.id, 'approve')}
              disabled={approveMutation.isPending}
            >
              <CheckCircle className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStatusAction(returnItem.id, 'reject')}
              disabled={rejectMutation.isPending}
            >
              <XCircle className="w-3 h-3" />
            </Button>
          </div>
        );
      case 'approved':
        return (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleStatusAction(returnItem.id, 'complete')}
            disabled={completeMutation.isPending}
          >
            <CheckCircle className="w-3 h-3" />
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <PageLayout title="Return to Supplier" breadcrumb="Return to Supplier">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <RotateCcw size={20} />
                Return to Supplier
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label htmlFor="supplier">Supplier:</Label>
                <Select value={selectedSupplier?.toString() || "all"} onValueChange={(value) => setSelectedSupplier(value === "all" ? undefined : parseInt(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id.toString()}>
                        {supplier.supplier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>From Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !fromDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fromDate ? format(fromDate, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label>To Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !toDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {toDate ? format(toDate, "PPP") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Printer size={16} />
                  Print
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Info size={16} />
                  Options
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{supplierReturns.length}</div>
              <div className="text-sm text-gray-500">Total Returns</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{totalQuantity}</div>
              <div className="text-sm text-gray-500">Total Quantity</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">£{totalValue.toFixed(2)}</div>
              <div className="text-sm text-gray-500">Total Value</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{statusCounts.pending || 0}</div>
              <div className="text-sm text-gray-500">Pending</div>
            </CardContent>
          </Card>
        </div>

        {/* Returns Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Supplier Returns</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-48"
                  />
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus size={16} />
                      Add Return
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
                    <DialogHeader>
                      <DialogTitle>
                        {editingReturn ? 'Edit Supplier Return' : 'Add New Supplier Return'}
                      </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="date">Date</Label>
                          <Input
                            type="date"
                            {...form.register('date')}
                            className={form.formState.errors.date ? 'border-red-500' : ''}
                          />
                          {form.formState.errors.date && (
                            <p className="text-red-500 text-sm">{form.formState.errors.date.message}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="supplierId">Supplier</Label>
                          <Select
                            value={form.watch('supplierId')?.toString()}
                            onValueChange={(value) => form.setValue('supplierId', parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select supplier" />
                            </SelectTrigger>
                            <SelectContent>
                              {suppliers.map((supplier) => (
                                <SelectItem key={supplier.id} value={supplier.id.toString()}>
                                  {supplier.supplier_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {form.formState.errors.supplierId && (
                            <p className="text-red-500 text-sm">{form.formState.errors.supplierId.message}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="productType">Product Type</Label>
                          <Select
                            value={form.watch('productType')}
                            onValueChange={(value) => form.setValue('productType', value as 'regular' | 'non')}
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
                          <Label htmlFor="productId">Product</Label>
                          <Select
                            value={form.watch('productId')?.toString()}
                            onValueChange={(value) => form.setValue('productId', parseInt(value))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {form.watch('productType') === 'regular' 
                                ? products.regularProducts.map((product) => (
                                    <SelectItem key={product.id} value={product.id.toString()}>
                                      {product.description}
                                    </SelectItem>
                                  ))
                                : products.nonProducts.map((product) => (
                                    <SelectItem key={product.id} value={product.id.toString()}>
                                      {product.description}
                                    </SelectItem>
                                  ))
                              }
                            </SelectContent>
                          </Select>
                          {form.formState.errors.productId && (
                            <p className="text-red-500 text-sm">{form.formState.errors.productId.message}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="description">Description</Label>
                        <Input
                          {...form.register('description')}
                          placeholder="Return description"
                          className={form.formState.errors.description ? 'border-red-500' : ''}
                        />
                        {form.formState.errors.description && (
                          <p className="text-red-500 text-sm">{form.formState.errors.description.message}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="quantity">Quantity</Label>
                          <Input
                            type="number"
                            {...form.register('quantity', { valueAsNumber: true })}
                            min="1"
                            className={form.formState.errors.quantity ? 'border-red-500' : ''}
                          />
                          {form.formState.errors.quantity && (
                            <p className="text-red-500 text-sm">{form.formState.errors.quantity.message}</p>
                          )}
                        </div>
                        <div>
                          <Label htmlFor="unitPrice">Unit Price</Label>
                          <Input
                            type="number"
                            step="0.01"
                            {...form.register('unitPrice', { valueAsNumber: true })}
                            min="0"
                            className={form.formState.errors.unitPrice ? 'border-red-500' : ''}
                          />
                          {form.formState.errors.unitPrice && (
                            <p className="text-red-500 text-sm">{form.formState.errors.unitPrice.message}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="invoiceFromDate">Invoice From Date</Label>
                          <Input
                            type="date"
                            value={invoiceFromDate}
                            onChange={(e) => setInvoiceFromDate(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="invoiceToDate">Invoice To Date</Label>
                          <Input
                            type="date"
                            value={invoiceToDate}
                            onChange={(e) => setInvoiceToDate(e.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="purchaseInvoiceId">Purchase Invoice</Label>
                        <Select
                          value={form.watch('purchaseInvoiceId')?.toString() || 'none'}
                          onValueChange={(value) => {
                            if (value !== 'none') {
                              form.setValue('purchaseInvoiceId', parseInt(value));
                              const selectedInvoice = purchaseInvoices.find(inv => inv.id === parseInt(value));
                              if (selectedInvoice) {
                                form.setValue('invoiceNumber', selectedInvoice.id.toString());
                              }
                            } else {
                              form.setValue('purchaseInvoiceId', undefined);
                              form.setValue('invoiceNumber', '');
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select invoice" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Invoice</SelectItem>
                            {purchaseInvoices.map((inv) => (
                              <SelectItem key={inv.id} value={inv.id.toString()}>
                                {inv.id} - {inv.date} - £{inv.totalAmount}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="invoiceNumber">Invoice Number</Label>
                          <Input
                            {...form.register('invoiceNumber')}
                            placeholder="Original invoice number"
                          />
                        </div>
                        <div>
                          <Label htmlFor="returnReason">Return Reason</Label>
                          <Input
                            {...form.register('returnReason')}
                            placeholder="Reason for return"
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="creditNoteIssued"
                          checked={form.watch('creditNoteIssued')}
                          onCheckedChange={(checked) => form.setValue('creditNoteIssued', checked as boolean)}
                        />
                        <Label htmlFor="creditNoteIssued">Issue Credit Note</Label>
                      </div>

                      {form.watch('creditNoteIssued') && (
                        <div>
                          <Label htmlFor="creditNoteAmount">Credit Note Amount</Label>
                          <Input
                            type="number"
                            step="0.01"
                            {...form.register('creditNoteAmount', { valueAsNumber: true })}
                            min="0"
                            placeholder="Credit note amount"
                            className={form.formState.errors.creditNoteAmount ? 'border-red-500' : ''}
                          />
                          {form.formState.errors.creditNoteAmount && (
                            <p className="text-red-500 text-sm">{form.formState.errors.creditNoteAmount.message}</p>
                          )}
                        </div>
                      )}

                      <div>
                        <Label htmlFor="remarks">Remarks</Label>
                        <Textarea
                          {...form.register('remarks')}
                          placeholder="Additional remarks"
                          rows={3}
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsDialogOpen(false);
                            setEditingReturn(null);
                            form.reset();
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={createMutation.isPending || updateMutation.isPending}
                        >
                          {editingReturn ? 'Update' : 'Create'} Return
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Unit Price</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : supplierReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No supplier returns found
                    </TableCell>
                  </TableRow>
                ) : (
                  supplierReturns.map((returnItem) => (
                    <TableRow key={returnItem.id}>
                      <TableCell>{format(new Date(returnItem.date), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="font-mono">{returnItem.refNumber}</TableCell>
                      <TableCell>{returnItem.supplierName}</TableCell>
                      <TableCell>{returnItem.description}</TableCell>
                      <TableCell className="text-center">{returnItem.quantity}</TableCell>
                      <TableCell className="text-center">£{returnItem.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{returnItem.totalValue.toFixed(2)}</TableCell>
                      <TableCell>{getStatusBadge(returnItem.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(returnItem)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(returnItem.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                          {getStatusActions(returnItem)}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}