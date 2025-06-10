import { useState } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Calendar as CalendarIconTwo, FileText, Download, Copy, Printer, Search, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DateWiseSalesData {
  id: number;
  date: string;
  totalSales: number;
  creditSales: number;
  cashSales: number;
  totalInvoices: number;
  averageSale: number;
  topProduct: string;
  topCustomer: string;
}

export default function DateWiseSales() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 8));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [salesType, setSalesType] = useState("All Sales");
  const [groupBy, setGroupBy] = useState("Daily");
  const [searchTerm, setSearchTerm] = useState("");

  const [salesData] = useState<DateWiseSalesData[]>([
    {
      id: 1, date: "2025-06-08", totalSales: 2450.75, creditSales: 1800.50, cashSales: 650.25,
      totalInvoices: 12, averageSale: 204.23, topProduct: "Fresh Bananas", topCustomer: "TROPIFRUIT STAND 100"
    },
    {
      id: 2, date: "2025-06-09", totalSales: 3275.80, creditSales: 2100.00, cashSales: 1175.80,
      totalInvoices: 18, averageSale: 181.99, topProduct: "Organic Apples", topCustomer: "F&R ENTERPRISE LTD"
    },
    {
      id: 3, date: "2025-06-10", totalSales: 1890.45, creditSales: 1350.20, cashSales: 540.25,
      totalInvoices: 9, averageSale: 210.05, topProduct: "Mixed Fruits", topCustomer: "AMER SUPER"
    }
  ]);

  const totals = {
    totalSales: salesData.reduce((sum, item) => sum + item.totalSales, 0),
    creditSales: salesData.reduce((sum, item) => sum + item.creditSales, 0),
    cashSales: salesData.reduce((sum, item) => sum + item.cashSales, 0),
    totalInvoices: salesData.reduce((sum, item) => sum + item.totalInvoices, 0),
    averageSale: salesData.reduce((sum, item) => sum + item.averageSale, 0) / salesData.length
  };

  return (
    <PageLayout title="Date Wise Sales" breadcrumb="Historical Reports > Date Wise Sales">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <CalendarIconTwo size={20} />
                Date Wise Sales Report
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
                <Select value={salesType} onValueChange={setSalesType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Sales">All Sales</SelectItem>
                    <SelectItem value="Credit Sales">Credit Sales</SelectItem>
                    <SelectItem value="Cash Sales">Cash Sales</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="Weekly">Weekly</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full">
                  Generate Report
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Printer size={16} />
                  Print
                </Button>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                  Export
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Report Section */}
        <Card>
          <CardHeader>
            <div className="bg-purple-600 text-white text-center py-2 rounded">
              DATE WISE SALES ANALYSIS
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

            <Table>
              <TableHeader>
                <TableRow className="bg-purple-100">
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Total Sales</TableHead>
                  <TableHead className="text-center">Credit Sales</TableHead>
                  <TableHead className="text-center">Cash Sales</TableHead>
                  <TableHead className="text-center">Total Invoices</TableHead>
                  <TableHead className="text-center">Average Sale</TableHead>
                  <TableHead>Top Product</TableHead>
                  <TableHead>Top Customer</TableHead>
                  <TableHead className="text-center">📊</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesData.map((sale) => (
                  <TableRow key={sale.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{format(new Date(sale.date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="text-center font-bold text-green-600">£{sale.totalSales.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{sale.creditSales.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{sale.cashSales.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{sale.totalInvoices}</TableCell>
                    <TableCell className="text-center">£{sale.averageSale.toFixed(2)}</TableCell>
                    <TableCell>{sale.topProduct}</TableCell>
                    <TableCell>{sale.topCustomer}</TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 bg-purple-500 text-white">
                        <TrendingUp size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-pink-50">
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-center font-bold text-green-600">£{totals.totalSales.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£{totals.creditSales.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£{totals.cashSales.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.totalInvoices}</TableCell>
                  <TableCell className="text-center font-bold">£{totals.averageSale.toFixed(2)}</TableCell>
                  <TableCell className="font-bold">-</TableCell>
                  <TableCell className="font-bold">-</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-blue-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Total Sales Period</div>
                <div className="text-2xl font-bold text-blue-600">£{totals.totalSales.toFixed(2)}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Daily Average</div>
                <div className="text-2xl font-bold text-green-600">£{(totals.totalSales / salesData.length).toFixed(2)}</div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Total Invoices</div>
                <div className="text-2xl font-bold text-purple-600">{totals.totalInvoices}</div>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Best Day</div>
                <div className="text-lg font-bold text-orange-600">
                  {format(new Date(salesData.reduce((max, sale) => sale.totalSales > max.totalSales ? sale : max).date), "dd/MM")}
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {salesData.length} of {salesData.length} entries</div>
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