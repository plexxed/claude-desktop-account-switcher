# The lock every change to the data folder is made under.

<#
.SYNOPSIS
    Takes the switcher's lock, so two runs never change the data at once.
.DESCRIPTION
    Two switches at once (a double click, two sessions) would each save the
    sign-in they found into the profile they think is current, one of them
    the wrong one. Returns the held mutex for Exit-SwitcherLock; a lock left by a
    run that died is taken over.
#>
function Enter-SwitcherLock {
    [CmdletBinding()]
    [OutputType([Threading.Mutex])]
    param(
        [int]$TimeoutSeconds = $script:LockTimeoutSeconds,
        [string]$Name = $script:MutexName
    )

    $mutex = New-Object Threading.Mutex($false, $Name)
    try {
        if (-not $mutex.WaitOne([TimeSpan]::FromSeconds($TimeoutSeconds))) {
            $mutex.Dispose()
            throw (New-SwitcherError SwitchRunning ResourceBusy)
        }
    } catch [Threading.AbandonedMutexException] {
        # The run that held it ended without letting go; it is ours now.
        Write-Verbose 'Took over a lock left by a run that ended.'
    }

    return $mutex
}

function Exit-SwitcherLock {
    [CmdletBinding()]
    param([Parameter(Mandatory)][Threading.Mutex]$Mutex)

    $Mutex.ReleaseMutex()
    $Mutex.Dispose()
}
