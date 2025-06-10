import { useState } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Trash2, FileText, Download, Copy, Printer, Search, Save, Info } from "lucide-react";

interface DumpItem {
  id: number;
  supplier: string;
  returnsStock: string;
  remarks: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function Dumps() {
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [fromDate, setFromDate] = useState("20250610");
  const [toDate, setToDate] = useState("20250610");
  const [productFilter, setProductFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dumpItems, setDumpItems] = useState<DumpItem[]>([]);
  const [newDump, setNewDump] = useState({
    supplier: "",
    returnsStock: "",
    remarks: "",
    quantity: 0,
    unitPrice: 0
  });

  const handleAddDump = () => {
    if (newDump.supplier && newDump.returnsStock) {
      const newItem: DumpItem = {
        id: Date.now(),
        supplier: newDump.supplier,
        returnsStock: newDump.returnsStock,
        remarks: newDump.remarks,
        quantity: newDump.quantity,
        unitPrice: newDump.unitPrice,
        total: newDump.quantity * newDump.unitPrice
      };
      setDumpItems([...dumpItems, newItem]);
      setNewDump({
        supplier: "",
        returnsStock: "",
        remarks: "",
        quantity: 0,
        unitPrice: 0
      });
    }
  };

  const totalItems = dumpItems.length;
  const totalQuantity = dumpItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <PageLayout title="Dumps" breadcrumb="Dumps">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Trash2 size={20} />
                Dumps
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
                <div className="flex gap-2">
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
                  <Button size="sm" className="bg-blue-500 hover:bg-blue-600">
                    Submit
                  </Button>
                </div>
              </div>
              
              <div>
                <Label>Date Range:</Label>
                <div className="flex gap-2 items-center">
                  <div>
                    <Label htmlFor="fromDate" className="text-xs">From Date:</Label>
                    <Input
                      id="fromDate"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-28"
                    />
                  </div>
                  <div>
                    <Label htmlFor="toDate" className="text-xs">To Date:</Label>
                    <Input
                      id="toDate"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-28"
                    />
                  </div>
                  <Button size="sm" className="bg-blue-500 hover:bg-blue-600 mt-4">
                    Search
                  </Button>
                </div>
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

        {/* Dumps Table */}
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
                  <TableHead>Supplier</TableHead>
                  <TableHead>Returns Stock</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-center">Unit Price</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dumpItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No data available in table
                    </TableCell>
                  </TableRow>
                ) : (
                  dumpItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.supplier}</TableCell>
                      <TableCell>{item.returnsStock}</TableCell>
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
                
                {/* Add New Dump Row */}
                <TableRow className="border-t-2 border-gray-200">
                  <TableCell>
                    <Select 
                      value={newDump.supplier} 
                      onValueChange={(value) => setNewDump({...newDump, supplier: value})}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Select" />
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
                      placeholder="Dump item"
                      value={newDump.returnsStock}
                      onChange={(e) => setNewDump({...newDump, returnsStock: e.target.value})}
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Remarks"
                      value={newDump.remarks}
                      onChange={(e) => setNewDump({...newDump, remarks: e.target.value})}
                      className="w-32"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={newDump.quantity}
                      onChange={(e) => setNewDump({...newDump, quantity: parseFloat(e.target.value) || 0})}
                      className="w-20 text-center"
                      min="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={newDump.unitPrice}
                      onChange={(e) => setNewDump({...newDump, unitPrice: parseFloat(e.target.value) || 0})}
                      className="w-24 text-center"
                      min="0"
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    £{(newDump.quantity * newDump.unitPrice).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button 
                      size="sm" 
                      className="bg-green-500 hover:bg-green-600 text-white"
                      onClick={handleAddDump}
                    >
                      <Save size={14} className="mr-1" />
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
                
                {/* Total Row */}
                <TableRow className="border-t-2 border-gray-300">
                  <TableCell className="font-bold">{totalItems} Items</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-center font-bold">{totalQuantity}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-center font-bold">0.00</TableCell>
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