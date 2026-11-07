import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { getApiUrl } from "@/lib/config";
import { getBulkPrintInvoiceNumbers } from "@/lib/bulk-print";
import { fetchCustomerReturnInvoices } from "@/lib/customer-return-invoice";

interface PackingItem {
  qty: number;
  product: string;
  notes?: string;
}

interface PackingData {
  customer?: {
    customer_name?: string;
    customerName?: string;
    vat_number?: string;
  };
  sale?: {
    invoice_number?: string;
    invoiceNumber?: string;
    date?: string;
    gate_number?: string;
    gateNumber?: string;
    isCustomerReturn?: boolean;
    originalInvoiceNumber?: string;
  };
  packingItems?: PackingItem[];
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

function PackingDocument({ data }: { data: PackingData }) {
  const customer = data.customer || {};
  const sale = data.sale || {};
  const items = data.packingItems || [];
  const invoiceNumber = sale.invoice_number || sale.invoiceNumber || "-";
  const gateNumber = sale.gate_number || sale.gateNumber;
  const totalBoxes = items.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  return (
    <article className="bulk-packing-document">
      <div className="packing-header">
        <div>
          <div className="packing-brand">TROPIFRUIT UK LTD</div>
          <div>Picking note for warehouse preparation</div>
        </div>
        <div className="packing-title">PICKING LIST</div>
      </div>
      <hr />
      <div className="packing-meta">
        <div>
          <strong>Customer</strong>
          <div className="packing-customer">{customer.customer_name || customer.customerName || "CUSTOMER"}</div>
          {gateNumber && <div className="packing-gate">Gate No: {gateNumber}</div>}
          {customer.vat_number && <div>VAT No: {customer.vat_number}</div>}
        </div>
        <div className="packing-invoice-meta">
          <div>Date: {sale.date ? new Date(sale.date).toLocaleDateString() : "-"}</div>
          <div>{sale.isCustomerReturn ? "Original Invoice" : "Invoice No"}: {sale.isCustomerReturn ? sale.originalInvoiceNumber || "-" : invoiceNumber}</div>
          {sale.isCustomerReturn && <div>Return No: {invoiceNumber}</div>}
        </div>
      </div>
      <table className="packing-items">
        <thead>
          <tr>
            <th>Qty</th>
            <th>Product</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <td>{item.qty}</td>
              <td>{item.product}{item.notes && <span className="packing-notes"> ({item.notes})</span>}</td>
            </tr>
          ))}
          <tr className="packing-total">
            <td>{totalBoxes} Boxes</td>
            <td>{items.length} Items</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}

export default function BulkPackingListPrintPage() {
  const search = useSearch();
  const invoiceNumbers = useMemo(() => getBulkPrintInvoiceNumbers(search), [search]);
  const returnIds = useMemo(
    () => new URLSearchParams(search).get("returnIds")?.split(",").filter(Boolean) || [],
    [search],
  );
  const [documents, setDocuments] = useState<PackingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failedCount, setFailedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (invoiceNumbers.length === 0 && returnIds.length === 0) {
      setError("No invoices selected");
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      const results = await Promise.all(invoiceNumbers.map(async invoiceNumber => {
        try {
          return await publicApiRequest<PackingData>(`/api/sales/${encodeURIComponent(invoiceNumber)}/invoice`);
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const validDocuments = results.filter((document): document is PackingData => document !== null);
      try {
        const returnDocuments = (await fetchCustomerReturnInvoices(returnIds)).map(returnData => ({
          company: returnData.company,
          customer: returnData.customer,
          sale: returnData.sale,
          packingItems: returnData.items.map(item => ({
            qty: Math.abs(Number(item.quantity || 0)),
            product: String(item.productName || item.description || ""),
            notes: item.notes ? String(item.notes) : undefined,
          })),
        })) as PackingData[];
        if (cancelled) return;
        const combined = [...validDocuments, ...returnDocuments];
        setDocuments(combined);
        setFailedCount(results.length - validDocuments.length);
        if (combined.length === 0) setError("No selected picking notes could be loaded");
      } catch (requestError) {
        if (cancelled) return;
        setDocuments(validDocuments);
        setFailedCount(results.length - validDocuments.length + returnIds.length);
        if (validDocuments.length === 0) {
          setError(requestError instanceof Error ? requestError.message : "Failed to load return picking notes");
        }
      }
      setLoading(false);
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [invoiceNumbers, returnIds]);

  useEffect(() => {
    if (!loading && documents.length > 0) {
      const timer = window.setTimeout(() => window.print(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [loading, documents.length]);

  if (loading) return <div className="p-4">Loading picking notes...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  return (
    <div className="bulk-packing-page">
      <style>{`
        .bulk-packing-page { min-height: 100vh; background: #f3f4f6; }
        .bulk-packing-toolbar { padding: 16px; background: #f3f4f6; }
        .bulk-packing-toolbar button { padding: 8px 16px; border: 1px solid #9ca3af; border-radius: 4px; background: #fff; cursor: pointer; }
        .bulk-packing-document { box-sizing: border-box; max-width: 1000px; min-height: 720px; margin: 0 auto 20px; padding: 36px; background: #fff; font-family: Arial, sans-serif; color: #111; }
        .packing-header, .packing-meta { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .packing-brand { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
        .packing-title { color: #1a237e; font-size: 28px; font-weight: 700; }
        .packing-meta { margin: 22px 0 14px; font-size: 15px; }
        .packing-customer { min-width: 260px; border: 1px solid #888; padding: 10px; margin-top: 5px; font-size: 18px; font-weight: 700; }
        .packing-gate { margin-top: 5px; font-size: 16px; font-weight: 700; }
        .packing-invoice-meta { text-align: right; line-height: 1.8; font-size: 17px; }
        .packing-items { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 16px; }
        .packing-items th, .packing-items td { border: 1px solid #888; padding: 8px; }
        .packing-items th { background: #f5f5f5; text-align: left; font-size: 17px; }
        .packing-items th:first-child, .packing-items td:first-child { width: 120px; text-align: center; }
        .packing-total { font-weight: 700; }
        .packing-notes { font-size: 13px; font-style: italic; }
        @media print {
          @page { size: A4; margin: 10mm; }
          .bulk-packing-toolbar { display: none !important; }
          .bulk-packing-page { background: #fff; }
          .bulk-packing-document { max-width: none; min-height: 0; margin: 0; padding: 0; page-break-after: always; break-after: page; }
          .bulk-packing-document:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
      <div className="bulk-packing-toolbar">
        <strong>{documents.length} picking note(s) loaded.</strong>
        {failedCount > 0 && <span> {failedCount} selected invoice(s) could not be loaded.</span>}
        <button type="button" onClick={() => window.print()}>Print Now</button>
      </div>
      {documents.map((document, index) => (
        <PackingDocument key={`${document.sale?.invoiceNumber || document.sale?.invoice_number}-${index}`} data={document} />
      ))}
    </div>
  );
}
