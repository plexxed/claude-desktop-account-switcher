#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.5.0' }
<#
    The AccountSwitcher module against folders made in Pester's TestDrive:
    nothing of the real Claude, its sign-in or the real profiles is touched,
    and Claude is never closed or started (Stop-Claude and Start-Claude are mocked).
    The messages it expects come from scripts\en-US\AccountSwitcher.psd1, which
    the tests read as the module does (Get-Text). The module's own functions are
    called through InModuleScope (Invoke-InModule).

        Invoke-Pester -Path tests
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '..\scripts\AccountSwitcher.psd1') -Force
    $script:Messages = Import-PowerShellDataFile (Join-Path $PSScriptRoot '..\scripts\en-US\AccountSwitcher.psd1')
    $script:Switch = Join-Path $PSScriptRoot '..\scripts\switch.ps1'

    # Message $Name of the switcher, filled as the module fills it.
    function Get-Text([string]$Name) {
        if ($args.Count) { return $Messages[$Name] -f $args }

        return $Messages[$Name]
    }

    # Runs $Script in the module, with $Parameters as its param() block takes them.
    function Invoke-InModule([scriptblock]$Script, [hashtable]$Parameters = @{}) {
        InModuleScope AccountSwitcher -ScriptBlock $Script -Parameters $Parameters
    }

    $script:Home1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    $script:Home2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    $script:Other = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    $script:Org = '11111111-1111-1111-1111-111111111111'
    $script:OtherOrg = '22222222-2222-2222-2222-222222222222'

    # A fresh data folder and Claude data folder for each test.
    function New-World {
        $script:Root = Join-Path $TestDrive ([guid]::NewGuid().ToString('N').Substring(0, 8))
        $script:Data = Join-Path $Root 'data'
        $script:Claude = Join-Path $Root 'Claude'
        New-Item -ItemType Directory -Force -Path (Join-Path $Claude 'Network') | Out-Null
        Open-Data $Data
    }

    # Points the module at data folder $Path, as a run of the switcher would.
    function Open-Data([string]$Path) {
        Invoke-InModule { param($Path) Initialize-SwitcherData -DataDir $Path } @{ Path = $Path }
    }

    function Write-Json([string]$Path, $Value) {
        New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
        [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 5))
    }

    function Read-Json([string]$Path) {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }

    # $Value (as ConvertFrom-Json gives it) as JSON with every object's keys in
    # order, so two values compare whatever order their writers put them in.
    function ConvertTo-CanonicalJson($Value) {
        function ConvertTo-Sorted($Node) {
            if ($Node -is [Management.Automation.PSCustomObject]) {
                $sorted = [ordered]@{}
                foreach ($property in $Node.PSObject.Properties | Sort-Object Name) { $sorted[$property.Name] = ConvertTo-Sorted $property.Value }
                return $sorted
            }
            if ($Node -is [array]) { return , @($Node | ForEach-Object { ConvertTo-Sorted $_ }) }

            return $Node
        }

        return ConvertTo-Sorted $Value | ConvertTo-Json -Depth 10 -Compress
    }

    # Claude signed in to $Account (or signed out), with settings of its own beside the sign-in.
    function Set-ClaudeSignIn([string]$Account) {
        $config = [ordered]@{ locale = 'en-US'; userThemeMode = 'dark' }
        if ($Account) {
            $config['lastKnownAccountUuid'] = $Account
            $config['oauth:tokenCache'] = "token-of-$Account"
            [IO.File]::WriteAllText((Join-Path $Claude 'Network\Cookies'), "cookies-of-$Account")
        } else {
            Remove-Item (Join-Path $Claude 'Network\Cookies') -ErrorAction SilentlyContinue
        }
        Write-Json (Join-Path $Claude 'config.json') $config
    }

    function Get-ClaudeSignIn {
        $config = Read-Json (Join-Path $Claude 'config.json')
        $cookies = Join-Path $Claude 'Network\Cookies'
        return [pscustomobject]@{
            Account = $config.PSObject.Properties['lastKnownAccountUuid'].Value
            Token   = $config.PSObject.Properties['oauth:tokenCache'].Value
            Cookies = if (Test-Path $cookies) { Get-Content $cookies -Raw } else { $null }
            Theme   = $config.userThemeMode
        }
    }

    # A profile as an earlier switch left it: its record, and its saved sign-in when $Account is given.
    function New-SavedProfile([string]$Name, [string]$Account, [switch]$Shares, [switch]$NoSignIn) {
        $dir = Join-Path $Data "profiles\$Name"
        $record = @{}
        if ($Account) { $record.account = $Account }
        if ($Shares) { $record.shareSessions = $true }
        Write-Json (Join-Path $dir 'profile.json') $record
        if ($Account -and -not $NoSignIn) {
            Write-Json (Join-Path $dir 'auth.json') @{ lastKnownAccountUuid = $Account; 'oauth:tokenCache' = "token-of-$Account" }
            [IO.File]::WriteAllText((Join-Path $dir 'Cookies'), "cookies-of-$Account")
        }
    }

    # state.json: the profile last switched to.
    function Set-Active([string]$Name) {
        Write-Json (Join-Path $Data 'state.json') @{ version = 1; lastSwitchedTo = $Name }
    }

    function Get-Active {
        return (Read-Json (Join-Path $Data 'state.json')).lastSwitchedTo
    }

    function Get-Record([string]$Name) {
        return Read-Json (Join-Path $Data "profiles\$Name\profile.json")
    }

    # --- Session lists ---

    function Get-SessionList([string]$Account, [string]$Organization = $Org) {
        return Join-Path $Claude "claude-code-sessions\$Account\$Organization"
    }

    # What the mod writes when a session runs in $Account: the organization it runs in.
    function Set-Seen([string]$Account, [string]$Organization = $Org) {
        $path = Join-Path $Data 'accounts.json'
        $seen = @{}
        if (Test-Path $path) { (Read-Json $path).PSObject.Properties | ForEach-Object { $seen[$_.Name] = @{ org = $_.Value.org } } }
        $seen[$Account] = @{ org = $Organization }
        Write-Json $path $seen
    }

    function New-Card([string]$Account, [string]$Id, [int]$MinutesAgo = 60, [string]$Text = $Id, [string]$Organization = $Org) {
        $path = Join-Path (Get-SessionList $Account $Organization) "local_$Id.json"
        Write-Json $path @{ title = $Text }
        (Get-Item $path).LastWriteTimeUtc = [DateTime]::UtcNow.AddMinutes(-$MinutesAgo)
    }

    function Get-Card([string]$Account, [string]$Organization = $Org) {
        return @(Get-ChildItem (Get-SessionList $Account $Organization) -Filter 'local_*.json' -ErrorAction SilentlyContinue |
                ForEach-Object { $_.BaseName -replace '^local_', '' } | Sort-Object)
    }

    function Read-CardTitle([string]$Account, [string]$Id) {
        return (Read-Json (Join-Path (Get-SessionList $Account) "local_$Id.json")).title
    }

    # The sync a switch runs, over the profiles as saved.
    function Sync {
        Invoke-InModule { param($ClaudeDir) Sync-SessionPool -ClaudeDir $ClaudeDir -Accounts (Get-SavedAccount) } @{ ClaudeDir = $Claude }
    }

    function Set-Sharing([string]$Name, [bool]$Enabled) {
        Set-AccountProfileSharing -Name $Name -Enabled $Enabled
    }

    function Resolve-Current([string]$Account) {
        Invoke-InModule { param($Account) Resolve-CurrentProfile $Account } @{ Account = $Account }
    }

    function Read-Index {
        return Read-Json (Join-Path $Data 'index.json')
    }

    # Runs switch.ps1 as the mod does, on the test's data folder; its exit code.
    function Invoke-Switcher {
        $null = & powershell -NoProfile -ExecutionPolicy Bypass -File $Switch @args -DataDir $Data 2>&1
        return $LASTEXITCODE
    }
}

