<#
  Tiny syntax-check helper. Usage: pwsh -File _check_syntax.ps1 -Files path1,path2,...
  Exits non-zero if any input file is missing OR fails to parse.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string[]]$Files
)
$missingCount = 0
$parseFailed = $false
foreach ($f in $Files) {
    $path = Resolve-Path $f -ErrorAction SilentlyContinue
    if (-not $path) {
        Write-Host "[fail] missing: $f"
        $missingCount++
        continue
    }
    try {
        $err = $null
        $tokens = $null
        [System.Management.Automation.Language.Parser]::ParseFile(
            $path.Path, [ref]$tokens, [ref]$err) | Out-Null
        if ($err.Count -gt 0) {
            Write-Host "[fail] $($path.Path): $($err[0].Message) at line $($err[0].Extent.StartLineNumber)"
            $parseFailed = $true
        } else {
            Write-Host "[ok]   $($path.Path)"
        }
    } catch {
        Write-Host "[fail] $($path.Path): $_"
        $parseFailed = $true
    }
}
if ($missingCount -gt 0 -or $parseFailed) {
    Write-Host "[summary] missing=$missingCount parse_failures=$(if ($parseFailed) { '1+' } else { 0 })"
    exit 1
}
exit 0
