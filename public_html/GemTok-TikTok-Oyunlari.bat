@echo off
chcp 65001 >nul
setlocal
set "ROOT=%~dp0"
set "GEMTOK_INDEX=%~dp0index.html"
title GemTok - yerel site + oyun sunucuları

echo.
echo  GemTok - yerel site + WarFront (3847), Arena Battle (5173)
echo  ---------------------------------------------------------------------------
echo  Diğer oyunlar (ayrı pencerede kendiniz başlatın; 5173 tek seferde bir Vite):
echo   Country Birds: game\Country Birds\dist\index.html ^(veya index.htm^)
echo   Yayın Puanı vote5: game\vote5\baslat.bat
echo   arena3 / arena5gen: doğrudan HTML ^(TikFinity açık olsun^)
echo  WarFront: game\WarFront Arena\BASLAT.bat ^(3847^)
echo  Arena Battle: game\Arena Battle\baslat.bat ^(5173, npm run dev^)
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js yok. https://nodejs.org LTS sürümünü kurun.
  pause
  exit /b 1
)

echo [Launcher] Oyun Merkezi .bat tetiklemesi: 127.0.0.1:17070 ^(arka plan, kapatmayın^)
start "GemTok game launcher" /min cmd /k cd /d "%ROOT%" ^&^& node tools\gemtok-game-launcher.mjs
ping -n 2 127.0.0.1 >nul

echo [0] GemTok yerel site ^(index.html^) açılıyor...
if not exist "%GEMTOK_INDEX%" (
  echo [HATA] Bulunamadı: "%GEMTOK_INDEX%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -LiteralPath $env:GEMTOK_INDEX"
  if errorlevel 1 (
    echo [Uyarı] PowerShell başarısız, cmd start deneniyor...
    start "" "%GEMTOK_INDEX%"
  )
)

echo [1/2] WarFront Arena sunucusu ^(ayrı pencere^)...
start "WarFront Arena" cmd /k cd /d "%ROOT%game\WarFront Arena" ^&^& call BASLAT.bat

echo [2/2] Arena Battle ^(Vite geliştirme, ayrı pencere^)...
start "Arena Battle" cmd /k cd /d "%ROOT%game\Arena Battle" ^&^& call baslat.bat

echo.
echo  Sunucuların açılması için yaklaşık 12 saniye bekleniyor, sonra oyun sekmeleri açılacak...
ping -n 13 127.0.0.1 >nul

start "" "http://127.0.0.1:3847/"
start "" "http://127.0.0.1:5173/"

echo.
echo  Hazır. Sunucuları kapatmak için açılan cmd pencerelerinde Ctrl+C kullanın.
echo.
pause
exit /b 0
