@echo off
echo 🖨️  Starting Auto Chrome Print Service
echo ====================================
echo.
echo 📋 This service:
echo    - Uses Puppeteer to control Chrome automatically
echo    - Opens print dialog for each job
echo    - You select printer and paper size in the dialog
echo    - Provides full control over print settings
echo.
echo 🔧 When print dialog appears:
echo    1. Select "EPSON LQ-350 ESC/P2" printer
echo    2. Click "More settings"
echo    3. Set Paper size to "DOT MATRIX (18.6x20)"
echo    4. Click Print
echo.
echo 🔄 Starting service (Press Ctrl+C to stop)...
echo.
node auto-chrome-service.js
pause