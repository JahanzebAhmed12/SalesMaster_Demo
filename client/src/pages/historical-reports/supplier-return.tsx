import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Copy, Printer } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Supplier } from "@shared/schema";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SupplierReturnData {
  date: string;
  supplier: string;
  invoice: string;
  productName: string;
  remarks: string;
  quantity: number;
  unitPrice: number;
  total: number;
  action: string;
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

function toLocalDateString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function SupplierReturn() {
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date>(subWeeks(new Date(), 1));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchClicked, setSearchClicked] = useState(false);

  // Fetch suppliers for dropdown
  const { data: suppliers = [], isLoading: loadingSuppliers, error: suppliersError } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  const { data: companyDetails } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  const { data: supplierReturnData = [], isLoading } = useQuery<SupplierReturnData[]>({
    queryKey: [
      "supplier-returns",
      fromDate && toLocalDateString(fromDate),
      toDate && toLocalDateString(toDate),
      selectedSupplier,
      searchTerm,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      if (selectedSupplier && selectedSupplier !== "loading" && selectedSupplier !== "error") params.append("supplierId", selectedSupplier);
      if (searchTerm) params.append("search", searchTerm);
      return apiRequest("GET", `/api/reports/supplier-returns?${params.toString()}`);
    },
    enabled: !!searchClicked,
  });

  const totals = {
    quantity: supplierReturnData.reduce((sum, item) => sum + (item.quantity || 0), 0),
    unitPrice: supplierReturnData.reduce((sum, item) => sum + (item.unitPrice || 0), 0),
    total: supplierReturnData.reduce((sum, item) => sum + (item.total || 0), 0)
  };

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Supplier Returns</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.totals{font-weight:bold;background-color:#f9f9f9;}.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}</style>');
      printWindow.document.write('</head><body>');
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>SUPPLIER RETURNS REPORT</h2>');
      printWindow.document.write(`<p>${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</p>`);
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}</p>`);
      printWindow.document.write('</div>');
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Date</th>');
      printWindow.document.write('<th>Supplier</th>');
      printWindow.document.write('<th>Invoice# / Date</th>');
      printWindow.document.write('<th>Product Name</th>');
      printWindow.document.write('<th>Remarks</th>');
      printWindow.document.write('<th>Quantity</th>');
      printWindow.document.write('<th>Unit Price</th>');
      printWindow.document.write('<th>Total</th>');
      printWindow.document.write('</tr></thead><tbody>');
      supplierReturnData.forEach((row) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${format(new Date(row.date), "dd/MM/yyyy")}</td>`);
        printWindow.document.write(`<td>${row.supplier}</td>`);
        printWindow.document.write(`<td>${row.invoice}</td>`);
        printWindow.document.write(`<td>${row.productName}</td>`);
        printWindow.document.write(`<td>${row.remarks}</td>`);
        printWindow.document.write(`<td>${row.quantity}</td>`);
        printWindow.document.write(`<td>£${row.unitPrice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${row.total.toFixed(2)}</td>`);
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
    // Info sheet
    const info = [
      ['SUPPLIER RETURNS REPORT'],
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
    const ws = XLSX.utils.json_to_sheet(supplierReturnData.map((row) => ({
      'Date': format(new Date(row.date), "dd/MM/yyyy"),
      'Supplier': row.supplier,
      'Invoice# / Date': row.invoice,
      'Product Name': row.productName,
      'Remarks': row.remarks,
      'Quantity': row.quantity,
      'Unit Price': row.unitPrice,
      'Total': row.total
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier Returns');
    XLSX.writeFile(wb, `supplier_returns_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.xlsx`);
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('SUPPLIER RETURNS REPORT', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`, 105, 40, { align: 'center' });
    const tableData = supplierReturnData.map((row) => [
      format(new Date(row.date), "dd/MM/yyyy"),
      row.supplier,
      row.invoice,
      row.productName,
      row.remarks,
      row.quantity,
      `£${row.unitPrice.toFixed(2)}`,
      `£${row.total.toFixed(2)}`
    ]);
    autoTable(doc, {
      head: [[
        'Date', 'Supplier', 'Invoice# / Date', 'Product Name', 'Remarks', 'Quantity', 'Unit Price', 'Total'
      ]],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 40 },
        4: { cellWidth: 30 },
        5: { cellWidth: 15 },
        6: { cellWidth: 20 },
        7: { cellWidth: 20 }
      }
    });
    
    // Add footer text "stand100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10, { align: 'right' });
    
    doc.save(`supplier_returns_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Date\tSupplier\tInvoice# / Date\tProduct Name\tRemarks\tQuantity\tUnit Price\tTotal\n';
    text += supplierReturnData.map((row) => [
      format(new Date(row.date), "dd/MM/yyyy"),
      row.supplier,
      row.invoice,
      row.productName,
      row.remarks,
      row.quantity,
      row.unitPrice,
      row.total
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Supplier Return</h1>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingSuppliers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : suppliersError ? (
                      <SelectItem value="error" disabled>Error loading suppliers</SelectItem>
                    ) : (
                      suppliers.map((supplier: any) => (
                        <SelectItem key={supplier.id} value={supplier.id.toString()}>
                          {supplier.supplier_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "20250610"}
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
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setSearchClicked(v => !v)}>
                  Search
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Returns Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Supplier Returns</h2>
              <div className="bg-gray-200 px-4 py-2 rounded font-semibold">
                DEBIT NOTE
              </div>
            </div>

            {/* Export and Search */}
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
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[120px]">Supplier</TableHead>
                    <TableHead className="text-center min-w-[120px]">Invoice# / Date</TableHead>
                    <TableHead className="text-center min-w-[150px]">Product Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Remarks</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : supplierReturnData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">No data available in table</TableCell>
                    </TableRow>
                  ) : supplierReturnData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-center">{format(new Date(row.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-center">{row.supplier}</TableCell>
                      <TableCell className="text-center">{row.invoice}</TableCell>
                      <TableCell className="text-center">{row.productName}</TableCell>
                      <TableCell className="text-center">{row.remarks}</TableCell>
                      <TableCell className="text-center">{row.quantity}</TableCell>
                      <TableCell className="text-center">£{row.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{row.total.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-blue-100 font-semibold">
                    <TableCell className="text-center" colSpan={5}>TOTAL</TableCell>
                    <TableCell className="text-center">{totals.quantity}</TableCell>
                    <TableCell className="text-center">£{totals.unitPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{totals.total.toFixed(2)}</TableCell>
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