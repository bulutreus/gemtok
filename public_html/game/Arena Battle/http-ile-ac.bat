@echo off
chcp 65001 >nul
title Arena Battle — yerel HTTP
cd /d "%~dp0"

if not exist "node_modules\" (
  echo [Arena Battle] Bagimliliklar yukleniyor...
  call npm install
  if errorlevel 1 (
    echo npm install basarisiz.
    pause
    exit /b 1
  )
)

echo.
echo Chrome, oyunu file:/// ile acinca ES modul yuklemez (beyaz sayfa).
echo Bu pencere http://127.0.0.1:4173/ adresinde dist sunar.
echo Kapatmak icin Ctrl+C
echo.

rem Sunucu ayaga kalkana kisa gecikme, sonra tarayici
start /b cmd /c "ping -n 4 127.0.0.1 >nul && start "" http://127.0.0.1:4173/"

call npm run preview -- --host 127.0.0.1 --strictPort --port 4173
if errorlevel 1 pause
