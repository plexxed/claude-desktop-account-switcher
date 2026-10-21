// How a run of the switcher ended, as both sides read it: the mod's ScriptExit
// (by `exit`) and switch.ps1's exit code of each category of the module's errors
// (`category`; null where no category maps to it). AccountSwitcher.Tests.ps1
// reads the array below as JSON (the test kit loads no .json files), so keep it
// strict JSON: double quotes, no trailing commas, no comments inside.
export const EXIT_CODE_CASES: { exit: string; code: number; category: string | null }[] = [
  { "exit": "Ok", "code": 0, "category": null },
  { "exit": "Failed", "code": 1, "category": null },
  { "exit": "Invalid", "code": 2, "category": "InvalidArgument" },
  { "exit": "NotFound", "code": 3, "category": "ObjectNotFound" },
  { "exit": "Exists", "code": 4, "category": "ResourceExists" },
  { "exit": "Busy", "code": 5, "category": "ResourceBusy" },
  { "exit": "NotNow", "code": 6, "category": "InvalidOperation" }
]
