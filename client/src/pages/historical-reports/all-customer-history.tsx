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
import { CalendarIcon, Users, FileText, Download, Copy, Printer, Search, Printer as PrintIcon, FileText as ReportIcon, Globe } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface CustomerData {
  id: number;
  slNo: number;
  customerName: string;
  creditInvoice: number;
  cashInvoice: number;
  amountReceived: number;
  returnsDiscount: number;
  onAccount: number;
  balanceOutstanding: number;
  creditLimit: number;
  currency: string;
}

export default function AllCustomerHistory() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [customerFilter, setCustomerFilter] = useState("All Customer");
  const [badDebtFilter, setBadDebtFilter] = useState("Show Bad Debt");
  const [searchTerm, setSearchTerm] = useState("TR");

  const [customerData] = useState<CustomerData[]>([
    {
      id: 1, slNo: 22, customerName: "F&R ENTERPRISE LTD", creditInvoice: 0.00, cashInvoice: 350.00,
      amountReceived: 0.00, returnsDiscount: 0.00, onAccount: 0.00, balanceOutstanding: 0.00,
      creditLimit: 0, currency: "GBP"
    },
    {
      id: 2, slNo: 15, customerName: "TROPIFRUIT STAND 100", creditInvoice: 32085.60, cashInvoice: 0.00,
      amountReceived: 221.00, returnsDiscount: 0.00, onAccount: 8.00, balanceOutstanding: 31856.60,
      creditLimit: 0, currency: "GBP"
    }
  ]);

  const totals = {
    creditInvoice: customerData.reduce((sum, item) => sum + item.creditInvoice, 0),
    cashInvoice: customerData.reduce((sum, item) => sum + item.cashInvoice, 0),
    amountReceived: customerData.reduce((sum, item) => sum + item.amountReceived, 0),
    returnsDiscount: customerData.reduce((sum, item) => sum + item.returnsDiscount, 0),
    onAccount: customerData.reduce((sum, item) => sum + item.onAccount, 0),
    balanceOutstanding: customerData.reduce((sum, item) => sum + item.balanceOutstanding, 0)
  };

  return (
    <PageLayout title="All Customer History" breadcrumb="Historical Reports > All Customer History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Users size={20} />
                All Customer History
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
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
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Customer">All Customer</SelectItem>
                    <SelectItem value="Exclude Bad Debt" className="bg-cyan-500 text-white">Exclude Bad Debt</SelectItem>
                    <SelectItem value="Show Bad Debt">Show Bad Debt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full">
                  Search
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <PrintIcon size={16} />
                  Print
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  Weekly statement
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <ReportIcon size={16} />
                  Report
                </Button>
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Globe size={16} />
                  Select Currency
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Statement Section */}
        <Card>
          <CardHeader>
            <div className="bg-cyan-500 text-white text-center py-2 rounded">
              CUSTOMER STATEMENT (IN Respective Currency)
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

            <Table>
              <TableHeader>
                <TableRow className="bg-blue-100">
                  <TableHead>Sl.No</TableHead>
                  <TableHead>Customer name</TableHead>
                  <TableHead className="text-center">Credit Invoice</TableHead>
                  <TableHead className="text-center">Cash Invoice</TableHead>
                  <TableHead className="text-center">Amount Received</TableHead>
                  <TableHead className="text-center">Returns/ Discount</TableHead>
                  <TableHead className="text-center">On Account</TableHead>
                  <TableHead className="text-center">Balance/ outstanding</TableHead>
                  <TableHead className="text-center">Credit Limit</TableHead>
                  <TableHead className="text-center">Curr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerData.map((customer) => (
                  <TableRow key={customer.id} className="hover:bg-gray-50">
                    <TableCell>{customer.slNo}</TableCell>
                    <TableCell>{customer.customerName}</TableCell>
                    <TableCell className="text-center">{customer.creditInvoice.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.cashInvoice.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.amountReceived.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.returnsDiscount.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.onAccount.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.balanceOutstanding.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.creditLimit}</TableCell>
                    <TableCell className="text-center">{customer.currency}</TableCell>
                  </TableRow>
                ))}
                
                {/* GBP Row */}
                <TableRow className="bg-gray-100 border-t">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">GBP</TableCell>
                  <TableCell className="text-center font-bold">{totals.creditInvoice.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.cashInvoice.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.amountReceived.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.returnsDiscount.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.onAccount.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.balanceOutstanding.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">GBP</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-green-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-center font-bold">{totals.creditInvoice.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.cashInvoice.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.amountReceived.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.returnsDiscount.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.onAccount.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.balanceOutstanding.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">0.00</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to 2 of 2 entries (filtered from 88 total entries)</div>
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