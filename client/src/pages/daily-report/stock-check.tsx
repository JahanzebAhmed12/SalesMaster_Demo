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
import { DateRangeFilter } from "@/components/ui/date-range-filter";
import { ClipboardCheck, FileText, Download, Copy, Printer, Search, Check, Loader2, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { cn, formatQuantity } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useCompanyDetails } from "@/hooks/use-company-details";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { copyToClipboard, printHtmlTable } from "@/lib/export-utils";

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
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
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

  // Calculate totals from all data (for summary)
  const totals = {
    os: stockData.reduce((sum, item) => sum + (Number(item.os) || 0), 0),
    ns: stockData.reduce((sum, item) => sum + (Number(item.ns) || 0), 0),
    sales: stockData.reduce((sum, item) => sum + (Number(item.sales) || 0), 0),
    crtn: stockData.reduce((sum, item) => sum + (Number(item.crtn) || 0), 0),
    dmps: stockData.reduce((sum, item) => sum + (Number(item.dmps) || 0), 0),
    srtn: stockData.reduce((sum, item) => sum + (Number(item.srtn) || 0), 0),
    stock: stockData.reduce((sum, item) => sum + (Number(item.stock) || 0), 0),
    clStock: stockData.reduce((sum, item) => sum + (Number(item.clStock) || 0), 0)
  };

  // Calculate filtered totals (for table display)
  const filteredTotals = {
    os: filteredData.reduce((sum, item) => sum + (Number(item.os) || 0), 0),
    ns: filteredData.reduce((sum, item) => sum + (Number(item.ns) || 0), 0),
    sales: filteredData.reduce((sum, item) => sum + (Number(item.sales) || 0), 0),
    crtn: filteredData.reduce((sum, item) => sum + (Number(item.crtn) || 0), 0),
    dmps: filteredData.reduce((sum, item) => sum + (Number(item.dmps) || 0), 0),
    srtn: filteredData.reduce((sum, item) => sum + (Number(item.srtn) || 0), 0),
    stock: filteredData.reduce((sum, item) => sum + (Number(item.stock) || 0), 0),
    clStock: filteredData.reduce((sum, item) => sum + (Number(item.clStock) || 0), 0)
  };

  // Export handlers
  const handlePrint = () => {
    let html = '';
    
    // Add company details header following the specific structure
    html += '<div class="company-details">';
    if (companyDetails) {
      // Company name
      html += `<h2>${companyDetails.companyName || ''}</h2>`;
      
      // Email
      if (companyDetails.email) {
        html += `<p>${companyDetails.email}</p>`;
      }
      
      // Bank details
      if (companyDetails.bankDetails) {
        html += `<p>${companyDetails.bankDetails}</p>`;
      }
      
      // VAT and Registration info
      let regInfo = [];
      if (companyDetails.vatNo) regInfo.push(`VAT No: ${companyDetails.vatNo}`);
      if (companyDetails.compRegNo) regInfo.push(`Reg No: ${companyDetails.compRegNo}`);
      if (regInfo.length > 0) html += `<p>${regInfo.join(' | ')}</p>`;
    }
    html += '</div>';
    
    // Add report title
    html += '<div class="header">';
    html += '<h3>STOCK CHECK</h3>';
    html += `<p>Period: ${format(osDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}</p>`;
    html += '</div>';
    
    // Add table
    html += '<table>';
    html += '<thead><tr>';
    const headers = ['Sl.No', 'Product Description', 'O.S', 'N.S', 'Sales', 'C.RTN', 'Dmps', 'S.RTN', 'Stock', 'Cl.Stock', 'Result'];
    headers.forEach(h => {
      html += `<th>${h}</th>`;
    });
    html += '</tr></thead><tbody>';
    filteredData.forEach(item => {
      html += '<tr>';
      html += `<td>${item.slNo}</td>`;
      html += `<td>${item.productDescription}</td>`;
      html += `<td>${formatQuantity(item.os)}</td>`;
      html += `<td>${formatQuantity(item.ns)}</td>`;
      html += `<td>${formatQuantity(item.sales)}</td>`;
      html += `<td>${formatQuantity(item.crtn)}</td>`;
      html += `<td>${formatQuantity(item.dmps)}</td>`;
      html += `<td>${formatQuantity(item.srtn)}</td>`;
      html += `<td>${formatQuantity(item.stock)}</td>`;
      html += `<td>${formatQuantity(item.clStock)}</td>`;
      html += `<td>${item.result}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table>';
    printHtmlTable('Stock Check', html, { autoClose: true });
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
        fontSize: 6,
        cellPadding: 0.5
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 38 },
        2: { cellWidth: 10 },
        3: { cellWidth: 10 },
        4: { cellWidth: 10 },
        5: { cellWidth: 10 },
        6: { cellWidth: 10 },
        7: { cellWidth: 10 },
        8: { cellWidth: 10 },
        9: { cellWidth: 10 },
        10: { cellWidth: 10 }
      }
    });
    
    // Add clean summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || yPosition;
    doc.setFontSize(8);
    doc.text(`Date Range: ${format(osDate, 'dd/MM/yyyy')} to ${format(toDate, 'dd/MM/yyyy')} | Filter: ${stockFilter}`, 14, finalY + 6);
    doc.text(`All Data Totals - O.S: ${formatQuantity(totals.os)} N.S: ${formatQuantity(totals.ns)} Sales: ${formatQuantity(totals.sales)} Stock: ${formatQuantity(totals.stock)} Cl.Stock: ${formatQuantity(totals.clStock)}`, 14, finalY + 11);
    if (stockFilter !== "Show All" || !showZeroEntries) {
      doc.text(`Displayed Totals - O.S: ${formatQuantity(filteredTotals.os)} N.S: ${formatQuantity(filteredTotals.ns)} Sales: ${formatQuantity(filteredTotals.sales)} Stock: ${formatQuantity(filteredTotals.stock)} Cl.Stock: ${formatQuantity(filteredTotals.clStock)}`, 14, finalY + 16);
    }
    
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
    copyToClipboard(tsv);
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
        fontSize: 6,
        cellPadding: 0.5
      },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 38 },
        2: { cellWidth: 10 },
        3: { cellWidth: 10 },
        4: { cellWidth: 10 },
        5: { cellWidth: 10 },
        6: { cellWidth: 10 },
        7: { cellWidth: 10 },
        8: { cellWidth: 10 },
        9: { cellWidth: 10 },
        10: { cellWidth: 10 }
      }
    });
    
    // Add clean summary at the bottom (same format as regular PDF)
    const finalY = (doc as any).lastAutoTable.finalY || yPosition;
    doc.setFontSize(8);
    doc.text(`Date Range: ${format(osDate, 'dd/MM/yyyy')} to ${format(toDate, 'dd/MM/yyyy')} | Filter: ${stockFilter}`, 14, finalY + 6);
    doc.text(`All Data Totals - O.S: ${formatQuantity(totals.os)} N.S: ${formatQuantity(totals.ns)} Sales: ${formatQuantity(totals.sales)} Stock: ${formatQuantity(totals.stock)} Cl.Stock: ${formatQuantity(totals.clStock)}`, 14, finalY + 11);
    if (stockFilter !== "Show All" || !showZeroEntries) {
      doc.text(`Displayed Totals - O.S: ${formatQuantity(filteredTotals.os)} N.S: ${formatQuantity(filteredTotals.ns)} Sales: ${formatQuantity(filteredTotals.sales)} Stock: ${formatQuantity(filteredTotals.stock)} Cl.Stock: ${formatQuantity(filteredTotals.clStock)}`, 14, finalY + 16);
    }
    
    return doc.output('blob');
  };

  // Fetch company details for PDF header
  const { companyDetails } = useCompanyDetails();

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
            body: `Dear Recipient,\n\nPlease find attached the Stock Check report for the period from ${format(osDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}.\n\nThis report contains detailed stock analysis including:\n- Opening Stock (O.S) and New Stock (N.S)\n- Sales figures and Customer Returns (C.RTN)\n- Dumps and Supplier Returns (S.RTN)\n- Current Stock and Closing Stock (Cl.Stock)\n- Stock variance analysis (Short/Excess/Correct)\n\nAll Data Summary Totals:\n- Total O.S: ${formatQuantity(totals.os)}\n- Total N.S: ${formatQuantity(totals.ns)}\n- Total Sales: ${formatQuantity(totals.sales)}\n- Total C.RTN: ${formatQuantity(totals.crtn)}\n- Total Dmps: ${formatQuantity(totals.dmps)}\n- Total S.RTN: ${formatQuantity(totals.srtn)}\n- Total Stock: ${formatQuantity(totals.stock)}\n- Total Cl.Stock: ${formatQuantity(totals.clStock)}\n\nFilter Applied: ${stockFilter}${!showZeroEntries ? ' (Zero entries hidden)' : ''}\n${(stockFilter !== "Show All" || !showZeroEntries) ? `\nDisplayed Data Totals:\n- Displayed O.S: ${formatQuantity(filteredTotals.os)}\n- Displayed N.S: ${formatQuantity(filteredTotals.ns)}\n- Displayed Sales: ${formatQuantity(filteredTotals.sales)}\n- Displayed Stock: ${formatQuantity(filteredTotals.stock)}\n- Displayed Cl.Stock: ${formatQuantity(filteredTotals.clStock)}` : ''}\n\nBest regards,\n${companyDetails?.companyName || 'Stock Management Team'}`,
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
              description: ` ${response.message}`,
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
              <DateRangeFilter
                from={osDate}
                to={toDate}
                onFromChange={handleOsDateChange}
                onToChange={handleToDateChange}
                fromLabel="OS Date:"
                toLabel="To Date:"
                fromManuallyChanged={osDateManuallyChanged}
                toManuallyChanged={toDateManuallyChanged}
              />
              
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
                      <TableRow
                        key={item.id}
                        className={`hover:bg-blue-50 cursor-pointer transition-colors ${selectedRowId === item.id ? 'bg-blue-100' : ''}`}
                        onClick={() => setSelectedRowId(selectedRowId === item.id ? null : item.id)}
                      >
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
                    
                    {/* Total Row - shows totals for filtered/displayed data */}
                    <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                      <TableCell></TableCell>
                      <TableCell className="font-bold">TOTAL</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(filteredTotals.os)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(filteredTotals.ns)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(filteredTotals.sales)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(filteredTotals.crtn)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(filteredTotals.dmps)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(filteredTotals.srtn)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(filteredTotals.stock)}</TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(filteredTotals.clStock)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
            {/* Summary below table, styled for print and screen */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border space-y-3">
              {/* Date Range */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center font-semibold">Date Range:</div>
                <div>{format(osDate, 'yyyy-MM-dd')} to {format(toDate, 'yyyy-MM-dd')}</div>
                <div className="flex items-center font-semibold ml-4">Filter:</div>
                <div>{stockFilter}</div>
                {!showZeroEntries && <div className="text-sm text-gray-600">(Zero entries hidden)</div>}
              </div>
              
              {/* All Data Totals */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex items-center font-semibold text-blue-600">All Data Totals:</div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">O.S:</span>
                  <span>{formatQuantity(totals.os)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">N.S:</span>
                  <span>{formatQuantity(totals.ns)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">Sales:</span>
                  <span>{formatQuantity(totals.sales)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">Stock:</span>
                  <span>{formatQuantity(totals.stock)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-medium">Cl.Stock:</span>
                  <span>{formatQuantity(totals.clStock)}</span>
                </div>
              </div>
              
              {/* Filtered Data Totals (only show if different from all data) */}
              {(stockFilter !== "Show All" || !showZeroEntries) && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-center font-semibold text-green-600">Displayed Totals:</div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">O.S:</span>
                    <span>{formatQuantity(filteredTotals.os)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">N.S:</span>
                    <span>{formatQuantity(filteredTotals.ns)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Sales:</span>
                    <span>{formatQuantity(filteredTotals.sales)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Stock:</span>
                    <span>{formatQuantity(filteredTotals.stock)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-medium">Cl.Stock:</span>
                    <span>{formatQuantity(filteredTotals.clStock)}</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}