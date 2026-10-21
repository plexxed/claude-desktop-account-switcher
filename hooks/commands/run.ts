import type { EngineInterface } from 'claude-code'

import type { ProfileCommand } from '../../types'
import { bestEffort } from '../platform/log'
import { MODE_IDLE, PANEL_IDLE, isBusyAt, updateBusy, updateMode, updatePanel } from '../platform/state'
import { SCRIPT_TIMEOUT_MS, runSwitcher } from '../services/switcher'
import type { Failure, RunText, SwitcherResult } from '../services/switcher'
import { readSwitchRun } from '../services/switchRun'
import { pruneToProfiles } from '../services/upkeep'
import { isOperand, profileSpec } from './registry'
import type { OperandKind } from './registry'

// Running a command the person gave, from the band or the Accounts list: one
// at a time, the band and the list saying so meanwhile.
//
// A switch is handed to a run outside Claude (isDetached), which closes Claude:
// the command counts as running until then. The mod gives that run its id, and
// the run says how it goes under it in switch.json (services/switchRun.ts),
// read meanwhile: should it fail, or never start, the band and the list offer
// their commands again at once, and the person hears why. Every wait has a
// deadline kept with it (Busy.until), so a wait whose module was reloaded
// meanwhile ends too.

/** The longest a switch handed off counts as running while Claude stays. */
export const DETACHED_BUSY_MS = 2 * 60_000
/** How long a run handed off has to say it runs. */
export const DETACHED_START_MS = 15_000
/** How often switch.json is read while a run handed off goes on. */
export const DETACHED_WATCH_MS = 1_000
// A command run here ends within the script's timeout: past it, the wait is over.
const RUN_BUSY_MS = SCRIPT_TIMEOUT_MS + 5_000

/**
 * How a command went: `done`, with what the script wrote; `running`, another
 * command was, so nothing ran; `refused`, a word of it can't be what its place
 * takes (`expects`), so nothing ran; `failed`, the script said why.
 */
export type CommandOutcome =
  | ({ kind: 'done' } & RunText)
  | { kind: 'running' }
  | { kind: 'refused'; operand: string; expects: OperandKind }
  | { kind: 'failed'; failure: Failure }

/**
 * How a run handed off ended, as far as this session saw: it failed and said
 * why; it never said it runs; it was done and Claude stayed; or it said nothing
 * more within DETACHED_BUSY_MS.
 */
export type HandOffEnd = { kind: 'failed'; message: string | null } | { kind: 'notStarted' } | { kind: 'done' } | { kind: 'timedOut' }

/** Ends the wait of run `id`; a wait another run holds meanwhile stays. */
async function endBusy($: EngineInterface, id: string) {
  await updateBusy($, current => (current?.id === id ? null : current))
  $.ui.invalidate('ui.render')
}

/**
 * What switch.json says of run `id`, handed off at `handedAt`: its end, or null
 * while it goes on. A run that has not said it runs by DETACHED_START_MS (its
 * status still "starting", or none under its id at all) never started.
 */
async function handOffEnd($: EngineInterface, id: string, handedAt: number): Promise<HandOffEnd | null> {
  const [now, run] = await Promise.all([$.clock.now(), bestEffort($, 'reading switch.json', readSwitchRun($))])
  const ours = run?.id === id ? run : null
  if (ours?.state === 'failed') {
    return { kind: 'failed', message: ours.message }
  }
  if (ours?.state === 'done') {
    return { kind: 'done' }
  }
  if ((ours === null || ours.state === 'starting') && now - handedAt >= DETACHED_START_MS) {
    return { kind: 'notStarted' }
  }

  return now - handedAt >= DETACHED_BUSY_MS ? { kind: 'timedOut' } : null
}

