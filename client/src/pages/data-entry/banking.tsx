import { useState, useMemo } from "react";
import PageLayout from "@/components/common/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Banknote, Save, Loader2, Plus, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BankingEntry, InsertBankingEntry } from "@shared/schema";
import { toast } from "@/hooks/use-toast";
import React from "react";

export default function Banking() {
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [newEntry, setNewEntry] = useState({
    date: new Date(),
    remarks: "",
    paymentType: "CASH",
    amount: 0,
    payingNumber: "",
    bagNumbers: [""], // Array of bag numbers
    chequeNumber: ""
  });
  const queryClient = useQueryClient();

  // Fetch business date and set as newEntry.date on mount
  React.useEffect(() => {
    apiRequest('GET', '/api/business-date').then(res => {
      if (res.businessDate) {
        setNewEntry(prev => ({ ...prev, date: new Date(res.businessDate) }));
      }
    });
    // eslint-disable-next-line
  }, []);

  // Fetch banking entries for date range
  const {
    data: bankingEntries = [],
    isLoading,
    isError,
    refetch
  } = useQuery<BankingEntry[]>({
    queryKey: ["banking-entries", fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams({
        fromDate: format(fromDate, "yyyy-MM-dd"),
        toDate: format(toDate, "yyyy-MM-dd")
      });
      return apiRequest("GET", `/api/banking?${params}`);
    }
  });

  // Add new banking entry
  const addEntryMutation = useMutation({
    mutationFn: async (data: InsertBankingEntry & { bagNumbers?: string[] }) => {
      return apiRequest("POST", "/api/banking", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Banking entry added." });
      setNewEntry({ 
        date: new Date(), 
        remarks: "", 
        paymentType: "CASH", 
        amount: 0, 
        payingNumber: "", 
        bagNumbers: [""], // Reset to single empty bag number
        chequeNumber: "" 
      });
      refetch();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Failed to add entry." });
    }
  });

  const handleAddEntry = () => {
    if (!newEntry.remarks || !newEntry.amount || newEntry.amount <= 0) {
      return toast({ title: "Enter remarks and a valid amount" });
    }
    if (newEntry.paymentType === "CASH" && (!newEntry.payingNumber || newEntry.bagNumbers.every(bag => !bag.trim()))) {
      return toast({ title: "Paying number and at least one Bag number are required for CASH payments" });
    }
    if (newEntry.paymentType === "CHEQUE" && !newEntry.chequeNumber) {
      return toast({ title: "Cheque number is required for CHEQUE payments" });
    }
    const payload: InsertBankingEntry & { bagNumbers?: string[] } = {
      date: format(newEntry.date, "yyyy-MM-dd"),
      remarks: newEntry.remarks,
      paymentType: newEntry.paymentType,
      amount: newEntry.amount,
      payingNumber: newEntry.paymentType === "CASH" ? newEntry.payingNumber : undefined,
      bagNumbers: newEntry.paymentType === "CASH" ? newEntry.bagNumbers.filter(bag => bag.trim()) : undefined,
      chequeNumber: newEntry.paymentType === "CHEQUE" ? newEntry.chequeNumber : undefined
    };
    addEntryMutation.mutate(payload);
  };

  // Add new bag number field
  const addBagNumber = () => {
    setNewEntry(prev => ({
      ...prev,
      bagNumbers: [...prev.bagNumbers, ""]
    }));
  };

  // Remove bag number field
  const removeBagNumber = (index: number) => {
    if (newEntry.bagNumbers.length > 1) {
      setNewEntry(prev => ({
        ...prev,
        bagNumbers: prev.bagNumbers.filter((_, i) => i !== index)
      }));
    }
  };

  // Update bag number
  const updateBagNumber = (index: number, value: string) => {
    setNewEntry(prev => ({
      ...prev,
      bagNumbers: prev.bagNumbers.map((bag, i) => i === index ? value : bag)
    }));
  };

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

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
                {companyDetails?.companyName || 'Company Name'}, {companyDetails?.address1 || ''}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ''}
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
                      {fromDate ? format(fromDate, "yyyy-MM-dd") : "Pick date"}
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
                      {toDate ? format(toDate, "yyyy-MM-dd") : "Pick date"}
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
              <Button className="bg-blue-500 hover:bg-blue-600" onClick={() => refetch()} disabled={isLoading}>
                {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : "Search"}
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
                  onValueChange={(value) => setNewEntry({
                    ...newEntry, 
                    paymentType: value, 
                    payingNumber: "", 
                    bagNumbers: [""], // Reset bag numbers when payment type changes
                    chequeNumber: ""
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">CASH</SelectItem>
                    <SelectItem value="CARD">CARD</SelectItem>
                    <SelectItem value="BANK_TRANSFER">BANK TRANSFER</SelectItem>
                    <SelectItem value="CHEQUE">CHEQUE</SelectItem>
                    <SelectItem value="OTHERS">OTHERS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newEntry.paymentType === "CASH" && (
                <>
                  <div>
                    <Label>PAYING NUMBER<span className="text-red-500">*</span></Label>
                    <Input
                      value={newEntry.payingNumber}
                      onChange={e => setNewEntry({...newEntry, payingNumber: e.target.value})}
                      placeholder="Enter paying number"
                      className="w-full"
                      required
                    />
                  </div>
                  <div>
                    <Label>BAG NUMBERS<span className="text-red-500">*</span></Label>
                    <div className="space-y-2">
                      {newEntry.bagNumbers.map((bagNumber, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={bagNumber}
                            onChange={e => updateBagNumber(index, e.target.value)}
                            placeholder={`Bag ${index + 1}`}
                            className="w-32"
                            required
                          />
                          {newEntry.bagNumbers.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeBagNumber(index)}
                              className="px-2"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          {index === newEntry.bagNumbers.length - 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addBagNumber}
                              className="px-2"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {newEntry.paymentType === "CHEQUE" && (
                <div>
                  <Label>CHEQUE NUMBER<span className="text-red-500">*</span></Label>
                  <Input
                    value={newEntry.chequeNumber}
                    onChange={e => setNewEntry({...newEntry, chequeNumber: e.target.value})}
                    placeholder="Enter cheque number"
                    className="w-full"
                    required
                  />
                </div>
              )}
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
                  disabled={addEntryMutation.isPending}
                >
                  {addEntryMutation.isPending && <Loader2 className="animate-spin h-4 w-4" />}<Save size={16} className="mr-1" />
                  Save
                </Button>
              </div>
            </div>
            {/* Display saved entries */}
            {isLoading ? (
              <div className="flex justify-center items-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>
            ) : isError ? (
              <div className="text-red-600">Failed to load entries.</div>
            ) : bankingEntries.length > 0 ? (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Banking Entries:</h3>
                <div className="space-y-2">
                  {bankingEntries.map((entry) => (
                    <div key={entry.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <span>{format(new Date(entry.date), "dd/MM/yyyy")}</span>
                      <span>{entry.remarks}</span>
                      <span>{entry.paymentType}</span>
                      <span className="font-semibold">£{Number(entry.amount).toFixed(2)}</span>
                      {entry.bagNumbers && entry.bagNumbers.length > 0 && (
                        <span className="text-sm text-gray-600">
                          Bags: {entry.bagNumbers.join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}