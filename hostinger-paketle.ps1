#Requires -Version 5.1
<#
  Hostinger yukleme paketi: index, hub, sira klasoru, istege bagli httrack_mirror ve game.
  game kopyasında node_modules ve .env atlanır.
  Kullanim:
    .\hostinger-paketle.ps1
    .\hostinger-paketle.ps1 -WithMirror
    .\hostinger-paketle.ps1 -WithMirror -WithGames
#>
param(
  [switch]$WithMirror,
  [switch]$WithGames
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
# Dosya kodlamasından bagimsiz: klasor adi "s" + dotless i (U+0131) + "ra"
$siraName = "s" + [char]0x0131 + "ra"
$destBase = Join-Path $root "hostinger-yukle"
$dest = $destBase

if (Test-Path -LiteralPath $dest) {
  try {
    Remove-Item -LiteralPath $dest -Recurse -Force
  } catch {
    $stamp = Get-Date -Format "yyyyMMddHHmmss"
    $dest = Join-Path $root ("hostinger-yukle-" + $stamp)
  }
}

New-Item -ItemType Directory -Path $dest -Force | Out-Null

function Copy-IfExists($rel) {
  $src = Join-Path $root $rel
  if (Test-Path -LiteralPath $src) {
    $leaf = Split-Path $rel -Leaf
    $parent = Split-Path $rel -Parent
    if ($parent) {
      $targetDir = Join-Path $dest $parent
      if (-not (Test-Path -LiteralPath $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
      }
      Copy-Item -LiteralPath $src -Destination (Join-Path $dest $rel) -Force
    } else {
      Copy-Item -LiteralPath $src -Destination (Join-Path $dest $leaf) -Force
    }
  }
}

foreach ($f in @(
    "index.html",
    "hub.html",
    ".htaccess",
    "robots.txt",
    "HOSTINGER-YUKLEME.md",
    "YUKLE-BENI.txt",
    "gemtok-tikfinity-client.js",
    "gemtok-gift-client.js",
    "gemtok-gift-catalog-filter.js",
    "gemtok-live-game-bridge.js",
    "gemtok-live-bootstrap.js",
    "gemtok-game-settings-fab.js",
    "gemtok-web-host.js",
    "gemtok-game-license-gate.js",
    "logo.png",
    "GemTok-TikTok-Oyunlari.bat",
    "GemTok-Oyun-Launcher.bat",
    "GemTok-Gift-Hub.bat",
    "GemTok-TikFinity-Kopru.bat"
  )) {
  Copy-IfExists $f
}

Copy-IfExists "tools/gemtok-tikfinity-bridge.mjs"

# Sekme ikonu / PWA (sıra/*.html → ../gemtok/gemtok.png)
$brandSrc = Join-Path $root "gemtok"
$brandDst = Join-Path $dest "gemtok"
if (Test-Path -LiteralPath $brandSrc) {
  New-Item -ItemType Directory -Path $brandDst -Force | Out-Null
  foreach ($bf in @("manifest.json", "gemtok.png", "tikfinity.svg", "obs.svg")) {
    $bs = Join-Path $brandSrc $bf
    if (Test-Path -LiteralPath $bs) {
      Copy-Item -LiteralPath $bs -Destination (Join-Path $brandDst $bf) -Force
    }
  }
}

Copy-IfExists "tools/gemtok-game-launcher.mjs"

$siraSrc = Join-Path $root $siraName
if (-not (Test-Path -LiteralPath $siraSrc)) {
  throw "Klasor bulunamadi: $siraName"
}
Copy-Item -LiteralPath $siraSrc -Destination (Join-Path $dest $siraName) -Recurse -Force

if ($WithMirror) {
  $m = Join-Path $root "httrack_mirror"
  if (Test-Path -LiteralPath $m) {
    Copy-Item -LiteralPath $m -Destination (Join-Path $dest "httrack_mirror") -Recurse -Force
  }
}

if ($WithGames) {
  $gSrc = Join-Path $root "game"
  $gDst = Join-Path $dest "game"
  if (Test-Path -LiteralPath $gSrc) {
    $null = New-Item -ItemType Directory -Path $gDst -Force
    & robocopy.exe $gSrc $gDst /E /XD node_modules .git .vite "Car Race" /XF .env /NFL /NDL /NJH /NJS /NC /NS
    if ($LASTEXITCODE -ge 8) {
      throw "robocopy cikis kodu: $LASTEXITCODE"
    }
  }
}

$readme = @"
GemTok — Hostinger yukleme paketi
=================================

1) Hostinger > Dosya Yoneticisi > public_html icindeki ESKI dosyalari silin
   (veya yedek alin). Sonra bu klasordeki TUM dosyalari public_html kokune yukleyin.

2) Oyun Merkezi: lisans anahtari girin > Anahtari uygula > oyunu AYNI sekmede acin.

3) TikTok canli (TikFinity): yayınci PC'de TikFinity acik + GemTok-TikFinity-Kopru.bat
   Chrome: gemtok.store icin yerel ag erisimi izni verin.

4) WarFront kontrol (yukleme sonrasi):
   https://gemtok.store/game/WarFront%20Arena/public/game.js?v=79
   https://gemtok.store/sira/gemtok-license-registry.json

5) Tarayici onbellegi: Ctrl+Shift+R

Paket tarihi: $(Get-Date -Format 'yyyy-MM-dd HH:mm')

OTOMATIK YUKLEME (tek tik):
  hostinger-deploy.env.example -> hostinger-deploy.env (FTP bilgileri)
  hostinger-deploy.bat calistir
"@
Set-Content -LiteralPath (Join-Path $dest "YUKLE-BENI.txt") -Value $readme -Encoding UTF8

Write-Host "Paket hazir:" $dest
