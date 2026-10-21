import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { snapshotKey } from '../hooks/services/storeKeys'
import { clockTime, limitLabel, limitName, resetClock } from '../hooks/ui/format'
import { t } from '../hooks/ui/strings'
import { TONE } from '../hooks/ui/styles'
import {
  BAND,
  DESKTOP_ENV,
  HOME,
  NOW,
  OTHER,
  TICK_LAG,
  TIME_ZONE,
  USER,
  fakeHost,
  mountBand,
  pickerOptions,
  scriptArgs,
  whole,
} from './support/host'

// The band above the prompt, as Claude Desktop draws it: the mod draws nowhere
// else (isDesktopOnWindows), so its terminal look is left untested. What it says
// comes from hooks/ui/strings.ts.

const LONG = 'very long account name with many symbols'
const ELLIPSIS = t('text.ellipsis')

// The band's figures are short and its hints repeat them, so each is found whole.
const percent = (value: number) => whole(t('limit.percent', { percent: value }))
const k = (n: number) => t('tokens.thousands', { n })
const M = (n: number) => t('tokens.millions', { n })
const hm = (h: number, m: number) => t('duration.hoursMinutes', { h, m })
const wholeHm = (h: number, m: number) => whole(hm(h, m))
// A time of day as the band reads it, given as the local time it is, with its offset.
const clock = (local: string) => clockTime(Date.parse(local), TIME_ZONE)

const surface = 'desktop'

const band = ($: Engine, props: Partial<typeof BAND> = {}) => mountBand($, surface, props)
const bars = async (ui: Awaited<ReturnType<typeof band>>) =>
  (await ui.findAll({ type: 'Svg' })).length + (await ui.findAll({ type: 'Text', text: /━/ })).length
const currentLabel = async (ui: Awaited<ReturnType<typeof band>>) => (await pickerOptions(ui))[0]?.label

test(`shows the context and the plan's limits, colored by level, each with its hint`, async ($: Engine, on: On) => {
  fakeHost(on)
  const ui = await band($)

  expect(await ui.find({ type: 'Text', text: t('context.value', { used: k(380), window: M(1) }) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: whole(limitLabel('five_hour')) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: whole(limitLabel('seven_day')) })).toBeDefined()
  // The weekly limit is yellow from 75% used.
  expect((await ui.find({ type: 'Text', text: percent(85) }))?.props).toMatchObject({ color: TONE.warning })
  expect(await ui.find({ type: 'Text', text: wholeHm(1, 42) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: whole(t('duration.daysHours', { d: 3, h: 4 })) })).toBeDefined()
  // The hint cards give the exact local reset time: 13:42 UTC is 16:42 at UTC+3.
  expect(await ui.find({ type: 'Text', text: t('context.hint', { used: k(380), window: M(1), percent: 38 }) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: t('context.compactsAt', { tokens: k(967) }) })).toBeDefined()
  expect(
    await ui.find({
      type: 'Text',
      text: t('limit.named', { name: limitName({ kind: 'five_hour', percentUsed: 0 }), figures: t('limit.percentUsed', { percent: 23 }) }),
    }),
  ).toBeDefined()
  expect(
    await ui.find({ type: 'Text', text: t('limit.resetsIn', { at: clock('2026-10-20T16:42+03:00'), countdown: hm(1, 42) }) }),
  ).toBeDefined()
  expect(
    await ui.find({
      type: 'Text',
      text: t('limit.resetsIn', {
        at: t('clock.weekday', { day: 'Fri', time: clock('2026-10-23T19:00+03:00') }),
        countdown: t('duration.daysHours', { d: 3, h: 4 }),
      }),
    }),
  ).toBeDefined()
  // The desktop draws real bars; the terminal draws box-drawing characters.
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(3)
  expect(await bars(ui)).toBeGreaterThan(0)
})

test(`the weekly limit stays neutral short of 75% used, and turns red from 90%`, async ($: Engine, on: On) => {
  fakeHost(on, { sevenDay: 60 })
  const calm = await band($)
  expect((await calm.find({ type: 'Text', text: percent(60) }))?.props.color).toBeUndefined()
})

test(`the weekly limit turns red from 90% used`, async ($: Engine, on: On) => {
  fakeHost(on, { sevenDay: 90 })
  const ui = await band($)

  expect((await ui.find({ type: 'Text', text: percent(90) }))?.props).toMatchObject({ color: TONE.error })
})

test(`before the session measures anything, the band shows the account's last known limits`, async ($: Engine, on: On) => {
  fakeHost(on, {
    hasLimits: false,
    store: {
      [snapshotKey(DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID!)]: {
        at: NOW - 5 * 60_000,
        limits: [
          { kind: 'five_hour', percentUsed: 41, resetsAt: new Date(NOW + 60 * 60_000).toISOString() },
          { kind: 'seven_day', percentUsed: 52, resetsAt: new Date(NOW + 30 * 3_600_000).toISOString() },
        ],
      },
    },
  })
  const ui = await band($)

  expect(await ui.find({ type: 'Text', text: percent(41) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: percent(52) })).toBeDefined()
})

