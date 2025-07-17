import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function DailyAccounts() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [trigger, setTrigger] = useState(0);

  // Set both dates to today and auto-search on mount
  useEffect(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    setFromDate(todayStr);
    setToDate(todayStr);
    setTrigger((t) => t + 1);
  }, []);

  useEffect(() => {
    if (fromDate && toDate) {
      setTrigger((t) => t + 1);
    }
    // eslint-disable-next-line
  }, [fromDate, toDate]);

  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContents = printRef.current.innerHTML;
    const printWindow = window.open('', '', 'height=600,width=900');
    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Table</title>');
      printWindow.document.write('<style>body{font-family:sans-serif;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}h1{text-align:center;}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(`<h1>Daily Accounts</h1>`);
      printWindow.document.write(printContents);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    }
  };

  const handlePDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('Daily Accounts', 14, 16);
    let y = 26;
    // Receivables Cash
    doc.setFontSize(12);
    doc.text('Receivables Cash', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount']],
      body: receivablesCash.map((item: any) => [item.item, Number(item.amount).toFixed(2)]),
      theme: 'grid',
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    // Receivables Others
    doc.text('Receivables Others', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount']],
      body: receivablesOthers.map((item: any) => [item.item, Number(item.amount).toFixed(2)]),
      theme: 'grid',
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    // Banking
    doc.text('Banking', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount']],
      body: banking.map((item: any) => [item.item, Number(item.amount).toFixed(2)]),
      theme: 'grid',
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    // Payables Cash
    doc.text('Payables Cash', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount']],
      body: payablesCash.map((item: any) => [item.item, Number(item.amount).toFixed(2)]),
      theme: 'grid',
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    // Payables Others
    doc.text('Payables Others', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount']],
      body: payablesOthers.map((item: any) => [item.item, Number(item.amount).toFixed(2)]),
      theme: 'grid',
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    // C/F
    doc.text('C/F', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['C/F Total', '']],
      body: [[Number(cfTotal).toFixed(2), '']],
      theme: 'grid',
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    // Balance Summary
    doc.text('Actual Balance: ' + Number(actualBalance).toFixed(2), 14, y);
    y += 6;
    doc.text('Shortfall: ' + Number(shortfall).toFixed(2), 14, y);
    doc.save('daily-accounts.pdf');
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["daily-accounts", fromDate, toDate, trigger],
    queryFn: async () => {
      const params = new URLSearchParams({ fromDate, toDate });
      return apiRequest("GET", `/api/reports/daily-accounts?${params.toString()}`);
    },
    enabled: !!fromDate && !!toDate,
  });

  const receivablesCash = data?.receivablesCash || [];
  const receivablesOthers = data?.receivablesOthers || [];
  const payablesCash = data?.payablesCash || [];
  const payablesOthers = data?.payablesOthers || [];
  const banking = data?.banking || [];
  const cfTotal = data?.cfTotal || 0;
  const actualBalance = data?.actualBalance || 0;
  const shortfall = data?.shortfall || 0;

  const totalReceivablesCash = receivablesCash.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const totalReceivablesOthers = receivablesOthers.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const totalPayablesCash = payablesCash.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const totalPayablesOthers = payablesOthers.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const totalBanking = banking.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Daily Accounts</h1>
        <div className="text-sm text-gray-500">
          TROPIFRUIT UK LTD, 3 Dolphin Way, Purfleet, RM19 1NZ...
        </div>
      </div>
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Label htmlFor="fromDate">Date:</Label>
            <Input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="toDate">B/F Date:</Label>
            <Input
              id="toDate"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={() => setTrigger((t) => t + 1)}>Search</Button>
        </div>
        <div className="flex gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={handlePDF}>PDF</Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>Print</Button>
        </div>
        {isLoading ? (
          <div className="text-center py-8">Loading...</div>
        ) : isError ? (
          <div className="text-center text-red-500 py-8">Failed to load data.</div>
        ) : (
        <div ref={printRef} className="grid grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Receivables Cash */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Receivables Cash</h3>
                <div className="space-y-2">
                  {receivablesCash.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{Number(item.amount).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>TOTAL CASH</span>
                    <span className="font-mono">{Number(totalReceivablesCash).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Receivables Others */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Receivables Others</h3>
                <div className="space-y-2">
                  {receivablesOthers.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{Number(item.amount).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>TOTAL</span>
                    <span className="font-mono">{Number(totalReceivablesOthers).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Banking */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Banking</h3>
                <div className="space-y-2">
                  {banking.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{Number(item.amount).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>SUB TOTAL</span>
                    <span className="font-mono">{Number(totalBanking).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          {/* Right Column */}
          <div className="space-y-6">
            {/* Payables Cash */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Payables Cash</h3>
                <div className="space-y-2">
                  {payablesCash.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{Number(item.amount).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>TOTAL</span>
                    <span className="font-mono">{Number(totalPayablesCash).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Payables Others */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Payables Others</h3>
                <div className="space-y-2">
                  {payablesOthers.map((item: any, index: number) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{Number(item.amount).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>TOTAL</span>
                    <span className="font-mono">{Number(totalPayablesOthers).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* C/F */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">C/F</h3>
                <div className="space-y-2">
                  <div className="flex justify-between font-semibold">
                    <span>C/F Total</span>
                    <span className="font-mono">{Number(cfTotal).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Balance Summary */}
            <Card className="bg-yellow-50">
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="font-semibold">Actual Balance:</span>
                    <span className="font-mono font-semibold">{Number(actualBalance).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span className="font-semibold">(Short {Number(shortfall).toFixed(2)})</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}