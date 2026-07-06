#Requires -Version 5.1
<#
  Hostinger upload prep: build Vite games, then create hostinger-yukle package.
#>
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$siraName = "s" + [char]0x0131 + "ra"

function Build-Game($rel) {
  $dir = Join-Path $root $rel
  $pkg = Join-Path $dir "package.json"
  if (-not (Test-Path -LiteralPath $pkg)) {
    Write-Host "Skip (no package.json):" $rel
    return
  }
  Write-Host ""
  Write-Host "=== Build:" $rel "==="
  Push-Location $dir
  try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) {
      throw "Build failed: $rel (exit $LASTEXITCODE)"
    }
  } finally {
    Pop-Location
  }
}

Write-Host "GemTok Hostinger prep - game builds"
Build-Game "game\Arena Battle"
Build-Game "game\Country Birds"
Build-Game "game\vote5"

Write-Host ""
Write-Host "=== Create package ==="
$paketArgs = @{ WithGames = $true }
$mirrorPath = Join-Path $root "httrack_mirror"
if (Test-Path -LiteralPath $mirrorPath) {
  $paketArgs.WithMirror = $true
  Write-Host "httrack_mirror found - will include."
} else {
  Write-Host "httrack_mirror not found - using local sira/_files assets."
}

& (Join-Path $root "hostinger-paketle.ps1") @paketArgs

$dest = Join-Path $root "hostinger-yukle"
if (-not (Test-Path -LiteralPath $dest)) {
  $alt = Get-ChildItem -LiteralPath $root -Directory -Filter "hostinger-yukle-*" |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if ($alt) { $dest = $alt.FullName }
}

Write-Host ""
Write-Host "=== Verify ==="
$required = @(
  "index.html",
  ($siraName + "\ANA SAYFA.html"),
  ($siraName + "\OYUN MERKEZI.html"),
  ($siraName + "\gemtok-license.js"),
  ($siraName + "\gemtok-license-registry.json"),
  ($siraName + "\gemtok-license-sync.php"),
  ($siraName + "\gift-images\gift-list.loader.js"),
  "gemtok-web-host.js",
  "gemtok-game-license-gate.js",
  "gemtok-tikfinity-client.js",
  "GemTok-TikFinity-Kopru.bat",
  "tools/gemtok-tikfinity-bridge.mjs",
  "gemtok\gemtok.png",
  "gemtok\tikfinity.svg",
  "gemtok\obs.svg",
  "gemtok\manifest.json",
  "gemtok-gift-catalog-filter.js",
  "gemtok-live-game-bridge.js",
  "gemtok-live-bootstrap.js",
  "gemtok-game-settings-fab.js",
  "game\Arena Battle\dist\index.html",
  "game\Arena Battle\dist\assets\arena-bundle.js",
  "game\Country Birds\dist\index.html",
  "game\vote5\play\index.html",
  "game\vote5\play\assets\vote5.js",
  "game\arena3\index.html",
  "game\arena5gen\index.html",
  "game\WarFront Arena\public\index.html",
  "game\WarFront Arena\public\game.js",
  "game\WarFront Arena\public\assets\streamxt-bg-left.png",
  "game\WarFront Arena\public\assets\streamxt-bg-right.png",
  "game\WarFront Arena\kapak.png",
  "game\Arena Battle\kapak.png",
  "game\Country Birds\kapak.png",
  "game\vote5\kapak.png",
  "game\arena3\kapak.png",
  "game\arena5gen\kapak.png",
  "game\Team20\index.html",
  "game\Team20\kapak.png",
  "game\Air Race\index.html",
  "game\Air Race\kapak.png"
)
$missing = @()
foreach ($rel in $required) {
  $p = Join-Path $dest $rel
  if (-not (Test-Path -LiteralPath $p)) { $missing += $rel }
}
if ($missing.Count) {
  Write-Warning ("Missing files (" + $missing.Count + "): " + ($missing -join "; "))
} else {
  Write-Host "All critical files present in package."
}

$wfIndex = Join-Path $dest "game\WarFront Arena\public\index.html"
if (Test-Path -LiteralPath $wfIndex) {
  $wfHtml = Get-Content -LiteralPath $wfIndex -Raw -Encoding UTF8
  if ($wfHtml -notmatch "game\.js\?v=79") {
    Write-Warning "WarFront index.html does not reference game.js?v=79 — rebuild may be stale."
  } else {
    Write-Host "WarFront static web mode (game.js v=79) OK."
  }
}

$liveJs = Join-Path $dest ($siraName + "\gemtok-tiktok-live-global.js")
if (Test-Path -LiteralPath $liveJs) {
  $liveTxt = Get-Content -LiteralPath $liveJs -Raw -Encoding UTF8
  if ($liveTxt -notmatch "shouldUseGiftHubApi") {
    Write-Warning "gemtok-tiktok-live-global.js missing Hostinger hub fix."
  }
}

$giftDir = Join-Path $dest ($siraName + "\gift-images")
if (Test-Path -LiteralPath $giftDir) {
  $giftCount = (Get-ChildItem -LiteralPath $giftDir -File -ErrorAction SilentlyContinue | Measure-Object).Count
  Write-Host ("gift-images file count: " + $giftCount)
  if ($giftCount -lt 10) {
    Write-Warning "gift-images folder looks empty — upload may miss gift icons."
  }
}

$yukleTxt = @"
GemTok — Hostinger yukleme (son paket)
=====================================

1) Hostinger Dosya Yoneticisi veya FTP ile public_html KLASORUNUN ICINE yukleyin.
   (hostinger-yukle klasorunun kendisini degil, ICINDEKI tum dosyalari)

2) Kontrol URL'leri (404 olmamali):
   https://ALANADINIZ/game/WarFront%20Arena/public/game.js?v=79
   https://ALANADINIZ/game/WarFront%20Arena/public/assets/streamxt-bg-left.png
   https://ALANADINIZ/sira/gemtok-license-registry.json

3) Oyun Merkezi -> lisans anahtari -> Anahtari uygula -> oyunu AYNI sekmede ac.

4) TikTok Live (yayinci PC):
   - TikFinity acik
   - GemTok-TikFinity-Kopru.bat calisiyor
   - Chrome yerel ag izni verildi

5) Tarayicida Ctrl+Shift+R (sert yenileme). Eski game.js?v=76 cache'te kalmasin.

Paket yenilemek icin (yerel PC):
   hostinger-hazirla.bat  veya  .\hostinger-hazirla.ps1
"@
Set-Content -LiteralPath (Join-Path $dest "YUKLE-BENI.txt") -Value $yukleTxt -Encoding UTF8
Write-Host "Wrote YUKLE-BENI.txt in package."

Write-Host ""
Write-Host "Ready. Upload folder:" $dest
Write-Host "Upload the CONTENTS of this folder to Hostinger public_html."
exit 0
