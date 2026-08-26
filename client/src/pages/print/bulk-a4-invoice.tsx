import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import logo from "@/public/printlogo.png";
import { getApiUrl } from "@/lib/config";
import { formatQuantity } from "@/lib/utils";
import { getBulkPrintInvoiceNumbers } from "@/lib/bulk-print";

interface InvoiceItem {
  id?: number;
  productName?: string;
  description?: string;
  notes?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  highlighted?: boolean;
}

interface InvoiceData {
  company?: {
    companyName?: string;
    address1?: string;
    address2?: string;
    compRegNo?: string;
    vatNo?: string;
    email?: string;
  };
  customer?: {
    customer_name?: string;
    customerName?: string;
    address?: string;
    vat_number?: string;
    vatNumber?: string;
  };
  sale?: {
    invoice_number?: string;
    invoiceNumber?: string;
    date?: string;
    subtotal?: number;
    vat_amount?: number;
    vatAmount?: number;
    porterage?: number;
    total_amount?: number;
    totalAmount?: number;
    paid_amount?: number;
    paidAmount?: number;
    payment_mode?: string;
    paymentMode?: string;
    customer_type?: string;
    customerType?: string;
    gate_number?: string;
    gateNumber?: string;
  };
  items?: InvoiceItem[];
  invoiceFooter?: string;
}

const publicApiRequest = async <T = unknown>(endpoint: string): Promise<T> => {
  const response = await fetch(getApiUrl(endpoint), {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const responseData = await response.json();
  if (!response.ok) {
    throw new Error(responseData.message || responseData.error || `HTTP error! status: ${response.status}`);
  }
  return responseData as T;
};

function InvoiceDocument({ data }: { data: InvoiceData }) {
  const company = data.company || {};
  const customer = data.customer || {};
  const sale = data.sale || {};
  const items = data.items || [];
  const invoiceNumber = sale.invoice_number || sale.invoiceNumber || "-";
  const subtotal = Number(sale.subtotal || 0);
  const vatAmount = Number(sale.vat_amount ?? sale.vatAmount ?? 0);
  const porterage = Number(sale.porterage || 0);
  const totalAmount = Number(sale.total_amount ?? sale.totalAmount ?? 0);
  const paidAmount = Number(sale.paid_amount ?? sale.paidAmount ?? 0);

  return (
    <article className="bulk-a4-invoice">
      <div className="invoice-header">
        <div>
          <div className="company-name">{company.companyName || "Company Name"}</div>
          <div>{company.address1}{company.address2 ? `, ${company.address2}` : ""}</div>
          {company.compRegNo && <div>Company Reg No: {company.compRegNo}</div>}
          {company.vatNo && <div>VAT No: {company.vatNo}</div>}
          {company.email && <div>{company.email}</div>}
        </div>
        <img src={logo} alt="Logo" className="invoice-logo" />
      </div>

      <hr />
      <div className="invoice-title">INVOICE</div>

      <div className="billing-grid">
        <div>
          <div className="section-label">Bill to :</div>
          <div className="customer-box">
            <strong>{customer.customer_name || customer.customerName || "CUSTOMER"}</strong>
            {customer.address && <div>{customer.address}</div>}
          </div>
          {(customer.vat_number || customer.vatNumber) && <div>VAT No: {customer.vat_number || customer.vatNumber}</div>}
          {(sale.gate_number || sale.gateNumber) && <div className="gate-number">Others/Gate: {sale.gate_number || sale.gateNumber}</div>}
        </div>
        <div className="invoice-meta">
          <div>Date: {sale.date ? new Date(sale.date).toLocaleDateString() : new Date().toLocaleDateString()}</div>
          <div className="invoice-number">Invoice No: {invoiceNumber}</div>
          <div>Cust_type: {sale.payment_mode || sale.paymentMode || sale.customer_type || sale.customerType || "account"}</div>
        </div>
      </div>

      <table className="invoice-items">
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>U.Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id || index} className={item.highlighted ? "highlighted-row" : undefined}>
              <td>
                {item.productName || item.description || "-"}
                {item.notes && <span className="item-notes"> - {item.notes}</span>}
              </td>
              <td>{formatQuantity(Number(item.quantity || 0))}</td>
              <td>{Number(item.unitPrice || 0).toFixed(2)}</td>
              <td>£{Number(item.totalPrice || 0).toFixed(2)}</td>
            </tr>
          ))}
          <tr className="subtotal-row">
            <td>SUB TOTAL</td>
            <td>{formatQuantity(items.reduce((sum, item) => sum + Number(item.quantity || 0), 0))}</td>
            <td>X</td>
            <td>£{subtotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div className="totals-grid">
        <div className="invoice-notes">{data.invoiceFooter || ""}</div>
        <div className="totals-box">
          {vatAmount > 0 && <div><span>Vat</span><span>£{vatAmount.toFixed(2)}</span></div>}
          {porterage > 0 && <div><span>Porterage</span><span>£{porterage.toFixed(2)}</span></div>}
          <div className="grand-total"><span>TOTAL</span><span>£{totalAmount.toFixed(2)}</span></div>
          {(sale.customer_type === "cash" || sale.customerType === "cash") && paidAmount > 0 && (
            <div><span>PAID</span><span>£{paidAmount.toFixed(2)}</span></div>
          )}
        </div>
      </div>

      <div className="invoice-footer">
        <div>Invoice Time: {sale.date ? new Date(sale.date).toLocaleString() : "-"}</div>
        <div>Current Time: {new Date().toLocaleString()}</div>
      </div>
    </article>
  );
}

