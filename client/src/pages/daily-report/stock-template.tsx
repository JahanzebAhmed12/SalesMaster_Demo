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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useBusinessDate } from "@/hooks/use-business-date";

// ─────────────────────────────────────────────────────────────────
// Column-major layout helper
//
// Given a flat list of items:
//   1. Decide how many rows fit per column on a single page (rowsPerCol)
//   2. A full page holds  rowsPerCol × cols  items
//   3. Fill col-0 top→bottom, then col-1, then col-2 (column-major)
//
// Returns:  pages  where each page is a 2-D array [row][col]
// Cells that have no item are null.
// ─────────────────────────────────────────────────────────────────
const buildColumnMajorPages = (
  items: any[],
  rowsPerCol: number,
  cols: number
): Array<Array<Array<any | null>>> => {
  const itemsPerPage = rowsPerCol * cols;
  const pages: Array<Array<Array<any | null>>> = [];

  for (let pageStart = 0; pageStart < items.length; pageStart += itemsPerPage) {
    const pageItems = items.slice(pageStart, pageStart + itemsPerPage);
    // Build column-major: col 0 gets indices 0…rowsPerCol-1, col 1 gets rowsPerCol…2*rowsPerCol-1 …
    const rows: Array<Array<any | null>> = [];
    for (let r = 0; r < rowsPerCol; r++) {
      const row: Array<any | null> = [];
      for (let c = 0; c < cols; c++) {
        const idx = c * rowsPerCol + r;
        row.push(idx < pageItems.length ? pageItems[idx] : null);
      }
      rows.push(row);
    }
    pages.push(rows);
  }
  return pages;
};

