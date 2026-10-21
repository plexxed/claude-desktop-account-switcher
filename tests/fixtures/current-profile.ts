// Which profile is the one signed in now, as both sides find it: the mod's
// currentProfile and the script's Resolve-CurrentProfile. Each case: the
// profiles by name with the account each holds (null: none yet), the account
// Claude is signed in to, the profile last switched to, and the answer (null:
// no profile); with no account named, see current-profile-no-account.ts.
// AccountSwitcher.Tests.ps1 reads the array below as JSON (the
// test kit loads no .json files), so keep it strict JSON: double quotes, no
// trailing commas, no comments inside.
export const CURRENT_PROFILE_CASES: {
  case: string
  profiles: Record<string, string | null>
  account: string
  lastSwitchedTo: string | null
  current: string | null
}[] = [
  {
    "case": "the profile that holds the account, whichever was switched to last",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "work": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    "account": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "lastSwitchedTo": "home",
    "current": "work"
  },
  {
    "case": "the profile just switched to, which holds no account yet",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "new": null },
    "account": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "lastSwitchedTo": "new",
    "current": "new"
  },
  {
    "case": "the profile just switched to, named in another case, as its folder is",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "new": null },
    "account": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "lastSwitchedTo": "NEW",
    "current": "new"
  },
  {
    "case": "a profile that holds the account before the one just switched to",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "new": null },
    "account": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    "lastSwitchedTo": "new",
    "current": "home"
  },
  {
    "case": "none for an account signed in from Claude's own screen",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "work": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    "account": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "lastSwitchedTo": "home",
    "current": null
  },
  {
    "case": "none when the profile last switched to is gone",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
    "account": "cccccccc-cccc-cccc-cccc-cccccccccccc",
    "lastSwitchedTo": "gone",
    "current": null
  }
]
