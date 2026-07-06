@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title GemTok — oyun baslatici (127.0.0.1:17070)

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js yok. https://nodejs.org LTS kurun.
  pause
  exit /b 1
)

echo Oyun Merkezi'nde «Oyuna baglan» .bat ile sunucu acmak icin bu pencere acik kalmali.
echo Adres: http://127.0.0.1:17070/health
echo Kapatmak icin Ctrl+C
echo.
node tools\gemtok-game-launcher.mjs
if errorlevel 1 pause
exit /b 0
