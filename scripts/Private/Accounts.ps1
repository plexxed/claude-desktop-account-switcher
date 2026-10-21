# What was seen of each account (accounts.json): the organization it runs Code
# sessions in, where Get-SessionDir finds its session list, and its email, which
# the Accounts list shows. The mod notes both at a session's start.

# accounts.json: account -> @{ org; email }, each a valid entry; empty when there is none.
function Read-SeenAccount {
    [CmdletBinding()]
    [OutputType([hashtable])]
    param()

    $seen = @{}
    $value = Read-JsonFile $script:Paths.Accounts
    if ($value -isnot [Collections.IDictionary]) { return $seen }
    foreach ($key in @($value.Keys)) {
        $id = Get-AccountId $key
        $entry = $value[$key]
        if (-not $id -or $entry -isnot [Collections.IDictionary]) { continue }
        $seen[$id] = @{ org = Get-AccountId $entry['org']; email = if ($entry['email']) { [string]$entry['email'] } else { $null } }
    }

    return $seen
}

# $Seen as accounts.json and index.json hold it: each entry's org and email, where known.
function ConvertTo-SeenAccountJson {
    [CmdletBinding()]
    [OutputType([hashtable])]
    param([hashtable]$Seen)

    $value = @{}
    foreach ($id in @($Seen.Keys)) {
        $entry = @{}
        foreach ($key in 'org', 'email') { if ($Seen[$id][$key]) { $entry[$key] = [string]$Seen[$id][$key] } }
        $value[[string]$id] = $entry
    }

    return $value
}

function Write-SeenAccount {
    [CmdletBinding()]
    param([hashtable]$Seen)

    Write-JsonFile $script:Paths.Accounts (ConvertTo-SeenAccountJson $Seen)
}

<#
.SYNOPSIS
    Notes what the mod saw of an account at a session's start: its organization
    and its email. What is not given stays as it was noted before.
#>
function Set-SeenAccount {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Account,
        [string]$Organization,
        [string]$Email
    )

    $id = Get-AccountId $Account
    if (-not $id) { throw (New-SwitcherError AccountIdInvalid InvalidArgument $Account) }
    $org = Get-AccountId $Organization
    if ($Organization -and -not $org) { throw (New-SwitcherError AccountIdInvalid InvalidArgument $Organization) }
    $Email = $Email.Trim()

    $seen = Read-SeenAccount
    $entry = if ($seen.ContainsKey($id)) { $seen[$id] } else { @{ org = $null; email = $null } }
    $isNew = ($org -and $entry.org -ne $org) -or ($Email -and $entry.email -ne $Email)
    if (-not $isNew -or -not $PSCmdlet.ShouldProcess($id, (Get-SwitcherText ActionNoteAccount))) { return }
    if ($org) { $entry.org = $org }
    if ($Email) { $entry.email = $Email }
    $seen[$id] = $entry
    Write-SeenAccount $seen
}

# Forgets what was seen of $Account: its organization and email.
function Remove-SeenAccount {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][string]$Account)

    $seen = Read-SeenAccount
    if (-not $seen.ContainsKey($Account) -or -not $PSCmdlet.ShouldProcess($Account, (Get-SwitcherText ActionForgetAccount))) { return }
    [void]$seen.Remove($Account)
    Write-SeenAccount $seen
}
