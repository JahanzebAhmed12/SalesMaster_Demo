import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import logo from "@/public/printlogo.png";
import { getApiUrl } from "@/lib/config";
import { formatQuantity } from "@/lib/utils";
import { isInvoicePaid } from "@/lib/invoice-paid";
import { getBulkPrintInvoiceNumbers } from "@/lib/bulk-print";
import { fetchCustomerReturnInvoices } from "@/lib/customer-return-invoice";
import { fetchCustomerDiscountInvoices } from "@/lib/customer-discount-invoice";

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
    isCustomerReturn?: boolean;
    isCustomerDiscount?: boolean;
    originalInvoiceNumber?: string;
    originalInvoiceDate?: string;
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
  const isPaid = !sale.isCustomerReturn && !sale.isCustomerDiscount && isInvoicePaid(sale, (data as any).paidAmount, (data as any).balance);

  return (
    <article className="bulk-a5-invoice">
      {isPaid && <div className="paid-watermark">PAID</div>}
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
      <div className="invoice-title">{sale.isCustomerReturn ? "CUSTOMER RETURN" : sale.isCustomerDiscount ? "CUSTOMER DISCOUNT" : "INVOICE"}</div>

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
          {(sale.isCustomerReturn || sale.isCustomerDiscount) && sale.originalInvoiceDate && (
            <div>({new Date(`${sale.originalInvoiceDate}T00:00:00`).toLocaleDateString()})</div>
          )}
          <div className="invoice-number">{sale.isCustomerReturn ? "Return No" : sale.isCustomerDiscount ? "Discount Invoice No" : "Invoice No"}: {invoiceNumber}</div>
          {(sale.isCustomerReturn || sale.isCustomerDiscount) && sale.originalInvoiceNumber && <div>(Invoice: {sale.originalInvoiceNumber})</div>}
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
                {(sale.isCustomerReturn || sale.isCustomerDiscount) && sale.originalInvoiceNumber && (
                  <span className="item-original-invoice">
                    {" ("}
                    {sale.originalInvoiceDate && `${new Date(`${sale.originalInvoiceDate}T00:00:00`).toLocaleDateString()}, `}
                    Invoice: {sale.originalInvoiceNumber}
                    {item.notes ? `, ${item.notes}` : ""}
                    {")"}
                  </span>
                )}
                {item.notes && !(sale.isCustomerReturn || sale.isCustomerDiscount) && <span className="item-notes"> - {item.notes}</span>}
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

export default function BulkA5InvoicePrintPage() {
  const search = useSearch();
  const invoiceNumbers = useMemo(() => getBulkPrintInvoiceNumbers(search), [search]);
  const returnIds = useMemo(
    () => new URLSearchParams(search).get("returnIds")?.split(",").filter(Boolean) || [],
    [search],
  );
  const discountIds = useMemo(
    () => new URLSearchParams(search).get("discountIds")?.split(",").filter(Boolean) || [],
    [search],
  );
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (invoiceNumbers.length === 0 && returnIds.length === 0 && discountIds.length === 0) {
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
      try {
        const returnInvoices = await fetchCustomerReturnInvoices(returnIds);
        if (cancelled) return;
        const discountInvoices = await fetchCustomerDiscountInvoices(discountIds);
        if (cancelled) return;
        const combined = [...validInvoices, ...returnInvoices, ...discountInvoices] as InvoiceData[];
        setInvoices(combined);
        setFailedCount(results.length - validInvoices.length);
        if (combined.length === 0) setError("No selected invoices or returns could be loaded");
      } catch (requestError) {
        if (cancelled) return;
        setInvoices(validInvoices);
        setFailedCount(results.length - validInvoices.length + returnIds.length + discountIds.length);
        if (validInvoices.length === 0) {
          setError(requestError instanceof Error ? requestError.message : "Failed to load selected returns");
        }
      }
      setLoading(false);
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [invoiceNumbers, returnIds, discountIds]);

  useEffect(() => {
    if (!loading && invoices.length > 0) {
      const timer = window.setTimeout(() => window.print(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [loading, invoices.length]);

  if (loading) return <div className="p-4">Loading A5 invoices...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  return (
    <div className="bulk-a5-print-page">
      <style>{`
        .bulk-a5-print-page { min-height: 100vh; background: #f3f4f6; }
        .bulk-a5-toolbar { padding: 16px; background: #f3f4f6; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .bulk-a5-toolbar button { padding: 8px 16px; border: 1px solid #9ca3af; border-radius: 4px; background: #fff; cursor: pointer; }
        .bulk-a5-invoice { box-sizing: border-box; max-width: 480px; margin: 0 auto 20px; padding: 16px; background: #fff; font-family: Arial, sans-serif; color: #111; position: relative; }
        .bulk-a5-invoice .paid-watermark { position: absolute; top: 36%; left: 50%; transform: translate(-50%, -50%) rotate(-22deg); border: 2px solid rgba(200,0,0,0.28); color: rgba(200,0,0,0.28); font-size: 40px; font-weight: 800; letter-spacing: 6px; padding: 3px 14px 3px 20px; border-radius: 8px; pointer-events: none; z-index: 10; background: transparent; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .invoice-header, .billing-grid, .totals-grid { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .invoice-header { font-size: 11px; line-height: 1.35; }
        .company-name { font-size: 15px; font-weight: 700; margin-bottom: 3px; }
        .invoice-logo { width: 90px; height: auto; object-fit: contain; }
        .invoice-title { text-align: right; font-size: 13px; margin: 6px 0; font-weight: 400; }
        .billing-grid { margin-bottom: 8px; font-size: 11px; }
        .section-label { font-weight: 700; margin-bottom: 3px; }
        .customer-box { min-width: 160px; border: 1px solid #ccc; padding: 6px; line-height: 1.35; }
        .gate-number { margin-top: 3px; font-size: 11px; font-weight: 700; }
        .billing-grid > :first-child { flex: 1; min-width: 0; }
        .invoice-meta { flex: 0 1 48%; min-width: 0; overflow-wrap: anywhere; text-align: right; line-height: 1.5; font-size: 11px; }
        .invoice-number { color: #1a237e; font-weight: 700; font-size: 12px; }
        .invoice-items { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10px; }
        .invoice-items th, .invoice-items td { border: 1px solid #ccc; padding: 2px 4px; }
        .invoice-items th { background: #f5f5f5; text-align: center; font-size: 10px; }
        .invoice-items th:first-child, .invoice-items td:first-child { text-align: left; }
        .invoice-items th:not(:first-child), .invoice-items td:not(:first-child) { text-align: center; }
        .highlighted-row td { background: #fff3a3 !important; }
        .item-notes { font-size: 9px; font-style: italic; color: #555; }
        .item-original-invoice { font-size: 9px; }
        .subtotal-row { font-weight: 700; }
        .totals-grid { margin-top: 0; }
        .invoice-notes { flex: 2; min-height: 50px; border: 1px solid #ccc; border-top: none; padding: 4px; white-space: pre-line; font-size: 9px; color: #666; font-style: italic; }
        .totals-box { flex: 1; border: 1px solid #ccc; border-top: none; padding: 0 5px; font-size: 10px; }
        .totals-box > div { display: flex; justify-content: space-between; padding: 2px 0; }
        .grand-total { font-weight: 700; font-size: 12px; }
        .invoice-footer { margin-top: 12px; text-align: right; color: #444; font-size: 9px; line-height: 1.4; }
        @media print {
          @page { size: A5 portrait; margin: 10mm; }
          .bulk-a5-toolbar { display: none !important; }
          .bulk-a5-print-page { background: #fff; }
          .bulk-a5-invoice { max-width: none; min-height: 0; margin: 0; padding: 0; page-break-after: always; break-after: page; }
          .bulk-a5-invoice:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
      <div className="bulk-a5-toolbar">
        <strong>{invoices.length} A5 document(s) loaded.</strong>
        {failedCount > 0 && <span> {failedCount} selected document(s) could not be loaded.</span>}
        <button type="button" onClick={() => window.print()}>Print Now</button>
        <button type="button" onClick={() => window.close()}>Close</button>
      </div>
      {invoices.map((invoice, index) => <InvoiceDocument key={`${invoice.sale?.invoiceNumber || invoice.sale?.invoice_number}-${index}`} data={invoice} />)}
    </div>
  );
}
