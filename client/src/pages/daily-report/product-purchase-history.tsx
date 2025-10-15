import React, { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Printer, Download, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProductPurchaseHistoryPage() {
  const [productId, setProductId] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date | undefined>(new Date());
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [productName, setProductName] = useState<string>("");
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Navigation handler for clickable product descriptions
  const handleProductClick = (purchase: any) => {
    if (!productId) return; // Don't navigate if no product ID in URL
    
    const fromDateStr = fromDate ? format(fromDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const toDateStr = toDate ? format(toDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const productType = 'regular'; // Default to regular since we don't have this info from backend
    
    // Navigate to product purchase history with date range and product info (using current productId)
    setLocation(`/reports/product-purchase-history?productId=${productId}&productType=${productType}&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(purchase.productDescription)}`);
  };

  // Read URL parameters and set initial values
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const productIdParam = urlParams.get('productId');
    const fromDateParam = urlParams.get('fromDate');
    const toDateParam = urlParams.get('toDate');
    const productNameParam = urlParams.get('productName');

    if (productIdParam) {
      setProductId(productIdParam);
    }

    if (fromDateParam) {
      try {
        setFromDate(parseISO(fromDateParam));
      } catch (error) {
        console.error('Invalid fromDate parameter:', fromDateParam);
      }
    }

    if (toDateParam) {
      try {
        setToDate(parseISO(toDateParam));
      } catch (error) {
        console.error('Invalid toDate parameter:', toDateParam);
      }
    }

    if (productNameParam) {
      setProductName(decodeURIComponent(productNameParam));
    }
  }, []);

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  const { data: purchases = [], isLoading } = useQuery<any[]>({
    queryKey: ["product-purchase-history", productId, fromDate, toDate],
    queryFn: async () => {
      if (!productId || !fromDate || !toDate) return [];
      const res = await apiRequest(
        "GET",
        `/api/reports/product-purchase-history?productId=${productId}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}`
      );
      return res || [];
    },
  });

  // Export handlers (Print, PDF, Excel)
  const handlePrint = () => {
    const printContents = document.getElementById('product-purchase-history-table')?.outerHTML;
    if (!printContents) return;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Product Purchase History</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('.company-header{text-align:center;margin-bottom:30px;}');
      printWindow.document.write('.company-name{font-size:18px;font-weight:bold;margin-bottom:5px;}');
      printWindow.document.write('.company-address{font-size:12px;margin-bottom:2px;}');
      printWindow.document.write('.company-contact{font-size:12px;margin-bottom:2px;}');
      printWindow.document.write('.report-title{font-size:16px;font-weight:bold;margin-bottom:10px;}');
      printWindow.document.write('.report-details{font-size:12px;margin-bottom:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.text-right{text-align:right;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      
      // Add company header
      printWindow.document.write('<div class="company-header">');
      printWindow.document.write(`<div class="company-name">${companyDetails?.companyName || 'Company Name'}</div>`);
      if (companyDetails?.address1) {
        printWindow.document.write(`<div class="company-address">${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}</div>`);
      }
      if (companyDetails?.telephone) {
        printWindow.document.write(`<div class="company-contact">Phone: ${companyDetails.telephone}</div>`);
      }
      if (companyDetails?.email) {
        printWindow.document.write(`<div class="company-contact">Email: ${companyDetails.email}</div>`);
      }
      printWindow.document.write('<div class="report-title">Product Purchase History</div>');
      if (productName) {
        printWindow.document.write(`<div class="report-details">Product: ${productName}</div>`);
      }
      printWindow.document.write(`<div class="report-details">Date Range: ${fromDate ? format(fromDate, 'dd/MM/yyyy') : ''} to ${toDate ? format(toDate, 'dd/MM/yyyy') : ''}</div>`);
      printWindow.document.write('</div>');
      
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("TROPIFRUIT UK LTD", 105, 12, { align: "center" });
    doc.setFontSize(12);
    doc.text("Product Purchase History", 105, 20, { align: "center" });
    autoTable(doc, {
      head: [["Invoice No", "Date", "Supplier Name", "Product", "Quantity", "Unit Price", "Total"]],
      body: purchases.map((row: any) => [
        row.invoiceNo,
        row.date,
        row.supplierName,
        row.productDescription,
        row.quantity,
        `£${Number(row.unitPrice).toFixed(2)}`,
        `£${Number(row.total).toFixed(2)}`
      ]),
      startY: 28,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });
    doc.save("product-purchase-history.pdf");
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      purchases.map((row: any) => ({
        "Invoice No": row.invoiceNo,
        "Date": row.date,
        "Supplier Name": row.supplierName,
        "Product": row.productDescription,
        "Quantity": row.quantity,
        "Unit Price": row.unitPrice,
        "Total": row.total,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Product Purchase History");
    XLSX.writeFile(wb, "product-purchase-history.xlsx");
  };

  // Generate PDF blob for email
  const generatePDFBlob = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("TROPIFRUIT UK LTD", 105, 12, { align: "center" });
    doc.setFontSize(12);
    doc.text("Product Purchase History", 105, 20, { align: "center" });
    if (productName) {
      doc.setFontSize(10);
      doc.text(`Product: ${productName}`, 105, 26, { align: "center" });
    }
    doc.setFontSize(10);
    doc.text(`Date Range: ${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''} to ${toDate ? format(toDate, 'yyyy-MM-dd') : ''}`, 105, productName ? 32 : 26, { align: "center" });
    
    autoTable(doc, {
      head: [["Invoice No", "Date", "Supplier Name", "Product", "Quantity", "Unit Price", "Total"]],
      body: purchases.map((row: any) => [
        row.invoiceNo,
        row.date,
        row.supplierName,
        row.productDescription,
        row.quantity,
        `£${Number(row.unitPrice).toFixed(2)}`,
        `£${Number(row.total).toFixed(2)}`
      ]),
      startY: productName ? 38 : 32,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });
    
    return doc.output('blob');
  };

  // Email PDF handler
  const handleEmailPDF = async () => {
    if (!emails.trim()) {
      toast({
        title: "Email Required",
        description: "Please enter at least one email address",
        variant: "destructive",
      });
      return;
    }

    // Parse and validate emails
    const emailList = emails.split(',').map(email => email.trim()).filter(email => email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter(email => !emailRegex.test(email));
    
    if (invalidEmails.length > 0) {
      toast({
        title: "Invalid Email",
        description: `Invalid email addresses: ${invalidEmails.join(', ')}`,
        variant: "destructive",
      });
      return;
    }

    if (purchases.length === 0) {
      toast({
        title: "No Data",
        description: "No purchase history data available to send.",
        variant: "destructive",
      });
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
        const base64PDF = base64data.split(',')[1];
        
        // Send email with PDF attachment
        const emailData = {
          to: emailList,
          subject: `Product Purchase History - ${productName || 'Product'} (${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''} to ${toDate ? format(toDate, 'yyyy-MM-dd') : ''})`,
          body: `Please find attached the Product Purchase History report${productName ? ` for ${productName}` : ''} for the period from ${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''} to ${toDate ? format(toDate, 'yyyy-MM-dd') : ''}.\n\nTotal records: ${purchases.length}`,
          attachment: {
            filename: `product-purchase-history-${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''}-to-${toDate ? format(toDate, 'yyyy-MM-dd') : ''}.pdf`,
            content: base64PDF,
            contentType: 'application/pdf'
          }
        };
        
        await apiRequest('POST', '/api/send-email', emailData);
        toast({
          title: "Email Sent",
          description: `Product purchase history sent successfully to ${emailList.length} email(s)`,
        });
        setEmails('');
      };
      
      reader.readAsDataURL(pdfBlob);
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Email Failed",
        description: "Failed to send email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsEmailSending(false);
    }
  };

  return (
    <PageLayout title="Product Purchase History" breadcrumb="Product Purchase History">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col space-y-4">
              <CardTitle className="text-xl font-bold">
                Product Purchase History
                {productName && <span className="text-sm font-normal text-gray-600 block mt-1">Product: {productName}</span>}
              </CardTitle>
              
              {/* Date Controls */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-[160px] justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {fromDate ? format(fromDate, "PPP") : "From Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0">
                      <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-[160px] justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {toDate ? format(toDate, "PPP") : "To Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0">
                      <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              {/* Export Controls */}
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" /> Print
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePDF}>
                    <FileText className="mr-2 h-4 w-4" /> PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExcel}>
                    <Download className="mr-2 h-4 w-4" /> Excel
                  </Button>
                </div>
                
                {/* Email Section */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full lg:w-auto">
                  <Input
                    placeholder="Enter emails (comma separated)"
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    className="w-full sm:w-64"
                    disabled={isEmailSending}
                  />
                  <Button 
                    variant="outline" 
                    onClick={handleEmailPDF} 
                    className="flex items-center gap-2 w-full sm:w-auto"
                    disabled={isEmailSending}
                    size="sm"
                  >
                    <Mail className="h-4 w-4" />
                    <span>{isEmailSending ? 'Sending...' : 'Email'}</span>
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="overflow-x-auto">
              <table id="product-purchase-history-table" className="w-full border-collapse border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Invoice No</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Date</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Supplier Name</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Product</th>
                    <th className="border border-gray-200 px-3 py-2 text-right font-medium">Quantity</th>
                    <th className="border border-gray-200 px-3 py-2 text-right font-medium">Unit Price</th>
                    <th className="border border-gray-200 px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="border border-gray-200 px-3 py-8 text-center text-gray-500">
                        Loading...
                      </td>
                    </tr>
                  ) : purchases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-gray-200 px-3 py-8 text-center text-gray-500">
                        No data found
                      </td>
                    </tr>
                  ) : (
                    purchases.map((row: any, idx: number) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="border border-gray-200 px-3 py-2">
                          <Button
                            variant="link"
                            className="p-0 h-auto text-blue-600 underline text-sm"
                            onClick={() => window.open(`/data-entry/purchase-invoice?purchaseId=${row.invoiceNo}&edit=true`, '_self')}
                          >
                            {row.invoiceNo}
                          </Button>
                        </td>
                        <td className="border border-gray-200 px-3 py-2">{row.date}</td>
                        <td className="border border-gray-200 px-3 py-2">{row.supplierName}</td>
                        <td 
                          className={`border border-gray-200 px-3 py-2 ${productId ? 'cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition-colors' : ''}`}
                          onClick={() => productId && handleProductClick(row)}
                          title={productId ? "Click to view detailed product purchase history" : ""}
                        >
                          <span className={productId ? 'underline decoration-dotted' : ''}>
                            {row.productDescription}
                          </span>
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-right">{row.quantity}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right">£{Number(row.unitPrice).toFixed(2)}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right font-semibold">£{Number(row.total).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
} 