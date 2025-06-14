import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PaymentDetails = () => {
  return (
    <div className="space-y-6">
      {/* Payment Details Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Invoice Amount</label>
              <Input value="0.00" readOnly className="bg-gray-50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Balance Amount</label>
              <Input value="0.00" readOnly className="bg-gray-50" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Payment Mode</label>
              <Select defaultValue="cash">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">CASH</SelectItem>
                  <SelectItem value="card">CARD</SelectItem>
                  <SelectItem value="cheque">CHEQUE</SelectItem>
                  <SelectItem value="bank">BANK TRANSFER</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Payment Date</label>
              <Input type="date" defaultValue="2025-06-13" />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Amount Payable</label>
              <Input defaultValue="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Remarks</label>
              <Input />
            </div>
          </div>
          
          <div className="flex justify-center">
            <Button className="bg-green-600 hover:bg-green-700 px-8">
              Save
            </Button>
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

export default PaymentDetails;
