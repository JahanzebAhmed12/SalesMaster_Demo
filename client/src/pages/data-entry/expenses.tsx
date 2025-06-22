import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Receipt, FileText, Download, Copy, Printer, Search, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ExpenseEntry, Expense, Supplier } from "@shared/schema";

interface NewExpense {
  date: Date;
  supplierId: number | null;
  expenseId: number | null;
  description: string;
  invoiceNumber: string;
  remarks: string;
  paymentMode: string;
  amount: number;
  vatAmount: number;
}

export default function Expenses() {
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [newExpense, setNewExpense] = useState<NewExpense>({
    date: new Date(),
    supplierId: null,
    expenseId: null,
    description: "",
    invoiceNumber: "",
    remarks: "",
    paymentMode: "CASH",
    amount: 0,
    vatAmount: 0
  });

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
      // Reset form
      setNewExpense({
        date: new Date(),
        supplierId: null,
        expenseId: null,
        description: "",
        invoiceNumber: "",
        remarks: "",
        paymentMode: "CASH",
        amount: 0,
        vatAmount: 0
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create expense entry",
        variant: "destructive",
      });
    },
  });

  const handleAddExpense = () => {
    if (!newExpense.supplierId || !newExpense.expenseId || !newExpense.description || newExpense.amount <= 0) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields and ensure amount is greater than 0",
        variant: "destructive",
      });
      return;
    }

    const expenseData = {
      ...newExpense,
      date: format(newExpense.date, 'yyyy-MM-dd')
    };

    createExpenseMutation.mutate(expenseData);
  };

  const handleSearch = () => {
    refetch();
  };

  const totalAmount = expenseEntries.reduce((sum, expense) => sum + expense.totalAmount, 0);

  return (
    <PageLayout title="Expenses" breadcrumb="Expenses">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Receipt size={20} />
                Expenses
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
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
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Printer size={16} />
                  Print
                </Button>
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
                <Button size="sm" variant="outline" className="flex items-center gap-1">
                  <FileText size={14} />
                  PDF
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1">
                  <Download size={14} />
                  Excel
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1">
                  <Copy size={14} />
                  Copy
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1">
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
                  <TableHead>Ref.#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Expenses Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Payment Mode</TableHead>
                  <TableHead>Amount(Exc VAT)</TableHead>
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
                      <TableCell>{expense.refNumber}</TableCell>
                      <TableCell>{format(new Date(expense.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{expense.supplierName || '-'}</TableCell>
                      <TableCell>{expense.expenseName || '-'}</TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell>{expense.invoiceNumber || '-'}</TableCell>
                      <TableCell>{expense.remarks || '-'}</TableCell>
                      <TableCell>{expense.paymentMode}</TableCell>
                      <TableCell className="text-right">£{expense.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
                
                {/* Add New Expense Row */}
                <TableRow className="border-t-2 border-gray-200">
                  <TableCell>E{expenseEntries.length + 1}</TableCell>
                  <TableCell>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-28 justify-start text-left font-normal text-xs",
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
                          onSelect={(date) => date && setNewExpense({...newExpense, date})}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={newExpense.supplierId?.toString() || ""} 
                      onValueChange={(value) => setNewExpense({...newExpense, supplierId: value ? parseInt(value) : null})}
                    >
                      <SelectTrigger className="w-32">
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
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={newExpense.expenseId?.toString() || ""} 
                      onValueChange={(value) => setNewExpense({...newExpense, expenseId: value ? parseInt(value) : null})}
                    >
                      <SelectTrigger className="w-32">
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
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Description"
                      value={newExpense.description}
                      onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Invoice #"
                      value={newExpense.invoiceNumber}
                      onChange={(e) => setNewExpense({...newExpense, invoiceNumber: e.target.value})}
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Remarks"
                      value={newExpense.remarks}
                      onChange={(e) => setNewExpense({...newExpense, remarks: e.target.value})}
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={newExpense.paymentMode} 
                      onValueChange={(value) => setNewExpense({...newExpense, paymentMode: value})}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">CASH</SelectItem>
                        <SelectItem value="CARD">CARD</SelectItem>
                        <SelectItem value="BANK">BANK</SelectItem>
                        <SelectItem value="CHEQUE">CHEQUE</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 items-center">
                      <Input
                        type="number"
                        step="0.01"
                        value={newExpense.amount}
                        onChange={(e) => setNewExpense({...newExpense, amount: parseFloat(e.target.value) || 0})}
                        className="w-20 text-right"
                        min="0"
                      />
                      <Button 
                        size="sm" 
                        className="bg-green-500 hover:bg-green-600 text-white px-2"
                        onClick={handleAddExpense}
                        disabled={createExpenseMutation.isPending}
                      >
                        {createExpenseMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300">
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">£{totalAmount.toFixed(2)}</TableCell>
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