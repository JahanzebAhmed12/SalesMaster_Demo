import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarIcon, Download, BarChart3, Database, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
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
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();
  const [queryFromDate, setQueryFromDate] = useState<Date>();
  const [queryToDate, setQueryToDate] = useState<Date>();
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);

  const formattedFromDate = queryFromDate ? format(queryFromDate, "yyyy-MM-dd") : undefined;
  const formattedToDate = queryToDate ? format(queryToDate, "yyyy-MM-dd") : undefined;

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

  const tableRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  // Set default dates to today for both fromDate and toDate
  useEffect(() => {
    const today = new Date();
    setFromDate(today);
    setToDate(today);
    setQueryFromDate(today);
    setQueryToDate(today);
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
    if (!tableRef.current) return;
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;} .summary-print{margin:24px 0 24px 0;padding:12px 24px;font-weight:500;text-align:center;} .company-heading{font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(`<div class='company-heading'>${companyDetails?.companyName || 'Company Name'}</div>`);
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(salesData.map((item: SalesReportData) => ({
      'Product Description': item.productDescription,
      'Qty': item.quantity,
      'Avg Price': item.avgPrice,
      'Total': item.total
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
    XLSX.writeFile(wb, 'product-sales-report.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    // Company name centered
    const companyName = companyDetails?.companyName || 'Company Name';
    doc.setFontSize(16);
    const pageWidth = doc.internal.pageSize.getWidth();
    const textWidth = doc.getTextWidth(companyName);
    doc.text(companyName, (pageWidth - textWidth) / 2, 14);
    doc.setFontSize(14);
    doc.text('Product Sales Report', 14, 26);
    autoTable(doc, {
      head: [[
        'Product Description', 'Qty', 'Avg Price', 'Total'
      ]],
      body: salesData.map((item: SalesReportData) => [
        item.productDescription,
        item.quantity,
        item.avgPrice,
        item.total
      ]),
      startY: 32,
      columnStyles: {
        0: { cellWidth: 70 }, // Product Description
        1: { cellWidth: 25 }, // Qty
        2: { cellWidth: 35 }, // Avg Price
        3: { cellWidth: 35 }, // Total
      },
    });
    // Add summary below table, centered
    const finalY = (doc as any).lastAutoTable.finalY || 32;
    doc.setFontSize(12);
    const summaryText = `Date Range: ${formattedFromDate || '-'} to ${formattedToDate || '-'}   |   Total: £${totalAmount.toFixed(2)}`;
    const summaryWidth = doc.getTextWidth(summaryText);
    doc.text(summaryText, (pageWidth - summaryWidth) / 2, finalY + 14);
    doc.save('product-sales-report.pdf');
  };

  const handleCopy = () => {
    const header = ['Product Description', 'Qty', 'Avg Price', 'Total'];
    const rows = salesData.map((item: SalesReportData) => [
      item.productDescription,
      item.quantity,
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
    
    // Add company header if available
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.name || 'Company Name', 14, 15);
      doc.setFontSize(10);
      if (companyDetails.address) doc.text(companyDetails.address, 14, 22);
      if (companyDetails.phone) doc.text(`Phone: ${companyDetails.phone}`, 14, 27);
      if (companyDetails.email) doc.text(`Email: ${companyDetails.email}`, 14, 32);
    }
    
    // Add title
    doc.setFontSize(14);
    doc.text('Product Sales Report', 14, companyDetails ? 42 : 15);
    doc.setFontSize(10);
    doc.text(`Date Range: ${formattedFromDate || '-'} to ${formattedToDate || '-'}`, 14, companyDetails ? 48 : 21);
    
    // Add table
    autoTable(doc, {
      head: [['Product Description', 'Qty', 'Avg Price', 'Total']],
      body: salesData.map((item: SalesReportData) => [
        item.productDescription,
        item.quantity.toString(),
        `£${item.avgPrice.toFixed(2)}`,
        `£${item.total.toFixed(2)}`
      ]),
      startY: companyDetails ? 52 : 25,
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      columnStyles: {
        0: { cellWidth: 70 }, // Product Description
        1: { cellWidth: 25, halign: 'right' }, // Qty
        2: { cellWidth: 35, halign: 'right' }, // Avg Price
        3: { cellWidth: 35, halign: 'right' }, // Total
      },
    });
    
    // Add summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || (companyDetails ? 52 : 25);
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(12, finalY + 6, 185, 16, 'F');
    doc.setTextColor(40);
    doc.setFont('helvetica', 'bold');
    doc.text(`Summary - Date Range: ${formattedFromDate || '-'} to ${formattedToDate || '-'}`, 16, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Sales Amount: £${totalAmount.toFixed(2)}`, 16, finalY + 20);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    
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
            body: `Dear Recipient,\n\nPlease find attached the Product Sales Report for the period from ${formattedFromDate || 'N/A'} to ${formattedToDate || 'N/A'}.\n\nThis report contains detailed sales information including:\n- Product descriptions and quantities sold\n- Average selling prices\n- Total sales amounts per product\n- Overall sales summary\n\nReport Summary:\n- Total Products: ${salesData.length}\n- Total Sales Amount: £${totalAmount.toFixed(2)}\n- Date Range: ${formattedFromDate || 'N/A'} to ${formattedToDate || 'N/A'}\n\nBest regards,\n${companyDetails?.name || 'Sales Team'}`,
            attachment: {
              filename: `product-sales-report-${formattedFromDate || 'unknown'}-to-${formattedToDate || 'unknown'}.pdf`,
              content: base64PDF,
              contentType: 'application/pdf'
            }
          };
          
          const response = await apiRequest('POST', '/api/send-email', emailData);
          
          if (response.message) {
            alert(`✅ ${response.message}`);
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
                        onSelect={setFromDate}
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
                        onSelect={setToDate}
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
                        <TableCell className="text-right px-6">{item.quantity}</TableCell>
                        <TableCell className="text-right px-6">${item.avgPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-semibold px-6">${item.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
             {/* Summary below table, styled for print and screen */}
             <div className="summary-print flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mt-6 p-4 bg-gray-50 rounded-lg border print:mt-6 print:p-4 print:bg-white print:border print:rounded-lg print:flex-row print:items-center print:gap-x-8 print:gap-y-2 text-center">
               <div>Date Range: {formattedFromDate || '-'} to {formattedToDate || '-'}</div>
               <div>Total: £{totalAmount.toFixed(2)}</div>
             </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
