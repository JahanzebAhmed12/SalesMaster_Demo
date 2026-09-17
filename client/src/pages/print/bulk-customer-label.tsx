import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { getApiUrl } from "@/lib/config";
import { getBulkPrintInvoiceNumbers } from "@/lib/bulk-print";

interface LabelData {
  customer?: {
    customer_name?: string;
    customerName?: string;
  };
  sale?: {
    invoice_number?: string;
    invoiceNumber?: string;
  };
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

export default function BulkCustomerLabelPrintPage() {
  const search = useSearch();
  const invoiceNumbers = useMemo(() => getBulkPrintInvoiceNumbers(search), [search]);
  const [labels, setLabels] = useState<LabelData[]>([]);
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
          return await publicApiRequest<LabelData>(`/api/sales/${encodeURIComponent(invoiceNumber)}/invoice`);
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const valid = results.filter((label): label is LabelData => label !== null);
      setLabels(valid);
      setFailedCount(results.length - valid.length);
      if (valid.length === 0) setError("No selected invoices could be loaded");
      setLoading(false);
    };

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [invoiceNumbers]);

  useEffect(() => {
    if (!loading && labels.length > 0) {
      const timer = window.setTimeout(() => window.print(), 500);
      return () => window.clearTimeout(timer);
    }
  }, [loading, labels.length]);

  if (loading) return <div className="p-4">Loading labels...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  return (
    <div className="bulk-label-print-page">
      <style>{`
        .bulk-label-print-page { min-height: 100vh; background: #f3f4f6; }
        .bulk-label-toolbar { padding: 16px; background: #f3f4f6; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .bulk-label-toolbar button { padding: 8px 16px; border: 1px solid #9ca3af; border-radius: 4px; background: #fff; cursor: pointer; }
        .bulk-label-sheet { box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #fff; margin: 0 auto 20px; width: 100%; max-width: 794px; min-height: 60vh; padding: 40px; }
        .bulk-label-name { font-family: Arial, Helvetica, sans-serif; font-weight: 900; font-size: 72px; line-height: 1.1; text-align: center; word-break: break-word; text-transform: uppercase; color: #111; }
        @media (max-width: 768px) { .bulk-label-name { font-size: 42px; } }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; }
          .bulk-label-toolbar { display: none !important; }
          .bulk-label-print-page { background: #fff; }
          .bulk-label-sheet { max-width: none; min-height: auto; margin: 0; padding: 20mm; width: 210mm; height: 297mm; page-break-after: always; break-after: page; }
          .bulk-label-sheet:last-child { page-break-after: auto; break-after: auto; }
          .bulk-label-name { font-size: 72pt !important; }
        }
      `}</style>
      <div className="bulk-label-toolbar">
        <strong>{labels.length} label(s) loaded.</strong>
        {failedCount > 0 && <span> {failedCount} selected invoice(s) could not be loaded.</span>}
        <button type="button" onClick={() => window.print()}>Print Now</button>
        <button type="button" onClick={() => window.close()}>Close</button>
      </div>
      {labels.map((label, index) => (
        <div key={`${label.sale?.invoiceNumber || label.sale?.invoice_number}-${index}`} className="bulk-label-sheet">
          <div className="bulk-label-name">
            {label.customer?.customer_name || label.customer?.customerName || "CUSTOMER"}
          </div>
        </div>
      ))}
    </div>
  );
}
