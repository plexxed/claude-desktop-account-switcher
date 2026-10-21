import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Busy, Meter, Mode, Panel } from '../../types'

// The values the band and the Accounts list draw from (declared in
// types/index.d.ts), and the one place they are read and written: the mod's
// validator follows a value only through the file that names it. A read while
// drawing redraws the drawing when the value changes.

export const MODE_IDLE: Mode = { kind: 'idle' }
export const PANEL_IDLE: Panel = { kind: 'idle' }

// The shape tags of busy and the meter: bumped when Busy or Meter changes, so a
// value an older load kept reads as absent rather than as one it is not.
const BUSY_SHAPE = 'busy@1'
const METER_SHAPE = 'meter@1'

// The mod's id (platform/plugin.ts' PLUGIN_ID), spelled out: the validator reads
// an atom's plugin only as a string literal.
const mode = atom({ plugin: 'account-switcher', key: 'mode' } as const, MODE_IDLE)
const panel = atom({ plugin: 'account-switcher', key: 'panel' } as const, PANEL_IDLE)
const busy = atom({ plugin: 'account-switcher', key: 'busy' } as const, null as Busy | null, { shape: BUSY_SHAPE })
const meter = atom({ plugin: 'account-switcher', key: 'meter' } as const, null as Meter | null, { shape: METER_SHAPE })

/** What the band is doing. */
export function readMode($: EngineInterface) {
  return read($, mode)
}

export function updateMode($: EngineInterface, next: (current: Mode) => Mode) {
  return update($, mode, next)
}

/** What the Accounts list is doing. */
export function readPanel($: EngineInterface) {
  return read($, panel)
}

export function updatePanel($: EngineInterface, next: (current: Panel) => Panel) {
  return update($, panel, next)
}

/** The command the person gave that is running, if one is: none past its deadline. */
export async function readBusy($: EngineInterface) {
  const [value, now] = await Promise.all([read($, busy), $.clock.now()])

  return isBusyAt(value, now) ? value : null
}

/** `next` gets the value as kept, a command past its deadline too: see isBusyAt. */
export function updateBusy($: EngineInterface, next: (current: Busy | null) => Busy | null) {
  return update($, busy, next)
}

/** Whether `value` is a command still running at `now`. */
export function isBusyAt(value: Busy | null, now: number): value is Busy {
  return value !== null && now < value.until
}

/** The last figures measured: context fill and the plan's limits; null before the first. */
export function readMeter($: EngineInterface) {
  return read($, meter)
}

/** Resolves the meter as `next` left it. */
export function updateMeter($: EngineInterface, next: (current: Meter | null) => Meter | null) {
  return update($, meter, next)
}
