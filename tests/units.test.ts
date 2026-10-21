import { expect, test } from 'claude-code/testing'

import { contextThresholds } from '../hooks/domain/context'
import { contextLevel, limitLevel } from '../hooks/domain/levels'
import { limitNow, mergeLimits, nextMonthStart } from '../hooks/domain/limits'
import { nameProblem, toProfileName } from '../hooks/domain/profileNames'
import { currentProfile } from '../hooks/domain/profiles'
import type { Profile } from '../hooks/domain/profiles'
import { usageLimits } from '../hooks/services/usageAnswer'
import { asLimits } from '../hooks/services/storedLimits'
import { keepTree } from '../hooks/ui/drawn'
import { ago, clockTime, limitLabel, limitsSummary, money, resetClock, resetDate, spendText, tokens, untilReset } from '../hooks/ui/format'
import { fitBand, rowFits, textEms, wordsColumns } from '../hooks/ui/layout'
import { t } from '../hooks/ui/strings'
import { avatarSvg, initialOf } from '../hooks/ui/styles'
import { CURRENT_PROFILE_CASES } from './fixtures/current-profile'
import { NO_ACCOUNT_CASES } from './fixtures/current-profile-no-account'
import { PROFILE_NAME_CASES } from './fixtures/profile-names'
import { NOW, TIME_ZONE } from './support/host'

// The mod's pure parts, without a host. What they say comes from hooks/ui/strings.ts.

const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()
const percent = (value: number) => t('limit.percent', { percent: value })
// A time of day as the band reads it, given as the local time it is, with its offset.
const clock = (local: string) => clockTime(Date.parse(local), TIME_ZONE)

for (const { name, isValid } of PROFILE_NAME_CASES) {
  test(`a profile name ${JSON.stringify(name)} is ${isValid ? 'taken' : 'refused'}, as the script decides`, () => {
    expect(nameProblem(name, []) === null).toBe(isValid)
  })
}

test('a name another profile has is refused', () => {
  expect(nameProblem('work', ['home', 'work'])).toBe('taken')
})

test('an account’s own name is made fit for a profile name', () => {
  expect(toProfileName('Alex <Smith>')).toBe('Alex Smith')
  expect(toProfileName('- Alex')).toBe('Alex')
  expect(toProfileName('a'.repeat(39) + ' b')).toBe('a'.repeat(39))
  expect(toProfileName('Con')).toBeNull()
  expect(toProfileName(' ... ')).toBeNull()
  // Cut to the 40 UTF-16 units Windows names are counted in, never inside a character.
  expect(toProfileName('a'.repeat(39) + '😀')).toBe('a'.repeat(39))
})

test('limits read back from the store keep their shape, and a value of another shape is dropped', () => {
  const kept = { kind: 'extra_usage', percentUsed: 12.4, resetsAt: at(60), spend: { used: 1240, limit: 10000, currency: 'USD' } }

  expect(asLimits([kept])).toEqual([kept])
  expect(asLimits([{ ...kept, spend: { ...kept.spend, used: 'a lot' } }])).toBeNull()
  expect(asLimits([{ ...kept, percentUsed: Infinity }])).toBeNull()
  expect(asLimits({ kind: 'five_hour' })).toBeNull()
})

const profile = (name: string, account: string | null): Profile => ({ name, account, email: null, sharesSessions: false, hasSignIn: true })

for (const { case: name, profiles, account, lastSwitchedTo, current } of CURRENT_PROFILE_CASES) {
  test(`the profile signed in now is ${name}, as the script finds it`, () => {
    const list = Object.entries(profiles).map(([one, holds]) => profile(one, holds))

    expect(currentProfile(list, account, lastSwitchedTo)?.name ?? null).toBe(current)
  })
}

