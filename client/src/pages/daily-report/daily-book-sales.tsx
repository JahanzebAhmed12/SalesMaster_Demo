import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "shared/schema";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, BarChart3, FileText, Download, Copy, Search, Eye, Info, Loader2, Split } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import React from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Mail, Printer, Package, MessageCircle, CreditCard, Banknote, Pencil } from "lucide-react";
import classNames from 'classnames';

interface SalesEntry {
  id: number;
  slNo: number;
  date: string;
  salesman: string;
  boxes: number;
  invoiceNo: string;
  customerName: string;
  customerOthers?: string;
  gateNumber?: string;
  customerId: number;
  vat: number;
  amount: number;
  cash: number;
  bank?: number;
  credit?: number;
}

export default function DailyBookSales() {
  // Set default state to today and all filters
  const today = new Date();
  const [fromDate, setFromDate] = useState<Date>(today);
  const [toDate, setToDate] = useState<Date>(today);
  const [paymentType, setPaymentType] = useState("All");
  const [userFilter, setUserFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [user, setUser] = useState<any>(null);
  const [dailyBookType, setDailyBookType] = useState<'all' | 'own' | null>(null);
  const [loadingUserType, setLoadingUserType] = useState(true);
  const [selectedSales, setSelectedSales] = useState<Set<number>>(new Set());
  const [isUpdatingPayments, setIsUpdatingPayments] = useState(false);
  
  // Split payment dialog state
  const [splitPaymentDialog, setSplitPaymentDialog] = useState<{
    isOpen: boolean;
    sale: SalesEntry | null;
  }>({ isOpen: false, sale: null });
  const [splitPaymentData, setSplitPaymentData] = useState({
    cashAmount: 0,
    cardAmount: 0
  });
  
  // Fetch users for the salesman dropdown
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users"),
  });

  // Fetch sales data from backend with auto-refresh every 20 seconds
  const { data: rawSalesData = [], isLoading: isLoadingSales, refetch: refetchSales } = useQuery<any[]>({
    queryKey: [
      "daily-book-sales",
      fromDate,
      toDate,
      paymentType,
      userFilter,
      searchTerm,
    ],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/reports/daily-book-sales?fromDate=${fromDate ? format(fromDate, "yyyy-MM-dd") : ""}` +
          `&toDate=${toDate ? format(toDate, "yyyy-MM-dd") : ""}` +
          `&paymentType=${paymentType}` +
          `&salesman=${userFilter}` +
          `&search=${encodeURIComponent(searchTerm)}`
      ),
    refetchInterval: 20000, // Auto-refresh every 20 seconds
    refetchIntervalInBackground: true, // Continue refreshing even when tab is not active
  });

  // Map 'account' to 'amount' for compatibility
  const salesData: SalesEntry[] = rawSalesData.map((item: any) => ({
    ...item,
    amount: item.amount !== undefined ? item.amount : item.account !== undefined ? item.account : 0,
    credit: item.credit !== undefined ? item.credit : 0,
  }));

  const totalBoxes = useMemo(() => salesData.reduce((sum, item) => sum + item.boxes, 0), [salesData]);
  const totalVAT = useMemo(() => salesData.reduce((sum, item) => sum + item.vat, 0), [salesData]);
  const totalAmount = useMemo(() => salesData.reduce((sum, item) => sum + item.amount, 0), [salesData]);
  const totalCash = useMemo(() => salesData.reduce((sum, item) => sum + item.cash, 0), [salesData]);
  const totalBank = useMemo(() => salesData.reduce((sum, item) => sum + (item.bank || 0), 0), [salesData]);
  const totalCredit = useMemo(() => salesData.reduce((sum, item) => sum + (item.credit || 0), 0), [salesData]);

  const tableRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    async function fetchUserAndType() {
      setLoadingUserType(true);
      try {
        const userRes = await apiRequest("GET", "/api/auth/me");
        setUser(userRes);
        const typeRes = await apiRequest("GET", `/api/user-daily-book-type/${userRes.id}`);
        setDailyBookType(typeRes.type || 'all');
        if (typeRes.type === 'own') {
          setUserFilter(userRes.username);
        } else {
          setUserFilter('all');
        }
      } catch (e) {
        setDailyBookType('all');
        setUserFilter('all');
      } finally {
        setLoadingUserType(false);
      }
    }
    fetchUserAndType();
    // eslint-disable-next-line
  }, []);

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Export handlers
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Daily Book Sales</title>');
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
      printWindow.document.write('<h3>DAILY BOOK SALES</h3>');
      printWindow.document.write(`<p>Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : 'All'} to ${toDate ? format(toDate, "dd/MM/yyyy") : 'All'}</p>`);
      printWindow.document.write('</div>');
      
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      const headers = ['Date', 'Invoice No', 'Customer Name', 'Accounts', 'Cash', 'Card Payment', 'Credit'];
      headers.forEach(h => {
        printWindow.document.write(`<th>${h}</th>`);
      });
      printWindow.document.write('</tr></thead><tbody>');
      salesData.forEach(sale => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${format(new Date(sale.date), "yyyy-MM-dd")}</td>`);
        printWindow.document.write(`<td>${sale.invoiceNo}</td>`);
        printWindow.document.write(`<td>${sale.customerName}</td>`);
        printWindow.document.write(`<td>£${Number(sale.amount ?? 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(sale.cash ?? 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(sale.bank ?? 0).toFixed(2)}</td>`);
        printWindow.document.write(`<td>£${Number(sale.credit ?? 0).toFixed(2)}</td>`);
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
    const ws = XLSX.utils.json_to_sheet(salesData.map((item: SalesEntry) => ({
      'Sl.No': item.slNo,
      'Date': item.date,
      'Invoice No': item.invoiceNo,
      'Customer Name': item.customerName,
      'Account': item.amount,
      'Cash': item.cash,
      'Bank Transfer': item.bank || 0,
      'Credit': item.credit || 0
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Book Sales');
    XLSX.writeFile(wb, 'daily-book-sales.xlsx');
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
    doc.text('DAILY BOOK SALES', 105, yPosition, { align: 'center' });
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.text(`Period: ${fromDate ? format(fromDate, "dd/MM/yyyy") : 'All'} to ${toDate ? format(toDate, "dd/MM/yyyy") : 'All'}`, 105, yPosition, { align: 'center' });
    yPosition += 10;
    
    // Add table
    autoTable(doc, {
      head: [[
        'Date', 'Invoice No', 'Customer Name', 'Accounts', 'Cash', 'Card Payment', 'Credit'
      ]],
      body: salesData.map((item: SalesEntry) => [
        format(new Date(item.date), "yyyy-MM-dd"),
        item.invoiceNo,
        item.customerName,
        `£${Number(item.amount ?? 0).toFixed(2)}`,
        `£${Number(item.cash ?? 0).toFixed(2)}`,
        `£${Number(item.bank ?? 0).toFixed(2)}`,
        `£${Number(item.credit ?? 0).toFixed(2)}`
      ]),
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 25 },
        2: { cellWidth: 45 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25 },
        5: { cellWidth: 25 },
        6: { cellWidth: 25 }
      }
    });
    
    doc.save(`daily-book-sales-${fromDate ? format(fromDate, "yyyyMMdd") : 'all'}-${toDate ? format(toDate, "yyyyMMdd") : 'all'}.pdf`);
  };

  const handleCopy = () => {
    const header = ['Sl.No', 'Date', 'Invoice No', 'Customer Name', 'Account', 'Cash', 'Bank Transfer', 'Credit'];
    const rows = salesData.map((item: SalesEntry) => [
      item.slNo,
      item.date,
      item.invoiceNo,
      item.customerName,
      item.amount,
      item.cash,
      item.bank || 0,
      item.credit || 0
    ]);
    const tsv = [header, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv);
    alert('Table copied to clipboard!');
  };

  // Handle checkbox selection
  const handleCheckboxChange = (saleId: number, checked: boolean) => {
    setSelectedSales(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(saleId);
      } else {
        newSet.delete(saleId);
      }
      return newSet;
    });
  };

  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSales(new Set(salesData.map(sale => sale.id)));
    } else {
      setSelectedSales(new Set());
    }
  };

  // Update selected sales to cash payment
  const handleUpdateToCash = async () => {
    if (selectedSales.size === 0) {
      alert('Please select at least one sale to update.');
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to cash payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
      
      // Process each selected sale
      for (const sale of selectedSalesData) {
        // Calculate the total invoice amount (account + cash + bank)
        const totalInvoiceAmount = (sale.amount || 0) + (sale.cash || 0) + (sale.bank || 0);
        
        if (totalInvoiceAmount > 0) {
          // First, reverse any existing payments by creating negative payment entries
          if (sale.cash > 0) {
            await apiRequest('POST', '/api/payments', {
              customerId: sale.customerId,
              saleId: sale.id,
              amount: -sale.cash,
              paymentMode: 'cash',
              paymentDate: format(new Date(), 'yyyy-MM-dd'),
              remarks: `Reversed cash payment via daily book sales`
            });
          }
          
          if (sale.bank && sale.bank > 0) {
            await apiRequest('POST', '/api/payments', {
              customerId: sale.customerId,
              saleId: sale.id,
              amount: -sale.bank,
              paymentMode: 'bank',
              paymentDate: format(new Date(), 'yyyy-MM-dd'),
              remarks: `Reversed bank payment via daily book sales`
            });
          }
          
          // Now create the new cash payment for the full amount
          const paymentData = {
            customerId: sale.customerId,
            saleId: sale.id,
            amount: totalInvoiceAmount,
            paymentMode: 'cash',
            paymentDate: format(new Date(), 'yyyy-MM-dd'),
            remarks: `Updated to cash payment via daily book sales`
          };

          await apiRequest('POST', '/api/payments', paymentData);
          
          // Update the sale record to set customer_type to 'cash' using PATCH
          await apiRequest('PATCH', `/api/sales/${sale.id}`, {
            customer_type: 'cash'
          });
        }
      }

      alert(`Successfully updated ${selectedSales.size} sales to cash payment.`);
      setSelectedSales(new Set()); // Clear selection
      refetchSales(); // Refresh the data
    } catch (error) {
      console.error('Error updating payments:', error);
      alert('Error updating payments. Please try again.');
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Update selected sales to card payment
  const handleUpdateToCard = async () => {
    if (selectedSales.size === 0) {
      alert('Please select at least one sale to update.');
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to card payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
      
      // Process each selected sale
      for (const sale of selectedSalesData) {
        // Calculate the total invoice amount (account + cash + bank)
        const totalInvoiceAmount = (sale.amount || 0) + (sale.cash || 0) + (sale.bank || 0);
        
        if (totalInvoiceAmount > 0) {
          // First, reverse any existing payments by creating negative payment entries
          if (sale.cash > 0) {
            await apiRequest('POST', '/api/payments', {
              customerId: sale.customerId,
              saleId: sale.id,
              amount: -sale.cash,
              paymentMode: 'cash',
              paymentDate: format(new Date(), 'yyyy-MM-dd'),
              remarks: `Reversed cash payment via daily book sales`
            });
          }
          
          if (sale.bank && sale.bank > 0) {
            await apiRequest('POST', '/api/payments', {
              customerId: sale.customerId,
              saleId: sale.id,
              amount: -sale.bank,
              paymentMode: 'bank',
              paymentDate: format(new Date(), 'yyyy-MM-dd'),
              remarks: `Reversed bank payment via daily book sales`
            });
          }
          
          // Now create the new card payment for the full amount
          const paymentData = {
            customerId: sale.customerId,
            saleId: sale.id,
            amount: totalInvoiceAmount,
            paymentMode: 'bank',
            paymentDate: format(new Date(), 'yyyy-MM-dd'),
            remarks: `Updated to card payment via daily book sales`
          };

          await apiRequest('POST', '/api/payments', paymentData);
          
          // Update the sale record to set customer_type to 'bank' using PATCH
          await apiRequest('PATCH', `/api/sales/${sale.id}`, {
            customer_type: 'bank'
          });
        }
      }

      alert(`Successfully updated ${selectedSales.size} sales to card payment.`);
      setSelectedSales(new Set()); // Clear selection
      refetchSales(); // Refresh the data
    } catch (error) {
      console.error('Error updating payments:', error);
      alert('Error updating payments. Please try again.');
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Update selected sales to account payment
  const handleUpdateToAccount = async () => {
    if (selectedSales.size === 0) {
      alert('Please select at least one sale to update.');
      return;
    }

    if (!confirm(`Are you sure you want to update ${selectedSales.size} selected sales to account payment?`)) {
      return;
    }

    setIsUpdatingPayments(true);
    try {
      const selectedSalesData = salesData.filter(sale => selectedSales.has(sale.id));
      
      // Process each selected sale - reverse any existing payments back to account
      for (const sale of selectedSalesData) {
        // Calculate the total invoice amount (account + cash + bank)
        const totalInvoiceAmount = (sale.amount || 0) + (sale.cash || 0) + (sale.bank || 0);
        
        if (totalInvoiceAmount > 0) {
          // First, reverse any existing payments by creating negative payment entries
          if (sale.cash > 0) {
            await apiRequest('POST', '/api/payments', {
              customerId: sale.customerId,
              saleId: sale.id,
              amount: -sale.cash,
              paymentMode: 'cash',
              paymentDate: format(new Date(), 'yyyy-MM-dd'),
              remarks: `Reversed cash payment to account via daily book sales`
            });
          }
          
          if (sale.bank && sale.bank > 0) {
            await apiRequest('POST', '/api/payments', {
              customerId: sale.customerId,
              saleId: sale.id,
              amount: -sale.bank,
              paymentMode: 'bank',
              paymentDate: format(new Date(), 'yyyy-MM-dd'),
              remarks: `Reversed bank payment to account via daily book sales`
            });
          }
          
          // Update the sale record to set customer_type back to 'account' using PATCH
          await apiRequest('PATCH', `/api/sales/${sale.id}`, {
            customer_type: 'account'
          });
        }
      }

      alert(`Successfully updated ${selectedSales.size} sales to account payment.`);
      setSelectedSales(new Set()); // Clear selection
      refetchSales(); // Refresh the data
    } catch (error) {
      console.error('Error updating to account payment:', error);
      alert('Failed to update some sales to account payment. Check console for details.');
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  // Helper for WhatsApp and Email
  const sendInvoiceEmail = async (sale: SalesEntry) => {
    try {
      // Call backend endpoint to send invoice email for this sale
      await apiRequest('POST', `/api/sales/${sale.invoiceNo}/send`, {
        customerId: sale.customerId
      });
      alert('Invoice email sent!');
    } catch (e) {
      alert('Failed to send invoice email.');
    }
  };
  const sendWhatsApp = async (sale: SalesEntry) => {
    // You need to get the phone number and invoice URL (assume invoice PDF is at `/print/invoice/:invoiceNo`)
    const phone = prompt('Enter WhatsApp number (E.164 format, e.g. +441234567890):');
    if (!phone) return;
    const invoiceUrl = `${window.location.origin}/print/invoice/${sale.invoiceNo}`;
    try {
      await apiRequest('POST', '/api/send/whatsapp-invoice', {
        phoneNumber: phone,
        invoiceUrl,
        message: 'Your invoice is attached.'
      });
      alert('WhatsApp message sent!');
    } catch (e) {
      alert('Failed to send WhatsApp message.');
    }
  };
  const pay = async (sale: SalesEntry, mode: 'cash' | 'bank') => {
    try {
      await apiRequest('POST', '/api/payments', {
        customer_id: sale.customerId,
        sale_id: sale.id,
        amount: sale.amount,
        payment_mode: mode,
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        remarks: `Paid via daily book sales (${mode})`
      });
      alert(`Payment (${mode}) successful!`);
      refetchSales();
    } catch (e) {
      alert('Payment failed.');
      return; // Don't open receipt if payment failed
    }
    
    // Open payment receipt instead of invoice
    const paymentType = mode === 'cash' ? 'cash' : 'card';
    window.open(`/print/payment-receipt/${sale.id}/${paymentType}`, '_blank');
  };

  // Handle split payment
  const handleSplitPayment = (sale: SalesEntry) => {
    const totalAmount = (sale.amount || 0) + (sale.cash || 0) + (sale.bank || 0);
    setSplitPaymentDialog({ isOpen: true, sale });
    setSplitPaymentData({
      cashAmount: 0,
      cardAmount: 0
    });
  };

  // Submit split payment
  const handleSplitPaymentSubmit = async () => {
    if (!splitPaymentDialog.sale) return;
    
    const { cashAmount, cardAmount } = splitPaymentData;
    const sale = splitPaymentDialog.sale;
    const totalAmount = (sale.amount || 0) + (sale.cash || 0) + (sale.bank || 0);
    
    // Validate amounts
    if (cashAmount + cardAmount !== totalAmount) {
      alert(`Total split amount (£${(cashAmount + cardAmount).toFixed(2)}) must equal the invoice total (£${totalAmount.toFixed(2)})`);
      return;
    }
    
    if (cashAmount < 0 || cardAmount < 0) {
      alert('Payment amounts cannot be negative');
      return;
    }

    try {
      setIsUpdatingPayments(true);
      
      // First, reverse any existing payments
      if (sale.cash > 0) {
        await apiRequest('POST', '/api/payments', {
          customerId: sale.customerId,
          saleId: sale.id,
          amount: -sale.cash,
          paymentMode: 'cash',
          paymentDate: format(new Date(), 'yyyy-MM-dd'),
          remarks: `Reversed cash payment for split payment`
        });
      }
      
      if (sale.bank && sale.bank > 0) {
        await apiRequest('POST', '/api/payments', {
          customerId: sale.customerId,
          saleId: sale.id,
          amount: -sale.bank,
          paymentMode: 'bank',
          paymentDate: format(new Date(), 'yyyy-MM-dd'),
          remarks: `Reversed bank payment for split payment`
        });
      }
      
      // Create new split payments
      if (cashAmount > 0) {
        await apiRequest('POST', '/api/payments', {
          customerId: sale.customerId,
          saleId: sale.id,
          amount: cashAmount,
          paymentMode: 'cash',
          paymentDate: format(new Date(), 'yyyy-MM-dd'),
          remarks: `Split payment - Cash portion`
        });
      }
      
      if (cardAmount > 0) {
        await apiRequest('POST', '/api/payments', {
          customerId: sale.customerId,
          saleId: sale.id,
          amount: cardAmount,
          paymentMode: 'bank',
          paymentDate: format(new Date(), 'yyyy-MM-dd'),
          remarks: `Split payment - Card portion`
        });
      }
      
      // Update sale customer type to mixed (or keep as is since it's split)
      await apiRequest('PATCH', `/api/sales/${sale.id}`, {
        customer_type: cashAmount > cardAmount ? 'cash' : 'bank' // Set to dominant payment type
      });
      
      alert('Split payment applied successfully!');
      setSplitPaymentDialog({ isOpen: false, sale: null });
      refetchSales();
      
    } catch (error) {
      console.error('Error applying split payment:', error);
      alert('Error applying split payment. Please try again.');
    } finally {
      setIsUpdatingPayments(false);
    }
  };

  if (loadingUserType) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin mr-2" /> Loading user settings...
      </div>
    );
  }

  return (
    <PageLayout title="Daily Book" breadcrumb="Daily Report > Daily Book Sales">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-3 sm:pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg sm:text-xl">Daily Book Sales</CardTitle>
            <div className="flex gap-2 items-center">
            
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:grid md:grid-cols-6 gap-4 items-end">
              <div className="w-full">
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
              
              <div className="w-full">
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
              
              <div className="w-full">
                <Select value={paymentType} onValueChange={setPaymentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-full">
                <Select value={userFilter} onValueChange={setUserFilter} disabled={dailyBookType === 'own'}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Salesmen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {isLoadingUsers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      users?.map((user: User) => (
                        <SelectItem key={user.id} value={user.username}>
                          {user.username}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-full">
                <Button className="bg-blue-500 hover:bg-blue-600 w-full">
                  Search
                </Button>
              </div>
              
              <div className="flex gap-2 w-full md:w-auto">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2 w-full md:w-auto"
                variant="default"
                onClick={() => navigate("/daily-report/daily-sales-full-view")}>
                  
                  <Eye size={16} />
                  Full View
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Table */}
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
              </div>
              <div className="flex items-center gap-2">
                {/* Action bar above table */}
                <div className="flex items-center gap-2">
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleUpdateToCash}
                    disabled={selectedSales.size === 0}
                  >
                    Paid (Cash) - {selectedSales.size}
                  </Button>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleUpdateToCard}
                    disabled={selectedSales.size === 0}
                  >
                    Pay Card - {selectedSales.size}
                  </Button>
                  <Button
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={handleUpdateToAccount}
                    disabled={selectedSales.size === 0}
                  >
                    Paid Account - {selectedSales.size}
                  </Button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Search:"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-48"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto" ref={tableRef}>
              <Table className="min-w-[800px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 min-w-[48px]">
                      <input 
                        type="checkbox" 
                        className="rounded"
                        checked={selectedSales.size === salesData.length && salesData.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableHead>
                    <TableHead className="min-w-[120px]">Date</TableHead>
                    <TableHead className="min-w-[140px]">Invoice No</TableHead>
                    <TableHead className="min-w-[220px]">Customer Name</TableHead>
                    <TableHead className="min-w-[130px] text-right">Accounts</TableHead>
                    <TableHead className="min-w-[120px] text-right">Cash</TableHead>
                    <TableHead className="min-w-[120px] text-right">Card Payment</TableHead>
                    <TableHead className="min-w-[120px] text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingSales ? (
                    <TableRow>
                      <TableCell colSpan={9}>Loading...</TableCell>
                    </TableRow>
                  ) : (
                    salesData.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell>
                          <input 
                            type="checkbox" 
                            className="rounded"
                            checked={selectedSales.has(sale.id)}
                            onChange={(e) => handleCheckboxChange(sale.id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>{format(new Date(sale.date), "yyyy-MM-dd")}</TableCell>
                        <TableCell>{/* Invoice No as link */}
                          <Button variant="link" className="p-0 text-blue-600 underline" onClick={() => window.open(`/data-entry/sales-invoice?invoiceNumber=${sale.invoiceNo}`, '_self')}>
                            {sale.invoiceNo}
                          </Button>
                        </TableCell>
                        <TableCell className="text-blue-600">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="link" className="p-0 text-blue-600 underline cursor-pointer text-left">
                                <span>
                                  {sale.customerName}
                                  {sale.gateNumber && (
                                    <span className="text-xs text-gray-500 font-normal ml-2">
                                      [Gate: {sale.gateNumber}]
                                    </span>
                                  )}
                                  {sale.customerOthers && (
                                    <span className="text-xs text-gray-500 font-normal ml-2">
                                      ({sale.customerOthers})
                                    </span>
                                  )}
                                </span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              <DropdownMenuItem className="text-lg py-3" onClick={() => window.open(`/data-entry/sales-invoice?invoiceNumber=${sale.invoiceNo}`, '_self')}>
                                <Pencil className="mr-2 h-5 w-5" /> Edit Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => window.open(`/print/invoice/${sale.invoiceNo}`, '_blank')}>
                                <Printer className="mr-2 h-5 w-5" /> Print Ticket
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => window.open(`/print/packing-list/${sale.invoiceNo}`, '_blank')}>
                                <Package className="mr-2 h-5 w-5" /> Print Pickingticket
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => sendInvoiceEmail(sale)}>
                                <Mail className="mr-2 h-5 w-5" /> Email
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => sendWhatsApp(sale)}>
                                <MessageCircle className="mr-2 h-5 w-5" /> WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => pay(sale, 'cash')}>
                                <Banknote className="mr-2 h-5 w-5" /> Pay (Cash)
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => pay(sale, 'bank')}>
                                <CreditCard className="mr-2 h-5 w-5" /> Pay (Bank)
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-lg py-3" onClick={() => handleSplitPayment(sale)}>
                                <Split className="mr-2 h-5 w-5" /> Split Payment
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                        <TableCell className="text-right">£{Number(sale.amount ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">£{Number(sale.cash ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">£{Number(sale.bank ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-red-600">{sale.credit?.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? "0.00"}</TableCell>
                      </TableRow>
                    ))
                  )}
                  
                  {/* Total Row */}
                  <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">{salesData.length} Items</TableCell>
                    <TableCell className="text-center font-bold">{totalBoxes}</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right font-bold">£{totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold">£{totalCash.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold">£{totalBank.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold text-red-600">£{totalCredit.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {/* Summary moved below table, styled for print and screen */}
              <div className="flex flex-wrap items-center gap-x-8 gap-y-2 mt-6 p-4 bg-gray-50 rounded-lg border print:mt-6 print:p-4 print:bg-white print:border print:rounded-lg print:flex-row print:items-center print:gap-x-8 print:gap-y-2">
                <div className="flex items-center font-semibold mr-2">Date Range:</div>
                <div className="mr-6">{fromDate ? format(fromDate, 'yyyy-MM-dd') : '-'} to {toDate ? format(toDate, 'yyyy-MM-dd') : '-'}</div>
                <div className="flex items-center font-semibold mr-2">Total Boxes:</div>
                <div className="mr-6">{totalBoxes}</div>
                <div className="flex items-center font-semibold mr-2">Total VAT:</div>
                <div className="mr-6">£{totalVAT.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Amount:</div>
                <div className="mr-6">£{totalAmount.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Cash:</div>
                <div>£{totalCash.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Bank:</div>
                <div>£{totalBank.toFixed(2)}</div>
                <div className="flex items-center font-semibold mr-2">Total Credit:</div>
                <div>£{totalCredit.toFixed(2)}</div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to 1 of 1 entries</div>
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

        {/* Split Payment Dialog */}
        <Dialog open={splitPaymentDialog.isOpen} onOpenChange={(open) => {
          if (!open) {
            setSplitPaymentDialog({ isOpen: false, sale: null });
            setSplitPaymentData({ cashAmount: 0, cardAmount: 0 });
          }
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Split Payment</DialogTitle>
            </DialogHeader>
            
            {splitPaymentDialog.sale && (
              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  <p><strong>Invoice:</strong> {splitPaymentDialog.sale.invoiceNo}</p>
                  <p><strong>Customer:</strong> {splitPaymentDialog.sale.customerName}</p>
                  <p><strong>Total Amount:</strong> £{((splitPaymentDialog.sale.amount || 0) + (splitPaymentDialog.sale.cash || 0) + (splitPaymentDialog.sale.bank || 0)).toFixed(2)}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cashAmount">Cash Amount</Label>
                    <Input
                      id="cashAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={splitPaymentData.cashAmount}
                      onChange={(e) => setSplitPaymentData(prev => ({
                        ...prev,
                        cashAmount: parseFloat(e.target.value) || 0
                      }))}
                      placeholder="0.00"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="cardAmount">Card Amount</Label>
                    <Input
                      id="cardAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={splitPaymentData.cardAmount}
                      onChange={(e) => setSplitPaymentData(prev => ({
                        ...prev,
                        cardAmount: parseFloat(e.target.value) || 0
                      }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                
                <div className="text-sm">
                  <p><strong>Total Split:</strong> £{(splitPaymentData.cashAmount + splitPaymentData.cardAmount).toFixed(2)}</p>
                  <p className={`${
                    (splitPaymentData.cashAmount + splitPaymentData.cardAmount) === 
                    ((splitPaymentDialog.sale.amount || 0) + (splitPaymentDialog.sale.cash || 0) + (splitPaymentDialog.sale.bank || 0))
                    ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <strong>Difference:</strong> £{(
                      ((splitPaymentDialog.sale.amount || 0) + (splitPaymentDialog.sale.cash || 0) + (splitPaymentDialog.sale.bank || 0)) - 
                      (splitPaymentData.cashAmount + splitPaymentData.cardAmount)
                    ).toFixed(2)}
                  </p>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setSplitPaymentDialog({ isOpen: false, sale: null });
                  setSplitPaymentData({ cashAmount: 0, cardAmount: 0 });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSplitPaymentSubmit}
                disabled={isUpdatingPayments}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isUpdatingPayments ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Apply Split Payment'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}