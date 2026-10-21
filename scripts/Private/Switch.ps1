# The steps of a switch (Switch-AccountProfile decides whether it runs).

# Whether a switch to saved profile $Name (its own name: Resolve-SavedProfileName)
# has something to do: not when it is the profile signed in now.
function Test-SwitchNeeded {
    [CmdletBinding()]
    param([string]$Name, [string]$ClaudeDir)

    return $Name -ne (Resolve-CurrentProfile (Get-SignedInAccount -ClaudeDir $ClaudeDir))
}

# Throws when a switch to saved profile $Name would do nothing, as the command
# line says it (a switch to the profile signed in now is "not now").
function Assert-SwitchNeeded {
    [CmdletBinding()]
    param([string]$Name, [string]$ClaudeDir)

    if (-not (Test-SwitchNeeded $Name $ClaudeDir)) { throw (New-SwitcherError AlreadySignedIn InvalidOperation $Name) }
}

# The switch itself, once it is decided: see Switch-AccountProfile.
function Invoke-ProfileSwitch {
    [CmdletBinding()]
    param([string]$Name, [string]$ClaudeDir, [switch]$NoRestart)

    $backup = $null
    $failure = $null
    try {
        Stop-Claude -ClaudeDir $ClaudeDir
        $backup = Backup-SignIn $ClaudeDir
        # Read now: Claude may have written its sign-in on the way out.
        $signedIn = Get-SignedInAccount -ClaudeDir $ClaudeDir
        if ($signedIn) {
            $current = Resolve-CurrentProfile $signedIn
            if (-not $current) {
                # Signed in from Claude's own sign-in screen to an account no profile
                # holds: kept as a profile of its own, never over another's sign-in.
                $current = Get-FreeProfileName
                New-Item -ItemType Directory -Path (Get-ProfileDir $current) | Out-Null
                Write-SwitcherLog (Get-SwitcherText UnsavedAccountSaved $current)
            }
            Save-ProfileSignIn $ClaudeDir $current
        }
        # The one time the session lists can change. A sync that fails leaves them
        # as they are and never stops the switch.
        try {
            Sync-SessionPool -ClaudeDir $ClaudeDir -Accounts (Get-SavedAccount)
        } catch {
            Write-SwitcherLog (Get-SwitcherText SessionsNotSynced $_.Exception.Message)
        }
        if ((Read-AccountProfile | Where-Object { $_.Name -eq $Name }).HasSignIn) {
            Restore-ProfileSignIn $ClaudeDir $Name
        } else {
            Clear-SignIn $ClaudeDir
            Write-SwitcherLog (Get-SwitcherText SignInNext $Name)
        }
        Write-LastSwitchedProfile $Name
    } catch {
        $failure = $_
        if ($backup) {
            try {
                Restore-SignInBackup $ClaudeDir $backup
            } catch {
                Write-SwitcherLog (Get-SwitcherText RollbackFailed -Arguments (Split-Path $backup -Leaf), $_.Exception.Message)
            }
        }
        throw $failure
    } finally {
        # Claude comes back whatever happened, on the sign-in it then holds. When
        # it can't, that is the switch's failure, unless the switch failed already:
        # then that failure is the one said, and this one is logged.
        if (-not $NoRestart) {
            try {
                Start-Claude
            } catch {
                if (-not $failure) { throw }
                Write-SwitcherLog (Get-SwitcherText ClaudeNotStarted $_.Exception.Message)
            }
        }
    }
}
