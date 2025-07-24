import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Package, FileText, Download, Copy, Printer, Search, Eye, Settings, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLocation } from "wouter";

interface PurchaseEntry {
  id: number;
  slNo: number;
  date: string;
  supplier: string;
  supplierId: number; // Add this line
  invNo: number;
  invoiceAmt: number;
}

export default function DailyBookPurchase() {
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  
  const [filters, setFilters] = useState({
    fromDate: format(new Date(), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    search: "",
  });

  const [user, setUser] = useState<any>(null);
  const [dailyBookType, setDailyBookType] = useState<'all' | 'own' | null>(null);
  const [loadingUserType, setLoadingUserType] = useState(true);
  const [filteredPurchaseData, setFilteredPurchaseData] = useState<PurchaseEntry[]>([]);
  const [, navigate] = useLocation();

  // Fetch purchase data
  const {
    data: purchaseData = [],
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<PurchaseEntry[]>({
    queryKey: ["/api/reports/daily-book-purchase", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.fromDate) params.append("fromDate", filters.fromDate);
      if (filters.toDate) params.append("toDate", filters.toDate);
      if (filters.search) params.append("search", filters.search);
      return apiRequest("GET", `/api/reports/daily-book-purchase?${params.toString()}`);
    },
  });

  useEffect(() => {
    async function fetchUserAndType() {
      setLoadingUserType(true);
      try {
        const userRes = await apiRequest("GET", "/api/auth/me");
        setUser(userRes);
        const typeRes = await apiRequest("GET", `/api/user-daily-book-type/${userRes.id}`);
        setDailyBookType(typeRes.type || 'all');
      } catch (e) {
        setDailyBookType('all');
      } finally {
        setLoadingUserType(false);
      }
    }
    fetchUserAndType();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (loadingUserType) return;
    if (dailyBookType === 'own' && user) {
      // If your purchase data has a 'purchaser' or 'username' field, use that. Here, we use 'supplier' as placeholder.
      setFilteredPurchaseData(purchaseData.filter((item) => item.supplier === user.username));
    } else {
      setFilteredPurchaseData(purchaseData);
    }
  }, [purchaseData, dailyBookType, user, loadingUserType]);

  const handleSearch = () => {
    setFilters({
      fromDate: format(fromDate, "yyyy-MM-dd"),
      toDate: format(toDate, "yyyy-MM-dd"),
      search: searchTerm,
    });
  };

  const totalInvoiceAmount = purchaseData.reduce((sum, item) => sum + item.invoiceAmt, 0);

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
    const ws = XLSX.utils.json_to_sheet(purchaseData.map((item: PurchaseEntry) => ({
      'Date': item.date,
      'Supplier': item.supplier,
      'Inv.No': item.invNo,
      'Invoice Amt': item.invoiceAmt
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Book Purchase');
    XLSX.writeFile(wb, 'daily-book-purchase.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.text('Daily Book Purchase', 14, 16);
    autoTable(doc, {
      head: [[
        'Date', 'Supplier', 'Inv.No', 'Invoice Amt'
      ]],
      body: purchaseData.map((item: PurchaseEntry) => [
        item.date,
        item.supplier,
        item.invNo,
        item.invoiceAmt
      ]),
      startY: 22,
    });
    // Add summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || 22;
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(12, finalY + 6, 185, 12, 'F');
    doc.setTextColor(40);
    doc.setFont('helvetica', 'bold');
    doc.text(`Date Range:`, 16, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`${filters.fromDate || '-'} to ${filters.toDate || '-'}`, 46, finalY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Invoice Amount:`, 90, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`£${totalInvoiceAmount.toFixed(2)}`, 140, finalY + 14);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.save('daily-book-purchase.pdf');
  };

  const handleCopy = () => {
    const header = ['Date', 'Supplier', 'Inv.No', 'Invoice Amt'];
    const rows = purchaseData.map((item: PurchaseEntry) => [
      item.date,
      item.supplier,
      item.invNo,
      item.invoiceAmt
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

  if (loadingUserType) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin mr-2" /> Loading user settings...
      </div>
    );
  }

  return (
    <PageLayout title="Newstock" breadcrumb="Daily Report > Daily Book Purchase">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Package size={20} />
                Newstock
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
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
                <Button 
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={handleSearch}
                  disabled={isLoading}
                >
                  {isLoading ? "Searching..." : "Search"}
                </Button>
              </div>
              <div>
                <Button
                  className="hidden md:inline-flex ml-2"
                  variant="default"
                  onClick={() => navigate("/daily-report/product-purchase-full-view")}
                >
                  Full View
                </Button>
              </div>
              
              <div></div>
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
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-center">Inv.No</TableHead>
                    <TableHead className="text-center">Invoice Amt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Loading purchase data...
                      </TableCell>
                    </TableRow>
                  ) : filteredPurchaseData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        No purchase data found for the selected date range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPurchaseData.map((item) => {
                      console.log('Purchase item:', item); // Debug supplierId presence
                      return (
                        <TableRow key={item.id}>
                          <TableCell>{item.date}</TableCell>
                          <TableCell>
                            {item.supplierId ? (
                              <Button variant="link" className="p-0 text-blue-600 underline" onClick={() => navigate(`/daily-report/supplier-purchase-history/${item.supplierId}`)}>
                                {item.supplier}
                              </Button>
                            ) : (
                              <span>{item.supplier}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{item.invNo}</TableCell>
                          <TableCell className="text-center">£{item.invoiceAmt.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">{filteredPurchaseData.length} Items</TableCell>
                    <TableCell className="text-center font-bold"></TableCell>
                    <TableCell className="text-center font-bold">£{filteredPurchaseData.reduce((sum, item) => sum + item.invoiceAmt, 0).toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
            {/* Summary below table, styled for print and screen */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mt-6 p-4 bg-gray-50 rounded-lg border print:mt-6 print:p-4 print:bg-white print:border print:rounded-lg print:flex-row print:items-center print:gap-x-8 print:gap-y-2">
              <div className="flex items-center font-semibold mr-2">Date Range:</div>
              <div className="mr-6">{filters.fromDate || '-'} to {filters.toDate || '-'}</div>
              <div className="flex items-center font-semibold mr-2">Total Invoice Amount:</div>
              <div>£{totalInvoiceAmount.toFixed(2)}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}