BeforeDiscovery {
    # The cases the mod's own tests use too: the array a fixture of theirs holds, as JSON.
    function Read-Fixture([string]$File) {
        $fixture = Get-Content (Join-Path $PSScriptRoot "fixtures\$File") -Raw -Encoding UTF8
        # Windows PowerShell's ConvertFrom-Json hands a JSON array on as one item;
        # returned from a variable, its items go on one by one.
        $cases = $fixture.Substring($fixture.IndexOf('= [') + 2) | ConvertFrom-Json
        return $cases
    }

    $NameCases = @(Read-Fixture 'profile-names.ts' | ForEach-Object { @{ Name = $_.name; IsValid = $_.isValid } })
    $ExitCodeCases = @(Read-Fixture 'exit-codes.ts' | Where-Object { $_.category } | ForEach-Object { @{ Category = $_.category; Code = $_.code } })
    $ScriptCommands = @(Read-Fixture 'script-commands.ts')
    $DataDirCases = @(Read-Fixture 'data-dirs.ts' | ForEach-Object {
            $configDir = $_.env.PSObject.Properties['CLAUDE_CONFIG_DIR']
            @{
                Case        = $_.case
                UserProfile = $_.env.USERPROFILE
                ConfigDir   = if ($configDir) { $configDir.Value } else { $null }
                DataDir     = $_.dataDir
            }
        })
    $DataFileCases = @(Read-Fixture 'data-files.ts' | ForEach-Object { @{ File = $_.file; Name = $_.name } })
    $IndexSamples = @(Read-Fixture 'index-sample.ts' | ForEach-Object { @{ Sample = $_ } })
    $SwitchRunSamples = @(Read-Fixture 'switch-run-sample.ts' | ForEach-Object { @{ Sample = $_ } })
    $CurrentCases = @(Read-Fixture 'current-profile.ts' | ForEach-Object {
            $profiles = @{}
            foreach ($property in $_.profiles.PSObject.Properties) { $profiles[$property.Name] = $property.Value }
            @{ Case = $_.case; Profiles = $profiles; Account = $_.account; LastSwitchedTo = $_.lastSwitchedTo; Current = $_.current }
        })
    $NoAccountCases = @(Read-Fixture 'current-profile-no-account.ts' | ForEach-Object {
            $profiles = @{}
            foreach ($property in $_.profiles.PSObject.Properties) { $profiles[$property.Name] = $property.Value }
            @{ Case = $_.case; Profiles = $profiles; LastSwitchedTo = $_.lastSwitchedTo; Current = $_.script }
        })
}

Describe 'The module' {
    It 'exports the functions of Public\, as its manifest lists them' {
        $manifest = Import-PowerShellDataFile (Join-Path $PSScriptRoot '..\scripts\AccountSwitcher.psd1')
        $public = Get-ChildItem (Join-Path $PSScriptRoot '..\scripts\Public') -Filter '*.ps1' | ForEach-Object {
            [Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$null, [ref]$null).FindAll({ $args[0] -is [Management.Automation.Language.FunctionDefinitionAst] }, $false).Name
        }
        $exported = (Get-Module AccountSwitcher).ExportedFunctions.Keys

        @($manifest.FunctionsToExport | Sort-Object) | Should -Be @($public | Sort-Object)
        @($exported | Sort-Object) | Should -Be @($public | Sort-Object)
    }

    It 'has the version of the plugin' {
        $manifest = Import-PowerShellDataFile (Join-Path $PSScriptRoot '..\scripts\AccountSwitcher.psd1')
        $plugin = Get-Content (Join-Path $PSScriptRoot '..\.claude-plugin\plugin.json') -Raw | ConvertFrom-Json

        $manifest.ModuleVersion | Should -BeExactly $plugin.version
    }

    It 'takes the commands the mod runs' -ForEach @(@{ Commands = $ScriptCommands }) {
        $set = (Get-Command Invoke-AccountSwitcher).Parameters['Command'].Attributes | Where-Object { $_ -is [Management.Automation.ValidateSetAttribute] }

        @($set.ValidValues | Sort-Object) | Should -Be @($Commands | Sort-Object)
    }

    It 'fills a count of 0 into its message, as any other count' {
        Invoke-InModule { Get-SwitcherPluralText SessionsRemoved 0 } | Should -BeExactly (Get-Text SessionsRemovedOther 0)
    }
}

Describe 'The data folder' {
    It 'is where the mod looks for it: <Case>' -ForEach $DataDirCases {
        $saved = @{ UserProfile = $env:USERPROFILE; ConfigDir = $env:CLAUDE_CONFIG_DIR }
        try {
            $env:USERPROFILE = $UserProfile
            $env:CLAUDE_CONFIG_DIR = $ConfigDir

            Invoke-InModule { Get-DefaultDataDir } | Should -BeExactly $DataDir
        } finally {
            $env:USERPROFILE = $saved.UserProfile
            $env:CLAUDE_CONFIG_DIR = $saved.ConfigDir
        }
    }

    It 'names the file <File> as the mod reads it' -ForEach $DataFileCases {
        New-World
        $path = Invoke-InModule {
            param($File, $DataDir)
            switch ($File) {
                'index' { $script:Paths.Index }
                'switchRun' { Get-SwitchRunPath $DataDir }
            }
        } @{ File = $File; DataDir = $Data }

        Split-Path $path -Leaf | Should -BeExactly $Name
    }
}

Describe 'Profile names' {
    It 'takes "<Name>": <IsValid>' -ForEach $NameCases {
        if ($IsValid) {
            { Invoke-InModule { param($Name) Assert-ProfileName $Name } @{ Name = $Name } } | Should -Not -Throw
        } else {
            { Invoke-InModule { param($Name) Assert-ProfileName $Name } @{ Name = $Name } } | Should -Throw
        }
    }
}

Describe 'The profile signed in now' {
    BeforeEach { New-World }

    It 'is <Case>' -ForEach $CurrentCases {
        foreach ($name in $Profiles.Keys) { New-SavedProfile $name $Profiles[$name] }
        if ($LastSwitchedTo) { Set-Active $LastSwitchedTo }

        $found = Resolve-Current $Account

        if ($Current) { $found | Should -Be $Current } else { $found | Should -BeNullOrEmpty }
    }

    It 'is, while Claude is signed out, the profile last switched to while it holds no account yet: <Case>' -ForEach $NoAccountCases {
        foreach ($name in $Profiles.Keys) { New-SavedProfile $name $Profiles[$name] }
        if ($LastSwitchedTo) { Set-Active $LastSwitchedTo }

        $found = Resolve-Current ''

        if ($Current) { $found | Should -Be $Current } else { $found | Should -BeNullOrEmpty }
    }
}

