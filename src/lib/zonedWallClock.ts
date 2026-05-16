/**
 * Converts a civil date/time in an IANA zone to UTC epoch milliseconds.
 * Used so boss schedules are the same instant for every player; display in local time separately.
 */
export function utcMillisForWallClockInZone(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
  second = 0,
): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  })
  const read = (utcMs: number) => {
    const parts = fmt.formatToParts(new Date(utcMs))
    const g = (t: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((p) => p.type === t)?.value ?? NaN)
    return { y: g('year'), mo: g('month'), d: g('day'), h: g('hour'), m: g('minute') }
  }
  let t = Date.UTC(year, month - 1, day - 1, 12, 0, 0, 0)
  const end = Date.UTC(year, month - 1, day + 2, 12, 0, 0, 0)
  while (t < end) {
    const p = read(t)
    if (p.y === year && p.mo === month && p.d === day && p.h === hour && p.m === minute) return t + second * 1000
    t += 60_000
  }
  throw new Error(`Could not resolve wall clock ${year}-${month}-${day} ${hour}:${minute}:${second} in ${timeZone}`)
}
