import { useEffect, useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import logo from "@/public/printlogo.png";
import { apiRequest } from "@/lib/queryClient";

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

const PaymentReceiptPrint = () => {
  const [match, params] = useRoute<{ saleId: string; paymentType: string }>("/print/payment-receipt/:saleId/:paymentType");
  const saleId = params?.saleId;
  const paymentType = params?.paymentType;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [location] = useLocation();
  const [showOutstandingBalance, setShowOutstandingBalance] = useState<boolean>(true);
  const [invoiceFooter, setInvoiceFooter] = useState<string>("");

  useEffect(() => {
    if (!saleId) return;
    
    publicApiRequest("GET", `/api/sales/${saleId}/invoice`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load payment receipt");
        setLoading(false);
      });
  }, [saleId]);

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

  const paymentTypeDisplay = paymentType === 'card' ? 'Card' : 'Cash';
  const todayStr = new Date().toLocaleDateString();

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", fontFamily: "Arial, sans-serif", background: "#fff", padding: 24 }}>
      {/* Header: Logo and Receipt Number */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* Logo and Company Info */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <img src={logo} alt="Logo" style={{ height: 60, marginBottom: 8 }} />
          <div style={{ fontWeight: "bold", fontSize: 18 }}>{data.company?.companyName || "Company Name"}</div>
          <div style={{ fontSize: 14 }}>{data.company?.address1}{data.company?.address2 ? ", " + data.company.address2 : ""}</div>
          {data.company?.compRegNo && <div style={{ fontSize: 14 }}>Company Reg No: {data.company.compRegNo}</div>}
          {data.company?.vatNo && <div style={{ fontSize: 14 }}>VAT No: {data.company.vatNo}</div>}
        </div>
        {/* Receipt Number and Title */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: "bold", fontSize: 26, color: '#1a237e', marginBottom: 4 }}>
            Receipt No: {data.sale?.invoice_number || data.sale?.invoiceNumber || "-"}
          </div>
          <div style={{ fontWeight: "bold", fontSize: 28, letterSpacing: 1 }}>PAYMENT RECEIPT</div>
          <div style={{ fontWeight: 400, fontSize: 16, marginTop: 8 }}>Date: {todayStr}</div>
        </div>
      </div>
      <hr style={{ margin: "16px 0" }} />
      
      {/* Bill To and Customer Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Bill to :</div>
          <div style={{ border: "1px solid #888", padding: 8, minWidth: 200, fontWeight: "bold" }}>{data.customer?.customer_name || "CUSTOMER"}</div>
          {data.customer?.address && <div style={{ fontSize: 14, marginTop: 2 }}>{data.customer.address}</div>}
          {data.customer?.vat_number && <div style={{ fontSize: 14 }}>VAT No: {data.customer.vat_number}</div>}
          {data.sale?.gateNumber && <div style={{ fontSize: 14, marginTop: 2 }}><b>Others/Gate:</b> {data.sale.gateNumber}</div>}
        </div>
      </div>
      
      {/* Payment Details Table (replacing products table) */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 15 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "left" }}>Payment Type</th>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #888", padding: 4 }}>
              <div>{paymentTypeDisplay} Payment</div>
            </td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>£{(data.sale?.total_amount ?? data.sale?.totalAmount ?? 0).toFixed(2)}</td>
          </tr>
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ border: "1px solid #888", padding: 4 }}>TOTAL PAID</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "center" }}>£{(data.sale?.total_amount ?? data.sale?.totalAmount ?? 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      
      {/* Notes and Totals */}
      <div style={{ display: "flex", marginTop: 8 }}>
        <div style={{ flex: 2, fontSize: 13, color: "#888", fontStyle: "italic", border: "1px solid #888", borderTop: "none", padding: 8 }}>
          <div style={{ fontWeight: "bold", fontSize: 16, color: "#1a237e", textAlign: "center" }}>
            Thanks for payment
          </div>
        </div>
        <div style={{ flex: 1, border: "1px solid #888", borderLeft: "none", fontSize: 15 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
            <span>Vat</span><span>£{data.sale?.vat_amount?.toFixed(2) ?? "0.00"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
            <span>Porterage</span><span>£{data.sale?.porterage?.toFixed(2) ?? "0.00"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4, fontWeight: "bold" }}>
            <span>TOTAL</span>
            <span>£{(data.sale?.total_amount ?? data.sale?.totalAmount ?? 0).toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4, fontWeight: "bold", background: "#e8f4fd" }}>
            <span>PAID ({paymentTypeDisplay})</span>
            <span>£{(data.sale?.total_amount ?? data.sale?.totalAmount ?? 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      {/* Dynamic Invoice Footer */}
      {invoiceFooter && (
        <div style={{ fontSize: 15, color: '#1a237e', fontWeight: 'bold', marginTop: 16, marginBottom: 8, textAlign: 'center' }}>
          {invoiceFooter}
        </div>
      )}
      
      {/* Footer */}
      <div style={{ marginTop: 16, fontSize: 13, color: "#444" }}>
        <div>Payment Time: {data.sale?.date ? new Date(data.sale.date).toLocaleString() : "-"}</div>
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
};

export default PaymentReceiptPrint;