@echo off
REM Ilk pencere hemen kapanmasin diye asil isi ayri cmd /k penceresinde calistir
if /i not "%~1"=="_ST_RUN" (
  start "WarFront Arena" cmd /k call "%~f0" _ST_RUN
  exit /b 0
)

cd /d "%~dp0"
title WarFront Arena

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. https://nodejs.org LTS kurun.
  goto :done
)

if not exist "node_modules\" (
  echo [npm] Ilk kurulum...
  call npm install
  if errorlevel 1 goto :done
)

set "GAMEPORT=3847"
if not "%PORT%"=="" set "GAMEPORT=%PORT%"

echo [1/2] Sunucu penceresi aciliyor...
start "WarFront Arena — Sunucu" cmd /k call "%~dp0_sunucu.cmd"

if not exist "%~dp0_wait-node-port.mjs" (
  echo [2/2] _wait-node-port.mjs yok, 8 sn bekleniyor...
  timeout /t 8 /nobreak >nul
) else (
  echo [2/2] Port %GAMEPORT% bekleniyor...
  node "%~dp0_wait-node-port.mjs" %GAMEPORT%
  if errorlevel 1 echo [UYARI] Port acilmadi. WarFront Arena sunucu penceresinde kirmizi hata var mi bakin.
)

start "" "http://127.0.0.1:%GAMEPORT%/"
echo Tarayici: http://127.0.0.1:%GAMEPORT%/

:done
echo.
echo Bitti. Bu pencereyi kapatmak icin: exit  (veya asagida Enter)
pause
exit /b 0
