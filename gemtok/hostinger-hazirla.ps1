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
  ($siraName + "\gift-images\gift-list.loader.js"),
  "gemtok\gemtok.png",
  "gemtok\manifest.json",
  "gemtok-gift-catalog-filter.js",
  "gemtok-live-game-bridge.js",
  "gemtok-game-settings-fab.js",
  "game\Arena Battle\dist\index.html",
  "game\Arena Battle\dist\assets\arena-bundle.js",
  "game\Country Birds\dist\index.html",
  "game\vote5\play\index.html",
  "game\vote5\play\assets\vote5.js",
  "game\arena3\index.html",
  "game\arena5gen\index.html",
  "game\WarFront Arena\public\index.html"
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

Write-Host ""
Write-Host "Ready. Upload folder:" $dest
Write-Host "Upload the CONTENTS of this folder to Hostinger public_html."
