@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0"
title Hottok — TikTok oyun köprüleri

echo.
echo  Hottok — Car Race (21213), WarFront Arena (3847), Arena Battle (5173 Vite)
echo  ---------------------------------------------------------------------------
echo  Car Race: tiktok-race\BASLAT.bat ^(21213^) — TikTok istege bagli; sunucu acik kalmali
echo  WarFront: game\WarFront Arena\BASLAT.bat ^(3847^)
echo  Arena Battle: game\Arena Battle\baslat.bat ^(5173, npm run dev^)
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js yok. https://nodejs.org LTS kurun.
  pause
  exit /b 1
)

echo [1/3] Car Race sunucusu (ayri pencere)...
start "" "%ROOT%game\Car Race\tiktok-race\BASLAT.bat"

echo [2/3] WarFront Arena sunucusu (ayri pencere)...
start "" "%ROOT%game\WarFront Arena\BASLAT.bat"

echo [3/3] Arena Battle (Vite dev, ayri pencere)...
start "" "%ROOT%game\Arena Battle\baslat.bat"

echo.
echo  Bir kac saniye bekleniyor, sonra tarayici sekmeleri acilacak...
ping -n 6 127.0.0.1 >nul

start "" "http://127.0.0.1:21213/"
start "" "http://127.0.0.1:3847/"
start "" "http://127.0.0.1:5173/"

echo.
echo  Hazir. Sunuculari kapatmak icin acilan cmd pencerelerinde Ctrl+C kullanin.
echo.
pause
exit /b 0
