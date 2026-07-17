import React, { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { formatQuantity } from '@/lib/utils';

interface InvoiceData {
  company: any;
  customer: any;
  sale: any;
  items: any[];
  paidAmount: number;
  balance: number;
  notes: string;
}

type TextAlign = 'left' | 'right' | 'center' | 'justify';

interface ColumnConfig {
  left: string;
  width: string;
  align?: TextAlign;
}

const FIELD_POSITIONS = {
  accountNo: { top: '27mm', left: '12mm' },
  customerName: { top: '35mm', left: '5mm' },
  gateNumber: { top: '38mm', left: '5mm' },
  customerAddress: { top: '42mm', left: '5mm', width: '50mm' },
  salesId: { top: '77mm', left: '10mm' },
  ticketNo: { top: '77mm', left: '30mm' },
  date: { top: '77mm', left: '60mm' },
  time: { top: '77mm', left: '95mm' },
  pageNumber: { top: '77mm', left: '125mm' },
  itemsStartTop: '95mm',
  itemsRowHeight: '4mm',
  maxItemsPerPage: 11,
  columns: {
    quantity: { left: '4mm', width: '7mm' } as ColumnConfig,
    description: { left: '24mm', width: '72mm' } as ColumnConfig,
    price: { left: '88mm', width: '20mm', align: 'right' } as ColumnConfig,
    value: { left: '105mm', width: '25mm', align: 'right' } as ColumnConfig
  },
  totals: {
    total: { top: '185mm', left: '108mm', width: '25mm', align: 'right' } as ColumnConfig
  }
};

const CHARS_PER_LINE = 30;
const ROW_HEIGHT_MM = parseInt(FIELD_POSITIONS.itemsRowHeight);

function getItemDisplayText(item: any): string {
  const name = item.product_name || item.productName || item.description || '';
  const note = item.notes || item.remarks;
  return note ? `${name} (${note})` : name;
}

function estimateLines(text: string): number {
  if (!text) return 1;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
}

const ITEMS_START_TOP_MM = parseInt(FIELD_POSITIONS.itemsStartTop);
const ITEMS_AVAILABLE_HEIGHT_MM = 72;
const NOTES_EXTRA_GAP_MM = 3.5;

function InvoicePages({ data }: { data: InvoiceData }) {
  const { sale, items, customer } = data;
  const totalAmount = items?.reduce((sum, item) => sum + (item.total_price || item.totalPrice || 0), 0) || 0;
  const vatAmount = sale?.vat_amount || 0;
  const porterage = sale?.porterage || 0;
  const totalQuantity = items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 0;

  const itemLineEntries: Array<{ item: any; lines: number; height: number }> = [];
  if (items) {
    for (const item of items) {
      const lines = estimateLines(getItemDisplayText(item));
      const hasNotes = !!(item.notes || item.remarks);
      const height = lines * ROW_HEIGHT_MM + (hasNotes ? NOTES_EXTRA_GAP_MM : 0);
      itemLineEntries.push({ item, lines, height });
    }
  }

  const pages: Array<{ items: any[]; isLastPage: boolean; itemsHeight: number }> = [];
  let pageBuffer: any[] = [];
  let pageHeight = 0;

  for (const entry of itemLineEntries) {
    if (pageHeight + entry.height > ITEMS_AVAILABLE_HEIGHT_MM && pageBuffer.length > 0) {
      pages.push({
        items: pageBuffer.map(e => e.item),
        isLastPage: false,
        itemsHeight: pageHeight,
      });
      pageBuffer = [];
      pageHeight = 0;
    }
    pageBuffer.push(entry);
    pageHeight += entry.height;
  }

  if (pageBuffer.length > 0) {
    pages.push({
      items: pageBuffer.map(e => e.item),
      isLastPage: true,
      itemsHeight: pageHeight,
    });
  }

  if (pages.length === 0) {
    pages.push({ items: [], isLastPage: true, itemsHeight: 0 });
  }

  const totalPages = pages.length;

  return (
    <div className="print-content" style={{ margin: 0, padding: 0 }}>
      {pages.map((page, pageIndex) => (
        <div
          key={pageIndex}
          className="dot-matrix-print"
          style={{
            position: 'relative',
            width: '189mm',
            height: '203mm',
            margin: '0',
            padding: '0',
            boxSizing: 'border-box',
            fontFamily: 'monospace',
            color: '#000',
            backgroundColor: '#fff',
            pageBreakAfter: pageIndex === pages.length - 1 ? 'avoid' : 'always',
            breakAfter: pageIndex === pages.length - 1 ? 'avoid' : 'page',
            pageBreakBefore: pageIndex === 0 ? 'avoid' : 'auto',
            breakBefore: pageIndex === 0 ? 'avoid' : 'auto',
            pageBreakInside: 'avoid',
            breakInside: 'avoid',
            overflow: 'hidden',
            display: 'block',
          }}
        >
          <div className="page-content-wrapper" style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            padding: 0,
          }}>
            <div className="field-text" style={{
              position: 'absolute',
              ...FIELD_POSITIONS.accountNo,
              fontFamily: '"Courier New", "Courier", monospace',
              fontSize: '11pt',
              fontWeight: 'bold',
              lineHeight: '1',
              margin: '0',
              padding: '0'
            }}>
              C-{customer?.id || sale?.customer_id || ''}
            </div>

            <div className="field-text" style={{
              position: 'absolute',
              ...FIELD_POSITIONS.customerName,
              fontFamily: '"Courier New", "Courier", monospace',
              fontSize: '11pt',
              fontWeight: 'bold',
              lineHeight: '1',
              margin: '0',
              padding: '0'
            }}>
              {customer?.customer_name || customer?.customerName || ''}
            </div>

            {(sale?.gateNumber || sale?.gate_number) && (
              <div className="field-text" style={{
                position: 'absolute',
                ...FIELD_POSITIONS.gateNumber,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                fontWeight: 'bold',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                Gate: {sale?.gateNumber || sale?.gate_number}
              </div>
            )}

            <div className="field-text" style={{
              position: 'absolute',
              ...FIELD_POSITIONS.customerAddress,
              fontFamily: '"Courier New", "Courier", monospace',
              fontSize: '8pt',
              fontWeight: 'bold',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              lineHeight: '1.2',
              margin: '0',
              padding: '0'
            }}>
              {customer?.address || ''}
            </div>

            <div className="field-text" style={{
              position: 'absolute',
              ...FIELD_POSITIONS.salesId,
              fontFamily: '"Courier New", "Courier", monospace',
              fontSize: '10pt',
              fontWeight: 'bold',
              lineHeight: '1',
              margin: '0',
              padding: '0'
            }}>
              {sale?.createdBy || ''}
            </div>

            <div className="field-text" style={{
              position: 'absolute',
              ...FIELD_POSITIONS.ticketNo,
              fontFamily: '"Courier New", "Courier", monospace',
              fontSize: '10pt',
              fontWeight: 'bold',
              lineHeight: '1',
              margin: '0',
              padding: '0'
            }}>
              {sale?.invoice_number || sale?.invoiceNumber || ''}
            </div>

            <div className="field-text" style={{
              position: 'absolute',
              ...FIELD_POSITIONS.date,
              fontFamily: '"Courier New", "Courier", monospace',
              fontSize: '10pt',
              fontWeight: 'bold',
              lineHeight: '1',
              margin: '0',
              padding: '0'
            }}>
              {sale?.date ? new Date(sale.date).toLocaleDateString('en-GB') : '-'}
            </div>

            <div className="field-text" style={{
              position: 'absolute',
              ...FIELD_POSITIONS.time,
              fontFamily: '"Courier New", "Courier", monospace',
              fontSize: '10pt',
              fontWeight: 'bold',
              lineHeight: '1',
              margin: '0',
              padding: '0'
            }}>
              {sale?.date ? new Date(sale.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
            </div>

            <div className="field-text" style={{
              position: 'absolute',
              ...FIELD_POSITIONS.pageNumber,
              fontFamily: '"Courier New", "Courier", monospace',
              fontSize: '10pt',
              fontWeight: 'bold',
              lineHeight: '1',
              margin: '0',
              padding: '0'
            }}>
              {pageIndex + 1} of {totalPages}
            </div>

            {(() => {
              let cumulativeTop = ITEMS_START_TOP_MM;
              return page.items.map((item, itemIndex) => {
                const lines = estimateLines(getItemDisplayText(item));
                const hasNotes = !!(item.notes || item.remarks);
                const itemHeight = lines * ROW_HEIGHT_MM + (hasNotes ? NOTES_EXTRA_GAP_MM : 0);
                const topPosition = cumulativeTop;
                cumulativeTop += itemHeight;

                return (
                  <React.Fragment key={itemIndex}>
                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: FIELD_POSITIONS.columns.quantity.left,
                      width: FIELD_POSITIONS.columns.quantity.width,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '11pt',
                      fontWeight: 'bold',
                      lineHeight: '1',
                      margin: '0',
                      padding: '0',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatQuantity(item.quantity)}
                    </div>

                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: FIELD_POSITIONS.columns.description.left,
                      width: FIELD_POSITIONS.columns.description.width,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '11pt',
                      fontWeight: 'bold',
                      lineHeight: '1',
                      margin: '0',
                      padding: '0',
                      wordWrap: 'break-word',
                      whiteSpace: 'normal'
                    }}>
                      {item.product_name || item.productName || item.description}
                      {(item.notes || item.remarks) && (
                        <span style={{ fontStyle: 'italic', fontWeight: 'normal' }}>
                          {' '}({item.notes || item.remarks})
                        </span>
                      )}
                    </div>

                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: FIELD_POSITIONS.columns.price.left,
                      width: FIELD_POSITIONS.columns.price.width,
                      textAlign: FIELD_POSITIONS.columns.price.align,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '11pt',
                      fontWeight: 'bold',
                      lineHeight: '1',
                      margin: '0',
                      padding: '0',
                      whiteSpace: 'nowrap'
                    }}>
                      {(item.unit_price || item.unitPrice || 0).toFixed(2)}
                    </div>

                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: FIELD_POSITIONS.columns.value.left,
                      width: FIELD_POSITIONS.columns.value.width,
                      textAlign: FIELD_POSITIONS.columns.value.align,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '11pt',
                      fontWeight: 'bold',
                      lineHeight: '1',
                      margin: '0',
                      padding: '0',
                      whiteSpace: 'nowrap'
                    }}>
                      {(item.total_price || item.totalPrice || 0).toFixed(2)}
                    </div>
                  </React.Fragment>
                );
              });
            })()}

            {page.isLastPage && porterage > 0 && (
              <>
                <div className="field-text" style={{
                  position: 'absolute',
                  top: `${ITEMS_START_TOP_MM + page.itemsHeight}mm`,
                  left: FIELD_POSITIONS.columns.description.left,
                  width: FIELD_POSITIONS.columns.description.width,
                  fontFamily: '"Courier New", "Courier", monospace',
                  fontSize: '11pt',
                  fontWeight: 'bold',
                  lineHeight: '1',
                  margin: '0',
                  padding: '0',
                  wordWrap: 'break-word',
                  whiteSpace: 'normal'
                }}>
                  Porterage
                </div>
                <div className="field-text" style={{
                  position: 'absolute',
                  top: `${ITEMS_START_TOP_MM + page.itemsHeight}mm`,
                  left: FIELD_POSITIONS.columns.value.left,
                  width: FIELD_POSITIONS.columns.value.width,
                  textAlign: FIELD_POSITIONS.columns.value.align,
                  fontFamily: '"Courier New", "Courier", monospace',
                  fontSize: '11pt',
                  fontWeight: 'bold',
                  lineHeight: '1',
                  margin: '0',
                  padding: '0',
                  whiteSpace: 'nowrap'
                }}>
                  £{porterage.toFixed(2)}
                </div>
              </>
            )}

            {page.isLastPage && (
              <div className="field-text" style={{
                position: 'absolute',
                top: `${ITEMS_START_TOP_MM + page.itemsHeight + (porterage > 0 ? ROW_HEIGHT_MM : 0)}mm`,
                left: FIELD_POSITIONS.columns.description.left,
                width: FIELD_POSITIONS.columns.description.width,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '11pt',
                fontWeight: 'bold',
                lineHeight: '1',
                margin: '0',
                padding: '0',
                wordWrap: 'break-word',
                whiteSpace: 'normal'
              }}>
                ({formatQuantity(totalQuantity)} packages)
              </div>
            )}

            {page.isLastPage && (
              <div className="field-text" style={{
                position: 'absolute',
                top: FIELD_POSITIONS.totals.total.top,
                left: FIELD_POSITIONS.totals.total.left,
                width: FIELD_POSITIONS.totals.total.width,
                textAlign: FIELD_POSITIONS.totals.total.align as TextAlign,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '11pt',
                fontWeight: 'bold',
                lineHeight: '1',
                margin: '0',
                padding: '0',
                whiteSpace: 'nowrap'
              }}>
                £{(totalAmount + vatAmount + porterage).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BulkDotMatrixPrintPage() {
  const params = new URLSearchParams(window.location.search);
  const invsParam = params.get('invs');
  const invoiceNumbers = invsParam ? invsParam.split(',').filter(Boolean) : [];

  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invoiceNumbers.length === 0) {
      setError('No invoice numbers provided');
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      try {
        setLoading(true);
        const results = await Promise.all(
          invoiceNumbers.map(invNo =>
            apiRequest('GET', `/api/sales/${invNo}/invoice`)
              .catch(err => ({ _error: true, _invoiceNo: invNo, _message: err.message }))
          )
        );
        const valid = results.filter((r: any) => !r._error) as InvoiceData[];
        setInvoices(valid);
        if (valid.length === 0) {
          setError('No invoices could be loaded');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invoices');
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  useEffect(() => {
    if (!loading && invoices.length > 0) {
      setTimeout(() => window.print(), 500);
    }
  }, [loading, invoices]);

  if (loading) return <div className="p-4">Loading invoices...</div>;
  if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
  if (invoices.length === 0) return <div className="p-4">No invoices found.</div>;

  return (
    <div className="min-h-screen">
      <style>{`
        @media print {
          @page { 
            size: 189mm 203.2mm;
            margin: 0 !important;
            padding: 0 !important;
          }
          html, body { 
            margin: 0 !important; 
            padding: 0 !important;
            width: 189mm !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: visible !important;
            font-family: "Courier New", "Courier", monospace !important;
          }
          .print-content {
            margin: 0 !important;
            padding: 0 !important;
          }
          .dot-matrix-print { 
            background: white !important; 
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 189mm !important;
            height: 203mm !important;
            box-sizing: border-box !important;
            overflow: visible !important;
            position: relative !important;
            display: block !important;
            font-family: "Courier New", "Courier", monospace !important;
            page-break-after: always !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            break-inside: avoid !important;
          }
          .dot-matrix-print:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .page-content-wrapper {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 189mm !important;
            height: 203mm !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .field-text {
            font-family: "Courier New", "Courier", monospace !important;
            color: black !important;
            background: transparent !important;
          }
          .min-h-screen {
            min-height: unset !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
        }
        @media screen {
          .dot-matrix-print {
            border: 1px solid #ddd;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
        }
      `}</style>

      <div className="p-4 bg-gray-100 print:hidden">
        <h1 className="text-xl font-bold mb-2">Bulk Dot Matrix Print</h1>
        <p className="text-sm text-gray-600 mb-4">
          {invoices.length} invoice(s) loaded. Auto-printing...
        </p>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Print Now
        </button>
      </div>

      {invoices.map((data, idx) => (
        <div key={idx}>
          <InvoicePages data={data} />
        </div>
      ))}
    </div>
  );
}
