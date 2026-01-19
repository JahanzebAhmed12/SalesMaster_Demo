// Simple Chrome Test - Opens Chrome for Manual Print Testing
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

async function simpleTest() {
  console.log('🧪 Simple Chrome Print Test');
  console.log('===========================');
  console.log('');

  // Create a simple test HTML file
  const testHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Simple Print Test</title>
  <style>
    @page { 
      size: 186mm 200mm; 
      margin: 0; 
    }
    body { 
      font-family: "Courier New", monospace; 
      padding: 10mm;
      width: 186mm;
      height: 200mm;
    }
    .test-content {
      font-size: 12pt;
      line-height: 1.5;
    }
  </style>
  <script>
    // Automatically trigger print dialog when page loads
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.print();
      }, 1000); // Wait 1 second for page to fully load
    });
  </script>
</head>
<body>
  <div class="test-content">
    <h2>CHROME PRINT TEST</h2>
    <p>Date: ${new Date().toLocaleString()}</p>
    <p>Printer: EPSON LQ-350 ESC/P2</p>
    <p>Paper Size: DOT MATRIX (18.6x20)</p>
    <p></p>
    <p>Instructions:</p>
    <p>1. Press Ctrl+P to open print dialog</p>
    <p>2. Select your EPSON LQ-350 ESC/P2 printer</p>
    <p>3. Choose "More settings"</p>
    <p>4. Set Paper size to "DOT MATRIX (18.6x20)"</p>
    <p>5. Click Print</p>
    <p></p>
    <p>If this prints correctly with proper</p>
    <p>alignment, the Chrome service will work!</p>
  </div>
</body>
</html>`;

  // Ensure temp directory exists
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const testFilePath = path.join(tempDir, 'simple-test.html');
  fs.writeFileSync(testFilePath, testHTML);
  console.log('✅ Test HTML created:', testFilePath);
  console.log('');
  
  // Open Chrome with the test file
  console.log('🔄 Opening Chrome...');
  const chromeCommand = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" "file:///${testFilePath.replace(/\\/g, '/')}"`;
  
  exec(chromeCommand, (error) => {
    if (error) {
      console.log('❌ Failed to open Chrome:', error.message);
      console.log('');
      console.log('💡 Try opening the file manually:');
      console.log(`   ${testFilePath}`);
    } else {
      console.log('✅ Chrome opened successfully!');
      console.log('');
      console.log('📋 Next steps:');
      console.log('   1. Press Ctrl+P in Chrome');
      console.log('   2. Select EPSON LQ-350 ESC/P2 printer');
      console.log('   3. Set paper size to "DOT MATRIX (18.6x20)"');
      console.log('   4. Print and check alignment');
      console.log('');
      console.log('✅ If it prints correctly, the Chrome service will work!');
    }
  });
}

// Run the test
simpleTest().catch(error => {
  console.error('💀 Test failed:', error);
});