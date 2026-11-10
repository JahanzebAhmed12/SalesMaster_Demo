import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { FileText, Printer, Search, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn, formatQuantity } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useBusinessDate } from '@/hooks/use-business-date';
import { useCompanyDetails } from "@/hooks/use-company-details";
import { useAuth } from '@/lib/auth';
import PageLayout from '@/components/common/page-layout';
import { useInvoicePermissions } from "@/hooks/useInvoicePermissions";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { printHtmlTable } from "@/lib/export-utils";

interface FullViewRow {
  date: string | null;
  invoiceNo: string;
  customerName: string;
  productName: string;
  productId?: number;
  quantity: number;
  unitPrice: number;
  total: number;
  isInvoiceHeader?: boolean;
  isInvoiceTotal?: boolean;
  isVoid?: boolean;
  isUnknownDate?: boolean;
  notes?: string;
}

export default function DailySalesFullView() {
  const { user } = useAuth();
  const { canEditInvoice: canEditInvoiceGlobal } = useInvoicePermissions();
  const { currentDate: businessDate } = useBusinessDate();
  const [fromDate, setFromDate] = useState<Date>(() => {
    try { return businessDate ? new Date(businessDate) : new Date(); } catch { return new Date(); }
  });
  const [toDate, setToDate] = useState<Date>(() => {
    try { return businessDate ? new Date(businessDate) : new Date(); } catch { return new Date(); }
  });
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Sync dates when business date loads
  useEffect(() => {
    if (businessDate) {
      try {
        const d = new Date(businessDate);
        if (!isNaN(d.getTime())) {
          setFromDate(d);
          setToDate(d);
        }
      } catch {}
    }
  }, [businessDate]);

  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  // Fetch all sales for the selected date range
  const { data, isLoading, refetch } = useQuery<FullViewRow[]>({
    queryKey: ['daily-sales-full-view', format(fromDate, 'yyyy-MM-dd'), format(toDate, 'yyyy-MM-dd'), search, sortOrder],
    queryFn: async () => {
      const fromDateStr = format(fromDate, 'yyyy-MM-dd');
      const toDateStr = format(toDate, 'yyyy-MM-dd');
      
      // Use the new dedicated endpoint
      const response = await apiRequest('GET', `/api/reports/daily-sales-full-view?fromDate=${fromDateStr}&toDate=${toDateStr}&search=${encodeURIComponent(search)}&sortOrder=${sortOrder}`);
      return response;
    },
  });

  // Add type for companyDetails
  const { companyDetails } = useCompanyDetails();

  // Fetch user permissions
  const { data: userPermissions } = useQuery<any>({
    queryKey: ['/api/user-backdate-options', user?.id],
    queryFn: () => apiRequest('GET', `/api/user-backdate-options/${user?.id}`),
    enabled: !!user?.id,
  });

  // Check if user can edit an invoice based on date and invoice locking
  const canEditInvoice = (invoiceDate: string) => {
    // First check if invoice locking allows editing
    if (!canEditInvoiceGlobal) return false;
    
    if (!userPermissions) return false;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const invoiceDateFormatted = format(new Date(invoiceDate), 'yyyy-MM-dd');
    
    if (invoiceDateFormatted === today) {
      // For current date entries, check current_editing permission
      return userPermissions.current_editing !== false;
    } else {
      // For back date entries, check editing permission
      return userPermissions.editing === true;
    }
  };

  // Auto-search on load and when dates change
  useEffect(() => {
    refetch();
    // eslint-disable-next-line
  }, [fromDate, toDate]);

  // Navigation handler for clickable product names
  const handleProductClick = (row: FullViewRow) => {
    const fromDateStr = format(fromDate, 'yyyy-MM-dd');
    const toDateStr = format(toDate, 'yyyy-MM-dd');
    const productType = 'regular'; // Default to regular since we don't have this info
    
    // Navigate to product sales history with date range and product info
    if (row.productId) {
      // If we have productId, include it in the URL (similar to product-sales-report.tsx)
      navigate(`/reports/product-sales-history?productId=${row.productId}&productType=${productType}&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(row.productName)}`);
    } else {
      // Fallback without productId
      navigate(`/reports/product-sales-history?productType=${productType}&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(row.productName)}`);
    }
  };

  // Print handler
  const handlePrint = () => {
    if (!tableRef.current) return;
    let html = '';
    
    // Company details header
    if (companyDetails) {
      html += `<div style="text-align:center;margin-bottom:20px;">`;
      html += `<div style="font-size:20px;font-weight:bold;margin-bottom:4px;">${companyDetails.companyName || 'Company Name'}</div>`;
      if (companyDetails.address1) html += `<div style="font-size:12px;">${companyDetails.address1}</div>`;
      if (companyDetails.telephone) html += `<div style="font-size:12px;">Phone: ${companyDetails.telephone}</div>`;
      if (companyDetails.email) html += `<div style="font-size:12px;">Email: ${companyDetails.email}</div>`;
      if (companyDetails.bankDetails) html += `<div style="font-size:12px;">Bank: ${companyDetails.bankDetails}</div>`;
      if (companyDetails.vatNo) html += `<div style="font-size:12px;">VAT: ${companyDetails.vatNo}</div>`;
      html += `</div>`;
    }
    
    html += `<div style="font-size:16px;font-weight:bold;text-align:center;margin-bottom:8px;">Daily Sales Full View</div>`;
    html += `<div style="font-size:12px;text-align:center;margin-bottom:16px;">Period: ${format(fromDate, 'MM/dd/yyyy')} - ${format(toDate, 'MM/dd/yyyy')}</div>`;
    html += tableRef.current.innerHTML;
    printHtmlTable('Daily Sales Full View', html);
  };

  // PDF export handler
  const handlePDF = () => {
    const doc = new jsPDF();
    let yPosition = 15;
    
    // Company details header
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || 'Company Name', 14, yPosition);
      yPosition += 7;
      
      doc.setFontSize(10);
      if (companyDetails.address1) {
        doc.text(companyDetails.address1, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.telephone) {
        doc.text(`Phone: ${companyDetails.telephone}`, 14, yPosition);
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
      if (companyDetails.vatNo) {
        doc.text(`VAT: ${companyDetails.vatNo}`, 14, yPosition);
        yPosition += 5;
      }
      yPosition += 5;
    }
    
    // Report title and period
    doc.setFontSize(14);
    doc.text('Daily Sales Full View', 14, yPosition);
    yPosition += 7;
    doc.setFontSize(10);
    doc.text(`Period: ${format(fromDate, 'MM/dd/yyyy')} - ${format(toDate, 'MM/dd/yyyy')}`, 14, yPosition);
    yPosition += 10;
    
    // Process data for grouped display
    const processedData: any[] = [];
    const displayData = Array.isArray(data) ? data : [];
    
    displayData.forEach((row, index) => {
      if (row.isInvoiceHeader) {
        processedData.push([
          row.date || 'Unknown',
          `${row.invoiceNo}${row.isVoid ? (row.isUnknownDate ? ' (VOID - DATE UNKNOWN)' : ' (VOID)') : ''}`,
          row.customerName,
          '', row.notes || '', '', '', ''
        ]);
      } else if (row.isInvoiceTotal) {
        processedData.push([
          '', '', '', '', '', '', 'Total', Number(row.total).toFixed(2)
        ]);
        if (index < displayData.length - 1) {
          processedData.push(['', '', '', '', '', '', '', '']);
        }
      } else {
        processedData.push([
          '', row.invoiceNo, row.customerName, row.productName,
          row.notes || '', formatQuantity(row.quantity), Number(row.unitPrice).toFixed(2), Number(row.total).toFixed(2)
        ]);
      }
    });
    
    autoTable(doc, {
      head: [['Date', 'Invoice No', 'Customer Name', 'Product Name', 'Notes', 'Quantity', 'Unit Price', 'Total']],
      body: processedData,
      startY: yPosition,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      didParseCell: function(data) {
        if (data.row.index < processedData.length) {
          const rowData = processedData[data.row.index];
          if (rowData[0] && !rowData[3]) {
            data.cell.styles.fillColor = [220, 220, 220];
            data.cell.styles.fontStyle = 'bold';
          }
          if (rowData[5] === 'Total') {
            data.cell.styles.fillColor = [200, 200, 200];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    
    doc.save('daily-sales-full-view.pdf');
  };

  const generatePDFBlob = () => {
    const doc = new jsPDF();
    let yPosition = 15;
    
    // Company details header
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || 'Company Name', 14, yPosition);
      yPosition += 7;
      
      doc.setFontSize(10);
      if (companyDetails.address1) {
        doc.text(companyDetails.address1, 14, yPosition);
        yPosition += 5;
      }
      if (companyDetails.telephone) {
        doc.text(`Phone: ${companyDetails.telephone}`, 14, yPosition);
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
      if (companyDetails.vatNo) {
        doc.text(`VAT: ${companyDetails.vatNo}`, 14, yPosition);
        yPosition += 5;
      }
      yPosition += 5;
    }
    
    // Report title and period
    doc.setFontSize(14);
    doc.text('Daily Sales Full View', 14, yPosition);
    yPosition += 7;
    doc.setFontSize(10);
    doc.text(`Period: ${format(fromDate, 'MM/dd/yyyy')} - ${format(toDate, 'MM/dd/yyyy')}`, 14, yPosition);
    yPosition += 10;
    
    // Process data for grouped display
    const processedData: any[] = [];
    const displayData = Array.isArray(data) ? data : [];
    
    displayData.forEach((row, index) => {
      if (row.isInvoiceHeader) {
        processedData.push([
          row.date || 'Unknown',
          `${row.invoiceNo}${row.isVoid ? (row.isUnknownDate ? ' (VOID - DATE UNKNOWN)' : ' (VOID)') : ''}`,
          row.customerName,
          '', row.notes || '', '', '', ''
        ]);
      } else if (row.isInvoiceTotal) {
        processedData.push([
          '', '', '', '', '', '', 'Total', Number(row.total).toFixed(2)
        ]);
        if (index < displayData.length - 1) {
          processedData.push(['', '', '', '', '', '', '', '']);
        }
      } else {
        processedData.push([
          '', row.invoiceNo, row.customerName, row.productName,
          row.notes || '', formatQuantity(row.quantity), Number(row.unitPrice).toFixed(2), Number(row.total).toFixed(2)
        ]);
      }
    });
    
    autoTable(doc, {
      head: [['Date', 'Invoice No', 'Customer Name', 'Product Name', 'Notes', 'Quantity', 'Unit Price', 'Total']],
      body: processedData,
      startY: yPosition,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      didParseCell: function(data) {
        if (data.row.index < processedData.length) {
          const rowData = processedData[data.row.index];
          if (rowData[0] && !rowData[3]) {
            data.cell.styles.fillColor = [220, 220, 220];
            data.cell.styles.fontStyle = 'bold';
          }
          if (rowData[5] === 'Total') {
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
            subject: `Daily Sales Full View Report - ${format(fromDate, 'MM/dd/yyyy')} to ${format(toDate, 'MM/dd/yyyy')}`,
            body: `Dear Recipient,\n\nPlease find attached the Daily Sales Full View report for the period from ${format(fromDate, 'MM/dd/yyyy')} to ${format(toDate, 'MM/dd/yyyy')}.\n\nThis report contains detailed sales information including:\n- Invoice numbers and dates\n- Customer names\n- Product details\n- Quantities and pricing\n\nBest regards,\n${companyDetails?.companyName || 'Sales Team'}`,
            attachment: {
              filename: `daily-sales-full-view-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.pdf`,
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

  const displayData = Array.isArray(data) ? data : [];

  return (
    <PageLayout title="Daily Sales Full View" breadcrumb="Daily Report > Daily Sales Full View">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col space-y-4">
              <CardTitle className="text-lg md:text-xl">Full View - Daily Sales</CardTitle>
              
              {/* Date Controls Row */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <DateRangeFilter
                  from={fromDate}
                  to={toDate}
                  onFromChange={(d) => d && setFromDate(d)}
                  onToChange={(d) => d && setToDate(d)}
                  dateFormat="MMM dd, yyyy"
                />
                
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10 w-full sm:w-56"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  className="h-10 px-3"
                  title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                >
                  {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                </Button>
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
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : displayData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">No data available</TableCell>
                    </TableRow>
                  ) : (
                    displayData.map((row: FullViewRow, idx: number) => {
                      if (row.isInvoiceHeader) {
                        return (
                          <TableRow key={idx} className={row.isVoid ? "bg-gray-100 text-gray-500 font-semibold border-t-2 border-gray-200" : "bg-gray-50 font-semibold border-t-2 border-gray-200"}>
                            <TableCell>{row.date || 'Unknown'}</TableCell>
                            <TableCell>
                              {row.invoiceNo}
                              {row.isVoid && (
                                <span className="ml-1 text-xs font-bold">
                                  {row.isUnknownDate ? "(VOID - DATE UNKNOWN)" : "(VOID)"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{row.customerName}</TableCell>
                            <TableCell colSpan={2}></TableCell>
                            <TableCell className="text-sm text-muted-foreground italic whitespace-normal break-words" colSpan={3}>
                              {row.notes || ''}
                            </TableCell>
                          </TableRow>
                        );
                      } else if (row.isInvoiceTotal) {
                        return (
                          <TableRow key={idx} className="bg-white font-bold border-b-2 border-gray-300">
                            <TableCell colSpan={6}></TableCell>
                            <TableCell className="text-right font-bold">Total</TableCell>
                            <TableCell className="text-right font-bold">£{Number(row.total).toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      } else {
                        return (
                          <TableRow key={idx} className="bg-white">
                            <TableCell></TableCell>
                            <TableCell>
                              {canEditInvoice(row.date || '') ? (
                                <Button 
                                  variant="link" 
                                  className="p-0 text-blue-600 underline" 
                                  onClick={() => {
                                    const url = canEditInvoiceGlobal 
                                      ? `/data-entry/sales-invoice?invoiceNumber=${row.invoiceNo}`
                                      : `/data-entry/sales-invoice?invoiceNumber=${row.invoiceNo}&readonly=true`;
                                    window.open(url, '_self');
                                  }}
                                  title={canEditInvoiceGlobal ? "Edit invoice" : "View invoice (Read-Only)"}
                                >
                                  {row.invoiceNo}
                                </Button>
                              ) : (
                                <span 
                                  className="text-gray-500 cursor-not-allowed" 
                                  title="You don't have permission to edit this invoice"
                                >
                                  {row.invoiceNo}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>{row.customerName}</TableCell>
                            <TableCell>
                              <button
                                className="text-blue-600 underline cursor-pointer hover:text-blue-800 transition-colors"
                                onClick={() => handleProductClick(row)}
                                title="Click to view product sales history"
                              >
                                {row.productName}
                              </button>
                            </TableCell>
                            <TableCell className="max-w-[250px] whitespace-normal break-words text-sm text-muted-foreground">
                              {row.notes || ''}
                            </TableCell>
                            <TableCell className="text-right">{formatQuantity(row.quantity)}</TableCell>
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