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
    if (!paymentId) {
      setError('No payment ID provided');
      setLoading(false);
      return;
    }

    const fetchPayment = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch payment data and company details
        const [paymentRes, companyRes] = await Promise.all([
          apiRequest("GET", `/api/payments/batch/${paymentId}`),
          publicApiRequest("GET", "/api/company-details")
        ]);
        
        console.log('Payment data:', paymentRes);
        
        // Customer data is already included in the response
        // Add company details to the response
        paymentRes.company = companyRes;
        
        setData(paymentRes);
      } catch (err) {
        console.error('Error fetching payment:', err);
        setError(err instanceof Error ? err.message : 'Failed to load payment receipt');
      } finally {
        setLoading(false);
      }
    };

    fetchPayment();
  }, [paymentId]);

  useEffect(() => {
    apiRequest("GET", "/api/settings").then((settings) => {
      setShowOutstandingBalance(!!settings.showOutstandingBalance);
      setInvoiceFooter(settings.invoiceFooter || "");
    });
  }, []);

  if (loading) return <div className="p-4 print:hidden">Loading payment receipt...</div>;
  if (error) return <div className="p-4 print:hidden text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-4 print:hidden">No payment found.</div>;

  const todayStr = new Date().toLocaleDateString();
  const { payments, totalAmount, customer } = data;
  const paymentDate = payments?.[0]?.paymentDate;

  // Aggregate payments by method (same logic as dot-matrix-payment.tsx)
  const paymentMethodTotals = (payments || []).reduce((acc: Record<string, number>, p: any) => {
    const method = p.paymentMode?.toLowerCase() === 'bank' ? 'card' : (p.paymentMode || 'other');
    acc[method] = (acc[method] || 0) + p.amount;
    return acc;
  }, {} as Record<string, number>);

  const methodLabels: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque'
  };

  const methodRows = (Object.entries(paymentMethodTotals) as [string, number][])
    .filter(([, amount]) => amount > 0)
    .map(([method, amount]) => ({
      label: methodLabels[method] || method,
      amount
    }));

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
        </div>
        {/* Logo on Right */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <img src={logo} alt="Logo" style={{ height: 80, marginBottom: 8 }} />
          <div style={{ fontWeight: "bold", fontSize: 28, letterSpacing: 1 }}>PAYMENT RECEIPT</div>
        </div>
      </div>
      <hr style={{ margin: "16px 0" }} />
      
      {/* Bill To and Receipt Details Side by Side */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        {/* Bill To Section - Left Side */}
        <div>
          <div style={{ fontWeight: "bold", marginBottom: 4 }}>Bill to :</div>
          <div style={{ border: "1px solid #888", padding: 8, minWidth: 200 }}>
            <div style={{ fontWeight: "bold" }}>{customer?.customer_name || customer?.customerName || payments?.[0]?.customerName || "CUSTOMER"}</div>
            {customer?.address && <div style={{ fontSize: 14, marginTop: 2 }}>{customer.address}</div>}
          </div>
          {customer?.vat_number && <div style={{ fontSize: 14, marginTop: 2 }}>VAT No: {customer.vat_number}</div>}
          <div style={{ fontSize: 14, marginTop: 2 }}><b>Account No:</b> C-{customer?.id || ''}</div>
        </div>

        {/* Receipt Details - Right Side */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 400, fontSize: 16 }}>Date: {todayStr}</div>
          <div style={{ fontWeight: "bold", fontSize: 18, color: '#1a237e', marginTop: 4 }}>
            Receipt No: {paymentId || "-"}
          </div>
          <div style={{ fontSize: 14, marginTop: 4 }}>Payment Receipt</div>
        </div>
      </div>
      
      {/* Payment Details Table - aggregated by method */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16, fontSize: 15 }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "left" }}>Payment Method</th>
            <th style={{ border: "1px solid #888", padding: 4, textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {methodRows.map((row, idx) => (
            <tr key={idx}>
              <td style={{ border: "1px solid #888", padding: 4 }}>{row.label}</td>
              <td style={{ border: "1px solid #888", padding: 4, textAlign: "right" }}>£{row.amount.toFixed(2)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ border: "1px solid #888", padding: 4 }}>TOTAL</td>
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
          {payments?.[0]?.remarks && (
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: "bold", color: "#333" }}>
              Remarks: {payments[0].remarks}
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
          .footer-text {
            position: fixed;
            bottom: 10px;
            right: 10px;
            font-size: 8px;
            color: #666;
          }
        }
      `}</style>
      
      {/* Footer text for print */}
      <div className="footer-text">stand 100</div>
    </div>
  );
};

export default PaymentReceiptPrint;