test(`the context follows the session's own auto-compaction threshold`, async ($: Engine, on: On) => {
  const context = { tokens: 485_000, window: 1_000_000, percent: 49 }
  fakeHost(on, { context, breakdown: { rawMaxTokens: 500_000, isAutoCompactEnabled: true, autoCompactThreshold: 480_000 } })
  await $.session.measure({ context, rateLimits: [], changed: ['context'] })
  const ui = await band($)

  expect((await ui.find({ type: 'Text', text: t('context.value', { used: k(485), window: M(1) }) }))?.props).toMatchObject({
    color: TONE.error,
  })
  expect(await ui.find({ type: 'Text', text: t('context.compactsAt', { tokens: k(480) }) })).toBeDefined()
})

test(`a reply's figure for a window merges with the one the band has`, async ($: Engine, on: On) => {
  fakeHost(on)
  const context = { tokens: 380_000, window: 1_000_000, percent: 38 }
  const resetsAt = new Date(NOW + 102 * 60_000).toISOString()
  await $.session.measure({ context, rateLimits: [{ kind: 'five_hour', percentUsed: 30, resetsAt }], changed: ['rateLimits'] })
  await $.session.measure({ context, rateLimits: [{ kind: 'five_hour', percentUsed: 25, resetsAt }], changed: ['rateLimits'] })
  const ui = await band($)

  expect(await ui.find({ type: 'Text', text: percent(30) })).toBeDefined()
})

test(`a narrow band drops the bars and the reset times, the hints still saying them`, async ($: Engine, on: On) => {
  fakeHost(on)
  const narrow = await band($, { bodyColumns: 30 })

  expect(await bars(narrow)).toBe(0)
  expect(await narrow.find({ type: 'Text', text: wholeHm(1, 42) })).toBeUndefined()
  expect(await narrow.find({ type: 'Text', text: percent(23) })).toBeDefined()
  expect(
    await narrow.find({ type: 'Text', text: t('limit.resetsIn', { at: clock('2026-10-20T16:42+03:00'), countdown: hm(1, 42) }) }),
  ).toBeDefined()
})

test(`the picker's name takes what the figures leave: whole when wide, cut when narrow`, async ($: Engine, on: On) => {
  fakeHost(on, { profiles: { [LONG]: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID } }, lastSwitchedTo: LONG })

  expect(await currentLabel(await band($, { bodyColumns: 200 }))).toBe(LONG)
  expect(await currentLabel(await band($, { bodyColumns: 30 }))).toMatch(new RegExp(`^very long.*${ELLIPSIS}$`))
})

test(`a window whose reset has passed reads 0% until fresh figures come`, async ($: Engine, on: On) => {
  // A minute before the 5-hour window (23% used) resets.
  const time = mock.clock(on, { now: NOW + 101 * 60_000 })
  fakeHost(on, { isClockFixed: false })
  await $.session.start({ cwd: USER, surface, isInteractive: true })
  const ui = await band($)
  expect(await ui.find({ type: 'Text', text: percent(23) })).toBeDefined()

  await time.advance(2 * 60_000 + TICK_LAG)
  expect(await ui.find({ type: 'Text', text: percent(23) })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: percent(0) })).toBeDefined()
})

test(`a ticking countdown moves nothing: the picker's name stays as it was`, async ($: Engine, on: On) => {
  // 61 minutes before the 5-hour window resets, so two minutes on its countdown narrows.
  const time = mock.clock(on, { now: NOW + 41 * 60_000 })
  fakeHost(on, { isClockFixed: false, profiles: { [LONG]: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID } }, lastSwitchedTo: LONG })
  await $.session.start({ cwd: USER, surface, isInteractive: true })
  const ui = await band($, { bodyColumns: 90 })
  const before = await currentLabel(ui)
  expect(await ui.find({ type: 'Text', text: wholeHm(1, 1) })).toBeDefined()

  await time.advance(2 * 60_000 + TICK_LAG)
  expect(await ui.find({ type: 'Text', text: whole(t('duration.minutes', { m: 59 })) })).toBeDefined()
  expect(await currentLabel(ui)).toBe(before)
})

test(`a width that moves by a column keeps the fit; further, it is fitted anew; next to none, the last stands`, async ($: Engine, on: On) => {
  fakeHost(on, { profiles: { [LONG]: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID } }, lastSwitchedTo: LONG })
  const labelAt = async (bodyColumns: number) => {
    const ui = await band($, { bodyColumns })
    const label = await currentLabel(ui)
    await ui.unmount()

    return label!
  }
  const columns = 90
  const first = await labelAt(columns)
  expect(first.endsWith(ELLIPSIS)).toBe(true)
  expect(await labelAt(columns + 1)).toBe(first)
  expect(await labelAt(columns - 1)).toBe(first)
  // A minimized window reports next to no width.
  expect(await labelAt(3)).toBe(first)
  expect((await labelAt(columns + 40)).length).toBeGreaterThan(first.length)
})

