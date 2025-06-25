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
import { CalendarIcon, FileText, Download, Copy, Printer, Search, TrendingDown, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CustomerAgingData {
  id: number;
  slNo: number;
  customerName: string;
  totalOutstanding: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120: number;
  days180: number;
  over180: number;
  currency: string;
  customerCode: string;
  address?: string;
  telephone?: string;
  email?: string;
}

interface ApiResponse {
  data: CustomerAgingData[];
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
    customerFilter: string;
    searchTerm: string;
    currency: string;
  };
}

export default function CustomerAgingRpt() {
  const { toast } = useToast();
  const [asOfDate, setAsOfDate] = useState<Date>(new Date());
  const [customerFilter, setCustomerFilter] = useState("All Customer");
  const [searchTerm, setSearchTerm] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([]);

  const [agingData, setAgingData] = useState<CustomerAgingData[]>([]);
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
        customerFilter,
        search: searchTerm,
        currency: currencyFilter === "all" ? "" : currencyFilter,
        page: page.toString(),
        perPage: pagination.perPage.toString()
      });

      const result: ApiResponse = await apiRequest(
        "GET",
        `/api/reports/customer-aging?${params}`
      );

      setAgingData(result.data);
      setTotals(result.totals);
      setPagination(result.pagination);

    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
      toast({
        title: "Error",
        description: "Failed to fetch customer aging data",
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
  }, [customerFilter, currencyFilter, asOfDate]);

  // Export to Excel handler
  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      agingData.map((row) => ({
        "Sl.No": row.slNo,
        "Customer Name": row.customerName,
        "Total Outstanding": row.totalOutstanding,
        "Current": row.current,
        "1-30 Days": row.days30,
        "31-60 Days": row.days60,
        "61-90 Days": row.days90,
        "91-120 Days": row.days120,
        "121-180 Days": row.days180,
        "Over 180 Days": row.over180,
        "Currency": row.currency,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Aging Report");
    XLSX.writeFile(wb, `customer-aging-report.xlsx`);
  };

  // Export to PDF handler
  const handleExportPDF = () => {
    const doc = new jsPDF();
    autoTable(doc, {
      head: [[
        "Sl.No", "Customer Name", "Total Outstanding", "Current", "1-30 Days", "31-60 Days", "61-90 Days", "91-120 Days", "121-180 Days", "Over 180 Days", "Currency"
      ]],
      body: agingData.map((row) => [
        row.slNo,
        row.customerName,
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
      styles: { fontSize: 8 },
      margin: { top: 20 },
      didDrawPage: (data) => {
        doc.text("Customer Aging Report", 14, 10);
      },
    });
    doc.save("customer-aging-report.pdf");
  };

  // Print only the table section
  const handlePrintTable = () => {
    if (!tableSectionRef.current) return;
    const printContents = tableSectionRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Customer Aging Report</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;} .bg-yellow-50{background:#fffde7;} .bg-red-100{background:#ffebee;} .font-bold{font-weight:bold;}</style>');
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

  return (
    <PageLayout title="Customer Aging Report" breadcrumb="Historical Reports > Customer Aging Report">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <TrendingDown size={20} />
                Customer Aging Report
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
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
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Customer">All Customer</SelectItem>
                    <SelectItem value="Active Customers">Active Customers</SelectItem>
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
            <div className="bg-red-500 text-white text-center py-2 rounded">
              CUSTOMER AGING REPORT AS OF {asOfDate ? format(asOfDate, "dd/MM/yyyy") : ""}
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
                    <TableRow className="bg-red-100">
                      <TableHead>Sl.No</TableHead>
                      <TableHead>Customer name</TableHead>
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
                    {agingData.map((customer) => (
                      <TableRow key={customer.id} className="hover:bg-gray-50">
                        <TableCell>{customer.slNo}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{customer.customerName}</div>
                            <div className="text-sm text-gray-500">{customer.customerCode}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-medium">{customer.totalOutstanding.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.current.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.days30.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.days60.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.days90.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.days120.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.days180.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.over180.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.currency}</TableCell>
                      </TableRow>
                    ))}

                    {/* Grand Total Row */}
                    <TableRow className="border-t-2 border-gray-300 bg-yellow-50">
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