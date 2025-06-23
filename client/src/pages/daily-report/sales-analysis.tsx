import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Download, Copy, Printer } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SalesData {
  slNo: number;
  date: string;
  purchase: number;
  creditSales: number;
  cashSales: number;
  totalSales: number;
}

interface SalesSummary {
  totalPurchase: number;
  totalCredit: number;
  totalCash: number;
  totalSales: number;
}

interface SalesAnalysisResponse {
  sales: SalesData[];
  summary: SalesSummary;
}

export default function SalesAnalysis() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  const { data, isLoading, isError } = useQuery<SalesAnalysisResponse>({
    queryKey: ["/api/reports/sales-analysis", fromDate, toDate, searchTerm],
    queryFn: () =>
      apiRequest("GET", `/api/reports/sales-analysis?fromDate=${fromDate}&toDate=${toDate}&search=${encodeURIComponent(searchTerm)}`),
    enabled: !!fromDate && !!toDate,
  });

  const handleSearch = () => {
    // Query will automatically refetch due to dependency on fromDate, toDate, searchTerm
  };

  const handleExport = (format: string) => {
    console.log(`Exporting to ${format}`);
  };

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
    if (!data?.sales) return;
    const ws = XLSX.utils.json_to_sheet(data.sales.map((row: SalesData) => ({
      'Sl.No': row.slNo,
      'Date': row.date,
      'Purchase': row.purchase,
      'Credit Sales': row.creditSales,
      'Cash Sales': row.cashSales,
      'Total Sales': row.totalSales
    })));
    // Add totals row
    XLSX.utils.sheet_add_aoa(ws, [[null, 'Total:', data.summary.totalPurchase, data.summary.totalCredit, data.summary.totalCash, data.summary.totalSales]], { origin: -1 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Analysis');
    XLSX.writeFile(wb, 'sales-analysis.xlsx');
  };

  const handlePDF = () => {
    if (!data?.sales) return;
    const doc = new jsPDF();
    doc.text('Sales Analysis', 14, 14);
    autoTable(doc, {
      head: [[
        'Sl.No',
        'Date',
        'Purchase',
        'Credit Sales',
        'Cash Sales',
        'Total Sales'
      ]],
      body: [
        ...data.sales.map((row: SalesData) => [
          row.slNo,
          row.date,
          row.purchase,
          row.creditSales,
          row.cashSales,
          row.totalSales
        ]),
        [null, 'Total:', data.summary.totalPurchase, data.summary.totalCredit, data.summary.totalCash, data.summary.totalSales]
      ],
      startY: 24
    });
    doc.save('sales-analysis.pdf');
  };

  const handleCopy = () => {
    if (!data?.sales) return;
    let text = 'Sl.No\tDate\tPurchase\tCredit Sales\tCash Sales\tTotal Sales\n';
    text += data.sales.map((row: SalesData) => [
      row.slNo,
      row.date,
      row.purchase,
      row.creditSales,
      row.cashSales,
      row.totalSales
    ].join('\t')).join('\n');
    text += `\n\tTotal:\t${data.summary.totalPurchase}\t${data.summary.totalCredit}\t${data.summary.totalCash}\t${data.summary.totalSales}`;
    navigator.clipboard.writeText(text);
  };

  const salesRows = data?.sales || [];
  const totals = data?.summary || {
    totalPurchase: 0,
    totalCredit: 0,
    totalCash: 0,
    totalSales: 0,
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading sales analysis...</div>;
  }
  if (isError) {
    return <div className="flex items-center justify-center h-96 text-red-500">Failed to load sales analysis.</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Sales Analysis</h1>
        <div className="text-sm text-gray-500">
          {companyDetails?.companyName || 'Company Name'}, {companyDetails?.address1 || ''}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ''}
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
          <Button variant="outline" size="sm" onClick={handlePDF} className="flex items-center gap-2"><FileText className="h-4 w-4" />PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExcel} className="flex items-center gap-2"><Download className="h-4 w-4" />Excel</Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="flex items-center gap-2"><Copy className="h-4 w-4" />Copy</Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="flex items-center gap-2"><Printer className="h-4 w-4" />Print</Button>
          
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
            <div className="overflow-x-auto" ref={tableRef}>
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
                  {salesRows.map((row: SalesData, index: number) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-3 border-r">{row.slNo}</td>
                      <td className="p-3 border-r">{row.date}</td>
                      <td className="p-3 border-r text-right">{row.purchase.toLocaleString()}</td>
                      <td className="p-3 border-r text-right">{row.creditSales.toLocaleString()}</td>
                      <td className="p-3 border-r text-right">{row.cashSales.toLocaleString()}</td>
                      <td className="p-3 text-right">{row.totalSales.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="border-b bg-gray-100 font-semibold">
                    <td className="p-3 border-r"></td>
                    <td className="p-3 border-r">Total:</td>
                    <td className="p-3 border-r text-right">{totals.totalPurchase.toLocaleString()}</td>
                    <td className="p-3 border-r text-right">{totals.totalCredit.toLocaleString()}</td>
                    <td className="p-3 border-r text-right">{totals.totalCash.toLocaleString()}</td>
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