Describe 'Naming the signed-in account' {
    BeforeEach { New-World }

    It 'saves its account in a new profile, made the active one' {
        Set-ClaudeSignIn $Home1
        Save-SignedInAccount -Name 'home' -ClaudeDir $Claude
        (Get-Record 'home').account | Should -Be $Home1
        Get-Active | Should -Be 'home'
    }

    It 'refuses an account a profile holds already' {
        New-SavedProfile 'home' $Home1
        Set-ClaudeSignIn $Home1
        { Save-SignedInAccount -Name 'again' -ClaudeDir $Claude } | Should -Throw -ExpectedMessage (Get-Text AccountAlreadySaved 'home')
    }

    It 'refuses when Claude is signed out' {
        Set-ClaudeSignIn $null
        { Save-SignedInAccount -Name 'home' -ClaudeDir $Claude } | Should -Throw -ExpectedMessage (Get-Text NotSignedIn)
    }

    It 'takes the account''s own name when no profile has it' {
        Set-ClaudeSignIn $Home1
        Save-SignedInAccount -Name 'Alex' -AutoName -ClaudeDir $Claude
        (Get-Record 'Alex').account | Should -Be $Home1
    }

    It 'numbers the account''s own name when a profile has it, cut to fit' {
        $long = 'a' * 40
        New-SavedProfile 'Alex' $Home2
        New-SavedProfile $long $Other
        Set-ClaudeSignIn $Home1

        Save-SignedInAccount -Name 'Alex' -AutoName -ClaudeDir $Claude
        Get-Active | Should -Be (Get-Text NumberedProfileName 'Alex' 2)

        Remove-Item (Join-Path $Data 'profiles\Alex 2') -Recurse
        Save-SignedInAccount -Name $long -AutoName -ClaudeDir $Claude
        Get-Active | Should -Be (Get-Text NumberedProfileName ('a' * 38) 2)
    }

    It 'cuts a numbered name between characters, never inside one' {
        $name = ('a' * 37) + [char]::ConvertFromUtf32(0x1F600)
        New-SavedProfile $name $Home2
        Set-ClaudeSignIn $Home1

        Save-SignedInAccount -Name $name -AutoName -ClaudeDir $Claude
        Get-Active | Should -Be (Get-Text NumberedProfileName ('a' * 37) 2)
    }

    It 'is the first free AccountN without a name of its own' {
        New-SavedProfile (Get-Text FreeProfileName 1) $Home2
        Set-ClaudeSignIn $Home1
        Save-SignedInAccount -AutoName -ClaudeDir $Claude
        Get-Active | Should -Be (Get-Text FreeProfileName 2)
    }
}

Describe 'Noting what was seen of an account' {
    BeforeEach {
        New-World
        function Set-SeenAccountInModule([string]$Account, [string]$Organization, [string]$Email) {
            Invoke-InModule { param($Account, $Organization, $Email) Set-SeenAccount -Account $Account -Organization $Organization -Email $Email } @{ Account = $Account; Organization = $Organization; Email = $Email }
        }
    }

    It 'notes its organization and email beside the other accounts' {
        Set-Seen $Home1
        Set-SeenAccountInModule -Account $Home2 -Organization $OtherOrg -Email 'work@example.com'

        $seen = Read-Json (Join-Path $Data 'accounts.json')
        $seen.$Home1.org | Should -Be $Org
        $seen.$Home2.org | Should -Be $OtherOrg
        $seen.$Home2.email | Should -Be 'work@example.com'
    }

    It 'keeps what is not given as it was noted before' {
        Set-SeenAccountInModule -Account $Home1 -Organization $Org -Email 'old@example.com'
        Set-SeenAccountInModule -Account $Home1 -Organization $OtherOrg

        $seen = Read-Json (Join-Path $Data 'accounts.json')
        $seen.$Home1.org | Should -Be $OtherOrg
        $seen.$Home1.email | Should -Be 'old@example.com'
    }

    It 'refuses what is not an account id' {
        { Set-SeenAccountInModule -Account 'home' } | Should -Throw -ExpectedMessage (Get-Text AccountIdInvalid 'home')
    }
}

Describe 'Recording the signed-in account in the profile just switched to' {
    BeforeEach { New-World }

    It 'records it in the profile last switched to, which holds none yet, keeping its sharing' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'new' -Shares
        Set-Active 'new'
        Set-ClaudeSignIn $Other

        Invoke-InModule { param($ClaudeDir) Update-SignedInAccount -ClaudeDir $ClaudeDir } @{ ClaudeDir = $Claude }

        (Get-Record 'new').account | Should -Be $Other
        (Get-Record 'new').shareSessions | Should -BeTrue
        (Get-Record 'home').account | Should -Be $Home1
        Test-Path (Join-Path $Data 'profiles\new\auth.json') | Should -BeFalse
    }

    It 'leaves an account a profile holds already where it is' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'new'
        Set-Active 'new'
        Set-ClaudeSignIn $Home1

        Invoke-InModule { param($ClaudeDir) Update-SignedInAccount -ClaudeDir $ClaudeDir } @{ ClaudeDir = $Claude }

        (Get-Record 'new').PSObject.Properties['account'] | Should -BeNullOrEmpty
    }

    It 'does nothing while Claude is signed out' {
        New-SavedProfile 'new'
        Set-Active 'new'
        Set-ClaudeSignIn $null

        Invoke-InModule { param($ClaudeDir) Update-SignedInAccount -ClaudeDir $ClaudeDir } @{ ClaudeDir = $Claude }

        (Get-Record 'new').PSObject.Properties['account'] | Should -BeNullOrEmpty
    }
}

