import type { Limit, Spend } from '../../types'
import { limitLevel } from '../domain/levels'
import type { Level } from '../domain/levels'
import { isLimitKind, limitNow, resetTime } from '../domain/limits'
import type { LimitKind } from '../domain/limits'
import { dayNumber, wallClock } from '../domain/time'
import { LOCALE, t } from './strings'
import type { PlainKey } from './strings'

// How figures read: the kinds of limit by name, token counts, times, and a
// limits summary, in the words of strings.ts and the dates of LOCALE.

// --- The kinds of limit -----------------------------------------------------------
// Each kind's short label in the band and on a card, and its full name where
// the server gives none.

const KIND_WORDS: Record<LimitKind, { label: PlainKey; name: PlainKey }> = {
  five_hour: { label: 'limit.fiveHour.label', name: 'limit.fiveHour.name' },
  seven_day: { label: 'limit.sevenDay.label', name: 'limit.sevenDay.name' },
  cinder_cove: { label: 'limit.cinderCove.label', name: 'limit.cinderCove.name' },
  wattle_ember: { label: 'limit.wattleEmber.label', name: 'limit.wattleEmber.name' },
  extra_usage: { label: 'limit.extraUsage.label', name: 'limit.extraUsage.name' },
  spend_limit: { label: 'limit.spendLimit.label', name: 'limit.spendLimit.name' },
}

/** A limit's short label ("5h"): ours, else its kind. */
export function limitLabel(kind: string) {
  return isLimitKind(kind) ? t(KIND_WORDS[kind].label) : kind
}

/** A limit's full name ("5-hour limit"): the one the server gave it, else ours, else its kind. */
export function limitName(limit: Limit) {
  return limit.label ?? (isLimitKind(limit.kind) ? t(KIND_WORDS[limit.kind].name) : limit.kind)
}

// --- Numbers and times -------------------------------------------------------------

// Times are read in the time zone they are shown in (platform/timezone.ts), with
// the offset it has on their own date. What is said in words (a month, a
// weekday) is in the words' language, LOCALE; what is set in digits (a time of
// day, a count) follows the system's regional format, REGION, as the system's
// own clock does: "15:42" or "3:42 PM".
const REGION = Intl.DateTimeFormat().resolvedOptions().locale
const dateIn = (timeZone: string, ms: number) => new Intl.DateTimeFormat(LOCALE, { month: 'short', day: 'numeric', timeZone }).format(ms)
const weekdayIn = (timeZone: string, ms: number) => new Intl.DateTimeFormat(LOCALE, { weekday: 'short', timeZone }).format(ms)

/** The time of day `ms` reads in `timeZone`, as the system's regional format sets it: "15:42", "3:42 PM". */
export function clockTime(ms: number, timeZone: string) {
  return new Intl.DateTimeFormat(REGION, { timeStyle: 'short', timeZone }).format(ms)
}

/** `n` in the system's digits, to at most `fractionDigits` decimals: "1.5", "1,5". */
function decimal(n: number, fractionDigits: number) {
  return new Intl.NumberFormat(REGION, { maximumFractionDigits: fractionDigits }).format(n)
}

/**
 * An amount in minor units of `currency` (cents for USD): "$12.40"; a whole
 * amount without its fraction ("$100"), as Claude Code shows a cap. `currency`
 * is an ISO 4217 code (Spend), which Intl formats whether or not it knows it.
 */
export function money(minor: number, currency: string) {
  const digits = new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  const amount = minor / 10 ** digits
  const isWhole = Number.isInteger(amount)

  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: isWhole ? 0 : digits,
    maximumFractionDigits: isWhole ? 0 : digits,
  }).format(amount)
}

/** "$12.40 of $100", or "$12.40 spent" where there is no cap. */
export function spendText(spend: Spend) {
  const used = money(spend.used, spend.currency)

  return spend.limit === null ? t('spend.uncapped', { used }) : t('spend.capped', { used, limit: money(spend.limit, spend.currency) })
}

/** The date `resetsAt` falls on in `timeZone`: "Nov 1". */
export function resetDate(resetsAt: string | undefined, timeZone: string) {
  const at = resetTime({ resetsAt })

  return at === null ? null : dateIn(timeZone, at)
}

