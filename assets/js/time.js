// Date math in the couple's time zone, independent of the guest's device zone.

const pad = (n, w = 2) => String(n).padStart(w, '0')

// Calendar parts of an instant as seen in `timeZone`.
export function zonedParts(instant, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  const p = Object.fromEntries(fmt.formatToParts(instant).map(x => [x.type, x.value]))
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second }
}

// UTC instant of local midnight on `date` in `timeZone` (handles DST offsets).
export function zonedMidnight(date, timeZone) {
  const wanted = Date.UTC(date.year, date.month - 1, date.day)
  let guess = wanted
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone)
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const diff = seen - wanted
    if (diff === 0) break
    guess -= diff
  }
  return new Date(guess)
}

const dayNumber = d => Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86400000)

// Where are we relative to the wedding day, as seen in the couple's time zone?
// before: live countdown to local midnight. today: the day itself. after: days since.
export function weddingPhase(now, wedding) {
  const today = zonedParts(now, wedding.timeZone)
  const delta = dayNumber(wedding.date) - dayNumber(today)
  if (delta === 0) return { phase: 'today' }
  if (delta < 0) return { phase: 'after', daysSince: -delta }
  const ms = Math.max(0, zonedMidnight(wedding.date, wedding.timeZone) - now)
  const s = Math.floor(ms / 1000)
  return {
    phase: 'before',
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    calendarDays: delta,
  }
}

// A calendar date rendered in a locale, without any time zone drift.
export function formatDate(date, locale, options) {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day, 12))
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(utc)
}

export const dotted = d => `${pad(d.day)}.${pad(d.month)}.${d.year}`
export const compact = d => `${d.year}${pad(d.month)}${pad(d.day)}`

export function nextDay(d) {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + 1))
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

// Weekday index (0 = Monday) of the first day of the month, and the month length.
export function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { offset: (first + 6) % 7, length }
}
