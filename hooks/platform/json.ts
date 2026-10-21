// JSON from outside the mod (the script's files, the store, the endpoints'
// answers): parsed without throwing, and told apart by shape before use. Each
// `as*` reads one value: the value when it has that shape, else null.

export type Fields = Record<string, unknown>

/** A JSON object: not null, not an array. */
export function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `text` parsed; undefined when it is not JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** A finite number. */
export function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A string. */
export function asString(value: unknown) {
  return typeof value === 'string' ? value : null
}

/** A currency's ISO 4217 code ("USD"), in capitals. */
export function asCurrency(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** An account or organization id, as the script writes it (lower case). */
export function asAccountId(value: unknown) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}
