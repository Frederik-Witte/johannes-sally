// Postcard "Post für euch": the card drops onto the paper, the postmark thumps, the message is written
// line by line, and a button turns the card over to its Save the Date face.
// Contract: CSS holds the final state. The pre-entrance classes are only set while the card is still
// below the viewport; animations hold their first keyframe (fill: backwards) and hand over to CSS.

const SETTLE = 'cubic-bezier(.2, .9, .25, 1)'
const INK = 'cubic-bezier(.65, 0, .35, 1)'
const HIDDEN_LINE = 'inset(-.5em calc(100% + .5em) -.5em -.5em)'
const SHOWN_LINE = 'inset(-.5em -.5em -.5em -.5em)'

export function init(ctx) {
  const section = document.getElementById('post')
  const card = section?.querySelector('.card')
  if (!card) return
  const $ = s => section.querySelector(s)
  const body = $('.card__body')
  const shadow = $('.card__shadow')
  const shade = $('.card__shade')
  const hand = $('.card__hand')
  const toName = $('[data-post-to]')
  const postmark = $('.card__postmark')
  const btn = $('.card__flip')
  const faces = { message: $('.card__message'), front: $('.card__front') }
  const canAnimate = typeof card.animate === 'function'

  // Load the handwriting face (with the subsets this language needs) before the first wipe.
  const loadHand = () => document.fonts?.load
    ? document.fonts.load('1em "La Belle Aurore"', `${hand?.textContent || ''} ${toName?.textContent || ''}`).catch(() => {})
    : Promise.resolve()

  // ---------- Address and line spacing ----------
  // "An: euch", or the personal name from #fuer=, always set as text.
  function renderTo() {
    if (toName) toName.textContent = ctx.fuer || ctx.i18n.t('post.to.default')
  }
  // i18n renders each handwritten line as its own block; a space between them keeps words apart
  // for screen readers and when the message is copied.
  function spaceLines() {
    const lines = hand ? [...hand.querySelectorAll('.hl')] : []
    lines.forEach((line, i) => {
      if (i < lines.length - 1 && line.nextSibling?.nodeType !== Node.TEXT_NODE) line.after(' ')
    })
  }
  renderTo()
  spaceLines()
  loadHand()

  // ---------- Entrance: drop, postmark, handwriting ----------
  let done = false
  let anims = []
  let cleanupTimer = 0
  let layerTimer = 0

  function settle() {
    done = true
    clearTimeout(cleanupTimer)
    clearTimeout(layerTimer)
    anims.forEach(a => a.cancel())
    anims = []
    section.classList.remove('is-pending', 'is-unwritten')
    card.style.willChange = ''
  }

  async function enter() {
    done = true
    const tilt = parseFloat(getComputedStyle(card).getPropertyValue('--tilt')) || -1
    const from = `translateY(-40px) rotate(${-6 - tilt}deg)`
    card.style.willChange = 'transform, opacity'
    anims.push(
      card.animate([{ transform: from }, { transform: 'none' }], { duration: 700, easing: SETTLE, fill: 'backwards' }),
      card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'linear', fill: 'backwards' }),
      shadow.animate([{ opacity: .4, transform: 'translateY(26px) scale(1.03)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: SETTLE, fill: 'backwards' }),
      postmark.animate([{ opacity: 0, transform: 'scale(1.4)' }, { opacity: .85, transform: 'scale(1)' }], { delay: 700, duration: 180, easing: 'ease-in', fill: 'backwards' }),
    )
    section.classList.remove('is-pending')
    const t0 = performance.now()
    layerTimer = setTimeout(() => { card.style.willChange = '' }, 760)

    // Write only once the hand font is there (capped, then the fallback is acceptable).
    await Promise.race([loadHand(), ctx.sleep(800)])
    if (!section.classList.contains('is-unwritten')) return // settled meanwhile
    const lines = [...hand.querySelectorAll('.hl'), toName].filter(Boolean)
    let at = Math.max(0, 900 - (performance.now() - t0))
    for (const line of lines) {
      // A steady pen: longer lines take longer, within 380 to 900ms.
      const ms = Math.round(Math.min(900, Math.max(380, line.textContent.trim().length * 34)))
      anims.push(line.animate([{ clipPath: HIDDEN_LINE }, { clipPath: SHOWN_LINE }], { delay: at, duration: ms, easing: INK, fill: 'backwards' }))
      at += ms + 120
    }
    section.classList.remove('is-unwritten')
    cleanupTimer = setTimeout(() => { anims = [] }, at)
  }

  const rect = card.getBoundingClientRect()
  const below = rect.top > innerHeight
  if (!ctx.reduced && canAnimate && below) {
    section.classList.add('is-pending', 'is-unwritten')
    let stopPassed = () => {}
    const stop = ctx.observe(card, entry => {
      if (done || !entry.isIntersecting || entry.intersectionRatio < .39) return
      stop()
      stopPassed()
      // Passed by an in-page jump, or reached from below the fold by scrolling back up: final state.
      if (ctx.state.programmaticScroll || ctx.reduced || entry.boundingClientRect.top < 0) settle()
      else enter()
    }, { threshold: .4 })
    // A jump can carry the page past the card without it ever being on screen. This root reaches from
    // far above down to the top edge of the viewport, so it reports the card once it lies above the fold.
    stopPassed = ctx.observe(card, entry => {
      if (done || !entry.isIntersecting) return
      stop()
      stopPassed()
      settle()
    }, { rootMargin: '100000px 0px -100% 0px', threshold: 0 })
  } else {
    done = true
  }

  // Language or phase changes re-render the lines: finish any entrance and keep the address.
  // Before the entrance the new lines simply inherit the hidden state from CSS.
  ctx.i18n.onChange(() => { if (anims.length) settle(); renderTo(); spaceLines() })
  ctx.onPhase(() => { if (anims.length) settle(); spaceLines() })

  // ---------- Flip: 2D, Safari-safe (no preserve-3d) ----------
  let side = 'message'
  let flipping = false

  // The button names an action ("Karte umdrehen"), so it carries no pressed state. After a turn, a polite
  // live region says which side now faces up. Nothing is announced on load.
  const status = $('[data-card-status]')

  function setSide(next, { announce = true } = {}) {
    side = next
    card.dataset.side = next
    for (const [name, face] of Object.entries(faces)) {
      if (!face) continue
      const hidden = name !== next
      face.toggleAttribute('inert', hidden)
      if (hidden) face.setAttribute('aria-hidden', 'true')
      else face.removeAttribute('aria-hidden')
    }
    if (announce && status) status.textContent = ctx.i18n.t(`post.side.${next}`)
  }

  async function flip() {
    if (flipping) return
    flipping = true
    if (anims.length || section.classList.contains('is-pending')) settle()
    const next = side === 'message' ? 'front' : 'message'
    try {
      if (!canAnimate) {
        setSide(next)
      } else if (ctx.reduced) {
        const out = faces[side]
        const inn = faces[next]
        setSide(next)
        await Promise.all([
          out.animate([{ opacity: 1, visibility: 'visible' }, { opacity: 0, visibility: 'visible' }], { duration: 250, easing: 'linear' }).finished,
          inn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'linear' }).finished,
        ])
      } else {
        // Turn edge-on: the card narrows, darkens, and its shadow narrows with it.
        const half = { duration: 300, fill: 'forwards' }
        const closing = [
          body.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(.002)' }], { ...half, easing: 'ease-in' }),
          shadow.animate([{ transform: 'scaleX(1)', opacity: 1 }, { transform: 'scaleX(.02)', opacity: .35 }], { ...half, easing: 'ease-in' }),
          shade.animate([{ opacity: 0 }, { opacity: 1 }], { ...half, easing: 'ease-in' }),
        ]
        await closing[0].finished
        setSide(next)
        const opening = [
          body.animate([{ transform: 'scaleX(.002)' }, { transform: 'scaleX(1)' }], { duration: 300, easing: 'ease-out' }),
          shadow.animate([{ transform: 'scaleX(.02)', opacity: .35 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' }),
          shade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-out' }),
        ]
        closing.forEach(a => a.cancel())
        await opening[0].finished
      }
    } catch {
      // An animation was cancelled; the faces are already in a consistent state.
    } finally {
      flipping = false
    }
  }

  setSide('message', { announce: false })
  // A language switch clears the last announcement, so no text in the old language stays behind.
  ctx.i18n.onChange(() => { if (status) status.textContent = '' })
  section.classList.add('is-ready')
  if (btn) {
    btn.hidden = false
    btn.addEventListener('click', flip)
  }
  // Tapping the card turns it too. The button stays the accessible control.
  body.addEventListener('click', () => {
    const sel = getSelection?.()
    if (sel && !sel.isCollapsed && card.contains(sel.anchorNode)) return
    flip()
  })
}
