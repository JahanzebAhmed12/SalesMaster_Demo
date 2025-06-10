import { useState } from "react";
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

interface ExpenseEntry {
  id: number;
  ref: string;
  date: Date;
  supplier: string;
  expenseCategory: string;
  description: string;
  invoiceNo: string;
  remarks: string;
  paymentMode: string;
  amount: number;
}

export default function Expenses() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [searchTerm, setSearchTerm] = useState("");
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [newExpense, setNewExpense] = useState({
    date: new Date(2025, 5, 10),
    supplier: "",
    expenseCategory: "",
    description: "",
    invoiceNo: "",
    remarks: "",
    paymentMode: "CASH",
    amount: 0
  });

  const handleAddExpense = () => {
    if (newExpense.supplier && newExpense.expenseCategory && newExpense.amount > 0) {
      const expense: ExpenseEntry = {
        id: Date.now(),
        ref: `E${expenses.length + 1}`,
        date: newExpense.date,
        supplier: newExpense.supplier,
        expenseCategory: newExpense.expenseCategory,
        description: newExpense.description,
        invoiceNo: newExpense.invoiceNo,
        remarks: newExpense.remarks,
        paymentMode: newExpense.paymentMode,
        amount: newExpense.amount
      };
      setExpenses([...expenses, expense]);
      setNewExpense({
        date: new Date(2025, 5, 10),
        supplier: "",
        expenseCategory: "",
        description: "",
        invoiceNo: "",
        remarks: "",
        paymentMode: "CASH",
        amount: 0
      });
    }
  };

  const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

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
              
              <Button className="bg-blue-500 hover:bg-blue-600">
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
                {expenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No data available in table
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{expense.ref}</TableCell>
                      <TableCell>{format(expense.date, "dd/MM/yyyy")}</TableCell>
                      <TableCell>{expense.supplier}</TableCell>
                      <TableCell>{expense.expenseCategory}</TableCell>
                      <TableCell>{expense.description}</TableCell>
                      <TableCell>{expense.invoiceNo}</TableCell>
                      <TableCell>{expense.remarks}</TableCell>
                      <TableCell>{expense.paymentMode}</TableCell>
                      <TableCell className="text-right">£{expense.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
                
                {/* Add New Expense Row */}
                <TableRow className="border-t-2 border-gray-200">
                  <TableCell>E{expenses.length + 1}</TableCell>
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
                      value={newExpense.supplier} 
                      onValueChange={(value) => setNewExpense({...newExpense, supplier: value})}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Office Supplies Ltd">Office Supplies Ltd</SelectItem>
                        <SelectItem value="Utility Company">Utility Company</SelectItem>
                        <SelectItem value="Transport Services">Transport Services</SelectItem>
                        <SelectItem value="Maintenance Co">Maintenance Co</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={newExpense.expenseCategory} 
                      onValueChange={(value) => setNewExpense({...newExpense, expenseCategory: value})}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Office Expenses">Office Expenses</SelectItem>
                        <SelectItem value="Transport">Transport</SelectItem>
                        <SelectItem value="Utilities">Utilities</SelectItem>
                        <SelectItem value="Maintenance">Maintenance</SelectItem>
                        <SelectItem value="Marketing">Marketing</SelectItem>
                        <SelectItem value="Insurance">Insurance</SelectItem>
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
                      value={newExpense.invoiceNo}
                      onChange={(e) => setNewExpense({...newExpense, invoiceNo: e.target.value})}
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
                      >
                        Save
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
              <div>Showing 0 to 0 of 0 entries</div>
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