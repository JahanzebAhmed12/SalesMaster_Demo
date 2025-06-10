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
import { CalendarIcon, TrendingUp, FileText, Download, Copy, Printer, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SalesItem {
  id: number;
  slNo: number;
  sageCode: string;
  productDescription: string;
  quantity: number;
  avgPrice: number;
  total: number;
}

export default function ProductSalesReport() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [showAll, setShowAll] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Sample data matching the design
  const [salesData] = useState<SalesItem[]>([
    { id: 1, slNo: 1, sageCode: "P1220", productDescription: "Aloe Vera (Sp)", quantity: 1, avgPrice: 12.00, total: 12.00 },
    { id: 2, slNo: 2, sageCode: "", productDescription: "Avocado", quantity: 12, avgPrice: 30.00, total: 360.00 },
    { id: 3, slNo: 3, sageCode: "", productDescription: "Cassava", quantity: 6, avgPrice: 38.00, total: 228.00 },
    { id: 4, slNo: 4, sageCode: "", productDescription: "chow chow", quantity: 2, avgPrice: 12.50, total: 25.00 },
    { id: 5, slNo: 5, sageCode: "P1793", productDescription: "DASHEEN", quantity: 1, avgPrice: 53.00, total: 53.00 },
    { id: 6, slNo: 6, sageCode: "P1154", productDescription: "Green banana", quantity: 5, avgPrice: 15.00, total: 75.00 },
    { id: 7, slNo: 7, sageCode: "", productDescription: "Green Plantain", quantity: 9, avgPrice: 28.67, total: 258.03 },
    { id: 8, slNo: 8, sageCode: "", productDescription: "JellyNut", quantity: 3, avgPrice: 30.00, total: 90.00 },
    { id: 9, slNo: 9, sageCode: "P1792", productDescription: "Mango Dr", quantity: 258, avgPrice: 5.55, total: 1431.90 },
    { id: 10, slNo: 10, sageCode: "", productDescription: "Sweet Potato Brz", quantity: 7, avgPrice: 13.00, total: 91.00 },
    { id: 11, slNo: 11, sageCode: "", productDescription: "Yam Poona", quantity: 3, avgPrice: 30.00, total: 90.00 },
    { id: 12, slNo: 12, sageCode: "", productDescription: "Yellow Plantain", quantity: 70, avgPrice: 21.79, total: 1525.30 }
  ]);

  const totalQuantity = salesData.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = salesData.reduce((sum, item) => sum + item.total, 0);
  const averagePrice = totalAmount / totalQuantity;

  return (
    <PageLayout title="Sales Report" breadcrumb="Daily Report > Product Sales Report">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={20} />
                Sales Report
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
                <Select value={showAll} onValueChange={setShowAll}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Show All">Show All</SelectItem>
                    <SelectItem value="All">All</SelectItem>
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
                  <Printer size={16} />
                  Print
                </Button>
                <Button className="bg-cyan-500 hover:bg-cyan-600 flex items-center gap-2 text-white">
                  Compare with Purchase
                </Button>
                <Button className="bg-cyan-500 hover:bg-cyan-600 flex items-center gap-2 text-white">
                  Sage
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sl.No</TableHead>
                  <TableHead>Sage code</TableHead>
                  <TableHead>Product Description</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-center">AVG Price</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.slNo}</TableCell>
                    <TableCell>{item.sageCode}</TableCell>
                    <TableCell>{item.productDescription}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-center">{item.avgPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{item.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="font-bold">12 Items</TableCell>
                  <TableCell className="text-center font-bold">{totalQuantity}</TableCell>
                  <TableCell className="text-center font-bold">{averagePrice.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£ {totalAmount.toFixed(2)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to 12 of 12 entries</div>
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