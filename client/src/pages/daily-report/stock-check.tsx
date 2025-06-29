import { useState, useEffect, useRef } from "react";
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
import { CalendarIcon, ClipboardCheck, FileText, Download, Copy, Printer, Search, Check, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StockItem {
  id: number;
  slNo: number;
  productDescription: string;
  os: number;
  ns: number;
  sales: number;
  crtn: number;
  dmps: number;
  srtn: number;
  stock: number;
  clStock: number;
  result: string;
  status: 'correct' | 'short' | 'excess';
  productType: 'regular' | 'non';
}

export default function StockCheck() {
  const [osDate, setOsDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [stockFilter, setStockFilter] = useState("Show All");
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const tableRef = useRef<HTMLDivElement>(null);

  // Query for stock check data
  const { data: stockData = [], isLoading, error, refetch } = useQuery<StockItem[]>({
    queryKey: ["stock-check", format(osDate, "yyyy-MM-dd"), format(toDate, "yyyy-MM-dd"), searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        fromDate: format(osDate, "yyyy-MM-dd"),
        toDate: format(toDate, "yyyy-MM-dd"),
        search: searchTerm
      });
      
      return apiRequest("GET", `/api/reports/stock-check?${params}`);
    },
    enabled: false, // Don't auto-fetch, wait for user to click search
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 3
  });

  const handleSearch = () => {
    refetch();
  };

  const handleExport = (format: string) => {
    toast({
      title: "Export",
      description: `Exporting to ${format} format...`,
    });
  };

  const filteredData = stockData.filter(item => {
    if (stockFilter === "Short") return item.status === 'short';
    if (stockFilter === "Excess") return item.status === 'excess';
    return true; // Show All
  });

  const totals = {
    os: filteredData.reduce((sum, item) => sum + item.os, 0),
    ns: filteredData.reduce((sum, item) => sum + item.ns, 0),
    sales: filteredData.reduce((sum, item) => sum + item.sales, 0),
    crtn: filteredData.reduce((sum, item) => sum + item.crtn, 0),
    dmps: filteredData.reduce((sum, item) => sum + item.dmps, 0),
    srtn: filteredData.reduce((sum, item) => sum + item.srtn, 0),
    stock: filteredData.reduce((sum, item) => sum + item.stock, 0),
    clStock: filteredData.reduce((sum, item) => sum + item.clStock, 0)
  };

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
    const ws = XLSX.utils.json_to_sheet(filteredData.map((item: StockItem) => ({
      'Sl.No': item.slNo,
      'Product Description': item.productDescription,
      'O.S': item.os,
      'N.S': item.ns,
      'Sales': item.sales,
      'C.RTN': item.crtn,
      'Dmps': item.dmps,
      'S.RTN': item.srtn,
      'Stock': item.stock,
      'Cl.Stock': item.clStock,
      'Result': item.result
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Check');
    XLSX.writeFile(wb, 'stock-check.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.text('Stock Check', 14, 16);
    autoTable(doc, {
      head: [[
        'Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result'
      ]],
      body: filteredData.map((item: StockItem) => [
        item.slNo,
        item.productDescription,
        item.os,
        item.ns,
        item.sales,
        item.crtn,
        item.dmps,
        item.srtn,
        item.stock,
        item.clStock,
        item.result
      ]),
      startY: 22,
    });
    doc.save('stock-check.pdf');
  };

  const handleCopy = () => {
    const header = ['Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result'];
    const rows = filteredData.map((item: StockItem) => [
      item.slNo,
      item.productDescription,
      item.os,
      item.ns,
      item.sales,
      item.crtn,
      item.dmps,
      item.srtn,
      item.stock,
      item.clStock,
      item.result
    ]);
    const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    alert('Table copied to clipboard!');
  };

  return (
    <PageLayout title="Stock Check" breadcrumb="Daily Report > Stock Check">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck size={20} />
                Stock Check
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>OS Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !osDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {osDate ? format(osDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={osDate}
                      onSelect={(date) => date && setOsDate(date)}
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
              
              <div>
                <Select value={stockFilter} onValueChange={setStockFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Show All">Show All</SelectItem>
                    <SelectItem value="Short">Short</SelectItem>
                    <SelectItem value="Excess">Excess</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Button 
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={handleSearch}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Search"
                  )}
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2"
                  onClick={() => handleExport('print')}
                >
                  <Printer size={16} />
                  Print
                </Button>
                <Button 
                  className="bg-cyan-500 hover:bg-cyan-600 flex items-center gap-2 text-white"
                  onClick={() => handleExport('template')}
                >
                  Template
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="text-red-600">
                <h3 className="font-medium">Error Loading Stock Check Data</h3>
                <p className="text-sm mt-1">
                  {error instanceof Error ? error.message : "Failed to load stock check data"}
                </p>
                <Button 
                  onClick={() => refetch()}
                  className="mt-2"
                  size="sm"
                >
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stock Table */}
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
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                  <Printer size={14} /> Print
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search:"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-48"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" ref={tableRef}>
              <div style={{ margin: '24px 0 24px 0', padding: '12px 24px', fontWeight: 500, background: '#f8fafc', borderRadius: 8 }}>
                Date Range: {format(osDate, 'yyyy-MM-dd')} to {format(toDate, 'yyyy-MM-dd')}<br />
                Showing: {filteredData.length} items | Totals - O.S: {totals.os}, N.S: {totals.ns}, Sales: {totals.sales}, Stock: {totals.stock}, Cl.Stock: {totals.clStock}
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-2">Loading stock check data...</span>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {stockData.length === 0 ? 
                    "No stock check data available. Please select dates and click Search." : 
                    "No products match your current filter."
                  }
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sl.No</TableHead>
                      <TableHead>Product Description</TableHead>
                      <TableHead className="text-center">O.S</TableHead>
                      <TableHead className="text-center">N.S</TableHead>
                      <TableHead className="text-center">Sales</TableHead>
                      <TableHead className="text-center">C.RTN</TableHead>
                      <TableHead className="text-center">Dmps</TableHead>
                      <TableHead className="text-center">S.RTN</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="text-center">Cl.Stock</TableHead>
                      <TableHead className="text-center">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.slNo}</TableCell>
                        <TableCell>
                          <div>
                            {item.productDescription}
                            <div className="text-xs text-gray-500">
                              {item.productType === 'regular' ? 'Regular Product' : 'Non-Product'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{item.os}</TableCell>
                        <TableCell className="text-center">{item.ns}</TableCell>
                        <TableCell className="text-center">{item.sales}</TableCell>
                        <TableCell className="text-center">{item.crtn}</TableCell>
                        <TableCell className="text-center">{item.dmps}</TableCell>
                        <TableCell className="text-center">{item.srtn}</TableCell>
                        <TableCell className="text-center">{item.stock}</TableCell>
                        <TableCell className="text-center">{item.clStock}</TableCell>
                        <TableCell className="text-center">
                          {item.result === "✓" ? (
                            <Check size={16} className="mx-auto text-green-600" />
                          ) : (
                            <span className={item.status === 'short' ? "text-red-600" : "text-orange-600"}>
                              {item.result}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    
                    {/* Total Row */}
                    <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                      <TableCell></TableCell>
                      <TableCell className="font-bold">TOTAL</TableCell>
                      <TableCell className="text-center font-bold">{totals.os}</TableCell>
                      <TableCell className="text-center font-bold">{totals.ns}</TableCell>
                      <TableCell className="text-center font-bold">{totals.sales}</TableCell>
                      <TableCell className="text-center font-bold">{totals.crtn}</TableCell>
                      <TableCell className="text-center font-bold">{totals.dmps}</TableCell>
                      <TableCell className="text-center font-bold">{totals.srtn}</TableCell>
                      <TableCell className="text-center font-bold">{totals.stock}</TableCell>
                      <TableCell className="text-center font-bold">{totals.clStock}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}