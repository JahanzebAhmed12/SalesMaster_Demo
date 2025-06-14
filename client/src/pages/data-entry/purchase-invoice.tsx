import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import PageLayout from "@/components/common/page-layout";

const PurchaseInvoice = () => {
  const [, setLocation] = useLocation();

  const handleSave = () => {
    // Here you would typically save the data first
    // Then navigate to the purchase invoice list page
    setLocation("/data-entry/purchase-invoice");
  };

  return (
    <PageLayout title="Purchase Invoice" breadcrumb="Data Entry / Purchase Invoice">
        {/* Header Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Newstock</h1>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-4">
                  <span>Date: 2025-06-14</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Supplier: A S FRESH PRODUCE LTD</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Inv No: 0</span>
                  <span>Remarks: 1</span>
                </div>
                <div className="flex items-center gap-4">
                  <span>Del No: 0</span>
                  <span>AWB: 1</span>
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
              <Button variant="outline" size="sm">PDF</Button>
              <Button variant="outline" size="sm">Excel</Button>
              <Button variant="outline" size="sm">Copy</Button>
              <Button variant="outline" size="sm">Print</Button>
            </div>
            
            <div className="flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    More
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-white border shadow-lg z-50">
                  <DropdownMenuItem className="cursor-pointer">
                    Supplier History
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">
                    Supplier Payments
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer">
                    Add Additional Cost
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button className="bg-blue-600 hover:bg-blue-700">
                Payment details
              </Button>
              <Button variant="outline" size="sm">Options ℹ</Button>
            </div>
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
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-center">Unit Price</TableHead>
                  <TableHead className="text-center">Sell Price</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <Select>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product1">Product 1</SelectItem>
                          <SelectItem value="product2">Product 2</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input placeholder="Remarks" className="text-sm" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input className="text-center" />
                  </TableCell>
                  <TableCell>
                    <Input className="text-center" />
                  </TableCell>
                  <TableCell>
                    <Input className="text-center" />
                  </TableCell>
                  <TableCell className="text-center">-</TableCell>
                  <TableCell className="text-center">
                    <Button 
                      size="sm" 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={handleSave}
                    >
                      Save
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-4">
                    No data available in table
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
                <Button variant="outline" size="sm">Previous</Button>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="bg-blue-600 text-white">1</Button>
                </div>
                <Button variant="outline" size="sm">Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Summary */}
        <div className="mt-6 flex justify-end">
          <Card className="w-96">
            <CardContent className="p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between font-semibold border-b pb-2">
                  <span>Total:</span>
                  <span>GBP 0.00</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
    
    </PageLayout>
  );
};

export default PurchaseInvoice;
