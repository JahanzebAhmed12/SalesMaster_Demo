import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn, formatQuantity } from "@/lib/utils";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function toLocalDateString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

export default function ProdCustomerHistory() {
  const [selectedCustomer, setSelectedCustomer] = useState<string | undefined>(undefined);
  const [selectedProduct, setSelectedProduct] = useState<string | undefined>(undefined);
  const [productLike, setProductLike] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date>(subWeeks(new Date(), 1));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [searchClicked, setSearchClicked] = useState(false);

  // Fetch customers
  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ["customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });
  // Fetch products
  const { data: productsData = { regularProducts: [], nonProducts: [] }, isLoading: loadingProducts } = useQuery({
    queryKey: ["products"],
    queryFn: () => apiRequest("GET", "/api/products"),
  });
  const allProducts = [
    ...(productsData.regularProducts || []),
    ...(productsData.nonProducts || [])
  ];

  // Fetch product-customer history
  const {
    data: historyData = [],
    isLoading: loadingHistory,
    error: historyError,
    refetch
  } = useQuery({
    queryKey: [
      "prod-customer-history",
      selectedCustomer,
      selectedProduct,
      productLike,
      fromDate?.toISOString().slice(0, 10),
      toDate?.toISOString().slice(0, 10),
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (selectedCustomer && selectedCustomer !== "All") params.append("customerId", selectedCustomer);
      if (selectedProduct && selectedProduct !== "All") {
        // Handle the new product format (regular-123 or non-456)
        const [productType, productId] = selectedProduct.split('-');
        params.append("productId", productId);
        params.append("productType", productType);
      }
      if (productLike) params.append("productLike", productLike);
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      return apiRequest("GET", `/api/reports/prod-customer-history?${params.toString()}`);
    },
    enabled: !!searchClicked,
    staleTime: 0, // Always consider data stale
    cacheTime: 0, // Don't cache the data
  });

  // Totals
  const totalQuantity = historyData.reduce((sum: number, row: any) => sum + (row.quantity || 0), 0);
  const totalAmount = historyData.reduce((sum: number, row: any) => sum + (row.total || 0), 0);
  const averagePrice = totalQuantity > 0 ? totalAmount / totalQuantity : 0;

  const loading = loadingCustomers || loadingProducts || loadingHistory;

  const { data: companyDetails } = useQuery<CompanyDetails>({
    queryKey: ["/api/company-details"],
    queryFn: () => apiRequest("GET", "/api/company-details"),
  });

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Product-Customer History</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.totals{font-weight:bold;background-color:#f9f9f9;}.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}</style>');
      printWindow.document.write('</head><body>');
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>PRODUCT-CUSTOMER HISTORY</h2>');
      printWindow.document.write(`<p>${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</p>`);
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}</p>`);
      printWindow.document.write('</div>');
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Sl.No</th>');
      printWindow.document.write('<th>Product</th>');
      printWindow.document.write('<th>Quantity</th>');
      printWindow.document.write('<th>Avg Price</th>');
      printWindow.document.write('<th>Total</th>');
      printWindow.document.write('</tr></thead><tbody>');
      historyData.forEach((row: any) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${row.slNo}</td>`);
        printWindow.document.write(`<td>${row.product}</td>`);
        printWindow.document.write(`<td>${formatQuantity(row.quantity)}</td>`);
        printWindow.document.write(`<td>${row.avgPrice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${row.total.toFixed(2)}</td>`);
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
    if (!historyData || historyData.length === 0) {
      alert('No data available to export');
      return;
    }

    const wb = XLSX.utils.book_new();
    
    // Create a single sheet with header info and data combined
    const worksheetData = [
      ['PRODUCT-CUSTOMER HISTORY'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      [''],
      ['Period:', `${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`],
      ['Generated on:', new Date().toLocaleString()],
      [''],
      [''], // Empty row before table
      ['Sl.No', 'Product', 'Quantity', 'Avg Price', 'Total'], // Table headers
    ];

    // Add data rows
    historyData.forEach((row: any) => {
      worksheetData.push([
        row.slNo || '',
        row.product || '',
        Number(formatQuantity(row.quantity || 0)),
        Number(row.avgPrice || 0),
        Number(row.total || 0)
      ]);
    });

    // Add totals row
    worksheetData.push([
      '',
      'TOTAL',
      Number(formatQuantity(totalQuantity)),
      averagePrice,
      totalAmount
    ]);

    // Create worksheet from array of arrays
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 8 },  // Sl.No
      { wch: 35 }, // Product
      { wch: 12 }, // Quantity
      { wch: 12 }, // Avg Price
      { wch: 12 }  // Total
    ];

    // Format numbers in the data section (starting from row 11, which is index 10)
    const dataStartRow = 11; // Row 11 is where data starts (after headers)
    for (let i = 0; i < historyData.length + 1; i++) { // +1 for totals row
      const rowNum = dataStartRow + i;
      // Format Avg Price column (D)
      const avgPriceCell = `D${rowNum}`;
      if (ws[avgPriceCell]) {
        ws[avgPriceCell].z = '0.00';
      }
      // Format Total column (E)
      const totalCell = `E${rowNum}`;
      if (ws[totalCell]) {
        ws[totalCell].z = '0.00';
      }
    }

    // Add the worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Product-Customer History');
    
    // Save the file
    XLSX.writeFile(wb, `prod_customer_history_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.xlsx`);
  };

  const handlePDF = () => {
    if (!historyData || historyData.length === 0) {
      alert('No data available to export');
      return;
    }

    const doc = new jsPDF();
    let yPosition = 20;

    // Add header
    doc.setFontSize(16);
    doc.text('PRODUCT-CUSTOMER HISTORY', 105, yPosition, { align: 'center' });
    yPosition += 10;

    doc.setFontSize(10);
    if (companyDetails) {
      const companyText = `${companyDetails.companyName || ''}${companyDetails.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}`;
      doc.text(companyText, 105, yPosition, { align: 'center' });
      yPosition += 6;
    }

    const periodText = `Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}`;
    doc.text(periodText, 105, yPosition, { align: 'center' });
    yPosition += 15;

    // Prepare table data
    const tableData = historyData.map((row: any) => [
      String(row.slNo || ''),
      String(row.product || ''),
      String(formatQuantity(row.quantity || 0)),
      String((row.avgPrice || 0).toFixed(2)),
      String((row.total || 0).toFixed(2))
    ]);

    // Create table
    autoTable(doc, {
      head: [['Sl.No', 'Product', 'Quantity', 'Avg Price', 'Total']],
      body: tableData,
      startY: yPosition,
      styles: {
        fontSize: 9,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 80, halign: 'left' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'right' },
        4: { cellWidth: 25, halign: 'right' }
      }
    });
    
    // Add footer
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.text('stand100', pageWidth - 30, pageHeight - 10);
    
    autoTable(doc, {
      head: [['', 'TOTAL', formatQuantity(totalQuantity), `£${averagePrice.toFixed(2)}`, `£${totalAmount.toFixed(2)}`]],
      bodyStyles: { fontStyle: 'bold' },
      startY: (doc as any).lastAutoTable.finalY + 10
    });
    
    
    doc.save(`prod_customer_history_${fromDate ? format(fromDate, "yyyyMMdd") : ''}_${toDate ? format(toDate, "yyyyMMdd") : ''}.pdf`);
  };

  const handleCopy = async () => {
    if (!historyData || historyData.length === 0) {
      alert('No data available to copy');
      return;
    }

    try {
      let text = 'Sl.No\tProduct\tQuantity\tAvg Price\tTotal\n';
      text += historyData.map((row: any) => [
        row.slNo || '',
        row.product || '',
        formatQuantity(row.quantity || 0),
        (row.avgPrice || 0).toFixed(2),
        (row.total || 0).toFixed(2)
      ].join('\t')).join('\n');
      
      // Add totals row
      text += `\n\tTOTAL\t${formatQuantity(totalQuantity)}\t\t${averagePrice.toFixed(2)}\t\t${totalAmount.toFixed(2)}`;
      
      await navigator.clipboard.writeText(text);
      alert('Data copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy data:', error);
      alert('Failed to copy data to clipboard');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Customer-wise Product History</h1>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">Customer:</label>
                <Select value={selectedCustomer || "All"} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Customers</SelectItem>
                    {customers.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Product:</label>
                <Select value={selectedProduct || "All"} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Products</SelectItem>
                    {productsData.regularProducts?.map((p: any) => (
                      <SelectItem key={`regular-${p.id}`} value={`regular-${p.id}`}>
                        {p.description} (Regular)
                      </SelectItem>
                    ))}
                    {productsData.nonProducts?.map((p: any) => (
                      <SelectItem key={`non-${p.id}`} value={`non-${p.id}`}>
                        {p.description} (Non-Product)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Product like:</label>
                <Input
                  value={productLike}
                  onChange={(e) => setProductLike(e.target.value)}
                  placeholder=""
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">From:</label>
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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "Select"}
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
                <label className="block text-sm font-medium mb-2">To:</label>
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
                      {toDate ? format(toDate, "yyyy-MM-dd") : "Select"}
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
                <Button className="bg-blue-600 hover:bg-blue-700 w-full" onClick={() => {
                  setSearchClicked(true);
                  refetch();
                }} disabled={loading}>
                  {loading ? "Loading..." : "Search"}
                </Button>
              </div>
            </div>
            {/* Error handling */}
            {historyError && <div className="text-red-600 mt-2">Failed to load data.</div>}
          </CardContent>
        </Card>

        {/* From Sales Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-blue-600 border-b-2 border-blue-300 pb-2 flex items-center justify-between">
              From Sales
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                  PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                  Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                  Copy
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                  Print
                </Button>
              </div>
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[150px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Avg Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : historyData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">No data available</TableCell>
                    </TableRow>
                  ) : (
                    historyData.map((row: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center">{row.slNo}</TableCell>
                        <TableCell className="text-center">{row.product}</TableCell>
                        <TableCell className="text-center">{formatQuantity(row.quantity)}</TableCell>
                        <TableCell className="text-center">{row.avgPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{row.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  {/* Totals row */}
                  <TableRow className="bg-blue-100 font-semibold">
                    <TableCell></TableCell>
                    <TableCell className="text-center">TOTAL</TableCell>
                    <TableCell className="text-center">{formatQuantity(totalQuantity)}</TableCell>
                    <TableCell className="text-center">{averagePrice.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
