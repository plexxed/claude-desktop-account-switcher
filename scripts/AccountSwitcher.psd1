# The AccountSwitcher module's manifest. Its version follows the plugin's
# (.claude-plugin/plugin.json; npm run bump sets both); FunctionsToExport lists
# the functions of Public\ (the Pester tests hold it to them). Its messages are
# in en-US\AccountSwitcher.psd1.
@{
    RootModule           = 'AccountSwitcher.psm1'
    ModuleVersion        = '0.1.2'
    GUID                 = 'e097104e-18df-4c0b-85a4-701b70368487'
    Description          = 'Saved sign-ins for Claude Desktop on Windows, and the Code session lists the saved accounts may share (unofficial).'
    PowerShellVersion    = '5.1'
    CompatiblePSEditions = @('Desktop')
    FunctionsToExport    = @(
        'Invoke-AccountSwitcher'
        'Get-AccountProfile'
        'Save-SignedInAccount'
        'Add-AccountProfile'
        'Rename-AccountProfile'
        'Remove-AccountProfile'
        'Set-AccountProfileSharing'
        'Switch-AccountProfile'
    )
    CmdletsToExport      = @()
    VariablesToExport    = @()
    AliasesToExport      = @()
    PrivateData          = @{
        PSData = @{
            Tags = @('Claude', 'ClaudeDesktop', 'Windows')
        }
    }
}
