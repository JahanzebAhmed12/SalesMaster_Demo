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
import Pagination from "@/components/ui/pagination";
import { usePagination } from "@/hooks/usePagination";
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
import { format } from "date-fns";
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

// Form validation schema — document-level fields only; products are item rows
const supplierReturnSchema = z.object({
  date: z.string().min(1, "Date is required"),
  supplierId: z.number().min(1, "Supplier is required"),
  remarks: z.string().optional(),
});

type SupplierReturnFormData = z.infer<typeof supplierReturnSchema>;

// One product line inside a multi-product return
interface ReturnItemDraft {
  key: number;
  productType: 'regular' | 'non';
  productId: number;
  productLabel: string;
  description: string;
  quantity: number;
  unitPrice: number;
  returnReason: string;
  creditNoteAmount: number;
}

interface SupplierReturnItemInput {
  productType: 'regular' | 'non';
  productId: number;
  description: string;
  quantity: number;
  unitPrice: number;
  returnReason?: string;
  creditNoteIssued?: boolean;
  creditNoteAmount?: number;
}

type CreateSupplierReturnPayload = SupplierReturnFormData & { items: SupplierReturnItemInput[] };
type UpdateSupplierReturnPayload = SupplierReturnFormData & SupplierReturnItemInput & { status: string };

let returnItemKeyCounter = 0;
const createEmptyItem = (): ReturnItemDraft => ({
  key: ++returnItemKeyCounter,
  productType: 'regular',
  productId: 0,
  productLabel: '',
  description: '',
  quantity: 1,
  unitPrice: 0,
  returnReason: '',
  creditNoteAmount: 0,
});

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

const createSupplierReturn = async (data: CreateSupplierReturnPayload): Promise<{ returns: SupplierReturn[] }> => {
  return apiRequest('POST', '/api/supplier-returns', data);
};