Describe 'Switching' {
    BeforeEach {
        New-World
        Mock Stop-Claude {} -ModuleName AccountSwitcher
        Mock Start-Claude {} -ModuleName AccountSwitcher
    }

    It 'saves the signed-in sign-in, restores the other, and keeps the rest of the settings' {
        New-SavedProfile 'home' $Home1 -NoSignIn
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1
        Set-Active 'home'

        Switch-AccountProfile -Name 'work' -ClaudeDir $Claude

        $claude = Get-ClaudeSignIn
        $claude.Account | Should -Be $Home2
        $claude.Token | Should -Be "token-of-$Home2"
        $claude.Cookies | Should -Be "cookies-of-$Home2"
        $claude.Theme | Should -Be 'dark'
        (Read-Json (Join-Path $Data 'profiles\home\auth.json')).'oauth:tokenCache' | Should -Be "token-of-$Home1"
        Get-Content (Join-Path $Data 'profiles\home\Cookies') -Raw | Should -Be "cookies-of-$Home1"
        Get-Active | Should -Be 'work'
        Should -Invoke Stop-Claude -ModuleName AccountSwitcher -Times 1 -Exactly
        Should -Invoke Start-Claude -ModuleName AccountSwitcher -Times 1 -Exactly
    }

    It 'keeps an account signed in from Claude itself as a profile of its own, never over another''s' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-Active 'home'
        Set-ClaudeSignIn $Other

        Switch-AccountProfile -Name 'work' -ClaudeDir $Claude

        $saved = Get-Text FreeProfileName 1
        (Read-Json (Join-Path $Data 'profiles\home\auth.json')).'oauth:tokenCache' | Should -Be "token-of-$Home1"
        (Get-Record $saved).account | Should -Be $Other
        (Read-Json (Join-Path $Data "profiles\$saved\auth.json")).'oauth:tokenCache' | Should -Be "token-of-$Other"
        (Get-ClaudeSignIn).Account | Should -Be $Home2
    }

    It 'opens the sign-in screen for a profile never signed in, which then holds what is signed in there' {
        New-SavedProfile 'home' $Home1
        Set-ClaudeSignIn $Home1
        Set-Active 'home'
        Add-AccountProfile -Name 'new'

        Switch-AccountProfile -Name 'new' -ClaudeDir $Claude
        (Get-ClaudeSignIn).Account | Should -BeNullOrEmpty
        (Get-ClaudeSignIn).Cookies | Should -BeNullOrEmpty

        # Signed in to another account on that screen, then back home.
        Set-ClaudeSignIn $Other
        Switch-AccountProfile -Name 'home' -ClaudeDir $Claude
        (Get-Record 'new').account | Should -Be $Other
        (Get-ClaudeSignIn).Account | Should -Be $Home1
    }

    It 'does nothing for the profile signed in now' {
        New-SavedProfile 'home' $Home1
        Set-ClaudeSignIn $Home1

        Switch-AccountProfile -Name 'home' -ClaudeDir $Claude

        Should -Invoke Stop-Claude -ModuleName AccountSwitcher -Times 0 -Exactly
    }

    It 'takes a name in another case as the profile''s own, and notes that one as switched to' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1
        Set-Active 'home'

        Switch-AccountProfile -Name 'WORK' -ClaudeDir $Claude

        Get-Active | Should -BeExactly 'work'
        (Read-Index).lastSwitchedTo | Should -BeExactly 'work'
    }

    It 'takes back the profile new adds when the switch to it fails before it is made' {
        Mock Get-ClaudeDataDir ([scriptblock]::Create("return '$Claude'")) -ModuleName AccountSwitcher
        Mock Stop-Claude { throw 'still running' } -ModuleName AccountSwitcher
        New-SavedProfile 'home' $Home1
        Set-ClaudeSignIn $Home1
        Set-Active 'home'

        { Invoke-AccountSwitcher new 'side' -DataDir $Data 6>$null } | Should -Throw -ExpectedMessage 'still running'

        @(Get-AccountProfile).Name | Should -Be @('home')
        Get-Active | Should -Be 'home'
    }

    It 'keeps the profile new adds when the switch was made and only Claude did not start again' {
        Mock Get-ClaudeDataDir ([scriptblock]::Create("return '$Claude'")) -ModuleName AccountSwitcher
        Mock Start-Claude { throw 'not found' } -ModuleName AccountSwitcher
        New-SavedProfile 'home' $Home1
        Set-ClaudeSignIn $Home1
        Set-Active 'home'

        { Invoke-AccountSwitcher new 'side' -DataDir $Data 6>$null } | Should -Throw -ExpectedMessage 'not found'

        @(Get-AccountProfile).Name | Should -Be @('home', 'side')
        Get-Active | Should -Be 'side'
    }

    It 'starts Claude again when a step fails' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1
        Remove-Item (Join-Path $Data 'profiles\work\auth.json')
        [IO.File]::WriteAllText((Join-Path $Data 'profiles\work\auth.json'), '{ broken')

        { Switch-AccountProfile -Name 'work' -ClaudeDir $Claude } | Should -Throw -ExpectedMessage (Get-Text SignInUnreadable 'work')

        Should -Invoke Start-Claude -ModuleName AccountSwitcher -Times 1 -Exactly
    }

    It 'puts Claude''s sign-in back from its backup when a step fails half-way, and starts Claude' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1
        Set-Active 'home'
        # Restoring work's sign-in writes Claude's config, then fails before its cookies.
        Mock Restore-ProfileSignIn {
            [IO.File]::WriteAllText((Join-Path $ClaudeDir 'config.json'), '{"lastKnownAccountUuid":"half"}')
            throw 'disk full'
        } -ModuleName AccountSwitcher

        { Switch-AccountProfile -Name 'work' -ClaudeDir $Claude } | Should -Throw -ExpectedMessage 'disk full'

        $claude = Get-ClaudeSignIn
        $claude.Account | Should -Be $Home1
        $claude.Token | Should -Be "token-of-$Home1"
        $claude.Cookies | Should -Be "cookies-of-$Home1"
        $claude.Theme | Should -Be 'dark'
        Get-Active | Should -Be 'home'
        Should -Invoke Start-Claude -ModuleName AccountSwitcher -Times 1 -Exactly
    }

    It 'starts Claude again when closing it failed half-way, and changes nothing' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1
        Mock Stop-Claude { throw 'still running' } -ModuleName AccountSwitcher

        { Switch-AccountProfile -Name 'work' -ClaudeDir $Claude } | Should -Throw -ExpectedMessage 'still running'

        (Get-ClaudeSignIn).Account | Should -Be $Home1
        Test-Path (Join-Path $Data 'backups') | Should -BeFalse
        Should -Invoke Start-Claude -ModuleName AccountSwitcher -Times 1 -Exactly
    }

    It 'fails when Claude can''t be started again; a switch that failed already says its own failure' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1
        Mock Start-Claude { throw 'not found' } -ModuleName AccountSwitcher

        { Switch-AccountProfile -Name 'work' -ClaudeDir $Claude } | Should -Throw -ExpectedMessage 'not found'
        (Get-ClaudeSignIn).Account | Should -Be $Home2

        Mock Stop-Claude { throw 'still running' } -ModuleName AccountSwitcher
        { Switch-AccountProfile -Name 'home' -ClaudeDir $Claude } | Should -Throw -ExpectedMessage 'still running'
        Get-Content (Join-Path $Data 'switcher.log') -Raw | Should -Match ([regex]::Escape((Get-Text ClaudeNotStarted 'not found')))
    }

    It 'goes on when the session sync fails' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1
        Mock Sync-SessionPool { throw 'disk full' } -ModuleName AccountSwitcher

        Switch-AccountProfile -Name 'work' -ClaudeDir $Claude

        (Get-ClaudeSignIn).Account | Should -Be $Home2
        Get-Content (Join-Path $Data 'switcher.log') -Raw | Should -Match ([regex]::Escape((Get-Text SessionsNotSynced 'disk full')))
    }

    It 'keeps the last five backups of the sign-in' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1
        $backups = Join-Path $Data 'backups'
        foreach ($n in 1..6) { New-Item -ItemType Directory -Path (Join-Path $backups "20200101-00000$n") | Out-Null }

        Switch-AccountProfile -Name 'work' -ClaudeDir $Claude

        @(Get-ChildItem $backups -Directory).Count | Should -Be 5
        @(Get-ChildItem $backups -Directory | Sort-Object Name)[-1].GetFiles('config.json').Count | Should -Be 1
    }
}

