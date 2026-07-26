import { useState, useRef, useEffect, useMemo } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, TrendingUp, FileText, Download, Copy, Printer, Search, Mail } from "lucide-react";
import { format } from "date-fns";
import { cn, formatQuantity } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useCompanyDetails } from "@/hooks/use-company-details";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { copyToClipboard, printHtmlTable } from "@/lib/export-utils";
import { DateRangeFilter } from "@/components/ui/date-range-filter";

interface ProfitLossItem {
  id: number;
  slNo: number;
  productDescription: string;
  totalQuantity: number;
  avgPurchase: number;
  avgSales: number;
  avgProfit: number;
  totPurchase: number;
  totSales: number;
  totProfit: number;
  percentProfit: number;
  isLoss?: boolean;
}

export default function ProfitLoss() {
  // Initialize with current date, will be updated when businessDate loads
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());

  // Track if dates were manually changed
  const fromDateManuallyChanged = useRef(false);
  const toDateManuallyChanged = useRef(false);

  // Get business date with formatting utilities
  const {
    businessDate,
    isLoading: isLoadingBusinessDate,
    formatForApi
  } = useBusinessDate();

  const [searchTerm, setSearchTerm] = useState("");
  const [trigger, setTrigger] = useState(0); // for manual search
  const tableRef = useRef<HTMLDivElement>(null);
  const [showProfit, setShowProfit] = useState(true);
  const [emails, setEmails] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);

  // Update dates when business date changes, but only if not manually changed
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      try {
        const businessDateObj = new Date(businessDate);
        if (isNaN(businessDateObj.getTime())) {
          console.error('Invalid business date:', businessDate);
          return;
        }

        // Only update fromDate if it hasn't been manually changed
        if (!fromDateManuallyChanged.current) {
          setFromDate(businessDateObj);
        }
        // Only update toDate if it hasn't been manually changed
        if (!toDateManuallyChanged.current) {
          setToDate(businessDateObj);
        }
      } catch (error) {
        console.error('Error processing business date:', error);
      }
    }
  }, [businessDate, isLoadingBusinessDate]);

  // Memoize formatted dates to prevent unnecessary re-renders
  const formattedFromDate = useMemo(() => fromDate ? format(fromDate, "yyyy-MM-dd") : "", [fromDate]);
  const formattedToDate = useMemo(() => toDate ? format(toDate, "yyyy-MM-dd") : "", [toDate]);

  // Fetch profit/loss data from backend
  const { data: profitData = [], isLoading, isError } = useQuery({
    queryKey: ["profit-loss", formattedFromDate, formattedToDate, searchTerm, trigger],
    queryFn: async () => {
      console.log('Profit-loss query running with:', { formattedFromDate, formattedToDate, searchTerm, trigger });
      const params = new URLSearchParams({
        fromDate: formattedFromDate,
        toDate: formattedToDate,
        search: searchTerm,
      });
      return apiRequest("GET", `/api/reports/profit-loss?${params.toString()}`);
    },
    enabled: !!fromDate && !!toDate,
    staleTime: 5 * 60 * 1000, // 5 minutes before data is considered stale
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });

  const totals = {
    totalQuantity: profitData.reduce((sum: number, item: any) => sum + (Number(item.totalQuantity) || 0), 0),
    totPurchase: profitData.reduce((sum: number, item: any) => sum + (Number(item.totPurchaseExCompany) || 0), 0),
    totSales: profitData.reduce((sum: number, item: any) => sum + (Number(item.totSales) || 0), 0),
    totProfit: profitData.reduce((sum: number, item: any) => sum + (Number(item.totProfitExCompany) || 0), 0)
  };
  const overallProfitPercent = totals.totPurchase ? (totals.totProfit / totals.totPurchase) * 100 : 0;

  // Calculate total profit/loss
  const totalProfit = profitData.reduce((sum: number, item: ProfitLossItem) => sum + (Number(item.totProfit) || 0), 0) || 0;

  const { companyDetails } = useCompanyDetails();

  // Fetch settings once on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      const settings = await apiRequest("GET", "/api/settings");
      setShowProfit(settings.showProfit !== false);
    };
    fetchSettings();
  }, []);

  // Export handlers
  const handlePrint = () => {
    if (!tableRef.current) return;

    let html = '';

    // Add company header
    html += '<div class="company-header">';
    html += `<div class="company-name">${companyDetails?.companyName || 'TROPIFRUIT UK LTD'}</div>`;
    html += '<div class="report-title">Profit/Loss Report</div>';
    html += '</div>';

    // Add table
    html += '<table>';
    html += '<thead><tr>';
    html += '<th>Sl.No</th><th>Product Description</th><th>Total Quantity</th><th>AVG Purchase</th><th>AVG Sales</th>';
    if (showProfit) html += '<th>AVG Profit</th>';
    html += '<th>TOT Purchase</th><th>TOT Sales</th>';
    if (showProfit) html += '<th>TOT Profit</th><th>PERCENT Profit %</th>';
    html += '</tr></thead><tbody>';

    profitData.forEach((item: any) => {
      const rowClass = item.isLoss ? ' style="background-color:#fff7ed;"' : '';
      const textClass = item.isLoss ? ' style="color:#dc2626;"' : '';
      html += `<tr${rowClass}>`;
      html += `<td class="text-center">${item.slNo}</td>`;
      html += `<td>${item.productDescription}</td>`;
      html += `<td class="text-center">${formatQuantity(item.totalQuantity)}</td>`;
      html += `<td class="text-center">£${Number(item.avgPurchase).toFixed(2)}</td>`;
      html += `<td class="text-center">£${Number(item.avgSales).toFixed(2)}</td>`;
      if (showProfit) html += `<td class="text-center"${textClass}>£${Number(item.avgProfit).toFixed(2)}</td>`;
      html += `<td class="text-center">£${Number(item.totPurchase).toFixed(2)}</td>`;
      html += `<td class="text-center">£${Number(item.totSales).toFixed(2)}</td>`;
      if (showProfit) {
        html += `<td class="text-center"${textClass}>£${Number(item.totProfit).toFixed(2)}</td>`;
        html += `<td class="text-center"${textClass}>${Number(item.percentProfit).toFixed(2)}%</td>`;
      }
      html += '</tr>';
    });

    // Add totals row
    html += '<tr style="background-color:#f9f9f9;border-top:2px solid #666;">';
    html += '<td></td><td class="font-bold">TOTAL</td>';
    html += `<td class="text-center font-bold">${formatQuantity(totals.totalQuantity)}</td>`;
    html += '<td></td><td></td>';
    if (showProfit) html += '<td></td>';
    html += `<td class="text-center font-bold">£${Number(totals.totPurchase).toFixed(2)}</td>`;
    html += `<td class="text-center font-bold">£${Number(totals.totSales).toFixed(2)}</td>`;
    if (showProfit) {
      html += `<td class="text-center font-bold">£${Number(totals.totProfit).toFixed(2)}</td>`;
      html += `<td class="text-center font-bold">${Number(overallProfitPercent).toFixed(2)}%</td>`;
    }
    html += '</tr>';
    html += '</tbody></table>';

    // Add summary
    html += '<div class="summary">';
    html += `<div class="summary-row"><span class="summary-label">Date Range:</span><span>${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}</span></div>`;
    html += `<div class="summary-row"><span class="summary-label">Total Quantity:</span><span>${formatQuantity(totals.totalQuantity)}</span></div>`;
    html += `<div class="summary-row"><span class="summary-label">Total Purchase:</span><span>£${Number(totals.totPurchase).toFixed(2)}</span></div>`;
    html += `<div class="summary-row"><span class="summary-label">Total Sales:</span><span>£${Number(totals.totSales).toFixed(2)}</span></div>`;
    if (showProfit) {
      html += `<div class="summary-row"><span class="summary-label">Total Profit:</span><span>£${Number(totals.totProfit).toFixed(2)}</span></div>`;
      html += `<div class="summary-row"><span class="summary-label">Percent Profit:</span><span>${Number(overallProfitPercent).toFixed(2)}%</span></div>`;
    }
    html += '</div>';

    printHtmlTable('Profit/Loss Report', html);
  };

  const handleExcel = () => {
    if (!profitData) return;

    const excelData = profitData.map((item: ProfitLossItem) => {
      const row: any = {
        'Sl No': item.slNo,
        'Product Description': item.productDescription,
        'Total Qty': formatQuantity(item.totalQuantity),
        'Avg Purchase': Number(item.avgPurchase).toFixed(2),
        'Avg Sales': Number(item.avgSales).toFixed(2),
        'Total Purchase': Number(item.totPurchase).toFixed(2),
        'Total Sales': Number(item.totSales).toFixed(2)
      };

      if (showProfit) {
        row['Avg Profit'] = Number(item.avgProfit).toFixed(2);
        row['Total Profit'] = Number(item.totProfit).toFixed(2);
        row['Profit %'] = Number(item.percentProfit).toFixed(2);
      }

      return row;
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Profit Loss');
    XLSX.writeFile(wb, 'profit-loss-report.xlsx');
  };

  const handlePDF = () => {
    if (!profitData) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Add company header if available
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || 'Company Name', 105, 15, { align: 'center' });
      doc.setFontSize(10);
      if (companyDetails.address1) doc.text(companyDetails.address1, 105, 22, { align: 'center' });
      if (companyDetails.telephone) doc.text(`Phone: ${companyDetails.telephone}`, 105, 27, { align: 'center' });
      if (companyDetails.email) doc.text(`Email: ${companyDetails.email}`, 105, 32, { align: 'center' });
    }

    // Add title
    doc.setFontSize(14);
    doc.text('Profit/Loss Report', 105, companyDetails ? 42 : 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Date Range: ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`, 105, companyDetails ? 48 : 21, { align: 'center' });

    // Prepare table headers and body based on showProfit setting
    const headers = ['Sl No', 'Product Description', 'Total Qty', 'Avg Purchase', 'Avg Sales'];
    if (showProfit) {
      headers.push('Avg Profit');
    }
    headers.push('Total Purchase', 'Total Sales');
    if (showProfit) {
      headers.push('Total Profit', 'Profit %');
    }

    const body = profitData.map((item: ProfitLossItem) => {
      const row = [
        item.slNo.toString(),
        item.productDescription,
        formatQuantity(item.totalQuantity),
        `£${Number(item.avgPurchase).toFixed(2)}`,
        `£${Number(item.avgSales).toFixed(2)}`
      ];
      if (showProfit) {
        row.push(`£${Number(item.avgProfit).toFixed(2)}`);
      }
      row.push(`£${Number(item.totPurchase).toFixed(2)}`, `£${Number(item.totSales).toFixed(2)}`);
      if (showProfit) {
        row.push(`£${Number(item.totProfit).toFixed(2)}`, `${Number(item.percentProfit).toFixed(2)}%`);
      }
      return row;
    });

    // Add table
    autoTable(doc, {
      head: [headers],
      body: body,
      startY: companyDetails ? 52 : 25,
      styles: {
        fontSize: 7,
        cellPadding: 1,
      },
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    });

    // Add summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || (companyDetails ? 52 : 25);
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(12, finalY + 6, 185, showProfit ? 24 : 16, 'F');
    doc.setTextColor(40);
    doc.setFont('helvetica', 'bold');
    doc.text(`Summary - Date Range: ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`, 16, finalY + 14);
    doc.setFont('helvetica', 'normal');
    let summaryLine1 = `Total Quantity: ${formatQuantity(totals.totalQuantity)} | Total Purchase: £${Number(totals.totPurchase).toFixed(2)} | Total Sales: £${Number(totals.totSales).toFixed(2)}`;
    doc.text(summaryLine1, 16, finalY + 20);
    if (showProfit) {
      let summaryLine2 = `Total Profit: £${Number(totals.totProfit).toFixed(2)} | Percent Profit: ${Number(overallProfitPercent).toFixed(2)}%`;
      doc.text(summaryLine2, 16, finalY + 26);
    }
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');

    doc.save('profit-loss-report.pdf');
  };

  const handleCopy = async () => {
    if (!profitData) return;

    // Build header based on showProfit setting
    let headers = ['Sl No', 'Product Description', 'Total Qty', 'Avg Purchase', 'Avg Sales'];
    if (showProfit) headers.push('Avg Profit');
    headers.push('Total Purchase', 'Total Sales');
    if (showProfit) headers.push('Total Profit', 'Profit %');

    let text = headers.join('\t') + '\n';

    text += profitData.map((item: ProfitLossItem) => {
      const row = [
        item.slNo,
        item.productDescription,
        formatQuantity(item.totalQuantity),
        Number(item.avgPurchase).toFixed(2),
        Number(item.avgSales).toFixed(2)
      ];

      if (showProfit) row.push(Number(item.avgProfit).toFixed(2));
      row.push(Number(item.totPurchase).toFixed(2), Number(item.totSales).toFixed(2));
      if (showProfit) {
        row.push(Number(item.totProfit).toFixed(2), Number(item.percentProfit).toFixed(2));
      }

      return row.join('\t');
    }).join('\n');

    try {
      copyToClipboard(text);
      // Optional: Show a brief success message
      console.log('Data copied to clipboard');
    } catch (err) {
      console.error('Failed to copy data to clipboard:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
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
    doc.text('Profit/Loss Report', 14, companyDetails ? 42 : 15);
    doc.setFontSize(10);
    doc.text(`Date Range: ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`, 14, companyDetails ? 48 : 21);

    // Prepare table headers and body based on showProfit setting
    const headers = ['Sl No', 'Product Description', 'Total Qty', 'Avg Purchase', 'Avg Sales'];
    if (showProfit) {
      headers.push('Avg Profit');
    }
    headers.push('Total Purchase', 'Total Sales');
    if (showProfit) {
      headers.push('Total Profit', 'Profit %');
    }

    const body = profitData.map((item: ProfitLossItem) => {
      const row = [
        item.slNo.toString(),
        item.productDescription,
        formatQuantity(item.totalQuantity),
        `£${Number(item.avgPurchase).toFixed(2)}`,
        `£${Number(item.avgSales).toFixed(2)}`
      ];
      if (showProfit) {
        row.push(`£${Number(item.avgProfit).toFixed(2)}`);
      }
      row.push(`£${Number(item.totPurchase).toFixed(2)}`, `£${Number(item.totSales).toFixed(2)}`);
      if (showProfit) {
        row.push(`£${Number(item.totProfit).toFixed(2)}`, `${Number(item.percentProfit).toFixed(2)}%`);
      }
      return row;
    });

    // Add table
    autoTable(doc, {
      head: [headers],
      body: body,
      startY: companyDetails ? 52 : 25,
      styles: {
        fontSize: 7,
        cellPadding: 1,
      },
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    });

    // Add summary at the bottom
    const finalY = (doc as any).lastAutoTable.finalY || (companyDetails ? 52 : 25);
    doc.setDrawColor(200);
    doc.setFillColor(245, 245, 245);
    doc.rect(12, finalY + 6, 185, showProfit ? 24 : 16, 'F');
    doc.setTextColor(40);
    doc.setFont('helvetica', 'bold');
    doc.text(`Summary - Date Range: ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`, 16, finalY + 14);
    doc.setFont('helvetica', 'normal');
    let summaryLine1 = `Total Quantity: ${formatQuantity(totals.totalQuantity)} | Total Purchase: £${Number(totals.totPurchase).toFixed(2)} | Total Sales: £${Number(totals.totSales).toFixed(2)}`;
    doc.text(summaryLine1, 16, finalY + 20);
    if (showProfit) {
      let summaryLine2 = `Total Profit: £${Number(totals.totProfit).toFixed(2)} | Percent Profit: ${Number(overallProfitPercent).toFixed(2)}%`;
      doc.text(summaryLine2, 16, finalY + 26);
    }
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

    if (profitData.length === 0) {
      alert('No profit/loss data available to send. Please search for data first.');
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
            subject: `Profit/Loss Report - ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`,
            body: `Dear Recipient,\n\nPlease find attached the Profit/Loss Report for the period from ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}.\n\nThis report contains detailed profit and loss analysis including:\n- Product-wise quantity analysis\n- Average and total purchase costs\n- Average and total sales amounts\n${showProfit ? '- Profit calculations and percentages\n- Loss identification (highlighted items)\n' : ''}- Overall financial performance summary\n\nReport Summary:\n- Total Products: ${profitData.length}\n- Total Quantity: ${formatQuantity(totals.totalQuantity)}\n- Total Purchase: £${Number(totals.totPurchase).toFixed(2)}\n- Total Sales: £${Number(totals.totSales).toFixed(2)}\n${showProfit ? `- Total Profit: £${Number(totals.totProfit).toFixed(2)}\n- Overall Profit Percentage: ${Number(overallProfitPercent).toFixed(2)}%\n` : ''}- Date Range: ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}\n\nBest regards,\n${companyDetails?.name || 'Finance Team'}`,
            attachment: {
              filename: `profit-loss-report-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.pdf`,
              content: base64PDF,
              contentType: 'application/pdf'
            }
          };

          const response = await apiRequest('POST', '/api/send-email', emailData);

          if (response.message) {
            alert(` ${response.message}`);
            if (response.warnings) {
              alert(`Warning: ${response.warnings}`);
            }
          } else {
            alert(`Profit/Loss report sent successfully to ${emailList.length} email(s)`);
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

  return (
    <PageLayout title="Profit/Loss Report" breadcrumb="Daily Report > Profit/Loss Report">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp size={20} />
                Profit/Loss Report
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <DateRangeFilter
                from={fromDate}
                to={toDate}
                onFromChange={setFromDate}
                onToChange={setToDate}
                fromManuallyChanged={fromDateManuallyChanged}
                toManuallyChanged={toDateManuallyChanged}
                dateFormat="yyyyMMdd"
              />
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full" onClick={() => setTrigger((t) => t + 1)}>
                  Search
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Profit/Loss Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div className="font-semibold text-lg">Profit/Loss Report</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handlePrint}>Print</Button>
              <Button size="sm" variant="outline" onClick={handleExcel}>Excel</Button>
              <Button size="sm" variant="outline" onClick={handlePDF}>PDF</Button>
              <Button size="sm" variant="outline" onClick={handleCopy}>Copy</Button>

              {/* Email Section - next to Copy button */}
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
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto" ref={tableRef}>
              {/* Company name heading for print */}
              <div className="text-xl font-bold text-center mb-6 print:block hidden">
                {companyDetails?.companyName || 'TROPIFRUIT UK LTD'}
                <div className="text-lg mt-2">Profit/Loss Report</div>
              </div>
              {isLoading ? (
                <div className="text-center py-8">Loading...</div>
              ) : isError ? (
                <div className="text-center text-red-500 py-8">Failed to load data.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sl.No</TableHead>
                      <TableHead>Product Description</TableHead>
                      <TableHead className="text-center">Total Quantity</TableHead>
                      <TableHead className="text-center">AVG Purchase</TableHead>
                      <TableHead className="text-center">AVG Sales</TableHead>
                      {showProfit && <TableHead className="text-center">AVG Profit</TableHead>}
                      <TableHead className="text-center">TOT Purchase</TableHead>
                      <TableHead className="text-center">TOT Sales</TableHead>
                      {showProfit && <TableHead className="text-center">TOT Profit</TableHead>}
                      {showProfit && <TableHead className="text-center">PERCENT Profit %</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitData.map((item: any) => (
                      <TableRow key={item.id} className={item.isLoss ? "bg-orange-50" : ""}>
                        <TableCell>{item.slNo}</TableCell>
                        <TableCell>{item.productDescription}</TableCell>
                        <TableCell className="text-center">{formatQuantity(item.totalQuantity)}</TableCell>
                        <TableCell className="text-center">{Number(item.avgPurchase).toFixed(2)}</TableCell>
                        <TableCell className="text-center">{Number(item.avgSales).toFixed(2)}</TableCell>
                        {showProfit && <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>{Number(item.avgProfit).toFixed(2)}</TableCell>}
                        <TableCell className="text-center">{Number(item.totPurchase).toFixed(2)}</TableCell>
                        <TableCell className="text-center">{Number(item.totSales).toFixed(2)}</TableCell>
                        {showProfit && <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>{Number(item.totProfit).toFixed(2)}</TableCell>}
                        {showProfit && <TableCell className={`text-center ${item.isLoss ? 'text-red-600' : ''}`}>{Number(item.percentProfit).toFixed(2)} %</TableCell>}
                      </TableRow>
                    ))}
                    {/* Total Row */}
                    <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                      <TableCell></TableCell>
                      <TableCell className="font-bold"></TableCell>
                      <TableCell className="text-center font-bold">{formatQuantity(totals.totalQuantity)}</TableCell>
                      <TableCell className="text-center font-bold"></TableCell>
                      <TableCell className="text-center font-bold"></TableCell>
                      {showProfit && <TableCell className="text-center font-bold"></TableCell>}
                      <TableCell className="text-center font-bold">£ {Number(totals.totPurchase).toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold">£ {Number(totals.totSales).toFixed(2)}</TableCell>
                      {showProfit && <TableCell className="text-center font-bold">£ {Number(totals.totProfit).toFixed(2)}</TableCell>}
                      {showProfit && <TableCell className="text-center font-bold">{Number(overallProfitPercent).toFixed(2)} %</TableCell>}
                    </TableRow>
                  </TableBody>
                </Table>
              )}
              {/* Summary below table, styled for print and screen */}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mt-6 p-4 bg-gray-50 rounded-lg border print:mt-6 print:p-4 print:bg-white print:border print:rounded-lg print:flex-row print:items-center print:gap-x-8 print:gap-y-2">
                <div className="flex items-center font-semibold mr-2">Date Range:</div>
                <div className="mr-6">{format(fromDate, 'yyyy-MM-dd')} to {format(toDate, 'yyyy-MM-dd')}</div>
                <div className="flex items-center font-semibold mr-2">Total Quantity:</div>
                <div className="mr-6">{formatQuantity(totals.totalQuantity)}</div>
                <div className="flex items-center font-semibold mr-2">Total Purchase:</div>
                <div className="mr-6">£{Number(totals.totPurchase).toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Sales:</div>
                <div className="mr-6">£{Number(totals.totSales).toFixed(2)}</div>
                {showProfit && <><div className="flex items-center font-semibold mr-2">Total Profit:</div>
                  <div className="mr-6">£{Number(totals.totProfit).toFixed(2)}</div>
                  <div className="flex items-center font-semibold mr-2">Percent Profit:</div>
                  <div>{Number(overallProfitPercent).toFixed(2)} %</div></>}
              </div>
              <div className="flex justify-between items-center mt-4 text-sm text-gray-600 print:hidden">
                <div>Showing {profitData.length} entries</div>
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">Previous</Button>
                    <Button variant="outline" size="sm" className="bg-blue-500 text-white">1</Button>
                    <Button variant="outline" size="sm">Next</Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}