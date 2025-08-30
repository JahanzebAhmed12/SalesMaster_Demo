import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { CalendarIcon, CreditCard, FileText, Download, Copy, Printer, Search, Receipt, FileCheck, Mail } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBackdatePermissions } from "@/hooks/usePermissions";
import { isPastDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import type { Customer, Sale, Payment, InsertPayment } from "@shared/schema";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type InvoiceWithBalance = Sale & {
  balance: number;
  paid: number;
  runningBal: number;
};

export default function CustomerPayment() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
  const [invoicePaymentModes, setInvoicePaymentModes] = useState<Map<number, string>>(new Map());
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const [remarks, setRemarks] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [splitPayment, setSplitPayment] = useState({
    cash: "",
    card: "",
    bankTransfer: "",
    cheque: ""
  });
  const [isOnAccountMode, setIsOnAccountMode] = useState(false);
  const [onAccountInvoiceId, setOnAccountInvoiceId] = useState<number | null>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Backdate permissions
  const { canEditBackdate } = useBackdatePermissions();

  // Fetch user permissions for current date editing
  const { data: userPermissions } = useQuery<any>({
    queryKey: ['/api/user-backdate-options', user?.id],
    queryFn: () => apiRequest('GET', `/api/user-backdate-options/${user?.id}`),
    enabled: !!user?.id,
  });

  // Check if user can edit a payment based on date
  const canEditPayment = (paymentDate: string) => {
    if (!userPermissions) return false;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const paymentDateFormatted = format(new Date(paymentDate), 'yyyy-MM-dd');
    
    if (paymentDateFormatted === today) {
      // For current date payments, check current_editing permission
      return userPermissions.current_editing !== false;
    } else {
      // For back date payments, check editing permission
      return userPermissions.editing === true;
    }
  };

  // Check if user can create new payments for a specific date
  const canCreatePaymentForDate = (date: Date) => {
    if (!userPermissions) return false;
    
    const today = format(new Date(), 'yyyy-MM-dd');
    const selectedDateFormatted = format(date, 'yyyy-MM-dd');
    
    if (selectedDateFormatted === today) {
      // For current date, check current_editing permission
      return userPermissions.current_editing !== false;
    } else if (isPastDate(date)) {
      // For past dates, check editing permission
      return userPermissions.editing === true;
    } else {
      // For future dates, allow (assuming future dates are always allowed)
      return true;
    }
  };

  // Reset email field when customer changes
  useEffect(() => {
    setEmailAddress("");
  }, [selectedCustomerId]);

  // Fetch customers
  const { data: customers, isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Fetch outstanding invoices for the selected customer
  const { data: outstandingInvoices, isLoading: isLoadingInvoices, refetch: refetchOutstandingInvoices } = useQuery<Sale[]>({
    queryKey: ["/api/customers", selectedCustomerId, "outstanding_invoices"],
    queryFn: () => apiRequest("GET", `/api/customers/${selectedCustomerId}/outstanding_invoices`),
    enabled: !!selectedCustomerId,
  });

  // Fetch payment history for the selected customer
  const { data: paymentHistory, refetch: refetchPaymentHistory } = useQuery<Payment[]>({
    queryKey: ["/api/payments/history", selectedCustomerId],
    queryFn: () => apiRequest("GET", `/api/payments/history?customerId=${selectedCustomerId}`),
    enabled: !!selectedCustomerId,
  });

  // Group payment history by batch ID
  const groupedPaymentHistory = paymentHistory?.reduce((acc: any[], payment: any) => {
    const batchId = payment.batchId;
    if (!batchId) return acc;

    const existingBatch = acc.find(batch => batch.batchId === batchId);
    if (existingBatch) {
      existingBatch.totalAmount += payment.amount;
      // Only add invoice number if it's not already in the list
      const invoiceNumber = payment.invoiceNumber || 'On Account';
      if (!existingBatch.invoices.includes(invoiceNumber)) {
        existingBatch.invoices.push(invoiceNumber);
      }
      // Aggregate by payment mode
      const mode = payment.paymentMode;
      if (mode === 'cash') existingBatch.cashAmount += payment.amount;
      else if (mode === 'bank') existingBatch.cardAmount += payment.amount;
      else if (mode === 'bank_transfer') existingBatch.bankTransferAmount += payment.amount;
      else if (mode === 'cheque') existingBatch.chequeAmount += payment.amount;
    } else {
      acc.push({
        batchId: batchId,
        paymentDate: payment.paymentDate,
        totalAmount: payment.amount,
        remarks: payment.remarks,
        invoices: [payment.invoiceNumber || 'On Account'],
        cashAmount: payment.paymentMode === 'cash' ? payment.amount : 0,
        cardAmount: payment.paymentMode === 'bank' ? payment.amount : 0,
        bankTransferAmount: payment.paymentMode === 'bank_transfer' ? payment.amount : 0,
        chequeAmount: payment.paymentMode === 'cheque' ? payment.amount : 0,
      });
    }
    return acc;
  }, []) || [];

  // Mutation for updating a payment
  const updatePaymentMutation = useMutation<any, Error, any>({
    mutationFn: (paymentData) => apiRequest("PUT", `/api/payments/batch/${paymentData.batchId}`, paymentData),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment updated successfully.",
      });
      refetchOutstandingInvoices();
      refetchPaymentHistory();
      setEditingPayment(null);
      setIsEditing(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payment.",
        variant: "destructive",
      });
    },
  });

  // Mutation for creating on-account payment
  const createOnAccountMutation = useMutation<any, Error, any>({
    mutationFn: (paymentData) => apiRequest("POST", "/api/payments", paymentData),
    onSuccess: (response) => {
      toast({
        title: "Success",
        description: "On-account payment recorded successfully.",
      });
      refetchOutstandingInvoices();
      refetchPaymentHistory();
      setReceivedAmount(0);
      setRemarks("");
      setOnAccountInvoiceId(null);
      resetSplitPayment();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record on-account payment.",
        variant: "destructive",
      });
    },
  });

  // Mutation for creating a new payment
  const createPaymentMutation = useMutation<any, Error, any>({
    mutationFn: (paymentData) => apiRequest("POST", "/api/payments/bulk", paymentData),
    onSuccess: (response) => {
      let paymentSummary = `ID: ${response.paymentId}`;
      const paymentParts = [];
      const cashAmount = parseFloat(splitPayment.cash) || 0;
      const cardAmount = parseFloat(splitPayment.card) || 0;
      const bankTransferAmount = parseFloat(splitPayment.bankTransfer) || 0;
      const chequeAmount = parseFloat(splitPayment.cheque) || 0;
      
      if (cashAmount > 0) paymentParts.push(`Cash: £${cashAmount.toFixed(2)}`);
      if (cardAmount > 0) paymentParts.push(`Card: £${cardAmount.toFixed(2)}`);
      if (bankTransferAmount > 0) paymentParts.push(`Bank Transfer: £${bankTransferAmount.toFixed(2)}`);
      if (chequeAmount > 0) paymentParts.push(`Cheque: £${chequeAmount.toFixed(2)}`);

      if (paymentParts.length > 0) {
        paymentSummary += ` (${paymentParts.join(', ')})`;
      }

      toast({
        title: "Success",
        description: `Payment recorded successfully. Batch ${paymentSummary}`,
      });
      refetchOutstandingInvoices();
      refetchPaymentHistory();
      setReceivedAmount(0);
      setRemarks("");
      setSelectedInvoiceIds(new Set());
      setInvoicePaymentModes(new Map());
      resetSplitPayment();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment.",
        variant: "destructive",
      });
    },
  });

  // Handle checkbox selection
  const handleInvoiceSelection = (invoiceId: number, checked: boolean) => {
    const newSelection = new Set(selectedInvoiceIds);
    const newPaymentModes = new Map(invoicePaymentModes);

    if (checked) {
      newSelection.add(invoiceId);
      // Set default payment mode to cash for new selections
      if (!newPaymentModes.has(invoiceId)) {
        newPaymentModes.set(invoiceId, 'cash');
      }
    } else {
      newSelection.delete(invoiceId);
      newPaymentModes.delete(invoiceId);
    }

    setSelectedInvoiceIds(newSelection);
    setInvoicePaymentModes(newPaymentModes);

    // Auto-calculate total amount for selected invoices
    const selectedInvoices = displayedInvoices.filter(inv => newSelection.has(inv.id));
    const totalAmount = selectedInvoices.reduce((sum, inv) => sum + inv.balance, 0);

    // If using split payment, distribute evenly to cash by default
    if (totalAmount !== 0) {
      setSplitPayment({
        cash: totalAmount.toString(),
        card: "",
        bankTransfer: "",
        cheque: ""
      });
    } else {
      resetSplitPayment();
    }
    setReceivedAmount(totalAmount);
  };

  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(displayedInvoices.map(inv => inv.id));
      const newPaymentModes = new Map(invoicePaymentModes);

      // Set default payment mode for all invoices
      displayedInvoices.forEach(inv => {
        if (!newPaymentModes.has(inv.id)) {
          newPaymentModes.set(inv.id, 'cash');
        }
      });

      setSelectedInvoiceIds(allIds);
      setInvoicePaymentModes(newPaymentModes);
      const totalAmount = displayedInvoices.reduce((sum, inv) => sum + inv.balance, 0);
      // Set split payment to cash by default
      setSplitPayment({
        cash: totalAmount.toString(),
        card: "",
        bankTransfer: "",
        cheque: ""
      });
      setReceivedAmount(totalAmount);
    } else {
      setSelectedInvoiceIds(new Set());
      setInvoicePaymentModes(new Map());
      setReceivedAmount(0);
      resetSplitPayment();
    }
  };

  // Handle payment mode change for individual invoice
  const handleInvoicePaymentModeChange = (invoiceId: number, paymentMode: string) => {
    const newPaymentModes = new Map(invoicePaymentModes);
    newPaymentModes.set(invoiceId, paymentMode);
    setInvoicePaymentModes(newPaymentModes);
  };

  // Handle split payment amount changes
  const handleSplitPaymentChange = (type: string, value: string) => {
    setSplitPayment(prev => ({
      ...prev,
      [type]: value
    }));
    // Update total received amount
    const newSplitPayment = {
      ...splitPayment,
      [type]: value
    };
    const newTotal = Object.values(newSplitPayment).reduce((sum, val) => {
      const numVal = parseFloat(val as string) || 0;
      return sum + numVal;
    }, 0);
    setReceivedAmount(newTotal);
  };

  // Convert split payment strings to numbers for backend
  const getSplitPaymentNumbers = () => ({
    cash: parseFloat(splitPayment.cash) || 0,
    card: parseFloat(splitPayment.card) || 0,
    bankTransfer: parseFloat(splitPayment.bankTransfer) || 0,
    cheque: parseFloat(splitPayment.cheque) || 0
  });

  // Reset split payment when selection changes
  const resetSplitPayment = () => {
    setSplitPayment({
      cash: "",
      card: "",
      bankTransfer: "",
      cheque: ""
    });
  };

  // Handle on-account payment mode toggle
  const handleOnAccountModeToggle = () => {
    setIsOnAccountMode(!isOnAccountMode);
    if (!isOnAccountMode) {
      // Switching to on-account mode - clear invoice selections
      setSelectedInvoiceIds(new Set());
      setInvoicePaymentModes(new Map());
      setReceivedAmount(0);
      resetSplitPayment();
    } else {
      // Switching back to invoice mode - clear on-account data
      setOnAccountInvoiceId(null);
      setReceivedAmount(0);
      resetSplitPayment();
    }
  };

  // Handle on-account payment submission
  const handleOnAccountPayment = () => {
    if (!selectedCustomerId || receivedAmount === 0 || !paymentDate) {
      toast({
        title: "Validation Error",
        description: "Please select a customer, enter a valid amount, and select a payment date.",
        variant: "destructive",
      });
      return;
    }

    // Check permission for the selected payment date
    if (!canCreatePaymentForDate(paymentDate)) {
      const isToday = format(paymentDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
      toast({
        title: "Permission Denied",
        description: isToday 
          ? "You don't have permission to create payments for today"
          : "You don't have permission to create payments for past dates",
        variant: "destructive",
      });
      return;
    }

    // Determine primary payment mode from split payment
    const cashAmount = parseFloat(splitPayment.cash) || 0;
    const cardAmount = parseFloat(splitPayment.card) || 0;
    const bankTransferAmount = parseFloat(splitPayment.bankTransfer) || 0;
    const chequeAmount = parseFloat(splitPayment.cheque) || 0;
    
    let primaryPaymentMode = 'cash';
    if (cardAmount > 0 && cardAmount >= cashAmount && cardAmount >= bankTransferAmount && cardAmount >= chequeAmount) {
      primaryPaymentMode = 'bank';
    } else if (bankTransferAmount > 0 && bankTransferAmount >= cashAmount && bankTransferAmount >= chequeAmount) {
      primaryPaymentMode = 'bank_transfer';
    } else if (chequeAmount > 0 && chequeAmount >= cashAmount) {
      primaryPaymentMode = 'cheque';
    }

    const paymentPayload = {
      customerId: parseInt(selectedCustomerId),
      saleId: onAccountInvoiceId,
      amount: receivedAmount,
      paymentMode: primaryPaymentMode,
      paymentDate: format(paymentDate, "yyyy-MM-dd"),
      remarks: remarks || (onAccountInvoiceId ? "On-account payment for invoice" : "On-account payment"),
      splitPayment: getSplitPaymentNumbers()
    };

    createOnAccountMutation.mutate(paymentPayload);
  };

  const handleEditPayment = (batchPayment: any) => {
    setEditingPayment(batchPayment);
    setReceivedAmount(batchPayment.totalAmount);
    setPaymentDate(new Date(batchPayment.paymentDate));
    setRemarks(batchPayment.remarks || '');

    // Set split payment amounts from batch
    setSplitPayment({
      cash: batchPayment.cashAmount ? batchPayment.cashAmount.toString() : "",
      card: batchPayment.cardAmount ? batchPayment.cardAmount.toString() : "",
      bankTransfer: batchPayment.bankTransferAmount ? batchPayment.bankTransferAmount.toString() : "",
      cheque: batchPayment.chequeAmount ? batchPayment.chequeAmount.toString() : ""
    });

    // Clear any selected invoices when editing
    setSelectedInvoiceIds(new Set());
    setInvoicePaymentModes(new Map());
    setIsEditing(true);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingPayment(null);
    setIsEditing(false);
    setReceivedAmount(0);
    setRemarks('');
    setSelectedInvoiceIds(new Set());
    setInvoicePaymentModes(new Map());
    resetSplitPayment();
  };

  const handlePaymentSubmit = () => {
    if (isEditing && editingPayment) {
      // Check permission for editing the payment
      if (!canEditPayment(editingPayment.paymentDate)) {
        const isToday = format(new Date(editingPayment.paymentDate), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
        toast({
          title: "Permission Denied",
          description: isToday 
            ? "You don't have permission to edit payments for today"
            : "You don't have permission to edit past date payments",
          variant: "destructive",
        });
        return;
      }

      // Handle update
      const paymentData = {
        batchId: editingPayment.batchId,
        amount: receivedAmount,
        paymentDate: format(paymentDate || new Date(), "yyyy-MM-dd"),
        remarks: remarks,
        splitPayment: getSplitPaymentNumbers()
      };
      updatePaymentMutation.mutate(paymentData);
      return;
    }

    // Handle on-account payment
    if (isOnAccountMode) {
      handleOnAccountPayment();
      return;
    }

    // Original create payment logic
    if (!selectedCustomerId || receivedAmount === 0 || !paymentDate) {
      toast({
        title: "Validation Error",
        description: "Please select a customer, enter a valid amount, and select a payment date.",
        variant: "destructive",
      });
      return;
    }

    // Check permission for the selected payment date
    if (!canCreatePaymentForDate(paymentDate)) {
      const isToday = format(paymentDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
      toast({
        title: "Permission Denied",
        description: isToday 
          ? "You don't have permission to create payments for today"
          : "You don't have permission to create payments for past dates",
        variant: "destructive",
      });
      return;
    }

    const selectedInvoices = displayedInvoices.filter(inv => selectedInvoiceIds.has(inv.id));

    const paymentPayload = {
      customerId: parseInt(selectedCustomerId),
      amount: receivedAmount,
      paymentDate: format(paymentDate, "yyyy-MM-dd"),
      remarks: remarks,
      invoiceIds: Array.from(selectedInvoiceIds),
      splitPayment: getSplitPaymentNumbers(),
      invoices: selectedInvoices.map(inv => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        balance: inv.balance,
        invoiceDate: inv.date,
        paymentMode: invoicePaymentModes.get(inv.id) || 'cash'
      }))
    };

    createPaymentMutation.mutate(paymentPayload);
  };

  // Handle email sending
  const handleEmail = async () => {
    if (!selectedCustomerId) {
      toast({
        title: "Error",
        description: "Please select a customer first",
        variant: "destructive",
      });
      return;
    }

    if (!emailAddress.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    if (groupedPaymentHistory.length === 0) {
      toast({
        title: "Error",
        description: "No payment history to email",
        variant: "destructive",
      });
      return;
    }

    try {
      const selectedCustomer = customers?.find(c => c.id.toString() === selectedCustomerId);
      
      // Generate PDF data for email attachment
      const doc = new jsPDF();
      
      // Add company header
      doc.setFontSize(16);
      doc.text('CUSTOMER PAYMENT HISTORY', 105, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text('TROPIFRUIT UK LTD', 105, 30, { align: 'center' });
      doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 105, 40, { align: 'center' });
      
      // Add customer info
      doc.setFontSize(10);
      doc.text(`Customer: ${selectedCustomer?.customer_name || 'Unknown'}`, 20, 55);
      doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 20, 65);
      
      // Prepare table data
      const tableData = groupedPaymentHistory.map((batch: any) => [
        batch.batchId.toString(),
        format(new Date(batch.paymentDate), "dd/MM/yyyy"),
        batch.invoices.slice(0, 2).join(', ') + (batch.invoices.length > 2 ? ` +${batch.invoices.length - 2} more` : ''),
        [
          batch.cashAmount > 0 ? `Cash: £${batch.cashAmount.toFixed(2)}` : '',
          batch.cardAmount > 0 ? `Card: £${batch.cardAmount.toFixed(2)}` : '',
          batch.bankTransferAmount > 0 ? `Transfer: £${batch.bankTransferAmount.toFixed(2)}` : '',
          batch.chequeAmount > 0 ? `Cheque: £${batch.chequeAmount.toFixed(2)}` : ''
        ].filter(Boolean).join('\n'),
        `£${batch.totalAmount.toFixed(2)}`,
        batch.remarks || '-'
      ]);
      
      // Add table
      autoTable(doc, {
        head: [['Payment ID', 'Date', 'Invoice No.', 'Payment Mode', 'Amount', 'Remarks']],
        body: tableData,
        startY: 75,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [240, 240, 240] },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 25 },
          2: { cellWidth: 40 },
          3: { cellWidth: 35 },
          4: { cellWidth: 25 },
          5: { cellWidth: 35 }
        }
      });

      // Convert PDF to base64
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      // Send email via API
      await apiRequest('POST', '/api/send-email', {
        to: emailAddress,
        subject: `Payment History - ${selectedCustomer?.customer_name || 'Customer'}`,
        body: `Please find attached the payment history for ${selectedCustomer?.customer_name || 'the customer'}.`,
        attachment: {
          filename: `Payment_History_${selectedCustomer?.customer_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Customer'}_${format(new Date(), "yyyy-MM-dd")}.pdf`,
          content: pdfBase64,
          contentType: 'application/pdf'
        }
      });

      toast({ 
        title: "Success", 
        description: "Payment history emailed successfully" 
      });
      setEmailAddress(""); // Reset email field after successful send
    } catch (error) {
      console.error('Error sending email:', error);
      toast({ 
        title: "Error", 
        description: "Failed to send email. Please try again.", 
        variant: "destructive" 
      });
    }
  };

  // Export functions
  const handlePDF = () => {
    if (groupedPaymentHistory.length === 0) return;
    
    const selectedCustomer = customers?.find(c => c.id.toString() === selectedCustomerId);
    const doc = new jsPDF();
    
    // Add company header
    doc.setFontSize(16);
    doc.text('CUSTOMER PAYMENT HISTORY', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text('TROPIFRUIT UK LTD', 105, 30, { align: 'center' });
    doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 105, 40, { align: 'center' });
    
    // Add customer info
    doc.setFontSize(10);
    doc.text(`Customer: ${selectedCustomer?.customer_name || 'Unknown'}`, 20, 55);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 20, 65);
    
    // Prepare table data
    const tableData = groupedPaymentHistory.map((batch: any) => [
      batch.batchId.toString(),
      format(new Date(batch.paymentDate), "dd/MM/yyyy"),
      batch.invoices.slice(0, 2).join(', ') + (batch.invoices.length > 2 ? ` +${batch.invoices.length - 2} more` : ''),
      [
        batch.cashAmount > 0 ? `Cash: £${batch.cashAmount.toFixed(2)}` : '',
        batch.cardAmount > 0 ? `Card: £${batch.cardAmount.toFixed(2)}` : '',
        batch.bankTransferAmount > 0 ? `Transfer: £${batch.bankTransferAmount.toFixed(2)}` : '',
        batch.chequeAmount > 0 ? `Cheque: £${batch.chequeAmount.toFixed(2)}` : ''
      ].filter(Boolean).join('\n'),
      `£${batch.totalAmount.toFixed(2)}`,
      batch.remarks || '-'
    ]);
    
    // Add table
    autoTable(doc, {
      head: [['Payment ID', 'Date', 'Invoice No.', 'Payment Mode', 'Amount', 'Remarks']],
      body: tableData,
      startY: 75,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [240, 240, 240] },
    });
    
    // Save PDF
    doc.save(`Payment_History_${selectedCustomer?.customer_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Customer'}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const handleExcel = () => {
    if (groupedPaymentHistory.length === 0) return;
    
    const selectedCustomer = customers?.find(c => c.id.toString() === selectedCustomerId);
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Add data sheet
    const ws = XLSX.utils.json_to_sheet(groupedPaymentHistory.map((batch: any) => ({
      'Payment ID': batch.batchId,
      'Date': format(new Date(batch.paymentDate), "dd/MM/yyyy"),
      'Invoice No.': batch.invoices.join(', '),
      'Cash Amount': batch.cashAmount.toFixed(2),
      'Card Amount': batch.cardAmount.toFixed(2),
      'Bank Transfer Amount': batch.bankTransferAmount.toFixed(2),
      'Cheque Amount': batch.chequeAmount.toFixed(2),
      'Total Amount': batch.totalAmount.toFixed(2),
      'Remarks': batch.remarks || '-'
    })));
    
    XLSX.utils.book_append_sheet(wb, ws, 'Payment History');
    
    // Save file
    XLSX.writeFile(wb, `Payment_History_${selectedCustomer?.customer_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Customer'}_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const handleCopy = () => {
    if (groupedPaymentHistory.length === 0) return;
    
    const headers = ['Payment ID', 'Date', 'Invoice No.', 'Payment Mode', 'Amount', 'Remarks'];
    const rows = groupedPaymentHistory.map((batch: any) => [
      batch.batchId,
      format(new Date(batch.paymentDate), "dd/MM/yyyy"),
      batch.invoices.join(', '),
      [
        batch.cashAmount > 0 ? `Cash: £${batch.cashAmount.toFixed(2)}` : '',
        batch.cardAmount > 0 ? `Card: £${batch.cardAmount.toFixed(2)}` : '',
        batch.bankTransferAmount > 0 ? `Transfer: £${batch.bankTransferAmount.toFixed(2)}` : '',
        batch.chequeAmount > 0 ? `Cheque: £${batch.chequeAmount.toFixed(2)}` : ''
      ].filter(Boolean).join('; '),
      `£${batch.totalAmount.toFixed(2)}`,
      batch.remarks || '-'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join('\t')).join('\n');
    
    navigator.clipboard.writeText(csvContent).then(() => {
      toast({ title: "Success", description: "Payment history copied to clipboard" });
    }).catch(() => {
      toast({ title: "Error", description: "Failed to copy to clipboard", variant: "destructive" });
    });
  };

  const handlePrint = () => {
    if (groupedPaymentHistory.length === 0) return;
    
    const selectedCustomer = customers?.find(c => c.id.toString() === selectedCustomerId);
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Customer Payment History</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.customer-info{margin-bottom:15px;font-weight:bold;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      
      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>CUSTOMER PAYMENT HISTORY</h2>');
      printWindow.document.write('<p>TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ</p>');
      printWindow.document.write('</div>');
      
      // Add customer info
      printWindow.document.write('<div class="customer-info">');
      printWindow.document.write(`<strong>Customer:</strong> ${selectedCustomer?.customer_name || 'Unknown'}<br>`);
      printWindow.document.write(`<strong>Generated:</strong> ${format(new Date(), "dd/MM/yyyy HH:mm")}`);
      printWindow.document.write('</div>');
      
      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Payment ID</th><th>Date</th><th>Invoice No.</th><th>Payment Mode</th><th>Amount</th><th>Remarks</th>');
      printWindow.document.write('</tr></thead><tbody>');
      
      groupedPaymentHistory.forEach((batch: any) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${batch.batchId}</td>`);
        printWindow.document.write(`<td>${format(new Date(batch.paymentDate), "dd/MM/yyyy")}</td>`);
        printWindow.document.write(`<td>${batch.invoices.join(', ')}</td>`);
        const paymentModes = [
          batch.cashAmount > 0 ? `Cash: £${batch.cashAmount.toFixed(2)}` : '',
          batch.cardAmount > 0 ? `Card: £${batch.cardAmount.toFixed(2)}` : '',
          batch.bankTransferAmount > 0 ? `Transfer: £${batch.bankTransferAmount.toFixed(2)}` : '',
          batch.chequeAmount > 0 ? `Cheque: £${batch.chequeAmount.toFixed(2)}` : ''
        ].filter(Boolean).join('<br>');
        printWindow.document.write(`<td>${paymentModes}</td>`);
        printWindow.document.write(`<td>£${batch.totalAmount.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${batch.remarks || '-'}</td>`);
        printWindow.document.write('</tr>');
      });
      
      printWindow.document.write('</tbody></table>');
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  // Calculate balances for each invoice
  const invoicesWithBalance = outstandingInvoices?.map((invoice) => {
    const paid = invoice.paidAmount || 0;
    const balance = invoice.totalAmount - paid;
    return { ...invoice, balance, paid };
  }) || [];

  const filteredInvoices = invoicesWithBalance.filter((invoice) =>
    invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateRunningBalance = () => {
    let runningBal = 0;
    return filteredInvoices.map((invoice) => {
      runningBal += invoice.balance;
      return { ...invoice, runningBal };
    });
  };

  const displayedInvoices = calculateRunningBalance();
  const totalOutstandingBalance = displayedInvoices.reduce((sum, invoice) => sum + invoice.balance, 0);

  // Calculate selected invoices total
  const selectedInvoices = displayedInvoices.filter(inv => selectedInvoiceIds.has(inv.id));
  const selectedTotal = selectedInvoices.reduce((sum, inv) => sum + inv.balance, 0);
  const remainingBalance = selectedTotal - receivedAmount;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Customer Payment</h1>
            <div className="text-sm text-gray-500">
              TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ, ...
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Payment Form */}
        <Card>
          <CardContent className="p-6">
            {/* Payment Mode Toggle */}
            <div className="mb-4">
              <div className="flex items-center gap-4">
                <Button
                  variant={!isOnAccountMode ? "default" : "outline"}
                  onClick={() => !isOnAccountMode || handleOnAccountModeToggle()}
                  className="flex items-center gap-2"
                >
                  Invoice Payment
                </Button>
                <Button
                  variant={isOnAccountMode ? "default" : "outline"}
                  onClick={() => isOnAccountMode || handleOnAccountModeToggle()}
                  className="flex items-center gap-2"
                >
                  On-Account Payment
                </Button>
              </div>
            </div>

            {/* First Row: Customer Selection and Invoice/Split Payment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div>
                <Label htmlFor="customer">Select Customer:</Label>
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingCustomers ? (
                      <SelectItem value="disabled" disabled>Loading customers...</SelectItem>
                    ) : customers && customers.length > 0 ? (
                      customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.customer_name}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="disabled" disabled>No customers found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {!isOnAccountMode ? (
                <div>
                  <Label>Selected Invoices Total:</Label>
                  <div className="p-2 border rounded bg-gray-50">
                    <span className="font-semibold text-lg">£{selectedTotal.toFixed(2)}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      ({selectedInvoiceIds.size} invoice{selectedInvoiceIds.size !== 1 ? 's' : ''} selected)
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <Label>Selected Invoice for On-Account Payment:</Label>
                  <div className="p-2 border rounded bg-gray-50">
                    {onAccountInvoiceId ? (
                      <div>
                        <span className="font-semibold">
                          {displayedInvoices.find(inv => inv.id === onAccountInvoiceId)?.invoiceNumber || "Unknown"}
                        </span>
                        <div className="text-sm text-gray-600 mt-1">
                          Balance: £{displayedInvoices.find(inv => inv.id === onAccountInvoiceId)?.balance.toFixed(2) || "0.00"}
                          {displayedInvoices.find(inv => inv.id === onAccountInvoiceId)?.balance < 0 && (
                            <span className="text-red-600 ml-2">(Credit Invoice)</span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setOnAccountInvoiceId(null);
                            setReceivedAmount(0);
                            setRemarks("");
                          }}
                          className="text-xs mt-1 p-0 h-auto text-red-600 hover:text-red-800"
                        >
                          Clear Selection
                        </Button>
                      </div>
                    ) : (
                      <span className="text-gray-500">No invoice selected - Pure on-account payment</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Second Row: Split Payment - Full Width */}
            <div className="mb-4">
              <Label>Split Payment:</Label>
              <div className="p-4 border rounded bg-gray-50 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium min-w-[60px]">Cash:</Label>
                    <Input
                      type="number"
                      value={splitPayment.cash}
                      onChange={(e) => handleSplitPaymentChange('cash', e.target.value)}
                      className="flex-1 h-9 text-sm"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium min-w-[60px]">Card:</Label>
                    <Input
                      type="number"
                      value={splitPayment.card}
                      onChange={(e) => handleSplitPaymentChange('card', e.target.value)}
                      className="flex-1 h-9 text-sm"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium min-w-[60px]">Transfer:</Label>
                    <Input
                      type="number"
                      value={splitPayment.bankTransfer}
                      onChange={(e) => handleSplitPaymentChange('bankTransfer', e.target.value)}
                      className="flex-1 h-9 text-sm"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium min-w-[60px]">Cheque:</Label>
                    <Input
                      type="number"
                      value={splitPayment.cheque}
                      onChange={(e) => handleSplitPaymentChange('cheque', e.target.value)}
                      className="flex-1 h-9 text-sm"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-700 border-t pt-2 text-center">
                  Total: £{((parseFloat(splitPayment.cash) || 0) + (parseFloat(splitPayment.card) || 0) + (parseFloat(splitPayment.bankTransfer) || 0) + (parseFloat(splitPayment.cheque) || 0)).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Third Row: Payment Date and Received Amount */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <Label>Payment Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !paymentDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {paymentDate ? format(paymentDate, "dd/MM/yyyy") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={paymentDate}
                      onSelect={(date) => {
                        if (date && !canCreatePaymentForDate(date)) {
                          const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                          toast({
                            title: "Permission Denied",
                            description: isToday 
                              ? "You don't have permission to create payments for today"
                              : "You don't have permission to select past dates",
                            variant: "destructive",
                          });
                          return;
                        }
                        setPaymentDate(date);
                      }}
                      disabled={(date) => !canCreatePaymentForDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {userPermissions && (
                  <div className="text-xs text-gray-500 mt-1">
                    {userPermissions.current_editing === false && (
                      <p>Current date editing is disabled</p>
                    )}
                    {userPermissions.editing !== true && (
                      <p>Past date editing is disabled - contact admin for permissions</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="received-amount">Received Amount:</Label>
                <Input
                  id="received-amount"
                  type="number"
                  value={receivedAmount}
                  onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)}
                  placeholder="Enter amount (negative for credit invoices)"
                  step="0.01"
                />
                {receivedAmount < 0 && (
                  <div className="text-xs text-blue-600 mt-1">
                    Negative amount for credit invoice payment
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div>
                <Label htmlFor="remarks">Remarks:</Label>
                <Input
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Enter remarks"
                />
              </div>

              <div>
                <Label>Remaining Balance:</Label>
                <div className="p-2 border rounded bg-gray-50">
                  <span className={`font-semibold text-lg ${remainingBalance > 0 ? 'text-red-600' : remainingBalance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                    £{remainingBalance.toFixed(2)}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    {remainingBalance > 0 ? 'remaining' : remainingBalance < 0 ? 'overpaid' : 'exact'}
                  </span>
                </div>
              </div>

              <div className="flex items-end gap-2">
                {isEditing && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCancelEdit}
                    disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  className="w-full"
                  onClick={handlePaymentSubmit}
                  disabled={
                    (isEditing
                      ? updatePaymentMutation.isPending
                      : isOnAccountMode 
                        ? createOnAccountMutation.isPending || receivedAmount === 0
                        : createPaymentMutation.isPending || selectedInvoiceIds.size === 0)
                  }
                >
                  {isEditing
                    ? (updatePaymentMutation.isPending ? 'Updating...' : 'Update Payment')
                    : isOnAccountMode
                      ? (createOnAccountMutation.isPending ? 'Processing...' : 'Record On-Account Payment')
                      : (createPaymentMutation.isPending ? 'Processing...' : 'Record Payment')
                  }
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Invoices Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>
                {isOnAccountMode ? "Outstanding Invoices (Select for On-Account Payment)" : "Outstanding Invoices"}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search invoices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
                <Button variant="outline" size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {!isOnAccountMode && (
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.size === displayedInvoices.length && displayedInvoices.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded"
                      />
                    </TableHead>
                  )}
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Running Balance</TableHead>
                  {isOnAccountMode && <TableHead>Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className={selectedInvoiceIds.has(invoice.id) ? 'bg-blue-50' : ''}>
                    {!isOnAccountMode && (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedInvoiceIds.has(invoice.id)}
                          onChange={(e) => handleInvoiceSelection(invoice.id, e.target.checked)}
                          className="rounded"
                        />
                      </TableCell>
                    )}
                    <TableCell>{format(new Date(invoice.date || ''), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-right">£{invoice.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-right">£{invoice.paid.toFixed(2)}</TableCell>
                    <TableCell className={`text-right ${invoice.balance < 0 ? 'text-red-600 font-semibold' : ''}`}>
                      £{invoice.balance.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {invoice.balance < 0 ? (
                        <span className="text-red-600 text-xs bg-red-50 px-2 py-1 rounded">Credit</span>
                      ) : (
                        <span className="text-blue-600 text-xs bg-blue-50 px-2 py-1 rounded">Invoice</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!isOnAccountMode && selectedInvoiceIds.has(invoice.id) ? (
                        <span className="text-green-600 text-sm">Selected</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">£{invoice.runningBal.toFixed(2)}</TableCell>
                    {isOnAccountMode && (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setOnAccountInvoiceId(invoice.id);
                            setReceivedAmount(invoice.balance); // Set amount to actual balance (can be negative for credit invoices)
                            setRemarks(`On-account payment for invoice ${invoice.invoiceNumber}`);
                          }}
                          className="text-xs"
                        >
                          Pay On Account
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {displayedInvoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isOnAccountMode ? 10 : 9} className="text-center py-4">
                      No outstanding invoices found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            
            {/* Summary Row */}
            {displayedInvoices.length > 0 && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Total Outstanding:</span>
                    <div className="text-lg font-bold">£{totalOutstandingBalance.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="font-medium">Credit Invoices:</span>
                    <div className="text-lg font-bold text-red-600">
                      £{displayedInvoices.filter(inv => inv.balance < 0).reduce((sum, inv) => sum + inv.balance, 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Unpaid Invoices:</span>
                    <div className="text-lg font-bold text-blue-600">
                      £{displayedInvoices.filter(inv => inv.balance > 0).reduce((sum, inv) => sum + inv.balance, 0).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Net Balance:</span>
                    <div className={`text-lg font-bold ${totalOutstandingBalance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      £{totalOutstandingBalance.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment History Table */}
        {selectedCustomerId && (
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <CardTitle>Payment History</CardTitle>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
                  {/* Email section */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Input
                      type="email"
                      placeholder="Enter email address"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      className="w-full sm:w-48 h-8 text-sm"
                    />
                    <Button size="sm" variant="outline" className="flex items-center gap-1 whitespace-nowrap" onClick={handleEmail}>
                      <Mail size={14} />
                      Email
                    </Button>
                  </div>
                  {/* Export buttons */}
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                      <FileText size={14} />
                      PDF
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                      <Download size={14} />
                      Excel
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                      <Copy size={14} />
                      Copy
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                      <Printer size={14} />
                      Print
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Invoice No.</TableHead>
                    <TableHead>Payment Mode</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="w-40">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedPaymentHistory.sort((a: any, b: any) => b.batchId - a.batchId).map((batch: any) => (
                    <TableRow key={batch.batchId}>
                      <TableCell className="font-mono">{batch.batchId}</TableCell>
                      <TableCell>{format(new Date(batch.paymentDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {batch.invoices.slice(0, 2).join(', ')}
                          {batch.invoices.length > 2 && ` +${batch.invoices.length - 2} more`}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-1">
                          {batch.cashAmount > 0 && <div>Cash: £{batch.cashAmount.toFixed(2)}</div>}
                          {batch.cardAmount > 0 && <div>Card: £{batch.cardAmount.toFixed(2)}</div>}
                          {batch.bankTransferAmount > 0 && <div>Transfer: £{batch.bankTransferAmount.toFixed(2)}</div>}
                          {batch.chequeAmount > 0 && <div>Cheque: £{batch.chequeAmount.toFixed(2)}</div>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">£{batch.totalAmount.toFixed(2)}</TableCell>
                      <TableCell>{batch.remarks || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {canEditPayment(batch.paymentDate) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditPayment(batch)}
                              title="Edit Payment"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                <path d="m15 5 4 4" />
                              </svg>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              title="You don't have permission to edit this payment"
                              className="text-gray-400 cursor-not-allowed"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                <path d="m15 5 4 4" />
                              </svg>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/print/dot-matrix-payment/${batch.batchId}`, '_blank')}
                            title="Print Dot Matrix Receipt"
                          >
                            <Receipt className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              // Determine primary payment type for receipt
                              const primaryType = batch.cashAmount >= batch.cardAmount && batch.cashAmount >= batch.bankTransferAmount && batch.cashAmount >= batch.chequeAmount ? 'cash' :
                                batch.cardAmount >= batch.bankTransferAmount && batch.cardAmount >= batch.chequeAmount ? 'card' :
                                  batch.bankTransferAmount >= batch.chequeAmount ? 'bank_transfer' : 'cheque';
                              window.open(`/print/payment-receipt/${batch.batchId}/${primaryType}`, '_blank');
                            }}
                            title="Print Payment Receipt"
                          >
                            <FileCheck className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {groupedPaymentHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4">
                        No payment history found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}