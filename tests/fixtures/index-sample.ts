// index.json, the read model the script writes for the mod: the script must
// write exactly this from the profiles and accounts it describes
// (Write-SwitcherIndex), and the mod reads it as these profiles (readModel.ts).
// AccountSwitcher.Tests.ps1 reads the array below as JSON (the test kit loads no
// .json files), so keep it strict JSON: double quotes, no trailing commas, no
// comments inside.
export const INDEX_SAMPLES: {
  version: number
  lastSwitchedTo: string | null
  profiles: { name: string; account: string | null; email: string | null; sharesSessions: boolean; hasSignIn: boolean }[]
  accounts: Record<string, { org?: string; email?: string }>
}[] = [
  {
    "version": 1,
    "lastSwitchedTo": "home",
    "profiles": [
      {
        "name": "home",
        "account": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "email": "home@example.com",
        "sharesSessions": true,
        "hasSignIn": true
      },
      {
        "name": "side",
        "account": null,
        "email": null,
        "sharesSessions": false,
        "hasSignIn": false
      },
      {
        "name": "work",
        "account": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "email": null,
        "sharesSessions": false,
        "hasSignIn": true
      }
    ],
    "accounts": {
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa": { "org": "11111111-1111-1111-1111-111111111111", "email": "home@example.com" },
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb": { "org": "22222222-2222-2222-2222-222222222222" }
    }
  }
]
