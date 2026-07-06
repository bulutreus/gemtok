@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Car Race — http://127.0.0.1:21213

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js yok. https://nodejs.org LTS kurun.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [npm] Ilk kurulum...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo.
echo  Car Race sunucusu: http://127.0.0.1:21213/
echo  TikTok: config.json icinde "tiktokUsername" veya: node server.js kullanici_adi
echo  Bu pencereyi kapatirsaniz oyun tarayicida acilmaz (ERR_CONNECTION_REFUSED).
echo.
call npm start
pause
exit /b 0
