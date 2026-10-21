# Changelog

Every change worth knowing about, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the version numbers [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-10-21

### Changed

- The limits are fetched every five minutes while no turn of Claude's ends, not every minute, so the usage endpoint answers 429 less often; a turn's end still fetches them at once, unless any session fetched them in the last two minutes. After a failed fetch the waits are 5, 10 and 15 minutes.
- A fetch of the limits that fails says why: the debug log has the server's status and its Retry-After, and the mod's store keeps the last failure (`lastFailure` in `poll@1`) past the fetches that succeed after it.

### Fixed

- A session started or resumed while the usage endpoint refused (a 429) showed the last poll's figures, however old, and wrote them over the account's later ones. A session now starts from the account's last known figures, and older ones never replace newer ones.

## [0.1.0] - 2026-10-21

The first release.

### Added

- **A band above the prompt** with the session's context fill and the account's plan limits: the 5-hour and weekly windows, the credit windows some plans have instead, and a monthly spend where a Team or Enterprise seat has one. Each figure has a bar, the time left until it resets and a hint card with the exact reset time, read in the system's regional format.
- **An account picker** in the band, listing every saved account with the last limits seen for it.
- **The Accounts list** in the side pane: a card per account with its email and limits, where accounts are added, renamed, deleted and switched. Switching and deleting ask on the card first, and say what they cost.
- **Switching** closes Claude the way Windows closes an app for an installer, swaps in the other account's sign-in, and starts Claude again. A step that fails puts the sign-in back from the backup made at the start.
- **Profiles follow their account**, not their name: an account signed in from Claude's own sign-in screen gets a profile of its own, named after the account, and is never saved over another profile's sign-in.
- **Shared Code sessions**, off by default: the accounts ticked under **Shared sessions** get one list of Code sessions, brought together at each switch.
- **The switcher script** runs from a shell too (`scripts\switch.ps1`), with an exit code that says what went wrong.

[Unreleased]: https://github.com/plexxed/claude-desktop-account-switcher/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/plexxed/claude-desktop-account-switcher/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/plexxed/claude-desktop-account-switcher/releases/tag/v0.1.0
