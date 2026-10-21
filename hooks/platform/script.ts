import type { EngineInterface } from 'claude-code'

import { errorMessage } from './log'
import { powershell } from './paths'

// A PowerShell script of the mod's own as a process: how it is started, and how
// a run that could not start reads. What a script's arguments and exit codes
// mean is its caller's (services/switcher.ts, for the switcher).

/** The exit code of a run that could not start or did not end in time. */
export const NOT_RUN = -1

export type ScriptResult = Awaited<ReturnType<EngineInterface['process']['run']>>

/**
 * Runs `script` (a path from the mod's root) with `args`, waiting `timeoutMs`
 * at most. Never rejects: a run that could not start or did not end in time
 * reads as exit code NOT_RUN, with why on its standard error.
 */
export async function runScript($: EngineInterface, script: string, args: readonly string[], timeoutMs: number): Promise<ScriptResult> {
  const argv = [await powershell($), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${$.plugin.root}/${script}`, ...args]
  try {
    return await $.process.run(argv, { timeoutMs })
  } catch (error) {
    return { exitCode: NOT_RUN, stdout: '', stderr: errorMessage(error), isStdoutTruncated: false, isStderrTruncated: false }
  }
}
