@echo off
echo 🖨️  Starting Windows Auto Print Service
echo ====================================
echo.
echo 📋 This service:
echo    - Opens Chrome with invoice
echo    - Uses Windows SendKeys to press Ctrl+P
echo    - Automatically presses Enter to print
echo    - Uses your default printer and paper size
echo.
echo ⚠️  IMPORTANT: Set EPSON LQ-350 ESC/P2 as DEFAULT printer first!
echo.
echo 🔧 Steps to set default printer:
echo    1. Go to Settings > Printers & scanners
echo    2. Click on "EPSON LQ-350 ESC/P2"
echo    3. Click "Set as default"
echo    4. Set paper size to "DOT MATRIX (18.6x20)"
echo.
echo 🔄 Starting service (Press Ctrl+C to stop)...
echo.
node windows-auto-print.js
pause