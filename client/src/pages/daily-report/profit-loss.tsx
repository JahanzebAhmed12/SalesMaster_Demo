import { useState } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, TrendingUp, FileText, Download, Copy, Printer, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ProfitLossItem {
  id: number;
  slNo: number;
  productDescription: string;
  totalQuantity: number;
  avgPurchase: number;
  avgSales: number;
  avgProfit: number;
  totPurchase: number;
  totSales: number;
  totProfit: number;
  percentProfit: number;
  isLoss?: boolean;
}

export default function ProfitLoss() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [searchTerm, setSearchTerm] = useState("");
  
  // Sample data matching the design
  const [profitData] = useState<ProfitLossItem[]>([
    {
      id: 1, slNo: 1, productDescription: "Aloe Vera (Sp)", totalQuantity: 1, avgPurchase: 11.11, avgSales: 12.00, 
      avgProfit: 0.89, totPurchase: 11.11, totSales: 12.00, totProfit: 0.89, percentProfit: 7.42
    },
    {
      id: 2, slNo: 2, productDescription: "Avocado", totalQuantity: 12, avgPurchase: 26.05, avgSales: 30.00, 
      avgProfit: 3.95, totPurchase: 312.60, totSales: 360.00, totProfit: 47.40, percentProfit: 13.17
    },
    {
      id: 3, slNo: 3, productDescription: "Cassava", totalQuantity: 6, avgPurchase: 32.05, avgSales: 38.00, 
      avgProfit: 5.95, totPurchase: 192.30, totSales: 228.00, totProfit: 35.70, percentProfit: 15.66
    },
    {
      id: 4, slNo: 4, productDescription: "chow chow", totalQuantity: 2, avgPurchase: 11.05, avgSales: 12.50, 
      avgProfit: 1.45, totPurchase: 22.10, totSales: 25.00, totProfit: 2.90, percentProfit: 11.6
    },
    {
      id: 5, slNo: 5, productDescription: "DASHEEN", totalQuantity: 1, avgPurchase: 50.05, avgSales: 53.00, 
      avgProfit: 2.95, totPurchase: 50.05, totSales: 53.00, totProfit: 2.95, percentProfit: 5.57
    },
    {
      id: 6, slNo: 6, productDescription: "Green banana", totalQuantity: 5, avgPurchase: 14.55, avgSales: 15.00, 
      avgProfit: 0.45, totPurchase: 72.75, totSales: 75.00, totProfit: 2.25, percentProfit: 3
    },
    {
      id: 7, slNo: 7, productDescription: "Green Plantain", totalQuantity: 9, avgPurchase: 27.92, avgSales: 28.67, 
      avgProfit: 0.75, totPurchase: 251.28, totSales: 258.00, totProfit: 6.75, percentProfit: 2.62
    },
    {
      id: 8, slNo: 8, productDescription: "JellyNut", totalQuantity: 3, avgPurchase: 22.05, avgSales: 30.00, 
      avgProfit: 7.95, totPurchase: 66.15, totSales: 90.00, totProfit: 23.85, percentProfit: 26.5
    },
    {
      id: 9, slNo: 9, productDescription: "Mango Dr", totalQuantity: 258, avgPurchase: 6.00, avgSales: 5.55, 
      avgProfit: -0.45, totPurchase: 1548.00, totSales: 1431.00, totProfit: -116.19, percentProfit: -8.13,
      isLoss: true
    },
    {
      id: 10, slNo: 10, productDescription: "Sweet Potato Brz", totalQuantity: 7, avgPurchase: 11.34, avgSales: 13.00, 
      avgProfit: 1.66, totPurchase: 79.38, totSales: 91.00, totProfit: 11.62, percentProfit: 12.77
    },
    {
      id: 11, slNo: 11, productDescription: "Yam Poona", totalQuantity: 3, avgPurchase: 30.05, avgSales: 30.00, 
      avgProfit: -0.05, totPurchase: 90.15, totSales: 90.00, totProfit: -0.15, percentProfit: -0.17,
      isLoss: true
    },
    {
      id: 12, slNo: 12, productDescription: "Yellow Plantain", totalQuantity: 70, avgPurchase: 26.05, avgSales: 21.79, 
      avgProfit: -4.26, totPurchase: 1823.50, totSales: 1525.00, totProfit: -298.20, percentProfit: -19.55,
      isLoss: true
    }
  ]);

  const totals = {
    totalQuantity: profitData.reduce((sum, item) => sum + item.totalQuantity, 0),
    totPurchase: profitData.reduce((sum, item) => sum + item.totPurchase, 0),
    totSales: profitData.reduce((sum, item) => sum + item.totSales, 0),
    totProfit: profitData.reduce((sum, item) => sum + item.totProfit, 0)
  };

  const overallProfitPercent = (totals.totProfit / totals.totPurchase) * 100;

  return (
    <PageLayout title="Profit/Loss Report" breadcrumb="Daily Report > Profit/Loss Report">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={20} />
                Profit/Loss Report
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
                <Button className="bg-blue-500 hover:bg-blue-600 w-full">
                  Search
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profit/Loss Table */}
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
                  <TableHead className="text-center">Total Quantity</TableHead>
                  <TableHead className="text-center">AVG Purchase</TableHead>
                  <TableHead className="text-center">AVG Sales</TableHead>
                  <TableHead className="text-center">AVG Profit</TableHead>
                  <TableHead className="text-center">TOT Purchase</TableHead>
                  <TableHead className="text-center">TOT Sales</TableHead>
                  <TableHead className="text-center">TOT Profit</TableHead>
                  <TableHead className="text-center">PERCENT Profit %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitData.map((item) => (
                  <TableRow key={item.id} className={item.isLoss ? "bg-orange-50" : ""}>
                    <TableCell>{item.slNo}</TableCell>
                    <TableCell>{item.productDescription}</TableCell>
                    <TableCell className="text-center">{item.totalQuantity}</TableCell>
                    <TableCell className="text-center">{item.avgPurchase.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{item.avgSales.toFixed(2)}</TableCell>
                    <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>
                      {item.avgProfit.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">{item.totPurchase.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{item.totSales.toFixed(2)}</TableCell>
                    <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>
                      {item.totProfit.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>
                      {item.percentProfit.toFixed(2)} %
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold"></TableCell>
                  <TableCell className="text-center font-bold">{totals.totalQuantity.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold"></TableCell>
                  <TableCell className="text-center font-bold"></TableCell>
                  <TableCell className="text-center font-bold"></TableCell>
                  <TableCell className="text-center font-bold">£ {totals.totPurchase.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£ {totals.totSales.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£ -{totals.totProfit.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{overallProfitPercent.toFixed(2)} %</TableCell>
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