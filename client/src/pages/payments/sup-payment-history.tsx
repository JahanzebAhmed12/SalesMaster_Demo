import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Supplier } from "@shared/schema";

interface SupplierPaymentHistoryData {
  slNo: number;
  paymentDate: string;
  paymentMode: string;
  paymentId: string;
  paidAmt: number;
  invNo: string;
  invDate: string;
  supplier: string;
  invoiceAmt: number;
  allocated: number;
  remarks: string;
}

export default function SupPaymentHistory() {
  const { toast } = useToast();
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date | undefined>(new Date());
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [paymentMode, setPaymentMode] = useState<string>("All");

  const [filters, setFilters] = useState({
    supplierId: "",
    fromDate: format(new Date(), "yyyy-MM-dd"),
    toDate: format(new Date(), "yyyy-MM-dd"),
    paymentMode: "All",
  });

  // Fetch suppliers
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Fetch payment history
  const {
    data: paymentHistory = [],
    isLoading: historyLoading,
    isError,
    error,
  } = useQuery<SupplierPaymentHistoryData[]>({
    queryKey: ["/api/supplier-payments/history", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.supplierId) params.append("supplierId", filters.supplierId);
      if (filters.fromDate) params.append("fromDate", filters.fromDate);
      if (filters.toDate) params.append("toDate", filters.toDate);
      if (filters.paymentMode && filters.paymentMode !== "All") {
        params.append("paymentMode", filters.paymentMode);
      }
      return apiRequest("GET", `/api/supplier-payments/history?${params.toString()}`);
    },
  });

  const handleSubmit = () => {
    setFilters({
      supplierId: selectedSupplier === "all" ? "" : selectedSupplier,
      fromDate: fromDate ? format(fromDate, "yyyy-MM-dd") : "",
      toDate: toDate ? format(toDate, "yyyy-MM-dd") : "",
      paymentMode: paymentMode,
    });
  };

  const totalPaid = paymentHistory.reduce((acc, item) => acc + item.paidAmt, 0);
  const totalInvoiceAmount = paymentHistory.reduce((acc, item) => acc + item.invoiceAmt, 0);
  const totalAllocated = paymentHistory.reduce((acc, item) => acc + item.allocated, 0);

  if (isError) {
    toast({
      title: "Error",
      description: (error as any)?.message || "Failed to fetch payment history.",
      variant: "destructive",
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Supplier Payment History</h1>
            <div className="text-sm text-gray-500">
              TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ, ...
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Filter Section */}
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium mb-2">All Suppliers</label>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliersLoading ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : (
                      suppliers.map(supplier => (
                        <SelectItem key={supplier.id} value={String(supplier.id)}>
                          {supplier.supplier_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">From:</label>
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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">To:</label>
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
                      {toDate ? format(toDate, "yyyy-MM-dd") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="BANK">Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmit}>
                  Submit
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  📄 Payment Brief
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table Section */}
        <Card>
          <CardContent className="p-6">
            {/* Responsive Table Container */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[120px]">Payment date</TableHead>
                    <TableHead className="text-center min-w-[120px]">Payment mode</TableHead>
                    <TableHead className="text-center min-w-[100px]">Payment ID</TableHead>
                    <TableHead className="text-center min-w-[100px]">Paid Amt</TableHead>
                    <TableHead className="text-center min-w-[80px]">INV #</TableHead>
                    <TableHead className="text-center min-w-[80px]">INV Date</TableHead>
                    <TableHead className="text-center min-w-[120px]">Supplier</TableHead>
                    <TableHead className="text-center min-w-[120px]">Invoice Amt</TableHead>
                    <TableHead className="text-center min-w-[100px]">Allocated</TableHead>
                    <TableHead className="text-center min-w-[120px]">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyLoading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : paymentHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8">No data found.</TableCell>
                    </TableRow>
                  ) : (
                    paymentHistory.map(item => (
                      <TableRow key={item.slNo}>
                        <TableCell className="text-center">{item.slNo}</TableCell>
                        <TableCell className="text-center">{format(new Date(item.paymentDate), "dd-MM-yyyy")}</TableCell>
                        <TableCell className="text-center">{item.paymentMode}</TableCell>
                        <TableCell className="text-center">{item.paymentId}</TableCell>
                        <TableCell className="text-center">£{item.paidAmt.toFixed(2)}</TableCell>
                        <TableCell className="text-center">{item.invNo}</TableCell>
                        <TableCell className="text-center">{item.invDate ? format(new Date(item.invDate), "dd-MM-yyyy") : ""}</TableCell>
                        <TableCell className="text-left">{item.supplier}</TableCell>
                        <TableCell className="text-center">£{item.invoiceAmt.toFixed(2)}</TableCell>
                        <TableCell className="text-center">£{item.allocated.toFixed(2)}</TableCell>
                        <TableCell className="text-left">{item.remarks}</TableCell>
                      </TableRow>
                    ))
                  )}
                  <TableRow className="bg-blue-100 font-semibold">
                    <TableCell colSpan={4} className="text-center">TOTAL</TableCell>
                    <TableCell className="text-center">£{totalPaid.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center">£{totalInvoiceAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{totalAllocated.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4">
              <div className="text-sm text-gray-600">
                Showing 1 to {paymentHistory.length} of {paymentHistory.length} entries
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">Previous</span>
                <Button variant="outline" size="sm" disabled>1</Button>
                <span className="text-sm">Next</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
