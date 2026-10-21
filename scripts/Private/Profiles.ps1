# Profiles: their folders and records, their names, the profile last switched
# to, and which one is signed in now.

function Get-ProfileDir {
    [CmdletBinding()]
    param([string]$Name)

    return Join-Path $script:Paths.Profiles $Name
}

# Folder names on Windows are told apart without regard to case, as here.
function Test-SavedProfile {
    [CmdletBinding()]
    param([string]$Name)

    return Test-Path -LiteralPath (Get-ProfileDir $Name)
}

function Assert-SavedProfile {
    [CmdletBinding()]
    param([string]$Name)

    if (-not (Test-SavedProfile $Name)) { throw (New-SwitcherError ProfileNotSaved ObjectNotFound $Name) }
}

# The saved profile $Name names, by its folder's own name ("home" for "HOME"),
# which is what every change writes: the name as typed may differ in case.
# Throws when the name is not valid or no profile has it.
function Resolve-SavedProfileName {
    [CmdletBinding()]
    param([AllowEmptyString()][string]$Name)

    Assert-ProfileName $Name
    Assert-SavedProfile $Name
    $dir = Get-ChildItem -LiteralPath $script:Paths.Profiles -Directory | Where-Object { $_.Name -eq $Name } | Select-Object -First 1

    return $dir.Name
}

# A profile's profile.json: account and sharing, both absent until known.
function Read-ProfileRecord {
    [CmdletBinding()]
    [OutputType([hashtable])]
    param([string]$Name)

    $value = Read-JsonFile (Join-Path (Get-ProfileDir $Name) 'profile.json')
    $record = @{ account = $null; shareSessions = $false }
    if ($value -is [Collections.IDictionary]) {
        $record.account = Get-AccountId $value['account']
        $record.shareSessions = $value['shareSessions'] -eq $true
    }

    return $record
}

function Write-ProfileRecord {
    [CmdletBinding()]
    param([string]$Name, [hashtable]$Record)

    $value = @{}
    if ($Record['account']) { $value['account'] = [string]$Record['account'] }
    if ($Record['shareSessions']) { $value['shareSessions'] = $true }
    Write-JsonFile (Join-Path (Get-ProfileDir $Name) 'profile.json') $value
}

# The saved profiles, by name: each with its account, sharing and whether it holds a sign-in.
function Read-AccountProfile {
    [CmdletBinding()]
    param()

    foreach ($dir in Get-ChildItem -LiteralPath $script:Paths.Profiles -Directory | Sort-Object Name) {
        $record = Read-ProfileRecord $dir.Name
        [pscustomobject]@{
            PSTypeName     = 'AccountSwitcher.Profile'
            Name           = $dir.Name
            Account        = $record.account
            SharesSessions = $record.shareSessions
            HasSignIn      = Test-Path -LiteralPath (Join-Path $dir.FullName 'auth.json')
        }
    }
}

# The profile last switched to (null when it is gone): the one an account signed
# in from the sign-in screen belongs to, while that profile holds none yet.
function Read-LastSwitchedProfile {
    [CmdletBinding()]
    param()

    $name = (Read-SwitcherState).lastSwitchedTo
    if ($name -and (Test-SavedProfile $name)) { return $name }

    return $null
}

function Write-LastSwitchedProfile {
    [CmdletBinding()]
    param([string]$Name)

    $state = Read-SwitcherState
    $state.lastSwitchedTo = $Name
    Write-SwitcherState $state
}

# --- Names ---------------------------------------------------------------------------

# Whether $Name can be a profile name (Assert-ProfileName says why not). No
# leading "-" either: on a command line it would read as a parameter.
function Test-ProfileName {
    [CmdletBinding()]
    [OutputType([bool])]
    param([string]$Name)

    $isFolderSafe = $Name -match $script:ProfileNamePattern -and -not ($Name -match '^[\s-]') -and -not ($Name -match '[\s.]$')

    return $isFolderSafe -and -not ($Name -match $script:ReservedNamePattern)
}

# Throws when a name can't be a profile name.
function Assert-ProfileName {
    [CmdletBinding()]
    param([AllowEmptyString()][string]$Name)

    if (-not $Name) { throw (New-SwitcherError NameRequired InvalidArgument) }
    if (-not (Test-ProfileName $Name)) { throw (New-SwitcherError NameInvalid InvalidArgument $Name $script:ProfileNameMax) }
}

# Throws when $Name can't be a new profile's name: not valid, or a profile has it.
function Assert-NewProfileName {
    [CmdletBinding()]
    param([AllowEmptyString()][string]$Name)

    Assert-ProfileName $Name
    if (Test-SavedProfile $Name) { throw (New-SwitcherError ProfileExists ResourceExists $Name) }
}

# Takes back profile $Name, which Add-AccountProfile has just made and which
# holds nothing yet: as a new whose switch failed leaves it.
function Undo-ProfileAdd {
    [CmdletBinding()]
    param([string]$Name)

    Remove-Item -LiteralPath (Get-ProfileDir $Name) -Recurse -Force
    Write-SwitcherLog (Get-SwitcherText ProfileAddUndone $Name)
}