for (const { case: name, profiles, lastSwitchedTo, mod } of NO_ACCOUNT_CASES) {
  test(`where the environment doesn’t name the account, the profile signed in now is the one last switched to: ${name}`, () => {
    const list = Object.entries(profiles).map(([one, holds]) => profile(one, holds))

    expect(currentProfile(list, null, lastSwitchedTo)?.name ?? null).toBe(mod)
  })
}

test('token counts read short', () => {
  expect([950, 380_000, 1_000_000, 1_500_000].map(tokens)).toEqual([
    '950',
    t('tokens.thousands', { n: 380 }),
    t('tokens.millions', { n: 1 }),
    t('tokens.millions', { n: 1.5 }),
  ])
})

test('the time left until a reset counts a begun minute whole, in hours under a day', () => {
  expect(untilReset(at(7.5), NOW)).toBe(t('duration.minutes', { m: 8 }))
  expect(untilReset(at(102), NOW)).toBe(t('duration.hoursMinutes', { h: 1, m: 42 }))
  expect(untilReset(at(60), NOW)).toBe(t('duration.hours', { h: 1 }))
  expect(untilReset(at(23 * 60 + 59), NOW)).toBe(t('duration.hoursMinutes', { h: 23, m: 59 }))
  expect(untilReset(at(76 * 60), NOW)).toBe(t('duration.daysHours', { d: 3, h: 4 }))
  expect(untilReset(at(48 * 60), NOW)).toBe(t('duration.days', { d: 2 }))
  expect(untilReset(at(-1), NOW)).toBeNull()
  expect(untilReset(undefined, NOW)).toBeNull()
})

test('a reset reads in local time: today, tomorrow, or its weekday', () => {
  // 12:00 UTC is 15:00 at UTC+3.
  expect(resetClock(at(102), NOW, TIME_ZONE)).toBe(clock('2026-10-20T16:42+03:00'))
  expect(resetClock(at(12 * 60), NOW, TIME_ZONE)).toBe(t('clock.tomorrow', { time: clock('2026-10-21T03:00+03:00') }))
  expect(resetClock(at(76 * 60), NOW, TIME_ZONE)).toBe(t('clock.weekday', { day: 'Fri', time: clock('2026-10-23T19:00+03:00') }))
})

test('a reset reads on the minute the usage answer gives a fraction of a second early', () => {
  // 12:59:59.5 UTC is 13:00, which is 15:00 at UTC+2 after the change of time.
  expect(resetClock('2026-10-26T12:59:59.516958+00:00', NOW, TIME_ZONE)).toBe(
    t('clock.weekday', { day: 'Mon', time: clock('2026-10-26T15:00+02:00') }),
  )
  expect(resetDate('2026-10-31T21:59:59.516958+00:00', TIME_ZONE)).toBe('Nov 1')
})

test('a reset past a change of time reads by the clock of its own date', () => {
  // The zone moves from UTC+3 to UTC+2 on Oct 25: Monday's 12:59 UTC is 14:59 there.
  expect(resetClock('2026-10-26T12:59:00Z', NOW, TIME_ZONE)).toBe(t('clock.weekday', { day: 'Mon', time: clock('2026-10-26T14:59+02:00') }))
})

test('how long ago reads coarse', () => {
  expect([60_000, 5 * 60_000, 3 * 3_600_000, 50 * 3_600_000].map(ago)).toEqual([
    t('ago.now'),
    t('ago.minutes', { n: 5 }),
    t('ago.hours', { n: 3 }),
    t('ago.days', { n: 2 }),
  ])
})

test('a window whose reset has passed reads 0%', () => {
  const summary = limitsSummary(
    [
      { kind: 'five_hour', percentUsed: 80, resetsAt: at(-1) },
      { kind: 'seven_day', percentUsed: 45.2, resetsAt: at(24 * 60) },
    ],
    NOW,
  )

  expect(summary).toBe(
    [
      t('limit.summary', { label: limitLabel('five_hour'), value: percent(0) }),
      t('limit.summaryResets', { label: limitLabel('seven_day'), value: percent(45), countdown: t('duration.days', { d: 1 }) }),
    ].join(t('list.separator')),
  )
})

