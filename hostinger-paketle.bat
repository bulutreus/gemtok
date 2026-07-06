@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0hostinger-hazirla.ps1"
if errorlevel 1 exit /b 1
echo.
pause
