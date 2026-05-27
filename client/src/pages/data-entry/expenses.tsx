import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import BusinessDateDisplay from "@/components/common/business-date-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Receipt, FileText, Download, Copy, Printer, Search, Info, Edit, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ExpenseEntry, Expense, Supplier } from "@shared/schema";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { useQuery as useTanstackQuery } from '@tanstack/react-query';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useBusinessDate } from "@/hooks/use-business-date";

interface NewExpense {
  date: Date;
  supplierId: number | null;
  expenseId: number | null;
  invoiceNumber: string;
  remarks: string;
  paymentMode: string;
  amount: number;
  vatAmount: number;
}

export default function Expenses() {
  const { toast } = useToast();
  const { currentDate: businessDate } = useBusinessDate();
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");

  const [newExpense, setNewExpense] = useState<NewExpense>({
    date: businessDate ? new Date(businessDate) : new Date(),
    supplierId: null,
    expenseId: null,
    invoiceNumber: "",
    remarks: "",
    paymentMode: "CASH",
    amount: 0,
    vatAmount: 0
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [taxDetails, setTaxDetails] = useState({ withTax: false, taxPercentage: '0' });

  // Fetch expense entries
  const { data: expenseEntries = [], isLoading, refetch } = useQuery<ExpenseEntry[]>({
    queryKey: ["expense-entries", fromDate, toDate, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.append('fromDate', format(fromDate, 'yyyy-MM-dd'));
      if (toDate) params.append('toDate', format(toDate, 'yyyy-MM-dd'));
      if (searchTerm) params.append('search', searchTerm);

      return apiRequest("GET", `/api/expense-entries?${params.toString()}`);
    }
  });

  // Fetch suppliers for dropdown
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => apiRequest("GET", "/api/suppliers")
  });

  // Fetch expense categories for dropdown
  const { data: expenseCategories = [] } = useQuery<Expense[]>({
    queryKey: ["expenses"],
    queryFn: async () => apiRequest("GET", "/api/expenses")
  });

  // Fetch company details
  const { data: companyDetails } = useTanstackQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Fetch business date for new expense
  const { data: businessDateData } = useTanstackQuery<{ business_date: string }>({
    queryKey: ["business-date"],
    queryFn: () => apiRequest("GET", "/api/business-date"),
    enabled: dialogOpen, // Only fetch when dialog is open
  });
  useEffect(() => {
    if (businessDate) {
      const businessDateObj = new Date(businessDate);
      setFromDate(businessDateObj);
      setToDate(businessDateObj);
    }
  }, [businessDate]);
  useEffect(() => {
    if (dialogOpen && businessDateData?.business_date) {
      setNewExpense((prev) => ({
        ...prev,
        date: new Date(businessDateData.business_date),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, businessDateData?.business_date]);

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => {
      setTaxDetails({
        withTax: !!settings.withTax,
        taxPercentage: settings.taxPercentage ? String(settings.taxPercentage) : '0',
      });
    });
  }, []);

  // Create expense entry mutation
  const createExpenseMutation = useMutation({
    mutationFn: async (data: Omit<NewExpense, 'date'> & { date: string }) => {
      return apiRequest("POST", "/api/expense-entries", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-entries"] });
      toast({
        title: "Success",
        description: "Expense entry created successfully",
      });
      resetForm();
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create expense entry",
        variant: "destructive",
      });
    },
  });

  // Update expense entry mutation
  const updateExpenseMutation = useMutation({
    mutationFn: async (data: { id: number } & Omit<NewExpense, 'date'> & { date: string }) => {
      return apiRequest("PUT", `/api/expense-entries/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-entries"] });
      toast({
        title: "Success",
        description: "Expense entry updated successfully",
      });
      resetForm();
      setDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update expense entry",
        variant: "destructive",
      });
    },
  });

  // Delete expense entry mutation
  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/expense-entries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-entries"] });
      toast({
        title: "Success",
        description: "Expense entry deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete expense entry",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setNewExpense({
      date: businessDate ? new Date(businessDate) : new Date(),
      supplierId: null,
      expenseId: null,
      invoiceNumber: "",
      remarks: "",
      paymentMode: "CASH",
      amount: 0,
      vatAmount: 0
    });
    setEditingExpense(null);
  };

  const handleAddExpense = () => {
    if (!newExpense.supplierId || !newExpense.expenseId || newExpense.amount <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields and ensure amount is greater than 0",
        variant: "destructive",
      });
      return;
    }

    // Calculate actual VAT value
    const vatValue = (newExpense.amount * newExpense.vatAmount) / 100;
    const expenseData = {
      ...newExpense,
      vatAmount: vatValue,
      date: format(newExpense.date, 'yyyy-MM-dd')
    };

    if (editingExpense) {
      updateExpenseMutation.mutate({ ...expenseData, id: editingExpense.id });
    } else {
      createExpenseMutation.mutate(expenseData);
    }
  };

  const handleEditExpense = (expense: ExpenseEntry) => {
    setNewExpense({
      date: new Date(expense.date),
      supplierId: expense.supplierId,
      expenseId: expense.expenseId,
      invoiceNumber: expense.invoiceNumber || "",
      remarks: expense.remarks || "",
      paymentMode: expense.paymentMode,
      amount: expense.amount,
      vatAmount: expense.vatAmount || 0
    });
    setEditingExpense(expense);
    setDialogOpen(true);
  };

  const handleDeleteExpense = (id: number) => {
    if (confirm("Are you sure you want to delete this expense entry?")) {
      deleteExpenseMutation.mutate(id);
    }
  };

  const handleSearch = () => {
    refetch();
  };

  const totalAmount = expenseEntries.reduce((sum, expense) => sum + expense.totalAmount, 0);

  // Export handlers (same as Dumps)
  const exportTitle = 'Expense Entries';
  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Expense Entries</title>');
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
      printWindow.document.write('<h3>EXPENSES</h3>');
      printWindow.document.write(`<p>Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}</p>`);
      printWindow.document.write('</div>');

      // Add table
      printWindow.document.write('<table>');
      printWindow.document.write('<thead><tr>');
      const headers = ['Date', 'Supplier', 'Expenses Category', 'Invoice #', 'Remarks', 'Payment Mode', 'Amount(Exc VAT)'];
      headers.forEach(h => {
        printWindow.document.write(`<th>${h}</th>`);
      });
      printWindow.document.write('</tr></thead><tbody>');
      expenseEntries.forEach((item: ExpenseEntry) => {
        printWindow.document.write('<tr>');
        printWindow.document.write(`<td>${format(new Date(item.date), "dd/MM/yyyy")}</td>`);
        printWindow.document.write(`<td>${item.supplierName || '-'}</td>`);
        printWindow.document.write(`<td>${item.expenseName || '-'}</td>`);
        printWindow.document.write(`<td>${item.invoiceNumber || '-'}</td>`);
        printWindow.document.write(`<td>${item.remarks || '-'}</td>`);
        printWindow.document.write(`<td>${item.paymentMode}</td>`);
        printWindow.document.write(`<td>£${item.amount.toFixed(2)}</td>`);
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
    const wsData = [
      [exportTitle],
      ['Date', 'Supplier', 'Expenses Category', 'Invoice #', 'Remarks', 'Payment Mode', 'Amount(Exc VAT)'],
      ...expenseEntries.map((item: ExpenseEntry) => ([
        format(new Date(item.date), "dd/MM/yyyy"),
        item.supplierName || '-',
        item.expenseName || '-',
        item.invoiceNumber || '-',
        item.remarks || '-',
        item.paymentMode,
        item.amount,
      ])),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expense Entries');
    XLSX.writeFile(wb, 'expense-entries.xlsx');
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
    doc.text('EXPENSES', 105, yPosition, { align: 'center' });
    yPosition += 8;

    doc.setFontSize(10);
    doc.text(`Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, 105, yPosition, { align: 'center' });
    yPosition += 10;

    // Add table
    autoTable(doc, {
      head: [[
        'Date', 'Supplier', 'Expenses Category', 'Invoice #', 'Remarks', 'Payment Mode', 'Amount(Exc VAT)'
      ]],
      body: expenseEntries.map((item: ExpenseEntry) => [
        format(new Date(item.date), "dd/MM/yyyy"),
        item.supplierName || '-',
        item.expenseName || '-',
        item.invoiceNumber || '-',
        item.remarks || '-',
        item.paymentMode,
        `£${item.amount.toFixed(2)}`,
      ]),
      startY: yPosition,
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 25 },
        4: { cellWidth: 30 },
        5: { cellWidth: 25 },
        6: { cellWidth: 25 }
      }
    });

    doc.save(`expenses-${format(fromDate, "yyyyMMdd")}-${format(toDate, "yyyyMMdd")}.pdf`);
  };

  const handleCopy = () => {
    const headers = ['Date', 'Supplier', 'Expenses Category', 'Invoice #', 'Remarks', 'Payment Mode', 'Amount(Exc VAT)'];
    const rows = expenseEntries.map((item: ExpenseEntry) => [
      format(new Date(item.date), "dd/MM/yyyy"),
      item.supplierName || '-',
      item.expenseName || '-',
      item.invoiceNumber || '-',
      item.remarks || '-',
      item.paymentMode,
      item.amount,
    ]);
    const text = [headers, ...rows].map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'Expense entries copied to clipboard.' });
  };

  return (
    <PageLayout title="Expenses" breadcrumb="Expenses">
      <div className="space-y-6">
        {/* Business Date Display */}
        <BusinessDateDisplay />

        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Receipt size={20} />
                Expenses
              </CardTitle>
              <div className="text-sm text-gray-500">
                {companyDetails?.companyName || 'Company Name'}, {companyDetails?.address1 || ''}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ''}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <Label>From Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-32 justify-start text-left font-normal",
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

              <div>
                <Label>To Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-32 justify-start text-left font-normal",
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

              <Button className="bg-blue-500 hover:bg-blue-600" onClick={handleSearch}>
                Search
              </Button>

              <div className="ml-auto flex gap-2">
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                  setDialogOpen(open);
                  if (!open) resetForm();
                }}>
                  <DialogTrigger asChild>
                    <Button className="bg-green-500 hover:bg-green-600 text-white" onClick={() => {
                      resetForm();
                      setDialogOpen(true);
                    }}>
                      Add Expense
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingExpense ? 'Edit Expense' : 'Add New Expense'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label>Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal text-xs",
                                !newExpense.date && "text-muted-foreground"
                              )}
                            >
                              {newExpense.date ? format(newExpense.date, "yyyyMMdd") : "Pick date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={newExpense.date}
                              onSelect={(date) => date && setNewExpense({ ...newExpense, date })}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div>
                        <Label>Supplier</Label>
                        <Select
                          value={newExpense.supplierId?.toString() || ""}
                          onValueChange={(value) => setNewExpense({ ...newExpense, supplierId: value ? parseInt(value) : null })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {suppliers.map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id.toString()}>
                                {supplier.supplier_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Category</Label>
                        <Select
                          value={newExpense.expenseId?.toString() || ""}
                          onValueChange={(value) => setNewExpense({ ...newExpense, expenseId: value ? parseInt(value) : null })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {expenseCategories.map((category) => (
                              <SelectItem key={category.id} value={category.id.toString()}>
                                {category.expenseName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Invoice #</Label>
                        <Input
                          placeholder="Invoice #"
                          value={newExpense.invoiceNumber}
                          onChange={(e) => setNewExpense({ ...newExpense, invoiceNumber: e.target.value })}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <Label>Remarks</Label>
                        <Input
                          placeholder="Remarks"
                          value={newExpense.remarks}
                          onChange={(e) => setNewExpense({ ...newExpense, remarks: e.target.value })}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <Label>Payment Mode</Label>
                        <Select
                          value={newExpense.paymentMode}
                          onValueChange={(value) => setNewExpense({ ...newExpense, paymentMode: value })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">CASH</SelectItem>
                            <SelectItem value="CARD">CARD</SelectItem>
                            <SelectItem value="BANK">BANK</SelectItem>
                            <SelectItem value="CHEQUE">CHEQUE</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Amount (Exc VAT)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newExpense.amount === 0 ? "" : newExpense.amount}
                          onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) || 0 })}
                          className="w-full text-right"
                          min="0"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label>VAT %</Label>
                        <Select
                          value={newExpense.vatAmount.toString()}
                          onValueChange={(value) => {
                            const vatPercent = parseFloat(value);
                            const vatAmount = (newExpense.amount * vatPercent) / 100;
                            setNewExpense({
                              ...newExpense,
                              vatAmount: vatPercent,
                            });
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="VAT %" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="5">5%</SelectItem>
                            <SelectItem value="10">10%</SelectItem>
                            <SelectItem value="15">15%</SelectItem>
                            <SelectItem value="20">20%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>VAT Amount</Label>
                        <Input
                          type="number"
                          value={((newExpense.amount * newExpense.vatAmount) / 100).toFixed(2)}
                          readOnly
                          className="w-full text-right bg-gray-100"
                        />
                      </div>
                      <div>
                        <Label>Total (Inc VAT)</Label>
                        <Input
                          type="number"
                          value={(newExpense.amount + (newExpense.amount * newExpense.vatAmount) / 100).toFixed(2)}
                          readOnly
                          className="w-full text-right bg-gray-100"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        className="bg-green-500 hover:bg-green-600 text-white w-full"
                        onClick={handleAddExpense}
                        disabled={createExpenseMutation.isPending || updateExpenseMutation.isPending}
                      >
                        {(createExpenseMutation.isPending || updateExpenseMutation.isPending) ? "Saving..." : editingExpense ? "Update" : "Save"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" className="flex items-center gap-2">
                  <Info size={16} />
                  ?
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expenses Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
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
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Expenses Category</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Payment Mode</TableHead>
                  <TableHead>Amount(Exc VAT)</TableHead>
                  <TableHead>Amount (Inc VAT)</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : expenseEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No data available in table
                    </TableCell>
                  </TableRow>
                ) : (
                  expenseEntries.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{format(new Date(expense.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{expense.supplierName || '-'}</TableCell>
                      <TableCell>{expense.expenseName || '-'}</TableCell>
                      <TableCell>{expense.invoiceNumber || '-'}</TableCell>
                      <TableCell>{expense.remarks || '-'}</TableCell>
                      <TableCell>{expense.paymentMode}</TableCell>
                      <TableCell className="text-right">£{expense.amount.toFixed(2)}</TableCell>
                      <TableCell className="text-right">£{(expense.amount + (expense.amount * (expense.vatAmount || 0) / 100)).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditExpense(expense)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}

                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300">
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">£{totalAmount.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold">£{expenseEntries.reduce((sum, expense) => sum + (expense.amount + (expense.amount * (expense.vatAmount || 0) / 100)), 0).toFixed(2)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing {expenseEntries.length} entries</div>
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
      </div>
    </PageLayout>
  );
}