/** "380k", "1M", "1.5M", "950". */
export function tokens(count: number) {
  // From the count that would round to "1000k" on.
  if (count >= 999_500) {
    return t('tokens.millions', { n: decimal(count / 1_000_000, 1) })
  }

  return count >= 1000 ? t('tokens.thousands', { n: decimal(Math.round(count / 1000), 0) }) : decimal(count, 0)
}

/** `minutes` as the band reads a span: "8m", "1h 42m", "3d 4h"; under a day in hours and minutes. */
export function duration(minutes: number) {
  if (minutes < 60) {
    return t('duration.minutes', { m: minutes })
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return minutes % 60 ? t('duration.hoursMinutes', { h: hours, m: minutes % 60 }) : t('duration.hours', { h: hours })
  }
  const days = Math.floor(hours / 24)

  return hours % 24 ? t('duration.daysHours', { d: days, h: hours % 24 }) : t('duration.days', { d: days })
}

/**
 * The time left until `resetsAt`, as `duration` reads it; null once it has
 * passed. A minute begun counts whole, as the app's own usage panel counts:
 * "8m" until 7:00 are left. Windows reset on a whole minute, so the figure
 * turns at :00.
 */
export function untilReset(resetsAt: string | undefined, now: number) {
  const at = resetTime({ resetsAt })

  return at === null || at <= now ? null : duration(Math.ceil((at - now) / 60_000))
}

/** When `resetsAt` comes, by the clock in `timeZone`: "15:42" today, "tomorrow 09:00", else "Thu 09:00" (in the regional format). */
export function resetClock(resetsAt: string | undefined, now: number, timeZone: string) {
  const at = resetTime({ resetsAt })
  if (at === null) {
    return null
  }
  const time = clockTime(at, timeZone)
  const days = dayNumber(wallClock(at, timeZone)) - dayNumber(wallClock(now, timeZone))
  if (days <= 0) {
    return time
  }

  return days === 1 ? t('clock.tomorrow', { time }) : t('clock.weekday', { day: weekdayIn(timeZone, at), time })
}

/** "just now", "5m ago", "3h ago", "2d ago". */
export function ago(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 2) {
    return t('ago.now')
  }
  if (minutes < 60) {
    return t('ago.minutes', { n: minutes })
  }
  const hours = Math.floor(minutes / 60)

  return hours < 24 ? t('ago.hours', { n: hours }) : t('ago.days', { n: Math.floor(hours / 24) })
}

/**
 * How a limit reads at `now`, the same in the band and in the Accounts list:
 * `label` ("5h"), `name` ("5-hour limit"), `percent` used, rounded (null for
 * spend with no cap, which has no bar), `tone`, `value` (the percentage, or an
 * uncapped spend's amount), `spend` ("$12.40 of $100") and `countdown` ("3h 4m").
 */
export type LimitView = {
  label: string
  name: string
  percent: number | null
  tone: Level
  value: string
  spend: string | null
  countdown: string | null
}

export function limitView(limit: Limit, now: number): LimitView {
  const { percentUsed, spend } = limitNow(limit, now)
  const isUncapped = spend !== undefined && spend.limit === null
  const percent = Math.round(percentUsed)

  return {
    label: limitLabel(limit.kind),
    name: limitName(limit),
    percent: isUncapped ? null : percent,
    tone: limitLevel(limit.kind, percent),
    value: isUncapped ? money(spend.used, spend.currency) : t('limit.percent', { percent }),
    spend: spend ? spendText(spend) : null,
    countdown: untilReset(limit.resetsAt, now),
  }
}

/**
 * "5h 0% · 7d 45% ↻3d 4h", "↻" leading the time left until the window resets; a
 * window whose reset has passed reads 0% and has nothing to wait for.
 */
export function limitsSummary(limits: Limit[], now: number) {
  return limits
    .map(limit => {
      const { label, value, countdown } = limitView(limit, now)

      return countdown ? t('limit.summaryResets', { label, value, countdown }) : t('limit.summary', { label, value })
    })
    .join(t('list.separator'))
}
