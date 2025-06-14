import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Download, Copy, Printer } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SalesData {
  date: string;
  purchase: number;
  creditSales: number;
  cashSales: number;
  totalSales: number;
}

interface SalesSummary {
  sales: any[];
  summary: {
    totalPurchase: number;
    totalCredit: number;
    totalCash: number;
    totalSales: number;
  };
}

export default function SalesAnalysis() {
  const [fromDate, setFromDate] = useState("2025-06-10");
  const [toDate, setToDate] = useState("2025-06-10");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: salesData, isLoading } = useQuery({
    queryKey: ["/api/sales", fromDate, toDate],
    queryFn: () => apiRequest<SalesSummary>(`/api/sales?fromDate=${fromDate}&toDate=${toDate}`),
    enabled: !!fromDate && !!toDate
  });

  const handleSearch = () => {
    // Query will automatically refetch due to dependency on fromDate and toDate
  };

  const handleExport = (format: string) => {
    console.log(`Exporting to ${format}`);
  };

  // Sample data structure matching the attached image
  const salesRows: SalesData[] = [
    {
      date: "10-06-2025",
      purchase: 4608,
      creditSales: 0,
      cashSales: 4240,
      totalSales: 4240
    }
  ];

  const totals = {
    purchase: salesRows.reduce((sum, row) => sum + row.purchase, 0),
    creditSales: salesRows.reduce((sum, row) => sum + row.creditSales, 0),
    cashSales: salesRows.reduce((sum, row) => sum + row.cashSales, 0),
    totalSales: salesRows.reduce((sum, row) => sum + row.totalSales, 0)
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading sales analysis...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Sales Analysis</h1>
        <div className="text-sm text-gray-500">
          TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="fromDate">From Date:</Label>
            <Input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="toDate">To Date:</Label>
            <Input
              id="toDate"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={handleSearch}>
            Search
          </Button>
        </div>

        <div className="flex gap-2 mb-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleExport("pdf")}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            PDF
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleExport("excel")}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleExport("copy")}
            className="flex items-center gap-2"
          >
            <Copy className="h-4 w-4" />
            Copy
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => window.print()}
            className="flex items-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
          
          <div className="ml-auto">
            <Input
              placeholder="Search:"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 border-r">Sl.No</th>
                    <th className="text-left p-3 border-r">Date</th>
                    <th className="text-left p-3 border-r">Purchase</th>
                    <th className="text-left p-3 border-r">Credit Sales</th>
                    <th className="text-left p-3 border-r">Cash Sales</th>
                    <th className="text-left p-3">Total Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {salesRows.map((row, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-3 border-r">{index + 1}</td>
                      <td className="p-3 border-r">{row.date}</td>
                      <td className="p-3 border-r text-right">{row.purchase.toLocaleString()}</td>
                      <td className="p-3 border-r text-right">{row.creditSales}</td>
                      <td className="p-3 border-r text-right">{row.cashSales.toLocaleString()}</td>
                      <td className="p-3 text-right">{row.totalSales.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="border-b bg-gray-100 font-semibold">
                    <td className="p-3 border-r"></td>
                    <td className="p-3 border-r">Total:</td>
                    <td className="p-3 border-r text-right">{totals.purchase.toLocaleString()}</td>
                    <td className="p-3 border-r text-right">{totals.creditSales}</td>
                    <td className="p-3 border-r text-right">{totals.cashSales.toLocaleString()}</td>
                    <td className="p-3 text-right">{totals.totalSales.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="p-3 border-t text-sm text-gray-500 flex justify-between items-center">
              <span>Showing 1 to 1 of 1 entries</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled>Previous</Button>
                <Button variant="outline" size="sm" className="bg-blue-600 text-white">1</Button>
                <Button variant="outline" size="sm" disabled>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}