import React, { useState, useEffect } from "react";
import { format, parseISO } from "date-fns";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Printer, Download, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatQuantity } from "@/lib/utils";
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

  // Helper: gate number replaces customer name for cash sales (same logic as daily-summary)
  const getDisplayCustomerName = (sale: any): string => {
    const isCashCustomer = sale.customerType === 'cash';
    const cashSalePatterns = [
      'cash sale', 'cash sales', 'cash customer', 'walk-in customer',
      'walk in customer', 'cash', 'walk-in', 'walkin'
    ];
    const customerNameLower = (sale.customerName || '').toLowerCase().trim();
    const isCashByName = cashSalePatterns.includes(customerNameLower);
    if ((isCashCustomer || isCashByName) && sale.gateNumber && sale.gateNumber.trim()) {
      return sale.gateNumber.trim();
    }
    return sale.customerName || 'Unknown Customer';
  };

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
      body: [
        ...sales.map((row: any) => [
          row.invoiceNo,
          row.date,
          row.customerName,
          row.productDescription,
          formatQuantity(row.quantity),
          `£${Number(row.unitPrice).toFixed(2)}`,
          `£${Number(row.total).toFixed(2)}`
        ]),
        sales.length > 0 ? [
          '', '', '', { content: 'TOTAL (excl. company)', styles: { fontStyle: 'bold', halign: 'right' } },
          { content: formatQuantity(sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.quantity), 0)), styles: { fontStyle: 'bold', halign: 'right' } },
          (() => { const q = sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.quantity), 0); const t = sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.total), 0); return { content: q > 0 ? `£${(t / q).toFixed(2)}` : '-', styles: { fontStyle: 'bold', halign: 'right' } }; })(),
          { content: `£${sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.total), 0).toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } },
        ] : [],
      ],
      startY: 28,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });
    doc.save("product-sales-history.pdf");
  };

  const handleExcel = () => {
    const nonCompanySales = sales.filter((r: any) => !r.isCompany);
    const totalQty = nonCompanySales.reduce((s: number, r: any) => s + Number(r.quantity), 0);
    const totalAmt = nonCompanySales.reduce((s: number, r: any) => s + Number(r.total), 0);
    const avgPrice = totalQty > 0 ? totalAmt / totalQty : 0;
    const ws = XLSX.utils.json_to_sheet([
      ...sales.map((row: any) => ({
        "Invoice No": row.invoiceNo,
        "Date": row.date,
        "Customer Name": row.customerName,
        "Product": row.productDescription,
        "Quantity": formatQuantity(row.quantity),
        "Unit Price": row.unitPrice,
        "Total": row.total,
      })),
      {},
      { "Invoice No": "TOTAL (excl. company)", "Quantity": formatQuantity(totalQty), "Unit Price": avgPrice.toFixed(2), "Total": totalAmt.toFixed(2) },
    ]);
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
      body: [
        ...sales.map((row: any) => [
          row.invoiceNo,
          row.date,
          row.customerName,
          row.productDescription,
          formatQuantity(row.quantity),
          `£${Number(row.unitPrice).toFixed(2)}`,
          `£${Number(row.total).toFixed(2)}`
        ]),
        sales.length > 0 ? [
          '', '', '', { content: 'TOTAL (excl. company)', styles: { fontStyle: 'bold', halign: 'right' } },
          { content: formatQuantity(sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.quantity), 0)), styles: { fontStyle: 'bold', halign: 'right' } },
          (() => { const q = sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.quantity), 0); const t = sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.total), 0); return { content: q > 0 ? `£${(t / q).toFixed(2)}` : '-', styles: { fontStyle: 'bold', halign: 'right' } }; })(),
          { content: `£${sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.total), 0).toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } },
        ] : [],
      ],
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
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col space-y-4">
              <CardTitle className="text-xl font-bold">
                Product Sales History
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
              <table id="product-sales-history-table" className="w-full border-collapse border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Invoice No</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Date</th>
                    <th className="border border-gray-200 px-3 py-2 text-left font-medium">Customer Name</th>
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
                  ) : sales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-gray-200 px-3 py-8 text-center text-gray-500">
                        No data found
                      </td>
                    </tr>
                  ) : (
                    sales.map((row: any, idx: number) => (
                      <tr key={idx} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} ${row.isCompany ? 'bg-amber-50' : ''}`}>
                        <td className="border border-gray-200 px-3 py-2">
                          <Button 
                            variant="link" 
                            className="p-0 h-auto text-blue-600 underline text-sm" 
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
                        <td className="border border-gray-200 px-3 py-2">{row.date}</td>
                        <td className="border border-gray-200 px-3 py-2">
                          <span className="flex items-center gap-1">
                            {getDisplayCustomerName(row)}
                            {row.isCompany && (
                              <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 rounded px-1 py-0 font-medium">CO</span>
                            )}
                          </span>
                        </td>
                        <td 
                          className={`border border-gray-200 px-3 py-2 ${productId ? 'cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition-colors' : ''}`}
                          onClick={() => productId && handleProductClick(row)}
                          title={productId ? "Click to view detailed product sales history" : ""}
                        >
                          <span className={productId ? 'underline decoration-dotted' : ''}>
                            {row.productDescription}
                          </span>
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-right">{formatQuantity(row.quantity)}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right">£{Number(row.unitPrice).toFixed(2)}</td>
                        <td className="border border-gray-200 px-3 py-2 text-right font-semibold">£{Number(row.total).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {sales.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold">
                      <td colSpan={4} className="border border-gray-200 px-3 py-2 text-right">TOTAL (excluding company)</td>
                      <td className="border border-gray-200 px-3 py-2 text-right">{formatQuantity(sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.quantity), 0))}</td>
                      <td className="border border-gray-200 px-3 py-2 text-right">{(() => { const q = sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.quantity), 0); const t = sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.total), 0); return q > 0 ? `£${(t / q).toFixed(2)}` : '-'; })()}</td>
                      <td className="border border-gray-200 px-3 py-2 text-right">£{sales.filter((r: any) => !r.isCompany).reduce((s: number, r: any) => s + Number(r.total), 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
} 