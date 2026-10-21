// Local time in a time zone named as IANA names it ("Europe/Athens"). Each moment
// is read with the offset the zone has at that moment, so a time on the far side
// of a change of daylight saving time reads as the clock will show it then.

/** A moment as a wall clock in the zone reads it; `month` counts from 0, as Date's does. */
export type WallClock = { year: number; month: number; day: number; hour: number; minute: number }

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string) {
  let one = formatters.get(timeZone)
  if (!one) {
    one = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    })
    formatters.set(timeZone, one)
  }

  return one
}

/** `ms` as a wall clock in `timeZone` reads it. */
export function wallClock(ms: number, timeZone: string): WallClock {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(ms)
      .map(part => [part.type, part.value]),
  )

  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

/** The days from the epoch to the local date `clock` reads. */
export function dayNumber(clock: WallClock) {
  return Math.floor(Date.UTC(clock.year, clock.month, clock.day) / 86_400_000)
}

/** How far ahead of UTC `timeZone` is at `ms`, in milliseconds (to the minute, as zones go). */
function offsetAt(ms: number, timeZone: string) {
  const clock = wallClock(ms, timeZone)

  return Date.UTC(clock.year, clock.month, clock.day, clock.hour, clock.minute) - Math.floor(ms / 60_000) * 60_000
}

/**
 * The moment the wall clock in `timeZone` reads `year`, `month` (from 0, past 11
 * into the next year, as Date.UTC takes it) and `day` at midnight. The offset is
 * the one the zone has then, not now; a midnight a change of time skips reads as
 * the first moment after it.
 */
export function localMidnight(year: number, month: number, day: number, timeZone: string) {
  const asUtc = Date.UTC(year, month, day)
  const guess = asUtc - offsetAt(asUtc, timeZone)

  return asUtc - offsetAt(guess, timeZone)
}
