import React, { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  productId?: number;
  quantity: number;
  unitPrice: number;
  sellingPrice: number;
  total: number;
  isHeader?: boolean;
  isTotal?: boolean;
  isCompany?: boolean;
}

export default function ProductPurchaseFullView() {
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [search, setSearch] = useState('');
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

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

  // Navigation handler for clickable product names
  const handleProductClick = (row: PurchaseFullViewRow) => {
    const fromDateStr = format(fromDate, 'yyyy-MM-dd');
    const toDateStr = format(toDate, 'yyyy-MM-dd');
    const productType = 'regular'; // Default to regular since we don't have this info
    
    // Navigate to product purchase history with date range and product info
    if (row.productId) {
      // If we have productId, include it in the URL
      navigate(`/reports/product-purchase-history?productId=${row.productId}&productType=${productType}&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(row.product)}`);
    } else {
      // Fallback without productId
      navigate(`/reports/product-purchase-history?productType=${productType}&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(row.product)}`);
    }
  };

  const handlePrint = () => {
    if (!tableRef.current) return;
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}@media print{body{margin:0;}}</style>');
      printWindow.document.write('</head><body>');
      
      // Company details header
      if (companyDetails) {
        printWindow.document.write(`<div style="text-align:center;margin-bottom:20px;">`);
        printWindow.document.write(`<div style="font-size:20px;font-weight:bold;margin-bottom:4px;">${companyDetails.name || 'Company Name'}</div>`);
        if (companyDetails.address) printWindow.document.write(`<div style="font-size:12px;">${companyDetails.address}</div>`);
        if (companyDetails.phone) printWindow.document.write(`<div style="font-size:12px;">Phone: ${companyDetails.phone}</div>`);
        if (companyDetails.email) printWindow.document.write(`<div style="font-size:12px;">Email: ${companyDetails.email}</div>`);
        if (companyDetails.bankDetails) printWindow.document.write(`<div style="font-size:12px;">Bank: ${companyDetails.bankDetails}</div>`);
        if (companyDetails.vatNumber) printWindow.document.write(`<div style="font-size:12px;">VAT: ${companyDetails.vatNumber}</div>`);
        printWindow.document.write(`</div>`);
      }
      
      printWindow.document.write(`<div style="font-size:16px;font-weight:bold;text-align:center;margin-bottom:8px;">Product Purchase Full View</div>`);
      printWindow.document.write(`<div style="font-size:12px;text-align:center;margin-bottom:16px;">Period: ${format(fromDate, 'MM/dd/yyyy')} - ${format(toDate, 'MM/dd/yyyy')}</div>`);
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const generatePDFBlob = () => {
    const doc = new jsPDF();
    let yPosition = 15;
    
    // Company details header
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.name || 'Company Name', 14, yPosition);
      yPosition += 7;
      
      doc.setFontSize(10);
      if (companyDetails.address) {
        doc.text(companyDetails.address, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.phone) {
        doc.text(`Phone: ${companyDetails.phone}`, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.email) {
        doc.text(`Email: ${companyDetails.email}`, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.bankDetails) {
        doc.text(`Bank: ${companyDetails.bankDetails}`, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.vatNumber) {
        doc.text(`VAT: ${companyDetails.vatNumber}`, 14, yPosition);
        yPosition += 5;
      }
      yPosition += 5;
    }
    
    // Report title and period
    doc.setFontSize(14);
    doc.text('Product Purchase Full View', 14, yPosition);
    yPosition += 7;
    doc.setFontSize(10);
    doc.text(`Period: ${format(fromDate, 'MM/dd/yyyy')} - ${format(toDate, 'MM/dd/yyyy')}`, 14, yPosition);
    yPosition += 10;
    
    // Process data for grouped display
    const processedData: any[] = [];
    const displayData = Array.isArray(data) ? data : [];
    
    displayData.forEach((row, index) => {
      if (row.isHeader) {
        processedData.push([
          row.date, row.supplier, row.invNo, row.awb,
          '', '', '', '', ''
        ]);
      } else if (row.isTotal) {
        processedData.push([
          '', '', '', '', row.product, row.quantity.toString(),
          '', '', Number(row.total).toFixed(2)
        ]);
        if (index < displayData.length - 1) {
          processedData.push(['', '', '', '', '', '', '', '', '']);
        }
      } else {
        processedData.push([
          '', '', row.invNo, row.awb, row.product, row.quantity.toString(),
          Number(row.unitPrice).toFixed(2), Number(row.sellingPrice).toFixed(2), Number(row.total).toFixed(2)
        ]);
      }
    });
    
    autoTable(doc, {
      head: [['Date', 'Supplier', 'Inv.No', 'AWB', 'Product', 'Quantity', 'Unit Price', 'Selling Price', 'Total']],
      body: processedData,
      startY: yPosition,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      didParseCell: function(data) {
        if (data.row.index < processedData.length) {
          const rowData = processedData[data.row.index];
          if (rowData[0] && rowData[1] && !rowData[4]) {
            data.cell.styles.fillColor = [220, 220, 220];
            data.cell.styles.fontStyle = 'bold';
          }
          if (rowData[4] && rowData[8] && !rowData[0] && !rowData[1]) {
            data.cell.styles.fillColor = [200, 200, 200];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
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
        try {
          const base64data = reader.result as string;
          const base64PDF = base64data.split(',')[1]; // Remove data:application/pdf;base64, prefix
          
          // Send email with PDF attachment
          const emailData = {
            to: emailList,
            subject: `Product Purchase Full View Report - ${format(fromDate, 'MM/dd/yyyy')} to ${format(toDate, 'MM/dd/yyyy')}`,
            body: `Dear Recipient,\n\nPlease find attached the Product Purchase Full View report for the period from ${format(fromDate, 'MM/dd/yyyy')} to ${format(toDate, 'MM/dd/yyyy')}.\n\nThis report contains detailed purchase information including:\n- Purchase dates and suppliers\n- Invoice numbers and AWB details\n- Product details with quantities\n- Unit prices and selling prices\n- Total amounts\n\nBest regards,\n${companyDetails?.name || 'Purchase Team'}`,
            attachment: {
              filename: `product-purchase-full-view-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.pdf`,
              content: base64PDF,
              contentType: 'application/pdf'
            }
          };
          
          const response = await apiRequest('POST', '/api/send-email', emailData);
          
          if (response.message) {
            alert(` ${response.message}`);
            if (response.warnings) {
              alert(`⚠️ Warning: ${response.warnings}`);
            }
          } else {
            alert(`📧 PDF report sent successfully to ${emailList.length} email(s)`);
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

  const handlePDF = () => {
    const doc = new jsPDF();
    let yPosition = 15;
    
    // Company details header
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.name || 'Company Name', 14, yPosition);
      yPosition += 7;
      
      doc.setFontSize(10);
      if (companyDetails.address) {
        doc.text(companyDetails.address, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.phone) {
        doc.text(`Phone: ${companyDetails.phone}`, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.email) {
        doc.text(`Email: ${companyDetails.email}`, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.bankDetails) {
        doc.text(`Bank: ${companyDetails.bankDetails}`, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.vatNumber) {
        doc.text(`VAT: ${companyDetails.vatNumber}`, 14, yPosition);
        yPosition += 5;
      }
      yPosition += 5;
    }
    
    // Report title and period
    doc.setFontSize(14);
    doc.text('Product Purchase Full View', 14, yPosition);
    yPosition += 7;
    doc.setFontSize(10);
    doc.text(`Period: ${format(fromDate, 'MM/dd/yyyy')} - ${format(toDate, 'MM/dd/yyyy')}`, 14, yPosition);
    yPosition += 10;
    
    // Process data for grouped display
    const processedData: any[] = [];
    const displayData = Array.isArray(data) ? data : [];
    
    displayData.forEach((row, index) => {
      if (row.isHeader) {
        processedData.push([
          row.date, row.supplier, row.invNo, row.awb,
          '', '', '', '', ''
        ]);
      } else if (row.isTotal) {
        processedData.push([
          '', '', '', '', row.product, row.quantity.toString(),
          '', '', Number(row.total).toFixed(2)
        ]);
        if (index < displayData.length - 1) {
          processedData.push(['', '', '', '', '', '', '', '', '']);
        }
      } else {
        processedData.push([
          '', '', row.invNo, row.awb, row.product, row.quantity.toString(),
          Number(row.unitPrice).toFixed(2), Number(row.sellingPrice).toFixed(2), Number(row.total).toFixed(2)
        ]);
      }
    });
    
    autoTable(doc, {
      head: [['Date', 'Supplier', 'Inv.No', 'AWB', 'Product', 'Quantity', 'Unit Price', 'Selling Price', 'Total']],
      body: processedData,
      startY: yPosition,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      didParseCell: function(data) {
        if (data.row.index < processedData.length) {
          const rowData = processedData[data.row.index];
          if (rowData[0] && rowData[1] && !rowData[4]) {
            data.cell.styles.fillColor = [220, 220, 220];
            data.cell.styles.fontStyle = 'bold';
          }
          if (rowData[4] && rowData[8] && !rowData[0] && !rowData[1]) {
            data.cell.styles.fillColor = [200, 200, 200];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    
    doc.save('product-purchase-full-view.pdf');
  };

  return (
    <PageLayout title="Product Purchase Full View" breadcrumb="Daily Report > Product Purchase Full View">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col space-y-4">
              <CardTitle className="text-lg md:text-xl">Product Purchase Full View</CardTitle>
              
              {/* Date Controls Row */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full sm:w-auto justify-start text-left font-normal h-10',
                        !fromDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">
                        {fromDate ? format(fromDate, 'MMM dd, yyyy') : 'From Date'}
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
                        'w-full sm:w-auto justify-start text-left font-normal h-10',
                        !toDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span className="truncate">
                        {toDate ? format(toDate, 'MMM dd, yyyy') : 'To Date'}
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
                
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10 w-full sm:w-56"
                  />
                </div>
              </div>
              
              {/* Action Buttons Row */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handlePrint} className="flex items-center gap-2 flex-1 sm:flex-none">
                    <Printer size={16} />
                    <span className="hidden sm:inline">Print</span>
                  </Button>
                  <Button variant="outline" onClick={handlePDF} className="flex items-center gap-2 flex-1 sm:flex-none">
                    <FileText size={16} />
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                </div>
                
                {/* Email Section */}
                <div className="flex flex-col sm:flex-row gap-2 flex-1">
                  <Input
                    placeholder="Enter emails (comma separated)"
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    className="flex-1 min-w-0"
                    disabled={isEmailSending}
                  />
                  <Button 
                    variant="outline" 
                    onClick={handleEmailPDF} 
                    className="flex items-center gap-2 whitespace-nowrap"
                    disabled={isEmailSending}
                  >
                    <Mail size={16} />
                    <span>{isEmailSending ? 'Sending...' : 'Email PDF'}</span>
                  </Button>
                </div>
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
                          <TableRow key={idx} className={cn("font-semibold border-t-2 border-gray-200", row.isCompany ? "bg-amber-50" : "bg-gray-50")}>
                            <TableCell>{row.date}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1">
                                {row.supplier}
                                {row.isCompany && (
                                  <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 font-medium">CO</span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell>{row.invNo}</TableCell>
                            <TableCell>{row.awb}</TableCell>
                            <TableCell colSpan={4}></TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        );
                      } else if (row.isTotal) {
                        return (
                          <TableRow key={idx} className={cn("font-bold border-b-2 border-gray-300", row.isCompany ? "bg-amber-50" : "bg-white")}>
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
                          <TableRow key={idx} className={row.isCompany ? "bg-amber-50" : "bg-white"}>
                            <TableCell></TableCell>
                            <TableCell></TableCell>
                            <TableCell>
                              <Button
                                variant="link"
                                className="p-0 text-blue-600 underline"
                                onClick={() => window.open(`/data-entry/purchase-invoice?purchaseId=${row.invNo}&edit=true`, '_self')}
                              >
                                {row.invNo}
                              </Button>
                            </TableCell>
                            <TableCell>{row.awb}</TableCell>
                            <TableCell>
                              <button
                                className="text-blue-600 underline cursor-pointer hover:text-blue-800 transition-colors"
                                onClick={() => handleProductClick(row)}
                                title="Click to view product purchase history"
                              >
                                {row.product}
                              </button>
                            </TableCell>
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