$ErrorActionPreference = 'Stop'
$env:PYTHONIOENCODING = 'utf-8'
$kline = Select-String -Path 'C:/Users/nikma/Brainz/.env' -Pattern '^KILO_API_KEY='
if ($kline) { $env:KILO_API_KEY = $kline[0].ToString().Split('=',2)[1].Trim() }
$oline = Select-String -Path 'C:/Users/nikma/Brainz/.env' -Pattern '^OPENCODE_API_KEY='
if ($oline) { $env:OPENCODE_API_KEY = $oline[0].ToString().Split('=',2)[1].Trim() }
Write-Host \"KILO_API_KEY mask=***$(if ($env:KILO_API_KEY) { $env:KILO_API_KEY.Substring([Math]::Max(0,$env:KILO_API_KEY.Length-4)) } else { '<empty>' })\"
Write-Host \"OPENCODE_API_KEY mask=***$(if ($env:OPENCODE_API_KEY) { $env:OPENCODE_API_KEY.Substring([Math]::Max(0,$env:OPENCODE_API_KEY.Length-4)) } else { '<empty>' })\"
Set-Location 'C:/Users/nikma/Brainz/odyssey'
mkdir -p logs
Start-Process -FilePath 'python' -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','7000' -RedirectStandardOutput 'logs/uvicorn.out' -RedirectStandardError 'logs/uvicorn.err' -WorkingDirectory 'C:/Users/nikma/Brainz/odysseus' -WindowStyle Hidden -PassThru | Format-Table Id, ProcessName
