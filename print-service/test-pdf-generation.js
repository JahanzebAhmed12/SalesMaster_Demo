// Test PDF Generation Only (No Printing)
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function testPDFGeneration() {
  console.log('📄 Testing PDF Generation for Dot Matrix Printer...');
  console.log('');

  // Sample invoice data for testing
  const testData = {
    sale: {
      invoice_number: 'TEST-001',
      date: new Date().toISOString(),
      customer_id: 123,
      vat_amount: 2.50
    },
    customer: {
      id: 123,
      customer_name: 'Test Customer Ltd',
      customerName: 'Test Customer Ltd',
      address: '123 Test Street\nTest City\nTest County\nTE5T 1NG'
    },
    items: [
      {
        quantity: 2,
        product_name: 'Test Product 1',
        productName: 'Test Product 1',
        unit_price: 10.00,
        unitPrice: 10.00,
        total_price: 20.00,
        totalPrice: 20.00
      },
      {
        quantity: 1,
        product_name: 'Another Test Product with Long Name',
        productName: 'Another Test Product with Long Name',
        unit_price: 15.50,
        unitPrice: 15.50,
        total_price: 15.50,
        totalPrice: 15.50
      }
    ]
  };

  // Generate HTML content
  const htmlContent = generateInvoiceHTML(testData);
  
  // Create temp directory
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Save HTML file
  const htmlPath = path.join(tempDir, 'test-invoice.html');
  fs.writeFileSync(htmlPath, htmlContent);
  console.log('✅ HTML file created:', htmlPath);

  // Generate PDF using Puppeteer
  console.log('🔄 Generating PDF...');
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  const pdfPath = path.join(tempDir, 'test-invoice.pdf');
  
  console.log('📄 PDF Settings:');
  console.log('   Width: 186mm (7.32 inches)');
  console.log('   Height: 200mm (7.87 inches)');
  console.log('   Margins: 0mm');
  
  await page.pdf({
    path: pdfPath,
    width: '186mm',
    height: '200mm',
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    printBackground: true,
    preferCSSPageSize: true,
    format: undefined
  });

  await browser.close();

  // Check file size
  const pdfStats = fs.statSync(pdfPath);
  console.log('');
  console.log('✅ PDF generated successfully!');
  console.log(`📁 PDF Location: ${pdfPath}`);
  console.log(`📊 File Size: ${(pdfStats.size / 1024).toFixed(2)} KB`);
  console.log('');
  console.log('🔍 You can now:');
  console.log('   1. Open the PDF to check sizing and alignment');
  console.log('   2. Print it manually to test on your dot matrix printer');
  console.log('   3. Adjust dimensions if needed');
}

function generateInvoiceHTML(printData) {
  const { sale, items, customer } = printData;

  // Calculate totals
  const totalAmount = items?.reduce((sum, item) => sum + (item.total_price || item.totalPrice || 0), 0) || 0;
  const vatAmount = sale?.vat_amount || 0;

  // Generate items HTML
  const itemsHTML = items?.map((item, index) => {
    const topPosition = 95 + (index * 6); // 95mm start + 6mm per row
    return `
      <!-- Item ${index + 1} -->
      <div class="field-text" style="position: absolute; top: ${topPosition}mm; left: 1mm; width: 15mm; font-size: 10pt; line-height: 1;">
        ${item.quantity || 0}
      </div>
      <div class="field-text" style="position: absolute; top: ${topPosition}mm; left: 10mm; width: 75mm; font-size: 10pt; line-height: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${item.product_name || item.productName || item.description || ''}
      </div>
      <div class="field-text" style="position: absolute; top: ${topPosition}mm; left: 77mm; width: 20mm; text-align: right; font-size: 10pt; line-height: 1;">
        ${(item.unit_price || item.unitPrice || 0).toFixed(2)}
      </div>
      <div class="field-text" style="position: absolute; top: ${topPosition}mm; left: 95mm; width: 25mm; text-align: right; font-size: 10pt; line-height: 1;">
        £${(item.total_price || item.totalPrice || 0).toFixed(2)}
      </div>
    `;
  }).join('') || '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=186mm, initial-scale=1.0">
      <title>Invoice ${sale?.invoice_number || sale?.invoiceNumber || ''}</title>
      <style>
        @page { 
          size: 186mm 200mm; 
          margin: 0; 
        }
        @media print {
          @page {
            size: 186mm 200mm;
            margin: 0;
          }
        }
        * { 
          box-sizing: border-box; 
          margin: 0; 
          padding: 0;
          zoom: 1 !important;
          transform: scale(1) !important;
          -webkit-transform: scale(1) !important;
        }
        html, body { 
          width: 186mm; 
          height: 200mm; 
          font-family: "Courier New", monospace; 
          overflow: hidden;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        .dot-matrix-print { 
          position: relative; 
          width: 186mm; 
          height: 200mm; 
          overflow: hidden; 
        }
        .field-text { 
          position: absolute; 
          font-family: "Courier New", monospace; 
          color: black;
          background: transparent;
        }
      </style>
    </head>
    <body>
      <div class="dot-matrix-print">
        <!-- Account Number (Customer ID) -->
        <div class="field-text" style="position: absolute; top: 27mm; left: 1mm; font-size: 10pt; font-weight: bold; line-height: 1;">
          C-${customer?.id || sale?.customer_id || ''}
        </div>

        <!-- Customer Name -->
        <div class="field-text" style="position: absolute; top: 35mm; left: 1mm; font-size: 10pt; line-height: 1;">
          ${customer?.customer_name || customer?.customerName || ''}
        </div>

        <!-- Customer Address -->
        <div class="field-text" style="position: absolute; top: 40mm; left: 3mm; width: 50mm; font-size: 8pt; white-space: pre-wrap; word-wrap: break-word; line-height: 1.2;">
          ${customer?.address || ''}
        </div>

        <!-- Ticket No (Invoice Number) -->
        <div class="field-text" style="position: absolute; top: 77mm; left: 23mm; font-size: 10pt; line-height: 1;">
          ${sale?.invoice_number || sale?.invoiceNumber || ''}
        </div>

        <!-- Date -->
        <div class="field-text" style="position: absolute; top: 77mm; left: 48mm; font-size: 10pt; line-height: 1;">
          ${sale?.date ? new Date(sale.date).toLocaleDateString('en-GB') : '-'}
        </div>

        <!-- Page Number -->
        <div class="field-text" style="position: absolute; top: 77mm; left: 118mm; font-size: 10pt; line-height: 1;">
          1 of 1
        </div>

        <!-- Product Items -->
        ${itemsHTML}

        <!-- Totals -->
        <div class="field-text" style="position: absolute; top: 167mm; left: 96mm; width: 25mm; text-align: right; font-size: 10pt; line-height: 1;">
          £${totalAmount.toFixed(2)}
        </div>

        <div class="field-text" style="position: absolute; top: 177mm; left: 96mm; width: 25mm; text-align: right; font-size: 10pt; line-height: 1;">
          £${vatAmount.toFixed(2)}
        </div>

        <div class="field-text" style="position: absolute; top: 186mm; left: 96mm; width: 25mm; text-align: right; font-size: 10pt; line-height: 1;">
          £${(totalAmount + vatAmount).toFixed(2)}
        </div>
      </div>
    </body>
    </html>
  `;
}

// Run the test
testPDFGeneration().catch(error => {
  console.error('💀 PDF generation test failed:', error);
});