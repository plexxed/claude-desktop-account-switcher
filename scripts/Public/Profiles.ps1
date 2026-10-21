# Profiles: listing them and every change to them. Each function takes the
# switcher's lock and opens the data folder itself (Enter-SwitcherData).

<#
.SYNOPSIS
    The saved profiles, each with its account, sharing and whether it holds a sign-in.
.PARAMETER DataDir
    The switcher's data folder; by default the one used last, else
    <Claude config dir>\plugins\data\account-switcher.
#>
function Get-AccountProfile {
    [CmdletBinding()]
    [OutputType('AccountSwitcher.Profile')]
    param([string]$DataDir)

    Enter-SwitcherData -DataDir $DataDir
    try {
        Read-AccountProfile
    } finally {
        Exit-SwitcherData
    }
}

<#
.SYNOPSIS
    Names the account Claude is signed in to now. Nothing closes: its sign-in is
    saved on the next switch, while Claude is closed (its cookie store is locked
    while it runs).
.PARAMETER AutoName
    Takes a free name made from $Name (the account's own name, which may be left
    out), numbered when it is taken, rather than refusing a taken one: as the
    mod names an account the first time it sees it.
.PARAMETER ClaudeDir
    Claude Desktop's data folder; by default the one it is installed with.
#>
function Save-SignedInAccount {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [AllowEmptyString()][string]$Name,
        [switch]$AutoName,
        [string]$ClaudeDir,
        [string]$DataDir
    )

    Enter-SwitcherData -DataDir $DataDir -Change
    try {
        if (-not $ClaudeDir) { $ClaudeDir = Get-ClaudeDataDir }
        if (-not $AutoName) { Assert-ProfileName $Name }
        $account = Get-SignedInAccount -ClaudeDir $ClaudeDir
        if (-not $account) { throw (New-SwitcherError NotSignedIn InvalidOperation) }
        $holder = Read-AccountProfile | Where-Object { $_.Account -eq $account } | Select-Object -First 1
        if ($holder) { throw (New-SwitcherError AccountAlreadySaved ResourceExists $holder.Name) }
        if ($AutoName) { $Name = Get-FreeProfileName $Name }
        if (Test-SavedProfile $Name) { throw (New-SwitcherError ProfileExists ResourceExists $Name) }
        if (-not $PSCmdlet.ShouldProcess($Name, (Get-SwitcherText ActionSaveSignedIn))) { return }
        New-Item -ItemType Directory -Path (Get-ProfileDir $Name) | Out-Null
        Write-ProfileRecord $Name @{ account = $account }
        Write-LastSwitchedProfile $Name
        Write-SwitcherLog (Get-SwitcherText AccountNamed $Name)
    } finally {
        Exit-SwitcherData
    }
}

<#
.SYNOPSIS
    Adds a profile that signs in on its first switch.
#>
function Add-AccountProfile {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$DataDir
    )

    Enter-SwitcherData -DataDir $DataDir -Change
    try {
        Assert-NewProfileName $Name
        if (-not $PSCmdlet.ShouldProcess($Name, (Get-SwitcherText ActionAdd))) { return }
        New-Item -ItemType Directory -Path (Get-ProfileDir $Name) | Out-Null
        Write-ProfileRecord $Name @{}
        Write-SwitcherLog (Get-SwitcherText ProfileAdded $Name)
    } finally {
        Exit-SwitcherData
    }
}

<#
.SYNOPSIS
    Renames a profile; a change of case alone renames it too.
#>
function Rename-AccountProfile {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$NewName,
        [string]$DataDir
    )

    Enter-SwitcherData -DataDir $DataDir -Change
    try {
        Assert-ProfileName $NewName
        $Name = Resolve-SavedProfileName $Name
        if ($Name -ceq $NewName) { return }
        # A change of case alone renames the same folder.
        if ($Name -ne $NewName -and (Test-SavedProfile $NewName)) { throw (New-SwitcherError ProfileExists ResourceExists $NewName) }
        if (-not $PSCmdlet.ShouldProcess($Name, (Get-SwitcherText ActionRename $NewName))) { return }
        $isLastSwitchedTo = (Read-LastSwitchedProfile) -eq $Name
        $dir = Get-ProfileDir $Name
        if ($Name -eq $NewName) {
            # Windows keeps the old case on a rename to the same name in another case.
            $through = "$dir.renaming"
            Move-Item -LiteralPath $dir -Destination $through
            Move-Item -LiteralPath $through -Destination (Get-ProfileDir $NewName)
        } else {
            Move-Item -LiteralPath $dir -Destination (Get-ProfileDir $NewName)
        }
        if ($isLastSwitchedTo) { Write-LastSwitchedProfile $NewName }
        Write-SwitcherLog (Get-SwitcherText ProfileRenamed -Arguments $Name, $NewName)
    } finally {
        Exit-SwitcherData
    }
}

<#
.SYNOPSIS
    Forgets a profile and its saved sign-in; never the profile signed in now.
.DESCRIPTION
    Its account's sign-in lives on in the backups a switch away from it made,
    its email in what was seen of the accounts, and its session list in the
    shared pool's record (which, kept, would read the list as emptied should the
    account share again): all go too, unless another profile holds the account.
#>
function Remove-AccountProfile {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$ClaudeDir,
        [string]$DataDir
    )

    Enter-SwitcherData -DataDir $DataDir -Change
    try {
        if (-not $ClaudeDir) { $ClaudeDir = Get-ClaudeDataDir }
        $Name = Resolve-SavedProfileName $Name
        $current = Resolve-CurrentProfile (Get-SignedInAccount -ClaudeDir $ClaudeDir)
        if ($Name -eq $current) { throw (New-SwitcherError DeleteSignedIn InvalidOperation $Name) }
        if (-not $PSCmdlet.ShouldProcess($Name, (Get-SwitcherText ActionDelete))) { return }
        $account = (Read-ProfileRecord $Name).account
        Remove-Item -LiteralPath (Get-ProfileDir $Name) -Recurse -Force
        Write-SwitcherLog (Get-SwitcherText ProfileDeleted $Name)
        if ($account -and -not (Get-SavedAccount).ContainsKey($account)) {
            $backups = @(Remove-SignInBackup $account)
            Remove-SeenAccount $account
            Remove-SessionPoolAccount $account
            if ($backups.Count) { Write-SwitcherLog (Get-SwitcherPluralText BackupsRemoved $backups.Count) }
        }
    } finally {
        Exit-SwitcherData
    }
}

<#
.SYNOPSIS
    Turns a profile's session sharing on or off. Only marks the profile: its
    session list joins or leaves on the next switch, when Claude is closed.
#>
function Set-AccountProfileSharing {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][bool]$Enabled,
        [string]$DataDir
    )

    Enter-SwitcherData -DataDir $DataDir -Change
    try {
        $Name = Resolve-SavedProfileName $Name
        if (-not $PSCmdlet.ShouldProcess($Name, (Get-SwitcherText ActionShare $Enabled))) { return }
        $record = Read-ProfileRecord $Name
        $record.shareSessions = $Enabled
        Write-ProfileRecord $Name $record
        Write-SwitcherLog (Get-SwitcherText $(if ($Enabled) { 'SharingOn' } else { 'SharingOff' }) $Name)
    } finally {
        Exit-SwitcherData
    }
}
