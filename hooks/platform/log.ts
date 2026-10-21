import type { EngineInterface } from 'claude-code'

// Failures the person need not see: the debug log (`claude --debug`), never the screen.

/** What `error` says, whatever was thrown. */
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Writes a failure to the debug log; where there is no log any more (the session ended), nowhere. */
export function logFailure($: EngineInterface, what: string, error: unknown) {
  try {
    $.ui.log(`${what}: ${errorMessage(error)}`, { to: 'debug' })
  } catch {
    // The session is gone, and its log with it.
  }
}

/**
 * Work the person did not ask for and need not wait on: its result, or null
 * when it failed, the failure in the debug log as `what`.
 */
export async function bestEffort<T>($: EngineInterface, what: string, work: Promise<T>): Promise<T | null> {
  try {
    return await work
  } catch (error) {
    logFailure($, what, error)
    return null
  }
}
