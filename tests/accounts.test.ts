import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { DETACHED_BUSY_MS, DETACHED_START_MS, DETACHED_WATCH_MS } from '../hooks/commands/run'
import { NAME_MAX } from '../hooks/domain/profileNames'
import { snapshotKey } from '../hooks/services/storeKeys'
import { SWITCH_RUN_VERSION } from '../hooks/services/switchRun'
import { ScriptExit } from '../hooks/services/switcher'
import { limitLabel } from '../hooks/ui/format'
import { plural, t } from '../hooks/ui/strings'
import { DATA, DESKTOP_ENV, HOME, NOW, OTHER, fakeHost, mountBand, mountList, runIdOf, scriptArgs, whole } from './support/host'

// The Accounts list, as Claude Desktop draws it (the mod draws nowhere else): in
// the side pane, and unfolded in the band. What it says comes from hooks/ui/strings.ts.

const surface = 'desktop'

const percent = (value: number) => t('limit.percent', { percent: value })
const updated = (ago: string) => t('card.updated', { ago })
const list = ($: Engine, bodyColumns?: number) => mountList($, surface, bodyColumns)

test(`lists every account, the signed-in one first, with what it can do`, async ($: Engine, on: On) => {
  fakeHost(on, { store: { [snapshotKey(HOME)]: { at: NOW - 3 * 60_000, limits: [{ kind: 'five_hour', percentUsed: 12 }] } } })
  const ui = await list($)

  const names = (await ui.findAll({ type: 'Text', text: /^(home|work)$/ })).map(one => one.text)
  expect(names).toEqual(['work', 'home'])
  expect(await ui.find({ type: 'Text', text: t('card.active') })).toBeDefined()
  // Another account's figures say how much is used, and when they were seen.
  expect(await ui.find({ type: 'Text', text: percent(12) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: updated(t('ago.minutes', { n: 3 })) })).toBeDefined()
  // The signed-in account can be renamed, not switched to or deleted.
  expect(await ui.find({ key: 'rename-work' })).toBeDefined()
  expect(await ui.find({ key: 'switch-work' })).toBeUndefined()
  expect(await ui.find({ key: 'delete-work' })).toBeUndefined()
  expect(await ui.find({ key: 'switch-home' })).toBeDefined()
  expect(await ui.find({ key: 'delete-home' })).toBeDefined()
})

test(`the signed-in account shows its last known limits, and when they were seen, until the session has its own`, async ($: Engine, on: On) => {
  fakeHost(on, {
    store: {
      [snapshotKey(DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID!)]: { at: NOW - 5 * 60_000, limits: [{ kind: 'five_hour', percentUsed: 41 }] },
    },
  })
  const ui = await list($)

  expect(await ui.find({ type: 'Text', text: percent(41) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: updated(t('ago.minutes', { n: 5 })) })).toBeDefined()
})

test(`each row says the email of the account its profile holds, on a line of its own`, async ($: Engine, on: On) => {
  fakeHost(on, {
    profiles: {
      home: { account: HOME, email: 'home@example.com' },
      old: { account: OTHER },
      work: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID, email: 'work@example.com' },
    },
    store: {
      [snapshotKey(HOME)]: { at: NOW - 3 * 60_000, limits: [{ kind: 'five_hour', percentUsed: 12 }] },
      [snapshotKey(OTHER)]: { at: NOW - 2 * 3_600_000, limits: [{ kind: 'five_hour', percentUsed: 1 }] },
    },
  })
  const ui = await list($)

  expect(await ui.find({ type: 'Text', text: 'work@example.com' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'home@example.com' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: updated(t('ago.minutes', { n: 3 })) })).toBeDefined()
  // An account not signed in to since emails were noted has its limits alone.
  expect(await ui.find({ type: 'Text', text: percent(1) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: updated(t('ago.hours', { n: 2 })) })).toBeDefined()
  expect(await ui.findAll({ type: 'Text', text: /@example\.com$/ })).toHaveLength(2)
})

