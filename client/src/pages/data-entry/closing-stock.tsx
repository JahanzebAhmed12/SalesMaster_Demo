import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Package, Calendar, FileText, Download, Copy, Printer, Search, Save, Plus, AlertTriangle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface StockItem {
  id: number;
  productCode: string;
  description: string;
  productType: 'regular' | 'non';
  currentStock: number;
  reorderLevel: number;
  unitOfSale: string | null;
  location: string | null;
}

interface StockAdjustment {
  productId: number;
  productType: 'regular' | 'non';
  adjustmentType: 'increase' | 'decrease' | 'set';
  quantity: number;
  reason: string;
  remarks?: string;
  adjustmentDate: string;
}

interface ClosingStockData {
  date: string;
  items: {
    [key: string]: {
      regular: { [key: number]: number };
      non: { [key: number]: number };
    };
  };
}

export default function ClosingStock() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [stockData, setStockData] = useState<{ [key: number]: number | undefined }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productFilter, setProductFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [adjustmentDialog, setAdjustmentDialog] = useState<{
    open: boolean;
    product: StockItem | null;
    adjustment: Partial<StockAdjustment>;
  }>({
    open: false,
    product: null,
    adjustment: {}
  });

  // Fetch current stock
  const { data: currentStock = [], isLoading: isLoadingStock } = useQuery<StockItem[]>({
    queryKey: ["currentStock"],
    queryFn: async () => {
      return await apiRequest("GET", "/api/stock/current");
    },
  });

  // Fetch closing stock for selected date
  const { data: closingStock, isLoading: isLoadingClosing } = useQuery<ClosingStockData>({
    queryKey: ["closingStock", selectedDate],
    queryFn: async () => {
      const response = await fetch(`/api/stock/closing?date=${selectedDate}`);
      if (!response.ok) throw new Error("Failed to fetch closing stock");
      return response.json();
    },
    enabled: !!selectedDate,
  });

  // Update stock data when closing stock is loaded, but only if user hasn't started editing
  useEffect(() => {
    if (
      closingStock &&
      Array.isArray(closingStock) &&
      Object.keys(stockData).length === 0
    ) {
      const initialData: { [key: number]: number } = {};
      closingStock.forEach((cs: any) => {
        initialData[cs.id] = cs.closingStock;
      });
      setStockData(initialData);
    }
  }, [closingStock, selectedDate]);

  // Handle stock adjustment
  const handleStockChange = (productId: number, value: string) => {
    setStockData((prev) => ({
      ...prev,
      [productId]: value === "" ? undefined : parseInt(value, 10),
    }));
  };

  // Save closing stock
  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      const adjustments = Object.entries(stockData).map(([productId, quantity]) => {
        const product = currentStock.find((item) => item.id === parseInt(productId));
        return {
          productId: parseInt(productId),
          productType: product?.productType || "regular",
          adjustmentType: "set",
          quantity: quantity,
          reason: "Closing stock adjustment",
          adjustmentDate: selectedDate,
        };
      });

      // Send each adjustment as a separate request
      for (const adj of adjustments) {
        await apiRequest("POST", "/api/stock/adjust", adj);
        toast({
          title: "Success",
          description: `Closing stock for product ${adj.productId} saved successfully`,
        });
      }

      // Refresh data
      queryClient.invalidateQueries({ queryKey: ["currentStock"] });
      queryClient.invalidateQueries({ queryKey: ["closingStock"] });
      toast({
        title: "All Done",
        description: "All closing stock adjustments have been saved.",
      });
    } catch (error) {
      let errorMsg = "Unknown error";
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === "string") {
        errorMsg = error;
      }
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fetch company details for dynamic address
  const { data: companyDetails } = useQuery({
    queryKey: ["company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // Stock adjustment mutation
  const adjustStockMutation = useMutation({
    mutationFn: (adjustment: StockAdjustment) => 
      apiRequest('POST', '/api/stock/adjust', adjustment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock', 'current'] });
      toast({
        title: "Success",
        description: "Stock adjusted successfully",
      });
      setAdjustmentDialog({ open: false, product: null, adjustment: {} });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to adjust stock",
        variant: "destructive",
      });
    }
  });

  // Filter stock data
  const filteredData = currentStock.filter((item: StockItem) => {
    const matchesSearch = item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.productCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = productFilter === "all" || 
                         (productFilter === "available" && item.currentStock > 0) ||
                         (productFilter === "low" && item.currentStock <= item.reorderLevel);
    
    return matchesSearch && matchesFilter;
  });

  // For linter: explicitly type filteredData for export handlers
  const filteredDataTyped: StockItem[] = filteredData;

  const handleAdjustment = (product: StockItem) => {
    setAdjustmentDialog({
      open: true,
      product,
      adjustment: {
        productId: product.id,
        productType: product.productType,
        adjustmentType: 'set',
        quantity: product.currentStock,
        reason: '',
        adjustmentDate: selectedDate
      }
    });
  };

  const saveAdjustment = () => {
    if (!adjustmentDialog.product || !adjustmentDialog.adjustment.reason) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    adjustStockMutation.mutate(adjustmentDialog.adjustment as StockAdjustment);
  };

  const totalItems = filteredData.length;
  const totalQuantity = filteredData.reduce((sum: number, item: StockItem) => sum + item.currentStock, 0);
  const lowStockItems = filteredData.filter((item: StockItem) => item.currentStock <= item.reorderLevel);

  // Print handler
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    let html = `<div style='font-weight:bold;font-size:18px;margin-bottom:12px;'>Current Stock</div>`;
    html += `<table style='width:100%;border-collapse:collapse;'>`;
    html += `<thead><tr>`;
    const headers = ['Product', 'Type', 'Current Stock', 'Reorder Level', 'Unit', 'Location'];
    headers.forEach(h => {
      html += `<th style='border:1px solid #ccc;padding:8px;'>${h}</th>`;
    });
    html += `</tr></thead><tbody>`;
    filteredDataTyped.forEach((item) => {
      html += '<tr>';
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.description} (${item.productCode})</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.productType}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.currentStock}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.reorderLevel}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.unitOfSale || '-'}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.location || '-'}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
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

  // Excel handler
  const handleExcel = () => {
    const wsData = [
      ['Current Stock'],
      ['Product', 'Type', 'Current Stock', 'Reorder Level', 'Unit', 'Location'],
      ...filteredDataTyped.map((item) => ([
        `${item.description} (${item.productCode})`,
        item.productType,
        item.currentStock,
        item.reorderLevel,
        item.unitOfSale || '-',
        item.location || '-',
      ])),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock');
    XLSX.writeFile(wb, 'closing-stock.xlsx');
  };

  // PDF handler
  const handlePDF = () => {
    const doc = new jsPDF();
    doc.text('Current Stock', 14, 16);
    autoTable(doc, {
      head: [[
        'Product', 'Type', 'Current Stock', 'Reorder Level', 'Unit', 'Location'
      ]],
      body: filteredDataTyped.map((item) => [
        `${item.description} (${item.productCode})`,
        item.productType,
        item.currentStock,
        item.reorderLevel,
        item.unitOfSale || '-',
        item.location || '-',
      ]),
      startY: 22,
    });
    doc.save('closing-stock.pdf');
  };

  if (isLoadingStock || isLoadingClosing) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <PageLayout title="Closing Stock" breadcrumb="Closing Stock">
      <div className="space-y-6">
        {/* Controls Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package size={20} />
              Closing Stock Management
              <span className="ml-auto text-sm text-gray-500 font-normal">
                {companyDetails?.companyName || "Company Name"}, {companyDetails?.address1 || ""}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div>
                <Label htmlFor="stockDate">Date</Label>
                <Input
                  id="stockDate"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <Label htmlFor="productFilter">Products</Label>
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    <SelectItem value="available">Available Products</SelectItem>
                    <SelectItem value="low">Low Stock Items</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex items-end gap-2">
                <Button className="flex items-center gap-2" onClick={handlePrint}>
                  <Printer size={16} />
                  Print
                </Button>
                <Button variant="outline" className="flex items-center gap-2" onClick={handlePDF}>
                  <FileText size={16} />
                  PDF
                </Button>
                <Button variant="outline" className="flex items-center gap-2" onClick={handleExcel}>
                  <Download size={16} />
                  Excel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{totalItems}</div>
              <div className="text-sm text-gray-600">Total Products</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{totalQuantity}</div>
              <div className="text-sm text-gray-600">Total Stock</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">{lowStockItems.length}</div>
              <div className="text-sm text-gray-600">Low Stock Items</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">
                {filteredData.filter((item: StockItem) => item.currentStock > 0).length}
              </div>
              <div className="text-sm text-gray-600">In Stock</div>
            </CardContent>
          </Card>
        </div>

        {/* Stock Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Current Stock</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Search products..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingStock ? (
              <div className="text-center py-8">Loading stock data...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-center">Current Stock</TableHead>
                    <TableHead className="text-center">Reorder Level</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item: StockItem) => (
                    <TableRow key={item.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium">
                        <div>
                          <div>{item.description}</div>
                          <div className="text-sm text-gray-500">{item.productCode}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${
                          item.productType === 'regular' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {item.productType}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className={`font-semibold ${
                          item.currentStock <= item.reorderLevel 
                            ? 'text-red-600' 
                            : item.currentStock === 0 
                            ? 'text-gray-500' 
                            : 'text-green-600'
                        }`}>
                          {item.currentStock}
                        </div>
                        {item.currentStock <= item.reorderLevel && (
                          <AlertTriangle className="inline-block w-4 h-4 text-red-500 ml-1" />
                        )}
                      </TableCell>
                      <TableCell className="text-center">{item.reorderLevel}</TableCell>
                      <TableCell>{item.unitOfSale || '-'}</TableCell>
                      <TableCell>{item.location || '-'}</TableCell>
                      <TableCell className="text-center">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleAdjustment(item)}
                          className="flex items-center gap-1"
                        >
                          <Plus size={14} />
                          Adjust
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>{totalItems} Items</div>
              <div className="flex items-center gap-4">
                <span>Showing {filteredData.length} of {currentStock.length} entries</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock Adjustment Dialog */}
        <Dialog open={adjustmentDialog.open} onOpenChange={(open) => 
          setAdjustmentDialog(prev => ({ ...prev, open }))
        }>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Adjust Stock</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {adjustmentDialog.product && (
                <>
                  <div>
                    <Label>Product</Label>
                    <div className="text-sm text-gray-600">
                      {adjustmentDialog.product.description} ({adjustmentDialog.product.productCode})
                    </div>
                  </div>
                  
                  <div>
                    <Label>Current Stock</Label>
                    <div className="text-sm text-gray-600">
                      {adjustmentDialog.product.currentStock} {adjustmentDialog.product.unitOfSale || 'units'}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="adjustmentType">Adjustment Type</Label>
                    <Select 
                      value={adjustmentDialog.adjustment.adjustmentType} 
                      onValueChange={(value) => setAdjustmentDialog(prev => ({
                        ...prev,
                        adjustment: { ...prev.adjustment, adjustmentType: value as any }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="increase">Increase</SelectItem>
                        <SelectItem value="decrease">Decrease</SelectItem>
                        <SelectItem value="set">Set to</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      value={adjustmentDialog.adjustment.quantity || ''}
                      onChange={(e) => setAdjustmentDialog(prev => ({
                        ...prev,
                        adjustment: { ...prev.adjustment, quantity: parseInt(e.target.value) || 0 }
                      }))}
                      min="0"
                    />
                  </div>

                  <div>
                    <Label htmlFor="reason">Reason *</Label>
                    <Input
                      id="reason"
                      value={adjustmentDialog.adjustment.reason || ''}
                      onChange={(e) => setAdjustmentDialog(prev => ({
                        ...prev,
                        adjustment: { ...prev.adjustment, reason: e.target.value }
                      }))}
                      placeholder="e.g., Stock take, Damage, etc."
                    />
                  </div>

                  <div>
                    <Label htmlFor="remarks">Remarks</Label>
                    <Textarea
                      id="remarks"
                      value={adjustmentDialog.adjustment.remarks || ''}
                      onChange={(e) => setAdjustmentDialog(prev => ({
                        ...prev,
                        adjustment: { ...prev.adjustment, remarks: e.target.value }
                      }))}
                      placeholder="Additional notes..."
                      rows={3}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setAdjustmentDialog({ open: false, product: null, adjustment: {} })}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={saveAdjustment}
                      disabled={adjustStockMutation.isPending}
                    >
                      {adjustStockMutation.isPending ? 'Saving...' : 'Save Adjustment'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>Closing Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              className="mb-4"
              onClick={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Closing Stock"}
            </Button>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead className="text-right">Closing Stock</TableHead>
                  <TableHead>Unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentStock.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-left">{item.productCode}</TableCell>
                    <TableCell className="text-left">{item.description}</TableCell>
                    <TableCell className="text-left">{item.location || "-"}</TableCell>
                    <TableCell className="text-right">{item.currentStock}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={stockData[item.id] === undefined ? "" : stockData[item.id]}
                        onChange={(e) => handleStockChange(item.id, e.target.value)}
                        className="w-24 text-right"
                        min={0}
                      />
                    </TableCell>
                    <TableCell className="text-left">{item.unitOfSale || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}