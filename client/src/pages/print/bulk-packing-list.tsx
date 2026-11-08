import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { getApiUrl } from "@/lib/config";
import { getBulkPrintInvoiceNumbers } from "@/lib/bulk-print";
import { fetchCustomerReturnInvoices } from "@/lib/customer-return-invoice";
import { PackingListTemplate, type PackingListData } from "./packing-list";

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

export default function BulkPackingListPrintPage() {
  const search = useSearch();
  const invoiceNumbers = useMemo(() => getBulkPrintInvoiceNumbers(search), [search]);
  const returnIds = useMemo(
    () => new URLSearchParams(search).get("returnIds")?.split(",").filter(Boolean) || [],
    [search],
  );
  const [documents, setDocuments] = useState<PackingListData[]>([]);
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
          return await publicApiRequest<PackingListData>(`/api/sales/${encodeURIComponent(invoiceNumber)}/invoice`);
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const validDocuments = results.filter((document): document is PackingListData => document !== null);
      try {
        const returnDocuments: PackingListData[] = (await fetchCustomerReturnInvoices(returnIds)).map(returnData => ({
          company: returnData.company,
          customer: returnData.customer,
          sale: returnData.sale,
          packingItems: returnData.items.map(item => ({
            qty: Math.abs(Number(item.quantity || 0)),
            weight: 0,
            product: String(item.productName || item.description || ""),
            notes: item.notes ? String(item.notes) : undefined,
          })),
        }));
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
        @media print {
          .bulk-packing-toolbar { display: none !important; }
          .bulk-packing-document { page-break-after: always; break-after: page; }
          .bulk-packing-document:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
      <div className="bulk-packing-toolbar">
        <strong>{documents.length} picking note(s) loaded.</strong>
        {failedCount > 0 && <span> {failedCount} selected invoice(s) could not be loaded.</span>}
        <button
          type="button"
          onClick={() => window.print()}
          style={{ marginLeft: 12, padding: "6px 18px", fontSize: 16, border: "1px solid #888", borderRadius: 4, background: "#fff", cursor: "pointer" }}
        >
          Print Now
        </button>
      </div>
      {documents.map((document, index) => (
        <PackingListTemplate
          key={`${document.sale?.invoiceNumber || document.sale?.invoice_number}-${index}`}
          data={document}
          showActions={false}
          bulk
        />
      ))}
    </div>
  );
}
