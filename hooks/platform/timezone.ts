import type { EngineInterface } from 'claude-code'

// The local time zone, by its IANA name, that times are shown in: the hooks
// environment's own, as Intl knows it, unless TZ names another, as POSIX tools
// read it. A TZ that Intl does not know is passed over.

function isTimeZone(name: string) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone !== ''
  } catch {
    return false
  }
}

export async function localTimeZone($: EngineInterface) {
  const named = (await $.env.get('TZ'))?.trim()

  return named && isTimeZone(named) ? named : Intl.DateTimeFormat().resolvedOptions().timeZone
}
