import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { snapshotKey } from '../hooks/services/storeKeys'

import {
  BAND,
  DATA,
  DESKTOP_ENV,
  HOME,
  ORGANIZATION,
  OTHER,
  OTHER_ORGANIZATION,
  WORK,
  fakeApi,
  fakeHost,
  mountBand,
  scriptArgs,
  startSession,
  usageAnswer,
} from './support/host'

// What the mod does whatever draws it: its gate, the script it runs, and the
// profile it names. The limits are in limits.test.ts.

// --- Where it runs ----------------------------------------------------------------

for (const [where, env] of [
  ['Claude Code in a terminal', { ...DESKTOP_ENV, CLAUDE_CODE_ENTRYPOINT: 'cli' }],
  ['macOS', { HOME: '/Users/me', CLAUDE_CODE_ENTRYPOINT: 'claude-desktop' }],
] as const) {
  test(`in ${where} the mod stays out of the way`, async ($: Engine, on: On) => {
    const { runs, stored } = fakeHost(on, { isClockFixed: false, env })
    const asked = fakeApi(on, () => ({ body: usageAnswer(10) }))
    // What the engine draws there when the mod draws nothing.
    on('ui.render', ($$, e) => $$.ui.resolve(e).Box({ key: 'engine' }))
    await startSession($, on)
    const band = await mountBand($, 'desktop')

    expect(await band.find({ key: 'engine' })).toBeDefined()
    expect(runs).toHaveLength(0)
    expect(asked).toHaveLength(0)
    expect([...stored.keys()]).toEqual([])
  })
}

test('an environment that could not be read keeps the mod out this time, and is asked again the next', async ($: Engine, on: On) => {
  fakeHost(on, { envFailsOnce: 'CLAUDE_CODE_ENTRYPOINT' })
  on('ui.render', ($$, e) => $$.ui.resolve(e).Box({ key: 'engine' }))
  const band = await mountBand($, 'desktop')
  expect(await band.find({ key: 'engine' })).toBeDefined()

  await band.redraw(BAND)
  expect(await band.find({ key: 'account' })).toBeDefined()
})

// --- The script ---------------------------------------------------------------------

test('the script is the mod’s own, run by Windows PowerShell by its full path, on the plugin data folder', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, { isClockFixed: false, hasIndex: false })
  fakeApi(on, () => ({ status: 500 }))
  await startSession($, on)

  const argv = runs[0]!
  expect(argv[0]).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  expect(argv[argv.indexOf('-File') + 1]!.replaceAll('\\', '/')).toMatch(/\/scripts\/switch\.ps1$/)
  expect(argv[argv.indexOf('-DataDir') + 1]).toBe(DATA)
  expect(scriptArgs(argv)).toEqual(['init'])
})

test('a Claude configuration folder of the person’s own holds the data folder', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, {
    isClockFixed: false,
    hasIndex: false,
    env: { ...DESKTOP_ENV, CLAUDE_CODE_CONFIG_DIR: '', CLAUDE_CONFIG_DIR: 'D:\\claude' },
  })
  fakeApi(on, () => ({ status: 500 }))
  await startSession($, on)

  expect(runs[0]![runs[0]!.indexOf('-DataDir') + 1]).toBe('D:\\claude\\plugins\\data\\account-switcher')
})

// --- At the session's start ------------------------------------------------------------

// The runs of one command of the script.
const runsOf = (runs: string[][], command: string) => runs.map(scriptArgs).filter(args => args[0] === command)

// What the session runs with (DESKTOP_ENV), as the script is told it.
const NOTED = ['-Organization', ORGANIZATION, '-Email', 'work@example.com']

test('the organization the account runs Code in, and its email, are noted by the script', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, { isClockFixed: false, accounts: { [HOME]: { org: ORGANIZATION } } })
  await startSession($, on)

  expect(runsOf(runs, 'start')).toEqual([['start', '-Account', WORK, ...NOTED]])
})

test('what was noted of the account already is not noted again, and nothing else is asked', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, { isClockFixed: false, accounts: { [WORK]: { org: ORGANIZATION, email: 'work@example.com' } } })
  await startSession($, on)

  expect(runsOf(runs, 'start')).toEqual([])
})

test('an email Claude doesn’t give is not noted, so the one noted before stays', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, {
    isClockFixed: false,
    env: { ...DESKTOP_ENV, CLAUDE_CODE_USER_EMAIL: '' },
    accounts: { [WORK]: { org: OTHER_ORGANIZATION, email: 'old@example.com' } },
  })
  await startSession($, on)

  expect(runsOf(runs, 'start')).toEqual([['start', '-Account', WORK, '-Organization', ORGANIZATION]])
})

test('the data folder is opened first when its read model is not there yet', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, { isClockFixed: false, hasIndex: false })
  fakeApi(on, () => ({ status: 500 }))
  await startSession($, on)

  expect(runs.map(scriptArgs)[0]).toEqual(['init'])
})

test('an account no profile holds gets a profile the script names after the account; nothing restarts', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, { isClockFixed: false, profiles: {}, lastSwitchedTo: null })
  fakeApi(on, url => ({
    body: url.endsWith('/profile') ? { account: { display_name: 'Alex', email: 'alex@example.com' } } : usageAnswer(10),
  }))
  await startSession($, on)

  expect(runsOf(runs, 'start')).toEqual([['start', '-Account', WORK, '-DisplayName', 'Alex', ...NOTED]])
})

test('an account signed in from Claude’s own screen gets a profile of its own, the other kept', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, { isClockFixed: false, env: { ...DESKTOP_ENV, CLAUDE_CODE_ACCOUNT_UUID: OTHER } })
  fakeApi(on, url => ({ body: url.endsWith('/profile') ? { account: { full_name: 'Sam Lee' } } : usageAnswer(10) }))
  await startSession($, on)

  expect(runsOf(runs, 'start')).toEqual([['start', '-Account', OTHER, '-DisplayName', 'Sam Lee', ...NOTED]])
})

test('when the account’s name can’t be read the script picks the name', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, { isClockFixed: false, profiles: { Account1: { account: HOME } }, lastSwitchedTo: null })
  fakeApi(on, () => ({ status: 500 }))
  await startSession($, on)

  expect(runsOf(runs, 'start')).toEqual([['start', '-Account', WORK, ...NOTED]])
})

test('a profile just switched to that holds no account yet takes the signed-in one at once; nothing restarts', async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, {
    isClockFixed: false,
    profiles: { home: { account: HOME }, fresh: {} },
    lastSwitchedTo: 'fresh',
    accounts: { [WORK]: { org: ORGANIZATION, email: 'work@example.com' } },
  })
  fakeApi(on, () => ({ body: usageAnswer(10) }))
  await startSession($, on)

  expect(runsOf(runs, 'start')).toEqual([['start', '-Account', WORK]])
})

test('the last limits of an account just given a profile are kept: the pruning waits for the script', async ($: Engine, on: On) => {
  const host: ReturnType<typeof fakeHost> = fakeHost(on, {
    isClockFixed: false,
    profiles: {},
    lastSwitchedTo: null,
    store: { [snapshotKey(WORK)]: { at: 0, limits: [] } },
    // The script as it names the account.
    script: args => {
      if (args[0] === 'start') {
        host.setProfile('Alex', { account: WORK })
      }
      return { exitCode: 0 }
    },
  })
  fakeApi(on, url => ({ status: url.endsWith('/profile') ? 200 : 500, body: { account: { display_name: 'Alex' } } }))
  await startSession($, on)

  expect(host.stored.has(snapshotKey(WORK))).toBe(true)
})
