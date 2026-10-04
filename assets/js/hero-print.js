// Hero "Der Abzug": the booth light flickers on, three lamps count down, four flashes,
// the strip feeds out in motor jerks, each frame develops as it appears, the stamp lands.
// Contract: CSS holds the final state. We add .is-live and create animations that hold their
// first keyframe from t=0 (fill: backwards) and hand over to CSS when they end. Skip = cancel.

const EXPO = 'cubic-bezier(.16, 1, .3, 1)'
const INK = 'cubic-bezier(.65, 0, .35, 1)'
const MOTOR = 'cubic-bezier(.3, .7, .4, 1)'

// One animation per element from absolute times: [[ms, keyframe, easingToNext?], ...]
function track(el, steps) {
  if (!el || !el.animate) return null
  const end = steps[steps.length - 1][0] || 1
  const frames = steps.map(([t, props, easing]) => ({ ...props, offset: Math.min(1, t / end), ...(easing ? { easing } : {}) }))
  if (frames[0].offset !== 0) frames.unshift({ ...steps[0][1], offset: 0 })
  return el.animate(frames, { duration: end, fill: 'backwards' })
}

// Strip feed: from tucked to rest in four equal jerks of 280ms, each followed by a 120ms hold.
export function feedSteps(start) {
  const steps = [[0, { transform: 'translateY(-100%)' }], [start, { transform: 'translateY(-100%)' }, MOTOR]]
  for (let i = 1; i <= 4; i++) {
    const t = start + (i - 1) * 400
    steps.push([t + 280, { transform: `translateY(${-100 + i * 25}%)` }])
    if (i < 4) steps.push([t + 400, { transform: `translateY(${-100 + i * 25}%)` }, MOTOR])
  }
  return steps
}

// Feed, develop bottom-up as each frame appears, then stamp.
export function feedAndDevelop(parts, { start = 0, stampAt = start + 2000, developMs = 1400 } = {}) {
  const { strip, devs = [], imgs = [], ink, bleed } = parts
  const anims = [track(strip, feedSteps(start))]
  const n = devs.length
  devs.forEach((dev, i) => {
    const t = start + 280 + (n - 1 - i) * 400 // the bottom frame shows after the first jerk
    anims.push(track(dev, [[0, { opacity: 1 }], [t, { opacity: 1 }, INK], [t + developMs, { opacity: 0 }]]))
    anims.push(track(imgs[i], [[0, { transform: 'scale(1.03)', opacity: .85 }], [t, { transform: 'scale(1.03)', opacity: .85 }, INK], [t + developMs, { transform: 'scale(1)', opacity: 1 }]]))
  })
  anims.push(track(ink, [[0, { opacity: 0, transform: 'scale(1.15)' }], [stampAt, { opacity: 0, transform: 'scale(1.15)' }, 'ease-in'], [stampAt + 140, { opacity: 1, transform: 'scale(1)' }]]))
  anims.push(track(bleed, [[0, { opacity: 0 }], [stampAt, { opacity: 0 }], [stampAt + 400, { opacity: .35 }]]))
  return anims.filter(Boolean)
}

