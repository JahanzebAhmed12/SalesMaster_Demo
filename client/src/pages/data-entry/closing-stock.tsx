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
import { Package, Calendar, FileText, Download, Copy, Printer, Search, Save, Plus, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useBackdatePermissions } from "@/hooks/usePermissions";
import { isPastDate } from "@/lib/utils";
import { formatQuantity } from "@/lib/utils";
import { useBusinessDate } from "@/hooks/use-business-date";

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
  
  // Backdate permissions
  const { canEditBackdate, canDeleteBackdate } = useBackdatePermissions();
  const { businessDate } = useBusinessDate();
  const [selectedDate, setSelectedDate] = useState("");
  
  // Initialize with business date when available
  useEffect(() => {
    if (businessDate) {
      setSelectedDate(format(new Date(businessDate), "yyyy-MM-dd"));
    } else {
      setSelectedDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, []);
  const [addProductId, setAddProductId] = useState("");
  const [addQuantity, setAddQuantity] = useState("");
  const [editRowId, setEditRowId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [highlightedProduct, setHighlightedProduct] = useState(-1);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Fetch all products
  const { data: currentStock = [], isLoading: isLoadingStock } = useQuery<StockItem[]>({
    queryKey: ["currentStock"],
    queryFn: async () => await apiRequest("GET", "/api/stock/current"),
  });

  // Fetch closing stock for selected date (manual entry)
  const { data: closingStockEntries = [], isLoading: isLoadingClosing, refetch } = useQuery<any[]>({
    queryKey: ["closingStockEntries", selectedDate],
    queryFn: async () => await apiRequest("GET", `/api/closing-stock?date=${selectedDate}`),
    enabled: !!selectedDate,
  });

  // Add new closing stock entry
  const handleAddEntry = async () => {
    // Check backdate permissions
    if (isPastDate(selectedDate) && !canEditBackdate) {
      toast({ title: "Error", description: "You don't have permission to add entries for past dates.", variant: "destructive" });
      return;
    }
    
    if (!addProductId || !addQuantity) {
      toast({ title: "Error", description: "Select a product and enter quantity.", variant: "destructive" });
      return;
    }
    try {
      const items = [
        ...closingStockEntries.filter((e: any) => e.productId !== parseInt(addProductId)),
        {
          productId: parseInt(addProductId),
          productType: currentStock.find((p) => p.id === parseInt(addProductId))?.productType || "regular",
          quantity: parseFloat(addQuantity),
        },
      ];
      await apiRequest("POST", "/api/closing-stock", { date: selectedDate, items });
      toast({ title: "Saved", description: "Closing stock entry saved." });
      setAddProductId("");
      setAddQuantity("");
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save entry.", variant: "destructive" });
    }
  };

  // Edit closing stock entry
  const handleEditSave = async (entry: any) => {
    // Check backdate permissions
    if (isPastDate(selectedDate) && !canEditBackdate) {
      toast({ title: "Error", description: "You don't have permission to edit past date stock entries.", variant: "destructive" });
      return;
    }
    
    if (!editQuantity) {
      toast({ title: "Error", description: "Enter a valid quantity.", variant: "destructive" });
      return;
    }
    try {
      const items = closingStockEntries.map((e: any) =>
        e.productId === entry.productId
          ? { ...e, quantity: parseFloat(editQuantity) }
          : e
      );
      await apiRequest("POST", "/api/closing-stock", { date: selectedDate, items });
      toast({ title: "Updated", description: "Closing stock entry updated." });
      setEditRowId(null);
      setEditQuantity("");
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "Failed to update entry.", variant: "destructive" });
    }
  };

  // Delete closing stock entry
  const handleDeleteEntry = async (productId: number) => {
    // Check backdate permissions
    if (isPastDate(selectedDate) && !canDeleteBackdate) {
      toast({ title: "Error", description: "You don't have permission to delete past date stock entries.", variant: "destructive" });
      return;
    }
    
    try {
      const items = closingStockEntries
        .filter((e: any) => e.productId !== productId)
        .map((e: any) => ({
          productId: e.productId,
          productType: e.productType,
          quantity: e.quantity
        }));
      
      console.log('Sending delete request:', { date: selectedDate, items });
      
      await apiRequest("POST", "/api/closing-stock", { date: selectedDate, items });
      toast({ title: "Deleted", description: "Closing stock entry deleted." });
      setDeleteConfirm(null);
      refetch();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast({ title: "Error", description: error?.error || "Failed to delete entry.", variant: "destructive" });
    }
  };

  // Only allow products not already entered in the add row
  const enteredProductIds = closingStockEntries.map((e: any) => e.productId);
  const availableProducts = currentStock.filter((p) => !enteredProductIds.includes(p.id));

  // Filter products based on search term - only show when user starts typing
  const filteredProducts = searchTerm.trim() === "" 
    ? [] 
    : availableProducts.filter(product => 
        product.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
        product.productCode.toLowerCase().includes(searchTerm.toLowerCase())
      );

  // Keyboard navigation for product dropdown (from sales invoice)
  const handleProductKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showProductDropdown || filteredProducts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedProduct((prev) => (prev < filteredProducts.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedProduct((prev) => (prev > 0 ? prev - 1 : filteredProducts.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedProduct >= 0 && highlightedProduct < filteredProducts.length) {
        const p = filteredProducts[highlightedProduct];
        setAddProductId(p.id.toString());
        setSearchTerm(`${p.productCode} - ${p.description}`);
        setShowProductDropdown(false);
      }
    } else if (e.key === "Escape") {
      setShowProductDropdown(false);
    }
  };

  // Close dropdown on blur (with delay to allow click)
  const handleProductBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => setShowProductDropdown(false), 100);
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
      // setAdjustmentDialog({ open: false, product: null, adjustment: {} }); // This line was removed
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to adjust stock",
        variant: "destructive",
      });
    }
  });

  // For linter: explicitly type filteredData for export handlers
  // const filteredDataTyped: StockItem[] = filteredData; // This line was removed

  // const handleAdjustment = (product: StockItem) => { // This function was removed
  //   setAdjustmentDialog({
  //     open: true,
  //     product,
  //     adjustment: {
  //       productId: product.id,
  //       productType: product.productType,
  //       adjustmentType: 'set',
  //       quantity: product.currentStock,
  //       reason: '',
  //       adjustmentDate: selectedDate
  //     }
  //   });
  // };

  // const saveAdjustment = () => { // This function was removed
  //   if (!adjustmentDialog.product || !adjustmentDialog.adjustment.reason) {
  //     toast({
  //       title: "Error",
  //       description: "Please fill in all required fields",
  //       variant: "destructive",
  //     });
  //     return;
  //   }

  //   adjustStockMutation.mutate(adjustmentDialog.adjustment as StockAdjustment);
  // };

  // const totalItems = filteredData.length; // This line was removed
  // const totalQuantity = filteredData.reduce((sum: number, item: StockItem) => sum + item.currentStock, 0); // This line was removed
  // const lowStockItems = filteredData.filter((item: StockItem) => item.currentStock <= item.reorderLevel); // This line was removed

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
    // filteredDataTyped.forEach((item) => { // This line was removed
    //   html += '<tr>';
    //   html += `<td style='border:1px solid #ccc;padding:8px;'>${item.description} (${item.productCode})</td>`;
    //   html += `<td style='border:1px solid #ccc;padding:8px;'>${item.productType}</td>`;
    //   html += `<td style='border:1px solid #ccc;padding:8px;'>${item.currentStock}</td>`;
    //   html += `<td style='border:1px solid #ccc;padding:8px;'>${item.reorderLevel}</td>`;
    //   html += `<td style='border:1px solid #ccc;padding:8px;'>${item.unitOfSale || '-'}</td>`;
    //   html += `<td style='border:1px solid #ccc;padding:8px;'>${item.location || '-'}</td>`;
    //   html += '</tr>';
    // });
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
      ...closingStockEntries.map((item: any) => ([ // Changed to closingStockEntries
        `${item.productId}`, // Changed to item.productId
        item.productType,
        item.quantity,
        // item.reorderLevel, // Removed as per new_code
        // item.unitOfSale || '-', // Removed as per new_code
        // item.location || '-', // Removed as per new_code
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
      body: closingStockEntries.map((item: any) => [ // Changed to closingStockEntries
        `${item.productId}`, // Changed to item.productId
        item.productType,
        item.quantity,
        // item.reorderLevel, // Removed as per new_code
        // item.unitOfSale || '-', // Removed as per new_code
        // item.location || '-', // Removed as per new_code
      ]),
      startY: 22,
    });
    doc.save('closing-stock.pdf');
  };

  // Email send handler
  const handleSendEmail = async () => {
    if (!email) {
      toast({ title: "Error", description: "Please enter an email address.", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      const res = await apiRequest("POST", "/api/send/closing-stock", { date: selectedDate, email });
      toast({ title: "Email Sent", description: `Closing stock PDF sent to ${email}` });
      setEmail("");
    } catch (error: any) {
      toast({ title: "Error", description: error?.error || "Failed to send email.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  // Copy handler
  const handleCopy = () => {
    try {
      // Find the table element
      const table = document.querySelector("#closing-stock-table");
      if (!table) {
        toast({ title: "Error", description: "Table not found.", variant: "destructive" });
        return;
      }
      // Copy table text content
      let text = "";
      table.querySelectorAll("tr").forEach(row => {
        let rowText = Array.from(row.querySelectorAll("th,td")).map(cell => cell.textContent).join("\t");
        text += rowText + "\n";
      });
      navigator.clipboard.writeText(text);
      toast({ title: "Copied!", description: "Closing stock table copied to clipboard." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to copy table.", variant: "destructive" });
    }
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
      <div className="container mx-auto py-4">
        {/* Single Card for Closing Stock Actions */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Closing Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button onClick={handlePDF} className="bg-blue-600 text-white flex items-center gap-2"><i className="fa fa-file-pdf-o" /> PDF</Button>
                <Button onClick={handleExcel} className="bg-gray-200 text-black flex items-center gap-2"><i className="fa fa-download" /> Excel</Button>
                <Button onClick={handleCopy} className="bg-gray-200 text-black flex items-center gap-2"><i className="fa fa-copy" /> Copy</Button>
                <Button onClick={handlePrint} className="bg-gray-200 text-black flex items-center gap-2"><i className="fa fa-print" /> Print</Button>
              </div>
              {/* Email Field and Button */}
              <div className="flex gap-2 items-center">
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={isSending}
                  className="w-64"
                />
                <Button onClick={handleSendEmail} disabled={isSending || !email} className="bg-green-600 text-white">
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Send PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Date Picker */}
        <div className="flex items-center gap-4 mb-4">
          <Input
            id="stockDate"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-48"
          />
        </div>

        {/* Closing Stock Table */}
        <Table id="closing-stock-table" className="w-full border border-gray-300 rounded-lg overflow-hidden shadow-sm">
          <TableHeader>
            <TableRow className="bg-gray-100 border-b border-gray-300">
              <TableHead className="font-bold text-gray-700 text-base py-3 px-4 border-r border-gray-300">Product</TableHead>
              <TableHead className="font-bold text-gray-700 text-base py-3 px-4 border-r border-gray-300">Quantity</TableHead>
              <TableHead className="font-bold text-gray-700 text-base py-3 px-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Inline Add Row */}
            <TableRow className="bg-blue-50 border-b border-gray-300">
              <TableCell className="py-2 px-4 border-r border-gray-200">
                <div className="relative">
                  <Input
                    placeholder="Type to search products..."
                    value={searchTerm}
                    onChange={e => {
                      setSearchTerm(e.target.value);
                      setShowProductDropdown(true);
                      setAddProductId("");
                    }}
                    onFocus={() => setShowProductDropdown(!!searchTerm)}
                    onBlur={handleProductBlur}
                    onKeyDown={handleProductKeyDown}
                    autoComplete="off"
                    className="w-full border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                  />
                  {showProductDropdown && filteredProducts.length > 0 && (
                    <div className="absolute z-50 bg-white border rounded w-full mt-1 max-h-48 overflow-y-auto shadow">
                      {filteredProducts.map((p, idx) => (
                        <div
                          key={p.id}
                          className={`p-2 cursor-pointer flex items-center ${highlightedProduct === idx ? "bg-blue-100" : ""}`}
                          onMouseDown={() => {
                            setAddProductId(p.id.toString());
                            setSearchTerm(`${p.productCode} - ${p.description}`);
                            setShowProductDropdown(false);
                          }}
                          onMouseEnter={() => setHighlightedProduct(idx)}
                        >
                          <span className="font-mono text-xs text-gray-600">{p.productCode}</span>
                          <span className="ml-2">{p.description}</span>
                          <span className="ml-auto text-xs text-gray-500">Stock: {p.currentStock}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-2 px-4 border-r border-gray-200">
                <Input
                  type="number"
                  placeholder="Quantity"
                  value={addQuantity}
                  onChange={(e) => setAddQuantity(e.target.value)}
                  min="0"
                />
              </TableCell>
              <TableCell className="py-2 px-4">
                {(!isPastDate(selectedDate) || canEditBackdate) ? (
                  <Button onClick={() => { handleAddEntry(); setSearchTerm(""); }}>Save</Button>
                ) : (
                  <Button disabled className="opacity-50">Save</Button>
                )}
              </TableCell>
            </TableRow>
            {/* Existing Entries */}
            {closingStockEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-gray-500 py-4">No entries for this date.</TableCell>
              </TableRow>
            ) : (
              closingStockEntries.map((entry: any, idx: number) => {
                const product = currentStock.find((p) => p.id === entry.productId);
                const isEditing = editRowId === entry.productId;
                return isEditing ? (
                  <TableRow key={entry.productId} className="border-b border-gray-200 bg-yellow-50">
                    <TableCell className="py-2 px-4 font-medium border-r border-gray-200">{product ? `${product.description} (${product.productCode})` : entry.productId}</TableCell>
                    <TableCell className="py-2 px-4 border-r border-gray-200">
                                              <Input
                          type="number"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          className="w-24"
                          min="0"
                        />
                    </TableCell>
                    <TableCell className="py-2 px-4 flex gap-2">
                      <Button onClick={() => handleEditSave(entry)} size="sm">Save</Button>
                      <Button variant="outline" onClick={() => { setEditRowId(null); setEditQuantity(""); }} size="sm">Cancel</Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow
                    key={entry.productId}
                    className={
                      idx % 2 === 0
                        ? "bg-white border-b border-gray-200 hover:bg-gray-50"
                        : "bg-gray-50 border-b border-gray-200 hover:bg-gray-100"
                    }
                  >
                    <TableCell className="py-2 px-4 font-medium border-r border-gray-200">{product ? `${product.description} (${product.productCode})` : entry.productId}</TableCell>
                    <TableCell className="py-2 px-4 border-r border-gray-200 font-semibold">{formatQuantity(entry.quantity)}</TableCell>
                    <TableCell className="py-2 px-4">
                      <div className="flex gap-2">
                        {(!isPastDate(selectedDate) || canEditBackdate) && (
                          <Button size="sm" variant="outline" onClick={() => { setEditRowId(entry.productId); setEditQuantity(entry.quantity.toString()); }}>
                            Edit
                          </Button>
                        )}
                        {deleteConfirm === entry.productId ? (
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              onClick={() => handleDeleteEntry(entry.productId)}
                            >
                              Confirm
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => setDeleteConfirm(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          (!isPastDate(selectedDate) || canDeleteBackdate) && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => setDeleteConfirm(entry.productId)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </PageLayout>
  );
}