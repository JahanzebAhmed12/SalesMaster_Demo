import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import type { Supplier } from "@shared/schema";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { copyToClipboard } from "@/lib/export-utils";
import { DateRangeFilter } from "@/components/ui/date-range-filter";

interface SupplierPaymentHistoryData {
  slNo: number;
  paymentDate: string;
  paymentMode: string;
  paymentId: string;
  paidAmt: number;
  invNo: string;
  invDate: string;
  supplier: string;
  invoiceAmt: number;
  allocated: number;
  remarks: string;
  supplierInvoiceNumber?: string;
  supplierInvoiceDate?: string;
}

export default function SupPaymentHistory() {
  const { toast } = useToast();
  const { currentDate: businessDate } = useBusinessDate();
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [fromDate, setFromDate] = useState<Date | undefined>(() => {
    return businessDate ? new Date(businessDate) : new Date();
  });
  const [toDate, setToDate] = useState<Date | undefined>(() => {
    return businessDate ? new Date(businessDate) : new Date();
  });
  const [paymentMode, setPaymentMode] = useState<string>("All");
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);

  const [filters, setFilters] = useState({
    supplierId: "",
    fromDate: businessDate ? format(businessDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    toDate: businessDate ? format(businessDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    paymentMode: "All",
  });

  // Update dates when business date changes
  useEffect(() => {
    if (businessDate) {
      const businessDateFormatted = format(businessDate, "yyyy-MM-dd");
      setFromDate(new Date(businessDate));
      setToDate(new Date(businessDate));
      setFilters(prev => ({
        ...prev,
        fromDate: businessDateFormatted,
        toDate: businessDateFormatted
      }));
    }
  }, [businessDate]);

  // Fetch suppliers
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Fetch payment history
  const {
    data: paymentHistory = [],
    isLoading: historyLoading,
    isError,
    error,
  } = useQuery<SupplierPaymentHistoryData[]>({
    queryKey: ["/api/supplier-payments/history", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.supplierId) params.append("supplierId", filters.supplierId);
      if (filters.fromDate) params.append("fromDate", filters.fromDate);
      if (filters.toDate) params.append("toDate", filters.toDate);
      if (filters.paymentMode && filters.paymentMode !== "All") {
        params.append("paymentMode", filters.paymentMode);
      }
      return apiRequest("GET", `/api/supplier-payments/history?${params.toString()}`);
    },
  });

  const handleSubmit = () => {
    setFilters({
      supplierId: selectedSupplier === "all" ? "" : selectedSupplier,
      fromDate: fromDate ? format(fromDate, "yyyy-MM-dd") : "",
      toDate: toDate ? format(toDate, "yyyy-MM-dd") : "",
      paymentMode: paymentMode,
    });
  };

  const totalPaid = paymentHistory.reduce((acc, item) => acc + item.paidAmt, 0);
  const totalInvoiceAmount = paymentHistory.reduce((acc, item) => acc + item.invoiceAmt, 0);
  const totalAllocated = paymentHistory.reduce((acc, item) => acc + item.allocated, 0);

  // Export handlers
  const handlePrint = () => {
    const printContents = document.getElementById('supplier-payment-table')?.innerHTML;
    if (!printContents) return;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print</title>');
      printWindow.document.write('<style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}@media print{body{margin:0;}}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write('<div style="font-size:20px;font-weight:bold;text-align:center;margin-bottom:8px;">TROPIFRUIT UK LTD</div>');
      printWindow.document.write('<div style="font-size:16px;font-weight:bold;text-align:center;margin-bottom:8px;">Supplier Payment History</div>');
      // Remove serial number and payment id columns from print
      let tableHtml = printContents
        .replace(/<th[^>]*>\s*Sl\.No\.?\s*<\/th>/gi, '')
        .replace(/<th[^>]*>\s*Payment ID\s*<\/th>/gi, '')
        .replace(/<td[^>]*>\s*\d+\s*<\/td>/gi, '') // Remove serial number cells
        .replace(/<td[^>]*>\s*\w+\s*<\/td>/gi, ''); // Remove payment id cells (if needed)
      printWindow.document.write(tableHtml);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    const companyName = 'TROPIFRUIT UK LTD';
    const pageWidth = doc.internal.pageSize.getWidth();
    const textWidth = doc.getTextWidth(companyName);
    doc.text(companyName, (pageWidth - textWidth) / 2, 16);
    doc.setFontSize(14);
    doc.text('Supplier Payment History', 14, 26);
    autoTable(doc, {
      head: [[
        //'Sl.No',
        'Payment date', 'Payment mode', /*'Payment ID',*/ 'Paid Amt', 'Supplier INV #', 'Supplier INV Date', 'Purchase INV #', 'Purchase INV Date', 'Supplier', 'Invoice Amt', 'Allocated', 'Remarks'
      ]],
      body: paymentHistory.map((item) => [
        // skip serial number and payment id
        item.paymentDate ? format(new Date(item.paymentDate), 'dd-MM-yyyy') : '',
        item.paymentMode,
        // item.paymentId, // removed
        `£${Number(item.paidAmt).toFixed(2)}`,
        item.supplierInvoiceNumber || '-',
        item.supplierInvoiceDate ? format(new Date(item.supplierInvoiceDate), 'dd-MM-yyyy') : '-',
        item.invNo,
        item.invDate ? format(new Date(item.invDate), 'dd-MM-yyyy') : '',
        item.supplier,
        item.invoiceAmt ? `£${Number(item.invoiceAmt).toFixed(2)}` : '-',
        item.allocated ? `£${Number(item.allocated).toFixed(2)}` : '-',
        item.remarks || '-'
      ]),
      startY: 32,
      columnStyles: {
        0: { cellWidth: 20 }, // Payment date
        1: { cellWidth: 20 }, // Payment mode
        2: { cellWidth: 18 }, // Paid Amt
        3: { cellWidth: 18 }, // Supplier INV #
        4: { cellWidth: 20 }, // Supplier INV Date
        5: { cellWidth: 18 }, // Purchase INV #
        6: { cellWidth: 20 }, // Purchase INV Date
        7: { cellWidth: 25 }, // Supplier
        8: { cellWidth: 18 }, // Invoice Amt
        9: { cellWidth: 18 }, // Allocated
        10: { cellWidth: 25 }, // Remarks
      },
    });
    // Add summary below table, centered
    const finalY = (doc as any).lastAutoTable.finalY || 32;
    doc.setFontSize(12);
    const summaryText = `Total Paid: £${totalPaid.toFixed(2)}   |   Total Invoice: £${totalInvoiceAmount.toFixed(2)}   |   Total Allocated: £${totalAllocated.toFixed(2)}`;
    const summaryWidth = doc.getTextWidth(summaryText);
    doc.text(summaryText, (pageWidth - summaryWidth) / 2, finalY + 14);
    doc.save('supplier-payment-history.pdf');
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(paymentHistory.map((item) => ({
      //'Sl.No': item.slNo,
      'Payment date': item.paymentDate ? format(new Date(item.paymentDate), 'dd-MM-yyyy') : '',
      'Payment mode': item.paymentMode,
      // 'Payment ID': item.paymentId,
      'Paid Amt': item.paidAmt,
      'Supplier INV #': item.supplierInvoiceNumber || '-',
      'Supplier INV Date': item.supplierInvoiceDate ? format(new Date(item.supplierInvoiceDate), 'dd-MM-yyyy') : '-',
      'Purchase INV #': item.invNo,
      'Purchase INV Date': item.invDate ? format(new Date(item.invDate), 'dd-MM-yyyy') : '',
      'Supplier': item.supplier,
      'Invoice Amt': item.invoiceAmt,
      'Allocated': item.allocated,
      'Remarks': item.remarks || '-',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier Payment History');
    XLSX.writeFile(wb, 'supplier-payment-history.xlsx');
  };

  const handleCopy = () => {
    const header = ['Payment date', 'Payment mode', 'Paid Amt', 'Supplier INV #', 'Supplier INV Date', 'Purchase INV #', 'Purchase INV Date', 'Supplier', 'Invoice Amt', 'Allocated', 'Remarks'];
    const rows = paymentHistory.map((item) => [
      item.paymentDate ? format(new Date(item.paymentDate), 'dd-MM-yyyy') : '',
      item.paymentMode,
      `£${Number(item.paidAmt).toFixed(2)}`,
      item.supplierInvoiceNumber || '-',
      item.supplierInvoiceDate ? format(new Date(item.supplierInvoiceDate), 'dd-MM-yyyy') : '-',
      item.invNo,
      item.invDate ? format(new Date(item.invDate), 'dd-MM-yyyy') : '',
      item.supplier,
      item.invoiceAmt ? `£${Number(item.invoiceAmt).toFixed(2)}` : '-',
      item.allocated ? `£${Number(item.allocated).toFixed(2)}` : '-',
      item.remarks || '-',
    ]);
    const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
    copyToClipboard(tsv);
    alert('Table copied to clipboard!');
  };

  // Generate PDF blob for email
  const generatePDFBlob = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    const companyName = 'TROPIFRUIT UK LTD';
    const pageWidth = doc.internal.pageSize.getWidth();
    const textWidth = doc.getTextWidth(companyName);
    doc.text(companyName, (pageWidth - textWidth) / 2, 16);
    doc.setFontSize(14);
    doc.text('Supplier Payment History', 14, 26);
    
    // Add date range if available
    if (fromDate && toDate) {
      doc.setFontSize(10);
      doc.text(`Date Range: ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`, 14, 34);
    }
    
    autoTable(doc, {
      head: [[
        'Payment date', 'Payment mode', 'Paid Amt', 'Supplier INV #', 'Supplier INV Date', 'Purchase INV #', 'Purchase INV Date', 'Supplier', 'Invoice Amt', 'Allocated', 'Remarks'
      ]],
      body: paymentHistory.map((item) => [
        item.paymentDate ? format(new Date(item.paymentDate), 'dd-MM-yyyy') : '',
        item.paymentMode,
        `£${Number(item.paidAmt).toFixed(2)}`,
        item.supplierInvoiceNumber || '-',
        item.supplierInvoiceDate ? format(new Date(item.supplierInvoiceDate), 'dd-MM-yyyy') : '-',
        item.invNo,
        item.invDate ? format(new Date(item.invDate), 'dd-MM-yyyy') : '',
        item.supplier,
        item.invoiceAmt ? `£${Number(item.invoiceAmt).toFixed(2)}` : '-',
        item.allocated ? `£${Number(item.allocated).toFixed(2)}` : '-',
        item.remarks || '-'
      ]),
      startY: fromDate && toDate ? 40 : 32,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [240, 240, 240], textColor: 0 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
    });
    
    // Add summary below table
    const finalY = (doc as any).lastAutoTable.finalY || 32;
    doc.setFontSize(12);
    const summaryText = `Total Paid: £${totalPaid.toFixed(2)}   |   Total Invoice: £${totalInvoiceAmount.toFixed(2)}   |   Total Allocated: £${totalAllocated.toFixed(2)}`;
    const summaryWidth = doc.getTextWidth(summaryText);
    doc.text(summaryText, (pageWidth - summaryWidth) / 2, finalY + 14);
    
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

    if (paymentHistory.length === 0) {
      toast({
        title: "No Data",
        description: "No payment history data available to send.",
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
          subject: `Supplier Payment History Report (${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''} to ${toDate ? format(toDate, 'yyyy-MM-dd') : ''})`,
          body: `Please find attached the Supplier Payment History report for the period from ${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''} to ${toDate ? format(toDate, 'yyyy-MM-dd') : ''}.\n\nTotal records: ${paymentHistory.length}\nTotal paid: £${totalPaid.toFixed(2)}\nTotal invoice amount: £${totalInvoiceAmount.toFixed(2)}`,
          attachment: {
            filename: `supplier-payment-history-${fromDate ? format(fromDate, 'yyyy-MM-dd') : ''}-to-${toDate ? format(toDate, 'yyyy-MM-dd') : ''}.pdf`,
            content: base64PDF,
            contentType: 'application/pdf'
          }
        };
        
        await apiRequest('POST', '/api/send-email', emailData);
        toast({
          title: "Email Sent",
          description: `Supplier payment history sent successfully to ${emailList.length} email(s)`,
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

  if (isError) {
    toast({
      title: "Error",
      description: (error as any)?.message || "Failed to fetch payment history.",
      variant: "destructive",
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Filter Section */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">All Suppliers</label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliersLoading ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      suppliers.map(supplier => (
                        <SelectItem key={supplier.id} value={String(supplier.id)}>
                          {supplier.supplier_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <DateRangeFilter
                from={fromDate}
                to={toDate}
                onFromChange={setFromDate}
                onToChange={setToDate}
                fromLabel="From:"
                toLabel="To:"
                dateFormat="yyyy-MM-dd"
              />

              <div>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmit}>
                  Submit
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table Section */}
        <Card>
          <CardContent className="p-6">
           <div className="flex items-center justify-between mb-4">
             <div className="flex gap-2">
               <Button variant="outline" onClick={handlePrint}>Print</Button>
               <Button variant="outline" onClick={handlePDF}>PDF</Button>
               <Button variant="outline" onClick={handleExcel}>Excel</Button>
               <Button variant="outline" onClick={handleCopy}>Copy</Button>
             </div>
             
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
            {/* Responsive Table Container */}
            <div className="overflow-x-auto" id="supplier-payment-table">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[120px]">Payment date</TableHead>
                    <TableHead className="text-center min-w-[120px]">Payment mode</TableHead>
                    <TableHead className="text-center min-w-[100px]">Paid Amt</TableHead>
                    <TableHead className="text-center min-w-[120px]">Supplier INV #</TableHead>
                    <TableHead className="text-center min-w-[120px]">Supplier INV Date</TableHead>
                    <TableHead className="text-center min-w-[80px]">Purchase INV #</TableHead>
                    <TableHead className="text-center min-w-[80px]">Purchase INV Date</TableHead>
                    <TableHead className="text-center min-w-[120px]">Supplier</TableHead>
                    <TableHead className="text-center min-w-[120px]">Invoice Amt</TableHead>
                    <TableHead className="text-center min-w-[100px]">Allocated</TableHead>
                    <TableHead className="text-center min-w-[120px]">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyLoading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : paymentHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">No data found.</TableCell>
                    </TableRow>
                  ) : (
                    paymentHistory.map(item => (
                      <TableRow key={item.slNo}>
                        <TableCell className="text-center">{item.paymentDate ? format(new Date(item.paymentDate), "dd-MM-yyyy") : ""}</TableCell>
                        <TableCell className="text-center">{item.paymentMode}</TableCell>
                        <TableCell className="text-center">£{item.paidAmt.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{item.supplierInvoiceNumber || "-"}</TableCell>
                        <TableCell className="text-center">{item.supplierInvoiceDate ? format(new Date(item.supplierInvoiceDate), "dd-MM-yyyy") : "-"}</TableCell>
                        <TableCell className="text-center">{item.invNo}</TableCell>
                        <TableCell className="text-center">{item.invDate ? format(new Date(item.invDate), "dd-MM-yyyy") : ""}</TableCell>
                        <TableCell className="text-left">{item.supplier}</TableCell>
                        <TableCell className="text-center">£{item.invoiceAmt.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{item.allocated.toFixed(2)}</TableCell>
                        <TableCell className="text-left">{item.remarks}</TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="bg-blue-100 font-semibold">
                    <TableCell colSpan={2} className="text-center">TOTAL</TableCell>
                    <TableCell className="text-center">£{totalPaid.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center">£{totalInvoiceAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{totalAllocated.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
              <div className="text-sm text-gray-600">
                Showing 1 to {paymentHistory.length} of {paymentHistory.length} entries
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Previous</span>
                <Button variant="outline" size="sm" disabled>1</Button>
                <span className="text-sm">Next</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
