@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0hostinger-deploy.ps1" %*
if errorlevel 1 (
  echo.
  echo HATA: Yukleme basarisiz.
  pause
  exit /b 1
)
echo.
pause
