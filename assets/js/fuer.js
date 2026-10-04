// Personal address from the link: #fuer=Oma%20Erika (Turkish guests: #lang=tr&fuer=...).
// Pure function, no DOM: tested in tests/fuer.test.js. The result is only ever inserted with textContent.
// WhatsApp ends a link at the first space, so the couple must encode spaces as %20 (a "+" works too).

export const FUER_MAX = 40

// Characters that never belong in a name: control characters, the replacement character left by
// broken %-escapes, and bidi overrides that would flip the surrounding layout.
// The zero-width joiner (U+200D) stays, because family and couple emoji are built with it.
const UNWANTED = /[\u0000-\u001F\u007F-\u009F�‪-‮⁦-⁩]/g

function graphemes(text) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter('de', { granularity: 'grapheme' }).segment(text), s => s.segment)
  }
  return Array.from(text)
}

// Returns the cleaned name (at most 40 graphemes) or null when there is none.
export function parseFuer(hash) {
  if (typeof hash !== 'string' || !hash) return null
  let raw = null
  try { raw = new URLSearchParams(hash.replace(/^#/, '')).get('fuer') } catch { return null }
  if (!raw) return null
  // Line breaks and tabs become spaces first, so "Oma%0AErika" still reads "Oma Erika".
  const name = raw.replace(/\s/g, ' ').replace(UNWANTED, '').replace(/ {2,}/g, ' ').trim()
  if (!name) return null
  return graphemes(name).slice(0, FUER_MAX).join('').trim() || null
}
