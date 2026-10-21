import type { EngineInterface } from 'claude-code'

import { dataDir } from '../platform/paths'
import { NOT_RUN, runScript } from '../platform/script'
import type { ScriptResult } from '../platform/script'

// The switcher script (scripts/switch.ps1, its logic in the AccountSwitcher
// module beside it) as the mod calls it: a command, its operands and options,
// and how it went. The one place that knows the script's command line and reads
// its exit codes, so the layers above deal in outcomes, not in processes: a
// switcher of another kind (another platform's) changes this file alone. The
// script owns the data folder and documents its layout; the mod reads what it
// keeps there for it (index.json, services/readModel.ts; switch.json,
// services/switchRun.ts).

const SCRIPT = 'scripts/switch.ps1'

/** The longest a run of the script is waited for. */
export const SCRIPT_TIMEOUT_MS = 60_000

/**
 * How a run of the script ended, as switch.ps1 documents its exit codes (both
 * sides are tested against tests/fixtures/exit-codes.ts), and `NotRun` when it
 * could not be started or did not end in time.
 */
export const ScriptExit = {
  Ok: 0,
  Failed: 1,
  Invalid: 2,
  NotFound: 3,
  Exists: 4,
  Busy: 5,
  NotNow: 6,
  NotRun: NOT_RUN,
} as const

/** A run handed to a process of its own: the id it says how it goes under, in switch.json. */
export type HandOff = { runId: string }

/** The commands switch.ps1 takes (Invoke-AccountSwitcher's -Command); tested against tests/fixtures/script-commands.ts. */
export const SCRIPT_COMMANDS = ['list', 'init', 'start', 'save', 'switch', 'add', 'new', 'rename', 'delete', 'share'] as const

export type ScriptCommand = (typeof SCRIPT_COMMANDS)[number]

/** What `start` is told of the session: the account it runs for, that account's own name, its organization and email. */
export type StartOptions = { Account?: string; DisplayName?: string; Organization?: string; Email?: string }

/**
 * A run of the switcher: `operands`, the words after the command (a profile's
 * name, on|off); `options`, named values, each only when given; `handOff`, a
 * command handed to a process of its own, outside Claude's process tree, as
 * anything that closes Claude must, under the run id given.
 */
export type SwitcherCall = { command: ScriptCommand; operands?: readonly string[]; options?: StartOptions; handOff?: HandOff }

/**
 * Why a run failed, by its exit code as switch.ps1 documents them: a value not
 * valid, something not there, something there already, another switch running,
 * not now (the profile is signed in now); anything else; or `notRun`, it could
 * not start or did not end in time.
 */
export type FailureReason = 'failed' | 'invalid' | 'notFound' | 'exists' | 'busy' | 'notNow' | 'notRun'

const REASONS: Readonly<Record<number, FailureReason>> = {
  [ScriptExit.Invalid]: 'invalid',
  [ScriptExit.NotFound]: 'notFound',
  [ScriptExit.Exists]: 'exists',
  [ScriptExit.Busy]: 'busy',
  [ScriptExit.NotNow]: 'notNow',
  [ScriptExit.NotRun]: 'notRun',
}

/** What a run wrote: `said`, of how it ended (its errors, else its output). */
export type RunText = { said: string }

/** A run that failed: why, its exit code, and what it wrote. */
export type Failure = RunText & { reason: FailureReason; code: number }

export type SwitcherResult = ({ isOk: true } & RunText) | ({ isOk: false } & Failure)

/**
 * A word PowerShell would bind as a parameter of the script (switch.ps1 -Detach),
 * not take as an operand: Windows PowerShell's -File knows no "--" to stop it.
 */
function isParameterLike(word: string) {
  return word.startsWith('-')
}

function textOf(result: ScriptResult): RunText {
  const [stdout, stderr] = [result.stdout.trim(), result.stderr.trim()]

  return { said: stderr || stdout }
}

/**
 * Runs the switcher on `call`, on the mod's data folder. Never rejects. An
 * operand PowerShell would read as a parameter never reaches it: such a call
 * fails as `invalid` unrun (the commands check every word the person gives
 * before, and say why).
 */
export async function runSwitcher($: EngineInterface, call: SwitcherCall): Promise<SwitcherResult> {
  const operands = call.operands ?? []
  if (operands.some(isParameterLike)) {
    return { isOk: false, reason: 'invalid', code: ScriptExit.Invalid, said: '' }
  }
  const dir = await dataDir($)
  const options = Object.entries(call.options ?? {}).flatMap(([name, value]) => (value ? [`-${name}`, value] : []))
  const args = [
    ...(dir ? ['-DataDir', dir] : []),
    call.command,
    ...operands,
    ...options,
    ...(call.handOff ? ['-Detach', '-RunId', call.handOff.runId] : []),
  ]
  const result = await runScript($, SCRIPT, args, SCRIPT_TIMEOUT_MS)
  const text = textOf(result)
  if (result.exitCode === ScriptExit.Ok) {
    return { isOk: true, ...text }
  }

  return { isOk: false, reason: REASONS[result.exitCode] ?? 'failed', code: result.exitCode, ...text }
}