Describe 'Managing profiles' {
    BeforeEach { New-World }

    It 'adds a profile that holds no account yet' {
        Add-AccountProfile -Name 'side'
        (Get-AccountProfile | Where-Object Name -EQ 'side').HasSignIn | Should -BeFalse
        { Add-AccountProfile -Name 'side' } | Should -Throw -ExpectedMessage (Get-Text ProfileExists 'side')
    }

    It 'renames a profile, the active one too' {
        New-SavedProfile 'home' $Home1
        Set-Active 'home'
        Rename-AccountProfile -Name 'home' -NewName 'personal'
        Get-Active | Should -Be 'personal'
        (Get-Record 'personal').account | Should -Be $Home1
    }

    It 'renames a profile to the same name in another case' {
        New-SavedProfile 'home' $Home1
        Rename-AccountProfile -Name 'home' -NewName 'Home'
        @(Get-AccountProfile).Name | Should -BeExactly @('Home')
    }

    It 'acts on a profile named in another case as on the profile itself' {
        New-SavedProfile 'home' $Home1
        Set-Active 'home'
        Set-Sharing 'HOME' $true
        (Get-AccountProfile).SharesSessions | Should -BeTrue
        Rename-AccountProfile -Name 'HOME' -NewName 'home'
        @(Get-AccountProfile).Name | Should -BeExactly @('home')
        Rename-AccountProfile -Name 'HOME' -NewName 'personal'
        Get-Active | Should -BeExactly 'personal'
    }

    It 'refuses to delete the profile signed in now' {
        New-SavedProfile 'home' $Home1
        Set-ClaudeSignIn $Home1
        { Remove-AccountProfile -Name 'home' -ClaudeDir $Claude } | Should -Throw -ExpectedMessage (Get-Text DeleteSignedIn 'home')
    }

    It 'deletes another profile with its saved sign-in, the backups that hold it, and what was seen of its account and its sessions' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1
        # Backups a switch made: of work's sign-in, and of home's.
        Write-Json (Join-Path $Data 'backups\20260101-000000\config.json') @{ lastKnownAccountUuid = $Home2; 'oauth:tokenCache' = 'token' }
        Write-Json (Join-Path $Data 'backups\20260102-000000\config.json') @{ lastKnownAccountUuid = $Home1; 'oauth:tokenCache' = 'token' }
        Write-Json (Join-Path $Data 'accounts.json') @{ $Home1 = @{ email = 'home@example.com' }; $Home2 = @{ email = 'work@example.com' } }
        Write-Json (Join-Path $Data 'sessions.json') @{ version = 1; deleted = @{}; accounts = @{ $Home1 = @{ dir = 'a'; cards = @('a1') }; $Home2 = @{ dir = 'b'; cards = @('b1') } } }

        Remove-AccountProfile -Name 'work' -ClaudeDir $Claude

        Test-Path (Join-Path $Data 'profiles\work') | Should -BeFalse
        @(Get-ChildItem (Join-Path $Data 'backups') -Name) | Should -Be @('20260102-000000')
        (Read-Json (Join-Path $Data 'accounts.json')).PSObject.Properties.Name | Should -Be @($Home1)
        (Read-Json (Join-Path $Data 'sessions.json')).accounts.PSObject.Properties.Name | Should -Be @($Home1)
    }

    It 'keeps the backups of an account another profile still holds' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        New-SavedProfile 'work too' $Home2
        Set-ClaudeSignIn $Home1
        Write-Json (Join-Path $Data 'backups\20260101-000000\config.json') @{ lastKnownAccountUuid = $Home2 }

        Remove-AccountProfile -Name 'work' -ClaudeDir $Claude

        @(Get-ChildItem (Join-Path $Data 'backups') -Name) | Should -Be @('20260101-000000')
    }

    It 'turns sharing on and off, off when never set' {
        New-SavedProfile 'home' $Home1
        (Get-AccountProfile).SharesSessions | Should -BeFalse
        Set-Sharing 'home' $true
        (Get-AccountProfile).SharesSessions | Should -BeTrue
        (Get-Record 'home').account | Should -Be $Home1
        Set-Sharing 'home' $false
        (Get-AccountProfile).SharesSessions | Should -BeFalse
    }
}

Describe 'The layout of the data folder' {
    It 'writes a new folder in the current layout, and refuses one a later version wrote' {
        $root = Join-Path $TestDrive 'versions'
        Open-Data (Join-Path $root 'data')
        (Read-Json (Join-Path $root 'data\state.json')).version | Should -Be 1

        $later = Join-Path $root 'later'
        Write-Json (Join-Path $later 'state.json') @{ version = 99 }
        { Open-Data $later } | Should -Throw -ExpectedMessage (Get-Text DataTooNew 99 1)
    }

    It 'refuses a folder a later version wrote at every call, not only the first' {
        $later = Join-Path $TestDrive 'later-again'
        Write-Json (Join-Path $later 'state.json') @{ version = 99 }

        foreach ($attempt in 1, 2) {
            { Get-AccountProfile -DataDir $later } | Should -Throw -ExpectedMessage (Get-Text DataTooNew 99 1)
        }
    }
}

Describe 'The lock' {
    It 'keeps a second run out while the first holds it' {
        $name = "Local\AccountSwitcherTest-$([guid]::NewGuid())"
        $held = New-Object Threading.ManualResetEventSlim
        $release = New-Object Threading.ManualResetEventSlim
        # The first run, on a thread of its own: a mutex belongs to the thread that took it.
        $first = [powershell]::Create().AddScript({
                param($Name, $Held, $Release)
                $mutex = New-Object Threading.Mutex($false, $Name)
                [void]$mutex.WaitOne()
                $Held.Set()
                [void]$Release.Wait(10000)
                $mutex.ReleaseMutex()
                $mutex.Dispose()
            }).AddArgument($name).AddArgument($held).AddArgument($release)
        $running = $first.BeginInvoke()
        try {
            $held.Wait(10000) | Should -BeTrue
            { Invoke-InModule { param($Name) Enter-SwitcherLock -Name $Name -TimeoutSeconds 0 } @{ Name = $name } } | Should -Throw -ExpectedMessage (Get-Text SwitchRunning)
        } finally {
            $release.Set()
            [void]$first.EndInvoke($running)
            $first.Dispose()
        }
        Invoke-InModule { param($Name) Exit-SwitcherLock -Mutex (Enter-SwitcherLock -Name $Name -TimeoutSeconds 0) } @{ Name = $name }
    }
}

Describe 'Closing Claude' {
    BeforeEach {
        Mock Write-SwitcherLog {} -ModuleName AccountSwitcher
    }

    Context 'Stop-Claude' {
        BeforeEach {
            Mock Get-ClaudeProcess { [pscustomobject]@{ ProcessId = 101 } } -ModuleName AccountSwitcher
            Mock Stop-Process {} -ModuleName AccountSwitcher
            Mock Start-Sleep {} -ModuleName AccountSwitcher
        }

        It 'lets Claude quit on its own when it agrees' {
            Mock Request-ClaudeQuit { $true } -ModuleName AccountSwitcher
            Mock Wait-ClaudeExit { $true } -ModuleName AccountSwitcher

            InModuleScope AccountSwitcher { Stop-Claude -ClaudeDir 'C:\Claude' }

            Should -Invoke Request-ClaudeQuit -ModuleName AccountSwitcher -Times 1 -Exactly -ParameterFilter { "$ProcessId" -eq '101' }
            Should -Invoke Stop-Process -ModuleName AccountSwitcher -Times 0 -Exactly
        }

        It 'ends Claude when it refuses, without waiting for it' {
            Mock Request-ClaudeQuit { $false } -ModuleName AccountSwitcher
            Mock Wait-ClaudeExit { $true } -ModuleName AccountSwitcher

            InModuleScope AccountSwitcher { Stop-Claude -ClaudeDir 'C:\Claude' }

            Should -Invoke Stop-Process -ModuleName AccountSwitcher -Times 1 -Exactly
            Should -Invoke Wait-ClaudeExit -ModuleName AccountSwitcher -Times 1 -Exactly
        }

        It 'ends Claude when it has not quit in time' {
            Mock Request-ClaudeQuit { $true } -ModuleName AccountSwitcher
            Mock Wait-ClaudeExit { $false } -ModuleName AccountSwitcher -ParameterFilter { $Seconds -eq 30 }
            Mock Wait-ClaudeExit { $true } -ModuleName AccountSwitcher

            InModuleScope AccountSwitcher { Stop-Claude -ClaudeDir 'C:\Claude' }

            Should -Invoke Stop-Process -ModuleName AccountSwitcher -Times 1 -Exactly
        }
    }

    Context 'Get-ClaudeProcess' {
        It 'finds Claude by the folder it runs from, whatever wildcard characters its path holds' {
            Mock Get-CimInstance -ModuleName AccountSwitcher {
                [pscustomobject]@{ ProcessId = 1; ExecutablePath = 'C:\Users\me [work]\AppData\Roaming\Claude\claude-code\claude.exe' }
                [pscustomobject]@{ ProcessId = 2; ExecutablePath = 'C:\Users\me w\AppData\Roaming\Claude\claude-code\claude.exe' }
            }

            $found = InModuleScope AccountSwitcher { Get-ClaudeProcess -ClaudeDir 'C:\Users\me [work]\AppData\Roaming\Claude' }

            @($found | ForEach-Object { $_.ProcessId }) | Should -Be @(1)
        }
    }
}

