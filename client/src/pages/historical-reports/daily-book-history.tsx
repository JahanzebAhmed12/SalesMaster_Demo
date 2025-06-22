import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, FileText, Copy, Printer, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

interface DailyBookData {
  slNo: number;
  date: string;
  user: string;
  invoiceNo: string;
  customerName: string;
  credit: number;
  crPaid: number;
  cash: number;
}

function toLocalDateString(date: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function DailyBookHistory() {
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();
  const [user, setUser] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [reportType, setReportType] = useState<string>("All");
  const [searchClicked, setSearchClicked] = useState(false);

  // Fetch users for dropdown
  const { data: users = [], isLoading: loadingUsers, error: usersError } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: () => apiRequest("GET", "/api/users"),
  });

  const { data: dailyBookData = [], isLoading } = useQuery<DailyBookData[]>({
    queryKey: [
      "daily-book-history",
      fromDate && toLocalDateString(fromDate),
      toDate && toLocalDateString(toDate),
      user,
      reportType,
      searchTerm,
      searchClicked
    ],
    queryFn: async () => {
      if (!searchClicked) return [];
      const params = new URLSearchParams();
      if (fromDate) params.append("fromDate", toLocalDateString(fromDate));
      if (toDate) params.append("toDate", toLocalDateString(toDate));
      if (user && user !== "all") params.append("user", user);
      if (reportType) params.append("type", reportType);
      if (searchTerm) params.append("search", searchTerm);
      return apiRequest("GET", `/api/reports/daily-book-history?${params.toString()}`);
    },
    enabled: !!searchClicked,
  });

  const totals = {
    credit: dailyBookData.reduce((sum, item) => sum + (item.credit || 0), 0),
    crPaid: dailyBookData.reduce((sum, item) => sum + (item.crPaid || 0), 0),
    cash: dailyBookData.reduce((sum, item) => sum + (item.cash || 0), 0)
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-900">Daily Book</h1>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
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

              <div>
                <Select defaultValue="All">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select value={user} onValueChange={setUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {loadingUsers ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : users.map(u => (
                      <SelectItem key={u.username} value={u.username}>{u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Button className="bg-blue-600 hover:bg-blue-700 w-full" onClick={() => setSearchClicked(v => !v)}>
                  Search
                </Button>
              </div>

              <div className="flex gap-2">
                <Button className="bg-blue-600 hover:bg-blue-700 flex items-center gap-1">
                  <Printer className="w-4 h-4" />
                  Print
                </Button>
                <Button className="bg-orange-500 hover:bg-orange-600 flex items-center gap-1">
                  <ChevronUp className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name="reportType" value="All" defaultChecked />
                  <span>All</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="reportType" value="Cash" />
                  <span>Cash</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="reportType" value="Credit" />
                  <span>Credit</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Export and Search Section */}
        <Card>
          <CardContent className="p-6">
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
                    <TableHead className="text-center min-w-[60px]">Sl.No</TableHead>
                    <TableHead className="text-center min-w-[100px]">Date</TableHead>
                    <TableHead className="text-center min-w-[120px]">User</TableHead>
                    <TableHead className="text-center min-w-[120px]">Invoice No</TableHead>
                    <TableHead className="text-center min-w-[150px]">Customer Name</TableHead>
                    <TableHead className="text-center min-w-[100px]">Credit</TableHead>
                    <TableHead className="text-center min-w-[100px]">Cr. Paid</TableHead>
                    <TableHead className="text-center min-w-[100px]">Cash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                    </TableRow>
                  ) : dailyBookData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">No data available</TableCell>
                    </TableRow>
                  ) : dailyBookData.map((item) => (
                    <TableRow key={item.slNo}>
                      <TableCell className="text-center">{item.slNo}</TableCell>
                      <TableCell className="text-center">{format(new Date(item.date), "dd-MM-yyyy")}</TableCell>
                      <TableCell className="text-center">{item.user}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <span className="flex gap-1">
                            <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 p-1 text-xs">
                              📄
                            </Button>
                          </span>
                          {item.invoiceNo}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{item.customerName}</TableCell>
                      <TableCell className="text-center">£ {item.credit.toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {item.crPaid.toFixed(2)}</TableCell>
                      <TableCell className="text-center">£ {item.cash.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-blue-100 font-semibold">
                    <TableCell className="text-center" colSpan={5}>{dailyBookData.length} Items</TableCell>
                    <TableCell className="text-center">£ {totals.credit.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {totals.crPaid.toFixed(2)}</TableCell>
                    <TableCell className="text-center">£ {totals.cash.toFixed(2)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* Summary and Pagination */}
            <div className="mt-4 space-y-4">
              <div className="text-sm text-gray-600">
                Showing {dailyBookData.length > 0 ? 1 : 0} to {dailyBookData.length} of {dailyBookData.length} entries
              </div>
              
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Previous</span>
                  <Button variant="outline" size="sm">1</Button>
                  <span className="text-sm">Next</span>
                </div>
                <div className="text-right font-semibold">
                  TOTAL CASH : £ {totals.cash.toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
