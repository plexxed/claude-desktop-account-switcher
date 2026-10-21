# Every message of the account switcher script, in one place: its log lines,
# its errors (the mod shows them as toasts), its list, and its -WhatIf prompts.
# AccountSwitcher.psm1 reads them through Get-SwitcherText, and the tests read
# this file too. A {0}, {1} is filled as -f fills it; a
# message counted has a form for each plural category, <Name>One and <Name>Other
# (Get-SwitcherPluralText).
#
# The mod's own words are in hooks/ui/strings.ts.
@{
    # --- Data folder and lock -------------------------------------------------------
    DataTooNew             = 'The switcher''s data was written by a later version (layout {0}; this one reads up to {1}). Update the mod.'
    SwitchRunning          = 'Another account switch is still running; try again in a moment.'
    IndexNotWritten        = 'index.json was not written: {0}'

    # --- Claude Desktop --------------------------------------------------------------
    ClaudeDataNotFound     = 'Claude Desktop''s data folder was not found (looked in: {0}).'
    ClaudeRefusedQuit      = 'Claude refused to quit.'
    ClaudeNoWindow         = 'Claude has no window to ask to quit.'
    ClaudeClosing          = 'Closing Claude...'
    ClaudeQuitTimeout      = 'Claude did not quit within {0} seconds; ending its {1}.'
    ClaudeNotAsked         = 'Claude could not be asked to quit; ending its {0}.'
    ClaudeProcessesOne     = '{0} process'
    ClaudeProcessesOther   = '{0} processes'
    ClaudeExitTimeout      = 'Claude did not exit within {0} seconds; nothing was changed.'
    ClaudeStarting         = 'Starting Claude...'
    ClaudeNotFound         = 'Claude was not found to start it; start it yourself.'
    ClaudeNotStarted       = 'Claude was not started again: {0}'

    # --- Profiles ----------------------------------------------------------------------
    NameRequired           = 'A profile name is required.'
    NameInvalid            = 'Profile name ''{0}'' can''t start with - or a space, end with a space or dot, or contain < > : " / \ | ? * (up to {1} characters).'
    # The names an account no profile holds is saved under: its own, numbered
    # from 2 when that is taken ({0} the name, {1} the number), else Account1, ...
    NumberedProfileName    = '{0} {1}'
    FreeProfileName        = 'Account{0}'
    AccountIdInvalid       = '''{0}'' is not an account or organization id.'
    NotSignedIn            = 'Claude is not signed in to an account.'
    AccountAlreadySaved    = 'This account is already saved as ''{0}''; rename it instead.'
    ProfileExists          = 'Profile ''{0}'' already exists.'
    ProfileNotSaved        = 'Profile ''{0}'' is not saved.'
    AccountNamed           = 'Named the account signed in now ''{0}''; its sign-in is saved on the next switch.'
    AccountBound           = '''{0}'' holds the account signed in now; its sign-in is saved on the next switch.'
    ProfileAdded           = 'Added ''{0}''; it signs in on its first switch.'
    ProfileAddUndone       = 'Removed ''{0}'' again, as the switch to it failed.'
    ProfileRenamed         = 'Renamed ''{0}'' to ''{1}''.'
    DeleteSignedIn         = '''{0}'' is signed in now; switch to another profile first.'
    ProfileDeleted         = 'Deleted profile ''{0}''.'
    BackupsRemovedOne      = 'Removed {0} backup of its sign-in.'
    BackupsRemovedOther    = 'Removed {0} backups of its sign-in.'
    SharingOn              = '''{0}'' shares its Code sessions with the other sharing profiles from the next switch.'
    SharingOff             = '''{0}'' stops sharing Code sessions from the next switch; the ones already shared stay where they are.'

    # --- Sign-in and switching -----------------------------------------------------------
    SignInSaved            = 'Saved the sign-in of ''{0}''.'
    SignInUnreadable       = 'The saved sign-in of ''{0}'' can''t be read.'
    BackupUnreadable       = 'The backup {0} can''t be read.'
    SignInRolledBack       = 'The switch failed; put Claude''s sign-in back as backup {0} holds it.'
    RollbackFailed         = 'The switch failed, and Claude''s sign-in could not be put back from backup {0}: {1}'
    ProfileRestored        = 'Restored ''{0}''.'
    SignedOut              = 'Signed Claude out on this computer.'
    AlreadySignedIn        = '''{0}'' is signed in already.'
    UnsavedAccountSaved    = 'The account signed in now was not saved; saved it as ''{0}''.'
    SessionsNotSynced      = 'Sessions were not synced: {0}'
    SignInNext             = 'Sign in to the ''{0}'' account in Claude; it is saved on the next switch.'

    # --- Shared sessions -----------------------------------------------------------------
    SessionListMissing     = 'Account {0} shares sessions but its session list was not found yet: open the Code tab there once.'
    SessionListEmptied     = 'The session list of account {0} lost {1} cards at once; not taken as deletions.'
    SessionsSynced         = 'Shared sessions: {0}, {1}.'
    SessionsCopiedOne      = '{0} card copied'
    SessionsCopiedOther    = '{0} cards copied'
    SessionsRemovedOne     = '{0} deleted elsewhere'
    SessionsRemovedOther   = '{0} deleted elsewhere'
    SessionsTooNew         = 'The shared sessions'' record was written by a later version (format {0}; this one reads up to {1}). Update the mod.'

    # --- -WhatIf prompts: what is done, to the target the cmdlet names -------------------
    ActionClose            = 'Close'
    ActionStart            = 'Start'
    ActionSaveSignedIn     = 'Save the signed-in account'
    ActionRecordSignedIn   = 'Record the signed-in account in'
    ActionAdd              = 'Add profile'
    ActionRename           = 'Rename to ''{0}'''
    ActionDelete           = 'Delete profile and its saved sign-in'
    ActionShare            = 'Share sessions: {0}'
    ActionRemoveBackup     = 'Remove sign-in backup'
    ActionForgetAccount    = 'Forget account'
    ActionForgetSessionList = 'Forget the shared session list of account'
    ActionNoteAccount      = 'Note what was seen of account'
    ActionSwitch           = 'Switch Claude to'
    ActionSync             = 'Sync'
    ActionRemoveCard       = 'Take out of the shared session lists'
    ActionDetach           = 'Run in a process of its own'
    TargetClaude           = 'Claude'
    TargetSessionLists     = 'Code session lists'

    # --- Invoke-AccountSwitcher and switch.ps1 -----------------------------------------------
    DetachFailed           = 'The detached switcher did not start (code {0}).'
    DetachStarted          = 'Started: {0} {1}'
    ListEmpty              = 'No profiles saved yet. Name the account signed in now: switch.ps1 save <name>'
    ListLine               = '{0} {1}'
    ListLineNotes          = '{0} {1} ({2})'
    ListNoteSeparator      = ', '
    ListSignedIn           = 'signed in'
    ListNotSignedIn        = 'not signed in yet'
    ListShares             = 'shares sessions'
    ListUnsaved            = '* (the account signed in now has no profile: save <name>)'
    ShareOnOff             = 'Say on or off: share <name> on|off.'
    LogError               = 'ERROR: {0}'
    DialogTitle            = 'Claude account switcher'
}