Describe 'Sharing Code sessions' {
    BeforeEach {
        New-World
        Set-Seen $Home1
        Set-Seen $Home2
        Set-Seen $Other
    }

    It 'is off by default: each account keeps its own list' {
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        New-Card $Home1 'a1'
        New-Card $Home2 'b1'
        Sync
        Get-Card $Home1 | Should -Be @('a1')
        Get-Card $Home2 | Should -Be @('b1')
    }

    It 'gives the sharing accounts one list and leaves one that does not share alone' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-SavedProfile 'work' $Other
        New-Card $Home1 'a1'
        New-Card $Home2 'b1'
        New-Card $Other 'c1'
        Sync
        Get-Card $Home1 | Should -Be @('a1', 'b1')
        Get-Card $Home2 | Should -Be @('a1', 'b1')
        Get-Card $Other | Should -Be @('c1')
    }

    It 'keeps a copy''s write time, so the next sync copies nothing' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 'a1' 90
        Sync
        $original = (Get-Item (Join-Path (Get-SessionList $Home1) 'local_a1.json')).LastWriteTimeUtc
        (Get-Item (Join-Path (Get-SessionList $Home2) 'local_a1.json')).LastWriteTimeUtc | Should -Be $original
        Sync
        Test-Path (Join-Path $Data 'removed-sessions') | Should -BeFalse
    }

    It 'lets the newer of two copies win' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 's' 60 'started'
        New-Card $Home2 's' 5 'continued'
        Sync
        Read-CardTitle $Home1 's' | Should -Be 'continued'
    }

    It 'takes a session deleted in one list out of the other, and never copies it back' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 'a1'
        New-Card $Home1 'a2'
        New-Card $Home2 'b1'
        Sync
        Remove-Item (Join-Path (Get-SessionList $Home2) 'local_a1.json')
        Sync
        Get-Card $Home1 | Should -Be @('a2', 'b1')
        @(Get-ChildItem (Join-Path $Data 'removed-sessions') -Recurse -Filter 'local_a1.json').Count | Should -Be 1
        Sync
        Get-Card $Home2 | Should -Be @('a2', 'b1')
    }

    It 'leaves the list of an account that stops sharing as it is' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 'a1'
        New-Card $Home2 'b1'
        Sync
        Set-Sharing 'home' $false
        New-Card $Home1 'a2'
        New-Card $Home2 'b2'
        Remove-Item (Join-Path (Get-SessionList $Home1) 'local_b1.json')
        Sync
        Get-Card $Home1 | Should -Be @('a1', 'a2')
        Get-Card $Home2 | Should -Be @('a1', 'b1', 'b2')
        Test-Path (Join-Path $Data 'removed-sessions') | Should -BeFalse
    }

    It 'leaves the lists alone when a profile is deleted' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 'a1'
        New-Card $Home2 'b1'
        Sync
        Remove-Item (Join-Path $Data 'profiles\home2') -Recurse
        Sync
        Get-Card $Home1 | Should -Be @('a1', 'b1')
        Get-Card $Home2 | Should -Be @('a1', 'b1')
    }

    It 'merges an account that shares again, keeping to it what was deleted while it was out' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 'a1'
        New-Card $Home2 'b1'
        Sync
        Set-Sharing 'home' $false
        Sync
        New-Card $Home1 'a2'
        Remove-Item (Join-Path (Get-SessionList $Home2) 'local_b1.json')
        Sync
        Set-Sharing 'home' $true
        Sync
        Get-Card $Home1 | Should -Be @('a1', 'a2', 'b1')
        Get-Card $Home2 | Should -Be @('a1', 'a2')
    }

    It 'does not take a list that lost most of its cards at once as deletions' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        $ids = 1..30 | ForEach-Object { "a$_" } | Sort-Object
        foreach ($id in $ids) { New-Card $Home1 $id }
        Sync
        Get-ChildItem (Get-SessionList $Home2) -Filter 'local_*.json' | Select-Object -Skip 2 | Remove-Item
        Sync
        Get-Card $Home1 | Should -Be $ids
        Get-Card $Home2 | Should -Be $ids
    }

    It 'finds the list in the organization the mod saw, making it when empty' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 'a1'
        New-Card $Home2 'old' -Organization $OtherOrg -MinutesAgo 1
        Sync
        Get-Card $Home2 | Should -Be @('a1')
        Get-Card $Home2 $OtherOrg | Should -Be @('old')
    }

    It 'without the mod''s word, takes the folder of the newest card' {
        Remove-Item (Join-Path $Data 'accounts.json')
        Set-Seen $Home1
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 'a1'
        New-Card $Home2 'b1' 5
        New-Card $Home2 'old' -Organization $OtherOrg -MinutesAgo 3000
        Sync
        Get-Card $Home2 | Should -Be @('a1', 'b1')
        Get-Card $Home2 $OtherOrg | Should -Be @('old')
    }

    It 'skips an account whose list is not known yet, the others still share' {
        Remove-Item (Join-Path $Data 'accounts.json')
        Set-Seen $Home1
        Set-Seen $Home2
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-SavedProfile 'home3' $Other -Shares
        New-Card $Home1 'a1'
        New-Card $Home2 'b1'
        Sync
        Get-Card $Home1 | Should -Be @('a1', 'b1')
        Test-Path (Join-Path $Claude "claude-code-sessions\$Other") | Should -BeFalse
    }

    It 'leaves the lists alone when a later version wrote their record' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 'a1'
        Write-Json (Join-Path $Data 'sessions.json') @{ version = 99; accounts = @{}; deleted = @{} }

        { Sync } | Should -Throw -ExpectedMessage (Get-Text SessionsTooNew 99 1)

        @(Get-Card $Home2).Count | Should -Be 0
    }

    It 'starts afresh from a state file that does not parse' {
        New-SavedProfile 'home' $Home1 -Shares
        New-SavedProfile 'home2' $Home2 -Shares
        New-Card $Home1 'a1'
        [IO.File]::WriteAllText((Join-Path $Data 'sessions.json'), '{ not json')
        Sync
        Get-Card $Home2 | Should -Be @('a1')
    }
}

