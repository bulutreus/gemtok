#Requires -Version 5.1
<#
  GemTok — Hostinger otomatik paketle + FTP yukle.

  Ilk kurulum:
    1) hostinger-deploy.env.example -> hostinger-deploy.env
    2) FTP bilgilerini doldurun (hPanel > Dosyalar > FTP Hesaplari)
    3) .\hostinger-deploy.bat  veya  .\hostinger-deploy.ps1

  Parametreler:
    -SkipBuild     Paketi yeniden olusturma, mevcut hostinger-yukle yukle
    -DryRun        Dosya listesi; FTP'ye baglanmaz
    -UseWinSCP     WinSCP ile senkron (kuruluysa hizli)
    -NoWinSCP      Yerlesik PowerShell FTP kullan
#>
param(
  [switch]$SkipBuild,
  [switch]$DryRun,
  [switch]$UseWinSCP,
  [switch]$NoWinSCP
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$siraName = "s" + [char]0x0131 + "ra"

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {}

function Read-DeployEnv {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $val = $line.Substring($eq + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
    $map[$key] = $val
  }
  return $map
}

function Normalize-FtpHost {
  param([string]$HostName)
  $h = [string]$HostName
  $h = $h.Trim().TrimEnd("/")
  $h = $h -replace "^(?i)ftps?://", ""
  if ($h -match "^(?i)([^/:]+)") { return $Matches[1] }
  return $h
}

function Get-DeployConfig {
  $envPath = Join-Path $root "hostinger-deploy.env"
  $file = Read-DeployEnv $envPath
  if (-not $file.Count -and (Test-Path -LiteralPath (Join-Path $root "hostinger-deploy.env.example"))) {
    $file = Read-DeployEnv (Join-Path $root "hostinger-deploy.env.example")
  }
  function pick($key, $fallback) {
    if ($file.ContainsKey($key) -and $file[$key]) { return $file[$key] }
    $e = [Environment]::GetEnvironmentVariable($key)
    if ($e) { return $e }
    return $fallback
  }
  [pscustomobject]@{
    Host = Normalize-FtpHost (pick "HOSTINGER_FTP_HOST" "")
    User = pick "HOSTINGER_FTP_USER" ""
    Password = pick "HOSTINGER_FTP_PASSWORD" ""
    Port = [int](pick "HOSTINGER_FTP_PORT" "21")
    Ssl = ((pick "HOSTINGER_FTP_SSL" "true").ToLower() -in @("1", "true", "yes", "on"))
    RemoteDir = (pick "HOSTINGER_REMOTE_DIR" "/public_html").TrimEnd("/")
    UseWinScpPref = (pick "HOSTINGER_USE_WINSCP" "auto").ToLower()
  }
}

function Find-WinScpCom {
  $candidates = @(
    "${env:ProgramFiles}\WinSCP\WinSCP.com",
    "${env:ProgramFiles(x86)}\WinSCP\WinSCP.com"
  )
  foreach ($c in $candidates) {
    if (Test-Path -LiteralPath $c) { return $c }
  }
  return $null
}

function Resolve-PackageDir {
  $dest = Join-Path $root "hostinger-yukle"
  if (Test-Path -LiteralPath $dest) { return $dest }
  $alt = Get-ChildItem -LiteralPath $root -Directory -Filter "hostinger-yukle-*" |
    Sort-Object Name -Descending |
    Select-Object -First 1
  if ($alt) { return $alt.FullName }
  throw "hostinger-yukle bulunamadi. Once hostinger-hazirla.ps1 calistirin."
}

function Build-Package {
  Write-Host ""
  Write-Host "=== Paket olusturuluyor ===" -ForegroundColor Cyan
  & (Join-Path $root "hostinger-hazirla.ps1")
  if (-not (Test-Path -LiteralPath (Join-Path $root "hostinger-yukle"))) {
    throw "hostinger-hazirla sonrasi hostinger-yukle bulunamadi."
  }
}

function Test-FtpDirectory {
  param(
    [string]$FtpBaseUri,
    [System.Net.NetworkCredential]$Credential,
    [bool]$Ssl
  )
  try {
    Invoke-FtpRequest -Uri $FtpBaseUri -Method ([System.Net.WebRequestMethods+Ftp]::ListDirectory) `
      -Credential $Credential -Ssl $Ssl
    return $true
  } catch {
    return $false
  }
}

function Resolve-RemoteDir {
  param(
    [object]$Cfg,
    [System.Net.NetworkCredential]$Credential
  )
  $candidates = @(
    $Cfg.RemoteDir,
    "/",
    "/public_html",
    "/domains/gemtok.store/public_html"
  ) | Select-Object -Unique
  foreach ($dir in $candidates) {
    if (-not $dir) { continue }
    $uri = New-FtpUri -HostName $Cfg.Host -Port $Cfg.Port -RemotePath $dir -Ssl $Cfg.Ssl
    if (Test-FtpDirectory -FtpBaseUri $uri -Credential $Credential -Ssl $Cfg.Ssl) {
      return $dir.TrimEnd("/")
    }
  }
  return $Cfg.RemoteDir
}

function Encode-FtpPathSegment {
  param([string]$Segment)
  return [System.Uri]::EscapeDataString($Segment) -replace "%2F", "/"
}

function New-FtpUri {
  param(
    [string]$HostName,
    [int]$Port,
    [string]$RemotePath,
    [bool]$Ssl
  )
  $path = $RemotePath
  if (-not $path.StartsWith("/")) { $path = "/" + $path }
  # FtpWebRequest: ftp:// + EnableSsl (ftps:// semasi desteklenmez)
  $uri = "ftp://{0}:{1}{2}" -f $HostName, $Port, $path
  return $uri
}

function Invoke-FtpRequest {
  param(
    [string]$Uri,
    [string]$Method,
    [System.Net.NetworkCredential]$Credential,
    [bool]$Ssl,
    [byte[]]$Body = $null
  )
  $req = [System.Net.FtpWebRequest]::Create($Uri)
  $req.Method = $Method
  $req.Credentials = $Credential
  $req.UseBinary = $true
  $req.UsePassive = $true
  $req.EnableSsl = $Ssl
  $req.KeepAlive = $true
  if ($Body) {
    $req.ContentLength = $Body.Length
    $stream = $req.GetRequestStream()
    $stream.Write($Body, 0, $Body.Length)
    $stream.Close()
  }
  $resp = $req.GetResponse()
  $resp.Close() | Out-Null
}

function Ensure-FtpDirectory {
  param(
    [string]$BaseUri,
    [string]$RelativeDir,
    [System.Net.NetworkCredential]$Credential,
    [bool]$Ssl
  )
  if (-not $RelativeDir -or $RelativeDir -eq "." -or $RelativeDir -eq "/") { return }
  $parts = $RelativeDir -replace "\\", "/" -split "/" | Where-Object { $_ }
  $built = ""
  foreach ($part in $parts) {
    $built += "/" + (Encode-FtpPathSegment $part)
    $dirUri = $BaseUri.TrimEnd("/") + $built
    try {
      Invoke-FtpRequest -Uri $dirUri -Method ([System.Net.WebRequestMethods+Ftp]::MakeDirectory) `
        -Credential $Credential -Ssl $Ssl
    } catch {
      # 550 = zaten var
    }
  }
}

