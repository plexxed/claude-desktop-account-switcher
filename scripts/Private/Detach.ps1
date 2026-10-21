# Running a command outside the caller's process tree, and telling its failures.

# One argument as a Windows command line quotes it (the rules CommandLineToArgvW
# reads by): in double quotes, a quote and the backslashes before it escaped.
function ConvertTo-CommandLineArgument {
    [CmdletBinding()]
    param([string]$Argument)

    $backslash = [char]92
    $builder = New-Object Text.StringBuilder
    [void]$builder.Append('"')
    $pending = 0
    foreach ($char in $Argument.ToCharArray()) {
        if ($char -eq $backslash) {
            $pending++
            continue
        }
        # Backslashes are literal but before a quote, where each is doubled and the quote escaped.
        $count = if ($char -eq '"') { 2 * $pending + 1 } else { $pending }
        if ($count) { [void]$builder.Append($backslash, $count) }
        [void]$builder.Append($char)
        $pending = 0
    }
    # Before the closing quote too.
    if ($pending) { [void]$builder.Append($backslash, 2 * $pending) }
    [void]$builder.Append('"')

    return $builder.ToString()
}

# The command line that runs switch.ps1 hidden with $Parameters (name -> value;
# a switch given by its name alone), as the detached run gets it.
function Get-DetachedCommandLine {
    [CmdletBinding()]
    param([hashtable]$Parameters)

    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', (ConvertTo-CommandLineArgument $script:SwitchScript))
    foreach ($key in @($Parameters.Keys | Sort-Object)) {
        $value = $Parameters[$key]
        if ($value -is [switch] -or $value -is [bool]) {
            if ($value) { $arguments += "-$key" }
        } elseif ("$value") {
            $arguments += "-$key", (ConvertTo-CommandLineArgument "$value")
        }
    }
    $powershell = Join-Path $PSHOME 'powershell.exe'

    return (ConvertTo-CommandLineArgument $powershell) + ' ' + ($arguments -join ' ')
}

# Throws when $Command would fail or do nothing, checked before it runs (before
# a detached run starts, while its caller still waits): a name not valid or not
# saved, a new name taken, a switch to the profile signed in now.
function Assert-CommandDue {
    [CmdletBinding()]
    param([string]$Command, [string]$Name)

    switch ($Command) {
        'switch' { Assert-SwitchNeeded (Resolve-SavedProfileName $Name) (Get-ClaudeDataDir) }
        'new' { Assert-NewProfileName $Name }
    }
}

# Starts switch.ps1 with $Parameters, -Background and a run id (the RunId of
# $Parameters, which the mod gives so it knows which run to wait for; else a new
# one) through WMI, so it is no child of the caller and outlives it, in the data
# folder open now; its status in switch.json reads "starting" until it runs
# (Write-SwitchRunStatus).
# Its console is hidden from its creation: -WindowStyle Hidden alone hides it
# only once PowerShell runs, after it flashed on screen.
function Start-DetachedSwitcher {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][hashtable]$Parameters)

    $command = [string]$Parameters['Command']
    if (-not $PSCmdlet.ShouldProcess($command, (Get-SwitcherText ActionDetach))) { return }
    $dataDir = $script:Paths.Root
    $runId = if ($Parameters['RunId']) { [string]$Parameters['RunId'] } else { [guid]::NewGuid().ToString() }
    $Parameters['Background'] = [switch]$true
    $Parameters['RunId'] = $runId
    $Parameters['DataDir'] = $dataDir
    Write-SwitchRunStatus -DataDir $dataDir -RunId $runId -Command $command -State starting
    $hidden = New-CimInstance -CimClass (Get-CimClass -ClassName Win32_ProcessStartup) -Property @{ ShowWindow = [uint16]0 } -ClientOnly
    $arguments = @{ CommandLine = Get-DetachedCommandLine $Parameters; ProcessStartupInformation = $hidden }
    $result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments $arguments
    if ($result.ReturnValue -ne 0) {
        $failure = New-SwitcherError DetachFailed NotSpecified $result.ReturnValue
        Write-SwitchRunStatus -DataDir $dataDir -RunId $runId -Command $command -State failed -Message $failure.Exception.Message
        throw $failure
    }
}

# A failure of a run nobody watches, in a dialog.
function Show-SwitcherError {
    [CmdletBinding()]
    param([string]$Message)

    try {
        Add-Type -AssemblyName System.Windows.Forms
        [void][Windows.Forms.MessageBox]::Show($Message, (Get-SwitcherText DialogTitle))
    } catch {
        Write-Verbose 'No dialog could be shown.'
    }
}
