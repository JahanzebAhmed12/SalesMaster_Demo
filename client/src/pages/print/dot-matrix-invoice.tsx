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
  accountNo: { top: '25mm', left: '1mm' }, // Position for account number (customer ID) - added 3mm margin
  customerName: { top: '35mm', left: '1mm' }, // Position for customer name - added 3mm margin
  customerAddress: { top: '40mm', left: '1mm', width: '50mm' }, // Position for customer address with wrapping - added margin, reduced width
  ticketNo: { top: '75mm', left: '23mm' }, // Position for invoice number - adjusted for margin
  date: { top: '75mm', left: '50mm' }, // Position for date - adjusted for margin
  pageNumber: { top: '75mm', left: '118mm' }, // Position for page number
  itemsStartTop: '95mm', // Starting position for items grid
  itemsRowHeight: '6mm', // Height between rows
  maxItemsPerPage: 11, // Reduced by 1 to account for margins
  columns: {
    quantity: { left: '1mm', width: '15mm' } as ColumnConfig, // added 3mm margin
    description: { left: '13mm', width: '75mm' } as ColumnConfig, // adjusted for margin, reduced width
    price: { left: '80mm', width: '20mm', align: 'right' } as ColumnConfig,
    value: { left: '95mm', width: '25mm', align: 'right' } as ColumnConfig // adjusted for margin
  },
  totals: {
    goods: { top: '167mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig, // moved up to fit in bounds
    vat: { top: '177mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig, // moved up to fit in bounds
    total: { top: '187mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig // moved up to fit in bounds
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
      console.log('Generating server PDF for invoice:', invoiceNumber);

      const response = await fetch('/api/generate-invoice-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoiceNumber: invoiceNumber
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
        alert('PDF opened in new tab. Tap the Share button and select Print to print the invoice.');

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
              alert('PDF opened in new tab. Use your browser menu (⋮) and select Print to print the invoice.');
            }
          }, 2000); // Longer delay for Android

          setTimeout(() => window.URL.revokeObjectURL(url), 15000);
        } else {
          // Popup blocked - download instead
          console.log('Popup blocked - downloading PDF...');
          const a = document.createElement('a');
          a.href = url;
          a.download = `invoice-${invoiceNumber}.pdf`;
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
          a.download = `invoice-${invoiceNumber}.pdf`;
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

  if (loading) return <div className="p-4 print:hidden">Loading invoice...</div>;
  if (error) return <div className="p-4 print:hidden text-red-500">Error: {error}</div>;
  if (!data) return <div className="p-4 print:hidden">No invoice found.</div>;

  const { sale, items, customer } = data;
  console.log('Rendering with sale:', sale);
  console.log('Invoice number for display:', sale?.invoice_number);
  const totalAmount = items?.reduce((sum, item) => sum + (item.total_price || item.totalPrice || 0), 0) || 0;
  const vatAmount = sale?.vat_amount || 0;

  // Calculate pagination
  const itemsPerPage = FIELD_POSITIONS.maxItemsPerPage;
  const totalPages = Math.ceil((items?.length || 0) / itemsPerPage);
  const pages = [];

  for (let i = 0; i < totalPages; i++) {
    const startIndex = i * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, items?.length || 0);
    pages.push({
      pageNumber: i + 1,
      items: items?.slice(startIndex, endIndex) || [],
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
    const nextPageHasContent = hasNextPage && pages[pageIndex + 1]?.items?.length > 0;
    return hasNextPage && nextPageHasContent;
  };

  return (
    <div className="min-h-screen">
      <style>{`
        @media print {
          @page { 
            size: 186mm 200mm; 
            margin: 3mm;
            padding: 0;
          }
          html, body { 
            margin: 0; 
            padding: 0;
            width: 186mm !important;
            height: 200mm !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            transform-origin: top left !important;
            transform: scale(1) !important;
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
            padding: 3mm !important;
            width: 186mm !important;
            height: 200mm !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            page-break-after: never !important;
            overflow: hidden !important;
            transform-origin: top left !important;
            transform: scale(1) !important;
            position: relative !important;
          }
          
          /* Force exact dimensions for PDF viewers */
          .dot-matrix-print * {
            transform: scale(1) !important;
            zoom: 1 !important;
          }
          
          /* Prevent browser auto-scaling */
          @media print and (max-width: 186mm) {
            html, body {
              zoom: 1 !important;
              transform: scale(1) !important;
            }
          }
        }
      `}</style>



      {/* Print Preview Header - hidden during print */}
      <div className="p-4 bg-gray-100 print:hidden">
        <h1 className="text-xl font-bold mb-2">Dot Matrix Print Preview</h1>
        <p className="text-sm text-gray-600 mb-4">Invoice: {sale?.invoice_number}</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Print Invoice
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
          width: '186mm',
          height: '200mm',
          margin: '0 auto',
          padding: '3mm',
          boxSizing: 'border-box',
          fontFamily: 'monospace',
          color: '#000',
          backgroundColor: '#fff',
          pageBreakAfter: shouldBreakPage(pageIndex) ? 'always' : 'avoid',
          pageBreakInside: 'avoid',
          overflow: 'hidden'
        }}>
          {/* Account Number (Customer ID) */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.accountNo,
            fontFamily: 'monospace',
            fontSize: '12pt',
            fontWeight: 'bold'
          }}>
            C-{customer?.id || sale?.customer_id || ''}
          </div>

          {/* Customer Name */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.customerName,
            fontFamily: 'monospace',
            fontSize: '12pt'
          }}>
            {customer?.customer_name || customer?.customerName || ''}
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

          {/* Page Number */}
          <div style={{
            position: 'absolute',
            ...FIELD_POSITIONS.pageNumber,
            fontFamily: 'monospace',
            fontSize: '12pt'
          }}>
            {page.pageNumber} of {totalPages}
          </div>

          {/* Product Rows for this page */}
          {page.items.map((item, idx) => (
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
            </>
          )}
        </div>
      ))}
    </div>
  );
} 