import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Copy, Printer, Search, Receipt, FileCheck, Mail, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePaymentsMutations } from "@/hooks/usePaymentsMutations";
import { useBusinessDate } from "@/hooks/use-business-date";
import { useAuth } from "@/lib/auth";
import type { Supplier, SupplierPayment, InsertSupplierPayment } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";
import Pagination from "@/components/ui/pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import SupplierSearch from "@/components/ui/supplier-search";
import { useSupplierSearch } from "@/hooks/useSupplierSearch";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { copyToClipboard, printHtmlTable } from "@/lib/export-utils";

interface OutstandingInvoice {
  id: number;
  purchaseId: number;
  date: string;
  remarks: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
}

export default function SupplierPayment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { supplierPayment } = usePaymentsMutations();
  const { currentDate: businessDate } = useBusinessDate();
  const { user } = useAuth();
  
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<string>("CASH");
  const [paymentDate, setPaymentDate] = useState<Date>(() => {
    return businessDate ? new Date(businessDate) : new Date();
  });
  const [amountPaid, setAmountPaid] = useState<string>("0");
  const [remarks, setRemarks] = useState<string>("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState<string>("");
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState<Date | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  
  // Edit/Delete functionality states
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [duplicateInvoiceWarning, setDuplicateInvoiceWarning] = useState<string>("");

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
      // Creating payments for business date is always allowed regardless of current_editing
      return true;
    } else if (date < new Date(businessDate)) {
      // For past dates (before business date), check editing permission
      return userPermissions.editing === true;
    } else {
      // For future dates (after business date), allow
      return true;
    }
  };

  // Update payment date when business date changes
  useEffect(() => {
    if (businessDate) {
      setPaymentDate(new Date(businessDate));
    }
  }, [businessDate]);

  // Reset email field when supplier changes
  useEffect(() => {
    setEmailAddress("");
    setDuplicateInvoiceWarning("");
  }, [selectedSupplier]);



  // Fetch suppliers
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Fetch outstanding invoices for selected supplier
  const { data: outstandingInvoices = [], isLoading: invoicesLoading, refetch: refetchOutstandingInvoices } = useQuery({
    queryKey: ["/api/suppliers/outstanding_invoices", selectedSupplier],
    queryFn: () => apiRequest("GET", `/api/suppliers/${selectedSupplier}/outstanding_invoices`),
    enabled: !!selectedSupplier,
  });

  // Fetch payment history for the selected supplier
  const { data: paymentHistory, refetch: refetchPaymentHistory } = useQuery<SupplierPayment[]>({
    queryKey: ["/api/supplier-payments/history", selectedSupplier],
    queryFn: async () => {
      const result = await apiRequest("GET", `/api/supplier-payments/history?supplierId=${selectedSupplier}`);
      return result;
    },
    enabled: !!selectedSupplier,
  });

  // Check for duplicate supplier invoice numbers
  useEffect(() => {
    if (supplierInvoiceNumber.trim() && selectedSupplier && paymentHistory) {
      const duplicatePayment = paymentHistory.find((payment: any) => 
        payment.supplierInvoiceNumber && 
        payment.supplierInvoiceNumber.toLowerCase() === supplierInvoiceNumber.toLowerCase() &&
        (!isEditing || payment.id !== editingPayment?.id) // Exclude current payment when editing
      );

      if (duplicatePayment) {
        const paymentDate = duplicatePayment.paymentDate ? format(new Date(duplicatePayment.paymentDate), "dd/MM/yyyy") : 'Unknown date';
        setDuplicateInvoiceWarning(
          `⚠️ Warning: This supplier invoice number "${supplierInvoiceNumber}" was already used in a payment on ${paymentDate} (Amount: £${(duplicatePayment.amount || 0).toFixed(2)})`
        );
      } else {
        setDuplicateInvoiceWarning("");
      }
    } else {
      setDuplicateInvoiceWarning("");
    }
  }, [supplierInvoiceNumber, selectedSupplier, paymentHistory, isEditing, editingPayment]);

  // Use standardized mutation
  const createPaymentMutation = supplierPayment.create;

  // Mutation for updating a payment
  const updatePaymentMutation = useMutation<any, Error, any>({
    mutationFn: (paymentData) => apiRequest("PUT", `/api/supplier-payments/${paymentData.id}`, paymentData),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Payment updated successfully.",
      });
      // Invalidate and refetch all related queries
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers/outstanding_invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/supplier-payments/history"] });
      refetchOutstandingInvoices();
      refetchPaymentHistory();
      // Reset form after successful update
      setEditingPayment(null);
      setIsEditing(false);
      setAmountPaid("0");
      setRemarks("");
      setSupplierInvoiceNumber("");
      setSupplierInvoiceDate(undefined);
      setSelectedInvoices([]);
      setDuplicateInvoiceWarning("");
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
    mutationFn: (paymentId: number) => apiRequest("DELETE", `/api/supplier-payments/${paymentId}`),
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

  // Pagination for payment history
  const {
    currentPage: historyCurrentPage,
    totalPages: historyTotalPages,
    itemsPerPage: historyItemsPerPage,
    startIndex: historyStartIndex,
    endIndex: historyEndIndex,
    paginationProps: historyPaginationProps
  } = useTablePagination({
    totalItems: paymentHistory?.length || 0,
    initialItemsPerPage: 10
  });

  const paginatedPaymentHistory = useMemo(() => {
    const sorted = (paymentHistory || [])
      .sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
    
    const paginated = sorted.slice(historyStartIndex, historyEndIndex);
    
    return paginated;
  }, [paymentHistory, historyStartIndex, historyEndIndex]);

  // Handle supplier selection
  const handleSupplierChange = (supplierId: string) => {
    setSelectedSupplier(supplierId);
    setSelectedInvoices([]);
  };

  // Handle invoice selection
  const handleInvoiceSelection = (invoiceId: number, checked: boolean) => {
    if (checked) {
      setSelectedInvoices([...selectedInvoices, invoiceId]);
    } else {
      setSelectedInvoices(selectedInvoices.filter(id => id !== invoiceId));
    }
  };

  // Handle edit payment
  const handleEditPayment = (payment: SupplierPayment) => {
    console.log('Starting edit for payment:', payment);
    console.log('Setting payment mode to:', payment.paymentMode);
    setEditingPayment(payment);
    setSelectedSupplier(payment.supplierId.toString());
    setAmountPaid(payment.amount.toString());
    setPaymentMode(payment.paymentMode);
    setPaymentDate(new Date(payment.paymentDate));
    setRemarks(payment.remarks || '');
    setSupplierInvoiceNumber(payment.supplierInvoiceNumber || '');
    setSupplierInvoiceDate(payment.supplierInvoiceDate ? new Date(payment.supplierInvoiceDate) : undefined);
    setIsEditing(true);
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingPayment(null);
    setIsEditing(false);
    setAmountPaid("0");
    setRemarks("");
    setSupplierInvoiceNumber("");
    setSupplierInvoiceDate(undefined);
    setSelectedInvoices([]);
    setDuplicateInvoiceWarning("");
  };

  // Handle delete payment
  const handleDeletePayment = (paymentId: number) => {
    if (!paymentId || paymentId === undefined) {
      toast({
        title: "Error",
        description: "Invalid payment ID. Cannot delete payment.",
        variant: "destructive",
      });
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this payment? This will revert all related transactions.')) {
      deletePaymentMutation.mutate(paymentId);
    }
  };

  // Handle payment submission
  const handleSubmitPayment = () => {
    if (!selectedSupplier) {
      toast({
        title: "Error",
        description: "Please select a supplier",
        variant: "destructive",
      });
      return;
    }

    if (!amountPaid || parseFloat(amountPaid) <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
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
      return;
    }

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

      // Update existing payment
      const updateData = {
        id: editingPayment.id,
        supplier_id: parseInt(selectedSupplier),
        purchase_invoice_id: selectedInvoices.length === 1 ? selectedInvoices[0] : editingPayment.purchaseInvoiceId,
        amount: parseFloat(amountPaid),
        payment_mode: paymentMode,
        payment_date: format(paymentDate, "yyyy-MM-dd"),
        remarks: remarks || null,
        supplier_invoice_number: supplierInvoiceNumber || null,
        supplier_invoice_date: supplierInvoiceDate ? format(supplierInvoiceDate, "yyyy-MM-dd") : null,
      };

      console.log('Updating supplier payment with data:', updateData);
      updatePaymentMutation.mutate(updateData);
    } else {
      // Create new payment
      const paymentData: InsertSupplierPayment = {
        supplierId: parseInt(selectedSupplier),
        purchaseInvoiceId: selectedInvoices.length === 1 ? selectedInvoices[0] : null,
        amount: parseFloat(amountPaid),
        paymentMode: paymentMode,
        paymentDate: format(paymentDate, "yyyy-MM-dd"),
        remarks: remarks || null,
        supplierInvoiceNumber: supplierInvoiceNumber || null,
        supplierInvoiceDate: supplierInvoiceDate ? format(supplierInvoiceDate, "yyyy-MM-dd") : null,
      };

      createPaymentMutation.mutate(paymentData, {
        onSuccess: () => {
          // Reset form
          setAmountPaid("0");
          setRemarks("");
          setSupplierInvoiceNumber("");
          setSupplierInvoiceDate(undefined);
          setSelectedInvoices([]);
          setDuplicateInvoiceWarning("");
          refetchOutstandingInvoices();
          refetchPaymentHistory();
        }
      });
    }
  };

  // Handle bulk payment update
  const handleUpdatePayment = () => {
    if (!selectedSupplier) {
      toast({
        title: "Error",
        description: "Please select a supplier",
        variant: "destructive",
      });
      return;
    }

    if (selectedInvoices.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one invoice to update",
        variant: "destructive",
      });
      return;
    }

    // Use bulk create mutation
    const paymentData = selectedInvoices.map(invoiceId => {
      const invoice = outstandingInvoices.find((inv: OutstandingInvoice) => inv.id === invoiceId);
      if (!invoice) throw new Error(`Invoice data not found for ID: ${invoiceId}`);

      return {
        supplierId: parseInt(selectedSupplier),
        purchaseInvoiceId: invoiceId,
        amount: invoice.outstandingAmount,
        paymentMode: paymentMode,
        paymentDate: format(paymentDate, "yyyy-MM-dd"),
        remarks: remarks || `Payment for invoice #${invoiceId}`,
        supplierInvoiceNumber: supplierInvoiceNumber || null,
        supplierInvoiceDate: supplierInvoiceDate ? format(supplierInvoiceDate, "yyyy-MM-dd") : null,
      };
    });

    supplierPayment.bulkCreate.mutate(paymentData, {
      onSuccess: () => {
        // Reset form
        setAmountPaid("0");
        setRemarks("");
        setSupplierInvoiceNumber("");
        setSupplierInvoiceDate(undefined);
        setSelectedInvoices([]);
        setDuplicateInvoiceWarning("");
        refetchOutstandingInvoices();
        refetchPaymentHistory();
      }
    });
  };

  // Export functions
  const handlePDF = () => {
    if (!paymentHistory || paymentHistory.length === 0) return;

    const selectedSupplierData = suppliers.find((s: Supplier) => s.id.toString() === selectedSupplier);
    const doc = new jsPDF();

    // Add company header
    doc.setFontSize(16);
    doc.text('SUPPLIER PAYMENT HISTORY', 105, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.text('TROPIFRUIT UK LTD', 105, 30, { align: 'center' });
    doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 105, 40, { align: 'center' });

    // Add supplier info
    doc.setFontSize(10);
    doc.text(`Supplier: ${selectedSupplierData?.supplier_name || 'Unknown'}`, 20, 55);
    doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 20, 65);

    // Prepare table data
    const tableData = paymentHistory.map((payment: any) => [
      payment.paymentDate ? format(new Date(payment.paymentDate), "dd/MM/yyyy") : '-',
      payment.supplierInvoiceNumber || '-',
      payment.paymentMode || '-',
      `£${(payment.amount || 0).toFixed(2)}`,
      payment.remarks || '-'
    ]);

    // Add table
    autoTable(doc, {
      head: [['Date', 'Supplier Invoice', 'Payment Mode', 'Amount', 'Remarks']],
      body: tableData,
      startY: 75,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [240, 240, 240] },
    });

    // Save PDF
    doc.save(`Supplier_Payment_History_${selectedSupplierData?.supplier_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Supplier'}_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const handleExcel = () => {
    if (!paymentHistory || paymentHistory.length === 0) return;

    const selectedSupplierData = suppliers.find((s: Supplier) => s.id.toString() === selectedSupplier);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Add data sheet
    const ws = XLSX.utils.json_to_sheet(paymentHistory.map((payment: any) => ({
      'Date': payment.paymentDate ? format(new Date(payment.paymentDate), "dd/MM/yyyy") : '-',
      'Supplier Invoice': payment.supplierInvoiceNumber || '-',
      'Payment Mode': payment.paymentMode || '-',
      'Amount': (payment.amount || 0).toFixed(2),
      'Remarks': payment.remarks || '-'
    })));

    XLSX.utils.book_append_sheet(wb, ws, 'Payment History');

    // Save file
    XLSX.writeFile(wb, `Supplier_Payment_History_${selectedSupplierData?.supplier_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Supplier'}_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const handleCopy = () => {
    if (!paymentHistory || paymentHistory.length === 0) return;

    const headers = ['Date', 'Supplier Invoice', 'Payment Mode', 'Amount', 'Remarks'];
    const rows = paymentHistory.map((payment: any) => [
      payment.paymentDate ? format(new Date(payment.paymentDate), "dd/MM/yyyy") : '-',
      payment.supplierInvoiceNumber || '-',
      payment.paymentMode || '-',
      `£${(payment.amount || 0).toFixed(2)}`,
      payment.remarks || '-'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join('\t')).join('\n');

    copyToClipboard(csvContent, { toast, successMessage: "Payment history copied to clipboard" });
  };

  const handlePrint = () => {
    if (!paymentHistory || paymentHistory.length === 0) return;

    const selectedSupplierData = suppliers.find((s: Supplier) => s.id.toString() === selectedSupplier);
    let html = '';

    // Add header
    html += '<div class="header">';
    html += '<h2>SUPPLIER PAYMENT HISTORY</h2>';
    html += '<p>TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ</p>';
    html += '</div>';

    // Add supplier info
    html += '<div class="supplier-info">';
    html += `<strong>Supplier:</strong> ${selectedSupplierData?.supplier_name || 'Unknown'}<br>`;
    html += `<strong>Generated:</strong> ${format(new Date(), "dd/MM/yyyy HH:mm")}`;
    html += '</div>';

    // Add table
    html += '<table>';
    html += '<thead><tr>';
    html += '<th>Date</th><th>Supplier Invoice</th><th>Payment Mode</th><th>Amount</th><th>Remarks</th>';
    html += '</tr></thead><tbody>';

    paymentHistory.forEach((payment: any) => {
      html += '<tr>';
      html += `<td>${payment.paymentDate ? format(new Date(payment.paymentDate), "dd/MM/yyyy") : '-'}</td>`;
      html += `<td>${payment.supplierInvoiceNumber || '-'}</td>`;
      html += `<td>${payment.paymentMode || '-'}</td>`;
      html += `<td>£${(payment.amount || 0).toFixed(2)}</td>`;
      html += `<td>${payment.remarks || '-'}</td>`;
      html += '</tr>';
    });

    html += '</tbody></table>';
    printHtmlTable('Supplier Payment History', html);
  };

  // Handle email sending
  const handleEmail = async () => {
    if (!selectedSupplier) {
      toast({
        title: "Error",
        description: "Please select a supplier first",
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

    if (!paymentHistory || paymentHistory.length === 0) {
      toast({
        title: "Error",
        description: "No payment history to email",
        variant: "destructive",
      });
      return;
    }

    try {
      const selectedSupplierData = suppliers.find((s: Supplier) => s.id.toString() === selectedSupplier);

      // Generate PDF data for email attachment
      const doc = new jsPDF();

      // Add company header
      doc.setFontSize(16);
      doc.text('SUPPLIER PAYMENT HISTORY', 105, 20, { align: 'center' });

      doc.setFontSize(12);
      doc.text('TROPIFRUIT UK LTD', 105, 30, { align: 'center' });
      doc.text('3 Dolphin Way, Purfleet, RM19 1NZ', 105, 40, { align: 'center' });

      // Add supplier info
      doc.setFontSize(10);
      doc.text(`Supplier: ${selectedSupplierData?.supplier_name || 'Unknown'}`, 20, 55);
      doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 20, 65);

      // Prepare table data
      const tableData = paymentHistory.map((payment: any) => [
        payment.paymentDate ? format(new Date(payment.paymentDate), "dd/MM/yyyy") : '-',
        payment.supplierInvoiceNumber || '-',
        payment.paymentMode || '-',
        `£${(payment.amount || 0).toFixed(2)}`,
        payment.remarks || '-'
      ]);

      // Add table
      autoTable(doc, {
        head: [['Date', 'Supplier Invoice', 'Payment Mode', 'Amount', 'Remarks']],
        body: tableData,
        startY: 75,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [240, 240, 240] },
      });

      // Convert PDF to base64
      const pdfBase64 = doc.output('datauristring').split(',')[1];

      // Send email via API
      await apiRequest('POST', '/api/send-email', {
        to: emailAddress,
        subject: `Supplier Payment History - ${selectedSupplierData?.supplier_name || 'Supplier'}`,
        body: `Please find attached the payment history for ${selectedSupplierData?.supplier_name || 'the supplier'}.`,
        attachment: {
          filename: `Supplier_Payment_History_${selectedSupplierData?.supplier_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Supplier'}_${format(new Date(), "yyyy-MM-dd")}.pdf`,
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

  // Calculate totals
  const selectedInvoiceData = outstandingInvoices.filter((invoice: OutstandingInvoice) => 
    selectedInvoices.includes(invoice.id)
  );

  const totalSelectedAmount = selectedInvoiceData.reduce((sum: number, invoice: OutstandingInvoice) => sum + (invoice.outstandingAmount || 0), 0);
  const totalOutstandingAmount = outstandingInvoices.reduce((sum: number, invoice: OutstandingInvoice) => sum + (invoice.outstandingAmount || 0), 0);

  // This effect automatically updates the "Amount Paid" field when invoices are selected
  useEffect(() => {
    if (selectedInvoices.length > 0 && !isEditing) {
      const totalSelected = outstandingInvoices
        .filter((invoice: OutstandingInvoice) => selectedInvoices.includes(invoice.id))
        .reduce((sum: number, invoice: OutstandingInvoice) => sum + (invoice.outstandingAmount || 0), 0);
      setAmountPaid(totalSelected.toFixed(2));
    } else if (selectedInvoices.length === 0 && !isEditing) {
      setAmountPaid("0");
    }
  }, [selectedInvoices, outstandingInvoices, isEditing]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Payment Form */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
              <div className="sm:col-span-2 lg:col-span-1">
                <Label htmlFor="supplier">Select Supplier :</Label>
                <SupplierSearch
                  placeholder="Search supplier by code or name..."
                  onSupplierSelect={(supplier) => {
                    if (supplier) {
                      handleSupplierChange(supplier.id.toString());
                    } else {
                      handleSupplierChange("");
                    }
                  }}
                  showCode
                  allowClear
                />
              </div>

              <div>
                <Label htmlFor="supplier-invoice-number">Supplier Invoice #:</Label>
                <Input
                  id="supplier-invoice-number"
                  value={supplierInvoiceNumber}
                  onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                  placeholder="Enter invoice number"
                  className={duplicateInvoiceWarning ? "border-orange-500 focus:border-orange-500" : ""}
                />
                {duplicateInvoiceWarning && (
                  <div className="text-orange-600 text-xs mt-1 p-2 bg-orange-50 border border-orange-200 rounded">
                    {duplicateInvoiceWarning}
                  </div>
                )}
              </div>

              <div>
                <Label>Supplier Invoice Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !supplierInvoiceDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {supplierInvoiceDate ? format(supplierInvoiceDate, "dd/MM/yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={supplierInvoiceDate}
                      onSelect={(date) => setSupplierInvoiceDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="payment-mode">Payment Mode:</Label>
                <Select value={paymentMode} onValueChange={(value) => {
                  console.log('Payment mode changed from', paymentMode, 'to', value);
                  setPaymentMode(value);
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">CASH</SelectItem>
                    <SelectItem value="CARD">CARD</SelectItem>
                    <SelectItem value="BANK_TRANSFER">BANK TRANSFER</SelectItem>
                    <SelectItem value="CHEQUE">CHEQUE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
                      {paymentDate ? format(paymentDate, "dd/MM/yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={paymentDate}
                      onSelect={(date) => date && setPaymentDate(date)}
                      defaultMonth={businessDate ? new Date(businessDate) : undefined}
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
                <Label htmlFor="amount-paid">Amount Paid:</Label>
                <Input
                  id="amount-paid"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>

              <div>
                <Label htmlFor="remarks">Remarks:</Label>
                <Input
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder=""
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2">
              {isEditing && (
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              )}
              <Button 
                className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
                onClick={handleSubmitPayment}
                disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
              >
                {isEditing
                  ? (updatePaymentMutation.isPending ? 'Updating...' : 'Update Payment')
                  : (createPaymentMutation.isPending ? 'Submitting...' : 'Submit Payment')
                }
              </Button>
            </div>

            {/* Responsive Table Container */}
            <div className="overflow-x-auto -mx-6 sm:mx-0">
              <div className="min-w-full inline-block align-middle">
                <Table className="min-w-[800px]">
                  <TableHeader>
                    <TableRow className="bg-blue-50">
                      <TableHead className="text-center w-16">Sl.No</TableHead>
                      <TableHead className="text-center w-24">Date</TableHead>
                      <TableHead className="text-center w-32">
                        <Checkbox className="mr-2" />
                        Invoice #
                      </TableHead>
                      <TableHead className="text-center w-28">Invoice Amt</TableHead>
                      <TableHead className="text-center w-24">Paid</TableHead>
                      <TableHead className="text-center w-28">Returns(Adj)</TableHead>
                      <TableHead className="text-center w-24">Balance</TableHead>
                      <TableHead className="text-center w-28">Run.Bal.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          Loading invoices...
                        </TableCell>
                      </TableRow>
                    ) : outstandingInvoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          No outstanding invoices found
                        </TableCell>
                      </TableRow>
                    ) : (
                      outstandingInvoices.map((invoice: OutstandingInvoice, index: number) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="text-center">{index + 1}</TableCell>
                          <TableCell className="text-center text-sm">
                            {invoice.date ? format(new Date(invoice.date), "dd/MM/yyyy") : "N/A"}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <input 
                                type="checkbox" 
                                className="rounded"
                                checked={selectedInvoices.includes(invoice.id)}
                                onChange={(e) => handleInvoiceSelection(invoice.id, e.target.checked)}
                              />
                              <span className="text-sm">{invoice.id}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm font-medium">£{(invoice.totalAmount || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-center text-sm">£{(invoice.paidAmount || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-center text-sm">£0.00</TableCell>
                          <TableCell className="text-center text-sm font-medium">£{(invoice.outstandingAmount || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-center text-sm">£{(invoice.outstandingAmount || 0).toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                    <TableRow className="bg-blue-100">
                      <TableCell className="font-semibold">BALANCE</TableCell>
                      <TableCell className="bg-blue-200">
                        <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 h-8 w-8 p-0">
                          📄
                        </Button>
                      </TableCell>
                      <TableCell className="bg-blue-200">
                        <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 h-8 w-8 p-0">
                          📧
                        </Button>
                      </TableCell>
                      <TableCell className="text-center font-semibold">£{totalOutstandingAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-center">£0.00</TableCell>
                      <TableCell className="text-center">£0.00</TableCell>
                      <TableCell className="text-center font-semibold">£{totalOutstandingAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-bold text-blue-700">Bal:£{totalOutstandingAmount.toFixed(2)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
              <div className="text-sm text-gray-600">
                Showing {outstandingInvoices.length} to {outstandingInvoices.length} of {outstandingInvoices.length} entries
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Previous</span>
                <Button variant="outline" size="sm" disabled>1</Button>
                <span className="text-sm">Next</span>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Payment History Table */}
        {selectedSupplier && (
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
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                      <FileText size={14} />
                      <span className="hidden sm:inline">PDF</span>
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                      <Download size={14} />
                      <span className="hidden sm:inline">Excel</span>
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                      <Copy size={14} />
                      <span className="hidden sm:inline">Copy</span>
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                      <Printer size={14} />
                      <span className="hidden sm:inline">Print</span>
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto -mx-6 sm:mx-0">
                <div className="min-w-full inline-block align-middle">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Date</TableHead>
                        <TableHead className="w-32">Supplier Invoice</TableHead>
                        <TableHead className="w-28">Payment Mode</TableHead>
                        <TableHead className="text-right w-24">Amount</TableHead>
                        <TableHead className="w-40">Remarks</TableHead>
                        <TableHead className="w-32 text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPaymentHistory.map((payment: any, index: number) => {
                        return (
                        <TableRow key={payment.id || index}>
                          <TableCell className="text-sm">{payment.paymentDate ? format(new Date(payment.paymentDate), "dd/MM/yyyy") : (payment.invDate ? format(new Date(payment.invDate), "dd/MM/yyyy") : '-')}</TableCell>
                          <TableCell className="text-sm">{payment.supplierInvoiceNumber || payment.invNo || '-'}</TableCell>
                          <TableCell className="text-sm">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {payment.paymentMode || 'CASH'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">£{(payment.amount || payment.invoiceAmt || payment.paidAmt || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={payment.remarks || '-'}>{payment.remarks || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              {canEditPayment(payment.paymentDate) ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditPayment(payment)}
                                  title="Edit Payment"
                                  className="text-blue-600 hover:text-blue-800 h-8 w-8 p-0"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                                  className="text-gray-400 cursor-not-allowed h-8 w-8 p-0"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                    <path d="m15 5 4 4" />
                                  </svg>
                                </Button>
                              )}
                              {canEditPayment(payment.paymentDate) ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    handleDeletePayment(payment.id);
                                  }}
                                  title="Delete Payment"
                                  className="text-red-600 hover:text-red-800 h-8 w-8 p-0"
                                  disabled={deletePaymentMutation.isPending}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                                  className="text-gray-400 cursor-not-allowed h-8 w-8 p-0"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M3 6h18" />
                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                  </svg>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  window.open(`/print/supplier-payment-receipt/${payment.id}`, '_blank');
                                }}
                                title="Print Payment Receipt"
                                className="h-8 w-8 p-0"
                              >
                                <Receipt className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })}
                      {paginatedPaymentHistory.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-4">
                            No payment history found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Pagination for Payment History */}
              {historyTotalPages > 1 && (
                <div className="mt-4">
                  <Pagination {...historyPaginationProps} />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Update Payment Button and Balance Summary */}
        <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center">
          <div className="flex-1 flex justify-center lg:justify-start">
            <Button 
              className="bg-green-600 hover:bg-green-700 w-full sm:w-auto px-8 py-2"
              onClick={handleUpdatePayment}
              disabled={selectedInvoices.length === 0 || createPaymentMutation.isPending}
            >
              Update Payment
            </Button>
          </div>
          
          <Card className="w-full lg:w-auto lg:min-w-[300px]">
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Running balance:</span>
                  <span className="font-medium">£{totalOutstandingAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">On Account balance:</span>
                  <span className="font-medium">£0.00</span>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">TOTAL Outstanding balance:</span>
                    <span className="font-bold text-lg text-blue-700">£{totalOutstandingAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
