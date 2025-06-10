import { useState } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Banknote, Save } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface BankingEntry {
  id: number;
  date: Date;
  remarks: string;
  paymentType: string;
  amount: number;
}

export default function Banking() {
  const [fromDate, setFromDate] = useState<Date>(new Date(2025, 5, 10));
  const [toDate, setToDate] = useState<Date>(new Date(2025, 5, 10));
  const [bankingEntries, setBankingEntries] = useState<BankingEntry[]>([]);
  const [newEntry, setNewEntry] = useState({
    date: new Date(),
    remarks: "",
    paymentType: "CASH",
    amount: 0
  });

  const handleAddEntry = () => {
    if (newEntry.remarks && newEntry.amount > 0) {
      const entry: BankingEntry = {
        id: Date.now(),
        date: newEntry.date,
        remarks: newEntry.remarks,
        paymentType: newEntry.paymentType,
        amount: newEntry.amount
      };
      setBankingEntries([...bankingEntries, entry]);
      setNewEntry({
        date: new Date(),
        remarks: "",
        paymentType: "CASH",
        amount: 0
      });
    }
  };

  return (
    <PageLayout title="Banking" breadcrumb="Banking">
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Banknote size={20} />
                Banking
              </CardTitle>
              <div className="text-sm text-gray-500">
                TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div>
                <Label>From Date:</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-32 justify-start text-left font-normal",
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
                        "w-32 justify-start text-left font-normal",
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
              
              <Button className="bg-blue-500 hover:bg-blue-600">
                Search
              </Button>
              
              <div className="ml-auto">
                <Button variant="outline" size="sm" className="rounded-full w-8 h-8 p-0">
                  ?
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Banking Entry Form */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-4 gap-4 items-end">
              <div>
                <Label>DATE</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !newEntry.date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newEntry.date ? format(newEntry.date, "dd/MM/yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newEntry.date}
                      onSelect={(date) => date && setNewEntry({...newEntry, date})}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label>REMARKS</Label>
                <Input
                  value={newEntry.remarks}
                  onChange={(e) => setNewEntry({...newEntry, remarks: e.target.value})}
                  placeholder="Enter remarks"
                  className="w-full"
                />
              </div>
              
              <div>
                <Label>PAYMENT TYPE</Label>
                <Select 
                  value={newEntry.paymentType} 
                  onValueChange={(value) => setNewEntry({...newEntry, paymentType: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">CASH</SelectItem>
                    <SelectItem value="CARD">CARD</SelectItem>
                    <SelectItem value="BANK_TRANSFER">BANK TRANSFER</SelectItem>
                    <SelectItem value="CHEQUE">CHEQUE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label>AMOUNT</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newEntry.amount}
                    onChange={(e) => setNewEntry({...newEntry, amount: parseFloat(e.target.value) || 0})}
                    placeholder="0.00"
                    className="text-right"
                  />
                </div>
                <Button 
                  className="bg-green-500 hover:bg-green-600 text-white mt-6"
                  onClick={handleAddEntry}
                >
                  <Save size={16} className="mr-1" />
                  Save
                </Button>
              </div>
            </div>
            
            {/* Display saved entries */}
            {bankingEntries.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Banking Entries:</h3>
                <div className="space-y-2">
                  {bankingEntries.map((entry) => (
                    <div key={entry.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span>{format(entry.date, "dd/MM/yyyy")}</span>
                      <span>{entry.remarks}</span>
                      <span>{entry.paymentType}</span>
                      <span className="font-semibold">£{entry.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}