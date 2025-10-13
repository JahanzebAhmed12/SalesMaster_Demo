import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarIcon, Download, BarChart3, Database, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, formatQuantity } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useBusinessDate } from '@/hooks/use-business-date';
import PageLayout from '@/components/common/page-layout';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLocation } from "wouter";

interface SalesReportData {
  id: number;
  slNo: number;
  sageCode: string;
  productDescription: string;
  product_code: string;
  quantity: number;
  avgPrice: number;
  total: number;
}

export default function ProductSalesReport() {
  // Initialize with current date, will be updated when businessDate loads
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [queryFromDate, setQueryFromDate] = useState<Date>();
  const [queryToDate, setQueryToDate] = useState<Date>();
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);

  // Track if dates were manually changed
  const fromDateManuallyChanged = useRef(false);
  const toDateManuallyChanged = useRef(false);

  // Get business date with formatting utilities
  const {
    businessDate,
    isLoading: isLoadingBusinessDate,
    formatForApi
  } = useBusinessDate();

  // Update dates when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      try {
        const businessDateObj = new Date(businessDate);
        if (isNaN(businessDateObj.getTime())) {
          console.error('Invalid business date:', businessDate);
          return;
        }

        // Only update fromDate if it hasn't been manually changed
        if (!fromDateManuallyChanged.current) {
          setFromDate(businessDateObj);
        }
        // Only update toDate if it hasn't been manually changed
        if (!toDateManuallyChanged.current) {
          setToDate(businessDateObj);
        }
      } catch (error) {
        console.error('Error processing business date:', error);
      }
    }
  }, [businessDate, isLoadingBusinessDate]);


  const formattedFromDate = queryFromDate ? format(queryFromDate, "yyyy-MM-dd") : '';
  const formattedToDate = queryToDate ? format(queryToDate, "yyyy-MM-dd") : '';

  const { data: salesData = [], isLoading } = useQuery({
    queryKey: ['product-sales-report', formattedFromDate, formattedToDate],
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        fromDate: formattedFromDate || '',
        toDate: formattedToDate || ''
      }).toString();
      const response = await apiRequest(
        'GET',
        `/api/reports/product-sales?${queryParams}`
      );
      return response;
    },
    enabled: !!formattedFromDate && !!formattedToDate,
  });

  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  console.log('Query State:', { formattedFromDate, formattedToDate, isLoading, dataLength: salesData?.length });

  const totalAmount = salesData.reduce((sum: number, item: SalesReportData) => sum + item.total, 0);
  const totalQuantity = salesData.reduce((sum: number, item: SalesReportData) => sum + item.quantity, 0);
  const averagePrice = salesData.length > 0 ? totalAmount / totalQuantity : 0;
  const numberOfProducts = salesData.length;

  const tableRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  // Set default dates to today for both fromDate and toDate
  useEffect(() => {
    const handleFromDateChange = (date: Date | undefined) => {
      if (date) {
        setFromDate(date);
        setQueryFromDate(date);
      }
    };

    const handleToDateChange = (date: Date | undefined) => {
      if (date) {
        setToDate(date);
        setQueryToDate(date);
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
  }, []);

  // Auto search when both dates are set
  useEffect(() => {
    if (fromDate && toDate) {
      setQueryFromDate(fromDate);
      setQueryToDate(toDate);
    }
    // eslint-disable-next-line
  }, [fromDate, toDate]);

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Product Sales Report</title>');
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;margin:20px;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background-color:#f0f0f0;font-weight:bold;}.header{text-align:center;margin-bottom:20px;}.company-details{text-align:center;margin-bottom:30px;line-height:1.4;}.totals{font-weight:bold;background-color:#f9f9f9;}</style>');
      printWindow.document.write('</head><body>');

      // Add company details header following the specific structure
      printWindow.document.write('<div class="company-details">');
      if (companyDetails) {
        // Company name
        printWindow.document.write(`<h2>${companyDetails.companyName || ''}</h2>`);

        // Email
        if (companyDetails.email) {
          printWindow.document.write(`<p>${companyDetails.email}</p>`);
        }

        // Bank details
        if (companyDetails.bankDetails) {
          printWindow.document.write(`<p>${companyDetails.bankDetails}</p>`);
        }

        // VAT and Registration info
        let regInfo = [];
        if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
        if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
        if (regInfo.length > 0) printWindow.document.write(`<p>${regInfo.join(' | ')}</p>`);
      }
      printWindow.document.write('</div>');

      // Add report title
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h3>PRODUCT SALES REPORT</h3>');
      printWindow.document.write(`<p>Period: ${formattedFromDate || 'All'} to ${formattedToDate || 'All'}</p>`);
      printWindow.document.write('</div>');

      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      const headers = ['Product Description', 'Qty', 'Avg Price', 'Total'];
      headers.forEach(h => {
        printWindow.document.write(`<th>${h}</th>`);
      });
      printWindow.document.write('</tr></thead><tbody>');
      salesData.forEach(item => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.productDescription}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.quantity)}</td>`);
        printWindow.document.write(`<td>£${item.avgPrice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${item.total.toFixed(2)}</td>`);
        printWindow.document.write('</tr>');
      });
      printWindow.document.write('</tbody></table>');

      // Add summary
      printWindow.document.write('<div style="margin-top:20px;padding:10px;background-color:#f9f9f9;border:1px solid #ccc;text-align:center;">');
      printWindow.document.write(`<strong>Summary: Products: ${numberOfProducts} | Total Qty: ${formatQuantity(totalQuantity)} | Avg Price: £${averagePrice.toFixed(2)} | Total Sales: £${totalAmount.toFixed(2)}</strong>`);
      printWindow.document.write('</div>');

      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(salesData.map((item: SalesReportData) => ({
      'Product Description': item.productDescription,
      'Qty': formatQuantity(item.quantity),
      'Avg Price': item.avgPrice,
      'Total': item.total
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
    XLSX.writeFile(wb, 'product-sales-report.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    let yPosition = 20;

    // Add company details following the specific structure
    if (companyDetails) {
      // Company name
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || '', 105, yPosition, { align: 'center' });
      yPosition += 8;

      doc.setFontSize(10);

      // Email
      if (companyDetails.email) {
        doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }

      // Bank details
      if (companyDetails.bankDetails) {
        doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }

      // VAT and Registration info
      let regInfo = [];
      if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
      if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
      if (regInfo.length > 0) {
        doc.text(regInfo.join(' | '), 105, yPosition, { align: 'center' });
        yPosition += 10;
      } else {
        yPosition += 5;
      }
    }

    // Add report title
    doc.setFontSize(14);
    doc.text('PRODUCT SALES REPORT', 105, yPosition, { align: 'center' });
    yPosition += 8;

    doc.setFontSize(10);
    doc.text(`Period: ${formattedFromDate || 'All'} to ${formattedToDate || 'All'}`, 105, yPosition, { align: 'center' });
    yPosition += 10;

    // Add table
    autoTable(doc, {
      head: [[
        'Product Description', 'Qty', 'Avg Price', 'Total'
      ]],
      body: salesData.map((item: SalesReportData) => [
        item.productDescription,
        formatQuantity(item.quantity),
        `£${item.avgPrice.toFixed(2)}`,
        `£${item.total.toFixed(2)}`
      ]),
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 25 },
        2: { cellWidth: 35 },
        3: { cellWidth: 35 }
      }
    });

    // Add summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || yPosition;
    doc.setFontSize(10);
    doc.text(`Summary: Products: ${numberOfProducts} | Total Qty: ${formatQuantity(totalQuantity)} | Avg Price: £${averagePrice.toFixed(2)} | Total Sales: £${totalAmount.toFixed(2)}`, 105, finalY + 10, { align: 'center' });

    doc.save(`product-sales-report-${formattedFromDate || 'all'}-${formattedToDate || 'all'}.pdf`);
  };

  const handleCopy = () => {
    const header = ['Product Description', 'Qty', 'Avg Price', 'Total'];
    const rows = salesData.map((item: SalesReportData) => [
      item.productDescription,
      formatQuantity(item.quantity),
      item.avgPrice,
      item.total
    ]);
    const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    alert('Table copied to clipboard!');
  };

  // Generate PDF blob for email
  const generatePDFBlob = () => {
    const doc = new jsPDF();
    let yPosition = 20;

    // Add company details following the specific structure
    if (companyDetails) {
      // Company name
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || '', 105, yPosition, { align: 'center' });
      yPosition += 8;

      doc.setFontSize(10);

      // Email
      if (companyDetails.email) {
        doc.text(companyDetails.email, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }

      // Bank details
      if (companyDetails.bankDetails) {
        doc.text(companyDetails.bankDetails, 105, yPosition, { align: 'center' });
        yPosition += 5;
      }

      // VAT and Registration info
      let regInfo = [];
      if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
      if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
      if (regInfo.length > 0) {
        doc.text(regInfo.join(' | '), 105, yPosition, { align: 'center' });
        yPosition += 10;
      } else {
        yPosition += 5;
      }
    }

    // Add report title
    doc.setFontSize(14);
    doc.text('PRODUCT SALES REPORT', 105, yPosition, { align: 'center' });
    yPosition += 8;

    doc.setFontSize(10);
    doc.text(`Period: ${formattedFromDate || 'All'} to ${formattedToDate || 'All'}`, 105, yPosition, { align: 'center' });
    yPosition += 10;

    // Add table
    autoTable(doc, {
      head: [['Product Description', 'Qty', 'Avg Price', 'Total']],
      body: salesData.map((item: SalesReportData) => [
        item.productDescription,
        formatQuantity(item.quantity),
        `£${item.avgPrice.toFixed(2)}`,
        `£${item.total.toFixed(2)}`
      ]),
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 25 },
        2: { cellWidth: 35 },
        3: { cellWidth: 35 }
      }
    });

    // Add summary at the bottom (same format as regular PDF)
    const finalY = (doc as any).lastAutoTable.finalY || yPosition;
    doc.setFontSize(10);
    doc.text(`Summary: Products: ${numberOfProducts} | Total Qty: ${formatQuantity(totalQuantity)} | Avg Price: £${averagePrice.toFixed(2)} | Total Sales: £${totalAmount.toFixed(2)}`, 105, finalY + 10, { align: 'center' });

    return doc.output('blob');
  };

  // Email PDF handler
  const handleEmailPDF = async () => {
    if (!emails.trim()) {
      alert('Please enter at least one email address');
      return;
    }

    // Parse and validate emails
    const emailList = emails.split(',').map(email => email.trim()).filter(email => email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter(email => !emailRegex.test(email));

    if (invalidEmails.length > 0) {
      alert(`Invalid email addresses: ${invalidEmails.join(', ')}`);
      return;
    }

    if (salesData.length === 0) {
      alert('No sales data available to send. Please get data first.');
      return;
    }

    setIsEmailSending(true);

    try {
      // Generate PDF blob
      const pdfBlob = generatePDFBlob();

      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64data = reader.result as string;
          const base64PDF = base64data.split(',')[1]; // Remove data:application/pdf;base64, prefix

          // Send email with PDF attachment
          const emailData = {
            to: emailList,
            subject: `Product Sales Report - ${formattedFromDate || 'N/A'} to ${formattedToDate || 'N/A'}`,
            body: `Dear Recipient,\n\nPlease find attached the Product Sales Report for the period from ${formattedFromDate || 'N/A'} to ${formattedToDate || 'N/A'}.\n\nThis report contains detailed sales information including:\n- Product descriptions and quantities sold\n- Average selling prices\n- Total sales amounts per product\n- Overall sales summary\n\nReport Summary:\n- Total Products: ${numberOfProducts}\n- Total Quantity Sold: ${formatQuantity(totalQuantity)}\n- Average Price: £${averagePrice.toFixed(2)}\n- Total Sales Amount: £${totalAmount.toFixed(2)}\n- Date Range: ${formattedFromDate || 'N/A'} to ${formattedToDate || 'N/A'}\n\nBest regards,\n${companyDetails?.name || 'Sales Team'}`,
            attachment: {
              filename: `product-sales-report-${formattedFromDate || 'unknown'}-to-${formattedToDate || 'unknown'}.pdf`,
              content: base64PDF,
              contentType: 'application/pdf'
            }
          };

          const response = await apiRequest('POST', '/api/send-email', emailData);

          if (response.message) {
            alert(`${response.message}`);
            if (response.warnings) {
              alert(`⚠️ Warning: ${response.warnings}`);
            }
          } else {
            alert(`📧 Product sales report sent successfully to ${emailList.length} email(s)`);
          }

          setEmails(''); // Clear email field after successful send

        } catch (emailError) {
          console.error('Error sending email:', emailError);

          // Handle specific error messages
          let errorMessage = 'Failed to send email. Please try again.';
          if (emailError && typeof emailError === 'object' && 'error' in emailError) {
            errorMessage = `Email Error: ${emailError.error}`;
          } else if (emailError && typeof emailError === 'string') {
            errorMessage = `Email Error: ${emailError}`;
          }

          alert(`❌ ${errorMessage}`);
        } finally {
          // Always reset the sending state
          setIsEmailSending(false);
        }
      };

      reader.onerror = () => {
        alert('❌ Failed to process PDF file. Please try again.');
        setIsEmailSending(false);
      };

      reader.readAsDataURL(pdfBlob);

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('❌ Failed to generate PDF. Please try again.');
      setIsEmailSending(false);
    }
  };

  return (
    <PageLayout
      title="Product Sales Report"
      breadcrumb="Reports > Product Sales Report"
    >
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">Filter Options</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
              {/* Date Pickers (left) */}
              <div className="flex flex-1 gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium mb-2">From Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal h-10",
                          !fromDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">
                          {fromDate ? format(fromDate, "PPP") : "Pick a date"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={fromDate}
                        onSelect={(date) => {
                          if (date) {
                            fromDateManuallyChanged.current = true;
                            setFromDate(date);
                          }
                        }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium mb-2">To Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal h-10",
                          !toDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="truncate">
                          {toDate ? format(toDate, "PPP") : "Pick a date"}
                        </span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={toDate}
                        onSelect={(date) => {
                          if (date) {
                            toDateManuallyChanged.current = true;
                            setToDate(date);
                          }
                        }}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {/* Action Buttons (right) */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 ml-0 sm:ml-4">
                <Button
                  variant="default"
                  className="flex items-center justify-center gap-2"
                  onClick={() => {
                    setQueryFromDate(fromDate);
                    setQueryToDate(toDate);
                  }}
                  disabled={!fromDate || !toDate}
                >
                  <Download className="h-4 w-4" />
                  <span>Get Data</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center justify-center gap-2"
                  onClick={() => navigate('/daily-report/compare-with-purchase')}
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="truncate">Compare with Purchase</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Report Table */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 order-1 sm:order-none">
                <Button size="sm" variant="outline" onClick={handlePrint}>Print</Button>
                <Button size="sm" variant="outline" onClick={handleExcel}>Excel</Button>
                <Button size="sm" variant="outline" onClick={handlePDF}>PDF</Button>
                <Button size="sm" variant="outline" onClick={handleCopy}>Copy</Button>

                {/* Email Section - next to Copy button */}
                <div className="flex items-center gap-2 ml-2">
                  <input
                    type="text"
                    placeholder="Enter emails (comma separated)"
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    className="w-48 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                    disabled={isEmailSending}
                  />
                  <Button
                    variant="outline"
                    onClick={handleEmailPDF}
                    className="flex items-center gap-1"
                    disabled={isEmailSending}
                    size="sm"
                  >
                    <Mail size={14} />
                    <span>{isEmailSending ? 'Sending...' : 'Email'}</span>
                  </Button>
                </div>
              </div>
              <div className="flex-1 flex justify-end">
                <CardTitle className="text-lg sm:text-xl">Sales Report</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto" ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/4 px-6">Product Description</TableHead>
                    <TableHead className="w-1/4 text-right px-6">Qty</TableHead>
                    <TableHead className="w-1/4 text-right px-6">Avg Price</TableHead>
                    <TableHead className="w-1/4 text-right px-6">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : salesData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    salesData.map((item: SalesReportData) => (
                      <TableRow key={item.id}>
                        <TableCell className="px-6">
                          <button
                            className="text-blue-600 underline cursor-pointer"
                            onClick={() => {
                              const fromDateStr = queryFromDate ? format(queryFromDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
                              const toDateStr = queryToDate ? format(queryToDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
                              navigate(`/reports/product-sales-history?productId=${item.id}&productType=regular&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(item.productDescription)}`);
                            }}
                          >
                            {item.productDescription}
                          </button>
                        </TableCell>
                        <TableCell className="text-right px-6">{formatQuantity(item.quantity)}</TableCell>
                        <TableCell className="text-right px-6">£{item.avgPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-semibold px-6">£{item.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {/* Summary below table, styled for print and screen */}
              <div className="summary-print flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mt-6 p-4 bg-gray-50 rounded-lg border print:mt-6 print:p-4 print:bg-white print:border print:rounded-lg print:flex-row print:items-center print:gap-x-8 print:gap-y-2 text-center">
                <div className="flex items-center font-semibold mr-2">Date Range:</div>
                <div className="mr-6">{formattedFromDate || '-'} to {formattedToDate || '-'}</div>
                <div className="flex items-center font-semibold mr-2">Products:</div>
                <div className="mr-4">{numberOfProducts}</div>
                <div className="flex items-center font-semibold mr-2">Total Qty:</div>
                <div className="mr-4">{formatQuantity(totalQuantity)}</div>
                <div className="flex items-center font-semibold mr-2">Avg Price:</div>
                <div className="mr-4">£{averagePrice.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Sales:</div>
                <div>£{totalAmount.toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
