import React, { useState, useEffect } from "react";
import { useParams } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, Printer, Download } from "lucide-react";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBusinessDate } from "@/hooks/use-business-date";
import { DateRangeFilter } from "@/components/ui/date-range-filter";

export default function SupplierPurchaseHistoryPage() {
  const params = useParams();
  const supplierId = params.supplierId;
  const { currentDate: businessDate, isLoading: isLoadingBusinessDate } = useBusinessDate();
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);

  // Set dates to business date once it loads
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      setFromDate(new Date(businessDate));
      setToDate(new Date(businessDate));
    }
  }, [businessDate, isLoadingBusinessDate]);

  const { data: purchases = [], isLoading } = useQuery<any[]>({
    queryKey: ["supplier-purchase-history", supplierId, fromDate, toDate],
    queryFn: async () => {
      if (!supplierId || !fromDate || !toDate) return [];
      const res = await apiRequest(
        "GET",
        `/api/reports/supplier-purchase-history?supplierId=${supplierId}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}`
      );
      return res || [];
    },
  });

  // Export handlers (Print, PDF, Excel)
  const handlePrint = () => {
    const printContents = document.getElementById('supplier-purchase-history-table')?.outerHTML;
    if (!printContents) return;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}@media print{body{margin:0;}}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write('<div style="font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;">TROPIFRUIT UK LTD</div>');
      printWindow.document.write('<div style="font-size:16px;font-weight:bold;text-align:center;margin-bottom:8px;">Supplier Purchase History</div>');
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
    doc.text("Supplier Purchase History", 105, 20, { align: "center" });
    autoTable(doc, {
      head: [["Invoice No", "Date", "Product", "Quantity", "Unit Price", "Total"]],
      body: purchases.map((row: any) => [
        row.invoiceNo,
        row.date,
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
    doc.save("supplier-purchase-history.pdf");
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      purchases.map((row: any) => ({
        "Invoice No": row.invoiceNo,
        "Date": row.date,
        "Product": row.productDescription,
        "Quantity": row.quantity,
        "Unit Price": row.unitPrice,
        "Total": row.total,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier Purchase History");
    XLSX.writeFile(wb, "supplier-purchase-history.xlsx");
  };

  return (
    <PageLayout title="Supplier Purchase History" breadcrumb="Supplier Purchase History">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col space-y-4">
              <CardTitle className="text-xl font-bold">Supplier Purchase History</CardTitle>
              
              {/* Date Controls */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex flex-col sm:flex-row gap-2">
                  <DateRangeFilter
                    from={fromDate}
                    to={toDate}
                    onFromChange={setFromDate}
                    onToChange={setToDate}
                    fromLabel="From Date"
                    toLabel="To Date"
                    dateFormat="PPP"
                  />
                </div>
              </div>
              
              {/* Export Controls */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
                <Button variant="outline" size="sm" onClick={handlePDF}>
                  <FileText className="mr-2 h-4 w-4" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExcel}>
                  <Download className="mr-2 h-4 w-4" /> Excel
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="overflow-x-auto">
              <table id="supplier-purchase-history-table" className="w-full border-collapse border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Invoice No</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Date</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Product</th>
                    <th className="border border-gray-200 px-3 py-2 text-right font-medium">Quantity</th>
                    <th className="border border-gray-200 px-3 py-2 text-right font-medium">Unit Price</th>
                    <th className="border border-gray-200 px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="border border-gray-200 px-3 py-8 text-center text-gray-500">
                        Loading...
                      </td>
                    </tr>
                  ) : purchases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="border border-gray-200 px-3 py-8 text-center text-gray-500">
                        No data found
                      </td>
                    </tr>
                  ) : (
                    purchases.map((row: any, idx: number) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="border border-gray-200 px-3 py-2">{row.invoiceNo}</td>
                        <td className="border border-gray-200 px-3 py-2">{row.date}</td>
                        <td className="border border-gray-200 px-3 py-2">{row.productDescription}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right">{row.quantity}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right">£{Number(row.unitPrice).toFixed(2)}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right font-semibold">£{Number(row.total).toFixed(2)}</td>
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