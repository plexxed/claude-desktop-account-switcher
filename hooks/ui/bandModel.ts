import type { EngineInterface, RenderInput } from 'claude-code'

import type { Busy, Limit, Meter } from '../../types'
import { contextLevel } from '../domain/levels'
import type { Level } from '../domain/levels'
import { FIVE_HOUR, SEVEN_DAY, isUsedUp, longestCountdownMinutes, resetTime } from '../domain/limits'
import type { Profile } from '../domain/profiles'
import { boundedMap } from '../platform/boundedMap'
import { readBusy } from '../platform/state'
import { localTimeZone } from '../platform/timezone'
import { meterOrStatus } from '../services/meter'
import { readSnapshot } from '../services/snapshots'
import type { Snapshot } from '../services/snapshots'
import { siteOf } from './drawn'
import { duration, limitView, limitsSummary, resetClock, resetDate, tokens } from './format'
import type { LimitView } from './format'
import { MANAGE, UNNAMED } from './ids'
import type { FigureText, Layout } from './layout'
import { cutToEms, fitBand, textEms } from './layout'
import { t } from './strings'

// What the band shows, as plain data (band.tsx renders it): the switch's
// question, or the figures line with the account picker.

export type BandInput = RenderInput<'AbovePrompt', 'desktop'>

// The widest each ticking string gets, the room the band keeps for it: a
// percentage, and the time left until a window resets.
const WIDEST_PERCENT = t('limit.percent', { percent: 100 })
const widestCountdown = (kind: string) => duration(longestCountdownMinutes(kind))
// The widest context figure: three digits of thousands of the window.
const WIDEST_CONTEXT_TOKENS = 888_000
// A reset further off than this reads as a date ("Nov 1"), not a weekday.
const DATE_AFTER_MS = 6 * 86_400_000
// The widest option the picker's open list shows whole, in ems: it grows with
// its options up to about 20em on the desktop, then cuts them itself.
const OPTION_EMS = 19

// --- A steady band ----------------------------------------------------------------
// The band's layout and the picker's name follow its width, but not every
// twitch of it:
// - a width under STEADY_MIN_COLUMNS is no width to fit (a window minimized
//   reports next to none): the last fit stands;
// - a fit is kept until the width moves STEADY_STEP_COLUMNS or more, or what
//   it is fitted to changes (the figures shown, the name).
// Each surface keeps its own (a session has one band on each), whichever
// request draws it.

const STEADY_MIN_COLUMNS = 20
const STEADY_STEP_COLUMNS = 2
const MAX_FIT_SITES = 16

type Fit = ReturnType<typeof fitBand>
const lastFits = boundedMap<string, { columns: number; key: string; fit: Fit }>(MAX_FIT_SITES)

function steadyFit(site: string, columns: number, figures: FigureText[], pickerName: string): Fit {
  const key = JSON.stringify({ figures, pickerName })
  const last = lastFits.get(site)
  const isHeld =
    last !== undefined && (columns < STEADY_MIN_COLUMNS || (last.key === key && Math.abs(columns - last.columns) < STEADY_STEP_COLUMNS))
  if (isHeld) {
    return last.fit
  }
  const fit = fitBand(columns, figures, pickerName)
  lastFits.set(site, { columns, key, fit })

  return fit
}

// --- The figures ------------------------------------------------------------------

/**
 * One figure of the band, as drawn: `label` before its bar ("5h"; none for the
 * context), `name` for its bar's text alternative, `value` in a slot as wide as
 * `widestValue`, and the `hint` card's lines.
 */
export type Metric = {
  key: string
  label: string | null
  name: string
  percent: number | null
  tone: Level
  value: string
  widestValue: string
  hint: string[]
  countdown: string | null
}

function contextMetric({ contextTokens: used, contextPercent: percent, contextWindow: window, contextAt }: Meter): Metric {
  const hint =
    used === null
      ? [t('context.hintEmpty'), t('context.hintEmptyNote')]
      : [
          t('context.hint', { used: tokens(used), window: tokens(window), percent: percent ?? 0 }),
          ...(contextAt.compactAt === null ? [] : [t('context.compactsAt', { tokens: tokens(contextAt.compactAt) })]),
        ]

  return {
    key: 'ctx',
    label: null,
    name: t('context.name'),
    percent,
    tone: contextLevel(used, contextAt),
    value: used === null ? t('context.none') : t('context.value', { used: tokens(used), window: tokens(window) }),
    widestValue: t('context.value', { used: tokens(WIDEST_CONTEXT_TOKENS), window: tokens(window) }),
    hint,
    countdown: null,
  }
}

/** A limit's hint: its name and figures, then when it resets, by the clock or, far off, by date. */
function limitHint(limit: Limit, { name, percent, spend, countdown }: LimitView, now: number, timeZone: string) {
  const resetsAt = resetTime(limit)
  const isFarOff = resetsAt !== null && resetsAt - now > DATE_AFTER_MS
  const at = isFarOff ? resetDate(limit.resetsAt, timeZone) : resetClock(limit.resetsAt, now, timeZone)
  const figures = [spend, percent === null ? null : t('limit.percentUsed', { percent })].filter(Boolean).join(t('list.separator'))
  const resets = at && (countdown ? t('limit.resetsIn', { at, countdown }) : t('limit.resets', { at }))

  return [t('limit.named', { name, figures }), ...(resets ? [resets] : [])]
}

