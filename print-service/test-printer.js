// Test script to verify printer connectivity
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const printerName = 'EPSON LQ-350 ESC/P2';

console.log('🖨️  Testing Printer Connectivity...');
console.log(`Target Printer: ${printerName}`);
console.log('');

// Test 1: Check if printer exists
console.log('📋 Test 1: Checking if printer exists...');
const checkPrinterCommand = `powershell -Command "Get-WmiObject -Query \\"SELECT * FROM Win32_Printer WHERE Name='${printerName}'\\" | Select-Object Name, PrinterStatus, WorkOffline"`;

exec(checkPrinterCommand, (error, stdout, stderr) => {
  if (error) {
    console.log('❌ Error checking printer:', error.message);
    return;
  }
  
  if (stdout.trim()) {
    console.log('✅ Printer found:');
    console.log(stdout);
    
    // Test 2: Create a simple test file and try to print it
    console.log('📋 Test 2: Creating test file...');
    const testContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Print Test</title>
  <style>
    @page { size: 186mm 200mm; margin: 0; }
    body { font-family: "Courier New", monospace; padding: 10mm; }
  </style>
</head>
<body>
  <h1>Print Service Test</h1>
  <p>Date: ${new Date().toLocaleString()}</p>
  <p>Printer: ${printerName}</p>
  <p>If you can see this, the print service is working!</p>
</body>
</html>`;

    const testFilePath = path.join(__dirname, 'temp', 'test-print.html');
    
    // Ensure temp directory exists
    if (!fs.existsSync(path.join(__dirname, 'temp'))) {
      fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
    }
    
    fs.writeFileSync(testFilePath, testContent);
    console.log('✅ Test file created:', testFilePath);
    
    // Test 3: Try to print the test file
    console.log('📋 Test 3: Attempting to print test file...');
    const printCommand = `powershell -Command "Start-Process -FilePath '${testFilePath}' -Verb Print -WindowStyle Hidden"`;
    
    exec(printCommand, (printError, printStdout, printStderr) => {
      if (printError) {
        console.log('❌ Print test failed:', printError.message);
        
        // Try alternative method
        console.log('📋 Trying Windows print command...');
        const altPrintCommand = `print /D:"${printerName}" "${testFilePath}"`;
        
        exec(altPrintCommand, (altError) => {
          if (altError) {
            console.log('❌ Alternative print method also failed:', altError.message);
          } else {
            console.log('✅ Alternative print method succeeded!');
          }
        });
      } else {
        console.log('✅ Print test completed successfully!');
        console.log('📋 Check your printer queue for the test document.');
      }
    });
    
  } else {
    console.log('❌ Printer not found. Available printers:');
    
    // List all available printers
    const listPrintersCommand = `powershell -Command "Get-WmiObject -Query \\"SELECT * FROM Win32_Printer\\" | Select-Object Name, PrinterStatus"`;
    
    exec(listPrintersCommand, (listError, listStdout) => {
      if (listError) {
        console.log('❌ Could not list printers:', listError.message);
      } else {
        console.log(listStdout);
      }
    });
  }
});

console.log('⏳ Running tests... Please wait...');