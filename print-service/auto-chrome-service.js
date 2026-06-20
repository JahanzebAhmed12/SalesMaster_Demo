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

    // CONFIG_MODE=1 means first-time setup: shows the print dialog so you can
    // manually pick printer + paper size. Chrome saves those choices into
    // chrome-profile automatically. Every normal run reuses those saved settings.
    this.configMode = process.env.CONFIG_MODE === '1';

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Create chrome-profile dir if it doesn't exist yet — Chrome will populate it
    if (!fs.existsSync(this.chromeUserDataDir)) {
      fs.mkdirSync(this.chromeUserDataDir, { recursive: true });
      console.log('📁 Created chrome-profile directory (will be populated on first print)');
    }
  }

  async start() {
    if (this.configMode) {
      await this.runConfigMode();
      return;
    }

    console.log('🖨️  Auto Chrome Print Service Starting...');
    console.log('📡 Connecting to VPS:', this.vpsUrl);
    console.log('🖨️  Target Printer:', this.printerName);
    console.log('📄 Custom Paper Size:', this.customPaperSize);
    console.log('📁 Chrome profile path:', this.chromeUserDataDir);
    console.log('📁 Profile folder exists:', fs.existsSync(this.chromeUserDataDir));
    console.log('📁 Preferences file exists:', fs.existsSync(path.join(this.chromeUserDataDir, 'Default', 'Preferences')));

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

  async runConfigMode() {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║         PRINT SETTINGS CONFIGURATION MODE                ║');
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log('║  A sample invoice will open in Chrome with the print     ║');
    console.log('║  dialog. Set your printer and paper size, then click     ║');
    console.log('║  Print. Chrome saves those settings automatically.       ║');
    console.log('║                                                           ║');
    console.log('║  Steps:                                                   ║');
    console.log('║  1. Select your printer (EPSON LQ-350 ESC/P2)            ║');
    console.log('║  2. Click "More settings"                                 ║');
    console.log('║  3. Set Paper size to "DOT MATRIX (18.6x20)"             ║');
    console.log('║  4. Set Margins to "None"                                 ║');
    console.log('║  5. Click Print                                           ║');
    console.log('║                                                           ║');
    console.log('║  After printing, those settings are saved to             ║');
    console.log('║  chrome-profile/ and used for every automatic print.     ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');

    // Generate a sample invoice HTML for the config print
    const sampleData = {
      sale: {
        id: 'CONFIG',
        invoice_number: 'CONFIG-TEST',
        date: new Date().toISOString(),
        vat_amount: 0
      },
      items: [
        { quantity: 1, product_name: '*** PAPER SIZE CONFIG TEST ***', unit_price: 0, total_price: 0 },
        { quantity: 0, product_name: 'Set printer: EPSON LQ-350 ESC/P2', unit_price: 0, total_price: 0 },
        { quantity: 0, product_name: 'Paper: DOT MATRIX (18.6x20)', unit_price: 0, total_price: 0 },
        { quantity: 0, product_name: 'Margins: None', unit_price: 0, total_price: 0 },
      ],
      customer: {
        id: '0',
        customer_name: 'CONFIGURATION TEST',
        address: 'This is a test print to save\nyour paper size settings.'
      }
    };

    const htmlContent = this.generateInvoiceHTML(sampleData);
    const configHtmlPath = path.join(this.tempDir, 'config-test.html');
    fs.writeFileSync(configHtmlPath, htmlContent);

    await this.printWithPuppeteer(configHtmlPath, true);

    console.log('');
    console.log('✅ Configuration complete! Settings saved to chrome-profile/');
    console.log('   Run the normal service now — it will use these settings automatically.');
    console.log('');
  }

  async printWithPuppeteer(htmlFilePath, isConfigMode = false) {
    if (isConfigMode) {
      console.log('🔧 Opening print dialog for configuration...');
      console.log('   Chrome window will appear — set your paper size and print.');
    } else {
      console.log('🖨️  Printing with Chrome (off-screen, silent)...');
      console.log(`📄 Using saved settings from chrome-profile/`);
    }

    // Config mode: visible window, normal size, NO kiosk-printing (dialog stays open)
    // Normal mode: off-screen window, kiosk-printing (dialog auto-confirms with saved settings)
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      `--user-data-dir=${this.chromeUserDataDir}`,
    ];

    if (!isConfigMode) {
      // Off-screen for normal automated printing (no kiosk-printing needed
      // since we print the PDF directly via SumatraPDF, not window.print())
      args.push('--window-position=-32000,-32000');
      args.push('--window-size=1,1');
    }

    // Find real Chrome installation — Puppeteer's bundled Chromium does NOT have
    // access to Windows printer drivers. We must use the real Chrome so it can
    // see the EPSON printer and the saved paper size from the profile.
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.CHROME_PATH, // allow override via environment variable
    ].filter(Boolean);

    let executablePath = null;
    for (const p of chromePaths) {
      if (fs.existsSync(p)) {
        executablePath = p;
        break;
      }
    }

    if (executablePath) {
      console.log(`✅ Using real Chrome: ${executablePath}`);
    } else {
      console.warn('⚠️  Real Chrome not found — falling back to bundled Chromium.');
      console.warn('   Printer drivers may not be available. Set CHROME_PATH env var to override.');
    }

    console.log('─────────────────────────────────────────────');
    console.log('🔍 LAUNCH DEBUG:');
    console.log(`   __dirname          : ${__dirname}`);
    console.log(`   chromeUserDataDir  : ${this.chromeUserDataDir}`);
    console.log(`   Profile exists     : ${fs.existsSync(this.chromeUserDataDir)}`);
    const prefsPath = path.join(this.chromeUserDataDir, 'Default', 'Preferences');
    console.log(`   Preferences exists : ${fs.existsSync(prefsPath)}`);
    if (fs.existsSync(prefsPath)) {
      try {
        const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
        const sticky = prefs?.printing?.print_preview_sticky_settings?.appState;
        if (sticky) {
          const appState = JSON.parse(sticky);
          const media = appState?.mediaSize;
          console.log(`   Saved paper size   : ${media?.custom_display_name || 'NOT SET'} (${media?.width_microns}x${media?.height_microns} microns)`);
          console.log(`   Saved printer      : ${appState?.recentDestinations?.[0]?.displayName || 'NOT SET'}`);
        } else {
          console.log('   Saved paper size   : NOT FOUND in Preferences');
        }
      } catch (e) {
        console.log(`   Preferences parse error: ${e.message}`);
      }
    }
    console.log(`   executablePath     : ${executablePath || 'bundled Chromium'}`);
    console.log(`   mode               : ${isConfigMode ? 'CONFIG (dialog visible)' : 'PRINT (kiosk silent)'}`);
    console.log('─────────────────────────────────────────────');

    const browser = await puppeteer.launch({
      headless: false,
      executablePath: executablePath || undefined,
      args,
    });

    try {
      const page = await browser.newPage();

      page.on('pageerror', err => console.error('❌ Page error:', err.message));

      console.log(`📂 Loading file: ${htmlFilePath}`);
      await page.goto(`file://${htmlFilePath}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      console.log('✅ Page loaded');

      if (isConfigMode) {
        // Config mode: open the print dialog and wait for the user to set settings and print.
        // Chrome saves whatever they choose (printer, paper size, margins) into chrome-profile/
        // automatically. Every subsequent normal run reuses those saved settings.
        await page.evaluate(() => window.print());
        console.log('📋 Print dialog open — select your printer + paper size + margins, then click Print...');
        console.log('   (Close the Chrome window when done)');
        // Wait until user closes the browser window
        await new Promise(resolve => browser.on('disconnected', resolve));
        console.log('✅ Browser closed — settings saved to chrome-profile/');

      } else {
        // Normal mode: generate PDF via CDP at exact dimensions, then send to printer.
        let cdpSession = null;
        try {
          cdpSession = await page.target().createCDPSession();
        } catch (e) {
          console.log('⚠️  CDP session not available');
        }

        // Declare pdfPath here so it's accessible for both the PDF write and the print command
        let pdfPath = null;

        if (cdpSession) {
          try {
            // 189mm x 203.2mm in inches — matches printer's 8" page length setting
            // (203.2mm = 8 inches, the physical page length set on the EPSON LQ-350)
            const result = await cdpSession.send('Page.printToPDF', {
              paperWidth:  189   / 25.4,  // 7.44 inches
              paperHeight: 203.2 / 25.4,  // 8.00 inches — must match printer page length
              marginTop: 0,
              marginBottom: 0,
              marginLeft: 0,
              marginRight: 0,
              printBackground: true,
              preferCSSPageSize: false,
            });

            pdfPath = htmlFilePath.replace('.html', '_preview.pdf');
            fs.writeFileSync(pdfPath, Buffer.from(result.data, 'base64'));
            const sizeKB = (fs.statSync(pdfPath).size / 1024).toFixed(1);
            console.log(`✅ Preview PDF: ${pdfPath} (${sizeKB} KB) — open to verify layout`);
          } catch (pdfErr) {
            console.warn('⚠️  Could not generate PDF:', pdfErr.message);
          }
        }

        if (!pdfPath) {
          throw new Error('PDF generation failed — cannot print without a PDF');
        }

        // kiosk-printing auto-confirms the dialog using saved profile settings
        console.log('🖨️  Sending PDF directly to printer (bypassing window.print)...');

        // Print the PDF directly via SumatraPDF — silent, no dialog, exact paper size.
        // This is far more reliable than window.print() which ignores the chrome profile
        // paper size and always defaults to Letter.
        const { execSync } = require('child_process');
        const sumatraPaths = [
          'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
          'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
          path.join(__dirname, 'SumatraPDF.exe'), // local copy next to the service
        ];

        let sumatraExe = null;
        for (const p of sumatraPaths) {
          if (fs.existsSync(p)) {
            sumatraExe = p;
            break;
          }
        }

        if (sumatraExe) {
          console.log(`✅ Found SumatraPDF: ${sumatraExe}`);
          // -print-to: send to specific printer
          // -print-settings: noscale keeps exact PDF dimensions, no fit/shrink to paper
          const cmd = `"${sumatraExe}" -print-to "${this.printerName}" -print-settings "noscale" -silent "${pdfPath}"`;
          console.log(`🖨️  Running: ${cmd}`);
          try {
            const output = execSync(cmd, { timeout: 30000, encoding: 'utf8', stdio: 'pipe' });
            if (output) console.log(`   SumatraPDF output: ${output}`);
            console.log('✅ Print command sent via SumatraPDF');
          } catch (sumatraErr) {
            console.error('❌ SumatraPDF failed:');
            console.error('   stdout:', sumatraErr.stdout || '(none)');
            console.error('   stderr:', sumatraErr.stderr || '(none)');
            console.error('   status:', sumatraErr.status);
            throw new Error(`SumatraPDF error: ${sumatraErr.stderr || sumatraErr.message}`);
          }
        } else {
          // Fallback: window.print() with kiosk-printing if SumatraPDF not installed
          console.warn('⚠️  SumatraPDF not found — falling back to window.print()');
          console.warn('   Download SumatraPDF from https://www.sumatrapdfreader.org/download-free-pdf-viewer');
          console.warn('   Place SumatraPDF.exe next to auto-chrome-service.js for reliable paper size');
          await page.evaluate(() => window.print());
          await new Promise(resolve => setTimeout(resolve, 5000));
          console.log('✅ Print command sent via window.print()');
        }
      }

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
    const vatAmount   = sale?.vat_amount || 0;
    const porterage   = sale?.porterage  || 0;
    const totalQuantity = items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || 0;

    // Field positions — must match dot-matrix-invoice.tsx exactly
    const fp = {
      accountNo:       { top: '27mm',  left: '12mm' },
      customerName:    { top: '35mm',  left: '5mm'  },
      customerAddress: { top: '40mm',  left: '5mm', width: '50mm' },
      salesId:         { top: '77mm',  left: '10mm' },
      ticketNo:        { top: '77mm',  left: '30mm' },
      date:            { top: '77mm',  left: '60mm' },
      time:            { top: '77mm',  left: '95mm' },
      pageNumber:      { top: '77mm',  left: '125mm' },
      itemsStartTop:   95,   // mm (numeric for arithmetic)
      itemsRowHeight:  4,    // mm per row
      maxItemsPerPage: 11,
      columns: {
        quantity:    { left: '4mm',   width: '7mm'  },
        description: { left: '24mm',  width: '72mm' },
        price:       { left: '88mm',  width: '20mm', align: 'right' },
        value:       { left: '105mm', width: '25mm', align: 'right' },
      },
      totals: {
        goods: { top: '167mm', left: '108mm', width: '25mm', align: 'right' },
        vat:   { top: '177mm', left: '108mm', width: '25mm', align: 'right' },
        total: { top: '185mm', left: '108mm', width: '25mm', align: 'right' },
      },
    };

    // Format quantity — strip trailing zeros, keep up to 3 decimals
    const formatQty = (q) => {
      if (q === null || q === undefined || q === '') return '0';
      const n = typeof q === 'string' ? parseFloat(q) : q;
      if (isNaN(n)) return '0';
      return n % 1 === 0 ? n.toString() : parseFloat(n.toFixed(3)).toString();
    };

    // --- Pagination: split items into pages of 11 ---
    const itemsPerPage = fp.maxItemsPerPage;
    const totalPages   = Math.max(1, Math.ceil((items?.length || 0) / itemsPerPage));
    const pages = [];
    for (let i = 0; i < totalPages; i++) {
      pages.push({
        pageNumber: i + 1,
        isLastPage: i === totalPages - 1,
        items: (items || []).slice(i * itemsPerPage, (i + 1) * itemsPerPage),
      });
    }

    // --- Build HTML for each page ---
    const pagesHTML = pages.map((page) => {

      // Items rows — positions are relative to THIS page's wrapper (top resets to 0 each page)
      const itemRowsHTML = page.items.map((item, idx) => {
        const top = fp.itemsStartTop + idx * fp.itemsRowHeight;
        const notes = item.notes || item.remarks;
        const description = `${item.product_name || item.productName || item.description || ''}${notes ? ` <span style="font-style:italic;font-weight:normal;">(${notes})</span>` : ''}`;
        return `
          <div class="ft" style="top:${top}mm;left:${fp.columns.quantity.left};width:${fp.columns.quantity.width};white-space:nowrap;font-weight:bold;">${formatQty(item.quantity)}</div>
          <div class="ft" style="top:${top}mm;left:${fp.columns.description.left};width:${fp.columns.description.width};overflow:hidden;white-space:nowrap;font-weight:bold;">${description}</div>
          <div class="ft" style="top:${top}mm;left:${fp.columns.price.left};width:${fp.columns.price.width};text-align:right;white-space:nowrap;font-weight:bold;">${(item.unit_price || item.unitPrice || 0).toFixed(2)}</div>
          <div class="ft" style="top:${top}mm;left:${fp.columns.value.left};width:${fp.columns.value.width};text-align:right;white-space:nowrap;font-weight:bold;">£${(item.total_price || item.totalPrice || 0).toFixed(2)}</div>`;
      }).join('');

      // Porterage row — last page only, after items
      let extraRowOffset = page.items.length;
      const porterageHTML = (page.isLastPage && porterage > 0) ? (() => {
        const top = fp.itemsStartTop + extraRowOffset * fp.itemsRowHeight;
        extraRowOffset++;
        return `
          <div class="ft" style="top:${top}mm;left:${fp.columns.description.left};width:${fp.columns.description.width};">Porterage</div>
          <div class="ft" style="top:${top}mm;left:${fp.columns.value.left};width:${fp.columns.value.width};text-align:right;">£${porterage.toFixed(2)}</div>`;
      })() : '';

      // Packages line — last page only
      const packagesHTML = page.isLastPage ? (() => {
        const top = fp.itemsStartTop + extraRowOffset * fp.itemsRowHeight;
        return `<div class="ft" style="top:${top}mm;left:${fp.columns.description.left};width:${fp.columns.description.width};">(${formatQty(totalQuantity)} packages)</div>`;
      })() : '';

      // Totals — last page only
      const totalsHTML = page.isLastPage ? `
        <div class="ft" style="top:${fp.totals.goods.top};left:${fp.totals.goods.left};width:${fp.totals.goods.width};text-align:right;font-size:10pt;">£${totalAmount.toFixed(2)}</div>
        <div class="ft" style="top:${fp.totals.vat.top};left:${fp.totals.vat.left};width:${fp.totals.vat.width};text-align:right;font-size:10pt;">£${vatAmount.toFixed(2)}</div>
        <div class="ft" style="top:${fp.totals.total.top};left:${fp.totals.total.left};width:${fp.totals.total.width};text-align:right;font-size:10pt;">£${(totalAmount + vatAmount + porterage).toFixed(2)}</div>` : '';

      const isLast = page.pageNumber === totalPages;
      return `
      <div class="page"${isLast ? ' style="page-break-after:avoid;break-after:avoid;"' : ''}>
        <div class="page-wrapper">
        <div class="ft" style="top:${fp.accountNo.top};left:${fp.accountNo.left};font-size:10pt;font-weight:bold;">C-${customer?.id || sale?.customer_id || ''}</div>
        <div class="ft" style="top:${fp.customerName.top};left:${fp.customerName.left};font-size:10pt;">${customer?.customer_name || customer?.customerName || ''}</div>
        <div class="ft" style="top:${fp.customerAddress.top};left:${fp.customerAddress.left};width:${fp.customerAddress.width};font-size:8pt;white-space:pre-wrap;word-wrap:break-word;line-height:1.2;">${customer?.address || ''}</div>
        <div class="ft" style="top:${fp.salesId.top};left:${fp.salesId.left};font-size:10pt;">${sale?.createdBy || sale?.id || ''}</div>
        <div class="ft" style="top:${fp.ticketNo.top};left:${fp.ticketNo.left};font-size:10pt;">${sale?.invoice_number || sale?.invoiceNumber || ''}</div>
        <div class="ft" style="top:${fp.date.top};left:${fp.date.left};font-size:10pt;">${sale?.date ? new Date(sale.date).toLocaleDateString('en-GB') : '-'}</div>
        <div class="ft" style="top:${fp.time.top};left:${fp.time.left};font-size:10pt;">${sale?.date ? new Date(sale.date).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'}) : ''}</div>
        <div class="ft" style="top:${fp.pageNumber.top};left:${fp.pageNumber.left};font-size:10pt;">${page.pageNumber} of ${totalPages}</div>
        ${itemRowsHTML}
        ${porterageHTML}
        ${packagesHTML}
        ${totalsHTML}
        </div>
      </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${sale?.invoice_number || sale?.invoiceNumber || ''}</title>
  <style>
    @page {
      size: 189mm 203.2mm;
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 189mm;
      font-family: "Courier New", monospace;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    /* Each page div is exactly one physical page.
       Height is 203mm (not 203.2mm) to prevent a blank extra page,
       matching the React component's dot-matrix-print height. */
    .page {
      position: relative;
      width: 189mm;
      height: 203mm;
      overflow: hidden;
      page-break-after: always;
      page-break-inside: avoid;
      break-after: page;
      break-inside: avoid;
    }
    .page:last-child {
      page-break-after: avoid;
      break-after: avoid;
    }
    /* Inner wrapper resets the absolute positioning coordinate space to 200mm.
       Field top/left values (e.g. itemsStartTop: 95mm) are calibrated for
       200mm height — without this wrapper the 3.2mm extra page height shifts
       all content upward relative to the pre-printed form. Mirrors React's
       page-content-wrapper exactly. */
    .page-wrapper {
      position: absolute;
      top: 0;
      left: 0;
      width: 189mm;
      height: 200mm;
      margin: 0;
      padding: 0;
      overflow: hidden;
    }
    /* All fields are absolutely positioned within their page */
    .ft {
      position: absolute;
      font-family: "Courier New", monospace;
      font-size: 9pt;
      line-height: 1;
      color: black;
      background: transparent;
    }
  </style>
</head>
<body>
${pagesHTML}
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