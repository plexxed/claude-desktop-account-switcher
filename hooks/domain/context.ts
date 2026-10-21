import type { ContextThresholds } from '../../types'

// Where the context figure turns yellow and red, as Claude Code's own indicator
// reckons it. Pure: services/meter.ts makes the meter from the engine's figures.

/**
 * What the thresholds are reckoned from: the model's window and, where the
 * engine broke the context down, the window it compacts against and whether
 * and where auto-compaction runs (the shape of the engine's SessionContextUsage).
 */
export type ContextWindow = {
  window: number
  breakdown?: { rawMaxTokens: number; isAutoCompactEnabled: boolean; autoCompactThreshold?: number }
}

// As Claude Code's own indicator has it: the window less 20k kept for the reply;
// auto-compaction 13k below that; yellow from 20k before compaction (before the
// end of the window when it is off), red at compaction (3k before the end when off).
const REPLY_RESERVE = 20_000
const COMPACT_BUFFER = 13_000
const WARN_BUFFER = 20_000
const BLOCK_BUFFER = 3_000

/** From the engine's breakdown when it has one, else from the window alone, as with auto-compaction on. */
export function contextThresholds(context: ContextWindow): ContextThresholds {
  const breakdown = context.breakdown
  const usable = (breakdown?.rawMaxTokens ?? context.window) - REPLY_RESERVE
  const blockAt = context.window - REPLY_RESERVE - BLOCK_BUFFER
  const compactAt = breakdown
    ? breakdown.isAutoCompactEnabled
      ? (breakdown.autoCompactThreshold ?? usable - COMPACT_BUFFER)
      : null
    : usable - COMPACT_BUFFER

  return {
    warnAt: (compactAt ?? usable) - WARN_BUFFER,
    errorAt: compactAt === null ? blockAt : Math.min(compactAt, blockAt),
    compactAt,
  }
}
