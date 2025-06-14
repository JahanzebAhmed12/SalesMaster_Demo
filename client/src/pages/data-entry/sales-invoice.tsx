import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import PaymentDetailsDrawer from "@/components/layout/payment-details-drawer";

const SalesInvoice = () => {
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        {/* Header Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">INVOICE</h1>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-4">
                  <span>Date: 20250613</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Invoice: 530775</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>Customer type: credit</span>
                  <Badge className="bg-green-600 text-white">Cash Paid</Badge>
                </div>
                <div>
                  <span>Customer Name: </span>
                  <span className="font-semibold">AFRIDI G1</span>
                </div>
              </div>
            </div>
            
            <div className="text-right text-sm text-gray-600">
              <div>TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...</div>
            </div>
          </div>

          {/* Product Type Selection */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-2">
              <input type="radio" id="regular" name="productType" defaultChecked />
              <label htmlFor="regular" className="text-sm">Regular Products</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="radio" id="all" name="productType" />
              <label htmlFor="all" className="text-sm">All Products</label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Pdf</Button>
              <Button variant="outline" size="sm">Excel</Button>
              <Button variant="outline" size="sm">Copy</Button>
              <Button variant="outline" size="sm">Print</Button>
              <Button variant="outline" size="sm">Cust_Outstanding</Button>
            </div>
            
            <div className="flex items-center gap-4">
              <Button className="bg-blue-600 hover:bg-blue-700">More</Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => setIsPaymentDrawerOpen(true)}
              >
                Payment details
              </Button>
              <Button variant="outline" size="sm">Options ℹ</Button>
            </div>
          </div>

          {/* Print/Action Icons */}
          <div className="flex justify-center gap-2 mb-6">
            <Button variant="outline" size="sm">🖨️</Button>
            <Button variant="outline" size="sm">🖨️</Button>
            <Button variant="outline" size="sm">📁</Button>
            <Button variant="outline" size="sm">✉️</Button>
            <Button variant="outline" size="sm" className="bg-blue-600 text-white">⚡</Button>
          </div>

          {/* Search */}
          <div className="flex justify-end mb-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">Search:</span>
              <Input className="w-48" />
            </div>
          </div>
        </div>

        {/* Products Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-center">Unit price</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <Select>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product1">Product 1</SelectItem>
                        <SelectItem value="product2">Product 2</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input className="text-center" />
                  </TableCell>
                  <TableCell>
                    <Input className="text-center" />
                  </TableCell>
                  <TableCell className="text-center">-</TableCell>
                  <TableCell className="text-center">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">Save</Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            {/* Table Summary */}
            <div className="p-4 border-t">
              <div className="flex justify-between text-sm">
                <span>0 Items</span>
                <span>0</span>
                <span>£0.00</span>
              </div>
              <div className="text-sm text-gray-500 mt-2">
                Showing 0 to 0 of 0 entries
              </div>
              
              {/* Pagination */}
              <div className="flex justify-between items-center mt-4">
                <Button variant="outline" size="sm">◀</Button>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm">Previous</Button>
                  <Button variant="outline" size="sm" className="bg-blue-600 text-white">1</Button>
                  <Button variant="outline" size="sm">Next</Button>
                </div>
                <Button variant="outline" size="sm">▶</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Summary */}
        <div className="mt-6 flex justify-end">
          <Card className="w-96">
            <CardContent className="p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Sub Total:</span>
                  <span>£0.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Porterage:</span>
                  <span>£0.00 ✕</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT @ %:</span>
                  <span>£0.00 ✕</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Total Amt:</span>
                  <span>£0.00</span>
                </div>
              </div>
              <div className="mt-4">
                <Button variant="outline" size="sm" className="w-full">
                  Add VAT / Porterage
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PaymentDetailsDrawer 
        open={isPaymentDrawerOpen}
        onOpenChange={setIsPaymentDrawerOpen}
      />
    </div>
  );
};

export default SalesInvoice;
