import { useState, useMemo, useRef } from "react";
import PageLayout from "@/components/common/page-layout";
import BusinessDateDisplay from "@/components/common/business-date-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Banknote, Save, Loader2, Plus, X, Trash2, FileText, Download, Copy, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { BankingEntry, InsertBankingEntry } from "@shared/schema";
import { toast } from "@/hooks/use-toast";
import { useBusinessDate } from "@/hooks/use-business-date";
import React from "react";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Banking() {
  const { currentDate: businessDate } = useBusinessDate();
  const [fromDate, setFromDate] = useState<Date>(new Date());
  const [toDate, setToDate] = useState<Date>(new Date());
  const [newEntry, setNewEntry] = useState({
    date: businessDate ? new Date(businessDate) : new Date(),
    remarks: "",
    paymentType: "CASH",
    amount: 0,
    payingNumber: "",
    bags: [{ number: "", payingNumber: "", amount: 0 }], // Array of bag objects with number, payingNumber and amount
    chequeNumber: "",
    bagNumber: "", // Bag number for CHEQUE payments
    chequePayingNumber: "" // Paying number for CHEQUE payments
  });
  const queryClient = useQueryClient();
  const tableRef = useRef<HTMLDivElement>(null);

  // Update newEntry.date when businessDate changes
  React.useEffect(() => {
    if (businessDate) {
      setNewEntry(prev => ({ ...prev, date: new Date(businessDate) }));
    }
  }, [businessDate]);

  // Calculate total amount for CASH and COINS payments (sum of all bag amounts)
  const totalAmount = useMemo(() => {
    if (newEntry.paymentType === "CASH" || newEntry.paymentType === "COINS") {
      return newEntry.bags.reduce((sum, bag) => sum + (bag.amount || 0), 0);
    }
    return newEntry.amount;
  }, [newEntry.paymentType, newEntry.bags, newEntry.amount]);

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
    mutationFn: async (data: InsertBankingEntry & { bags?: Array<{number: string, payingNumber: string, amount: number}>, bagNumber?: string, chequePayingNumber?: string }) => {
      return apiRequest("POST", "/api/banking", data);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Banking entry added." });
      setNewEntry({ 
        date: businessDate ? new Date(businessDate) : new Date(), 
        remarks: "", 
        paymentType: "CASH", 
        amount: 0, 
        payingNumber: "", 
        bags: [{ number: "", payingNumber: "", amount: 0 }], // Reset to single empty bag
        chequeNumber: "",
        bagNumber: "",
        chequePayingNumber: ""
      });
      refetch();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Failed to add entry." });
    }
  });

  // Delete banking entry
  const deleteEntryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/banking/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Banking entry deleted." });
      refetch();
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Failed to delete entry.", variant: "destructive" });
    }
  });

  const handleAddEntry = () => {
    if (totalAmount <= 0) {
      return toast({ title: "Enter a valid amount" });
    }
    if ((newEntry.paymentType === "CASH" || newEntry.paymentType === "COINS") && newEntry.bags.every(bag => !bag.number.trim() || !bag.payingNumber.trim() || bag.amount <= 0)) {
      return toast({ title: "At least one bag with number, paying number and amount are required for CASH/COINS payments" });
    }
    if (newEntry.paymentType === "CHEQUE" && (!newEntry.chequeNumber || !newEntry.bagNumber || !newEntry.chequePayingNumber)) {
      return toast({ title: "Cheque number, bag number, and paying number are required for CHEQUE payments" });
    }
    const payload: InsertBankingEntry & { bags?: Array<{number: string, payingNumber: string, amount: number}>, bagNumber?: string, chequePayingNumber?: string } = {
      date: format(newEntry.date, "yyyy-MM-dd"),
      remarks: newEntry.remarks,
      paymentType: newEntry.paymentType,
      amount: totalAmount,
      payingNumber: newEntry.paymentType === "CHEQUE" ? newEntry.chequePayingNumber : undefined,
      bags: (newEntry.paymentType === "CASH" || newEntry.paymentType === "COINS") ? 
        newEntry.bags.filter(bag => bag.number.trim() && bag.payingNumber.trim()) : undefined,
      chequeNumber: newEntry.paymentType === "CHEQUE" ? newEntry.chequeNumber : undefined,
      bagNumber: newEntry.paymentType === "CHEQUE" ? newEntry.bagNumber : undefined,
      chequePayingNumber: newEntry.paymentType === "CHEQUE" ? newEntry.chequePayingNumber : undefined
    };
    addEntryMutation.mutate(payload);
  };

  // Add new bag
  const addBag = () => {
    setNewEntry(prev => ({
      ...prev,
      bags: [...prev.bags, { number: "", payingNumber: "", amount: 0 }]
    }));
  };

  // Remove bag
  const removeBag = (index: number) => {
    if (newEntry.bags.length > 1) {
      setNewEntry(prev => ({
        ...prev,
        bags: prev.bags.filter((_, i) => i !== index)
      }));
    }
  };

  // Update bag number
  const updateBagNumber = (index: number, value: string) => {
    setNewEntry(prev => ({
      ...prev,
      bags: prev.bags.map((bag, i) => i === index ? { ...bag, number: value } : bag)
    }));
  };

  // Update bag paying number
  const updateBagPayingNumber = (index: number, value: string) => {
    setNewEntry(prev => ({
      ...prev,
      bags: prev.bags.map((bag, i) => i === index ? { ...bag, payingNumber: value } : bag)
    }));
  };

  // Update bag amount
  const updateBagAmount = (index: number, value: number) => {
    setNewEntry(prev => ({
      ...prev,
      bags: prev.bags.map((bag, i) => i === index ? { ...bag, amount: value } : bag)
    }));
  };

  // Fetch company details
  const { data: companyDetails } = useQuery<any>({
    queryKey: ['/api/company-details'],
    queryFn: () => apiRequest('GET', '/api/company-details'),
  });

  // Export functions
  const handlePrint = () => {
    if (!tableRef.current || bankingEntries.length === 0) return;
    
    const printContents = tableRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Banking Entries Report</title>');
      printWindow.document.write('<style>');
      printWindow.document.write('body{font-family:Arial,sans-serif;margin:20px;}');
      printWindow.document.write('table{width:100%;border-collapse:collapse;margin-top:20px;}');
      printWindow.document.write('th,td{border:1px solid #ccc;padding:8px;text-align:left;}');
      printWindow.document.write('th{background-color:#f0f0f0;font-weight:bold;}');
      printWindow.document.write('.header{text-align:center;margin-bottom:20px;}');
      printWindow.document.write('.company-info{text-align:center;margin-bottom:10px;font-size:14px;}');
      printWindow.document.write('.period-info{margin-bottom:15px;font-weight:bold;}');
      printWindow.document.write('.footer{position:fixed;bottom:10px;right:10px;font-size:8px;color:#666;}');
      printWindow.document.write('</style>');
      printWindow.document.write('</head><body>');
      
      // Add company header
      printWindow.document.write('<div class="header">');
      printWindow.document.write('<h2>BANKING ENTRIES REPORT</h2>');
      if (companyDetails) {
        printWindow.document.write(`<div class="company-info">${companyDetails.companyName}, ${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}</div>`);
      }
      printWindow.document.write('</div>');
      
      // Add period information
      printWindow.document.write('<div class="period-info">');
      printWindow.document.write(`<strong>Period:</strong> ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`);
      printWindow.document.write('</div>');
      
      // Add the table content
      printWindow.document.write(printContents);
      
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handleExcel = () => {
    if (bankingEntries.length === 0) return;
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Add company info sheet
    const companyInfo = [
      ['BANKING ENTRIES REPORT'],
      [''],
      ['Company:', companyDetails?.companyName || ''],
      ['Address:', `${companyDetails?.address1 || ''}${companyDetails?.address2 ? ', ' + companyDetails.address2 : ''}`],
      [''],
      ['Period:', `${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`],
      [''],
    ];
    
    const wsInfo = XLSX.utils.aoa_to_sheet(companyInfo);
    XLSX.utils.book_append_sheet(wb, wsInfo, 'Report Info');
    
    // Add data sheet
    const ws = XLSX.utils.json_to_sheet(bankingEntries.map((entry: BankingEntry) => ({
      'Date': format(new Date(entry.date), "dd/MM/yyyy"),
      'Remarks': entry.remarks,
      'Payment Type': entry.paymentType,
      'Amount': Number(entry.amount).toFixed(2),
      'Bag Details': entry.bags && entry.bags.length > 0 
        ? entry.bags.map(bag => `${bag.number} (${bag.payingNumber}) £${bag.amount.toFixed(2)}`).join('; ')
        : entry.bagNumber ? `Bag: ${entry.bagNumber}` : '-',
      'Cheque Number': entry.chequeNumber || '-',
      'Paying Number': entry.payingNumber || '-'
    })));
    
    XLSX.utils.book_append_sheet(wb, ws, 'Banking Entries');
    
    // Save file
    XLSX.writeFile(wb, `Banking_Entries_${format(fromDate, "yyyy-MM-dd")}_to_${format(toDate, "yyyy-MM-dd")}.xlsx`);
  };

  const handlePDF = () => {
    if (bankingEntries.length === 0) return;
    
    const doc = new jsPDF();
    
    // Add company header
    doc.setFontSize(16);
    doc.text('BANKING ENTRIES REPORT', 105, 20, { align: 'center' });
    
    if (companyDetails) {
      doc.setFontSize(12);
      doc.text(`${companyDetails.companyName}`, 105, 30, { align: 'center' });
      doc.text(`${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}`, 105, 40, { align: 'center' });
    }
    
    // Add period
    doc.setFontSize(10);
    doc.text(`Period: ${format(fromDate, "dd/MM/yyyy")} to ${format(toDate, "dd/MM/yyyy")}`, 20, 55);
    
    // Prepare table data
    const tableData = bankingEntries.map((entry: BankingEntry) => [
      format(new Date(entry.date), "dd/MM/yyyy"),
      entry.remarks,
      entry.paymentType,
      `£${Number(entry.amount).toFixed(2)}`,
      entry.bags && entry.bags.length > 0 
        ? entry.bags.map(bag => `${bag.number} (${bag.payingNumber}) £${bag.amount.toFixed(2)}`).join('\n')
        : entry.bagNumber ? `Bag: ${entry.bagNumber}` : '-'
    ]);
    
    // Add table
    autoTable(doc, {
      head: [['Date', 'Remarks', 'Payment Type', 'Amount', 'Bag Details']],
      body: tableData,
      startY: 65,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [240, 240, 240] },
    });
    
    // Save PDF
    doc.save(`Banking_Entries_${format(fromDate, "yyyy-MM-dd")}_to_${format(toDate, "yyyy-MM-dd")}.pdf`);
  };

  const handleCopy = () => {
    if (bankingEntries.length === 0) return;
    
    const headers = ['Date', 'Remarks', 'Payment Type', 'Amount', 'Bag Details'];
    const rows = bankingEntries.map((entry: BankingEntry) => [
      format(new Date(entry.date), "dd/MM/yyyy"),
      entry.remarks,
      entry.paymentType,
      `£${Number(entry.amount).toFixed(2)}`,
      entry.bags && entry.bags.length > 0 
        ? entry.bags.map(bag => `${bag.number} (${bag.payingNumber}) £${bag.amount.toFixed(2)}`).join('; ')
        : entry.bagNumber ? `Bag: ${entry.bagNumber}` : '-'
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.join('\t')).join('\n');
    
    navigator.clipboard.writeText(csvContent).then(() => {
      toast({ title: "Success", description: "Banking entries copied to clipboard" });
    }).catch(() => {
      toast({ title: "Error", description: "Failed to copy to clipboard", variant: "destructive" });
    });
  };

  return (
    <PageLayout title="Banking" breadcrumb="Banking">
      <div className="space-y-6">
        {/* Business Date Display */}
        <BusinessDateDisplay />
        
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
                    bags: [{ number: "", payingNumber: "", amount: 0 }], // Reset bags when payment type changes
                    chequeNumber: "",
                    bagNumber: "", // Reset bag number when payment type changes
                    chequePayingNumber: "", // Reset cheque paying number when payment type changes
                    amount: 0
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
                    <SelectItem value="COINS">COINS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(newEntry.paymentType === "CASH" || newEntry.paymentType === "COINS") && (
                <>
                  <div className="col-span-4">
                    <Label>BAGS<span className="text-red-500">*</span></Label>
                    <div className="space-y-2">
                      {newEntry.bags.map((bag, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <Input
                            value={bag.number}
                            onChange={e => updateBagNumber(index, e.target.value)}
                            placeholder={`Bag ${index + 1} Number`}
                            className="w-40"
                            required
                          />
                          <Input
                            value={bag.payingNumber}
                            onChange={e => updateBagPayingNumber(index, e.target.value)}
                            placeholder="Pay In #"
                            className="w-40"
                            required
                          />
                          <Input
                            type="number"
                            step="0.01"
                            value={bag.amount}
                            onChange={e => updateBagAmount(index, parseFloat(e.target.value) || 0)}
                            placeholder="Amount"
                            className="w-32 text-right"
                            required
                          />
                          {newEntry.bags.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeBag(index)}
                              className="px-2"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          {index === newEntry.bags.length - 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addBag}
                              className="px-2"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <div className="text-sm font-medium text-gray-700">
                        Total: £{totalAmount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </>
              )}
              {newEntry.paymentType === "CHEQUE" && (
                <>
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
                  <div>
                    <Label>BAG NUMBER<span className="text-red-500">*</span></Label>
                    <Input
                      value={newEntry.bagNumber}
                      onChange={e => setNewEntry({...newEntry, bagNumber: e.target.value})}
                      placeholder="Enter bag number"
                      className="w-full"
                      required
                    />
                  </div>
                  <div>
                    <Label>PAYING NUMBER<span className="text-red-500">*</span></Label>
                    <Input
                      value={newEntry.chequePayingNumber}
                      onChange={e => setNewEntry({...newEntry, chequePayingNumber: e.target.value})}
                      placeholder="Pay In #"
                      className="w-full"
                      required
                    />
                  </div>
                </>
              )}
              {newEntry.paymentType !== "CASH" && newEntry.paymentType !== "COINS" && (
                <>
                  <div>
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
                  <div className="flex justify-start items-end">
                    <Button 
                      className="bg-green-500 hover:bg-green-600 text-white"
                      onClick={handleAddEntry}
                      disabled={addEntryMutation.isPending}
                    >
                      {addEntryMutation.isPending && <Loader2 className="animate-spin h-4 w-4 mr-1" />}
                      <Save size={16} className="mr-1" />
                      Save
                    </Button>
                  </div>
                </>
              )}
              {(newEntry.paymentType === "CASH" || newEntry.paymentType === "COINS") && (
                <div className="flex justify-start">
                  <Button 
                    className="bg-green-500 hover:bg-green-600 text-white"
                    onClick={handleAddEntry}
                    disabled={addEntryMutation.isPending}
                  >
                    {addEntryMutation.isPending && <Loader2 className="animate-spin h-4 w-4 mr-1" />}
                    <Save size={16} className="mr-1" />
                    Save
                  </Button>
                </div>
              )}
            </div>
            {/* Display saved entries */}
            {isLoading ? (
              <div className="flex justify-center items-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>
            ) : isError ? (
              <div className="text-red-600">Failed to load entries.</div>
            ) : bankingEntries.length > 0 ? (
              <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">Banking Entries:</h3>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePDF}>
                      <FileText size={14} />
                      PDF
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleExcel}>
                      <Download size={14} />
                      Excel
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handleCopy}>
                      <Copy size={14} />
                      Copy
                    </Button>
                    <Button size="sm" variant="outline" className="flex items-center gap-1" onClick={handlePrint}>
                      <Printer size={14} />
                      Print
                    </Button>
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden" ref={tableRef}>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold">Remarks</TableHead>
                        <TableHead className="font-semibold">Payment Type</TableHead>
                        <TableHead className="font-semibold text-right">Amount</TableHead>
                        <TableHead className="font-semibold">Bag Details</TableHead>
                        <TableHead className="font-semibold text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bankingEntries.map((entry) => (
                        <TableRow key={entry.id} className="hover:bg-gray-50">
                          <TableCell className="font-medium">
                            {format(new Date(entry.date), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell>{entry.remarks}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              entry.paymentType === 'CASH' ? 'bg-green-100 text-green-800' :
                              entry.paymentType === 'COINS' ? 'bg-yellow-100 text-yellow-800' :
                              entry.paymentType === 'CHEQUE' ? 'bg-blue-100 text-blue-800' :
                              entry.paymentType === 'CARD' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {entry.paymentType}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            £{Number(entry.amount).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {entry.paymentType === "CHEQUE" && entry.bagNumber ? (
                              <div className="text-sm text-gray-600">
                                <div>Bag: <span className="font-medium">{entry.bagNumber}</span></div>
                                {entry.payingNumber && (
                                  <div>PayInNo: <span className="font-medium">{entry.payingNumber}</span></div>
                                )}
                                {entry.chequeNumber && (
                                  <div>Cheque: <span className="font-medium">{entry.chequeNumber}</span></div>
                                )}
                              </div>
                            ) : entry.bags && entry.bags.length > 0 ? (
                              <div className="text-sm text-gray-600">
                                {entry.bags.map((bag, index) => (
                                  <div key={index} className="mb-1">
                                    <span className="font-medium">{bag.number}</span>
                                    {bag.payingNumber && (
                                      <span className="text-gray-500"> ({bag.payingNumber})</span>
                                    )}
                                    <span className="font-medium text-green-600"> £{bag.amount.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            ) : entry.bagNumbers && entry.bagNumbers.length > 0 ? (
                              <span className="text-sm text-gray-600">
                                Bags: {entry.bagNumbers.join(", ")}
                              </span>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this banking entry?")) {
                                  deleteEntryMutation.mutate(entry.id);
                                }
                              }}
                              disabled={deleteEntryMutation.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {deleteEntryMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-center text-gray-500 py-8">
                No banking entries found for the selected date range.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}