export function init(ctx) {
  const hero = document.querySelector('.hero')
  if (!hero) return
  const $ = s => hero.querySelector(s)
  const $$ = s => [...hero.querySelectorAll(s)]
  const el = {
    slot: $('.slot'),
    light: $('.slot__light'),
    sweep: $('.slot__sweep'),
    glass: $('.slot__glass'),
    lamps: $$('.lamp__on'),
    sign: $('.sign'),
    strip: $('.slot .strip'),
    devs: $$('.slot .frame__dev'),
    imgs: $$('.slot .frame img'),
    ink: $('.slot .strip__ink'),
    bleed: $('.slot .strip__bleed'),
    coin: $('.coin'),
    flash: document.querySelector('.flash'),
  }
  el.coin.hidden = false

  let anims = []
  let running = false
  let timer = 0
  let vibes = []

  function finish() {
    running = false
    el.coin.disabled = false
    el.coin.removeAttribute('aria-disabled')
    hero.classList.remove('is-printing')
  }
  function skip() {
    anims.forEach(a => a.cancel())
    anims = []
    clearTimeout(timer)
    vibes.forEach(clearTimeout)
    vibes = []
    finish()
  }
  // soft: the coin was just pressed and keeps keyboard focus, so it is only marked as busy.
  function run(list, total, { soft = false } = {}) {
    anims = list.filter(Boolean)
    running = true
    if (soft) el.coin.setAttribute('aria-disabled', 'true')
    else el.coin.disabled = true
    hero.classList.add('is-printing')
    clearTimeout(timer)
    timer = setTimeout(() => { anims = []; vibes = []; finish() }, total)
  }

  function flashes(times, { haptic = false } = {}) {
    const page = [[0, { opacity: 0 }]]
    const glass = [[0, { opacity: 0 }]]
    for (const t of times) {
      page.push([t, { opacity: 0 }, 'linear'], [t + 40, { opacity: .3 }, 'ease-out'], [t + 400, { opacity: 0 }])
      glass.push([t, { opacity: 0 }, 'linear'], [t + 40, { opacity: .8 }, 'ease-out'], [t + 400, { opacity: 0 }])
      if (haptic && navigator.vibrate) vibes.push(setTimeout(() => { try { navigator.vibrate(10) } catch { /* ignore */ } }, t))
    }
    return [track(el.flash, page), track(el.glass, glass)]
  }
  function lampsOn(times, settleAt) {
    return el.lamps.map((l, i) => track(l, [[0, { opacity: 0 }], [times[i], { opacity: 0 }], [times[i] + 80, { opacity: 1 }], [settleAt, { opacity: 1 }], [settleAt + 300, { opacity: .4 }]]))
  }
  function sign(at, settleAt) {
    return track(el.sign, [[0, { opacity: 0 }], [at, { opacity: 0 }], [at + 120, { opacity: 1 }], [settleAt, { opacity: 1 }], [settleAt + 300, { opacity: .3 }]])
  }
  function sweep(at) {
    return track(el.sweep, [[0, { transform: 'translateX(-120%)' }], [at, { transform: 'translateX(-120%)' }, EXPO], [at + 900, { transform: 'translateX(450%)' }]])
  }

  // ---------- First print, about 6.2s ----------
  function firstPrint() {
    hero.classList.add('is-live')
    const list = [
      track(el.light, [[0, { opacity: 0 }], [90, { opacity: .6 }], [180, { opacity: .15 }], [300, { opacity: 1 }]]),
      sweep(200),
      ...lampsOn([350, 650, 950], 5900),
      sign(950, 5900),
      ...flashes([1250, 1950, 2650, 3350]),
      ...feedAndDevelop(el, { start: 3600, stampAt: 5600 }),
      track(el.coin, [[0, { opacity: 0 }], [5900, { opacity: 0 }], [6200, { opacity: 1 }]]),
    ]
    // Ends with the coin fade, so the coin never dims to its busy look after appearing.
    // The top frame finishes developing on its own about 300ms later.
    run(list, 6200)
  }

  // ---------- Replay from the coin, about 5.5s ----------
  function replay() {
    if (running) return
    if (ctx.reduced) {
      run(el.devs.map(d => track(d, [[0, { opacity: 0 }], [200, { opacity: 1 }], [800, { opacity: 0 }]])), 800, { soft: true })
      return
    }
    // Order matters: later animations win while they run, so the retract is created last.
    const list = [
      ...feedAndDevelop(el, { start: 3200, stampAt: 5200 }),
      sweep(200),
      ...lampsOn([450, 700, 950], 5500),
      sign(950, 5500),
      ...flashes([1200, 1800, 2400, 3000], { haptic: true }),
      track(el.strip, [[0, { transform: 'translateY(0)' }, 'ease-in'], [400, { transform: 'translateY(-100%)' }]]),
      ...el.devs.map(d => track(d, [[0, { opacity: 0 }], [300, { opacity: 1 }]])),
      track(el.ink, [[0, { opacity: 1 }], [200, { opacity: 0 }]]),
      track(el.bleed, [[0, { opacity: .35 }], [200, { opacity: 0 }]]),
    ]
    run(list, 5500, { soft: true })
  }

  el.coin.addEventListener('click', replay)

  // The slot is a link to the photos. While printing, the first activation skips to the end.
  el.slot.addEventListener('click', e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    if (running) { skip(); return }
    ctx.jumpTo(document.getElementById('fotos'))
  })
  // Enter already arrives as a click. Space on a link would scroll the page, so it skips instead.
  el.slot.addEventListener('keydown', e => {
    if (running && (e.key === ' ' || e.key === 'Spacebar')) { e.preventDefault(); skip() }
  })

  // ---------- Start, or land on the final state ----------
  const hash = location.hash.slice(1)
  const sectionHash = hash && !hash.includes('=') && !ctx.WEDDING.langs.includes(hash) && document.getElementById(hash)
  // A guest who already looked at the page for ~3s (slow network) gets the final state, no replay.
  // The clock is the CSS failsafe that lands the strip 3s after the hero is first styled, so a slow
  // download before first paint does not count. Without it, measure from first paint.
  function shownFor() {
    const failsafe = el.strip.getAnimations?.().find(a => a.animationName === 'hero-fs-strip')
    if (failsafe && failsafe.currentTime != null) return failsafe.currentTime
    const fcp = performance.getEntriesByName?.('first-contentful-paint')[0]
    return performance.now() - (fcp ? fcp.startTime : 0)
  }
  const tooLate = () => !document.hidden && shownFor() > 2500
  if (ctx.reduced || sectionHash || scrollY > hero.offsetHeight * .3 || tooLate()) {
    hero.classList.add('is-live')
    if (ctx.reduced) track(el.ink, [[0, { opacity: 0 }], [300, { opacity: 1 }]])
    return
  }

  const ready = Promise.all([
    document.fonts?.ready,
    ...el.imgs.map(i => (i.decode ? i.decode().catch(() => {}) : null)),
  ])
  Promise.race([ready, ctx.sleep(600)]).then(async () => {
    let wasHidden = false
    if (document.hidden) {
      wasHidden = true
      await new Promise(r => document.addEventListener('visibilitychange', r, { once: true }))
    }
    // Opened in a background tab (e.g. from WhatsApp): print when the guest actually looks.
    if ((!wasHidden && tooLate()) || scrollY > hero.offsetHeight * .3) { hero.classList.add('is-live'); return }
    firstPrint()
  })

  // Restored from the back/forward cache: never replay, just show the strip.
  addEventListener('pageshow', e => { if (e.persisted) skip() })

  // Flashes belong to the booth: once the guest scrolls the slot half out of view at the top, land on
  // the final state so no flash washes over the sections below. top < 0 keeps a slot that only peeks
  // in from below on a short screen from skipping right away. The hero observer stays as a backstop.
  ctx.observe(el.slot, entry => {
    if (running && entry.boundingClientRect.top < 0 && entry.intersectionRatio < .5) skip()
  }, { threshold: [0, .5] })
  ctx.observe(hero, entry => { if (!entry.isIntersecting && running) skip() }, { threshold: 0 })
}
