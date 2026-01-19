// Windows Auto Print Service - Uses Windows automation to click Print button
const fetch = require('node-fetch');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class WindowsAutoPrintService {
  constructor() {
    this.vpsUrl = 'https://tropifruituk.net';
    this.pollInterval = 10000;
    this.printerName = 'EPSON LQ-350 ESC/P2';
    this.customPaperSize = 'DOT MATRIX (18.6x20)';
    this.isProcessing = false;
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
    console.log('🖨️  Windows Auto Print Service Starting...');
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

      // Use Windows automation to handle printing
      await this.windowsAutoPrint(tempHtmlPath);

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

  async windowsAutoPrint(htmlFilePath) {
    return new Promise((resolve, reject) => {
      console.log('🖨️  Starting Windows automated print...');

      // Open Chrome with the HTML file
      const chromeCommand = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --new-window "file:///${htmlFilePath.replace(/\\/g, '/')}"`;

      exec(chromeCommand, (chromeError) => {
        if (chromeError) {
          reject(new Error(`Failed to open Chrome: ${chromeError.message}`));
          return;
        }

        console.log('✅ Chrome opened with invoice');
        console.log('⏳ Waiting for Chrome to load...');

        // Wait for Chrome to load
        setTimeout(() => {
          console.log('🔧 Sending automated keystrokes...');

          // Create PowerShell script to automate the print process
          const automationScript = `
Add-Type -AssemblyName System.Windows.Forms

# Wait a bit more for Chrome to be ready
Start-Sleep -Seconds 2

# Send Ctrl+P to open print dialog
[System.Windows.Forms.SendKeys]::SendWait("^p")

# Wait for print dialog to open
Start-Sleep -Seconds 3

# Send Enter to print with default settings
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

Write-Host "Print automation completed"
          `;

          const scriptPath = path.join(this.tempDir, 'print-automation.ps1');
          fs.writeFileSync(scriptPath, automationScript);

          // Execute the PowerShell automation script
          const psCommand = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;

          exec(psCommand, (psError, stdout, stderr) => {
            // Clean up the script file
            try {
              fs.unlinkSync(scriptPath);
            } catch (e) {
              // Ignore cleanup errors
            }

            if (psError) {
              console.log('⚠️  PowerShell automation failed:', psError.message);
              console.log('📋 Chrome is open - you may need to press Ctrl+P and print manually');
            } else {
              console.log('✅ Print automation completed');
              console.log('📋 Output:', stdout.trim());
            }

            // Wait a bit more for printing to complete
            setTimeout(resolve, 5000);
          });

        }, 3000); // Wait 3 seconds for Chrome to load
      });
    });
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
      fs.writeFileSync(path.join(__dirname, 'windows-auto-status.json'), JSON.stringify(statusData, null, 2));
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
console.log('🚀 Starting Windows Auto Print Service');
console.log('📝 This service:');
console.log('   1. Opens Chrome with invoice');
console.log('   2. Uses Windows SendKeys to press Ctrl+P');
console.log('   3. Automatically presses Enter to print');
console.log('   4. Uses your default printer settings');
console.log('');
console.log('⚠️  Make sure EPSON LQ-350 ESC/P2 is set as default printer');
console.log('');

const service = new WindowsAutoPrintService();
service.start().catch(error => {
  console.error('💀 Failed to start Windows Auto Print Service:', error);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Windows Auto Print Service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Windows Auto Print Service...');
  process.exit(0);
});