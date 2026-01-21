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
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // Update payment date when business date changes
  useEffect(() => {
    if (businessDate) {
      setPaymentDate(new Date(businessDate));
    }
  }, [businessDate]);

  // Reset email field when supplier changes
  useEffect(() => {
    setEmailAddress("");
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
    queryFn: () => apiRequest("GET", `/api/supplier-payments/history?supplierId=${selectedSupplier}`),
    enabled: !!selectedSupplier,
  });

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

  const paginatedPaymentHistory = useMemo(() =>
    (paymentHistory || [])
      .sort((a: any, b: any) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
      .slice(historyStartIndex, historyEndIndex),
    [paymentHistory, historyStartIndex, historyEndIndex]
  );

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
  };

  // Handle delete payment
  const handleDeletePayment = (paymentId: number) => {
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
        supplierId: parseInt(selectedSupplier),
        purchaseInvoiceId: selectedInvoices.length === 1 ? selectedInvoices[0] : editingPayment.purchaseInvoiceId,
        amount: parseFloat(amountPaid),
        paymentMode: paymentMode,
        paymentDate: format(paymentDate, "yyyy-MM-dd"),
        remarks: remarks || null,
        supplierInvoiceNumber: supplierInvoiceNumber || null,
        supplierInvoiceDate: supplierInvoiceDate ? format(supplierInvoiceDate, "yyyy-MM-dd") : null,
      };

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
        refetchOutstandingInvoices();
        refetchPaymentHistory();
      }
    });
  };

  // Export functions
  const handlePDF = () => {
    if (!paymentHistory || paymentHistory.length === 0) return;

    const selectedSupplierData = suppliers.find(s => s.id.toString() === selectedSupplier);
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
      payment.id.toString(),
      format(new Date(payment.paymentDate), "dd/MM/yyyy"),
      payment.supplierInvoiceNumber || '-',
      payment.paymentMode,
      `£${payment.amount.toFixed(2)}`,
      payment.remarks || '-'
    ]);

    // Add table
    autoTable(doc, {
      head: [['Payment ID', 'Date', 'Supplier Invoice', 'Payment Mode', 'Amount', 'Remarks']],
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

    const selectedSupplierData = suppliers.find(s => s.id.toString() === selectedSupplier);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Add data sheet
    const ws = XLSX.utils.json_to_sheet(paymentHistory.map((payment: any) => ({
      'Payment ID': payment.id,
      'Date': format(new Date(payment.paymentDate), "dd/MM/yyyy"),
      'Supplier Invoice': payment.supplierInvoiceNumber || '-',
      'Payment Mode': payment.paymentMode,
      'Amount': payment.amount.toFixed(2),
      'Remarks': payment.remarks || '-'
    })));

    XLSX.utils.book_append_sheet(wb, ws, 'Payment History');

    // Save file
    XLSX.writeFile(wb, `Supplier_Payment_History_${selectedSupplierData?.supplier_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Supplier'}_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const handleCopy = () => {
    if (!paymentHistory || paymentHistory.length === 0) return;

    const headers = ['Payment ID', 'Date', 'Supplier Invoice', 'Payment Mode', 'Amount', 'Remarks'];
    const rows = paymentHistory.map((payment: any) => [
      payment.id,
      format(new Date(payment.paymentDate), "dd/MM/yyyy"),
      payment.supplierInvoiceNumber || '-',
      payment.paymentMode,
      `£${payment.amount.toFixed(2)}`,
      payment.remarks || '-'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join('\t')).join('\n');

    navigator.clipboard.writeText(csvContent).then(() => {
      toast({ title: "Success", description: "Payment history copied to clipboard" });
    }).catch(() => {
      toast({ title: "Error", description: "Failed to copy to clipboard", variant: "destructive" });
    });
  };

  const handlePrint = () => {
    if (!paymentHistory || paymentHistory.length === 0) return;

    const selectedSupplierData = suppliers.find(s => s.id.toString() === selectedSupplier);
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Supplier Payment History</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.supplier-info{margin-bottom:15px;font-weight:bold;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');

      // Add header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>SUPPLIER PAYMENT HISTORY</h2>');
      printWindow.document.write('<p>TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ</p>');
      printWindow.document.write('</div>');

      // Add supplier info
      printWindow.document.write('<div class="supplier-info">');
      printWindow.document.write(`<strong>Supplier:</strong> ${selectedSupplierData?.supplier_name || 'Unknown'}<br>`);
      printWindow.document.write(`<strong>Generated:</strong> ${format(new Date(), "dd/MM/yyyy HH:mm")}`);
      printWindow.document.write('</div>');

      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      printWindow.document.write('<th>Payment ID</th><th>Date</th><th>Supplier Invoice</th><th>Payment Mode</th><th>Amount</th><th>Remarks</th>');
      printWindow.document.write('</tr></thead><tbody>');

      paymentHistory.forEach((payment: any) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${payment.id}</td>`);
        printWindow.document.write(`<td>${format(new Date(payment.paymentDate), "dd/MM/yyyy")}</td>`);
        printWindow.document.write(`<td>${payment.supplierInvoiceNumber || '-'}</td>`);
        printWindow.document.write(`<td>${payment.paymentMode}</td>`);
        printWindow.document.write(`<td>£${payment.amount.toFixed(2)}</td>`);
        printWindow.document.write(`<td>${payment.remarks || '-'}</td>`);
        printWindow.document.write('</tr>');
      });

      printWindow.document.write('</tbody></table>');
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
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
      const selectedSupplierData = suppliers.find(s => s.id.toString() === selectedSupplier);

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
        payment.id.toString(),
        format(new Date(payment.paymentDate), "dd/MM/yyyy"),
        payment.supplierInvoiceNumber || '-',
        payment.paymentMode,
        `£${payment.amount.toFixed(2)}`,
        payment.remarks || '-'
      ]);

      // Add table
      autoTable(doc, {
        head: [['Payment ID', 'Date', 'Supplier Invoice', 'Payment Mode', 'Amount', 'Remarks']],
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

  const totalSelectedAmount = selectedInvoiceData.reduce((sum: number, invoice: OutstandingInvoice) => sum + invoice.outstandingAmount, 0);
  const totalOutstandingAmount = outstandingInvoices.reduce((sum: number, invoice: OutstandingInvoice) => sum + invoice.outstandingAmount, 0);

  // This effect automatically updates the "Amount Paid" field when invoices are selected
  useEffect(() => {
    if (selectedInvoices.length > 0 && !isEditing) {
      const totalSelected = outstandingInvoices
        .filter((invoice: OutstandingInvoice) => selectedInvoices.includes(invoice.id))
        .reduce((sum: number, invoice: OutstandingInvoice) => sum + invoice.outstandingAmount, 0);
      setAmountPaid(totalSelected.toFixed(2));
    } else if (selectedInvoices.length === 0 && !isEditing) {
      setAmountPaid("0");
    }
  }, [selectedInvoices, outstandingInvoices, isEditing]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Supplier Payment</h1>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 mb-6">
              <div>
                <Label htmlFor="supplier">Select Supplier :</Label>
                <Select value={selectedSupplier} onValueChange={handleSupplierChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliersLoading ? (
                      <SelectItem value="loading" disabled>Loading suppliers...</SelectItem>
                    ) : suppliers.length === 0 ? (
                      <SelectItem value="no-suppliers" disabled>No suppliers available</SelectItem>
                    ) : (
                      suppliers.map((supplier: Supplier) => (
                        <SelectItem key={supplier.id} value={String(supplier.id)}>
                          {supplier.supplier_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="supplier-invoice-number">Supplier Invoice #:</Label>
                <Input
                  id="supplier-invoice-number"
                  value={supplierInvoiceNumber}
                  onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                  placeholder="Enter invoice number"
                />
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
                <Select value={paymentMode} onValueChange={setPaymentMode}>
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

            <div className="flex justify-end gap-2">
              {isEditing && (
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={createPaymentMutation.isPending || updatePaymentMutation.isPending}
                >
                  Cancel
                </Button>
              )}
              <Button 
                className="bg-blue-600 hover:bg-blue-700"
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center">Sl.No</TableHead>
                    <TableHead className="text-center">Date</TableHead>
                    <TableHead className="text-center">
                      <Checkbox className="mr-2" />
                      Invoice #
                    </TableHead>
                    <TableHead className="text-center">Invoice Amt</TableHead>
                    <TableHead className="text-center">Paid</TableHead>
                    <TableHead className="text-center">Returns(Adj)</TableHead>
                    <TableHead className="text-center">Balance</TableHead>
                    <TableHead className="text-center">Run.Bal.</TableHead>
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
                        <TableCell className="text-center">
                          {invoice.date ? format(new Date(invoice.date), "dd/MM/yyyy") : "N/A"}
                        </TableCell>
                        <TableCell className="text-center">
                          <input 
                            type="checkbox" 
                            className="mr-2"
                            checked={selectedInvoices.includes(invoice.id)}
                            onChange={(e) => handleInvoiceSelection(invoice.id, e.target.checked)}
                          />
                          {invoice.id}
                        </TableCell>
                        <TableCell className="text-center">£{invoice.totalAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{invoice.paidAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£0.00</TableCell>
                        <TableCell className="text-center">£{invoice.outstandingAmount.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{invoice.outstandingAmount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="bg-blue-100">
                    <TableCell className="font-semibold">BALANCE</TableCell>
                    <TableCell className="bg-blue-200">
                      <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600">
                        📄
                      </Button>
                    </TableCell>
                    <TableCell className="bg-blue-200">
                      <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600">
                        📧
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">£{totalOutstandingAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£0.00</TableCell>
                    <TableCell className="text-center">£0.00</TableCell>
                    <TableCell className="text-center">£{totalOutstandingAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-semibold">Bal:£{totalOutstandingAmount.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
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
                    <TableHead>Supplier Invoice</TableHead>
                    <TableHead>Payment Mode</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead className="w-40">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPaymentHistory.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono">{payment.id}</TableCell>
                      <TableCell>{format(new Date(payment.paymentDate), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{payment.supplierInvoiceNumber || '-'}</TableCell>
                      <TableCell>{payment.paymentMode}</TableCell>
                      <TableCell className="text-right">£{payment.amount.toFixed(2)}</TableCell>
                      <TableCell>{payment.remarks || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {canEditPayment(payment.paymentDate) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditPayment(payment)}
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
                          {canEditPayment(payment.paymentDate) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePayment(payment.id)}
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
                            onClick={() => window.open(`/print/supplier-payment-receipt/${payment.id}`, '_blank')}
                            title="Print Payment Receipt"
                          >
                            <Receipt className="h-4 w-4" />
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

        {/* Update Payment Button and Balance Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex justify-end">
            <Button 
              className="bg-green-600 hover:bg-green-700"
              onClick={handleUpdatePayment}
              disabled={selectedInvoices.length === 0 || createPaymentMutation.isPending}
            >
              Update Payment
            </Button>
          </div>
          
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Running balance :</span>
                  <span>£{totalOutstandingAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>On Account balance :</span>
                  <span>£0.00</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>TOTAL Outstanding balance :</span>
                  <span>£{totalOutstandingAmount.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
