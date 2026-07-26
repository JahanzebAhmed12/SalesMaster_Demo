import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { useCompanyDetails } from "@/hooks/use-company-details";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomerSearch from "@/components/ui/customer-search";
import ProductSearch from "@/components/ui/product-search";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, subWeeks } from "date-fns";
import { cn, formatQuantity } from "@/lib/utils";
import { useBusinessDate } from "@/hooks/use-business-date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { copyToClipboard, printHtmlTable } from "@/lib/export-utils";

function toLocalDateString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function ProdCustomerHistory() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);
  const [selectedProduct, setSelectedProduct] = useState<string | undefined>(undefined);
  const [productLike, setProductLike] = useState<string>("");
  
  // Initialize with current date, will be updated when businessDate loads
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  
  // Track if dates were manually changed
  const fromDateManuallyChanged = useRef(false);
  const toDateManuallyChanged = useRef(false);
  
  // Get business date with formatting utilities
  const { 
    businessDate, 
    isLoading: isLoadingBusinessDate, 
    formatForApi 
  } = useBusinessDate();
  const [searchClicked, setSearchClicked] = useState(false);

  // Customers and Products are fetched by CustomerSearch and ProductSearch components

  // Fetch product-customer history
  const {
    data: historyData = [],
    isLoading: loadingHistory,
    error: historyError,
    refetch
  } = useQuery({
    queryKey: [
      "prod-customer-history",
      selectedCustomerId,
      selectedProduct,
      productLike,
      fromDate?.toISOString().slice(0, 10),
      toDate?.toISOString().slice(0, 10),
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (selectedCustomerId) params.append("customerId", selectedCustomerId);
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

  const loading = loadingHistory;

  const { companyDetails } = useCompanyDetails();

  // Update dates when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      try {
        // Only update fromDate if it hasn't been manually changed (set to one week before business date)
        if (!fromDateManuallyChanged.current) {
          const oneWeekBefore = subWeeks(businessDate, 1);
          if (!fromDate || fromDate.getTime() !== oneWeekBefore.getTime()) {
            setFromDate(oneWeekBefore);
          }
        }
        // Only update toDate if it hasn't been manually changed
        if (!toDateManuallyChanged.current && (!toDate || toDate.getTime() !== businessDate.getTime())) {
          setToDate(new Date(businessDate));
        }
      } catch (error) {
        console.error('Error processing business date:', error);
      }
    }
  }, [businessDate, isLoadingBusinessDate]);

  // Handle date changes
  const handleFromDateChange = (date: Date | undefined) => {
    if (date) {
      fromDateManuallyChanged.current = true;
      setFromDate(date);
    }
  };

  const handleToDateChange = (date: Date | undefined) => {
    if (date) {
      toDateManuallyChanged.current = true;
      setToDate(date);
    }
  };

  // Format date for display
  const formatDateForDisplay = (date: Date | string | null | undefined, formatStr = 'dd/MM/yyyy') => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      return isNaN(d.getTime()) ? '' : format(d, formatStr);
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  // Export handlers
  const handlePrint = () => {
    let html = '';
    // Add header
    html += '<div class="header">';
    html += '<h2>PRODUCT-CUSTOMER HISTORY</h2>';
    html += `<p>${companyDetails?.companyName || ''}${companyDetails?.address1 ? ', ' + companyDetails.address1 : ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}</p>`;
    html += `<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : ''} to ${toDate ? format(toDate, "dd/MM/yyyy") : ''}</p>`;
    html += '</div>';
    // Add table
    html += '<table>';
    html += '<thead><tr>';
    html += '<th>Sl.No</th>';
    html += '<th>Product</th>';
    html += '<th>Quantity</th>';
    html += '<th>Avg Price</th>';
    html += '<th>Total</th>';
    html += '</tr></thead><tbody>';
    historyData.forEach((row: any) => {
      html += '<tr>';
      html += `<td>${row.slNo}</td>`;
      html += `<td>${row.product}</td>`;
      html += `<td>${formatQuantity(row.quantity)}</td>`;
      html += `<td>${row.avgPrice.toFixed(2)}</td>`;
      html += `<td>${row.total.toFixed(2)}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    
    // Add footer text
    html += '<div class="footer">stand100</div>';
    
    printHtmlTable('Product-Customer History', html);
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
      
      copyToClipboard(text);
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
                <CustomerSearch
                  onCustomerSelect={(c) => setSelectedCustomerId(c ? String(c.id) : undefined)}
                  placeholder="All Customers"
                  label="Customer:"
                  size="sm"
                  allowClear={true}
                />
              </div>

              <div>
                <ProductSearch
                  onProductSelect={(p) => {
                    if (!p) {
                      setSelectedProduct(undefined);
                    } else {
                      const isRegular = 'hsCode' in p;
                      setSelectedProduct(`${isRegular ? 'regular' : 'non'}-${p.id}`);
                    }
                  }}
                  placeholder="All Products"
                  label="Product:"
                  size="sm"
                  allowClear={true}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Product like:</label>
                <Input
                  value={productLike}
                  onChange={(e) => setProductLike(e.target.value)}
                  placeholder=""
                />
              </div>

              <DateRangeFilter
                from={fromDate}
                to={toDate}
                onFromChange={handleFromDateChange}
                onToChange={handleToDateChange}
                fromLabel="From:"
                toLabel="To:"
                dateFormat="yyyy-MM-dd"
                fromManuallyChanged={fromDateManuallyChanged}
                toManuallyChanged={toDateManuallyChanged}
              />

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
