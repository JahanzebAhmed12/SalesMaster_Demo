import { useState } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Calendar, FileText, Download, Copy, Printer, Search, Save } from "lucide-react";

interface StockItem {
  id: number;
  name: string;
  quantity: number;
}

const mockStockData: StockItem[] = [
  { id: 1, name: "Aloe vera (Sp)", quantity: 15 },
  { id: 2, name: "Avocado", quantity: 15 },
  { id: 3, name: "chow chow", quantity: 29 },
  { id: 4, name: "Cush Yam", quantity: 11 },
  { id: 5, name: "DASHEEN", quantity: 17 },
  { id: 6, name: "Green banana", quantity: 52 },
  { id: 7, name: "JellyNut", quantity: 15 },
  { id: 8, name: "Mango Or", quantity: 170 },
  { id: 9, name: "Sweet Potato Brz", quantity: 3 },
  { id: 10, name: "Tamarind Sweet", quantity: 26 },
  { id: 11, name: "Yam Poona", quantity: 3 },
  { id: 12, name: "Yellow Plantain", quantity: 4 },
];

export default function ClosingStock() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [productFilter, setProductFilter] = useState("available");
  const [searchTerm, setSearchTerm] = useState("");
  const [stockData, setStockData] = useState<StockItem[]>(mockStockData);
  const [editingQuantity, setEditingQuantity] = useState<{[key: number]: number}>({});

  const filteredData = stockData.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (productFilter === "all" || item.quantity > 0)
  );

  const updateQuantity = (id: number, newQuantity: number) => {
    setStockData(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: newQuantity } : item
    ));
    setEditingQuantity(prev => ({ ...prev, [id]: newQuantity }));
  };

  const totalItems = filteredData.length;
  const totalQuantity = filteredData.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <PageLayout title="Closing Stock" breadcrumb="Closing Stock">
      <div className="space-y-6">
        {/* Controls Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package size={20} />
              Closing Stock Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div>
                <Label htmlFor="stockDate">Date</Label>
                <Input
                  id="stockDate"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <Label htmlFor="productFilter">Products</Label>
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available Products</SelectItem>
                    <SelectItem value="all">All Products</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex items-end gap-2">
                <Button className="flex items-center gap-2">
                  <Printer size={16} />
                  Print
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <FileText size={16} />
                  Closing Stock Eva
                </Button>
                <Button variant="outline" className="flex items-center gap-2">
                  <Calendar size={16} />
                  Options
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stock Table */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>CLOSING Stock</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
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
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-3/5">CLOSING Stock</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((item) => (
                  <TableRow key={item.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">
                      {item.name} <span className="text-gray-500 text-sm">(1)</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        value={editingQuantity[item.id] ?? item.quantity}
                        onChange={(e) => setEditingQuantity(prev => ({ 
                          ...prev, 
                          [item.id]: parseInt(e.target.value) || 0 
                        }))}
                        onBlur={() => {
                          if (editingQuantity[item.id] !== undefined) {
                            updateQuantity(item.id, editingQuantity[item.id]);
                          }
                        }}
                        className="w-20 text-center"
                        min="0"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button 
                        size="sm" 
                        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1"
                        onClick={() => {
                          if (editingQuantity[item.id] !== undefined) {
                            updateQuantity(item.id, editingQuantity[item.id]);
                          }
                        }}
                      >
                        Action
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-gray-300">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-4">
                      <Select defaultValue="12">
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="12">12</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input 
                        type="number" 
                        className="w-24" 
                        placeholder="0" 
                      />
                      <Button 
                        size="sm" 
                        className="bg-green-500 hover:bg-green-600 text-white"
                      >
                        <Save size={14} className="mr-1" />
                        Save
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {totalQuantity}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
            
            <div className="flex justify-between items-center mt-4 text-sm text-gray-600">
              <div>{totalItems} Items</div>
              <div className="flex items-center gap-4">
                <span>Showing 1 to 12 of {totalItems} entries</span>
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