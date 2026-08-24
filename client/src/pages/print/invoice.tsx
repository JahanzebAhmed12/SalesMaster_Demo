import { useEffect, useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import logo from "@/public/printlogo.png";
import { apiRequest } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/config";
import { formatQuantity } from "@/lib/utils";

// Public API request function (no authentication required)
const publicApiRequest = async <T = any>(method: string, endpoint: string): Promise<T> => {
  // Helper to get the correct API URL for public requests

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

interface Company {
  companyName?: string;
  address1?: string;
  address2?: string;
  compRegNo?: string;
  vatNo?: string;
  email?: string;
}
interface Customer {
  customer_name?: string;
  address?: string;
  vat_number?: string;
}
interface Sale {
  invoice_number?: string;
  invoiceNumber?: string;
  date?: string;
  subtotal?: number;
  vat_amount?: number;
  porterage?: number;
  total_amount?: number;
  totalAmount?: number;
  paid_amount?: number;
  paidAmount?: number;
  payment_mode?: string;
  paymentMode?: string;
  customer_type?: string;
  gateNumber?: string;
}
interface Item {
  id?: number;
  productName?: string;
  description?: string;
  notes?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  highlighted?: boolean;
}
interface InvoiceData {
  company: Company;
  customer: Customer;
  sale: Sale;
  items: Item[];
  paidAmount: number;
  balance: number;
  notes: string;
}



export default function InvoicePrintPage() {
  const [, params] = useRoute<{ invoiceNumber: string }>("/print/invoice/:invoiceNumber");
  const invoiceNumber = params?.invoiceNumber;
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [location] = useLocation();
  const query = useMemo(() => new URLSearchParams(location.split('?')[1] || ''), [location]);
  const showCashPaid = query.get('showCashPaid') === '1';
  const showBankPaid = query.get('showBankPaid') === '1';
  const backdate = query.get('backdate');
  const [showOutstandingBalance, setShowOutstandingBalance] = useState<boolean>(true);
  const [invoiceFooter, setInvoiceFooter] = useState<string>("");

  useEffect(() => {
    if (!invoiceNumber) return;

    publicApiRequest("GET", `/api/sales/${invoiceNumber}/invoice`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
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
    <div className="invoice-container" style={{ maxWidth: 700, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 24 }}>
      {/* Header: Company Details and Logo */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {/* Company Info on Left */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div style={{ fontWeight: "bold", fontSize: 18 }}>{data.company?.companyName || "Company Name"}</div>
          <div style={{ fontSize: 14 }}>{data.company?.address1}{data.company?.address2 ? ", " + data.company.address2 : ""}</div>
          {data.company?.compRegNo && <div style={{ fontSize: 14 }}>Company Reg No: {data.company.compRegNo}</div>}
          {data.company?.vatNo && <div style={{ fontSize: 14 }}>VAT No: {data.company.vatNo}</div>}
          {data.company?.email && <div style={{ fontSize: 14 }}>{data.company.email}</div>}
        </div>
        {/* Logo on Right */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <img src={logo} alt="Logo" style={{ height: 80, marginBottom: 8 }} />
        </div>
      </div>
      <hr style={{ margin: "4px 0" }} />
      <div style={{ fontWeight: 400, fontSize: 16, textAlign: "right", marginBottom: 8 }}>INVOICE</div>

      {/* Bill To and Invoice Details Side by Side */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        {/* Bill To Section - Left Side */}
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Bill to :</div>
          <div style={{ border: "1px solid #ccc", padding: 8, minWidth: 200 }}>
            <div style={{ fontWeight: "bold" }}>{data.customer?.customer_name || "CUSTOMER"}</div>
            {data.customer?.address && <div style={{ fontSize: 14, marginTop: 2 }}>{data.customer.address}</div>}
          </div>
          {data.customer?.vat_number && <div style={{ fontSize: 14, marginTop: 2 }}>VAT No: {data.customer.vat_number}</div>}
          {data.sale?.gateNumber && <div style={{ fontSize: 18, marginTop: 4, fontWeight: "bold" }}><b>Others/Gate:</b> {data.sale.gateNumber}</div>}
        </div>

        {/* Invoice Details - Right Side */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 400, fontSize: 16 }}>Date: {data.sale?.date ? new Date(data.sale.date).toLocaleDateString() : new Date().toLocaleDateString()}</div>
          <div style={{ fontWeight: "bold", fontSize: 18, color: '#1a237e', marginTop: 4 }}>
            Invoice No: {data.sale?.invoice_number || data.sale?.invoiceNumber || "-"}
          </div>
          <div style={{ fontSize: 14, marginTop: 4 }}>Cust_type: {data.sale?.paymentMode || data.sale?.payment_mode || data.sale?.customer_type || "account"}</div>
          {backdate && (
            <div style={{ fontSize: 14, color: '#1a237e', fontWeight: 'bold', marginTop: 4 }}>Backdate payment for {backdate}</div>
          )}
        </div>
      </div>
      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "left" }}>Product</th>
            <th style={{ border: "1px solid #ccc", padding: "1px 4px", width: 50 }}>Qty</th>
            <th style={{ border: "1px solid #ccc", padding: "1px 4px", width: 60 }}>U.Price</th>
            <th style={{ border: "1px solid #ccc", padding: "1px 4px", width: 60 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, idx) => (
            <tr key={item.id || idx} style={{ background: item.highlighted ? '#fff3a3' : undefined }}>
              <td style={{ border: "1px solid #ccc", padding: "1px 4px", wordWrap: "break-word", wordBreak: "break-word" }}>
                {item.productName || item.description || "-"}
                {item.notes && (
                  <span style={{ fontSize: "12px", fontStyle: "italic" }}> - {item.notes}</span>
                )}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>{formatQuantity(item.quantity)}</td>
              <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>{item.unitPrice?.toFixed(2) ?? "-"}</td>
              <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>£{item.totalPrice?.toFixed(2) ?? "-"}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ border: "1px solid #ccc", padding: "1px 4px" }}>SUB TOTAL</td>
            <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>{formatQuantity(data.items.reduce((a, b) => a + Number(b.quantity || 0), 0))}</td>
            <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>X</td>
            <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>£{data.sale?.subtotal?.toFixed(2) ?? "-"}</td>
          </tr>
        </tbody>
      </table>
      {/* Notes and Totals */}
      <div style={{ display: "flex", marginTop: 0 }}>
        <div style={{ flex: 2, fontSize: 11, fontStyle: "italic", border: "1px solid #ccc", borderTop: "none", padding: 4 }}>
          {invoiceFooter ? invoiceFooter.split("\n").map((line, i) => <div key={i}>{line}</div>) : ""}
        </div>
        <div style={{ flex: 1, border: "1px solid #ccc", borderLeft: "none", borderTop: "none", fontSize: 13 }}>
          {(data.sale?.porterage ?? 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 4px" }}>
              <span>Porterage</span><span>£{data.sale?.porterage?.toFixed(2) ?? "0.00"}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 4px", fontWeight: "bold" }}>
            <span>TOTAL</span>
            <span>£{(data.sale?.total_amount ?? data.sale?.totalAmount ?? 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
      {showCashPaid && (
        <div style={{ fontSize: 15, color: '#1a237e', fontWeight: 'bold', marginTop: 16, marginBottom: 8, textAlign: 'right' }}>Cash Paid: £{Number(data.sale?.paid_amount ?? data.sale?.paidAmount ?? 0).toFixed(2)}</div>
      )}
      {showBankPaid && (
        <div style={{ fontSize: 15, color: '#1976d2', fontWeight: 'bold', marginTop: 16, marginBottom: 8, textAlign: 'right' }}>Bank Paid: £{Number(data.sale?.paid_amount ?? data.sale?.paidAmount ?? 0).toFixed(2)}</div>
      )}
      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: 13, color: "#444", textAlign: "right" }}>
        <div>Invoice Time: {data.sale?.date ? new Date(data.sale.date).toLocaleString() : "-"}</div>
        <div>Current Time: {new Date().toLocaleString()}</div>
      </div>
      <button
        onClick={() => window.print()}
        style={{ marginTop: 24, padding: "6px 18px", fontSize: 16, border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        className="no-print"
      >
        Print
      </button>
      <button
        onClick={() => window.close()}
        style={{ marginTop: 24, marginLeft: 12, padding: "6px 18px", fontSize: 16, border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        className="no-print"
      >
        Close
      </button>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
} 