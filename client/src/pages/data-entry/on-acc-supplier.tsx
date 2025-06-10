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
import { CalendarIcon, Truck, Search, Info, Save } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SupplierPayment {
  id: number;
  slNo: number;
  paymentDate: Date;
  supplier: string;
  paymentMode: string;
  currency: string;
  amount: number;
  remarks: string;
  status: string;
}

export default function OnAccSupplier() {
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [searchTerm, setSearchTerm] = useState("");
  const [recordsPerPage, setRecordsPerPage] = useState("10");
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [newPayment, setNewPayment] = useState({
    paymentDate: new Date(),
    supplier: "",
    paymentMode: "CASH",
    currency: "CAD",
    amount: 0,
    remarks: "",
    status: "Pending"
  });

  const handleAddPayment = () => {
    if (newPayment.supplier && newPayment.amount > 0) {
      const payment: SupplierPayment = {
        id: Date.now(),
        slNo: payments.length + 1,
        paymentDate: newPayment.paymentDate,
        supplier: newPayment.supplier,
        paymentMode: newPayment.paymentMode,
        currency: newPayment.currency,
        amount: newPayment.amount,
        remarks: newPayment.remarks,
        status: newPayment.status
      };
      setPayments([...payments, payment]);
      setNewPayment({
        paymentDate: new Date(),
        supplier: "",
        paymentMode: "CASH",
        currency: "CAD",
        amount: 0,
        remarks: "",
        status: "Pending"
      });
    }
  };

  const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <PageLayout title="On A/c Supplier Payments" breadcrumb="On A/c Supplier">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Truck size={20} />
                On A/c Supplier Payments
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supplier1">ABC Suppliers Ltd</SelectItem>
                    <SelectItem value="supplier2">Global Trade Co</SelectItem>
                    <SelectItem value="supplier3">Premium Goods Inc</SelectItem>
                    <SelectItem value="supplier4">Swift Logistics</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-2 items-end">
                <div>
                  <Label className="text-xs">From Date:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-28 justify-start text-left font-normal text-xs",
                          !fromDate && "text-muted-foreground"
                        )}
                      >
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
                  <Label className="text-xs">To Date:</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-28 justify-start text-left font-normal text-xs",
                          !toDate && "text-muted-foreground"
                        )}
                      >
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
              </div>
              
              <div></div>
              
              <div className="flex gap-2">
                <Button variant="outline" className="flex items-center gap-2">
                  <Info size={16} />
                  Options
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex gap-2 items-center">
                <Select value={recordsPerPage} onValueChange={setRecordsPerPage}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 records per page</SelectItem>
                    <SelectItem value="25">25 records per page</SelectItem>
                    <SelectItem value="50">50 records per page</SelectItem>
                    <SelectItem value="100">100 records per page</SelectItem>
                  </SelectContent>
                </Select>
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
                  <TableHead>Sl.No.</TableHead>
                  <TableHead>Payment date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Payment Mode</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      No data available in table
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{payment.slNo}</TableCell>
                      <TableCell>{format(payment.paymentDate, "dd/MM/yyyy")}</TableCell>
                      <TableCell>{payment.supplier}</TableCell>
                      <TableCell>{payment.paymentMode}</TableCell>
                      <TableCell>{payment.currency}</TableCell>
                      <TableCell className="text-right">{payment.amount.toFixed(2)}</TableCell>
                      <TableCell>{payment.remarks}</TableCell>
                      <TableCell>{payment.status}</TableCell>
                    </TableRow>
                  ))
                )}
                
                {/* Add New Payment Row */}
                <TableRow className="border-t-2 border-gray-200">
                  <TableCell>{payments.length + 1}</TableCell>
                  <TableCell>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-24 justify-start text-left font-normal text-xs",
                            !newPayment.paymentDate && "text-muted-foreground"
                          )}
                        >
                          {newPayment.paymentDate ? format(newPayment.paymentDate, "dd/MM/yyyy") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={newPayment.paymentDate}
                          onSelect={(date) => date && setNewPayment({...newPayment, paymentDate: date})}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={newPayment.supplier} 
                      onValueChange={(value) => setNewPayment({...newPayment, supplier: value})}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ABC Suppliers Ltd">ABC Suppliers Ltd</SelectItem>
                        <SelectItem value="Global Trade Co">Global Trade Co</SelectItem>
                        <SelectItem value="Premium Goods Inc">Premium Goods Inc</SelectItem>
                        <SelectItem value="Swift Logistics">Swift Logistics</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={newPayment.paymentMode} 
                      onValueChange={(value) => setNewPayment({...newPayment, paymentMode: value})}
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
                    <Select 
                      value={newPayment.currency} 
                      onValueChange={(value) => setNewPayment({...newPayment, currency: value})}
                    >
                      <SelectTrigger className="w-16">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CAD">CAD</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={newPayment.amount}
                      onChange={(e) => setNewPayment({...newPayment, amount: parseFloat(e.target.value) || 0})}
                      className="w-20 text-right"
                      min="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Remarks"
                      value={newPayment.remarks}
                      onChange={(e) => setNewPayment({...newPayment, remarks: e.target.value})}
                      className="w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Button 
                      size="sm" 
                      className="bg-green-500 hover:bg-green-600 text-white"
                      onClick={handleAddPayment}
                    >
                      <Save size={14} className="mr-1" />
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300">
                  <TableCell className="font-bold">Total:</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right font-bold">{totalAmount.toFixed(2)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
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