test('of two figures for one window the larger stands; a later window wins, an earlier one is stale', () => {
  const fiveHour = (percentUsed: number, minutes: number) => ({ kind: 'five_hour', percentUsed, resetsAt: at(minutes) })
  const merge = (known: ReturnType<typeof fiveHour>, incoming: ReturnType<typeof fiveHour>) =>
    mergeLimits([known], [incoming], NOW)[0]?.percentUsed

  // A reset 20 seconds off is the same window.
  expect(merge(fiveHour(16, 102), { ...fiveHour(15, 102), resetsAt: new Date(NOW + 102 * 60_000 + 20_000).toISOString() })).toBe(16)
  expect(merge(fiveHour(16, 102), fiveHour(17, 102))).toBe(17)
  expect(merge(fiveHour(16, 102), fiveHour(2, 402))).toBe(2)
  expect(merge(fiveHour(2, 402), fiveHour(40, 102))).toBe(2)
  // A window whose reset has passed is over: what comes next is taken as it is,
  // with a reset time or without one (the next window not started).
  expect(merge(fiveHour(50, -1), fiveHour(3, 299))).toBe(3)
  expect(merge(fiveHour(50, -1), { kind: 'five_hour', percentUsed: 0 } as never)).toBe(0)
  // A window only one side has is kept.
  expect(mergeLimits([fiveHour(16, 102)], [{ kind: 'seven_day', percentUsed: 5 }], NOW).map(one => one.kind)).toEqual([
    'five_hour',
    'seven_day',
  ])
  // Unless the source answers for its kind and no longer lists it: spend turned off.
  const spend = { kind: 'extra_usage', percentUsed: 0, spend: { used: 0, limit: 1000, currency: 'USD' } }
  expect(mergeLimits([fiveHour(16, 102), spend], [fiveHour(17, 102)], NOW, ['five_hour', 'extra_usage']).map(one => one.kind)).toEqual([
    'five_hour',
  ])
})

test('the context turns yellow and red where Claude Code’s own indicator does', () => {
  // A 1M window without a breakdown: auto-compaction at 967k.
  const plain = contextThresholds({ window: 1_000_000 })
  expect(plain).toEqual({ warnAt: 947_000, errorAt: 967_000, compactAt: 967_000 })
  expect([946_000, 950_000, 968_000].map(used => contextLevel(used, plain))).toEqual(['success', 'warning', 'error'])

  // With auto-compaction off, red only near the end of the window.
  const off = contextThresholds({ window: 1_000_000, breakdown: { rawMaxTokens: 1_000_000, isAutoCompactEnabled: false } })
  expect(off).toEqual({ warnAt: 960_000, errorAt: 977_000, compactAt: null })
})

test('the 5-hour limit is yellow from 70% used and red from 90%; the weekly one yellow from 75% and red from 90%', () => {
  expect([69.9, 70, 89.9, 90].map(percent => limitLevel('five_hour', percent))).toEqual(['success', 'warning', 'warning', 'error'])
  expect([74.9, 75, 89.9, 90].map(percent => limitLevel('seven_day', percent))).toEqual(['success', 'warning', 'warning', 'error'])
})

test('a row that fits keeps fitting when wider, and a longer name line needs more room', () => {
  const buttons = [t('action.switch'), t('icon.rename'), t('icon.delete')]
  const fitsFrom = (line: number) => [...Array(300).keys()].find(columns => rowFits(columns, [line], buttons, true))!

  const short = wordsColumns(true, ['home'])
  const long = wordsColumns(true, ['a much longer account name', 'current'])
  expect(fitsFrom(long)).toBeGreaterThan(fitsFrom(short))
  expect(rowFits(fitsFrom(short) + 10, [short], buttons, true)).toBe(true)
})

