import type { EngineInterface } from 'claude-code'

import type { Busy, Limit, Panel } from '../../types'
import type { Profile } from '../domain/profiles'
import { signedInEmail } from '../platform/env'
import { readBusy, readMeter, readPanel } from '../platform/state'
import { readProfiles } from '../services/readModel'
import { readSnapshot } from '../services/snapshots'
import type { Snapshot } from '../services/snapshots'
import { UNNAMED } from './ids'
import { t } from './strings'

// What the Accounts list shows, as plain data (accounts.tsx renders it): a card
// per account, the signed-in one first, then what the list offers beside them.

/** Where the list is drawn: the side pane, or unfolded in the band, at its text size. */
export type Variant = 'pane' | 'band'

/** What a card says of its account's limits, or why it has none to show. */
export type Usage =
  { kind: 'limits'; limits: Limit[]; seenAt: number | null } | { kind: 'noSignIn' } | { kind: 'noWindow' } | { kind: 'noUsage' }

/** One account's card, as drawn. */
export type Card = {
  profile: Profile
  /** Its name, or "This account" while no profile holds it. */
  title: string
  isCurrent: boolean
  isUnnamed: boolean
  usage: Usage
  /** What the card is doing: asking to switch or delete, renaming, or nothing. */
  state: 'idle' | 'switch' | 'delete' | 'rename'
}

export type AccountsModel = {
  variant: Variant
  columns: number
  cards: Card[]
  /** The saved profiles' names, which a new name must not take. */
  taken: string[]
  /** The profiles, by name, for the sharing section. */
  sharing: Pick<Profile, 'name' | 'sharesSessions'>[]
  isAdding: boolean
  /** Whether an account other than the signed-in one may be switched to (one holds the signed-in account). */
  canSwitch: boolean
  busy: Busy | null
  /** Whether the script's list of the profiles could be read; while not, the list says so. */
  isReadable: boolean
}

function cardState(panel: Panel, name: string): Card['state'] {
  return panel.kind !== 'idle' && panel.kind !== 'add' && panel.profile === name ? panel.kind : 'idle'
}

/**
 * What a card says of its account's limits: the limits, live for the account
 * signed in now, else the last seen with when they were seen; or why there are
 * none (no saved sign-in; a plan with no window, as the server answered; none seen yet).
 */
function cardUsage(profile: Profile, isCurrent: boolean, live: Limit[], snapshot: Snapshot | null): Usage {
  if (!isCurrent && !profile.hasSignIn) {
    return { kind: 'noSignIn' }
  }
  // The signed-in account's figures are live once this session has any; until then, its last known ones.
  const isLive = isCurrent && live.length > 0
  const limits = isLive ? live : (snapshot?.limits ?? [])
  if (limits.length) {
    return { kind: 'limits', limits, seenAt: isLive ? null : (snapshot?.at ?? null) }
  }

  return snapshot !== null && snapshot.limits.length === 0 ? { kind: 'noWindow' } : { kind: 'noUsage' }
}

export async function loadAccounts($: EngineInterface, columns: number, variant: Variant): Promise<AccountsModel> {
  const [{ list, current, isReadable }, panel, busy, meter, email] = await Promise.all([
    readProfiles($),
    readPanel($),
    readBusy($),
    readMeter($),
    signedInEmail($),
  ])
  // The account signed in now, while no profile holds it: by its email, where Claude says it.
  const unnamed: Profile = { name: UNNAMED, account: null, email, sharesSessions: false, hasSignIn: true }
  const signedIn = current ?? unnamed
  const rows = [signedIn, ...list.filter(one => one !== current)]
  const snapshots = await Promise.all(rows.map(one => readSnapshot($, one.account)))
  const cards = rows.map((profile, i): Card => {
    const isCurrent = profile === signedIn
    const isUnnamed = profile.name === UNNAMED

    return {
      profile,
      title: isUnnamed ? t('account.unnamed') : profile.name,
      isCurrent,
      isUnnamed,
      usage: cardUsage(profile, isCurrent, meter?.limits ?? [], snapshots[i] ?? null),
      state: cardState(panel, profile.name),
    }
  })

  return {
    variant,
    columns,
    cards,
    taken: list.map(one => one.name),
    sharing: list.map(({ name, sharesSessions }) => ({ name, sharesSessions })),
    isAdding: panel.kind === 'add',
    canSwitch: current !== null,
    busy,
    isReadable,
  }
}
