import type { EngineInterface } from 'claude-code'

import { parseJson } from '../platform/json'
import { dataFile } from '../platform/paths'

// The JSON files the script keeps in the data folder for the mod (index.json,
// switch.json), read without trust: each file by its name and the `as*` that
// tells its shape apart.

// What a file read to be kept held, by its name: one reader per file.
const kept = new Map<string, { path: string; mtimeMs: number; size: number; value: unknown }>()

/**
 * Data file `name` as `as` reads it, or null when it is missing, does not
 * parse, or has another shape. `isKept`: what it held when read last is
 * answered again until the file changes (its time or size), for a file read
 * on every redraw.
 */
export async function readDataFile<T>($: EngineInterface, name: string, as: (value: unknown) => T | null, { isKept = false } = {}) {
  const path = await dataFile($, name)
  if (!path || !(await $.fs.exists(path))) {
    return null
  }
  if (!isKept) {
    return as(parseJson(await $.fs.read(path)))
  }
  const { mtimeMs, size } = await $.fs.stat(path)
  const last = kept.get(name)
  if (last?.path === path && last.mtimeMs === mtimeMs && last.size === size) {
    return last.value as T | null
  }
  const value = as(parseJson(await $.fs.read(path)))
  kept.set(name, { path, mtimeMs, size, value })

  return value
}
