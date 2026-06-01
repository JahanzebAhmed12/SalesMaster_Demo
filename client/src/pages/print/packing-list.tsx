import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import logo from "@/public/printlogo.png";
import { API_BASE_URL, useRelativeUrls } from "@/lib/config";

interface PackingListItem {
  qty: number;
  weight: number;
  product: string;
  hsCode?: string;
  notes?: string;
}

interface PackingListData {
  company: any;
  customer: any;
  sale: any;
  packingItems: PackingListItem[];
}

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

function PackingListTemplate({ data }: { data: PackingListData }) {
  if (!data) return null;
  const { company, customer, sale, packingItems: items } = data;
  
  const totalItems = items.length;
  const totalBoxes = items.reduce((sum, item) => sum + (item.qty || 0), 0);
  
  // Get gate number from various possible field names
  const gateNumber = sale?.gate_number || sale?.gateNumber || customer?.gate_number || customer?.gateNumber || customer?.others;
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 24 }}>
      {/* Header: Logo and Company Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "bold", fontSize: 28, color: '#1a237e', marginBottom: 4 }}>PICKING LIST</div>
          <div style={{ fontWeight: 400, fontSize: 18, marginTop: 8 }}>Date: {sale?.date ? new Date(sale.date).toLocaleDateString() : "-"}</div>
          <div style={{ fontWeight: 400, fontSize: 18 }}>Invoice No: {sale?.invoice_number || sale?.invoiceNumber || "-"}</div>
        </div>
      </div>
      <hr style={{ margin: "16px 0" }} />
      {/* Customer Info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Customer :</div>
        <div style={{ border: "1px solid #888", padding: 8, minWidth: 200, fontWeight: "bold", fontSize: 18 }}>{customer?.customer_name || customer?.customerName || "CUSTOMER"}</div>
        {customer?.address && <div style={{ fontSize: 16, marginTop: 2 }}>{customer.address}</div>}
        {gateNumber && (
          <div style={{ fontSize: 16, marginTop: 2, fontWeight: "bold" }}>
            Gate No: {gateNumber}
          </div>
        )}
        {customer?.vat_number && <div style={{ fontSize: 14 }}>VAT No: {customer.vat_number}</div>}
      </div>
      {/* Packing List Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ padding: "1px 4px", textAlign: "center", width: "80px", fontSize: 16 }}>Qty</th>
            <th style={{ padding: "1px 4px", fontSize: 16 }}>Product</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ padding: "1px 4px", textAlign: "center", fontWeight: 600, fontSize: 16 }}>{item.qty}</td>
              <td style={{ padding: "1px 4px", fontSize: 14, textAlign: "center" }}>
                  {item.product}
                  {item.notes && (
                    <div style={{ fontSize: "12px", fontStyle: "italic" }}>{item.notes}</div>
                  )}
                </td>
            </tr>
          ))}
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ padding: "1px 4px", textAlign: "center", fontSize: 16 }}>{totalBoxes} Boxes</td>
            <td style={{ padding: "1px 4px", fontSize: 14 }}>{totalItems} Items</td>
          </tr>
        </tbody>
      </table>
      {/* Footer */}
      <div style={{ marginTop: 24 }}>
        {/* Footer content removed as requested */}
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

export default function PackingListPrintPage() {
  const [match, params] = useRoute("/print/packing-list/:invoiceNumber");
  const invoiceNumber = params?.invoiceNumber;
  const [data, setData] = useState<PackingListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invoiceNumber) return;
    publicApiRequest<PackingListData>('GET', `/api/sales/${invoiceNumber}/invoice`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load packing list");
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
  return <PackingListTemplate data={data} />;
} 