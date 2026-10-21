@{
    Severity     = @('Error', 'Warning', 'Information')
    ExcludeRules = @(
        # The switcher's output is meant for the person (and the mod) reading it.
        'PSAvoidUsingWriteHost'
    )
    Rules        = @{
        PSUseCompatibleSyntax = @{
            Enable         = $true
            # Windows PowerShell 5.1 is what every Windows has; the scripts must run there.
            TargetVersions = @('5.1')
        }
        PSPlaceOpenBrace      = @{ Enable = $true; OnSameLine = $true }
        PSUseConsistentIndentation = @{ Enable = $true; IndentationSize = 4 }
    }
}
