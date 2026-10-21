// What a profile name may be, as both sides check it: the mod as the name is
// typed, the script before it makes the folder. AccountSwitcher.Tests.ps1 reads
// the array below as JSON (the test kit loads no .json files), so keep it strict
// JSON: double quotes, no trailing commas, no comments inside.
export const PROFILE_NAME_CASES: { name: string; isValid: boolean }[] = [
  { "name": "work", "isValid": true },
  { "name": "Work Main", "isValid": true },
  { "name": "Личный акк", "isValid": true },
  { "name": "a.b", "isValid": true },
  { "name": ".hidden", "isValid": true },
  { "name": "1234567890123456789012345678901234567890", "isValid": true },
  { "name": "12345678901234567890123456789012345678901", "isValid": false },
  { "name": "", "isValid": false },
  { "name": " leading", "isValid": false },
  { "name": "-work", "isValid": false },
  { "name": "work-main", "isValid": true },
  { "name": "trailing ", "isValid": false },
  { "name": "trailing.", "isValid": false },
  { "name": "a/b", "isValid": false },
  { "name": "a\\b", "isValid": false },
  { "name": "what?", "isValid": false },
  { "name": "star*", "isValid": false },
  { "name": "a:b", "isValid": false },
  { "name": "quote\"", "isValid": false },
  { "name": "<tag>", "isValid": false },
  { "name": "pipe|", "isValid": false },
  { "name": "tab\tname", "isValid": false },
  { "name": "NUL", "isValid": false },
  { "name": "con", "isValid": false },
  { "name": "COM1", "isValid": false },
  { "name": "lpt9", "isValid": false }
]
