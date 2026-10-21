import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { INDEX_VERSION } from '../../hooks/services/readModel'
import { t } from '../../hooks/ui/strings'

// Stands in for the host the mod runs on: Claude Desktop on Windows, with the
// switcher's data folder in an in-memory file system that answers only for the
// files it holds (the script's read model, index.json, among them), the script
// recorded rather than run, and a fixed clock.

export const NOW = Date.parse('2026-10-20T12:00:00Z')
// The session's time zone (TZ): three hours east of UTC on NOW's date, two
// after its change of time on 2026-10-25.
export const TIME_ZONE = 'Europe/Athens'
// The band ticks just past each whole minute, this far.
export const TICK_LAG = 100
export const USER = 'C:\\Users\\me'
export const DATA = `${USER}\\.claude\\plugins\\data\\account-switcher`
export const WORK = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
export const HOME = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
export const OTHER = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
export const ORGANIZATION = '11111111-1111-1111-1111-111111111111'
export const OTHER_ORGANIZATION = '22222222-2222-2222-2222-222222222222'

/** A Code session of Claude Desktop on Windows, signed in to WORK. */
export const DESKTOP_ENV: Record<string, string> = {
  USERPROFILE: USER,
  SystemRoot: 'C:\\Windows',
  OS: 'Windows_NT',
  TZ: TIME_ZONE,
  CLAUDE_CODE_ENTRYPOINT: 'claude-desktop',
  CLAUDE_CODE_ACCOUNT_UUID: WORK,
  CLAUDE_CODE_ORGANIZATION_UUID: ORGANIZATION,
  CLAUDE_CODE_USER_EMAIL: 'work@example.com',
}

export const BAND = { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 140, scroll: { offset: 0, bodyRows: 40 }, view: {} }
export const TURN_END = { answer: 'done', durationMs: 1_000, isAborted: false, reason: 'answer' as const }

/**
 * A saved profile: the account it holds, that account's email as the mod noted
 * it, whether it shares sessions, whether a sign-in is saved.
 */
export type SavedProfile = { account?: string; email?: string; shares?: boolean; hasSignIn?: boolean }

/** How a run of the script ends: its exit code and output, or `refused` when it can't start (or times out). */
export type ScriptAnswer = { exitCode: number; stdout?: string; stderr?: string } | { refused: string }

/** What the script saw of an account, as index.json carries it. */
export type SeenAccount = { org?: string; email?: string }

export type HostOptions = {
  /** By name; "home" and "work" by default, "work" signed in. */
  profiles?: Record<string, SavedProfile>
  /** The profile last switched to. */
  lastSwitchedTo?: string | null
  /** What was seen of each account, beside the emails `profiles` give. */
  accounts?: Record<string, SeenAccount>
  /** Leave index.json out, as before the script first wrote it. */
  hasIndex?: boolean
  env?: Record<string, string>
  /** A variable whose first read fails, as an environment that can't be read. */
  envFailsOnce?: string
  store?: Record<string, unknown>
  /** Further files, by path. */
  files?: Record<string, string>
  isClockFixed?: boolean
  context?: Record<string, unknown>
  /** What a `{ breakdown }` call adds to the context. */
  breakdown?: Record<string, unknown>
  sevenDay?: number
  /** Leave the limits out of the session's usage, as before its first reply. */
  hasLimits?: boolean
  /** How the script answers a run (`args` as scriptArgs reads them, the whole `argv`); "ok" by default. It may answer later. */
  script?: (args: string[], argv: string[]) => ScriptAnswer | Promise<ScriptAnswer>
  /** What the store keeps of a value set under `key`: the value, by default. */
  storeSet?: (key: string, value: unknown) => unknown
}

const DEFAULT_PROFILES: Record<string, SavedProfile> = { home: { account: HOME }, work: { account: WORK } }

/** A path as the file system tells paths apart: either separator, any case. */
const keyOf = (path: string) => path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()

// Each write's modification time: one more than the last, across every test's
// files, so no two writes, however close, look alike to a reader that keeps
// what it read (services/readModel.ts).
let lastWriteAt = 0

/** An in-memory file system: its files by path, its folders implied by them. */
export class Files {
  private readonly entries = new Map<string, { path: string; text: string; mtimeMs: number }>()

  write(path: string, text: string) {
    lastWriteAt += 1
    this.entries.set(keyOf(path), { path: path.replaceAll('\\', '/'), text, mtimeMs: lastWriteAt })
  }

  read(path: string) {
    return this.entries.get(keyOf(path))?.text
  }

