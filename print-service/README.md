# PC Print Service - Standalone

A completely standalone print service for your dot matrix printer.

## 🚀 Quick Setup

### 1. Prerequisites
- **Node.js** installed (download from [nodejs.org](https://nodejs.org/))
- **Dot Matrix Printer** connected to your PC

### 2. Configuration
Edit `pc-print-service.js` and update:
```javascript
this.vpsUrl = 'https://your-actual-domain.com'; // Line 13
this.printerName = 'Your Actual Printer Name';  // Line 15
```

### 3. Run the Service
Double-click **`start-print-service.bat`**

That's it! The service will:
- ✅ Install dependencies automatically
- ✅ Connect to your VPS
- ✅ Poll for print jobs
- ✅ Print invoices to your dot matrix printer

## 📁 Files Included

- `pc-print-service.js` - Main service
- `package.json` - Dependencies (separate from your main project)
- `start-print-service.bat` - Easy launcher
- `README.md` - This file

## 🔧 Troubleshooting

**Service closes immediately?**
- Make sure Node.js is installed
- Run as Administrator if needed
- Check that all files are in the same folder

**Can't connect to VPS?**
- Update the VPS URL in the service file
- Check your internet connection
- Ensure VPS is running

**Print jobs not working?**
- Set your dot matrix printer as default
- Check printer is connected and powered on
- Verify printer name in configuration

## 📊 Status Monitoring

The service creates a `service-status.json` file with:
- Connection status
- Jobs processed
- Last job time
- Error messages

## 🛑 Stopping the Service

Press `Ctrl+C` in the command window or close the window.

---

This is a completely standalone version that won't interfere with your main project!