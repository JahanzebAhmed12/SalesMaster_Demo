import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useCompanyDetails } from "@/hooks/use-company-details";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useLocation } from "wouter";
import { printHtmlTable } from "@/lib/export-utils";

export default function DailyAccounts() {
  const [, navigate] = useLocation();
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

  // Fetch company details
  const { companyDetails } = useCompanyDetails();

  const handlePrint = () => {
    let html = '';
    
    // Add company header
    html += '<div class="company-header">';
    html += `<div class="company-name">${companyDetails?.companyName || 'Company Name'}</div>`;
    if (companyDetails?.address1) {
      html += `<div class="company-address">${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}</div>`;
    }
    if (companyDetails?.telephone) {
      html += `<div class="company-contact">Phone: ${companyDetails.telephone}</div>`;
    }
    if (companyDetails?.email) {
      html += `<div class="company-contact">Email: ${companyDetails.email}</div>`;
    }
    html += '<div class="report-title">Daily Accounts Report</div>';
    html += `<div class="date-range">Date Range: ${fromDate} to ${toDate}</div>`;
    html += '</div>';
    
    html += '<div class="two-column">';
    
    // Left Column
    html += '<div class="column">';
    
    // Receivables Cash
    html += '<div class="section">';
    html += '<div class="section-title">Receivables Cash</div>';
    html += '<table>';
    html += '<thead><tr><th>Item</th><th class="text-right">Amount</th></tr></thead><tbody>';
    receivablesCash.forEach((item: any) => {
      html += `<tr><td>${item.item}</td><td class="text-right">£${Number(item.amount).toFixed(2)}</td></tr>`;
    });
    html += '</tbody></table>';
    html += '</div>';
    
    // Receivables Others
    html += '<div class="section">';
    html += '<div class="section-title">Receivables Others</div>';
    html += '<table>';
    html += '<thead><tr><th>Item</th><th class="text-right">Amount</th></tr></thead><tbody>';
    receivablesOthers.forEach((item: any) => {
      html += `<tr><td>${item.item}</td><td class="text-right">£${Number(item.amount).toFixed(2)}</td></tr>`;
    });
    html += `<tr class="total-row"><td class="font-semibold">TOTAL</td><td class="text-right font-semibold">£${Number(totalReceivablesOthers).toFixed(2)}</td></tr>`;
    html += '</tbody></table>';
    html += '</div>';
    
    // Banking
    html += '<div class="section">';
    html += '<div class="section-title">Banking</div>';
    html += '<table>';
    html += '<thead><tr><th>Item</th><th class="text-right">Amount</th></tr></thead><tbody>';
    banking.forEach((item: any) => {
      html += `<tr><td>${item.item}</td><td class="text-right">£${Number(item.amount).toFixed(2)}</td></tr>`;
    });
    html += `<tr class="total-row"><td class="font-semibold">SUB TOTAL</td><td class="text-right font-semibold">£${Number(totalBanking).toFixed(2)}</td></tr>`;
    html += '</tbody></table>';
    html += '</div>';
    
    html += '</div>'; // End left column
    
    // Right Column
    html += '<div class="column">';
    
    // Payables Cash
    html += '<div class="section">';
    html += '<div class="section-title">Payables Cash</div>';
    html += '<table>';
    html += '<thead><tr><th>Item</th><th class="text-right">Amount</th></tr></thead><tbody>';
    payablesCash.forEach((item: any) => {
      html += `<tr><td>${item.item}</td><td class="text-right">£${Number(item.amount).toFixed(2)}</td></tr>`;
    });
    html += `<tr class="total-row"><td class="font-semibold">TOTAL</td><td class="text-right font-semibold">£${Number(totalPayablesCash).toFixed(2)}</td></tr>`;
    html += '</tbody></table>';
    html += '</div>';
    
    // Payables Others
    html += '<div class="section">';
    html += '<div class="section-title">Payables Others</div>';
    html += '<table>';
    html += '<thead><tr><th>Item</th><th class="text-right">Amount</th></tr></thead><tbody>';
    payablesOthers.forEach((item: any) => {
      html += `<tr><td>${item.item}</td><td class="text-right">£${Number(item.amount).toFixed(2)}</td></tr>`;
    });
    html += `<tr class="total-row"><td class="font-semibold">TOTAL</td><td class="text-right font-semibold">£${Number(totalPayablesOthers).toFixed(2)}</td></tr>`;
    html += '</tbody></table>';
    html += '</div>';
    
    // C/F
    html += '<div class="section">';
    html += '<div class="section-title">C/F</div>';
    html += '<table>';
    html += '<thead><tr><th>Item</th><th class="text-right">Amount</th></tr></thead><tbody>';
    html += `<tr class="total-row"><td class="font-semibold">C/F Total</td><td class="text-right font-semibold">£${Number(cfTotal).toFixed(2)}</td></tr>`;
    html += '</tbody></table>';
    html += '</div>';
    
    html += '</div>'; // End right column
    html += '</div>'; // End two-column
    
    // Balance Summary
    html += '<div class="balance-summary">';
    html += `<div><strong>Actual Balance:</strong> £${Number(actualBalance).toFixed(2)}</div>`;
    html += `<div style="color:#dc2626;"><strong>(Short £${Number(shortfall).toFixed(2)})</strong></div>`;
    html += '</div>';
    
    printHtmlTable('Daily Accounts Report', html);
  };

  const handlePDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    let currentY = 15;

    // Add company header if available
    if (companyDetails) {
      doc.setFontSize(16);
      doc.text(companyDetails.companyName || 'Company Name', 105, currentY, { align: 'center' });
      currentY += 7;
      
      doc.setFontSize(10);
      if (companyDetails.address1) {
        const address = `${companyDetails.address1}${companyDetails.address2 ? ', ' + companyDetails.address2 : ''}`;
        doc.text(address, 105, currentY, { align: 'center' });
        currentY += 5;
      }
      if (companyDetails.telephone) {
        doc.text(`Phone: ${companyDetails.telephone}`, 105, currentY, { align: 'center' });
        currentY += 5;
      }
      if (companyDetails.email) {
        doc.text(`Email: ${companyDetails.email}`, 105, currentY, { align: 'center' });
        currentY += 5;
      }
      currentY += 5; // Extra spacing
    }

    // Add title
    doc.setFontSize(14);
    doc.text('Daily Accounts Report', 105, currentY, { align: 'center' });
    currentY += 7;
    
    doc.setFontSize(10);
    doc.text(`Date Range: ${fromDate} to ${toDate}`, 105, currentY, { align: 'center' });
    currentY += 10;

    let y = currentY;
    // Receivables Cash
    doc.setFontSize(12);
    doc.text('Receivables Cash', 14, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount']],
      body: receivablesCash.map((item: any) => [item.item, `£${Number(item.amount).toFixed(2)}`]),
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
      body: receivablesOthers.map((item: any) => [item.item, `£${Number(item.amount).toFixed(2)}`]),
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
      body: banking.map((item: any) => [item.item, `£${Number(item.amount).toFixed(2)}`]),
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
      body: payablesCash.map((item: any) => [item.item, `£${Number(item.amount).toFixed(2)}`]),
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
      body: payablesOthers.map((item: any) => [item.item, `£${Number(item.amount).toFixed(2)}`]),
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
      body: [[`£${Number(cfTotal).toFixed(2)}`, '']],
      theme: 'grid',
      styles: { fontSize: 10 },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
    // Balance Summary
    doc.text('Actual Balance: £' + Number(actualBalance).toFixed(2), 14, y);
    y += 6;
    doc.text('Shortfall: £' + Number(shortfall).toFixed(2), 14, y);
    doc.save(`daily-accounts-${fromDate}-to-${toDate}.pdf`);
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

  const totalReceivablesCash = receivablesCash
    .filter((item: any) => item.item !== "TOTAL CASH")
    .reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const totalReceivablesOthers = receivablesOthers.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const totalPayablesCash = payablesCash.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const totalPayablesOthers = payablesOthers.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);
  const totalBanking = banking.reduce((sum: number, item: any) => sum + (item.amount || 0), 0);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Daily Accounts</h1>
        <div className="text-sm text-gray-500">
          {companyDetails?.companyName || 'Company Name'}, {companyDetails?.address1 || ''}{companyDetails?.address2 ? `, ${companyDetails.address2}` : ''}
        </div>
      </div>
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Label htmlFor="fromDate">From:</Label>
            <Input
              id="fromDate"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="toDate">To:</Label>
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
                  {receivablesCash.map((item: any, index: number) => {
                    let onClick = undefined;
                    
                    // Set up navigation based on the item
                    if (item.item === 'Sales Cash') {
                      onClick = () => navigate('/daily-report/daily-book-sales');
                    } else if (item.item === 'On Account Cash') {
                      onClick = () => navigate('/data-entry/on-acc-customer');
                    }
                    
                    return (
                      <div 
                        key={index} 
                        className={`flex justify-between ${onClick ? 'cursor-pointer hover:text-blue-600 hover:underline' : ''}`}
                        onClick={onClick}
                      >
                        <span>{item.item}</span>
                        <span className="font-mono">{Number(item.amount).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            {/* Receivables Others */}
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3 text-blue-600">Receivables Others</h3>
                <div className="space-y-2">
                  {receivablesOthers.map((item: any, index: number) => {
                    let onClick = undefined;
                    let paymentMode = '';
                    
                    // Set up navigation and payment mode based on the item
                    if (item.item === 'Cheque') {
                      paymentMode = 'cheque';
                      onClick = () => {
                        const params = new URLSearchParams({
                          fromDate: fromDate,
                          toDate: toDate,
                          paymentMode: paymentMode
                        });
                        navigate(`/payments/customer-payment-history?${params.toString()}`);
                      };
                    } else if (item.item === 'Card') {
                      paymentMode = 'bank'; // Card payments are stored as 'bank' in the database
                      onClick = () => {
                        const params = new URLSearchParams({
                          fromDate: fromDate,
                          toDate: toDate,
                          paymentMode: paymentMode
                        });
                        navigate(`/payments/customer-payment-history?${params.toString()}`);
                      };
                    } else if (item.item === 'Bank Transfer') {
                      paymentMode = 'bank_transfer';
                      onClick = () => {
                        const params = new URLSearchParams({
                          fromDate: fromDate,
                          toDate: toDate,
                          paymentMode: paymentMode
                        });
                        navigate(`/payments/customer-payment-history?${params.toString()}`);
                      };
                    } else if (item.item === 'On Account Cheque') {
                      paymentMode = 'cheque';
                      onClick = () => {
                        const params = new URLSearchParams({
                          fromDate: fromDate,
                          toDate: toDate,
                          paymentMode: paymentMode,
                          paymentType: 'on-account'
                        });
                        navigate(`/payments/customer-payment-history?${params.toString()}`);
                      };
                    } else if (item.item === 'On Account Card') {
                      paymentMode = 'bank'; // Card payments are stored as 'bank' in the database
                      onClick = () => {
                        const params = new URLSearchParams({
                          fromDate: fromDate,
                          toDate: toDate,
                          paymentMode: paymentMode,
                          paymentType: 'on-account'
                        });
                        navigate(`/payments/customer-payment-history?${params.toString()}`);
                      };
                    } else if (item.item === 'On Account Bank Transfer') {
                      paymentMode = 'bank_transfer';
                      onClick = () => {
                        const params = new URLSearchParams({
                          fromDate: fromDate,
                          toDate: toDate,
                          paymentMode: paymentMode,
                          paymentType: 'on-account'
                        });
                        navigate(`/payments/customer-payment-history?${params.toString()}`);
                      };
                    }
                    
                    return (
                      <div 
                        key={index} 
                        className={`flex justify-between ${onClick ? 'cursor-pointer hover:text-blue-600 hover:underline' : ''}`}
                        onClick={onClick}
                      >
                        <span>{item.item}</span>
                        <span className="font-mono">{Number(item.amount).toFixed(2)}</span>
                      </div>
                    );
                  })}
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