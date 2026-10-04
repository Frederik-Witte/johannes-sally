// Date strings for one language, shared by the page (main.js) and the tests.
// A no-break space keeps the day number with its month, so "11." never ends a line.
import { formatDate, dotted } from './time.js'

const glue = s => s.replace(/(\d{1,2}\.?) (?=\p{L})/u, '$1 ')

export function dateVars(date, locale, lang) {
  const weekday = formatDate(date, locale, { weekday: 'long' })
  const daymonthyear = glue(formatDate(date, locale, { day: 'numeric', month: 'long', year: 'numeric' }))
  const long = glue(formatDate(date, locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))
  return { weekday, long, datelong: long, daymonthyear, dotted: dotted(date) }
}
