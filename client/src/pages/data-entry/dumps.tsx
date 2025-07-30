import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Trash2, FileText, Download, Copy, Printer, Search, Save, Info, Loader2, Package, BarChart3, PoundSterling, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DumpEntry, InsertDumpEntry, Supplier } from "@shared/schema";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Product {
  id: number;
  description: string;
  productType: 'regular' | 'non';
}

export default function Dumps() {
  const [fromDate, setFromDate] = useState<Date | undefined>(new Date());
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [newDump, setNewDump] = useState({
    supplierId: "none",
    productType: "regular" as 'regular' | 'non',
    productId: "",
    description: "",
    remarks: "",
    quantity: 0,
    unitPrice: 0
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch data
  const { data: dumpEntries = [], isLoading, refetch } = useQuery({
    queryKey: ['dump-entries', fromDate, toDate, selectedSupplier, searchTerm],
    queryFn: () => apiRequest('GET', `/api/dump-entries?fromDate=${format(fromDate || new Date(), "yyyy-MM-dd")}&toDate=${format(toDate || new Date(), "yyyy-MM-dd")}&supplierId=${selectedSupplier !== "all" ? selectedSupplier : ""}&search=${searchTerm}`)
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiRequest('GET', '/api/suppliers')
  });

  const { data: products = { regularProducts: [], nonProducts: [] } } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiRequest('GET', '/api/products')
  });

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Mutations
  const createDumpMutation = useMutation({
    mutationFn: (data: InsertDumpEntry) => apiRequest('POST', '/api/dump-entries', data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Dump entry created successfully",
      });
      refetch();
      setIsDialogOpen(false);
      setNewDump({
        supplierId: "none",
        productType: "regular",
        productId: "",
        description: "",
        remarks: "",
        quantity: 0,
        unitPrice: 0
      });
    },
    onError: (error: any) => {
      const errorMsg =
        error?.error ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to create dump entry";
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
    }
  });

  const deleteDumpMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/dump-entries/${id}`),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Dump entry deleted successfully",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete dump entry",
        variant: "destructive",
      });
    }
  });

  // Filter products based on product type
  const filteredProducts = useMemo(() => {
    if (newDump.productType === 'regular') {
      return products?.regularProducts || [];
    } else {
      return products?.nonProducts || [];
    }
  }, [newDump.productType, products]);

  const handleAddDump = () => {
    if (!newDump.productId || !newDump.description || newDump.quantity <= 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const dumpData: InsertDumpEntry = {
      refNumber: "", // Will be generated by backend
      date: format(fromDate || new Date(), "yyyy-MM-dd"),
      supplierId: newDump.supplierId && newDump.supplierId !== "none" ? parseInt(newDump.supplierId) : null,
      productId: parseInt(newDump.productId),
      productType: newDump.productType,
      description: newDump.description,
      remarks: newDump.remarks,
      quantity: newDump.quantity,
      unitPrice: newDump.unitPrice,
      totalValue: newDump.quantity * newDump.unitPrice
    };

    createDumpMutation.mutate(dumpData);
  };

  const handleDeleteDump = (id: number) => {
    if (confirm("Are you sure you want to delete this dump entry?")) {
      deleteDumpMutation.mutate(id);
    }
  };

  const totalItems = dumpEntries.length;
  const totalQuantity = dumpEntries.reduce((sum: number, item: DumpEntry) => sum + item.quantity, 0);
  const totalValue = dumpEntries.reduce((sum: number, item: DumpEntry) => sum + item.totalValue, 0);

  const allProducts = [
    ...(products?.regularProducts || []).map((p: any) => ({ ...p, productType: 'regular' as const })),
    ...(products?.nonProducts || []).map((p: any) => ({ ...p, productType: 'non' as const }))
  ];

  // Export handlers
  const exportTitle = 'Dump Entries';

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Dump Entries</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.company-details{text-align:center;margin-bottom:30px;line-height:1.4;}.totals{font-weight:bold;background-color:#f9f9f9;}</style>');
      printWindow.document.write('</head><body>');
      
      // Add company details header following the specific structure
      printWindow.document.write('<div class="company-details">');
      if (companyDetails) {
        // Company name
        printWindow.document.write(`<h2>${companyDetails.companyName || ''}</h2>`);
        
        // Email
        if (companyDetails.email) {
          printWindow.document.write(`<p>${companyDetails.email}</p>`);
        }
        
        // Bank details
        if (companyDetails.bankDetails) {
          printWindow.document.write(`<p>${companyDetails.bankDetails}</p>`);
        }
        
        // VAT and Registration info
        let regInfo = [];
        if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
        if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
        if (regInfo.length > 0) printWindow.document.write(`<p>${regInfo.join(' | ')}</p>`);
      }
      printWindow.document.write('</div>');
      
      // Add report title
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h3>DUMPS</h3>');
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : 'All'} to ${toDate ? format(toDate, "dd/MM/yyyy") : 'All'}</p>`);
      printWindow.document.write('</div>');
      
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      const headers = ['Ref No', 'Date', 'Supplier', 'Product', 'Description', 'Remarks', 'Quantity', 'Unit Price', 'Total Value'];
      headers.forEach(h => {
        printWindow.document.write(`<th>${h}</th>`);
      });
      printWindow.document.write('</tr></thead><tbody>');
      dumpEntries.forEach((item: DumpEntry) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.refNumber}</td>`);
        printWindow.document.write(`<td>${item.date}</td>`);
        printWindow.document.write(`<td>${item.supplierName || 'N/A'}</td>`);
        printWindow.document.write(`<td>${item.productType}</td>`);
        printWindow.document.write(`<td>${item.description}</td>`);
        printWindow.document.write(`<td>${item.remarks || 'N/A'}</td>`);
        printWindow.document.write(`<td>${item.quantity}</td>`);
        printWindow.document.write(`<td>£${item.unitPrice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${item.totalValue.toFixed(2)}</td>`);
        printWindow.document.write('</tr>');
      });
      printWindow.document.write('</tbody></table>');
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
      [exportTitle],
      ['Ref No', 'Date', 'Supplier', 'Product', 'Description', 'Remarks', 'Quantity', 'Unit Price', 'Total Value'],
      ...dumpEntries.map((item: DumpEntry) => ([
        item.refNumber,
        item.date,
        item.supplierName || 'N/A',
        item.productType,
        item.description,
        item.remarks || 'N/A',
        item.quantity,
        item.unitPrice,
        item.totalValue,
      ])),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dump Entries');
    XLSX.writeFile(wb, 'dump-entries.xlsx');
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
    doc.text('DUMPS', 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : 'All'} to ${toDate ? format(toDate, "dd/MM/yyyy") : 'All'}`, 105, yPosition, { align: 'center' });
    yPosition += 10;
    
    // Add table
    autoTable(doc, {
      head: [[
        'Ref No', 'Date', 'Supplier', 'Product', 'Description', 'Remarks', 'Quantity', 'Unit Price', 'Total Value'
      ]],
      body: dumpEntries.map((item: DumpEntry) => [
        item.refNumber,
        item.date,
        item.supplierName || 'N/A',
        item.productType,
        item.description,
        item.remarks || 'N/A',
        item.quantity,
        `£${item.unitPrice.toFixed(2)}`,
        `£${item.totalValue.toFixed(2)}`,
      ]),
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 20 },
        2: { cellWidth: 25 },
        3: { cellWidth: 20 },
        4: { cellWidth: 30 },
        5: { cellWidth: 25 },
        6: { cellWidth: 15 },
        7: { cellWidth: 20 },
        8: { cellWidth: 20 }
      }
    });
    
    doc.save(`dumps-${fromDate ? format(fromDate, "yyyyMMdd") : 'all'}-${toDate ? format(toDate, "yyyyMMdd") : 'all'}.pdf`);
  };

  return (
    <PageLayout title="Dumps" breadcrumb="Dumps">
      <div className="w-full max-w-full overflow-x-auto px-2 sm:px-4 space-y-6">
        {/* Page Title and Company Details Row */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dumps</h1>
          <div className="text-sm text-gray-600 text-right">
            {companyDetails?.companyName || 'Company Name'}, {companyDetails?.address1 || ''}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ''}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="w-full max-w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems}</div>
              <p className="text-xs text-muted-foreground">
                Dump entries in selected period
              </p>
            </CardContent>
          </Card>

          <Card className="w-full max-w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Quantity</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalQuantity}</div>
              <p className="text-xs text-muted-foreground">
                Total quantity dumped
              </p>
            </CardContent>
          </Card>

          <Card className="w-full max-w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <PoundSterling className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">£{totalValue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                Total value of dumped items
              </p>
            </CardContent>
          </Card>

          <Card className="w-full max-w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                £{totalItems > 0 ? (totalValue / totalItems).toFixed(2) : "0.00"}
              </div>
              <p className="text-xs text-muted-foreground">
                Average value per item
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="w-full max-w-full">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Date Range */}
              <div className="space-y-2">
                <Label>From Date</Label>
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
                      {fromDate ? format(fromDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>To Date</Label>
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
                      {toDate ? format(toDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Supplier Filter */}
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliers.map((supplier: Supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id.toString()}>
                        {supplier.supplier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Type Filter */}
              <div className="space-y-2">
                <Label>Product Type</Label>
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="regular">Regular Products</SelectItem>
                    <SelectItem value="non">Non-Products</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search */}
            <div className="mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by description or remarks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dump Entries Table */}
        <Card className="w-full max-w-full">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Dump Entries</CardTitle>
              <div className="flex gap-2 items-center">
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                  <FileText size={14} /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                  <Download size={14} /> Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                  <Printer size={14} /> Print
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => setIsDialogOpen(true)}>
                      <Save className="h-4 w-4 mr-2" />Add Dump
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Dump Entry</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label>Supplier</Label>
                          <Select 
                            value={newDump.supplierId} 
                            onValueChange={(value) => setNewDump({...newDump, supplierId: value})}
                          >
                            <SelectTrigger className="w-full min-w-[90px] sm:min-w-[110px] md:min-w-[120px] h-8">
                              <SelectValue placeholder="Select Supplier" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Supplier</SelectItem>
                              {suppliers.map((supplier: Supplier) => (
                                <SelectItem key={supplier.id} value={supplier.id.toString()}>
                                  {supplier.supplier_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Product Type</Label>
                          <Select 
                            value={newDump.productType} 
                            onValueChange={(value: 'regular' | 'non') => setNewDump({...newDump, productType: value, productId: ""})}
                          >
                            <SelectTrigger className="w-full min-w-[80px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="regular">Regular</SelectItem>
                              <SelectItem value="non">Non</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Product</Label>
                          <Select 
                            value={newDump.productId} 
                            onValueChange={(value) => setNewDump({...newDump, productId: value})}
                          >
                            <SelectTrigger className="w-full min-w-[150px] h-8">
                              <SelectValue placeholder="Select Product" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredProducts.map((product: any) => (
                                <SelectItem key={product.id} value={product.id.toString()}>
                                  {product.description}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Description</Label>
                          <Input
                            placeholder="Description"
                            value={newDump.description}
                            onChange={(e) => setNewDump({...newDump, description: e.target.value})}
                            className="w-full min-w-[150px] h-8"
                          />
                        </div>
                        <div>
                          <Label>Remarks</Label>
                          <Input
                            placeholder="Remarks"
                            value={newDump.remarks}
                            onChange={(e) => setNewDump({...newDump, remarks: e.target.value})}
                            className="w-full min-w-[120px] h-8"
                          />
                        </div>
                        <div>
                          <Label>Quantity</Label>
                          <Input
                            type="number"
                            value={newDump.quantity}
                            onChange={(e) => setNewDump({...newDump, quantity: parseInt(e.target.value) || 0})}
                            className="w-full min-w-[80px] text-center h-8"
                            min="0"
                          />
                        </div>
                        <div>
                          <Label>Unit Price</Label>
                          <Input
                            type="number"
                            value={newDump.unitPrice}
                            onChange={(e) => setNewDump({...newDump, unitPrice: parseFloat(e.target.value) || 0})}
                            className="w-full min-w-[100px] text-center h-8"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <div>
                          <Label>Total Value</Label>
                          <Input
                            value={`£${(newDump.quantity * newDump.unitPrice).toFixed(2)}`}
                            className="w-full min-w-[100px] text-center h-8 bg-gray-100"
                            readOnly
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        onClick={handleAddDump}
                        disabled={createDumpMutation.isPending}
                      >
                        {createDumpMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="w-full overflow-x-auto max-h-[600px] overflow-y-auto">
                <Table className="w-full">
                  <TableHeader className="sticky top-0 bg-white z-10">
                    <TableRow>
                      <TableHead className="min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">Ref No</TableHead>
                      <TableHead className="min-w-[80px] sm:min-w-[100px] md:min-w-[120px]">Date</TableHead>
                      <TableHead className="min-w-[90px] sm:min-w-[110px] md:min-w-[120px]">Supplier</TableHead>
                      <TableHead className="min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">Product</TableHead>
                      <TableHead className="min-w-[100px] sm:min-w-[120px] md:min-w-[150px]">Description</TableHead>
                      <TableHead className="min-w-[80px] sm:min-w-[100px] md:min-w-[120px]">Remarks</TableHead>
                      <TableHead className="text-center min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">Quantity</TableHead>
                      <TableHead className="text-center min-w-[70px] sm:min-w-[90px] md:min-w-[100px]">Unit Price</TableHead>
                      <TableHead className="text-center min-w-[70px] sm:min-w-[90px] md:min-w-[100px]">Total Value</TableHead>
                      <TableHead className="text-center min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dumpEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                          No dump entries found
                        </TableCell>
                      </TableRow>
                    ) : (
                      dumpEntries.map((entry: DumpEntry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-sm min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">{entry.refNumber}</TableCell>
                          <TableCell className="text-sm min-w-[80px] sm:min-w-[100px] md:min-w-[120px]">{entry.date}</TableCell>
                          <TableCell className="text-sm min-w-[90px] sm:min-w-[110px] md:min-w-[120px]">{entry.supplierName || "N/A"}</TableCell>
                          <TableCell className="text-sm min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">{entry.productType}</TableCell>
                          <TableCell className="text-sm max-w-[100px] sm:max-w-[120px] md:max-w-[150px] truncate min-w-[100px] sm:min-w-[120px] md:min-w-[150px]" title={entry.description}>
                            {entry.description}
                          </TableCell>
                          <TableCell className="text-sm max-w-[80px] sm:max-w-[100px] md:max-w-[120px] truncate min-w-[80px] sm:min-w-[100px] md:min-w-[120px]" title={entry.remarks || ""}>
                            {entry.remarks || "N/A"}
                          </TableCell>
                          <TableCell className="text-center text-sm min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">{entry.quantity}</TableCell>
                          <TableCell className="text-center text-sm min-w-[70px] sm:min-w-[90px] md:min-w-[100px]">£{entry.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-center text-sm min-w-[70px] sm:min-w-[90px] md:min-w-[100px]">£{entry.totalValue.toFixed(2)}</TableCell>
                          <TableCell className="text-center min-w-[60px] sm:min-w-[80px] md:min-w-[100px]">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDeleteDump(entry.id)}
                              disabled={deleteDumpMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
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