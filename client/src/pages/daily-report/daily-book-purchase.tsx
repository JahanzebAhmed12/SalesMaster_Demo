import { useState } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Package, FileText, Download, Copy, Printer, Search, Eye, Settings } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PurchaseEntry {
  id: number;
  date: string;
  supplier: string;
  invNo: number;
  delNo: number;
  invoiceAmt: number;
}

export default function DailyBookPurchase() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [searchTerm, setSearchTerm] = useState("");
  
  // Sample data matching the design
  const [purchaseData] = useState<PurchaseEntry[]>([
    {
      id: 1,
      date: "2025-06-10",
      supplier: "TROPIFRUIT",
      invNo: 0,
      delNo: 0,
      invoiceAmt: 4608.15
    }
  ]);

  const totalInvoiceAmount = purchaseData.reduce((sum, item) => sum + item.invoiceAmt, 0);

  return (
    <PageLayout title="Newstock" breadcrumb="Daily Report > Daily Book Purchase">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Package size={20} />
                Newstock
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <Label>From Date:</Label>
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
                <Label>To Date:</Label>
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
                <Button className="bg-blue-500 hover:bg-blue-600 w-full">
                  Search
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Eye size={16} />
                  Full View
                </Button>
                <Button className="bg-cyan-500 hover:bg-cyan-600 flex items-center gap-2 text-white">
                  Newstock Full
                </Button>
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Printer size={16} />
                  Print
                </Button>
                <Button className="bg-cyan-500 hover:bg-cyan-600 flex items-center gap-2 text-white">
                  Sage
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Settings size={16} />
                  Options
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
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
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-center">Inv.No</TableHead>
                  <TableHead className="text-center">Del.No</TableHead>
                  <TableHead className="text-center">Invoice Amt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{format(new Date(item.date), "yyyy-MM-dd")}</TableCell>
                    <TableCell>{item.supplier}</TableCell>
                    <TableCell className="text-center">{item.invNo}</TableCell>
                    <TableCell className="text-center">{item.delNo}</TableCell>
                    <TableCell className="text-center">{item.invoiceAmt.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300 bg-gray-50">
                  <TableCell></TableCell>
                  <TableCell className="font-bold">1 Items</TableCell>
                  <TableCell className="text-center font-bold"></TableCell>
                  <TableCell className="text-center font-bold"></TableCell>
                  <TableCell className="text-center font-bold">£ {totalInvoiceAmount.toFixed(2)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}