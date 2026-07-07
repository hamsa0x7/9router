# 9Router tray icon for Windows using NotifyIcon
# IPC: stdin JSON commands, stdout JSON events
param([string]$IconPath, [string]$Tooltip)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$script:notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$script:notifyIcon.Icon = New-Object System.Drawing.Icon($IconPath)
$script:notifyIcon.Text = $Tooltip
$script:notifyIcon.Visible = $true

$script:menu = New-Object System.Windows.Forms.ContextMenuStrip
$script:notifyIcon.ContextMenuStrip = $script:menu
$script:items = @()

function Write-Event($obj) {
  $json = $obj | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}

function Add-MenuItem($index, $title, $enabled) {
  $item = New-Object System.Windows.Forms.ToolStripMenuItem
  $item.Text = $title
  $item.Enabled = $enabled
  $idx = $index
  $item.Add_Click({ Write-Event @{ type = "click"; index = $idx } }.GetNewClosure())
  $script:menu.Items.Add($item) | Out-Null
  $script:items += $item
}

function Update-MenuItem($index, $title, $enabled) {
  if ($index -lt $script:items.Count) {
    $script:items[$index].Text = $title
    $script:items[$index].Enabled = $enabled
  }
}

function Set-Tooltip($text) {
  # NotifyIcon.Text max 63 chars
  if ($text.Length -gt 63) { $text = $text.Substring(0, 63) }
  $script:notifyIcon.Text = $text
}

# Cache parent process ID for orphan detection
$script:stdinCheckCounter = 0
$script:parentPid = $null
try { $script:parentPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue).ParentProcessId } catch { }

# Background reader thread polls stdin via timer on UI thread
$script:timer = New-Object System.Windows.Forms.Timer
$script:timer.Interval = 100
$script:timer.Add_Tick({
  try {
    while ([Console]::In.Peek() -ne -1) {
      $line = [Console]::In.ReadLine()
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      $cmd = $line | ConvertFrom-Json
      switch ($cmd.action) {
        "add-item"    { Add-MenuItem $cmd.index $cmd.title $cmd.enabled }
        "update-item" { Update-MenuItem $cmd.index $cmd.title $cmd.enabled }
        "set-tooltip" { Set-Tooltip $cmd.text }
        "ready"       { Write-Event @{ type = "ready" } }
        "kill"        {
          $script:notifyIcon.Visible = $false
          $script:notifyIcon.Dispose()
          [System.Windows.Forms.Application]::Exit()
        }
      }
    }
  } catch {
    try { Write-Event @{ type = "error"; message = $_.Exception.Message } } catch { }
  }
  # Periodically check if parent Node process is still alive (~5s intervals)
  $script:stdinCheckCounter++
  if ($script:parentPid -and ($script:stdinCheckCounter -ge 50)) {
    $script:stdinCheckCounter = 0
    if (-not (Get-Process -Id $script:parentPid -ErrorAction SilentlyContinue)) {
      $script:timer.Stop()
      $script:notifyIcon.Visible = $false
      $script:notifyIcon.Dispose()
      [System.Windows.Forms.Application]::Exit()
    }
  }
})
$script:timer.Start()

$script:notifyIcon.Add_DoubleClick({
  Write-Event @{ type = "doubleclick" }
})

Write-Event @{ type = "started" }
[System.Windows.Forms.Application]::Run()