test(`a plan's monthly spend shows what was spent of its cap`, async ($: Engine, on: On) => {
  const spend = {
    kind: 'extra_usage',
    percentUsed: 12.4,
    resetsAt: new Date(NOW + 10 * 86_400_000).toISOString(),
    spend: { used: 1240, limit: 10000, currency: 'USD' },
  }
  fakeHost(on, { store: { [snapshotKey(HOME)]: { at: NOW - 3 * 60_000, limits: [spend] } } })
  const ui = await list($)

  expect(await ui.find({ type: 'Text', text: limitLabel('extra_usage') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: percent(12) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: t('spend.capped', { used: '$12.40', limit: '$100' }) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: t('limit.countdown', { countdown: t('duration.days', { d: 10 }) }) })).toBeDefined()
})

test(`a plan with no 5-hour or weekly window says so, instead of waiting for figures`, async ($: Engine, on: On) => {
  fakeHost(on, { store: { [snapshotKey(HOME)]: { at: NOW - 3 * 60_000, limits: [] } } })
  const ui = await list($)

  expect(await ui.find({ type: 'Text', text: t('card.noWindow') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: t('card.noUsage') })).toBeDefined()
})

test(`an account no profile holds is shown by its email`, async ($: Engine, on: On) => {
  fakeHost(on, { env: { ...DESKTOP_ENV, CLAUDE_CODE_ACCOUNT_UUID: OTHER, CLAUDE_CODE_USER_EMAIL: 'new@example.com' } })
  const ui = await list($)

  expect(await ui.find({ type: 'Text', text: whole(t('account.unnamed')) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'new@example.com' })).toBeDefined()
})

test(`sharing is off until its checkbox under the list turns it on, in place`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on)
  const ui = await list($)

  expect(await ui.find({ type: 'Text', text: t('share.heading') })).toBeDefined()
  expect((await ui.find({ key: 'share-home' }))?.props.label).toBe(t('share.unticked', { name: 'home' }))
  await ui.press({ key: 'share-home' })
  expect(runs.map(scriptArgs)).toEqual([['share', 'home', 'on']])
})

test(`turning sharing on says what changes in the switcher's own words`, async ($: Engine, on: On) => {
  const said = "'home' shares its Code sessions with the other sharing profiles from the next switch."
  const { toasts } = fakeHost(on, { script: () => ({ exitCode: 0, stdout: said }) })
  const ui = await list($)

  await ui.press({ key: 'share-home' })
  expect(toasts).toEqual([said])
})

test(`a sharing account's checkbox is ticked, and turns sharing off`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, {
    profiles: { home: { account: HOME, shares: true }, work: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID } },
  })
  const ui = await list($)

  expect((await ui.find({ key: 'share-home' }))?.props.label).toBe(t('share.ticked', { name: 'home' }))
  expect((await ui.find({ key: 'share-work' }))?.props.label).toBe(t('share.unticked', { name: 'work' }))
  await ui.press({ key: 'share-home' })
  expect(runs.map(scriptArgs)).toEqual([['share', 'home', 'off']])
})

test(`renaming asks for the name on the row; names in any script are taken, bad and taken ones refused`, async ($: Engine, on: On) => {
  const { runs, toasts } = fakeHost(on)
  const ui = await list($)

  await ui.press({ key: 'rename-home' })
  // The field stays open after each refusal, which says why.
  for (const refused of ['a/b', 'NUL', '-x', 'work']) {
    await ui.input({ key: 'name', text: refused })
  }
  expect(runs).toHaveLength(0)
  const rules = t('name.rules', { max: NAME_MAX })
  expect(toasts).toEqual([...['a/b', 'NUL', '-x'].map(name => t('name.invalid', { name, rules })), t('name.taken', { name: 'work' })])
  await ui.input({ key: 'name', text: 'Личный акк' })
  expect(runs.map(scriptArgs)).toEqual([['rename', 'home', 'Личный акк']])
})

