import { useEffect } from 'react'

const KEY_STEP = 0.08
const PAGE_STEP = 0.34

// Progress is normalised 0→1 and read from a native scroll container, so touch,
// trackpads, momentum and scrollbars all come free. The container's width is set
// in viewport units, which is what decouples the journey from pixel count — a
// phone and an ultrawide travel the same distance, at different scales.
export function useScrollProgress(scrollerRef, scroll) {
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return undefined

    const maxScroll = () => Math.max(1, scroller.scrollWidth - scroller.clientWidth)
    const readProgress = () => {
      scroll.current.target = Math.min(1, Math.max(0, scroller.scrollLeft / maxScroll()))
    }

    const nudge = (fraction) => {
      scroller.scrollLeft += fraction * maxScroll()
    }

    // Mouse wheels only emit deltaY. Without this, a mouse can't move the page
    // at all — trackpads would work and half the audience would be stuck.
    const onWheel = (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return

      scroller.scrollLeft += event.deltaY
      event.preventDefault()
    }

    const onKey = (event) => {
      const steps = {
        ArrowRight: KEY_STEP,
        ArrowLeft: -KEY_STEP,
        PageDown: PAGE_STEP,
        PageUp: -PAGE_STEP,
      }

      if (event.key === 'Home') return scroller.scrollTo({ left: 0, behavior: 'smooth' })
      if (event.key === 'End') {
        return scroller.scrollTo({ left: maxScroll(), behavior: 'smooth' })
      }

      const step = steps[event.key]
      if (step === undefined) return

      nudge(step)
      event.preventDefault()
    }

    readProgress()
    scroller.addEventListener('scroll', readProgress, { passive: true })
    window.addEventListener('resize', readProgress)
    // On window, not the scroller — otherwise the wheel stops working the moment
    // the cursor is over a card.
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)

    return () => {
      scroller.removeEventListener('scroll', readProgress)
      window.removeEventListener('resize', readProgress)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [scrollerRef, scroll])
}
