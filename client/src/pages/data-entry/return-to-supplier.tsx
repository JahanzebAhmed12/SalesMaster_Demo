import { useState, useMemo, useRef, useEffect } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import SupplierSearch from "@/components/ui/supplier-search";
import ProductSearch from "@/components/ui/product-search";
import { useSupplierSearch } from "@/hooks/useSupplierSearch";
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
} from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";
import { SupplierReturn, Supplier, RegularProduct, NonProduct } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useCompanyDetails } from "@/hooks/use-company-details";
import * as XLSX from 'xlsx';
import { useBusinessDate } from "@/hooks/use-business-date";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { copyToClipboard, printHtmlTable } from "@/lib/export-utils";
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";

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
  status: z.enum(["pending", "approved", "rejected", "completed"]).default("completed")
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



export default function ReturnToSupplier() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { notifyInventoryMutation } = useCrossTabSync({ enablePolling: false });
  const { selectedSupplier: selectedSupplierObj, handleSupplierSelect: handleSupplierSelectHook, supplierId } = useSupplierSearch();
  
  // Get business date. Use the raw date string for effect dependencies because
  // useBusinessDate parses a new Date object on each render.
  const { businessDate, currentDate: businessDateValue } = useBusinessDate();
  
  // State
  const [selectedSupplier, setSelectedSupplier] = useState<number | undefined>();
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReturn, setEditingReturn] = useState<SupplierReturn | null>(null);
  const [invoiceFromDate, setInvoiceFromDate] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [invoiceToDate, setInvoiceToDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const invoiceDatesInitializedRef = useRef(false);
  const [productSearchValue, setProductSearchValue] = useState("");
  const [productSearchKey, setProductSearchKey] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);
  
  // Sync supplierId with selectedSupplier
  useEffect(() => {
    if (supplierId) {
      setSelectedSupplier(supplierId);
    }
  }, [supplierId]);
  
  // Initialize dates with business date when available
  useEffect(() => {
    if (businessDate) {
      const businessDateObj = new Date(businessDate);
      setFromDate(businessDateObj);
      setToDate(businessDateObj);
    } else {
      const today = new Date();
      setFromDate(today);
      setToDate(today);
    }
  }, [businessDateValue]);

  // Initialize the invoice lookup range once from the business date. Manual
  // changes remain authoritative, including if the business date loads later.
  useEffect(() => {
    if (!businessDateValue || invoiceDatesInitializedRef.current) return;

    const businessDateObj = new Date(businessDateValue);
    setInvoiceFromDate(format(subDays(businessDateObj, 30), "yyyy-MM-dd"));
    setInvoiceToDate(format(businessDateObj, "yyyy-MM-dd"));
    invoiceDatesInitializedRef.current = true;
  }, [businessDateValue]);

  // Form
  const form = useForm<SupplierReturnFormData>({
    resolver: zodResolver(supplierReturnSchema),
    defaultValues: {
      date: businessDate ? format(new Date(businessDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      productType: 'regular',
      quantity: 1,
      unitPrice: 0,
      creditNoteIssued: false,
      creditNoteAmount: 0,
      status: 'completed'
    }
  });

  // Update form date when business date changes
  useEffect(() => {
    if (businessDateValue) {
      form.setValue('date', format(new Date(businessDateValue), 'yyyy-MM-dd'));
    }
  }, [businessDateValue, form]);

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

  const { data: suppliersData = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers
  });

  const { data: productsData = { regularProducts: [], nonProducts: [] } } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts
  });

  // Sort suppliers alphabetically by name
  const suppliers = useMemo(() => {
    if (!suppliersData) return [];
    return [...suppliersData].sort((a, b) => 
      a.supplier_name.localeCompare(b.supplier_name, undefined, { sensitivity: 'base' })
    );
  }, [suppliersData]);

  // Sort products alphabetically by description
  const products = useMemo(() => {
    if (!productsData) return { regularProducts: [], nonProducts: [] };
    return {
      regularProducts: [...productsData.regularProducts].sort((a, b) => 
        a.description.localeCompare(b.description, undefined, { sensitivity: 'base' })
      ),
      nonProducts: [...productsData.nonProducts].sort((a, b) => 
        a.description.localeCompare(b.description, undefined, { sensitivity: 'base' })
      )
    };
  }, [productsData]);

  const searchableProducts = form.watch('productType') === 'regular'
    ? products.regularProducts
    : products.nonProducts;

  const getProductLabel = (productId: number, productType: 'regular' | 'non') => {
    const product = (productType === 'regular' ? products.regularProducts : products.nonProducts)
      .find((item) => item.id === productId);
    if (!product) return '';
    return `${product.productCode || ''}${product.productCode ? ' - ' : ''}${product.description}`;
  };

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

  // Fetch company details
  const { companyDetails } = useCompanyDetails();

  // Fetch user permissions
  const { data: userPermissions } = useQuery<any>({
    queryKey: ['/api/user-backdate-options', user?.id],
    queryFn: () => apiRequest('GET', `/api/user-backdate-options/${user?.id}`),
    enabled: !!user?.id,
  });

  // Check if user can delete a supplier return based on date
  const canDeleteReturn = (returnDate: string) => {
    if (!userPermissions) return false;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const returnDateFormatted = format(new Date(returnDate), 'yyyy-MM-dd');
    
    if (returnDateFormatted === today) {
      // For current date entries, check current_editing permission
      return userPermissions.current_editing !== false;
    } else {
      // For back date entries, check deleting permission
      return userPermissions.deleting === true;
    }
  };

  // Check if user can edit a supplier return based on date
  const canEditReturn = (returnDate: string) => {
    if (!userPermissions) return false;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const returnDateFormatted = format(new Date(returnDate), 'yyyy-MM-dd');
    
    if (returnDateFormatted === today) {
      // For current date entries, check current_editing permission
      return userPermissions.current_editing !== false;
    } else {
      // For back date entries, check editing permission
      return userPermissions.editing === true;
    }
  };

  // Mutations
  const createMutation = useMutation({
    mutationFn: createSupplierReturn,
    onSuccess: (newReturn) => {
      notifyInventoryMutation({
        source: 'supplier-return',
        productId: newReturn?.productId,
        productType: newReturn?.productType as 'regular' | 'non' | undefined,
      });
      queryClient.setQueryData(['supplier-returns', { selectedSupplier, fromDate, toDate, searchTerm, statusFilter }], (old: any) => {
        if (!old) return [newReturn];
        return [newReturn, ...old];
      });
      toast({ title: "Success", description: "Supplier return created successfully" });
      setIsDialogOpen(false);
      setProductSearchValue('');
      setProductSearchKey((key) => key + 1);
      form.reset();
    },
    onError: (error: any) => {
      const errorMessage = error?.error || error?.message || "Failed to create supplier return";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: updateSupplierReturn,
    onSuccess: (updatedReturn) => {
      notifyInventoryMutation({
        source: 'supplier-return',
        productId: updatedReturn?.productId,
        productType: updatedReturn?.productType as 'regular' | 'non' | undefined,
      });
      queryClient.setQueryData(['supplier-returns', { selectedSupplier, fromDate, toDate, searchTerm, statusFilter }], (old: any) => {
        if (!old) return [updatedReturn];
        return old.map((item: any) => item.id === updatedReturn.id ? updatedReturn : item);
      });
      toast({ title: "Success", description: "Supplier return updated successfully" });
      setIsDialogOpen(false);
      setEditingReturn(null);
      setProductSearchValue('');
      setProductSearchKey((key) => key + 1);
      form.reset();
    },
    onError: (error: any) => {
      const errorMessage = error?.error || error?.message || "Failed to update supplier return";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplierReturn,
    onSuccess: () => {
      notifyInventoryMutation({ source: 'supplier-return' });
      queryClient.invalidateQueries({ queryKey: ['supplier-returns'] });
      toast({ title: "Success", description: "Supplier return deleted successfully" });
    },
    onError: (error: any) => {
      const errorMessage = error?.error || error?.message || "Failed to delete supplier return";
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
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

  // Export handlers
  const cardTitle = 'Supplier Returns';

  const handlePrint = () => {
    let html = '';
    
    // Add company details header following the specific structure
    html += '<div class="company-details">';
    if (companyDetails) {
      // Company name
      html += `<h2>${companyDetails.companyName || ''}</h2>`;
      
      // Email
      if (companyDetails.email) {
        html += `<p>${companyDetails.email}</p>`;
      }
      
      // Bank details
      if (companyDetails.bankDetails) {
        html += `<p>${companyDetails.bankDetails}</p>`;
      }
      
      // VAT and Registration info
      let regInfo = [];
      if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
      if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
      if (regInfo.length > 0) html += `<p>${regInfo.join(' | ')}</p>`;
    }
    html += '</div>';
    
    // Add report title
    html += '<div class="header">';
    html += '<h3>RETURN TO SUPPLIER</h3>';
    html += `<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : 'All'} to ${toDate ? format(toDate, "dd/MM/yyyy") : 'All'}</p>`;
    html += '</div>';
    
    // Add table
    html += '<table>';
    html += '<thead><tr>';
    const headers = ['Date', 'Reference', 'Supplier', 'Description', 'Quantity', 'Unit Price', 'Total Value', 'Status'];
    headers.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += '</tr></thead><tbody>';
    supplierReturns.forEach(item => {
      html += '<tr>';
      html += `<td>${format(new Date(item.date), 'dd/MM/yyyy')}</td>`;
      html += `<td>${item.refNumber}</td>`;
      html += `<td>${item.supplierName}</td>`;
      html += `<td>${item.description}</td>`;
      html += `<td>${item.quantity}</td>`;
      html += `<td>£${item.unitPrice.toFixed(2)}</td>`;
      html += `<td>£${item.totalValue.toFixed(2)}</td>`;
      html += `<td>${item.status}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    printHtmlTable('Supplier Returns', html, { autoClose: true });
  };

  const handleExcel = () => {
    const wsData = [
      [cardTitle],
      ['Date', 'Reference', 'Supplier', 'Description', 'Quantity', 'Unit Price', 'Total Value', 'Status'],
      ...supplierReturns.map((item: any) => ([
        format(new Date(item.date), 'dd/MM/yyyy'),
        item.refNumber,
        item.supplierName,
        item.description,
        item.quantity,
        item.unitPrice,
        item.totalValue,
        item.status,
      ])),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier Returns');
    XLSX.writeFile(wb, 'supplier-returns.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    let yPosition = 20;
    
    // Add company details following the specific structure
    if (companyDetails) {
      // Company name
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || '', 105, yPosition, { align: 'center' });
      yPosition += 8;
      
      doc.setFontSize(10);
      
      // Email
      if (companyDetails.email) {
        doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }
      
      // Bank details
      if (companyDetails.bankDetails) {
        doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }
      
      // VAT and Registration info
      let regInfo = [];
      if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
      if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
      if (regInfo.length > 0) {
        doc.text(regInfo.join(' | '), 105, yPosition, { align: 'center' });
        yPosition += 10;
      } else {
        yPosition += 5;
      }
    }
    
    // Add report title
    doc.setFontSize(14);
    doc.text('RETURN TO SUPPLIER', 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : 'All'} to ${toDate ? format(toDate, "dd/MM/yyyy") : 'All'}`, 105, yPosition, { align: 'center' });
    yPosition += 10;
    
    // Add table
    autoTable(doc, {
      head: [[
        'Date', 'Reference', 'Supplier', 'Description', 'Quantity', 'Unit Price', 'Total Value', 'Status'
      ]],
      body: supplierReturns.map((item: any) => [
        format(new Date(item.date), 'dd/MM/yyyy'),
        item.refNumber,
        item.supplierName,
        item.description,
        item.quantity,
        `£${item.unitPrice.toFixed(2)}`,
        `£${item.totalValue.toFixed(2)}`,
        item.status,
      ]),
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 25 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { cellWidth: 15 },
        5: { cellWidth: 20 },
        6: { cellWidth: 20 },
        7: { cellWidth: 15 }
      }
    });
    
    doc.save(`return-to-supplier-${fromDate ? format(fromDate, "yyyyMMdd") : 'all'}-${toDate ? format(toDate, "yyyyMMdd") : 'all'}.pdf`);
  };

  const handleCopy = () => {
    const header = ['Date', 'Reference', 'Supplier', 'Description', 'Quantity', 'Unit Price', 'Total Value', 'Status'];
    const rows = supplierReturns.map((item: any) => [
      format(new Date(item.date), 'dd/MM/yyyy'),
      item.refNumber,
      item.supplierName,
      item.description,
      item.quantity,
      item.unitPrice,
      item.totalValue,
      item.status,
    ]);
    const tsv = [cardTitle, header.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
    copyToClipboard(tsv, { toast });
  };

  // Handlers
  const handleSubmit = (data: SupplierReturnFormData) => {
    if (editingReturn) {
      updateMutation.mutate({ id: editingReturn.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (returnItem: SupplierReturn) => {
    if (!canEditReturn(returnItem.date)) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to edit this return",
        variant: "destructive"
      });
      return;
    }
    
    setEditingReturn(returnItem);
    setProductSearchValue(getProductLabel(returnItem.productId, returnItem.productType as 'regular' | 'non'));
    setProductSearchKey((key) => key + 1);
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
      status: "completed" as "pending" | "approved" | "rejected" | "completed"
    });
    setIsDialogOpen(true);
  };

  const handlePrintReturn = (returnId: number) => {
    window.open(`/print/supplier-return/${returnId}`, '_blank');
  };

  const handleDelete = (returnItem: SupplierReturn) => {
    if (!canDeleteReturn(returnItem.date)) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to delete this return",
        variant: "destructive"
      });
      return;
    }
    
    if (confirm("Are you sure you want to delete this supplier return?")) {
      deleteMutation.mutate(returnItem.id);
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
              <div className="text-sm text-gray-500 text-right">
                {/* No company name here */}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="min-w-[180px]">
                <Label htmlFor="supplier">Supplier:</Label>
                <SupplierSearch
                  placeholder="Search supplier by code or name..."
                  onSupplierSelect={(supplier) => {
                    handleSupplierSelectHook(supplier);
                    setSelectedSupplier(supplier?.id);
                  }}
                  showCode
                  allowClear
                />
              </div>
              <DateRangeFilter
                from={fromDate}
                to={toDate}
                onFromChange={setFromDate}
                onToChange={setToDate}
                fromLabel="From Date:"
                toLabel="To Date:"
                dateFormat="PPP"
              />
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                  <FileText size={14} /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                  <Download size={14} /> Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                  <Copy size={14} /> Copy
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                  <Printer size={14} /> Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {/* Removed summary cards as per user request */}

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
                    <SelectItem value="all">All Returns</SelectItem>
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
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => window.location.href = "/dashboard"}
                  >
                    Close
                  </Button>
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
                          <SupplierSearch
                            placeholder="Search supplier by code or name..."
                            onSupplierSelect={(supplier) => {
                              handleSupplierSelectHook(supplier);
                              if (supplier) {
                                form.setValue('supplierId', supplier.id);
                              } else {
                                form.setValue('supplierId', 0);
                              }
                            }}
                            required
                            showCode
                            allowClear
                          />
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
                            onValueChange={(value) => {
                              const productType = value as 'regular' | 'non';
                              form.setValue('productType', productType);
                              form.setValue('productId', 0, { shouldValidate: true });
                              setProductSearchValue('');
                              setProductSearchKey((key) => key + 1);
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
                          <ProductSearch
                            key={productSearchKey}
                            label="Product"
                            value={productSearchValue}
                            products={searchableProducts}
                            placeholder="Search product by code or name..."
                            onProductSelect={(product) => {
                              if (!product) {
                                form.setValue('productId', 0, { shouldValidate: true });
                                setProductSearchValue('');
                                return;
                              }
                              form.setValue('productId', product.id, { shouldValidate: true });
                              setProductSearchValue(
                                `${product.productCode || ''}${product.productCode ? ' - ' : ''}${product.description || ''}`
                              );
                            }}
                            required
                            showCode
                            allowClear
                          />
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
                            onChange={(e) => {
                              invoiceDatesInitializedRef.current = true;
                              setInvoiceFromDate(e.target.value);
                            }}
                          />
                        </div>
                        <div>
                          <Label htmlFor="invoiceToDate">Invoice To Date</Label>
                          <Input
                            type="date"
                            value={invoiceToDate}
                            onChange={(e) => {
                              invoiceDatesInitializedRef.current = true;
                              setInvoiceToDate(e.target.value);
                            }}
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
                            setProductSearchValue('');
                            setProductSearchKey((key) => key + 1);
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
            <div ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Total Value</TableHead>
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
                        <TableCell>{getProductLabel(returnItem.productId, returnItem.productType as 'regular' | 'non') || returnItem.description}</TableCell>
                        <TableCell>{returnItem.description}</TableCell>
                        <TableCell className="text-center">{returnItem.quantity}</TableCell>
                        <TableCell className="text-center">£{returnItem.unitPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{returnItem.totalValue.toFixed(2)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePrintReturn(returnItem.id)}
                              title="Print A4 supplier return"
                            >
                              <Printer className="w-3 h-3" />
                            </Button>
                            {canEditReturn(returnItem.date) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEdit(returnItem)}
                                title="Edit return"
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                                className="text-gray-400 cursor-not-allowed"
                                title="You don't have permission to edit this return"
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                            )}
                            {canDeleteReturn(returnItem.date) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDelete(returnItem)}
                                disabled={deleteMutation.isPending}
                                title="Delete return"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled
                                className="text-gray-400 cursor-not-allowed"
                                title="You don't have permission to delete this return"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}