import { useState } from "react";
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

interface InvoiceData {
  id: number;
  date: string;
  invoiceNo: string;
  invoiceAmt: number;
  paid: number;
  balance: number;
  runningBal: number;
}

export default function SupplierPayment() {
  const [selectedSupplier, setSelectedSupplier] = useState<string>("AT VEG LIMITED");
  const [paymentMode, setPaymentMode] = useState<string>("CASH");
  const [paymentDate, setPaymentDate] = useState<Date>();
  const [amountPaid, setAmountPaid] = useState<string>("0");
  const [remarks, setRemarks] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const invoiceData: InvoiceData[] = [
    // No data available in table
  ];

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <div>
                <Label htmlFor="supplier">Select Supplier :</Label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AT VEG LIMITED">AT VEG LIMITED</SelectItem>
                    <SelectItem value="other-supplier">Other Supplier</SelectItem>
                  </SelectContent>
                </Select>
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
                    <SelectItem value="BANK">BANK</SelectItem>
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
                      {paymentDate ? format(paymentDate, "dd/MM/yyyy") : "10/06/2025"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={paymentDate}
                      onSelect={setPaymentDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label htmlFor="amount-paid">Amount Paid:</Label>
                <Input
                  id="amount-paid"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="0"
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
              <Button className="bg-blue-600 hover:bg-blue-700">
                Submit
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
                      <input type="checkbox" className="mr-2" />
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
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      No data available in table
                    </TableCell>
                  </TableRow>
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
                    <TableCell className="text-center">0.00</TableCell>
                    <TableCell className="text-center">0.00</TableCell>
                    <TableCell className="text-center">0.00</TableCell>
                    <TableCell className="text-center">0.00</TableCell>
                    <TableCell className="text-center font-semibold">Bal:0.00</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
              <div className="text-sm text-gray-600">
                Showing 0 to 0 of 0 entries
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
            <Button className="bg-green-600 hover:bg-green-700">
              Update Payment
            </Button>
          </div>
          
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Running balance :</span>
                  <span>0.00</span>
                </div>
                <div className="flex justify-between">
                  <span>On Account balance :</span>
                  <span>0.00</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>TOTAL Outstanding balance :</span>
                  <span>0.00</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