# The name for an account no profile holds: $Base (the account's own name,
# when there is one) if no profile has it, else $Base numbered from 2
# (NumberedProfileName, cut to fit), else the first of Account1, Account2, ...
# (FreeProfileName) no profile has.
function Get-FreeProfileName {
    [CmdletBinding()]
    param([string]$Base)

    if ($Base) {
        $numbered = foreach ($n in 2..$script:NumberedNameMax) {
            $room = $script:ProfileNameMax - (Get-SwitcherText NumberedProfileName -Arguments '', $n).Length
            $length = [Math]::Min($Base.Length, $room)
            # Cut between characters, never between the two halves of one (an emoji).
            if ($length -lt $Base.Length -and [char]::IsLowSurrogate($Base[$length])) { $length-- }
            $stem = $Base.Substring(0, $length).TrimEnd(' ', '.')
            Get-SwitcherText NumberedProfileName -Arguments $stem, $n
        }
        foreach ($name in @($Base) + @($numbered)) {
            if ((Test-ProfileName $name) -and -not (Test-SavedProfile $name)) { return $name }
        }
    }
    for ($n = 1; ; $n++) {
        $name = Get-SwitcherText FreeProfileName $n
        if (-not (Test-SavedProfile $name)) { return $name }
    }
}

# --- The profile signed in now -----------------------------------------------------

<#
.SYNOPSIS
    The profile of the account signed in now, or null when no profile holds it.
.DESCRIPTION
    The profile that holds $Account; else the profile last switched to, while it
    holds no account yet (it was just added, and the sign-in screen is where
    its account is being signed in to). hooks/domain/profiles.ts finds it the same way,
    tested against the same cases (tests/fixtures/current-profile.ts).
#>
function Resolve-CurrentProfile {
    [CmdletBinding()]
    [OutputType([string])]
    param([AllowEmptyString()][string]$Account)

    $profiles = @(Read-AccountProfile)
    if ($Account) {
        $holder = $profiles | Where-Object { $_.Account -eq $Account } | Select-Object -First 1
        if ($holder) { return $holder.Name }
    }
    $lastSwitchedTo = Read-LastSwitchedProfile
    $last = $profiles | Where-Object { $_.Name -eq $lastSwitchedTo -and -not $_.Account } | Select-Object -First 1
    if ($last) { return $last.Name }

    return $null
}

<#
.SYNOPSIS
    What a session's start asks for, under one lock: notes the organization and
    email the session runs with ($Account's), then gives the account signed in
    now a profile, if none holds it. Nothing closes: its sign-in is saved on the
    next switch.
.DESCRIPTION
    The profile just switched to, while it holds no account yet (it was signed
    in to on Claude's own sign-in screen), records the account; else a new
    profile is named after $DisplayName (the account's own name), or AccountN.
    Nothing is given while Claude is signed out.
#>
function Update-SignedInAccount {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$ClaudeDir,
        [string]$Account,
        [string]$Organization,
        [string]$Email,
        [string]$DisplayName
    )

    if ($Account) { Set-SeenAccount -Account $Account -Organization $Organization -Email $Email }
    $signedIn = Get-SignedInAccount -ClaudeDir $ClaudeDir
    if (-not $signedIn) { return }
    $current = Resolve-CurrentProfile $signedIn
    if (-not $current) {
        Save-SignedInAccount -Name $DisplayName -AutoName -ClaudeDir $ClaudeDir
        return
    }
    # The profile that holds the account already, or the one just switched to.
    $record = Read-ProfileRecord $current
    if ($record.account -or -not $PSCmdlet.ShouldProcess($current, (Get-SwitcherText ActionRecordSignedIn))) { return }
    $record.account = $signedIn
    Write-ProfileRecord $current $record
    Write-SwitcherLog (Get-SwitcherText AccountBound $current)
}

# --- The list ------------------------------------------------------------------------

# The profiles as switch.ps1 list prints them, a line each, "*" marking the one signed in now.
function Format-AccountProfileList {
    [CmdletBinding()]
    param([string]$ClaudeDir)

    $account = if ($ClaudeDir) { Get-SignedInAccount -ClaudeDir $ClaudeDir } else { $null }
    $current = Resolve-CurrentProfile $account
    $profiles = @(Read-AccountProfile)
    if ($profiles.Count -eq 0) { Get-SwitcherText ListEmpty }
    foreach ($item in $profiles) {
        $notes = @(
            if ($item.Name -eq $current) { Get-SwitcherText ListSignedIn }
            elseif (-not $item.HasSignIn) { Get-SwitcherText ListNotSignedIn }
            if ($item.SharesSessions) { Get-SwitcherText ListShares }
        )
        $mark = if ($item.Name -eq $current) { '*' } else { ' ' }
        if ($notes) { Get-SwitcherText ListLineNotes -Arguments $mark, $item.Name, ($notes -join (Get-SwitcherText ListNoteSeparator)) }
        else { Get-SwitcherText ListLine -Arguments $mark, $item.Name }
    }
    if ($account -and -not $current) { Get-SwitcherText ListUnsaved }
}
