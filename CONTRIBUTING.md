# Contributing

Thanks for helping. Bug reports, fixes and ideas are welcome: open an [issue](https://github.com/plexxed/claude-desktop-account-switcher/issues/new/choose) with the bug report or feature request form. For a larger change, open an issue first so we can agree on it before you build it. A security problem goes through [SECURITY.md](SECURITY.md) instead.

By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).

## Setting up

You need Windows 10 or 11, Node.js 22 or later, Claude Code 2.1.299 or later, and, for the PowerShell side, [Pester](https://pester.dev) 5.5+ and PSScriptAnalyzer:

```powershell
Install-Module Pester, PSScriptAnalyzer -Scope CurrentUser -SkipPublisherCheck
```

```bash
npm install
npm run types
npm run check
```

To try a change in Claude Desktop, put `"CLAUDE_CODE_PLUGIN_DIRS": "<this folder>"` in the `env` block of `~/.claude/settings.json`; each save reloads the mod. Uninstall the mod first if you installed it from the marketplace, or both copies load. Claude Code writes the mod's type declarations to `.claude-plugin/types/` when it loads the mod, and `tsconfig.json` reads them from there; `npm run types` has it write them without a session.

`npm run check` runs every check side by side, in about 25 seconds: `claude plugin validate`, the type check, ESLint with its type-checked rules, Prettier, the mod tests, the Pester tests and PSScriptAnalyzer. `npm run format` lays the code out as Prettier does. The Pester tests run in temporary folders: they never read your profiles or Claude's sign-in, and never close or start Claude.

## How it is built

The mod is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview). The hooks module, in TypeScript, draws the band and the list; the PowerShell module in `scripts\` does every change to disk, and `scripts\switch.ps1` is its command line (`Get-Help scripts\switch.ps1 -Full` lists its exit codes, and `Get-Help Invoke-AccountSwitcher` its commands, once `scripts\AccountSwitcher.psd1` is imported).

```
.claude-plugin/
  plugin.json                the manifest
  marketplace.json           the repository as a marketplace of this one plugin, which installs from it
hooks/                       in layers, each using only the ones below it
  register.ts                the hooks, each handing its work to the module that owns it
  ui/                        what the person sees and does
    band.tsx, accounts.tsx   the band and the Accounts list, rendered from their models
    bandModel.ts,            what each shows, as plain data
      accountsModel.ts
    actions.ts, messages.ts  what their buttons run, and what they say of a command
    ids.ts                   the ids the views share
    parts.tsx, styles.ts     the pieces both draw a figure with, and the whole look
    drawn.ts                 keeps a drawing whose data did not change, so its buttons take one click
    format.ts, layout.ts     how figures read, and how much of the band fits
    strings.ts               every word the mod shows
    tick.ts                  the redraw each minute, for the countdowns
  commands/                  the commands the person gives: one table of them, and how one runs and is waited for
  services/
    api.ts                   the two undocumented endpoints
    usageAnswer.ts           the usage endpoint's answer, read as Claude Code reads it
    poll.ts, snapshots.ts    the poll the sessions share; each account's last seen limits
    storedLimits.ts          limits read back from the store
    meter.ts                 the band's figures: the context, and the limits merged into them
    switcher.ts              the switcher script as the mod calls it: its commands, and how a run went
    dataFiles.ts             the JSON files the script keeps for the mod, read without trust
    readModel.ts             the profiles, from the script's read model (index.json)
    switchRun.ts             how a switch handed to a run outside Claude goes (switch.json)
    storeKeys.ts             every key the mod keeps in its store, and the pruning of the others
    upkeep.ts                the script's runs for the mod's own upkeep, and pruning the store
  domain/                    the rules, pure: limits, levels, the context, local time, profiles and their names
  platform/                  the engine and Windows: the mod's id, environment, paths, the time zone, the script
                             as a process, the store, the values the band draws from, the debug log, JSON
scripts/
  AccountSwitcher.psd1       the PowerShell module's manifest
  AccountSwitcher.psm1       its settings and the data folder's layout; loads Public\ (exported) and Private\
  switch.ps1                 its command line (Invoke-AccountSwitcher)
  en-US/AccountSwitcher.psd1 every message of the two
tests/                       mod tests (*.test.ts) and Pester tests (*.Tests.ps1)
  fixtures/                  the cases both sides are tested against, where both decide the same thing
tools/check.mjs              runs the checks side by side
tools/types.mjs              has Claude Code write the plugin API's type declarations
docs/images/                 the README's screenshots
```

## Making a change

- **Keep `npm run check` green.** CI runs the same checks on Windows for every push and pull request (`.github/workflows/ci.yml`).
- **Test what you change**: a behavior or a decision, not a layout. The mod's tests are in `tests/*.test.ts`, the script's in `tests/AccountSwitcher.Tests.ps1`. A rule both sides apply (a valid profile name, the profile signed in now) is tested on both against the same cases in `tests/fixtures/`.
- **Words go in the resource files**, never in code or tests: `hooks/ui/strings.ts` for the mod (read through `t()`), `scripts/en-US/AccountSwitcher.psd1` for the script (through `Get-SwitcherText`). Tests build what they expect from the same files. Lines of the debug log and `Write-Verbose` are for developers and stay in code.
- **PowerShell files stay ASCII with CRLF line endings**, and must run on Windows PowerShell 5.1. Pass `$` (the engine) to top-level functions as a parameter; the hooks validator refuses it in an object or a function table.
- **The script owns the data folder.** The mod reads only what the script writes for it, `index.json` and `switch.json`, and asks the script for every change; a change to a data file's shape bumps its version (`DataVersion`, `IndexVersion`, `SwitchRunVersion`, the store keys in `hooks/services/storeKeys.ts`) with a migration where one is needed.
- **Add a line to [CHANGELOG.md](CHANGELOG.md)** under _Unreleased_, saying what changed for the person using the mod.

## Releases

A version tag (`v0.2.0`) publishes a release with that version's section of the changelog (`.github/workflows/release.yml`), once the tag, `plugin.json` and the module's manifest agree on the version. Dependabot keeps the pinned actions and the development tools current.

## Pull requests

One change per pull request, with a description of what it changes and why, and how you tried it. Commits read best as one line in the imperative ("Refuse a name taken in another case"), with a body where the why isn't obvious.

## Code of conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
