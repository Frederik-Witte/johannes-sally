// Countdown and calendar (#countdown, #kalender).
// A letterpress dial on card stock counts down to Berlin midnight at the start of the wedding day.
// Only the seconds move: two odometer reels roll and the needle on the seconds track steps with them.
// Days, hours and minutes swap their digits. The ticker lands on every whole second, sleeps while the
// dial is off screen or the tab is hidden, and at zero asks main.js to apply the today state (no reload).
// The calendar buttons get per-language hrefs; their German hrefs are static in the HTML (no JS needed).
import { weddingPhase, zonedParts, zonedMidnight, nextDay } from './time.js'
import { CATALOGS } from './copy.js'
import { googleLink, outlookLink, icsFile, eventCopy } from './calendar-links.js'

const ROLL_MS = 350
const EASE_ROLL = 'cubic-bezier(.6, 0, .2, 1)'
const EASE_INK = 'cubic-bezier(.65, 0, .35, 1)'
const EASE_EXPO = 'cubic-bezier(.16, 1, .3, 1)'
const ROW = 1 // em: distance between two reel rows, as in countdown.css (.cd__reel > span)
const pad2 = n => String(n).padStart(2, '0')

function digitCell(ch) {
  const s = document.createElement('span')
  s.className = 'cd__d'
  s.textContent = ch
  return s
}

// Digits that swap without motion. Rebuilds the cells only when the digit count changes.
function swapDigits(el) {
  let shown = null
  return str => {
    if (str === shown) return
    if (shown == null || shown.length !== str.length) el.replaceChildren(...[...str].map(digitCell))
    else [...str].forEach((ch, i) => { if (shown[i] !== ch) el.children[i].textContent = ch })
    shown = str
  }
}

// One odometer reel: a spare `max` above 0, then 0..max. Counting down moves the reel down by one row;
// 0 -> max rolls onto the spare and then rests on the real `max` (same glyph, no visible jump).
function reel(max) {
  const cell = document.createElement('span')
  cell.className = 'cd__d cd__d--reel'
  const strip = document.createElement('span')
  strip.className = 'cd__reel'
  for (const d of [max, ...Array.from({ length: max + 1 }, (_, i) => i)]) {
    const row = document.createElement('span')
    row.textContent = d
    strip.append(row)
  }
  cell.append(strip)
  const y = i => `translateY(${-(i * ROW).toFixed(3)}em)`
  let value = null
  let anim = null
  return {
    el: cell,
    set(d, roll) {
      if (d === value) return
      const prev = value
      value = d
      anim?.cancel()
      anim = null
      strip.style.transform = y(d + 1)
      if (!roll || prev == null || !strip.animate) return
      const to = d === prev - 1 ? d + 1 : prev === 0 && d === max ? 0 : null
      if (to == null) return // more than one step (after a pause): swap
      anim = strip.animate([{ transform: y(prev + 1) }, { transform: y(to) }], { duration: ROLL_MS, easing: EASE_ROLL })
    },
  }
}

