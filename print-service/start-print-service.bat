@echo off
echo ========================================
echo    PC Print Service - Standalone
echo ========================================
echo.

REM Check if Node.js is installed
echo Checking for Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please download and install Node.js from: https://nodejs.org/
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo Node.js detected: 
node --version
echo.

REM Check if package.json exists
if not exist "package.json" (
    echo ERROR: package.json not found!
    echo Make sure you're running this from the print-service directory.
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    echo This may take a few minutes on first run...
    echo.
    npm install
    echo.
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies!
        echo Error code: %errorlevel%
        echo.
        echo Possible solutions:
        echo 1. Check your internet connection
        echo 2. Run as Administrator
        echo 3. Try: npm cache clean --force
        echo.
        echo Press any key to exit...
        pause >nul
        exit /b 1
    )
    echo Dependencies installed successfully!
    echo.
)

REM Check if main service file exists
if not exist "pc-print-service.js" (
    echo ERROR: pc-print-service.js not found!
    echo Make sure all files are in the same directory.
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

echo Starting PC Print Service...
echo.
echo IMPORTANT: Configure your VPS URL in the service file before first use!
echo Press Ctrl+C to stop the service
echo.
echo ========================================
echo.

REM Start the service with error handling
node pc-print-service.js
set SERVICE_EXIT_CODE=%errorlevel%

echo.
echo ========================================
if %SERVICE_EXIT_CODE% neq 0 (
    echo Service exited with error code: %SERVICE_EXIT_CODE%
    echo Check the error messages above for details.
) else (
    echo Service stopped normally.
)
echo.
echo Press any key to exit...
pause >nul