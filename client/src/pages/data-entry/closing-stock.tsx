import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useBackdatePermissions } from "@/hooks/usePermissions";
import { formatQuantity } from "@/lib/utils";
import { isPastDate } from "@/lib/utils";
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

export default function ClosingStock() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Backdate permissions
  const { canEditBackdate, canDeleteBackdate } = useBackdatePermissions();
  const { businessDate } = useBusinessDate();
  const [selectedDate, setSelectedDate] = useState("");
  
  useEffect(() => {
    if (businessDate && !selectedDate) {
      setSelectedDate(format(new Date(businessDate), "yyyy-MM-dd"));
    }
  }, [businessDate]);
  const [editItems, setEditItems] = useState<any[]>([]);
  const initializedRef = useRef(false);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);

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

  // Reset initialization when date changes
  useEffect(() => {
    initializedRef.current = false;
  }, [selectedDate]);

  // Populate editItems when data is ready (only once per date) — includes ALL products
  useEffect(() => {
    if (!selectedDate || currentStock.length === 0) return;
    if (initializedRef.current) return;

    const savedMap = new Map<number, { quantity: number }>();
    closingStockEntries.forEach((e: any) => {
      savedMap.set(e.productId, { quantity: e.quantity });
    });

    const items = currentStock.map(p => {
      const saved = savedMap.get(p.id);
      return {
        productId: p.id,
        productType: p.productType,
        quantity: saved ? saved.quantity : p.currentStock,
        description: p.description,
        productCode: p.productCode,
        currentStock: p.currentStock,
      };
    });

    setEditItems(items);
    initializedRef.current = true;
  }, [selectedDate, currentStock, closingStockEntries]);

  // Derived display list based on filter
  const displayItems = showAllProducts
    ? editItems
    : editItems.filter(item => item.currentStock > 0);

  const savedProductIds = new Set(closingStockEntries.map((e: any) => e.productId));

  const handleQuantityChange = (productId: number, value: string) => {
    if (value === "") {
      setEditItems(prev =>
        prev.map(item =>
          item.productId === productId ? { ...item, quantity: "" } : item
        )
      );
      return;
    }
    const qty = parseFloat(value);
    if (isNaN(qty)) return;
    setEditItems(prev =>
      prev.map(item =>
        item.productId === productId ? { ...item, quantity: qty } : item
      )
    );
  };

  const handleSaveEntry = async (productId: number, productType: string, qty: number | string) => {
    if (isPastDate(selectedDate) && !canEditBackdate) {
      toast({ title: "Error", description: "You don't have permission to edit past dates.", variant: "destructive" });
      return;
    }
    const quantity = qty === "" ? 0 : qty;
    try {
      const items = [
        ...closingStockEntries.filter((e: any) => e.productId !== productId),
        { productId, productType, quantity },
      ];
      await apiRequest("POST", "/api/closing-stock", { date: selectedDate, items });
      toast({ title: "Saved", description: "Closing stock entry saved." });
      initializedRef.current = false;
      refetch();
    } catch (error) {
      toast({ title: "Error", description: "Failed to save entry.", variant: "destructive" });
    }
  };

  const handleDeleteEntry = async (productId: number) => {
    if (isPastDate(selectedDate) && !canDeleteBackdate) {
      toast({ title: "Error", description: "You don't have permission to delete past date entries.", variant: "destructive" });
      return;
    }
    try {
      const items = closingStockEntries
        .filter((e: any) => e.productId !== productId)
        .map((e: any) => ({
          productId: e.productId,
          productType: e.productType,
          quantity: e.quantity,
        }));
      await apiRequest("POST", "/api/closing-stock", { date: selectedDate, items });
      toast({ title: "Deleted", description: "Closing stock entry deleted." });
      setDeleteConfirm(null);
      initializedRef.current = false;
      refetch();
    } catch (error: any) {
      toast({ title: "Error", description: error?.error || "Failed to delete entry.", variant: "destructive" });
    }
  };

  // Print handler
  const handlePrint = () => {
    const items = editItems.length > 0 ? editItems : closingStockEntries;
    const printWindow = window.open('', '', 'height=600,width=900');
    let html = `<div style='font-weight:bold;font-size:18px;margin-bottom:12px;'>Closing Stock</div>`;
    html += `<table style='width:100%;border-collapse:collapse;'>`;
    html += `<thead><tr><th style='border:1px solid #ccc;padding:8px;'>Product</th><th style='border:1px solid #ccc;padding:8px;'>Current Stock</th><th style='border:1px solid #ccc;padding:8px;'>Closing Quantity</th></tr></thead><tbody>`;
    items.forEach((item: any) => {
      html += '<tr>';
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.description || item.productId}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.currentStock ?? '-'}</td>`;
      html += `<td style='border:1px solid #ccc;padding:8px;'>${item.quantity}</td>`;
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
    const items = editItems.length > 0 ? editItems : closingStockEntries;
    const wsData = [
      ['Closing Stock'],
      ['Product', 'Current Stock', 'Closing Quantity'],
      ...items.map((item: any) => ([
        item.description || item.productId,
        item.currentStock ?? '-',
        item.quantity,
      ])),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock');
    XLSX.writeFile(wb, 'closing-stock.xlsx');
  };

  // PDF handler
  const handlePDF = () => {
    const items = editItems.length > 0 ? editItems : closingStockEntries;
    const doc = new jsPDF();
    doc.text('Closing Stock', 14, 16);
    autoTable(doc, {
      head: [['Product', 'Current Stock', 'Closing Quantity']],
      body: items.map((item: any) => [
        item.description || item.productId,
        item.currentStock ?? '-',
        item.quantity,
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

        {/* Filter Toggle */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant={showAllProducts ? "outline" : "default"}
            onClick={() => setShowAllProducts(false)}
            size="sm"
          >
            Positive Stock
          </Button>
          <Button
            variant={showAllProducts ? "default" : "outline"}
            onClick={() => setShowAllProducts(true)}
            size="sm"
          >
            All Products
          </Button>
        </div>

        {/* Closing Stock Table */}
        <Table id="closing-stock-table" className="w-full border border-gray-300 rounded-lg shadow-sm">
          <TableHeader>
            <TableRow className="bg-gray-100 border-b border-gray-300">
              <TableHead className="font-bold text-gray-700 text-base py-3 px-4 border-r border-gray-300">Product</TableHead>
              <TableHead className="font-bold text-gray-700 text-base py-3 px-4 border-r border-gray-300">Current Stock</TableHead>
              <TableHead className="font-bold text-gray-700 text-base py-3 px-4 border-r border-gray-300">Closing Quantity</TableHead>
              <TableHead className="font-bold text-gray-700 text-base py-3 px-4">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-gray-500 py-4">
                  {isLoadingStock || isLoadingClosing ? 'Loading...' : 'No products found.'}
                </TableCell>
              </TableRow>
            ) : (
              displayItems.map((item: any, idx: number) => {
                const isSaved = savedProductIds.has(item.productId);
                return (
                  <TableRow
                    key={item.productId}
                    className={
                      idx % 2 === 0
                        ? "bg-white border-b border-gray-200 hover:bg-gray-50"
                        : "bg-gray-50 border-b border-gray-200 hover:bg-gray-100"
                    }
                  >
                    <TableCell className="py-2 px-4 font-medium border-r border-gray-200">
                      {item.description} ({item.productCode})
                    </TableCell>
                    <TableCell className="py-2 px-4 border-r border-gray-200 font-semibold">
                      {formatQuantity(item.currentStock)}
                    </TableCell>
                    <TableCell className="py-2 px-4 border-r border-gray-200">
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(item.productId, e.target.value)}
                        className="w-24"
                        min="0"
                        step="any"
                        disabled={isPastDate(selectedDate) && !canEditBackdate}
                      />
                    </TableCell>
                    <TableCell className="py-2 px-4">
                      <div className="flex gap-2">
                        {(!isPastDate(selectedDate) || canEditBackdate) ? (
                          <Button size="sm" onClick={() => handleSaveEntry(item.productId, item.productType, item.quantity)}>
                            Save
                          </Button>
                        ) : (
                          <Button size="sm" disabled className="opacity-50">Save</Button>
                        )}
                        {isSaved && (
                          deleteConfirm === item.productId ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="destructive" onClick={() => handleDeleteEntry(item.productId)}>
                                Confirm
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            (!isPastDate(selectedDate) || canDeleteBackdate) && (
                              <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDeleteConfirm(item.productId)}>
                                Delete
                              </Button>
                            )
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