  /** A file's size and modification time, or undefined when there is none. */
  stat(path: string) {
    const entry = this.entries.get(keyOf(path))

    return entry && { kind: 'file' as const, size: entry.text.length, mtimeMs: entry.mtimeMs, isLink: false }
  }

  /** Removes `path` and, a folder, everything in it. */
  remove(path: string) {
    const key = keyOf(path)
    for (const one of [...this.entries.keys()]) {
      if (one === key || one.startsWith(`${key}/`)) {
        this.entries.delete(one)
      }
    }
  }

  has(path: string) {
    const key = keyOf(path)

    return this.entries.has(key) || [...this.entries.keys()].some(one => one.startsWith(`${key}/`))
  }

  list(dir: string) {
    const prefix = `${keyOf(dir)}/`
    const found = new Map<string, 'file' | 'dir'>()
    for (const [key, { path }] of this.entries) {
      if (key.startsWith(prefix)) {
        const rest = path.slice(prefix.length).split('/')
        found.set(rest[0]!, rest.length > 1 ? 'dir' : 'file')
      }
    }

    return [...found].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false }))
  }
}

/** The script's read model of these profiles, as Write-SwitcherIndex writes it. */
export function indexJson(
  profiles: Record<string, SavedProfile>,
  lastSwitchedTo: string | null,
  accounts: Record<string, SeenAccount> = {},
) {
  const seen: Record<string, SeenAccount> = { ...accounts }
  for (const saved of Object.values(profiles)) {
    if (saved.account && saved.email) {
      seen[saved.account] = { ...seen[saved.account], email: saved.email }
    }
  }
  const names = Object.keys(profiles).sort()

  return JSON.stringify({
    version: INDEX_VERSION,
    lastSwitchedTo: lastSwitchedTo !== null && names.includes(lastSwitchedTo) ? lastSwitchedTo : null,
    profiles: names.map(name => {
      const saved = profiles[name]!
      const account = saved.account ?? null

      return {
        name,
        account,
        email: account ? (seen[account]?.email ?? null) : null,
        sharesSessions: saved.shares === true,
        hasSignIn: saved.hasSignIn ?? Boolean(saved.account),
      }
    }),
    accounts: seen,
  })
}

