[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$secretFile = Join-Path (Split-Path -Parent $PSScriptRoot) ".secrets/openfieldpro_operations_controller"
if (-not (Test-Path -LiteralPath $secretFile -PathType Leaf)) {
  throw "Missing operations-controller secret file."
}
$secret = (Get-Content -Raw -LiteralPath $secretFile).TrimEnd("`r", "`n")
if ($secret.Length -lt 32 -or $secret.Length -gt 512 -or $secret -notmatch "^[!-~]+$") {
  throw "Invalid operations-controller secret file."
}

$headers = @{
  Authorization = "Bearer $secret"
  "Idempotency-Key" = "host-cli-backup-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))-$([Guid]::NewGuid().ToString('N'))"
}
Invoke-RestMethod `
  -Uri "http://127.0.0.1:3010/v1/backups" `
  -Method Post `
  -Headers $headers `
  -ContentType "application/json" `
  -Body "{}"
