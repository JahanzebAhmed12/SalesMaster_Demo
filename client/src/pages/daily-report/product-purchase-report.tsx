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
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Product Purchase Report</title>');
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
      printWindow.document.write('<h3>PRODUCT PURCHASE REPORT</h3>');
      printWindow.document.write(`<p>Period: ${filters.fromDate || 'All'} to ${filters.toDate || 'All'}</p>`);
      printWindow.document.write('</div>');
      
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      const headers = ['Sl.No', 'Product Description', 'Quantity', 'AVG Price', 'Total'];
      headers.forEach(h => {
        printWindow.document.write(`<th>${h}</th>`);
      });
      printWindow.document.write('</tr></thead><tbody>');
      purchaseData.forEach(item => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.slNo}</td>`);
        printWindow.document.write(`<td>${item.productDescription}</td>`);
        printWindow.document.write(`<td>${item.quantity}</td>`);
        printWindow.document.write(`<td>£${item.avgPrice.toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${item.total.toFixed(2)}</td>`);
        printWindow.document.write('</tr>');
      });
      printWindow.document.write('</tbody></table>');
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
    doc.text('PRODUCT PURCHASE REPORT', 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.text(`Period: ${filters.fromDate || 'All'} to ${filters.toDate || 'All'}`, 105, yPosition, { align: 'center' });
    yPosition += 10;
    
    // Add table
    autoTable(doc, {
      head: [[
        'Sl.No', 'Product Description', 'Quantity', 'AVG Price', 'Total'
      ]],
      body: purchaseData.map((item: PurchaseItem) => [
        item.slNo,
        item.productDescription,
        item.quantity,
        `£${item.avgPrice.toFixed(2)}`,
        `£${item.total.toFixed(2)}`
      ]),
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 80 },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30 }
      }
    });
    
    doc.save(`product-purchase-report-${filters.fromDate || 'all'}-${filters.toDate || 'all'}.pdf`);
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
    doc.text('PRODUCT PURCHASE REPORT', 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.text(`Period: ${filters.fromDate || 'All'} to ${filters.toDate || 'All'}`, 105, yPosition, { align: 'center' });
    yPosition += 10;
    
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
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 80 },
        2: { cellWidth: 25 },
        3: { cellWidth: 30 },
        4: { cellWidth: 30 }
      }
    });
    
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