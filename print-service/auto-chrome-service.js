// Auto Chrome Print Service - Uses Puppeteer for Automated Printing
// This version automatically handles the print dialog

const fetch = require('node-fetch');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class AutoChromePrintService {
  constructor() {
    this.vpsUrl = 'https://tropifruituk.net';
    this.pollInterval = 10000;
    this.printerName = 'EPSON LQ-350 ESC/P2';
    this.customPaperSize = 'DOT MATRIX (18.6x20)';
    this.isProcessing = false;
    this.chromeUserDataDir = path.join(__dirname, 'chrome-profile');
    this.tempDir = path.join(__dirname, 'temp');
    this.startTime = new Date();
    this.jobsProcessed = 0;
    this.lastJobTime = null;
    this.vpsConnected = false;

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async start() {
    console.log('🖨️  Auto Chrome Print Service Starting...');
    console.log('📡 Connecting to VPS:', this.vpsUrl);
    console.log('🖨️  Target Printer:', this.printerName);
    console.log('📄 Custom Paper Size:', this.customPaperSize);

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
      return;
    }

    this.startPolling();
    this.writeStatusFile('running', 'Connected to VPS and polling for jobs');
  }

  async startPolling() {
    console.log('🔄 Starting print job polling...');

    setInterval(async () => {
      if (this.isProcessing) return;

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

      await this.updateJobStatus(job.id, 'printing');

      const htmlContent = this.generateInvoiceHTML(job.print_data);
      const tempHtmlPath = path.join(this.tempDir, `invoice_${job.id}.html`);
      fs.writeFileSync(tempHtmlPath, htmlContent);

      console.log(`📄 HTML file created: ${tempHtmlPath}`);

      // Use Puppeteer to automatically print
      await this.printWithPuppeteer(tempHtmlPath);

      this.cleanupTempFiles(tempHtmlPath);

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

  async printWithPuppeteer(htmlFilePath) {
    console.log(`🖨️  Printing with Chrome...`);
    console.log(`📄 Using printer: ${this.printerName}`);

    const browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        `--user-data-dir=${this.chromeUserDataDir}`,
        '--window-position=-2000,-2000',
        '--window-size=1200,900',
        '--kiosk-printing',
      ]
    });

    try {
      const page = await browser.newPage();
      page.on('pageerror', err => console.error('❌ Page error:', err.message));

      console.log(`📂 Loading file: ${htmlFilePath}`);
      await page.goto(`file://${htmlFilePath}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      console.log('✅ Page loaded, triggering print...');

      await page.evaluate(() => window.print());
      await new Promise(resolve => setTimeout(resolve, 8000));
      console.log('✅ Print command sent');

    } catch (err) {
      console.error('❌ Print failed:', err.message);
      throw err;
    } finally {
      await browser.close();
    }
  }
  generateInvoiceHTML(printData) {
    const { sale, items, customer } = printData;

    const totalAmount = items?.reduce((sum, item) => sum + (item.total_price || item.totalPrice || 0), 0) || 0;
    const vatAmount = sale?.vat_amount || 0;

    const itemsHTML = items?.map((item, index) => {
      const topPosition = 95 + (index * 6);
      return `
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

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
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
    <div class="field-text" style="position: absolute; top: 27mm; left: 1mm; font-size: 10pt; font-weight: bold; line-height: 1;">
      C-${customer?.id || sale?.customer_id || ''}
    </div>
    <div class="field-text" style="position: absolute; top: 35mm; left: 1mm; font-size: 10pt; line-height: 1;">
      ${customer?.customer_name || customer?.customerName || ''}
    </div>
    <div class="field-text" style="position: absolute; top: 40mm; left: 3mm; width: 50mm; font-size: 8pt; white-space: pre-wrap; word-wrap: break-word; line-height: 1.2;">
      ${customer?.address || ''}
    </div>
    <div class="field-text" style="position: absolute; top: 77mm; left: 23mm; font-size: 10pt; line-height: 1;">
      ${sale?.invoice_number || sale?.invoiceNumber || ''}
    </div>
    <div class="field-text" style="position: absolute; top: 77mm; left: 48mm; font-size: 10pt; line-height: 1;">
      ${sale?.date ? new Date(sale.date).toLocaleDateString('en-GB') : '-'}
    </div>
    <div class="field-text" style="position: absolute; top: 77mm; left: 118mm; font-size: 10pt; line-height: 1;">
      1 of 1
    </div>
    ${itemsHTML}
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
</html>`;
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
      printerName: this.printerName,
      customPaperSize: this.customPaperSize
    };

    try {
      fs.writeFileSync(path.join(__dirname, 'auto-chrome-status.json'), JSON.stringify(statusData, null, 2));
    } catch (error) {
      console.warn('⚠️  Could not write status file:', error.message);
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
}

// Start the service
console.log('🚀 Starting Auto Chrome Print Service (Off-Screen Mode)');
console.log('📝 This service:');
console.log('   1. Launches Chrome off-screen (window moved to -32000,-32000)');
console.log('   2. Uses --kiosk-printing to auto-confirm print dialog');
console.log('   3. Prints with Chrome so custom paper size is respected');
console.log('   4. No visible window, no interaction needed');
console.log('');

const service = new AutoChromePrintService();
service.start().catch(error => {
  console.error('💀 Failed to start Auto Chrome Print Service:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Auto Chrome Print Service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Auto Chrome Print Service...');
  process.exit(0);
});