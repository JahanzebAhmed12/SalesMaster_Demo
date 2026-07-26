import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Eye, Edit, Trash2, Download, FileText, Printer, ChevronUp, ChevronDown } from "lucide-react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { printHtmlTable } from "@/lib/export-utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RegularProduct, InsertRegularProduct, UpdateRegularProduct } from "@shared/schema";
import { Link } from "wouter";
import { Table, TableHeader, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Controller } from "react-hook-form";

// Zod schema for product form validation
const productSchema = z.object({
  productCode: z.string().min(1, "Product code is required"),
  description: z.string().min(1, "Description is required"),
  sellingPrice: z.coerce.number().min(0, "Selling price must be a positive number"),
  taxRate: z.coerce.number().min(0, "Tax rate must be a positive number"),
  // Add other fields as needed, with appropriate validation
  sageCode: z.string().optional().nullable(),
  hsCode: z.string().optional().nullable(),
  vatCode: z.string().optional().nullable(),
  unitOfPurchase: z.string().optional().nullable(),
  unitOfSale: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  nominalCode: z.string().optional().nullable(),
  stockCategory: z.string().optional().nullable(),
  departmentNumber: z.string().optional().nullable(),
  supplierRef: z.string().optional().nullable(),
  supplierPartNumber: z.string().optional().nullable(),
  reorderLevel: z.coerce.number().optional(),
  stockLevelFlag: z.boolean().optional(),
  commodityCode: z.string().optional().nullable(),
  unitWeight: z.coerce.number().optional(),
  stockTakeDate: z.string().optional().nullable(),
  reorderQuantity: z.coerce.number().optional(),
  lastStockTake: z.coerce.number().optional(),
  initialStock: z.coerce.number().min(0, "Initial stock must be a positive number").optional(),
  status: z.string().optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

const nonProducts = [
  { slNo: 1, productCode: "Z1017", sageCode: "Z1017", description: "Bangla Radio", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 2, productCode: "Z004", sageCode: "", description: "Carry Forward", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 3, productCode: "Z1007", sageCode: "Z1007", description: "Cash Paid", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 4, productCode: "Z1003", sageCode: "Z1003", description: "Clearance", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 5, productCode: "Z1006", sageCode: "Z1006", description: "Contra", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 6, productCode: "Z1002", sageCode: "Z1002", description: "Defra", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 7, productCode: "Z001", sageCode: "", description: "Discount", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 8, productCode: "Z1012", sageCode: "Z1012", description: "Dolay", sellingPrice: 0, taxVat: "20%", status: "Active" },
  { slNo: 9, productCode: "Z1010", sageCode: "Z1010", description: "Electricity Tariff 1", sellingPrice: 0, taxVat: "20%", status: "Active" },
  { slNo: 10, productCode: "Z1011", sageCode: "Z1011", description: "Electricity Tariff 2", sellingPrice: 0, taxVat: "20%", status: "Active" },
  { slNo: 11, productCode: "Z002", sageCode: "", description: "Gifts", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 12, productCode: "Z1001", sageCode: "Z1001", description: "Handling Charges", sellingPrice: 0.1, taxVat: "0%", status: "Active" },
  { slNo: 13, productCode: "Z1008", sageCode: "Z1008", description: "Insurance Rent", sellingPrice: 0, taxVat: "20%", status: "Active" },
  { slNo: 14, productCode: "Z006", sageCode: "", description: "Invoice Cancelled", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 15, productCode: "Z1004", sageCode: "Z1004", description: "labour", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 16, productCode: "Z1015", sageCode: "Z1015", description: "Lease", sellingPrice: 0, taxVat: "20%", status: "Active" },
  { slNo: 17, productCode: "Z1016", sageCode: "Z1016", description: "Maintenance", sellingPrice: 0, taxVat: "20%", status: "Active" },
  { slNo: 18, productCode: "Z1013", sageCode: "Z1013", description: "Paper & Cardboard", sellingPrice: 0, taxVat: "20%", status: "Active" },
  { slNo: 19, productCode: "Z005", sageCode: "", description: "Porterage", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 20, productCode: "Z1014", sageCode: "Z1014", description: "Professional Fees", sellingPrice: 0, taxVat: "20%", status: "Active" },
  { slNo: 21, productCode: "Z1009", sageCode: "Z1009", description: "Rent", sellingPrice: 0, taxVat: "20%", status: "Active" },
  { slNo: 22, productCode: "Z003", sageCode: "", description: "Tax", sellingPrice: 0, taxVat: "0%", status: "Active" },
  { slNo: 23, productCode: "Z1000", sageCode: "Z1000", description: "TRANSPORT", sellingPrice: 30, taxVat: "0%", status: "Active" },
];

// Helper to get next product code
function getNextProductCode(products: RegularProduct[]) {
  // Ensure products is an array
  const productsArray = Array.isArray(products) ? products : [];
  
  const codes = productsArray
    .map(p => p.productCode)
    .filter(code => code && /^P\d+$/i.test(code));
  const nums = codes.map(code => parseInt(code.replace(/^P/i, ""), 10)).filter(n => !isNaN(n));
  const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `P${nextNum}`;
}

export default function Products() {
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<"view" | "add" | "viewNonProducts" | "addNonProducts">("view");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingProduct, setEditingProduct] = useState<RegularProduct | null>(null);
  const [sortField, setSortField] = useState<"productCode" | "description" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      productCode: "",
      description: "",
      sellingPrice: 0,
      taxRate: 0,
      status: "active",
      stockLevelFlag: false,
      initialStock: 0,
    },
  });

  // Auto-fill Sage Code to match Product Code
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "productCode" && value.productCode) {
        form.setValue("sageCode", value.productCode);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  useEffect(() => {
    if (editingProduct) {
      form.reset(editingProduct);
      setActiveView("add");
    } else {
      form.reset({
        productCode: "",
        description: "",
        sellingPrice: 0,
        taxRate: 0,
        status: "active",
        stockLevelFlag: false,
        initialStock: 0,
      });
    }
  }, [editingProduct, form]);

  const { data: products = [], isLoading, error } = useQuery<RegularProduct[]>({
    queryKey: ["products"],
    queryFn: () => apiRequest("GET", "/api/regular_products"),
    select: (data) => {
      // Ensure we always return an array
      if (Array.isArray(data)) {
        return data;
      }
      // If data has a products property that's an array
      if (data && typeof data === 'object' && Array.isArray((data as any).products)) {
        return (data as any).products;
      }
      // If data has a data property that's an array
      if (data && typeof data === 'object' && Array.isArray((data as any).data)) {
        return (data as any).data;
      }
      // Fallback to empty array
      console.warn('API returned unexpected data format:', data);
      return [];
    }
  });

  const createProductMutation = useMutation<RegularProduct, Error, ProductFormData>({
    mutationFn: (product) => apiRequest("POST", "/api/products/regular", product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setActiveView("view");
      toast({ title: "Success", description: "Product created successfully." });
      window.location.reload()
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateProductMutation = useMutation<RegularProduct, Error, ProductFormData & { id: number }>({
    mutationFn: (product) => apiRequest("PUT", `/api/products/regular/${product.id}`, product),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setActiveView("view");
      setEditingProduct(null);
      toast({ title: "Success", description: "Product updated successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteProductMutation = useMutation<
    void,
    Error,
    number
  >({
    mutationFn: (id) => apiRequest("DELETE", `/api/products/regular/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Success", description: "Product deleted successfully." });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredProducts = React.useMemo(() => {
    const productsArray = Array.isArray(products) ? products : [];

    let filtered = productsArray;
    if (searchTerm) {
      filtered = productsArray.filter((product) => {
        const description = product.description || '';
        const productCode = product.productCode || '';
        return description.toLowerCase().includes(searchTerm.toLowerCase()) ||
               productCode.toLowerCase().includes(searchTerm.toLowerCase());
      });
    }

    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = (a[sortField] || '').toLowerCase();
        const bVal = (b[sortField] || '').toLowerCase();
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return filtered;
  }, [products, searchTerm, sortField, sortDirection]);

  const paginatedProducts = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));

  const handleSort = (field: "productCode" | "description") => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="inline h-4 w-4 ml-1" /> : <ChevronDown className="inline h-4 w-4 ml-1" />;
  };

  const onSubmit = (data: ProductFormData) => {
    if (editingProduct) {
      updateProductMutation.mutate({ ...data, id: editingProduct.id });
    } else {
      createProductMutation.mutate(data);
    }
  };

  const handleEdit = (product: RegularProduct) => {
    setEditingProduct(product);
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: string) => {
    if (format === "all") {
      toast({
        title: "Info",
        description: "All products are already displayed in the table."
      });
      return;
    }

    if (filteredProducts.length === 0) {
      toast({
        variant: "destructive",
        title: "No Data",
        description: "No products found to export."
      });
      return;
    }

    setIsExporting(true);

    try {
      const exportData = filteredProducts.map((product, index) => ({
        'Sl.No': index + 1,
        'Product Code': product.productCode,
        'Sage Code': product.sageCode || '',
        'Product Description': product.description,
        'Unit Price': `£${(product.sellingPrice ?? 0).toFixed(2)}`,
        'Tax Rate': `${(product.taxRate ?? 0)}%`,
        'Status': product.status || 'Active'
      }));

      switch (format) {
        case "excel":
          await handleExcelExport(exportData);
          break;
        case "pdf":
          await handlePDFExport(exportData);
          break;
        case "print":
          handlePrint();
          break;
        default:
          console.log(`Unknown format: ${format}`);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "An unexpected error occurred during export."
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExcelExport = async (data: any[]) => {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);

      const colWidths = Object.keys(data[0] || {}).map(key => ({
        wch: Math.max(key.length, ...data.map(row => String(row[key] || '').length))
      }));
      ws['!cols'] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, 'Products');
      
      const fileName = `Products_Database_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      toast({
        title: "Success",
        description: "Products data exported to Excel successfully."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export to Excel. Please try again."
      });
    }
  };

  const handlePDFExport = async (data: any[]) => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      
      doc.setFontSize(16);
      doc.text('Products Database', 14, 15);
      
      doc.setFontSize(10);
      doc.text('TROPIFRUIT UK LTD', 14, 25);
      doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 14, 30);
      doc.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 35);

      const tableData = data.map(row => [
        row['Sl.No'],
        row['Product Code'],
        row['Sage Code'],
        row['Product Description'],
        row['Unit Price'],
        row['Tax Rate'],
        row['Status']
      ]);

      autoTable(doc, {
        head: [['#', 'Product Code', 'Sage Code', 'Description', 'Unit Price', 'Tax Rate', 'Status']],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontStyle: 'bold'
        },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 25 },
          2: { cellWidth: 25 },
          3: { cellWidth: 80 },
          4: { cellWidth: 25 },
          5: { cellWidth: 25 },
          6: { cellWidth: 25 }
        }
      });

      const fileName = `Products_Database_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      toast({
        title: "Success",
        description: "Products data exported to PDF successfully."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: "Failed to export to PDF. Please try again."
      });
    }
  };

  const handlePrint = () => {
    let html = '';

    html += '<div class="header">';
    html += '<h2>Products Database</h2>';
    html += '</div>';

    html += '<div class="company-info">';
    html += '<strong>TROPIFRUIT UK LTD</strong><br>';
    html += '3 Dolphin Way, Purfleet, RM19 1NZ<br>';
    html += `Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    html += '</div>';

    html += '<table>';
    html += '<thead><tr>';
    html += '<th>#</th><th>Product Code</th><th>Sage Code</th><th>Description</th><th>Unit Price</th><th>Tax Rate</th><th>Status</th>';
    html += '</tr></thead><tbody>';

    filteredProducts.forEach((product, index) => {
      html += '<tr>';
      html += `<td>${index + 1}</td>`;
      html += `<td>${product.productCode}</td>`;
      html += `<td>${product.sageCode || ''}</td>`;
      html += `<td>${product.description}</td>`;
      html += `<td>£${(product.sellingPrice ?? 0).toFixed(2)}</td>`;
      html += `<td>${(product.taxRate ?? 0)}%</td>`;
      html += `<td>${product.status || 'Active'}</td>`;
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += `<div style="margin-top: 20px; font-size: 12px; color: #666;">Total Products: ${filteredProducts.length}</div>`;
    printHtmlTable('Products Database', html);
  };

  // When switching to add mode, set the next product code
  const handleAddProduct = () => {
    const productsArray = Array.isArray(products) ? products : [];
    const nextCode = getNextProductCode(productsArray);
    setActiveView("add");
    setEditingProduct(null);
    form.reset({
      productCode: nextCode,
      sageCode: nextCode,
      description: "",
      sellingPrice: 0,
      taxRate: 0,
      status: "active",
      stockLevelFlag: false,
      initialStock: 0,
    });
  };

  const handleDelete = (product: RegularProduct) => {
    if (window.confirm(`Are you sure you want to delete product '${product.productCode}'?`)) {
      deleteProductMutation.mutate(product.id);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading products...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error loading products</p>
          <p className="text-sm text-gray-500">{error.message}</p>
          <Button 
            onClick={() => window.location.reload()} 
            className="mt-4"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Products</h1>
        <div className="text-sm text-gray-500">
          TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
        </div>
      </div>

      <div className="mb-6">
        <div className="flex gap-2 mb-4">
          <Button 
            variant={activeView === "view" ? "default" : "outline"}
            onClick={() => {
              setActiveView("view");
              setEditingProduct(null);
              form.reset({
                productCode: "",
                description: "",
                sellingPrice: 0,
                taxRate: 0,
                status: "active",
                stockLevelFlag: false,
                initialStock: 0,
              });
            }}
            className="flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            View Products
          </Button>
          <Button 
            variant={activeView === "add" ? "default" : "outline"}
            onClick={handleAddProduct}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            {editingProduct ? "Edit Product" : "Add Products"}
          </Button>
          <Link href="/admin/view-nonproduct">
            <Button 
              variant="outline"
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              View NonProducts
            </Button>
          </Link>
          <Link href="/admin/add-nonproduct">
            <Button 
              variant="outline"
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add NonProducts
            </Button>
          </Link>
        </div>

        {activeView === "view" && (
          <>
            <div className="flex gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={() => handleExport("all")} disabled={isExporting}>
                <Eye className="h-4 w-4 mr-1" />
                Show All
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport("excel")} 
                className="text-green-600 hover:text-green-700"
                disabled={isExporting}
              >
                <Download className="h-4 w-4 mr-1" />
                {isExporting ? 'Exporting...' : 'Excel'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport("pdf")} 
                className="text-red-600 hover:text-red-700"
                disabled={isExporting}
              >
                <FileText className="h-4 w-4 mr-1" />
                {isExporting ? 'Generating...' : 'PDF'}
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleExport("print")} 
                className="text-blue-600 hover:text-blue-700"
                disabled={isExporting}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
              <div className="ml-auto">
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 border-r">Sl.No</th>
                        <th className="text-left p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort("productCode")}>
                          Product Code <SortIcon field="productCode" />
                        </th>
                        <th className="text-left p-3 border-r">Sage Code</th>
                        <th className="text-left p-3 border-r cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort("description")}>
                          Product Description <SortIcon field="description" />
                        </th>
                        <th className="text-left p-3 border-r">Unitprice</th>
                        <th className="text-left p-3 border-r">Tax</th>
                        <th className="text-left p-3 border-r">Edit</th>
                        <th className="text-left p-3 border-r">Delete</th>
                        <th className="text-left p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProducts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-gray-500">No products found.</td>
                        </tr>
                      ) : (
                        paginatedProducts.map((product: RegularProduct, index: number) => (
                          <tr key={product.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 border-r">{(currentPage - 1) * pageSize + index + 1}</td>
                            <td className="p-3 border-r">{product.productCode}</td>
                            <td className="p-3 border-r">{product.sageCode || ""}</td>
                            <td className="p-3 border-r">{product.description}</td>
                            <td className="p-3 border-r">£{(product.sellingPrice ?? 0).toFixed(2)}</td>
                            <td className="p-3 border-r">{(product.taxRate ?? 0)}%</td>
                            <td className="p-3 border-r">
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            </td>
                            <td className="p-3 border-r">
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(product)} disabled={deleteProductMutation.isPending}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                            <td className="p-3">
                              <Badge variant="secondary" className="bg-green-100 text-green-800">
                                {product.status}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <span>Show</span>
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                    <span>entries</span>
                  </div>
                  <div>
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredProducts.length)} of {filteredProducts.length} entries
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {activeView === "add" && (
          <Card>
            <CardHeader>
              <CardTitle>{editingProduct ? "Edit Product" : "Add Products"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="productCode">Product Code</Label>
                    <Input
                      id="productCode"
                      {...form.register("productCode")}
                      placeholder="P1"
                      required
                      readOnly
                    />
                  </div>
                  <div>
                    <Label htmlFor="sageCode">Sage Code</Label>
                    <Input
                      id="sageCode"
                      {...form.register("sageCode")}
                      placeholder="Enter Sage Code"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="hsCode">HS Commodity Code</Label>
                    <Input
                      id="hsCode"
                      {...form.register("hsCode")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Product Description</Label>
                    <Input
                      id="description"
                      {...form.register("description")}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="sellingPrice">Selling Price</Label>
                    <Input
                      id="sellingPrice"
                      type="number"
                      {...form.register("sellingPrice")}
                      step="0.01"
                      min="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="taxRate">Tax / Vat %</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      {...form.register("taxRate")}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div>
                    <Label htmlFor="vatCode">VAT Code</Label>
                    <Input
                      id="vatCode"
                      {...form.register("vatCode")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="unitOfPurchase">Unit of Purchase</Label>
                    <Input
                      id="unitOfPurchase"
                      {...form.register("unitOfPurchase")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="unitOfSale">Unit of Sale</Label>
                    <Input
                      id="unitOfSale"
                      {...form.register("unitOfSale")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      {...form.register("location")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="nominalCode">Nominal Code</Label>
                    <Input
                      id="nominalCode"
                      {...form.register("nominalCode")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="stockCategory">Stock Category Number</Label>
                    <Input
                      id="stockCategory"
                      {...form.register("stockCategory")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="departmentNumber">Department Number</Label>
                    <Input
                      id="departmentNumber"
                      {...form.register("departmentNumber")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="supplierRef">Supplier Ref</Label>
                    <Input
                      id="supplierRef"
                      {...form.register("supplierRef")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="supplierPartNumber">Supplier part number</Label>
                    <Input
                      id="supplierPartNumber"
                      {...form.register("supplierPartNumber")}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="reorderLevel">Re-Order Level</Label>
                      <Input
                        id="reorderLevel"
                        type="number"
                        {...form.register("reorderLevel")}
                        min="0"
                      />
                    </div>
                    <div className="pt-2">
                      <Label htmlFor="stockLevelFlag" className="mr-2">Stock Level Flag</Label>
                      <Controller
                        name="stockLevelFlag"
                        control={form.control}
                        render={({ field }) => (
                          <Switch
                            id="stockLevelFlag"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="commodityCode">Commodity Code</Label>
                    <Input
                      id="commodityCode"
                      {...form.register("commodityCode")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="unitWeight">Unit Weight</Label>
                    <Input
                      id="unitWeight"
                      type="number"
                      {...form.register("unitWeight")}
                      min="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="stockTakeDate">Stock Take Date</Label>
                    <Input
                      id="stockTakeDate"
                      type="date"
                      {...form.register("stockTakeDate")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="reorderQuantity">Re-order Quantity</Label>
                    <Input
                      id="reorderQuantity"
                      type="number"
                      {...form.register("reorderQuantity")}
                      min="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastStockTake">Qty last Stock take</Label>
                    <Input
                      id="lastStockTake"
                      type="number"
                      {...form.register("lastStockTake")}
                      min="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="initialStock">Initial Stock</Label>
                    <Input
                      id="initialStock"
                      type="number"
                      {...form.register("initialStock")}
                      min="0"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={createProductMutation.isPending || updateProductMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {editingProduct ? "Update Product" : "Save Product"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {activeView === "viewNonProducts" && (
          <div className="min-h-screen bg-gray-50">
            <div className="p-6">
              

              <Card>
                <CardContent className="p-0">
                  <div className="p-4 border-b flex items-center justify-between">
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">Show all rows</Button>
                      <Button variant="outline" size="sm">Excel</Button>
                      <Button variant="outline" size="sm">PDF</Button>
                      <Button variant="outline" size="sm">Print</Button>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">Search:</span>
                      <Input placeholder="Search..." className="w-48" />
                    </div>
                  </div>
                  
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sl.No</TableHead>
                        <TableHead>Product Code</TableHead>
                        <TableHead>Sage Code</TableHead>
                        <TableHead>Product Description</TableHead>
                        <TableHead>Selling Price</TableHead>
                        <TableHead>Tax/Vat</TableHead>
                        <TableHead>Edit</TableHead>
                        <TableHead>Delete</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nonProducts.map((item) => (
                        <TableRow key={item.slNo} className="hover:bg-gray-50">
                          <TableCell>{item.slNo}</TableCell>
                          <TableCell className="text-blue-600">{item.productCode}</TableCell>
                          <TableCell>{item.sageCode}</TableCell>
                          <TableCell className="text-blue-600">{item.description}</TableCell>
                          <TableCell>{item.sellingPrice}</TableCell>
                          <TableCell>{item.taxVat}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="text-blue-600">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-green-100 text-green-800">
                              {item.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  <div className="p-4 border-t flex items-center justify-between">
                    <span className="text-sm text-gray-500">Showing 1 to 23 of 23 entries</span>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">Previous</Button>
                      <Button variant="outline" size="sm" className="bg-blue-600 text-white">1</Button>
                      <Button variant="outline" size="sm">Next</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeView === "addNonProducts" && (
          <div className="min-h-screen bg-gray-50">
            <div className="p-6">
             

              <Card>
                <CardHeader>
                  <CardTitle className="text-center text-blue-600">Add NonProducts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Product Code</label>
                        <Input placeholder="Z1018" />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Sage Code</label>
                        <Input placeholder="Z1018" />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Product Description</label>
                        <Select>
                          <SelectTrigger>
                            <SelectValue placeholder="Select description" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="transport">Transport</SelectItem>
                            <SelectItem value="discount">Discount</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                            <SelectItem value="rent">Rent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Selling Price</label>
                        <Input type="number" step="0.01" />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Tax/Vat %</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">VAT Code</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Unit of Purchase</label>
                        <Input placeholder="1" />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Unit of Sale</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Location</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Nominal Code</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Stock Category Number</label>
                        <Input />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Department Number</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Supplier Ref</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Supplier part number</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Reorder level</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Ignore Stock level flag</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Commodity Code</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Unit Weight</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Stock Take Date</label>
                        <Input type="date" />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Re-order Quantity</label>
                        <Input />
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">Qty last Stock take</label>
                        <Input />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <Button className="bg-green-600 hover:bg-green-700 text-white px-8">
                      Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}