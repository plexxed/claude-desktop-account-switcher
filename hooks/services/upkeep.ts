import type { EngineInterface } from 'claude-code'

import { toProfileName } from '../domain/profileNames'
import { signedInAccount, signedInEmail, signedInOrganization } from '../platform/env'
import { bestEffort, logFailure } from '../platform/log'
import { dataDir } from '../platform/paths'
import { fetchAccountName } from './api'
import { readIndex, readProfiles } from './readModel'
import { pruneStore } from './storeKeys'
import { runSwitcher } from './switcher'
import type { StartOptions, SwitcherCall } from './switcher'

// What the mod keeps in order by itself, which the person did not ask for: the
// data folder opened, the signed-in account noted and given a profile, and the
// store pruned to what the profiles need.

/**
 * Runs the script for the mod's own upkeep, which the person did not ask for:
 * a redraw when it succeeded, the debug log when it failed (`what` it was doing).
 */
async function runUpkeep($: EngineInterface, call: SwitcherCall, what: string) {
  const result = await runSwitcher($, call)
  if (result.isOk) {
    $.ui.invalidate('ui.render')
  } else {
    logFailure($, what, `${result.said} (exit ${result.code})`)
  }
}

/**
 * Has the script open the data folder when the read model is not there to read
 * (a first run, an update that changed its shape): before anything reads it
 * and finds it empty.
 */
export async function ensureData($: EngineInterface) {
  const dir = await dataDir($)
  const index = dir ? await bestEffort($, 'reading index.json', readIndex($)) : null
  if (!index) {
    await runUpkeep($, { command: 'init' }, 'opening the data folder')
  }
}

/**
 * What a session's start asks of the script, in one run and only when there is
 * something to ask: that it note the organization the signed-in account runs
 * Code sessions in (where the script finds its session list before it holds a
 * session) and its email (which the Accounts list shows), when either changed;
 * and that it give the account a profile when none holds it. The profile just
 * switched to and signed in to on Claude's own sign-in screen then holds it
 * from now, not from the next switch; else a new one is made, named after the
 * account (its name read here, made fit), numbered when that is taken, else
 * Account1, Account2, ... Nothing closes.
 */
export async function startUpkeep($: EngineInterface) {
  const [{ current, accounts }, account, organization, email] = await Promise.all([
    readProfiles($),
    signedInAccount($),
    signedInOrganization($),
    signedInEmail($),
  ])
  const seen = account ? accounts[account] : undefined
  const isNoteDue = account !== null && ((organization !== null && organization !== seen?.org) || (email !== null && email !== seen?.email))
  const isProfileDue = !current?.account
  if (!isNoteDue && !isProfileDue) {
    return
  }
  const raw = current ? null : await bestEffort($, 'reading the account name', fetchAccountName($))
  const name = raw ? toProfileName(raw) : null
  // Each only when known.
  const options: StartOptions = {
    ...(account ? { Account: account } : {}),
    ...(name ? { DisplayName: name } : {}),
    ...(isNoteDue && organization ? { Organization: organization } : {}),
    ...(isNoteDue && email ? { Email: email } : {}),
  }
  await runUpkeep($, { command: 'start', options }, 'the upkeep at the session start')
}

/**
 * Drops from the store what no profile needs any more: the last limits of
 * accounts none holds. While the profiles can't be read, nothing: no profile
 * would read as none needing them.
 */
export async function pruneToProfiles($: EngineInterface) {
  const { list, isReadable } = await readProfiles($)
  if (!isReadable) {
    return
  }
  await pruneStore(
    $,
    list.flatMap(one => (one.account ? [one.account] : [])),
  )
}
