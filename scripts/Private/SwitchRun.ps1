# switch.json: how a run outside Claude (Start-DetachedSwitcher) goes, for the
# mod, which hands a switch to it and waits for Claude to close:
#
#     {
#       "version": 1,
#       "id": "<the run's id>",
#       "command": "switch" | "new" | ...,
#       "state": "starting" | "running" | "failed" | "done",
#       "message": "<why it failed>" | null
#     }
#
# The run that hands the command off writes "starting"; the run outside Claude
# writes "running" as soon as it runs, before it waits for the lock, then
# "failed" with its error or "done". A run that never writes "running" never
# started. hooks/services/switchRun.ts reads it; a change to its shape bumps
# SwitchRunVersion there and here. Both sides are tested against
# tests/fixtures/switch-run-sample.ts.

function Get-SwitchRunPath {
    [CmdletBinding()]
    param([string]$DataDir)

    return Join-Path $DataDir 'switch.json'
}

# Writes how run $RunId of $Command stands into the data folder $DataDir. Never
# throws: a status that can't be written must not hide what the run did; the
# mod then waits for Claude to close as long as it would.
function Write-SwitchRunStatus {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DataDir,
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][ValidateSet('starting', 'running', 'failed', 'done')][string]$State,
        [string]$Message
    )

    try {
        New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
        Write-JsonFile (Get-SwitchRunPath $DataDir) @{
            version = $script:SwitchRunVersion
            id      = $RunId
            command = $Command
            state   = $State
            message = if ($Message) { $Message } else { $null }
        }
    } catch {
        Write-Verbose "switch.json was not written: $($_.Exception.Message)"
    }
}