// The picker's name is not among them: it takes what the figures leave, so it
// shortens where a wider band first has room for the bars.
test('the band drops what it shows in order as it narrows, never what a wider band keeps', () => {
  const figures = [
    {
      label: null,
      value: t('context.value', { used: t('tokens.thousands', { n: 888 }), window: t('tokens.millions', { n: 1 }) }),
      countdown: null,
      hasBar: true,
    },
    { label: limitLabel('five_hour'), value: percent(100), countdown: t('duration.hoursMinutes', { h: 4, m: 59 }), hasBar: true },
    { label: limitLabel('seven_day'), value: percent(100), countdown: t('duration.hoursMinutes', { h: 23, m: 59 }), hasBar: true },
  ]
  const name = 'very long account name with many symbols'
  const fits = [...Array(200).keys()].slice(10).map(columns => fitBand(columns, figures, name))

  for (const [narrower, wider] of fits.slice(0, -1).map((fit, i) => [fit, fits[i + 1]!] as const)) {
    expect(Number(wider.layout.hasBars) >= Number(narrower.layout.hasBars)).toBe(true)
    expect(Number(wider.layout.hasResets) >= Number(narrower.layout.hasResets)).toBe(true)
    expect(wider.layout.limitCount).toBeGreaterThanOrEqual(narrower.layout.limitCount)
  }
  expect(fits.at(-1)?.pickerLabel).toBe(name)
  expect(fits[0]?.layout.hasBars).toBe(false)
})

test('an avatar shows the first letter of a name, upper-cased', () => {
  expect(initialOf('home')).toBe('H')
  expect(initialOf('  личный')).toBe('Л')
  expect(initialOf('_2nd')).toBe('2')
  expect(initialOf('')).toBe(t('avatar.noInitial'))
  // A glyph that means something to XML is escaped.
  expect(avatarSvg('a', '&', 'idle')).toContain('>&amp;</text>')
})

test('a redraw from the same data answers the same tree, so its Buttons keep their press handles', async () => {
  let draws = 0
  const draw = () => ({ draw: ++draws })
  const first = await keepTree('pane/a', 'one', draw)

  // Pressing a Button on the desktop focuses it first, which redraws the site.
  expect(await keepTree('pane/a', 'one', draw)).toBe(first)
  // Other data, or another site, is drawn anew.
  expect(await keepTree('pane/a', 'two', draw)).not.toBe(first)
  expect(await keepTree('pane/b', 'two', draw)).toEqual({ draw: 3 })
  expect(draws).toBe(3)
})

test('a usage answer gives its windows and credit windows as Claude Code reads them, and then no spend', () => {
  const now = Date.UTC(2026, 9, 21, 12)
  const limits = usageLimits(
    {
      five_hour: null,
      seven_day: { utilization: 61.04, resets_at: '2026-10-25T10:00:00Z' },
      cinder_cove: { utilization: 12, resets_at: null },
      wattle_ember: { utilization: 25, resets_at: '2026-11-01T00:00:00Z', label: 'Seat credit', limit_dollars: 100, used_dollars: 25.5 },
      extra_usage: { is_enabled: true, monthly_limit: 10000, used_credits: 1240, utilization: null, currency: 'usd' },
    },
    now,
    TIME_ZONE,
  )

  expect(limits).toEqual([
    { kind: 'seven_day', percentUsed: 61, resetsAt: '2026-10-25T10:00:00Z' },
    { kind: 'cinder_cove', percentUsed: 12 },
    {
      kind: 'wattle_ember',
      percentUsed: 25,
      resetsAt: '2026-11-01T00:00:00Z',
      label: 'Seat credit',
      spend: { used: 2550, limit: 10000, currency: 'USD' },
    },
  ])
})

