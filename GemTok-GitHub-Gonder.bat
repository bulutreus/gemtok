@echo off
chcp 65001 >nul
title GemTok - GitHub'a Gonder
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [HATA] git bulunamadi. https://git-scm.com adresinden kurun.
  pause
  exit /b 1
)

echo [GemTok] Degisiklikler ekleniyor...
git add -A

git diff --cached --quiet
if not errorlevel 1 (
  echo [GemTok] Commit edilecek yeni degisiklik yok; mevcut commitler gonderilecek.
) else (
  git commit -m "Hediye-puan mantigi duzeltmeleri: arena5gen 60 puan tavani kaldirildi + mukerrer olay korumasi; Arena Battle combo/elmas karisikligi giderildi"
  if errorlevel 1 (
    echo [HATA] Commit basarisiz.
    pause
    exit /b 1
  )
)

echo [GemTok] GitHub'a gonderiliyor (origin/main)...
git push origin main
if errorlevel 1 (
  echo.
  echo [HATA] Push basarisiz. Internet baglantinizi ve GitHub girisinizi kontrol edin.
  echo Gerekirse once: git pull --rebase origin main
  pause
  exit /b 1
)

echo.
echo [OK] Degisiklikler GitHub'a gonderildi: https://github.com/bulutreus/gemtok
pause
