// Which profile is the one signed in now when no account is named, as each side
// reads that: the mod's currentProfile as an environment that doesn't name it
// (an older Claude), so the profile last switched to, whatever it holds; the
// script's Resolve-CurrentProfile as Claude signed out, so the profile last
// switched to only while it holds no account yet (Claude's sign-in screen is
// where one is being signed in to). Each case: the profiles by name with the
// account each holds (null: none yet), the profile last switched to, and each
// side's answer (null: no profile). AccountSwitcher.Tests.ps1 reads the array
// below as JSON (the test kit loads no .json files), so keep it strict JSON:
// double quotes, no trailing commas, no comments inside.
export const NO_ACCOUNT_CASES: {
  case: string
  profiles: Record<string, string | null>
  lastSwitchedTo: string | null
  mod: string | null
  script: string | null
}[] = [
  {
    "case": "the profile last switched to holds an account",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "work": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" },
    "lastSwitchedTo": "home",
    "mod": "home",
    "script": null
  },
  {
    "case": "the profile last switched to holds no account yet",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "new": null },
    "lastSwitchedTo": "new",
    "mod": "new",
    "script": "new"
  },
  {
    "case": "the profile last switched to is named in another case, as its folder is",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "new": null },
    "lastSwitchedTo": "NEW",
    "mod": "new",
    "script": "new"
  },
  {
    "case": "nothing was switched to",
    "profiles": { "home": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
    "lastSwitchedTo": null,
    "mod": null,
    "script": null
  }
]
