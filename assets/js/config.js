// Everything couple-specific lives here. Change a value, reload, done.
// After changing the date or names, run `npm run make:ics` and `npm test` (the tests check index.html matches).
export const WEDDING = {
  partnerA: 'Johannes',
  partnerB: 'Selin',
  monogram: ['J', 'S'],
  // Calendar date of the wedding in the couple's time zone (month is 1-12).
  date: { year: 2027, month: 9, day: 11 },
  // Optional ceremony start 'HH:MM' in Berlin time. Only feeds the calendar entries.
  time: null,
  timeZone: 'Europe/Berlin',
  // Public https address once hosted, with a trailing slash. Used for share previews and calendar entries.
  siteUrl: 'https://frederik-witte.github.io/johannes-selin/',
  // Fixed forever once guests have added the event, so calendars recognise updates.
  calendarUid: 'johannes-selin-hochzeit@save-the-date',
  // Optional contact line in the footer, e.g. 'hochzeit@example.de'. Nothing is shown while it is null.
  contact: null,
  langs: ['de', 'tr'],
  defaultLang: 'de',
  // Order of the four photos everywhere: strip, story, postcard.
  order: ['ring-wange', 'kuss', 'hand-herz', 'umarmung'],
  features: { glint: true },
}
