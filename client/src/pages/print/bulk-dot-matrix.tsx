import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { fetchCustomerReturnInvoices } from '@/lib/customer-return-invoice';
import DotMatrixInvoicePrintPage, {
  type DotMatrixInvoiceData,
} from './dot-matrix-invoice';

export default function BulkDotMatrixPrintPage() {
  const params = new URLSearchParams(window.location.search);
  const invoiceNumbers = (params.get('invs') || '').split(',').filter(Boolean);
  const returnIds = (params.get('returnIds') || '').split(',').filter(Boolean);

  const [invoices, setInvoices] = useState<DotMatrixInvoiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invoiceNumbers.length === 0 && returnIds.length === 0) {
      setError('No invoice numbers provided');
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      try {
        setLoading(true);
        const results = await Promise.all(
          invoiceNumbers.map(async (invoiceNumber) => {
            try {
              return await apiRequest(
                'GET',
                `/api/sales/${invoiceNumber}/invoice`,
              ) as DotMatrixInvoiceData;
            } catch (requestError) {
              console.error(`Failed to load invoice ${invoiceNumber}`, requestError);
              return null;
            }
          }),
        );
        const validInvoices = results.filter(
          (invoice): invoice is DotMatrixInvoiceData => invoice !== null,
        );
        const returns = await fetchCustomerReturnInvoices(returnIds);
        const combined = [...validInvoices, ...returns] as DotMatrixInvoiceData[];
        setInvoices(combined);
        if (combined.length === 0) {
          setError('No invoices or returns could be loaded');
        }
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load invoices');
      } finally {
        setLoading(false);
      }
    };

    void fetchAll();
  }, []);

  useEffect(() => {
    if (!loading && invoices.length > 0) {
      const printTimer = window.setTimeout(() => window.print(), 500);
      return () => window.clearTimeout(printTimer);
    }
  }, [loading, invoices]);

  if (loading) return <div className="p-4 print:hidden">Loading invoices...</div>;
  if (error) return <div className="p-4 print:hidden text-red-500">Error: {error}</div>;
  if (invoices.length === 0) return <div className="p-4 print:hidden">No invoices found.</div>;

  return (
    <>
      <div className="p-4 bg-gray-100 print:hidden">
        <h1 className="text-xl font-bold mb-2">Bulk Dot Matrix Print</h1>
        <p className="text-sm text-gray-600 mb-4">
          {invoices.length} document(s) loaded. Auto-printing...
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.print()}
          className="flex items-center gap-1"
        >
          Print Now
        </Button>
      </div>
      {invoices.map((invoice, index) => (
        <DotMatrixInvoicePrintPage
          key={`${invoice.sale?.invoice_number || invoice.sale?.invoiceNumber || index}-${index}`}
          invoiceData={invoice}
          isLastDocument={index === invoices.length - 1}
          includePrintStyles={index === 0}
          hidePreviewControls
        />
      ))}
    </>
  );
}
