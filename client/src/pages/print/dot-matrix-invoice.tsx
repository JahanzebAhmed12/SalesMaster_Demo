import React, { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { apiRequest } from '@/lib/queryClient';

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

interface TotalConfig {
  top: string;
  left: string;
  width: string;
  align?: TextAlign;
}

const FIELD_POSITIONS = {
  ticketNo: { top: '26mm', left: '65mm' }, // Position for invoice number 823187
  date: { top: '26mm', left: '110mm' }, // Position for date 26/03/2023
  itemsStartTop: '45mm', // Starting position for items grid
  itemsRowHeight: '6mm', // Height between rows
  columns: {
    quantity: { left: '8mm', width: '15mm' } as ColumnConfig,
    description: { left: '25mm', width: '80mm' } as ColumnConfig,
    price: { left: '105mm', width: '20mm', align: 'right' } as ColumnConfig,
    value: { left: '130mm', width: '25mm', align: 'right' } as ColumnConfig
  },
  totals: {
    goods: { top: '140mm', left: '130mm', width: '25mm', align: 'right' } as TotalConfig,
    vat: { top: '146mm', left: '130mm', width: '25mm', align: 'right' } as TotalConfig,
    total: { top: '152mm', left: '130mm', width: '25mm', align: 'right' } as TotalConfig
  }
};

export default function DotMatrixInvoicePrintPage() {
  const [match, params] = useRoute('/print/dot-matrix-invoice/:invoiceNumber');
  const invoiceNumber = params?.invoiceNumber;
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceNumber) {
      setError('No invoice number provided');
      setLoading(false);
      return;
    }

    const fetchInvoice = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiRequest('GET', `/api/sales/${invoiceNumber}/invoice`);
        console.log('Invoice data:', response);
        console.log('Sale data:', response.sale);
        console.log('Invoice number:', response.sale?.invoice_number);
        setData(response);
      } catch (err) {
        console.error('Error fetching invoice:', err);
        setError(err instanceof Error ? err.message : 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [invoiceNumber]);

  const handlePrint = () => {
    console.log('Print button clicked');
    window.print();
  };

  if (loading) return <div className="p-4 print:hidden">Loading invoice...</div>;
  if (error) return <div className="p-4 print:hidden text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-4 print:hidden">No invoice found.</div>;

  const { sale, items } = data;
  console.log('Rendering with sale:', sale);
  console.log('Invoice number for display:', sale?.invoice_number);
  const totalAmount = items?.reduce((sum, item) => sum + (item.total_price || item.totalPrice || 0), 0) || 0;
  const vatAmount = sale?.vat_amount || 0;

  return (
    <div className="min-h-screen">
      <style>{`
        @media print {
          @page { 
            size: 176mm 203mm; 
            margin: 0; 
            padding: 0;
          }
          body { 
            margin: 0; 
            padding: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print:hidden {
            display: none !important;
          }
          .dot-matrix-print { 
            background: none !important; 
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 176mm !important;
            height: 203mm !important;
          }
        }
      `}</style>

      {/* Print Preview Header - hidden during print */}
      <div className="p-4 bg-gray-100 print:hidden">
        <h1 className="text-xl font-bold mb-2">Dot Matrix Print Preview</h1>
        <p className="text-sm text-gray-600 mb-4">Invoice: {sale?.invoice_number}</p>
        <button 
          onClick={handlePrint} 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Print Invoice
        </button>
      </div>

      {/* Dot Matrix Content - only this shows during print */}
      <div className="dot-matrix-print" style={{ 
        position: 'relative', 
        width: '176mm', 
        height: '203mm', 
        margin: '0 auto',
        fontFamily: 'monospace', 
        color: '#000',
        backgroundColor: '#fff'
      }}>
        {/* Ticket No (Invoice Number) */}
        <div style={{ 
          position: 'absolute', 
          ...FIELD_POSITIONS.ticketNo, 
          fontFamily: 'monospace',
          fontSize: '12pt'
        }}>
          {sale?.invoice_number || sale?.invoiceNumber || ''}
        </div>

        {/* Date */}
        <div style={{ 
          position: 'absolute', 
          ...FIELD_POSITIONS.date,
          fontFamily: 'monospace',
          fontSize: '12pt'
        }}>
          {sale?.date ? new Date(sale.date).toLocaleDateString('en-GB') : '-'}
        </div>

        {/* Product Rows */}
        {items?.map((item, idx) => (
          <React.Fragment key={idx}>
            {/* Quantity */}
            <div style={{ 
              position: 'absolute',
              top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight)}mm`,
              left: FIELD_POSITIONS.columns.quantity.left,
              width: FIELD_POSITIONS.columns.quantity.width,
              fontFamily: 'monospace',
              fontSize: '12pt'
            }}>
              {item.quantity}
            </div>

            {/* Product Description */}
            <div style={{ 
              position: 'absolute',
              top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight)}mm`,
              left: FIELD_POSITIONS.columns.description.left,
              width: FIELD_POSITIONS.columns.description.width,
              fontFamily: 'monospace',
              fontSize: '12pt',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {item.product_name || item.productName || item.description}
            </div>

            {/* Unit Price */}
            <div style={{ 
              position: 'absolute',
              top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight)}mm`,
              left: FIELD_POSITIONS.columns.price.left,
              width: FIELD_POSITIONS.columns.price.width,
              textAlign: FIELD_POSITIONS.columns.price.align,
              fontFamily: 'monospace',
              fontSize: '12pt'
            }}>
              {(item.unit_price || item.unitPrice || 0).toFixed(2)}
            </div>

            {/* Total Value */}
            <div style={{ 
              position: 'absolute',
              top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight)}mm`,
              left: FIELD_POSITIONS.columns.value.left,
              width: FIELD_POSITIONS.columns.value.width,
              textAlign: FIELD_POSITIONS.columns.value.align,
              fontFamily: 'monospace',
              fontSize: '12pt'
            }}>
              £{(item.total_price || item.totalPrice || 0).toFixed(2)}
            </div>
          </React.Fragment>
        ))}

        {/* Totals */}
        <div style={{ 
          position: 'absolute',
          ...FIELD_POSITIONS.totals.goods,
          fontFamily: 'monospace',
          fontSize: '12pt',
          textAlign: FIELD_POSITIONS.totals.goods.align as TextAlign
        }}>
          £{totalAmount.toFixed(2)}
        </div>

        <div style={{ 
          position: 'absolute',
          ...FIELD_POSITIONS.totals.vat,
          fontFamily: 'monospace',
          fontSize: '12pt',
          textAlign: FIELD_POSITIONS.totals.vat.align as TextAlign
        }}>
          £{vatAmount.toFixed(2)}
        </div>

        <div style={{ 
          position: 'absolute',
          ...FIELD_POSITIONS.totals.total,
          fontFamily: 'monospace',
          fontSize: '12pt',
          textAlign: FIELD_POSITIONS.totals.total.align as TextAlign
        }}>
          £{(totalAmount + vatAmount).toFixed(2)}
        </div>
      </div>
    </div>
  );
} 