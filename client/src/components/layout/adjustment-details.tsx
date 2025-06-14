import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AdjustmentDetails = () => {
  return (
    <div className="space-y-6">
      {/* Adjustment Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Customer Returns/Credit Adj</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Returns Stock</label>
              <Select>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock1">Stock Item 1</SelectItem>
                  <SelectItem value="stock2">Stock Item 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Remarks</label>
              <Input />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Quantity</label>
              <Input defaultValue="1" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Unit Price</label>
              <Input defaultValue="0.00" />
            </div>
            <div className="flex items-end">
              <Button className="bg-green-600 hover:bg-green-700 w-full">
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer Returns/Credit Adj Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Customer Returns/Credit Adj.</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SL No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Returns Stock</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Unit Price</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                  No data available in table
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdjustmentDetails;
