import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Copy, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Supplier } from "@shared/schema";

interface SupplierReturnData {
  date: string;
  supplier: string;
  invoice: string;
  productName: string;
  remarks: string;
  quantity: number;
  unitPrice: number;
  total: number;
  action: string;
}

function toLocalDateString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function SupplierReturn() {
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchClicked, setSearchClicked] = useState(false);

  // Fetch suppliers for dropdown
  const { data: suppliers = [], isLoading: loadingSuppliers, error: suppliersError } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  const { data: supplierReturnData = [], isLoading } = useQuery<SupplierReturnData[]>({
    queryKey: [
      "supplier-returns",
      fromDate && toLocalDateString(fromDate),
      toDate && toLocalDateString(toDate),
      selectedSupplier,
      searchTerm,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      if (selectedSupplier && selectedSupplier !== "loading" && selectedSupplier !== "error") params.append("supplierId", selectedSupplier);
      if (searchTerm) params.append("search", searchTerm);
      return apiRequest("GET", `/api/reports/supplier-returns?${params.toString()}`);
    },
    enabled: !!searchClicked,
  });

  const totals = {
    quantity: supplierReturnData.reduce((sum, item) => sum + (item.quantity || 0), 0),
    unitPrice: supplierReturnData.reduce((sum, item) => sum + (item.unitPrice || 0), 0),
    total: supplierReturnData.reduce((sum, item) => sum + (item.total || 0), 0)
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Supplier Return</h1>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingSuppliers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : suppliersError ? (
                      <SelectItem value="error" disabled>Error loading suppliers</SelectItem>
                    ) : (
                      suppliers.map((supplier: any) => (
                        <SelectItem key={supplier.id} value={supplier.id.toString()}>
                          {supplier.supplier_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">From Date:</label>
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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "20250610"}
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
                <label className="block text-sm font-medium mb-2">To Date:</label>
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
                      {toDate ? format(toDate, "yyyy-MM-dd") : "20250610"}
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

              <div className="flex gap-2">
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setSearchClicked(v => !v)}>
                  Search
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1">
                  Options 🔧
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Returns Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Supplier Returns</h2>
              <div className="bg-gray-200 px-4 py-2 rounded font-semibold">
                DEBIT NOTE
              </div>
            </div>

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
                <label htmlFor="search">Search:</label>
                <input
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-48"
                  placeholder=""
                />
              </div>
            </div>

            {/* Responsive Table Container */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[120px]">Supplier</TableHead>
                    <TableHead className="text-center min-w-[120px]">Invoice# / Date</TableHead>
                    <TableHead className="text-center min-w-[150px]">Product Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Remarks</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                    <TableHead className="text-center min-w-[100px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : supplierReturnData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">No data available in table</TableCell>
                    </TableRow>
                  ) : supplierReturnData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-center">{format(new Date(row.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-center">{row.supplier}</TableCell>
                      <TableCell className="text-center">{row.invoice}</TableCell>
                      <TableCell className="text-center">{row.productName}</TableCell>
                      <TableCell className="text-center">{row.remarks}</TableCell>
                      <TableCell className="text-center">{row.quantity}</TableCell>
                      <TableCell className="text-center">£{row.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{row.total.toFixed(2)}</TableCell>
                      <TableCell className="text-center">{row.action}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-blue-100 font-semibold">
                    <TableCell className="text-center" colSpan={5}>TOTAL</TableCell>
                    <TableCell className="text-center">{totals.quantity}</TableCell>
                    <TableCell className="text-center">£{totals.unitPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£{totals.total.toFixed(2)}</TableCell>
                    <TableCell className="text-center">Action</TableCell>
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
      </div>
    </div>
  );
}