function Upload-FtpTree {
  param(
    [string]$LocalRoot,
    [string]$RemoteRoot,
    [string]$FtpBaseUri,
    [System.Net.NetworkCredential]$Credential,
    [bool]$Ssl,
    [switch]$DryRunOnly
  )
  $files = Get-ChildItem -LiteralPath $LocalRoot -Recurse -File -Force
  $total = $files.Count
  $n = 0
  foreach ($file in $files) {
    $n++
    $rel = $file.FullName.Substring($LocalRoot.Length).TrimStart("\", "/")
    $relUnix = $rel -replace "\\", "/"
    $remotePath = ($RemoteRoot.TrimEnd("/") + "/" + $relUnix).Replace("//", "/")
    $remoteDir = Split-Path $remotePath -Parent
    $remoteDirRel = $remoteDir.Substring($RemoteRoot.TrimEnd("/").Length).TrimStart("/")

    if ($DryRunOnly) {
      Write-Host ("  [dry] " + $relUnix)
      continue
    }

    Ensure-FtpDirectory -BaseUri $FtpBaseUri -RelativeDir $remoteDirRel `
      -Credential $Credential -Ssl $Ssl

    $segments = $relUnix -split "/"
    $encoded = ($segments | ForEach-Object { Encode-FtpPathSegment $_ }) -join "/"
    $fileUri = $FtpBaseUri.TrimEnd("/") + "/" + $encoded

    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    try {
      Invoke-FtpRequest -Uri $fileUri -Method ([System.Net.WebRequestMethods+Ftp]::UploadFile) `
        -Credential $Credential -Ssl $Ssl -Body $bytes
    } catch {
      throw ("FTP yukleme hatasi: " + $relUnix + " -> " + $fileUri + " | " + $_.Exception.Message)
    }

    if ($n % 25 -eq 0 -or $n -eq $total) {
      Write-Host ("  yuklendi $n / $total : " + $relUnix)
    }
  }
  return $total
}

