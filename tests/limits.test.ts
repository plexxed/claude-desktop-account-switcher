import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { POLL_KEY, snapshotKey } from '../hooks/services/storeKeys'
import { DATA, HOME, OTHER, NOW, TICK_LAG, TURN_END, WORK, fakeApi, fakeHost, mountBand, startSession, usageAnswer } from './support/host'

// The limits the mod polls: one poll shared by every session, what it keeps of
// each account, and how it waits when the server asks it to.

test('the limits of accounts no profile holds, and whatever an earlier version kept, are dropped', async ($: Engine, on: On) => {
  const snapshot = { at: NOW, limits: [{ kind: 'five_hour', percentUsed: 1 }] }
  const { stored } = fakeHost(on, {
    isClockFixed: false,
    store: {
      [snapshotKey(HOME)]: snapshot,
      [snapshotKey(OTHER)]: snapshot,
      'limits:home': snapshot,
      [snapshotKey(HOME)]: snapshot,
      poll: {},
    },
  })
  fakeApi(on, () => ({ status: 500 }))
  await startSession($, on)

  expect([...stored.keys()].filter(key => key !== POLL_KEY)).toEqual([snapshotKey(HOME)])
})

test('while the profiles can’t be read, no account’s limits are dropped', async ($: Engine, on: On) => {
  const snapshot = { at: NOW, limits: [{ kind: 'five_hour', percentUsed: 1 }] }
  const { stored } = fakeHost(on, {
    isClockFixed: false,
    hasIndex: false,
    files: { [`${DATA}\\index.json`]: 'not JSON' },
    store: { [snapshotKey(HOME)]: snapshot, [snapshotKey(OTHER)]: snapshot },
  })
  fakeApi(on, () => ({ status: 500 }))
  await startSession($, on)

  expect([...stored.keys()].filter(key => key !== POLL_KEY).sort()).toEqual([snapshotKey(HOME), snapshotKey(OTHER)].sort())
})

// --- Polling the limits ------------------------------------------------------------------

test('the account’s limits are fetched each minute, so other sessions’ use shows up', async ($: Engine, on: On) => {
  fakeHost(on, { isClockFixed: false })
  let fiveHour = 40
  const asked = fakeApi(on, () => ({ body: usageAnswer(fiveHour) }))
  const clock = await startSession($, on)
  const band = await mountBand($, 'desktop')
  expect(await band.find({ type: 'Text', text: /^40%$/ })).toBeDefined()

  fiveHour = 47
  await clock.advance(59_000)
  expect(asked).toHaveLength(1)
  await clock.advance(1_000 + TICK_LAG)
  expect(asked).toHaveLength(2)
  expect(await band.find({ type: 'Text', text: /^47%$/ })).toBeDefined()
  expect(asked[0]).toBe('https://api.anthropic.com/api/oauth/usage')
})

test('a plan shows its windows or, having none, its monthly spend; a figure the answer no longer lists goes', async ($: Engine, on: On) => {
  fakeHost(on, { isClockFixed: false })
  const extra_usage = { is_enabled: true, monthly_limit: 1000, used_credits: 250, utilization: 25, currency: 'USD' }
  let answer: unknown = { five_hour: null, seven_day: null, extra_usage }
  fakeApi(on, () => ({ body: answer }))
  const clock = await startSession($, on)
  const band = await mountBand($, 'desktop')
  expect(await band.find({ type: 'Text', text: 'Spend' })).toBeDefined()

  // Spent money and all, a plan with windows shows only them.
  answer = { ...usageAnswer(40), extra_usage }
  await clock.advance(60_000 + TICK_LAG)
  expect(await band.find({ type: 'Text', text: 'Spend' })).toBeUndefined()
  expect(await band.find({ type: 'Text', text: /^40%$/ })).toBeDefined()
})

test('when Claude has answered the limits are polled at once, the next a minute on; a subagent’s turn asks nothing', async ($: Engine, on: On) => {
  fakeHost(on, { isClockFixed: false })
  const asked = fakeApi(on, () => ({ body: usageAnswer(40) }))
  const clock = await startSession($, on)
  expect(asked).toHaveLength(1)

  await clock.advance(30_000)
  await $.turn.complete({ ...TURN_END, turnId: 't1' })
  await clock.settle()
  expect(asked).toHaveLength(2)
  await $.turn.complete({ ...TURN_END, turnId: 't2', agentId: 'a1' })
  await clock.settle()
  expect(asked).toHaveLength(2)
  await clock.advance(50_000)
  expect(asked).toHaveLength(2)
  await clock.advance(10_000 + TICK_LAG)
  expect(asked).toHaveLength(3)
})

test('two turns ending at once in one session fetch the limits once', async ($: Engine, on: On) => {
  fakeHost(on, { isClockFixed: false })
  const asked = fakeApi(on, () => ({ body: usageAnswer(40) }))
  const clock = await startSession($, on)

  await clock.advance(30_000)
  await Promise.all([$.turn.complete({ ...TURN_END, turnId: 't1' }), $.turn.complete({ ...TURN_END, turnId: 't2' })])
  await clock.settle()
  expect(asked).toHaveLength(2)
})

