@echo off
:: Must run as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ ERROR: This script must be run as Administrator.
    echo    Right-click INSTALL-SERVICE.bat and select "Run as administrator"
    pause
    exit /b 1
)

echo ============================================
echo   SalesMaster Print Service - INSTALLER
echo ============================================
echo.

:: Install node-windows if not already present
if not exist "node_modules\node-windows" (
    echo Installing dependencies...
    npm install
    echo.
)

echo Installing Windows Service...
node service-install.js

echo.
echo ============================================
echo   Installation complete!
echo   The service will start automatically
echo   on every Windows boot.
echo ============================================
pause
