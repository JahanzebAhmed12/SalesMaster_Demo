import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Customer } from "@shared/schema";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Download, Copy, Printer, Search, Mail, Receipt } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface StatementData {
  id: number;
  slNo: number;
  date: string;
  invoiceNo: string;
  description: string;
  creditInv: number;
  cashInv: number;
  paid: number;
  creditAdj: number;
  discountAdj: number;
  balance: number;
  runningBalance: number;
}

export default function CustomerStatement() {
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [statementType, setStatementType] = useState("Full Statement");
  const [searchTerm, setSearchTerm] = useState("");
  const [statementData, setStatementData] = useState<StatementData[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch customers for dropdown
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });

  const totals = {
    creditInv: statementData.reduce((sum, item) => sum + item.creditInv, 0),
    cashInv: statementData.reduce((sum, item) => sum + item.cashInv, 0),
    paid: statementData.reduce((sum, item) => sum + item.paid, 0),
    creditAdj: statementData.reduce((sum, item) => sum + item.creditAdj, 0),
    discountAdj: statementData.reduce((sum, item) => sum + item.discountAdj, 0),
    balance: statementData.reduce((sum, item) => sum + item.balance, 0)
  };

  // Reset date fields to today every time the page is opened
  useEffect(() => {
    setFromDate(new Date());
    setToDate(new Date());
  }, []);

  return (
    <PageLayout title="Customer Statement" breadcrumb="Historical Reports > Customer Statement">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Receipt size={20} />
                Customer Statement
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div>
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingCustomers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.customer_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>From:</Label>
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
              
              <div>
                <Label>To:</Label>
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
              
              <div>
                <Select value={statementType} onValueChange={setStatementType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full Statement">Full Statement</SelectItem>
                    <SelectItem value="Outstanding Only">Outstanding Only</SelectItem>
                    <SelectItem value="Paid Only">Paid Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Button
                  className="bg-blue-500 hover:bg-blue-600 w-full"
                  disabled={!selectedCustomer || loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await apiRequest(
                        "GET",
                        `/api/reports/customer-statement?customerId=${selectedCustomer}&fromDate=${format(fromDate, "yyyy-MM-dd")}&toDate=${format(toDate, "yyyy-MM-dd")}&type=${encodeURIComponent(statementType)}`
                      );
                      setStatementData(res);
                    } catch (err) {
                      // handle error, e.g. show toast
                    }
                    setLoading(false);
                  }}
                >
                  {loading ? "Loading..." : "Generate"}
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Mail size={16} />
                  Email
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Printer size={16} />
                  Print
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statement Details Section */}
        <Card>
          <CardHeader>
            <div className="bg-green-600 text-white text-center py-2 rounded">
              ACCOUNT STATEMENT - {selectedCustomer}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-semibold">Customer Details:</div>
                <div>{customers.find(c => c.id.toString() === selectedCustomer)?.customer_name || ''}</div>
                <div>Account No: C-{selectedCustomer}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">Statement Period:</div>
                <div>From: {fromDate ? format(fromDate, "dd/MM/yyyy") : ""}</div>
                <div>To: {toDate ? format(toDate, "dd/MM/yyyy") : ""}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline">Show all rows</Button>
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

            <div className="mb-4 p-3 bg-gray-50 rounded">
              <div className="flex justify-between">
                <span className="font-medium">BROUGHT FORWARD:</span>
                <span className="font-bold">£ 0.00</span>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-green-100">
                  <TableHead>Sl.No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Credit Inv.</TableHead>
                  <TableHead className="text-center">Cash Inv.</TableHead>
                  <TableHead className="text-center">Paid</TableHead>
                  <TableHead className="text-center">Credit/Adj</TableHead>
                  <TableHead className="text-center">Discount/Adj</TableHead>
                  <TableHead className="text-center">Balance</TableHead>
                  <TableHead className="text-center">Running Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statementData.map((statement) => (
                  <TableRow key={statement.id} className="hover:bg-gray-50">
                    <TableCell>{statement.slNo}</TableCell>
                    <TableCell>{format(new Date(statement.date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{statement.invoiceNo}</TableCell>
                    <TableCell>{statement.description}</TableCell>
                    <TableCell className="text-center">£{statement.creditInv.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{statement.cashInv.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{statement.paid.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{statement.creditAdj.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{statement.discountAdj.toFixed(2)}</TableCell>
                    <TableCell className={`text-center font-medium ${statement.balance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      £{statement.balance.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-center font-bold ${statement.runningBalance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      £{statement.runningBalance.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-indigo-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-center font-bold">£{totals.creditInv.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£{totals.cashInv.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£{totals.paid.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£{totals.creditAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£{totals.discountAdj.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">£{totals.balance.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold text-red-600">£{statementData[statementData.length - 1]?.runningBalance.toFixed(2) || '0.00'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            
            <div className="mt-6 p-4 bg-gray-50 rounded">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="font-semibold mb-2">Summary:</div>
                  <div>Total Credit Sales: £{totals.creditInv.toFixed(2)}</div>
                  <div>Total Payments: £{totals.paid.toFixed(2)}</div>
                  <div>Total Adjustments: £{(totals.creditAdj + totals.discountAdj).toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold mb-2 text-lg">Current Balance:</div>
                  <div className={`text-2xl font-bold ${statementData[statementData.length - 1]?.runningBalance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    £{statementData[statementData.length - 1]?.runningBalance.toFixed(2) || '0.00'}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {statementData.length} of {statementData.length} entries</div>
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