function limitMetric(limit: Limit, now: number, timeZone: string): Metric {
  const view = limitView(limit, now)

  return {
    key: `limit-${limit.kind}`,
    label: view.label,
    name: view.name,
    percent: view.percent,
    tone: view.tone,
    value: view.value,
    widestValue: view.percent === null ? view.value : WIDEST_PERCENT,
    hint: limitHint(limit, view, now, timeZone),
    countdown: view.countdown,
  }
}

// --- The picker ---------------------------------------------------------------------

/**
 * An option of the picker's open list: "second — 5h 40% ↻1h 20m", "second — No
 * saved sign-in", or the name alone when nothing was seen yet. The list is
 * narrow, so it says only the window that decides whether to switch now: the
 * 5-hour one, or the weekly one while it is used up ("second — 7d 100% ↻3d 4h");
 * the rest and when they were seen are the Accounts list's to say. The name
 * gets what the rest leaves of OPTION_EMS.
 */
function optionLabel(profile: string, snapshot: Snapshot | null, now: number, isNeverSignedIn: boolean) {
  // The weekly window while it is used up, else the 5-hour one; on a plan
  // without either, its first capped figure (a monthly spend, say).
  const known = snapshot?.limits.filter(limit => limit.spend?.limit !== null) ?? []
  const weekUsedUp = known.filter(limit => limit.kind === SEVEN_DAY && isUsedUp(limit, now))
  const fiveHour = known.filter(limit => limit.kind === FIVE_HOUR)
  const shown = weekUsedUp.length ? weekUsedUp : fiveHour.length ? fiveHour : known.slice(0, 1)
  const status = isNeverSignedIn ? t('picker.noSignIn') : shown.length ? limitsSummary(shown, now) : null
  if (status === null) {
    return cutToEms(profile, OPTION_EMS)
  }
  const rest = t('picker.option', { name: '', status })

  return t('picker.option', { name: cutToEms(profile, OPTION_EMS - textEms(rest)), status })
}

// --- The models ---------------------------------------------------------------------

export type QuestionModel = { target: string; hasSignIn: boolean; busy: Busy | null }

/** The switch's question to `target`, one of the saved profiles. */
export async function loadQuestion($: EngineInterface, target: Profile): Promise<QuestionModel> {
  return { target: target.name, hasSignIn: target.hasSignIn, busy: await readBusy($) }
}

export type FiguresModel = {
  layout: Layout
  metrics: Metric[]
  current: string | null
  pickerLabel: string
  options: { value: string; label: string }[]
  /** Keys the picker's seat: see band.tsx's resetPicker. */
  picksKept: number
}

/** The figures, as many as the band's width holds, and the picker, which takes what they leave. */
export async function loadFigures(
  $: EngineInterface,
  e: BandInput,
  list: Profile[],
  current: Profile | null,
  picksKept: number,
): Promise<FiguresModel> {
  const [meter, now, timeZone] = await Promise.all([meterOrStatus($), $.clock.now(), localTimeZone($)])
  const context = contextMetric(meter)
  const limits = meter.limits.map(limit => ({ kind: limit.kind, metric: limitMetric(limit, now, timeZone) }))
  // Each figure reckoned as wide as it can get, so a ticking value never moves
  // the layout, the picker's name or the figures beside it: the fullest layout
  // the line has room for; the picker's name, shown when it is closed, takes
  // what the figures leave.
  const widest: FigureText[] = [
    { label: null, value: context.widestValue, countdown: null, hasBar: true },
    ...limits.map(({ kind, metric }) => ({
      label: metric.label,
      value: metric.widestValue,
      countdown: widestCountdown(kind),
      hasBar: metric.percent !== null,
    })),
  ]
  // One fit per surface, whichever request draws it.
  const { layout, pickerLabel } = steadyFit(
    siteOf({ component: e.component, surface: e.surface }),
    e.props.bodyColumns,
    widest,
    current?.name ?? t('account.unnamed'),
  )
  // The other profiles carry their last known limits.
  const others = await Promise.all(
    list
      .filter(one => one !== current)
      .map(async one => ({ value: one.name, label: optionLabel(one.name, await readSnapshot($, one.account), now, !one.hasSignIn) })),
  )

  return {
    layout,
    metrics: [context, ...limits.slice(0, layout.limitCount).map(one => one.metric)],
    current: current?.name ?? null,
    pickerLabel,
    // The current account first, as in the Accounts list; the others by name.
    options: [{ value: current?.name ?? UNNAMED, label: pickerLabel }, ...others, { value: MANAGE, label: t('picker.manage') }],
    picksKept,
  }
}
