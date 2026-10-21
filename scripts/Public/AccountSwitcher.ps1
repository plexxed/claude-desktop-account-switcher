# The commands of switch.ps1, as one function the script (and anyone) can call.

<#
.SYNOPSIS
    Runs one of the switcher's commands; switch.ps1 is its command line.
.DESCRIPTION
    Commands:
        list                    profiles, and which one is signed in now
        init                    open the data folder and write index.json
        start                   what the mod asks at a session's start: note
                                the -Account's -Organization and -Email, and
                                give the account signed in now a profile if
                                none holds it (named after -DisplayName, the
                                account's own name)
        save   <name>           name the account signed in now (nothing closes)
        switch <name>           switch Claude to <name>; a profile never signed
                                in opens the sign-in screen
        add    <name>           add a profile that signs in on its first switch
        new    <name>           add <name> and switch to it at once
        rename <name> <new>     rename a profile
        delete <name>           forget a profile and its saved sign-in
        share  <name> on|off    share the profile's Code sessions with the other
                                sharing profiles, or stop (from the next switch)

    A failure is written to the log and thrown on, its category saying what
    went wrong (see switch.ps1 for the exit code of each).
.PARAMETER Detach
    Runs the command through switch.ps1 in a hidden process of its own, outside
    the caller's process tree, and returns at once: the mod's switch would
    otherwise end with the Claude that started it. What can be checked before
    it starts is checked first, so a mistake fails here rather than in a dialog,
    as does a switch to the profile signed in now (InvalidOperation): a run
    handed off is always one that goes on to do something.
.PARAMETER Background
    Set on that detached run: nobody sees its console. A failure once it went on
    to close Claude is also shown in a dialog, as the mod that handed it off is
    gone with Claude; one before is the mod's to say (switch.json).
.PARAMETER RunId
    The id a detached run writes how it goes under, in switch.json
    (Write-SwitchRunStatus), for the mod that waits on it. With -Detach, the id
    the run is handed under (the mod gives its own, so it waits for that run
    alone); else a new one. With -Background, the id of this run.
#>
function Invoke-AccountSwitcher {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, Position = 0)]
        [ValidateSet('list', 'init', 'start', 'save', 'switch', 'add', 'new', 'rename', 'delete', 'share')]
        [string]$Command,

        # The profile the command acts on.
        [Parameter(Position = 1)][string]$Name,

        # rename: the new name; share: on or off.
        [Parameter(Position = 2)][string]$Value,

        # start: the account the session runs for, its own name, the organization
        # it runs Code sessions in, and its email.
        [string]$Account,
        [string]$DisplayName,
        [string]$Organization,
        [string]$Email,

        # The switcher's data folder; by default the one used last, else the default one.
        [string]$DataDir,

        # switch, new: leave Claude closed after the switch.
        [switch]$NoRestart,

        [switch]$Detach,
        [switch]$Background,
        [string]$RunId
    )

    $script:IsClaudeLeft = $false
    # The run handed off says how it goes (the one handing it off, only that it
    # starts): said before the lock is waited for, as the run has started.
    $runDir = if (-not $RunId -or $Detach) { $null } elseif ($DataDir) { $DataDir } else { Get-DefaultDataDir }
    if ($runDir) { Write-SwitchRunStatus -DataDir $runDir -RunId $RunId -Command $Command -State running }
    $isOpen = $false
    try {
        Enter-SwitcherData -DataDir $DataDir -Change:($Command -ne 'list' -and -not $Detach)
        $isOpen = $true
        Assert-CommandDue -Command $Command -Name $Name
        if ($Detach) {
            $forward = @{} + $PSBoundParameters
            [void]$forward.Remove('Detach')
            Start-DetachedSwitcher -Parameters $forward
            Get-SwitcherText DetachStarted -Arguments $Command, $Name
            return
        }
        switch ($Command) {
            'list' {
                $claudeDir = try { Get-ClaudeDataDir } catch { $null }
                Format-AccountProfileList $claudeDir
            }
            # Opening the data folder is all there is to it.
            'init' { }
            'start' { Update-SignedInAccount -ClaudeDir (Get-ClaudeDataDir) -Account $Account -DisplayName $DisplayName -Organization $Organization -Email $Email }
            'save' { Save-SignedInAccount -Name $Name }
            'switch' { Switch-AccountProfile -Name $Name -NoRestart:$NoRestart }
            'add' { Add-AccountProfile -Name $Name }
            'new' {
                Add-AccountProfile -Name $Name
                try {
                    Switch-AccountProfile -Name $Name -NoRestart:$NoRestart
                } catch {
                    # A switch that failed before it was made leaves nothing of new
                    # behind; one that was made (Claude did not start again) keeps it.
                    if ((Read-LastSwitchedProfile) -ne $Name) { Undo-ProfileAdd $Name }
                    throw
                }
            }
            'rename' { Rename-AccountProfile -Name $Name -NewName $Value }
            'delete' { Remove-AccountProfile -Name $Name }
            'share' {
                if ($Value -notin 'on', 'off') { throw (New-SwitcherError ShareOnOff InvalidArgument) }
                Set-AccountProfileSharing -Name $Name -Enabled ($Value -eq 'on')
            }
        }
        if ($runDir) { Write-SwitchRunStatus -DataDir $runDir -RunId $RunId -Command $Command -State done }
    } catch {
        # The log only: the caller says it on screen, but for a detached run,
        # which says it in switch.json for the mod that waits on it, and in a
        # dialog once it went on to close Claude, and that mod with it.
        Write-SwitcherLog (Get-SwitcherText LogError $_.Exception.Message) -InformationAction SilentlyContinue
        if ($runDir) { Write-SwitchRunStatus -DataDir $runDir -RunId $RunId -Command $Command -State failed -Message $_.Exception.Message }
        if ($Background -and $script:IsClaudeLeft) { Show-SwitcherError $_.Exception.Message }
        throw
    } finally {
        if ($isOpen) { Exit-SwitcherData }
    }
}
