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
import { useInvoicePermissions } from "@/hooks/useInvoicePermissions";

export default function ProductSalesHistoryPage() {
  const [productId, setProductId] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date | undefined>(new Date());
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [productName, setProductName] = useState<string>("");
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { canEditInvoice } = useInvoicePermissions();

  // Navigation handler for clickable product descriptions
  const handleProductClick = (sale: any) => {
    if (!productId) return; // Don't navigate if no product ID in URL
    
    const fromDateStr = fromDate ? format(fromDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const toDateStr = toDate ? format(toDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const productType = 'regular'; // Default to regular since we don't have this info from backend
    
    // Navigate to product sales history with date range and product info (using current productId)
    setLocation(`/reports/product-sales-history?productId=${productId}&productType=${productType}&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(sale.productDescription)}`);
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

  const { data: sales = [], isLoading } = useQuery<any[]>({
    queryKey: ["product-sales-history", productId, fromDate, toDate],
    queryFn: async () => {
      if (!productId || !fromDate || !toDate) return [];
      const res = await apiRequest(
        "GET",
        `/api/reports/product-sales-history?productId=${productId}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}`
      );
      return res || [];
    },
  });

  // Export handlers (Print, PDF, Excel)
  const handlePrint = () => {
    const printContents = document.getElementById('product-sales-history-table')?.outerHTML;
    if (!printContents) return;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}@media print{body{margin:0;}}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write('<div style="font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;">TROPIFRUIT UK LTD</div>');
      printWindow.document.write('<div style="font-size:16px;font-weight:bold;text-align:center;margin-bottom:8px;">Product Sales History</div>');
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
    doc.text("Product Sales History", 105, 20, { align: "center" });
    autoTable(doc, {
      head: [["Invoice No", "Date", "Customer Name", "Product", "Quantity", "Unit Price", "Total"]],
      body: sales.map((row: any) => [
        row.invoiceNo,
        row.date,
        row.customerName,
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
    doc.save("product-sales-history.pdf");
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      sales.map((row: any) => ({
        "Invoice No": row.invoiceNo,
        "Date": row.date,
        "Customer Name": row.customerName,
        "Product": row.productDescription,
        "Quantity": row.quantity,
        "Unit Price": row.unitPrice,
        "Total": row.total,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Product Sales History");
    XLSX.writeFile(wb, "product-sales-history.xlsx");
  };

  // Generate PDF blob for email
  const generatePDFBlob = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("TROPIFRUIT UK LTD", 105, 12, { align: "center" });
    doc.setFontSize(12);
    doc.text("Product Sales History", 105, 20, { align: "center" });
    if (productName) {
      doc.setFontSize(10);
      doc.text(`Product: ${productName}`, 105, 26, { align: "center" });
    }
    doc.setFontSize(10);
    doc.text(`Date Range: ${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''} to ${toDate ? format(toDate, 'yyyy-MM-dd') : ''}`, 105, productName ? 32 : 26, { align: "center" });
    
    autoTable(doc, {
      head: [["Invoice No", "Date", "Customer Name", "Product", "Quantity", "Unit Price", "Total"]],
      body: sales.map((row: any) => [
        row.invoiceNo,
        row.date,
        row.customerName,
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

    if (sales.length === 0) {
      toast({
        title: "No Data",
        description: "No sales history data available to send.",
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
          subject: `Product Sales History - ${productName || 'Product'} (${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''} to ${toDate ? format(toDate, 'yyyy-MM-dd') : ''})`,
          body: `Please find attached the Product Sales History report${productName ? ` for ${productName}` : ''} for the period from ${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''} to ${toDate ? format(toDate, 'yyyy-MM-dd') : ''}.\n\nTotal records: ${sales.length}`,
          attachment: {
            filename: `product-sales-history-${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''}-to-${toDate ? format(toDate, 'yyyy-MM-dd') : ''}.pdf`,
            content: base64PDF,
            contentType: 'application/pdf'
          }
        };
        
        await apiRequest('POST', '/api/send-email', emailData);
        toast({
          title: "Email Sent",
          description: `Product sales history sent successfully to ${emailList.length} email(s)`,
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
    <PageLayout title="Product Sales History" breadcrumb="Product Sales History">
      <div className="pl-0 md:pl-64 pt-6 pr-4">
        <h1 className="text-2xl font-bold mb-4">Product Sales History</h1>
        <Card className="mx-auto max-w-7xl">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle className="text-xl font-bold">
              Product Sales History
              {productName && <span className="text-sm font-normal text-gray-600 block mt-1">Product: {productName}</span>}
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
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
                  <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate ? format(toDate, "PPP") : "To Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0">
                  <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus />
                </PopoverContent>
              </Popover>
              <Button variant="outline" onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Print</Button>
              <Button variant="outline" onClick={handlePDF}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
              <Button variant="outline" onClick={handleExcel}><Download className="mr-2 h-4 w-4" /> Excel</Button>
              
              {/* Email Section */}
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
                  <Mail className="h-4 w-4" />
                  <span>{isEmailSending ? 'Sending...' : 'Email'}</span>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-full">
              <table id="product-sales-history-table" className="min-w-full border border-gray-200 rounded-lg text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="border-b px-4 py-2 text-left">Invoice No</th>
                    <th className="border-b px-4 py-2 text-left">Date</th>
                    <th className="border-b px-4 py-2 text-left">Customer Name</th>
                    <th className="border-b px-4 py-2 text-left">Product</th>
                    <th className="border-b px-4 py-2 text-right">Quantity</th>
                    <th className="border-b px-4 py-2 text-right">Unit Price</th>
                    <th className="border-b px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="text-center py-8">Loading...</td></tr>
                  ) : sales.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8">No data found</td></tr>
                  ) : (
                    sales.map((row: any, idx: number) => (
                      <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="border-b px-4 py-2">
                          <Button 
                            variant="link" 
                            className="p-0 text-blue-600 underline" 
                            onClick={() => {
                              const url = canEditInvoice 
                                ? `/data-entry/sales-invoice?invoiceNumber=${row.invoiceNo}`
                                : `/data-entry/sales-invoice?invoiceNumber=${row.invoiceNo}&readonly=true`;
                              window.open(url, '_self');
                            }}
                            title={canEditInvoice ? "Edit invoice" : "View invoice (Read-Only)"}
                          >
                            {row.invoiceNo}
                          </Button>
                        </td>
                        <td className="border-b px-4 py-2">{row.date}</td>
                        <td className="border-b px-4 py-2">{row.customerName}</td>
                        <td 
                          className={`border-b px-4 py-2 ${productId ? 'cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition-colors' : ''}`}
                          onClick={() => productId && handleProductClick(row)}
                          title={productId ? "Click to view detailed product sales history" : ""}
                        >
                          <span className={productId ? 'underline decoration-dotted' : ''}>
                            {row.productDescription}
                          </span>
                        </td>
                        <td className="border-b px-4 py-2 text-right">{row.quantity}</td>
                        <td className="border-b px-4 py-2 text-right">£{Number(row.unitPrice).toFixed(2)}</td>
                        <td className="border-b px-4 py-2 text-right font-semibold">£{Number(row.total).toFixed(2)}</td>
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