// Tiny i18n: German text ships in the HTML; JS swaps strings for Turkish.
// Hooks in the markup (all set with textContent, never innerHTML):
//   data-i18n="key"             text of a leaf element
//   data-i18n-phase="key"       text from key.before / key.today / key.after
//   data-i18n-lines="key"       phase-aware multi-line text, one <span class="hl"> per "|" line
//   data-i18n-attr="alt:key"    attributes, ";" separated
//   data-date="dotted"          computed date strings (dotted, long, daymonthyear, weekday)
//   data-name="a" | "b"         the partners' names
export const LANGS = ['de', 'tr']
const STORE_KEY = 'std-lang'

export function remember(lang) {
  try { localStorage.setItem(STORE_KEY, lang) } catch { /* private mode: fine */ }
}

// Same precedence as the inline head script, which already stored its answer on <html data-lang>.
// ?lang=xx, then #lang=xx or a bare #tr, then the guest's saved choice, then a Turkish phone, then German.
export function detectLang(loc = location, nav = navigator, store = null) {
  const pre = typeof document !== 'undefined' ? document.documentElement.dataset.lang : null
  if (LANGS.includes(pre)) return pre
  try {
    const q = new URLSearchParams(loc.search).get('lang')
    if (LANGS.includes(q)) return q
  } catch { /* ignore */ }
  const hash = (loc.hash || '').slice(1)
  const m = hash.match(/(?:^|&)lang=(\w+)/)
  if (m && LANGS.includes(m[1])) return m[1]
  if (LANGS.includes(hash)) return hash
  let saved = null
  try { saved = store ? store.getItem(STORE_KEY) : localStorage.getItem(STORE_KEY) } catch { /* ignore */ }
  if (LANGS.includes(saved)) return saved
  const first = ((nav.languages && nav.languages[0]) || nav.language || '').toLowerCase()
  if (first.startsWith('tr')) return 'tr'
  return 'de'
}

export function interpolate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
}

export function createI18n(dict, getVars) {
  let lang = 'de'
  let phase = 'before'
  const listeners = new Set()

  const raw = (key) => dict[lang]?.[key] ?? dict.de[key]
  const t = (key, extra) => {
    const s = raw(key)
    if (s == null) return key
    return interpolate(s, { ...getVars(lang), ...extra })
  }
  const tp = (key, extra) => t(raw(`${key}.${phase}`) != null ? `${key}.${phase}` : key, extra)
  // Plural pick: key.one / key.other through Intl.PluralRules.
  const tn = (key, n, extra) => {
    const cat = new Intl.PluralRules(lang).select(n) === 'one' ? 'one' : 'other'
    return t(`${key}.${cat}`, { n, ...extra })
  }

  function render(root = document) {
    const vars = getVars(lang)
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n) })
    root.querySelectorAll('[data-i18n-phase]').forEach(el => { el.textContent = tp(el.dataset.i18nPhase) })
    root.querySelectorAll('[data-i18n-lines]').forEach(el => {
      const lines = tp(el.dataset.i18nLines).split('|')
      el.replaceChildren(...lines.map(line => {
        const span = document.createElement('span')
        span.className = 'hl'
        span.textContent = line
        return span
      }))
    })
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.dataset.i18nAttr.split(';').forEach(pair => {
        const [attr, key] = pair.split(':').map(s => s.trim())
        if (attr && key) el.setAttribute(attr, t(key))
      })
    })
    root.querySelectorAll('[data-date]').forEach(el => {
      const v = vars[el.dataset.date]
      if (v != null) el.textContent = v
    })
    root.querySelectorAll('[data-name]').forEach(el => {
      el.textContent = el.dataset.name === 'a' ? vars.a : vars.b
    })
  }

  function apply(next, { persist = true } = {}) {
    lang = LANGS.includes(next) ? next : 'de'
    document.documentElement.lang = lang
    document.documentElement.dataset.lang = lang
    render()
    document.querySelectorAll('.lang button[data-lang]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.lang === lang))
    })
    if (persist) remember(lang)
    // One failing listener must not stop the others or leave the page mid-swap.
    listeners.forEach(fn => { try { fn(lang) } catch (err) { console.error(err) } })
  }

  return {
    t, tp, tn, apply, render,
    get lang() { return lang },
    get phase() { return phase },
    setPhase(p) { phase = p },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  }
}
