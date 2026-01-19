@echo off
echo 🖨️  Starting Full Auto Chrome Print Service
echo ==========================================
echo.
echo 📋 This service:
echo    - Opens Chrome with invoice automatically
echo    - Triggers print dialog automatically  
echo    - Attempts to click Print button automatically
echo    - Uses Puppeteer for full browser control
echo.
echo 🔧 If automation fails, you can click Print manually
echo.
echo 🔄 Starting service (Press Ctrl+C to stop)...
echo.
node full-auto-chrome.js
pause