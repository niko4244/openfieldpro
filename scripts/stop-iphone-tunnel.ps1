<#
  stop-iphone-tunnel.ps1 — kill the ngrok process started by
                           start-iphone-tunnel.ps1. Leaves uvicorn alone so
                           local-dev still works on http://127.0.0.1:7000.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-Process ngrok -ErrorAction SilentlyContinue
if (-not $procs) {
    Write-Host "[tunnel] no ngrok process running."
    exit 0
}
foreach ($p in $procs) {
    Write-Host "[tunnel] stopping ngrok PID $($p.Id)"
    Stop-Process -Id $p.Id -Force
}
Write-Host "[tunnel] ngrok stopped. uvicorn (if running) is untouched."
