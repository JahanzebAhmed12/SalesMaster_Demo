@echo off
setlocal
cd /d "%~dp0"

:: Must run as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This installer must be run as Administrator.
    echo Right-click INSTALL-SERVICE.bat and select "Run as administrator".
    pause
    exit /b 1
)

echo ============================================
echo   SalesMaster Print Service - INSTALLER
echo ============================================
echo.

if not exist "config.json" (
    echo WARNING: config.json was not found; the service will use its defaults.
    echo.
)

where node >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Node.js was not found in PATH.
    echo Install Node.js 18 or newer, restart this installer, and try again.
    pause
    exit /b 1
)

node --version
echo.

if not exist "node_modules\node-windows" (
    echo Installing print-service dependencies...
    call npm install --omit=dev --no-audit --no-fund
    if %errorLevel% neq 0 (
        echo ERROR: Dependency installation failed.
        pause
        exit /b 1
    )
    echo.
)

echo Installing Windows Service...
node service-install.js
if %errorLevel% neq 0 (
    echo ERROR: Windows service installation failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Installation complete!
echo   The service will start automatically
echo   on every Windows boot.
echo ============================================
pause
endlocal
