import { useState, useEffect, useRef } from "react";
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
import { CalendarIcon, ClipboardCheck, FileText, Download, Copy, Printer, Search, Check, Loader2, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { cn, formatQuantity } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StockItem {
  id: number;
  slNo: number;
  productDescription: string;
  os: number;
  ns: number;
  sales: number;
  crtn: number;
  dmps: number;
  srtn: number;
  stock: number;
  clStock: number;
  result: string;
  status: 'correct' | 'short' | 'excess';
  productType: 'regular' | 'non';
}

export default function StockCheck() {
  // Initialize with current date, will be updated when businessDate loads
  const [osDate, setOsDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  
  // Track if dates were manually changed
  const osDateManuallyChanged = useRef(false);
  const toDateManuallyChanged = useRef(false);
    
  // Get business date with formatting utilities
  const { 
    businessDate, 
    isLoading: isLoadingBusinessDate, 
    formatForApi 
  } = useBusinessDate();
  
  const [stockFilter, setStockFilter] = useState("Show All");
  const [searchTerm, setSearchTerm] = useState("");
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [showZeroEntries, setShowZeroEntries] = useState(true);
  const { toast } = useToast();
  const tableRef = useRef<HTMLDivElement>(null);
  const [, setLocation] = useLocation();
  
  // Update dates when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      try {
        // Only update osDate if it hasn't been manually changed
        if (!osDateManuallyChanged.current && (!osDate || osDate.getTime() !== businessDate.getTime())) {
          setOsDate(new Date(businessDate));
        }
        // Only update toDate if it hasn't been manually changed
        if (!toDateManuallyChanged.current && (!toDate || toDate.getTime() !== businessDate.getTime())) {
          setToDate(new Date(businessDate));
        }
      } catch (error) {
        console.error('Error processing business date:', error);
      }
    }
  }, [businessDate, isLoadingBusinessDate]);

  // Navigation handlers for clickable columns
  const handleNewStockClick = (item: StockItem) => {
    if (item.ns === 0) return; // Don't navigate if no new stock
    
    const fromDateStr = format(osDate, "yyyy-MM-dd");
    const toDateStr = format(toDate, "yyyy-MM-dd");
    const productType = item.productType === 'regular' ? 'regular' : 'non';
    
    // Navigate to product purchase history with date range and product info
    setLocation(`/reports/product-purchase-history?productId=${item.id}&productType=${productType}&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(item.productDescription)}`);
  };

  const handleSalesClick = (item: StockItem) => {
    if (item.sales === 0) return; // Don't navigate if no sales
    
    const fromDateStr = format(osDate, "yyyy-MM-dd");
    const toDateStr = format(toDate, "yyyy-MM-dd");
    const productType = item.productType === 'regular' ? 'regular' : 'non';
    
    // Navigate to product sales history with date range and product info
    setLocation(`/reports/product-sales-history?productId=${item.id}&productType=${productType}&fromDate=${fromDateStr}&toDate=${toDateStr}&productName=${encodeURIComponent(item.productDescription)}`);
  };

  // Query for stock check data
  const { data: stockData = [], isLoading, error, refetch } = useQuery<StockItem[]>({
    queryKey: ["stock-check", formatForApi(osDate), formatForApi(toDate), searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams({
        fromDate: formatForApi(osDate) || format(osDate, "yyyy-MM-dd"),
        toDate: formatForApi(toDate) || format(toDate, "yyyy-MM-dd"),
        search: searchTerm
      });
      return apiRequest("GET", `/api/reports/stock-check?${params}`);
    },
    enabled: false, // Don't auto-fetch, wait for user to click search
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 3
  });

  const handleSearch = () => {
    refetch();
  };

  const handleExport = (format: string) => {
    toast({
      title: "Export",
      description: `Exporting to ${format} format...`,
    });
  };

  // Handle date changes
  const handleOsDateChange = (date: Date | undefined) => {
    if (date) {
      osDateManuallyChanged.current = true;
      setOsDate(date);
    }
  };

  const handleToDateChange = (date: Date | undefined) => {
    if (date) {
      toDateManuallyChanged.current = true;
      setToDate(date);
    }
  };
  
  // Format date for display
  const formatDateForDisplay = (date: Date | string | null | undefined, formatStr = 'dd/MM/yyyy') => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      return isNaN(d.getTime()) ? '' : format(d, formatStr);
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const filteredData = stockData.filter(item => {
    // First apply stock status filter
    let passesStatusFilter = true;
    if (stockFilter === "Short") passesStatusFilter = item.status === 'short';
    else if (stockFilter === "Excess") passesStatusFilter = item.status === 'excess';
    
    // Then apply zero entries filter
    let passesZeroFilter = true;
    if (!showZeroEntries) {
      // Hide items where all values are zero (no activity)
      const hasActivity = item.os > 0 || item.ns > 0 || item.sales > 0 || 
                         item.crtn > 0 || item.dmps > 0 || item.srtn > 0 || 
                         item.stock > 0 || item.clStock > 0;
      passesZeroFilter = hasActivity;
    }
    
    return passesStatusFilter && passesZeroFilter;
  });

  const totals = {
    os: filteredData.reduce((sum, item) => sum + item.os, 0),
    ns: filteredData.reduce((sum, item) => sum + item.ns, 0),
    sales: filteredData.reduce((sum, item) => sum + item.sales, 0),
    crtn: filteredData.reduce((sum, item) => sum + item.crtn, 0),
    dmps: filteredData.reduce((sum, item) => sum + item.dmps, 0),
    srtn: filteredData.reduce((sum, item) => sum + item.srtn, 0),
    stock: filteredData.reduce((sum, item) => sum + item.stock, 0),
    clStock: filteredData.reduce((sum, item) => sum + item.clStock, 0)
  };

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Stock Check</title>');
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
      printWindow.document.write('<h3>STOCK CHECK</h3>');
      printWindow.document.write(`<p>Period: ${format(osDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}</p>`);
      printWindow.document.write('</div>');
      
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      const headers = ['Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result'];
      headers.forEach(h => {
        printWindow.document.write(`<th>${h}</th>`);
      });
      printWindow.document.write('</tr></thead><tbody>');
      filteredData.forEach(item => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${item.slNo}</td>`);
        printWindow.document.write(`<td>${item.productDescription}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.os)}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.ns)}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.sales)}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.crtn)}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.dmps)}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.srtn)}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.stock)}</td>`);
        printWindow.document.write(`<td>${formatQuantity(item.clStock)}</td>`);
        printWindow.document.write(`<td>${item.result}</td>`);
        printWindow.document.write('</tr>');
      });
      printWindow.document.write('</tbody></table>');
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  const handleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.map((item: StockItem) => ({
      'Sl.No': item.slNo,
      'Product Description': item.productDescription,
      'O.S': item.os,
      'N.S': item.ns,
      'Sales': item.sales,
      'C.RTN': item.crtn,
      'Dmps': item.dmps,
      'S.RTN': item.srtn,
      'Stock': item.stock,
      'Cl.Stock': item.clStock,
      'Result': item.result
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Check');
    XLSX.writeFile(wb, 'stock-check.xlsx');
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
    doc.text('STOCK CHECK', 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.text(`Period: ${format(osDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
    yPosition += 10;
    
    // Add table
    autoTable(doc, {
      head: [[
        'Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result'
      ]],
      body: filteredData.map((item: StockItem) => [
        item.slNo,
        item.productDescription,
        item.os,
        item.ns,
        item.sales,
        item.crtn,
        item.dmps,
        item.srtn,
        item.stock,
        item.clStock,
        item.result
      ]),
      startY: yPosition,
      styles: {
        fontSize: 7,
        cellPadding: 1
      },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 40 },
        2: { cellWidth: 12 },
        3: { cellWidth: 12 },
        4: { cellWidth: 12 },
        5: { cellWidth: 12 },
        6: { cellWidth: 12 },
        7: { cellWidth: 12 },
        8: { cellWidth: 12 },
        9: { cellWidth: 12 },
        10: { cellWidth: 12 }
      }
    });
    
    // Add clean summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || yPosition;
    doc.setFontSize(10);
    doc.text(`Date Range: ${format(osDate, 'dd/MM/yyyy')} to ${format(toDate, 'dd/MM/yyyy')} Totals - O.S: ${formatQuantity(totals.os)} N.S: ${formatQuantity(totals.ns)} Sales: ${formatQuantity(totals.sales)}`, 14, finalY + 10);
    doc.text(`Stock: ${formatQuantity(totals.stock)} Cl.Stock: ${formatQuantity(totals.clStock)}`, 14, finalY + 18);
    
    doc.save(`stock-check-${format(osDate, "yyyyMMdd")}-${format(toDate, "yyyyMMdd")}.pdf`);
  };

  const handleCopy = () => {
    const header = ['Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result'];
    const rows = filteredData.map((item: StockItem) => [
      item.slNo,
      item.productDescription,
      item.os,
      item.ns,
      item.sales,
      item.crtn,
      item.dmps,
      item.srtn,
      item.stock,
      item.clStock,
      item.result
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
    doc.text('STOCK CHECK', 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.text(`Period: ${format(osDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
    yPosition += 10;
    
    // Add table
    autoTable(doc, {
      head: [[
        'Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result'
      ]],
      body: filteredData.map((item: StockItem) => [
        item.slNo,
        item.productDescription,
        item.os,
        item.ns,
        item.sales,
        item.crtn,
        item.dmps,
        item.srtn,
        item.stock,
        item.clStock,
        item.result
      ]),
      startY: yPosition,
      styles: {
        fontSize: 7,
        cellPadding: 1
      },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 40 },
        2: { cellWidth: 12 },
        3: { cellWidth: 12 },
        4: { cellWidth: 12 },
        5: { cellWidth: 12 },
        6: { cellWidth: 12 },
        7: { cellWidth: 12 },
        8: { cellWidth: 12 },
        9: { cellWidth: 12 },
        10: { cellWidth: 12 }
      }
    });
    
    // Add clean summary at the bottom (same format as regular PDF)
    const finalY = (doc as any).lastAutoTable.finalY || yPosition;
    doc.setFontSize(10);
    doc.text(`Date Range: ${format(osDate, 'dd/MM/yyyy')} to ${format(toDate, 'dd/MM/yyyy')} Totals - O.S: ${formatQuantity(totals.os)} N.S: ${formatQuantity(totals.ns)} Sales: ${formatQuantity(totals.sales)}`, 14, finalY + 10);
    doc.text(`Stock: ${formatQuantity(totals.stock)} Cl.Stock: ${formatQuantity(totals.clStock)}`, 14, finalY + 18);
    
    return doc.output('blob');
  };

  // Fetch company details for PDF header
  const { data: companyDetails }: { data: any } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

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

    if (filteredData.length === 0) {
      toast({
        title: "No Data",
        description: "No stock check data available to send. Please search for data first.",
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
        try {
          const base64data = reader.result as string;
          const base64PDF = base64data.split(',')[1]; // Remove data:application/pdf;base64, prefix
          
          // Send email with PDF attachment
          const emailData = {
            to: emailList,
            subject: `Stock Check Report - ${format(osDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`,
            body: `Dear Recipient,\n\nPlease find attached the Stock Check report for the period from ${format(osDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}.\n\nThis report contains detailed stock analysis including:\n- Opening Stock (O.S) and New Stock (N.S)\n- Sales figures and Customer Returns (C.RTN)\n- Dumps and Supplier Returns (S.RTN)\n- Current Stock and Closing Stock (Cl.Stock)\n- Stock variance analysis (Short/Excess/Correct)\n\nSummary Totals:\n- Total O.S: ${totals.os}\n- Total N.S: ${totals.ns}\n- Total Sales: ${totals.sales}\n- Total C.RTN: ${totals.crtn}\n- Total Dmps: ${totals.dmps}\n- Total S.RTN: ${totals.srtn}\n- Total Stock: ${totals.stock}\n- Total Cl.Stock: ${totals.clStock}\n\nFilter Applied: ${stockFilter}\n\nBest regards,\n${companyDetails?.name || 'Stock Management Team'}`,
            attachment: {
              filename: `stock-check-${format(osDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.pdf`,
              content: base64PDF,
              contentType: 'application/pdf'
            }
          };
          
          const response = await apiRequest('POST', '/api/send-email', emailData);
          
          if (response.message) {
            toast({
              title: "Email Sent Successfully",
              description: `✅ ${response.message}`,
            });
            if (response.warnings) {
              toast({
                title: "Warning",
                description: `⚠️ ${response.warnings}`,
                variant: "destructive",
              });
            }
          } else {
            toast({
              title: "Email Sent",
              description: `📧 Stock check report sent successfully to ${emailList.length} email(s)`,
            });
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
          
          toast({
            title: "Email Failed",
            description: `❌ ${errorMessage}`,
            variant: "destructive",
          });
        } finally {
          // Always reset the sending state
          setIsEmailSending(false);
        }
      };
      
      reader.onerror = () => {
        toast({
          title: "PDF Error",
          description: "❌ Failed to process PDF file. Please try again.",
          variant: "destructive",
        });
        setIsEmailSending(false);
      };
      
      reader.readAsDataURL(pdfBlob);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast({
        title: "PDF Generation Failed",
        description: "❌ Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
      setIsEmailSending(false);
    }
  };

  return (
    <PageLayout title="Stock Check" breadcrumb="Daily Report > Stock Check">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck size={20} />
                Stock Check
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div>
                <Label>OS Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !osDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {osDate ? format(osDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={osDate}
                      onSelect={handleOsDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
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
                      onSelect={handleToDateChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Select value={stockFilter} onValueChange={setStockFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Show All">Show All</SelectItem>
                    <SelectItem value="Short">Short</SelectItem>
                    <SelectItem value="Excess">Excess</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showZeroEntries"
                  checked={showZeroEntries}
                  onCheckedChange={(checked) => setShowZeroEntries(checked as boolean)}
                />
                <Label htmlFor="showZeroEntries" className="text-sm font-medium cursor-pointer">
                  Show Zero Entries
                </Label>
              </div>
              
              <div>
                <Button 
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  onClick={handleSearch}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Search"
                  )}
                </Button>
              </div>
              
              <div className="flex gap-2">
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="text-red-600">
                <h3 className="font-medium">Error Loading Stock Check Data</h3>
                <p className="text-sm mt-1">
                  {error instanceof Error ? error.message : "Failed to load stock check data"}
                </p>
                <Button 
                  onClick={() => refetch()}
                  className="mt-2"
                  size="sm"
                >
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stock Table */}
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
                
                {/* Email Section */}
                <div className="flex items-center gap-2 ml-4">
                  <Input
                    placeholder="Enter emails (comma separated)"
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    className="w-64"
                    disabled={isEmailSending}
                    size="sm"
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
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search:"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-48"
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto" ref={tableRef}>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <span className="ml-2">Loading stock check data...</span>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {stockData.length === 0 ? 
                    "No stock check data available. Please select dates and click Search." : 
                    "No products match your current filter."
                  }
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sl.No</TableHead>
                      <TableHead>Product Description</TableHead>
                      <TableHead className="text-center">O.S</TableHead>
                      <TableHead className="text-center">N.S</TableHead>
                      <TableHead className="text-center">Sales</TableHead>
                      <TableHead className="text-center">C.RTN</TableHead>
                      <TableHead className="text-center">Dmps</TableHead>
                      <TableHead className="text-center">S.RTN</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="text-center">Cl.Stock</TableHead>
                      <TableHead className="text-center">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.slNo}</TableCell>
                        <TableCell>
                          <div>
                            {item.productDescription}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{formatQuantity(item.os)}</TableCell>
                        <TableCell 
                          className={`text-center ${item.ns > 0 ? 'cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition-colors' : ''}`}
                          onClick={() => handleNewStockClick(item)}
                          title={item.ns > 0 ? "Click to view purchase history" : ""}
                        >
                          <span className={item.ns > 0 ? 'underline decoration-dotted' : ''}>
                            {formatQuantity(item.ns)}
                          </span>
                        </TableCell>
                        <TableCell 
                          className={`text-center ${item.sales > 0 ? 'cursor-pointer hover:bg-blue-50 hover:text-blue-600 transition-colors' : ''}`}
                          onClick={() => handleSalesClick(item)}
                          title={item.sales > 0 ? "Click to view sales history" : ""}
                        >
                          <span className={item.sales > 0 ? 'underline decoration-dotted' : ''}>
                            {formatQuantity(item.sales)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">{formatQuantity(item.crtn)}</TableCell>
                        <TableCell className="text-center">{formatQuantity(item.dmps)}</TableCell>
                        <TableCell className="text-center">{formatQuantity(item.srtn)}</TableCell>
                        <TableCell className="text-center">{formatQuantity(item.stock)}</TableCell>
                        <TableCell className="text-center">{formatQuantity(item.clStock)}</TableCell>
                        <TableCell className="text-center">
                          {item.result === "✓" ? (
                            <Check size={16} className="mx-auto text-green-600" />
                          ) : (
                            <span className={item.status === 'short' ? "text-red-600" : "text-orange-600"}>
                              {item.result}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    
                    {/* Total Row */}
                    <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                      <TableCell></TableCell>
                      <TableCell className="font-bold">TOTAL</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(totals.os)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(totals.ns)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(totals.sales)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(totals.crtn)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(totals.dmps)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(totals.srtn)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(totals.stock)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(totals.clStock)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
            {/* Summary below table, styled for print and screen */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mt-6 p-4 bg-gray-50 rounded-lg border print:mt-6 print:p-4 print:bg-white print:border print:rounded-lg print:flex-row print:items-center print:gap-x-8 print:gap-y-2">
              <div className="flex items-center font-semibold mr-2">Date Range:</div>
              <div className="mr-6">{format(osDate, 'yyyy-MM-dd')} to {format(toDate, 'yyyy-MM-dd')}</div>
              <div className="flex items-center font-semibold mr-2">Totals - O.S:</div>
              <div className="mr-4">{formatQuantity(totals.os)}</div>
              <div className="flex items-center font-semibold mr-2">N.S:</div>
              <div className="mr-4">{formatQuantity(totals.ns)}</div>
              <div className="flex items-center font-semibold mr-2">Sales:</div>
              <div className="mr-4">{formatQuantity(totals.sales)}</div>
              <div className="flex items-center font-semibold mr-2">Stock:</div>
              <div className="mr-4">{formatQuantity(totals.stock)}</div>
              <div className="flex items-center font-semibold mr-2">Cl.Stock:</div>
              <div>{formatQuantity(totals.clStock)}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}