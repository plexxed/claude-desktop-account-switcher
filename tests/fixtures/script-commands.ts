// The commands switch.ps1 takes (Invoke-AccountSwitcher's -Command), which the
// mod's commands (hooks/commands/registry.ts) and its upkeep run.
// AccountSwitcher.Tests.ps1 reads the array below as JSON (the test kit loads no
// .json files), so keep it strict JSON: double quotes, no trailing commas, no
// comments inside.
export const SCRIPT_COMMANDS: string[] = [
  "list",
  "init",
  "start",
  "save",
  "switch",
  "add",
  "new",
  "rename",
  "delete",
  "share"
]