export default function StockTemplate() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showPositiveOnly, setShowPositiveOnly] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);
  const dateManuallyChanged = useRef(false);

  const { businessDate, isLoading: isLoadingBusinessDate } = useBusinessDate();

  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate && !dateManuallyChanged.current) {
      try {
        setSelectedDate(format(new Date(businessDate), "yyyy-MM-dd"));
      } catch {
        // ignore bad date
      }
    }
  }, [businessDate, isLoadingBusinessDate]);

  const { data: stockData = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["stock-template", selectedDate, showPositiveOnly],
    queryFn: () =>
      apiRequest("GET", `/api/reports/stock-template?showPositiveOnly=${showPositiveOnly}`),
  });

  const { data: companyDetails } = useQuery({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // ── Print ──────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "", "height=800,width=1000");
    if (!win) return;
    win.document.write(`
      <html><head><title>Stock Template</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; margin: 12px; font-size: 12px; }
        .page-header { display: flex; justify-content: space-between; align-items: flex-end;
                       border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
        .page-title  { font-size: 16px; font-weight: bold; }
        .company     { font-size: 11px; text-align: right; }
        .date-line   { font-size: 12px; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { border: 1px solid #333; padding: 5px 7px; font-size: 11px; font-weight: bold;
             background: #f0f0f0; text-align: center; }
        td { border: 1px solid #555; padding: 6px 7px; font-size: 12px; vertical-align: middle; }
        td.qty { text-align: center; }
        tr:nth-child(even) td { background: #fafafa; }
        .page-break { page-break-after: always; }
        @media print { body { margin: 0; } }
      </style></head><body>`);
    win.document.write(printRef.current.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  };

  // ── PDF ───────────────────────────────────────────────────────
  const handlePDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.width;   // 210
    const pageH = doc.internal.pageSize.height;  // 297
    const ML = 10, MR = 10, MT = 10;

    // How many rows fit: estimate based on row height 8 mm, header ~32 mm
    const ROW_H = 8;
    const HEADER_H = 32;
    const FOOTER_H = 10;
    const COLS = 3;
    const rowsPerCol = Math.floor((pageH - MT - HEADER_H - FOOTER_H) / ROW_H);
    const pages = buildColumnMajorPages(stockData as any[], rowsPerCol, COLS);

    const availW = pageW - ML - MR;
    const prodW = (availW / COLS) * 0.68;
    const qtyW  = (availW / COLS) * 0.32;

    pages.forEach((pageRows, pi) => {
      if (pi > 0) doc.addPage();

      // Header
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text("Stock Template", ML, MT + 7);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const co = companyDetails as any;
      if (co) {
        doc.text(
          `${co.companyName || "TROPIFRUIT UK LTD"}, ${co.address1 || ""}${co.address2 ? ", " + co.address2 : ""}`,
          pageW - MR,
          MT + 7,
          { align: "right" }
        );
      }
      doc.setFontSize(11);
      doc.text(`Date: ${format(new Date(selectedDate), "dd/MM/yyyy")}`, ML, MT + 16);
      doc.setDrawColor(0);
      doc.setLineWidth(0.4);
      doc.line(ML, MT + 19, pageW - MR, MT + 19);

      // Table head row labels
      const colHeads: string[] = [];
      for (let c = 0; c < COLS; c++) {
        colHeads.push("Product", "Qty");
      }

      const body = pageRows.map((group) =>
        group.flatMap((item: any) => [item ? item.description : "", ""])
      );

      autoTable(doc, {
        startY: MT + 22,
        head: [colHeads],
        body,
        theme: "grid",
        styles: { fontSize: 11, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 } },
        headStyles: {
          fillColor: [230, 230, 230],
          textColor: 0,
          fontStyle: "bold",
          halign: "center",
          fontSize: 11,
        },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        columnStyles: Object.fromEntries(
          Array.from({ length: COLS * 2 }, (_, i) => [
            i,
            i % 2 === 0
              ? { cellWidth: prodW, fontSize: 11 }
              : { cellWidth: qtyW, halign: "center" as const, fontSize: 11 },
          ])
        ),
        margin: { left: ML, right: MR },
      });
    });

    doc.save(`stock-template-${format(new Date(selectedDate), "yyyy-MM-dd")}.pdf`);
  };

  // ── Print preview pages ───────────────────────────────────────
  // Use ~33 rows per column so it looks similar to what will print on A4
  const ROWS_PER_COL_PREVIEW = 33;
  const printPages = buildColumnMajorPages(stockData as any[], ROWS_PER_COL_PREVIEW, 3);

  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .print-view { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-view { display: block !important; }
          .screen-view { display: none !important; }
        }
      `}</style>

      {/* ── Controls card ── */}
      <div className="space-y-6 no-print">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                <FileText size={20} />
                Stock Template
              </CardTitle>
              <div className="text-sm text-gray-500">
                {(companyDetails as any)?.companyName || "TROPIFRUIT UK LTD"},{" "}
                {(companyDetails as any)?.address1 || "3 Dolphin Way, Purfleet"}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4 flex-wrap">
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
                  className="w-44 mt-1"
                />
              </div>

              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  id="positiveOnly"
                  checked={showPositiveOnly}
                  onCheckedChange={(v) => setShowPositiveOnly(v === true)}
                />
                <Label htmlFor="positiveOnly" className="cursor-pointer">
                  Positive products only
                </Label>
              </div>

              <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
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

        {/* ── Screen table (single column, bigger rows) ── */}
        <Card className="screen-view">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="animate-spin h-6 w-6" />
                <span className="ml-2 text-base">Loading stock data…</span>
              </div>
            ) : isError ? (
              <div className="text-center text-red-500 py-10 text-base">
                Failed to load stock data.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-bold text-sm py-3 w-3/4">
                      Product Description
                    </TableHead>
                    <TableHead className="text-center font-bold text-sm py-3 w-1/4">
                      Quantity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(stockData as any[]).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center py-10 text-gray-500 text-base">
                        No products found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (stockData as any[]).map((item: any, idx: number) => (
                      <TableRow key={item.id ?? idx}>
                        <TableCell
                          className="py-3 text-sm"
                          style={{ color: item.currentStock < 0 ? "#dc2626" : "#1d4ed8" }}
                        >
                          {item.description}
                        </TableCell>
                        <TableCell className="text-center py-3 text-sm text-gray-300">
                          —
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Hidden print view (3-column, column-major) ── */}
      <div className="print-view" ref={printRef}>
        {printPages.map((pageRows, pi) => (
          <div
            key={pi}
            style={pi < printPages.length - 1 ? { pageBreakAfter: "always" } : {}}
          >
            {/* Page header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                borderBottom: "2px solid #000",
                paddingBottom: "6px",
                marginBottom: "8px",
              }}
            >
              <div style={{ fontSize: "16px", fontWeight: "bold" }}>Stock Template</div>
              <div style={{ fontSize: "11px", textAlign: "right" }}>
                {(companyDetails as any)?.companyName || "TROPIFRUIT UK LTD"}
              </div>
            </div>

            <div style={{ fontSize: "12px", marginBottom: "10px" }}>
              <strong>Date:</strong> {format(new Date(selectedDate), "dd/MM/yyyy")}
            </div>

            {/* 3-column table, column-major */}
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                {/* col widths: product ~22%, qty ~11%, ×3 = 99% */}
                {[0, 1, 2].map((c) => (
                  <React.Fragment key={c}>
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "11%" }} />
                  </React.Fragment>
                ))}
              </colgroup>
              <thead>
                <tr>
                  {[0, 1, 2].map((c) => (
                    <React.Fragment key={c}>
                      <th
                        style={{
                          border: "1px solid #333",
                          padding: "5px 7px",
                          fontSize: "11px",
                          fontWeight: "bold",
                          backgroundColor: "#f0f0f0",
                          textAlign: "center",
                        }}
                      >
                        Product
                      </th>
                      <th
                        style={{
                          border: "1px solid #333",
                          padding: "5px 7px",
                          fontSize: "11px",
                          fontWeight: "bold",
                          backgroundColor: "#f0f0f0",
                          textAlign: "center",
                        }}
                      >
                        Qty
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((group, rowIdx) => (
                  <tr
                    key={rowIdx}
                    style={{ backgroundColor: rowIdx % 2 === 0 ? "#fff" : "#fafafa" }}
                  >
                    {group.map((item: any, colIdx: number) => (
                      <React.Fragment key={colIdx}>
                        <td
                          style={{
                            border: "1px solid #555",
                            padding: "6px 7px",
                            fontSize: "12px",
                            verticalAlign: "middle",
                          }}
                        >
                          {item ? item.description : ""}
                        </td>
                        <td
                          style={{
                            border: "1px solid #555",
                            padding: "6px 7px",
                            fontSize: "12px",
                            textAlign: "center",
                          }}
                        />
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
