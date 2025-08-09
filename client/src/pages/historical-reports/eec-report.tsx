import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Printer } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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

interface CompanyDetails {
  id: number;
  companyName: string;
  address1: string;
  address2?: string;
  telephone?: string;
  mobile?: string;
  fax?: string;
  website?: string;
  email?: string;
  vatNo?: string;
  compRegNo?: string;
  bankDetails?: string;
  einlNumber?: string;
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export default function EecReport() {
  const [fromDate, setFromDate] = useState<Date>(subWeeks(new Date(), 1));
  const [toDate, setToDate] = useState<Date>(new Date());

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

  const { data: companyDetails } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>EEC Report</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.totals{font-weight:bold;background-color:#f9f9f9;}</style>');
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
        printWindow.document.write(`<td>${item.quantity}</td>`);
        printWindow.document.write(`<td>£${Number(item.uPrice).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(item.amount).toFixed(2)}</td>`);
        printWindow.document.write(`<td>${item.supplier}</td>`);
        printWindow.document.write(`<td>${item.country}</td>`);
        printWindow.document.write('</tr>');
      });
      printWindow.document.write('</tbody></table>');
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    const wb = XLSX.utils.book_new();
    // Info sheet
    const info = [
      ['EEC REPORT'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      [''],
      ['Period:', `${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`],
      [''],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(info);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');
    // Data sheet
    const ws = XLSX.utils.json_to_sheet(eecData.map((item) => ({
      'Sl.No': item.slNo,
      'Date': item.date,
      'Commodity': item.commodity,
      'C.Code': item.cCode,
      'Weight': item.weight,
      'Quantity': item.quantity,
      'U.Price': Number(item.uPrice),
      'Amount': Number(item.amount),
      'Supplier': item.supplier,
      'Country': item.country
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'EEC Report');
    XLSX.writeFile(wb, `eec_report_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.xlsx`);
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('EEC REPORT', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`, 105, 40, { align: 'center' });
    const tableData = eecData.map((item) => [
      item.slNo,
      item.date,
      item.commodity,
      item.cCode,
      item.weight,
      item.quantity,
      `£${Number(item.uPrice).toFixed(2)}`,
      `£${Number(item.amount).toFixed(2)}`,
      item.supplier,
      item.country
    ]);
    autoTable(doc, {
      head: [[
        'Sl.No', 'Date', 'Commodity', 'C.Code', 'Weight', 'Quantity', 'U.Price', 'Amount', 'Supplier', 'Country'
      ]],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 20 },
        2: { cellWidth: 30 },
        3: { cellWidth: 20 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 },
        6: { cellWidth: 20 },
        7: { cellWidth: 25 },
        8: { cellWidth: 30 },
        9: { cellWidth: 20 }
      }
    });
    doc.save(`eec_report_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tDate\tCommodity\tC.Code\tWeight\tQuantity\tU.Price\tAmount\tSupplier\tCountry\n';
    text += eecData.map((item) => [
      item.slNo,
      item.date,
      item.commodity,
      item.cCode,
      item.weight,
      item.quantity,
      Number(item.uPrice).toFixed(2),
      Number(item.amount).toFixed(2),
      item.supplier,
      item.country
    ].join('\t')).join('\n');
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
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-center">£{Number(item.uPrice).toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{Number(item.amount).toFixed(2)}</TableCell>
                        <TableCell className="text-center">{item.supplier}</TableCell>
                        <TableCell className="text-center">{item.country}</TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="bg-blue-100 font-semibold">
                    <TableCell className="text-center" colSpan={3}>Total:</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
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
