import { useState, useRef, useEffect } from "react";
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
  const [showProfit, setShowProfit] = useState(true);

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

  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => setShowProfit(settings.showProfit !== false));
  }, []);

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
    // Add company name at the top
    const companyName = companyDetails?.companyName || 'Company Name';
    doc.setFontSize(16);
    doc.text(companyName, 14, 12);
    doc.setFontSize(14);
    doc.text('Profit/Loss Report', 14, 22);
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
      startY: 32
    });
    // Add summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || 32;
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(12, finalY + 6, 185, showProfit ? 24 : 16, 'F');
    doc.setTextColor(40);
    // Left column
    doc.setFont('helvetica', 'bold');
    doc.text('Date Range:', 16, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`, 50, finalY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Quantity:', 16, finalY + 20);
    doc.setFont('helvetica', 'normal');
    doc.text(`${Number(totals.totalQuantity).toFixed(2)}`, 50, finalY + 20);
    if (showProfit) {
      doc.setFont('helvetica', 'bold');
      doc.text('Total Profit:', 16, finalY + 26);
      doc.setFont('helvetica', 'normal');
      doc.text(`£${Number(totals.totProfit).toFixed(2)}`, 50, finalY + 26);
    }
    // Right column (move Total Purchase to second row)
    doc.setFont('helvetica', 'bold');
    doc.text('Total Sales:', 115, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`£${Number(totals.totSales).toFixed(2)}`, 160, finalY + 14);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Purchase:', 115, finalY + 20);
    doc.setFont('helvetica', 'normal');
    doc.text(`£${Number(totals.totPurchase).toFixed(2)}`, 160, finalY + 20);
    if (showProfit) {
      doc.setFont('helvetica', 'bold');
      doc.text('Percent Profit:', 115, finalY + 26);
      doc.setFont('helvetica', 'normal');
      doc.text(`${Number(overallProfitPercent).toFixed(2)} %`, 160, finalY + 26);
    }
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
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
              {/* Company name heading for print */}
              <div className="text-xl font-bold text-center mb-2 print:block hidden">
                {companyDetails?.companyName || 'Company Name'}
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
                      {showProfit && <TableHead className="text-center">AVG Profit</TableHead>}
                      <TableHead className="text-center">TOT Purchase</TableHead>
                      <TableHead className="text-center">TOT Sales</TableHead>
                      {showProfit && <TableHead className="text-center">TOT Profit</TableHead>}
                      {showProfit && <TableHead className="text-center">PERCENT Profit %</TableHead>}
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
                        {showProfit && <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>{Number(item.avgProfit).toFixed(2)}</TableCell>}
                        <TableCell className="text-center">{Number(item.totPurchase).toFixed(2)}</TableCell>
                        <TableCell className="text-center">{Number(item.totSales).toFixed(2)}</TableCell>
                        {showProfit && <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>{Number(item.totProfit).toFixed(2)}</TableCell>}
                        {showProfit && <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>{Number(item.percentProfit).toFixed(2)} %</TableCell>}
                      </TableRow>
                    ))}
                    {/* Total Row */}
                    <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                      <TableCell></TableCell>
                      <TableCell className="font-bold"></TableCell>
                      <TableCell className="text-center font-bold">{totals.totalQuantity.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold"></TableCell>
                      <TableCell className="text-center font-bold"></TableCell>
                      {showProfit && <TableCell className="text-center font-bold"></TableCell>}
                      <TableCell className="text-center font-bold">£ {Number(totals.totPurchase).toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">£ {Number(totals.totSales).toFixed(2)}</TableCell>
                      {showProfit && <TableCell className="text-center font-bold">£ {Number(totals.totProfit).toFixed(2)}</TableCell>}
                      {showProfit && <TableCell className="text-center font-bold">{Number(overallProfitPercent).toFixed(2)} %</TableCell>}
                    </TableRow>
                  </TableBody>
                </Table>
              )}
              {/* Summary below table, styled for print and screen */}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mt-6 p-4 bg-gray-50 rounded-lg border print:mt-6 print:p-4 print:bg-white print:border print:rounded-lg print:flex-row print:items-center print:gap-x-8 print:gap-y-2">
                <div className="flex items-center font-semibold mr-2">Date Range:</div>
                <div className="mr-6">{format(fromDate, 'yyyy-MM-dd')} to {format(toDate, 'yyyy-MM-dd')}</div>
                <div className="flex items-center font-semibold mr-2">Total Quantity:</div>
                <div className="mr-6">{totals.totalQuantity.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Purchase:</div>
                <div className="mr-6">£{Number(totals.totPurchase).toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Sales:</div>
                <div className="mr-6">£{Number(totals.totSales).toFixed(2)}</div>
                {showProfit && <><div className="flex items-center font-semibold mr-2">Total Profit:</div>
                <div className="mr-6">£{Number(totals.totProfit).toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Percent Profit:</div>
                <div>{Number(overallProfitPercent).toFixed(2)} %</div></>}
              </div>
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