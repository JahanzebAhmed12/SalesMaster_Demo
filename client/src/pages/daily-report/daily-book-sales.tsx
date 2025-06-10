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
import { CalendarIcon, BarChart3, FileText, Download, Copy, Printer, Search, Eye, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SalesEntry {
  id: number;
  slNo: number;
  date: string;
  salesman: string;
  boxes: number;
  invoiceNo: string;
  customerName: string;
  vat: number;
  credit: number;
  cash: number;
}

export default function DailyBookSales() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [paymentType, setPaymentType] = useState("Cash");
  const [userFilter, setUserFilter] = useState("admin");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Sample data matching the design
  const [salesData] = useState<SalesEntry[]>([
    {
      id: 1,
      slNo: 1,
      date: "2025-06-10",
      salesman: "admin",
      boxes: 2,
      invoiceNo: "I30702",
      customerName: "[ ALL ]",
      vat: 0,
      credit: 0,
      cash: 55.00
    }
  ]);

  const totalBoxes = salesData.reduce((sum, item) => sum + item.boxes, 0);
  const totalVAT = salesData.reduce((sum, item) => sum + item.vat, 0);
  const totalCredit = salesData.reduce((sum, item) => sum + item.credit, 0);
  const totalCash = salesData.reduce((sum, item) => sum + item.cash, 0);

  return (
    <PageLayout title="Daily Book" breadcrumb="Daily Report > Daily Book Sales">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 size={20} />
                Daily Book
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
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
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Select value={userFilter} onValueChange={setUserFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full">
                  Search
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Eye size={16} />
                  Full View
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Printer size={16} />
                  Print
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Info size={16} />
                  Options
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
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
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 min-w-[48px]">
                      <input type="checkbox" className="rounded" />
                    </TableHead>
                    <TableHead className="min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="min-w-[100px]">Date</TableHead>
                    <TableHead className="min-w-[120px]">Salesman</TableHead>
                    <TableHead className="min-w-[80px]"># Boxes</TableHead>
                    <TableHead className="min-w-[120px]">Invoice No</TableHead>
                    <TableHead className="min-w-[150px]">Customer Name</TableHead>
                    <TableHead className="min-w-[80px]">VAT</TableHead>
                    <TableHead className="min-w-[100px]">Credit</TableHead>
                    <TableHead className="min-w-[100px]">Cash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesData.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      <input type="checkbox" className="rounded" />
                    </TableCell>
                    <TableCell>{sale.slNo}</TableCell>
                    <TableCell>{format(new Date(sale.date), "yyyy-MM-dd")}</TableCell>
                    <TableCell>{sale.salesman}</TableCell>
                    <TableCell className="text-center">{sale.boxes}</TableCell>
                    <TableCell>{sale.invoiceNo}</TableCell>
                    <TableCell className="text-blue-600">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                          <Eye size={12} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                          <Download size={12} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                          <FileText size={12} />
                        </Button>
                        {sale.customerName}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">£{sale.vat.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{sale.credit.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{sale.cash.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="font-bold">1 Items</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-center font-bold">{totalBoxes}</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">£{totalVAT.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold">£{totalCredit.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold">£{totalCash.toFixed(2)}</TableCell>
                </TableRow>
              </TableBody>
              </Table>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to 1 of 1 entries</div>
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