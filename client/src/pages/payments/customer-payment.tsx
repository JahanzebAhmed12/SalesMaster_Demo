import { useState, useEffect, useMemo } from "react";
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
import Pagination from "@/components/ui/pagination";
import { useTablePagination } from "@/hooks/useTablePagination";


import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useBackdatePermissions } from "@/hooks/usePermissions";
import { isPastDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useBusinessDate } from "@/hooks/useBusinessDate";
import type { Customer, Sale, Payment, InsertPayment } from "@shared/schema";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type InvoiceWithBalance = Sale & {
  balance: number;
  paid: number;
  runningBal: number;
};

type SplitPayment = {
  cash: string;
  card: string;
  bankTransfer: string;
  cheque: string;
};

type PaymentDistribution = {
  invoiceId?: number;
  invoiceNumber?: string;
  amount: number;
  isOnAccount: boolean;
  paymentMode: string;
};



export default function CustomerPayment() {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
  const [invoicePaymentModes, setInvoicePaymentModes] = useState<Map<number, string>>(new Map());
  const [invoicePaymentConfigs, setInvoicePaymentConfigs] = useState<Map<number, any>>(new Map());

  const [paymentDate, setPaymentDate] = useState<Date | undefined>(() => {
    // Don't initialize with any date initially, let the useEffect handle it
    return undefined;
  });
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const [remarks, setRemarks] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState<string>("");

  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [splitPayment, setSplitPayment] = useState<SplitPayment>({
    cash: "",
    card: "",
    bankTransfer: "",
    cheque: ""
  });

  const [paymentDistribution, setPaymentDistribution] = useState<PaymentDistribution[]>([]);

  let [onAccountAmount, setOnAccountAmount] = useState<number>(0);
  const [emailAddress, setEmailAddress] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  // Business date
  const { businessDate, isLoading: isLoadingBusinessDate } = useBusinessDate();

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
    if (!userPermissions || !businessDate) return false;

    const businessDateFormatted = format(businessDate, 'yyyy-MM-dd');
    const paymentDateFormatted = format(new Date(paymentDate), 'yyyy-MM-dd');

    if (paymentDateFormatted === businessDateFormatted) {
      // For business date payments, check current_editing permission
      return userPermissions.current_editing !== false;
    } else {
      // For back date payments, check editing permission
      return userPermissions.editing === true;
    }
  };

  // Check if user can create new payments for a specific date
  const canCreatePaymentForDate = (date: Date) => {
    if (!userPermissions || !businessDate) return false;

    const businessDateFormatted = format(businessDate, 'yyyy-MM-dd');
    const selectedDateFormatted = format(date, 'yyyy-MM-dd');

    if (selectedDateFormatted === businessDateFormatted) {
      // For business date, check current_editing permission
      return userPermissions.current_editing !== false;
    } else if (date < businessDate) {
      // For past dates (before business date), check editing permission
      return userPermissions.editing === true;
    } else {
      // For future dates (after business date), allow (assuming future dates are always allowed)
      return true;
    }
  };

  // Set initial payment date to business date
  useEffect(() => {
    if (businessDate) {
      setPaymentDate(businessDate);
    }
  }, [businessDate]);

  // Reset email field when customer changes
  useEffect(() => {
    setEmailAddress("");
  }, [selectedCustomerId]);

  // Reset on-account amount when customer changes
  useEffect(() => {
    // Only reset if no invoices are selected to avoid interfering with invoice selection
    if (selectedInvoiceIds.size === 0) {
      setOnAccountAmount(0);
    }
  }, [selectedCustomerId, selectedInvoiceIds.size]);

  // Fetch customers
  const { data: customersData, isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  // Sort customers alphabetically by name
  const customers = useMemo(() => {
    if (!customersData) return [];
    return [...customersData].sort((a, b) => 
      a.customer_name.localeCompare(b.customer_name, undefined, { sensitivity: 'base' })
    );
  }, [customersData]);

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
  const groupedPaymentHistory = useMemo(() => {
    return paymentHistory?.reduce((acc: any[], payment: any) => {
      const batchId = payment.batchId;
      if (!batchId) return acc;

      const existingBatch = acc.find(batch => batch.batchId === batchId);
      if (existingBatch) {
        // Only add positive amounts to the total (credits are applied automatically)
        if (payment.amount > 0) {
          existingBatch.totalAmount += payment.amount;

          // Aggregate positive amounts by payment mode
          const mode = payment.paymentMode;
          if (mode === 'cash') existingBatch.cashAmount += payment.amount;
          else if (mode === 'bank') existingBatch.cardAmount += payment.amount;
          else if (mode === 'bank_transfer') existingBatch.bankTransferAmount += payment.amount;
          else if (mode === 'cheque') existingBatch.chequeAmount += payment.amount;
        }

        // Always add invoice numbers
        const invoiceNumber = payment.invoiceNumber || 'On Account';
        if (!existingBatch.invoices.includes(invoiceNumber)) {
          existingBatch.invoices.push(invoiceNumber);
        }
      } else {
        acc.push({
          batchId: batchId,
          paymentDate: payment.paymentDate,
          totalAmount: payment.amount > 0 ? payment.amount : 0, // Only positive amounts
          remarks: payment.remarks,
          invoices: [payment.invoiceNumber || 'On Account'],
          cashAmount: payment.paymentMode === 'cash' && payment.amount > 0 ? payment.amount : 0,
          cardAmount: payment.paymentMode === 'bank' && payment.amount > 0 ? payment.amount : 0,
          bankTransferAmount: payment.paymentMode === 'bank_transfer' && payment.amount > 0 ? payment.amount : 0,
          chequeAmount: payment.paymentMode === 'cheque' && payment.amount > 0 ? payment.amount : 0,
        });
      }
      return acc;
    }, []) || [];
  }, [paymentHistory]);

  // Calculate balances for each invoice
  const invoicesWithBalance = useMemo(() =>
    outstandingInvoices?.map((invoice) => {
      const paid = invoice.paidAmount || 0;
      const balance = invoice.totalAmount - paid;
      return { ...invoice, balance, paid };
    }) || [],
    [outstandingInvoices]
  );

  const filteredInvoices = useMemo(() =>
    invoicesWithBalance.filter((invoice) =>
      invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [invoicesWithBalance, searchTerm]
  );

  const calculateRunningBalance = useMemo(() => {
    let runningBal = 0;
    return filteredInvoices.map((invoice) => {
      runningBal += invoice.balance;
      return { ...invoice, runningBal };
    });
  }, [filteredInvoices]);

  const displayedInvoices = calculateRunningBalance;

  // Pagination for outstanding invoices
  const {
    currentPage: invoicesCurrentPage,
    totalPages: invoicesTotalPages,
    itemsPerPage: invoicesItemsPerPage,
    startIndex: invoicesStartIndex,
    endIndex: invoicesEndIndex,
    paginationProps: invoicesPaginationProps
  } = useTablePagination({
    totalItems: displayedInvoices.length,
    initialItemsPerPage: 10
  });

  const paginatedInvoices = useMemo(() =>
    displayedInvoices.slice(invoicesStartIndex, invoicesEndIndex),
    [displayedInvoices, invoicesStartIndex, invoicesEndIndex]
  );

  // Pagination for payment history
  const {
    currentPage: historyCurrentPage,
    totalPages: historyTotalPages,
    itemsPerPage: historyItemsPerPage,
    startIndex: historyStartIndex,
    endIndex: historyEndIndex,
    paginationProps: historyPaginationProps
  } = useTablePagination({
    totalItems: groupedPaymentHistory.length,
    initialItemsPerPage: 10
  });

  const paginatedPaymentHistory = useMemo(() =>
    groupedPaymentHistory
      .sort((a: any, b: any) => b.batchId - a.batchId)
      .slice(historyStartIndex, historyEndIndex),
    [groupedPaymentHistory, historyStartIndex, historyEndIndex]
  );

  // Payment mode - for now defaulting to 'mixed' but this could be a state variable if needed
  const paymentMode = 'mixed';

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

  // Mutation for deleting a payment
  const deletePaymentMutation = useMutation<any, Error, any>({
    mutationFn: (batchId: number) => apiRequest("DELETE", `/api/payments/batch/${batchId}`),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment deleted successfully. All related transactions have been reverted.",
      });
      refetchOutstandingInvoices();
      refetchPaymentHistory();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete payment.",
        variant: "destructive",
      });
    },
  });



  // Mutation for creating a new payment
  const createPaymentMutation = useMutation<any, Error, any>({
    mutationFn: (paymentData) => apiRequest("POST", "/api/payments/customer-bulk", paymentData),
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
      setOnAccountAmount(0);
      setSelectedCustomerId(""); // Reset customer selection
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

  // Mutation for deleting a payment

  // Handle checkbox selection
  const handleInvoiceSelection = (invoiceId: number, checked: boolean) => {
    const newSelection = new Set(selectedInvoiceIds);
    const newPaymentModes = new Map(invoicePaymentModes);
    const newConfigs = new Map(invoicePaymentConfigs);

    if (checked) {
      newSelection.add(invoiceId);
      // Set default payment mode to cash for new selections
      if (!newPaymentModes.has(invoiceId)) {
        newPaymentModes.set(invoiceId, 'cash');
      }

      // For mixed payment mode, set default payment type to direct
      if (paymentMode === 'mixed') {
        const invoice = displayedInvoices.find(inv => inv.id === invoiceId);
        if (invoice) {
          newConfigs.set(invoiceId, {
            invoiceId,
            paymentType: 'direct',
            amount: invoice.balance
          });
        }
      }
    } else {
      newSelection.delete(invoiceId);
      newPaymentModes.delete(invoiceId);
      newConfigs.delete(invoiceId);
    }

    setSelectedInvoiceIds(newSelection);
    setInvoicePaymentModes(newPaymentModes);
    setInvoicePaymentConfigs(newConfigs);

    // Calculate net amount for selected invoices (positive invoices minus credits)
    const selectedInvoices = displayedInvoices.filter(inv => newSelection.has(inv.id));
    const positiveInvoicesTotal = selectedInvoices.filter(inv => inv.balance > 0).reduce((sum, inv) => sum + inv.balance, 0);
    const creditInvoicesTotal = selectedInvoices.filter(inv => inv.balance < 0).reduce((sum, inv) => sum + Math.abs(inv.balance), 0);
    const netInvoicesAmount = positiveInvoicesTotal - creditInvoicesTotal;
    const totalAmount = Math.max(0, netInvoicesAmount) + onAccountAmount;

    // Update received amount to reflect net payment needed
    setReceivedAmount(totalAmount);
    
    // Auto-fill split payment with the net amount (user can adjust if needed)
    if (totalAmount > 0) {
      setSplitPayment(prev => ({
        ...prev,
        cash: totalAmount.toFixed(2),
        card: "",
        bankTransfer: "",
        cheque: ""
      }));
    } else {
      resetSplitPayment();
    }
  };

  // Handle select all checkbox
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(displayedInvoices.map(inv => inv.id));
      const newPaymentModes = new Map(invoicePaymentModes);
      const newConfigs = new Map(invoicePaymentConfigs);

      // Set default payment mode for all invoices
      displayedInvoices.forEach(inv => {
        if (!newPaymentModes.has(inv.id)) {
          newPaymentModes.set(inv.id, 'cash');
        }

        // For mixed payment mode, set default payment type to direct
        if (paymentMode === 'mixed') {
          newConfigs.set(inv.id, {
            invoiceId: inv.id,
            paymentType: 'direct',
            amount: inv.balance
          });
        }
      });

      setSelectedInvoiceIds(allIds);
      setInvoicePaymentModes(newPaymentModes);
      setInvoicePaymentConfigs(newConfigs);
      
      // Calculate net amount (positive invoices minus credits)
      const positiveInvoicesTotal = displayedInvoices.filter(inv => inv.balance > 0).reduce((sum, inv) => sum + inv.balance, 0);
      const creditInvoicesTotal = displayedInvoices.filter(inv => inv.balance < 0).reduce((sum, inv) => sum + Math.abs(inv.balance), 0);
      const netInvoicesAmount = positiveInvoicesTotal - creditInvoicesTotal;
      const totalAmount = Math.max(0, netInvoicesAmount) + onAccountAmount;

      setReceivedAmount(totalAmount);
      
      // Auto-fill split payment with the net amount
      if (totalAmount > 0) {
        setSplitPayment(prev => ({
          ...prev,
          cash: totalAmount.toFixed(2),
          card: "",
          bankTransfer: "",
          cheque: ""
        }));
      } else {
        resetSplitPayment();
      }
    } else {
      setSelectedInvoiceIds(new Set());
      setInvoicePaymentModes(new Map());
      setInvoicePaymentConfigs(new Map());
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

  // Handle on-account amount change
  const handleOnAccountAmountChange = (amount: number) => {
    setOnAccountAmount(amount);

    // Recalculate net payment amount
    const selectedInvoices = displayedInvoices.filter(inv => selectedInvoiceIds.has(inv.id));
    const positiveInvoicesTotal = selectedInvoices.filter(inv => inv.balance > 0).reduce((sum, inv) => sum + inv.balance, 0);
    const creditInvoicesTotal = selectedInvoices.filter(inv => inv.balance < 0).reduce((sum, inv) => sum + Math.abs(inv.balance), 0);
    const netInvoicesAmount = positiveInvoicesTotal - creditInvoicesTotal;
    const totalAmount = Math.max(0, netInvoicesAmount) + amount;

    setReceivedAmount(totalAmount);
    
    // Update split payment to reflect new total
    const currentSplitTotal = (parseFloat(splitPayment.cash) || 0) + (parseFloat(splitPayment.card) || 0) + 
                             (parseFloat(splitPayment.bankTransfer) || 0) + (parseFloat(splitPayment.cheque) || 0);
    
    if (currentSplitTotal === 0 && totalAmount > 0) {
      // Auto-fill cash if no split payment is set
      setSplitPayment(prev => ({
        ...prev,
        cash: totalAmount.toFixed(2)
      }));
    }
  };

  // Handle split payment amount changes
  const handleSplitPaymentChange = (type: string, value: string) => {
    setSplitPayment(prev => ({
      ...prev,
      [type]: value
    }));

    // Don't automatically update receivedAmount - let user set it manually
    // The receivedAmount should represent the total payment (split payments + on-account)
  };

  // Convert split payment strings to numbers for backend
  const getSplitPaymentNumbers = () => ({
    cash: parseFloat(splitPayment.cash) || 0,
    bank: parseFloat(splitPayment.card) || 0, // Map 'card' to 'bank' for backend
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

  // Validation helper for payments
  const validatePayment = () => {
    if (!selectedCustomerId || !paymentDate) {
      toast({
        title: "Validation Error",
        description: "Please select a customer and payment date.",
        variant: "destructive",
      });
      return false;
    }

    // Check if there's something to pay (invoices or on-account amount)
    // In edit mode, we're more lenient as we're updating an existing payment
    if (!isEditing && selectedInvoiceIds.size === 0 && onAccountAmount === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one invoice or enter an on-account amount.",
        variant: "destructive",
      });
      return false;
    }

    // For mixed positive/negative invoices, allow zero received amount if net is zero
    const selectedInvoices = displayedInvoices.filter(inv => selectedInvoiceIds.has(inv.id));
    const positiveTotal = selectedInvoices.filter(inv => inv.balance > 0).reduce((sum, inv) => sum + inv.balance, 0);
    const creditTotal = selectedInvoices.filter(inv => inv.balance < 0).reduce((sum, inv) => sum + Math.abs(inv.balance), 0);
    const netInvoiceAmount = positiveTotal - creditTotal;
    const expectedPayment = Math.max(0, netInvoiceAmount) + onAccountAmount;

    if (receivedAmount < 0) {
      toast({
        title: "Validation Error",
        description: "Payment amount cannot be negative.",
        variant: "destructive",
      });
      return false;
    }

    // Allow zero payment only if net invoice amount is zero and no on-account
    if (receivedAmount === 0 && expectedPayment > 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid payment amount.",
        variant: "destructive",
      });
      return false;
    }

    // Check permission for the selected payment date
    if (!canCreatePaymentForDate(paymentDate)) {
      const isBusinessDate = businessDate && format(paymentDate, 'yyyy-MM-dd') === format(businessDate, 'yyyy-MM-dd');
      toast({
        title: "Permission Denied",
        description: isBusinessDate
          ? "You don't have permission to create payments for the current business date"
          : "You don't have permission to create payments for past dates",
        variant: "destructive",
      });
      return false;
    }

    // Validate payment amounts
    const totalSplitAmount = Object.values(splitPayment).reduce((sum, val) => {
      return sum + (parseFloat(val as string) || 0);
    }, 0);

    // The received amount should equal the split payment total
    if (Math.abs(receivedAmount - totalSplitAmount) > 0.01) {
      toast({
        title: "Validation Error",
        description: `Received amount (£${receivedAmount.toFixed(2)}) must equal split payment total (£${totalSplitAmount.toFixed(2)}).`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  // Handle unified payment submission
  const handleUnifiedPaymentSubmit = (isEditMode = false) => {
    if (!validatePayment()) {
      return;
    }

    // Get selected invoices and separate positive and negative invoices
    const selectedInvoices = displayedInvoices
      .filter(inv => selectedInvoiceIds.has(inv.id))
      .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());

    const positiveInvoices = selectedInvoices.filter(inv => inv.balance > 0);
    const creditInvoices = selectedInvoices.filter(inv => inv.balance < 0);

    // Debug logging for edit mode
    if (isEditMode) {
      console.log('DEBUG - selectedInvoiceIds:', Array.from(selectedInvoiceIds));
      console.log('DEBUG - positiveInvoices:', positiveInvoices.map(inv => ({ id: inv.id, number: inv.invoiceNumber, balance: inv.balance })));
      console.log('DEBUG - creditInvoices:', creditInvoices.map(inv => ({ id: inv.id, number: inv.invoiceNumber, balance: inv.balance })));
    }

    // Get payment amounts by mode
    const cashAmount = parseFloat(splitPayment.cash) || 0;
    const cardAmount = parseFloat(splitPayment.card) || 0;
    const bankTransferAmount = parseFloat(splitPayment.bankTransfer) || 0;
    const chequeAmount = parseFloat(splitPayment.cheque) || 0;
    const totalPayment = receivedAmount;

    // Build detailed payment distribution for mixed positive/negative invoices
    const paymentDistribution: Array<{
      invoiceId?: number;
      invoiceNumber?: string;
      amount: number;
      isOnAccount: boolean;
      paymentMode: string;
    }> = [];

    // Available payment methods with amounts
    let remainingPayments = [
      { mode: 'cash', amount: cashAmount },
      { mode: 'bank', amount: cardAmount },
      { mode: 'bank_transfer', amount: bankTransferAmount },
      { mode: 'cheque', amount: chequeAmount }
    ].filter(p => p.amount > 0);

    // Calculate total positive invoice amounts that need payment
    const totalPositiveAmount = positiveInvoices.reduce((sum, inv) => sum + inv.balance, 0);
    
    // Handle positive invoices: pay sequentially using available payment modes
    for (const posInv of positiveInvoices) {
      const invoiceAmount = posInv.balance;
      let remainingInvoiceAmount = invoiceAmount;
      
      // Pay this invoice using available payment modes sequentially
      for (let i = 0; i < remainingPayments.length && remainingInvoiceAmount > 0; i++) {
        const payment = remainingPayments[i];
        if (payment.amount <= 0) continue;
        
        // Use as much of this payment mode as needed/available for this invoice
        const paymentForThisInvoice = Math.min(remainingInvoiceAmount, payment.amount);
        
        if (paymentForThisInvoice > 0) {
          paymentDistribution.push({
            invoiceId: posInv.id,
            invoiceNumber: posInv.invoiceNumber,
            amount: Number(paymentForThisInvoice.toFixed(2)),
            isOnAccount: false,
            paymentMode: payment.mode
          });
          
          // Reduce remaining amounts
          remainingInvoiceAmount = Number((remainingInvoiceAmount - paymentForThisInvoice).toFixed(2));
          payment.amount = Number((payment.amount - paymentForThisInvoice).toFixed(2));
        }
      }
    }

    // For credit invoices: apply the credit (send negative amount)
    // Credits don't consume payment amounts, they just get marked as applied
    for (const creditInv of creditInvoices) {
      const primaryPaymentMode = remainingPayments.find(p => p.amount > 0)?.mode || 'cash';
      
      paymentDistribution.push({
        invoiceId: creditInv.id,
        invoiceNumber: creditInv.invoiceNumber,
        amount: Number(creditInv.balance.toFixed(2)), // Negative amount for credit (creditInv.balance is already negative)
        isOnAccount: false,
        paymentMode: primaryPaymentMode
      });
    }

    // Handle on-account payment with automatic application to unpaid invoices
    if (onAccountAmount > 0) {
      let remainingOnAccount = onAccountAmount;

      // First, get all unpaid invoices for this customer (excluding already selected ones)
      const unselectedUnpaidInvoices = displayedInvoices
        .filter(inv => !selectedInvoiceIds.has(inv.id) && inv.balance > 0)
        .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime()); // Oldest first

      // Apply on-account credit to unpaid invoices automatically
      for (const unpaidInv of unselectedUnpaidInvoices) {
        if (remainingOnAccount <= 0) break;

        const invoiceBalance = unpaidInv.balance;
        const paymentForThisInvoice = Math.min(remainingOnAccount, invoiceBalance);

        if (paymentForThisInvoice > 0) {
          // Find the best payment mode to use (prefer modes with remaining amounts)
          const availablePaymentMode = remainingPayments.find(p => p.amount > 0)?.mode || 'cash';

          paymentDistribution.push({
            invoiceId: unpaidInv.id,
            invoiceNumber: unpaidInv.invoiceNumber,
            amount: Number(paymentForThisInvoice.toFixed(2)),
            isOnAccount: true, // Mark as on-account application
            paymentMode: availablePaymentMode
          });

          remainingOnAccount = Number((remainingOnAccount - paymentForThisInvoice).toFixed(2));
        }
      }

      // Any remaining on-account amount stays as pure on-account credit
      if (remainingOnAccount > 0) {
        for (const payment of remainingPayments) {
          if (payment.amount <= 0 || remainingOnAccount <= 0) continue;

          const onAccountPayment = Math.min(payment.amount, remainingOnAccount);
          if (onAccountPayment > 0) {
            paymentDistribution.push({
              amount: Number(onAccountPayment.toFixed(2)),
              isOnAccount: true,
              paymentMode: payment.mode
            });

            payment.amount = Number((payment.amount - onAccountPayment).toFixed(2));
            remainingOnAccount = Number((remainingOnAccount - onAccountPayment).toFixed(2));
          }
        }
      }
    }

    // Calculate net total for payment distribution (positive amounts minus negative amounts)
    const totalDistributionAmount = paymentDistribution.reduce((sum, payment) => sum + payment.amount, 0);
    
    // Get all invoice IDs that will be affected (selected + auto-applied)
    const allAffectedInvoiceIds = new Set([
      ...Array.from(selectedInvoiceIds),
      ...paymentDistribution
        .filter(p => p.invoiceId && p.isOnAccount)
        .map(p => p.invoiceId!)
    ]);
    
    // Build payment payload with explicit distribution
    const paymentPayload = {
      customerId: parseInt(selectedCustomerId),
      amount: receivedAmount, // Use the actual payment amount entered by user
      paymentDate: format(paymentDate || new Date(), "yyyy-MM-dd"),
      remarks: remarks || "", // Only use manual remarks, no auto-generated ones
      splitPayment: getSplitPaymentNumbers(), // Use user's actual split payment amounts
      invoiceIds: Array.from(allAffectedInvoiceIds), // Include all affected invoices
      onAccountAmount: onAccountAmount,
      paymentSource: 'customer_payment',
      paymentDistribution: paymentDistribution, // Send explicit distribution with negative amounts for credits and auto-applications
      invoices: [] // Keep for backward compatibility
    };

    console.log('Payment payload:', JSON.stringify(paymentPayload, null, 2));
    console.log('Payment distribution details:', paymentDistribution);
    console.log('All affected invoice IDs:', Array.from(allAffectedInvoiceIds));

    if (isEditMode && editingPayment) {
      const editPayload = {
        ...paymentPayload,
        batchId: (editingPayment as any).batchId,
      };

      console.log('Edit payload:', JSON.stringify(editPayload, null, 2));
      updatePaymentMutation.mutate(editPayload);
    } else {
      // For new payments, use create mutation
      createPaymentMutation.mutate(paymentPayload);
    }
  };

  const handleEditPayment = async (batchPayment: any) => {
    console.log('Starting handleEditPayment with batchPayment:', batchPayment);
    setEditingPayment(batchPayment);
    setReceivedAmount(batchPayment.totalAmount);
    setPaymentDate(new Date(batchPayment.paymentDate));
    setRemarks(batchPayment.remarks || '');

    // Initialize payment distribution array
    const initialPaymentDistribution: PaymentDistribution[] = [];
    const invoiceIds = new Set<number>();
    let totalOnAccount = 0;

    try {
      // First, set the split payment UI state from the batch payment
      const splitPayment = {
        cash: batchPayment.cashAmount ? batchPayment.cashAmount.toString() : "",
        card: batchPayment.cardAmount ? batchPayment.cardAmount.toString() : "",
        bankTransfer: batchPayment.bankTransferAmount ? batchPayment.bankTransferAmount.toString() : "",
        cheque: batchPayment.chequeAmount ? batchPayment.chequeAmount.toString() : ""
      };
      console.log('Setting split payment:', splitPayment);
      setSplitPayment(splitPayment);

      // Fetch the payment details to get the full payment distribution
      console.log('Fetching batch details for batch ID:', batchPayment.batchId);
      const batchDetails = await apiRequest("GET", `/api/payments/batch/${batchPayment.batchId}`);
      console.log('Received batch details:', batchDetails);

      if (batchDetails.payments && Array.isArray(batchDetails.payments)) {
        console.log('Processing', batchDetails.payments.length, 'payments');

        // First, collect all invoice IDs and on-account amounts
        batchDetails.payments.forEach((payment: any, index: number) => {
          console.log(`Processing payment ${index + 1}:`, payment);

          if (payment.amount > 0) {
            const paymentEntry: PaymentDistribution = {
              invoiceId: payment.invoiceId,
              invoiceNumber: payment.invoiceNumber || `INV-${payment.invoiceId || 'ON-ACCOUNT'}`,
              amount: parseFloat(payment.amount),
              isOnAccount: payment.isOnAccount || !payment.invoiceId,
              paymentMode: payment.paymentMode || 'cash'
            };

            if (payment.invoiceId) {
              invoiceIds.add(payment.invoiceId);
            } else {
              totalOnAccount += paymentEntry.amount;
            }

            console.log('Adding payment entry:', paymentEntry);
            initialPaymentDistribution.push(paymentEntry);
          }
        });
      }

      console.log('Loaded payment distribution:', initialPaymentDistribution);

      // Update all the states at once to prevent multiple re-renders
      setSelectedInvoiceIds(invoiceIds);
      setOnAccountAmount(totalOnAccount);
      setPaymentDistribution(initialPaymentDistribution);

      // Process each payment in the batch to collect invoice IDs and on-account amounts
      if (batchDetails.payments) {
        batchDetails.payments.forEach((payment: any) => {
          if (payment.invoiceId && payment.invoiceNumber !== 'On Account') {
            invoiceIds.add(payment.invoiceId);
          } else if (payment.invoiceNumber === 'On Account' || !payment.invoiceId) {
            totalOnAccount += parseFloat(payment.amount || 0);
          }
        });

        // Second pass: ensure all payment methods are properly set
        const paymentMethods = {
          cash: 0,
          bank: 0, // card
          bank_transfer: 0,
          cheque: 0
        };

        batchDetails.payments.forEach((payment: any) => {
          if (payment.paymentMode && payment.amount > 0) {
            // Map backend payment modes to frontend format
            switch (payment.paymentMode) {
              case 'cash':
                paymentMethods.cash += parseFloat(payment.amount);
                break;
              case 'bank': // card
                paymentMethods.bank += parseFloat(payment.amount);
                break;
              case 'bank_transfer':
                paymentMethods.bank_transfer += parseFloat(payment.amount);
                break;
              case 'cheque':
                paymentMethods.cheque += parseFloat(payment.amount);
                break;
            }
          }
        });

        // Update split payment state with the actual payment distribution
        setSplitPayment({
          cash: paymentMethods.cash > 0 ? paymentMethods.cash.toString() : "",
          card: paymentMethods.bank > 0 ? paymentMethods.bank.toString() : "",
          bankTransfer: paymentMethods.bank_transfer > 0 ? paymentMethods.bank_transfer.toString() : "",
          cheque: paymentMethods.cheque > 0 ? paymentMethods.cheque.toString() : ""
        });
      }

      setSelectedInvoiceIds(invoiceIds);
      setOnAccountAmount(totalOnAccount);
    } catch (error) {
      console.error('Failed to fetch batch details for editing:', error);
      // Fallback: clear selected invoices but keep the payment amount
      setSelectedInvoiceIds(new Set());
      setOnAccountAmount(0);
    }

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
    setInvoicePaymentConfigs(new Map());
    setOnAccountAmount(0);
    resetSplitPayment();
  };

  const handleDeletePayment = (batchId: number) => {
    if (window.confirm('Are you sure you want to delete this payment? This will revert all related transactions.')) {
      deletePaymentMutation.mutate(batchId);
    }
  };

  const handlePaymentSubmit = () => {
    if (isEditing && editingPayment) {
      // Check permission for editing the payment
      if (!canEditPayment(editingPayment.paymentDate)) {
        const isBusinessDate = businessDate && format(new Date(editingPayment.paymentDate), 'yyyy-MM-dd') === format(businessDate, 'yyyy-MM-dd');
        toast({
          title: "Permission Denied",
          description: isBusinessDate
            ? "You don't have permission to edit payments for the current business date"
            : "You don't have permission to edit past date payments",
          variant: "destructive",
        });
        return;
      }

      // Use the same sequential payment distribution logic for editing
      handleUnifiedPaymentSubmit(true); // Pass true to indicate this is an edit
      return;
    }

    // Handle unified payment (invoices + on-account)
    handleUnifiedPaymentSubmit();
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

  const totalOutstandingBalance = displayedInvoices.reduce((sum, invoice) => sum + invoice.balance, 0);



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
          <CardContent className="p-4">
            {/* Payment Header */}
            <div className="mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Customer Payment</h3>
              <p className="text-xs text-gray-600">Select invoices to pay and/or add on-account credit</p>
              <p className="text-xs text-blue-600 mt-1">💡 On-account credits automatically apply to oldest unpaid invoices to minimize outstanding balance</p>
            </div>

            {/* Compact Form Layout */}
            <div className="space-y-3">
              {/* Row 1: Customer, Payment Date, Total Amount */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="customer" className="text-sm">Customer:</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingCustomers ? (
                        <SelectItem value="disabled" disabled>Loading...</SelectItem>
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

                <div>
                  <Label className="text-sm">Payment Date:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal h-9",
                          !paymentDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {paymentDate ? format(paymentDate, "dd/MM/yyyy") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={paymentDate}
                        onSelect={(date) => {
                          if (date && !canCreatePaymentForDate(date)) {
                            const isBusinessDate = businessDate && format(date, 'yyyy-MM-dd') === format(businessDate, 'yyyy-MM-dd');
                            toast({
                              title: "Permission Denied",
                              description: isBusinessDate
                                ? "You don't have permission to create payments for the current business date"
                                : "You don't have permission to select past dates",
                              variant: "destructive",
                            });
                            return;
                          }
                          setPaymentDate(date);
                        }}
                        disabled={(date) => !canCreatePaymentForDate(date)}
                        defaultMonth={businessDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {businessDate && (
                    <div className="text-xs text-gray-500 mt-1">
                      Business: {format(businessDate, "dd/MM/yyyy")}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-sm">Payment Summary:</Label>
                  <div className="p-2 border rounded bg-gray-50 h-9 flex items-center justify-between">
                    <span className="text-sm">Net Payment:</span>
                    <span className="font-semibold text-lg">£{receivedAmount.toFixed(2)}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {(() => {
                      const selectedInvoices = displayedInvoices.filter(inv => selectedInvoiceIds.has(inv.id));
                      const positiveTotal = selectedInvoices.filter(inv => inv.balance > 0).reduce((sum, inv) => sum + inv.balance, 0);
                      const creditTotal = selectedInvoices.filter(inv => inv.balance < 0).reduce((sum, inv) => sum + Math.abs(inv.balance), 0);
                      const positiveCount = selectedInvoices.filter(inv => inv.balance > 0).length;
                      const creditCount = selectedInvoices.filter(inv => inv.balance < 0).length;
                      
                      // Calculate auto-applications
                      let autoPayTotal = 0;
                      let autoPayCount = 0;
                      if (onAccountAmount > 0) {
                        const unselectedUnpaidInvoices = displayedInvoices
                          .filter(inv => !selectedInvoiceIds.has(inv.id) && inv.balance > 0)
                          .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());
                        
                        let remainingCredit = onAccountAmount;
                        for (const unpaidInv of unselectedUnpaidInvoices) {
                          if (remainingCredit <= 0) break;
                          const paymentAmount = Math.min(remainingCredit, unpaidInv.balance);
                          autoPayTotal += paymentAmount;
                          if (paymentAmount >= unpaidInv.balance) {
                            autoPayCount++;
                          }
                          remainingCredit -= paymentAmount;
                        }
                      }
                      
                      const remainingOnAccount = onAccountAmount - autoPayTotal;
                      
                      let description = '';
                      if (positiveCount > 0) {
                        description += `${positiveCount} invoice${positiveCount !== 1 ? 's' : ''} (£${positiveTotal.toFixed(2)})`;
                      }
                      if (creditCount > 0) {
                        if (description) description += ' - ';
                        description += `${creditCount} credit${creditCount !== 1 ? 's' : ''} (£${creditTotal.toFixed(2)})`;
                      }
                      if (autoPayCount > 0) {
                        if (description) description += ' + ';
                        description += `${autoPayCount} auto-pay (£${autoPayTotal.toFixed(2)})`;
                      }
                      if (remainingOnAccount > 0) {
                        if (description) description += ' + ';
                        description += `£${remainingOnAccount.toFixed(2)} on-account`;
                      }
                      
                      return description || `£${onAccountAmount.toFixed(2)} on-account`;
                    })()}
                  </div>
                </div>
              </div>

              {/* Row 2: Split Payment */}
              <div>
                <Label className="text-sm">Split Payment:</Label>
                <div className="p-2 border rounded bg-gray-50">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs min-w-[40px]">Cash:</Label>
                      <Input
                        type="number"
                        value={splitPayment.cash}
                        onChange={(e) => handleSplitPaymentChange('cash', e.target.value)}
                        className="h-8 text-sm"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs min-w-[40px]">Card:</Label>
                      <Input
                        type="number"
                        value={splitPayment.card}
                        onChange={(e) => handleSplitPaymentChange('card', e.target.value)}
                        className="h-8 text-sm"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs min-w-[40px]">Transfer:</Label>
                      <Input
                        type="number"
                        value={splitPayment.bankTransfer}
                        onChange={(e) => handleSplitPaymentChange('bankTransfer', e.target.value)}
                        className="h-8 text-sm"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs min-w-[40px]">Cheque:</Label>
                      <Input
                        type="number"
                        value={splitPayment.cheque}
                        onChange={(e) => handleSplitPaymentChange('cheque', e.target.value)}
                        className="h-8 text-sm"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="text-xs text-center mt-2 pt-2 border-t">
                    Split Total: £{((parseFloat(splitPayment.cash) || 0) + (parseFloat(splitPayment.card) || 0) + (parseFloat(splitPayment.bankTransfer) || 0) + (parseFloat(splitPayment.cheque) || 0)).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Row 3: On-Account, Received Amount, Remarks */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="on-account-amount" className="text-sm">On-Account:</Label>
                  <Input
                    id="on-account-amount"
                    type="number"
                    value={onAccountAmount}
                    onChange={(e) => handleOnAccountAmountChange(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="h-9"
                    step="0.01"
                    min="0"
                  />
                </div>

                <div>
                  <Label htmlFor="received-amount" className="text-sm">Split Amount:</Label>
                  <Input
                    id="received-amount"
                    type="number"
                    value={receivedAmount}
                    onChange={(e) => setReceivedAmount(parseFloat(e.target.value) || 0)}
                    placeholder="Enter amount"
                    className="h-9"
                    step="0.01"
                  />
                </div>

                <div>
                  <Label htmlFor="remarks" className="text-sm">Remarks:</Label>
                  <Input
                    id="remarks"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Enter remarks"
                    className="h-9"
                  />
                </div>
              </div>

              {/* Row 4: Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-xs text-gray-500">
                  {Math.abs(receivedAmount - ((parseFloat(splitPayment.cash) || 0) + (parseFloat(splitPayment.card) || 0) + (parseFloat(splitPayment.bankTransfer) || 0) + (parseFloat(splitPayment.cheque) || 0))) <= 0.01
                    ? '✓ Split amounts match'
                    : '⚠ Split amounts should match received amount'}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handlePaymentSubmit}
                    disabled={
                      isEditing
                        ? updatePaymentMutation.isPending
                        : createPaymentMutation.isPending || (selectedInvoiceIds.size === 0 && onAccountAmount === 0)
                    }
                  >
                    {isEditing
                      ? (updatePaymentMutation.isPending ? 'Updating...' : 'Update Payment')
                      : (createPaymentMutation.isPending ? 'Processing...' : 'Record Payment')
                    }
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Invoices Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Outstanding Invoices</CardTitle>
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
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={selectedInvoiceIds.size === displayedInvoices.length && displayedInvoices.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice No.</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Running Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className={selectedInvoiceIds.has(invoice.id) ? 'bg-blue-50' : ''}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.has(invoice.id)}
                        onChange={(e) => handleInvoiceSelection(invoice.id, e.target.checked)}
                        className="rounded"
                      />
                    </TableCell>
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
                      {selectedInvoiceIds.has(invoice.id) ? (
                        invoice.balance < 0 ? (
                          <span className="text-red-600 text-sm font-medium">Credit Applied</span>
                        ) : (
                          <span className="text-green-600 text-sm font-medium">Payment Applied</span>
                        )
                      ) : (() => {
                        // Check if this invoice will be auto-paid by on-account credit
                        if (invoice.balance > 0 && onAccountAmount > 0) {
                          // Get unselected unpaid invoices sorted by date (oldest first)
                          const unselectedUnpaidInvoices = displayedInvoices
                            .filter(inv => !selectedInvoiceIds.has(inv.id) && inv.balance > 0)
                            .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());
                          
                          let remainingCredit = onAccountAmount;
                          let willBeAutoPaid = false;
                          
                          for (const unpaidInv of unselectedUnpaidInvoices) {
                            if (remainingCredit <= 0) break;
                            
                            if (unpaidInv.id === invoice.id) {
                              const paymentAmount = Math.min(remainingCredit, unpaidInv.balance);
                              if (paymentAmount >= unpaidInv.balance) {
                                willBeAutoPaid = true;
                              } else if (paymentAmount > 0) {
                                return <span className="text-orange-600 text-sm font-medium">Partial Auto-Pay</span>;
                              }
                              break;
                            }
                            
                            remainingCredit -= Math.min(remainingCredit, unpaidInv.balance);
                          }
                          
                          if (willBeAutoPaid) {
                            return <span className="text-blue-600 text-sm font-medium">Auto-Pay (On-Account)</span>;
                          }
                        }
                        
                        return <span className="text-gray-400">-</span>;
                      })()}
                    </TableCell>
                    <TableCell className="text-right">£{invoice.runningBal.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {paginatedInvoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-4">
                      No outstanding invoices found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {/* Pagination for Outstanding Invoices */}
            {invoicesTotalPages > 1 && (
              <div className="mt-4">
                <Pagination {...invoicesPaginationProps} />
              </div>
            )}

            {/* Summary Row */}
            {displayedInvoices.length > 0 && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-2 md:grid-5 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Unpaid Invoices:</span>
                    <div className="text-lg font-bold text-blue-600">
                      £{displayedInvoices.filter(inv => inv.balance > 0).reduce((sum, inv) => sum + inv.balance, 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {displayedInvoices.filter(inv => inv.balance > 0).length} invoice{displayedInvoices.filter(inv => inv.balance > 0).length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Credit Invoices:</span>
                    <div className="text-lg font-bold text-red-600">
                      £{displayedInvoices.filter(inv => inv.balance < 0).reduce((sum, inv) => sum + inv.balance, 0).toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {displayedInvoices.filter(inv => inv.balance < 0).length} credit{displayedInvoices.filter(inv => inv.balance < 0).length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Net Outstanding:</span>
                    <div className={`text-lg font-bold ${totalOutstandingBalance < 0 ? 'text-red-600' : totalOutstandingBalance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      £{totalOutstandingBalance.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {totalOutstandingBalance < 0 ? 'Customer Credit' : totalOutstandingBalance > 0 ? 'Amount Due' : 'Balanced'}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Total Payment Impact:</span>
                    <div className="text-lg font-bold text-green-600">
                      £{(() => {
                        // Calculate selected invoices payment
                        const selectedInvoices = displayedInvoices.filter(inv => selectedInvoiceIds.has(inv.id));
                        const positiveTotal = selectedInvoices.filter(inv => inv.balance > 0).reduce((sum, inv) => sum + inv.balance, 0);
                        const creditTotal = selectedInvoices.filter(inv => inv.balance < 0).reduce((sum, inv) => sum + Math.abs(inv.balance), 0);
                        const selectedPayment = Math.max(0, positiveTotal - creditTotal);
                        
                        // Calculate auto-payment from on-account
                        let autoPayment = 0;
                        if (onAccountAmount > 0) {
                          const unselectedUnpaidInvoices = displayedInvoices
                            .filter(inv => !selectedInvoiceIds.has(inv.id) && inv.balance > 0)
                            .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());
                          
                          let remainingCredit = onAccountAmount;
                          for (const unpaidInv of unselectedUnpaidInvoices) {
                            if (remainingCredit <= 0) break;
                            const paymentAmount = Math.min(remainingCredit, unpaidInv.balance);
                            autoPayment += paymentAmount;
                            remainingCredit -= paymentAmount;
                          }
                        }
                        
                        return (selectedPayment + autoPayment).toFixed(2);
                      })()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(() => {
                        const selectedCount = selectedInvoiceIds.size;
                        let autoPayCount = 0;
                        
                        if (onAccountAmount > 0) {
                          const unselectedUnpaidInvoices = displayedInvoices
                            .filter(inv => !selectedInvoiceIds.has(inv.id) && inv.balance > 0)
                            .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());
                          
                          let remainingCredit = onAccountAmount;
                          for (const unpaidInv of unselectedUnpaidInvoices) {
                            if (remainingCredit <= 0) break;
                            const paymentAmount = Math.min(remainingCredit, unpaidInv.balance);
                            if (paymentAmount >= unpaidInv.balance) {
                              autoPayCount++;
                            }
                            remainingCredit -= paymentAmount;
                          }
                        }
                        
                        const totalAffected = selectedCount + autoPayCount;
                        return `${selectedCount} selected${autoPayCount > 0 ? ` + ${autoPayCount} auto-pay` : ''} = ${totalAffected} total`;
                      })()}
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
                  {paginatedPaymentHistory.map((batch: any) => (
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
                          {canEditPayment(batch.paymentDate) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePayment(batch.batchId)}
                              title="Delete Payment"
                              className="text-red-600 hover:text-red-800"
                              disabled={deletePaymentMutation.isPending}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              </svg>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              title="You don't have permission to delete this payment"
                              className="text-gray-400 cursor-not-allowed"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
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
                  {paginatedPaymentHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4">
                        No payment history found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination for Payment History */}
              {historyTotalPages > 1 && (
                <div className="mt-4">
                  <Pagination {...historyPaginationProps} />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}