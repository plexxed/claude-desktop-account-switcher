# Claude Desktop: where it keeps its data, whom it is signed in to, its config,
# and closing and starting it.

<#
.SYNOPSIS
    Claude Desktop's data folder: the one of its known places that holds config.json.
#>
function Get-ClaudeDataDir {
    [CmdletBinding()]
    [OutputType([string])]
    param()

    $candidates = @(Join-Path $env:APPDATA 'Claude')
    # The MSIX build may keep it in its package's private copy of AppData, under
    # its family name: the package name and a 13-character publisher id. Looked
    # for on disk, as Get-AppxPackage takes half a second to load.
    $packages = Join-Path $env:LOCALAPPDATA 'Packages'
    $family = Get-ChildItem -LiteralPath $packages -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^Claude_[a-z0-9]{13}$' } | Select-Object -First 1
    if ($family) {
        $candidates = @(Join-Path $family.FullName 'LocalCache\Roaming\Claude') + $candidates
    }
    foreach ($dir in $candidates) {
        if (Test-Path -LiteralPath (Join-Path $dir 'config.json')) { return $dir }
    }
    throw (New-SwitcherError ClaudeDataNotFound ObjectNotFound ($candidates -join '; '))
}

# The account Claude Desktop is signed in to, or null when it is signed out.
function Get-SignedInAccount {
    [CmdletBinding()]
    [OutputType([string])]
    param([Parameter(Mandatory)][string]$ClaudeDir)

    $config = Read-ClaudeConfig $ClaudeDir
    $hasToken = @($config.Keys | Where-Object { $_ -like 'oauth:*' }).Count -gt 0
    if (-not $hasToken) { return $null }

    return Get-AccountId $config['lastKnownAccountUuid']
}

function Read-ClaudeConfig {
    [CmdletBinding()]
    param([string]$ClaudeDir)

    return (Get-JsonSerializer).DeserializeObject([IO.File]::ReadAllText((Join-Path $ClaudeDir 'config.json')))
}

function Write-ClaudeConfig {
    [CmdletBinding()]
    param([string]$ClaudeDir, $Config)

    Write-JsonFile (Join-Path $ClaudeDir 'config.json') $Config
}

function Test-SignInKey {
    [CmdletBinding()]
    [OutputType([bool])]
    param([string]$Key)

    return ($Key -like 'oauth:*') -or ($Key -eq 'lastKnownAccountUuid')
}

# Takes the sign-in keys out of Claude's config $Config, in place.
function Remove-SignInKey {
    # It changes a config held in memory, not the system: its caller writes the config.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '')]
    [CmdletBinding()]
    param([Collections.IDictionary]$Config)

    foreach ($key in @($Config.Keys)) { if (Test-SignInKey $key) { [void]$Config.Remove($key) } }
}

function Get-ClaudeProcess {
    [CmdletBinding()]
    param([string]$ClaudeDir)

    # The folders as they are, whatever wildcard characters ("[", "]") their paths hold.
    $installed = [Management.Automation.WildcardPattern]::Escape((Join-Path $env:LOCALAPPDATA 'AnthropicClaude'))
    $data = [Management.Automation.WildcardPattern]::Escape($ClaudeDir)
    Get-CimInstance Win32_Process -Filter "Name = 'claude.exe'" | Where-Object {
        $path = $_.ExecutablePath
        # The app itself (MSIX or per-user install) and the Claude Code it runs from its data folder.
        $path -and (($path -like '*\WindowsApps\Claude_*') -or ($path -like "$installed\*") -or ($path -like "$data\*"))
    }
}

function Wait-ClaudeExit {
    [CmdletBinding()]
    [OutputType([bool])]
    param([string]$ClaudeDir, [int]$Seconds)

    $deadline = (Get-Date).AddSeconds($Seconds)
    while (@(Get-ClaudeProcess $ClaudeDir).Count -gt 0) {
        if ((Get-Date) -gt $deadline) { return $false }
        Start-Sleep -Milliseconds 300
    }

    return $true
}

