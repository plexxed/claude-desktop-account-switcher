import type { ButtonProps, EngineInterface } from 'claude-code'

import type { ProfileCommand } from '../../types'
import { runProfileCommand } from '../commands/run'
import type { CommandOutcome, HandOffEnd } from '../commands/run'
import { PANE } from './ids'
import { failureLine, handOffFailure, refusalText } from './messages'
import { t } from './strings'
import { button } from './styles'

// What the band and the Accounts pane do alike: the actions their buttons
// run, and how they tell the person how a command went.

/** A button of the band or the list: its key, its label, its look, what it does. */
export type Action = { key: string; label: string; look?: Partial<ButtonProps>; onPress: () => unknown }

export function openAccounts($: EngineInterface) {
  return $.ui.open({ id: PANE, title: t('accounts.title'), focus: true, closeOnEscape: true })
}

/** Tells the person, in a toast, why a switch handed off came to nothing while Claude stayed open. */
function reportHandOff($: EngineInterface, end: HandOffEnd) {
  const message = handOffFailure(end)
  if (message !== null) {
    $.ui.toast(t('toast.failed', { message }))
  }
}

/** The answer to a switch's question, in the band and on a card alike: Switch, which runs it. */
export function switchAnswer($: EngineInterface, name: string): Action {
  return { key: 'confirm', label: t('action.switch'), look: button.primary, onPress: () => runFromUi($, 'switch', [name]) }
}

/**
 * Runs a command from the band or the pane (see runProfileCommand). While one
 * runs, the band and the list say so in place of what would start another, and
 * a press that comes anyway does nothing. A failure shows as a toast, in one
 * line, also one of a switch handed off. Resolves the run when it succeeded,
 * else null.
 */
export async function runFromUi(
  $: EngineInterface,
  command: ProfileCommand,
  operands: string[],
): Promise<Extract<CommandOutcome, { kind: 'done' }> | null> {
  const outcome = await runProfileCommand($, command, operands, end => reportHandOff($, end))
  switch (outcome.kind) {
    case 'done':
      return outcome
    case 'failed':
      $.ui.toast(t('toast.failed', { message: failureLine(outcome.failure) }))
      return null
    case 'refused':
      $.ui.toast(t('toast.failed', { message: refusalText(outcome) }))
      return null
    case 'running':
      return null
  }
}
