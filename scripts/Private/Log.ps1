# The log.

# Writes $Message to the information stream (the person or the mod reading the
# output) and, once the data folder is known, to switcher.log.
function Write-SwitcherLog {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Message)

    Write-Information $Message
    if ($script:Paths) {
        $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}{2}' -f (Get-Date), $Message, [Environment]::NewLine
        [IO.File]::AppendAllText($script:Paths.Log, $line, $script:Utf8)
    }
}

# The log keeps its last few hundred lines.
function Limit-SwitcherLog {
    [CmdletBinding()]
    param()

    $log = $script:Paths.Log
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt $script:LogMaxBytes) {
        $tail = @(Get-Content -LiteralPath $log -Encoding UTF8 -Tail $script:LogKeepLines)
        Write-TextFile $log (($tail -join [Environment]::NewLine) + [Environment]::NewLine)
    }
}
