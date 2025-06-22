import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { RegularProduct, NonProduct, Customer, Supplier } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type ProductsAPI = { regularProducts: RegularProduct[]; nonProducts: NonProduct[] };
type ProductHistoryAPI = {
  purchases: any[];
  supplierReturns: any[];
  sales: any[];
  customerReturns: any[];
  dumps: any[];
};

function toLocalDateString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function ProductHistory() {
  const [productLike, setProductLike] = useState("");
  const [productId, setProductId] = useState<string | undefined>(undefined);
  const [customerId, setCustomerId] = useState<string | undefined>(undefined);
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();
  const [searchClicked, setSearchClicked] = useState(false);

  // Fetch all products
  const { data: productsData = { regularProducts: [], nonProducts: [] }, isLoading: loadingProducts, error: productsError } = useQuery<ProductsAPI>({
    queryKey: ["products"],
    queryFn: () => apiRequest("GET", "/api/products"),
  });
  // Fetch all customers
  const { data: customersData = [], isLoading: loadingCustomers, error: customersError } = useQuery<Customer[]>({
    queryKey: ["customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
  });
  // Fetch all suppliers
  const { data: suppliersData = [], isLoading: loadingSuppliers, error: suppliersError } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: () => apiRequest("GET", "/api/suppliers"),
  });

  // Prepare product options
  const allProducts: (RegularProduct | NonProduct)[] = [
    ...(productsData.regularProducts || []),
    ...(productsData.nonProducts || [])
  ];

  // Prepare customer options
  const allCustomers: Customer[] = customersData;
  // Prepare supplier options
  const allSuppliers: Supplier[] = suppliersData;

  // Fetch product history only when Search is clicked
  const {
    data: historyData = { purchases: [], supplierReturns: [], sales: [], customerReturns: [], dumps: [] },
    isLoading: loadingHistory,
    error: historyError
  } = useQuery<ProductHistoryAPI>({
    queryKey: [
      "product-history",
      productId,
      productLike,
      fromDate?.toISOString().slice(0, 10),
      toDate?.toISOString().slice(0, 10),
      customerId,
      supplierId,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return { purchases: [], supplierReturns: [], sales: [], customerReturns: [], dumps: [] };
      const params = new URLSearchParams();
      if (productId && productId !== "All") params.append("productId", productId);
      if (productLike) params.append("productLike", productLike);
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      if (customerId && customerId !== "All") params.append("customerId", customerId);
      if (supplierId && supplierId !== "All") params.append("supplierId", supplierId);
      return apiRequest("GET", `/api/reports/product-history?${params.toString()}`);
    },
    enabled: !!searchClicked,
  });

  // Table data
  const purchases = historyData.purchases;
  const supplierReturns = historyData.supplierReturns;
  const sales = historyData.sales;
  const customerReturns = historyData.customerReturns;
  const dumps = historyData.dumps;

  // Loading states
  const loading = loadingProducts || loadingCustomers || loadingSuppliers || loadingHistory;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Product History</h1>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">Product Like:</label>
                <Input
                  value={productLike}
                  onChange={(e) => setProductLike(e.target.value)}
                  placeholder=""
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Product:</label>
                <Select value={productId || "All"} onValueChange={setProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Products</SelectItem>
                    {allProducts.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Customer:</label>
                <Select value={customerId || "All"} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Customers</SelectItem>
                    {allCustomers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.customer_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Supplier:</label>
                <Select value={supplierId || "All"} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Suppliers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Suppliers</SelectItem>
                    {allSuppliers.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.supplier_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "Select"}
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
                      {toDate ? format(toDate, "yyyy-MM-dd") : "Select"}
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
              <div className="col-span-1 lg:col-span-3 flex items-end">
                <Button
                  className="bg-blue-600 hover:bg-blue-700 w-full"
                  disabled={loading}
                  onClick={() => setSearchClicked((v) => !v)}
                >
                  {loading ? "Loading..." : "Search"}
                </Button>
              </div>
            </div>
            {/* Error handling */}
            {(productsError || customersError || suppliersError || historyError) && (
              <div className="text-red-600 mt-2">
                {productsError && <div>Failed to load products.</div>}
                {customersError && <div>Failed to load customers.</div>}
                {suppliersError && <div>Failed to load suppliers.</div>}
                {historyError && <div>Failed to load product history.</div>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* From Supplier Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-green-600 border-b-2 border-green-300 pb-2">From Supplier</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-green-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[150px]">Supplier Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : purchases.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    purchases.map((row: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{row.date}</TableCell>
                        <TableCell className="text-center">{row.supplierName}</TableCell>
                        <TableCell className="text-center">{row.product}</TableCell>
                        <TableCell className="text-center">{row.quantity}</TableCell>
                        <TableCell className="text-center">{row.unitPrice}</TableCell>
                        <TableCell className="text-center">{row.total}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* From Supplier Returns Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-orange-600 border-b-2 border-orange-300 pb-2">From Supplier Returns</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-orange-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[100px]">Invoice#</TableHead>
                    <TableHead className="text-center min-w-[150px]">Supplier Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : supplierReturns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    supplierReturns.map((row: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{row.date}</TableCell>
                        <TableCell className="text-center">{row.invoice}</TableCell>
                        <TableCell className="text-center">{row.supplierName}</TableCell>
                        <TableCell className="text-center">{row.product}</TableCell>
                        <TableCell className="text-center">{row.quantity}</TableCell>
                        <TableCell className="text-center">{row.unitPrice}</TableCell>
                        <TableCell className="text-center">{row.total}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* From Sales Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-blue-600 border-b-2 border-blue-300 pb-2">From Sales</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[100px]">Invoice No</TableHead>
                    <TableHead className="text-center min-w-[150px]">Customer Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    sales.map((row: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{row.date}</TableCell>
                        <TableCell className="text-center">{row.invoiceNo}</TableCell>
                        <TableCell className="text-center">{row.customerName}</TableCell>
                        <TableCell className="text-center">{row.product}</TableCell>
                        <TableCell className="text-center">{row.quantity}</TableCell>
                        <TableCell className="text-center">{row.unitPrice}</TableCell>
                        <TableCell className="text-center">{row.total}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* From Customer Returns Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-purple-600 border-b-2 border-purple-300 pb-2">From Customer Returns</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-purple-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[100px]">Invoice#</TableHead>
                    <TableHead className="text-center min-w-[150px]">Customer Name</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Quantity</TableHead>
                    <TableHead className="text-center min-w-[100px]">Unit Price</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : customerReturns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    customerReturns.map((row: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{row.date}</TableCell>
                        <TableCell className="text-center">{row.invoice}</TableCell>
                        <TableCell className="text-center">{row.customerName}</TableCell>
                        <TableCell className="text-center">{row.product}</TableCell>
                        <TableCell className="text-center">{row.quantity}</TableCell>
                        <TableCell className="text-center">{row.unitPrice}</TableCell>
                        <TableCell className="text-center">{row.total}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* From Dumps Section */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4 text-red-600 border-b-2 border-red-300 pb-2">From Dumps</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-red-50">
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[120px]">Product</TableHead>
                    <TableHead className="text-center min-w-[100px]">Total Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingHistory ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">Loading...</TableCell>
                    </TableRow>
                  ) : dumps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-4">No Records found</TableCell>
                    </TableRow>
                  ) : (
                    dumps.map((row: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell className="text-center">{row.date}</TableCell>
                        <TableCell className="text-center">{row.product}</TableCell>
                        <TableCell className="text-center">{row.totalQty}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
