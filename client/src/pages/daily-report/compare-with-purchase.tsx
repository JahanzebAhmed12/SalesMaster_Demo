import React, { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Printer, Download, ArrowLeft } from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/components/ui/date-range-filter";

interface CompareData {
  productId: number;
  productDescription: string;
  totalQuantity: number;
  avgSaleToday: number;
  avgPurchaseToday: number;
  avgOutstandingStock: number;
  avgPurchasePrice: number;
  status: string;
}

export default function CompareWithPurchasePage() {
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());

  const { data: compareData, isLoading, error } = useQuery({
    queryKey: ["compare-with-purchase", fromDate, toDate],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/reports/compare-with-purchase?fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}`
      );
      return response as CompareData[];
    },
    enabled: !!fromDate && !!toDate,
  });

  const handlePrint = () => {
    const printContents = document.getElementById('compare-with-purchase-table')?.outerHTML;
    if (printContents) {
      const originalContents = document.body.innerHTML;
      document.body.innerHTML = printContents;
      window.print();
      document.body.innerHTML = originalContents;
    }
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text('Compare with Purchase Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Date Range: ${format(fromDate, "dd-MM-yyyy")} to ${format(toDate, "dd-MM-yyyy")}`, 14, 30);
    
    // Add table
    if (compareData && compareData.length > 0) {
      const tableData = compareData.map(item => [
        item.productDescription,
        item.totalQuantity.toFixed(2),
        `£${item.avgSaleToday.toFixed(2)}`,
        `£${item.avgPurchaseToday.toFixed(2)}`,
        `£${item.avgOutstandingStock.toFixed(2)}`,
        `£${item.avgPurchasePrice.toFixed(2)}`,
        item.status
      ]);
      
      autoTable(doc, {
        head: [['Product', 'Total Qty', 'Avg Sale', 'Avg Purchase', 'Avg O.S', 'Avg PP', 'Status']],
        body: tableData,
        startY: 45,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [66, 139, 202] }
      });
    }
    
    doc.save("compare-with-purchase.pdf");
  };

  const handleExcel = () => {
    if (!compareData) return;
    
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Product Description', 'Total Quantity', 'Avg Sale(Today)', 'Avg Purchase(Today)', 'Avg Outstanding Stock', 'Avg Purchase Price', 'Status'],
      ...compareData.map(item => [
        item.productDescription,
        item.totalQuantity.toFixed(2),
        item.avgSaleToday.toFixed(2),
        item.avgPurchaseToday.toFixed(2),
        item.avgOutstandingStock.toFixed(2),
        item.avgPurchasePrice.toFixed(2),
        item.status
      ])
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Compare with Purchase");
    XLSX.writeFile(wb, "compare-with-purchase.xlsx");
  };

  const handleBack = () => {
    window.history.back();
  };

  return (
    <PageLayout title="Compare with Purchase" breadcrumb="Daily Report > Compare with Purchase">
      <div className="space-y-6">
          {/* Header Section */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex justify-between items-center">
                <CardTitle className="flex items-center gap-2">
                  <ArrowLeft size={20} className="cursor-pointer" onClick={handleBack} />
                  Compare with Purchase
                </CardTitle>
                <div className="text-sm text-gray-500">
                  TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 items-end">
                <DateRangeFilter
                  from={fromDate}
                  to={toDate}
                  onFromChange={setFromDate}
                  onToChange={setToDate}
                  wrapperStyle={{ minWidth: 180, flex: '1 1 180px' }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Compare Table */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                    <FileText size={14} /> PDF
                  </Button>
                  <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                    <Download size={14} /> Excel
                  </Button>
                  <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                    <Printer size={14} /> Print
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto" id="compare-with-purchase-table">
                <Table className="min-w-[900px] w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sl.No</TableHead>
                      <TableHead>Product Description</TableHead>
                      <TableHead className="text-center">Total Quantity</TableHead>
                      <TableHead className="text-center">AVG Sale(Today)</TableHead>
                      <TableHead className="text-center">AVG Purchase(Today)</TableHead>
                      <TableHead className="text-center">AVG of O.S</TableHead>
                      <TableHead className="text-center">AVG PP</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          Loading comparison data...
                        </TableCell>
                      </TableRow>
                    ) : error ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-red-500">
                          Error loading comparison data
                        </TableCell>
                      </TableRow>
                    ) : compareData && compareData.length > 0 ? (
                      compareData.map((item, index) => (
                        <TableRow key={item.productId}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{item.productDescription}</TableCell>
                          <TableCell className="text-center">{item.totalQuantity.toFixed(2)}</TableCell>
                          <TableCell className="text-center">£{item.avgSaleToday.toFixed(2)}</TableCell>
                          <TableCell className="text-center">
                            {item.avgPurchaseToday > 0 ? `£${item.avgPurchaseToday.toFixed(2)}` : '-'}
                          </TableCell>
                          <TableCell className="text-center">£{item.avgOutstandingStock.toFixed(2)}</TableCell>
                          <TableCell className="text-center">£{item.avgPurchasePrice.toFixed(2)}</TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                              item.status === '✓' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {item.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          No comparison data found for the selected date range.
                        </TableCell>
                      </TableRow>
                    )}
                    
                    {/* Total Row */}
                    {compareData && compareData.length > 0 && (
                      <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                        <TableCell></TableCell>
                        <TableCell className="font-bold">TOTAL</TableCell>
                        <TableCell className="text-center font-bold">
                          {compareData.reduce((sum, item) => sum + item.totalQuantity, 0).toFixed(2)}
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                      </TableRow>
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