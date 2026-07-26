import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Printer } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn, formatQuantity } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useCompanyDetails } from "@/hooks/use-company-details";
import { apiRequest } from "@/lib/queryClient";
import { useBusinessDate } from "@/hooks/use-business-date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface EECData {
  slNo: number;
  date: string;
  commodity: string;
  cCode: string;
  weight: number;
  quantity: number;
  uPrice: number;
  amount: number;
  supplier: string;
  country: string;
}

export default function EecReport() {
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
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

  const { data: eecData = [], isLoading } = useQuery<EECData[]>({
    queryKey: ["eec-report", fromDate, toDate],
    queryFn: async () => {
      if (!fromDate || !toDate) return [];
      const params = new URLSearchParams();
      params.append("fromDate", format(fromDate, "yyyy-MM-dd"));
      params.append("toDate", format(toDate, "yyyy-MM-dd"));
      return apiRequest("GET", `/api/reports/eec-report?${params.toString()}`);
    },
    enabled: !!fromDate && !!toDate,
  });

  // Calculate totals
  const totals = eecData.reduce(
    (acc, item) => ({
      weight: acc.weight + (item.weight || 0),
      quantity: acc.quantity + (item.quantity || 0),
      amount: acc.amount + (item.amount || 0),
    }),
    { weight: 0, quantity: 0, amount: 0 }
  );

  const { companyDetails } = useCompanyDetails();

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>EEC Report</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.totals{font-weight:bold;background-color:#f9f9f9;}.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}</style>');
      printWindow.document.write('</head><body>');
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>EEC REPORT</h2>');
      printWindow.document.write(`<p>${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</p>`);
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}</p>`);
      printWindow.document.write('</div>');
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Sl.No</th>');
      printWindow.document.write('<th>Date</th>');
      printWindow.document.write('<th>Commodity</th>');
      printWindow.document.write('<th>C.Code</th>');
      printWindow.document.write('<th>Weight</th>');
      printWindow.document.write('<th>Quantity</th>');
      printWindow.document.write('<th>U.Price</th>');
      printWindow.document.write('<th>Amount</th>');
      printWindow.document.write('<th>Supplier</th>');
      printWindow.document.write('<th>Country</th>');
      printWindow.document.write('</tr></thead><tbody>');
      eecData.forEach((item) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.slNo}</td>`);
        printWindow.document.write(`<td>${item.date}</td>`);
        printWindow.document.write(`<td>${item.commodity}</td>`);
        printWindow.document.write(`<td>${item.cCode}</td>`);
        printWindow.document.write(`<td>${item.weight}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.quantity)}</td>`);
        printWindow.document.write(`<td>£${Number(item.uPrice).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.amount).toFixed(2)}</td>`);
        printWindow.document.write(`<td>${item.supplier}</td>`);
        printWindow.document.write(`<td>${item.country}</td>`);
        printWindow.document.write('</tr>');
      });
      // Add total row
      printWindow.document.write('<tr style="font-weight:bold;background-color:#f9f9f9;">');
      printWindow.document.write('<td colspan="4" style="text-align:right;">Total:</td>');
      printWindow.document.write(`<td>${totals.weight.toLocaleString()}</td>`);
      printWindow.document.write(`<td>${formatQuantity(totals.quantity)}</td>`);
      printWindow.document.write('<td></td>');
      printWindow.document.write(`<td>£${totals.amount.toFixed(2)}</td>`);
      printWindow.document.write('<td colspan="2"></td>');
      printWindow.document.write('</tr>');
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
      ['EEC REPORT'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      [''],
      ['Period:', `${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`],
      [''],
      [''], // Empty row before table
      // Table headers
      ['Sl.No', 'Date', 'Commodity', 'C.Code', 'Weight', 'Quantity', 'U.Price', 'Amount', 'Supplier', 'Country']
    ];
    
    // Add data rows
    const dataRows = eecData.map((item) => [
      item.slNo,
      item.date,
      item.commodity,
      item.cCode,
      item.weight,
      formatQuantity(item.quantity),
      Number(item.uPrice).toFixed(2),
      Number(item.amount).toFixed(2),
      item.supplier,
      item.country
    ]);
    
    // Add total row
    dataRows.push([
      '', '', '', '',
      totals.weight,
      formatQuantity(totals.quantity),
      '',
      totals.amount.toFixed(2),
      '', ''
    ]);
    
    // Style the total row
    const totalRowIndex = dataRows.length - 1; // Last row is the total row
    
    // Combine header and data
    const allData = [...headerData, ...dataRows];
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(allData);
    
    // Style the header row (row 9, which is index 8)
    const headerRowIndex = 8;
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  // Sl.No
      { wch: 12 }, // Date
      { wch: 20 }, // Commodity
      { wch: 10 }, // C.Code
      { wch: 10 }, // Weight
      { wch: 10 }, // Quantity
      { wch: 12 }, // U.Price
      { wch: 12 }, // Amount
      { wch: 20 }, // Supplier
      { wch: 15 }  // Country
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
    
    // Style total row
    for (let col = 0; col <= 9; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: totalRowIndex + headerData.length, c: col });
      if (!ws[cellAddress]) continue;
      ws[cellAddress].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: "F3F4F6" } }
      };
      
      // Style numeric cells with number format
      if (col === 4 || col === 5 || col === 7) { // Weight, Quantity, Amount columns
        ws[cellAddress].t = 'n'; // Set cell type to number
        ws[cellAddress].z = col === 7 ? '#,##0.00' : '#,##0';
      }
    }
    
    // Style title cell
    if (ws['A1']) {
      ws['A1'].s = {
        font: { bold: true, sz: 16 },
        alignment: { horizontal: "center" }
      };
    }
    
    XLSX.utils.book_append_sheet(wb, ws, 'EEC Report');
    XLSX.writeFile(wb, `eec_report_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.xlsx`);
  };

  const handlePDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait orientation
    
    // Header
    doc.setFontSize(16);
    doc.text('EEC REPORT', 105, 20, { align: 'center' }); // Center for portrait
    doc.setFontSize(10);
    doc.text(`${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`, 105, 40, { align: 'center' });
    
    const tableData = eecData.map((item) => [
      item.slNo,
      item.date,
      item.commodity,
      item.cCode,
      item.weight,
      formatQuantity(item.quantity),
      `£${Number(item.uPrice).toFixed(2)}`,
      `£${Number(item.amount).toFixed(2)}`,
      item.supplier,
      item.country
    ]);
    
    // Add total row
    tableData.push([
      '', '', '', '',
      totals.weight,
      totals.quantity,
      '',
      `£${totals.amount.toFixed(2)}`,
      '', ''
    ]);
    
    autoTable(doc, {
      head: [[
        'Sl.No', 'Date', 'Commodity', 'C.Code', 'Weight', 'Quantity', 'U.Price', 'Amount', 'Supplier', 'Country'
      ]],
      foot: [
        [
          { content: 'Total:', colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
          { content: totals.weight.toLocaleString(), styles: { fontStyle: 'bold' } },
          { content: formatQuantity(totals.quantity), styles: { fontStyle: 'bold' } },
          '',
          { content: `£${totals.amount.toFixed(2)}`, styles: { fontStyle: 'bold' } },
          { content: '', colSpan: 2 }
        ]
      ],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        overflow: 'linebreak',
        cellWidth: 'wrap'
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 12 }, // Sl.No
        1: { cellWidth: 18 }, // Date
        2: { cellWidth: 25 }, // Commodity
        3: { cellWidth: 15 }, // C.Code
        4: { cellWidth: 15 }, // Weight
        5: { cellWidth: 15 }, // Quantity
        6: { cellWidth: 18 }, // U.Price
        7: { cellWidth: 20 }, // Amount
        8: { cellWidth: 25 }, // Supplier
        9: { cellWidth: 18 }  // Country
      },
      margin: { top: 50, right: 10, bottom: 30, left: 10 },
      tableWidth: 'auto',
      theme: 'striped'
    });
    
    // Add footer text "stand100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10, { align: 'right' });
    
    doc.save(`eec_report_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tCommodity\tC.Code\tWeight\tQuantity\tU.Price\tAmount\tSupplier\tCountry\n';
    // Add data rows
    text += eecData.map((item) => [
      item.slNo,
      item.date,
      item.commodity,
      item.cCode,
      item.weight,
      formatQuantity(item.quantity),
      Number(item.uPrice).toFixed(2),
      Number(item.amount).toFixed(2),
      item.supplier,
      item.country
    ].join('\t')).join('\n');
    
    // Add total row
    text += '\n' + [
      '', '', '', '',
      totals.weight,
      formatQuantity(totals.quantity),
      '',
      totals.amount.toFixed(2),
      '', ''
    ].join('\t');
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">EEC Report</h1>
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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "20241209"}
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

              <div className="flex gap-2">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Search
                </Button>
                <Button variant="outline" size="sm" onClick={handlePDF}>
                  PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handleExcel}>
                  Excel
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table Section */}
        <Card>
          <CardContent className="p-6">
            {/* Responsive Table Container */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[150px]">Commodity</TableHead>
                    <TableHead className="text-center min-w-[100px]">C.Code</TableHead>
                    <TableHead className="text-center min-w-[100px]">Weight</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">U.Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Amount</TableHead>
                    <TableHead className="text-center min-w-[120px]">Supplier</TableHead>
                    <TableHead className="text-center min-w-[100px]">Country</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : eecData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    eecData.map((item) => (
                      <TableRow key={item.slNo}>
                        <TableCell className="text-center">{item.slNo}</TableCell>
                        <TableCell className="text-center">{item.date}</TableCell>
                        <TableCell className="text-center">{item.commodity}</TableCell>
                        <TableCell className="text-center">{item.cCode}</TableCell>
                        <TableCell className="text-center">{item.weight}</TableCell>
                        <TableCell className="text-center">{formatQuantity(item.quantity)}</TableCell>
                        <TableCell className="text-center">£{Number(item.uPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{Number(item.amount).toFixed(2)}</TableCell>
                        <TableCell className="text-center">{item.supplier}</TableCell>
                        <TableCell className="text-center">{item.country}</TableCell>
                      </TableRow>
                    ))
                  )}
                <TableRow className="bg-blue-100 font-semibold">
                  <TableCell className="text-center" colSpan={4}>Total:</TableCell>
                  <TableCell className="text-center">{totals.weight.toLocaleString()}</TableCell>
                  <TableCell className="text-center">{formatQuantity(totals.quantity)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-center">£{totals.amount.toFixed(2)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>

                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
              <div className="text-sm text-gray-600">
                Showing 0 to 0 of 0 entries
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Previous</span>
                <Button variant="outline" size="sm" disabled>1</Button>
                <span className="text-sm">Next</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
