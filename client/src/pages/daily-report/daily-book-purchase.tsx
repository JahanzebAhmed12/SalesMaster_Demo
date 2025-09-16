import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { useBackdatePermissions } from "@/hooks/usePermissions";
import { isPastDate } from "@/lib/utils";
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
import { useBusinessDate } from "@/hooks/use-business-date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLocation } from "wouter";

interface PurchaseEntry {
  id: number;
  slNo: number;
  date: string;
  supplier: string;
  supplierId: number; 
  invNo: number;
  invoiceAmt: number;
}

export default function DailyBookPurchase() {
  const { toast } = useToast();
  
  // Initialize with current date, will be updated when businessDate loads
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  
  // Get business date with formatting utilities
  const { 
    businessDate, 
    isLoading: isLoadingBusinessDate, 
    formatForApi 
  } = useBusinessDate();

  const [filters, setFilters] = useState({
    fromDate: format(new Date(), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    search: "",
  });
  
  const handleFromDateChange = (date: Date | undefined) => {
    if (date) {
      const formattedDate = format(date, 'yyyy-MM-dd');
      setFromDate(date);
      setFilters(prev => ({ 
        ...prev, 
        fromDate: formattedDate 
      }));
    }
  };

  const handleToDateChange = (date: Date | undefined) => {
    if (date) {
      const formattedDate = format(date, 'yyyy-MM-dd');
      setToDate(date);
      setFilters(prev => ({ 
        ...prev, 
        toDate: formattedDate 
      }));
    }
  };

  // Update dates when business date changes
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      try {
        const businessDateObj = new Date(businessDate);
        if (isNaN(businessDateObj.getTime())) {
          console.error('Invalid business date:', businessDate);
          return;
        }
        
        // Format the date for the API
        const formattedDate = format(businessDateObj, 'yyyy-MM-dd');
        
        // Update both the date states and filters
        setFromDate(businessDateObj);
        setToDate(businessDateObj);
        setFilters(prev => ({
          ...prev,
          fromDate: formattedDate,
          toDate: formattedDate
        }));
      } catch (error) {
        console.error('Error processing business date:', error);
      }
    }
  }, []);

  const [user, setUser] = useState<any>(null);
  const [dailyBookType, setDailyBookType] = useState<'all' | 'own' | null>(null);
  const [loadingUserType, setLoadingUserType] = useState(true);
  const [filteredPurchaseData, setFilteredPurchaseData] = useState<PurchaseEntry[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'invNo', direction: 'desc' });
  const [, navigate] = useLocation();

  // Backdate permissions
  const { canEditBackdate } = useBackdatePermissions();

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

  // Sort function
  const sortData = (data: PurchaseEntry[]) => {
    if (!sortConfig) return data;
    
    return [...data].sort((a, b) => {
      const aValue = a[sortConfig.key as keyof PurchaseEntry];
      const bValue = b[sortConfig.key as keyof PurchaseEntry];
      
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  useEffect(() => {
    if (loadingUserType) return;
    let filteredData = [...purchaseData];
    
    if (dailyBookType === 'own' && user) {
      filteredData = filteredData.filter((item) => item.supplier === user.username);
    }
    
    setFilteredPurchaseData(sortData(filteredData));
  }, [purchaseData, dailyBookType, user, loadingUserType, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortableHeader = ({ label, sortKey }: { label: string; sortKey: string }) => (
    <div 
      className="flex items-center cursor-pointer hover:text-primary"
      onClick={() => requestSort(sortKey)}
    >
      {label}
      {sortConfig?.key === sortKey && (
        <span className="ml-1">
          {sortConfig.direction === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </div>
  );

  const handleSearch = () => {
    setFilters({
      fromDate: format(fromDate, "yyyy-MM-dd"),
      toDate: format(toDate, "yyyy-MM-dd"),
      search: searchTerm,
    });
  };

  const totalInvoiceAmount = purchaseData.reduce((sum, item) => sum + item.invoiceAmt, 0);

  const tableRef = useRef<HTMLDivElement>(null);

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Daily Book Purchase</title>');
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
      printWindow.document.write('<h3>DAILY BOOK PURCHASE</h3>');
      printWindow.document.write(`<p>Period: ${filters.fromDate || 'All'} to ${filters.toDate || 'All'}</p>`);
      printWindow.document.write('</div>');
      
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      const headers = ['Date', 'Supplier', 'Inv.No', 'Invoice Amt'];
      headers.forEach(h => {
        printWindow.document.write(`<th>${h}</th>`);
      });
      printWindow.document.write('</tr></thead><tbody>');
      filteredPurchaseData.forEach(item => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.date}</td>`);
        printWindow.document.write(`<td>${item.supplier}</td>`);
        printWindow.document.write(`<td>${item.invNo}</td>`);
        printWindow.document.write(`<td>£${item.invoiceAmt.toFixed(2)}</td>`);
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
    doc.text('DAILY BOOK PURCHASE', 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.text(`Period: ${filters.fromDate || 'All'} to ${filters.toDate || 'All'}`, 105, yPosition, { align: 'center' });
    yPosition += 10;
    
    // Add table
    autoTable(doc, {
      head: [[
        'Date', 'Supplier', 'Inv.No', 'Invoice Amt'
      ]],
      body: filteredPurchaseData.map((item: PurchaseEntry) => [
        item.date,
        item.supplier,
        item.invNo,
        `£${item.invoiceAmt.toFixed(2)}`
      ]),
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 50 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 }
      }
    });
    
    doc.save(`daily-book-purchase-${filters.fromDate || 'all'}-${filters.toDate || 'all'}.pdf`);
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
                    <TableHead className="text-center">
                      <SortableHeader label="Inv.No" sortKey="invNo" />
                    </TableHead>
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
                          <TableCell className="text-center">
                            {(!isPastDate(item.date) || canEditBackdate) ? (
                              <Button
                                variant="link"
                                className="p-0 text-blue-600 underline"
                                onClick={() => navigate(`/data-entry/purchase-invoice?purchaseId=${item.invNo}&edit=true`)}
                              >
                                {item.invNo}
                              </Button>
                            ) : (
                              <span className="text-gray-500">{item.invNo}</span>
                            )}
                          </TableCell>
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