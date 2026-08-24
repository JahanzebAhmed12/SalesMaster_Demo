import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Download, Copy, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useCompanyDetails } from "@/hooks/use-company-details";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { copyToClipboard, printHtmlTable } from "@/lib/export-utils";

interface SalesData {
  slNo: number;
  date: string;
  purchase: number;
  accountSales: number;
  cashSales: number;
  totalSales: number;
}

interface SalesSummary {
  totalPurchase: number;
  totalAccount: number;
  totalCash: number;
  totalSales: number;
}

interface SalesAnalysisResponse {
  sales: SalesData[];
  summary: SalesSummary;
}

export default function SalesAnalysis() {
  // Initialize with current date, will be updated when businessDate loads
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  // Get business date with formatting utilities
  const { 
    businessDate, 
    isLoading: isLoadingBusinessDate, 
    formatForApi 
  } = useBusinessDate();

  // Update dates when business date changes
  useEffect(() => {
    if (!isLoadingBusinessDate && businessDate) {
      try {
        const businessDateObj = new Date(businessDate);
        if (isNaN(businessDateObj.getTime())) {
          console.error('Invalid business date:', businessDate);
          return;
        }
        
        // Update both the date states
        setFromDate(businessDateObj);
        setToDate(businessDateObj);
      } catch (error) {
        console.error('Error processing business date:', error);
      }
    }
  }, []);

  const { companyDetails } = useCompanyDetails();

  const { data, isLoading, isError, refetch } = useQuery<SalesAnalysisResponse | undefined>({
    queryKey: ["/api/reports/sales-analysis", fromDate, toDate, searchTerm],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/reports/sales-analysis?fromDate=${formatForApi(fromDate)}&toDate=${formatForApi(toDate)}&search=${encodeURIComponent(searchTerm)}`
      ),
    enabled: !!fromDate && !!toDate,
  });

  const handleSearch = () => {
    refetch();
  };

  useEffect(() => {
    handleSearch();
    // eslint-disable-next-line
  }, []);

  const handleFromDateChange = (date: Date | undefined) => {
    if (date) {
      setFromDate(date);
    }
  };

  const handleToDateChange = (date: Date | undefined) => {
    if (date) {
      setToDate(date);
    }
  };

  const handleExport = (format: string) => {
    console.log(`Exporting to ${format}`);
  };

  const handlePrint = () => {
    if (!tableRef.current) return;
    
    let html = '';
    
    // Add company header
    html += '<div class="company-header">';
    html += `<div class="company-name">${companyDetails?.companyName || 'Company Name'}</div>`;
    if (companyDetails?.address1) {
      html += `<div class="company-address">${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}</div>`;
    }
    if (companyDetails?.telephone) {
      html += `<div class="company-contact">Phone: ${companyDetails.telephone}</div>`;
    }
    if (companyDetails?.email) {
      html += `<div class="company-contact">Email: ${companyDetails.email}</div>`;
    }
    html += '<div class="report-title">Sales Analysis Report</div>';
    html += `<div class="company-contact">Date Range: ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}</div>`;
    html += '</div>';
    
    // Add table
    html += '<table>';
    html += '<thead><tr>';
    html += '<th>Sl.No</th><th>Date</th><th>Purchase</th><th>Account Sales</th><th>Cash Sales</th><th>Total Sales</th>';
    html += '</tr></thead><tbody>';
    
    salesRows.forEach((row: SalesData) => {
      html += '<tr>';
      html += `<td>${row.slNo}</td>`;
      html += `<td>${row.date}</td>`;
      html += `<td class="text-right">£${typeof row.purchase === 'number' ? row.purchase.toFixed(2) : (row.purchase || '0.00')}</td>`;
      html += `<td class="text-right">£${typeof row.accountSales === 'number' ? row.accountSales.toFixed(2) : (row.accountSales || '0.00')}</td>`;
      html += `<td class="text-right">£${typeof row.cashSales === 'number' ? row.cashSales.toFixed(2) : (row.cashSales || '0.00')}</td>`;
      html += `<td class="text-right">£${typeof row.totalSales === 'number' ? row.totalSales.toFixed(2) : (row.totalSales || '0.00')}</td>`;
      html += '</tr>';
    });
    
    // Add totals row
    html += '<tr class="bg-gray-100 font-semibold">';
    html += '<td></td><td>Total:</td>';
    html += `<td class="text-right">£${typeof totals.totalPurchase === 'number' ? totals.totalPurchase.toFixed(2) : (totals.totalPurchase || '0.00')}</td>`;
    html += `<td class="text-right">£${typeof totals.totalAccount === 'number' ? totals.totalAccount.toFixed(2) : (totals.totalAccount || '0.00')}</td>`;
    html += `<td class="text-right">£${typeof totals.totalCash === 'number' ? totals.totalCash.toFixed(2) : (totals.totalCash || '0.00')}</td>`;
    html += `<td class="text-right">£${typeof totals.totalSales === 'number' ? totals.totalSales.toFixed(2) : (totals.totalSales || '0.00')}</td>`;
    html += '</tr>';
    
    html += '</tbody></table>';
    printHtmlTable('Sales Analysis Report', html);
  };

  const handleExcel = () => {
    if (!data?.sales) return;
    
    const wb = XLSX.utils.book_new();
    
    // Prepare the data for the main sheet
    const dataArray: Array<Array<string | number>> = [
      ['Sales Analysis Report'],
      [''],
      ['Company:', companyDetails?.companyName || 'Company Name'],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      ['Phone:', companyDetails?.telephone || ''],
      ['Email:', companyDetails?.email || ''],
      [''],
      ['Date Range:', `${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`],
      [''],
      ['Sl.No', 'Date', 'Purchase', 'Account Sales', 'Cash Sales', 'Total Sales'] // Header row
    ];

    // Add data rows with proper formatting
    data.sales.forEach((row: SalesData) => {
      dataArray.push([
        row.slNo,
        row.date,
        typeof row.purchase === 'number' ? row.purchase.toFixed(2) : (row.purchase || '0.00'),
        typeof row.accountSales === 'number' ? row.accountSales.toFixed(2) : (row.accountSales || '0.00'),
        typeof row.cashSales === 'number' ? row.cashSales.toFixed(2) : (row.cashSales || '0.00'),
        typeof row.totalSales === 'number' ? row.totalSales.toFixed(2) : (row.totalSales || '0.00')
      ]);
    });

    // Add totals row
    dataArray.push([
      '',
      'Total:',
      typeof data.summary.totalPurchase === 'number' ? data.summary.totalPurchase.toFixed(2) : (data.summary.totalPurchase || '0.00'),
      typeof data.summary.totalAccount === 'number' ? data.summary.totalAccount.toFixed(2) : (data.summary.totalAccount || '0.00'),
      typeof data.summary.totalCash === 'number' ? data.summary.totalCash.toFixed(2) : (data.summary.totalCash || '0.00'),
      typeof data.summary.totalSales === 'number' ? data.summary.totalSales.toFixed(2) : (data.summary.totalSales || '0.00')
    ]);

    // Create worksheet from array data
    const ws = XLSX.utils.aoa_to_sheet(dataArray);
    
    // Set column widths
    const colWidths = [
      { wch: 8 },  // Sl.No
      { wch: 12 }, // Date
      { wch: 15 }, // Purchase
      { wch: 15 }, // Account Sales
      { wch: 12 }, // Cash Sales
      { wch: 15 }  // Total Sales
    ];
    ws['!cols'] = colWidths;
    
    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Analysis');
    
    // Generate the Excel file
    XLSX.writeFile(wb, `sales-analysis-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.xlsx`);
  };

  const handlePDF = () => {
    if (!data?.sales) return;
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let currentY = 15;

    // Add company header if available
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || 'Company Name', 105, currentY, { align: 'center' });
      currentY += 7;
      
      doc.setFontSize(10);
      if (companyDetails.address1) {
        const address = `${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}`;
        doc.text(address, 105, currentY, { align: 'center' });
        currentY += 5;
      }
      if (companyDetails.telephone) {
        doc.text(`Phone: ${companyDetails.telephone}`, 105, currentY, { align: 'center' });
        currentY += 5;
      }
      if (companyDetails.email) {
        doc.text(`Email: ${companyDetails.email}`, 105, currentY, { align: 'center' });
        currentY += 5;
      }
      currentY += 5; // Extra spacing
    }

    // Add title
    doc.setFontSize(14);
    doc.text('Sales Analysis Report', 105, currentY, { align: 'center' });
    currentY += 7;
    
    doc.setFontSize(10);
    doc.text(`Date Range: ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}`, 105, currentY, { align: 'center' });
    currentY += 10;

    // Prepare table data with proper formatting
    const tableData = data.sales.map((row: SalesData) => [
      row.slNo.toString(),
      row.date,
      `£${typeof row.purchase === 'number' ? row.purchase.toFixed(2) : (row.purchase || '0.00')}`,
      `£${typeof row.accountSales === 'number' ? row.accountSales.toFixed(2) : (row.accountSales || '0.00')}`,
      `£${typeof row.cashSales === 'number' ? row.cashSales.toFixed(2) : (row.cashSales || '0.00')}`,
      `£${typeof row.totalSales === 'number' ? row.totalSales.toFixed(2) : (row.totalSales || '0.00')}`
    ]);

    // Add totals row
    tableData.push([
      '',
      'Total:',
      `£${typeof data.summary.totalPurchase === 'number' ? data.summary.totalPurchase.toFixed(2) : (data.summary.totalPurchase || '0.00')}`,
      `£${typeof data.summary.totalAccount === 'number' ? data.summary.totalAccount.toFixed(2) : (data.summary.totalAccount || '0.00')}`,
      `£${typeof data.summary.totalCash === 'number' ? data.summary.totalCash.toFixed(2) : (data.summary.totalCash || '0.00')}`,
      `£${typeof data.summary.totalSales === 'number' ? data.summary.totalSales.toFixed(2) : (data.summary.totalSales || '0.00')}`
    ]);

    // Add table
    autoTable(doc, {
      head: [[
        'Sl.No',
        'Date',
        'Purchase',
        'Account Sales',
        'Cash Sales',
        'Total Sales'
      ]],
      body: tableData,
      startY: currentY,
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
        0: { halign: 'center' },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      },
      // Style the last row (totals) differently
      didParseCell: function (data) {
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fillColor = [220, 220, 220];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    doc.save(`sales-analysis-${format(fromDate, 'yyyy-MM-dd')}-to-${format(toDate, 'yyyy-MM-dd')}.pdf`);
  };

  const handleCopy = async () => {
    if (!data?.sales) return;
    
    let text = 'Sales Analysis Report\n';
    text += `Company: ${companyDetails?.companyName || 'Company Name'}\n`;
    text += `Address: ${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}\n`;
    if (companyDetails?.telephone) text += `Phone: ${companyDetails.telephone}\n`;
    if (companyDetails?.email) text += `Email: ${companyDetails.email}\n`;
    text += `Date Range: ${format(fromDate, 'yyyy-MM-dd')} to ${format(toDate, 'yyyy-MM-dd')}\n\n`;
    
    text += 'Sl.No\tDate\tPurchase\tAccount Sales\tCash Sales\tTotal Sales\n';
    text += data.sales.map((row: SalesData) => [
      row.slNo,
      row.date,
      typeof row.purchase === 'number' ? row.purchase.toFixed(2) : (row.purchase || '0.00'),
      typeof row.accountSales === 'number' ? row.accountSales.toFixed(2) : (row.accountSales || '0.00'),
      typeof row.cashSales === 'number' ? row.cashSales.toFixed(2) : (row.cashSales || '0.00'),
      typeof row.totalSales === 'number' ? row.totalSales.toFixed(2) : (row.totalSales || '0.00')
    ].join('\t')).join('\n');
    
    text += `\n\tTotal:\t${typeof data.summary.totalPurchase === 'number' ? data.summary.totalPurchase.toFixed(2) : (data.summary.totalPurchase || '0.00')}\t${typeof data.summary.totalAccount === 'number' ? data.summary.totalAccount.toFixed(2) : (data.summary.totalAccount || '0.00')}\t${typeof data.summary.totalCash === 'number' ? data.summary.totalCash.toFixed(2) : (data.summary.totalCash || '0.00')}\t${typeof data.summary.totalSales === 'number' ? data.summary.totalSales.toFixed(2) : (data.summary.totalSales || '0.00')}`;
    
    try {
      copyToClipboard(text);
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

  const salesRows = data?.sales || [];
  const totals = data?.summary || {
    totalPurchase: 0,
    totalAccount: 0,
    totalCash: 0,
    totalSales: 0,
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading sales analysis...</div>;
  }
  if (isError) {
    return <div className="flex items-center justify-center h-96 text-red-500">Failed to load sales analysis.</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Sales Analysis</h1>
        <div className="text-sm text-gray-500">
          {companyDetails?.companyName || 'Company Name'}, {companyDetails?.address1 || ''}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ''}
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="fromDate">From Date:</Label>
            <Input
              id="fromDate"
              type="date"
              value={fromDate.toISOString().slice(0, 10)}
              onChange={(e) => setFromDate(new Date(e.target.value))}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="toDate">To Date:</Label>
            <Input
              id="toDate"
              type="date"
              value={toDate.toISOString().slice(0, 10)}
              onChange={(e) => setToDate(new Date(e.target.value))}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={handleSearch}>
            Search
          </Button>
        </div>

        <div className="flex gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={handlePDF} className="flex items-center gap-2"><FileText className="h-4 w-4" />PDF</Button>
          <Button variant="outline" size="sm" onClick={handleExcel} className="flex items-center gap-2"><Download className="h-4 w-4" />Excel</Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="flex items-center gap-2"><Copy className="h-4 w-4" />Copy</Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="flex items-center gap-2"><Printer className="h-4 w-4" />Print</Button>
          
          <div className="ml-auto">
            <Input
              placeholder="Search:"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto" ref={tableRef}>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 border-r">Sl.No</th>
                    <th className="text-left p-3 border-r">Date</th>
                    <th className="text-left p-3 border-r">Purchase</th>
                    <th className="text-left p-3 border-r">Account Sales</th>
                    <th className="text-left p-3 border-r">Cash Sales</th>
                    <th className="text-left p-3">Total Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {salesRows.map((row: SalesData, index: number) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-3 border-r">{row.slNo}</td>
                      <td className="p-3 border-r">{row.date}</td>
                      <td className="p-3 border-r text-right">£{typeof row.purchase === 'number' ? row.purchase.toFixed(2) : (row.purchase || '0.00')}</td>
                      <td className="p-3 border-r text-right">£{typeof row.accountSales === 'number' ? row.accountSales.toFixed(2) : (row.accountSales || '0.00')}</td>
                      <td className="p-3 border-r text-right">£{typeof row.cashSales === 'number' ? row.cashSales.toFixed(2) : (row.cashSales || '0.00')}</td>
                      <td className="p-3 text-right">£{typeof row.totalSales === 'number' ? row.totalSales.toFixed(2) : (row.totalSales || '0.00')}</td>
                    </tr>
                  ))}
                  <tr className="border-b bg-gray-100 font-semibold">
                    <td className="p-3 border-r"></td>
                    <td className="p-3 border-r">Total:</td>
                    <td className="p-3 border-r text-right">£{typeof totals.totalPurchase === 'number' ? totals.totalPurchase.toFixed(2) : (totals.totalPurchase || '0.00')}</td>
                    <td className="p-3 border-r text-right">£{typeof totals.totalAccount === 'number' ? totals.totalAccount.toFixed(2) : (totals.totalAccount || '0.00')}</td>
                    <td className="p-3 border-r text-right">£{typeof totals.totalCash === 'number' ? totals.totalCash.toFixed(2) : (totals.totalCash || '0.00')}</td>
                    <td className="p-3 text-right">£{typeof totals.totalSales === 'number' ? totals.totalSales.toFixed(2) : (totals.totalSales || '0.00')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div className="p-3 border-t text-sm text-gray-500 flex justify-between items-center print:hidden">
              <span>Showing {salesRows.length} entries</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled>Previous</Button>
                <Button variant="outline" size="sm" className="bg-blue-600 text-white">1</Button>
                <Button variant="outline" size="sm" disabled>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}