test(`deleting asks on the card first, saying what goes; Cancel deletes nothing`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, {
    profiles: { home: { account: HOME }, side: {}, work: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID } },
  })
  const ui = await list($)

  await ui.press({ key: 'delete-side' })
  expect(await ui.find({ type: 'Text', text: t('delete.question', { name: 'side' }) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: t('delete.noteNoSignIn') })).toBeDefined()
  // While it asks, the card is the question: its actions and details step aside.
  expect(await ui.find({ key: 'switch-side' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: t('card.noSavedSignIn') })).toBeUndefined()
  await ui.press({ key: 'cancel' })
  expect(await ui.find({ key: 'confirm' })).toBeUndefined()
  await ui.press({ key: 'delete-home' })
  expect(await ui.find({ type: 'Text', text: t('delete.noteSignIn') })).toBeDefined()
  expect(runs).toHaveLength(0)
  await ui.press({ key: 'confirm' })
  expect(runs.map(scriptArgs)).toEqual([['delete', 'home']])
})

test(`a deleted account's last limits go with it`, async ($: Engine, on: On) => {
  // The script as it deletes: the profile's folder goes.
  const host: ReturnType<typeof fakeHost> = fakeHost(on, {
    store: { [snapshotKey(HOME)]: { at: NOW, limits: [] } },
    script: args => {
      if (args[0] === 'delete') {
        host.setProfile(args[1]!)
      }
      return { exitCode: 0 }
    },
  })
  const ui = await list($)

  await ui.press({ key: 'delete-home' })
  await ui.press({ key: 'confirm' })
  expect(host.stored.has(snapshotKey(HOME))).toBe(false)
})

test(`switching asks first; to an account never signed in, it says the sign-in screen comes`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, {
    profiles: { home: { account: HOME }, side: {}, work: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID } },
  })
  const ui = await list($)

  expect(await ui.find({ type: 'Text', text: t('card.noSavedSignIn') })).toBeDefined()
  await ui.press({ key: 'switch-side' })
  expect(await ui.find({ type: 'Text', text: t('switch.question', { name: 'side' }) })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: t('switch.noteSignIn') })).toBeDefined()
  await ui.press({ key: 'confirm' })
  expect(runs.map(scriptArgs)).toEqual([['switch', 'side', '-Detach']])
})

test(`adding only names the account; nothing restarts`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on)
  const ui = await list($)

  await ui.press({ key: 'add' })
  await ui.input({ key: 'name', text: 'side' })
  expect(runs.map(scriptArgs)).toEqual([['add', 'side']])
})

test(`unfolded in the band, Done stays while an account is being added`, async ($: Engine, on: On) => {
  fakeHost(on)
  const ui = await mountBand($, surface, { maxRows: 10 })

  await ui.select({ key: 'account', value: ':manage' })
  await ui.press({ key: 'add' })
  expect(await ui.find({ key: 'name' })).toBeDefined()
  expect(await ui.find({ key: 'done' })).toBeDefined()
})

test(`an account no profile holds is "This account": named in place, no sharing, no switching away`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on, { env: { ...DESKTOP_ENV, CLAUDE_CODE_ACCOUNT_UUID: OTHER } })
  const ui = await list($)

  expect(await ui.find({ type: 'Text', text: whole(t('account.unnamed')) })).toBeDefined()
  expect(await ui.find({ key: 'share-:current' })).toBeUndefined()
  await ui.press({ key: 'switch-home' })
  expect(await ui.find({ key: 'confirm' })).toBeUndefined()
  await ui.press({ key: 'rename-:current' })
  await ui.input({ key: 'name', text: 'main' })
  expect(runs.map(scriptArgs)).toEqual([['save', 'main']])
})