const updateSupplierReturn = async ({ id, data }: { id: number; data: UpdateSupplierReturnPayload }): Promise<SupplierReturn> => {
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
  const [returnItems, setReturnItems] = useState<ReturnItemDraft[]>(() => [createEmptyItem()]);
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

  // Form
  const form = useForm<SupplierReturnFormData>({
    resolver: zodResolver(supplierReturnSchema),
    defaultValues: {
      date: businessDate ? format(new Date(businessDate), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      remarks: ''
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

  const allSearchableProducts = useMemo(
    () => [...products.regularProducts, ...products.nonProducts],
    [products]
  );

  const getProductLabel = (productId: number, productType: 'regular' | 'non') => {
    const product = (productType === 'regular' ? products.regularProducts : products.nonProducts)
      .find((item) => item.id === productId);
    if (!product) return '';
    return `${product.productCode || ''}${product.productCode ? ' - ' : ''}${product.description}`;
  };

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
  const resetDialog = () => {
    setIsDialogOpen(false);
    setEditingReturn(null);
    setReturnItems([createEmptyItem()]);
    form.reset();
  };

  const createMutation = useMutation({
    mutationFn: createSupplierReturn,
    onSuccess: (result) => {
      const createdReturns: SupplierReturn[] = result?.returns || [];
      createdReturns.forEach((r) =>
        notifyInventoryMutation({
          source: 'supplier-return',
          productId: r?.productId,
          productType: r?.productType as 'regular' | 'non' | undefined,
        })
      );
      queryClient.setQueryData(['supplier-returns', { selectedSupplier, fromDate, toDate, searchTerm, statusFilter }], (old: any) => {
        if (!old) return createdReturns;
        return [...createdReturns, ...old];
      });
      toast({ title: "Success", description: `Supplier return${createdReturns.length > 1 ? 's' : ''} created successfully` });
      resetDialog();
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
      resetDialog();
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

  const pagination = usePagination({ data: supplierReturns, initialItemsPerPage: 10 });

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
    const headers = ['Date', 'Reference', 'Supplier', 'Product', 'Description', 'Quantity', 'Unit Price', 'Total Value'];
    headers.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += '</tr></thead><tbody>';
    supplierReturns.forEach(item => {
      const productLabel = getProductLabel((item as any).productId, (item as any).productType as 'regular' | 'non') || '-';
      html += '<tr>';
      html += `<td>${format(new Date(item.date), 'dd/MM/yyyy')}</td>`;
      html += `<td>${item.refNumber}</td>`;
      html += `<td>${item.supplierName}</td>`;
      html += `<td>${productLabel}</td>`;
      html += `<td>${item.description}</td>`;
      html += `<td>${item.quantity}</td>`;
      html += `<td>£${item.unitPrice.toFixed(2)}</td>`;
      html += `<td>£${item.totalValue.toFixed(2)}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    printHtmlTable('Supplier Returns', html, { autoClose: true });
  };

  const handleExcel = () => {
    const wsData = [
      [cardTitle],
      ['Date', 'Reference', 'Supplier', 'Product', 'Description', 'Quantity', 'Unit Price', 'Total Value'],
      ...supplierReturns.map((item: any) => {
        const productLabel = getProductLabel(item.productId, item.productType as 'regular' | 'non') || '-';
        return [
          format(new Date(item.date), 'dd/MM/yyyy'),
          item.refNumber,
          item.supplierName,
          productLabel,
          item.description,
          item.quantity,
          item.unitPrice,
          item.totalValue,
        ];
      }),
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
        'Date', 'Reference', 'Supplier', 'Product', 'Description', 'Quantity', 'Unit Price', 'Total Value'
      ]],
      body: supplierReturns.map((item: any) => {
        const productLabel = getProductLabel(item.productId, item.productType as 'regular' | 'non') || '-';
        return [
          format(new Date(item.date), 'dd/MM/yyyy'),
          item.refNumber,
          item.supplierName,
          productLabel,
          item.description,
          item.quantity,
          `£${item.unitPrice.toFixed(2)}`,
          `£${item.totalValue.toFixed(2)}`,
        ];
      }),
      startY: yPosition,
      styles: {
        fontSize: 7,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 22 },
        2: { cellWidth: 28 },
        3: { cellWidth: 32 },
        4: { cellWidth: 32 },
        5: { cellWidth: 14 },
        6: { cellWidth: 18 },
        7: { cellWidth: 18 }
      }
    });
    
    doc.save(`return-to-supplier-${fromDate ? format(fromDate, "yyyyMMdd") : 'all'}-${toDate ? format(toDate, "yyyyMMdd") : 'all'}.pdf`);
  };

  const handleCopy = () => {
    const header = ['Date', 'Reference', 'Supplier', 'Product', 'Description', 'Quantity', 'Unit Price', 'Total Value'];
    const rows = supplierReturns.map((item: any) => {
      const productLabel = getProductLabel(item.productId, item.productType as 'regular' | 'non') || '-';
      return [
        format(new Date(item.date), 'dd/MM/yyyy'),
        item.refNumber,
        item.supplierName,
        productLabel,
        item.description,
        item.quantity,
        item.unitPrice,
        item.totalValue,
      ];
    });
    const tsv = [cardTitle, header.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
    copyToClipboard(tsv, { toast });
  };

  // Handlers
  const updateItem = (key: number, patch: Partial<ReturnItemDraft>) => {
    setReturnItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const handleItemProductSelect = (item: ReturnItemDraft, product: RegularProduct | NonProduct | null) => {
    if (!product) {
      updateItem(item.key, { productId: 0, productType: 'regular', productLabel: '', description: '' });
      return;
    }
    const isNon = products.nonProducts.some((p) => p === product);
    const label = `${product.productCode ? `${product.productCode} - ` : ''}${product.description || product.name || ''}`;
    updateItem(item.key, {
      productId: product.id,
      productType: isNon ? 'non' : 'regular',
      productLabel: label,
      description: product.description || product.name || '',
    });
  };

  const toItemInput = (item: ReturnItemDraft): SupplierReturnItemInput => ({
    productType: item.productType,
    productId: item.productId,
    description: item.description || item.productLabel,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    returnReason: item.returnReason || undefined,
    creditNoteIssued: item.creditNoteAmount > 0,
    creditNoteAmount: item.creditNoteAmount > 0 ? item.creditNoteAmount : 0,
  });

  const handleSubmit = (data: SupplierReturnFormData) => {
    const selectedItems = returnItems.filter((item) => item.productId > 0);
    if (selectedItems.length === 0) {
      toast({ title: "Error", description: "Add at least one product to the return", variant: "destructive" });
      return;
    }
    if (selectedItems.some((item) => item.quantity < 1 || item.unitPrice < 0)) {
      toast({ title: "Error", description: "Each product needs a quantity of at least 1 and a valid unit price", variant: "destructive" });
      return;
    }

    if (editingReturn) {
      const item = selectedItems[0];
      updateMutation.mutate({
        id: editingReturn.id,
        data: {
          ...data,
          ...toItemInput(item),
          status: 'completed',
        },
      });
    } else {
      createMutation.mutate({ ...data, items: selectedItems.map(toItemInput) });
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
    setReturnItems([{
      key: ++returnItemKeyCounter,
      productType: returnItem.productType as 'regular' | 'non',
      productId: returnItem.productId,
      productLabel: getProductLabel(returnItem.productId, returnItem.productType as 'regular' | 'non'),
      description: returnItem.description,
      quantity: returnItem.quantity,
      unitPrice: returnItem.unitPrice,
      returnReason: returnItem.returnReason || "",
      creditNoteAmount: returnItem.creditNoteAmount || 0,
    }]);
    form.reset({
      date: returnItem.date,
      supplierId: returnItem.supplierId,
      remarks: returnItem.remarks || ""
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
                <Dialog open={isDialogOpen} onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  if (open && !editingReturn) {
                    form.reset();
                    setReturnItems([createEmptyItem()]);
                  }
                }}>
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
                  <DialogContent className="max-w-4xl" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
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

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label>Products</Label>
                          {!editingReturn && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="flex items-center gap-1"
                              onClick={() => setReturnItems((prev) => [...prev, createEmptyItem()])}
                            >
                              <Plus size={14} />
                              Add Product
                            </Button>
                          )}
                        </div>
                        <div className="border rounded-md">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="min-w-[280px]">Product</TableHead>
                                <TableHead className="w-[80px]">Qty</TableHead>
                                <TableHead className="w-[100px]">Unit Price</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead className="w-[110px]">Credit £</TableHead>
                                {!editingReturn && <TableHead className="w-[48px]"></TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {returnItems.map((item) => (
                                <TableRow key={item.key}>
                                  <TableCell className="py-2">
                                    <ProductSearch
                                      key={`${item.key}-${item.productId}`}
                                      value={item.productLabel}
                                      products={allSearchableProducts}
                                      placeholder="Search product..."
                                      onProductSelect={(product) => handleItemProductSelect(item, product)}
                                      showCode={false}
                                      size="sm"
                                    />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => updateItem(item.key, { quantity: parseFloat(e.target.value) || 0 })}
                                      className="h-8 w-20"
                                    />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={item.unitPrice}
                                      onChange={(e) => updateItem(item.key, { unitPrice: parseFloat(e.target.value) || 0 })}
                                      className="h-8 w-24"
                                    />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      value={item.returnReason}
                                      placeholder="Reason"
                                      onChange={(e) => updateItem(item.key, { returnReason: e.target.value })}
                                      className="h-8"
                                    />
                                  </TableCell>
                                  <TableCell className="py-2">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={item.creditNoteAmount || ''}
                                      placeholder="0.00"
                                      onChange={(e) => updateItem(item.key, { creditNoteAmount: parseFloat(e.target.value) || 0 })}
                                      className="h-8 w-24"
                                    />
                                  </TableCell>
                                  {!editingReturn && (
                                    <TableCell className="py-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={returnItems.length === 1}
                                        onClick={() => setReturnItems((prev) => prev.filter((i) => i.key !== item.key))}
                                      >
                                        <Trash2 size={14} />
                                      </Button>
                                    </TableCell>
                                  )}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

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
                          onClick={resetDialog}
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
                    pagination.paginatedData.map((returnItem) => (
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
              {pagination.totalPages > 1 && (
                <div className="mt-4">
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    totalItems={pagination.totalItems}
                    itemsPerPage={pagination.itemsPerPage}
                    onPageChange={pagination.goToPage}
                    onItemsPerPageChange={pagination.setItemsPerPage}
                    itemsPerPageOptions={[10, 25, 50, 100]}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}