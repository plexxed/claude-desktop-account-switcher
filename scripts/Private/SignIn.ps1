# Sign-ins: saving, restoring and clearing Claude's, and their backups.

# --- The cookie store -----------------------------------------------------------------

# The folder Claude keeps its cookie store in.
function Get-CookieDir {
    [CmdletBinding()]
    param([string]$ClaudeDir)

    return Join-Path $ClaudeDir 'Network'
}

# Makes the cookie store in $To what it is in $From: each file copied, or
# removed from $To where $From has none.
function Copy-CookieStore {
    [CmdletBinding()]
    param([string]$From, [string]$To)

    foreach ($file in $script:CookieFiles) {
        $source = Join-Path $From $file
        $target = Join-Path $To $file
        if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $target -Force }
        elseif (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
    }
}

# --- Backups ----------------------------------------------------------------------------

# Copies Claude's sign-in as it is now (its whole config.json and its cookie
# store) into a new folder of backups\, keeping the last few; returns the folder.
function Backup-SignIn {
    [CmdletBinding()]
    param([string]$ClaudeDir)

    $stamp = '{0:yyyyMMdd-HHmmss}' -f (Get-Date)
    $dir = Join-Path $script:Paths.Backups $stamp
    for ($n = 2; Test-Path -LiteralPath $dir; $n++) { $dir = Join-Path $script:Paths.Backups "$stamp-$n" }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Copy-Item -LiteralPath (Join-Path $ClaudeDir 'config.json') -Destination $dir
    Copy-CookieStore -From (Get-CookieDir $ClaudeDir) -To $dir
    Get-ChildItem -LiteralPath $script:Paths.Backups -Directory | Sort-Object Name -Descending |
        Select-Object -Skip $script:BackupKeepCount | Remove-Item -Recurse -Force

    return $dir
}

# Puts Claude's sign-in back as backup $Dir holds it: what a switch that failed
# half-way had changed.
function Restore-SignInBackup {
    [CmdletBinding()]
    param([string]$ClaudeDir, [string]$Dir)

    $config = Read-JsonFile (Join-Path $Dir 'config.json')
    if ($config -isnot [Collections.IDictionary]) { throw (New-SwitcherError BackupUnreadable InvalidData $Dir) }
    Write-ClaudeConfig $ClaudeDir $config
    Copy-CookieStore -From $Dir -To (Get-CookieDir $ClaudeDir)
    Write-SwitcherLog (Get-SwitcherText SignInRolledBack (Split-Path $Dir -Leaf))
}

# Removes the backups that hold the sign-in of $Account; their names.
function Remove-SignInBackup {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][string]$Account)

    if (-not (Test-Path -LiteralPath $script:Paths.Backups)) { return }
    foreach ($dir in Get-ChildItem -LiteralPath $script:Paths.Backups -Directory) {
        $config = Read-JsonFile (Join-Path $dir.FullName 'config.json')
        $isOfAccount = $config -is [Collections.IDictionary] -and (Get-AccountId $config['lastKnownAccountUuid']) -eq $Account
        if ($isOfAccount -and $PSCmdlet.ShouldProcess($dir.Name, (Get-SwitcherText ActionRemoveBackup))) {
            Remove-Item -LiteralPath $dir.FullName -Recurse -Force
            $dir.Name
        }
    }
}

# --- A profile's sign-in ------------------------------------------------------------------

# Copies the sign-in Claude holds now into profile $Name, and the account it is to its record.
function Save-ProfileSignIn {
    [CmdletBinding()]
    param([string]$ClaudeDir, [string]$Name)

    $config = Read-ClaudeConfig $ClaudeDir
    $auth = @{}
    foreach ($key in @($config.Keys)) { if (Test-SignInKey $key) { $auth[$key] = $config[$key] } }
    $dir = Get-ProfileDir $Name
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Write-JsonFile (Join-Path $dir 'auth.json') $auth
    Copy-CookieStore -From (Get-CookieDir $ClaudeDir) -To $dir
    $record = Read-ProfileRecord $Name
    $record.account = Get-AccountId $config['lastKnownAccountUuid']
    Write-ProfileRecord $Name $record
    Write-SwitcherLog (Get-SwitcherText SignInSaved $Name)
}

function Restore-ProfileSignIn {
    [CmdletBinding()]
    param([string]$ClaudeDir, [string]$Name)

    $dir = Get-ProfileDir $Name
    $auth = Read-JsonFile (Join-Path $dir 'auth.json')
    if ($auth -isnot [Collections.IDictionary]) { throw (New-SwitcherError SignInUnreadable InvalidData $Name) }
    $config = Read-ClaudeConfig $ClaudeDir
    Remove-SignInKey $config
    foreach ($key in @($auth.Keys)) { $config[$key] = $auth[$key] }
    Write-ClaudeConfig $ClaudeDir $config
    Copy-CookieStore -From $dir -To (Get-CookieDir $ClaudeDir)
    Write-SwitcherLog (Get-SwitcherText ProfileRestored $Name)
}

# Signs Claude out on this computer alone (no sign-out on the server), so it opens the sign-in screen.
function Clear-SignIn {
    [CmdletBinding()]
    param([string]$ClaudeDir)

    $config = Read-ClaudeConfig $ClaudeDir
    Remove-SignInKey $config
    Write-ClaudeConfig $ClaudeDir $config
    foreach ($file in $script:CookieFiles) {
        $path = Join-Path (Get-CookieDir $ClaudeDir) $file
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }
    Write-SwitcherLog (Get-SwitcherText SignedOut)
}
