import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import logo from "@/public/printlogo.png";
import { getApiUrl } from "@/lib/config";
import { formatQuantity } from "@/lib/utils";

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

interface InvoiceData {
  company: any;
  customer: any;
  sale: any;
  items: any[];
}

function DeliveryNoteTemplate({ data }: { data: InvoiceData }) {
  const [deliveryNoteWithPrice, setDeliveryNoteWithPrice] = useState(false);
  const [showNameOnDeliveryNote, setShowNameOnDeliveryNote] = useState('name');
  const [deliveryAcknowledgement, setDeliveryAcknowledgement] = useState(false);
  // const normalizedEndpoint = endpoint.replace(/^\/api/, '');
  // const url = `/api${normalizedEndpoint}`;
  useEffect(() => {
    
    fetch(getApiUrl('/api/settings'))
      .then(res => res.json())
      .then(settings => {
        setDeliveryNoteWithPrice(!!settings.deliveryNoteWithPrice);
        setShowNameOnDeliveryNote(settings.deliveryNoteNameOrCode || 'name');
        setDeliveryAcknowledgement(!!settings.deliveryAcknowledgement);
      });
  }, []);
  if (!data) return null;
  const { company, customer, sale, items } = data;
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 24 }}>
      {/* Header: Logo and Company Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <img src={logo} alt="Logo" style={{ height: 60, marginBottom: 8 }} />
          <div style={{ fontWeight: "bold", fontSize: 24 }}>{company?.companyName || "Company Name"}</div>
          <div style={{ fontSize: 16 }}>{company?.address1}{company?.address2 ? ", " + company.address2 : ""}</div>
          {company?.compRegNo && <div style={{ fontSize: 14 }}>Comp.Reg.No: {company.compRegNo} VAT No: {company.vatNo}</div>}
          {company?.telephone && <div style={{ fontSize: 14 }}>T: {company.telephone}{company?.mobile ? ` | M: ${company.mobile}` : ""}</div>}
          {company?.email && <div style={{ fontSize: 14 }}>E: {company.email}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "bold", fontSize: 28, color: '#1a237e', marginBottom: 4 }}>DELIVERY NOTE</div>
          <div style={{ fontWeight: 400, fontSize: 18, marginTop: 8 }}>Date: {sale?.date ? new Date(sale.date).toLocaleDateString() : "-"}</div>
          <div style={{ fontWeight: 400, fontSize: 18 }}>Invoice No: {sale?.invoice_number || sale?.invoiceNumber || "-"}</div>
          <div style={{ fontWeight: 400, fontSize: 18 }}>Customer type: {sale?.customer_type || sale?.customerType || "-"}</div>
          {/* Show customer name or code based on setting */}
          <div style={{ fontWeight: "bold", fontSize: 18 }}>
            {showNameOnDeliveryNote === 'name' ? customer?.customer_name : customer?.customer_code}
          </div>
        </div>
      </div>
      <hr style={{ margin: "16px 0" }} />
      {/* Customer Info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Customer :</div>
        <div style={{ border: "1px solid #888", padding: 8, minWidth: 200, fontWeight: "bold", fontSize: 18 }}>{customer?.customer_name || "CUSTOMER"}</div>
        {customer?.address && <div style={{ fontSize: 16, marginTop: 2 }}>{customer.address}</div>}
        {customer?.vat_number && <div style={{ fontSize: 14 }}>VAT No: {customer.vat_number}</div>}
      </div>
      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 18 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ border: "1px solid #888", padding: 8, textAlign: "left", fontSize: 20 }}>Qty</th>
            <th style={{ border: "1px solid #888", padding: 8, fontSize: 20 }}>Product</th>
            {deliveryNoteWithPrice && <th style={{ border: "1px solid #888", padding: 8, fontSize: 20 }}>U.Price</th>}
            {deliveryNoteWithPrice && <th style={{ border: "1px solid #888", padding: 8, fontSize: 20 }}>Total</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id || idx}>
              <td style={{ border: "1px solid #888", padding: 8, textAlign: "center", fontWeight: 600, fontSize: 20 }}>{formatQuantity(item.quantity)}</td>
              <td style={{ border: "1px solid #888", padding: 8, fontSize: 18 }}>{item.productName || item.description || "-"}</td>
              {deliveryNoteWithPrice && <td style={{ border: "1px solid #888", padding: 8, textAlign: "center", fontSize: 18 }}>{item.unitPrice?.toFixed(2) ?? "-"}</td>}
              {deliveryNoteWithPrice && <td style={{ border: "1px solid #888", padding: 8, textAlign: "center", fontSize: 18 }}>£{item.totalPrice?.toFixed(2) ?? "-"}</td>}
            </tr>
          ))}
          <tr style={{ fontWeight: "bold", background: "#f5f5f5" }}>
            <td style={{ border: "1px solid #888", padding: 8, textAlign: "center", fontSize: 20 }}>{formatQuantity(items.reduce((a, b) => a + (b.quantity || 0), 0))}</td>
            <td style={{ border: "1px solid #888", padding: 8, fontSize: 18 }}>{items.length} Items</td>
            {deliveryNoteWithPrice && <td style={{ border: "1px solid #888", padding: 8, fontSize: 18 }}></td>}
            {deliveryNoteWithPrice && <td style={{ border: "1px solid #888", padding: 8, fontSize: 18 }}></td>}
          </tr>
        </tbody>
      </table>
      {/* Footer: Invoice Time and Current Time */}
      <div style={{ marginTop: 24, fontSize: 16, color: "#444", display: "flex", justifyContent: "flex-end", flexDirection: "column", alignItems: "flex-end" }}>
        <div>Invoice Time: {sale?.date ? new Date(sale.date).toLocaleString() : "-"}</div>
        <div>Current Time: {new Date().toLocaleString()}</div>
      </div>
      {/* Delivery acknowledgement section */}
      {deliveryAcknowledgement && (
        <div style={{ marginTop: 32, fontWeight: "bold" }}>
          Received in good condition by: _______________________
        </div>
      )}
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

export default function DeliveryNotePrintPage() {
  const [match, params] = useRoute("/print/delivery-note/:invoiceNumber");
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
        setError("Failed to load delivery note");
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
  return <DeliveryNoteTemplate data={data} />;
} 