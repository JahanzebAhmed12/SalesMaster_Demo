import React, { useEffect, useState } from 'react';
import { useRoute } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { formatMoney, formatQuantity } from '@/lib/utils';
import { API_BASE_URL, useRelativeUrls } from '@/lib/config';
import { isInvoicePaid } from '@/lib/invoice-paid';
import { generateInvoicePdfBlob } from '@/lib/invoice-pdf';
import { Button } from '@/components/ui/button';
import { fetchCustomerReturnInvoices } from '@/lib/customer-return-invoice';
import { fetchCustomerDiscountInvoices } from '@/lib/customer-discount-invoice';

export interface DotMatrixInvoiceData {
  company: any;
  customer: any;
  sale: any;
  items: any[];
  paidAmount: number;
  balance: number;
  notes: string;
}

interface DotMatrixInvoicePrintProps {
  invoiceData?: DotMatrixInvoiceData;
  isLastDocument?: boolean;
  includePrintStyles?: boolean;
  hidePreviewControls?: boolean;
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
  gateNumber: { top: '38mm', left: '5mm' },
  customerAddress: { top: '42mm', left: '5mm', width: '50mm' },
  salesId: { top: '77mm', left: '10mm' },
  ticketNo: { top: '77mm', left: '30mm' },
  date: { top: '77mm', left: '60mm' },
  time: { top: '77mm', left: '95mm' },
  pageNumber: { top: '77mm', left: '125mm' },
  itemsStartTop: '90mm',
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
    total: { top: '181mm', left: '108mm', width: '25mm', align: 'right' } as TotalConfig
  }
};

// Estimate chars per line in the description column (72mm wide, Courier New 11pt monospace)
const CHARS_PER_LINE = 30;
const ROW_HEIGHT_MM = parseInt(FIELD_POSITIONS.itemsRowHeight); // 4mm

function getItemDisplayText(
  item: any,
  originalInvoiceNumber?: string,
  originalInvoiceDate?: string,
): string {
  const name = item.product_name || item.productName || item.description || '';
  const note = item.notes || item.remarks;
  const details = [
    originalInvoiceDate
      ? new Date(`${originalInvoiceDate}T00:00:00`).toLocaleDateString('en-GB')
      : '',
    originalInvoiceNumber ? `Invoice: ${originalInvoiceNumber}` : '',
    note || '',
  ].filter(Boolean);
  return `${name}${details.length ? ` (${details.join(', ')})` : ''}`;
}

function estimateLines(text: string): number {
  if (!text) return 1;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));
}

// Available vertical space for items (before totals area starts at ~167mm)
const ITEMS_START_TOP_MM = parseInt(FIELD_POSITIONS.itemsStartTop);
const ITEMS_AVAILABLE_HEIGHT_MM = 68;

// Extra gap (in mm) added after items that have notes/comments
const NOTES_EXTRA_GAP_MM = 3.5;

// Cumulative shift correction: Match printer's 8" (203.2mm) page length setting
// Printer setting: page length 8" = 203.2mm
// CSS setting: 200mm
// Drift per page: 203.2 - 200 = 3.2mm
const PRINTER_PAGE_LENGTH_MM = 203.2; // 8 inches as set in printer
const CSS_PAGE_LENGTH_MM = 200; // Our current CSS setting  
const PAGE_DRIFT_PER_PAGE = PRINTER_PAGE_LENGTH_MM - CSS_PAGE_LENGTH_MM; // 3.2mm per page

// Mobile PDF positions - same as PC for now, but separate for future customization
const MOBILE_PDF_POSITIONS = {
  accountNo: { top: '27mm', left: '12mm' },
  customerName: { top: '35mm', left: '5mm' },
  gateNumber: { top: '38mm', left: '5mm' },
  customerAddress: { top: '42mm', left: '5mm', width: '50mm' },
  salesId: { top: '77mm', left: '10mm' },
  ticketNo: { top: '77mm', left: '30mm' },
  date: { top: '77mm', left: '60mm' },
  time: { top: '77mm', left: '95mm' },
  pageNumber: { top: '77mm', left: '125mm' },
  itemsStartTop: '91mm',
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
    total: { top: '181mm', left: '108mm', width: '25mm', align: 'right' } as TotalConfig
  }
};

