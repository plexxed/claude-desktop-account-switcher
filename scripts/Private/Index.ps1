# index.json: the read model the mod draws from.
#
# The mod draws the profiles on every redraw, too often to run this script each
# time, so the script keeps what the mod needs in one file, written whole after
# every change (Exit-SwitcherData) and never read by the script itself:
#
#     {
#       "version": 1,
#       "lastSwitchedTo": "<name>" | null,
#       "profiles": [ { "name", "account", "email", "sharesSessions", "hasSignIn" } ],
#       "accounts": { "<uuid>": { "org", "email" } }
#     }
#
# hooks/services/readModel.ts reads it; a change to its shape bumps IndexVersion
# there and here. Both sides are tested against tests/fixtures/index-sample.ts.

function Write-SwitcherIndex {
    [CmdletBinding()]
    param()

    $seen = Read-SeenAccount
    $profiles = foreach ($item in Read-AccountProfile) {
        $email = if ($item.Account -and $seen.ContainsKey($item.Account)) { $seen[$item.Account]['email'] } else { $null }
        @{
            name           = [string]$item.Name
            account        = if ($item.Account) { [string]$item.Account } else { $null }
            email          = if ($email) { [string]$email } else { $null }
            sharesSessions = [bool]$item.SharesSessions
            hasSignIn      = [bool]$item.HasSignIn
        }
    }
    Write-JsonFile $script:Paths.Index @{
        version        = $script:IndexVersion
        lastSwitchedTo = Read-LastSwitchedProfile
        profiles       = @($profiles)
        accounts       = ConvertTo-SeenAccountJson $seen
    }
}
