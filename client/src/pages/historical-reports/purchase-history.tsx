import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ShoppingCart, FileText, Download, Copy, Printer, Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PurchaseHistoryData {
  id: number;
  slNo: number;
  date: string;
  supplierName: string;
  invoiceNo: string;
  deliveryNo: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentStatus: string;
}

export default function PurchaseHistory() {
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [supplierFilter, setSupplierFilter] = useState<string>("All Suppliers");
  const [paymentFilter, setPaymentFilter] = useState<string>("All Payments");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [trigger, setTrigger] = useState(0);

  // Fetch suppliers for dropdown
  const { data: suppliers, isLoading: loadingSuppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Fetch purchase history
  const {
    data: purchaseData = [],
    isLoading: loadingPurchases,
    error: purchaseError,
  } = useQuery({
    queryKey: [
      "purchase-history",
      fromDate,
      toDate,
      supplierFilter,
      paymentFilter,
      searchTerm,
      trigger,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("fromDate", fromDate.toISOString().slice(0, 10));
      params.append("toDate", toDate.toISOString().slice(0, 10));
      if (supplierFilter !== "All Suppliers") {
        const supplier = suppliers?.find((s: any) => s.supplier_name === supplierFilter);
        if (supplier) params.append("supplierId", supplier.id);
      }
      if (paymentFilter !== "All Payments") params.append("paymentStatus", paymentFilter);
      if (searchTerm) params.append("search", searchTerm);
      return apiRequest("GET", `/api/reports/purchase-history?${params.toString()}`);
    },
    enabled: !!fromDate && !!toDate && !!suppliers,
  });

  const totals = {
    totalQuantity: purchaseData.reduce((sum: number, item: PurchaseHistoryData) => sum + item.quantity, 0),
    totalAmount: purchaseData.reduce((sum: number, item: PurchaseHistoryData) => sum + item.totalAmount, 0),
    paidAmount: purchaseData.filter((item: PurchaseHistoryData) => item.paymentStatus === 'Paid').reduce((sum: number, item: PurchaseHistoryData) => sum + item.totalAmount, 0),
    pendingAmount: purchaseData.filter((item: PurchaseHistoryData) => item.paymentStatus === 'Pending').reduce((sum: number, item: PurchaseHistoryData) => sum + item.totalAmount, 0)
  };

  return (
    <PageLayout title="Purchase History" breadcrumb="Historical Reports > Purchase History">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart size={20} />
                Purchase History Report
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
                <Select value={supplierFilter} onValueChange={setSupplierFilter} disabled={loadingSuppliers}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Suppliers">All Suppliers</SelectItem>
                    {suppliers?.map((s: any) => (
                      <SelectItem key={s.id} value={s.supplier_name}>{s.supplier_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All Payments">All Payments</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button className="bg-blue-500 hover:bg-blue-600 w-full" onClick={() => setTrigger(t => t + 1)} disabled={loadingPurchases || loadingSuppliers}>
                  {loadingPurchases ? "Loading..." : "Generate Report"}
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
            {purchaseError && <div className="text-red-500 mt-2">Error loading data: {purchaseError.message}</div>}
          </CardContent>
        </Card>
        {/* Purchase Report Section */}
        <Card>
          <CardHeader>
            <div className="bg-teal-600 text-white text-center py-2 rounded">
              PURCHASE HISTORY REPORT
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
            {loadingPurchases ? (
              <div className="text-center py-8">Loading purchase history...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-teal-100">
                    <TableHead>Sl.No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier Name</TableHead>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Delivery No</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-center">Unit Price</TableHead>
                    <TableHead className="text-center">Total Amount</TableHead>
                    <TableHead className="text-center">Payment Status</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseData.map((purchase: PurchaseHistoryData) => (
                    <TableRow key={purchase.id} className="hover:bg-gray-50">
                      <TableCell>{purchase.slNo}</TableCell>
                      <TableCell>{format(new Date(purchase.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{purchase.supplierName}</TableCell>
                      <TableCell>{purchase.invoiceNo}</TableCell>
                      <TableCell>{purchase.deliveryNo}</TableCell>
                      <TableCell>{purchase.productName}</TableCell>
                      <TableCell className="text-center">{purchase.quantity}</TableCell>
                      <TableCell className="text-center">£{purchase.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-medium">£{purchase.totalAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-1 rounded text-xs ${
                          purchase.paymentStatus === 'Paid' ? 'bg-green-100 text-green-800' :
                          purchase.paymentStatus === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {purchase.paymentStatus}
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
                  <TableRow className="border-t-2 border-gray-300 bg-amber-50">
                    <TableCell></TableCell>
                    <TableCell className="font-bold">TOTAL</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-center font-bold">{totals.totalQuantity}</TableCell>
                    <TableCell className="text-center font-bold">-</TableCell>
                    <TableCell className="text-center font-bold">£{totals.totalAmount.toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-blue-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Total Purchases</div>
                <div className="text-2xl font-bold text-blue-600">£{totals.totalAmount.toFixed(2)}</div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Amount Paid</div>
                <div className="text-2xl font-bold text-green-600">£{totals.paidAmount.toFixed(2)}</div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Amount Pending</div>
                <div className="text-2xl font-bold text-yellow-600">£{totals.pendingAmount.toFixed(2)}</div>
              </div>
              <div className="bg-teal-50 p-4 rounded-lg border">
                <div className="text-sm text-gray-600">Total Items</div>
                <div className="text-2xl font-bold text-teal-600">{totals.totalQuantity}</div>
              </div>
            </div>
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>Showing 1 to {purchaseData.length} of {purchaseData.length} entries</div>
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