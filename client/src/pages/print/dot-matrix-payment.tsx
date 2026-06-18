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
  accountNo: { top: '27mm', left: '1mm' },
  customerName: { top: '35mm', left: '1mm' },
  customerAddress: { top: '40mm', left: '1mm', width: '50mm' },
  ticketNo: { top: '77mm', left: '23mm' },
  date: { top: '77mm', left: '48mm' },
  pageNumber: { top: '77mm', left: '118mm' },
  itemsStartTop: '95mm',
  itemsRowHeight: '4mm',
  maxItemsPerPage: 11,
  columns: {
    quantity: { left: '1mm', width: '10mm' } as ColumnConfig,
    description: { left: '10mm', width: '72mm' } as ColumnConfig,
    price: { left: '77mm', width: '20mm', align: 'right' } as ColumnConfig,
    value: { left: '95mm', width: '25mm', align: 'right' } as ColumnConfig
  },
  totals: {
    goods: { top: '167mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig,
    vat: { top: '177mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig,
    total: { top: '186mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig
  },
  remarks: { left: '3mm', width: '110mm' } // Positioned dynamically after last item
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

        // Customer data is already included in the response
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

  const handlePrint = async () => {
    console.log('Print button clicked');
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    if (isMobile) {
      console.log('Mobile detected - using server PDF...');
      await handleServerPDF();
    } else {
      console.log('Desktop detected - using browser print...');
      window.print();
    }
  };

  const handleServerPDF = async () => {
    try {
      console.log('Generating server PDF for payment batch:', batchId);

      const response = await fetch('/api/generate-payment-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          batchId: batchId
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Convert response to blob
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      console.log('PDF generated, opening print window...');

      // Try multiple approaches for mobile PDF printing
      const isMobileSafari = /iPhone|iPad/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);

      if (isMobileSafari) {
        // iOS Safari: Open PDF directly and let user print manually
        console.log('iOS detected - opening PDF for manual printing...');
        window.open(url, '_blank');

        // Show user instruction
        alert('PDF opened in new tab. Tap the Share button and select Print to print the payment receipt.');

        setTimeout(() => window.URL.revokeObjectURL(url), 10000);

      } else if (isAndroid) {
        // Android: Try multiple approaches
        console.log('Android detected - trying multiple print approaches...');

        // Approach 1: Try opening with print intent
        const printWindow = window.open(url, '_blank', 'width=800,height=600');

        if (printWindow) {
          // Wait for PDF to load, then try to trigger print
          setTimeout(() => {
            try {
              printWindow.print();
            } catch (e) {
              console.log('Auto-print failed, showing manual instruction');
              // If auto-print fails, show instruction
              alert('PDF opened in new tab. Use your browser menu (⋮) and select Print to print the payment receipt.');
            }
          }, 2000); // Longer delay for Android

          setTimeout(() => window.URL.revokeObjectURL(url), 15000);
        } else {
          // Popup blocked - download instead
          console.log('Popup blocked - downloading PDF...');
          const a = document.createElement('a');
          a.href = url;
          a.download = `payment-receipt-${batchId}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          alert('PDF downloaded. Open the downloaded file and use your device\'s print option.');
        }

      } else {
        // Desktop or other mobile browsers
        console.log('Desktop/other browser - using standard approach...');
        const printWindow = window.open(url, '_blank', 'width=800,height=600');

        if (printWindow) {
          printWindow.onload = () => {
            setTimeout(() => {
              console.log('Auto-printing PDF...');
              printWindow.print();
            }, 1000);
          };

          setTimeout(() => window.URL.revokeObjectURL(url), 10000);
        } else {
          // Fallback: download the PDF
          const a = document.createElement('a');
          a.href = url;
          a.download = `payment-receipt-${batchId}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
        }
      }

    } catch (error) {
      console.error('Server PDF generation failed:', error);
      console.log('Falling back to browser print...');
      // Fallback to browser print if server PDF fails
      window.print();
    }
  };

  if (loading) return <div className="p-4 print:hidden">Loading payment receipt...</div>;
  if (error) return <div className="p-4 print:hidden text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-4 print:hidden">No payment found.</div>;

  // Process payments to group by payment method and sort by invoice number
  const processedPayments = [...(data.payments || [])].sort((a, b) => {
    // First sort by payment method (cash, card, bank_transfer, cheque, others)
    const paymentMethodOrder = {
      'cash': 0,
      'card': 1,
      'bank': 1, // 'bank' is an alias for 'card'
      'bank_transfer': 2,
      'transfer': 2, // alias for bank_transfer
      'cheque': 3
    };
    
    const aMethod = a.paymentMode?.toLowerCase();
    const bMethod = b.paymentMode?.toLowerCase();
    const aOrder = aMethod in paymentMethodOrder ? paymentMethodOrder[aMethod as keyof typeof paymentMethodOrder] : 4;
    const bOrder = bMethod in paymentMethodOrder ? paymentMethodOrder[bMethod as keyof typeof paymentMethodOrder] : 4;
    
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    
    // Then sort by invoice number (on-account payments last)
    if (a.invoiceNumber === 'On Account' && b.invoiceNumber !== 'On Account') return 1;
    if (a.invoiceNumber !== 'On Account' && b.invoiceNumber === 'On Account') return -1;
    if (a.invoiceNumber === 'On Account' && b.invoiceNumber === 'On Account') return 0;
    
    // Extract numeric part of invoice number for proper numeric sorting
    const aNum = parseInt(a.invoiceNumber) || 0;
    const bNum = parseInt(b.invoiceNumber) || 0;
    return aNum - bNum;
  });

  const { totalAmount, customer } = data;
  const paymentDate = processedPayments[0]?.paymentDate;

  // Calculate pagination with processed payments
  const itemsPerPage = FIELD_POSITIONS.maxItemsPerPage;
  const totalPages = Math.ceil(processedPayments.length / itemsPerPage);
  const pages = [];

  for (let i = 0; i < totalPages; i++) {
    const startIndex = i * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, processedPayments.length);
    pages.push({
      pageNumber: i + 1,
      payments: processedPayments.slice(startIndex, endIndex),
      isLastPage: i === totalPages - 1
    });
  }

  // Mobile detection
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

  // Helper function to determine if page break is needed
  const shouldBreakPage = (pageIndex: number) => {
    // On mobile, never break pages to prevent extra blank pages
    if (isMobile) return false;

    // On desktop, use normal logic
    const hasNextPage = pageIndex < pages.length - 1;
    const nextPageHasContent = hasNextPage && pages[pageIndex + 1]?.payments?.length > 0;
    return hasNextPage && nextPageHasContent;
  };

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
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
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
          .dot-matrix-print:first-child {
            page-break-before: avoid !important;
            break-before: avoid !important;
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
        }
        
        /* Screen styles for preview */
        @media screen {
          .dot-matrix-print {
            border: 1px solid #ddd;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
        }
      `}</style>

      {/* Print Preview Header - hidden during print */}
      <div className="p-4 bg-gray-100 print:hidden">
        <h1 className="text-xl font-bold mb-2">Dot Matrix Print Preview</h1>
        <p className="text-sm text-gray-600 mb-4">Payment Receipt: {batchId}</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Print Payment Receipt
          </button>
          <button
            onClick={handleServerPDF}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Server PDF
          </button>
          {isMobile && (
            <button
              onClick={() => {
                // Direct download for mobile users who prefer it
                handleServerPDF().then(() => {
                  setTimeout(() => {
                    alert('If print dialog didn\'t open automatically, check your Downloads folder for the PDF file and print it from there.');
                  }, 3000);
                });
              }}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              Download PDF
            </button>
          )}
        </div>
      </div>

      {/* Dot Matrix Content - only this shows during print */}
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="dot-matrix-print" style={{
          position: 'relative',
          width: '189mm',
          height: '203mm',
          margin: '0',
          padding: '0',
          boxSizing: 'border-box',
          fontFamily: '"Courier New", "Courier", monospace',
          color: '#000',
          backgroundColor: '#fff',
          pageBreakAfter: shouldBreakPage(pageIndex) ? 'always' : 'avoid',
          breakAfter: shouldBreakPage(pageIndex) ? 'page' : 'avoid',
          pageBreakBefore: pageIndex === 0 ? 'avoid' : 'auto',
          breakBefore: pageIndex === 0 ? 'avoid' : 'auto',
          pageBreakInside: 'avoid',
          breakInside: 'avoid',
          overflow: 'hidden',
          display: 'block',
        }}>
          <div className="page-content-wrapper" style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            margin: 0,
            padding: 0,
          }}>
          {/* Account Number (Customer ID) */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.accountNo,
            fontFamily: '"Courier New", "Courier", monospace',
            fontSize: '10pt',
            fontWeight: 'bold'
          }}>
            C-{customer?.id || ''}
          </div>

          {/* Customer Name */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.customerName,
            fontFamily: '"Courier New", "Courier", monospace',
            fontSize: '10pt'
          }}>
            {customer?.customer_name || customer?.customerName || processedPayments[0]?.customerName || ''}
          </div>

          {/* Customer Address */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.customerAddress,
            fontFamily: '"Courier New", "Courier", monospace',
            fontSize: '8pt',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            lineHeight: '1.2'
          }}>
            {customer?.address || ''}
          </div>

          {/* Payment ID */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.ticketNo,
            fontFamily: '"Courier New", "Courier", monospace',
            fontSize: '10pt'
          }}>
            {batchId}
          </div>

          {/* Date */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.date,
            fontFamily: '"Courier New", "Courier", monospace',
            fontSize: '10pt'
          }}>
            {paymentDate ? new Date(paymentDate).toLocaleDateString('en-GB') : '-'}
          </div>

          {/* Page Number */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.pageNumber,
            fontFamily: '"Courier New", "Courier", monospace',
            fontSize: '10pt'
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
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '9pt',
                fontWeight: 'bold',
                lineHeight: '1'
              }}>
                1
              </div>

              {/* Payment Description */}
              <div style={{
                position: 'absolute',
                top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight)}mm`,
                left: FIELD_POSITIONS.columns.description.left,
                width: FIELD_POSITIONS.columns.description.width,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '9pt',
                fontWeight: 'bold',
                lineHeight: '1',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {(() => {
                  const basePaymentType = payment.paymentMode === 'cash' ? 'Cash' :
                    payment.paymentMode === 'bank' ? 'Card' :
                      payment.paymentMode === 'bank_transfer' ? 'Bank Transfer' :
                        payment.paymentMode === 'cheque' ? 'Cheque' : 'Payment';
                  
                  // Show invoice number on the same line
                  if (payment.invoiceNumber && payment.invoiceNumber !== 'On Account') {
                    return `${basePaymentType} - Inv: ${payment.invoiceNumber}`;
                  }
                  return `${basePaymentType} Payment`;
                })()}
              </div>

              {/* Unit Price (same as amount for payments) */}
              <div style={{
                position: 'absolute',
                top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + idx * parseInt(FIELD_POSITIONS.itemsRowHeight)}mm`,
                left: FIELD_POSITIONS.columns.price.left,
                width: FIELD_POSITIONS.columns.price.width,
                textAlign: FIELD_POSITIONS.columns.price.align,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '9pt',
                fontWeight: 'bold',
                lineHeight: '1'
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
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '9pt',
                fontWeight: 'bold',
                lineHeight: '1'
              }}>
                £{payment.amount.toFixed(2)}
              </div>
            </React.Fragment>
          ))}

          {/* Remarks - positioned after last payment item on last page */}
          {page.isLastPage && processedPayments?.[0]?.remarks && (
            <div style={{
              position: 'absolute',
              top: `${parseInt(FIELD_POSITIONS.itemsStartTop) + page.payments.length * parseInt(FIELD_POSITIONS.itemsRowHeight) + 2}mm`,
              left: FIELD_POSITIONS.remarks.left,
              width: FIELD_POSITIONS.remarks.width,
              fontFamily: '"Courier New", "Courier", monospace',
              fontSize: '8pt',
              lineHeight: '1.2',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word'
            }}>
              Remarks: {processedPayments[0].remarks}
            </div>
          )}

          {/* Totals - only show on last page */}
          {page.isLastPage && (
            <>
              <div style={{
                position: 'absolute',
                ...FIELD_POSITIONS.totals.goods,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                textAlign: FIELD_POSITIONS.totals.goods.align as TextAlign
              }}>
                £{totalAmount.toFixed(2)}
              </div>
            </>
          )}
        </div>
        </div>
      ))}
    </div>
  );
}