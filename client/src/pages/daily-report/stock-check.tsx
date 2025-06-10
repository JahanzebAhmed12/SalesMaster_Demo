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
import { CalendarIcon, ClipboardCheck, FileText, Download, Copy, Printer, Search, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface StockItem {
  id: number;
  slNo: number;
  productDescription: string;
  os: number;
  ns: number;
  sales: number;
  crtn: number;
  dmps: number;
  srtn: number;
  stock: number;
  clStock: number;
  result: string;
  status: 'correct' | 'short' | 'excess';
}

export default function StockCheck() {
  const [osDate, setOsDate] = useState<Date>(new Date(2025, 5, 9));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [stockFilter, setStockFilter] = useState("Show All");
  const [searchTerm, setSearchTerm] = useState("");
  
  // Sample data matching the design
  const [stockData] = useState<StockItem[]>([
    {
      id: 1, slNo: 1, productDescription: "Aloe Vera (Sp)", os: 16, ns: 0, sales: 1, crtn: 0, dmps: 0, srtn: 0, stock: 15, clStock: 15, result: "✓", status: 'correct'
    },
    {
      id: 2, slNo: 2, productDescription: "Avocado", os: 0, ns: 27, sales: 12, crtn: 0, dmps: 0, srtn: 0, stock: 15, clStock: 15, result: "✓", status: 'correct'
    },
    {
      id: 3, slNo: 3, productDescription: "Cassava", os: 0, ns: 6, sales: 6, crtn: 0, dmps: 0, srtn: 0, stock: 0, clStock: 0, result: "✓", status: 'correct'
    },
    {
      id: 4, slNo: 4, productDescription: "chow chow", os: 7, ns: 24, sales: 2, crtn: 0, dmps: 0, srtn: 0, stock: 29, clStock: 29, result: "✓", status: 'correct'
    },
    {
      id: 5, slNo: 5, productDescription: "Cush Yam", os: 0, ns: 0, sales: 0, crtn: 0, dmps: 0, srtn: 0, stock: 0, clStock: 11, result: "extra 11", status: 'excess'
    },
    {
      id: 6, slNo: 6, productDescription: "DASHEEN", os: 18, ns: 0, sales: 1, crtn: 0, dmps: 0, srtn: 0, stock: 17, clStock: 17, result: "✓", status: 'correct'
    },
    {
      id: 7, slNo: 7, productDescription: "Green banana", os: 57, ns: 0, sales: 5, crtn: 0, dmps: 0, srtn: 0, stock: 52, clStock: 52, result: "✓", status: 'correct'
    },
    {
      id: 8, slNo: 8, productDescription: "Green Plantain", os: 7, ns: 0, sales: 9, crtn: 0, dmps: 0, srtn: 0, stock: 2, clStock: 0, result: "extra 2", status: 'excess'
    },
    {
      id: 9, slNo: 9, productDescription: "JellyNut", os: 7, ns: 18, sales: 3, crtn: 0, dmps: 0, srtn: 0, stock: 15, clStock: 15, result: "✓", status: 'correct'
    },
    {
      id: 10, slNo: 10, productDescription: "Mango Dr", os: 135, ns: 300, sales: 258, crtn: 0, dmps: 0, srtn: 0, stock: 177, clStock: 0, result: "short 7", status: 'short'
    },
    {
      id: 11, slNo: 11, productDescription: "Sweet Potato Brz", os: 10, ns: 0, sales: 7, crtn: 0, dmps: 0, srtn: 0, stock: 3, clStock: 3, result: "✓", status: 'correct'
    },
    {
      id: 12, slNo: 12, productDescription: "Tamarind Sweet", os: 26, ns: 0, sales: 0, crtn: 0, dmps: 0, srtn: 0, stock: 26, clStock: 26, result: "✓", status: 'correct'
    },
    {
      id: 13, slNo: 13, productDescription: "Yam Poona", os: 0, ns: 0, sales: 3, crtn: 0, dmps: 0, srtn: 0, stock: 3, clStock: 3, result: "extra 6", status: 'excess'
    },
    {
      id: 14, slNo: 14, productDescription: "Yellow Plantain", os: 29, ns: 48, sales: 70, crtn: 0, dmps: 0, srtn: 0, stock: 7, clStock: 4, result: "short 3", status: 'short'
    }
  ]);

  const filteredData = stockData.filter(item => {
    if (stockFilter === "Short") return item.status === 'short';
    if (stockFilter === "Excess") return item.status === 'excess';
    return true; // Show All
  });

  const totals = {
    os: stockData.reduce((sum, item) => sum + item.os, 0),
    ns: stockData.reduce((sum, item) => sum + item.ns, 0),
    sales: stockData.reduce((sum, item) => sum + item.sales, 0),
    stock: stockData.reduce((sum, item) => sum + item.stock, 0),
    clStock: stockData.reduce((sum, item) => sum + item.clStock, 0)
  };

  return (
    <PageLayout title="Stock Check" breadcrumb="Daily Report > Stock Check">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck size={20} />
                Stock Check
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>OS Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !osDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {osDate ? format(osDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={osDate}
                      onSelect={(date) => date && setOsDate(date)}
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
                <Select value={stockFilter} onValueChange={setStockFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Show All">Show All</SelectItem>
                    <SelectItem value="Short">Short</SelectItem>
                    <SelectItem value="Excess">Excess</SelectItem>
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
                  Template
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock Table */}
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
                  <TableHead className="text-center">O.S</TableHead>
                  <TableHead className="text-center">N.S</TableHead>
                  <TableHead className="text-center">Sales</TableHead>
                  <TableHead className="text-center">C.RTN</TableHead>
                  <TableHead className="text-center">Dmps</TableHead>
                  <TableHead className="text-center">S.RTN</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead className="text-center">Cl.Stock</TableHead>
                  <TableHead className="text-center">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.slNo}</TableCell>
                    <TableCell>{item.productDescription}</TableCell>
                    <TableCell className="text-center">{item.os}</TableCell>
                    <TableCell className="text-center">{item.ns}</TableCell>
                    <TableCell className="text-center">{item.sales}</TableCell>
                    <TableCell className="text-center">{item.crtn}</TableCell>
                    <TableCell className="text-center">{item.dmps}</TableCell>
                    <TableCell className="text-center">{item.srtn}</TableCell>
                    <TableCell className="text-center">{item.stock}</TableCell>
                    <TableCell className="text-center">{item.clStock}</TableCell>
                    <TableCell className="text-center">
                      {item.result === "✓" ? (
                        <Check size={16} className="mx-auto text-green-600" />
                      ) : (
                        <span className={item.status === 'short' ? "text-red-600" : "text-orange-600"}>
                          {item.result}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold"></TableCell>
                  <TableCell className="text-center font-bold">{totals.os}</TableCell>
                  <TableCell className="text-center font-bold">{totals.ns}</TableCell>
                  <TableCell className="text-center font-bold">{totals.sales}</TableCell>
                  <TableCell className="text-center font-bold">0</TableCell>
                  <TableCell className="text-center font-bold">0</TableCell>
                  <TableCell className="text-center font-bold">0</TableCell>
                  <TableCell className="text-center font-bold">{totals.stock}</TableCell>
                  <TableCell className="text-center font-bold">{totals.clStock}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}