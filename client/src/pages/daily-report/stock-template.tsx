import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Printer, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PageLayout from "@/components/common/page-layout";

export default function StockTemplate() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch stock data
  const { data: stockData = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["stock-template", selectedDate],
    queryFn: () => apiRequest("GET", "/api/reports/stock-template"),
  });

  // Fetch company details for header
  const { data: companyDetails } = useQuery({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Add empty rows for template (5-6 empty rows after products)
  const emptyRows = Array.from({ length: 6 }, (_, index) => ({
    id: `empty-${index}`,
    description: '',
    currentStock: '',
    isEmpty: true
  }));

  const allRows = [...stockData, ...emptyRows];

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContents = printRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Stock Template</title>');
      printWindow.document.write(`
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .company-info { text-align: right; font-size: 12px; }
          .title { font-size: 18px; font-weight: bold; }
          .date-section { margin: 20px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #000; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; font-weight: bold; }
          .sl-no { width: 60px; text-align: center; }
          .quantity { width: 100px; text-align: center; }
          .empty-row { height: 30px; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      `);
      printWindow.document.write('</head><body>');
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    
    // Add header
    doc.setFontSize(16);
    doc.text('Stock Template', 14, 20);
    
    // Add company info
    if (companyDetails) {
      doc.setFontSize(10);
      const companyText = `${companyDetails.companyName || 'TROPIFRUIT UK LTD'}, ${companyDetails.address1 || '3 Dolphin Way, Purfleet'}, ${companyDetails.address2 || 'RM19 1NZ'}`;
      doc.text(companyText, 200, 20, { align: 'right' });
    }
    
    // Add date
    doc.setFontSize(12);
    doc.text(`Date: ${format(new Date(selectedDate), "dd/MM/yyyy")}`, 14, 35);
    
    // Prepare table data
    const tableData = allRows.map((item, index) => [
      (index + 1).toString(),
      item.description || '',
      '' // Leave quantity column empty for all products
    ]);
    
    // Add table
    autoTable(doc, {
      startY: 45,
      head: [['Sl.No', 'Product Description', 'Quantity']],
      body: tableData,
      theme: 'grid',
      styles: { 
        fontSize: 10,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 20 },
        1: { halign: 'left', cellWidth: 120 },
        2: { halign: 'center', cellWidth: 30 }
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      }
    });
    
    doc.save(`stock-template-${format(new Date(selectedDate), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <PageLayout title="Stock Template" breadcrumb="Daily Reports > Stock Template">
      <div className="space-y-6">
        {/* Header Controls */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <FileText size={20} />
                Stock Template
              </CardTitle>
              <div className="text-sm text-gray-500">
                {companyDetails?.companyName || 'TROPIFRUIT UK LTD'}, {companyDetails?.address1 || '3 Dolphin Way, Purfleet'}, {companyDetails?.address2 || 'RM19 1NZ'}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <Label htmlFor="date">Date:</Label>
                <Input
                  id="date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button 
                variant="outline" 
                onClick={() => refetch()}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : "Search"}
              </Button>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={handlePDF}>
                  <Download className="h-4 w-4 mr-1" />
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock Template Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <Loader2 className="animate-spin h-6 w-6" />
                <span className="ml-2">Loading stock data...</span>
              </div>
            ) : isError ? (
              <div className="text-center text-red-500 py-8">
                Failed to load stock data.
              </div>
            ) : (
              <div ref={printRef}>
                {/* Print Header */}
                <div className="header no-print-hide">
                  <div className="title">Stock Template</div>
                  <div className="company-info">
                    {companyDetails?.companyName || 'TROPIFRUIT UK LTD'}, {companyDetails?.address1 || '3 Dolphin Way, Purfleet'}, {companyDetails?.address2 || 'RM19 1NZ'}
                  </div>
                </div>
                
                <div className="date-section no-print-hide">
                  <strong>Date:</strong> {format(new Date(selectedDate), "dd/MM/yyyy")}
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center font-bold">Sl.No</TableHead>
                      <TableHead className="font-bold">Product Description</TableHead>
                      <TableHead className="w-24 text-center font-bold">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRows.map((item, index) => (
                      <TableRow key={item.id} className={item.isEmpty ? "empty-row" : ""}>
                        <TableCell className="text-center font-medium">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          {item.isEmpty ? (
                            <span className="text-gray-300">-</span>
                          ) : (
                            <span className="text-blue-600">{item.description}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-gray-300">-</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}