for (const [failure, answer] of [
  ['a 429', { status: 429 }],
  ['a server error', { status: 500 }],
  ['no network', 'offline'],
] as const) {
  test(`after ${failure} every session waits, longer each time, and a turn’s end doesn’t ask meanwhile`, async ($: Engine, on: On) => {
    const { stored } = fakeHost(on, { isClockFixed: false })
    const asked = fakeApi(on, () => (answer === 'offline' ? { refused: 'no network' } : answer))
    const clock = await startSession($, on)
    expect(stored.get(POLL_KEY)).toMatchObject({ account: WORK, nextAt: NOW + 2 * 60_000, failures: 1 })

    await clock.advance(30_000)
    await $.turn.complete({ ...TURN_END, turnId: 't1' })
    await clock.settle()
    expect(asked).toHaveLength(1)
    // 2 minutes, then 5.
    await clock.advance(90_000 + TICK_LAG)
    expect(asked).toHaveLength(2)
    await clock.advance(4 * 60_000)
    expect(asked).toHaveLength(2)
    await clock.advance(60_000)
    expect(asked).toHaveLength(3)
  })
}

test('a 429’s Retry-After is honored', async ($: Engine, on: On) => {
  const { stored } = fakeHost(on, { isClockFixed: false })
  fakeApi(on, () => ({ status: 429, headers: { 'retry-after': '600' } }))
  await startSession($, on)

  expect(stored.get(POLL_KEY)).toMatchObject({ nextAt: NOW + 600_000 })
})

test('another session’s fresh poll of this account is used, not fetched again', async ($: Engine, on: On) => {
  const poll = { account: WORK, at: NOW - 30_000, limits: [{ kind: 'five_hour', percentUsed: 55 }], nextAt: NOW + 90_000, failures: 0 }
  fakeHost(on, { isClockFixed: false, store: { [POLL_KEY]: poll } })
  const asked = fakeApi(on, () => ({ body: usageAnswer(10) }))
  await startSession($, on)
  const band = await mountBand($, 'desktop')

  expect(asked).toHaveLength(0)
  expect(await band.find({ type: 'Text', text: /^55%$/ })).toBeDefined()
})

test('figures of a poll made while the server refuses read as old as their fetch, not as seen now', async ($: Engine, on: On) => {
  const fetchedAt = NOW - 3_600_000
  const poll = { account: WORK, at: fetchedAt, limits: [{ kind: 'five_hour', percentUsed: 55 }], nextAt: NOW + 90_000, failures: 3 }
  const { stored } = fakeHost(on, { isClockFixed: false, store: { [POLL_KEY]: poll } })
  fakeApi(on, () => ({ status: 500 }))
  await startSession($, on)

  expect(stored.get(snapshotKey(WORK))).toMatchObject({ at: fetchedAt, limits: [{ kind: 'five_hour', percentUsed: 55 }] })
})

test('another account’s poll is not taken for this one', async ($: Engine, on: On) => {
  const poll = { account: HOME, at: NOW - 30_000, limits: [{ kind: 'five_hour', percentUsed: 55 }], nextAt: NOW + 90_000, failures: 0 }
  fakeHost(on, { isClockFixed: false, store: { [POLL_KEY]: poll } })
  const asked = fakeApi(on, () => ({ body: usageAnswer(10) }))
  await startSession($, on)

  expect(asked).toHaveLength(1)
})

test('a plan with no 5-hour or weekly window is remembered as such, and asked every ten minutes', async ($: Engine, on: On) => {
  const { stored } = fakeHost(on, { isClockFixed: false })
  const asked = fakeApi(on, () => ({ body: { five_hour: null, seven_day: null } }))
  const clock = await startSession($, on)
  expect(stored.get(snapshotKey(WORK))).toEqual({ at: NOW, limits: [] })
  expect(asked).toHaveLength(1)

  await clock.advance(5 * 60_000)
  expect(asked).toHaveLength(1)
  await clock.advance(5 * 60_000 + TICK_LAG)
  expect(asked).toHaveLength(2)
})

test('the limits are remembered for the account, and a failed fetch keeps the figures the band had', async ($: Engine, on: On) => {
  const { stored } = fakeHost(on, { isClockFixed: false })
  let status = 200
  fakeApi(on, () => ({ status, body: usageAnswer(40) }))
  const clock = await startSession($, on)
  expect(stored.get(snapshotKey(WORK))).toMatchObject({
    at: NOW,
    limits: [
      { kind: 'five_hour', percentUsed: 40 },
      { kind: 'seven_day', percentUsed: 61 },
    ],
  })

  status = 500
  await clock.advance(60_000 + TICK_LAG)
  const band = await mountBand($, 'desktop')
  expect(await band.find({ type: 'Text', text: /^40%$/ })).toBeDefined()
})

test('a session whose claim on the slot another session wrote over leaves the fetch to that one', async ($: Engine, on: On) => {
  let claims = 0
  fakeHost(on, {
    isClockFixed: false,
    // Another session claims the same slot just after this one.
    storeSet: (key, value) => (key === POLL_KEY && claims++ === 0 ? { ...(value as object), claimant: 'another session' } : value),
  })
  const asked = fakeApi(on, () => ({ body: usageAnswer(10) }))
  await startSession($, on)

  expect(asked).toHaveLength(0)
})