test(`a long name is kept whole in the list`, async ($: Engine, on: On) => {
  const long = 'very long account name with many symbols'
  fakeHost(on, { profiles: { [long]: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID } }, lastSwitchedTo: long })

  expect(await (await list($)).find({ type: 'Text', text: long })).toBeDefined()
})

// --- While a command runs, and when it fails ----------------------------------------

test(`while a command runs the list says so and offers nothing that would start another`, async ($: Engine, on: On) => {
  const seen: { isSaid: boolean; hasActions: boolean }[] = []
  let ui: Awaited<ReturnType<typeof list>> | null = null
  const { runs } = fakeHost(on, {
    profiles: { home: { account: HOME }, side: {}, work: { account: DESKTOP_ENV.CLAUDE_CODE_ACCOUNT_UUID } },
    // The list as it stands while the script runs.
    script: async () => {
      seen.push({
        isSaid: (await ui!.find({ type: 'Text', text: t('busy.delete', { name: 'home' }) })) !== undefined,
        hasActions: (await ui!.find({ key: 'delete-side' })) !== undefined || (await ui!.find({ key: 'add' })) !== undefined,
      })
      return { exitCode: 0 }
    },
  })
  ui = await list($)

  await ui.press({ key: 'delete-home' })
  await ui.press({ key: 'confirm' })
  expect(runs).toHaveLength(1)
  expect(seen).toEqual([{ isSaid: true, hasActions: false }])
  // Done, the list offers them again.
  expect(await ui.find({ key: 'delete-side' })).toBeDefined()
})

/** switch.json as the run outside Claude writes it, for run `id` of a switch. */
const switchRun = (id: string, state: string, message: string | null = null) =>
  JSON.stringify({ version: SWITCH_RUN_VERSION, id, command: 'switch', state, message })
const SWITCH_JSON = `${DATA}\\switch.json`

test(`a switch handed to a run outside Claude counts as running until Claude closes; should it stay, the list offers its actions again`, async ($: Engine, on: On) => {
  const time = mock.clock(on, { now: NOW })
  // The run handed off runs, and says nothing more.
  const host = fakeHost(on, {
    isClockFixed: false,
    script: (_args, argv) => {
      host.files.write(SWITCH_JSON, switchRun(runIdOf(argv)!, 'running'))
      return { exitCode: 0, stdout: 'ok' }
    },
  })
  const { toasts } = host
  const ui = await list($)

  await ui.press({ key: 'switch-home' })
  await ui.press({ key: 'confirm' })
  expect(await ui.find({ type: 'Text', text: t('busy.switch', { name: 'home' }) })).toBeDefined()
  expect(await ui.find({ key: 'add' })).toBeUndefined()

  await time.advance(DETACHED_BUSY_MS)
  expect(await ui.find({ key: 'add' })).toBeDefined()
  expect(toasts).toEqual([t('toast.failed', { message: plural('handOff.timedOut', DETACHED_BUSY_MS / 60_000) })])
})

test(`a switch whose run outside Claude fails offers the list's actions again at once, and says why`, async ($: Engine, on: On) => {
  const time = mock.clock(on, { now: NOW })
  const why = 'Claude did not exit within 20 seconds; nothing was changed.'
  let id = ''
  const host = fakeHost(on, {
    isClockFixed: false,
    script: (_args, argv) => {
      id = runIdOf(argv)!
      host.files.write(SWITCH_JSON, switchRun(id, 'starting'))
      return { exitCode: 0, stdout: 'ok' }
    },
  })
  const ui = await list($)

  await ui.press({ key: 'switch-home' })
  await ui.press({ key: 'confirm' })
  host.files.write(SWITCH_JSON, switchRun(id, 'running'))
  await time.advance(DETACHED_WATCH_MS)
  expect(await ui.find({ key: 'add' })).toBeUndefined()

  host.files.write(SWITCH_JSON, switchRun(id, 'failed', why))
  await time.advance(DETACHED_WATCH_MS)
  expect(await ui.find({ key: 'add' })).toBeDefined()
  expect(host.toasts).toEqual([t('toast.failed', { message: why })])
})

