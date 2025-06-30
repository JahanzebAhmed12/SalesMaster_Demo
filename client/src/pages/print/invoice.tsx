import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import logo from "@/public/printlogo.png"

// Public API request function (no authentication required)
const publicApiRequest = async <T = any>(method: string, endpoint: string): Promise<T> => {
  const url = `http://localhost:5000${endpoint}`;
  
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

function InvoiceTemplate({ data }: { data: InvoiceData }) {
  if (!data) return null;
  const { company, customer, sale, items, paidAmount, balance, notes } = data;
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 24 }}>
      {/* Header: Logo and Invoice Number */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* Logo and Company Info */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <img src={logo} alt="Logo" style={{ height: 60, marginBottom: 8 }} />
          <div style={{ fontWeight: "bold", fontSize: 18 }}>{company?.companyName || "Company Name"}</div>
          <div style={{ fontSize: 14 }}>{company?.address1}{company?.address2 ? ", " + company.address2 : ""}</div>
          {company?.compRegNo && <div style={{ fontSize: 14 }}>Company Reg No: {company.compRegNo}</div>}
          {company?.vatNo && <div style={{ fontSize: 14 }}>VAT No: {company.vatNo}</div>}
        </div>
        {/* Invoice Number and Title */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "bold", fontSize: 26, color: '#1a237e', marginBottom: 4 }}>
            Invoice No: {sale?.invoice_number || sale?.invoiceNumber || "-"}
          </div>
          <div style={{ fontWeight: "bold", fontSize: 28, letterSpacing: 1 }}>INVOICE</div>
          <div style={{ fontWeight: 400, fontSize: 16, marginTop: 8 }}>Date: {sale?.date ? new Date(sale.date).toLocaleString() : "-"}</div>
        </div>
      </div>
      <hr style={{ margin: "16px 0" }} />
      {/* Bill To and Customer Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Bill to :</div>
          <div style={{ border: "1px solid #888", padding: 8, minWidth: 200, fontWeight: "bold" }}>{customer?.customer_name || "CUSTOMER"}</div>
          {customer?.address && <div style={{ fontSize: 14, marginTop: 2 }}>{customer.address}</div>}
          {customer?.vat_number && <div style={{ fontSize: 14 }}>VAT No: {customer.vat_number}</div>}
        </div>
      </div>
      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 15 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "left" }}>Product</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>Qty</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>U.Price</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td style={{ border: "1px solid #888", padding: 4 }}>
                <div>{item.productName || item.description || "-"}</div>
                {item.notes && (
                  <div style={{ fontSize: "12px", color: "#666", fontStyle: "italic", marginTop: "2px" }}>{item.notes}</div>
                )}
              </td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>{item.quantity}</td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>{item.unitPrice?.toFixed(2) ?? "-"}</td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>£{item.totalPrice?.toFixed(2) ?? "-"}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ border: "1px solid #888", padding: 4 }}>SUB TOTAL</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>{items.reduce((a, b) => a + (b.quantity || 0), 0)}</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>X</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>£{sale?.subtotal?.toFixed(2) ?? "-"}</td>
          </tr>
        </tbody>
      </table>
      {/* Notes and Totals */}
      <div style={{ display: "flex", marginTop: 8 }}>
        <div style={{ flex: 2, fontSize: 13, color: "#888", fontStyle: "italic", border: "1px solid #888", borderTop: "none", padding: 8 }}>
          {notes?.split("\n").map((line, i) => <div key={i}>{line}</div>)}
        </div>
        <div style={{ flex: 1, border: "1px solid #888", borderLeft: "none", fontSize: 15 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
            <span>Vat</span><span>£{sale?.vat_amount?.toFixed(2) ?? "0.00"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
            <span>Porterage</span><span>£{sale?.porterage?.toFixed(2) ?? "0.00"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4, fontWeight: "bold" }}>
            <span>TOTAL</span>
            <span>£{(sale?.total_amount ?? sale?.totalAmount ?? 0).toFixed(2)}</span>
          </div>

          {sale?.customer_type === "cash" ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
                <span>PAID</span>
                <span>
                  {(sale?.payment_mode ?? sale?.paymentMode ?? "cash")} £{(sale?.paid_amount ?? sale?.paidAmount ?? 0).toFixed(2)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
                <span>CREDIT</span>
                <span>
                  £{((sale?.total_amount ?? sale?.totalAmount ?? 0) - (sale?.paid_amount ?? sale?.paidAmount ?? 0)).toFixed(2)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
                <span>BALANCE</span>
                <span>
                  £{((sale?.total_amount ?? sale?.totalAmount ?? 0) - (sale?.paid_amount ?? sale?.paidAmount ?? 0)).toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: 13, color: "#444" }}>
        <div>Invoice Time: {sale?.date ? new Date(sale.date).toLocaleString() : "-"}</div>
        <div>Current Time: {new Date().toLocaleString()}</div>
      </div>
      <button
        onClick={() => window.print()}
        style={{ marginTop: 24, padding: "6px 18px", fontSize: 16, border: "1px solid #888", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        className="no-print"
      >
        Print
      </button>
      <button
        onClick={() => window.close()}
        style={{ marginTop: 24, marginLeft: 12, padding: "6px 18px", fontSize: 16, border: "1px solid #888", borderRadius: 4, background: "#fff", cursor: "pointer" }}
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

export default function InvoicePrintPage() {
  const [match, params] = useRoute("/print/invoice/:invoiceNumber");
  const invoiceNumber = params?.invoiceNumber;
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invoiceNumber) return;
    
    publicApiRequest("GET", `/api/sales/${invoiceNumber}/invoice`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load invoice");
        setLoading(false);
      });
  }, [invoiceNumber]);

  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (error) {
    return <div>Error: {error}</div>;
  }
  
  if (!data) {
    return <div>No data found</div>;
  }

  return <InvoiceTemplate data={data} />;
} 