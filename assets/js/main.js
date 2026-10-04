// Boot: language, wedding phase, shared context, then each section module.
// Every section module exports `init(ctx)`; a failing module never takes the others down.
import { WEDDING } from './config.js'
import { CATALOGS, LOCALES } from './copy.js'
import { createI18n, detectLang } from './i18n.js'
import { weddingPhase } from './time.js'
import { dateVars } from './dates.js'
import { parseFuer } from './fuer.js'

const html = document.documentElement
const mq = matchMedia('(prefers-reduced-motion: reduce)')

// ---------- Clock: ?now=ISO lets QA preview the before / today / after states ----------
let offset = 0
try {
  const q = new URLSearchParams(location.search).get('now')
  if (q && !Number.isNaN(Date.parse(q))) offset = Date.parse(q) - Date.now()
} catch { /* ignore */ }
const clock = { now: () => new Date(Date.now() + offset) }

// ---------- Personal address: #fuer=Oma%20Erika (parsed in fuer.js, tested in node) ----------
export { parseFuer }

// ---------- Strings that depend on language: dates and names ----------
const varsCache = new Map()
function varsFor(lang) {
  if (varsCache.has(lang)) return varsCache.get(lang)
  const v = {
    a: WEDDING.partnerA,
    b: WEDDING.partnerB,
    ...dateVars(WEDDING.date, LOCALES[lang] || 'de-DE', lang),
    contact: WEDDING.contact || '',
    slug: `${WEDDING.partnerA}-${WEDDING.partnerB}`.toLowerCase().normalize('NFD').replace(/[^a-z0-9-]/g, ''),
  }
  varsCache.set(lang, v)
  return v
}

const i18n = createI18n(CATALOGS, varsFor)

// ---------- Shared context for section modules ----------
const phaseListeners = new Set()
const ctx = {
  WEDDING,
  i18n,
  clock,
  html,
  fuer: parseFuer(location.hash),
  state: { programmaticScroll: false, reduced: mq.matches, booted: performance.now() },
  get reduced() { return mq.matches },
  phase: 'before',
  onPhase(fn) { phaseListeners.add(fn); return () => phaseListeners.delete(fn) },
  vars: () => varsFor(i18n.lang),
  // Re-evaluate the phase (e.g. when the countdown reaches zero) and re-render phase copy.
  refreshPhase() {
    const p = weddingPhase(clock.now(), WEDDING)
    const changed = p.phase !== ctx.phase
    ctx.phase = p.phase
    html.dataset.phase = p.phase
    i18n.setPhase(p.phase)
    // One failing listener must not stop the others.
    if (changed) { i18n.render(); phaseListeners.forEach(fn => { try { fn(p.phase) } catch (err) { console.error(err) } }) }
    return p
  },
  // Smooth or covered jump to an in-page target without touching location.hash.
  jumpTo,
  // Call before scrolling from code, so scroll-driven sections ignore that scroll.
  markProgrammatic,
  observe,
  sleep: ms => new Promise(r => setTimeout(r, ms)),
}
mq.addEventListener?.('change', () => { ctx.state.reduced = mq.matches })

// ---------- One IntersectionObserver per options set ----------
const observers = new Map()
function observe(el, cb, { rootMargin = '0px', threshold = 0 } = {}) {
  const key = `${rootMargin}|${threshold}`
  let entry = observers.get(key)
  if (!entry) {
    const callbacks = new Map()
    const io = new IntersectionObserver(items => items.forEach(it => callbacks.get(it.target)?.forEach(fn => fn(it))), { rootMargin, threshold })
    entry = { io, callbacks }
    observers.set(key, entry)
  }
  if (!entry.callbacks.has(el)) { entry.callbacks.set(el, new Set()); entry.io.observe(el) }
  entry.callbacks.get(el).add(cb)
  return () => {
    const set = entry.callbacks.get(el)
    set?.delete(cb)
    if (set && !set.size) { entry.callbacks.delete(el); entry.io.unobserve(el) }
  }
}

// ---------- In-page jumps ----------
let idleTimer = 0
function markProgrammatic() {
  ctx.state.programmaticScroll = true
  const onScroll = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(done, 150)
  }
  const done = () => {
    ctx.state.programmaticScroll = false
    removeEventListener('scroll', onScroll)
  }
  addEventListener('scroll', onScroll, { passive: true })
  clearTimeout(idleTimer)
  idleTimer = setTimeout(done, 150)
}
async function jumpTo(target) {
  if (!target) return
  markProgrammatic()
  const far = Math.abs(target.getBoundingClientRect().top) > innerHeight * 1.5
  const cover = document.querySelector('.jump-cover')
  if (mq.matches) {
    target.scrollIntoView({ behavior: 'auto', block: 'start' })
  } else if (far && cover?.animate) {
    await cover.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'linear', fill: 'forwards' }).finished
    target.scrollIntoView({ behavior: 'auto', block: 'start' })
    markProgrammatic()
    await cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'linear', fill: 'forwards' }).finished
  } else {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // Move keyboard focus with the jump so the next Tab continues from the target.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
}
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-jump]')
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  const id = a.getAttribute('href').slice(1)
  const target = document.getElementById(id)
  if (!target) return
  e.preventDefault()
  jumpTo(target)
})

// ---------- Language switching ----------
function setLang(lang) {
  if (lang === i18n.lang) return
  if (mq.matches) { i18n.apply(lang); return }
  html.classList.add('lang-swap')
  setTimeout(() => {
    // Always fade the page back in, even if applying the language throws.
    try { i18n.apply(lang) } finally { requestAnimationFrame(() => html.classList.remove('lang-swap')) }
  }, 100)
}
document.addEventListener('click', e => {
  const b = e.target.closest('.lang button[data-lang]')
  if (b) setLang(b.dataset.lang)
})

// ---------- Footer contact (only when configured) ----------
function renderContact() {
  const el = document.querySelector('[data-contact]')
  if (!el || !WEDDING.contact) return
  el.hidden = false
  const [pre, post = ''] = i18n.t('footer.contact', { contact: '\u0000' }).split('\u0000')
  const a = document.createElement('a')
  a.href = `mailto:${WEDDING.contact}`
  a.textContent = WEDDING.contact
  el.replaceChildren(document.createTextNode(pre), a, document.createTextNode(post))
}

// ---------- Boot ----------
function boot() {
  ctx.refreshPhase()
  try { i18n.apply(detectLang(), { persist: false }) } catch (err) { console.error(err) } finally { html.classList.remove('i18n-pending') }
  renderContact()
  i18n.onChange(renderContact)

  const modules = [
    ['hero', () => import('./hero-print.js')],
    ['story', () => import('./story.js')],
    ['postcard', () => import('./postcard.js')],
    ['countdown', () => import('./countdown.js')],
    ['calpop', () => import('./calpop.js')],
  ]
  for (const [name, load] of modules) {
    load()
      .then(m => m.init?.(ctx))
      .catch(err => console.error(`[${name}]`, err))
  }
}

// Back/forward cache: recompute phase and let modules know the page is visible again.
addEventListener('pageshow', e => { if (e.persisted) ctx.refreshPhase() })

window.__std = ctx // handy for QA in the console
boot()
