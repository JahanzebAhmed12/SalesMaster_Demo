import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ShoppingBag, FileText, Download, Copy, Printer, Search, Mail } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PurchaseItem {
  id: number;
  slNo: number;
  productDescription: string;
  quantity: number;
  avgPrice: number;
  total: number;
}

export default function ProductPurchaseReport() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [showAll, setShowAll] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  
  const [filters, setFilters] = useState({
    fromDate: format(new Date(), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    showAll: "All",
    search: "",
  });

  // Fetch purchase data
  const {
    data: purchaseData = [],
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<PurchaseItem[]>({
    queryKey: ["/api/reports/product-purchase", filters],
    queryFn: () => {
      const fromDateStr = filters.fromDate ? `${filters.fromDate} 00:00:00` : '';
      const toDateStr = filters.toDate ? `${filters.toDate} 23:59:59` : '';
      const params = new URLSearchParams();
      if (fromDateStr) params.append("fromDate", fromDateStr);
      if (toDateStr) params.append("toDate", toDateStr);
      if (filters.showAll) params.append("showAll", filters.showAll);
      if (filters.search) params.append("search", filters.search);
      return apiRequest("GET", `/api/reports/product-purchase?${params.toString()}`);
    },
  });

  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  const handleSearch = () => {
    setFilters({
      fromDate: format(fromDate, "yyyy-MM-dd"),
      toDate: format(toDate, "yyyy-MM-dd"),
      showAll: showAll,
      search: searchTerm,
    });
  };

  const totalQuantity = purchaseData.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = purchaseData.reduce((sum, item) => sum + item.total, 0);

  const tableRef = useRef<HTMLDivElement>(null);

  // Export handlers
  const handlePrint = () => {
    if (!tableRef.current) return;
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;} .summary-print{margin:24px 0 24px 0;padding:12px 24px;font-weight:500;text-align:center;}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(`<div style='text-align:center;font-size:20px;font-weight:bold;margin-bottom:8px;'>${companyDetails?.companyName || 'Company Name'}</div>`);
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(purchaseData.map((item: PurchaseItem) => ({
      'Sl.No': item.slNo,
      'Product Description': item.productDescription,
      'Quantity': item.quantity,
      'AVG Price': item.avgPrice,
      'Total': item.total
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product Purchase Report');
    XLSX.writeFile(wb, 'product-purchase-report.xlsx');
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    // Company name centered
    const companyName = companyDetails?.companyName || 'Company Name';
    doc.setFontSize(16);
    const pageWidth = doc.internal.pageSize.getWidth();
    const textWidth = doc.getTextWidth(companyName);
    doc.text(companyName, (pageWidth - textWidth) / 2, 16);
    doc.setFontSize(14);
    doc.text('Product Purchase Report', (pageWidth - doc.getTextWidth('Product Purchase Report')) / 2, 26);
    autoTable(doc, {
      head: [[
        'Sl.No', 'Product Description', 'Quantity', 'AVG Price', 'Total'
      ]],
      body: purchaseData.map((item: PurchaseItem) => [
        item.slNo,
        item.productDescription,
        item.quantity,
        item.avgPrice,
        item.total
      ]),
      startY: 36,
    });
    // Add summary below table, centered
    const finalY = (doc as any).lastAutoTable.finalY || 36;
    doc.setFontSize(12);
    const summaryText = `Date Range: ${filters.fromDate || '-'} to ${filters.toDate || '-'}   |   Total Quantity: ${totalQuantity}   |   Total Amount: £${totalAmount.toFixed(2)}`;
    const summaryWidth = doc.getTextWidth(summaryText);
    doc.text(summaryText, (pageWidth - summaryWidth) / 2, finalY + 14);
    doc.save('product-purchase-report.pdf');
  };

  const handleCopy = () => {
    const header = ['Sl.No', 'Product Description', 'Quantity', 'AVG Price', 'Total'];
    const rows = purchaseData.map((item: PurchaseItem) => [
      item.slNo,
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
    doc.text('Product Purchase Report', 14, companyDetails ? 42 : 15);
    doc.setFontSize(10);
    doc.text(`Date Range: ${filters.fromDate || '-'} to ${filters.toDate || '-'}`, 14, companyDetails ? 48 : 21);
    
    // Add table
    autoTable(doc, {
      head: [['Sl.No', 'Product Description', 'Quantity', 'AVG Price', 'Total']],
      body: purchaseData.map((item: PurchaseItem) => [
        item.slNo.toString(),
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
        0: { cellWidth: 20, halign: 'center' }, // Sl.No
        1: { cellWidth: 80 }, // Product Description
        2: { cellWidth: 25, halign: 'right' }, // Quantity
        3: { cellWidth: 30, halign: 'right' }, // AVG Price
        4: { cellWidth: 30, halign: 'right' }, // Total
      },
    });
    
    // Add summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || (companyDetails ? 52 : 25);
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(12, finalY + 6, 185, 20, 'F');
    doc.setTextColor(40);
    doc.setFont('helvetica', 'bold');
    doc.text(`Summary - Date Range: ${filters.fromDate || '-'} to ${filters.toDate || '-'}`, 16, finalY + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`Total Products: ${purchaseData.length} | Total Quantity: ${totalQuantity} | Total Amount: £${totalAmount.toFixed(2)}`, 16, finalY + 22);
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

    if (purchaseData.length === 0) {
      alert('No purchase data available to send. Please search for data first.');
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
            subject: `Product Purchase Report - ${filters.fromDate || 'N/A'} to ${filters.toDate || 'N/A'}`,
            body: `Dear Recipient,\n\nPlease find attached the Product Purchase Report for the period from ${filters.fromDate || 'N/A'} to ${filters.toDate || 'N/A'}.\n\nThis report contains detailed purchase information including:\n- Product descriptions and quantities purchased\n- Average purchase prices\n- Total purchase amounts per product\n- Overall purchase summary\n\nReport Summary:\n- Total Products: ${purchaseData.length}\n- Total Quantity: ${totalQuantity}\n- Total Purchase Amount: £${totalAmount.toFixed(2)}\n- Date Range: ${filters.fromDate || 'N/A'} to ${filters.toDate || 'N/A'}\n- Filter Applied: ${showAll}\n\nBest regards,\n${companyDetails?.name || 'Purchase Team'}`,
            attachment: {
              filename: `product-purchase-report-${filters.fromDate || 'unknown'}-to-${filters.toDate || 'unknown'}.pdf`,
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
            alert(`📧 Product purchase report sent successfully to ${emailList.length} email(s)`);
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

  const handleProductClick = (productId: number, productDescription: string) => {
    const fromDateStr = format(fromDate, "yyyy-MM-dd");
    const toDateStr = format(toDate, "yyyy-MM-dd");
    setLocation(`/reports/product-purchase-history?productId=${productId}&productType=regular&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(productDescription)}`);
  };

  // Auto search when both dates are selected
  useEffect(() => {
    if (fromDate && toDate) {
      handleSearch();
    }
    // eslint-disable-next-line
  }, [fromDate, toDate]);

  if (isError) {
    toast({
      title: "Error",
      description: (error as any)?.message || "Failed to fetch purchase data.",
      variant: "destructive",
    });
  }

  return (
    <PageLayout title="Purchase Report" breadcrumb="Daily Report > Product Purchase Report">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag size={20} />
                Purchase Report
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              <div style={{ minWidth: 180, flex: '1 1 180px' }}>
                <Label>From Date:</Label>
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
              <div style={{ minWidth: 180, flex: '1 1 180px' }}>
                <Label>To Date:</Label>
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
              <div style={{ minWidth: 120, flex: '1 1 120px' }}>
                <Select value={showAll} onValueChange={setShowAll}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Show All">Show All</SelectItem>
                    <SelectItem value="All">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div style={{ minWidth: 160, flex: '2 1 160px' }}>
                <Input
                  placeholder="Search:"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2" style={{ minWidth: 320 }}>
                <Button
                  className="bg-blue-500 hover:bg-blue-600"
                  style={{ minWidth: 80 }}
                  onClick={handleSearch}
                  disabled={isLoading}
                >
                  {isLoading ? "Searching..." : "Search"}
                </Button>
                <Button
                  className="bg-cyan-500 hover:bg-cyan-600 flex items-center gap-2 text-white"
                  style={{ minWidth: 160 }} onClick={() => {
                    setLocation(`/daily-report/compare-with-purchase`);
                  }}
                >
                  Compare with Purchase
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                  <FileText size={14} /> PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                  <Download size={14} /> Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                  <Copy size={14} /> Copy
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                  <Printer size={14} /> Print
                </Button>
                
                {/* Email Section - next to Print button */}
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
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Product Description</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-center">AVG Price</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Loading purchase data...
                      </TableCell>
                    </TableRow>
                  ) : purchaseData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        No purchase data found for the selected date range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    purchaseData.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.slNo}</TableCell>
                        <TableCell>
                          <button
                            onClick={() => handleProductClick(item.id, item.productDescription)}
                            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left"
                          >
                            {item.productDescription}
                          </button>
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-center">£{item.avgPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{item.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">{purchaseData.length} Items</TableCell>
                    <TableCell className="text-center font-bold">{totalQuantity}</TableCell>
                    <TableCell className="text-center font-bold"></TableCell>
                    <TableCell className="text-center font-bold">£{totalAmount.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {/* Summary below table, styled for print and screen */}
              <div className="summary-print flex flex-wrap items-center justify-center gap-x-8 gap-y-2 mt-6 p-4 bg-gray-50 rounded-lg border print:mt-6 print:p-4 print:bg-white print:border print:rounded-lg print:flex-row print:items-center print:gap-x-8 print:gap-y-2 text-center">
                <div>Date Range: {filters.fromDate || '-'} to {filters.toDate || '-'}</div>
                <div>Total Quantity: {totalQuantity}</div>
                <div>Total Amount: £{totalAmount.toFixed(2)}</div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {purchaseData.length} of {purchaseData.length} entries</div>
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