// Test script to verify print service functionality
const PCPrintService = require('./pc-print-service.js');

console.log('🧪 Testing Print Service Configuration...');
console.log('');

// Test the service configuration
const service = new PCPrintService();

console.log('✅ Print Service Configuration:');
console.log(`   VPS URL: ${service.vpsUrl}`);
console.log(`   Printer: ${service.printerName}`);
console.log(`   Paper Size: ${service.customPaperSize}`);
console.log(`   Poll Interval: ${service.pollInterval}ms`);
console.log('');

console.log('🔧 To start the actual service, run:');
console.log('   node pc-print-service.js');
console.log('');

console.log('📋 Make sure:');
console.log('   1. Your printer "EPSON LQ-350 ESC/P2" is connected and online');
console.log('   2. Custom paper size "DOTMATRIX" is configured in printer settings');
console.log('   3. VPS is accessible at https://tropifruituk.net');
console.log('   4. Chrome or Edge browser is installed');