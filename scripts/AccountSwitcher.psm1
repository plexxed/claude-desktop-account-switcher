#Requires -Version 5.1
<#
.SYNOPSIS
    Saved sign-ins for Claude Desktop on Windows, and the Code session lists
    the saved accounts may share.

.DESCRIPTION
    A profile is a named copy of Claude Desktop's sign-in: the oauth:* keys and
    lastKnownAccountUuid in config.json, and the Network\Cookies store. Switching
    closes Claude, saves the signed-in account's sign-in into its profile,
    restores another's, and starts Claude again. Settings, MCP servers and
    plugins are not touched.

    The data folder (Initialize-SwitcherData) holds:

        profiles\<name>\profile.json   { "account": "<uuid>", "shareSessions": true }
        profiles\<name>\auth.json      the saved sign-in keys (encrypted by Claude, per Windows user)
        profiles\<name>\Cookies        the saved cookie store (+ Cookies-journal)
        state.json                     { "version": <layout>, "lastSwitchedTo": "<name>" }
        accounts.json                  account uuid -> { org, email }: what the mod saw of each
        sessions.json                  what the last session sync left in each sharing list
        index.json                     the read model the mod draws from (Write-SwitcherIndex);
                                       derived, rewritten after every change
        switch.json                    how the last run outside Claude went, for the mod
                                       that handed it a switch (Write-SwitchRunStatus)
        backups\, removed-sessions\    the last few of each, never needed to run
        switcher.log

    A profile is told apart by the account it holds, not by its name: the
    profile signed in now is the one whose account Claude is signed in to
    (Resolve-CurrentProfile), so an account signed in from Claude's own sign-in
    screen is never saved over another profile's sign-in.

    Every exported function takes the switcher's lock and opens the data folder
    itself (Enter-SwitcherData): the one it was last pointed at, else the
    default one. Errors are ErrorRecords whose category says what went wrong
    (New-SwitcherError); switch.ps1 turns the category into its exit code.

    The functions are in Public\ (exported) and Private\, a file per topic; this
    file holds the module's settings and loads them.
#>

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web.Extensions

# --- Constants ----------------------------------------------------------------

# A profile name is a folder name: any letters, digits and spaces, none of the
# characters Windows refuses there, no space or dot at the end, up to 40 characters.
$script:ProfileNameMax = 40
$script:ProfileNamePattern = '^[^<>:"/\\|?*\x00-\x1f]{1,' + $script:ProfileNameMax + '}$'
$script:ReservedNamePattern = '^(CON|PRN|AUX|NUL|COM\d|LPT\d)$'
$script:UuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
$script:CookieFiles = @('Cookies', 'Cookies-journal')
# The script a detached run starts (Get-DetachedCommandLine).
$script:SwitchScript = Join-Path $PSScriptRoot 'switch.ps1'
$script:Utf8 = New-Object Text.UTF8Encoding $false
$script:MutexName = 'Local\ClaudeAccountSwitcher'
$script:LockTimeoutSeconds = 30
$script:LogMaxBytes = 256KB
$script:LogKeepLines = 500
$script:BackupKeepCount = 5
# Claude gets this long to quit on its own before it is ended (its own clean-up
# on quit usually takes a few seconds).
$script:QuitGraceSeconds = 30
$script:CloseTimeoutSeconds = 20
# An account's own name, numbered from 2 up to this when it is taken (Get-FreeProfileName).
$script:NumberedNameMax = 9
# A file being replaced while a reader holds it open is tried again this often.
$script:ReplaceAttempts = 5
$script:ReplaceRetryMilliseconds = 50

# The layout of the data folder (state.json's version) and of index.json. A
# change to either bumps it; Invoke-DataMigration brings older folders up.
$script:DataVersion = 1
$script:IndexVersion = 1
# The shape of switch.json (Private\SwitchRun.ps1), which the mod reads too.
$script:SwitchRunVersion = 1

# Session sharing: a deletion is remembered this long, so a list that joins later
# doesn't bring the card back; a list that lost more than half its cards, and
# more than WipeMinCards, was not pruned by hand (a reinstall, a reset).
$script:DeletedKeepDays = 180
$script:WipeMinCards = 20
$script:RemovedKeepRuns = 10
$script:SessionsVersion = 1

# The data folder in use (Initialize-SwitcherData), and the lock's depth: an
# exported function called by another holds the lock already.
$script:Paths = $null
$script:LockDepth = 0
$script:Lock = $null
$script:IsIndexStale = $false
$script:RemovedRun = $null
# Whether this run went on to close Claude (Stop-Claude): from then on the mod
# that handed it a switch is gone with Claude, so a failure is shown in a dialog.
$script:IsClaudeLeft = $false

# --- Messages -------------------------------------------------------------------
# Every message of the module and of switch.ps1 is in <language>\AccountSwitcher.psd1:
# the one of the user's language where there is one, else en-US.

Import-LocalizedData -BindingVariable 'SwitcherText' -FileName 'AccountSwitcher.psd1' -BaseDirectory $PSScriptRoot -ErrorAction SilentlyContinue
if (-not (Get-Variable -Name 'SwitcherText' -ErrorAction SilentlyContinue)) {
    Import-LocalizedData -BindingVariable 'SwitcherText' -FileName 'AccountSwitcher.psd1' -BaseDirectory $PSScriptRoot -UICulture 'en-US'
}
$script:Text = $SwitcherText

# --- Functions --------------------------------------------------------------------

# Every file of Private\ and Public\; the functions of Public\ are the module's.
$public = foreach ($folder in 'Private', 'Public') {
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot $folder) -Filter '*.ps1' | Sort-Object Name) {
        . $file.FullName
        if ($folder -eq 'Public') {
            $ast = [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$null, [ref]$null)
            $ast.FindAll({ $args[0] -is [Management.Automation.Language.FunctionDefinitionAst] }, $false).Name
        }
    }
}
Export-ModuleMember -Function $public
