import type { EngineInterface } from 'claude-code'

import { asAccountId } from './json'
import { logFailure } from './log'

// What the session's environment says: where the mod runs, and for whom.

// The switcher swaps Claude Desktop's sign-in, on Windows. Anywhere else (Claude
// Code in a terminal, which signs in on its own; macOS) the mod stays out of the
// way. The answer is kept once the environment gave it; an environment that
// could not be read answers "no" this time and is asked again the next.
let isDesktopWindows: Promise<boolean> | null = null

export function isDesktopOnWindows($: EngineInterface) {
  isDesktopWindows ??= Promise.all([$.env.get('CLAUDE_CODE_ENTRYPOINT'), $.env.get('OS')]).then(
    ([entrypoint, os]) => entrypoint === 'claude-desktop' && os === 'Windows_NT',
    (error: unknown) => {
      isDesktopWindows = null
      logFailure($, 'reading where the mod runs', error)

      return false
    },
  )

  return isDesktopWindows
}

/** The account Claude Desktop runs this session for; null where the environment doesn't say. */
export async function signedInAccount($: EngineInterface) {
  return asAccountId(await $.env.get('CLAUDE_CODE_ACCOUNT_UUID'))
}

/** The email of the account this session runs for; null where the environment doesn't say. */
export async function signedInEmail($: EngineInterface) {
  const email = (await $.env.get('CLAUDE_CODE_USER_EMAIL'))?.trim()

  return email && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null
}

/** The organization this session runs in; null where the environment doesn't say. */
export async function signedInOrganization($: EngineInterface) {
  return asAccountId(await $.env.get('CLAUDE_CODE_ORGANIZATION_UUID'))
}
