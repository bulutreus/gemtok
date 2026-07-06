@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GemTok Gift Hub

where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js gerekli.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [gift-hub] npm install...
  call npm install
  if errorlevel 1 (
    echo npm install basarisiz.
    pause
    exit /b 1
  )
)

if not exist "public\admin\index.html" (
  echo [gift-hub] Admin UI derleniyor...
  call npm run build:admin
)

echo Gift Hub: http://127.0.0.1:8787/admin/
start "" "http://127.0.0.1:8787/admin/"
node server.js
pause
