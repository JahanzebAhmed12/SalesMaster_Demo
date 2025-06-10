import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Copy, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AnalysisData {
  month: string;
  year: number;
  sales: number;
  returns: number;
  netSales: number;
  purchase: number;
  returnsSup: number;
  dumps: number;
  netPurchase: number;
  expenses: number;
  diff: number;
}

export default function FullAnalysis() {
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();
  const [searchTerm, setSearchTerm] = useState<string>("");

  const analysisData: AnalysisData[] = [
    {
      month: "June",
      year: 2025,
      sales: 19733,
      returns: 0,
      netSales: 19733,
      purchase: 21438,
      returnsSup: 0,
      dumps: 0,
      netPurchase: 21438,
      expenses: 0,
      diff: -1705
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Month Wise Purchase / Sales</h1>
            <div className="text-sm text-gray-500">
              TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ, ...
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Filter Section */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">From Date:</label>
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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "20250603"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">To Date:</label>
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
                      {toDate ? format(toDate, "yyyy-MM-dd") : "20250610"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Button className="bg-blue-600 hover:bg-blue-700 w-full">
                  Search
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export and Search Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  PDF
                </Button>
                <Button variant="outline" size="sm">
                  Excel
                </Button>
                <Button variant="outline" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
                <Button variant="outline" size="sm">
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <label htmlFor="search">Search:</label>
                <input
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                  placeholder=""
                />
              </div>
            </div>

            {/* Responsive Table Container */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[80px]">Month</TableHead>
                    <TableHead className="text-center min-w-[80px]">Year</TableHead>
                    <TableHead className="text-center min-w-[100px]">Sales</TableHead>
                    <TableHead className="text-center min-w-[100px]">Returns</TableHead>
                    <TableHead className="text-center min-w-[100px]">Net Sales</TableHead>
                    <TableHead className="text-center min-w-[100px]">Purchase</TableHead>
                    <TableHead className="text-center min-w-[100px]">Returns_Sup</TableHead>
                    <TableHead className="text-center min-w-[100px]">Dumps</TableHead>
                    <TableHead className="text-center min-w-[120px]">Net Purchase</TableHead>
                    <TableHead className="text-center min-w-[100px]">Expenses</TableHead>
                    <TableHead className="text-center min-w-[100px]">Diff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-center">{item.month}</TableCell>
                      <TableCell className="text-center">{item.year}</TableCell>
                      <TableCell className="text-center">{item.sales.toLocaleString()}</TableCell>
                      <TableCell className="text-center">{item.returns}</TableCell>
                      <TableCell className="text-center">{item.netSales.toLocaleString()}</TableCell>
                      <TableCell className="text-center">{item.purchase.toLocaleString()}</TableCell>
                      <TableCell className="text-center">{item.returnsSup}</TableCell>
                      <TableCell className="text-center">{item.dumps}</TableCell>
                      <TableCell className="text-center">{item.netPurchase.toLocaleString()}</TableCell>
                      <TableCell className="text-center">{item.expenses}</TableCell>
                      <TableCell className="text-center text-red-600">{item.diff.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-green-100 font-semibold">
                    <TableCell className="text-center" colSpan={2}>TOTAL</TableCell>
                    <TableCell className="text-center">£ 19,733</TableCell>
                    <TableCell className="text-center">£ 0</TableCell>
                    <TableCell className="text-center">£ 19,733</TableCell>
                    <TableCell className="text-center">£ 21,438</TableCell>
                    <TableCell className="text-center">£ 0</TableCell>
                    <TableCell className="text-center">£ 0</TableCell>
                    <TableCell className="text-center">£ 21,438</TableCell>
                    <TableCell className="text-center">£ 0</TableCell>
                    <TableCell className="text-center text-red-600">£ -1,705</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
              <div className="text-sm text-gray-600">
                Showing 1 to 1 of 1 entries
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Previous</span>
                <Button variant="outline" size="sm">1</Button>
                <span className="text-sm">Next</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
