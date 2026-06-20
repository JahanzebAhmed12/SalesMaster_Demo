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
  accountNo: { top: '27mm', left: '12mm' },
  customerName: { top: '35mm', left: '5mm' },
  customerAddress: { top: '40mm', left: '5mm', width: '50mm' },
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
    goods: { top: '167mm', left: '108mm', width: '25mm', align: 'right' } as TotalConfig,
    vat: { top: '177mm', left: '108mm', width: '25mm', align: 'right' } as TotalConfig,
    total: { top: '185mm', left: '108mm', width: '25mm', align: 'right' } as TotalConfig
  }
};

// Cumulative shift correction: Match printer's 8" (203.2mm) page length setting
// Printer setting: page length 8" = 203.2mm
// CSS setting: 200mm
// Drift per page: 203.2 - 200 = 3.2mm
const PRINTER_PAGE_LENGTH_MM = 203.2; // 8 inches as set in printer
const CSS_PAGE_LENGTH_MM = 200; // Our current CSS setting  
const PAGE_DRIFT_PER_PAGE = PRINTER_PAGE_LENGTH_MM - CSS_PAGE_LENGTH_MM; // 3.2mm per page

// Mobile PDF positions - same as PC for now, but separate for future customization
const MOBILE_PDF_POSITIONS = {
  accountNo: { top: '25mm', left: '1mm' },
  customerName: { top: '35mm', left: '1mm' },
  customerAddress: { top: '40mm', left: '1mm', width: '50mm' },
  salesId: { top: '75mm', left: '1mm' },
  ticketNo: { top: '75mm', left: '23mm' },
  date: { top: '75mm', left: '50mm' },
  time: { top: '75mm', left: '78mm' },
  pageNumber: { top: '75mm', left: '118mm' },
  itemsStartTop: '95mm',
  itemsRowHeight: '4mm',
  maxItemsPerPage: 11,
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

  // Mobile print proxy handler
  const handleMobilePrint = async () => {
    try {
      console.log('📱 Sending print job to office printer...');
      
      const response = await apiRequest('POST', '/api/print-queue/add', {
        invoice_number: invoiceNumber,
        print_type: 'dot_matrix',
        print_data: {
          sale: sale,
          items: items,
          customer: customer
        }
      });
      
      alert(`✅ Print job sent to office printer!\nJob ID: ${response.job_id}\n\nYour invoice will be printed shortly.`);
      
      // Optional: Poll for completion status
      if (response.job_id) {
        setTimeout(() => checkPrintStatus(response.job_id), 10000);
      }
      
    } catch (error) {
      console.error('❌ Print job failed:', error);
      alert('❌ Failed to send print job to office printer.\nPlease try again or contact support.');
    }
  };

  // Optional: Check print status
  const checkPrintStatus = async (jobId: string) => {
    try {
      const response = await apiRequest('GET', `/api/print-queue/${jobId}/status`);
      if (response.status === 'completed') {
        alert('✅ Invoice printed successfully at office printer!');
      } else if (response.status === 'failed') {
        alert(`❌ Print job failed: ${response.error_message || 'Unknown error'}`);
      }
    } catch (error) {
      console.log('Could not check print status');
    }
  };

  const handlePrint = async () => {
    console.log('Print button clicked');

    // Mobile devices use print proxy, desktop uses direct print
    if (isMobile) {
      console.log('📱 Mobile detected - using print proxy...');
      await handleMobilePrint();
      return;
    }

    // Desktop - use normal browser print with enhanced CSS
    console.log('🖥️ Desktop detected - using direct browser print...');
    
    // Set viewport for better printing
    let viewport = document.querySelector('meta[name="viewport"]');
    const originalViewport = viewport?.getAttribute('content') || '';
    
    if (viewport) {
      viewport.setAttribute('content', 'width=186mm, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no');
    } else {
      viewport = document.createElement('meta');
      viewport.setAttribute('name', 'viewport');
      viewport.setAttribute('content', 'width=186mm, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no');
      document.head.appendChild(viewport);
    }

    // Add print-specific styles
    const printStyle = document.createElement('style');
    printStyle.id = 'desktop-print-fix';
    printStyle.textContent = `
      @media print {
        html, body {
          zoom: 1 !important;
          transform: scale(1) !important;
          -webkit-transform: scale(1) !important;
          -webkit-text-size-adjust: none !important;
          -ms-text-size-adjust: none !important;
          text-size-adjust: none !important;
        }
      }
    `;
    document.head.appendChild(printStyle);

    // Print after a short delay to ensure styles are applied
    setTimeout(() => {
      setIsServerPDF(false);
      window.print();
      
      // Restore original viewport after printing
      setTimeout(() => {
        if (originalViewport) {
          viewport?.setAttribute('content', originalViewport);
        }
        // Remove the temporary print style
        const tempStyle = document.getElementById('desktop-print-fix');
        if (tempStyle) {
          tempStyle.remove();
        }
      }, 1000);
    }, 100);
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
  const porterage = sale?.porterage || 0;
  const totalQuantity = items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 0;

  // Get appropriate field positions based on mode (no drift correction needed with wrapper approach)
  const getFieldPositions = (pageNumber: number) => {
    return (isMobile && isServerPDF) ? MOBILE_PDF_POSITIONS : FIELD_POSITIONS;
  };

  // Calculate pagination - use base positions to get itemsPerPage
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
        /* Force exact dimensions and prevent scaling */
        * {
          box-sizing: border-box !important;
        }
        
        /* PC Print Styles - Optimized for dot matrix printing */
        @media print and (min-device-width: 769px) {
          @page { 
            size: 189mm 203.2mm; /* Match printer setting: 8 inches = 203.2mm */
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
          /* CRITICAL: Each page must be EXACTLY 203mm (slightly less than 8" to prevent extra blank page) */
          .dot-matrix-print { 
            background: white !important; 
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 189mm !important;
            height: 203mm !important; /* 203mm instead of 203.2mm to prevent blank page */
            box-sizing: border-box !important;
            overflow: visible !important;
            position: relative !important;
            display: block !important;
            font-family: "Courier New", "Courier", monospace !important;
            /* Force page breaks with maximum compatibility */
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
          /* Inner wrapper positions from 0,0 of parent */
          .page-content-wrapper {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 189mm !important;
            height: 203mm !important; /* Match page height */
            margin: 0 !important;
            padding: 0 !important;
          }
          .field-text {
            font-family: "Courier New", "Courier", monospace !important;
            color: black !important;
            background: transparent !important;
          }
        }
        
        /* Mobile Print Styles - ANTI-SCALING FIXES */
        @media print and (max-device-width: 768px) {
          @page { 
            size: 189mm 203.2mm; /* Match printer setting: 8 inches = 203.2mm */
            margin: 0 !important;
            padding: 0 !important;
          }
          html {
            margin: 0 !important; 
            padding: 0 !important;
            width: 189mm !important;
            height: auto !important;
            min-height: unset !important;
            max-height: unset !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            overflow: visible !important;
            font-family: "Courier New", "Courier", monospace !important;
            /* CRITICAL: Prevent mobile scaling */
            zoom: 1 !important;
            transform: scale(1) !important;
            -webkit-transform: scale(1) !important;
            -webkit-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
          }
          body { 
            margin: 0 !important; 
            padding: 0 !important;
            width: 189mm !important;
            height: auto !important;
            min-height: unset !important;
            max-height: unset !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            overflow: visible !important;
            font-family: "Courier New", "Courier", monospace !important;
            /* CRITICAL: Prevent mobile scaling */
            zoom: 1 !important;
            transform: scale(1) !important;
            -webkit-transform: scale(1) !important;
            -webkit-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
          }
          .print-content {
            margin: 0 !important;
            padding: 0 !important;
            width: 189mm !important;
            /* CRITICAL: Prevent mobile scaling */
            zoom: 1 !important;
            transform: scale(1) !important;
            -webkit-transform: scale(1) !important;
            -webkit-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
          }
          .dot-matrix-print { 
            background: white !important; 
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0mm !important;
            width: 189mm !important;
            height: 203.2mm !important; /* Match printer: 8 inches */
            min-height: 203.2mm !important;
            max-height: 203.2mm !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            page-break-after: always !important;
            page-break-before: always !important;
            break-inside: avoid !important;
            break-after: page !important;
            break-before: page !important;
            overflow: hidden !important;
            position: relative !important;
            display: block !important;
            font-family: "Courier New", "Courier", monospace !important;
            /* CRITICAL: Prevent mobile scaling and create isolated stacking context */
            zoom: 1 !important;
            transform: translateZ(0) !important;
            -webkit-transform: translateZ(0) !important;
            -webkit-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
            isolation: isolate !important;
          }
          .dot-matrix-print:first-child {
            page-break-before: avoid !important;
            break-before: avoid !important;
          }
          .dot-matrix-print:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          .field-text {
            font-family: "Courier New", "Courier", monospace !important;
            color: black !important;
            background: transparent !important;
            /* CRITICAL: Prevent mobile scaling */
            zoom: 1 !important;
            transform: scale(1) !important;
            -webkit-transform: scale(1) !important;
            -webkit-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
          }
        }
        
        /* Mobile Screen Styles - for preview */
        @media screen and (max-device-width: 768px) {
          html, body {
            -webkit-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
          }
          .dot-matrix-print {
            border: 1px solid #ddd;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            /* Prevent scaling in preview too */
            zoom: 1 !important;
            transform: scale(1) !important;
            -webkit-transform: scale(1) !important;
          }
        }
        
        /* Server PDF specific styles */
        .server-pdf-mode .dot-matrix-print {
          width: 189mm !important;
          height: 200mm !important;
          padding: 0mm !important;
          font-size: 10pt !important;
          zoom: 1 !important;
          transform: scale(1) !important;
          -webkit-transform: scale(1) !important;
        }
        
        .server-pdf-mode .field-text {
          font-size: 10pt !important;
          line-height: 1 !important;
          zoom: 1 !important;
          transform: scale(1) !important;
          -webkit-transform: scale(1) !important;
        }
        
        /* Common print styles */
        @media print {
          .min-h-screen {
            min-height: unset !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            zoom: 1 !important;
            transform: scale(1) !important;
            -webkit-transform: scale(1) !important;
          }
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            zoom: 1 !important;
            -webkit-text-size-adjust: 100% !important;
            -ms-text-size-adjust: 100% !important;
            text-size-adjust: 100% !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          
          /* Page break rules */
          .dot-matrix-print {
            page-break-after: always !important;
            page-break-before: always !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            break-before: page !important;
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
          
          /* Ensure consistent positioning across pages */
          .print-content {
            position: relative !important;
            margin: 0 !important;
            padding: 0 !important;
            zoom: 1 !important;
            transform: scale(1) !important;
            -webkit-transform: scale(1) !important;
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
            {isMobile ? '📱 Send to Office Printer' : '🖥️ Direct Print'}
          </button>
          <button
            onClick={handleServerPDF}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {isMobile ? 'Generate PDF & Print' : 'Server PDF Print'}
          </button>
          {isMobile && (
            <button
              onClick={() => {
                // Create a standalone HTML file for mobile download
                const htmlContent = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=189mm, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no">
                    <title>Invoice ${invoiceNumber}</title>
                    <style>
                      @page { size: 189mm 200mm; margin: 0; }
                      * { 
                        box-sizing: border-box; 
                        zoom: 1 !important;
                        transform: scale(1) !important;
                        -webkit-transform: scale(1) !important;
                        -webkit-text-size-adjust: 100% !important;
                      }
                      html, body { 
                        margin: 0; padding: 0; 
                        width: 189mm; height: 200mm;
                        font-family: "Courier New", monospace;
                        zoom: 1 !important;
                      }
                      .dot-matrix-print { 
                        position: relative; width: 189mm; height: 200mm; 
                        margin: 0; padding: 0; overflow: hidden;
                        zoom: 1 !important;
                      }
                      .field-text { 
                        position: absolute; 
                        font-family: "Courier New", monospace; 
                        font-size: 10pt; line-height: 1;
                        zoom: 1 !important;
                      }
                    </style>
                  </head>
                  <body>
                    ${document.querySelector('.dot-matrix-print')?.outerHTML || ''}
                  </body>
                  </html>
                `;
                
                const blob = new Blob([htmlContent], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `invoice-${invoiceNumber}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                alert('HTML file downloaded. Open it in your browser and print with custom size 189mm x 200mm');
              }}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              Download HTML
            </button>
          )}
          <button
            onClick={() => {
              handleServerPDF().catch(() => {
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
      <div className={`print-content ${isServerPDF ? 'server-pdf-mode' : ''}`} style={{ margin: 0, padding: 0 }}>
        {pages.map((page, pageIndex) => {
          // Get appropriate field positions for this page
          const fieldPositions = getFieldPositions(page.pageNumber);
          
          return (
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
              {/* CRITICAL: Wrapper to reset positioning context for each page */}
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

              {/* Sales ID */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.salesId,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                {sale?.createdBy || ''}
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

              {/* Time */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.time,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                {sale?.date ? new Date(sale.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
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
                const topPosition = parseInt(fieldPositions.itemsStartTop) + itemIndex * parseInt(fieldPositions.itemsRowHeight);

                return (
                  <React.Fragment key={itemIndex}>
                    {/* Quantity */}
                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: fieldPositions.columns.quantity.left,
                      width: fieldPositions.columns.quantity.width,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '9pt',
                      fontWeight: 'bold',
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
                      fontSize: '9pt',
                      fontWeight: 'bold',
                      lineHeight: '1',
                      margin: '0',
                      padding: '0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {item.product_name || item.productName || item.description}
                      {(item.notes || item.remarks) && (
                        <span style={{ fontStyle: 'italic', fontWeight: 'normal' }}>
                          {' '}({item.notes || item.remarks})
                        </span>
                      )}
                    </div>

                    {/* Unit Price */}
                    <div className="field-text" style={{
                      position: 'absolute',
                      top: `${topPosition}mm`,
                      left: fieldPositions.columns.price.left,
                      width: fieldPositions.columns.price.width,
                      textAlign: fieldPositions.columns.price.align,
                      fontFamily: '"Courier New", "Courier", monospace',
                      fontSize: '9pt',
                      fontWeight: 'bold',
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
                      fontSize: '9pt',
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
              })}

              {/* Porterage - on last page */}
              {page.isLastPage && porterage > 0 && (
                <>
                  <div className="field-text" style={{
                    position: 'absolute',
                    top: `${parseInt(fieldPositions.itemsStartTop) + page.items.length * parseInt(fieldPositions.itemsRowHeight)}mm`,
                    left: fieldPositions.columns.description.left,
                    width: fieldPositions.columns.description.width,
                    fontFamily: '"Courier New", "Courier", monospace',
                    fontSize: '9pt',
                    fontWeight: 'bold',
                    lineHeight: '1',
                    margin: '0',
                    padding: '0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    Porterage
                  </div>
                  <div className="field-text" style={{
                    position: 'absolute',
                    top: `${parseInt(fieldPositions.itemsStartTop) + page.items.length * parseInt(fieldPositions.itemsRowHeight)}mm`,
                    left: fieldPositions.columns.value.left,
                    width: fieldPositions.columns.value.width,
                    textAlign: fieldPositions.columns.value.align,
                    fontFamily: '"Courier New", "Courier", monospace',
                    fontSize: '9pt',
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

              {/* Packages line - on last page */}
              {page.isLastPage && (
                <div className="field-text" style={{
                  position: 'absolute',
                  top: `${parseInt(fieldPositions.itemsStartTop) + (page.items.length + (porterage > 0 ? 1 : 0)) * parseInt(fieldPositions.itemsRowHeight)}mm`,
                  left: fieldPositions.columns.description.left,
                  width: fieldPositions.columns.description.width,
                  fontFamily: '"Courier New", "Courier", monospace',
                  fontSize: '9pt',
                  fontWeight: 'bold',
                  lineHeight: '1',
                  margin: '0',
                  padding: '0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  ({formatQuantity(totalQuantity)} packages)
                </div>
              )}

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
                    £{(totalAmount + vatAmount + porterage).toFixed(2)}
                  </div>
                </>
              )}
              </div>{/* End page-content-wrapper */}
            </div>
          );
        })}
      </div>
    </div>
  );
}