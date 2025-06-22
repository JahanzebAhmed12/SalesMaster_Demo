import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Building, FileText, Download, Copy, Printer, Search, Printer as PrintIcon, FileText as ReportIcon, Globe } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SupplierData {
  id: number;
  slNo: number;
  supplierName: string;
  purchaseInvoice: number;
  amountPaid: number;
  creditAdj: number;
  discountAdj: number;
  balanceOutstanding: number;
  creditLimit: number;
  currency: string;
}

export default function AllSupplierHistory() {
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [supplierFilter, setSupplierFilter] = useState("All Suppliers");
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierData, setSupplierData] = useState<SupplierData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate totals
  const totals = {
    purchaseInvoice: supplierData.reduce((sum, item) => sum + item.purchaseInvoice, 0),
    amountPaid: supplierData.reduce((sum, item) => sum + item.amountPaid, 0),
    creditAdj: supplierData.reduce((sum, item) => sum + item.creditAdj, 0),
    discountAdj: supplierData.reduce((sum, item) => sum + item.discountAdj, 0),
    balanceOutstanding: supplierData.reduce((sum, item) => sum + item.balanceOutstanding, 0)
  };

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<SupplierData[]>(
        "GET",
        `/api/reports/all-supplier-history?fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}`
      );
      setSupplierData(res);
    } catch (err: any) {
      setError(err.message || "Failed to fetch data");
    }
    setLoading(false);
  };

  return (
    <PageLayout title="All Supplier History" breadcrumb="Historical Reports > All Supplier History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Building size={20} />
                All Supplier History
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
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
              <div>
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Suppliers">All Suppliers</SelectItem>
                    <SelectItem value="Active Only">Active Only</SelectItem>
                    <SelectItem value="With Outstanding">With Outstanding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full" onClick={handleSearch} disabled={loading}>
                  {loading ? "Loading..." : "Search"}
                </Button>
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
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <ReportIcon size={16} />
                  Report
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Globe size={16} />
                  Select Currency
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Statement Section */}
        <Card>
          <CardHeader>
            <div className="bg-emerald-600 text-white text-center py-2 rounded">
              SUPPLIER STATEMENT (IN Respective Currency)
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
              <div className="text-red-600 text-center py-2">{error}</div>
            )}

            <Table>
              <TableHeader>
                <TableRow className="bg-emerald-100">
                  <TableHead>Sl.No</TableHead>
                  <TableHead>Supplier name</TableHead>
                  <TableHead className="text-center">Purchase Invoice</TableHead>
                  <TableHead className="text-center">Amount Paid</TableHead>
                  <TableHead className="text-center">Credit/ Adjustment</TableHead>
                  <TableHead className="text-center">Discount/ Adjustment</TableHead>
                  <TableHead className="text-center">Balance/ outstanding</TableHead>
                  <TableHead className="text-center">Credit Limit</TableHead>
                  <TableHead className="text-center">Curr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierData.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-gray-500 py-8">
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  supplierData
                    .filter(supplier => {
                      if (!searchTerm) return true;
                      const term = searchTerm.toLowerCase();
                      return (
                        (supplier.supplierName || "").toLowerCase().includes(term) ||
                        (supplier.currency || "").toLowerCase().includes(term)
                      );
                    })
                    .map((supplier) => (
                      <TableRow key={supplier.id} className="hover:bg-gray-50">
                        <TableCell>{supplier.slNo}</TableCell>
                        <TableCell>{supplier.supplierName}</TableCell>
                        <TableCell className="text-center">{supplier.purchaseInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.amountPaid.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.creditAdj.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.discountAdj.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-medium text-red-600">{supplier.balanceOutstanding.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.creditLimit}</TableCell>
                        <TableCell className="text-center">{supplier.currency}</TableCell>
                      </TableRow>
                    ))
                )}
                {/* GBP Row */}
                <TableRow className="bg-gray-100 border-t">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">GBP</TableCell>
                  <TableCell className="text-center font-bold">{totals.purchaseInvoice.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.amountPaid.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.creditAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.discountAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold text-red-600">{totals.balanceOutstanding.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">GBP</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-lime-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-center font-bold">{totals.purchaseInvoice.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.amountPaid.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.creditAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.discountAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold text-red-600">{totals.balanceOutstanding.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">0.00</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing {supplierData.length > 0 ? 1 : 0} to {supplierData.length} of {supplierData.length} entries</div>
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