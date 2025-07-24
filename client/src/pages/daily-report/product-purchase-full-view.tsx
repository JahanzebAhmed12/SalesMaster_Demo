import React, { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Printer, Search, Mail } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PurchaseFullViewRow {
  date: string;
  supplier: string;
  invNo: string;
  awb: string;
  product: string;
  quantity: number;
  unitPrice: number;
  sellingPrice: number;
  total: number;
  isHeader?: boolean;
  isTotal?: boolean;
}

export default function ProductPurchaseFullView() {
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [search, setSearch] = useState('');
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data = [], isLoading, refetch } = useQuery<PurchaseFullViewRow[]>({
    queryKey: ['product-purchase-full-view', format(fromDate, 'yyyy-MM-dd'), format(toDate, 'yyyy-MM-dd'), search],
    queryFn: async () => {
      const fromDateStr = format(fromDate, 'yyyy-MM-dd');
      const toDateStr = format(toDate, 'yyyy-MM-dd');
      const response = await apiRequest('GET', `/api/reports/product-purchase-full-view?fromDate=${fromDateStr}&toDate=${toDateStr}&search=${encodeURIComponent(search)}`);
      return response;
    },
  });

  // Fetch company details for PDF header
  const { data: companyDetails }: { data: any } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  const handlePrint = () => {
    if (!tableRef.current) return;
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}@media print{body{margin:0;}}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write('<div style="font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;">Product Purchase Full View</div>');
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
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
    doc.text('Product Purchase Full View', 14, companyDetails ? 42 : 15);
    doc.setFontSize(10);
    doc.text(`Date Range: ${format(fromDate, 'MM/dd/yyyy')} - ${format(toDate, 'MM/dd/yyyy')}`, 14, companyDetails ? 48 : 21);
    
    // Add table
    autoTable(doc, {
      head: [['Date', 'Supplier', 'Inv.No', 'AWB', 'Product', 'Quantity', 'Unit Price', 'Selling Price', 'Total']],
      body: (Array.isArray(data) ? data : []).filter(row => !row.isHeader && !row.isTotal).map(row => [
        row.date,
        row.supplier,
        row.invNo,
        row.awb,
        row.product,
        row.quantity,
        Number(row.unitPrice).toFixed(2),
        Number(row.sellingPrice).toFixed(2),
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
          subject: `Product Purchase Full View Report - ${format(fromDate, 'MM/dd/yyyy')} to ${format(toDate, 'MM/dd/yyyy')}`,
          body: `Please find attached the Product Purchase Full View report for the period from ${format(fromDate, 'MM/dd/yyyy')} to ${format(toDate, 'MM/dd/yyyy')}.`,
          attachment: {
            filename: `product-purchase-full-view-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.pdf`,
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

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Product Purchase Full View', 14, 16);
    autoTable(doc, {
      head: [[
        'Date', 'Supplier', 'Inv.No', 'AWB', 'Product', 'Quantity', 'Unit Price', 'Selling Price', 'Total'
      ]],
      body: (Array.isArray(data) ? data : []).map((row: any) => [
        row.date,
        row.supplier,
        row.invNo,
        row.awb,
        row.product,
        row.quantity,
        Number(row.unitPrice).toFixed(2),
        Number(row.sellingPrice).toFixed(2),
        Number(row.total).toFixed(2)
      ]),
      startY: 22,
    });
    doc.save('product-purchase-full-view.pdf');
  };

  return (
    <PageLayout title="Product Purchase Full View" breadcrumb="Daily Report > Product Purchase Full View">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <CardTitle className="text-lg md:text-xl">Product Purchase Full View</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 md:gap-4 items-end">
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
                      {fromDate ? format(fromDate, 'PPP') : 'From Date'}
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
                      {toDate ? format(toDate, 'PPP') : 'To Date'}
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
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search by supplier, invoice, or product"
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
                    <TableHead>Supplier</TableHead>
                    <TableHead>Inv.No</TableHead>
                    <TableHead>AWB</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">No data available</TableCell>
                    </TableRow>
                  ) : (
                    (data as PurchaseFullViewRow[]).map((row, idx) => {
                      if (row.isHeader) {
                        return (
                          <TableRow key={idx} className="bg-gray-50 font-semibold border-t-2 border-gray-200">
                            <TableCell>{row.date}</TableCell>
                            <TableCell>{row.supplier}</TableCell>
                            <TableCell>{row.invNo}</TableCell>
                            <TableCell>{row.awb}</TableCell>
                            <TableCell colSpan={4}></TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        );
                      } else if (row.isTotal) {
                        return (
                          <TableRow key={idx} className="bg-white font-bold border-b-2 border-gray-300">
                            <TableCell colSpan={4}></TableCell>
                            <TableCell className="text-right">{row.product}</TableCell>
                            <TableCell className="text-right">{row.quantity}</TableCell>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right">£{Number(row.total).toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      } else {
                        return (
                          <TableRow key={idx} className="bg-white">
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell>{row.invNo}</TableCell>
                            <TableCell>{row.awb}</TableCell>
                            <TableCell>{row.product}</TableCell>
                            <TableCell className="text-right">{row.quantity}</TableCell>
                            <TableCell className="text-right">£{Number(row.unitPrice).toFixed(2)}</TableCell>
                            <TableCell className="text-right">£{Number(row.sellingPrice).toFixed(2)}</TableCell>
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