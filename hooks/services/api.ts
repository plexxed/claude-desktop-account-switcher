import type { EngineInterface } from 'claude-code'

import type { Limit } from '../../types'
import { isRecord, parseJson } from '../platform/json'
import type { Fields } from '../platform/json'
import { localTimeZone } from '../platform/timezone'
import { usageLimits } from './usageAnswer'

// The two Anthropic endpoints the mod reads, both undocumented: the ones Claude
// Code's own /usage and account screens read, with the session's own sign-in.
// Either may change without notice; every caller treats a failure as "no news".

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile'
const OAUTH_BETA = 'oauth-2025-04-20'

async function get($: EngineInterface, url: string) {
  const authorization = await $.session.authorize()
  if (!authorization || authorization.kind !== 'bearer') {
    return null
  }

  return $.http.fetch(url, { auth: authorization.handle, headers: { 'anthropic-beta': OAUTH_BETA } })
}

/** An answer's body when it is a JSON object, else null. */
function parse(text: string): Fields | null {
  const value = parseJson(text)

  return isRecord(value) ? value : null
}

/**
 * The account-wide usage: every session, the chat and the phone count toward
 * it, unlike the figures a reply of this session carries. `limits`: null when
 * there was no answer, empty when the plan has no 5-hour or weekly window (an
 * Enterprise seat, say). `retryAfterMs`: how long the server asked to wait
 * (Retry-After, on a 429 or a 503), when it said.
 */
export type FetchedLimits = { limits: Limit[] | null; retryAfterMs?: number }

export async function fetchLimits($: EngineInterface): Promise<FetchedLimits> {
  const response = await get($, USAGE_URL)
  if (!response) {
    return { limits: null }
  }
  if (!response.ok) {
    const seconds = Number(response.headers['retry-after'])

    return Number.isFinite(seconds) && seconds > 0 ? { limits: null, retryAfterMs: seconds * 1000 } : { limits: null }
  }
  const body = parse(response.text)
  if (!body) {
    return { limits: null }
  }

  return { limits: usageLimits(body, await $.clock.now(), await localTimeZone($)) }
}

/**
 * The signed-in account's own name: its display name, else its full name, else
 * the part of its email before the @; null when there is none or it can't be read.
 */
export async function fetchAccountName($: EngineInterface): Promise<string | null> {
  const response = await get($, PROFILE_URL)
  const body = response?.ok ? parse(response.text) : null
  const fields = body?.account
  const account = isRecord(fields) ? fields : undefined
  const email = typeof account?.email === 'string' ? account.email.split('@')[0] : undefined

  return (
    [account?.display_name, account?.full_name, email].find((one): one is string => typeof one === 'string' && one.trim() !== '') ?? null
  )
}
