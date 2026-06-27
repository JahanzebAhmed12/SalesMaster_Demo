import { useEffect, useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import logo from "@/public/printlogo.png";
import { apiRequest } from "@/lib/queryClient";
import { API_BASE_URL, useRelativeUrls } from "@/lib/config";
import { formatQuantity } from "@/lib/utils";

const publicApiRequest = async <T = any>(method: string, endpoint: string): Promise<T> => {
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

export default function A5InvoicePrintPage() {
  const [, params] = useRoute<{ invoiceNumber: string }>("/print/a5-invoice/:invoiceNumber");
  const invoiceNumber = params?.invoiceNumber;
  const [data, setData] = useState<any>(null);
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
    <div className="invoice-container" style={{ maxWidth: 460, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 16 }}>
      {/* Header: Company Details and Logo */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div style={{ fontWeight: "bold", fontSize: 14 }}>{data.company?.companyName || "Company Name"}</div>
          <div style={{ fontSize: 10 }}>{data.company?.address1}{data.company?.address2 ? ", " + data.company.address2 : ""}</div>
          {data.company?.compRegNo && <div style={{ fontSize: 10 }}>Company Reg No: {data.company.compRegNo}</div>}
          {data.company?.vatNo && <div style={{ fontSize: 10 }}>VAT No: {data.company.vatNo}</div>}
          {data.company?.email && <div style={{ fontSize: 10 }}>{data.company.email}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <img src={logo} alt="Logo" style={{ height: 50, marginBottom: 4 }} />
        </div>
      </div>
      <hr style={{ margin: "4px 0" }} />
      <div style={{ fontWeight: 400, fontSize: 12, textAlign: "right", marginBottom: 4 }}>INVOICE</div>

      {/* Bill To and Invoice Details Side by Side */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <div style={{ fontWeight: "bold", fontSize: 11, marginBottom: 2 }}>Bill to :</div>
          <div style={{ border: "1px solid #ccc", padding: 6, minWidth: 160 }}>
            <div style={{ fontWeight: "bold", fontSize: 11 }}>{data.customer?.customer_name || "CUSTOMER"}</div>
            {data.customer?.address && <div style={{ fontSize: 10, marginTop: 1 }}>{data.customer.address}</div>}
          </div>
          {data.customer?.vat_number && <div style={{ fontSize: 10, marginTop: 2 }}>VAT No: {data.customer.vat_number}</div>}
          {data.sale?.gateNumber && <div style={{ fontSize: 12, marginTop: 2, fontWeight: "bold" }}>Others/Gate: {data.sale.gateNumber}</div>}
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 400, fontSize: 11 }}>Date: {data.sale?.date ? new Date(data.sale.date).toLocaleDateString() : new Date().toLocaleDateString()}</div>
          <div style={{ fontWeight: "bold", fontSize: 13, color: '#1a237e', marginTop: 2 }}>
            Invoice No: {data.sale?.invoice_number || data.sale?.invoiceNumber || "-"}
          </div>
          <div style={{ fontSize: 10, marginTop: 2 }}>Cust_type: {data.sale?.paymentMode || data.sale?.payment_mode || data.sale?.customer_type || "account"}</div>
          {backdate && (
            <div style={{ fontSize: 10, color: '#1a237e', fontWeight: 'bold', marginTop: 2 }}>Backdate payment for {backdate}</div>
          )}
        </div>
      </div>

      {/* Items Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4, fontSize: 10 }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "left" }}>Product</th>
            <th style={{ border: "1px solid #ccc", padding: "1px 4px", width: 35 }}>Qty</th>
            <th style={{ border: "1px solid #ccc", padding: "1px 4px", width: 40 }}>U.Price</th>
            <th style={{ border: "1px solid #ccc", padding: "1px 4px", width: 40 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item: any, idx: number) => (
            <tr key={item.id || idx}>
              <td style={{ border: "1px solid #ccc", padding: "1px 4px", wordWrap: "break-word", wordBreak: "break-word" }}>
                {item.productName || item.description || "-"}
                {item.notes && (
                  <span style={{ fontSize: "9px", fontStyle: "italic" }}> - {item.notes}</span>
                )}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>{formatQuantity(item.quantity)}</td>
              <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>{item.unitPrice?.toFixed(2) ?? "-"}</td>
              <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>£{item.totalPrice?.toFixed(2) ?? "-"}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ border: "1px solid #ccc", padding: "1px 4px" }}>SUB TOTAL</td>
            <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>{formatQuantity(data.items.reduce((a: number, b: any) => a + (b.quantity || 0), 0))}</td>
            <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>X</td>
            <td style={{ border: "1px solid #ccc", padding: "1px 4px", textAlign: "center" }}>£{data.sale?.subtotal?.toFixed(2) ?? "-"}</td>
          </tr>
        </tbody>
      </table>

      {/* Notes and Totals */}
      <div style={{ display: "flex", marginTop: 0 }}>
        <div style={{ flex: 2, fontSize: 9, fontStyle: "italic", border: "1px solid #ccc", borderTop: "none", padding: 4 }}>
          {invoiceFooter ? invoiceFooter.split("\n").map((line: string, i: number) => <div key={i}>{line}</div>) : ""}
        </div>
        <div style={{ flex: 1, border: "1px solid #ccc", borderLeft: "none", borderTop: "none", fontSize: 10 }}>
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
        <div style={{ fontSize: 11, color: '#1a237e', fontWeight: 'bold', marginTop: 8, marginBottom: 4, textAlign: 'right' }}>Cash Paid: £{Number(data.sale?.paid_amount ?? data.sale?.paidAmount ?? 0).toFixed(2)}</div>
      )}
      {showBankPaid && (
        <div style={{ fontSize: 11, color: '#1976d2', fontWeight: 'bold', marginTop: 8, marginBottom: 4, textAlign: 'right' }}>Bank Paid: £{Number(data.sale?.paid_amount ?? data.sale?.paidAmount ?? 0).toFixed(2)}</div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 8, fontSize: 9, color: "#444", textAlign: "right" }}>
        <div>Invoice Time: {data.sale?.date ? new Date(data.sale.date).toLocaleString() : "-"}</div>
        <div>Current Time: {new Date().toLocaleString()}</div>
      </div>

      <button
        onClick={() => window.print()}
        style={{ marginTop: 16, padding: "6px 18px", fontSize: 14, border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        className="no-print"
      >
        Print
      </button>
      <button
        onClick={() => window.close()}
        style={{ marginTop: 16, marginLeft: 12, padding: "6px 18px", fontSize: 14, border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        className="no-print"
      >
        Close
      </button>

      <style>{`
        @media print {
          @page {
            size: A5 portrait;
            margin: 10mm;
          }
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
