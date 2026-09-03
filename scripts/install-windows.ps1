# Install GADS Watchdog as a Windows Scheduled Task that starts at logon.
# Run from PowerShell:  .\scripts\install-windows.ps1
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$TaskName = "GADS Watchdog"
$Runner = Join-Path $PSScriptRoot "run-watchdog.ps1"
$EnvExample = Join-Path $Root ".env.example"
$EnvFile = Join-Path $Root ".env"

if (-not (Test-Path $EnvFile) -and (Test-Path $EnvExample)) {
  Copy-Item $EnvExample $EnvFile
  Write-Host "Created $EnvFile from the example. Fill any notification variables you want, leave the rest blank."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is not on PATH. Install Node.js LTS, then re-run this script."
}

Set-Location $Root
if (-not (Test-Path "node_modules")) { npm install }
if (-not (Test-Path ".next")) { npm run build }

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Runner`"" `
  -WorkingDirectory $Root

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
  -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "Installed scheduled task '$TaskName'."
Write-Host "Watchdog should be on http://127.0.0.1:43180"
Write-Host "New to farms? Open /setup and use ntfy. Tech path: edit .env, then restart the task."
Write-Host "Uninstall: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