export function init(ctx) {
  const root = document.getElementById('countdown')
  if (!root) return
  const { i18n, WEDDING } = ctx
  const $ = s => root.querySelector(s)
  const dial = $('.dial')
  const cd = $('.cd')
  const nojs = $('.cd__nojs')
  const hand = $('[data-cd-hand]')
  const sr = $('[data-cd-sr]')
  const since = $('[data-cd-since]')
  const sinceUnit = $('[data-cd-since-unit]')
  const units = { d: $('[data-cd-unit="d"]'), h: $('[data-cd-unit="h"]'), m: $('[data-cd-unit="m"]'), s: $('[data-cd-unit="s"]') }

  // ---------- Digits ----------
  const setDays = swapDigits($('[data-cd="d"]'))
  const setHours = swapDigits($('[data-cd="h"]'))
  const setMinutes = swapDigits($('[data-cd="m"]'))
  const tens = reel(5)
  const ones = reel(9)
  $('[data-cd="s"]').replaceChildren(tens.el, ones.el)
  if (cd) cd.hidden = false
  if (nojs) nojs.hidden = true

  // ---------- Seconds needle: the track reads 60 on the left down to 0 on the right ----------
  let needleAt = null
  let needleAnim = null
  let entranceUntil = 0
  const needleX = s => `translateX(${(((60 - s) / 60) * 100).toFixed(3)}%)`
  function setNeedle(s, roll) {
    if (!hand || s === needleAt) return
    const prev = needleAt
    needleAt = s
    hand.style.transform = needleX(s)
    if (performance.now() < entranceUntil) return // the entrance sweep already lands on the right second
    needleAnim?.cancel()
    needleAnim = null
    if (roll && prev != null && hand.animate) {
      needleAnim = hand.animate([{ transform: needleX(prev) }, { transform: needleX(s) }], { duration: ROLL_MS, easing: EASE_ROLL })
    }
  }

  // ---------- Labels and the screen-reader sentence ----------
  const last = { d: null, h: null, m: null, s: null }
  function setUnit(k, n, force) {
    if (!units[k] || (!force && last[k] === n)) return
    last[k] = n
    units[k].textContent = i18n.tn(`cd.unit.${k}`, n)
  }
  function setSr(text) {
    if (sr && sr.textContent !== text) sr.textContent = text
  }

  // ---------- Before: the ticking dial ----------
  function render(roll) {
    const p = weddingPhase(ctx.clock.now(), WEDDING)
    if (p.phase !== 'before') {
      stop()
      ctx.refreshPhase() // re-applies the state matrix and notifies onPhase listeners
      if (ctx.phase === p.phase) renderPhase()
      return
    }
    const animate = roll && !ctx.reduced
    setDays(pad2(p.days))
    setHours(pad2(p.hours))
    setMinutes(pad2(p.minutes))
    tens.set(Math.floor(p.seconds / 10), animate)
    ones.set(p.seconds % 10, animate)
    setNeedle(p.seconds, animate)
    const dd = String(Math.max(2, String(p.days).length))
    if (cd && cd.style.getPropertyValue('--cd-dd') !== dd) cd.style.setProperty('--cd-dd', dd)
    setUnit('d', p.days)
    setUnit('h', p.hours)
    setUnit('m', p.minutes)
    setUnit('s', p.seconds)
    setSr(i18n.tn('cd.sr.before', p.calendarDays))
  }

  let timer = 0
  let running = false
  let visible = false
  function schedule() {
    clearTimeout(timer)
    const ms = ctx.clock.now().getTime()
    timer = setTimeout(tick, 1000 - (((ms % 1000) + 1000) % 1000) + 4)
  }
  function tick() {
    if (!running) return
    render(true)
    if (running) schedule()
  }
  function start() {
    if (running) return
    running = true
    render(false) // recompute after any pause: swap, never roll a stale value
    if (running) schedule()
  }
  function stop() {
    running = false
    clearTimeout(timer)
  }
  function update() {
    if (visible && !document.hidden && ctx.phase === 'before') start()
    else stop()
  }

  // ---------- Today and after: the dial's face changes, a timer waits for the next Berlin midnight ----------
  let midnightTimer = 0
  function scheduleBoundary() {
    clearTimeout(midnightTimer)
    const now = ctx.clock.now()
    const tz = WEDDING.timeZone
    const next = ctx.phase === 'before'
      ? zonedMidnight(WEDDING.date, tz)
      : zonedMidnight(nextDay(zonedParts(now, tz)), tz)
    // Long waits are re-checked every 6 hours (timers drift and stall while a phone sleeps).
    const wait = Math.min(Math.max(0, next - now) + 250, 6 * 3600000)
    midnightTimer = setTimeout(() => {
      ctx.refreshPhase()
      renderPhase()
      update()
    }, wait)
  }

  function renderPhase() {
    const p = weddingPhase(ctx.clock.now(), WEDDING)
    if (p.phase === 'before') {
      setSr(i18n.tn('cd.sr.before', p.calendarDays))
    } else if (p.phase === 'today') {
      setSr(i18n.t('cd.sr.today'))
    } else {
      if (since) since.textContent = String(p.daysSince)
      if (sinceUnit) sinceUnit.textContent = i18n.tn('cd.after.unit', p.daysSince)
      setSr(i18n.tn('cd.sr.after', p.daysSince))
    }
    scheduleBoundary()
  }

  // ---------- Entrance (once, on first view): the needle runs across the track and inks it as it goes,
  // each numeral prints as the needle passes over it, then the needle flies back to the current second.
  const scale = $('.dial__scale')
  const prints = cd ? [...cd.children] : []
  function playEntrance() {
    const RUN = 1000 // the needle crosses the whole track at an even pace, like a sweeping hand
    const BACK = 520 // flyback to the current second
    const DELAY = 120
    const now = ctx.clock.now().getTime()
    const target = weddingPhase(new Date(now + DELAY + RUN + BACK), WEDDING)
    const wipe = [{ clipPath: 'inset(-4px 100% -4px -4px)' }, { clipPath: 'inset(-4px -4px -4px -4px)' }]
    for (const el of [$('.dial__ticks'), $('.dial__nums')]) {
      el?.animate?.(wipe, { duration: RUN, delay: DELAY, easing: 'linear', fill: 'backwards' })
    }
    if (hand?.animate && target.phase === 'before') {
      entranceUntil = performance.now() + DELAY + RUN + BACK
      needleAnim?.cancel()
      needleAnim = hand.animate([
        { transform: 'translateX(0%)', easing: 'linear' },
        { transform: 'translateX(100%)', offset: RUN / (RUN + BACK), easing: EASE_EXPO },
        { transform: needleX(target.seconds) },
      ], { duration: RUN + BACK, delay: DELAY, fill: 'backwards' })
    }
    const track = scale?.getBoundingClientRect()
    prints.forEach(el => {
      if (!el.animate || !track?.width) return
      const box = el.getBoundingClientRect()
      const f = Math.min(1, Math.max(0, (box.left + box.width / 2 - track.left) / track.width))
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520, delay: DELAY + f * RUN - 80, easing: 'ease-out', fill: 'backwards' })
    })
    dial.classList.remove('dial--pre')
  }
  function setupEntrance() {
    if (!dial || ctx.reduced || ctx.phase !== 'before' || !dial.animate) return
    const box = dial.getBoundingClientRect()
    if (box.top < innerHeight) return // already on screen (or passed): show it as it is
    dial.classList.add('dial--pre')
    // An in-page jump past the dial (the hero button to #kalender) renders it final.
    const onJump = e => {
      const a = e.target.closest?.('a[data-jump]')
      const target = a && document.getElementById((a.getAttribute('href') || '').slice(1))
      if (!target || !(dial.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING)) return
      dial.classList.remove('dial--pre')
      document.removeEventListener('click', onJump)
    }
    document.addEventListener('click', onJump)
    const off = ctx.observe(dial, entry => {
      if (!entry.isIntersecting) return
      off()
      if (!dial.classList.contains('dial--pre')) return
      if (ctx.state.programmaticScroll || ctx.reduced || ctx.phase !== 'before') dial.classList.remove('dial--pre')
      else playEntrance()
    }, { threshold: 0.3 })
  }

  // A live switch to "today" while the dial is on screen: the script line inks in.
  function inkToday() {
    if (ctx.reduced || !visible) return
    const caps = $('.cd-today .caps')
    const script = $('.cd-today .script')
    caps?.animate?.([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: EASE_EXPO, fill: 'backwards' })
    script?.animate?.([{ clipPath: 'inset(-.5em 100% -.5em -.5em)' }, { clipPath: 'inset(-.5em -.5em -.5em -.5em)' }], { duration: 900, delay: 150, easing: EASE_INK, fill: 'backwards' })
  }

  // ---------- Calendar: per-language hrefs; the platform may only change the order ----------
  // The hero menus and the calendar block share the same [data-cal] links.
  const calLinks = k => document.querySelectorAll(`[data-cal="${k}"]`)
  if (/Android/i.test(navigator.userAgent || '')) {
    // Android: Google first. iPhone, iPad and Mac keep Apple first, as in the HTML.
    calLinks('google').forEach(g => g.parentElement?.prepend(g))
  }
  function renderCalendar() {
    const lang = i18n.lang
    const copy = eventCopy(CATALOGS[lang] || CATALOGS.de, WEDDING)
    const file = icsFile(WEDDING.langs.includes(lang) ? lang : 'de')
    const google = googleLink({ wedding: WEDDING, ...copy })
    const outlook = outlookLink({ wedding: WEDDING, ...copy })
    calLinks('apple').forEach(a => a.setAttribute('href', file))
    calLinks('file').forEach(a => a.setAttribute('href', file))
    calLinks('google').forEach(a => a.setAttribute('href', google))
    calLinks('outlook').forEach(a => a.setAttribute('href', outlook))
  }

  // ---------- Wiring ----------
  renderPhase()
  if (ctx.phase === 'before') render(false)
  renderCalendar()
  setupEntrance()

  if (dial) {
    ctx.observe(dial, entry => {
      visible = entry.isIntersecting
      update()
    })
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); return }
    ctx.refreshPhase()
    renderPhase()
    update()
  })
  ctx.onPhase(phase => {
    dial?.classList.remove('dial--pre')
    renderPhase()
    update()
    if (phase === 'today') inkToday()
  })
  i18n.onChange(() => {
    for (const k of ['d', 'h', 'm', 's']) if (last[k] != null) setUnit(k, last[k], true)
    renderPhase()
    renderCalendar()
  })
}
