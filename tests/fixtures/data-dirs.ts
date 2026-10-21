// Where the switcher's data folder is, as both sides reckon it from the
// environment: the mod's dataDirOf, the script's Get-DefaultDataDir.
// AccountSwitcher.Tests.ps1 reads the array below as JSON (the test kit loads no
// .json files), so keep it strict JSON: double quotes, no trailing commas, no
// comments inside.
export const DATA_DIR_CASES: {
  case: string
  env: { USERPROFILE: string; CLAUDE_CONFIG_DIR?: string }
  dataDir: string
}[] = [
  {
    "case": "the default Claude configuration folder",
    "env": { "USERPROFILE": "C:\\Users\\me" },
    "dataDir": "C:\\Users\\me\\.claude\\plugins\\data\\account-switcher"
  },
  {
    "case": "a Claude configuration folder of the person's own",
    "env": { "USERPROFILE": "C:\\Users\\me", "CLAUDE_CONFIG_DIR": "C:\\claude-config" },
    "dataDir": "C:\\claude-config\\plugins\\data\\account-switcher"
  },
  {
    "case": "a Claude configuration folder given with a separator last",
    "env": { "USERPROFILE": "C:\\Users\\me", "CLAUDE_CONFIG_DIR": "C:\\claude-config\\" },
    "dataDir": "C:\\claude-config\\plugins\\data\\account-switcher"
  }
]
