# JSON files and account ids.

function Get-JsonSerializer {
    [CmdletBinding()]
    param()

    $serializer = New-Object Web.Script.Serialization.JavaScriptSerializer
    $serializer.MaxJsonLength = [int]::MaxValue
    $serializer.RecursionLimit = 1000

    return $serializer
}

# A JSON file of the switcher's own; null when it is missing or does not parse.
function Read-JsonFile {
    [CmdletBinding()]
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    try {
        return (Get-JsonSerializer).DeserializeObject([IO.File]::ReadAllText($Path))
    } catch {
        Write-Verbose "Ignored $Path, which does not parse: $($_.Exception.Message)"
        return $null
    }
}

# Writes a whole file at once: into a temporary file beside it, which then takes
# its place in one step (File.Replace), so a reader sees the old file or the new
# one, never none or half of one. A reader holding the file open makes the
# replace wait a moment and try again. The temporary file is the writer's own,
# so two writers of one file (switch.json, written outside the lock) never meet
# in it; one that can't take the file's place is removed.
function Write-TextFile {
    [CmdletBinding()]
    param([string]$Path, [string]$Text)

    $tmp = '{0}.{1}.tmp' -f $Path, [guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($tmp, $Text, $script:Utf8)
    try {
        for ($attempt = 1; ; $attempt++) {
            try {
                if ([IO.File]::Exists($Path)) {
                    [IO.File]::Replace($tmp, $Path, [NullString]::Value)
                } else {
                    [IO.File]::Move($tmp, $Path)
                }
                return
            } catch [IO.IOException] {
                if ($attempt -ge $script:ReplaceAttempts) { throw }
                Start-Sleep -Milliseconds $script:ReplaceRetryMilliseconds
            }
        }
    } finally {
        if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) }
    }
}

function Write-JsonFile {
    [CmdletBinding()]
    param([string]$Path, $Value)

    $json = (Get-JsonSerializer).Serialize($Value)
    Write-TextFile $Path $json
}

function Get-AccountId {
    [CmdletBinding()]
    param($Value)

    $text = "$Value"
    if ($text -match $script:UuidPattern) { return $text.ToLowerInvariant() }

    return $null
}
