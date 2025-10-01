import React, { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
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

interface TotalConfig {
  top: string;
  left: string;
  width: string;
  align?: TextAlign;
}

const FIELD_POSITIONS = {
  accountNo: { top: '27mm', left: '1mm' },
  customerName: { top: '35mm', left: '1mm' },
  customerAddress: { top: '40mm', left: '3mm', width: '50mm' },
  ticketNo: { top: '77mm', left: '23mm' },
  date: { top: '77mm', left: '48mm' },
  pageNumber: { top: '77mm', left: '118mm' },
  itemsStartTop: '95mm',
  itemsRowHeight: '6mm',
  maxItemsPerPage: 10,
  columns: {
    quantity: { left: '1mm', width: '15mm' } as ColumnConfig,
    description: { left: '10mm', width: '75mm' } as ColumnConfig,
    price: { left: '77mm', width: '20mm', align: 'right' } as ColumnConfig,
    value: { left: '95mm', width: '25mm', align: 'right' } as ColumnConfig
  },
  totals: {
    goods: { top: '167mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig,
    vat: { top: '177mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig,
    total: { top: '186mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig
  }
};

// Mobile PDF positions - same as PC for now, but separate for future customization
const MOBILE_PDF_POSITIONS = {
  accountNo: { top: '25mm', left: '1mm' },
  customerName: { top: '35mm', left: '1mm' },
  customerAddress: { top: '40mm', left: '1mm', width: '50mm' },
  ticketNo: { top: '75mm', left: '23mm' },
  date: { top: '75mm', left: '50mm' },
  pageNumber: { top: '75mm', left: '118mm' },
  itemsStartTop: '95mm',
  itemsRowHeight: '6mm',
  maxItemsPerPage: 10,
  columns: {
    quantity: { left: '1mm', width: '15mm' } as ColumnConfig,
    description: { left: '13mm', width: '75mm' } as ColumnConfig,
    price: { left: '80mm', width: '20mm', align: 'right' } as ColumnConfig,
    value: { left: '95mm', width: '25mm', align: 'right' } as ColumnConfig
  },
  totals: {
    goods: { top: '167mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig,
    vat: { top: '177mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig,
    total: { top: '186mm', left: '96mm', width: '25mm', align: 'right' } as TotalConfig
  }
};

export default function DotMatrixInvoicePrintPage() {
  const [match, params] = useRoute('/print/dot-matrix-invoice/:invoiceNumber');
  const invoiceNumber = params?.invoiceNumber;
  const [data, setData] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isServerPDF, setIsServerPDF] = useState(false);

  // Mobile detection
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

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

    // Always use browser print for "Print Invoice" button
    console.log('Using browser print...');
    setIsServerPDF(false); // Ensure normal browser print
    window.print();
  };

  const handleServerPDF = async () => {
    try {
      console.log('Generating server PDF for invoice:', invoiceNumber);

      // Set server PDF mode for styling
      setIsServerPDF(true);

      // Check if backend is available first
      const { API_BASE_URL, useRelativeUrls } = await import('@/lib/config');
      const token = localStorage.getItem('jwt_token');

      // Test backend connectivity first
      const healthUrl = useRelativeUrls() ? '/api/health' : `${API_BASE_URL}/api/health`;

      try {
        const healthResponse = await fetch(healthUrl, {
          method: 'GET',
          headers: {
            ...(token && { 'Authorization': `Bearer ${token}` })
          }
        });

        if (!healthResponse.ok) {
          throw new Error(`Backend health check failed: ${healthResponse.status}`);
        }

        console.log('Backend health check passed');
      } catch (healthError) {
        console.log('Backend health check failed:', healthError);
        throw new Error(`Backend not available: ${healthError.message}`);
      }

      const apiUrl = useRelativeUrls() ? '/api/generate-invoice-pdf' : `${API_BASE_URL}/api/generate-invoice-pdf`;

      const fetchResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          invoiceNumber: invoiceNumber
        }),
        timeout: 30000 // 30 second timeout
      });

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        throw new Error(`HTTP error! status: ${fetchResponse.status}, message: ${errorText}`);
      }

      const blob = await fetchResponse.blob();

      if (blob.size === 0) {
        throw new Error('Empty PDF received from server');
      }

      const pdfUrl = window.URL.createObjectURL(blob);

      console.log('PDF generated successfully, opening print window...');

      const isMobileSafari = /iPhone|iPad/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);

      if (isMobileSafari) {
        console.log('iOS detected - opening PDF for manual printing...');
        window.open(pdfUrl, '_blank');
        alert('PDF opened in new tab. Tap the Share button and select Print to print the invoice.');
        setTimeout(() => window.URL.revokeObjectURL(pdfUrl), 10000);

      } else if (isAndroid) {
        console.log('Android detected - trying multiple print approaches...');
        const printWindow = window.open(pdfUrl, '_blank', 'width=800,height=600');

        if (printWindow) {
          setTimeout(() => {
            try {
              printWindow.print();
            } catch (e) {
              console.log('Auto-print failed, showing manual instruction');
              alert('PDF opened in new tab. Use your browser menu (⋮) and select Print to print the invoice.');
            }
          }, 2000);

          setTimeout(() => window.URL.revokeObjectURL(pdfUrl), 15000);
        } else {
          console.log('Popup blocked - downloading PDF...');
          const a = document.createElement('a');
          a.href = pdfUrl;
          a.download = `invoice-${invoiceNumber}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(pdfUrl);

          alert('PDF downloaded. Open the downloaded file and use your device\'s print option.');
        }

      } else {
        console.log('Desktop/other browser - using standard approach...');
        const printWindow = window.open(pdfUrl, '_blank', 'width=800,height=600');

        if (printWindow) {
          printWindow.onload = () => {
            setTimeout(() => {
              console.log('Auto-printing PDF...');
              printWindow.print();
            }, 1000);
          };

          setTimeout(() => window.URL.revokeObjectURL(pdfUrl), 10000);
        } else {
          const a = document.createElement('a');
          a.href = pdfUrl;
          a.download = `invoice-${invoiceNumber}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(pdfUrl);
        }
      }

    } catch (error) {
      console.error('Server PDF generation failed:', error);
      console.log('Falling back to browser print...');

      // Show user-friendly error message
      alert(`Server PDF generation is currently unavailable. Using browser print instead.\n\nError: ${error.message}`);

      // Fallback to browser print
      setIsServerPDF(false);
      setTimeout(() => {
        window.print();
      }, 500);
    } finally {
      // Reset server PDF mode after processing
      setTimeout(() => {
        setIsServerPDF(false);
      }, 1000);
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

  // Get appropriate field positions based on mode
  const getFieldPositions = () => {
    return (isMobile && isServerPDF) ? MOBILE_PDF_POSITIONS : FIELD_POSITIONS;
  };

  const fieldPositions = getFieldPositions();

  // Calculate pagination
  const itemsPerPage = fieldPositions.maxItemsPerPage;
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

  // Debug pagination
  console.log('Pagination debug:', {
    totalItems: items?.length || 0,
    itemsPerPage,
    totalPages,
    pages: pages.map(p => ({
      page: p.pageNumber,
      itemCount: p.items.length,
      itemNames: p.items.map(item => item.product_name || item.productName)
    }))
  });

  return (
    <div className="min-h-screen">
      <style>{`
        /* PC Print Styles - Optimized for dot matrix printing */
        @media print and (min-device-width: 769px) {
          @page { 
            size: 186mm 200mm; 
            margin: 0;
            padding: 0;
          }
          html, body { 
            margin: 0 !important; 
            padding: 0 !important;
            width: 186mm !important;
            height: auto !important;
            min-height: unset !important;
            max-height: unset !important;
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
            padding: 0mm !important;
            width: 186mm !important;
            height: 200mm !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            page-break-before: auto !important;
            overflow: hidden !important;
            position: relative !important;
            display: block !important;
            font-family: "Courier New", "Courier", monospace !important;
          }
          .dot-matrix-print:first-child {
            page-break-before: avoid !important;
          }
          .field-text {
            font-family: "Courier New", "Courier", monospace !important;
            color: black !important;
            background: transparent !important;
          }
        }
        
        /* Mobile PDF Styles - Changed font size to 10pt */
        @media print and (max-device-width: 768px), 
               screen and (max-device-width: 768px) {
          @page { 
            size: 186mm 200mm; 
            margin: 0;
            padding: 0;
          }
          html, body { 
            margin: 0 !important; 
            padding: 0 !important;
            width: 186mm !important;
            height: auto !important;
            min-height: unset !important;
            max-height: unset !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            overflow: visible !important;
          }
          .print-content {
            margin: 0 !important;
            padding: 0 !important;
          }
          .dot-matrix-print { 
            background: none !important; 
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0mm !important;
            width: 186mm !important;
            height: 200mm !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            page-break-before: auto !important;
            overflow: hidden !important;
            position: relative !important;
            display: block !important;
          }
          .dot-matrix-print:first-child {
            page-break-before: avoid !important;
          }
        }
        
        /* Server PDF specific styles - Changed font size to 10pt */
        .server-pdf-mode .dot-matrix-print {
          width: 186mm !important;
          height: 200mm !important;
          padding: 0mm !important;
          font-size: 10pt !important;
        }
        
        .server-pdf-mode .field-text {
          font-size: 10pt !important;
          line-height: 1 !important;
        }
        
        /* Common print styles */
        @media print {
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
          
          /* Page break rules */
          .dot-matrix-print {
            page-break-after: always !important;
          }
          .dot-matrix-print:last-child {
            page-break-after: avoid !important;
          }
          .dot-matrix-print:first-child {
            page-break-before: avoid !important;
          }
          
          /* Ensure consistent positioning across pages */
          .print-content {
            position: relative !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
        
        /* Screen styles */
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
        <p className="text-sm text-gray-600 mb-4">Invoice: {sale?.invoice_number}</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Browser Print
          </button>
          <button
            onClick={handleServerPDF}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {isMobile ? 'Generate PDF & Print' : 'Server PDF Print'}
          </button>
          <button
            onClick={() => {
              // Force download mode
              const originalHandler = handleServerPDF;
              handleServerPDF().catch(() => {
                // If server PDF fails, create a simple download of the current page
                console.log('Server PDF failed, creating browser-based download...');
                const printWindow = window.open('', '_blank');
                if (printWindow) {
                  printWindow.document.write(`
                    <html>
                      <head><title>Invoice ${invoiceNumber}</title></head>
                      <body>
                        <p>Server PDF generation is currently unavailable.</p>
                        <p>Please use the "Browser Print" option and save as PDF from your browser's print dialog.</p>
                        <button onclick="window.close()">Close</button>
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                }
              });
            }}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            Download PDF
          </button>
        </div>

      </div>

      {/* Dot Matrix Content - only this shows during print */}
      <div className={`print-content ${isServerPDF ? 'server-pdf-mode' : ''}`}>
        {pages.map((page, pageIndex) => {
          console.log(`Rendering page ${page.pageNumber} with ${page.items.length} items`);

          return (
            <div
              key={pageIndex}
              className="dot-matrix-print"
              style={{
                position: 'relative',
                width: '186mm',
                height: '200mm',
                margin: '0 auto',
                padding: '0mm',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
                color: '#000',
                backgroundColor: '#fff',
                pageBreakAfter: pageIndex === pages.length - 1 ? 'avoid' : 'always',
                pageBreakInside: 'avoid',
                overflow: 'hidden'
              }}
            >
              {/* Account Number (Customer ID) */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.accountNo,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                fontWeight: 'bold',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                C-{customer?.id || sale?.customer_id || ''}
              </div>

              {/* Customer Name */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.customerName,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                {customer?.customer_name || customer?.customerName || ''}
              </div>

              {/* Customer Address */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.customerAddress,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '8pt',
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                lineHeight: '1.2',
                margin: '0',
                padding: '0'
              }}>
                {customer?.address || ''}
              </div>

              {/* Ticket No (Invoice Number) */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.ticketNo,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                {sale?.invoice_number || sale?.invoiceNumber || ''}
              </div>

              {/* Date */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.date,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                {sale?.date ? new Date(sale.date).toLocaleDateString('en-GB') : '-'}
              </div>

              {/* Page Number */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.pageNumber,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                {page.pageNumber} of {totalPages}
              </div>

              {/* Product Rows for this page - CORRECTED POSITIONING */}
              {page.items.map((item, itemIndex) => {
                // Each page should start items at the itemsStartTop position
                // itemIndex goes from 0 to maxItemsPerPage-1 on each page
                const topPosition = parseInt(fieldPositions.itemsStartTop) + itemIndex * parseInt(fieldPositions.itemsRowHeight);

                console.log(`Page ${page.pageNumber}, Item ${itemIndex}: ${item.product_name || item.productName} at ${topPosition}mm`);

                return (
                  <React.Fragment key={itemIndex}>
                    {/* Quantity */}
                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: fieldPositions.columns.quantity.left,
                      width: fieldPositions.columns.quantity.width,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '10pt',
                      lineHeight: '1',
                      margin: '0',
                      padding: '0',
                      whiteSpace: 'nowrap'
                    }}>
                      {formatQuantity(item.quantity)}
                    </div>

                    {/* Product Description */}
                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: fieldPositions.columns.description.left,
                      width: fieldPositions.columns.description.width,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '10pt',
                      lineHeight: '1',
                      margin: '0',
                      padding: '0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {item.product_name || item.productName || item.description}
                    </div>

                    {/* Unit Price */}
                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: fieldPositions.columns.price.left,
                      width: fieldPositions.columns.price.width,
                      textAlign: fieldPositions.columns.price.align,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '10pt',
                      lineHeight: '1',
                      margin: '0',
                      padding: '0',
                      whiteSpace: 'nowrap'
                    }}>
                      {(item.unit_price || item.unitPrice || 0).toFixed(2)}
                    </div>

                    {/* Total Value */}
                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: fieldPositions.columns.value.left,
                      width: fieldPositions.columns.value.width,
                      textAlign: fieldPositions.columns.value.align,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '10pt',
                      lineHeight: '1',
                      margin: '0',
                      padding: '0',
                      whiteSpace: 'nowrap'
                    }}>
                      £{(item.total_price || item.totalPrice || 0).toFixed(2)}
                    </div>
                  </React.Fragment>
                );
              })}

              {/* Totals - only show on last page */}
              {page.isLastPage && (
                <>
                  <div className="field-text" style={{
                    position: 'absolute',
                    top: fieldPositions.totals.goods.top,
                    left: fieldPositions.totals.goods.left,
                    width: fieldPositions.totals.goods.width,
                    textAlign: fieldPositions.totals.goods.align as TextAlign,
                    fontFamily: '"Courier New", "Courier", monospace',
                    fontSize: '10pt',
                    lineHeight: '1',
                    margin: '0',
                    padding: '0',
                    whiteSpace: 'nowrap'
                  }}>
                    £{totalAmount.toFixed(2)}
                  </div>

                  <div className="field-text" style={{
                    position: 'absolute',
                    top: fieldPositions.totals.vat.top,
                    left: fieldPositions.totals.vat.left,
                    width: fieldPositions.totals.vat.width,
                    textAlign: fieldPositions.totals.vat.align as TextAlign,
                    fontFamily: '"Courier New", "Courier", monospace',
                    fontSize: '10pt',
                    lineHeight: '1',
                    margin: '0',
                    padding: '0',
                    whiteSpace: 'nowrap'
                  }}>
                    £{vatAmount.toFixed(2)}
                  </div>

                  <div className="field-text" style={{
                    position: 'absolute',
                    top: fieldPositions.totals.total.top,
                    left: fieldPositions.totals.total.left,
                    width: fieldPositions.totals.total.width,
                    textAlign: fieldPositions.totals.total.align as TextAlign,
                    fontFamily: '"Courier New", "Courier", monospace',
                    fontSize: '10pt',
                    lineHeight: '1',
                    margin: '0',
                    padding: '0',
                    whiteSpace: 'nowrap'
                  }}>
                    £{(totalAmount + vatAmount).toFixed(2)}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}