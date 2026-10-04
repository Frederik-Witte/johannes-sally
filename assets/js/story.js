// Story "Vier Fotos": the strip's four frames as big prints, one at a time.
// CSS holds every final state. Without JS, or with reduced motion, the prints are simply stacked.
// Here we add .is-sticky: a pinned stage, and four invisible segments that pick the frame as they
// cross the middle of the screen (IntersectionObserver only, no scroll handlers). Time drives all motion.

const EXPO = 'cubic-bezier(.16, 1, .3, 1)'
const INK = 'cubic-bezier(.65, 0, .35, 1)'
// The wipe starts left of the box: Pinyon's swashes (J, f) reach past it and must not show early.
const WIPE_FROM = 'inset(-.5em calc(100% + .5em) -.5em -.5em)'
const WIPE_TO = 'inset(-.5em -.5em -.5em -.5em)'

export function init(ctx) {
  const section = document.getElementById('fotos')
  if (!section || !('IntersectionObserver' in window)) return
  const $$ = (sel, root = section) => [...root.querySelectorAll(sel)]
  const prints = $$('.print')
  const segs = $$('.story__seg')
  const thumbs = $$('.story__thumbs li')
  const counter = section.querySelector('[data-story-counter]')
  const imgs = prints.map(p => p.querySelector('.print__photo img'))
  const cards = prints.map(p => p.querySelector('.print__photo'))
  const last = prints.length - 1
  if (last < 0) return
  const canAnimate = typeof Element.prototype.animate === 'function'
  const individualTransforms = !!window.CSS?.supports?.('translate', '0 1px')
  const glint = ctx.WEDDING.features?.glint !== false

  let sticky = false
  let shown = 0          // frame on screen
  let seq = 0            // latest requested change; older ones give up
  let running = []
  let pending = false    // frame 1 waits for its first arrival
  let booted = false
  let sectionSeen = false
  const hits = new Set() // segments crossing the middle of the screen

  // ---------- Motion helpers ----------
  // Every animation holds its first keyframe while delayed and hands over to the CSS state when done.
  function play(el, frames, opts) {
    if (!el || !canAnimate) return null
    const a = el.animate(frames, { fill: 'backwards', ...opts })
    running.push(a)
    a.finished.then(() => { running = running.filter(x => x !== a) }, () => {})
    return a
  }
  function stop() {
    running.forEach(a => a.cancel())
    running = []
  }
  const gate = img => Promise.race([
    img?.decode ? img.decode().catch(() => {}) : null,
    ctx.sleep(300),
  ])

  // ---------- State on screen ----------
  function renderCounter() {
    if (counter) counter.textContent = ctx.i18n.t('story.counter', { n: shown + 1 })
  }
  function paint(i) {
    shown = i
    prints.forEach((p, k) => p.classList.toggle('is-active', k === i))
    thumbs.forEach((t, k) => t.classList.toggle('is-active', k === i))
    renderCounter()
  }

  // Photo settles, caps rise, script inks in, the ring catches the light.
  function entrance(i, at = 0) {
    const p = prints[i]
    play(imgs[i], [{ transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 1100, delay: at, easing: EXPO })
    $$('.print__caps, .print__small, .print__numerals', p).forEach((el, k) => {
      play(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: at + 100 + k * 90, easing: EXPO })
    })
    $$('.print__script', p).forEach(el => {
      play(el, [{ clipPath: WIPE_FROM }, { clipPath: WIPE_TO }], { duration: 900, delay: at + 150, easing: INK })
    })
    const g = p.querySelector('.print__glint')
    if (g && glint) {
      play(g, [
        { opacity: 0, transform: 'scale(.6)', easing: 'ease-out' },
        { opacity: .8, transform: 'scale(.86)', offset: .35, easing: 'ease-in-out' },
        { opacity: 0, transform: 'scale(1)' },
      ], { duration: 600, delay: at + 500 })
    }
  }

  // Forward: the new print is laid down on top. The old one stays put beneath it until it is
  // covered, then fades, so the paper never shows through a half-transparent pair.
  function forward(from, to) {
    play(prints[from], [{ opacity: 1 }, { opacity: 1, offset: .55 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' })
    // Its copy leaves at once: on phones it sits on bare paper and would collide with the new lines.
    play(prints[from].querySelector('.print__copy'), [{ opacity: 1 }, { opacity: 0, offset: .33 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' })
    play(prints[to], [{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2, .7, .3, 1)' })
    const card = cards[to]
    if (individualTransforms) {
      const rot = parseFloat(getComputedStyle(card).rotate) || 0
      play(card, [{ translate: '0 16px', rotate: `${rot + .7}deg` }, { translate: '0 0', rotate: `${rot}deg` }], { duration: 700, easing: EXPO })
    } else {
      play(card, [{ transform: 'translateY(16px)' }, { transform: 'none' }], { duration: 700, easing: EXPO })
    }
    entrance(to)
  }
  // Backward: a short crossfade only.
  function backward(from, to) {
    play(prints[from], [{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'linear' })
    play(prints[to], [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'linear' })
  }

  async function go(i, { instant = false } = {}) {
    i = Math.max(0, Math.min(last, i))
    const token = ++seq
    if (i === shown) return
    const from = shown
    if (pending) release()
    const quiet = instant || !sticky || !canAnimate || ctx.reduced || ctx.state.programmaticScroll || document.hidden
    if (quiet) { stop(); paint(i); return }
    if (i > from) {
      await gate(imgs[i])
      if (token !== seq) return
      if (ctx.state.programmaticScroll) { stop(); paint(i); return }
    }
    stop()
    paint(i)
    if (i > from) forward(from, i)
    else backward(from, i)
  }

  // ---------- Frame 1: inked in on its first arrival ----------
  function release() {
    pending = false
    section.classList.remove('is-pending')
  }
  function reveal() {
    if (!pending) return
    release()
    if (shown !== 0 || !sticky || !canAnimate || ctx.reduced) return
    stop()
    entrance(0)
  }
  // After a jump, wait until the page has come to rest before deciding.
  function whenIdle(fn, tries = 40) {
    if (!ctx.state.programmaticScroll || tries <= 0) { fn(); return }
    setTimeout(() => whenIdle(fn, tries - 1), 100)
  }

  // ---------- Scroll picks the frame ----------
  let queued = false
  function decide() {
    queued = false
    const instant = !booted
    booted = true
    if (!sticky) return
    // No segment in the middle of the screen: the stage is above or below it. An instant jump
    // (back to the top, or past the story) keeps the section on screen, so its own observer stays quiet.
    if (!hits.size) {
      const r = section.getBoundingClientRect()
      if (r.top > 0 && shown !== 0) go(0, { instant: true })
      else if (r.bottom < innerHeight && shown !== last) go(last, { instant: true })
      return
    }
    const i = Math.max(...hits)
    if (pending && i === 0 && shown === 0) {
      whenIdle(() => { if (pending && hits.has(0) && shown === 0) reveal(); else release() })
      return
    }
    go(i, { instant })
  }
  segs.forEach(seg => {
    ctx.observe(seg, e => {
      const i = Number(seg.dataset.seg)
      if (e.isIntersecting) hits.add(i)
      else hits.delete(i)
      if (!queued) { queued = true; queueMicrotask(decide) }
    }, { rootMargin: '-50% 0px -50% 0px', threshold: 0 })
  })

  // The stage at an edge, arriving or leaving: below the screen it shows frame 1, above it frame 4.
  // The 1px inset matters at the very top: the hero is one screen tall, so the story touches the
  // bottom edge there, and a merely touching section would still count as on screen.
  ctx.observe(section, e => {
    if (!sticky) return
    const top = e.boundingClientRect.top
    if (!sectionSeen) {
      sectionSeen = true
      // The observer works and the story has not reached the middle of the screen yet:
      // hold frame 1 for its entrance.
      const vh = e.rootBounds?.height || innerHeight
      if (top > vh * .5 && canAnimate && !ctx.reduced) {
        pending = true
        section.classList.add('is-pending')
      }
    }
    if (hits.size) return
    if (top < 0 && shown !== last) go(last, { instant: true })
    else if (top > 0 && shown !== 0) go(0, { instant: true })
  }, { rootMargin: '-1px 0px', threshold: 0 })

  // Fetch the big prints a little before the guest gets there: frame 1 first, the others once it
  // has arrived (frames 2 to 4 carry fetchpriority="low" in the markup until then).
  const unobserveNear = ctx.observe(section, e => {
    if (!e.isIntersecting) return
    unobserveNear()
    const [first, ...rest] = imgs
    const others = () => rest.forEach(img => {
      if (!img) return
      img.setAttribute('fetchpriority', 'auto')
      if (img.loading === 'lazy') img.loading = 'eager'
    })
    if (!first) { others(); return }
    first.setAttribute('fetchpriority', 'high')
    if (first.loading === 'lazy') first.loading = 'eager'
    Promise.race([
      first.decode ? first.decode().catch(() => {}) : null,
      ctx.sleep(4000),
    ]).finally(others)
  }, { rootMargin: '50% 0px 50% 0px', threshold: 0 })

  // A print whose photo arrives late develops in instead of popping.
  imgs.forEach((img, i) => {
    if (!img || (img.complete && img.naturalWidth)) return
    img.addEventListener('load', () => {
      if (!sticky || shown !== i || ctx.reduced) return
      play(img, [{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: INK })
    }, { once: true })
  })

  // ---------- Phone layout: the print is sized around the tallest copy block ----------
  function measure() {
    if (!sticky) return
    section.classList.add('is-measuring')
    let h = 0
    prints.forEach(p => {
      const copy = p.querySelector('.print__copy')
      if (copy) h = Math.max(h, copy.getBoundingClientRect().height)
    })
    section.classList.remove('is-measuring')
    if (h) section.style.setProperty('--copy-h', `${Math.ceil(h)}px`)
  }
  let lastWidth = 0
  if ('ResizeObserver' in window) {
    new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width)
      if (w !== lastWidth) { lastWidth = w; measure() }
    }).observe(section)
  } else {
    addEventListener('resize', measure, { passive: true })
  }
  document.fonts?.ready?.then(measure)
  ctx.i18n.onChange(() => { renderCounter(); measure() })
  ctx.onPhase(measure)

  // ---------- Mode: sticky with motion, stacked under reduced motion ----------
  function setSticky(on) {
    if (on === sticky) return
    sticky = on
    stop()
    if (!on) release()
    section.classList.toggle('is-sticky', on)
    if (on) measure()
  }
  paint(0)
  setSticky(!ctx.reduced)
  const mq = matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener?.('change', () => setSticky(!mq.matches))
}
