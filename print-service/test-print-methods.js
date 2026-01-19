// Test Different Print Methods
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const printerName = 'EPSON LQ-350 ESC/P2';

async function testPrintMethods() {
  console.log('🧪 Testing Different Print Methods');
  console.log('==================================');
  console.log('');

  // First, check if we have a test PDF
  const testPdfPath = path.join(__dirname, 'temp');
  const pdfFiles = fs.readdirSync(testPdfPath).filter(f => f.endsWith('.pdf'));
  
  if (pdfFiles.length === 0) {
    console.log('❌ No PDF files found in temp folder.');
    console.log('💡 Run the print service first to generate a PDF, then run this test.');
    return;
  }

  const testFile = path.join(testPdfPath, pdfFiles[0]);
  console.log(`📄 Using test file: ${testFile}`);
  console.log('');

  // Test Method 1: Adobe Reader
  console.log('📋 Test 1: Adobe Reader Silent Print');
  await testMethod(
    'Adobe Reader',
    `"C:\\Program Files\\Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe" /t "${testFile}" "${printerName}"`
  );

  // Test Method 2: SumatraPDF
  console.log('📋 Test 2: SumatraPDF');
  await testMethod(
    'SumatraPDF',
    `"C:\\Program Files\\SumatraPDF\\SumatraPDF.exe" -print-to "${printerName}" "${testFile}"`
  );

  // Test Method 3: Default PDF Handler
  console.log('📋 Test 3: Default PDF Handler (Print Verb)');
  await testMethod(
    'Default Handler',
    `powershell -Command "& { Start-Process -FilePath '${testFile}' -Verb Print -WindowStyle Hidden }"`
  );

  // Test Method 4: File Association
  console.log('📋 Test 4: File Association Print');
  await testMethod(
    'File Association',
    `cmd /c start /min "" "${testFile}"`
  );

  console.log('');
  console.log('🔍 Results Summary:');
  console.log('- Check your printer queue after each test');
  console.log('- The method that produces the correct output should be used');
  console.log('- Manual printing works correctly, so we need to find the method that matches that');
}

function testMethod(methodName, command) {
  return new Promise((resolve) => {
    console.log(`⏳ Testing ${methodName}...`);
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.log(`❌ ${methodName} failed: ${error.message}`);
      } else {
        console.log(`✅ ${methodName} executed successfully`);
        if (stdout.trim()) {
          console.log(`📋 Output: ${stdout.trim()}`);
        }
      }
      console.log('');
      
      // Wait 3 seconds between tests
      setTimeout(resolve, 3000);
    });
  });
}

// Run the tests
testPrintMethods().catch(error => {
  console.error('💀 Test failed:', error);
});