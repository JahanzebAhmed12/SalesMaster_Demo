import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { CalendarIcon, FileText, Printer, Search, Mail } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import PageLayout from '@/components/common/page-layout';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FullViewRow {
  date: string;
  invoiceNo: string;
  customerName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  isInvoiceHeader?: boolean;
  isInvoiceTotal?: boolean;
}

export default function DailySalesFullView() {
  const today = new Date();
  const [fromDate, setFromDate] = useState<Date>(today);
  const [toDate, setToDate] = useState<Date>(today);
  const [search, setSearch] = useState('');
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  // Fetch all sales for the selected date range
  const { data, isLoading, refetch } = useQuery<FullViewRow[]>({
    queryKey: ['daily-sales-full-view', format(fromDate, 'yyyy-MM-dd'), format(toDate, 'yyyy-MM-dd'), search],
    queryFn: async () => {
      const fromDateStr = format(fromDate, 'yyyy-MM-dd');
      const toDateStr = format(toDate, 'yyyy-MM-dd');
      
      // Use the new dedicated endpoint
      const response = await apiRequest('GET', `/api/reports/daily-sales-full-view?fromDate=${fromDateStr}&toDate=${toDateStr}&search=${encodeURIComponent(search)}`);
      return response;
    },
  });

  // Add type for companyDetails
  const { data: companyDetails }: { data: any } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Auto-search on load and when dates change
  useEffect(() => {
    refetch();
    // eslint-disable-next-line
  }, [fromDate, toDate]);

  // Print handler
  const handlePrint = () => {
    if (!tableRef.current) return;
    const printContents = tableRef.current.innerHTML;
    const companyName = companyDetails?.companyName || 'Company Name';
    const reportTitle = 'Daily Book Sales Full View';
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}@media print{body{margin:0;}}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(`<div style="font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;">${companyName}</div>`);
      printWindow.document.write(`<div style="font-size:16px;font-weight:bold;text-align:center;margin-bottom:16px;">${reportTitle}</div>`);
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  // PDF export handler
  const handlePDF = () => {
    const doc = new jsPDF();
    const companyName = companyDetails?.companyName || 'Company Name';
    doc.setFontSize(16);
    const pageWidth = doc.internal.pageSize.getWidth();
    const textWidth = doc.getTextWidth(companyName);
    doc.text(companyName, (pageWidth - textWidth) / 2, 14);
    doc.setFontSize(14);
    doc.text('Daily Book Sales Full View', 14, 26);
    autoTable(doc, {
      head: [[
        'Date', 'Invoice No', 'Customer Name', 'Product Name', 'Quantity', 'Unit Price', 'Total'
      ]],
      body: (Array.isArray(data) ? data : []).map((row: any) => [
        row.date,
        row.invoiceNo,
        row.customerName,
        row.productName,
        row.quantity,
        Number(row.unitPrice).toFixed(2),
        Number(row.total).toFixed(2)
      ]),
      startY: 32,
    });
    doc.save('daily-sales-full-view.pdf');
  };

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
    doc.text('Daily Sales Full View', 14, companyDetails ? 42 : 15);
    doc.setFontSize(10);
    doc.text(`Date Range: ${format(fromDate, 'MM/dd/yyyy')} - ${format(toDate, 'MM/dd/yyyy')}`, 14, companyDetails ? 48 : 21);
    
    // Add table
    autoTable(doc, {
      head: [['Date', 'Invoice No', 'Customer Name', 'Product Name', 'Quantity', 'Unit Price', 'Total']],
      body: (Array.isArray(data) ? data : []).filter(row => !row.isInvoiceHeader && !row.isInvoiceTotal).map(row => [
        row.date,
        row.invoiceNo,
        row.customerName,
        row.productName,
        row.quantity,
        Number(row.unitPrice).toFixed(2),
        Number(row.total).toFixed(2)
      ]),
      startY: companyDetails ? 52 : 25,
    });
    
    return doc.output('blob');
  };

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

    setIsEmailSending(true);
    
    try {
      // Generate PDF blob
      const pdfBlob = generatePDFBlob();
      
      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        const base64PDF = base64data.split(',')[1]; // Remove data:application/pdf;base64, prefix
        
        // Send email with PDF attachment
        const emailData = {
          to: emailList,
          subject: `Daily Sales Full View Report - ${format(fromDate, 'MM/dd/yyyy')} to ${format(toDate, 'MM/dd/yyyy')}`,
          body: `Please find attached the Daily Sales Full View report for the period from ${format(fromDate, 'MM/dd/yyyy')} to ${format(toDate, 'MM/dd/yyyy')}.`,
          attachment: {
            filename: `daily-sales-full-view-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.pdf`,
            content: base64PDF,
            contentType: 'application/pdf'
          }
        };
        
        await apiRequest('POST', '/api/send-email', emailData);
        alert(`PDF report sent successfully to ${emailList.length} email(s)`);
        setEmails(''); // Clear email field after successful send
      };
      
      reader.readAsDataURL(pdfBlob);
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Please try again.');
    } finally {
      setIsEmailSending(false);
    }
  };

  const displayData = Array.isArray(data) ? data : [];

  return (
    <PageLayout title="Daily Sales Full View" breadcrumb="Daily Report > Daily Sales Full View">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <CardTitle className="text-lg md:text-xl">Full View - Daily Sales</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 md:gap-4 items-end">
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal h-10',
                        !fromDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">
                        {fromDate ? format(fromDate, 'MM/dd/yyyy') : 'From Date'}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={(d) => d && setFromDate(d)}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal h-10',
                        !toDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">
                        {toDate ? format(toDate, 'MM/dd/yyyy') : 'To Date'}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={(d) => d && setToDate(d)}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search by invoice, customer, or product"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 w-56"
                />
              </div>
              <Button variant="outline" onClick={handlePrint} className="flex items-center gap-2">
                <Printer size={16} /> Print
              </Button>
              <Button variant="outline" onClick={handlePDF} className="flex items-center gap-2">
                <FileText size={16} /> PDF
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Enter emails (comma separated)"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  className="w-64"
                  disabled={isEmailSending}
                />
                <Button 
                  variant="outline" 
                  onClick={handleEmailPDF} 
                  className="flex items-center gap-2"
                  disabled={isEmailSending}
                >
                  <Mail size={16} /> {isEmailSending ? 'Sending...' : 'Email PDF'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto" ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : displayData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">No data available</TableCell>
                    </TableRow>
                  ) : (
                    displayData.map((row: FullViewRow, idx: number) => {
                      if (row.isInvoiceHeader) {
                        return (
                          <TableRow key={idx} className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                            <TableCell>{row.date}</TableCell>
                            <TableCell>{row.invoiceNo}</TableCell>
                            <TableCell>{row.customerName}</TableCell>
                            <TableCell colSpan={4}></TableCell>
                          </TableRow>
                        );
                      } else if (row.isInvoiceTotal) {
                        return (
                          <TableRow key={idx} className="bg-white font-bold border-b-2 border-gray-300">
                            <TableCell colSpan={5}></TableCell>
                            <TableCell className="text-right font-bold">Total</TableCell>
                            <TableCell className="text-right font-bold">£{Number(row.total).toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      } else {
                        return (
                          <TableRow key={idx} className="bg-white">
                            <TableCell></TableCell>
                            <TableCell>{row.invoiceNo}</TableCell>
                            <TableCell>{row.customerName}</TableCell>
                            <TableCell>{row.productName}</TableCell>
                            <TableCell className="text-right">{row.quantity}</TableCell>
                            <TableCell className="text-right">£{Number(row.unitPrice).toFixed(2)}</TableCell>
                            <TableCell className="text-right">£{Number(row.total).toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      }
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
} 