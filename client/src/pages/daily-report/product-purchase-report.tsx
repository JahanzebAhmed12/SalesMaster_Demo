import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ShoppingBag, FileText, Download, Copy, Printer, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PurchaseItem {
  id: number;
  slNo: number;
  productDescription: string;
  quantity: number;
  avgPrice: number;
  total: number;
}

export default function ProductPurchaseReport() {
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [showAll, setShowAll] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [filters, setFilters] = useState({
    fromDate: format(new Date(), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    showAll: "All",
    search: "",
  });

  // Fetch purchase data
  const {
    data: purchaseData = [],
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<PurchaseItem[]>({
    queryKey: ["/api/reports/product-purchase", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.fromDate) params.append("fromDate", filters.fromDate);
      if (filters.toDate) params.append("toDate", filters.toDate);
      if (filters.showAll) params.append("showAll", filters.showAll);
      if (filters.search) params.append("search", filters.search);
      return apiRequest("GET", `/api/reports/product-purchase?${params.toString()}`);
    },
  });

  const handleSearch = () => {
    setFilters({
      fromDate: format(fromDate, "yyyy-MM-dd"),
      toDate: format(toDate, "yyyy-MM-dd"),
      showAll: showAll,
      search: searchTerm,
    });
  };

  const totalQuantity = purchaseData.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = purchaseData.reduce((sum, item) => sum + item.total, 0);

  const tableRef = useRef<HTMLDivElement>(null);

  // Export handlers
  const handlePrint = () => {
    if (!tableRef.current) return;
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(printContents);
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
    const ws = XLSX.utils.json_to_sheet(purchaseData.map((item: PurchaseItem) => ({
      'Sl.No': item.slNo,
      'Product Description': item.productDescription,
      'Quantity': item.quantity,
      'AVG Price': item.avgPrice,
      'Total': item.total
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product Purchase Report');
    XLSX.writeFile(wb, 'product-purchase-report.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.text('Product Purchase Report', 14, 16);
    autoTable(doc, {
      head: [[
        'Sl.No', 'Product Description', 'Quantity', 'AVG Price', 'Total'
      ]],
      body: purchaseData.map((item: PurchaseItem) => [
        item.slNo,
        item.productDescription,
        item.quantity,
        item.avgPrice,
        item.total
      ]),
      startY: 22,
    });
    doc.save('product-purchase-report.pdf');
  };

  const handleCopy = () => {
    const header = ['Sl.No', 'Product Description', 'Quantity', 'AVG Price', 'Total'];
    const rows = purchaseData.map((item: PurchaseItem) => [
      item.slNo,
      item.productDescription,
      item.quantity,
      item.avgPrice,
      item.total
    ]);
    const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    alert('Table copied to clipboard!');
  };

  if (isError) {
    toast({
      title: "Error",
      description: (error as any)?.message || "Failed to fetch purchase data.",
      variant: "destructive",
    });
  }

  return (
    <PageLayout title="Purchase Report" breadcrumb="Daily Report > Product Purchase Report">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag size={20} />
                Purchase Report
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              <div style={{ minWidth: 180, flex: '1 1 180px' }}>
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
                      {fromDate ? format(fromDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={(date) => date && setFromDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div style={{ minWidth: 180, flex: '1 1 180px' }}>
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
                      {toDate ? format(toDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={(date) => date && setToDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div style={{ minWidth: 120, flex: '1 1 120px' }}>
                <Select value={showAll} onValueChange={setShowAll}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Show All">Show All</SelectItem>
                    <SelectItem value="All">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div style={{ minWidth: 160, flex: '2 1 160px' }}>
                <Input
                  placeholder="Search:"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2" style={{ minWidth: 320 }}>
                <Button
                  className="bg-blue-500 hover:bg-blue-600"
                  style={{ minWidth: 80 }}
                  onClick={handleSearch}
                  disabled={isLoading}
                >
                  {isLoading ? "Searching..." : "Search"}
                </Button>
                <Button
                  className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2"
                  style={{ minWidth: 70 }}
                  onClick={handlePrint}
                >
                  <Printer size={16} />
                  Print
                </Button>
                <Button
                  className="bg-cyan-500 hover:bg-cyan-600 flex items-center gap-2 text-white"
                  style={{ minWidth: 160 }}
                >
                  Compare with Purchase
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                  <FileText size={14} /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                  <Download size={14} /> Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                  <Copy size={14} /> Copy
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" ref={tableRef}>
              <div style={{ margin: '24px 0 24px 0', padding: '12px 24px', fontWeight: 500, background: '#f8fafc', borderRadius: 8 }}>
                Date Range: {filters.fromDate || '-'} to {filters.toDate || '-'}<br />
                Total Quantity: {totalQuantity} | Total Amount: £{totalAmount.toFixed(2)}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Product Description</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-center">AVG Price</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Loading purchase data...
                      </TableCell>
                    </TableRow>
                  ) : purchaseData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        No purchase data found for the selected date range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    purchaseData.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.slNo}</TableCell>
                        <TableCell>{item.productDescription}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-center">£{item.avgPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{item.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">{purchaseData.length} Items</TableCell>
                    <TableCell className="text-center font-bold">{totalQuantity}</TableCell>
                    <TableCell className="text-center font-bold"></TableCell>
                    <TableCell className="text-center font-bold">£{totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {purchaseData.length} of {purchaseData.length} entries</div>
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Previous</Button>
                  <Button variant="outline" size="sm" className="bg-blue-500 text-white">1</Button>
                  <Button variant="outline" size="sm">Next</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}