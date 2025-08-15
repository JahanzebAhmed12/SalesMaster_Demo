import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Building, FileText, Download, Copy, Printer, Search, Printer as PrintIcon, FileText as ReportIcon, Globe } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SupplierData {
  id: number;
  slNo: number;
  supplierName: string;
  purchaseInvoice: number;
  amountPaid: number;
  creditAdj: number;
  discountAdj: number;
  balanceOutstanding: number;
  creditLimit: number;
  currency: string;
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

export default function AllSupplierHistory() {
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [supplierFilter, setSupplierFilter] = useState("All Suppliers");
  const [searchTerm, setSearchTerm] = useState("");
  const [supplierData, setSupplierData] = useState<SupplierData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: companyDetails } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // Calculate totals
  const totals = {
    purchaseInvoice: supplierData.reduce((sum, item) => sum + item.purchaseInvoice, 0),
    amountPaid: supplierData.reduce((sum, item) => sum + item.amountPaid, 0),
    creditAdj: supplierData.reduce((sum, item) => sum + item.creditAdj, 0),
    discountAdj: supplierData.reduce((sum, item) => sum + item.discountAdj, 0),
    balanceOutstanding: supplierData.reduce((sum, item) => sum + item.balanceOutstanding, 0)
  };

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<SupplierData[]>(
        "GET",
        `/api/reports/all-supplier-history?fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}`
      );
      setSupplierData(res);
    } catch (err: any) {
      setError(err.message || "Failed to fetch data");
    }
    setLoading(false);
  };

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>All Supplier History</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.totals{font-weight:bold;background-color:#f9f9f9;}');
      printWindow.document.write('.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>ALL SUPPLIER HISTORY</h2>');
      printWindow.document.write(`<p>${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</p>`);
      printWindow.document.write(`<p>Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}</p>`);
      printWindow.document.write('</div>');
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Sl.No</th>');
      printWindow.document.write('<th>Supplier Name</th>');
      printWindow.document.write('<th>Purchase Invoice</th>');
      printWindow.document.write('<th>Amount Paid</th>');
      printWindow.document.write('<th>Credit/Adj</th>');
      printWindow.document.write('<th>Discount/Adj</th>');
      printWindow.document.write('<th>Balance Outstanding</th>');
      printWindow.document.write('<th>Credit Limit</th>');
      printWindow.document.write('<th>Currency</th>');
      printWindow.document.write('</tr></thead><tbody>');
      supplierData.forEach(supplier => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${supplier.slNo}</td>`);
        printWindow.document.write(`<td>${supplier.supplierName}</td>`);
        printWindow.document.write(`<td>${supplier.purchaseInvoice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${supplier.amountPaid.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${supplier.creditAdj.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${supplier.discountAdj.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${supplier.balanceOutstanding.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${supplier.creditLimit}</td>`);
        printWindow.document.write(`<td>${supplier.currency}</td>`);
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
      ['ALL SUPPLIER HISTORY'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      [''],
      ['Period:', `${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`],
      [''],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(info);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');
    // Data sheet
    const ws = XLSX.utils.json_to_sheet(supplierData.map(supplier => ({
      'Sl.No': supplier.slNo,
      'Supplier Name': supplier.supplierName,
      'Purchase Invoice': supplier.purchaseInvoice,
      'Amount Paid': supplier.amountPaid,
      'Credit/Adj': supplier.creditAdj,
      'Discount/Adj': supplier.discountAdj,
      'Balance Outstanding': supplier.balanceOutstanding,
      'Credit Limit': supplier.creditLimit,
      'Currency': supplier.currency
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'All Supplier History');
    XLSX.writeFile(wb, `all_supplier_history_${format(fromDate, "yyyyMMdd")}_${format(toDate, "yyyyMMdd")}.xlsx`);
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('ALL SUPPLIER HISTORY', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 30, { align: 'center' });
    doc.text(`Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, 105, 40, { align: 'center' });
    const tableData = supplierData.map(supplier => [
      supplier.slNo.toString(),
      supplier.supplierName,
      supplier.purchaseInvoice.toFixed(2),
      supplier.amountPaid.toFixed(2),
      supplier.creditAdj.toFixed(2),
      supplier.discountAdj.toFixed(2),
      supplier.balanceOutstanding.toFixed(2),
      supplier.creditLimit.toString(),
      supplier.currency
    ]);
    autoTable(doc, {
      head: [[
        'Sl.No', 'Supplier Name', 'Purchase Invoice', 'Amount Paid', 'Credit/Adj', 'Discount/Adj', 'Balance Outstanding', 'Credit Limit', 'Currency'
      ]],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 40 },
        2: { cellWidth: 20 },
        3: { cellWidth: 20 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 },
        6: { cellWidth: 20 },
        7: { cellWidth: 20 },
        8: { cellWidth: 15 }
      }
    });
    
    // Add footer text "stand100" on bottom right
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10, { align: 'right' });
    
    doc.save(`all_supplier_history_${format(fromDate, "yyyyMMdd")}_${format(toDate, "yyyyMMdd")}.pdf`);
  };

  const handleCopy = async () => {
    let text = 'Sl.No\tSupplier Name\tPurchase Invoice\tAmount Paid\tCredit/Adj\tDiscount/Adj\tBalance Outstanding\tCredit Limit\tCurrency\n';
    text += supplierData.map(supplier => [
      supplier.slNo,
      supplier.supplierName,
      supplier.purchaseInvoice,
      supplier.amountPaid,
      supplier.creditAdj,
      supplier.discountAdj,
      supplier.balanceOutstanding,
      supplier.creditLimit,
      supplier.currency
    ].join('\t')).join('\n');
    await navigator.clipboard.writeText(text);
  };

  return (
    <PageLayout title="All Supplier History" breadcrumb="Historical Reports > All Supplier History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Building size={20} />
                All Supplier History
              </CardTitle>
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
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div>
                <Label>From:</Label>
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
                      {fromDate ? format(fromDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={(date) => date && setFromDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>To:</Label>
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
                      {toDate ? format(toDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={(date) => date && setToDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Suppliers">All Suppliers</SelectItem>
                    <SelectItem value="Active Only">Active Only</SelectItem>
                    <SelectItem value="With Outstanding">With Outstanding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Move action buttons below date pickers */}
            <div className="flex flex-wrap gap-2 mt-4">
              <Button className="bg-blue-500 hover:bg-blue-600" onClick={handleSearch} disabled={loading}>
                {loading ? "Loading..." : "Search"}
              </Button>
              <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2" onClick={handlePrint}>
                <PrintIcon size={16} />
                Print
              </Button>
              <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2" onClick={handlePDF}>
                <FileText size={16} />
                PDF
              </Button>
              <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2" onClick={handleExcel}>
                <Download size={16} />
                Excel
              </Button>
              <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2" onClick={handleCopy}>
                <Copy size={16} />
                Copy
              </Button>
              <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                <Globe size={16} />
                Select Currency
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Statement Section */}
        <Card>
          <CardHeader>
            <div className="bg-emerald-600 text-white text-center py-2 rounded">
              SUPPLIER STATEMENT (IN Respective Currency)
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">Show all rows</Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                  <FileText size={14} />
                  PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                  <Download size={14} />
                  Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                  <Copy size={14} />
                  Copy
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                  <Printer size={14} />
                  Print
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search:"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-48"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-center py-2">{error}</div>
            )}

            <Table>
              <TableHeader>
                <TableRow className="bg-emerald-100">
                  <TableHead>Sl.No</TableHead>
                  <TableHead>Supplier name</TableHead>
                  <TableHead className="text-center">Purchase Invoice</TableHead>
                  <TableHead className="text-center">Amount Paid</TableHead>
                  <TableHead className="text-center">Credit/ Adjustment</TableHead>
                  <TableHead className="text-center">Discount/ Adjustment</TableHead>
                  <TableHead className="text-center">Balance/ outstanding</TableHead>
                  <TableHead className="text-center">Credit Limit</TableHead>
                  <TableHead className="text-center">Curr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierData.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-gray-500 py-8">
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  supplierData
                    .filter(supplier => {
                      if (!searchTerm) return true;
                      const term = searchTerm.toLowerCase();
                      return (
                        (supplier.supplierName || "").toLowerCase().includes(term) ||
                        (supplier.currency || "").toLowerCase().includes(term)
                      );
                    })
                    .map((supplier) => (
                      <TableRow key={supplier.id} className="hover:bg-gray-50">
                        <TableCell>{supplier.slNo}</TableCell>
                        <TableCell>{supplier.supplierName}</TableCell>
                        <TableCell className="text-center">{supplier.purchaseInvoice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.amountPaid.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.creditAdj.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.discountAdj.toFixed(2)}</TableCell>
                        <TableCell className="text-center font-medium text-red-600">{supplier.balanceOutstanding.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{supplier.creditLimit}</TableCell>
                        <TableCell className="text-center">{supplier.currency}</TableCell>
                      </TableRow>
                    ))
                )}
                {/* GBP Row */}
                <TableRow className="bg-gray-100 border-t">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">GBP</TableCell>
                  <TableCell className="text-center font-bold">{totals.purchaseInvoice.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.amountPaid.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.creditAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.discountAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold text-red-600">{totals.balanceOutstanding.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">GBP</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-lime-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-center font-bold">{totals.purchaseInvoice.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.amountPaid.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.creditAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.discountAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold text-red-600">{totals.balanceOutstanding.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">0.00</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing {supplierData.length > 0 ? 1 : 0} to {supplierData.length} of {supplierData.length} entries</div>
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Previous</Button>
                  <Button variant="outline" size="sm" className="bg-blue-500 text-white">1</Button>
                  <Button variant="outline" size="sm">Next</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}