@echo off
:: Must run as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ ERROR: This script must be run as Administrator.
    echo    Right-click UNINSTALL-SERVICE.bat and select "Run as administrator"
    pause
    exit /b 1
)

echo ============================================
echo   SalesMaster Print Service - UNINSTALLER
echo ============================================
echo.
echo Stopping and removing Windows Service...
node service-uninstall.js

echo.
echo ============================================
echo   Service removed.
echo ============================================
pause
