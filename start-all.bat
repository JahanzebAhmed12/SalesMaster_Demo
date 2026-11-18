@echo off
cd /d "%~dp0"
start "SalesMaster - Backend" cmd /k start-dev.bat
start "SalesMaster - Frontend" cmd /k start-frontend.bat
exit
