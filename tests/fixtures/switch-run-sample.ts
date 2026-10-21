// switch.json, how a run outside Claude goes, for the mod that handed it a
// switch: the script must write exactly this (Write-SwitchRunStatus), and the
// mod reads it as this run's status (services/switchRun.ts).
// AccountSwitcher.Tests.ps1 reads the array below as JSON (the test kit loads no
// .json files), so keep it strict JSON: double quotes, no trailing commas, no
// comments inside.
export const SWITCH_RUN_SAMPLES: {
  version: number
  id: string
  command: string
  state: 'starting' | 'running' | 'failed' | 'done'
  message: string | null
}[] = [
  {
    "version": 1,
    "id": "5b0c7a52-3f1e-4c3a-9d55-0e6f7a1b2c3d",
    "command": "switch",
    "state": "running",
    "message": null
  },
  {
    "version": 1,
    "id": "9e8d7c6b-5a49-4382-8170-6f5e4d3c2b1a",
    "command": "new",
    "state": "failed",
    "message": "Claude did not exit within 20 seconds; nothing was changed."
  }
]
