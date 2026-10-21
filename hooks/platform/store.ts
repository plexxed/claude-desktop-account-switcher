import type { EngineInterface } from 'claude-code'

// The mod's store, one JSON file every session on the machine reads and writes.
// Which keys the mod keeps there, and what each holds, is services/storeKeys.ts's.

/** Drops every key of the store but those of `kept`. */
export async function keepOnly($: EngineInterface, kept: ReadonlySet<string>) {
  for (const key of await $.store.keys()) {
    if (!kept.has(key)) {
      await $.store.delete(key)
    }
  }
}
