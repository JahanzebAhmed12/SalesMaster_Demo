import React, { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { apiRequest } from '@/lib/queryClient';

interface PaymentData {
  batchId: number;
  payments: Array<{
    id: number;
    batchId: number;
    amount: number;
    paymentMode: string;
    paymentDate: string;
    invoiceNumber: string;
    invoiceAmount: number;
    customerName: string;
    remarks: string;
  }>;
  totalAmount: number;
  paymentCount: number;
  customer: any;
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
  accountNo: { top: '02mm', left: '3mm' }, // Position for account number (customer ID) - moved up 5mm
  customerName: { top: '10mm', left: '2mm' }, // Position for customer name - moved up 5mm
  customerAddress: { top: '15mm', left: '2mm', width: '48mm' }, // Position for customer address with wrapping - moved up 5mm
  paymentId: { top: '45mm', left: '30mm' }, // Position for payment ID
  date: { top: '45mm', left: '53mm' }, // Position for date
  pageNumber: { top: '150mm', left: '30mm' }, // Position for page number (60mm right of date)
  itemsStartTop: '65mm', // Starting position for items grid
  itemsRowHeight: '10mm', // Height between rows
  maxItemsPerPage: 6, // Maximum payment items that fit on one page (considering larger row height)
  pageEndPosition: '190mm', // Page should end 15mm above totals (185mm - 15mm)
  columns: {
    quantity: { left: '1mm', width: '15mm' } as ColumnConfig,
    description: { left: '10mm', width: '80mm' } as ColumnConfig,
    price: { left: '80mm', width: '20mm', align: 'right' } as ColumnConfig,
    value: { left: '100mm', width: '25mm', align: 'right' } as ColumnConfig
  },
  totals: {
    goods: { top: '140mm', left: '100mm', width: '25mm', align: 'right' } as TotalConfig,
    vat: { top: '150mm', left: '100mm', width: '25mm', align: 'right' } as TotalConfig,
    total: { top: '160mm', left: '100mm', width: '25mm', align: 'right' } as TotalConfig
  }
};

export default function DotMatrixPaymentPrintPage() {
  const [, params] = useRoute('/print/dot-matrix-payment/:batchId');
  const batchId = params?.batchId;
  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!batchId) {
      setError('No payment ID provided');
      setLoading(false);
      return;
    }

    const fetchPayment = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiRequest('GET', `/api/payments/batch/${batchId}`);
        console.log('Payment data:', response);

        // Get customer details from the first payment
        if (response.payments && response.payments.length > 0) {
          const customerId = response.payments[0].customerId;
          const customerResponse = await apiRequest('GET', `/api/customers/${customerId}`);
          response.customer = customerResponse;
        }

        setData(response);
      } catch (err) {
        console.error('Error fetching payment:', err);
        setError(err instanceof Error ? err.message : 'Failed to load payment');
      } finally {
        setLoading(false);
      }
    };

    fetchPayment();
  }, [batchId]);

  const handlePrint = () => {
    console.log('Print button clicked');
    window.print();
  };

  if (loading) return <div className="p-4 print:hidden">Loading payment receipt...</div>;
  if (error) return <div className="p-4 print:hidden text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-4 print:hidden">No payment found.</div>;

  const { payments, totalAmount, customer } = data;
  const paymentDate = payments[0]?.paymentDate;

  // Calculate pagination
  const itemsPerPage = FIELD_POSITIONS.maxItemsPerPage;
  const totalPages = Math.ceil((payments?.length || 0) / itemsPerPage);
  const pages = [];

  for (let i = 0; i < totalPages; i++) {
    const startIndex = i * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, payments?.length || 0);
    pages.push({
      pageNumber: i + 1,
      payments: payments?.slice(startIndex, endIndex) || [],
      isLastPage: i === totalPages - 1
    });
  }

  return (
    <div className="min-h-screen">
      <style>{`
        @media print {
          @page { 
            size: 176mm 200mm; 
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
            height: 200mm !important;
          }
        }
      `}</style>

      {/* Print Preview Header - hidden during print */}
      <div className="p-4 bg-gray-100 print:hidden">
        <h1 className="text-xl font-bold mb-2">Payment Receipt - Dot Matrix Print Preview</h1>
        <p className="text-sm text-gray-600 mb-4">Payment ID: {batchId}</p>
        <button
          onClick={handlePrint}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Print Payment Receipt
        </button>
      </div>

      {/* Dot Matrix Content - only this shows during print */}
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="dot-matrix-print" style={{
          position: 'relative',
          width: '186mm',
          height: '200mm',
          margin: '0 auto',
          fontFamily: 'monospace',
          color: '#000',
          backgroundColor: '#fff',
          pageBreakAfter: pageIndex < pages.length - 1 ? 'always' : 'auto'
        }}>
          {/* Account Number (Customer ID) */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.accountNo,
            fontFamily: 'monospace',
            fontSize: '12pt',
            fontWeight: 'bold'
          }}>
            C-{customer?.id || payments[0]?.customerId || ''}
          </div>

          {/* Customer Name */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.customerName,
            fontFamily: 'monospace',
            fontSize: '12pt'
          }}>
            {customer?.customer_name || customer?.customerName || payments[0]?.customerName || ''}
          </div>

          {/* Customer Address */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.customerAddress,
            fontFamily: 'monospace',
            fontSize: '10pt',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            lineHeight: '1.2'
          }}>
            {customer?.address || ''}
          </div>

          {/* Payment ID */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.paymentId,
            fontFamily: 'monospace',
            fontSize: '12pt'
          }}>
            {batchId}
          </div>

          {/* Date */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.date,
            fontFamily: 'monospace',
            fontSize: '12pt'
          }}>
            {paymentDate ? new Date(paymentDate).toLocaleDateString('en-GB') : '-'}
          </div>

          {/* Page Number */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.pageNumber,
            fontFamily: 'monospace',
            fontSize: '12pt'
          }}>
            {page.pageNumber} of {totalPages}
          </div>

          {/* Payment Rows for this page */}
          {page.payments.map((payment, idx) => (
            <React.Fragment key={idx}>
              {/* Quantity (always 1 for payments) */}
              <div style={{
                position: 'absolute',
                top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight)}mm`,
                left: FIELD_POSITIONS.columns.quantity.left,
                width: FIELD_POSITIONS.columns.quantity.width,
                fontFamily: 'monospace',
                fontSize: '12pt'
              }}>
                1
              </div>

              {/* Payment Description */}
              <div style={{
                position: 'absolute',
                top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight)}mm`,
                left: FIELD_POSITIONS.columns.description.left,
                width: FIELD_POSITIONS.columns.description.width,
                fontFamily: 'monospace',
                fontSize: '12pt'
              }}>
                {payment.paymentMode === 'cash' ? 'Cash Payment' : 'Card Payment'}
              </div>

              {/* Invoice Number - positioned 5mm below payment description */}
              {payment.invoiceNumber && (
                <div style={{
                  position: 'absolute',
                  top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight) + 5}mm`,
                  left: FIELD_POSITIONS.columns.description.left,
                  width: FIELD_POSITIONS.columns.description.width,
                  fontFamily: 'monospace',
                  fontSize: '10pt'
                }}>
                  Inv: {payment.invoiceNumber}
                </div>
              )}

              {/* Unit Price (same as amount for payments) */}
              <div style={{
                position: 'absolute',
                top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight)}mm`,
                left: FIELD_POSITIONS.columns.price.left,
                width: FIELD_POSITIONS.columns.price.width,
                textAlign: FIELD_POSITIONS.columns.price.align,
                fontFamily: 'monospace',
                fontSize: '12pt'
              }}>
                {payment.amount.toFixed(2)}
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
                £{payment.amount.toFixed(2)}
              </div>
            </React.Fragment>
          ))}

          {/* Totals - only show on last page */}
          {page.isLastPage && (
            <>
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
                £0.00
              </div>

              <div style={{
                position: 'absolute',
                ...FIELD_POSITIONS.totals.total,
                fontFamily: 'monospace',
                fontSize: '12pt',
                textAlign: FIELD_POSITIONS.totals.total.align as TextAlign
              }}>
                £{totalAmount.toFixed(2)}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}