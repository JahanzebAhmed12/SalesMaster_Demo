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
import { CalendarIcon, Users, FileText, Download, Copy, Printer, Search, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface CustomerAgingData {
  id: number;
  slNo: number;
  customerName: string;
  totalOutstanding: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120: number;
  days180: number;
  over180: number;
  currency: string;
}

export default function CustomerAgingRpt() {
  const [asOfDate, setAsOfDate] = useState<Date>(new Date(2025, 5, 10));
  const [customerFilter, setCustomerFilter] = useState("All Customer");
  const [searchTerm, setSearchTerm] = useState("");

  const [agingData] = useState<CustomerAgingData[]>([
    {
      id: 1, slNo: 22, customerName: "F&R ENTERPRISE LTD", totalOutstanding: 0.00,
      current: 0.00, days30: 0.00, days60: 0.00, days90: 0.00, days120: 0.00,
      days180: 0.00, over180: 0.00, currency: "GBP"
    },
    {
      id: 2, slNo: 15, customerName: "TROPIFRUIT STAND 100", totalOutstanding: 31856.60,
      current: 31856.60, days30: 0.00, days60: 0.00, days90: 0.00, days120: 0.00,
      days180: 0.00, over180: 0.00, currency: "GBP"
    }
  ]);

  const totals = {
    totalOutstanding: agingData.reduce((sum, item) => sum + item.totalOutstanding, 0),
    current: agingData.reduce((sum, item) => sum + item.current, 0),
    days30: agingData.reduce((sum, item) => sum + item.days30, 0),
    days60: agingData.reduce((sum, item) => sum + item.days60, 0),
    days90: agingData.reduce((sum, item) => sum + item.days90, 0),
    days120: agingData.reduce((sum, item) => sum + item.days120, 0),
    days180: agingData.reduce((sum, item) => sum + item.days180, 0),
    over180: agingData.reduce((sum, item) => sum + item.over180, 0)
  };

  return (
    <PageLayout title="Customer Aging Report" breadcrumb="Historical Reports > Customer Aging Report">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <TrendingDown size={20} />
                Customer Aging Report
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label>As of Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !asOfDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {asOfDate ? format(asOfDate, "yyyyMMdd") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={asOfDate}
                      onSelect={(date) => date && setAsOfDate(date)}
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
                    <SelectItem value="Active Customers">Active Customers</SelectItem>
                    <SelectItem value="Overdue Only">Overdue Only</SelectItem>
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

        {/* Aging Report Section */}
        <Card>
          <CardHeader>
            <div className="bg-red-500 text-white text-center py-2 rounded">
              CUSTOMER AGING REPORT AS OF {asOfDate ? format(asOfDate, "dd/MM/yyyy") : ""}
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
                <TableRow className="bg-red-100">
                  <TableHead>Sl.No</TableHead>
                  <TableHead>Customer name</TableHead>
                  <TableHead className="text-center">Total Outstanding</TableHead>
                  <TableHead className="text-center">Current</TableHead>
                  <TableHead className="text-center">1-30 Days</TableHead>
                  <TableHead className="text-center">31-60 Days</TableHead>
                  <TableHead className="text-center">61-90 Days</TableHead>
                  <TableHead className="text-center">91-120 Days</TableHead>
                  <TableHead className="text-center">121-180 Days</TableHead>
                  <TableHead className="text-center">Over 180 Days</TableHead>
                  <TableHead className="text-center">Curr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agingData.map((customer) => (
                  <TableRow key={customer.id} className="hover:bg-gray-50">
                    <TableCell>{customer.slNo}</TableCell>
                    <TableCell>{customer.customerName}</TableCell>
                    <TableCell className="text-center font-medium">{customer.totalOutstanding.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.current.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.days30.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.days60.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.days90.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.days120.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.days180.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.over180.toFixed(2)}</TableCell>
                    <TableCell className="text-center">{customer.currency}</TableCell>
                  </TableRow>
                ))}
                
                {/* Currency Total Row */}
                <TableRow className="bg-gray-100 border-t">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">GBP</TableCell>
                  <TableCell className="text-center font-bold">{totals.totalOutstanding.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.current.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days30.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days60.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days90.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days120.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days180.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.over180.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">GBP</TableCell>
                </TableRow>
                
                {/* Grand Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-yellow-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-center font-bold">{totals.totalOutstanding.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.current.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days30.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days60.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days90.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days120.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.days180.toFixed(2)}</TableCell>
                  <TableCell className="text-center font-bold">{totals.over180.toFixed(2)}</TableCell>
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