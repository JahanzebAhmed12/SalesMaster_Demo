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
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [trigger, setTrigger] = useState(0); // for manual search

  // Fetch profit/loss data from backend
  const { data: profitData = [], isLoading, isError } = useQuery({
    queryKey: ["profit-loss", fromDate, toDate, searchTerm, trigger],
    queryFn: async () => {
      const params = new URLSearchParams({
        fromDate: fromDate ? format(fromDate, "yyyy-MM-dd") : "",
        toDate: toDate ? format(toDate, "yyyy-MM-dd") : "",
        search: searchTerm,
      });
      return apiRequest("GET", `/api/reports/profit-loss?${params.toString()}`);
    },
    enabled: !!fromDate && !!toDate,
  });

  const totals = {
    totalQuantity: profitData.reduce((sum: any, item: any) => sum + (item.totalQuantity || 0), 0),
    totPurchase: profitData.reduce((sum: any, item: any) => sum + (item.totPurchase || 0), 0),
    totSales: profitData.reduce((sum: any, item: any) => sum + (item.totSales || 0), 0),
    totProfit: profitData.reduce((sum: any, item: any) => sum + (item.totProfit || 0), 0)
  };
  const overallProfitPercent = totals.totPurchase ? (totals.totProfit / totals.totPurchase) * 100 : 0;

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
                <Button className="bg-blue-500 hover:bg-blue-600 w-full" onClick={() => setTrigger((t) => t + 1)}>
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
            {isLoading ? (
              <div className="text-center py-8">Loading...</div>
            ) : isError ? (
              <div className="text-center text-red-500 py-8">Failed to load data.</div>
            ) : (
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
                  {profitData.map((item: any) => (
                    <TableRow key={item.id} className={item.isLoss ? "bg-orange-50" : ""}>
                      <TableCell>{item.slNo}</TableCell>
                      <TableCell>{item.productDescription}</TableCell>
                      <TableCell className="text-center">{item.totalQuantity}</TableCell>
                      <TableCell className="text-center">{Number(item.avgPurchase).toFixed(2)}</TableCell>
                      <TableCell className="text-center">{Number(item.avgSales).toFixed(2)}</TableCell>
                      <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>
                        {Number(item.avgProfit).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">{Number(item.totPurchase).toFixed(2)}</TableCell>
                      <TableCell className="text-center">{Number(item.totSales).toFixed(2)}</TableCell>
                      <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>
                        {Number(item.totProfit).toFixed(2)}
                      </TableCell>
                      <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>
                        {Number(item.percentProfit).toFixed(2)} %
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
                    <TableCell className="text-center font-bold">£ {Number(totals.totPurchase).toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£ {Number(totals.totSales).toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">£ {Number(totals.totProfit).toFixed(2)}</TableCell>
                    <TableCell className="text-center font-bold">{Number(overallProfitPercent).toFixed(2)} %</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing {profitData.length} entries</div>
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