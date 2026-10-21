import type { EngineInterface } from 'claude-code'

import { logFailure } from '../platform/log'

// The countdowns read to the minute, so the band and the list redraw as each
// minute turns, even when nothing else changed.

const TICK_MS = 60_000
// How far past :00 a tick runs, so the minute has surely turned.
const TICK_PAST_MINUTE_MS = 100

/**
 * Each minute, just past :00 when the countdowns turn, a redraw. Each wait is
 * reckoned anew, so the ticks never drift off the minute.
 */
export async function scheduleTick($: EngineInterface) {
  try {
    const now = await $.clock.now()
    $.clock.after(TICK_MS - (now % TICK_MS) + TICK_PAST_MINUTE_MS, () => {
      $.ui.invalidate('ui.render')
      void scheduleTick($)
    })
  } catch (error) {
    // The session is ending, or this module was reloaded: its successor ticks.
    logFailure($, 'scheduling the next tick', error)
  }
}
