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
  const [asOfDate, setAsOfDate] = useState<Date>(new Date());
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
    const ws = XLSX.utils.json_to_sheet(agingData.map((item) => ({
      'Sl No': item.slNo,
      'Supplier Name': item.supplierName,
      'Total Outstanding': Number(item.totalOutstanding).toFixed(2),
      'Current': Number(item.current).toFixed(2),
      '30 Days': Number(item.days30).toFixed(2),
      '60 Days': Number(item.days60).toFixed(2),
      '90 Days': Number(item.days90).toFixed(2),
      '120 Days': Number(item.days120).toFixed(2),
      '180 Days': Number(item.days180).toFixed(2),
      'Over 180': Number(item.over180).toFixed(2),
      'Currency': item.currency,
      'Supplier Code': item.supplierCode,
      'Address': item.address,
      'Telephone': item.telephone,
      'Email': item.email,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier Aging");
    XLSX.writeFile(wb, "SupplierAgingReport.xlsx");
  };

  // Export to PDF handler
  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.text(company?.companyName || '', 10, 10);
    doc.text(company?.address1 || '', 10, 16);
    autoTable(doc, {
      head: [[
        'Sl No', 'Supplier Name', 'Total Outstanding', 'Current', '30 Days', '60 Days', '90 Days', '120 Days', '180 Days', 'Over 180', 'Currency', 'Supplier Code', 'Address', 'Telephone', 'Email'
      ]],
      body: agingData.map((item) => [
        item.slNo,
        item.supplierName,
        Number(item.totalOutstanding).toFixed(2),
        Number(item.current).toFixed(2),
        Number(item.days30).toFixed(2),
        Number(item.days60).toFixed(2),
        Number(item.days90).toFixed(2),
        Number(item.days120).toFixed(2),
        Number(item.days180).toFixed(2),
        Number(item.over180).toFixed(2),
        item.currency,
        item.supplierCode,
        item.address,
        item.telephone,
        item.email,
      ]),
      startY: 22,
    });
    doc.save("SupplierAgingReport.pdf");
  };

  // Print only the table section
  const handlePrintTable = () => {
    const printWindow = window.open('', '', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write('<html><head><title>Supplier Aging Report</title></head><body>');
    printWindow.document.write(`<h2>${company?.companyName || ''}</h2>`);
    printWindow.document.write(`<div>${company?.address1 || ''}</div>`);
    printWindow.document.write('<table border="1"><thead><tr>');
    printWindow.document.write('<th>Sl No</th><th>Supplier Name</th><th>Total Outstanding</th><th>Current</th><th>30 Days</th><th>60 Days</th><th>90 Days</th><th>120 Days</th><th>180 Days</th><th>Over 180</th><th>Currency</th><th>Supplier Code</th><th>Address</th><th>Telephone</th><th>Email</th>');
    printWindow.document.write('</tr></thead><tbody>');
    agingData.forEach(item => {
      printWindow.document.write('<tr>');
      printWindow.document.write(`<td>${item.slNo}</td>`);
      printWindow.document.write(`<td>${item.supplierName}</td>`);
      printWindow.document.write(`<td>${Number(item.totalOutstanding).toFixed(2)}</td>`);
      printWindow.document.write(`<td>${Number(item.current).toFixed(2)}</td>`);
      printWindow.document.write(`<td>${Number(item.days30).toFixed(2)}</td>`);
      printWindow.document.write(`<td>${Number(item.days60).toFixed(2)}</td>`);
      printWindow.document.write(`<td>${Number(item.days90).toFixed(2)}</td>`);
      printWindow.document.write(`<td>${Number(item.days120).toFixed(2)}</td>`);
      printWindow.document.write(`<td>${Number(item.days180).toFixed(2)}</td>`);
      printWindow.document.write(`<td>${Number(item.over180).toFixed(2)}</td>`);
      printWindow.document.write(`<td>${item.currency}</td>`);
      printWindow.document.write(`<td>${item.supplierCode}</td>`);
      printWindow.document.write(`<td>${item.address}</td>`);
      printWindow.document.write(`<td>${item.telephone}</td>`);
      printWindow.document.write(`<td>${item.email}</td>`);
      printWindow.document.write('</tr>');
    });
    printWindow.document.write('</tbody></table></body></html>');
    printWindow.document.close();
    printWindow.print();
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
                      {asOfDate ? format(asOfDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={asOfDate}
                      onSelect={(date) => date && setAsOfDate(date)}
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
              <div ref={tableSectionRef} className="print-table">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100">
                      <TableHead>Sl.No</TableHead>
                      <TableHead>Supplier name</TableHead>
                      <TableHead className="text-center">Total Outstanding</TableHead>
                      <TableHead className="text-center">Current</TableHead>
                      <TableHead className="text-center">1-30 Days</TableHead>
                      <TableHead className="text-center">31-60 Days</TableHead>
                      <TableHead className="text-center">61-90 Days</TableHead>
                      <TableHead className="text-center">91-120 Days</TableHead>
                      <TableHead className="text-center">121-180 Days</TableHead>
                      <TableHead className="text-center">Over 180 Days</TableHead>
                      <TableHead className="text-center">Curr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingData.map((supplier) => (
                      <TableRow key={supplier.id} className="hover:bg-gray-50">
                        <TableCell>{supplier.slNo}</TableCell>
                        <TableCell>{supplier.supplierName}</TableCell>
                        <TableCell className="text-center font-medium">{supplier.totalOutstanding.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.current.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.days30.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.days60.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.days90.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.days120.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.days180.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.over180.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.currency}</TableCell>
                      </TableRow>
                    ))}

                    {/* Grand Total Row */}
                    <TableRow className="border-t-2 border-gray-300 bg-rose-50">
                      <TableCell></TableCell>
                      <TableCell className="font-bold">TOTAL</TableCell>
                      <TableCell className="text-center font-bold">{totals.totalOutstanding.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.current.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.days30.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.days60.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.days90.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.days120.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.days180.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.over180.toFixed(2)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>

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