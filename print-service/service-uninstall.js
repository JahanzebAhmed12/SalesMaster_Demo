/**
 * SalesMaster Print Service — Windows Service Uninstaller
 * 
 * Run as Administrator:  node service-uninstall.js
 */

const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name:   'SalesMaster Print Service',
  script: path.join(__dirname, 'auto-chrome-service.js'),
});

svc.on('uninstall', () => {
  console.log('✅ Service uninstalled successfully.');
  console.log('   The service has been removed from Windows Services.');
});

svc.on('error', (err) => {
  console.error('❌ Service error:', err);
  console.error('   Make sure you are running as Administrator.');
});

console.log('Uninstalling SalesMaster Print Service...');
svc.uninstall();
