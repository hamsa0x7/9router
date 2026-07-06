param(
  [string]$UpstreamRepo = "https://github.com/decolua/9router.git",
  [string]$UpstreamRef = "master",
  [string]$WorkRoot = (Join-Path ([IO.Path]::GetTempPath()) ("9router-custom-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds())),
  [switch]$KeepWorktree
)

$ErrorActionPreference = "Stop"
$ModsRoot = $PSScriptRoot
$OverlayRoot = Join-Path $ModsRoot "overlay"
$TargetRepo = Join-Path $WorkRoot "9router"

New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
Write-Host "Cloning upstream into $TargetRepo"
git clone --depth 1 --branch $UpstreamRef $UpstreamRepo $TargetRepo

& (Join-Path $ModsRoot "apply-overlay.ps1") -TargetRepo $TargetRepo -OverlayRoot $OverlayRoot

Push-Location $TargetRepo
try {
  npm install
  npm --prefix cli install
  npm --prefix cli run build
  npm install -g (Join-Path $TargetRepo "cli")
  node (Join-Path $TargetRepo "cli\hooks\postinstall.js")
  Write-Host "Installed custom 9router from $TargetRepo"
} finally {
  Pop-Location
}

if (-not $KeepWorktree) {
  Write-Host "Build worktree kept at $TargetRepo until this PowerShell process exits. Remove it manually if desired."
}
