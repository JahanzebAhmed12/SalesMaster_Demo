import { useState } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RotateCcw, FileText, Download, Copy, Printer, Search, Save, Info, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ReturnItem {
  id: number;
  date: string;
  supplier: string;
  returnsStock: string;
  invoiceNo: string;
  remarks: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function ReturnToSupplier() {
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [searchDate, setSearchDate] = useState<Date>(new Date(2025, 4, 27));
  const [productFilter, setProductFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [newReturn, setNewReturn] = useState({
    supplier: "",
    returnsStock: "",
    invoiceNo: "",
    remarks: "",
    quantity: 0,
    unitPrice: 0
  });

  const handleAddReturn = () => {
    if (newReturn.supplier && newReturn.returnsStock) {
      const newItem: ReturnItem = {
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        supplier: newReturn.supplier,
        returnsStock: newReturn.returnsStock,
        invoiceNo: newReturn.invoiceNo,
        remarks: newReturn.remarks,
        quantity: newReturn.quantity,
        unitPrice: newReturn.unitPrice,
        total: newReturn.quantity * newReturn.unitPrice
      };
      setReturnItems([...returnItems, newItem]);
      setNewReturn({
        supplier: "",
        returnsStock: "",
        invoiceNo: "",
        remarks: "",
        quantity: 0,
        unitPrice: 0
      });
    }
  };

  const totalAmount = returnItems.reduce((sum, item) => sum + item.total, 0);

  return (
    <PageLayout title="Return Suppliers" breadcrumb="Return to Supplier">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <RotateCcw size={20} />
                Return Suppliers
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label htmlFor="supplier">Supplier:</Label>
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
              
              <div>
                <RadioGroup value={productFilter} onValueChange={setProductFilter} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="available" id="available" />
                    <Label htmlFor="available">Available Products</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="all" id="all" />
                    <Label htmlFor="all">All Products</Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div>
                <Label>Search from date:</Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-32 justify-start text-left font-normal",
                          !searchDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {searchDate ? format(searchDate, "yyyyMMdd") : "Pick date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={searchDate}
                        onSelect={(date) => date && setSearchDate(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Button size="sm" className="bg-blue-500 hover:bg-blue-600">
                    Submit
                  </Button>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button className="bg-blue-500 hover:bg-blue-600 flex items-center gap-2">
                  <Printer size={16} />
                  Print
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Info size={16} />
                  Options
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Returns Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Supplier:</CardTitle>
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
                <div className="relative ml-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Search:"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-48"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Returns Stock</TableHead>
                  <TableHead>Invoice no</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-center">Unit Price</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                      No data available in table
                    </TableCell>
                  </TableRow>
                ) : (
                  returnItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.date}</TableCell>
                      <TableCell>{item.supplier}</TableCell>
                      <TableCell>{item.returnsStock}</TableCell>
                      <TableCell>{item.invoiceNo}</TableCell>
                      <TableCell>{item.remarks}</TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-center">£{item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell className="text-center">£{item.total.toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                
                {/* Add New Return Row */}
                <TableRow className="border-t-2 border-gray-200">
                  <TableCell>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-32 justify-start text-left font-normal text-xs"
                          )}
                        >
                          <CalendarIcon className="mr-1 h-3 w-3" />
                          {format(new Date(), "dd/MM/yyyy")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={new Date()}
                          onSelect={() => {}}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                  <TableCell>
                    <Select 
                      value={newReturn.supplier} 
                      onValueChange={(value) => setNewReturn({...newReturn, supplier: value})}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Get" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ABC Suppliers Ltd">ABC Suppliers Ltd</SelectItem>
                        <SelectItem value="Global Trade Co">Global Trade Co</SelectItem>
                        <SelectItem value="Premium Goods Inc">Premium Goods Inc</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Return item"
                      value={newReturn.returnsStock}
                      onChange={(e) => setNewReturn({...newReturn, returnsStock: e.target.value})}
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Invoice"
                      value={newReturn.invoiceNo}
                      onChange={(e) => setNewReturn({...newReturn, invoiceNo: e.target.value})}
                      className="w-28"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Remarks"
                      value={newReturn.remarks}
                      onChange={(e) => setNewReturn({...newReturn, remarks: e.target.value})}
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={newReturn.quantity}
                      onChange={(e) => setNewReturn({...newReturn, quantity: parseFloat(e.target.value) || 0})}
                      className="w-20 text-center"
                      min="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={newReturn.unitPrice}
                      onChange={(e) => setNewReturn({...newReturn, unitPrice: parseFloat(e.target.value) || 0})}
                      className="w-24 text-center"
                      min="0"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    £{(newReturn.quantity * newReturn.unitPrice).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button 
                      size="sm" 
                      className="bg-green-500 hover:bg-green-600 text-white"
                      onClick={handleAddReturn}
                    >
                      <Save size={14} className="mr-1" />
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300">
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-center font-bold">
                    {returnItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </TableCell>
                  <TableCell className="text-center font-bold">£0.00</TableCell>
                  <TableCell className="text-center font-bold">£0.00</TableCell>
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