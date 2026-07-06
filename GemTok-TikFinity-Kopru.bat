@echo off
chcp 65001 >nul
cd /d "%~dp0"
title GemTok TikFinity Koprusu
where node >nul 2>&1 || (
  echo Node.js bulunamadi. https://nodejs.org adresinden kurun.
  pause
  exit /b 1
)
if not exist "tools\node_modules\ws" (
  echo ws paketi kuruluyor...
  pushd tools
  call npm install ws --no-save --silent
  popd
)
echo TikFinity koprusu baslatiliyor (ws://127.0.0.1:29213)
echo TikFinity masaustu uygulamasinin acik oldugundan emin olun.
echo Hostinger sitesinde Chrome/Edge yerel ag erisimine izin verin.
echo.
node "tools\gemtok-tikfinity-bridge.mjs"
pause
