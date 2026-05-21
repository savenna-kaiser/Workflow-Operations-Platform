# deploy.ps1
# Ausfuehren: .\deploy.ps1

$ErrorActionPreference = "Stop"
$BaseDir   = "C:\AD Manager Dashboard"
$OutputDir = "C:\AD Manager Dashboard\frontend\output"

if (-not (Test-Path $OutputDir)) {
    Write-Error "Output-Ordner nicht gefunden: $OutputDir"
    exit 1
}

$files = @(
    @{ Src = "package.json";       Dst = "frontend\package.json" },
    @{ Src = "vite.config.js";     Dst = "frontend\vite.config.js" },
    @{ Src = "tailwind.config.js"; Dst = "frontend\tailwind.config.js" },
    @{ Src = "postcss.config.js";  Dst = "frontend\postcss.config.js" },
    @{ Src = "index.html";         Dst = "frontend\index.html" },
    @{ Src = "main.jsx";           Dst = "frontend\src\main.jsx" },
    @{ Src = "App.jsx";            Dst = "frontend\src\App.jsx" },
    @{ Src = "index.css";          Dst = "frontend\src\index.css" },
    @{ Src = "utils.js";           Dst = "frontend\src\lib\utils.js" },
    @{ Src = "client.js";          Dst = "frontend\src\api\client.js" },
    @{ Src = "useAuth.jsx";        Dst = "frontend\src\hooks\useAuth.jsx" },
    @{ Src = "useTheme.jsx";       Dst = "frontend\src\hooks\useTheme.jsx" },
    @{ Src = "LoginPage.jsx";      Dst = "frontend\src\pages\LoginPage.jsx" },
    @{ Src = "HomePage.jsx";       Dst = "frontend\src\pages\HomePage.jsx" },
    @{ Src = "UserPage.jsx";       Dst = "frontend\src\pages\UserPage.jsx" },
    @{ Src = "AppShell.jsx";       Dst = "frontend\src\components\layout\AppShell.jsx" },
    @{ Src = "GlobalSearch.jsx";   Dst = "frontend\src\components\user\GlobalSearch.jsx" },
    @{ Src = "EditUserModal.jsx";  Dst = "frontend\src\components\user\EditUserModal.jsx" },
    @{ Src = "server.js";          Dst = "backend\server.js" },
    @{ Src = "citrixService.js";   Dst = "backend\services\citrixService.js" },
    @{ Src = "citrix.js";          Dst = "backend\routes\citrix.js" }
)

$ok      = 0
$skipped = 0
$errors  = 0

foreach ($f in $files) {
    $src = Join-Path $OutputDir $f.Src
    $dst = Join-Path $BaseDir   $f.Dst

    if (-not (Test-Path $src)) {
        Write-Warning "  FEHLT   $($f.Src)"
        $skipped++
        continue
    }

    $dstDir = Split-Path $dst -Parent
    if (-not (Test-Path $dstDir)) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
        Write-Host "  ORDNER  $dstDir" -ForegroundColor DarkGray
    }

    try {
        Copy-Item -Path $src -Destination $dst -Force
        Write-Host "  OK      $($f.Dst)" -ForegroundColor Green
        $ok++
    } catch {
        Write-Host "  FEHLER  $($f.Dst): $_" -ForegroundColor Red
        $errors++
    }
}

Write-Host ""
Write-Host "-----------------------------------------" -ForegroundColor DarkGray
Write-Host "  $ok kopiert   $skipped fehlend   $errors Fehler" -ForegroundColor Cyan

if ($errors -eq 0 -and $skipped -eq 0) {
    Write-Host ""
    Write-Host "  Alles bereit. Naechste Schritte:" -ForegroundColor Green
    Write-Host "  cd C:\AD Manager Dashboard\frontend" -ForegroundColor White
    Write-Host "  npm install" -ForegroundColor White
    Write-Host "  npm run dev" -ForegroundColor White
}