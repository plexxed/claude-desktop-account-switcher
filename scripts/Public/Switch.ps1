# Switching.

<#
.SYNOPSIS
    Switches Claude Desktop to profile $Name: closes Claude, saves the signed-in
    account's sign-in, syncs the shared session lists, restores $Name's sign-in
    (or opens the sign-in screen for a profile never signed in) and starts Claude.
.DESCRIPTION
    Claude's sign-in is backed up before anything changes. A step that fails
    puts it back from that backup, so Claude never starts with half of one
    account's sign-in and half of another's; a session sync that fails only
    leaves the lists as they are. Whatever happened, Claude is started again
    (unless -NoRestart), also when closing it failed half-way.
#>
function Switch-AccountProfile {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Name,
        [string]$ClaudeDir,
        [string]$DataDir,
        # Leave Claude closed after the switch.
        [switch]$NoRestart
    )

    Enter-SwitcherData -DataDir $DataDir -Change
    try {
        if (-not $ClaudeDir) { $ClaudeDir = Get-ClaudeDataDir }
        $Name = Resolve-SavedProfileName $Name
        if (-not (Test-SwitchNeeded $Name $ClaudeDir)) {
            Write-SwitcherLog (Get-SwitcherText AlreadySignedIn $Name)
            return
        }
        if (-not $PSCmdlet.ShouldProcess($Name, (Get-SwitcherText ActionSwitch))) { return }
        Invoke-ProfileSwitch -Name $Name -ClaudeDir $ClaudeDir -NoRestart:$NoRestart
    } finally {
        Exit-SwitcherData
    }
}
