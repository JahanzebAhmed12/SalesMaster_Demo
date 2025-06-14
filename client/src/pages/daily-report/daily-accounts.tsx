import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function DailyAccounts() {
  const [fromDate, setFromDate] = useState("2025-06-10");
  const [toDate, setToDate] = useState("2025-06-10");

  const receivablesCash = [
    { item: "Sales Cash", amount: 4240.00 },
    { item: "Account Cash", amount: 0.00 },
    { item: "On Account Cash", amount: 0.00 },
    { item: "B/F", amount: 0.00 }
  ];

  const receivablesOthers = [
    { item: "Cheque", amount: 0.00, value: 0.00 },
    { item: "Card", amount: 0.00 },
    { item: "Bank Transfer", amount: 0.00 },
    { item: "Petty Cash", amount: 0.00 },
    { item: "On Account Che", amount: 0.00 },
    { item: "On Account Card", amount: 0.00 },
    { item: "On Account Bank Transfer", amount: 0.00 },
    { item: "On Account Others", amount: 0.00 }
  ];

  const payablesCash = [
    { item: "Misc Expenses", amount: 0.00 },
    { item: "Supplier Payments Cash", amount: 0.00 },
    { item: "Supplier Payments On/Ac", amount: 0.00 }
  ];

  const payablesOthers = [
    { item: "Misc Expenses", amount: 0.00 },
    { item: "Supplier Payments", amount: 0.00 },
    { item: "On/Ac Payments", amount: 0.00 }
  ];

  const banking = [
    { item: "Cash", amount: 0.00 },
    { item: "Cheque", amount: 0.00 }
  ];

  const totalReceivablesCash = receivablesCash.reduce((sum, item) => sum + item.amount, 0);
  const totalReceivablesOthers = receivablesOthers.reduce((sum, item) => sum + item.amount, 0);
  const totalPayablesCash = payablesCash.reduce((sum, item) => sum + item.amount, 0);
  const totalPayablesOthers = payablesOthers.reduce((sum, item) => sum + item.amount, 0);
  const totalBanking = banking.reduce((sum, item) => sum + item.amount, 0);
  const cfTotal = 0.00;
  const actualBalance = 0.00;
  const shortfall = 4240.00;

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
          <Button variant="outline">Search</Button>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Receivables Cash */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Receivables Cash</h3>
                <div className="space-y-2">
                  {receivablesCash.map((item, index) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>TOTAL CASH</span>
                    <span className="font-mono">{totalReceivablesCash.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Receivables Others */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Receivables Others</h3>
                <div className="space-y-2">
                  {receivablesOthers.map((item, index) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>TOTAL</span>
                    <span className="font-mono">{totalReceivablesOthers.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Banking */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Banking</h3>
                <div className="space-y-2">
                  {banking.map((item, index) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>SUB TOTAL</span>
                    <span className="font-mono">{totalBanking.toFixed(2)}</span>
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
                  {payablesCash.map((item, index) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>TOTAL</span>
                    <span className="font-mono">{totalPayablesCash.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Payables Others */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Payables Others</h3>
                <div className="space-y-2">
                  {payablesOthers.map((item, index) => (
                    <div key={index} className="flex justify-between">
                      <span>{item.item}</span>
                      <span className="font-mono">{item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-2 font-semibold flex justify-between">
                    <span>TOTAL</span>
                    <span className="font-mono">{totalPayablesOthers.toFixed(2)}</span>
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
                    <span className="font-mono">{cfTotal.toFixed(2)}</span>
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
                    <span className="font-mono font-semibold">{actualBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span className="font-semibold">(Short {shortfall.toFixed(2)})</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}