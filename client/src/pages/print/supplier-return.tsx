import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import logo from "@/public/printlogo.png";
import { getApiUrl } from "@/lib/config";
import { formatQuantity } from "@/lib/utils";

const publicApiRequest = async <T = any>(method: string, endpoint: string): Promise<T> => {
  const response = await fetch(getApiUrl(endpoint), {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  const responseData = await response.json();
  if (!response.ok) {
    throw new Error(responseData.message || responseData.error || `HTTP error! status: ${response.status}`);
  }
  return responseData;
};

interface SupplierReturnPrintData {
  company: any;
  supplier: any;
  product: any;
  returnItem: any;
}

const money = (value: unknown) => `£${Number(value || 0).toFixed(2)}`;
const displayDate = (value: unknown) => value ? new Date(String(value)).toLocaleDateString() : "-";

function SupplierReturnTemplate({ data }: { data: SupplierReturnPrintData }) {
  const { company, supplier, product, returnItem } = data;
  const productName = returnItem.productName || product?.description || returnItem.description || "-";
  const productCode = product?.productCode || "-";

  return (
    <div className="supplier-return-print">
      <div className="document-header">
        <div className="company-block">
          <img src={logo} alt="Company logo" className="company-logo" />
          <div className="company-name">{company?.companyName || "Company Name"}</div>
          <div>{company?.address1 || ""}</div>
          {company?.address2 && <div>{company.address2}</div>}
          {company?.telephone && <div>Tel: {company.telephone}</div>}
          {company?.email && <div>{company.email}</div>}
          {company?.compRegNo && <div>Company Reg No: {company.compRegNo}</div>}
          {company?.vatNo && <div>VAT No: {company.vatNo}</div>}
        </div>
        <div className="document-title-block">
          <div className="document-title">RETURN TO SUPPLIER</div>
          <div><strong>Return Date:</strong> {displayDate(returnItem.date)}</div>
          <div><strong>Return No:</strong> {returnItem.refNumber || "-"}</div>
          <div><strong>Product Type:</strong> {returnItem.productType === "non" ? "Non-Product" : "Regular Product"}</div>
        </div>
      </div>

      <div className="rule" />

      <div className="two-column-section">
        <section>
          <div className="section-label">SUPPLIER</div>
          <div className="boxed-value">{supplier?.supplier_name || returnItem.supplierName || "-"}</div>
          {supplier?.address && <div>{supplier.address}</div>}
          {supplier?.telephone && <div>Tel: {supplier.telephone}</div>}
          {supplier?.email && <div>{supplier.email}</div>}
          {supplier?.vat_number && <div>VAT No: {supplier.vat_number}</div>}
        </section>
        <section className="reference-section">
          <div className="detail-row"><span>Purchase Invoice</span><strong>{returnItem.purchaseInvoiceId || "-"}</strong></div>
          <div className="detail-row"><span>Original Invoice No.</span><strong>{returnItem.invoiceNumber || "-"}</strong></div>
          <div className="detail-row"><span>Status</span><strong>{returnItem.status || "-"}</strong></div>
        </section>
      </div>

      <table className="items-table">
        <thead>
          <tr>
            <th>Product Code</th>
            <th>Product</th>
            <th>Description</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Total Value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{productCode}</td>
            <td>{productName}</td>
            <td>{returnItem.description || "-"}</td>
            <td className="numeric">{formatQuantity(returnItem.quantity)}</td>
            <td className="numeric">{money(returnItem.unitPrice)}</td>
            <td className="numeric">{money(returnItem.totalValue)}</td>
          </tr>
          <tr className="total-row">
            <td colSpan={3}>TOTAL</td>
            <td className="numeric">{formatQuantity(returnItem.quantity)}</td>
            <td />
            <td className="numeric">{money(returnItem.totalValue)}</td>
          </tr>
        </tbody>
      </table>

      <div className="details-box combined-details-box">
        <div className="detail-block">
          <div className="section-label">RETURN REASON</div>
          <div>{returnItem.returnReason || "-"}</div>
        </div>
        <div className="detail-block">
          <div className="section-label">CREDIT NOTE</div>
          <div>{returnItem.creditNoteIssued ? "Issued" : "Not issued"}</div>
          {returnItem.creditNoteIssued && <div>Amount: {money(returnItem.creditNoteAmount)}</div>}
        </div>
        <div className="detail-block">
          <div className="section-label">REMARKS</div>
          <div className="multiline-value">{returnItem.remarks || "-"}</div>
        </div>
      </div>

      <div className="no-print print-controls">
        <button onClick={() => window.print()}>Print</button>
        <button onClick={() => window.close()}>Close</button>
      </div>

      <style>{`
        @page { size: A4; margin: 12mm; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #f3f4f6; color: #111827; font-family: Arial, sans-serif; }
        .supplier-return-print { width: 100%; max-width: 794px; min-height: 1123px; margin: 24px auto; padding: 34px 40px; background: #fff; font-size: 12px; line-height: 1.4; }
        .document-header, .two-column-section { display: flex; justify-content: space-between; gap: 28px; }
        .company-block, .document-title-block { flex: 1; }
        .company-block { color: #374151; }
        .company-logo { height: 58px; max-width: 220px; object-fit: contain; object-position: left center; margin-bottom: 8px; }
        .company-name { color: #111827; font-size: 19px; font-weight: 700; margin-bottom: 5px; }
        .document-title-block { text-align: right; color: #374151; padding-top: 16px; }
        .document-title { color: #1f3a5f; font-size: 23px; font-weight: 700; letter-spacing: .5px; margin-bottom: 12px; }
        .rule { border-top: 2px solid #1f3a5f; margin: 20px 0 18px; }
        .two-column-section { align-items: flex-start; margin-bottom: 22px; }
        .section-label { color: #1f3a5f; font-size: 10px; font-weight: 700; letter-spacing: .7px; margin-bottom: 5px; }
        .boxed-value { border: 1px solid #9ca3af; padding: 8px 10px; font-weight: 700; margin-bottom: 6px; }
        .reference-section { min-width: 270px; padding-top: 18px; }
        .detail-row { display: flex; justify-content: space-between; gap: 20px; border-bottom: 1px solid #d1d5db; padding: 5px 0; }
        .detail-row span { color: #4b5563; }
        .items-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
        .items-table th, .items-table td { border: 1px solid #6b7280; padding: 7px 6px; vertical-align: top; }
        .items-table th { background: #e5e7eb; color: #111827; text-align: left; font-size: 10px; }
        .items-table .numeric { text-align: right; white-space: nowrap; }
        .total-row { font-weight: 700; background: #f9fafb; }
        .details-box { border: 1px solid #9ca3af; padding: 9px 10px; }
        .combined-details-box { margin-top: 22px; min-height: 150px; }
        .detail-block + .detail-block { margin-top: 14px; padding-top: 10px; border-top: 1px solid #d1d5db; }
        .multiline-value { white-space: pre-wrap; }
        .print-controls { display: flex; gap: 10px; margin-top: 26px; }
        .print-controls button { border: 1px solid #6b7280; border-radius: 4px; background: #fff; padding: 7px 20px; cursor: pointer; font-size: 14px; }
        @media print {
          body { background: #fff; }
          .supplier-return-print { max-width: none; min-height: auto; margin: 0; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}

export default function SupplierReturnPrintPage() {
  const [match, params] = useRoute("/print/supplier-return/:returnId");
  const returnId = params?.returnId;
  const [data, setData] = useState<SupplierReturnPrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!returnId) {
      setError("Supplier return number is missing");
      setLoading(false);
      return;
    }
    publicApiRequest<SupplierReturnPrintData>("GET", `/api/supplier-returns/${returnId}/print`)
      .then((response) => {
        setData(response);
        setLoading(false);
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Failed to load supplier return");
        setLoading(false);
      });
  }, [returnId]);

  if (loading) return <div>Loading supplier return...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return <div>No supplier return found</div>;
  return <SupplierReturnTemplate data={data} />;
}
