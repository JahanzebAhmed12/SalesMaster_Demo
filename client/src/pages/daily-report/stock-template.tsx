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

  // Build column-major pages for print/PDF (fill col 1, then col 2, then col 3)
  const getColumnMajorPages = (items: any[], itemsPerPage: number, cols: number): any[][][] => {
    if (items.length === 0) return [];
    const pages: any[][][] = [];
    for (let i = 0; i < items.length; i += itemsPerPage) {
      const pageItems = items.slice(i, i + itemsPerPage);
      const n = pageItems.length;
      const itemsPerCol = Math.ceil(n / cols);
      const rows: any[][] = [];
      for (let r = 0; r < itemsPerCol; r++) {
        const row: any[] = [];
        for (let c = 0; c < cols; c++) {
          const idx = c * itemsPerCol + r;
          row.push(idx < n ? pageItems[idx] : null);
        }
        rows.push(row);
      }
      pages.push(rows);
    }
    return pages;
  };

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
    const pageWidth = doc.internal.pageSize.width;
    const leftMargin = 14;
    const rightMargin = 14;
    const availableWidth = pageWidth - leftMargin - rightMargin;
    const colCount = 3;
    const colWidth = availableWidth / colCount;
    const productColWidth = colWidth * 0.65;
    const qtyColWidth = colWidth * 0.35;

    const headerHeight = 28;
    const rowHeight = 7;
    const bodyHeight = doc.internal.pageSize.height - 20 - 20;
    const rowsPerCol = Math.floor((bodyHeight - headerHeight) / rowHeight);
    const itemsPerPage = Math.max(rowsPerCol * colCount, colCount);

    const pages = getColumnMajorPages(stockData, itemsPerPage, colCount);

    pages.forEach((pageRows, pageIdx) => {
      if (pageIdx > 0) doc.addPage();

      doc.setFontSize(16);
      doc.text('Stock Template', leftMargin, 20);
      if (companyDetails) {
        doc.setFontSize(10);
        doc.text(companyDetails.companyName || 'TROPIFRUIT UK LTD', pageWidth - rightMargin, 20, { align: 'right' });
      }
      doc.setFontSize(12);
      doc.text(`Date: ${format(new Date(selectedDate), "dd/MM/yyyy")}`, leftMargin, 32);

      const bodyData = pageRows.map(group => {
        const row: string[] = [];
        group.forEach((item: any) => {
          row.push(item?.description || '');
          row.push('');
        });
        return row;
      });

      autoTable(doc, {
        startY: 40,
        head: [['Product', 'Qty', 'Product', 'Qty', 'Product', 'Qty']],
        body: bodyData,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 3 },
        headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: productColWidth },
          1: { cellWidth: qtyColWidth, halign: 'center' },
          2: { cellWidth: productColWidth },
          3: { cellWidth: qtyColWidth, halign: 'center' },
          4: { cellWidth: productColWidth },
          5: { cellWidth: qtyColWidth, halign: 'center' },
        },
        margin: { left: leftMargin, right: rightMargin },
        alternateRowStyles: { fillColor: [250, 250, 250] },
      });
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
                      {stockData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center py-8 text-gray-500">
                            No products found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        stockData.map((item, index) => (
                          <TableRow key={item.id || index}>
                            <TableCell style={{ padding: '4px 6px', color: item.currentStock < 0 ? '#dc2626' : '#2563eb' }}>
                              {item.description}
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

                {/* Print/PDF: column-major three-column layout (hidden on screen, visible in print) */}
                <div className="print-view" style={{ display: 'none' }}>
                  {(() => {
                    const pages = getColumnMajorPages(stockData, 99, 3);
                    return pages.map((pageRows, pageIdx) => (
                      <div key={pageIdx} style={pageIdx < pages.length - 1 ? { pageBreakAfter: 'always' } : {}}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '2px solid #000', paddingBottom: '4px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Stock Template</div>
                          <div style={{ textAlign: 'right', fontSize: '10px' }}>
                            {companyDetails?.companyName || 'TROPIFRUIT UK LTD'}
                          </div>
                        </div>
                        <div style={{ marginBottom: '8px', fontSize: '11px' }}>
                          <strong>Date:</strong> {format(new Date(selectedDate), "dd/MM/yyyy")}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              {[0, 1, 2].map(col => (
                                <React.Fragment key={`hdr-${col}`}>
                                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#f5f5f5', width: '22%' }}>Product</th>
                                  <th style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '10px', fontWeight: 'bold', textAlign: 'center', backgroundColor: '#f5f5f5', width: '11%' }}>Qty</th>
                                </React.Fragment>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pageRows.map((group, rowIdx) => (
                              <tr key={rowIdx}>
                                {group.map((item: any, colIdx: number) => (
                                  <React.Fragment key={`cell-${rowIdx}-${colIdx}`}>
                                    <td style={{ border: '1px solid #000', padding: '3px 6px', fontSize: '10px' }}>
                                      {item ? item.description : ''}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '3px 6px', fontSize: '10px', textAlign: 'center' }}></td>
                                  </React.Fragment>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}