// The files of the data folder the mod reads, by the names both sides give them:
// the mod's INDEX_FILE and SWITCH_RUN_FILE, the script's Paths.Index and
// Get-SwitchRunPath. AccountSwitcher.Tests.ps1 reads the array below as JSON
// (the test kit loads no .json files), so keep it strict JSON: double quotes,
// no trailing commas, no comments inside.
export const DATA_FILE_CASES: { file: 'index' | 'switchRun'; name: string }[] = [
  { "file": "index", "name": "index.json" },
  { "file": "switchRun", "name": "switch.json" }
]
