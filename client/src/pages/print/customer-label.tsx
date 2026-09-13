import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { getApiUrl } from "@/lib/config";

const publicApiRequest = async <T = any>(method: string, endpoint: string): Promise<T> => {
  const url = getApiUrl(endpoint);
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
  return data;
};

export default function CustomerLabelPrintPage() {
  const [match, params] = useRoute("/print/customer-label/:invoiceNumber");
  const invoiceNumber = params?.invoiceNumber;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invoiceNumber) return;
    publicApiRequest("GET", `/api/sales/${invoiceNumber}/invoice`)
      .then((res) => { setData(res); setLoading(false); })
      .catch(() => { setError("Failed to load label"); setLoading(false); });
  }, [invoiceNumber]);

  useEffect(() => {
    if (!loading && data) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [loading, data]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!data) return <div className="p-8">No data</div>;

  const customerName: string = data.customer?.customer_name || data.customer?.customerName || "CUSTOMER";

  return (
    <div className="label-page">
      <style>{`
        .label-page { min-height: 100vh; background: #f3f4f6; display: flex; flex-direction: column; }
        .label-toolbar { padding: 16px; background: #f3f4f6; display: flex; gap: 12px; }
        .label-toolbar button { padding: 8px 16px; border: 1px solid #9ca3af; border-radius: 4px; background: #fff; cursor: pointer; }
        .label-sheet { flex: 1; display: flex; align-items: center; justify-content: center; background: #fff; margin: 0 auto; width: 100%; max-width: 794px; min-height: 100vh; padding: 40px; box-sizing: border-box; }
        .label-name { font-family: Arial, Helvetica, sans-serif; font-weight: 900; font-size: 72px; line-height: 1.1; text-align: center; word-break: break-word; text-transform: uppercase; color: #111; }
        @media (max-width: 768px) { .label-name { font-size: 42px; } }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; }
          .label-toolbar { display: none !important; }
          .label-page { display: block !important; background: #fff !important; min-height: auto !important; margin: 0 !important; padding: 0 !important; }
          .label-sheet { display: flex !important; align-items: center !important; justify-content: center !important; width: 210mm !important; height: 297mm !important; max-width: none !important; min-height: auto !important; margin: 0 !important; padding: 20mm !important; box-sizing: border-box !important; }
          .label-name { font-size: 72pt !important; }
        }
      `}</style>

      <div className="label-toolbar">
        <button onClick={() => window.print()}>Print Now</button>
        <button onClick={() => window.close()}>Close</button>
      </div>

      <div className="label-sheet">
        <div className="label-name">{customerName}</div>
      </div>
    </div>
  );
}
