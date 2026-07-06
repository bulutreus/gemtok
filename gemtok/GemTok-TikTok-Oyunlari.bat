@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0"
set "GEMTOK_INDEX=%~dp0index.html"
title GemTok — yerel site + oyun sunuculari

echo.
echo  GemTok — yerel site + WarFront (3847), Arena Battle (5173)
echo  ---------------------------------------------------------------------------
echo  Diger oyunlar (ayri pencerede kendiniz baslatin; 5173 tek seferde bir Vite):
echo   Country Birds: game\Country Birds\dist\index.html ^(veya index.htm^)
echo   Yayin Puani vote5: game\vote5\baslat.bat
echo   arena3 / arena5gen: dogrudan HTML (TikFinity acik olsun)
echo  WarFront: game\WarFront Arena\BASLAT.bat ^(3847^)
echo  Arena Battle: game\Arena Battle\baslat.bat ^(5173, npm run dev^)
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js yok. https://nodejs.org LTS kurun.
  pause
  exit /b 1
)

echo [Launcher] Oyun Merkezi .bat tetiklemesi: 127.0.0.1:17070 (arka plan, kapatmayin)
start "GemTok game launcher" /min cmd /k cd /d "%ROOT%" ^&^& node tools\gemtok-game-launcher.mjs
ping -n 2 127.0.0.1 >nul

echo [0] GemTok yerel site (index.html) aciliyor...
if not exist "%GEMTOK_INDEX%" (
  echo [HATA] Bulunamadi: "%GEMTOK_INDEX%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -LiteralPath $env:GEMTOK_INDEX"
  if errorlevel 1 (
    echo [Uyari] PowerShell basarisiz, cmd start deneniyor...
    start "" "%GEMTOK_INDEX%"
  )
)

echo [1/2] WarFront Arena sunucusu (ayri pencere)...
start "WarFront Arena" cmd /k cd /d "%ROOT%game\WarFront Arena" ^&^& call BASLAT.bat

echo [2/2] Arena Battle (Vite dev, ayri pencere)...
start "Arena Battle" cmd /k cd /d "%ROOT%game\Arena Battle" ^&^& call baslat.bat

echo.
echo  Sunucular ayaga kalksin diye ~12 sn bekleniyor, sonra oyun sekmeleri...
ping -n 13 127.0.0.1 >nul

start "" "http://127.0.0.1:3847/"
start "" "http://127.0.0.1:5173/"

echo.
echo  Hazir. Sunuculari kapatmak icin acilan cmd pencerelerinde Ctrl+C kullanin.
echo.
pause
exit /b 0
