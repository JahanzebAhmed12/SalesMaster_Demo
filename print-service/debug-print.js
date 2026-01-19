// Debug Print Service - Comprehensive Testing
const PrintHelper = require('./print-helper');
const fs = require('fs');
const path = require('path');

async function runDebugTests() {
  console.log('🔍 Print Service Debug Tests');
  console.log('============================');
  console.log('');

  const printerName = 'EPSON LQ-350 ESC/P2';
  
  // Test 1: Check printer availability
  console.log('📋 Test 1: Checking printer availability...');
  const printerStatus = await PrintHelper.checkPrinterStatus(printerName);
  
  if (printerStatus.available) {
    console.log('✅ Printer is available');
    console.log('📋 Status details:', printerStatus.status);
  } else {
    console.log('❌ Printer not available:', printerStatus.error);
    console.log('');
    console.log('📋 Available printers:');
    const availablePrinters = await PrintHelper.listAvailablePrinters();
    console.log(availablePrinters);
    return;
  }
  
  console.log('');
  
  // Test 2: Create a simple test document
  console.log('📋 Test 2: Creating test document...');
  
  const testHTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Print Queue Test</title>
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
    body { 
      font-family: "Courier New", monospace; 
      padding: 10mm;
      width: 186mm;
      height: 200mm;
    }
    .header {
      font-size: 14pt;
      font-weight: bold;
      margin-bottom: 10mm;
    }
    .content {
      font-size: 10pt;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="header">PRINT QUEUE TEST DOCUMENT</div>
  <div class="content">
    <p>Date: ${new Date().toLocaleString()}</p>
    <p>Printer: ${printerName}</p>
    <p>Paper Size: DOT MATRIX (18.6x20)</p>
    <p>Test ID: ${Math.random().toString(36).substr(2, 9)}</p>
    <p></p>
    <p>If you can see this document in your print queue,</p>
    <p>the print service is working correctly!</p>
    <p></p>
    <p>This test verifies:</p>
    <p>- PDF generation</p>
    <p>- Print queue integration</p>
    <p>- Printer communication</p>
    <p>- Paper size handling</p>
  </div>
</body>
</html>`;

  // Ensure temp directory exists
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const testFilePath = path.join(tempDir, 'debug-test.html');
  fs.writeFileSync(testFilePath, testHTML);
  console.log('✅ Test document created:', testFilePath);
  console.log('');
  
  // Test 3: Attempt to print
  console.log('📋 Test 3: Attempting to print test document...');
  console.log('⏳ This will try to queue a print job...');
  
  try {
    await PrintHelper.printToQueue(testFilePath, printerName);
    console.log('✅ Print job submitted successfully!');
    console.log('');
    console.log('📋 Please check:');
    console.log('   1. Windows print queue (Control Panel > Devices and Printers)');
    console.log('   2. Your printer display/status');
    console.log('   3. Physical printer for any activity');
    console.log('');
    console.log('💡 If no job appears in the queue, the issue might be:');
    console.log('   - Printer driver compatibility');
    console.log('   - Windows print spooler service');
    console.log('   - File association settings');
    
  } catch (error) {
    console.log('❌ Print test failed:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting steps:');
    console.log('   1. Check if printer is set as default');
    console.log('   2. Verify printer driver is installed');
    console.log('   3. Test printing from another application');
    console.log('   4. Check Windows print spooler service');
  }
}

// Run the debug tests
runDebugTests().catch(error => {
  console.error('💀 Debug test failed:', error);
});