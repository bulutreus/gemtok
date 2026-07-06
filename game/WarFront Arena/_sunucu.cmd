@echo off
chcp 65001 >nul
cd /d "%~dp0"
title WarFront Arena — Sunucu
echo Kapatmak icin Ctrl+C
echo.
call npm start
pause
