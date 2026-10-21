/** A Map that keeps at most a number of entries. */
export type BoundedMap<K, V> = { get: (key: K) => V | undefined; set: (key: K, value: V) => void }

/**
 * A map of at most `max` entries: a read or a write makes an entry the most
 * recent, and past `max` the least recent goes.
 */
export function boundedMap<K, V>(max: number): BoundedMap<K, V> {
  const entries = new Map<K, V>()
  const set = (key: K, value: V) => {
    entries.delete(key)
    entries.set(key, value)
    if (entries.size > max) {
      entries.delete(entries.keys().next().value!)
    }
  }

  return {
    get: key => {
      if (!entries.has(key)) {
        return undefined
      }
      const value = entries.get(key)!
      set(key, value)

      return value
    },
    set,
  }
}
