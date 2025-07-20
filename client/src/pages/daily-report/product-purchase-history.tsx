import React, { useState } from "react";
import { useParams } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Printer, Download } from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProductPurchaseHistoryPage() {
  const params = useParams();
  const productId = params.productId;
  const [fromDate, setFromDate] = useState<Date | undefined>(new Date());
  const [toDate, setToDate] = useState<Date | undefined>(new Date());

  const { data: purchases = [], isLoading } = useQuery<any[]>({
    queryKey: ["product-purchase-history", productId, fromDate, toDate],
    queryFn: async () => {
      if (!productId || !fromDate || !toDate) return [];
      const res = await apiRequest(
        "GET",
        `/api/reports/product-purchase-history?productId=${productId}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}`
      );
      return res || [];
    },
  });

  // Export handlers (Print, PDF, Excel)
  const handlePrint = () => {
    const printContents = document.getElementById('product-purchase-history-table')?.outerHTML;
    if (!printContents) return;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}@media print{body{margin:0;}}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write('<div style="font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;">TROPIFRUIT UK LTD</div>');
      printWindow.document.write('<div style="font-size:16px;font-weight:bold;text-align:center;margin-bottom:8px;">Product Purchase History</div>');
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("TROPIFRUIT UK LTD", 105, 12, { align: "center" });
    doc.setFontSize(12);
    doc.text("Product Purchase History", 105, 20, { align: "center" });
    autoTable(doc, {
      head: [["Invoice No", "Date", "Supplier Name", "Product", "Quantity", "Unit Price", "Total"]],
      body: purchases.map((row: any) => [
        row.invoiceNo,
        row.date,
        row.supplierName,
        row.productDescription,
        row.quantity,
        `£${Number(row.unitPrice).toFixed(2)}`,
        `£${Number(row.total).toFixed(2)}`
      ]),
      startY: 28,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });
    doc.save("product-purchase-history.pdf");
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      purchases.map((row: any) => ({
        "Invoice No": row.invoiceNo,
        "Date": row.date,
        "Supplier Name": row.supplierName,
        "Product": row.productDescription,
        "Quantity": row.quantity,
        "Unit Price": row.unitPrice,
        "Total": row.total,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Product Purchase History");
    XLSX.writeFile(wb, "product-purchase-history.xlsx");
  };

  return (
    <PageLayout title="Product Purchase History" breadcrumb="Product Purchase History">
      <div className="pl-0 md:pl-64 pt-6 pr-4">
        <h1 className="text-2xl font-bold mb-4">Product Purchase History</h1>
        <Card className="mx-auto max-w-7xl">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-xl font-bold">Product Purchase History</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate ? format(fromDate, "PPP") : "From Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0">
                  <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate ? format(toDate, "PPP") : "To Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0">
                  <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus />
                </PopoverContent>
              </Popover>
              <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
              <Button variant="outline" onClick={handlePDF}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
              <Button variant="outline" onClick={handleExcel}><Download className="mr-2 h-4 w-4" /> Excel</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-full">
              <table id="product-purchase-history-table" className="min-w-full border border-gray-200 rounded-lg text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border-b px-4 py-2 text-left">Invoice No</th>
                    <th className="border-b px-4 py-2 text-left">Date</th>
                    <th className="border-b px-4 py-2 text-left">Supplier Name</th>
                    <th className="border-b px-4 py-2 text-left">Product</th>
                    <th className="border-b px-4 py-2 text-right">Quantity</th>
                    <th className="border-b px-4 py-2 text-right">Unit Price</th>
                    <th className="border-b px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="text-center py-8">Loading...</td></tr>
                  ) : purchases.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8">No data found</td></tr>
                  ) : (
                    purchases.map((row: any, idx: number) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="border-b px-4 py-2">{row.invoiceNo}</td>
                        <td className="border-b px-4 py-2">{row.date}</td>
                        <td className="border-b px-4 py-2">{row.supplierName}</td>
                        <td className="border-b px-4 py-2">{row.productDescription}</td>
                        <td className="border-b px-4 py-2 text-right">{row.quantity}</td>
                        <td className="border-b px-4 py-2 text-right">£{Number(row.unitPrice).toFixed(2)}</td>
                        <td className="border-b px-4 py-2 text-right font-semibold">£{Number(row.total).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
} 