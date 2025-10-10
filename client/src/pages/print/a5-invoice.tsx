import React, { useEffect, useState, useMemo } from 'react';
import { useRoute, useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import logo from '@/public/printlogo.png';
import { API_BASE_URL, useRelativeUrls } from '@/lib/config';
import { formatQuantity } from '@/lib/utils';

// Public API request function (no authentication required)
const publicApiRequest = async <T = any>(method: string, endpoint: string): Promise<T> => {
  // Helper to get the correct API URL for public requests
  const getApiUrl = (endpoint: string) => {
    return useRelativeUrls() ? endpoint : `${API_BASE_URL}${endpoint}`;
  };

  const url = getApiUrl(endpoint);
  
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(responseData.message || responseData.error || `HTTP error! status: ${response.status}`);
  }

  return responseData;
};

interface InvoiceData {
  company: any;
  customer: any;
  sale: any;
  items: any[];
  paidAmount: number;
  balance: number;
  notes: string;
}

interface InvoiceTemplateProps {
  data: InvoiceData | null;
  showOutstandingBalance: boolean;
  invoiceFooter: string;
}

function A5InvoiceTemplate({ data, showOutstandingBalance, invoiceFooter }: InvoiceTemplateProps) {
  if (!data) return null;
  const { company, customer, sale, items, paidAmount, balance, notes } = data;
  return (
    <div style={{ maxWidth: 500, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 16 }}>
      {/* Header: Logo and Invoice Number */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* Logo and Company Info */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <img src={logo} alt="Logo" style={{ height: 40, marginBottom: 6 }} />
          <div style={{ fontWeight: "bold", fontSize: 14 }}>{data.company?.companyName || "Company Name"}</div>
          <div style={{ fontSize: 10 }}>{data.company?.address1}{data.company?.address2 ? ", " + data.company.address2 : ""}</div>
          {data.company?.compRegNo && <div style={{ fontSize: 10 }}>Company Reg No: {data.company.compRegNo}</div>}
          {data.company?.vatNo && <div style={{ fontSize: 10 }}>VAT No: {data.company.vatNo}</div>}
        </div>
        {/* Invoice Number and Title */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "bold", fontSize: 18, color: '#1a237e', marginBottom: 2 }}>
            Invoice No: {data.sale?.invoice_number || data.sale?.invoiceNumber || "-"}
          </div>
          <div style={{ fontWeight: "bold", fontSize: 20, letterSpacing: 1 }}>INVOICE</div>
          <div style={{ fontWeight: 400, fontSize: 12, marginTop: 4 }}>Date: {data.sale?.date ? new Date(data.sale.date).toLocaleDateString() : new Date().toLocaleDateString()}</div>
        </div>
      </div>
      <hr style={{ margin: "12px 0" }} />
      {/* Bill To and Customer Info */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: "bold", fontSize: 12, marginBottom: 4 }}>Bill To:</div>
          <div style={{ fontSize: 11 }}>
            <div style={{ fontWeight: "bold" }}>{data.customer?.customer_name || data.customer?.customerName || "Customer Name"}</div>
            <div>{data.customer?.address || "Address"}</div>
            <div>Tel: {data.customer?.telephone || "N/A"}</div>
            {data.customer?.email && <div>Email: {data.customer.email}</div>}
          </div>
        </div>
        <div style={{ flex: 1, textAlign: "right" }}>
          <div style={{ fontSize: 11 }}>
            <div>Vehicle: {data.sale?.vehicle_details || "N/A"}</div>
            <div>Gate: {data.sale?.gate_number || "N/A"}</div>
          </div>
        </div>
      </div>
      {/* Items Table */}
      <div style={{ marginBottom: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #ddd" }}>
              <th style={{ textAlign: "left", padding: "4px", width: "10%" }}>Qty</th>
              <th style={{ textAlign: "left", padding: "4px", width: "50%" }}>Description</th>
              <th style={{ textAlign: "right", padding: "4px", width: "20%" }}>Price</th>
              <th style={{ textAlign: "right", padding: "4px", width: "20%" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {data.items?.map((item, index) => (
              <tr key={index} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "4px" }}>{formatQuantity(item.quantity)}</td>
                <td style={{ padding: "4px" }}>{item.product_name || item.productName || item.description}</td>
                <td style={{ padding: "4px", textAlign: "right" }}>£{(item.unit_price || item.unitPrice || 0).toFixed(2)}</td>
                <td style={{ padding: "4px", textAlign: "right" }}>£{(item.total_price || item.totalPrice || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <table style={{ fontSize: 10 }}>
          <tbody>
            <tr>
              <td style={{ padding: "2px 8px", textAlign: "right" }}>Subtotal:</td>
              <td style={{ padding: "2px 8px", textAlign: "right" }}>£{(data.sale?.subtotal || 0).toFixed(2)}</td>
            </tr>
            {data.sale?.porterage && data.sale.porterage > 0 && (
              <tr>
                <td style={{ padding: "2px 8px", textAlign: "right" }}>Porterage:</td>
                <td style={{ padding: "2px 8px", textAlign: "right" }}>£{data.sale.porterage.toFixed(2)}</td>
              </tr>
            )}
            {data.sale?.vat_amount && data.sale.vat_amount > 0 && (
              <tr>
                <td style={{ padding: "2px 8px", textAlign: "right" }}>VAT:</td>
                <td style={{ padding: "2px 8px", textAlign: "right" }}>£{data.sale.vat_amount.toFixed(2)}</td>
              </tr>
            )}
            <tr style={{ fontWeight: "bold", borderTop: "1px solid #ddd" }}>
              <td style={{ padding: "2px 8px", textAlign: "right" }}>Total:</td>
              <td style={{ padding: "2px 8px", textAlign: "right" }}>£{(data.sale?.total_amount || 0).toFixed(2)}</td>
            </tr>
            {showOutstandingBalance && (
              <>
                <tr>
                  <td style={{ padding: "2px 8px", textAlign: "right" }}>Paid:</td>
                  <td style={{ padding: "2px 8px", textAlign: "right" }}>£{paidAmount.toFixed(2)}</td>
                </tr>
                <tr style={{ fontWeight: "bold" }}>
                  <td style={{ padding: "2px 8px", textAlign: "right" }}>Balance:</td>
                  <td style={{ padding: "2px 8px", textAlign: "right" }}>£{balance.toFixed(2)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {/* Footer */}
      {invoiceFooter && (
        <div style={{ marginTop: 8, padding: "8px", backgroundColor: "#f5f5f5", fontSize: 9, textAlign: "center" }}>
          {invoiceFooter}
        </div>
      )}
      {/* Notes */}
      {data.sale?.notes && (
        <div style={{ marginTop: 8, fontSize: 9 }}>
          <strong>Notes:</strong> {data.sale.notes}
        </div>
      )}
    </div>
  );
}

export default function A5InvoicePrintPage() {
  const [match, params] = useRoute<{ invoiceNumber: string }>("/print/a5-invoice/:invoiceNumber");
  const invoiceNumber = params?.invoiceNumber;
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [location] = useLocation();
  const query = useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);
  const [showOutstandingBalance, setShowOutstandingBalance] = useState<boolean>(true);
  const [invoiceFooter, setInvoiceFooter] = useState<string>("");

  const handlePrint = () => {
    // Create a style element to force A5 size
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        @page {
          size: A5 portrait !important;
          margin: 10mm !important;
        }
        body {
          width: 148mm !important;
          height: 210mm !important;
        }
      }
    `;
    document.head.appendChild(style);
    
    // Print after a short delay to ensure styles are applied
    setTimeout(() => {
      window.print();
      // Remove the style after printing
      setTimeout(() => {
        document.head.removeChild(style);
      }, 1000);
    }, 100);
  };

  useEffect(() => {
    if (!invoiceNumber) return;
    
    publicApiRequest("GET", `/api/sales/${invoiceNumber}/invoice`)
      .then((res: any) => {
        setData(res);
        setLoading(false);
      })
      .catch((err: any) => {
        setError("Failed to load invoice");
        setLoading(false);
      });
  }, [invoiceNumber]);

  useEffect(() => {
    apiRequest("GET", "/api/settings").then((settings) => {
      setShowOutstandingBalance(!!settings.showOutstandingBalance);
      setInvoiceFooter(settings.invoiceFooter || "");
    });
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (error) {
    return <div>Error: {error}</div>;
  }
  
  if (!data) {
    return <div>No data found</div>;
  }

  return (
    <div className="invoice-container">
      <style>{`
        @media print {
          @page { 
            size: A5 portrait; 
            margin: 10mm; 
          }
          @page :first {
            size: A5 portrait;
          }
          @page :left {
            size: A5 portrait;
          }
          @page :right {
            size: A5 portrait;
          }
          body { 
            margin: 0; 
            padding: 0;
            width: 148mm;
            height: 210mm;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print:hidden {
            display: none !important;
          }
          .invoice-container {
            width: 148mm;
            height: 210mm;
            margin: 0;
            padding: 0;
          }
        }
      `}</style>

      {/* Print Preview Header - hidden during print */}
      <div className="p-4 bg-gray-100 print:hidden">
        <h1 className="text-xl font-bold mb-2">A5 Invoice Print Preview</h1>
        <p className="text-sm text-gray-600 mb-4">Invoice: {data.sale?.invoice_number}</p>
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
          <strong>Print Settings:</strong> This invoice is designed for A5 paper. If your browser defaults to A4, please change the paper size to A5 in the print dialog.
        </div>
        <button 
          onClick={handlePrint} 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Print Invoice
        </button>
      </div>

      {/* A5 Invoice Content */}
      <A5InvoiceTemplate 
        data={data} 
        showOutstandingBalance={showOutstandingBalance} 
        invoiceFooter={invoiceFooter} 
      />
    </div>
  );
} 