import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Printer, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PageLayout from "@/components/common/page-layout";
import { useBusinessDate } from "@/hooks/use-business-date";

export default function StockTemplate() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showPositiveOnly, setShowPositiveOnly] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);
  
  const dateManuallyChanged = useRef(false);
  
  const { businessDate, isLoading: isLoadingBusinessDate } = useBusinessDate();
  
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate && !dateManuallyChanged.current) {
      try {
        const formattedDate = format(new Date(businessDate), "yyyy-MM-dd");
        setSelectedDate(formattedDate);
      } catch (error) {
        console.error('Error processing business date:', error);
      }
    }
  }, [businessDate, isLoadingBusinessDate]);

  const { data: stockData = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["stock-template", selectedDate, showPositiveOnly],
    queryFn: () => apiRequest("GET", `/api/reports/stock-template?showPositiveOnly=${showPositiveOnly}`),
  });

  const { data: companyDetails } = useQuery({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  const emptyRows = Array.from({ length: 6 }, (_, index) => ({
    id: `empty-${index}`,
    description: '',
    currentStock: '',
    isEmpty: true
  }));

  const allRows = [...stockData, ...emptyRows];

  // Chunk items into groups of 3 for print/PDF layout only
  const chunkSize = 3;
  const printRows: any[][] = [];
  for (let i = 0; i < allRows.length; i += chunkSize) {
    printRows.push(allRows.slice(i, i + chunkSize));
  }

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContents = printRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Stock Template</title>');
      printWindow.document.write(`
        <style>
          body { font-family: Arial, sans-serif; margin: 10px; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 8px; }
          .company-info { text-align: right; font-size: 11px; }
          .title { font-size: 16px; font-weight: bold; }
          .date-section { margin: 15px 0; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 3px 4px; text-align: left; font-size: 9px; }
          th { background-color: #f5f5f5; font-weight: bold; text-align: center; }
          .screen-view { display: block; }
          .print-view { display: none; }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
            .screen-view { display: none !important; }
            .print-view { display: block !important; }
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

    doc.setFontSize(16);
    doc.text('Stock Template', 14, 20);

    if (companyDetails) {
      doc.setFontSize(10);
      const companyText = `${companyDetails.companyName || 'TROPIFRUIT UK LTD'}, ${companyDetails.address1 || '3 Dolphin Way, Purfleet'}, ${companyDetails.address2 || 'RM19 1NZ'}`;
      doc.text(companyText, 200, 20, { align: 'right' });
    }

    doc.setFontSize(12);
    doc.text(`Date: ${format(new Date(selectedDate), "dd/MM/yyyy")}`, 14, 35);

    const headRow = ['Product', 'Qty', 'Product', 'Qty', 'Product', 'Qty'];
    const bodyData = printRows.map(group => {
      const row: string[] = [];
      for (let c = 0; c < chunkSize; c++) {
        const item = group[c];
        row.push(item?.description || '');
        row.push('');
      }
      return row;
    });

    autoTable(doc, {
      startY: 45,
      head: [headRow],
      body: bodyData,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [245, 245, 245],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 18, halign: 'center' },
        2: { cellWidth: 38 },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 38 },
        5: { cellWidth: 18, halign: 'center' },
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      }
    });

    doc.save(`stock-template-${format(new Date(selectedDate), "yyyy-MM-dd")}.pdf`);
  };

  return (
    <PageLayout title="Stock Template" breadcrumb="Daily Reports > Stock Template">
      <style>{`
        .screen-view { display: block; }
        .print-view { display: none; }
        @media print {
          .screen-view { display: none !important; }
          .print-view { display: block !important; }
        }
      `}</style>
      <div className="space-y-6">
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
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <Label htmlFor="date">Date:</Label>
                <Input
                  id="date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    dateManuallyChanged.current = true;
                    setSelectedDate(e.target.value);
                  }}
                  className="w-40"
                />
              </div>
              <div className="flex items-center gap-2 mt-5">
                <Checkbox
                  id="positiveOnly"
                  checked={showPositiveOnly}
                  onCheckedChange={(checked) => setShowPositiveOnly(checked === true)}
                />
                <Label htmlFor="positiveOnly" className="text-sm cursor-pointer">Positive products only</Label>
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
                <div className="header no-print-hide" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>Stock Template</div>
                  <div style={{ textAlign: 'right', fontSize: '11px' }}>
                    {companyDetails?.companyName || 'TROPIFRUIT UK LTD'}, {companyDetails?.address1 || '3 Dolphin Way, Purfleet'}, {companyDetails?.address2 || 'RM19 1NZ'}
                  </div>
                </div>

                <div className="date-section no-print-hide" style={{ margin: '15px 0', fontSize: '13px' }}>
                  <strong>Date:</strong> {format(new Date(selectedDate), "dd/MM/yyyy")}
                </div>

                {/* Screen: single column layout */}
                <div className="screen-view">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="font-bold" style={{ width: '75%' }}>Product Description</TableHead>
                        <TableHead className="text-center font-bold" style={{ width: '25%' }}>Quantity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-8 text-gray-500">
                            No products found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        allRows.map((item, index) => (
                          <TableRow key={item.id || index} className={item.isEmpty ? "empty-row" : ""}>
                            <TableCell style={{ padding: '4px 6px' }}>
                              {item.isEmpty ? (
                                <span className="text-gray-300">-</span>
                              ) : (
                                <span style={{ color: item.currentStock < 0 ? '#dc2626' : '#2563eb' }}>{item.description}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center" style={{ padding: '4px 6px' }}>
                              <span className="text-gray-300">-</span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Print/PDF: three-column layout (hidden on screen, visible in print) */}
                <div className="print-view" style={{ display: 'none' }}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-center font-bold" style={{ width: '22%' }}>Product</TableHead>
                        <TableHead className="text-center font-bold" style={{ width: '11%' }}>Qty</TableHead>
                        <TableHead className="text-center font-bold" style={{ width: '22%' }}>Product</TableHead>
                        <TableHead className="text-center font-bold" style={{ width: '11%' }}>Qty</TableHead>
                        <TableHead className="text-center font-bold" style={{ width: '22%' }}>Product</TableHead>
                        <TableHead className="text-center font-bold" style={{ width: '11%' }}>Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {printRows.map((group, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {[0, 1, 2].map((colIndex) => {
                            const item = group[colIndex];
                            return (
                              <React.Fragment key={`pair-${rowIndex}-${colIndex}`}>
                                <TableCell style={{ padding: '3px 4px', fontSize: '9px' }}>
                                  {item && !item.isEmpty ? <span style={{ color: item.currentStock < 0 ? '#dc2626' : '#2563eb' }}>{item.description}</span> : ''}
                                </TableCell>
                                <TableCell className="text-center" style={{ padding: '3px 4px', fontSize: '9px' }}></TableCell>
                              </React.Fragment>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}