import type { ProfileCommand } from '../../types'
import { isProfileName } from '../domain/profileNames'

// Every command the person can give, in one table: the band and the Accounts
// list run them (commands/run.ts), and each one's words are in ui/strings.ts by
// its name (`busy.<name>`).

/** What a word after a command's name is: a profile's name, or on|off. */
export type OperandKind = 'name' | 'toggle'

/** The words a toggle takes. */
export const TOGGLE_WORDS = ['on', 'off'] as const

/**
 * What a command does: a command of switch.ps1 that changes the profiles or
 * the sign-in, run one at a time (runProfileCommand), and whether it closes
 * Claude, which must run outside its process tree (`isDetached`). `operands`:
 * what each word after its name is.
 */
type ProfileSpec = { operands: readonly OperandKind[]; isDetached?: boolean }

export const COMMANDS = {
  switch: { operands: ['name'], isDetached: true },
  save: { operands: ['name'] },
  add: { operands: ['name'] },
  new: { operands: ['name'], isDetached: true },
  rename: { operands: ['name', 'name'] },
  delete: { operands: ['name'] },
  share: { operands: ['name', 'toggle'] },
} as const satisfies Record<ProfileCommand, ProfileSpec>

/** A command's spec, read through its general shape. */
export function profileSpec(name: ProfileCommand): ProfileSpec {
  return COMMANDS[name]
}

/** Whether `word` can be an operand of `kind`: a name a profile may have, or on|off in any case, as the script reads it. */
export function isOperand(kind: OperandKind, word: string) {
  return kind === 'name' ? isProfileName(word) : TOGGLE_WORDS.some(one => one === word.toLowerCase())
}