Describe 'The read model' {
    BeforeEach { New-World }

    It 'is written anew after every change, with each profile''s email and the profile last switched to' {
        New-SavedProfile 'home' $Home1
        Set-Active 'home'
        Write-Json (Join-Path $Data 'accounts.json') @{ $Home1 = @{ org = $Org; email = 'home@example.com' } }

        Add-AccountProfile -Name 'side'

        $index = Read-Index
        $index.version | Should -Be 1
        $index.lastSwitchedTo | Should -Be 'home'
        @($index.profiles.name) | Should -Be @('home', 'side')
        $index.profiles[0].account | Should -Be $Home1
        $index.profiles[0].email | Should -Be 'home@example.com'
        $index.profiles[0].hasSignIn | Should -BeTrue
        $index.profiles[1].account | Should -BeNullOrEmpty
        $index.profiles[1].hasSignIn | Should -BeFalse
        $index.accounts.$Home1.org | Should -Be $Org

        Rename-AccountProfile -Name 'side' -NewName 'spare'
        @((Read-Index).profiles.name) | Should -Be @('home', 'spare')
    }

    It 'is written also when a change fails, as it may have changed something' {
        New-SavedProfile 'home' $Home1
        { Add-AccountProfile -Name 'home' } | Should -Throw
        @((Read-Index).profiles.name) | Should -Be @('home')
    }

    It 'that can''t be written is logged, and leaves the command''s own outcome as it was' {
        New-SavedProfile 'home' $Home1
        Mock -ModuleName AccountSwitcher Write-SwitcherIndex { throw 'disk full' }

        { Add-AccountProfile -Name 'home' } | Should -Throw -ExpectedMessage (Get-Text ProfileExists 'home')
        Add-AccountProfile -Name 'side'

        Test-Path (Join-Path $Data 'profiles\side') | Should -BeTrue
        Get-Content (Join-Path $Data 'switcher.log') -Raw | Should -Match ([regex]::Escape((Get-Text IndexNotWritten 'disk full')))
    }

    It 'is written as the mod reads it' -ForEach $IndexSamples {
        foreach ($item in $Sample.profiles) {
            New-SavedProfile $item.name $item.account -Shares:$item.sharesSessions -NoSignIn:(-not $item.hasSignIn)
        }
        Set-Active $Sample.lastSwitchedTo
        Write-Json (Join-Path $Data 'accounts.json') $Sample.accounts

        Invoke-InModule { Write-SwitcherIndex }

        ConvertTo-CanonicalJson (Read-Index) | Should -BeExactly (ConvertTo-CanonicalJson $Sample)
    }
}

Describe 'A session''s start' {
    BeforeEach {
        New-World
        Mock Get-ClaudeDataDir ([scriptblock]::Create("return '$Claude'")) -ModuleName AccountSwitcher
    }

    It 'notes what the session runs with, and names an account no profile holds after its own name' {
        New-SavedProfile 'home' $Home2
        Set-ClaudeSignIn $Home1

        Invoke-AccountSwitcher start -Account $Home1 -DisplayName 'Alex' -Organization $Org -Email 'alex@example.com'

        (Get-Record 'Alex').account | Should -Be $Home1
        (Read-Json (Join-Path $Data 'accounts.json')).$Home1.email | Should -Be 'alex@example.com'
        ((Read-Index).profiles | Where-Object name -EQ 'Alex').email | Should -Be 'alex@example.com'
    }

    It 'records the account in the profile just switched to, which holds none yet' {
        New-SavedProfile 'new'
        Set-Active 'new'
        Set-ClaudeSignIn $Other

        Invoke-AccountSwitcher start -Account $Other -DisplayName 'Alex'

        (Get-Record 'new').account | Should -Be $Other
        Test-Path (Join-Path $Data 'profiles\Alex') | Should -BeFalse
    }

    It 'leaves a profile that holds the account as it is' {
        New-SavedProfile 'home' $Home1
        Set-ClaudeSignIn $Home1

        Invoke-AccountSwitcher start -Account $Home1 -DisplayName 'Alex'

        @(Get-AccountProfile).Name | Should -Be @('home')
    }
}

Describe 'Files' {
    BeforeEach { New-World }

    It 'are replaced whole, also while a reader holds them open, leaving nothing beside them' {
        $path = Join-Path $Data 'accounts.json'
        Write-Json $path @{ old = $true }
        $reader = [IO.File]::Open($path, 'Open', 'Read', 'ReadWrite, Delete')
        try {
            Invoke-InModule { param($Path) Write-JsonFile $Path @{ new = $true } } @{ Path = $path }
        } finally {
            $reader.Dispose()
        }

        (Read-Json $path).new | Should -BeTrue
        @(Get-ChildItem -LiteralPath (Split-Path $path -Parent) -Filter '*.tmp') | Should -HaveCount 0
    }
}

