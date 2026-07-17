/**
 * SalesMaster Print Service — Windows Service Installer
 * 
 * Run as Administrator:  node service-install.js
 * 
 * This installs auto-chrome-service.js as a proper Windows Service:
 *   - Visible in services.msc as "SalesMaster Print Service"
 *   - Starts automatically on boot (before login)
 *   - Auto-restarts on crash (up to 3 times)
 *   - Logs to: print-service/logs/
 */

const { Service } = require('node-windows');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists — WinSW/Services wrapper requires it
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
  console.log('📁 Created logs directory:', logDir);
}

const svc = new Service({
  name:        'SalesMaster Print Service',
  description: 'Polls the SalesMaster VPS for print jobs and sends them to the dot matrix printer via Chrome/SumatraPDF.',
  script:      path.join(__dirname, 'auto-chrome-service.js'),
  nodeOptions: [],

  // Working directory — critical so __dirname-based paths resolve correctly
  workingDirectory: __dirname,

  // Restart policy: restart on failure, wait 5s between attempts
  wait:    5,   // seconds before restart
  grow:    0.5, // exponential backoff multiplier
  maxRetries: 3,

  // Log files go into a logs/ subfolder next to the service
  logpath: path.join(__dirname, 'logs'),
});

// Listen for install completion
svc.on('install', () => {
  console.log('✅ Service installed successfully.');
  console.log('   Starting service now...');
  svc.start();
});

svc.on('start', () => {
  console.log('✅ Service started.');
  console.log('');
  console.log('   You can now manage it via:');
  console.log('   • services.msc  (search for "SalesMaster Print Service")');
  console.log('   • sc start "SalesMaster Print Service"');
  console.log('   • sc stop  "SalesMaster Print Service"');
  console.log('   • node service-uninstall.js  (to remove)');
});

svc.on('alreadyinstalled', () => {
  console.log('⚠️  Service is already installed.');
  console.log('   Run "node service-uninstall.js" first to reinstall.');
});

svc.on('error', (err) => {
  console.error('❌ Service error:', err);
  console.error('   Make sure you are running as Administrator.');
});

console.log('Installing SalesMaster Print Service...');
console.log('Script:', path.join(__dirname, 'auto-chrome-service.js'));
console.log('Logs will be written to:', path.join(__dirname, 'logs'));
console.log('');

svc.install();