function Deploy-WithWinScp {
  param(
    [string]$WinScpCom,
    [string]$LocalDir,
    [object]$Cfg
  )
  $hostOnly = Normalize-FtpHost $Cfg.Host
  $proto = if ($Cfg.Ssl) { "ftps" } else { "ftp" }
  $hostUrl = "{0}://{1}:{2}@{3}:{4}" -f $proto, $Cfg.User, $Cfg.Password, $hostOnly, $Cfg.Port
  $remote = $Cfg.RemoteDir
  if (-not $remote.StartsWith("/")) { $remote = "/" + $remote }

  $logFile = Join-Path $root ("hostinger-deploy-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".log")
  Write-Host "WinSCP senkron:" $WinScpCom
  Write-Host "Log:" $logFile

  $cmd = @(
    "option batch on",
    "option confirm off",
    "open $hostUrl -explicit",
    "synchronize remote `"$LocalDir`" `"$remote`"",
    "exit"
  ) -join "`n"

  $scriptFile = Join-Path $env:TEMP ("gemtok-winscp-" + [guid]::NewGuid().ToString("N") + ".txt")
  Set-Content -LiteralPath $scriptFile -Value $cmd -Encoding UTF8
  try {
    & $WinScpCom /ini=nul /log="$logFile" /script="$scriptFile"
    if ($LASTEXITCODE -ne 0) {
      throw "WinSCP cikis kodu: $LASTEXITCODE (log: $logFile)"
    }
  } finally {
    Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "GemTok Hostinger otomatik yukleme" -ForegroundColor Cyan

$cfg = Get-DeployConfig
$pkgDir = $null

if (-not $SkipBuild) {
  Build-Package
} else {
  Write-Host "Paket derlemesi atlandi (-SkipBuild)" -ForegroundColor Yellow
}

$pkgDir = Resolve-PackageDir
Write-Host "Paket:" $pkgDir

if ($DryRun) {
  Write-Host ""
  Write-Host "=== Dry run (yuklenecek dosyalar) ===" -ForegroundColor Cyan
  $count = Upload-FtpTree -LocalRoot $pkgDir -RemoteRoot $cfg.RemoteDir `
    -FtpBaseUri "ftp://local" -Credential (New-Object System.Net.NetworkCredential("x", "x")) `
    -Ssl $false -DryRunOnly
  Write-Host ""
  Write-Host "Toplam dosya:" $count
  exit 0
}

if (-not $cfg.Host -or -not $cfg.User -or -not $cfg.Password) {
  Write-Host ""
  Write-Host "FTP ayarlari eksik." -ForegroundColor Red
  Write-Host "1) hostinger-deploy.env.example dosyasini hostinger-deploy.env olarak kopyalayin"
  Write-Host "2) hPanel > Dosyalar > FTP Hesaplari bilgilerini girin"
  Write-Host "3) Tekrar calistirin: .\hostinger-deploy.bat"
  exit 1
}

$winScp = $null
if (-not $NoWinSCP) {
  if ($UseWinSCP -or $cfg.UseWinScpPref -eq "true" -or $cfg.UseWinScpPref -eq "auto") {
    $winScp = Find-WinScpCom
  }
}

Write-Host ""
Write-Host "=== FTP yukleme ===" -ForegroundColor Cyan
Write-Host ("Hedef: {0}:{1}{2} (SSL={3})" -f $cfg.Host, $cfg.Port, $cfg.RemoteDir, $cfg.Ssl)

if ($winScp) {
  Deploy-WithWinScp -WinScpCom $winScp -LocalDir $pkgDir -Cfg $cfg
} else {
  if ($cfg.UseWinScpPref -eq "true" -and -not $winScp) {
    Write-Warning "WinSCP bulunamadi; yerlesik FTP kullaniliyor."
  }
  $cred = New-Object System.Net.NetworkCredential($cfg.User, $cfg.Password)
  if ($cfg.Ssl) {
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
  }
  $remoteDir = Resolve-RemoteDir -Cfg $cfg -Credential $cred
  if ($remoteDir -ne $cfg.RemoteDir) {
    Write-Host ("Uzak klasor otomatik secildi: " + $remoteDir) -ForegroundColor Yellow
  }
  $baseUri = New-FtpUri -HostName $cfg.Host -Port $cfg.Port -RemotePath $remoteDir -Ssl $cfg.Ssl
  $uploaded = Upload-FtpTree -LocalRoot $pkgDir -RemoteRoot $remoteDir `
    -FtpBaseUri $baseUri -Credential $cred -Ssl $cfg.Ssl
  Write-Host "Yuklenen dosya:" $uploaded
}

Write-Host ""
Write-Host "Tamamlandi. Site:" "https://gemtok.store/" -ForegroundColor Green
Write-Host "Kontrol:" "https://gemtok.store/$siraName/gemtok-license-sync.php"
Write-Host "Tarayici: Ctrl+Shift+R ile onbellegi temizleyin."