Describe 'The command line' {
    BeforeEach { New-World }

    It 'exits with a code that says what went wrong' {
        Invoke-Switcher add 'side' | Should -Be 0
        Invoke-Switcher add 'side' | Should -Be 4
        Invoke-Switcher rename 'nope' 'other' | Should -Be 3
        Invoke-Switcher share 'side' 'maybe' | Should -Be 2
        Invoke-Switcher bogus | Should -Be 2
    }

    It 'exits <Code> for an error of category <Category>, as the mod reads it' -ForEach $ExitCodeCases {
        $ast = [Management.Automation.Language.Parser]::ParseFile((Resolve-Path $Switch), [ref]$null, [ref]$null)
        $assignment = $ast.Find({
                param($Node)
                $Node -is [Management.Automation.Language.AssignmentStatementAst] -and "$($Node.Left)" -eq '$ExitCodes'
            }, $true)

        $assignment.Right.Expression.SafeGetValue()[$Category] | Should -Be $Code
    }

    It 'checks a detached run before it starts, and refuses a switch to the profile signed in now as not now' {
        Mock Get-ClaudeDataDir ([scriptblock]::Create("return '$Claude'")) -ModuleName AccountSwitcher
        Mock Start-DetachedSwitcher {} -ModuleName AccountSwitcher
        New-SavedProfile 'home' $Home1
        Set-ClaudeSignIn $Home1

        { Invoke-AccountSwitcher switch 'nope' -Detach -DataDir $Data } | Should -Throw -ExpectedMessage (Get-Text ProfileNotSaved 'nope')
        { Invoke-AccountSwitcher switch '-bad' -Detach -DataDir $Data } | Should -Throw -ExpectedMessage (Get-Text NameInvalid '-bad' (Invoke-InModule { $script:ProfileNameMax }))
        { Invoke-AccountSwitcher new 'home' -Detach -DataDir $Data } | Should -Throw -ExpectedMessage (Get-Text ProfileExists 'home')
        foreach ($isDetached in $true, $false) {
            $failure = try { Invoke-AccountSwitcher switch 'HOME' -Detach:$isDetached -DataDir $Data; $null } catch { $_ }
            $failure.Exception.Message | Should -Be (Get-Text AlreadySignedIn 'home')
            "$($failure.CategoryInfo.Category)" | Should -Be 'InvalidOperation'
        }
        Should -Invoke Start-DetachedSwitcher -ModuleName AccountSwitcher -Times 0 -Exactly

        New-SavedProfile 'work' $Home2
        Invoke-AccountSwitcher switch 'work' -Detach -DataDir $Data | Should -Be (Get-Text DetachStarted 'switch' 'work')
        Should -Invoke Start-DetachedSwitcher -ModuleName AccountSwitcher -Times 1 -Exactly
    }

    It 'quotes each argument of a detached run as Windows reads it back' {
        $cases = @(
            @{ Argument = 'work'; Quoted = '"work"' }
            @{ Argument = 'C:\data\'; Quoted = '"C:\data\\"' }
            @{ Argument = 'a"b'; Quoted = '"a\"b"' }
            @{ Argument = 'a\"b'; Quoted = '"a\\\"b"' }
        )
        foreach ($case in $cases) {
            Invoke-InModule { param($Argument) ConvertTo-CommandLineArgument $Argument } @{ Argument = $case.Argument } | Should -BeExactly $case.Quoted
        }
    }

    It 'passes every parameter but -Detach to the detached run, which shows its failures' {
        $line = Invoke-InModule { Get-DetachedCommandLine @{ Command = 'switch'; Name = 'Work Main'; DataDir = 'C:\d'; NoRestart = [switch]$true; Background = [switch]$true } }

        $line | Should -Match ([regex]::Escape('-Command "switch"'))
        $line | Should -Match ([regex]::Escape('-Name "Work Main"'))
        $line | Should -Match ([regex]::Escape('-DataDir "C:\d"'))
        $line | Should -Match '-NoRestart'
        $line | Should -Match '-Background'
        $line | Should -Not -Match '-Detach'
    }

    It 'starts the detached run with switch.ps1' {
        $line = Invoke-InModule { Get-DetachedCommandLine @{ Command = 'switch' } }

        $line | Should -Match ([regex]::Escape('-File "{0}"' -f (Resolve-Path -LiteralPath $script:Switch).Path))
    }

    It 'hands a run off hidden from its start, in the data folder open now, its status reading starting till it runs' {
        Mock Invoke-CimMethod { [pscustomobject]@{ ReturnValue = 0 } } -ModuleName AccountSwitcher

        Invoke-InModule { Start-DetachedSwitcher -Parameters @{ Command = 'switch'; Name = 'work' } }

        $status = Read-Json (Join-Path $Data 'switch.json')
        $status.command | Should -Be 'switch'
        $status.state | Should -Be 'starting'
        Should -Invoke Invoke-CimMethod -ModuleName AccountSwitcher -Times 1 -Exactly -ParameterFilter {
            $line = $Arguments.CommandLine
            $Arguments.ProcessStartupInformation.ShowWindow -eq 0 -and
            $line -match ([regex]::Escape("-RunId ""$($status.id)""")) -and
            $line -match ([regex]::Escape("-DataDir ""$Data""")) -and
            $line -match '-Background'
        }
    }

    It 'hands a run off under the id its caller gives, which waits for that run alone' {
        Mock Invoke-CimMethod { [pscustomobject]@{ ReturnValue = 0 } } -ModuleName AccountSwitcher
        $id = [guid]::NewGuid().ToString()

        Invoke-InModule { param($Id) Start-DetachedSwitcher -Parameters @{ Command = 'switch'; Name = 'work'; RunId = $Id } } @{ Id = $id }

        (Read-Json (Join-Path $Data 'switch.json')).id | Should -Be $id
        Should -Invoke Invoke-CimMethod -ModuleName AccountSwitcher -Times 1 -Exactly -ParameterFilter {
            $Arguments.CommandLine -match ([regex]::Escape("-RunId ""$id"""))
        }
    }

    It 'says a run that could not be handed off failed, in switch.json too' {
        Mock Invoke-CimMethod { [pscustomobject]@{ ReturnValue = 9 } } -ModuleName AccountSwitcher

        { Invoke-InModule { Start-DetachedSwitcher -Parameters @{ Command = 'switch'; Name = 'work' } } } |
            Should -Throw -ExpectedMessage (Get-Text DetachFailed 9)

        $status = Read-Json (Join-Path $Data 'switch.json')
        $status.state | Should -Be 'failed'
        $status.message | Should -Be (Get-Text DetachFailed 9)
    }

    It 'has the detached run say in switch.json how it ended; a failure before Claude closes is the mod''s alone to show' {
        Mock Show-SwitcherError {} -ModuleName AccountSwitcher

        Invoke-AccountSwitcher add 'side' -DataDir $Data -Background -RunId 'run-1' 6>$null
        $status = Read-Json (Join-Path $Data 'switch.json')
        @($status.id, $status.command, $status.state) | Should -Be @('run-1', 'add', 'done')

        { Invoke-AccountSwitcher rename 'nope' 'other' -DataDir $Data -Background -RunId 'run-2' } | Should -Throw
        $status = Read-Json (Join-Path $Data 'switch.json')
        @($status.id, $status.state, $status.message) | Should -Be @('run-2', 'failed', (Get-Text ProfileNotSaved 'nope'))
        Should -Invoke Show-SwitcherError -ModuleName AccountSwitcher -Times 0 -Exactly
    }

    It 'shows a failure of the detached run in a dialog once it went on to close Claude, and the mod with it' {
        Mock Show-SwitcherError {} -ModuleName AccountSwitcher
        Mock Get-ClaudeDataDir ([scriptblock]::Create("return '$Claude'")) -ModuleName AccountSwitcher
        Mock Get-ClaudeProcess {} -ModuleName AccountSwitcher
        Mock Start-Claude { throw 'not found' } -ModuleName AccountSwitcher
        New-SavedProfile 'home' $Home1
        New-SavedProfile 'work' $Home2
        Set-ClaudeSignIn $Home1

        { Invoke-AccountSwitcher switch 'work' -DataDir $Data -Background -RunId 'run-3' 6>$null } | Should -Throw -ExpectedMessage 'not found'

        (Read-Json (Join-Path $Data 'switch.json')).state | Should -Be 'failed'
        Should -Invoke Show-SwitcherError -ModuleName AccountSwitcher -Times 1 -Exactly -ParameterFilter { $Message -eq 'not found' }
    }

    It 'writes switch.json as the mod reads it' -ForEach $SwitchRunSamples {
        $parameters = @{ DataDir = $Data; Sample = $Sample }
        Invoke-InModule { param($DataDir, $Sample) Write-SwitchRunStatus $DataDir $Sample.id $Sample.command $Sample.state $Sample.message } $parameters

        ConvertTo-CanonicalJson (Read-Json (Join-Path $Data 'switch.json')) | Should -BeExactly (ConvertTo-CanonicalJson $Sample)
    }

    It 'starts a real detached run outside the caller, which says in switch.json that it ran' {
        Invoke-InModule { Start-DetachedSwitcher -Parameters @{ Command = 'list' } }

        $path = Join-Path $Data 'switch.json'
        $deadline = (Get-Date).AddSeconds(60)
        do {
            Start-Sleep -Milliseconds 250
            $state = try { (Read-Json $path).state } catch { $null }
        } while ($state -ne 'done' -and $state -ne 'failed' -and (Get-Date) -lt $deadline)
        $state | Should -Be 'done'
    }
}

Describe 'Messages' {
    It 'take the plural form their count asks for' {
        Invoke-InModule { Get-SwitcherPluralText BackupsRemoved 1 } | Should -Be (Get-Text BackupsRemovedOne 1)
        Invoke-InModule { Get-SwitcherPluralText BackupsRemoved 3 } | Should -Be (Get-Text BackupsRemovedOther 3)
    }
}
