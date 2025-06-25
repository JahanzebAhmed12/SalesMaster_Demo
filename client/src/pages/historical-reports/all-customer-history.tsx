import { useState, useEffect } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Users, FileText, Download, Copy, Printer, Search, Printer as PrintIcon, FileText as ReportIcon, Globe, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface CustomerData {
  id: number;
  slNo: number;
  customerName: string;
  creditInvoice: number;
  cashInvoice: number;
  amountReceived: number;
  returnsDiscount: number;
  onAccount: number;
  balanceOutstanding: number;
  creditLimit: number;
  currency: string;
  isBadDebt: boolean;
  customerCode: string;
  address?: string;
  telephone?: string;
  email?: string;
}

interface ApiResponse {
  data: CustomerData[];
  totals: {
    creditInvoice: number;
    cashInvoice: number;
    amountReceived: number;
    returnsDiscount: number;
    onAccount: number;
    balanceOutstanding: number;
  };
  currencyTotals: Record<string, {
    creditInvoice: number;
    cashInvoice: number;
    amountReceived: number;
    returnsDiscount: number;
    onAccount: number;
    balanceOutstanding: number;
  }>;
  pagination: {
    currentPage: number;
    perPage: number;
    totalRecords: number;
    totalPages: number;
    showingFrom: number;
    showingTo: number;
  };
  filters: {
    fromDate: string;
    toDate: string;
    customerFilter: string;
    searchTerm: string;
    currency: string;
  };
}

export default function AllCustomerHistory() {
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [customerFilter, setCustomerFilter] = useState("All Customer");
  const [searchTerm, setSearchTerm] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([]);
  
  // API state
  const [customerData, setCustomerData] = useState<CustomerData[]>([]);
  const [totals, setTotals] = useState({
    creditInvoice: 0,
    cashInvoice: 0,
    amountReceived: 0,
    returnsDiscount: 0,
    onAccount: 0,
    balanceOutstanding: 0
  });
  const [currencyTotals, setCurrencyTotals] = useState<Record<string, any>>({});
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

  // Fetch customer history data
  const fetchCustomerHistory = async (page = 1) => {
    setLoading(true);
    setError(null);
    
    try {
      const formattedFromDate = fromDate ? format(fromDate, "yyyy-MM-dd") : "";
      const formattedToDate = toDate ? format(toDate, "yyyy-MM-dd") : "";
      
      const params = new URLSearchParams({
        fromDate: formattedFromDate,
        toDate: formattedToDate,
        customerFilter,
        search: searchTerm,
        currency: currencyFilter === "all" ? "" : currencyFilter,
        page: page.toString(),
        perPage: pagination.perPage.toString()
      });

      const result: ApiResponse = await apiRequest(
        "GET",
        `/api/reports/all-customer-history?${params}`
      );
      
      setCustomerData(result.data);
      setTotals(result.totals);
      setCurrencyTotals(result.currencyTotals);
      setPagination(result.pagination);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
      toast({
        title: "Error",
        description: "Failed to fetch customer history data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle search
  const handleSearch = () => {
    fetchCustomerHistory(1);
  };

  // Handle pagination
  const handlePageChange = (page: number) => {
    fetchCustomerHistory(page);
  };

  // Handle search term change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== "") {
        fetchCustomerHistory(1);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Initial load
  useEffect(() => {
    fetchCustomerHistory();
  }, [customerFilter, currencyFilter]);

  return (
    <PageLayout title="All Customer History" breadcrumb="Historical Reports > All Customer History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Users size={20} />
                All Customer History
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-end md:gap-8">
              <div className="flex gap-4">
                <div>
                  <Label>From:</Label>
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
                  <Label>To:</Label>
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
              </div>
              <div className="mt-4 md:mt-0">
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Customer">All Customer</SelectItem>
                    <SelectItem value="Exclude Bad Debt" className="bg-cyan-500 text-white">Exclude Bad Debt</SelectItem>
                    <SelectItem value="Show Bad Debt">Show Bad Debt</SelectItem>
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
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <PrintIcon size={16} />
                  Print
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  Weekly statement
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Statement Section */}
        <Card>
          <CardHeader>
            <div className="bg-cyan-500 text-white text-center py-2 rounded">
              CUSTOMER STATEMENT (IN Respective Currency)
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">Show all rows</Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1">
                  <FileText size={14} />
                  PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1">
                  <Download size={14} />
                  Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1">
                  <Copy size={14} />
                  Copy
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1">
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
                <span className="ml-2">Loading customer data...</span>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-blue-100">
                      <TableHead>Sl.No</TableHead>
                      <TableHead>Customer name</TableHead>
                      <TableHead className="text-center">Credit Invoice</TableHead>
                      <TableHead className="text-center">Cash Invoice</TableHead>
                      <TableHead className="text-center">Amount Received</TableHead>
                      <TableHead className="text-center">Returns/ Discount</TableHead>
                      <TableHead className="text-center">On Account</TableHead>
                      <TableHead className="text-center">Balance/ outstanding</TableHead>
                      <TableHead className="text-center">Credit Limit</TableHead>
                      <TableHead className="text-center">Curr</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerData.map((customer) => (
                      <TableRow 
                        key={customer.id} 
                        className={cn(
                          "hover:bg-gray-50",
                          customer.isBadDebt && "bg-red-50"
                        )}
                      >
                        <TableCell>{customer.slNo}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{customer.customerName}</div>
                            <div className="text-sm text-gray-500">{customer.customerCode}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{customer.creditInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.cashInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.amountReceived.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.returnsDiscount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.onAccount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.balanceOutstanding.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.creditLimit.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{customer.currency}</TableCell>
                      </TableRow>
                    ))}
                    
                    {/* Currency-wise totals */}
                    {Object.entries(currencyTotals).map(([currency, currencyTotal]) => (
                      <TableRow key={`currency-${currency}`} className="bg-gray-100 border-t">
                        <TableCell></TableCell>
                        <TableCell className="font-bold">{currency}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.creditInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.cashInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.amountReceived.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.returnsDiscount.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.onAccount.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currencyTotal.balanceOutstanding.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-bold">{currency}</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    ))}
                    
                    {/* Total Row */}
                    <TableRow className="border-t-2 border-gray-300 bg-green-50">
                      <TableCell></TableCell>
                      <TableCell className="font-bold">TOTAL</TableCell>
                      <TableCell className="text-center font-bold">{totals.creditInvoice.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.cashInvoice.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.amountReceived.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.returnsDiscount.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.onAccount.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">{totals.balanceOutstanding.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">0.00</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                
                <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
                  <div>
                    Showing {pagination.showingFrom} to {pagination.showingTo} of {pagination.totalRecords} entries
                    {pagination.totalRecords > 0 && ` (filtered from ${pagination.totalRecords} total entries)`}
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}