param(
  [switch]$Status,
  [switch]$RepairPlugins,
  [switch]$NativeCodex,
  [switch]$OnDemand,
  [switch]$AlwaysOn,
  [switch]$SessionOnly
)

$ErrorActionPreference = "Continue"

function Write-Title {
  Clear-Host
  Write-Host "OpenCodex / Original Codex connection control" -ForegroundColor Cyan
  Write-Host "================================================" -ForegroundColor Cyan
  Write-Host ""
}

function Run-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string[]]$Args,
    [switch]$AllowFailure
  )

  Write-Host ""
  Write-Host "==> $Label" -ForegroundColor Yellow
  Write-Host "ocx $($Args -join ' ')" -ForegroundColor DarkGray
  & ocx @Args
  $code = $LASTEXITCODE
  if ($code -ne 0 -and -not $AllowFailure) {
    Write-Host ""
    Write-Host "Command failed with exit code $code." -ForegroundColor Red
    throw "ocx $($Args -join ' ') failed"
  }
}

function Show-Status {
  Write-Title
  Run-Step "OpenCodex status" @("status") -AllowFailure
  Write-Host ""
  Write-Host "==> Native Codex CLI version" -ForegroundColor Yellow
  & codex --version
  Write-Host ""
}

function Repair-Plugins {
  Write-Title
  Run-Step "Repair bundled Codex plugin marketplace" @("codex-plugins", "repair", "--enable-common")
  Run-Step "Show plugin wiring" @("codex-plugins", "status") -AllowFailure
}

function Enable-AlwaysOn {
  Write-Title
  Repair-Plugins
  Run-Step "Install/start background service" @("service", "install")
  Run-Step "Start background service" @("service", "start") -AllowFailure
  Run-Step "Install Codex launch shim" @("codex-shim", "install")
  Run-Step "Ensure OpenCodex is active and injected" @("ensure")
  Show-Status
}

function Enable-OnDemand {
  Write-Title
  Repair-Plugins
  Run-Step "Remove always-on service" @("service", "uninstall") -AllowFailure
  Run-Step "Install Codex launch shim" @("codex-shim", "install")
  Run-Step "Ensure OpenCodex is active for now" @("ensure")
  Show-Status
}

function Enable-SessionOnly {
  Write-Title
  Repair-Plugins
  Run-Step "Remove always-on service" @("service", "uninstall") -AllowFailure
  Run-Step "Remove Codex launch shim" @("codex-shim", "uninstall") -AllowFailure
  Run-Step "Start OpenCodex for this session" @("start")
  Show-Status
}

function Disable-ToNative {
  Write-Title
  Run-Step "Stop OpenCodex and restore native Codex" @("stop") -AllowFailure
  Run-Step "Remove always-on service" @("service", "uninstall") -AllowFailure
  Run-Step "Remove Codex launch shim" @("codex-shim", "uninstall") -AllowFailure
  Run-Step "Restore native Codex config" @("restore") -AllowFailure
  Show-Status
}

function Open-Dashboard {
  Start-Process "http://localhost:10100/"
}

function Pause-IfInteractive {
  if (-not ($Status -or $RepairPlugins -or $NativeCodex -or $OnDemand -or $AlwaysOn -or $SessionOnly)) {
    Write-Host "Press Enter to continue..."
    [void][Console]::ReadLine()
  }
}

if ($Status) { Show-Status; exit 0 }
if ($RepairPlugins) { Repair-Plugins; exit 0 }
if ($NativeCodex) { Disable-ToNative; exit 0 }
if ($OnDemand) { Enable-OnDemand; exit 0 }
if ($AlwaysOn) { Enable-AlwaysOn; exit 0 }
if ($SessionOnly) { Enable-SessionOnly; exit 0 }

while ($true) {
  Write-Title
  Write-Host "1. OpenCodex ON  - always-on service + Codex shim"
  Write-Host "2. OpenCodex ON  - on-demand when codex starts"
  Write-Host "3. OpenCodex ON  - this session only, no shim/service"
  Write-Host "4. Original Codex ON / OpenCodex OFF"
  Write-Host "5. Repair bundled plugins"
  Write-Host "6. Show connection status"
  Write-Host "7. Open dashboard"
  Write-Host "0. Exit"
  Write-Host ""
  $choice = Read-Host "Select"

  try {
    switch ($choice) {
      "1" { Enable-AlwaysOn; Pause-IfInteractive }
      "2" { Enable-OnDemand; Pause-IfInteractive }
      "3" { Enable-SessionOnly; Pause-IfInteractive }
      "4" { Disable-ToNative; Pause-IfInteractive }
      "5" { Repair-Plugins; Pause-IfInteractive }
      "6" { Show-Status; Pause-IfInteractive }
      "7" { Open-Dashboard }
      "0" { exit 0 }
      default {
        Write-Host "Unknown selection." -ForegroundColor Red
        Start-Sleep -Seconds 1
      }
    }
  } catch {
    Write-Host ""
    Write-Host $_ -ForegroundColor Red
    Pause-IfInteractive
  }
}
