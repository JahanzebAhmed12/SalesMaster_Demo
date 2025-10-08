import { useState, useEffect, useRef } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, TrendingUp, FileText, Download, Printer, Search, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import { apiRequest } from "@/lib/queryClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useQuery } from "@tanstack/react-query";

interface SupplierAgingData {
  id: number;
  slNo: number;
  supplierName: string;
  totalOutstanding: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120: number;
  days180: number;
  over180: number;
  currency: string;
  supplierCode: string;
  address?: string;
  telephone?: string;
  email?: string;
}

interface ApiResponse {
  data: SupplierAgingData[];
  totals: {
    totalOutstanding: number;
    current: number;
    days30: number;
    days60: number;
    days90: number;
    days120: number;
    days180: number;
    over180: number;
  };
  pagination: {
    currentPage: number;
    perPage: number;
    totalRecords: number;
    totalPages: number;
    showingFrom: number;
    showingTo: number;
  };
  filters: {
    asOfDate: string;
    supplierFilter: string;
    searchTerm: string;
    currency: string;
  };
}

interface CompanyDetails {
  id: number;
  companyName: string;
  address1: string;
  address2?: string;
  telephone?: string;
  mobile?: string;
  fax?: string;
  website?: string;
  email?: string;
  vatNo?: string;
  compRegNo?: string;
  bankDetails?: string;
  einlNumber?: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export default function SupplierAgingRpt() {
  const { toast } = useToast();
  
  // Initialize with current date, will be updated when businessDate loads
  const [asOfDate, setAsOfDate] = useState<Date>(new Date());
  
  // Track if date was manually changed
  const asOfDateManuallyChanged = useRef(false);
  
  // Get business date with formatting utilities
  const { 
    businessDate, 
    isLoading: isLoadingBusinessDate, 
    formatForApi 
  } = useBusinessDate();
  const [supplierFilter, setSupplierFilter] = useState("All Suppliers");
  const [searchTerm, setSearchTerm] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([]);

  const [agingData, setAgingData] = useState<SupplierAgingData[]>([]);
  const [totals, setTotals] = useState({
    totalOutstanding: 0,
    current: 0,
    days30: 0,
    days60: 0,
    days90: 0,
    days120: 0,
    days180: 0,
    over180: 0
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    perPage: 10,
    totalRecords: 0,
    totalPages: 0,
    showingFrom: 0,
    showingTo: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tableSectionRef = useRef<HTMLDivElement>(null);

  // Update date when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      try {
        // Only update asOfDate if it hasn't been manually changed
        if (!asOfDateManuallyChanged.current && (!asOfDate || asOfDate.getTime() !== businessDate.getTime())) {
          setAsOfDate(new Date(businessDate));
        }
      } catch (error) {
        console.error('Error processing business date:', error);
      }
    }
  }, [businessDate, isLoadingBusinessDate]);

  // Handle date change
  const handleAsOfDateChange = (date: Date | undefined) => {
    if (date) {
      asOfDateManuallyChanged.current = true;
      setAsOfDate(date);
    }
  };

  // Format date for display
  const formatDateForDisplay = (date: Date | string | null | undefined, formatStr = 'dd/MM/yyyy') => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      return isNaN(d.getTime()) ? '' : format(d, formatStr);
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  // Fetch available currencies
  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const currencies = await apiRequest<string[]>("GET", "/api/reports/customer-currencies");
        setAvailableCurrencies(currencies);
      } catch (error) {
        console.error('Error fetching currencies:', error);
      }
    };
    fetchCurrencies();
  }, []);

  // Fetch aging data
  const fetchAgingData = async (page = 1) => {
    setLoading(true);
    setError(null);

    try {
      const formattedDate = asOfDate ? format(asOfDate, "yyyy-MM-dd") : "";
      const params = new URLSearchParams({
        asOfDate: formattedDate,
        supplierFilter,
        search: searchTerm,
        currency: currencyFilter === "all" ? "" : currencyFilter,
        page: page.toString(),
        perPage: pagination.perPage.toString()
      });

      const result: ApiResponse = await apiRequest(
        "GET",
        `/api/reports/supplier-aging?${params}`
      );

      setAgingData(result.data);
      setTotals(result.totals);
      setPagination(result.pagination);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
      toast({
        title: "Error",
        description: "Failed to fetch supplier aging data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle search
  const handleSearch = () => {
    fetchAgingData(1);
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    fetchAgingData(page);
  };

  // Handle search term change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAgingData(1);
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [searchTerm]);

  // Initial load and on filter/date/currency change
  useEffect(() => {
    fetchAgingData();
    // eslint-disable-next-line
  }, [supplierFilter, currencyFilter, asOfDate]);

  // Fetch company details
  const { data: company } = useQuery<CompanyDetails>({
    queryKey: ["company-details"],
    queryFn: async () => apiRequest("GET", "/api/company-details"),
  });

  // Export to Excel handler
  const handleExportExcel = () => {
    // Prepare data for Excel
    const excelData = agingData.map((item) => ({
      'Sl.No': item.slNo,
      'Supplier Name': item.supplierName,
      'Total Outstanding': item.totalOutstanding,
      'Current': item.current,
      '1-30 Days': item.days30,
      '31-60 Days': item.days60,
      '61-90 Days': item.days90,
      '91-120 Days': item.days120,
      '121-180 Days': item.days180,
      'Over 180 Days': item.over180,
      'Currency': item.currency
    }));
    
    // Add totals row
    excelData.push({
      'Sl.No': '',
      'Supplier Name': 'TOTAL',
      'Total Outstanding': totals.totalOutstanding,
      'Current': totals.current,
      '1-30 Days': totals.days30,
      '31-60 Days': totals.days60,
      '61-90 Days': totals.days90,
      '91-120 Days': totals.days120,
      '121-180 Days': totals.days180,
      'Over 180 Days': totals.over180,
      'Currency': ''
    });
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier Aging Report");
    
    // Save file
    XLSX.writeFile(wb, `supplier-aging-report-${format(asOfDate, "yyyyMMdd")}.xlsx`);
  };

  // Export to PDF handler
  const handleExportPDF = () => {
    // Use landscape orientation for better fit
    const doc = new jsPDF('landscape', 'mm', 'a4');
    let yPosition = 20;
    
    // Add report title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('SUPPLIER AGING REPORT', 148, yPosition, { align: 'center' }); // Center for landscape (297/2)
    yPosition += 12;
    
    // Add company details
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const companyName = company?.companyName || 'TROPIFRUIT UK LTD';
    const address = company?.address1 || '3 Dolphin Way, Purfleet, RM19 1NZ';
    doc.text(companyName + ', ' + address, 148, yPosition, { align: 'center' });
    yPosition += 8;
    
    // Add as of date
    doc.setFontSize(9);
    doc.text(`As of Date: ${asOfDate ? format(asOfDate, "dd/MM/yyyy") : ""}`, 148, yPosition, { align: 'center' });
    yPosition += 12;
    
    // Add table with optimized column widths for landscape
    autoTable(doc, {
      head: [[
        "Sl.No", "Supplier Name", "Total Outstanding", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "91-120 Days", "121-180 Days", "Over 180 Days", "Curr"
      ]],
      body: [
        ...agingData.map((row) => [
          row.slNo,
          row.supplierName.length > 25 ? row.supplierName.substring(0, 25) + '...' : row.supplierName,
          row.totalOutstanding.toFixed(2),
          row.current.toFixed(2),
          row.days30.toFixed(2),
          row.days60.toFixed(2),
          row.days90.toFixed(2),
          row.days120.toFixed(2),
          row.days180.toFixed(2),
          row.over180.toFixed(2),
          row.currency
        ]),
        // Add totals row
        [
          '',
          'TOTAL',
          totals.totalOutstanding.toFixed(2),
          totals.current.toFixed(2),
          totals.days30.toFixed(2),
          totals.days60.toFixed(2),
          totals.days90.toFixed(2),
          totals.days120.toFixed(2),
          totals.days180.toFixed(2),
          totals.over180.toFixed(2),
          ''
        ]
      ],
      startY: yPosition,
      margin: { left: 10, right: 10 },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: 'linebreak',
        cellWidth: 'wrap'
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },   // Sl.No
        1: { cellWidth: 50, halign: 'left' },     // Supplier Name
        2: { cellWidth: 25, halign: 'right' },    // Total Outstanding
        3: { cellWidth: 20, halign: 'right' },    // Current
        4: { cellWidth: 20, halign: 'right' },    // 1-30 Days
        5: { cellWidth: 20, halign: 'right' },    // 31-60 Days
        6: { cellWidth: 20, halign: 'right' },    // 61-90 Days
        7: { cellWidth: 20, halign: 'right' },    // 91-120 Days
        8: { cellWidth: 20, halign: 'right' },    // 121-180 Days
        9: { cellWidth: 20, halign: 'right' },    // Over 180 Days
        10: { cellWidth: 15, halign: 'center' }   // Currency
      },
      headStyles: {
        fillColor: [71, 85, 105],  // Slate color to match UI
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      // Style the totals row
      didParseCell: function (data) {
        if (data.row.index === agingData.length && data.cell.text[0] === 'TOTAL') {
          data.cell.styles.fillColor = [254, 242, 242];  // Rose color to match UI
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });
    
    // Add footer text "stand100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10, { align: 'right' });
    
    doc.save(`supplier-aging-report-${format(asOfDate, "yyyyMMdd")}.pdf`);
  };

  // Print only the table section
  const handlePrintTable = () => {
    const printWindow = window.open('', '', 'width=900,height=700');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Supplier Aging Report</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;}');
      printWindow.document.write('th{background-color:#475569;color:white;font-weight:bold;}');  // Slate color
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.totals{font-weight:bold;background-color:#fef2f2;}');  // Rose color
      printWindow.document.write('.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2 style="font-size:24px;font-weight:bold;margin-bottom:10px;">SUPPLIER AGING REPORT</h2>');
      const companyName = company?.companyName || 'TROPIFRUIT UK LTD';
      const address = company?.address1 || '3 Dolphin Way, Purfleet, RM19 1NZ';
      printWindow.document.write(`<p style="font-size:16px;margin-bottom:5px;">${companyName}, ${address}</p>`);
      printWindow.document.write(`<p style="font-size:14px;">As of Date: ${asOfDate ? format(asOfDate, "dd/MM/yyyy") : ""}</p>`);
      printWindow.document.write('</div>');
      
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Sl.No</th><th>Supplier Name</th><th>Total Outstanding</th><th>Current</th><th>1-30 Days</th><th>31-60 Days</th><th>61-90 Days</th><th>91-120 Days</th><th>121-180 Days</th><th>Over 180 Days</th><th>Currency</th>');
      printWindow.document.write('</tr></thead><tbody>');
      
      // Add supplier data
      agingData.forEach(item => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.slNo}</td>`);
        printWindow.document.write(`<td>${item.supplierName}</td>`);
        printWindow.document.write(`<td style="text-align:right;">${Number(item.totalOutstanding).toFixed(2)}</td>`);
        printWindow.document.write(`<td style="text-align:right;">${Number(item.current).toFixed(2)}</td>`);
        printWindow.document.write(`<td style="text-align:right;">${Number(item.days30).toFixed(2)}</td>`);
        printWindow.document.write(`<td style="text-align:right;">${Number(item.days60).toFixed(2)}</td>`);
        printWindow.document.write(`<td style="text-align:right;">${Number(item.days90).toFixed(2)}</td>`);
        printWindow.document.write(`<td style="text-align:right;">${Number(item.days120).toFixed(2)}</td>`);
        printWindow.document.write(`<td style="text-align:right;">${Number(item.days180).toFixed(2)}</td>`);
        printWindow.document.write(`<td style="text-align:right;">${Number(item.over180).toFixed(2)}</td>`);
        printWindow.document.write(`<td style="text-align:center;">${item.currency}</td>`);
        printWindow.document.write('</tr>');
      });
      
      // Add totals row
      printWindow.document.write('<tr class="totals">');
      printWindow.document.write('<td></td>');
      printWindow.document.write('<td><strong>TOTAL</strong></td>');
      printWindow.document.write(`<td style="text-align:right;"><strong>${totals.totalOutstanding.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td style="text-align:right;"><strong>${totals.current.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td style="text-align:right;"><strong>${totals.days30.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td style="text-align:right;"><strong>${totals.days60.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td style="text-align:right;"><strong>${totals.days90.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td style="text-align:right;"><strong>${totals.days120.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td style="text-align:right;"><strong>${totals.days180.toFixed(2)}</strong></td>`);
      printWindow.document.write(`<td style="text-align:right;"><strong>${totals.over180.toFixed(2)}</strong></td>`);
      printWindow.document.write('<td></td>');
      printWindow.document.write('</tr>');
      
      printWindow.document.write('</tbody></table>');
      
      // Add footer text
      printWindow.document.write('<div class="footer">stand100</div>');
      
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  return (
    <PageLayout title="Supplier Aging Report" breadcrumb="Historical Reports > Supplier Aging Report">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={20} />
                Supplier Aging Report
              </CardTitle>
              <div className="text-sm text-gray-500">
                {company?.companyName || 'TROPIFRUIT UK LTD'}, {company?.address1 || '3 Dolphin Way, Purfleet, RM19 1NZ...'}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label>As of Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !asOfDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {asOfDate ? formatDateForDisplay(asOfDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={asOfDate}
                      onSelect={handleAsOfDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Suppliers">All Suppliers</SelectItem>
                    <SelectItem value="Active Suppliers">Active Suppliers</SelectItem>
                    <SelectItem value="Overdue Only">Overdue Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Currencies</SelectItem>
                    {availableCurrencies.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={handleSearch}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Search
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Aging Report Section */}
        <Card>
          <CardHeader>
            <div className="bg-slate-600 text-white text-center py-2 rounded">
              SUPPLIER AGING REPORT AS OF {asOfDate ? format(asOfDate, "dd/MM/yyyy") : ""}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">Show all rows</Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExportPDF}>
                  <FileText size={14} />
                  PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExportExcel}>
                  <Download size={14} />
                  Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrintTable}>
                  <Printer size={14} />
                  Print
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

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">Loading aging data...</span>
              </div>
            ) : (
              <div ref={tableSectionRef} className="print-table w-full overflow-hidden">
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full min-w-[1200px] table-fixed border-collapse">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="w-[50px] px-2 py-3 text-left text-xs font-medium text-gray-700 border-b">Sl.No</th>
                        <th className="w-[200px] px-3 py-3 text-left text-xs font-medium text-gray-700 border-b">Supplier Name</th>
                        <th className="w-[110px] px-2 py-3 text-right text-xs font-medium text-gray-700 border-b">Total Outstanding</th>
                        <th className="w-[90px] px-2 py-3 text-right text-xs font-medium text-gray-700 border-b">Current</th>
                        <th className="w-[90px] px-2 py-3 text-right text-xs font-medium text-gray-700 border-b">1-30 Days</th>
                        <th className="w-[90px] px-2 py-3 text-right text-xs font-medium text-gray-700 border-b">31-60 Days</th>
                        <th className="w-[90px] px-2 py-3 text-right text-xs font-medium text-gray-700 border-b">61-90 Days</th>
                        <th className="w-[90px] px-2 py-3 text-right text-xs font-medium text-gray-700 border-b">91-120 Days</th>
                        <th className="w-[90px] px-2 py-3 text-right text-xs font-medium text-gray-700 border-b">121-180 Days</th>
                        <th className="w-[90px] px-2 py-3 text-right text-xs font-medium text-gray-700 border-b">Over 180 Days</th>
                        <th className="w-[50px] px-2 py-3 text-center text-xs font-medium text-gray-700 border-b">Curr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingData.map((supplier) => (
                        <tr key={supplier.id} className="hover:bg-gray-50 border-b">
                          <td className="px-2 py-2 text-center text-sm">{supplier.slNo}</td>
                          <td className="px-3 py-2 text-sm font-medium truncate" title={supplier.supplierName}>
                            {supplier.supplierName}
                          </td>
                          <td className="px-2 py-2 text-right text-sm font-medium">
                            {supplier.totalOutstanding.toFixed(2)}
                          </td>
                          <td className="px-2 py-2 text-right text-sm">{supplier.current.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-sm">{supplier.days30.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-sm">{supplier.days60.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-sm">{supplier.days90.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-sm">{supplier.days120.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-sm">{supplier.days180.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-sm">{supplier.over180.toFixed(2)}</td>
                          <td className="px-2 py-2 text-center text-sm">{supplier.currency}</td>
                        </tr>
                      ))}

                      {/* Grand Total Row */}
                      <tr className="border-t-2 border-gray-300 bg-rose-50">
                        <td className="px-2 py-2"></td>
                        <td className="px-3 py-2 text-sm font-bold">TOTAL</td>
                        <td className="px-2 py-2 text-right text-sm font-bold">
                          {totals.totalOutstanding.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right text-sm font-bold">{totals.current.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right text-sm font-bold">{totals.days30.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right text-sm font-bold">{totals.days60.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right text-sm font-bold">{totals.days90.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right text-sm font-bold">{totals.days120.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right text-sm font-bold">{totals.days180.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right text-sm font-bold">{totals.over180.toFixed(2)}</td>
                        <td className="px-2 py-2"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
                  <div>
                    Showing {pagination.showingFrom} to {pagination.showingTo} of {pagination.totalRecords} entries
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage - 1)}
                        disabled={pagination.currentPage <= 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-blue-500 text-white"
                      >
                        {pagination.currentPage}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage + 1)}
                        disabled={pagination.currentPage >= pagination.totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}