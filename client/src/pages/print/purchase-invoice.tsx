import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import logo from "@/public/printlogo.png";
import { apiRequest } from "@/lib/queryClient";

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

interface PurchaseInvoiceData {
  company: any;
  supplier: any;
  invoice: any;
  items: any[];
  notes: string;
}

function PurchaseInvoiceTemplate({ data }: { data: PurchaseInvoiceData }) {
  if (!data) return null;
  const { company, supplier, invoice, items, notes } = data;
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 24 }}>
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
            P.INVOICE
          </div>
          <div style={{ fontWeight: 400, fontSize: 16, marginTop: 8 }}>Date: {invoice?.date ? new Date(invoice.date).toLocaleDateString() : "-"}</div>
          <div style={{ fontWeight: 400, fontSize: 16 }}>Invoice No: {invoice?.id ?? "-"}</div>
          <div style={{ fontWeight: 400, fontSize: 16 }}>Our Ref No: {invoice?.refNumber ?? "-"}</div>
        </div>
      </div>
      <hr style={{ margin: "16px 0" }} />
      {/* Supplier Info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Supplier :</div>
        <div style={{ border: "1px solid #888", padding: 8, minWidth: 200, fontWeight: "bold" }}>{supplier?.supplier_name || "SUPPLIER"}</div>
        {supplier?.address && <div style={{ fontSize: 14, marginTop: 2 }}>{supplier.address}</div>}
        {supplier?.vat_number && <div style={{ fontSize: 14 }}>VAT No: {supplier.vat_number}</div>}
      </div>
      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 15 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "left" }}>Product</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>Quantity</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>Unit Price</th>
            <th style={{ border: "1px solid #888", padding: 4 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td style={{ border: "1px solid #888", padding: 4 }}>{item.productName || item.description || "-"}</td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>{item.quantity}</td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>{item.unitPrice?.toFixed(2) ?? "-"}</td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>{item.totalPrice?.toFixed(2) ?? "-"}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ border: "1px solid #888", padding: 4 }}>TOTAL</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>{items.reduce((a, b) => a + (b.quantity || 0), 0)}</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>X</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>{items.reduce((a, b) => a + (b.totalPrice || 0), 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      {/* Notes */}
      {notes && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#888", fontStyle: "italic", border: "1px solid #888", borderTop: "none", padding: 8 }}>
          {notes.split("\n").map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: 13, color: "#444" }}>
        <div>Invoice Time: {invoice?.date ? new Date(invoice.date).toLocaleString() : "-"}</div>
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

export default function PurchaseInvoicePrintPage() {
  const [match, params] = useRoute("/print/purchase-invoice/:invoiceId");
  const invoiceId = params?.invoiceId;
  const [data, setData] = useState<PurchaseInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taxDetails, setTaxDetails] = useState({ withTax: false, taxPercentage: '0' });

  useEffect(() => {
    if (!invoiceId) return;
    publicApiRequest("GET", `/api/purchase-invoices/${invoiceId}/print`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load purchase invoice");
        setLoading(false);
      });
  }, [invoiceId]);

  useEffect(() => {
    apiRequest("GET", "/api/settings").then(settings => {
      setTaxDetails({
        withTax: !!settings.withTax,
        taxPercentage: settings.taxPercentage ? String(settings.taxPercentage) : '0',
      });
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
  return <PurchaseInvoiceTemplate data={data} />;
} 