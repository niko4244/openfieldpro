<#
  start-iphone-tunnel.ps1 — public HTTPS tunnel from your laptop to your iPhone
                            via ngrok (already installed via WinGet).

  What it does:
    1. If uvicorn is not already listening on :7000, launches it under
       .\venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 7000.
       Waits up to 30s for /api/ofp/health to respond 200.
    2. Kills any prior ngrok, then launches `ngrok http 7000` against the same
       python.exe's WinGet install path (falls back to whatever is on $PATH).
    3. Polls ngrok's local admin API (http://127.0.0.1:4040/api/tunnels) until
       a public URL is reported. Errors early if no authtoken is configured
       (free tier requires one; signup is at https://dashboard.ngrok.com).
    4. Persists the URL to <repo>/.ofp-tunnel-url so the dashboard / scripts
       can read it later, then prints it to the console.

  ponytail: assumes WinGet-installed ngrok at the canonical path; falls back to
  PATH. Ceiling: ngrok free tier gives a random URL per run (paid adds --domain).
  Upgrade: add --domain=foo.ngrok-free.app arg passthrough via $env:NGROK_DOMAIN.

  Parser gotcha: never use `[<word>]` inside `"..."` strings (e.g. `Write-Host
  "[tunnel] ..."`) — PowerShell lexes `[<word>]` as a type-literal and chokes
  when the next token doesn't resolve. Always use a single-quoted format
  string instead: `Write-Host ('[tunnel] foo {0}' -f $port)`.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
Set-Location $repoRoot

$port = 7000

function Get-NgrokExe {
    $wingetPath = Join-Path $env:LOCALAPPDATA `
        'Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe'
    if (Test-Path $wingetPath) { return $wingetPath }
    $cmd = Get-Command 'ngrok' -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    throw "ngrok.exe not found. Install via 'winget install ngrok' or set up an account at https://dashboard.ngrok.com and rerun."
}

function Wait-ForUvicorn([int]$timeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/ofp/health" -UseBasicParsing -TimeoutSec 2
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

function Assert-NgrokAuth([string]$exe) {
    # `ngrok config check` exits 0 if authtoken configured; otherwise prints
    # "ERROR: authentication failed" or similar. We inspect exit code + stderr.
    $stdoutFile = [System.IO.Path]::GetTempFileName()
    $stderrFile = [System.IO.Path]::GetTempFileName()
    try {
        $p = Start-Process -FilePath $exe -ArgumentList 'config','check' `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile `
            -Wait -PassThru -WindowStyle Hidden
        if ($p.ExitCode -ne 0) {
            $errText = (Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue) + (Get-Content $stdoutFile -Raw -ErrorAction SilentlyContinue)
            Write-Warning "ngrok authtoken appears unconfigured. Sign up free at https://dashboard.ngrok.com and run: ngrok config add-authtoken <TOKEN>.`nDetails: $errText"
            return $false
        }
        return $true
    } finally {
        Remove-Item $stdoutFile, $stderrFile -ErrorAction SilentlyContinue
    }
}

# --- 1. Ensure uvicorn ------------------------------------------------------
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
    Write-Host ('[tunnel] Port {0} not listening — launching uvicorn ...' -f $port)
    $env:LOCALHOST_BYPASS = 'true'
    $env:AUTH_ENABLED = 'false'
    $uvOut = Join-Path $repoRoot 'uvicorn.out.log'
    $uvErr = Join-Path $repoRoot 'uvicorn.err.log'
    Start-Process -FilePath '.\venv\Scripts\python.exe' `
        -ArgumentList '-m','uvicorn','app:app','--host','127.0.0.1','--port', $port `
        -RedirectStandardOutput $uvOut -RedirectStandardError $uvErr `
        -WindowStyle Hidden | Out-Null
    if (-not (Wait-ForUvicorn -timeoutSec 30)) {
        throw "uvicorn did not become healthy on :$port within 30s. Check $uvErr."
    }
    Write-Host ('[tunnel] uvicorn healthy on :{0}' -f $port)
} else {
    Write-Host ('[tunnel] uvicorn already listening on :{0}' -f $port)
}

# --- 2. ngrok binary + auth -------------------------------------------------
$ngrokExe = Get-NgrokExe
if (-not (Assert-NgrokAuth -exe $ngrokExe)) {
    throw "Halting: ngrok authtoken missing. Set it up first (see warning above)."
}

# --- 3. Start ngrok ----------------------------------------------------------
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
$ngOut = Join-Path $repoRoot 'ngrok.out.log'
$ngErr = Join-Path $repoRoot 'ngrok.err.log'
Start-Process -FilePath $ngrokExe `
    -ArgumentList 'http',"$port" `
    -RedirectStandardOutput $ngOut -RedirectStandardError $ngErr `
    -WindowStyle Hidden | Out-Null
Write-Host '[tunnel] ngrok launched; waiting for public URL ...'

# --- 4. Poll for public URL --------------------------------------------------
$timeoutSec = if ($env:NGROK_WAIT_TIMEOUT) { [int]$env:NGROK_WAIT_TIMEOUT } else { 30 }
$publicUrl = $null
$deadline = (Get-Date).AddSeconds($timeoutSec)
while ((Get-Date) -lt $deadline) {
    try {
        $tunnels = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2
        if ($tunnels -and $tunnels.tunnels -and $tunnels.tunnels.Count -gt 0) {
            # ngrok returns BOTH http + https entries; prefer https so the iPhone
            # gets TLS without mixed-content warnings. Index 0 is not stable.
            $publicUrl = ($tunnels.tunnels | Where-Object { $_.proto -eq 'https' } `
                | Select-Object -First 1).public_url
            if ($publicUrl) { break }
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if (-not $publicUrl) {
    throw "ngrok did not report a public URL in 30s. Logs: $ngErr"
}

# --- 5. Persist + announce ---------------------------------------------------
$urlFile = Join-Path $repoRoot '.ofp-tunnel-url'
Set-Content -Path $urlFile -Value $publicUrl -NoNewline
Write-Host ''
Write-Host '============================================================'
Write-Host ' Public iPhone URL (open in Safari on your phone):'
Write-Host "   $publicUrl"
Write-Host '============================================================'
Write-Host "  URL persisted to: $urlFile"
Write-Host "  ngrok UI:        http://127.0.0.1:4040"
Write-Host "  Stop tunnel:     .\scripts\stop-iphone-tunnel.ps1"
Write-Host ''
