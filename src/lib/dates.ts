// Day bucketing + labels, all in the tournament's display timezone (PT, matching
// the prototype's "9:00 AM PT"). Offsets are whole calendar days from "today".

const TZ = 'America/Los_Angeles'

function ymdMidnightUTC(d: Date): number {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .split('-')
    .map(Number)
  return Date.UTC(y, m - 1, day)
}

// whole calendar days (in PT) from today to the match date
export function dayOffset(iso: string): number {
  return Math.round((ymdMidnightUTC(new Date(iso)) - ymdMidnightUTC(new Date())) / 86_400_000)
}

export function timeLabel(iso: string): string {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(
      new Date(iso),
    ) + ' PT'
  )
}

// a Date sitting at ~noon PT on (PT-today + offset days)
function dateForOffset(off: number): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .split('-')
    .map(Number)
  return new Date(Date.UTC(y, m - 1, d, 19) + off * 86_400_000)
}

export function relName(off: number): string {
  if (off === 0) return 'Today'
  if (off === -1) return 'Yesterday'
  if (off === 1) return 'Tomorrow'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dateForOffset(off))
}

export function fullLabel(off: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(dateForOffset(off))
}