export default function DotMatrixInvoicePrintPage({
  invoiceData,
  isLastDocument = true,
  includePrintStyles = true,
  hidePreviewControls = false,
}: DotMatrixInvoicePrintProps = {}) {
  const [match, params] = useRoute('/print/dot-matrix-invoice/:invoiceNumber');
  const invoiceNumber = params?.invoiceNumber;
  const returnId = new URLSearchParams(window.location.search).get('returnId');
  const discountId = new URLSearchParams(window.location.search).get('discountId');
  const [data, setData] = useState<DotMatrixInvoiceData | null>(invoiceData || null);
  const [loading, setLoading] = useState(!invoiceData);
  const [error, setError] = useState<string | null>(null);
  const [isServerPDF, setIsServerPDF] = useState(false);

  // Mobile/tablet detection
  // - Standard mobile: Mobi/Android/iPhone in UA
  // - iPadOS 13+: dropped "iPad" from UA, now reports as Mac — detect via touch + platform
  // - Android tablets: may not have "Mobi" but have "Android"
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || // iPadOS 13+
    (typeof window !== 'undefined' && window.screen.width <= 1024 && navigator.maxTouchPoints > 0);

  useEffect(() => {
    if (invoiceData) {
      setData(invoiceData);
      setLoading(false);
      setError(null);
      return;
    }

    if (!returnId && !discountId && !invoiceNumber) {
      setError('No invoice number provided');
      setLoading(false);
      return;
    }

    const fetchInvoice = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = discountId
          ? (await fetchCustomerDiscountInvoices([discountId]))[0]
          : returnId
          ? (await fetchCustomerReturnInvoices([returnId]))[0]
          : await apiRequest('GET', `/api/sales/${invoiceNumber}/invoice`);
        setData(response);
      } catch (err) {
        console.error('Error fetching invoice:', err);
        setError(err instanceof Error ? err.message : 'Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [invoiceNumber, returnId, discountId, invoiceData]);

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
      if (data && (sale?.isCustomerReturn || sale?.isCustomerDiscount)) {
        const pdfUrl = URL.createObjectURL(generateInvoicePdfBlob(data));
        const link = document.createElement('a');
        link.href = pdfUrl;
        link.download = `${sale.isCustomerReturn ? 'customer-return' : 'customer-discount'}-${sale.invoice_number}.pdf`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
        return;
      }

      console.log('Generating server PDF for invoice:', invoiceNumber);

      // Set server PDF mode for styling
      setIsServerPDF(true);

      // Check if backend is available first
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
        throw new Error(`Backend not available: ${healthError instanceof Error ? healthError.message : String(healthError)}`);
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
        signal: AbortSignal.timeout(30000) // 30 second timeout
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

      const isMobileSafari = /iPhone|iPad/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+
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
      alert(`Server PDF generation is currently unavailable. Using browser print instead.\n\nError: ${error instanceof Error ? error.message : String(error)}`);

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
  const isPaid = !sale?.isCustomerReturn && !sale?.isCustomerDiscount &&
    isInvoicePaid(sale, data.paidAmount, data.balance);
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

  // Calculate items with estimated line counts for dynamic pagination
  const itemLineEntries: Array<{ item: any; lines: number; height: number }> = [];
  if (items) {
    for (const item of items) {
      const lines = estimateLines(getItemDisplayText(
        item,
        sale?.isCustomerReturn ? sale.originalInvoiceNumber : undefined,
        sale?.isCustomerReturn ? sale.originalInvoiceDate : undefined,
      ));
      const hasNotes = !!(item.notes || item.remarks);
      const height = lines * ROW_HEIGHT_MM + (hasNotes ? NOTES_EXTRA_GAP_MM : 0);
      itemLineEntries.push({ item, lines, height });
    }
  }

  const pages: Array<{ pageNumber: number; items: any[]; isLastPage: boolean; itemsHeight: number }> = [];
  let pageBuffer: any[] = [];
  let pageHeight = 0;

  for (const entry of itemLineEntries) {
    if (pageHeight + entry.height > ITEMS_AVAILABLE_HEIGHT_MM && pageBuffer.length > 0) {
      pages.push({
        pageNumber: pages.length + 1,
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
      pageNumber: pages.length + 1,
      items: pageBuffer.map(e => e.item),
      isLastPage: true,
      itemsHeight: pageHeight,
    });
  }

  // Ensure at least 1 page even if no items
  if (pages.length === 0) {
    pages.push({
      pageNumber: 1,
      items: [],
      isLastPage: true,
      itemsHeight: 0,
    });
  }

  const totalPages = pages.length;

  // Debug pagination
  console.log('Pagination debug:', {
    totalItems: items?.length || 0,
    totalPages: pages.length,
    pages: pages.map(p => ({
      page: p.pageNumber,
      itemCount: p.items.length,
      itemsHeight: p.itemsHeight,
      itemNames: p.items.map(item => item.product_name || item.productName)
    }))
  });

  return (
    <div className="min-h-screen">
      {includePrintStyles && <style>{`
        /* Force exact dimensions and prevent scaling */
        * {
          box-sizing: border-box !important;
        }

        /* PAID stamp — just under the product description column
           (description at 24mm), just above the totals line so it never
           overlaps the 95-167mm product area or the form alignment. */
        .paid-stamp {
          position: absolute;
          top: 178mm;
          left: 28mm;
          right: auto;
          width: auto;
          text-align: left;
          transform: none;
          font-family: "Courier New", "Courier", monospace !important;
          font-size: 13pt;
          font-weight: 700;
          letter-spacing: 3px;
          color: #000 !important;
          opacity: 1;
          background: transparent !important;
          pointer-events: none;
          z-index: 5;
        }
        .paid-stamp.credit-adjustment-stamp {
          font-size: 9pt;
          letter-spacing: 1px;
        }
        .paid-stamp span {
          border: 1.5pt solid #000 !important;
          padding: 1mm 4mm 1mm 6mm;
          background: transparent !important;
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
          .dot-matrix-print-final {
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
          .dot-matrix-print-final {
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
          .dot-matrix-print-final {
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
      `}</style>}

      {/* Print Preview Header - hidden during print */}
      {!hidePreviewControls && <div className="p-4 bg-gray-100 print:hidden">
        <h1 className="text-xl font-bold mb-2">Dot Matrix Print Preview</h1>
        <p className="text-sm text-gray-600 mb-4">
          {sale?.isCustomerReturn ? 'Customer Return' : sale?.isCustomerDiscount ? 'Customer Discount' : 'Invoice'}: {sale?.invoice_number}
          {(sale?.isCustomerReturn || sale?.isCustomerDiscount) && sale?.originalInvoiceNumber
            ? ` (${sale.originalInvoiceDate ? `${new Date(`${sale.originalInvoiceDate}T00:00:00`).toLocaleDateString('en-GB')}, ` : ''}Invoice: ${sale.originalInvoiceNumber})`
            : ''}
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePrint}
            className="flex items-center gap-1"
          >
            🖥️ Direct Print
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleMobilePrint}
            className="flex items-center gap-1"
          >
            📱 Send to Office Printer
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleServerPDF}
            className="flex items-center gap-1"
          >
            ⬇️ Download PDF
            </Button>
          {!sale?.isCustomerDiscount && <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(
              sale?.isCustomerReturn
                ? `/print/packing-list/${invoiceNumber}?returnId=${returnId}`
                : `/print/packing-list/${invoiceNumber}`,
              '_blank',
            )}
            className="flex items-center gap-1"
          >
            📋 Print Picking Note
          </Button>}
          {!sale?.isCustomerDiscount && <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/print/customer-label/${invoiceNumber}`, '_blank')}
            className="flex items-center gap-1"
          >
            🏷️ Print Label
          </Button>}
        </div>
      </div>}

      {/* Dot Matrix Content - only this shows during print */}
      <div className={`print-content ${isServerPDF ? 'server-pdf-mode' : ''}`} style={{ margin: 0, padding: 0 }}>
        {pages.map((page, pageIndex) => {
          // Get appropriate field positions for this page
          const fieldPositions = getFieldPositions(page.pageNumber);
          
          return (
            <div
              key={pageIndex}
              className={`dot-matrix-print${isLastDocument && pageIndex === pages.length - 1 ? ' dot-matrix-print-final' : ''}`}
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
                pageBreakAfter: isLastDocument && pageIndex === pages.length - 1 ? 'avoid' : 'always',
                breakAfter: isLastDocument && pageIndex === pages.length - 1 ? 'avoid' : 'page',
                pageBreakBefore: pageIndex === 0 ? 'avoid' : 'auto',
                breakBefore: pageIndex === 0 ? 'avoid' : 'auto',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
                overflow: 'hidden',
                display: 'block',
              }}
            >
              {/* PAID stamp on last page only — sits beside the totals */}
              {(isPaid || sale?.isCustomerReturn || sale?.isCustomerDiscount) && page.isLastPage && (
                <div className={`paid-stamp${sale?.isCustomerDiscount ? ' credit-adjustment-stamp' : ''}`}>
                  <span>
                    {sale?.isCustomerReturn
                      ? 'CREDIT NOTE'
                      : sale?.isCustomerDiscount
                        ? 'CREDIT ADJUSTMENT'
                        : 'PAID'}
                  </span>
                </div>
              )}
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
                  fontSize: '11pt',
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
                fontSize: '11pt',
                fontWeight: 'bold',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                {customer?.customer_name || customer?.customerName || ''}
              </div>

              {/* Gate Number */}
              {(sale?.gateNumber || sale?.gate_number) && (
                <div className="field-text" style={{
                  position: 'absolute',
                  ...fieldPositions.gateNumber,
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

              {/* Customer Address */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.customerAddress,
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

              {/* Sales ID */}
              <div className="field-text" style={{
                position: 'absolute',
                ...fieldPositions.salesId,
                fontFamily: '"Courier New", "Courier", monospace',
                fontSize: '10pt',
                fontWeight: 'bold',
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
                fontWeight: 'bold',
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
                fontWeight: 'bold',
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
                fontWeight: 'bold',
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
                fontWeight: 'bold',
                lineHeight: '1',
                margin: '0',
                padding: '0'
              }}>
                {page.pageNumber} of {totalPages}
              </div>

              {/* Product Rows for this page - DYNAMIC POSITIONING based on line wraps */}
              {(() => {
                let cumulativeTop = ITEMS_START_TOP_MM;
                return page.items.map((item, itemIndex) => {
                  const lines = estimateLines(getItemDisplayText(
                    item,
                    sale?.isCustomerReturn ? sale.originalInvoiceNumber : undefined,
                    sale?.isCustomerReturn ? sale.originalInvoiceDate : undefined,
                  ));
                  const hasNotes = !!(item.notes || item.remarks);
                  const itemHeight = lines * ROW_HEIGHT_MM + (hasNotes ? NOTES_EXTRA_GAP_MM : 0);
                  const topPosition = cumulativeTop;
                  cumulativeTop += itemHeight;

                  return (
                    <React.Fragment key={itemIndex}>
                      {/* Quantity */}
                      <div className="field-text" style={{
                        position: 'absolute',
                        top: `${topPosition}mm`,
                        left: fieldPositions.columns.quantity.left,
                        width: fieldPositions.columns.quantity.width,
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

                      {/* Product Description */}
                      <div className="field-text" style={{
                        position: 'absolute',
                        top: `${topPosition}mm`,
                        left: fieldPositions.columns.description.left,
                        width: fieldPositions.columns.description.width,
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
                        {sale?.isCustomerReturn && sale?.originalInvoiceNumber && (
                          <span style={{ fontStyle: 'normal', fontWeight: 'normal' }}>
                            {" ("}
                            {sale.originalInvoiceDate && `${new Date(`${sale.originalInvoiceDate}T00:00:00`).toLocaleDateString('en-GB')}, `}
                            Invoice: {sale.originalInvoiceNumber}
                            {(item.notes || item.remarks) ? `, ${item.notes || item.remarks}` : ""}
                            {")"}
                          </span>
                        )}
                        {sale?.isCustomerDiscount && (item.notes || item.remarks) && (
                          <span style={{ fontStyle: 'normal', fontWeight: 'normal' }}>
                            {' '}({item.notes || item.remarks})
                          </span>
                        )}
                        {(item.notes || item.remarks) && !(sale?.isCustomerReturn || sale?.isCustomerDiscount) && (
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
                        fontSize: '11pt',
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

              {/* Porterage - on last page */}
              {page.isLastPage && porterage > 0 && (
                <>
                  <div className="field-text" style={{
                    position: 'absolute',
                    top: `${ITEMS_START_TOP_MM + page.itemsHeight}mm`,
                    left: fieldPositions.columns.description.left,
                    width: fieldPositions.columns.description.width,
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
                    left: fieldPositions.columns.value.left,
                    width: fieldPositions.columns.value.width,
                    textAlign: fieldPositions.columns.value.align,
                    fontFamily: '"Courier New", "Courier", monospace',
                    fontSize: '11pt',
                    fontWeight: 'bold',
                    lineHeight: '1',
                    margin: '0',
                    padding: '0',
                    whiteSpace: 'nowrap'
                  }}>
                    {formatMoney(porterage)}
                  </div>
                </>
              )}

              {/* Packages line - on last page */}
              {page.isLastPage && (
                <div className="field-text" style={{
                  position: 'absolute',
                  top: `${ITEMS_START_TOP_MM + page.itemsHeight + (porterage > 0 ? ROW_HEIGHT_MM : 0)}mm`,
                  left: fieldPositions.columns.description.left,
                  width: fieldPositions.columns.description.width,
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
              {page.isLastPage && sale?.isCustomerDiscount && !sale?.hasMultipleDiscountLines && (
                <div className="field-text" style={{
                  position: 'absolute',
                  top: `${ITEMS_START_TOP_MM + page.itemsHeight + (porterage > 0 ? ROW_HEIGHT_MM : 0) + ROW_HEIGHT_MM}mm`,
                  left: fieldPositions.columns.description.left,
                  width: fieldPositions.columns.description.width,
                  fontFamily: '"Courier New", "Courier", monospace',
                  fontSize: '10pt',
                  fontWeight: 'bold',
                  lineHeight: '1',
                  margin: '0',
                  padding: '0',
                  whiteSpace: 'normal',
                }}>
                  Each box: £{Number(sale.discountPerBox || 0).toFixed(2)}
                </div>
              )}
              {page.isLastPage && sale?.notes?.trim() && (
                <div className="field-text" style={{
                  position: 'absolute',
                  top: `${ITEMS_START_TOP_MM + page.itemsHeight + (porterage > 0 ? ROW_HEIGHT_MM : 0) + ROW_HEIGHT_MM * (sale?.isCustomerDiscount && !sale?.hasMultipleDiscountLines ? 2 : 1)}mm`,
                  left: fieldPositions.columns.description.left,
                  width: fieldPositions.columns.description.width,
                  fontFamily: '"Courier New", "Courier", monospace',
                  fontSize: '9pt',
                  fontWeight: 'normal',
                  lineHeight: '1.1',
                  margin: '0',
                  padding: '0',
                  wordWrap: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}>
                  Remarks: {sale.notes}
                </div>
              )}

              {/* Totals - only show on last page */}
              {page.isLastPage && (
                <>
                  {/* Goods total - commented out
                  <div className="field-text" style={{
                    position: 'absolute',
                    top: fieldPositions.totals.goods.top,
                    left: fieldPositions.totals.goods.left,
                    width: fieldPositions.totals.goods.width,
                    textAlign: fieldPositions.totals.goods.align as TextAlign,
                    fontFamily: '"Courier New", "Courier", monospace',
                    fontSize: '11pt',
                    fontWeight: 'bold',
                    lineHeight: '1',
                    margin: '0',
                    padding: '0',
                    whiteSpace: 'nowrap'
                  }}>
                    £{totalAmount.toFixed(2)}
                  </div>

                   VAT total - commented out
                  <div className="field-text" style={{
                    position: 'absolute',
                    top: fieldPositions.totals.vat.top,
                    left: fieldPositions.totals.vat.left,
                    width: fieldPositions.totals.vat.width,
                    textAlign: fieldPositions.totals.vat.align as TextAlign,
                    fontFamily: '"Courier New", "Courier", monospace',
                    fontSize: '11pt',
                    fontWeight: 'bold',
                    lineHeight: '1',
                    margin: '0',
                    padding: '0',
                    whiteSpace: 'nowrap'
                  }}>
                    £{vatAmount.toFixed(2)}
                  </div>
                  */}

                  <div className="field-text" style={{
                    position: 'absolute',
                    top: fieldPositions.totals.total.top,
                    left: fieldPositions.totals.total.left,
                    width: fieldPositions.totals.total.width,
                    textAlign: fieldPositions.totals.total.align as TextAlign,
                    fontFamily: '"Courier New", "Courier", monospace',
                    fontSize: '11pt',
                    fontWeight: 'bold',
                    lineHeight: '1',
                    margin: '0',
                    padding: '0',
                    whiteSpace: 'nowrap'
                  }}>
                    {formatMoney(totalAmount + vatAmount + porterage)}
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