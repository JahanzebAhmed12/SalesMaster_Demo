@echo off
title SalesMaster - Backend (Flask :5000)
cd /d "%~dp0backend"
call venv\Scripts\activate.bat
python run.py
pause
