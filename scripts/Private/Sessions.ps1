# --- Code session sharing ---------------------------------------------------------------
# The Code tab lists an account's sessions from one card each, in
# claude-code-sessions\<account>\<organization>\local_*.json, so every account
# has a list of its own; the conversations themselves live in ~\.claude\projects,
# which every account reads. The profiles that share sessions (off by default)
# have their lists made one on each switch, while Claude is closed: a card one
# list lacks is copied in, and of two copies of a card the newer one wins.
#
# sessions.json remembers the cards each sharing list held after the last sync,
# so a card gone from a list since was deleted there: it is taken out of the
# other lists that shared then, and never copied again. A card taken out is
# moved to removed-sessions, never deleted; the conversation is never touched.
#
# An account that stops sharing, or whose profile is deleted, only leaves the
# sync: its list stays as it is, the sessions it shared stay in the others'.

# Each saved account once (two profiles may hold one): account -> whether a profile of it shares.
function Get-SavedAccount {
    [CmdletBinding()]
    [OutputType([hashtable])]
    param()

    $accounts = @{}
    foreach ($item in Read-AccountProfile) {
        if (-not $item.Account) { continue }
        $accounts[$item.Account] = [bool]$accounts[$item.Account] -or $item.SharesSessions
    }

    return $accounts
}

# The folder that holds an account's session cards (it may not exist yet); null when it can't be told.
function Get-SessionDir {
    [CmdletBinding()]
    param([string]$ClaudeDir, [string]$Account)

    $accountDir = Join-Path $ClaudeDir "claude-code-sessions\$Account"
    # The organization the mod saw the account run Code sessions in.
    $seen = Read-SeenAccount
    if ($seen.ContainsKey($Account) -and $seen[$Account].org) { return Join-Path $accountDir $seen[$Account].org }
    if (-not (Test-Path -LiteralPath $accountDir)) { return $null }
    # Else the folder its newest card was written to, or its only folder.
    $newest = $null
    foreach ($dir in Get-ChildItem -LiteralPath $accountDir -Directory) {
        foreach ($card in Get-ChildItem -LiteralPath $dir.FullName -Filter 'local_*.json' -File) {
            if (-not $newest -or $card.LastWriteTimeUtc -gt $newest.LastWriteTimeUtc) { $newest = $card }
        }
    }
    if ($newest) { return $newest.DirectoryName }
    $dirs = @(Get-ChildItem -LiteralPath $accountDir -Directory)
    if ($dirs.Count -eq 1) { return $dirs[0].FullName }

    return $null
}

# A list's cards by file name.
function Get-SessionCard {
    [CmdletBinding()]
    [OutputType([hashtable])]
    param([string]$Dir)

    $cards = @{}
    if ($Dir -and (Test-Path -LiteralPath $Dir)) {
        foreach ($card in Get-ChildItem -LiteralPath $Dir -Filter 'local_*.json' -File) { $cards[$card.Name] = $card }
    }

    return $cards
}

function Copy-SessionCard {
    [CmdletBinding()]
    param([IO.FileInfo]$Card, [string]$ToDir)

    New-Item -ItemType Directory -Force -Path $ToDir | Out-Null
    $target = Join-Path $ToDir $Card.Name
    # The copy keeps the card's write time, which says which copy is newer.
    Copy-Item -LiteralPath $Card.FullName -Destination $target -Force

    return Get-Item -LiteralPath $target
}

function Move-SessionCardAside {
    [CmdletBinding()]
    param([IO.FileInfo]$Card, [string]$Account)

    if (-not $script:RemovedRun) {
        $script:RemovedRun = Join-Path $script:Paths.Removed ('{0:yyyyMMdd-HHmmss}' -f (Get-Date))
    }
    $dir = Join-Path $script:RemovedRun $Account
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Move-Item -LiteralPath $Card.FullName -Destination (Join-Path $dir $Card.Name) -Force
}

# --- The sync, step by step ------------------------------------------------------------

