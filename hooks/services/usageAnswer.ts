import type { Limit } from '../../types'
import { SPEND_KIND, WINDOW_KINDS, nextMonthStart, roundPercent } from '../domain/limits'
import { asCurrency, asNumber, isRecord } from '../platform/json'
import type { Fields } from '../platform/json'

// The usage endpoint's answer (services/api.ts fetches it), read without trust.
// Read as Claude Code's own /usage reads it: the 5-hour and weekly windows of a
// Pro or Max plan; a credit window some plans have instead (`cinder_cove`, and
// `wattle_ember`, which names itself and counts dollars); and `extra_usage`, the
// money spent past the plan this month (a Team or Enterprise seat's spend), in
// minor units of its currency, shown once a spent figure comes and only while
// it is turned on: a plan with it off still carries its cap and a zero spent.
// A plan reads as its windows or, having none, as its spend: never both.

/** The windows a usage answer carries, in the order Claude Code lists them; with none, its spend. */
export function usageLimits(body: Fields, now: number, timeZone: string): Limit[] {
  const limits: Limit[] = WINDOW_KINDS.flatMap(kind => {
    const window = body[kind]
    const percent = isRecord(window) ? asNumber(window.utilization) : null
    if (!isRecord(window) || percent === null) {
      return []
    }
    const limit: Limit = { kind, percentUsed: roundPercent(percent) }
    if (typeof window.resets_at === 'string') {
      limit.resetsAt = window.resets_at
    }
    if (typeof window.label === 'string' && window.label.trim()) {
      limit.label = window.label.trim()
    }
    const [used, cap] = [asNumber(window.used_dollars), asNumber(window.limit_dollars)]
    if (used !== null) {
      limit.spend = { used: Math.round(used * 100), limit: cap === null ? null : Math.round(cap * 100), currency: 'USD' }
    }

    return [limit]
  })
  if (limits.length) {
    return limits
  }

  const extra = body[SPEND_KIND]
  const used = isRecord(extra) && extra.is_enabled === true ? asNumber(extra.used_credits) : null
  if (isRecord(extra) && used !== null) {
    const cap = asNumber(extra.monthly_limit)
    const percent = asNumber(extra.utilization) ?? (cap === null ? 0 : cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : 100)
    const currency = asCurrency(extra.currency) ?? 'USD'
    limits.push({
      kind: SPEND_KIND,
      percentUsed: roundPercent(percent),
      resetsAt: nextMonthStart(now, timeZone),
      spend: { used, limit: cap, currency },
    })
  }

  return limits
}
