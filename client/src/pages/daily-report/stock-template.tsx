import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Printer, FileText, Settings } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Product } from "@shared/schema";

export default function StockTemplate() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["/api/products"],
    queryFn: () => apiRequest<Product[]>("/api/products")
  });

  const handlePrint = () => {
    window.print();
  };

  const handlePrintAll = () => {
    window.print();
  };

  const handleCustomPrint = () => {
    window.print();
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">Loading stock template...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Stock Template</h1>
        <div className="text-sm text-gray-500">
          TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="date">Date:</Label>
            <Input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
            />
            <Button variant="outline">Search</Button>
          </div>
          
          <div className="ml-auto flex gap-2">
            <Button 
              variant="outline" 
              onClick={handlePrint}
              className="flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button 
              variant="outline" 
              onClick={handlePrintAll}
              className="flex items-center gap-2"
            >
              <Printer className="h-4 w-4" />
              Print All
            </Button>
            <Button 
              variant="outline" 
              onClick={handleCustomPrint}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Custom Print
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 border-r">Sl.No</th>
                    <th className="text-left p-3 border-r">Product Description</th>
                    <th className="text-left p-3">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={product.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 border-r">{index + 1}</td>
                      <td className="p-3 border-r">
                        <span className="text-blue-600 hover:underline cursor-pointer">
                          {product.description}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="w-20 h-8 border border-gray-300"></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}