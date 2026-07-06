@echo off
chcp 65001 >nul
title TikTok Race — sunucu
cd /d "%~dp0"

if not exist "node_modules\" (
  echo [Bilgi] node_modules yok. "npm install" calistiriliyor...
  call npm install
  if errorlevel 1 (
    echo [Hata] npm install basarisiz. Node.js kurulu mu kontrol edin.
    pause
    exit /b 1
  )
)

echo.
echo Sunucu baslatiliyor. Durdurmak icin bu pencerede Ctrl+C basin.
echo TikTok kullanicisi: config.json ^> tiktokUsername veya asagidaki gibi arguman.
echo   sunucuyu-baslat.bat kullanici_adi
echo Sadece yerel HTTP ^(TikTok baglantisi yok^): npm run http
echo.

if "%~1"=="" (
  call npm start
) else (
  call npm start -- %*
)
