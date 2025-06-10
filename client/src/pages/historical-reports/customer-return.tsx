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
import { CalendarIcon, RotateCcw, FileText, Download, Copy, Printer, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface CustomerReturnData {
  id: number;
  slNo: number;
  returnDate: string;
  customerName: string;
  invoiceNo: string;
  productName: string;
  quantity: number;
  returnReason: string;
  returnAmount: number;
  refundStatus: string;
}

export default function CustomerReturn() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [customerFilter, setCustomerFilter] = useState("All Customer");
  const [returnTypeFilter, setReturnTypeFilter] = useState("All Returns");
  const [searchTerm, setSearchTerm] = useState("");

  const [returnData] = useState<CustomerReturnData[]>([
    {
      id: 1, slNo: 1, returnDate: "2025-06-09", customerName: "TROPIFRUIT STAND 100",
      invoiceNo: "INV-001", productName: "Fresh Bananas", quantity: 5, returnReason: "Damaged",
      returnAmount: 25.50, refundStatus: "Processed"
    },
    {
      id: 2, slNo: 2, returnDate: "2025-06-08", customerName: "F&R ENTERPRISE LTD",
      invoiceNo: "INV-002", productName: "Organic Apples", quantity: 3, returnReason: "Quality Issue",
      returnAmount: 18.75, refundStatus: "Pending"
    }
  ]);

  const totals = {
    totalQuantity: returnData.reduce((sum, item) => sum + item.quantity, 0),
    totalAmount: returnData.reduce((sum, item) => sum + item.returnAmount, 0)
  };

  return (
    <PageLayout title="Customer Returns" breadcrumb="Historical Reports > Customer Returns">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <RotateCcw size={20} />
                Customer Returns
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
                    <SelectItem value="TROPIFRUIT STAND 100">TROPIFRUIT STAND 100</SelectItem>
                    <SelectItem value="F&R ENTERPRISE LTD">F&R ENTERPRISE LTD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Select value={returnTypeFilter} onValueChange={setReturnTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Returns">All Returns</SelectItem>
                    <SelectItem value="Processed">Processed</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
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
                  <Printer size={16} />
                  Print
                </Button>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                  Export
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Returns Report Section */}
        <Card>
          <CardHeader>
            <div className="bg-orange-500 text-white text-center py-2 rounded">
              CUSTOMER RETURNS REPORT
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
                <TableRow className="bg-orange-100">
                  <TableHead>Sl.No</TableHead>
                  <TableHead>Return Date</TableHead>
                  <TableHead>Customer Name</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead>Return Reason</TableHead>
                  <TableHead className="text-center">Return Amount</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnData.map((returnItem) => (
                  <TableRow key={returnItem.id} className="hover:bg-gray-50">
                    <TableCell>{returnItem.slNo}</TableCell>
                    <TableCell>{format(new Date(returnItem.returnDate), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{returnItem.customerName}</TableCell>
                    <TableCell>{returnItem.invoiceNo}</TableCell>
                    <TableCell>{returnItem.productName}</TableCell>
                    <TableCell className="text-center">{returnItem.quantity}</TableCell>
                    <TableCell>{returnItem.returnReason}</TableCell>
                    <TableCell className="text-center">£{returnItem.returnAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        returnItem.refundStatus === 'Processed' ? 'bg-green-100 text-green-800' :
                        returnItem.refundStatus === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {returnItem.refundStatus}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 bg-blue-500 text-white">
                          👁️
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 bg-green-500 text-white">
                          ✏️
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-purple-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-center font-bold">{totals.totalQuantity}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-center font-bold">£{totals.totalAmount.toFixed(2)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to 2 of 2 entries</div>
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