test(`a switch whose run outside Claude never starts offers the list's actions again, and says nothing changed`, async ($: Engine, on: On) => {
  const time = mock.clock(on, { now: NOW })
  const host = fakeHost(on, {
    isClockFixed: false,
    script: (_args, argv) => {
      host.files.write(SWITCH_JSON, switchRun(runIdOf(argv)!, 'starting'))
      return { exitCode: 0, stdout: 'ok' }
    },
  })
  const ui = await list($)

  await ui.press({ key: 'switch-home' })
  await ui.press({ key: 'confirm' })
  await time.advance(DETACHED_START_MS - DETACHED_WATCH_MS)
  expect(await ui.find({ key: 'add' })).toBeUndefined()

  await time.advance(2 * DETACHED_WATCH_MS)
  expect(await ui.find({ key: 'add' })).toBeDefined()
  expect(host.toasts).toEqual([t('toast.failed', { message: t('handOff.notStarted') })])
})

test(`a switch is handed off under a run id of its own: an earlier run's switch.json is not taken for it`, async ($: Engine, on: On) => {
  const time = mock.clock(on, { now: NOW })
  const ids: (string | undefined)[] = []
  const host = fakeHost(on, {
    isClockFixed: false,
    files: { [SWITCH_JSON]: switchRun('earlier', 'failed', 'an earlier failure') },
    script: (_args, argv) => {
      ids.push(runIdOf(argv))
      return { exitCode: 0, stdout: 'ok' }
    },
  })
  const ui = await list($)

  await ui.press({ key: 'switch-home' })
  await ui.press({ key: 'confirm' })
  await time.advance(DETACHED_WATCH_MS)
  expect(ids).toHaveLength(1)
  expect(ids[0]).not.toBe('earlier')
  expect(await ui.find({ key: 'add' })).toBeUndefined()

  // It never said it runs under its own id: it never started.
  await time.advance(DETACHED_START_MS)
  expect(await ui.find({ key: 'add' })).toBeDefined()
  expect(host.toasts).toEqual([t('toast.failed', { message: t('handOff.notStarted') })])
})

test(`a list of profiles that can't be read says so, and how to have it written again`, async ($: Engine, on: On) => {
  fakeHost(on, { hasIndex: false, files: { [`${DATA}\\index.json`]: '{ broken' } })
  const ui = await list($)

  expect(await ui.find({ type: 'Text', text: t('accounts.unreadable') })).toBeDefined()
})

test(`a switcher that can't run, or finds another switch running, says so in a toast`, async ($: Engine, on: On) => {
  const { toasts } = fakeHost(on, {
    script: args => (args[0] === 'delete' ? { refused: 'no PowerShell' } : { exitCode: ScriptExit.Busy, stderr: 'busy' }),
  })
  const ui = await list($)

  await ui.press({ key: 'delete-home' })
  await ui.press({ key: 'confirm' })
  await ui.press({ key: 'share-home' })

  expect(toasts).toHaveLength(2)
  expect(toasts[0]).toContain(t('toast.failed', { message: t('script.notRun', { message: '' }) }))
  expect(toasts[1]).toBe(t('toast.failed', { message: 'busy' }))
})

test(`a new name that another profile has in another case is refused, as Windows would; a case change of its own is not`, async ($: Engine, on: On) => {
  const { runs } = fakeHost(on)
  const ui = await list($)

  await ui.press({ key: 'rename-work' })
  await ui.input({ key: 'name', text: 'HOME' })
  expect(runs).toHaveLength(0)
  await ui.input({ key: 'name', text: 'Work' })
  expect(runs.map(scriptArgs)).toEqual([['rename', 'work', 'Work']])
})
