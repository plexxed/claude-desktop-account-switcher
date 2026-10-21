import type { Busy } from '../../types'
import { DETACHED_BUSY_MS } from '../commands/run'
import type { CommandOutcome, HandOffEnd } from '../commands/run'
import { NAME_MAX } from '../domain/profileNames'
import type { NameProblem } from '../domain/profileNames'
import type { Failure } from '../services/switcher'
import { plural, t } from './strings'

// What the band and the Accounts pane say of a command: what it costs, while
// it runs, and how it went. Pure: the words, from strings.ts.

/** What a switch costs, said before it runs. */
export function switchNote(isSignInNext: boolean) {
  return t(isSignInNext ? 'switch.noteSignIn' : 'switch.note')
}

/** What a delete costs, said before it runs. */
export function deleteNote(hasSignIn: boolean) {
  return t(hasSignIn ? 'delete.noteSignIn' : 'delete.noteNoSignIn')
}

/** What the band and the list say while `busy` runs: "Deleting home…". */
export function busyText(busy: Busy) {
  return t(`busy.${busy.command}`, { name: busy.profile })
}

/** The last line of `text`; null when it is empty. */
export function lastLine(text: string) {
  const trimmed = text.trim()

  return trimmed ? trimmed.split('\n').pop()!.trim() : null
}

/** What a failed run said, in one line: the last line it said, else its exit code. */
export function failureLine(failure: Pick<Failure, 'reason' | 'code' | 'said'>) {
  if (failure.reason === 'notRun') {
    return t('script.notRun', { message: failure.said })
  }

  return lastLine(failure.said) ?? t('script.exit', { code: failure.code })
}

/** Why `name` can't be a profile's name: it breaks the rules, which it names, or another profile has it. */
export function nameProblemText(problem: NameProblem, name: string) {
  return problem === 'taken' ? t('name.taken', { name }) : t('name.invalid', { name, rules: t('name.rules', { max: NAME_MAX }) })
}

/** Why a word of a command was refused before anything ran: a name no profile may have, or not on|off. */
export function refusalText(refused: Extract<CommandOutcome, { kind: 'refused' }>) {
  return refused.expects === 'name' ? nameProblemText('invalid', refused.operand) : t('toggle.invalid', { word: refused.operand })
}

/**
 * Why a switch handed off came to nothing while Claude stayed open: it failed,
 * it never started, or Claude did not close in time; null when it was done.
 */
export function handOffFailure(end: HandOffEnd) {
  switch (end.kind) {
    case 'failed':
      return end.message ?? t('handOff.failedUnsaid')
    case 'notStarted':
      return t('handOff.notStarted')
    case 'timedOut':
      return plural('handOff.timedOut', DETACHED_BUSY_MS / 60_000)
    case 'done':
      return null
  }
}
