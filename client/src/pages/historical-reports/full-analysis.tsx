import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Copy, Printer } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useCompanyDetails } from "@/hooks/use-company-details";
import { apiRequest } from "@/lib/queryClient";
import { useBusinessDate } from "@/hooks/use-business-date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AnalysisData {
  month: string;
  year: number;
  sales: number;
  returns: number;
  netSales: number;
  purchase: number;
  returnsSup: number;
  dumps: number;
  netPurchase: number;
  expenses: number;
  diff: number;
}

export default function FullAnalysis() {
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchClicked, setSearchClicked] = useState(false);
  const { businessDate } = useBusinessDate();
  const initialSet = useRef(false);

  useEffect(() => {
    if (businessDate && !initialSet.current) {
      const bd = new Date(businessDate);
      setToDate(bd);
      setFromDate(subWeeks(bd, 1));
      initialSet.current = true;
    }
  }, [businessDate]);

  const { data: analysisData = [], isLoading } = useQuery<AnalysisData[]>({
    queryKey: [
      "full-analysis",
      fromDate && toLocalDateString(fromDate),
      toDate && toLocalDateString(toDate),
      searchTerm,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      if (searchTerm) params.append("search", searchTerm);
      return apiRequest("GET", `/api/reports/full-analysis?${params.toString()}`);
    },
    enabled: !!searchClicked,
  });

  const { companyDetails } = useCompanyDetails();

  const totals = analysisData.reduce(
    (acc, item) => {
      acc.sales += item.sales || 0;
      acc.returns += item.returns || 0;
      acc.netSales += item.netSales || 0;
      acc.purchase += item.purchase || 0;
      acc.returnsSup += item.returnsSup || 0;
      acc.dumps += item.dumps || 0;
      acc.netPurchase += item.netPurchase || 0;
      acc.expenses += item.expenses || 0;
      acc.diff += item.diff || 0;
      return acc;
    },
    { sales: 0, returns: 0, netSales: 0, purchase: 0, returnsSup: 0, dumps: 0, netPurchase: 0, expenses: 0, diff: 0 }
  );

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=1200');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Full Analysis Report</title>');
      printWindow.document.write('<style>@page { size: landscape; margin: 0.5in; } body{font-family:Arial,sans-serif;margin:10px;font-size:12px;}table{width:100%;border-collapse:collapse;margin-top:15px;table-layout:fixed;}th,td{border:1px solid #ccc;padding:4px;text-align:center;font-size:10px;word-wrap:break-word;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:15px;}.totals{font-weight:bold;background-color:#f9f9f9;}.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}th:nth-child(1),td:nth-child(1){width:8%;}th:nth-child(2),td:nth-child(2){width:6%;}th:nth-child(3),td:nth-child(3){width:9%;}th:nth-child(4),td:nth-child(4){width:9%;}th:nth-child(5),td:nth-child(5){width:10%;}th:nth-child(6),td:nth-child(6){width:10%;}th:nth-child(7),td:nth-child(7){width:10%;}th:nth-child(8),td:nth-child(8){width:8%;}th:nth-child(9),td:nth-child(9){width:11%;}th:nth-child(10),td:nth-child(10){width:9%;}th:nth-child(11),td:nth-child(11){width:10%;}</style>');
      printWindow.document.write('</head><body>');
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>MONTH WISE PURCHASE / SALES</h2>');
      printWindow.document.write(`<p>${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</p>`);
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}</p>`);
      printWindow.document.write('</div>');
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Month</th>');
      printWindow.document.write('<th>Year</th>');
      printWindow.document.write('<th>Sales</th>');
      printWindow.document.write('<th>Returns</th>');
      printWindow.document.write('<th>Net Sales</th>');
      printWindow.document.write('<th>Purchase</th>');
      printWindow.document.write('<th>Returns_Sup</th>');
      printWindow.document.write('<th>Dumps</th>');
      printWindow.document.write('<th>Net Purchase</th>');
      printWindow.document.write('<th>Expenses</th>');
      printWindow.document.write('<th>Diff</th>');
      printWindow.document.write('</tr></thead><tbody>');
      analysisData.forEach((item) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.month}</td>`);
        printWindow.document.write(`<td>${item.year}</td>`);
        printWindow.document.write(`<td>£${Number(item.sales).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.returns).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.netSales).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.purchase).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.returnsSup).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.dumps).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.netPurchase).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.expenses).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.diff).toFixed(2)}</td>`);
        printWindow.document.write('</tr>');
      });
      printWindow.document.write('</tbody></table>');
      
      // Add footer text
      printWindow.document.write('<div class="footer">stand100</div>');
      
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Create header information
    const headerData = [
      ['MONTH WISE PURCHASE / SALES'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      [''],
      ['Period:', `${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`],
      [''],
      [''], // Empty row before table
      // Table headers
      ['Month', 'Year', 'Sales', 'Returns', 'Net Sales', 'Purchase', 'Returns_Sup', 'Dumps', 'Net Purchase', 'Expenses', 'Diff']
    ];
    
    // Add data rows
    const dataRows = analysisData.map((item) => [
      item.month,
      item.year,
      Number(item.sales).toFixed(2),
      Number(item.returns).toFixed(2),
      Number(item.netSales).toFixed(2),
      Number(item.purchase).toFixed(2),
      Number(item.returnsSup).toFixed(2),
      Number(item.dumps).toFixed(2),
      Number(item.netPurchase).toFixed(2),
      Number(item.expenses).toFixed(2),
      Number(item.diff).toFixed(2)
    ]);
    
    // Add totals row
    const totalsRow = [
      'TOTAL',
      '',
      Number(totals.sales).toFixed(2),
      Number(totals.returns).toFixed(2),
      Number(totals.netSales).toFixed(2),
      Number(totals.purchase).toFixed(2),
      Number(totals.returnsSup).toFixed(2),
      Number(totals.dumps).toFixed(2),
      Number(totals.netPurchase).toFixed(2),
      Number(totals.expenses).toFixed(2),
      Number(totals.diff).toFixed(2)
    ];
    
    // Combine header, data, and totals
    const allData = [...headerData, ...dataRows, totalsRow];
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(allData);
    
    // Style the header row (row 9, which is index 8)
    const headerRowIndex = 8;
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Month
      { wch: 8 },  // Year
      { wch: 12 }, // Sales
      { wch: 12 }, // Returns
      { wch: 12 }, // Net Sales
      { wch: 12 }, // Purchase
      { wch: 12 }, // Returns_Sup
      { wch: 10 }, // Dumps
      { wch: 14 }, // Net Purchase
      { wch: 12 }, // Expenses
      { wch: 12 }  // Diff
    ];
    
    // Style header cells
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: col });
      if (!ws[cellAddress]) continue;
      ws[cellAddress].s = {
        fill: { fgColor: { rgb: "3B82F6" } },
        font: { color: { rgb: "FFFFFF" }, bold: true },
        alignment: { horizontal: "center" }
      };
    }
    
    // Style totals row
    const totalsRowIndex = headerRowIndex + dataRows.length + 1;
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: totalsRowIndex, c: col });
      if (!ws[cellAddress]) continue;
      ws[cellAddress].s = {
        fill: { fgColor: { rgb: "C6F6D5" } },
        font: { bold: true },
        alignment: { horizontal: "center" }
      };
    }
    
    // Style title cell
    if (ws['A1']) {
      ws['A1'].s = {
        font: { bold: true, sz: 16 },
        alignment: { horizontal: "center" }
      };
    }
    
    XLSX.utils.book_append_sheet(wb, ws, 'Full Analysis');
    XLSX.writeFile(wb, `full_analysis_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.xlsx`);
  };

  const handlePDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait orientation
    doc.setFontSize(16);
    doc.text('MONTH WISE PURCHASE / SALES', 105, 20, { align: 'center' }); // Center for portrait
    doc.setFontSize(10);
    doc.text(`${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`, 105, 40, { align: 'center' });
    const tableData = analysisData.map((item) => [
      item.month,
      item.year,
      `£${Number(item.sales).toFixed(2)}`,
      `£${Number(item.returns).toFixed(2)}`,
      `£${Number(item.netSales).toFixed(2)}`,
      `£${Number(item.purchase).toFixed(2)}`,
      `£${Number(item.returnsSup).toFixed(2)}`,
      `£${Number(item.dumps).toFixed(2)}`,
      `£${Number(item.netPurchase).toFixed(2)}`,
      `£${Number(item.expenses).toFixed(2)}`,
      `£${Number(item.diff).toFixed(2)}`
    ]);
    autoTable(doc, {
      head: [[
        'Month', 'Year', 'Sales', 'Returns', 'Net Sales', 'Purchase', 'Returns_Sup', 'Dumps', 'Net Purchase', 'Expenses', 'Diff'
      ]],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 7,
        cellPadding: 1.5
      },
      columnStyles: {
        0: { cellWidth: 15 }, // Month
        1: { cellWidth: 12 }, // Year
        2: { cellWidth: 16 }, // Sales
        3: { cellWidth: 16 }, // Returns
        4: { cellWidth: 18 }, // Net Sales
        5: { cellWidth: 18 }, // Purchase
        6: { cellWidth: 18 }, // Returns_Sup
        7: { cellWidth: 15 }, // Dumps
        8: { cellWidth: 20 }, // Net Purchase
        9: { cellWidth: 16 }, // Expenses
        10: { cellWidth: 16 } // Diff
      },
      margin: { left: 10, right: 10 }
    });
    
    // Add footer text "stand100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10, { align: 'right' });
    
    doc.save(`full_analysis_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Month\tYear\tSales\tReturns\tNet Sales\tPurchase\tReturns_Sup\tDumps\tNet Purchase\tExpenses\tDiff\n';
    text += analysisData.map((item) => [
      item.month,
      item.year,
      `£${Number(item.sales).toFixed(2)}`,
      `£${Number(item.returns).toFixed(2)}`,
      `£${Number(item.netSales).toFixed(2)}`,
      `£${Number(item.purchase).toFixed(2)}`,
      `£${Number(item.returnsSup).toFixed(2)}`,
      `£${Number(item.dumps).toFixed(2)}`,
      `£${Number(item.netPurchase).toFixed(2)}`,
      `£${Number(item.expenses).toFixed(2)}`,
      `£${Number(item.diff).toFixed(2)}`
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Month Wise Purchase / Sales</h1>
            <div className="text-sm text-gray-500">
              {companyDetails ? (
                <>
                  {companyDetails.companyName}, {companyDetails.address1}
                  {companyDetails.address2 && `, ${companyDetails.address2}`}
                </>
              ) : (
                "Loading company details..."
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Filter Section */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">From Date:</label>
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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "20250603"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">To Date:</label>
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
                      {toDate ? format(toDate, "yyyy-MM-dd") : "20250610"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Button className="bg-blue-600 hover:bg-blue-700 w-full" onClick={() => setSearchClicked(v => !v)}>
                  Search
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export and Search Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handlePDF}>
                  <FileText className="w-4 h-4 mr-2" />
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExcel}>
                  Excel
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <label htmlFor="search">Search:</label>
                <input
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                  placeholder=""
                />
              </div>
            </div>

            {/* Responsive Table Container */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[80px]">Month</TableHead>
                    <TableHead className="text-center min-w-[80px]">Year</TableHead>
                    <TableHead className="text-center min-w-[100px]">Sales</TableHead>
                    <TableHead className="text-center min-w-[100px]">Returns</TableHead>
                    <TableHead className="text-center min-w-[100px]">Net Sales</TableHead>
                    <TableHead className="text-center min-w-[100px]">Purchase</TableHead>
                    <TableHead className="text-center min-w-[100px]">Returns_Sup</TableHead>
                    <TableHead className="text-center min-w-[100px]">Dumps</TableHead>
                    <TableHead className="text-center min-w-[120px]">Net Purchase</TableHead>
                    <TableHead className="text-center min-w-[100px]">Expenses</TableHead>
                    <TableHead className="text-center min-w-[100px]">Diff</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : analysisData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">No data available</TableCell>
                    </TableRow>
                  ) : analysisData.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="text-center">{item.month}</TableCell>
                      <TableCell className="text-center">{item.year}</TableCell>
                      <TableCell className="text-center">£ {Number(item.sales).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {Number(item.returns).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {Number(item.netSales).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {Number(item.purchase).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {Number(item.returnsSup).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {Number(item.dumps).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {Number(item.netPurchase).toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {Number(item.expenses).toFixed(2)}</TableCell>
                      <TableCell className="text-center text-red-600">£ {Number(item.diff).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-green-100 font-semibold">
                    <TableCell className="text-center" colSpan={2}>TOTAL</TableCell>
                    <TableCell className="text-center">£ {Number(totals.sales).toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {Number(totals.returns).toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {Number(totals.netSales).toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {Number(totals.purchase).toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {Number(totals.returnsSup).toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {Number(totals.dumps).toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {Number(totals.netPurchase).toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {Number(totals.expenses).toFixed(2)}</TableCell>
                    <TableCell className="text-center text-red-600">£ {Number(totals.diff).toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
              <div className="text-sm text-gray-600">
                Showing {analysisData.length > 0 ? 1 : 0} to {analysisData.length} of {analysisData.length} entries
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Previous</span>
                <Button variant="outline" size="sm">1</Button>
                <span className="text-sm">Next</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