test('a plan with no window reads as its monthly spend, starting over on the 1st', () => {
  // 2026-10-21 12:00 UTC, three hours east of UTC then and two after the change of
  // time on Oct 25: next month starts Nov 1, 00:00 local, at 22:00 UTC.
  const now = Date.UTC(2026, 9, 21, 12)
  const limits = usageLimits(
    {
      five_hour: null,
      seven_day: null,
      extra_usage: { is_enabled: true, monthly_limit: 10000, used_credits: 1240, utilization: null, currency: 'usd' },
    },
    now,
    TIME_ZONE,
  )

  expect(limits).toEqual([
    // No utilization: reckoned from the amounts, in cents.
    { kind: 'extra_usage', percentUsed: 12.4, resetsAt: '2026-10-31T22:00:00.000Z', spend: { used: 1240, limit: 10000, currency: 'USD' } },
  ])
  expect(nextMonthStart(now, TIME_ZONE)).toBe('2026-10-31T22:00:00.000Z')
})

test('spend is shown once a spent figure comes; with no cap it has no percentage', () => {
  const now = Date.UTC(2026, 9, 21, 12)
  expect(
    usageLimits({ extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null } }, now, 'UTC'),
  ).toEqual([])
  expect(usageLimits({ extra_usage: { is_enabled: true, monthly_limit: null, used_credits: 777 } }, now, 'UTC')).toMatchObject([
    { kind: 'extra_usage', percentUsed: 0, spend: { used: 777, limit: null, currency: 'USD' } },
  ])
})

test('spend that is turned off is not shown, though the answer carries its cap and a zero spent', () => {
  const now = Date.UTC(2026, 9, 21, 12)
  expect(
    usageLimits({ extra_usage: { is_enabled: false, monthly_limit: 1000, used_credits: 0, utilization: 0, currency: 'USD' } }, now, 'UTC'),
  ).toEqual([])
})

test('amounts read as Claude Code shows them', () => {
  expect(money(1240, 'USD')).toBe('$12.40')
  expect(money(10000, 'USD')).toBe('$100')
  expect(money(150000, 'USD')).toBe('$1,500')
  expect(spendText({ used: 1240, limit: 10000, currency: 'USD' })).toBe(t('spend.capped', { used: '$12.40', limit: '$100' }))
  expect(spendText({ used: 777, limit: null, currency: 'USD' })).toBe(t('spend.uncapped', { used: '$7.77' }))
  expect(resetDate('2026-10-31T22:00:00.000Z', TIME_ZONE)).toBe('Nov 1')
})

test('a window whose reset has passed reads 0% and nothing spent, until fresh figures come', () => {
  const passed = new Date(NOW - 60_000).toISOString()
  const ahead = new Date(NOW + 60_000).toISOString()

  expect(limitNow({ kind: 'five_hour', percentUsed: 50, resetsAt: passed }, NOW).percentUsed).toBe(0)
  expect(limitNow({ kind: 'five_hour', percentUsed: 50, resetsAt: ahead }, NOW).percentUsed).toBe(50)
  expect(limitNow({ kind: 'five_hour', percentUsed: 50 }, NOW).percentUsed).toBe(50)
  expect(
    limitNow({ kind: 'extra_usage', percentUsed: 12, resetsAt: passed, spend: { used: 1240, limit: 10000, currency: 'USD' } }, NOW).spend,
  ).toEqual({ used: 0, limit: 10000, currency: 'USD' })
})

test('a name is taken whatever its case, as Windows tells folders apart; a profile may take its own in another case', () => {
  expect(nameProblem('HOME', ['home', 'work'])).toBe('taken')
  expect(nameProblem('Work', ['home', 'work'], 'work')).toBeNull()
  expect(nameProblem('Home', ['home', 'work'], 'work')).toBe('taken')
})

test('text is measured in any script: a capital as a capital, an ideograph or emoji a whole em', () => {
  expect(textEms('Ж')).toBeGreaterThan(textEms('и'))
  expect(textEms('Д')).toBe(textEms('D'))
  expect(textEms('漢')).toBe(1)
  expect(textEms('😀')).toBe(1)
  expect(textEms('Личный акк')).toBeGreaterThan(textEms('Lichnyi akk') * 0.9)
})
