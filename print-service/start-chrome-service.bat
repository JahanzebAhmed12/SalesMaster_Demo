@echo off
echo 🖨️  Starting Chrome Print Service
echo ================================
echo.
echo 📋 This service:
echo    - Uses Chrome directly for printing
echo    - Bypasses PDF generation
echo    - Uses your saved custom paper size: DOT MATRIX (18.6x20)
echo    - Prints HTML directly to EPSON LQ-350 ESC/P2
echo.
echo 🔧 Make sure:
echo    1. Chrome is installed
echo    2. Your custom paper size is saved in printer settings
echo    3. Printer is online and ready
echo.
echo 🔄 Starting service (Press Ctrl+C to stop)...
echo.
node chrome-print-service.js
pause