# What the last sync left (sessions.json): Lists, account -> @{ Dir; Cards }; and
# Deleted, card -> when it was deleted, those deleted within DeletedKeepDays of $Now.
# Refuses a file a later version wrote, which this one would misread.
function Read-SessionPoolState {
    [CmdletBinding()]
    [OutputType([hashtable])]
    param([long]$Now)

    $value = Read-JsonFile $script:Paths.Sessions
    $state = @{ Lists = @{}; Deleted = @{} }
    if ($value -isnot [Collections.IDictionary]) { return $state }
    $version = $value['version'] -as [int]
    if ($version -gt $script:SessionsVersion) {
        throw (New-SwitcherError SessionsTooNew InvalidData $version $script:SessionsVersion)
    }
    if ($value['accounts'] -is [Collections.IDictionary]) {
        foreach ($account in @($value['accounts'].Keys)) {
            $entry = $value['accounts'][$account]
            if ($entry -isnot [Collections.IDictionary]) { continue }
            $state.Lists[$account] = @{ Dir = "$($entry['dir'])"; Cards = @($entry['cards'] | Where-Object { $_ }) }
        }
    }
    if ($value['deleted'] -is [Collections.IDictionary]) {
        foreach ($name in @($value['deleted'].Keys)) {
            $at = $value['deleted'][$name] -as [long]
            if ($at -and $Now - $at -lt $script:DeletedKeepDays * 86400000L) { $state.Deleted[$name] = $at }
        }
    }

    return $state
}

function Write-SessionPoolState {
    [CmdletBinding()]
    param([hashtable]$Lists, [hashtable]$Cards, [hashtable]$Deleted)

    $kept = @{}
    foreach ($account in $Lists.Keys) {
        # Plain strings: the serializer can't write the wrappers PowerShell puts on some.
        $kept[[string]$account] = @{ dir = [string]$Lists[$account]; cards = [string[]]@($Cards[$account].Keys | Sort-Object) }
    }
    Write-JsonFile $script:Paths.Sessions @{ version = $script:SessionsVersion; accounts = $kept; deleted = $Deleted }
}

# The sharing accounts' session lists: account -> folder. A list found before
# and not now stays where it was found.
function Find-SharingList {
    [CmdletBinding()]
    [OutputType([hashtable])]
    param([string]$ClaudeDir, [hashtable]$Accounts, [hashtable]$Last)

    $lists = @{}
    foreach ($account in @($Accounts.Keys)) {
        if (-not $Accounts[$account]) { continue }
        $dir = Get-SessionDir $ClaudeDir $account
        if (-not $dir -and $Last.ContainsKey($account)) { $dir = $Last[$account].Dir }
        if ($dir) { $lists[$account] = $dir }
        else { Write-SwitcherLog (Get-SwitcherText SessionListMissing $account) }
    }

    return $lists
}

# Step 1. A card a list held after the last sync and holds no more was deleted
# there: it is noted in $Deleted, taken out of the other lists that shared then,
# and never copied again. A list that joins now keeps its own copy. A list that
# lost most of its cards at once was not pruned by hand, and counts for nothing.
# Returns how many cards were taken out.
function Remove-DeletedSessionCard {
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([int])]
    param([hashtable]$Lists, [hashtable]$Cards, [hashtable]$Last, [hashtable]$Deleted, [long]$Now)

    $justDeleted = @{}
    foreach ($account in @($Lists.Keys)) {
        if (-not $Last.ContainsKey($account) -or $Last[$account].Dir -ne $Lists[$account]) { continue }
        $missing = @($Last[$account].Cards | Where-Object { -not $Cards[$account].ContainsKey($_) })
        if ($missing.Count -gt $script:WipeMinCards -and $missing.Count * 2 -gt $Last[$account].Cards.Count) {
            Write-SwitcherLog (Get-SwitcherText SessionListEmptied -Arguments $account, $missing.Count)
            continue
        }
        foreach ($name in $missing) {
            $justDeleted[$name] = $true
            $Deleted[$name] = $Now
        }
    }
    $removed = 0
    foreach ($name in @($justDeleted.Keys)) {
        foreach ($account in @($Lists.Keys)) {
            $isShared = $Last.ContainsKey($account) -and $Cards[$account].ContainsKey($name)
            if ($isShared -and $PSCmdlet.ShouldProcess($name, (Get-SwitcherText ActionRemoveCard))) {
                Move-SessionCardAside $Cards[$account][$name] $account
                $Cards[$account].Remove($name)
                $removed++
            }
        }
    }

    return $removed
}

