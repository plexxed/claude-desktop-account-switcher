import type { EngineInterface } from 'claude-code'

import { currentProfile } from '../domain/profiles'
import type { Profile, Profiles, SeenAccount } from '../domain/profiles'
import { signedInAccount } from '../platform/env'
import { asAccountId, asString, isRecord } from '../platform/json'
import { bestEffort } from '../platform/log'
import { readDataFile } from './dataFiles'

// The saved profiles, as the script's read model has them (index.json, its
// shape documented in scripts/Private/Index.ps1): the script writes it whole
// after every change, and the mod asks the script for every change. Both sides
// are tested against tests/fixtures/index-sample.ts. Every drawing reads it, so
// it is parsed again only once the script has written it anew.

/** The read model's file in the data folder; the script's Paths.Index. */
export const INDEX_FILE = 'index.json'

/** The version of index.json's shape this mod reads; the script's IndexVersion. */
export const INDEX_VERSION = 1

export type Index = { lastSwitchedTo: string | null; list: Profile[]; accounts: Record<string, SeenAccount> }

function asProfile(value: unknown): Profile | null {
  if (!isRecord(value) || typeof value.name !== 'string' || value.name === '') {
    return null
  }

  return {
    name: value.name,
    account: asAccountId(value.account),
    email: asString(value.email),
    sharesSessions: value.sharesSessions === true,
    hasSignIn: value.hasSignIn === true,
  }
}

/** index.json's content read, or null when it has another version's shape. */
export function asIndex(value: unknown): Index | null {
  if (!isRecord(value) || value.version !== INDEX_VERSION || !Array.isArray(value.profiles)) {
    return null
  }
  const accounts: Record<string, SeenAccount> = {}
  for (const [key, entry] of Object.entries(isRecord(value.accounts) ? value.accounts : {})) {
    const id = asAccountId(key)
    if (id && isRecord(entry)) {
      accounts[id] = { org: asAccountId(entry.org), email: asString(entry.email) }
    }
  }

  return {
    lastSwitchedTo: asString(value.lastSwitchedTo),
    list: value.profiles.map(asProfile).filter((one): one is Profile => one !== null),
    accounts,
  }
}

/** index.json, or null when it is missing, does not parse, or has another version's shape. */
export function readIndex($: EngineInterface) {
  return readDataFile($, INDEX_FILE, asIndex, { isKept: true })
}

export async function readProfiles($: EngineInterface): Promise<Profiles> {
  const index = await bestEffort($, 'reading index.json', readIndex($))
  if (!index) {
    return { list: [], current: null, accounts: {}, isReadable: false }
  }
  const current = currentProfile(index.list, await signedInAccount($), index.lastSwitchedTo)

  return { list: index.list, current, accounts: index.accounts, isReadable: true }
}