test(`picking another account asks before switching, then switches outside Claude`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on)
  const ui = await band($)

  await ui.select({ key: 'account', value: 'home' })
  expect(runs).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: t('switch.note') })).toBeDefined()
  await ui.press({ key: 'confirm' })
  expect(runs.map(scriptArgs)).toEqual([['switch', 'home', '-Detach']])
})

test(`a question about a profile gone meanwhile is dropped: the band shows its figures again`, async ($: Engine, on: On) => {
  const host = fakeHost(on)
  const ui = await band($)

  await ui.select({ key: 'account', value: 'home' })
  expect(await ui.find({ key: 'confirm' })).toBeDefined()
  // Deleted elsewhere: in another session, or from a shell.
  host.setProfile('home')
  await ui.redraw(BAND)

  expect(await ui.find({ key: 'confirm' })).toBeUndefined()
  expect(await ui.find({ key: 'account' })).toBeDefined()
})

test(`the signed-in account is listed first, the others with their last known limits`, async ($: Engine, on: On) => {
  fakeHost(on, {
    profiles: { alpha: { account: OTHER }, home: { account: HOME }, side: {}, work: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID } },
    store: { [snapshotKey(HOME)]: { at: NOW - 3_600_000, limits: [{ kind: 'five_hour', percentUsed: 40 }] } },
  })
  const options = await pickerOptions(await band($))

  expect(options.map(one => one.value)).toEqual(['work', 'alpha', 'home', 'side', ':manage'])
  const summary = t('limit.summary', { label: limitLabel('five_hour'), value: t('limit.percent', { percent: 40 }) })
  expect(options.find(one => one.value === 'home')?.label).toBe(t('picker.option', { name: 'home', status: summary }))
  expect(options.find(one => one.value === 'side')?.label).toBe(t('picker.option', { name: 'side', status: t('picker.noSignIn') }))
})

test(`an account signed in from Claude's own screen is "This account" until it is named`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, { env: { ...DESKTOP_ENV, CLAUDE_CODE_ACCOUNT_UUID: OTHER } })
  const ui = await band($, { maxRows: 20 })
  const options = await pickerOptions(ui)
  expect(options[0]).toMatchObject({ value: ':current', label: t('account.unnamed') })

  // Leaving it unnamed would lose its sign-in: the list opens instead of a switch.
  await ui.select({ key: 'account', value: 'home' })
  expect(await ui.find({ key: 'confirm' })).toBeUndefined()
  expect(await ui.find({ key: 'rename-:current' })).toBeDefined()
  expect(runs).toHaveLength(0)
})

test(`"Manage accounts…" opens the list in the side pane, and leaves the band as it is`, async ($: Engine, on: On) => {
  fakeHost(on)
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true as const } }
  })
  const ui = await band($, { maxRows: 3 })
  await ui.select({ key: 'account', value: ':manage' })
  expect(opened).toEqual(['accounts'])
  expect(await ui.find({ key: 'account' })).toBeDefined()
  expect(await ui.find({ key: 'rename-home' })).toBeUndefined()
})

test(`with no pane placed, "Manage accounts…" unfolds the list in the band, however few rows it has: it scrolls there`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on)
  on('ui.open', () => ({ value: { isPlaced: false as const, reason: 'no surface' } }))
  const ui = await band($, { maxRows: 3 })
  await ui.select({ key: 'account', value: ':manage' })
  expect(await ui.find({ key: 'rename-home' })).toBeDefined()

  // A rename keeps the list open; Done folds it back to the figures.
  await ui.press({ key: 'rename-home' })
  await ui.input({ key: 'name', text: 'personal' })
  expect(runs.map(scriptArgs)).toEqual([['rename', 'home', 'personal']])
  await ui.press({ key: 'done' })
  expect(await ui.find({ key: 'account' })).toBeDefined()
})

test(`two replies measured at once both land: neither undoes the other`, async ($: Engine, on: On) => {
  fakeHost(on)
  const context = { tokens: 380_000, window: 1_000_000, percent: 38 }
  const resetsAt = new Date(NOW + 102 * 60_000).toISOString()
  await Promise.all([
    $.session.measure({ context, rateLimits: [{ kind: 'five_hour', percentUsed: 31, resetsAt }], changed: ['rateLimits'] }),
    $.session.measure({ context, rateLimits: [{ kind: 'seven_day', percentUsed: 52, resetsAt }], changed: ['rateLimits'] }),
  ])
  const ui = await band($)

  expect(await ui.find({ type: 'Text', text: percent(31) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: percent(52) })).toBeDefined()
})

test(`a TZ the time zone database does not know is passed over: the hints read in the system's own zone`, async ($: Engine, on: On) => {
  fakeHost(on, { env: { ...DESKTOP_ENV, TZ: 'Mars/Olympus' } })
  const ui = await band($)
  const at = resetClock(new Date(NOW + 102 * 60_000).toISOString(), NOW, Intl.DateTimeFormat().resolvedOptions().timeZone)!

  expect(await ui.find({ type: 'Text', text: t('limit.resetsIn', { at, countdown: hm(1, 42) }) })).toBeDefined()
})
