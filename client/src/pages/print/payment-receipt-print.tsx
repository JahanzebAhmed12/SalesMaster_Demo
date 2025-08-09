import { useEffect, useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import logo from "@/public/printlogo.png";
import { apiRequest } from "@/lib/queryClient";
import { API_BASE_URL, useRelativeUrls } from "@/lib/config";

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

const PaymentReceiptPrint = () => {
  const [match, params] = useRoute<{ paymentId: string; paymentType: string }>("/print/payment-receipt/:paymentId/:paymentType");
  const paymentId = params?.paymentId;
  const paymentType = params?.paymentType;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [location] = useLocation();
  const [showOutstandingBalance, setShowOutstandingBalance] = useState<boolean>(true);
  const [invoiceFooter, setInvoiceFooter] = useState<string>("");

  useEffect(() => {
    if (!paymentId) return;
    
    // Fetch payment data instead of sale data
    apiRequest("GET", `/api/payments/batch/${paymentId}`)
      .then(async (res) => {
        // Get customer details from the first payment
        if (res.payments && res.payments.length > 0) {
          const customerId = res.payments[0].customerId;
          const customerResponse = await apiRequest("GET", `/api/customers/${customerId}`);
          res.customer = customerResponse;
        }
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError("Failed to load payment receipt");
        setLoading(false);
      });
  }, [paymentId]);

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
  const { payments, totalAmount, customer } = data;
  const paymentDate = payments?.[0]?.paymentDate;

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
            Receipt No: {paymentId || "-"}
          </div>
          <div style={{ fontWeight: "bold", fontSize: 28, letterSpacing: 1 }}>PAYMENT RECEIPT</div>
          <div style={{ fontWeight: 400, fontSize: 16, marginTop: 8 }}>Date: {paymentDate ? new Date(paymentDate).toLocaleDateString() : todayStr}</div>
        </div>
      </div>
      <hr style={{ margin: "16px 0" }} />
      
      {/* Bill To and Customer Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Bill to :</div>
          <div style={{ border: "1px solid #888", padding: 8, minWidth: 200, fontWeight: "bold" }}>
            {customer?.customer_name || customer?.customerName || payments?.[0]?.customerName || "CUSTOMER"}
          </div>
          {customer?.address && <div style={{ fontSize: 14, marginTop: 2 }}>{customer.address}</div>}
          {customer?.vat_number && <div style={{ fontSize: 14 }}>VAT No: {customer.vat_number}</div>}
          <div style={{ fontSize: 14, marginTop: 2 }}><b>Account No:</b> C-{customer?.id || payments?.[0]?.customerId || ''}</div>
        </div>
      </div>
      
      {/* Payment Details Table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 15 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "left" }}>Qty</th>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "left" }}>Description</th>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "right" }}>Unit Price</th>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {payments?.map((payment: any, idx: number) => (
            <tr key={idx}>
              <td style={{ border: "1px solid #888", padding: 4 }}>1</td>
              <td style={{ border: "1px solid #888", padding: 4 }}>
                <div>{payment.paymentMode === 'cash' ? 'Cash Payment' : 'Card Payment'}</div>
                {payment.invoiceNumber && (
                  <div style={{ fontSize: 12, color: '#666' }}>Inv: {payment.invoiceNumber}</div>
                )}
              </td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "right" }}>£{payment.amount.toFixed(2)}</td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "right" }}>£{payment.amount.toFixed(2)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: "bold", background: "#f5f5f5" }}>
            <td style={{ border: "1px solid #888", padding: 4 }} colSpan={3}>TOTAL PAID</td>
            <td style={{ border: "1px solid #888", padding: 4, textAlign: "right" }}>£{totalAmount?.toFixed(2) || "0.00"}</td>
          </tr>
        </tbody>
      </table>
      
      {/* Notes and Totals */}
      <div style={{ display: "flex", marginTop: 8 }}>
        <div style={{ flex: 2, fontSize: 13, color: "#888", fontStyle: "italic", border: "1px solid #888", borderTop: "none", padding: 8 }}>
          <div style={{ fontWeight: "bold", fontSize: 16, color: "#1a237e", textAlign: "center" }}>
            Thanks for payment
          </div>
          {payments?.length > 1 && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              Payment covers {payments.length} invoice{payments.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
        <div style={{ flex: 1, border: "1px solid #888", borderLeft: "none", fontSize: 15 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
            <span>Subtotal</span><span>£{totalAmount?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4 }}>
            <span>VAT</span><span>£0.00</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4, fontWeight: "bold" }}>
            <span>TOTAL</span>
            <span>£{totalAmount?.toFixed(2) || "0.00"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 4, fontWeight: "bold", background: "#e8f4fd" }}>
            <span>PAID</span>
            <span>£{totalAmount?.toFixed(2) || "0.00"}</span>
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
        <div>Payment Time: {paymentDate ? new Date(paymentDate).toLocaleString() : "-"}</div>
        <div>Current Time: {new Date().toLocaleString()}</div>
        <div>Payment ID: {paymentId}</div>
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