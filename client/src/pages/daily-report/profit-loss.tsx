import { useState, useRef } from "react";
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
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const tableRef = useRef<HTMLDivElement>(null);

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
    totalQuantity: profitData.reduce((sum: number, item: any) => sum + (Number(item.totalQuantity) || 0), 0),
    totPurchase: profitData.reduce((sum: number, item: any) => sum + (Number(item.totPurchase) || 0), 0),
    totSales: profitData.reduce((sum: number, item: any) => sum + (Number(item.totSales) || 0), 0),
    totProfit: profitData.reduce((sum: number, item: any) => sum + (Number(item.totProfit) || 0), 0)
  };
  const overallProfitPercent = totals.totPurchase ? (totals.totProfit / totals.totPurchase) * 100 : 0;

  // Calculate total profit/loss
  const totalProfit = profitData.reduce((sum: number, item: ProfitLossItem) => sum + (Number(item.totProfit) || 0), 0) || 0;

  // Export handlers
  const handlePrint = () => {
    if (!tableRef.current) return;
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    if (!profitData) return;
    const ws = XLSX.utils.json_to_sheet(profitData.map((item: ProfitLossItem) => ({
      'Sl No': item.slNo,
      'Product Description': item.productDescription,
      'Total Qty': item.totalQuantity,
      'Avg Purchase': item.avgPurchase,
      'Avg Sales': item.avgSales,
      'Avg Profit': item.avgProfit,
      'Total Purchase': item.totPurchase,
      'Total Sales': item.totSales,
      'Total Profit': item.totProfit,
      'Profit %': item.percentProfit
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Profit Loss');
    XLSX.writeFile(wb, 'profit-loss-report.xlsx');
  };

  const handlePDF = () => {
    if (!profitData) return;
    const doc = new jsPDF();
    doc.text('Profit/Loss Report', 14, 14);
    autoTable(doc, {
      head: [[
        'Sl No',
        'Product Description',
        'Total Qty',
        'Avg Purchase',
        'Avg Sales',
        'Avg Profit',
        'Total Purchase',
        'Total Sales',
        'Total Profit',
        'Profit %'
      ]],
      body: profitData.map((item: ProfitLossItem) => [
        item.slNo,
        item.productDescription,
        item.totalQuantity,
        item.avgPurchase,
        item.avgSales,
        item.avgProfit,
        item.totPurchase,
        item.totSales,
        item.totProfit,
        item.percentProfit
      ]),
      startY: 24
    });
    doc.save('profit-loss-report.pdf');
  };

  const handleCopy = () => {
    if (!profitData) return;
    let text = 'Sl No\tProduct Description\tTotal Qty\tAvg Purchase\tAvg Sales\tAvg Profit\tTotal Purchase\tTotal Sales\tTotal Profit\tProfit %\n';
    text += profitData.map((item: ProfitLossItem) => [
      item.slNo,
      item.productDescription,
      item.totalQuantity,
      item.avgPurchase,
      item.avgSales,
      item.avgProfit,
      item.totPurchase,
      item.totSales,
      item.totProfit,
      item.percentProfit
    ].join('\t')).join('\n');
    navigator.clipboard.writeText(text);
  };

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
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="font-semibold text-lg">Profit/Loss Report</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handlePrint}>Print</Button>
              <Button size="sm" variant="outline" onClick={handleExcel}>Excel</Button>
              <Button size="sm" variant="outline" onClick={handlePDF}>PDF</Button>
              <Button size="sm" variant="outline" onClick={handleCopy}>Copy</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto" ref={tableRef}>
              <div style={{ margin: '24px 0 24px 0', padding: '12px 24px', fontWeight: 500, background: '#f8fafc', borderRadius: 8 }}>
                Date Range: {format(fromDate, "yyyy-MM-dd")} to {format(toDate, "yyyy-MM-dd")}<br />
                Total Profit: £{Number(totalProfit).toFixed(2)}
              </div>
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
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}