param(
  [switch]$Status,
  [switch]$RepairPlugins,
  [switch]$NativeCodex,
  [switch]$OnDemand,
  [switch]$AlwaysOn,
  [switch]$SessionOnly
)

$ErrorActionPreference = "Continue"
$script:LastStepSucceeded = $true

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

  if ($AllowFailure) {
    $output = & ocx @Args 2>&1
    $code = $LASTEXITCODE
    if ($code -eq 0 -and $null -ne $output) {
      $output | ForEach-Object { Write-Host $_ }
    }
  } else {
    & ocx @Args
    $code = $LASTEXITCODE
  }

  $code = $LASTEXITCODE
  if ($code -eq 0) {
    $script:LastStepSucceeded = $true
    return
  }
  $script:LastStepSucceeded = $false
  if (-not $AllowFailure) {
    Write-Host ""
    Write-Host "Command failed with exit code $code." -ForegroundColor Red
    throw "ocx $($Args -join ' ') failed"
  }
  Write-Host ""
  Write-Host "Skipped after exit code $code." -ForegroundColor DarkYellow
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
  Run-Step "Install/start background service" @("service", "install") -AllowFailure
  $serviceInstalled = $script:LastStepSucceeded
  if ($serviceInstalled) {
    Run-Step "Start background service" @("service", "start") -AllowFailure
  } else {
    Write-Host ""
    Write-Host "Background service could not be installed with the current Windows permissions." -ForegroundColor DarkYellow
    Write-Host "Continuing with the Codex launch shim, so OpenCodex starts when codex runs." -ForegroundColor DarkYellow
  }
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
  Write-Host "1. OpenCodex ON  - service if permitted + Codex shim"
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
