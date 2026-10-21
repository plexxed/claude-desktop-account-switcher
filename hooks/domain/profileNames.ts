import { isSameName } from './profiles'

// What a profile's name may be, as Assert-ProfileName in the script has it (both
// are tested against tests/fixtures/profile-names.ts): a folder name, up to 40
// UTF-16 units, none of the characters Windows refuses there, no space or "-"
// first (it would read as a parameter), no space or dot last, no device name.

/** The longest a name may be, in UTF-16 units. */
export const NAME_MAX = 40
// The control characters are among the ones Windows refuses in a folder name.
// eslint-disable-next-line no-control-regex
const UNSAFE_CHAR = /[<>:"/\\|?*\u0000-\u001f]/
const UNSAFE_CHARS = new RegExp(UNSAFE_CHAR.source, 'g')
const RESERVED_NAME = /^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i

/** Why a name can't be taken: it breaks the rules, or another profile has it. */
export type NameProblem = 'invalid' | 'taken'

/**
 * Why `name` can't be a profile's name, or null when it can. A name another
 * profile has in another case is taken too; `renaming`, the profile being
 * renamed, may take its own name in another case.
 */
export function nameProblem(name: string, taken: string[], renaming?: string): NameProblem | null {
  if (!isProfileName(name)) {
    return 'invalid'
  }

  return taken.some(one => one !== renaming && isSameName(one, name)) ? 'taken' : null
}

/** Whether `name` keeps the rules of a profile's name, whatever profiles there are. */
export function isProfileName(name: string) {
  const isFolderSafe = name.length > 0 && name.length <= NAME_MAX && !UNSAFE_CHAR.test(name)

  return isFolderSafe && !/^[\s-]/.test(name) && !/[\s.]$/.test(name) && !RESERVED_NAME.test(name)
}

/** `text` cut to at most `max` UTF-16 units, never inside a character. */
function cutUnits(text: string, max: number) {
  let cut = ''
  for (const ch of text) {
    if (cut.length + ch.length > max) {
      break
    }
    cut += ch
  }

  return cut
}

/** `raw` (an account's display name, say) made fit for a profile name; null when nothing is left. */
export function toProfileName(raw: string) {
  const name = cutUnits(
    raw
      .replace(UNSAFE_CHARS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^-+\s*/, ''),
    NAME_MAX,
  ).replace(/[\s.]+$/, '')

  return name && !RESERVED_NAME.test(name) ? name : null
}
