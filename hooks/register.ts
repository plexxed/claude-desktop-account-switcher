import type { EngineInterface, Register } from 'claude-code'

import { isDesktopOnWindows } from './platform/env'
import { bestEffort } from './platform/log'
import { applyMeasure } from './services/meter'
import { pollLimits } from './services/poll'
import { ensureData, pruneToProfiles, startUpkeep } from './services/upkeep'
import { drawAccounts } from './ui/accounts'
import { PANE } from './ui/ids'
import { drawBand } from './ui/band'
import { scheduleTick } from './ui/tick'

// Claude Desktop account switcher: the band above the prompt with the context
// and the plan's limits, an account picker, and the Accounts list.
// This file only wires the hooks to the modules that own their work:
//
//   ui/        what the person sees and does: the band and the list
//   commands/  the commands the person gives, and how one runs
//   services/  the endpoints, the poll, the meter, the read model, the upkeep
//   domain/    the rules, pure: limits, levels, profiles and their names
//   platform/  the engine and Windows: environment, paths, the script, the store, state
//
// Each layer uses only the ones below it. Every hook does nothing outside
// Claude Desktop on Windows; each asks isDesktopOnWindows itself, as the hooks
// engine takes a hook only as a function literal, never one a helper returns.

/**
 * A session's start, in order: the data folder opened before anything reads
 * it; then the tick and the poll; then, in the background, the upkeep the
 * script does for the signed-in account, and only after it the pruning of what
 * no profile needs, which must see the profile the upkeep may have made.
 */
async function startSession($: EngineInterface) {
  await bestEffort($, 'opening the data folder', ensureData($))
  void scheduleTick($)
  void pollLimits($)
  void bestEffort(
    $,
    'the upkeep at the session start',
    startUpkeep($).then(() => pruneToProfiles($)),
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (await isDesktopOnWindows($)) {
      await startSession($)
    }

    return next(e)
  })

  // When Claude has answered, its cost is in the account's limits: poll now,
  // the next a minute on. A subagent's turn ends inside the main one.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && (await isDesktopOnWindows($))) {
      void pollLimits($, true)
    }

    return next(e)
  })

  // Pushed after each turn and whenever a limit window moves; the band redraws from it.
  on('session.measure', async ($, e, next) => {
    if (await isDesktopOnWindows($)) {
      await applyMeasure($, e.context, e.rateLimits)
    }

    return next(e)
  })

  // The mod draws in Claude Desktop alone.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) =>
    e.surface !== 'desktop' || e.props.hasSurvey || !(await isDesktopOnWindows($)) ? next(e) : drawBand($, e),
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) =>
    e.surface !== 'desktop' || !(await isDesktopOnWindows($)) ? next(e) : drawAccounts($, e, 'pane'),
  )
}
