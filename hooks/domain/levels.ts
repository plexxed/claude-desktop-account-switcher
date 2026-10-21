import type { ContextThresholds } from '../../types'
import { limitLevels } from './limits'

// Whether a figure needs attention, as Claude colors it; ui/styles.ts says how each level looks.

export type Level = 'success' | 'warning' | 'error'

/** A limit `percent` used, by where its kind turns yellow and red (domain/limits.ts' LIMIT_KINDS). */
export function limitLevel(kind: string, percent: number): Level {
  const { warnAt, errorAt } = limitLevels(kind)

  return percent >= errorAt ? 'error' : warnAt !== null && percent >= warnAt ? 'warning' : 'success'
}

/**
 * The context as Claude Code's own indicator colors it (token counts, not a
 * percentage): yellow once `warnAt` is reached, red from `errorAt`.
 */
export function contextLevel(tokens: number | null, at: Pick<ContextThresholds, 'warnAt' | 'errorAt'>): Level {
  if (tokens === null) {
    return 'success'
  }

  return tokens >= at.errorAt ? 'error' : tokens >= at.warnAt ? 'warning' : 'success'
}
