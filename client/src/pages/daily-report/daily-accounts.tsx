import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function DailyAccounts() {
  const [fromDate, setFromDate] = useState("2025-06-10");
  const [toDate, setToDate] = useState("2025-06-10");
  const [trigger, setTrigger] = useState(0);

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
        {isLoading ? (
          <div className="text-center py-8">Loading...</div>
        ) : isError ? (
          <div className="text-center text-red-500 py-8">Failed to load data.</div>
        ) : (
        <div className="grid grid-cols-2 gap-6">
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