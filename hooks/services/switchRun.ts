import type { EngineInterface } from 'claude-code'

import { asString, isRecord } from '../platform/json'
import { readDataFile } from './dataFiles'

// How a switch handed to a run outside Claude goes, as that run says it in
// switch.json, its shape documented in scripts/Private/SwitchRun.ps1: "starting"
// as it is handed off, "running" once it runs, then "failed" with why, or
// "done". Both sides are tested against tests/fixtures/switch-run-sample.ts.

/** The file the run handed off writes in the data folder; the script's Get-SwitchRunPath. */
export const SWITCH_RUN_FILE = 'switch.json'

/** The version of switch.json's shape this mod reads; the script's SwitchRunVersion. */
export const SWITCH_RUN_VERSION = 1

const STATES = ['starting', 'running', 'failed', 'done'] as const

export type SwitchRunState = (typeof STATES)[number]

export type SwitchRun = { id: string; command: string; state: SwitchRunState; message: string | null }

function isState(value: unknown): value is SwitchRunState {
  return STATES.some(state => state === value)
}

/** switch.json's content read, or null when it has another version's shape. */
export function asSwitchRun(value: unknown): SwitchRun | null {
  if (!isRecord(value) || value.version !== SWITCH_RUN_VERSION || !isState(value.state)) {
    return null
  }
  const [id, command] = [asString(value.id), asString(value.command)]

  return id && command ? { id, command, state: value.state, message: asString(value.message) } : null
}

/** The last run handed off, or null when there is none or it can't be read. */
export function readSwitchRun($: EngineInterface) {
  return readDataFile($, SWITCH_RUN_FILE, asSwitchRun)
}
