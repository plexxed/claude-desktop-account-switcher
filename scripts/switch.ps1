#Requires -Version 5.1
<#
.SYNOPSIS
    Switches Claude Desktop between saved accounts (unofficial).

.DESCRIPTION
    The command line of the AccountSwitcher module, which documents what a
    profile holds and where it is kept. Its commands are Invoke-AccountSwitcher's
    (Get-Help Invoke-AccountSwitcher lists them; init and start are for the mod,
    the others for anyone). switch and new close Claude, swap its sign-in and
    start it again; the other commands leave it running.

.PARAMETER Detach
    Runs the command in a hidden process of its own, outside Claude's process
    tree: the mod's switch would otherwise end with the Claude that started it.
    A name that is not valid or not saved, or a switch to the profile signed in
    now, fails here first. The detached run says how it goes in switch.json in
    the data folder, under the -RunId given (the mod's own), which the mod reads
    while it waits.

.EXAMPLE
    switch.ps1 switch work

.EXAMPLE
    switch.ps1 share home on

.NOTES
    Exit codes, by what went wrong (the category of the module's error):
        0  done
        1  anything else (Claude did not close in time, a file can't be read, ...)
        2  a command, name or value that is not valid, or one missing
        3  something that is not there (a profile, Claude's data folder)
        4  something that is there already (a profile, a saved account)
        5  another switch is running
        6  not now (the profile is signed in now, Claude is signed out)
    A message saying what went wrong is written to standard error.
#>
[CmdletBinding()]
param(
    # One of Invoke-AccountSwitcher's commands, which checks it.
    [Parameter(Position = 0)]
    [string]$Command = 'list',

    # The profile the command acts on.
    [Parameter(Position = 1)][string]$Name,

    # rename: the new name; share: on or off.
    [Parameter(Position = 2)][string]$Value,

    # The switcher's data folder; the mod passes its own.
    [string]$DataDir,

    # start: the account the session runs for, its own name, the organization
    # it runs Code sessions in, and its email.
    [string]$Account,
    [string]$DisplayName,
    [string]$Organization,
    [string]$Email,

    [switch]$Detach,

    # Leave Claude closed after a switch.
    [switch]$NoRestart,

    # Set on the detached copy: nobody sees its console, so an error once Claude
    # is closing goes to a dialog (before, the mod that waits on it says it).
    [switch]$Background,

    # The id a detached run says how it goes under, in switch.json: with -Detach,
    # the one the caller waits for; on the detached copy, its own.
    [string]$RunId
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
# Profile names may be in any script; the mod reads this output as UTF-8.
[Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
$PSDefaultParameterValues['*:InformationAction'] = 'Continue'
Import-Module (Join-Path $PSScriptRoot 'AccountSwitcher.psd1') -Force

# The exit code of each category of the module's errors; any other is 1. The
# mod reads them as hooks/services/switcher.ts's ScriptExit; both are tested
# against tests/fixtures/exit-codes.ts.
$ExitCodes = @{
    InvalidArgument  = 2
    ObjectNotFound   = 3
    ResourceExists   = 4
    ResourceBusy     = 5
    InvalidOperation = 6
}

$parameters = @{} + $PSBoundParameters
$parameters['Command'] = $Command
try {
    Invoke-AccountSwitcher @parameters
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    $code = if ($_.Exception -is [Management.Automation.ParameterBindingException]) { $ExitCodes.InvalidArgument } else { $ExitCodes["$($_.CategoryInfo.Category)"] }
    exit $(if ($code) { $code } else { 1 })
}
