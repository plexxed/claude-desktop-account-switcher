# The switcher's messages, from <language>\AccountSwitcher.psd1, and its errors.

# The switcher's message $Name, its {0}, {1} filled from $Arguments as -f fills them.
function Get-SwitcherText {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory, Position = 0)][string]$Name,
        [Parameter(Position = 1, ValueFromRemainingArguments)][object[]]$Arguments
    )

    if (-not $script:Text.ContainsKey($Name)) { throw "AccountSwitcher.psd1 has no message '$Name'." }
    # Counted, not tested for truth: -not @(0) is true, and a count of 0 still fills {0}.
    if ($null -eq $Arguments -or $Arguments.Count -eq 0) { return $script:Text[$Name] }

    return $script:Text[$Name] -f $Arguments
}

# The plural form of message $Name for $Count: <Name>One or <Name>Other, by the
# plural rule of the messages' language ({0} is the count).
function Get-SwitcherPluralText {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory, Position = 0)][string]$Name,
        [Parameter(Mandatory, Position = 1)][int]$Count
    )

    # English, the one language the messages are in: one for 1, other for the rest.
    $form = if ($Count -eq 1) { 'One' } else { 'Other' }

    return Get-SwitcherText "$Name$form" $Count
}

<#
.SYNOPSIS
    The error of message $Name, to throw: its id AccountSwitcher.<Name>, and a
    category that says what went wrong, which switch.ps1 turns into its exit code.
#>
function New-SwitcherError {
    # It builds an error record and changes nothing.
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseShouldProcessForStateChangingFunctions', '')]
    [CmdletBinding()]
    [OutputType([Management.Automation.ErrorRecord])]
    param(
        [Parameter(Mandatory, Position = 0)][string]$Name,
        [Parameter(Mandatory, Position = 1)][Management.Automation.ErrorCategory]$Category,
        [Parameter(Position = 2, ValueFromRemainingArguments)][object[]]$Arguments
    )

    $message = Get-SwitcherText -Name $Name -Arguments $Arguments
    $exception = New-Object InvalidOperationException $message

    return New-Object Management.Automation.ErrorRecord($exception, "AccountSwitcher.$Name", $Category, $null)
}