# Step 2. Of each card, the newest copy goes to every list that lacks the card or
# holds an older copy; a deleted card only has its copies kept current. Returns
# how many copies were made.
function Copy-NewestSessionCard {
    [CmdletBinding()]
    [OutputType([int])]
    param([hashtable]$Lists, [hashtable]$Cards, [hashtable]$Deleted)

    $names = @{}
    foreach ($account in $Lists.Keys) { foreach ($name in $Cards[$account].Keys) { $names[$name] = $true } }
    $copied = 0
    foreach ($name in @($names.Keys)) {
        $newest = $null
        foreach ($account in $Lists.Keys) {
            if (-not $Cards[$account].ContainsKey($name)) { continue }
            if (-not $newest -or $Cards[$account][$name].LastWriteTimeUtc -gt $Cards[$newest][$name].LastWriteTimeUtc) { $newest = $account }
        }
        $source = $Cards[$newest][$name]
        foreach ($account in @($Lists.Keys)) {
            if ($account -eq $newest) { continue }
            $has = $Cards[$account].ContainsKey($name)
            $isOlder = $has -and $Cards[$account][$name].LastWriteTimeUtc -lt $source.LastWriteTimeUtc
            if ($isOlder -or (-not $has -and -not $Deleted.ContainsKey($name))) {
                $Cards[$account][$name] = Copy-SessionCard $source $Lists[$account]
                $copied++
            }
        }
    }

    return $copied
}

# Forgets the session list of $Account in what the last sync left: kept, it would
# read as emptied should the account share again, and its cards as deleted.
function Remove-SessionPoolAccount {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][string]$Account)

    $pool = Read-JsonFile $script:Paths.Sessions
    $isKept = $pool -is [Collections.IDictionary] -and $pool['accounts'] -is [Collections.IDictionary] -and $pool['accounts'].ContainsKey($Account)
    if (-not $isKept -or -not $PSCmdlet.ShouldProcess($Account, (Get-SwitcherText ActionForgetSessionList))) { return }
    [void]$pool['accounts'].Remove($Account)
    Write-JsonFile $script:Paths.Sessions $pool
}

<#
.SYNOPSIS
    Makes the session lists of the sharing accounts one. $Accounts: account -> whether it shares.
#>
function Sync-SessionPool {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$ClaudeDir,
        [Parameter(Mandatory)][hashtable]$Accounts
    )

    if (-not $PSCmdlet.ShouldProcess((Get-SwitcherText TargetSessionLists), (Get-SwitcherText ActionSync))) { return }
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $script:RemovedRun = $null
    $state = Read-SessionPoolState $now
    $lists = Find-SharingList -ClaudeDir $ClaudeDir -Accounts $Accounts -Last $state.Lists
    $cards = @{}
    foreach ($account in $lists.Keys) { $cards[$account] = Get-SessionCard $lists[$account] }

    $removed = Remove-DeletedSessionCard -Lists $lists -Cards $cards -Last $state.Lists -Deleted $state.Deleted -Now $now
    $copied = Copy-NewestSessionCard -Lists $lists -Cards $cards -Deleted $state.Deleted
    Write-SessionPoolState -Lists $lists -Cards $cards -Deleted $state.Deleted

    if ($copied -or $removed) {
        $parts = (Get-SwitcherPluralText SessionsCopied $copied), (Get-SwitcherPluralText SessionsRemoved $removed)
        Write-SwitcherLog (Get-SwitcherText SessionsSynced -Arguments $parts)
    }
    if (Test-Path -LiteralPath $script:Paths.Removed) {
        Get-ChildItem -LiteralPath $script:Paths.Removed -Directory | Sort-Object Name -Descending |
            Select-Object -Skip $script:RemovedKeepRuns | Remove-Item -Recurse -Force
    }
}
