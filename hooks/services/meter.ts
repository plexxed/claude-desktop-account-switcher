import type { EngineInterface, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Limit, Meter } from '../../types'
import { contextThresholds } from '../domain/context'
import { mergeLimits } from '../domain/limits'
import { bestEffort } from '../platform/log'
import { signedInAccount } from '../platform/env'
import { readMeter, updateMeter } from '../platform/state'
import { readSnapshot, rememberLimits } from './snapshots'

// The meter the band draws: the context figure and where it turns yellow and
// red, and the plan's limits, merged from a reply's headers and the poll. Every
// change is made inside the meter's updater, from the value it holds then, so
// a reply and a poll landing together never undo each other.

/** The engine's rate-limit windows as the band keeps them. */
function toLimits(limits: SessionRateLimit[]): Limit[] {
  return limits.map(({ kind, percentUsed, resetsAt }) => ({ kind, percentUsed, resetsAt }))
}

export function toMeter(context: SessionContextUsage, limits: SessionRateLimit[]): Meter {
  return {
    contextPercent: context.percent ?? null,
    contextTokens: context.tokens ?? null,
    contextWindow: context.window,
    contextAt: contextThresholds(context),
    limits: toLimits(limits),
  }
}

/** The status line's figures, which stand in before the first measurement this session: its limits when `withLimits`. */
async function statusMeter($: EngineInterface, withLimits: boolean) {
  const { context, rateLimits } = await $.session.usage()

  return toMeter(context, withLimits ? rateLimits : [])
}

/**
 * The meter, or the status line's figures until the first measurement this
 * session; while neither has limits (a session just started, its first poll
 * failed), the signed-in account's last known ones, which the band ages by
 * their reset times.
 */
export async function meterOrStatus($: EngineInterface): Promise<Meter> {
  const meter = (await readMeter($)) ?? (await statusMeter($, true))
  if (meter.limits.length) {
    return meter
  }
  const snapshot = await readSnapshot($, await signedInAccount($))

  return snapshot?.limits.length ? { ...meter, limits: snapshot.limits } : meter
}

/**
 * Where limits come from: `answered`, the kinds the source lists whenever they
 * exist (see mergeLimits; a reply's headers answer for none); `measuredAt`,
 * when the source measured them, now when not given.
 */
export type LimitsSource = { answered?: readonly string[]; measuredAt?: number }

/**
 * Merges a source's limits into the meter and remembers the result for the
 * signed-in account. The same figures again change nothing, so nothing redraws.
 */
export async function applyLimits($: EngineInterface, limits: Limit[], { answered = [], measuredAt }: LimitsSource = {}) {
  const now = await $.clock.now()
  // Before the first measurement, the session's context with no limits yet.
  const known = (await readMeter($)) ?? (await statusMeter($, false))
  const merge = (meter: Meter) => mergeLimits(meter.limits, limits, now, answered)
  if (JSON.stringify(merge(known)) === JSON.stringify(known.limits)) {
    await rememberLimits($, known.limits, { measuredAt })
    return
  }
  const after = await updateMeter($, current => {
    const meter = current ?? known

    return { ...meter, limits: merge(meter) }
  })
  await rememberLimits($, after?.limits ?? [], { measuredAt })
}

/**
 * What a reply measured: its context, counted again with its breakdown (no
 * requests) for the real auto-compaction threshold, replaces the meter's; its
 * limits merge with the meter's.
 */
export async function applyMeasure($: EngineInterface, context: SessionContextUsage, rateLimits: SessionRateLimit[]) {
  const detailed = await bestEffort($, 'context breakdown', $.session.usage({ breakdown: 'summary' }))
  const measured = toMeter(detailed?.context ?? context, [])
  await updateMeter($, current => ({ ...measured, limits: current?.limits ?? [] }))
  if (rateLimits.length) {
    await applyLimits($, toLimits(rateLimits))
  }
}
