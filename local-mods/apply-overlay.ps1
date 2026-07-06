param(
  [Parameter(Mandatory=$true)]
  [string]$TargetRepo,
  [string]$OverlayRoot = (Join-Path $PSScriptRoot "overlay")
)

$ErrorActionPreference = "Stop"
$OverlayRoot = (Resolve-Path -LiteralPath $OverlayRoot).Path
$TargetRepo = (Resolve-Path -LiteralPath $TargetRepo).Path

Get-ChildItem -LiteralPath $OverlayRoot -Recurse -File | ForEach-Object {
  $relative = $_.FullName.Substring($OverlayRoot.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $dest = Join-Path $TargetRepo $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
  Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
}

$removeIfPresent = @(
  "src\mitm\handlers\letta.js",
  "public\providers\lettacode.png",
  "cli\app\public\providers\lettacode.png"
)
foreach ($relative in $removeIfPresent) {
  $path = Join-Path $TargetRepo $relative
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Force
  }
}

Write-Output "Applied 9Router local overlay to $TargetRepo"
