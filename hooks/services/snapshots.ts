import type { EngineInterface } from 'claude-code'

import type { Limit } from '../../types'
import { signedInAccount } from '../platform/env'
import { asNumber, isRecord } from '../platform/json'
import { snapshotKey } from './storeKeys'
import { asLimits } from './storedLimits'

// The last known limits of each account. Only the signed-in account can be
// asked, so each account's latest figures are kept across sessions in the mod's
// store, by account (a rename moves nothing), and shown for the other profiles,
// aged by the reset times they carry.

export type Snapshot = { limits: Limit[]; at: number }

export async function readSnapshot($: EngineInterface, account: string | null): Promise<Snapshot | null> {
  if (!account) {
    return null
  }
  const value = await $.store.get(snapshotKey(account))
  const limits = isRecord(value) ? asLimits(value.limits) : null
  const at = isRecord(value) ? asNumber(value.at) : null

  return limits && at !== null ? { limits, at } : null
}

/**
 * `isAnswer`: the server said the plan has no window, which is kept too (an
 * empty snapshot), so the list can say so. `measuredAt`: when the figures were
 * measured, now when not given (a poll another session made, say, is as old as
 * its fetch).
 */
export type Remembered = { isAnswer?: boolean; measuredAt?: number }

/**
 * Keeps the signed-in account's figures, seen as of when they were measured: a
 * snapshot never reads older than the one it replaces, whose newer figures are
 * merged into these.
 */
export async function rememberLimits($: EngineInterface, limits: Limit[], { isAnswer = false, measuredAt }: Remembered = {}) {
  const account = await signedInAccount($)
  if (!account || (!limits.length && !isAnswer)) {
    return
  }
  const [now, last] = await Promise.all([$.clock.now(), readSnapshot($, account)])
  await $.store.set(snapshotKey(account), { limits, at: Math.max(measuredAt ?? now, last?.at ?? 0) })
}
