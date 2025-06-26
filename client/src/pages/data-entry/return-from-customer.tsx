import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, subDays, addDays } from "date-fns";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RotateCcw, FileText, Download, Search, Save, Edit, Trash2, CheckCircle, XCircle, AlertCircle, Copy, Printer } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CustomerReturn, InsertCustomerReturn, Customer, RegularProduct, NonProduct } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Zod schema for return form validation
const returnSchema = z.object({
  date: z.string().min(1, "Date is required"),
  customerId: z.number().min(1, "Customer is required"),
  saleId: z.number().optional().nullable(),
  productId: z.number().min(1, "Product is required"),
  productType: z.enum(["regular", "non"]),
  description: z.string().min(1, "Description is required"),
  invoiceNumber: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
  unitPrice: z.coerce.number().min(0, "Unit price must be positive"),
  returnReason: z.string().optional().nullable(),
  creditNoteIssued: z.boolean().default(false),
  creditNoteAmount: z.coerce.number().min(0, "Credit note amount must be positive").optional(),
  status: z.string().default("pending")
});

type ReturnFormData = z.infer<typeof returnSchema>;

// API functions
const fetchCustomerReturns = async (params: {
  fromDate?: string;
  toDate?: string;
  customerId?: number;
  search?: string;
  status?: string;
}): Promise<CustomerReturn[]> => {
  const searchParams = new URLSearchParams();
  if (params.fromDate) searchParams.append('fromDate', params.fromDate);
  if (params.toDate) searchParams.append('toDate', params.toDate);
  if (params.customerId) searchParams.append('customerId', params.customerId.toString());
  if (params.search) searchParams.append('search', params.search);
  if (params.status) searchParams.append('status', params.status);
  return apiRequest('GET', `/api/customer-returns?${searchParams}`);
};

const fetchCustomers = async (): Promise<Customer[]> => {
  return apiRequest('GET', '/api/customers');
};

const fetchCustomerInvoices = async (customerId: number, fromDate: string, toDate: string): Promise<any[]> => {
  return apiRequest('GET', `/api/customers/${customerId}/invoices?fromDate=${fromDate}&toDate=${toDate}`);
};

const fetchProducts = async (): Promise<{ regularProducts: RegularProduct[]; nonProducts: NonProduct[] }> => {
  return apiRequest('GET', '/api/products');
};

