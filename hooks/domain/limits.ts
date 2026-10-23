import type { Limit } from '../../types'
import { localMidnight, wallClock } from './time'

// The plan's limits: the kinds the mod knows and what it knows of each, and how
// the figures of two sources merge into one. Pure: no engine, no state, no words
// (ui/format.ts names each kind).

// --- The kinds --------------------------------------------------------------------
// One entry per kind: the most time its countdown reads, in minutes, for the
// room the band keeps for it; where it comes from: a window of the usage answer
// (in the order Claude Code lists them), its monthly spend, or a reply's headers
// alone (a gateway's spend limit); and where its figure needs attention. A kind
// the engine or the usage answer brings that is not here is shown by its kind
// alone, and needs attention where the 5-hour window does.

/**
 * Where a figure turns yellow and red, in percent used; `warnAt` null where it
 * never turns yellow.
 */
export type LimitLevels = { warnAt: number | null; errorAt: number }

type KindInfo = { longestCountdown: number; source: 'window' | 'spend' | 'reply'; levels: LimitLevels }

const DAY_LEFT = 23 * 60 + 59

// The mod's early warning: yellow from 70% used, red from 90%.
const EARLY: LimitLevels = { warnAt: 70, errorAt: 90 }
// The weekly window lasts longer, so it warns later: yellow from 75%, red from 90%.
const WEEKLY: LimitLevels = { warnAt: 75, errorAt: 90 }

export const LIMIT_KINDS = {
  five_hour: { longestCountdown: 4 * 60 + 59, source: 'window', levels: EARLY },
  seven_day: { longestCountdown: DAY_LEFT, source: 'window', levels: WEEKLY },
  cinder_cove: { longestCountdown: DAY_LEFT, source: 'window', levels: EARLY },
  wattle_ember: { longestCountdown: DAY_LEFT, source: 'window', levels: EARLY },
  extra_usage: { longestCountdown: (30 * 24 + 23) * 60, source: 'spend', levels: EARLY },
  spend_limit: { longestCountdown: DAY_LEFT, source: 'reply', levels: EARLY },
} as const satisfies Record<string, KindInfo>

export type LimitKind = keyof typeof LIMIT_KINDS

export function isLimitKind(kind: string): kind is LimitKind {
  return Object.hasOwn(LIMIT_KINDS, kind)
}

/** The 5-hour window: the one that decides whether to switch now. */
export const FIVE_HOUR: LimitKind = 'five_hour'

/** The weekly window: while it is used up, the 5-hour one does not matter. */
export const SEVEN_DAY: LimitKind = 'seven_day'

/** The money spent past the plan this month. */
export const SPEND_KIND: LimitKind = 'extra_usage'

/** The windows a usage answer carries, in the order Claude Code lists them. */
export const WINDOW_KINDS = (Object.keys(LIMIT_KINDS) as LimitKind[]).filter(kind => LIMIT_KINDS[kind].source === 'window')

/** Every kind a usage answer can carry: one it no longer lists is gone (spend turned off, say). */
export const POLLED_KINDS: readonly string[] = [...WINDOW_KINDS, SPEND_KIND]

/** The most time left a kind's countdown reads, in minutes: 4h 59m for the 5-hour window. */
export function longestCountdownMinutes(kind: string) {
  return isLimitKind(kind) ? LIMIT_KINDS[kind].longestCountdown : DAY_LEFT
}

/** Where a kind's figure turns yellow and red. */
export function limitLevels(kind: string): LimitLevels {
  return isLimitKind(kind) ? LIMIT_KINDS[kind].levels : EARLY
}

// --- A limit in time ----------------------------------------------------------------

/** A percentage to one decimal, as the band keeps it. */
export function roundPercent(percent: number) {
  return Math.round(percent * 10) / 10
}

/**
 * When `limit` resets, in milliseconds since the epoch; null when it does not say.
 * Windows reset on a whole minute, which the usage answer gives a fraction of a
 * second early ("12:59:59.516"): the nearest minute, as Claude shows it.
 */
export function resetTime(limit: Pick<Limit, 'resetsAt'>) {
  const at = limit.resetsAt === undefined ? NaN : Date.parse(limit.resetsAt)

  return Number.isFinite(at) ? Math.round(at / 60_000) * 60_000 : null
}

/** Midnight starting the next month in `timeZone`, as an ISO timestamp: when monthly spend starts over. */
export function nextMonthStart(now: number, timeZone: string) {
  const { year, month } = wallClock(now, timeZone)

  return new Date(localMidnight(year, month + 1, 1, timeZone)).toISOString()
}

/**
 * `limit` as it stands at `now`: a window whose reset has passed has started
 * over, at 0% and nothing spent, until fresh figures say more.
 */
export function limitNow(limit: Limit, now: number): Limit {
  const at = resetTime(limit)
  if (at === null || at > now) {
    return limit
  }

  return { ...limit, percentUsed: 0, ...(limit.spend && { spend: { ...limit.spend, used: 0 } }) }
}

/** Whether `limit` is used up at `now`: 100% or more, in a window not yet reset. */
export function isUsedUp(limit: Limit, now: number) {
  return limitNow(limit, now).percentUsed >= 100
}

// --- Two sources, one figure ------------------------------------------------------------
// The poll (the endpoint the app's own usage panel reads, services/poll.ts) and
// a reply's headers are equals, and both lag: a reply's figure is the account's
// when that request left, a poll's when it was fetched. Usage only grows within
// a window, so of two figures for the same window the larger is the later truth.
// A window is known by its reset time; a later reset is a new window, whose
// figure wins however small, and an earlier one is stale.

// Reset times within this of each other name the same window (a poll's carries
// milliseconds, a header's whole seconds).
const SAME_WINDOW_MS = 60_000

export function mergeLimit(known: Limit | undefined, incoming: Limit, now: number): Limit {
  const knownAt = known ? resetTime(known) : null
  // A window whose reset has passed is over: what comes now is the next one's,
  // even when it carries no reset time yet (a window not started).
  if (!known || (knownAt !== null && knownAt <= now)) {
    return incoming
  }
  const incomingAt = resetTime(incoming)
  if (knownAt === null || incomingAt === null || Math.abs(knownAt - incomingAt) < SAME_WINDOW_MS) {
    return {
      ...incoming,
      percentUsed: Math.max(known.percentUsed, incoming.percentUsed),
      resetsAt: incoming.resetsAt ?? known.resetsAt,
    }
  }

  return incomingAt > knownAt ? incoming : known
}

/**
 * `known` with `incoming` merged in, window by window; a window only one of them
 * has is kept, unless `incoming` answers for its kind (`answered`: the kinds a
 * usage answer lists whenever they exist) and no longer lists it.
 */
export function mergeLimits(known: Limit[], incoming: Limit[], now: number, answered: readonly string[] = []): Limit[] {
  const merged = known.flatMap(limit => {
    const other = incoming.find(one => one.kind === limit.kind)

    return other ? [mergeLimit(limit, other, now)] : answered.includes(limit.kind) ? [] : [limit]
  })

  return [...merged, ...incoming.filter(one => !known.some(limit => limit.kind === one.kind))]
}