# Asks the windows of these processes to end their session, as Windows does
# when an installer must close an app (Restart Manager): WM_QUERYENDSESSION, then
# WM_ENDSESSION, both with ENDSESSION_CLOSEAPP, to every top-level window, hidden
# ones too. Returns how many windows were told, or -1 when one of them refused.
$script:EndSessionSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace ClaudeAccountSwitcher {
    public static class EndSession {
        const uint WM_QUERYENDSESSION = 0x0011;
        const uint WM_ENDSESSION = 0x0016;
        const uint SMTO_ABORTIFHUNG = 0x0002;
        const uint ReplyTimeoutMs = 5000;
        static readonly IntPtr ENDSESSION_CLOSEAPP = new IntPtr(1);

        delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

        [DllImport("user32.dll")]
        static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

        [DllImport("user32.dll")]
        static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

        [DllImport("user32.dll")]
        static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wParam, IntPtr lParam,
            uint flags, uint timeoutMs, out IntPtr result);

        public static int Send(int[] processIds) {
            var ids = new HashSet<uint>();
            foreach (int id in processIds) { ids.Add((uint)id); }
            var windows = new List<IntPtr>();
            EnumWindows((window, parameter) => {
                uint owner;
                GetWindowThreadProcessId(window, out owner);
                if (ids.Contains(owner)) { windows.Add(window); }
                return true;
            }, IntPtr.Zero);

            IntPtr answer;
            bool agreed = true;
            foreach (IntPtr window in windows) {
                // A window that does not answer in time is not taken as a refusal.
                bool answered = SendMessageTimeout(window, WM_QUERYENDSESSION, IntPtr.Zero, ENDSESSION_CLOSEAPP,
                    SMTO_ABORTIFHUNG, ReplyTimeoutMs, out answer) != IntPtr.Zero;
                if (answered && answer == IntPtr.Zero) { agreed = false; }
            }
            // On a refusal, WM_ENDSESSION tells the windows the session goes on after all.
            IntPtr ending = agreed ? new IntPtr(1) : IntPtr.Zero;
            foreach (IntPtr window in windows) {
                SendMessageTimeout(window, WM_ENDSESSION, ending, ENDSESSION_CLOSEAPP, SMTO_ABORTIFHUNG, ReplyTimeoutMs, out answer);
            }

            return agreed ? windows.Count : -1;
        }
    }
}
'@

<#
.SYNOPSIS
    Asks Claude Desktop to quit; true when it agreed.
.DESCRIPTION
    Closing Claude's window only hides it in the tray. A session that ends is
    what Claude quits on, as on Quit from the tray: it runs its clean-up (saves
    its window and storage, stops its MCP servers) and asks nothing, not even
    when a Code session is still working.
#>
function Request-ClaudeQuit {
    [CmdletBinding()]
    [OutputType([bool])]
    param([Parameter(Mandatory)][int[]]$ProcessId)

    # Compiled on first use: only a switch needs it, not the mod's every list.
    if (-not ('ClaudeAccountSwitcher.EndSession' -as [type])) { Add-Type -TypeDefinition $script:EndSessionSource }
    $told = [ClaudeAccountSwitcher.EndSession]::Send($ProcessId)
    if ($told -lt 0) { Write-SwitcherLog (Get-SwitcherText ClaudeRefusedQuit) }
    elseif ($told -eq 0) { Write-SwitcherLog (Get-SwitcherText ClaudeNoWindow) }

    return $told -gt 0
}

<#
.SYNOPSIS
    Closes Claude Desktop: asks it to quit, then ends what is still running.
#>
function Stop-Claude {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][string]$ClaudeDir)

    $processes = @(Get-ClaudeProcess $ClaudeDir)
    if (-not $PSCmdlet.ShouldProcess((Get-SwitcherText TargetClaude), (Get-SwitcherText ActionClose))) { return }
    # Closed from here on, or not running at all: either way no mod is left to tell.
    $script:IsClaudeLeft = $true
    if ($processes.Count -eq 0) { return }
    Write-SwitcherLog (Get-SwitcherText ClaudeClosing)
    $isQuitting = Request-ClaudeQuit -ProcessId @($processes | ForEach-Object { [int]$_.ProcessId })
    if (-not ($isQuitting -and (Wait-ClaudeExit $ClaudeDir $script:QuitGraceSeconds))) {
        $left = @(Get-ClaudeProcess $ClaudeDir)
        $processes = Get-SwitcherPluralText ClaudeProcesses $left.Count
        $message = if ($isQuitting) { Get-SwitcherText ClaudeQuitTimeout -Arguments $script:QuitGraceSeconds, $processes } else { Get-SwitcherText ClaudeNotAsked $processes }
        Write-SwitcherLog $message
        foreach ($process in $left) { Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue }
        if (-not (Wait-ClaudeExit $ClaudeDir $script:CloseTimeoutSeconds)) {
            throw (New-SwitcherError ClaudeExitTimeout OperationTimeout $script:CloseTimeoutSeconds)
        }
    }
    # Let the last file handles go.
    Start-Sleep -Milliseconds 800
}

function Start-Claude {
    [CmdletBinding(SupportsShouldProcess)]
    param()

    if (-not $PSCmdlet.ShouldProcess((Get-SwitcherText TargetClaude), (Get-SwitcherText ActionStart))) { return }
    $package = Get-AppxPackage -Name 'Claude' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($package) {
        $appId = @((Get-AppxPackageManifest $package).Package.Applications.Application)[0].Id
        Write-SwitcherLog (Get-SwitcherText ClaudeStarting)
        Start-Process "shell:AppsFolder\$($package.PackageFamilyName)!$appId"
        return
    }
    $exe = Join-Path $env:LOCALAPPDATA 'AnthropicClaude\claude.exe'
    if (Test-Path -LiteralPath $exe) {
        Write-SwitcherLog (Get-SwitcherText ClaudeStarting)
        Start-Process $exe
        return
    }
    # Left closed, the person must hear of it: the switch fails with it.
    throw (New-SwitcherError ClaudeNotFound ObjectNotFound)
}
