import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarIcon, Download, BarChart3, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import PageLayout from '@/components/common/page-layout';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SalesReportData {
  id: number;
  slNo: number;
  sageCode: string;
  productDescription: string;
  quantity: number;
  avgPrice: number;
  total: number;
}

export default function ProductSalesReport() {
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();
  const [queryFromDate, setQueryFromDate] = useState<Date>();
  const [queryToDate, setQueryToDate] = useState<Date>();

  const formattedFromDate = queryFromDate ? format(queryFromDate, "yyyy-MM-dd") : undefined;
  const formattedToDate = queryToDate ? format(queryToDate, "yyyy-MM-dd") : undefined;

  const { data: salesData = [], isLoading } = useQuery({
    queryKey: ['product-sales-report', formattedFromDate, formattedToDate],
    queryFn: async () => {
      console.log('Fetching data with dates:', { fromDate: formattedFromDate, toDate: formattedToDate });
      const queryParams = new URLSearchParams({
        fromDate: formattedFromDate || '',
        toDate: formattedToDate || ''
      }).toString();
      const response = await apiRequest(
        'GET',
        `/api/reports/product-sales?${queryParams}`
      );
      console.log('API Response:', response);
      return response;
    },
    enabled: !!formattedFromDate && !!formattedToDate,
  });

  console.log('Query State:', { formattedFromDate, formattedToDate, isLoading, dataLength: salesData?.length });

  const totalAmount = salesData.reduce((sum: number, item: SalesReportData) => sum + item.total, 0);

  const tableRef = useRef<HTMLDivElement>(null);

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
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(salesData.map((item: SalesReportData) => ({
      'Sl No': item.slNo,
      'Sage Code': item.sageCode,
      'Product Description': item.productDescription,
      'Qty': item.quantity,
      'Avg Price': item.avgPrice,
      'Total': item.total
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
    XLSX.writeFile(wb, 'product-sales-report.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.text('Product Sales Report', 14, 16);
    autoTable(doc, {
      head: [[
        'Sl No', 'Sage Code', 'Product Description', 'Qty', 'Avg Price', 'Total'
      ]],
      body: salesData.map((item: SalesReportData) => [
        item.slNo,
        item.sageCode,
        item.productDescription,
        item.quantity,
        item.avgPrice,
        item.total
      ]),
      startY: 22,
    });
    doc.save('product-sales-report.pdf');
  };

  const handleCopy = () => {
    const header = ['Sl No', 'Sage Code', 'Product Description', 'Qty', 'Avg Price', 'Total'];
    const rows = salesData.map((item: SalesReportData) => [
      item.slNo,
      item.sageCode,
      item.productDescription,
      item.quantity,
      item.avgPrice,
      item.total
    ]);
    const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    alert('Table copied to clipboard!');
  };

  return (
    <PageLayout 
      title="Product Sales Report" 
      breadcrumb="Reports > Product Sales Report"
    >
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">Filter Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              {/* From Date Picker */}
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium mb-2">From Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10",
                        !fromDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">
                        {fromDate ? format(fromDate, "PPP") : "Pick a date"}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* To Date Picker */}
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium mb-2">To Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal h-10",
                        !toDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">
                        {toDate ? format(toDate, "PPP") : "Pick a date"}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button 
            variant="default" 
            className="w-full sm:w-auto flex items-center justify-center gap-2"
            onClick={() => {
              setQueryFromDate(fromDate);
              setQueryToDate(toDate);
            }}
            disabled={!fromDate || !toDate}
          >
            <Download className="h-4 w-4" />
            <span>Get Data</span>
          </Button>
          <Button 
            variant="outline" 
            className="w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="truncate">Compare with Purchase</span>
          </Button>
          <Button 
            variant="outline" 
            className="w-full sm:w-auto flex items-center justify-center gap-2"
          >
            <Database className="h-4 w-4" />
            <span>Sage</span>
          </Button>
        </div>

        {/* Sales Report Table */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-lg sm:text-xl">Sales Report</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handlePrint}>Print</Button>
                <Button size="sm" variant="outline" onClick={handleExcel}>Excel</Button>
                <Button size="sm" variant="outline" onClick={handlePDF}>PDF</Button>
                <Button size="sm" variant="outline" onClick={handleCopy}>Copy</Button>
              </div>
              <div className="text-sm sm:text-base font-semibold text-primary">
                Total: ${totalAmount.toFixed(2)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto" ref={tableRef}>
              <div style={{ margin: '24px 0 24px 0', padding: '12px 24px', fontWeight: 500, background: '#f8fafc', borderRadius: 8 }}>
                Date Range: {formattedFromDate || '-'} to {formattedToDate || '-'}<br />
                Total: £{totalAmount.toFixed(2)}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 sm:w-16">Sl No</TableHead>
                    <TableHead className="min-w-[100px]">Sage Code</TableHead>
                    <TableHead className="min-w-[200px] sm:min-w-[250px]">Product Description</TableHead>
                    <TableHead className="w-20 sm:w-24 text-right">Qty</TableHead>
                    <TableHead className="w-24 sm:w-28 text-right">Avg Price</TableHead>
                    <TableHead className="w-24 sm:w-28 text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : salesData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    salesData.map((item: SalesReportData) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.slNo}</TableCell>
                        <TableCell className="font-mono text-sm">{item.sageCode}</TableCell>
                        <TableCell>
                          <div className="break-words">{item.productDescription}</div>
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">${item.avgPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-semibold">${item.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
