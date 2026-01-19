@echo off
echo 📄 Starting PC Print Service - PDF Generation Only
echo ================================================
echo.
echo This mode will generate PDFs but skip printing
echo Use this to test PDF generation and sizing
echo.
echo 🔧 To test different print methods after PDF generation:
echo    node test-print-methods.js
echo.
echo 🔄 Starting service...
echo.

set SKIP_PRINTING=true
node pc-print-service.js

pause