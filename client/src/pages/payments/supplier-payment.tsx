import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Copy, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePaymentsMutations } from "@/hooks/usePaymentsMutations";
import { useBusinessDate } from "@/hooks/use-business-date";
import type { Supplier, SupplierPayment, InsertSupplierPayment } from "@shared/schema";
import { Checkbox } from "@/components/ui/checkbox";

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

  // Update payment date when business date changes
  useEffect(() => {
    if (businessDate) {
      setPaymentDate(new Date(businessDate));
    }
  }, [businessDate]);

  // Fetch suppliers
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Fetch outstanding invoices for selected supplier
  const { data: outstandingInvoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ["/api/suppliers/outstanding_invoices", selectedSupplier],
    queryFn: () => apiRequest("GET", `/api/suppliers/${selectedSupplier}/outstanding_invoices`),
    enabled: !!selectedSupplier,
  });

  // Use standardized mutation
  const createPaymentMutation = supplierPayment.create;

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
      }
    });
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

    // Create payments for each selected invoice with its specific outstanding amount
    const paymentPromises = selectedInvoices.map(invoiceId => {
      const invoice = outstandingInvoices.find((inv: OutstandingInvoice) => inv.id === invoiceId);
      if (!invoice) return Promise.reject(new Error(`Invoice data not found for ID: ${invoiceId}`));

      const paymentData: InsertSupplierPayment = {
        supplierId: parseInt(selectedSupplier),
        purchaseInvoiceId: invoiceId,
        amount: invoice.outstandingAmount, // Use the specific invoice's outstanding amount
        paymentMode: paymentMode,
        paymentDate: format(paymentDate, "yyyy-MM-dd"),
        remarks: remarks || `Payment for invoice #${invoiceId}`,
        supplierInvoiceNumber: supplierInvoiceNumber || null,
        supplierInvoiceDate: supplierInvoiceDate ? format(supplierInvoiceDate, "yyyy-MM-dd") : null,
      };
      return apiRequest("POST", "/api/supplier-payments", paymentData);
    });

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
      }
    });
  };

  // Calculate totals
  const selectedInvoiceData = outstandingInvoices.filter((invoice: OutstandingInvoice) => 
    selectedInvoices.includes(invoice.id)
  );

  const totalSelectedAmount = selectedInvoiceData.reduce((sum: number, invoice: OutstandingInvoice) => sum + invoice.outstandingAmount, 0);
  const totalOutstandingAmount = outstandingInvoices.reduce((sum: number, invoice: OutstandingInvoice) => sum + invoice.outstandingAmount, 0);

  // This effect automatically updates the "Amount Paid" field when invoices are selected
  useEffect(() => {
    if (selectedInvoices.length > 0) {
      const totalSelected = outstandingInvoices
        .filter((invoice: OutstandingInvoice) => selectedInvoices.includes(invoice.id))
        .reduce((sum: number, invoice: OutstandingInvoice) => sum + invoice.outstandingAmount, 0);
      setAmountPaid(totalSelected.toFixed(2));
    } else {
      setAmountPaid("0");
    }
  }, [selectedInvoices, outstandingInvoices]);

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

            <div className="flex justify-end">
              <Button 
                className="bg-blue-600 hover:bg-blue-700"
                onClick={handleSubmitPayment}
                disabled={createPaymentMutation.isPending}
              >
                {createPaymentMutation.isPending ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table Section */}
        <Card>
          <CardContent className="p-6">
            {/* Export and Search */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm">
                  <FileText className="w-4 h-4 mr-2" />
                  PDF
                </Button>
                <Button variant="outline" size="sm">
                  Excel
                </Button>
                <Button variant="outline" size="sm">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
                <Button variant="outline" size="sm">
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <Label htmlFor="search">Search:</Label>
                <Input
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-48"
                  placeholder=""
                />
              </div>
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
      </div>
    </div>
  );
}
