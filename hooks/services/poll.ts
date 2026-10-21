import type { EngineInterface, Timer } from 'claude-code'

import type { Limit } from '../../types'
import { POLLED_KINDS } from '../domain/limits'
import { signedInAccount } from '../platform/env'
import { asNumber, asString, isRecord } from '../platform/json'
import { bestEffort, logFailure } from '../platform/log'
import { fetchLimits } from './api'
import { applyLimits } from './meter'
import { rememberLimits } from './snapshots'
import { POLL_KEY } from './storeKeys'
import { asLimits } from './storedLimits'

// One poll for every session. The usage endpoint answers 429 when asked too
// often, and every open session runs this mod. So the sessions share one poll
// through the mod's store, which every session on the machine reads: whichever
// is due first claims the next slot and fetches, the others read what it got.
// The store can't take a value only if it is unchanged, so a claim is read back
// before the fetch: of two sessions whose claims were both written before
// either read it back, the one written last fetches. That narrows the race, not
// closes it: a session that read the slot as due before another's claim landed
// claims and fetches too, so now and then two sessions ask in one slot. After a
// fetch that got no figures (a 429, a refusal, no network) all of them wait, as
// long as the server says, else longer each time, so a lasting failure is not
// asked again each minute by every session. Within a session the polls run one
// after another, so its timer and a turn's end never both claim the slot and fetch.
//
// A poll runs when a turn of Claude's ends, whose cost it then shows, and a
// minute after the last one while none ends; each session's timer is set to
// the shared slot's end.

const POLL_MS = 60_000
// How far past its slot's end a timer runs, so the slot has surely ended.
const POLL_TIMER_LAG_MS = 50
// A turn's end polls unless a poll was asked this recently (two sessions'
// turns ending together, say).
const TURN_POLL_GAP_MS = 5_000
const BACKOFF_MS = [2, 5, 10, 15].map(minutes => minutes * 60_000)
// A plan with no window and no spend has nothing for the timer to follow: it
// is asked this seldom, and still at a turn's end.
const NO_WINDOW_POLL_MS = 10 * 60_000

/** This load of the mod in this session, as it signs its claims. */
const CLAIMANT = crypto.randomUUID()

/**
 * `account`: whose limits; `at`: when `limits` were fetched; `askedAt`: when a
 * session last asked, and `claimant`, which; `nextAt`: no session's timer asks
 * before then (nor, after a failed fetch, a turn's end).
 */
export type PollState = {
  account: string | null
  at: number
  askedAt?: number
  claimant?: string
  limits: Limit[] | null
  nextAt: number
  failures: number
}

async function readPoll($: EngineInterface): Promise<PollState | null> {
  const value = await $.store.get(POLL_KEY)
  if (!isRecord(value)) {
    return null
  }
  const [at, nextAt, failures, askedAt] = [asNumber(value.at), asNumber(value.nextAt), asNumber(value.failures), asNumber(value.askedAt)]
  const limits = value.limits === null ? null : asLimits(value.limits)
  if (at === null || nextAt === null || (value.limits !== null && limits === null)) {
    return null
  }

  return {
    account: asString(value.account),
    at,
    ...(askedAt === null ? {} : { askedAt }),
    ...(typeof value.claimant === 'string' ? { claimant: value.claimant } : {}),
    limits,
    nextAt,
    failures: failures ?? 0,
  }
}

/**
 * Puts the account's latest limits on the meter, fetching them when the shared
 * slot has ended, or at a turn's end (`isTurnEnd`) unless the server asked to
 * wait or a poll was just asked; on any failure the band keeps what it had,
 * and every session waits before the next.
 * Resolves when the next poll is due.
 */
async function refreshLimits($: EngineInterface, isTurnEnd: boolean): Promise<number> {
  const now = await $.clock.now()
  try {
    const account = await signedInAccount($)
    const shared = await readPoll($)
    const poll = shared && shared.account === account ? shared : null
    const isBackingOff = Boolean(poll?.failures) && now < poll!.nextAt
    const isJustAsked = poll?.askedAt !== undefined && now - poll.askedAt < TURN_POLL_GAP_MS
    const isDue = !poll || now >= poll.nextAt || (isTurnEnd && !isBackingOff && !isJustAsked)
    if (poll && !isDue) {
      if (poll.limits) {
        await applyLimits($, poll.limits, { answered: POLLED_KINDS, measuredAt: poll.at })
      }
      return poll.nextAt
    }
    // Claim the slot before asking, so the other sessions don't ask too; a claim
    // another session wrote over is theirs to fetch.
    const failures = poll?.failures ?? 0
    const base: PollState = poll ?? { account, at: 0, limits: null, nextAt: 0, failures: 0 }
    const nextAt = now + POLL_MS
    await $.store.set(POLL_KEY, { ...base, askedAt: now, claimant: CLAIMANT, nextAt })
    if ((await readPoll($))?.claimant !== CLAIMANT) {
      return nextAt
    }
    const fetched = await bestEffort($, 'fetching the limits', fetchLimits($))
    const answered = { account, at: now, askedAt: now, claimant: CLAIMANT, failures: 0 }
    if (fetched?.limits?.length === 0) {
      const quietAt = now + NO_WINDOW_POLL_MS
      await $.store.set(POLL_KEY, { ...answered, limits: [], nextAt: quietAt })
      await applyLimits($, [], { answered: POLLED_KINDS })
      await rememberLimits($, [], { isAnswer: true })
      return quietAt
    }
    if (fetched?.limits) {
      await $.store.set(POLL_KEY, { ...answered, limits: fetched.limits, nextAt })
      await applyLimits($, fetched.limits, { answered: POLLED_KINDS })
      return nextAt
    }
    // No figures: the server's wait when it named one, else a longer one each time.
    const wait = fetched?.retryAfterMs ?? BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)]!
    const backoffAt = now + Math.max(wait, POLL_MS)
    await $.store.set(POLL_KEY, { ...base, askedAt: now, claimant: CLAIMANT, nextAt: backoffAt, failures: failures + 1 })
    return backoffAt
  } catch (error) {
    // The store failed: the next reply's figures still arrive.
    logFailure($, 'polling the limits', error)
    return now + POLL_MS
  }
}

// This session's polls, one after another: each waits for the one before it.
let polling: Promise<unknown> = Promise.resolve()

// This session's timer for its next poll: set to the shared slot's end after
// each poll, set anew when a turn's end polls first. One at a time: a timer set
// while another waits replaces it.
let pollTimer: Timer | null = null

export async function pollLimits($: EngineInterface, isTurnEnd = false) {
  const poll = polling.then(() => refreshLimits($, isTurnEnd))
  polling = poll.catch(() => undefined)
  try {
    // New figures redraw the band through the meter; none, nothing.
    const nextAt = await poll
    const now = await $.clock.now()
    pollTimer?.cancel()
    pollTimer = $.clock.after(Math.max(1_000, nextAt - now) + POLL_TIMER_LAG_MS, () => void pollLimits($))
  } catch (error) {
    // The session is ending, or this module was reloaded: its successor polls.
    logFailure($, 'scheduling the next poll', error)
  }
}
