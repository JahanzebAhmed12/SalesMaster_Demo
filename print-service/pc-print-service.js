// PC Print Service - Standalone Executable Version
// No installation required - just run with Node.js

const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const PrintHelper = require('./print-helper');

class PCPrintService {
  constructor() {
    // IMPORTANT: Replace with your actual VPS URL
    this.vpsUrl = 'https://tropifruituk.net'; // Replace with your VPS URL
    this.pollInterval = 10000; // Check every 5 seconds
    this.printerName = 'EPSON LQ-350 ESC/P2'; // Replace with actual printer name
    this.customPaperSize = 'DOT MATRIX (18.6x20)'; // Your custom paper size name
    // this.printerName = 'Microsoft Print to PDF'; // Replace with actual printer name
    // this.customPaperSize = 'A4'; // Your custom paper size name
    this.isProcessing = false;
    this.tempDir = path.join(__dirname, 'temp');
    this.startTime = new Date();
    this.jobsProcessed = 0;
    this.lastJobTime = null;
    this.vpsConnected = false;

    // Create temp directory if it doesn't exist
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async start() {
    console.log('🖨️  PC Print Service Starting...');
    console.log('📡 Connecting to VPS:', this.vpsUrl);
    console.log('🖨️  Target Printer:', this.printerName);

    // Test connection to VPS
    try {
      const response = await fetch(`${this.vpsUrl}/api/health`, { timeout: 10000 });
      if (response.ok) {
        console.log('✅ VPS Connection Successful');
        this.vpsConnected = true;
      } else {
        console.log('❌ VPS Connection Failed - Status:', response.status);
        return;
      }
    } catch (error) {
      console.log('❌ Cannot connect to VPS:', error.message);
      console.log('Please check:');
      console.log('1. VPS URL is correct');
      console.log('2. VPS is running and accessible');
      console.log('3. Internet connection is working');
      return;
    }

    this.startPolling();
    this.writeStatusFile('running', 'Connected to VPS and polling for jobs');
  }

  async startPolling() {
    console.log('🔄 Starting print job polling...');

    setInterval(async () => {
      if (this.isProcessing) return; // Prevent overlapping requests

      try {
        await this.checkForPrintJobs();
      } catch (error) {
        console.error('❌ Polling error:', error.message);
      }
    }, this.pollInterval);
  }

  async checkForPrintJobs() {
    try {
      const response = await fetch(`${this.vpsUrl}/api/print-queue/pending`, { timeout: 10000 });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const jobs = await response.json();

      if (jobs.length > 0) {
        console.log(`📋 Found ${jobs.length} pending print job(s)`);

        for (const job of jobs) {
          await this.processPrintJob(job);
        }
      }
    } catch (error) {
      console.error('❌ Error checking for jobs:', error.message);
    }
  }

  async processPrintJob(job) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      console.log(`🖨️  Processing Invoice: ${job.invoice_number} (Job ID: ${job.id})`);

      // Update status to 'printing'
      await this.updateJobStatus(job.id, 'printing');

      // Generate the invoice HTML
      const htmlContent = this.generateInvoiceHTML(job.print_data);

      // Create temporary HTML file
      const tempHtmlPath = path.join(this.tempDir, `invoice_${job.id}.html`);
      fs.writeFileSync(tempHtmlPath, htmlContent);

      // Use Puppeteer to generate PDF
      const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });

      const page = await browser.newPage();

      await page.goto(`file://${tempHtmlPath}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Generate PDF and save it first
      const pdfPath = path.join(this.tempDir, `invoice_${job.id}.pdf`);
      
      console.log('📄 PDF Generation Settings:');
      console.log('   Width: 186mm (7.32 inches)');
      console.log('   Height: 200mm (7.87 inches)');
      console.log('   Margins: 0mm');
      console.log('   Format: Custom dot matrix size');
      
      await page.pdf({
        path: pdfPath,
        width: '186mm',    // 18.6cm width for dot matrix
        height: '200mm',   // 20cm height for dot matrix
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        printBackground: true,
        preferCSSPageSize: true,
        format: undefined  // Use custom dimensions
      });

      await browser.close();

      // Verify PDF was created successfully
      if (!fs.existsSync(pdfPath)) {
        throw new Error('PDF generation failed - file not created');
      }

      const pdfStats = fs.statSync(pdfPath);
      console.log(`✅ PDF generated successfully: ${pdfPath}`);
      console.log(`📊 PDF file size: ${(pdfStats.size / 1024).toFixed(2)} KB`);
      console.log('');

      // Now print the saved PDF file
      console.log('🖨️  Now printing the saved PDF file...');
      console.log('⏳ Waiting 2 seconds before printing (you can inspect the PDF if needed)...');
      
      // Small delay to allow PDF inspection if needed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if printing should be skipped (for testing)
      if (process.env.SKIP_PRINTING === 'true') {
        console.log('⏭️  Skipping print (SKIP_PRINTING=true) - PDF ready for manual testing');
      } else {
        await this.printPDF(pdfPath);
      }

      // Don't clean up immediately - keep PDF for inspection
      // this.cleanupTempFiles(tempHtmlPath, pdfPath);
      console.log(`📁 Files preserved for inspection:`);
      console.log(`   HTML: ${tempHtmlPath}`);
      console.log(`   PDF: ${pdfPath}`);

      // Update status to 'completed'
      await this.updateJobStatus(job.id, 'completed');
      this.jobsProcessed = (this.jobsProcessed || 0) + 1;
      this.lastJobTime = new Date();
      this.writeStatusFile('running', `Successfully printed Invoice: ${job.invoice_number}`);
      console.log(`✅ Successfully printed Invoice: ${job.invoice_number}`);

    } catch (error) {
      console.error(`❌ Print job failed for Invoice ${job.invoice_number}:`, error.message);
      await this.updateJobStatus(job.id, 'failed', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  async printPDF(pdfPath) {
    try {
      console.log('🖨️  Sending PDF to printer...');
      console.log(`📄 Using printer: ${this.printerName}`);
      console.log(`📄 Using custom paper size: ${this.customPaperSize}`);
      
      // Check printer status first
      const printerStatus = await PrintHelper.checkPrinterStatus(this.printerName);
      
      if (!printerStatus.available) {
        console.log('❌ Printer not available:', printerStatus.error);
        console.log('📋 Available printers:');
        const availablePrinters = await PrintHelper.listAvailablePrinters();
        console.log(availablePrinters);
        throw new Error(`Printer "${this.printerName}" not available: ${printerStatus.error}`);
      }
      
      console.log('✅ Printer is available and ready');
      console.log('📋 Printer status:', printerStatus.status);
      
      // Use the print helper to queue the job
      await PrintHelper.printToQueue(pdfPath, this.printerName);
      
      console.log('✅ PDF successfully queued to Windows print spooler');
      
    } catch (error) {
      console.error('❌ Print operation failed:', error.message);
      throw error;
    }
  }

  cleanupTempFiles(...filePaths) {
    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn(`⚠️  Could not delete temp file ${filePath}:`, error.message);
      }
    });
  }

  generateInvoiceHTML(printData) {
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

  async updateJobStatus(jobId, status, errorMessage = null) {
    try {
      const response = await fetch(`${this.vpsUrl}/api/print-queue/${jobId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status,
          error_message: errorMessage
        }),
        timeout: 10000
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Failed to update job status:', error.message);
    }
  }

  writeStatusFile(status, message) {
    const statusData = {
      status: status,
      message: message,
      timestamp: new Date().toISOString(),
      startTime: this.startTime || new Date(),
      jobsProcessed: this.jobsProcessed || 0,
      lastJobTime: this.lastJobTime,
      vpsConnected: this.vpsConnected || false,
      currentStatus: status,
      vpsUrl: this.vpsUrl,
      printerName: this.printerName
    };

    try {
      fs.writeFileSync(path.join(__dirname, 'service-status.json'), JSON.stringify(statusData, null, 2));
    } catch (error) {
      console.warn('⚠️  Could not write status file:', error.message);
    }
  }
}

// Start the service
console.log('🚀 Starting PC Print Service - Standalone Version');
console.log('📝 Configuration Required:');
console.log('   1. Update this.vpsUrl with your actual VPS domain');
console.log('   2. Update this.printerName with your actual printer name');
console.log('   3. Ensure your dot matrix printer is connected and set as default');
console.log('   4. Make sure Node.js is installed on this computer');
console.log('');

const service = new PCPrintService();
service.start().catch(error => {
  console.error('💀 Failed to start PC Print Service:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down PC Print Service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down PC Print Service...');
  process.exit(0);
});