@echo off
chcp 65001 >nul
title Arena Battle
cd /d "%~dp0"

if not exist "package.json" (
  echo [HATA] package.json bulunamadi. Klasor: "%CD%"
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [Arena Battle] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo [Arena Battle] Starting dev server...
echo Browser opens when Vite is ready ^(http://localhost:5173^).
echo Press Ctrl+C in this window to stop.
echo.

call npm run dev
if errorlevel 1 pause