/** Reads switch.json every DETACHED_WATCH_MS until run `id` ends, then ends the wait and tells `onEnd`. */
function watchHandOff($: EngineInterface, id: string, handedAt: number, onEnd: (end: HandOffEnd) => unknown) {
  $.clock.after(DETACHED_WATCH_MS, () => void bestEffort($, 'waiting for the switch', watchStep($, id, handedAt, onEnd)))
}

async function watchStep($: EngineInterface, id: string, handedAt: number, onEnd: (end: HandOffEnd) => unknown) {
  const end = await handOffEnd($, id, handedAt)
  if (end === null) {
    watchHandOff($, id, handedAt, onEnd)
    return
  }
  await endBusy($, id)
  onEnd(end)
}

/** The wait for run `id`, just handed off: as long as DETACHED_BUSY_MS at most, its status read meanwhile. */
async function awaitHandOff($: EngineInterface, id: string, onEnd: (end: HandOffEnd) => unknown) {
  const handedAt = await $.clock.now()
  const until = handedAt + DETACHED_BUSY_MS + DETACHED_WATCH_MS
  await updateBusy($, current => (current?.id === id ? { ...current, until } : current))
  watchHandOff($, id, handedAt, onEnd)
}

/** The first of `operands` that can't be what its place in `command` takes; null when each can. */
function refusal(command: ProfileCommand, operands: readonly string[]): Extract<CommandOutcome, { kind: 'refused' }> | null {
  const kinds = profileSpec(command).operands
  const at = operands.findIndex((word, i) => !isOperand(kinds[i] ?? 'name', word))

  return at === -1 ? null : { kind: 'refused', operand: operands[at]!, expects: kinds[at] ?? 'name' }
}

function outcomeOf(result: SwitcherResult): CommandOutcome {
  if (!result.isOk) {
    const { isOk: _isOk, ...failure } = result

    return { kind: 'failed', failure }
  }

  return { kind: 'done', said: result.said }
}

/**
 * Runs `command` on `operands`, each checked first, the band and the list back
 * to idle (a list unfolded in the band stays open across its own renames and
 * deletes), and keeps what the mod holds in step once it succeeded: a deleted
 * profile's account takes its last limits along. Only one command runs at a
 * time: the run that took the wait (Busy, under its own id) runs, any other
 * reads `running`. A command handed off goes on after it resolves:
 * `onHandOffEnd` hears how it ended, should Claude stay open that long.
 */
export async function runProfileCommand(
  $: EngineInterface,
  command: ProfileCommand,
  operands: readonly string[],
  onHandOffEnd: (end: HandOffEnd) => unknown = () => undefined,
): Promise<CommandOutcome> {
  const refused = refusal(command, operands)
  if (refused) {
    return refused
  }
  const [startedAt, id] = [await $.clock.now(), crypto.randomUUID()]
  // The updater may run again when another write came between (update tries
  // again on a miss), so it decides nothing outside the value it returns.
  const held = await updateBusy($, current =>
    isBusyAt(current, startedAt) ? current : { id, command, profile: operands[0] ?? '', until: startedAt + RUN_BUSY_MS },
  )
  if (held?.id !== id) {
    return { kind: 'running' }
  }
  const isDetached = profileSpec(command).isDetached === true
  // Set once the script said it handed the run off.
  let isHandedOff = false
  try {
    await updateMode($, current => (current.kind === 'manage' ? current : MODE_IDLE))
    await updatePanel($, () => PANEL_IDLE)
    const result = await runSwitcher($, { command, operands, ...(isDetached ? { handOff: { runId: id } } : {}) })
    if (result.isOk && command === 'delete') {
      await bestEffort($, 'pruning old limits', pruneToProfiles($))
    }
    isHandedOff = isDetached && result.isOk

    return outcomeOf(result)
  } finally {
    if (isHandedOff) {
      // Should even this fail, the wait ends at its deadline.
      await bestEffort($, 'waiting for the switch', awaitHandOff($, id, onHandOffEnd))
    } else {
      await endBusy($, id)
    }
  }
}
