import type { EngineInterface } from 'claude-code'

import { keepOnly } from '../platform/store'

// Every key the mod keeps in its store (platform/store.ts), declared here beside
// the rule that prunes the others. Each key names the version of its value's
// shape ("poll@1"): a value an older version of the mod kept under another key
// is never read as one of today's, and pruneStore drops it. A change to a
// value's shape bumps its key's version.

/** The poll the sessions share (services/poll.ts). */
export const POLL_KEY = 'poll@1'

/** The keys kept whatever profiles there are. */
const FIXED_KEYS: readonly string[] = [POLL_KEY]

const SNAPSHOT_PREFIX = 'limits@1:'

/** The last known limits of `account` (services/snapshots.ts), kept while a profile holds it. */
export function snapshotKey(account: string) {
  return `${SNAPSHOT_PREFIX}${account}`
}

/**
 * Drops every key that is not one of today's: the snapshots of accounts not in
 * `accounts`, and whatever earlier versions kept.
 */
export function pruneStore($: EngineInterface, accounts: readonly string[]) {
  return keepOnly($, new Set([...FIXED_KEYS, ...accounts.map(snapshotKey)]))
}
