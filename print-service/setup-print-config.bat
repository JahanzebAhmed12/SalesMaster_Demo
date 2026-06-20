@echo off
echo ╔══════════════════════════════════════════════════════════╗
echo ║         PRINT SETTINGS CONFIGURATION                     ║
echo ╠══════════════════════════════════════════════════════════╣
echo ║  Run this ONCE to save your printer + paper size.        ║
echo ║                                                           ║
echo ║  When Chrome opens the print dialog:                     ║
echo ║  1. Select printer: EPSON LQ-350 ESC/P2                  ║
echo ║  2. Click "More settings"                                 ║
echo ║  3. Paper size: DOT MATRIX (18.6x20)                     ║
echo ║  4. Margins: None                                         ║
echo ║  5. Click Print                                           ║
echo ║  6. Close Chrome when done                               ║
echo ║                                                           ║
echo ║  Settings are saved to chrome-profile/ automatically.    ║
echo ║  The normal service will use them from now on.           ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo Starting configuration mode...
echo.
set CONFIG_MODE=1
node auto-chrome-service.js
echo.
echo Configuration saved. You can now run start-auto-chrome.bat
pause
