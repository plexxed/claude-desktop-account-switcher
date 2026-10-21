/** What the band is doing: idle, confirming a switch, or listing accounts in place. */
export type Mode = { kind: 'idle' } | { kind: 'confirm'; target: string } | { kind: 'manage' }

/** What the Accounts pane is doing: listing, or acting on one profile inline. */
export type Panel =
  | { kind: 'idle' }
  | { kind: 'rename'; profile: string }
  | { kind: 'delete'; profile: string }
  | { kind: 'switch'; profile: string }
  | { kind: 'add' }

/** A command of the switcher that changes the profiles or the sign-in (hooks/commands/registry.ts). */
export type ProfileCommand = 'switch' | 'save' | 'add' | 'new' | 'rename' | 'delete' | 'share'

/**
 * A command the person gave that is running (the script's command and the
 * profile it names): nothing that would start another is offered meanwhile.
 * `id`: the run's own, which only that run ends or extends (and a run handed
 * off goes under); `until`: when the wait is over whatever happened (ms since
 * the epoch), so a wait whose module was reloaded meanwhile ends too.
 */
export type Busy = { id: string; command: ProfileCommand; profile: string; until: number }

/**
 * One rate-limit window as the band shows it. `label`: the name the server gave
 * it, where it gives one. `spend`: for a window counted in money, what was spent
 * and the cap (null when there is none), in minor units of `currency` (cents),
 * an ISO 4217 code.
 */
export type Limit = { kind: string; percentUsed: number; resetsAt?: string; label?: string; spend?: Spend }

export type Spend = { used: number; limit: number | null; currency: string }

/** The last figures the engine measured: context fill and rate-limit windows. */
export type Meter = {
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number
  /** Token counts where the context turns yellow and red, as Claude Code's own indicator. */
  contextAt: ContextThresholds
  limits: Limit[]
}

/** `compactAt`: where auto-compaction runs, null when it is off. */
export type ContextThresholds = { warnAt: number; errorAt: number; compactAt: number | null }

declare module 'claude-code' {
  interface PluginState {
    // busy and meter are kept with a shape tag (hooks/platform/state.ts): Claude Code's
    // Shaped<T>, spelled out, as this contract may import nothing.
    'account-switcher': {
      mode: Mode
      panel: Panel
      busy: { shape: string; value: Busy | null }
      meter: { shape: string; value: Meter | null }
    }
  }
}