export default function BulkA4InvoicePrintPage() {
  const search = useSearch();
  const invoiceNumbers = useMemo(() => getBulkPrintInvoiceNumbers(search), [search]);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (invoiceNumbers.length === 0) {
      setError("No invoices selected");
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      const results = await Promise.all(invoiceNumbers.map(async invoiceNumber => {
        try {
          return await publicApiRequest<InvoiceData>(`/api/sales/${encodeURIComponent(invoiceNumber)}/invoice`);
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const validInvoices = results.filter((invoice): invoice is InvoiceData => invoice !== null);
      setInvoices(validInvoices);
      setFailedCount(results.length - validInvoices.length);
      if (validInvoices.length === 0) setError("No selected invoices could be loaded");
      setLoading(false);
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [invoiceNumbers]);

  useEffect(() => {
    if (!loading && invoices.length > 0) {
      const timer = window.setTimeout(() => window.print(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [loading, invoices.length]);

  if (loading) return <div className="p-4">Loading A4 invoices...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  return (
    <div className="bulk-a4-print-page">
      <style>{`
        .bulk-a4-print-page { min-height: 100vh; background: #f3f4f6; }
        .bulk-a4-toolbar { padding: 16px; background: #f3f4f6; }
        .bulk-a4-toolbar button { padding: 8px 16px; border: 1px solid #9ca3af; border-radius: 4px; background: #fff; cursor: pointer; }
        .bulk-a4-invoice { box-sizing: border-box; max-width: 794px; min-height: 1080px; margin: 0 auto 20px; padding: 28px; background: #fff; font-family: Arial, sans-serif; color: #111; }
        .invoice-header, .billing-grid, .totals-grid { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
        .invoice-header { font-size: 13px; line-height: 1.35; }
        .company-name { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
        .invoice-logo { width: 120px; height: auto; object-fit: contain; }
        .invoice-title { text-align: right; font-size: 20px; margin: 8px 0; }
        .billing-grid { margin-bottom: 10px; font-size: 13px; }
        .section-label { font-weight: 700; margin-bottom: 4px; }
        .customer-box { min-width: 240px; border: 1px solid #ccc; padding: 8px; line-height: 1.35; }
        .gate-number { margin-top: 4px; font-size: 15px; font-weight: 700; }
        .invoice-meta { text-align: right; line-height: 1.6; }
        .invoice-number { color: #1a237e; font-weight: 700; }
        .invoice-items { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
        .invoice-items th, .invoice-items td { border: 1px solid #ccc; padding: 5px 6px; }
        .invoice-items th { background: #f5f5f5; text-align: center; }
        .invoice-items th:first-child, .invoice-items td:first-child { text-align: left; }
        .invoice-items th:not(:first-child), .invoice-items td:not(:first-child) { text-align: center; }
        .highlighted-row td { background: #fff3a3 !important; }
        .item-notes { font-size: 11px; font-style: italic; color: #555; }
        .subtotal-row { font-weight: 700; }
        .totals-grid { margin-top: 0; }
        .invoice-notes { flex: 2; min-height: 70px; border: 1px solid #ccc; border-top: none; padding: 6px; white-space: pre-line; font-size: 11px; color: #666; font-style: italic; }
        .totals-box { flex: 1; border: 1px solid #ccc; border-top: none; padding: 0 6px; font-size: 13px; }
        .totals-box > div { display: flex; justify-content: space-between; padding: 5px 0; }
        .grand-total { font-weight: 700; font-size: 15px; }
        .invoice-footer { margin-top: 18px; text-align: right; color: #444; font-size: 11px; line-height: 1.5; }
        @media print {
          @page { size: A4; margin: 10mm; }
          .bulk-a4-toolbar { display: none !important; }
          .bulk-a4-print-page { background: #fff; }
          .bulk-a4-invoice { max-width: none; min-height: 0; margin: 0; padding: 0; page-break-after: always; break-after: page; }
          .bulk-a4-invoice:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
      <div className="bulk-a4-toolbar">
        <strong>{invoices.length} A4 invoice(s) loaded.</strong>
        {failedCount > 0 && <span> {failedCount} selected invoice(s) could not be loaded.</span>}
        <button type="button" onClick={() => window.print()}>Print Now</button>
      </div>
      {invoices.map((invoice, index) => <InvoiceDocument key={`${invoice.sale?.invoiceNumber || invoice.sale?.invoice_number}-${index}`} data={invoice} />)}
    </div>
  );
}
