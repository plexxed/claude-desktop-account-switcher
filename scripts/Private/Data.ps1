# The data folder: where it is, opening it under the lock, its state file, and
# its layout version.

<#
.SYNOPSIS
    The switcher's data folder: <Claude config dir>\plugins\data\account-switcher.
.DESCRIPTION
    The layout of Claude Code's own per-plugin data folders, under the folder
    CLAUDE_CONFIG_DIR names (~\.claude by default). Outside AppData on purpose:
    Claude Desktop is an MSIX app, and Windows redirects AppData writes made from
    inside its container (the mod's runs) to a private copy that a run outside it
    (a detached switch) never sees. The mod reckons it the same way
    (hooks/platform/paths.ts), tested against tests/fixtures/data-dirs.ts.
#>
function Get-DefaultDataDir {
    [CmdletBinding()]
    [OutputType([string])]
    param()

    $config = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }

    return Join-Path $config 'plugins\data\account-switcher'
}

<#
.SYNOPSIS
    Points the module at its data folder, bringing an older layout up to date.
#>
function Initialize-SwitcherData {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$DataDir)

    $script:Paths = @{
        Root     = $DataDir
        Profiles = Join-Path $DataDir 'profiles'
        State    = Join-Path $DataDir 'state.json'
        Accounts = Join-Path $DataDir 'accounts.json'
        Sessions = Join-Path $DataDir 'sessions.json'
        Index    = Join-Path $DataDir 'index.json'
        Backups  = Join-Path $DataDir 'backups'
        Removed  = Join-Path $DataDir 'removed-sessions'
        Log      = Join-Path $DataDir 'switcher.log'
    }
    New-Item -ItemType Directory -Force -Path $script:Paths.Profiles | Out-Null
    Invoke-DataMigration
    Limit-SwitcherLog
}

<#
.SYNOPSIS
    Takes the switcher's lock and opens the data folder, as every exported
    function does first; Exit-SwitcherData lets go. A call made while the lock
    is held already (one exported function calling another) only counts.
.PARAMETER DataDir
    The data folder; by default the one opened last, else Get-DefaultDataDir.
.PARAMETER Change
    The caller changes the data: the read model (index.json) is written anew
    when the outermost caller lets go, whether or not the change succeeded.
#>
function Enter-SwitcherData {
    [CmdletBinding()]
    param(
        [string]$DataDir,
        [switch]$Change
    )

    if ($script:LockDepth -eq 0) { $script:Lock = Enter-SwitcherLock }
    $script:LockDepth++
    try {
        $root = if ($DataDir) { $DataDir.TrimEnd('\', '/') } elseif ($script:Paths) { $script:Paths.Root } else { Get-DefaultDataDir }
        if (-not $script:Paths -or $script:Paths.Root -ne $root) {
            Initialize-SwitcherData -DataDir $root
            $script:IsIndexStale = $true
        }
    } catch {
        # A folder that could not be opened (a later version's, say) is not
        # taken as open: the next call opens it anew, and refuses it again.
        $script:Paths = $null
        Exit-SwitcherData
        throw
    }
    if ($Change) { $script:IsIndexStale = $true }
}

function Exit-SwitcherData {
    [CmdletBinding()]
    param()

    $script:LockDepth--
    if ($script:LockDepth -gt 0) { return }
    try {
        if ($script:IsIndexStale -and $script:Paths) {
            $script:IsIndexStale = $false
            # The read model is derived, and written anew by the next run: one
            # that can't be written is logged, never taken for the command's own
            # outcome, nor put in place of the error the command threw.
            try {
                Write-SwitcherIndex
            } catch {
                try {
                    Write-SwitcherLog (Get-SwitcherText IndexNotWritten $_.Exception.Message)
                } catch {
                    Write-Verbose "index.json was not written, nor the log: $($_.Exception.Message)"
                }
            }
        }
    } finally {
        Exit-SwitcherLock -Mutex $script:Lock
        $script:Lock = $null
    }
}

# --- state.json ------------------------------------------------------------------

# The data folder's layout version (0 for a new folder, which has none yet) and the profile last switched to.
function Read-SwitcherState {
    [CmdletBinding()]
    [OutputType([hashtable])]
    param()

    $value = Read-JsonFile $script:Paths.State
    $state = @{ version = 0; lastSwitchedTo = $null }
    if ($value -is [Collections.IDictionary]) {
        $version = $value['version'] -as [int]
        if ($version) { $state.version = $version }
        if ($value['lastSwitchedTo']) { $state.lastSwitchedTo = [string]$value['lastSwitchedTo'] }
    }

    return $state
}

function Write-SwitcherState {
    [CmdletBinding()]
    param([hashtable]$State)

    $value = @{ version = [int]$State.version }
    if ($State.lastSwitchedTo) { $value['lastSwitchedTo'] = [string]$State.lastSwitchedTo }
    Write-JsonFile $script:Paths.State $value
}

# --- The layout ------------------------------------------------------------------

# The steps that bring the layout from the version before each up to it, by the
# version they reach. Each step is safe to run on a folder that has it already.
# None yet: layout 1 is the first.
$script:DataMigrations = @{}

<#
.SYNOPSIS
    Brings the data folder from the layout state.json names to DataVersion, one
    step at a time; a new folder, which names none, is in DataVersion's already.
    Refuses a folder written by a later version, which this one would misread.
#>
function Invoke-DataMigration {
    [CmdletBinding()]
    param()

    $state = Read-SwitcherState
    if ($state.version -gt $script:DataVersion) {
        throw (New-SwitcherError DataTooNew InvalidData $state.version $script:DataVersion)
    }
    if ($state.version -eq $script:DataVersion) { return }
    if ($state.version -gt 0) {
        for ($version = $state.version + 1; $version -le $script:DataVersion; $version++) {
            & $script:DataMigrations[$version]
        }
    }
    # A step may have set the profile last switched to.
    $state = Read-SwitcherState
    $state.version = $script:DataVersion
    Write-SwitcherState $state
}
