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
import { CalendarIcon, ShoppingBag, FileText, Download, Copy, Printer, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PurchaseItem {
  id: number;
  slNo: number;
  productDescription: string;
  quantity: number;
  avgPrice: number;
  total: number;
}

export default function ProductPurchaseReport() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [showAll, setShowAll] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Sample data matching the design
  const [purchaseData] = useState<PurchaseItem[]>([
    { id: 1, slNo: 1, productDescription: "Avocado", quantity: 27, avgPrice: 26.05, total: 703.35 },
    { id: 2, slNo: 2, productDescription: "Cassava", quantity: 6, avgPrice: 32.05, total: 192.30 },
    { id: 3, slNo: 3, productDescription: "chow chow", quantity: 24, avgPrice: 11.05, total: 265.20 },
    { id: 4, slNo: 4, productDescription: "JellyNut", quantity: 18, avgPrice: 22.05, total: 396.90 },
    { id: 5, slNo: 5, productDescription: "Mango Dr", quantity: 300, avgPrice: 6.00, total: 1800.00 },
    { id: 6, slNo: 6, productDescription: "Yellow Plantain", quantity: 48, avgPrice: 26.05, total: 1250.40 }
  ]);

  const totalQuantity = purchaseData.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = purchaseData.reduce((sum, item) => sum + item.total, 0);

  return (
    <PageLayout title="Purchase Report" breadcrumb="Daily Report > Product Purchase Report">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag size={20} />
                Purchase Report
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
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Table */}
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
                  <TableHead>Product Description</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-center">AVG Price</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.slNo}</TableCell>
                    <TableCell>{item.productDescription}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-center">{item.avgPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{item.total.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">6 Items</TableCell>
                  <TableCell className="text-center font-bold">{totalQuantity}</TableCell>
                  <TableCell className="text-center font-bold"></TableCell>
                  <TableCell className="text-center font-bold">{totalAmount.toFixed(2)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to 6 of 6 entries</div>
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