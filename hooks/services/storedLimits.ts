import type { Limit, Spend } from '../../types'
import { asCurrency, asNumber, isRecord } from '../platform/json'

// Limits as the mod keeps them in its store (the shared poll, services/poll.ts;
// each account's last ones, services/snapshots.ts): read back without trust, a
// value of another shape (an older mod's, a broken one) dropped.

function asSpend(value: unknown): Spend | null {
  const currency = isRecord(value) ? asCurrency(value.currency) : null
  if (!isRecord(value) || currency === null) {
    return null
  }
  const used = asNumber(value.used)
  const limit = value.limit === null ? null : asNumber(value.limit)
  if (used === null || (value.limit !== null && limit === null)) {
    return null
  }

  return { used, limit, currency }
}

/** `value` when it is a limit as the mod keeps it (in its store, say). */
export function asLimit(value: unknown): Limit | null {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return null
  }
  const percentUsed = asNumber(value.percentUsed)
  const { resetsAt, label } = value
  const spend = value.spend === undefined ? undefined : asSpend(value.spend)
  const isLimit =
    percentUsed !== null &&
    (resetsAt === undefined || typeof resetsAt === 'string') &&
    (label === undefined || typeof label === 'string') &&
    spend !== null
  if (!isLimit) {
    return null
  }

  return {
    kind: value.kind,
    percentUsed,
    ...(resetsAt === undefined ? {} : { resetsAt }),
    ...(label === undefined ? {} : { label }),
    ...(spend === undefined ? {} : { spend }),
  }
}

/** The limits of `value` when it is a list of them. */
export function asLimits(value: unknown): Limit[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const limits = value.map(asLimit)

  return limits.every((one): one is Limit => one !== null) ? limits : null
}