export function fakeHost(on: On, options: HostOptions = {}) {
  const {
    profiles = DEFAULT_PROFILES,
    lastSwitchedTo = 'work',
    accounts = {},
    hasIndex = true,
    env = DESKTOP_ENV,
    envFailsOnce,
    store = {},
    isClockFixed = true,
    context = { tokens: 380_000, window: 1_000_000, percent: 38 },
    breakdown,
    sevenDay = 85.4,
    hasLimits = true,
    script = (): ScriptAnswer => ({ exitCode: 0, stdout: 'ok' }),
    storeSet = (_key: string, value: unknown) => value,
  } = options
  const files = new Files()
  // The profiles as the script keeps them; a change the script makes in a test
  // goes through `setProfile`, which writes index.json anew as the script does.
  const saved = { ...profiles }
  const writeIndex = () => files.write(`${DATA}\\index.json`, indexJson(saved, lastSwitchedTo, accounts))
  if (hasIndex) {
    writeIndex()
  }
  for (const [path, text] of Object.entries(options.files ?? {})) {
    files.write(path, text)
  }
  // Each run of the script: its whole argument vector.
  const runs: string[][] = []
  // Each toast shown.
  const toasts: string[] = []

  // The mod's own store, which the test reads back: every session on the machine shares it.
  const stored = new Map<string, unknown>(Object.entries(store))
  on('store.get', (_$, e) => ({ value: stored.get(e.key) }))
  on('store.set', (_$, e) => {
    stored.set(e.key, JSON.parse(JSON.stringify(storeSet(e.key, e.value))))

    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    stored.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...stored.keys()] }))
  if (isClockFixed) {
    on('clock.now', () => ({ value: NOW }))
  }
  let isEnvFailed = false
  on('env.get', (_$, e) => {
    if (e.name === envFailsOnce && !isEnvFailed) {
      isEnvFailed = true
      return { deny: `${e.name} can't be read` }
    }

    return { value: env[e.name] }
  })
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) }))
  on('fs.list', (_$, e) => ({ value: files.list(e.path) }))
  on('fs.read', (_$, e) => {
    const text = files.read(e.path)

    return text === undefined ? { deny: `no such file: ${e.path}` } : { value: text }
  })
  on('fs.stat', (_$, e) => {
    const stat = files.stat(e.path)

    return stat ? { value: stat } : { deny: `no such file: ${e.path}` }
  })
  on('fs.write', (_$, e) => {
    files.write(e.path, e.text)

    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.usage', (_$, e) => ({
    value: {
      startedAt: 0,
      context: { ...context, ...(e.breakdown && breakdown ? { breakdown } : {}) } as never,
      rateLimits: hasLimits
        ? [
            { kind: 'five_hour', percentUsed: 23, resetsAt: new Date(NOW + 102 * 60_000).toISOString() },
            { kind: 'seven_day', percentUsed: sevenDay, resetsAt: new Date(NOW + 76 * 3_600_000).toISOString() },
          ]
        : [],
    },
  }))
  on('process.run', async (_$, e) => {
    runs.push([...e.argv])
    const answer = await script(scriptArgs(e.argv), [...e.argv])
    if ('refused' in answer) {
      return { deny: answer.refused }
    }

    return {
      value: {
        exitCode: answer.exitCode,
        stdout: answer.stdout ?? '',
        stderr: answer.stderr ?? '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })

  /** What the script does as it saves a profile (`profile`) or deletes one (none). */
  const setProfile = (name: string, profile?: SavedProfile) => {
    if (profile) {
      saved[name] = profile
    } else {
      delete saved[name]
    }
    writeIndex()
  }

  return { runs, files, stored, toasts, setProfile }
}

/** What a run asked the script: the arguments after its data folder, but the run id a hand-off gets (runIdOf). */
export function scriptArgs(argv: readonly string[]) {
  const at = argv.indexOf('-DataDir')
  const args = at === -1 ? argv.slice(argv.indexOf('-File') + 2) : argv.slice(at + 2)
  const runId = args.indexOf('-RunId')

  return runId === -1 ? args : [...args.slice(0, runId), ...args.slice(runId + 2)]
}

/** The run id a run handed off was given (`-RunId`); undefined for a run of its own. */
export function runIdOf(argv: readonly string[]) {
  const at = argv.indexOf('-RunId')

  return at === -1 ? undefined : argv[at + 1]
}

/** A Text matcher for `text` alone: `find` takes a plain string as a part of the text. */
export function whole(text: string) {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

/** How an endpoint answers a request: a status, body and headers, or `refused` when the request fails (no network). */
export type ApiAnswer = { status?: number; body?: unknown; headers?: Record<string, string> } | { refused: string }

/** The usage endpoint and the profile endpoint answering as given, signed in. */
export function fakeApi(on: On, answer: (url: string) => ApiAnswer) {
  const asked: string[] = []
  on('session.authorize', () => ({ value: { handle: 'h', kind: 'bearer' as const } }))
  on('http.fetch', (_$, e) => {
    asked.push(e.url)
    const answered = answer(e.url)
    if ('refused' in answered) {
      return { deny: answered.refused }
    }
    const { status = 200, body = {}, headers = {} } = answered

    return { value: { status, ok: status < 400, headers, text: typeof body === 'string' ? body : JSON.stringify(body) } }
  })

  return asked
}

export const mountBand = ($: Engine, surface: 'terminal' | 'desktop', props: Partial<typeof BAND> = {}) =>
  $.ui.mount({ plugin: 'account-switcher', surface, component: 'AbovePrompt', props: { ...BAND, ...props } })

export const mountList = ($: Engine, surface: 'terminal' | 'desktop', bodyColumns = 80) =>
  $.ui.mount({
    plugin: 'account-switcher',
    surface,
    component: 'Pane',
    requestId: 'accounts',
    props: { title: t('accounts.title'), isFocused: true, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })

/** The picker's options, by value. */
export async function pickerOptions(ui: Awaited<ReturnType<typeof mountBand>>) {
  return ((await ui.find({ key: 'account' }))?.props.options ?? []) as { value: string; label: string }[]
}

/** Starts a desktop session at NOW on a mocked clock, settled; the clock, to advance. */
export const startSession = async ($: Engine, on: On) => {
  const clock = mock.clock(on, { now: NOW })
  await $.session.start({ cwd: USER, surface: 'desktop', isInteractive: true })
  await clock.settle()

  return clock
}

/** A usage answer: the 5-hour window `percent` used, resetting in `resetsInMinutes`; the weekly one 61%. */
export const usageAnswer = (percent: number, resetsInMinutes = 102) => ({
  five_hour: { utilization: percent, resets_at: new Date(NOW + resetsInMinutes * 60_000).toISOString() },
  seven_day: { utilization: 61, resets_at: null },
})
