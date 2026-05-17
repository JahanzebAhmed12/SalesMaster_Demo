import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import logo from "@/public/printlogo.png";
import { API_BASE_URL, useRelativeUrls } from "@/lib/config";

const publicApiRequest = async <T = any>(method: string, endpoint: string): Promise<T> => {
  const url = useRelativeUrls() ? endpoint : `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
};

export default function SupplierPaymentReceiptPrint() {
  const [match, params] = useRoute<{ paymentId: string }>("/print/supplier-payment-receipt/:paymentId");
  const paymentId = params?.paymentId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!paymentId) { setError("No payment ID provided"); setLoading(false); return; }
    publicApiRequest("GET", `/api/supplier-payments/${paymentId}`)
      .then((res) => { setData(res); setLoading(false); })
      .catch((err) => { setError(err.message || "Failed to load payment"); setLoading(false); });
  }, [paymentId]);

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (error) return <div style={{ padding: 24, color: "red" }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 24 }}>No data found</div>;

  const { payment, supplier, company } = data;

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    try { return new Date(d).toLocaleDateString("en-GB"); } catch { return d; }
  };

  const formatAmount = (n: number | null) =>
    `£${(n || 0).toFixed(2)}`;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 32 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontWeight: "bold", fontSize: 18 }}>{company?.companyName || "Company"}</div>
          <div style={{ fontSize: 13, color: "#555" }}>{company?.address1}{company?.address2 ? `, ${company.address2}` : ""}</div>
          {company?.vatNo && <div style={{ fontSize: 12, color: "#555" }}>VAT No: {company.vatNo}</div>}
          {company?.compRegNo && <div style={{ fontSize: 12, color: "#555" }}>Reg No: {company.compRegNo}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <img src={logo} alt="Logo" style={{ height: 60, marginBottom: 4 }} />
          <div style={{ fontWeight: "bold", fontSize: 20, color: "#1a237e" }}>PAYMENT RECEIPT</div>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {/* Receipt details */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Paid To:</div>
          <div style={{ border: "1px solid #888", padding: "8px 12px", minWidth: 180 }}>
            <div style={{ fontWeight: "bold" }}>{supplier?.supplier_name || "Supplier"}</div>
            {supplier?.address && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{supplier.address}</div>}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13 }}>Receipt No: <strong>{payment?.id}</strong></div>
          <div style={{ fontSize: 13 }}>Date: <strong>{formatDate(payment?.paymentDate)}</strong></div>
          {payment?.supplierInvoiceNumber && (
            <div style={{ fontSize: 13 }}>Supplier Invoice: <strong>{payment.supplierInvoiceNumber}</strong></div>
          )}
          {payment?.supplierInvoiceDate && (
            <div style={{ fontSize: 13 }}>Invoice Date: <strong>{formatDate(payment.supplierInvoiceDate)}</strong></div>
          )}
        </div>
      </div>

      {/* Payment details table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 14 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ border: "1px solid #888", padding: 8, textAlign: "left" }}>Description</th>
            <th style={{ border: "1px solid #888", padding: 8, textAlign: "center" }}>Payment Mode</th>
            <th style={{ border: "1px solid #888", padding: 8, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #888", padding: 8 }}>
              {payment?.remarks || `Payment to ${supplier?.supplier_name || "Supplier"}`}
              {payment?.purchaseInvoiceId && (
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                  Invoice #{payment.purchaseInvoiceId}
                </div>
              )}
            </td>
            <td style={{ border: "1px solid #888", padding: 8, textAlign: "center" }}>
              {payment?.paymentMode || "CASH"}
            </td>
            <td style={{ border: "1px solid #888", padding: 8, textAlign: "right", fontWeight: "bold" }}>
              {formatAmount(payment?.amount)}
            </td>
          </tr>
          <tr style={{ fontWeight: "bold", background: "#f5f5f5" }}>
            <td style={{ border: "1px solid #888", padding: 8 }} colSpan={2}>TOTAL PAID</td>
            <td style={{ border: "1px solid #888", padding: 8, textAlign: "right", fontSize: 16 }}>
              {formatAmount(payment?.amount)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ marginTop: 32, fontSize: 12, color: "#666" }}>
        <div>Generated: {new Date().toLocaleString("en-GB")}</div>
        {company?.bankDetails && <div style={{ marginTop: 4 }}>{company.bankDetails}</div>}
      </div>

      <button
        onClick={() => window.print()}
        style={{ marginTop: 24, padding: "8px 20px", fontSize: 14, border: "1px solid #888", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        className="no-print"
      >
        Print
      </button>
      <button
        onClick={() => window.close()}
        style={{ marginTop: 24, marginLeft: 12, padding: "8px 20px", fontSize: 14, border: "1px solid #888", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        className="no-print"
      >
        Close
      </button>

      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>
    </div>
  );
}