export default function ReturnFromCustomer() {
  const { toast } = useToast();
  const [isAddingReturn, setIsAddingReturn] = useState(false);
  const [editingReturn, setEditingReturn] = useState<CustomerReturn | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [invoiceFromDate, setInvoiceFromDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [invoiceToDate, setInvoiceToDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const tableRef = useRef<HTMLDivElement>(null);

  const form = useForm<ReturnFormData>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      date: format(new Date(), "yyyy-MM-dd"),
      customerId: 0,
      productId: 0,
      productType: "regular",
      description: "",
      quantity: 1,
      unitPrice: 0,
      creditNoteIssued: false,
      creditNoteAmount: 0,
      status: "pending"
    },
  });

  // Fetch data
  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['customer-returns', fromDate, toDate, selectedCustomer, searchTerm, statusFilter],
    queryFn: () => fetchCustomerReturns({ fromDate, toDate, customerId: selectedCustomer !== "all" ? parseInt(selectedCustomer) : undefined, search: searchTerm, status: statusFilter !== "all" ? statusFilter : undefined })
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: fetchCustomers
  });

  const { data: products = { regularProducts: [], nonProducts: [] } } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts
  });

  const { data: summary } = useQuery({
    queryKey: ['customer-returns-summary', fromDate, toDate, selectedCustomer],
    queryFn: () => apiRequest('GET', `/api/customer-returns/reports/summary?fromDate=${fromDate}&toDate=${toDate}&customerId=${selectedCustomer !== "all" ? selectedCustomer : ""}`)
  });

  // Fetch customer invoices when customer or date range changes
  const { data: customerInvoices = [] } = useQuery({
    queryKey: ['customer-invoices', form.watch("customerId"), invoiceFromDate, invoiceToDate],
    queryFn: () => {
      const customerId = form.watch("customerId");
      if (customerId && customerId > 0) {
        return fetchCustomerInvoices(customerId, invoiceFromDate, invoiceToDate);
      }
      return Promise.resolve([]);
    },
    enabled: !!form.watch("customerId") && form.watch("customerId") > 0
  });

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Mutations
  const createReturnMutation = useMutation({
    mutationFn: (data: InsertCustomerReturn) => apiRequest('POST', '/api/customer-returns', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-returns'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['customer-returns-summary'], exact: false });
      setIsAddingReturn(false);
      form.reset();
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

  const updateReturnMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: InsertCustomerReturn }) => 
      apiRequest('PUT', `/api/customer-returns/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-returns'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['customer-returns-summary'], exact: false });
      setEditingReturn(null);
      form.reset();
      toast({
        title: "Success",
        description: "Customer return updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer return",
        variant: "destructive",
      });
    }
  });

  const deleteReturnMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/customer-returns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-returns'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['customer-returns-summary'], exact: false });
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

  const approveReturnMutation = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/customer-returns/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-returns'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['customer-returns-summary'], exact: false });
      toast({
        title: "Success",
        description: "Customer return approved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve customer return",
        variant: "destructive",
      });
    }
  });

  const rejectReturnMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => 
      apiRequest('POST', `/api/customer-returns/${id}/reject`, { rejectionReason: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-returns'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['customer-returns-summary'], exact: false });
      toast({
        title: "Success",
        description: "Customer return rejected successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject customer return",
        variant: "destructive",
      });
    }
  });

  const completeReturnMutation = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/customer-returns/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-returns'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['customer-returns-summary'], exact: false });
      toast({
        title: "Success",
        description: "Customer return completed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to complete customer return",
        variant: "destructive",
      });
    }
  });

  // Filter products based on product type
  const filteredProducts = form.watch("productType") === 'regular' 
    ? (products?.regularProducts || [])
    : (products?.nonProducts || []);

  const onSubmit = (data: ReturnFormData) => {
    const returnData: InsertCustomerReturn = {
      customerId: data.customerId,
      saleId: data.saleId || null,
      productId: data.productId,
      productType: data.productType,
      description: data.description,
      invoiceNumber: data.invoiceNumber || null,
      remarks: data.remarks || null,
      quantity: data.quantity,
      unitPrice: data.unitPrice,
      returnReason: data.returnReason || null,
      creditNoteIssued: data.creditNoteIssued,
      creditNoteAmount: data.creditNoteAmount || 0,
      status: data.status,
      date: data.date,
      refNumber: "", // Will be generated by backend
      totalValue: data.quantity * data.unitPrice
    };
    
    if (editingReturn) {
      updateReturnMutation.mutate({ id: editingReturn.id, data: returnData });
    } else {
      createReturnMutation.mutate(returnData);
    }
  };

  const handleEdit = (returnItem: CustomerReturn) => {
    setEditingReturn(returnItem);
    
    // Set invoice date range to cover the return date
    const returnDate = new Date(returnItem.date);
    setInvoiceFromDate(format(subDays(returnDate, 30), "yyyy-MM-dd"));
    setInvoiceToDate(format(addDays(returnDate, 30), "yyyy-MM-dd"));
    
    form.reset({
      date: returnItem.date,
      customerId: returnItem.customerId,
      saleId: returnItem.saleId,
      productId: returnItem.productId,
      productType: returnItem.productType as "regular" | "non",
      description: returnItem.description,
      invoiceNumber: returnItem.invoiceNumber,
      remarks: returnItem.remarks,
      quantity: returnItem.quantity,
      unitPrice: returnItem.unitPrice,
      returnReason: returnItem.returnReason,
      creditNoteIssued: returnItem.creditNoteIssued,
      creditNoteAmount: returnItem.creditNoteAmount,
      status: returnItem.status
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this return?")) {
      deleteReturnMutation.mutate(id);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: "secondary",
      approved: "default",
      rejected: "destructive",
      completed: "default"
    } as const;

    return <Badge variant={variants[status as keyof typeof variants] || "secondary"}>{status}</Badge>;
  };

  // Export handlers
  const cardTitle = `Customer Returns${companyDetails?.companyName ? ' - ' + companyDetails.companyName : ''}`;

  const handlePrint = () => {
    if (!tableRef.current) return;
    // Generate a table without the Actions column
    let html = `<div style='font-weight:bold;font-size:18px;margin-bottom:12px;'>${cardTitle}</div>`;
    html += `<table style='width:100%;border-collapse:collapse;'>`;
    html += `<thead><tr>`;
    const headers = ['Ref No', 'Date', 'Customer', 'Product', 'Invoice', 'Quantity', 'Unit Price', 'Total', 'Status', 'Credit Note'];
    headers.forEach(h => {
      html += `<th style='border:1px solid #ccc;padding:8px;'>${h}</th>`;
    });
    html += `</tr></thead><tbody>`;
    returns.forEach(item => {
      html += '<tr>';
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.refNumber}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${format(new Date(item.date), 'dd/MM/yyyy')}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.customerName}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.description}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.invoiceNumber || '-'}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.quantity}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>£${item.unitPrice.toFixed(2)}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>£${item.totalValue.toFixed(2)}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.status}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.creditNoteIssued ? `£${item.creditNoteAmount.toFixed(2)}` : '-'}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(html);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handleExcel = () => {
    const wsData = [
      [cardTitle],
      ['Ref No', 'Date', 'Customer', 'Product', 'Invoice', 'Quantity', 'Unit Price', 'Total', 'Status', 'Credit Note'],
      ...returns.map((item: any) => ([
        item.refNumber,
        format(new Date(item.date), 'dd/MM/yyyy'),
        item.customerName,
        item.description,
        item.invoiceNumber || '-',
        item.quantity,
        item.unitPrice,
        item.totalValue,
        item.status,
        item.creditNoteIssued ? item.creditNoteAmount : '-',
      ])),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Returns');
    XLSX.writeFile(wb, 'customer-returns.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.text(cardTitle, 14, 16);
    autoTable(doc, {
      head: [[
        'Ref No', 'Date', 'Customer', 'Product', 'Invoice', 'Quantity', 'Unit Price', 'Total', 'Status', 'Credit Note'
      ]],
      body: returns.map((item: any) => [
        item.refNumber,
        format(new Date(item.date), 'dd/MM/yyyy'),
        item.customerName,
        item.description,
        item.invoiceNumber || '-',
        item.quantity,
        item.unitPrice,
        item.totalValue,
        item.status,
        item.creditNoteIssued ? item.creditNoteAmount : '-'
      ]),
      startY: 22,
    });
    doc.save('customer-returns.pdf');
  };

  const handleCopy = () => {
    const header = ['Ref No', 'Date', 'Customer', 'Product', 'Invoice', 'Quantity', 'Unit Price', 'Total', 'Status', 'Credit Note'];
    const rows = returns.map((item: any) => [
      item.refNumber,
      format(new Date(item.date), 'dd/MM/yyyy'),
      item.customerName,
      item.description,
      item.invoiceNumber || '-',
      item.quantity,
      item.unitPrice,
      item.totalValue,
      item.status,
      item.creditNoteIssued ? item.creditNoteAmount : '-'
    ]);
    const tsv = [cardTitle, header.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsv);
    toast({ title: 'Copied', description: 'Table copied to clipboard!' });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading returns...</div>;
  }

  return (
    <PageLayout title="Returns from Customer" breadcrumb="Returns from Customer">
      <div className="space-y-6">
        {/* Page Title and Company Details Row */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Returns from Customer</h1>
          <div className="text-sm text-gray-600 text-right">
            {companyDetails?.companyName || 'Company Name'}, {companyDetails?.address1 || ''}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ''}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Returns</CardTitle>
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.totalReturns || 0}</div>
              <p className="text-xs text-muted-foreground">
                Returns in selected period
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Quantity</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.totalQuantity || 0}</div>
              <p className="text-xs text-muted-foreground">
                Total quantity returned
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">£{(summary?.totalValue || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Total value of returns
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Credit Notes</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">£{(summary?.totalCreditNotes || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Total credit notes issued
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>Customer</Label>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers.map((customer: Customer) => (
                      <SelectItem key={customer.id} value={customer.id.toString()}>
                        {customer.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>From Date</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>

              <div>
                <Label>To Date</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>

              <div>
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
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
              </div>
            </div>

            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by description, invoice number, or customer name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Returns Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Customer Returns</CardTitle>
              <div className="flex items-center gap-2">
                <Button onClick={() => setIsAddingReturn(!isAddingReturn)}>
                  <Save className="h-4 w-4 mr-2" />
                  {isAddingReturn ? "Cancel" : "Add Return"}
                </Button>
                <Button variant="outline" size="sm" onClick={handlePDF}>
                  <FileText className="h-4 w-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExcel}>
                  <Download className="h-4 w-4 mr-1" /> Excel
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-1" /> Print
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ref No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-center">Unit Price</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Credit Note</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map((returnItem: CustomerReturn) => (
                    <TableRow key={returnItem.id}>
                      <TableCell>{returnItem.refNumber}</TableCell>
                      <TableCell>{format(new Date(returnItem.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{returnItem.customerName}</TableCell>
                      <TableCell>{returnItem.description}</TableCell>
                      <TableCell>{returnItem.invoiceNumber || "-"}</TableCell>
                      <TableCell className="text-center">{returnItem.quantity}</TableCell>
                      <TableCell className="text-center">£{returnItem.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{returnItem.totalValue.toFixed(2)}</TableCell>
                      <TableCell>{getStatusBadge(returnItem.status)}</TableCell>
                      <TableCell>
                        {returnItem.creditNoteIssued ? (
                          <Badge variant="default">£{returnItem.creditNoteAmount.toFixed(2)}</Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(returnItem)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {returnItem.status === 'pending' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => approveReturnMutation.mutate(returnItem.id)}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => rejectReturnMutation.mutate({ 
                                  id: returnItem.id, 
                                  reason: "Return rejected" 
                                })}
                              >
                                <XCircle className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          )}
                          {returnItem.status === 'approved' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => completeReturnMutation.mutate(returnItem.id)}
                            >
                              <CheckCircle className="h-4 w-4 text-blue-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(returnItem.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Add/Edit Return Dialog */}
        <Dialog open={isAddingReturn || !!editingReturn} onOpenChange={() => {
          setIsAddingReturn(false);
          setEditingReturn(null);
          form.reset();
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingReturn ? "Edit Customer Return" : "Add Customer Return"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    type="date"
                    {...form.register("date")}
                  />
                  {form.formState.errors.date && (
                    <p className="text-sm text-red-500">{form.formState.errors.date.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="customerId">Customer *</Label>
                  <Select
                    value={form.watch("customerId").toString()}
                    onValueChange={(value) => form.setValue("customerId", parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.customer_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.customerId && (
                    <p className="text-sm text-red-500">{form.formState.errors.customerId.message}</p>
                  )}
                </div>
              </div>

              {/* Invoice Date Range */}
              {form.watch("customerId") > 0 && (
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
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="saleId">Invoice Number</Label>
                  <Select
                    value={form.watch("saleId")?.toString() || "none"}
                    onValueChange={(value) => {
                      const saleId = value && value !== "none" ? parseInt(value) : null;
                      form.setValue("saleId", saleId);
                      
                      // Auto-fill invoice number if sale is selected
                      if (saleId) {
                        const selectedInvoice = customerInvoices.find(inv => inv.id === saleId);
                        if (selectedInvoice) {
                          form.setValue("invoiceNumber", selectedInvoice.invoiceNumber);
                        }
                      } else {
                        form.setValue("invoiceNumber", "");
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select invoice (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Invoice</SelectItem>
                      {customerInvoices.map((invoice) => (
                        <SelectItem key={invoice.id} value={invoice.id.toString()}>
                          {invoice.invoiceNumber} - {invoice.date} - £{invoice.totalAmount}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="invoiceNumber">Manual Invoice Number</Label>
                  <Input
                    {...form.register("invoiceNumber")}
                    placeholder="Enter invoice number manually"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="productType">Product Type *</Label>
                <Select
                  value={form.watch("productType")}
                  onValueChange={(value) => {
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
                <Label htmlFor="productId">Product *</Label>
                <Select
                  value={form.watch("productId").toString()}
                  onValueChange={(value) => form.setValue("productId", parseInt(value))}
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
                {form.formState.errors.productId && (
                  <p className="text-sm text-red-500">{form.formState.errors.productId.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  type="number"
                  {...form.register("quantity")}
                  min="1"
                />
                {form.formState.errors.quantity && (
                  <p className="text-sm text-red-500">{form.formState.errors.quantity.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="unitPrice">Unit Price *</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("unitPrice")}
                  min="0"
                />
                {form.formState.errors.unitPrice && (
                  <p className="text-sm text-red-500">{form.formState.errors.unitPrice.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="description">Description *</Label>
                <Input {...form.register("description")} />
                {form.formState.errors.description && (
                  <p className="text-sm text-red-500">{form.formState.errors.description.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="returnReason">Return Reason</Label>
                <Input {...form.register("returnReason")} />
              </div>

              <div>
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea {...form.register("remarks")} />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={form.watch("creditNoteIssued")}
                  onCheckedChange={(checked) => form.setValue("creditNoteIssued", checked)}
                />
                <Label htmlFor="creditNoteIssued">Issue Credit Note</Label>
              </div>

              {form.watch("creditNoteIssued") && (
                <div>
                  <Label htmlFor="creditNoteAmount">Credit Note Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    {...form.register("creditNoteAmount")}
                    min="0"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddingReturn(false);
                    setEditingReturn(null);
                    form.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createReturnMutation.isPending || updateReturnMutation.isPending}>
                  {editingReturn ? "Update Return" : "Create Return"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}