// Hero "Im Kalender eintragen": opens Apple, Google and Outlook right under the button,
// so guests save the date without being sent past the rest of the page.
// Without JS the plain link still jumps to the calendar block (#kalender).
const EXPO = 'cubic-bezier(.16, 1, .3, 1)'

export function init(ctx) {
  const pops = [...document.querySelectorAll('.calpop')]
  if (!pops.length) return

  function close(pop, { focus = false } = {}) {
    const toggle = pop.querySelector('.calpop__toggle')
    const menu = pop.querySelector('.calpop__menu')
    if (toggle.getAttribute('aria-expanded') !== 'true') return
    toggle.setAttribute('aria-expanded', 'false')
    menu.hidden = true
    if (focus) toggle.focus()
  }

  function open(pop) {
    pops.forEach(p => p !== pop && close(p))
    const toggle = pop.querySelector('.calpop__toggle')
    const menu = pop.querySelector('.calpop__menu')
    toggle.setAttribute('aria-expanded', 'true')
    menu.hidden = false
    if (!ctx.reduced && menu.animate) {
      menu.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EXPO })
      ;[...menu.children].forEach((item, i) => item.animate(
        [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }],
        { duration: 300, delay: 60 + i * 50, easing: EXPO, fill: 'backwards' },
      ))
    }
    // Phones: this menu opens under a button near the fold. Scroll just enough to show all of it,
    // never so far that the button itself leaves the screen.
    if (pop.classList.contains('calpop--row')) {
      const over = Math.min(pop.getBoundingClientRect().bottom - (innerHeight - 16), toggle.getBoundingClientRect().top - 16)
      if (over > 0) {
        ctx.markProgrammatic?.()
        scrollBy({ top: over, behavior: ctx.reduced ? 'auto' : 'smooth' })
      }
    }
  }

  for (const pop of pops) {
    const fallback = pop.querySelector('.calpop__fallback')
    const toggle = pop.querySelector('.calpop__toggle')
    if (!toggle) continue
    fallback.hidden = true
    toggle.hidden = false
    toggle.addEventListener('click', () => {
      if (toggle.getAttribute('aria-expanded') === 'true') close(pop)
      else open(pop)
    })
    pop.addEventListener('keydown', e => {
      if (e.key === 'Escape') close(pop, { focus: true })
    })
  }

  // A click anywhere else folds the menu away again.
  document.addEventListener('click', e => {
    pops.forEach(p => { if (!p.contains(e.target)) close(p) })
  })
}
