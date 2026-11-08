import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import logo from "@/public/printlogo.png";
import { getApiUrl } from "@/lib/config";
import { fetchCustomerReturnInvoices } from "@/lib/customer-return-invoice";

interface PackingListItem {
  qty: number;
  weight: number;
  product: string;
  hsCode?: string;
  notes?: string;
}

export interface PackingListData {
  company: any;
  customer: any;
  sale: any;
  packingItems: PackingListItem[];
}

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

export function PackingListTemplate({
  data,
  showActions = true,
  bulk = false,
}: {
  data: PackingListData;
  showActions?: boolean;
  bulk?: boolean;
}) {
  if (!data) return null;
  const { company, customer, sale, packingItems: items } = data;
  
  const totalItems = items.length;
  const totalBoxes = items.reduce((sum, item) => sum + (item.qty || 0), 0);
  
  // Get gate number from various possible field names
  const gateNumber = sale?.gate_number || sale?.gateNumber || customer?.gate_number || customer?.gateNumber || customer?.others;
  return (
    <div
      className={bulk ? "bulk-packing-document" : undefined}
      style={{ maxWidth: 1200, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 24 }}
    >
      {/* Header: Logo and Company Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "bold", fontSize: 28, color: '#1a237e', marginBottom: 4 }}>PICKING LIST</div>
          <div style={{ fontWeight: 400, fontSize: 18, marginTop: 8 }}>Date: {sale?.date ? new Date(sale.date).toLocaleDateString() : "-"}</div>
          <div style={{ fontWeight: 400, fontSize: 18 }}>
            {sale?.isCustomerReturn ? "Original Invoice" : "Invoice No"}: {sale?.isCustomerReturn ? sale?.originalInvoiceNumber || "-" : sale?.invoice_number || sale?.invoiceNumber || "-"}
          </div>
          {sale?.isCustomerReturn && <div style={{ fontWeight: 400, fontSize: 18 }}>Return No: {sale?.invoice_number || sale?.invoiceNumber || "-"}</div>}
        </div>
      </div>
      <hr style={{ margin: "16px 0" }} />
      {/* Customer Info */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: "bold", marginBottom: 4 }}>Customer :</div>
        <div style={{ border: "1px solid #888", padding: 8, minWidth: 200, fontWeight: "bold", fontSize: 18 }}>{customer?.customer_name || customer?.customerName || "CUSTOMER"}</div>
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
            <th style={{ padding: "1px 4px", textAlign: "left", fontSize: 16 }}>Product</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ padding: "1px 4px", textAlign: "center", fontWeight: 600, fontSize: 16 }}>{item.qty}</td>
              <td style={{ padding: "1px 4px", fontSize: 14, textAlign: "left" }}>
                  {item.product}
                  {item.notes && (
                    <span style={{ fontSize: "12px", fontStyle: "italic" }}> ({item.notes})</span>
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
      {showActions && (
        <>
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
        </>
      )}
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
  const returnId = new URLSearchParams(window.location.search).get("returnId");
  const [data, setData] = useState<PackingListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const request = returnId
      ? fetchCustomerReturnInvoices([returnId]).then(([returnData]) => {
        if (!returnData) throw new Error("Customer return not found");
        return {
          company: returnData.company,
          customer: returnData.customer,
          sale: returnData.sale,
          packingItems: returnData.items.map(item => ({
            qty: Math.abs(Number(item.quantity || 0)),
            weight: 0,
            product: String(item.productName || item.description || ""),
            notes: item.notes ? String(item.notes) : undefined,
          })),
        } as PackingListData;
      })
      : invoiceNumber
        ? publicApiRequest<PackingListData>('GET', `/api/sales/${invoiceNumber}/invoice`)
        : Promise.reject(new Error("Invoice number is missing"));
    request
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load packing list");
        setLoading(false);
      });
  }, [invoiceNumber, returnId]);

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