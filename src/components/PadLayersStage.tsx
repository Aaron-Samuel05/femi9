'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import './PadLayersStage.css'

/**
 * The centre of the home page's "Why Femi9" section: the Femi9 pad separating
 * into its layers as the section scrolls into view, and reassembling as it
 * scrolls away.
 *
 * The playback engine is ported from pad-exploder.js, the Web Component the
 * frame sequence was made for: one rAF-coalesced update reading fresh geometry
 * every frame, frames decoded before use with gaps borrowed from the nearest
 * loaded frame, a DPR-capped canvas, debounced resize plus an orientation
 * safety pass, live reduced-motion switching, and full cleanup on unmount.
 *
 * What the Web Component adds and this section must not have is left out: its
 * heading and numbered callouts, the scroll-hint pill and loading bar, the
 * lavender stage, and the 400vh sticky runway (a runway cannot live in a grid
 * column, and sticky does not work inside the section's overflow:hidden).
 * Instead progress comes from the stage's own pass through the viewport, so the
 * page scrolls exactly as before and the pad reassembles on the way out.
 *
 * Frames: public/assets/pad-frames-cutout holds transparent cut-outs of the
 * pad-exploder frames in public/assets/pad-frames (frame 1 = fully exploded,
 * frame 90 = closed - the component's `reverse="true"` order), so the pad sits
 * directly on the section's purple.
 */

const FRAME_COUNT = 90
const ASSEMBLED = FRAME_COUNT - 1

/** Size of every cut-out frame, in pixels (one shared crop around the pad). */
const FRAME_W = 595
const FRAME_H = 1240

/** Cap the canvas backing store, as pad-exploder.js does. */
const MAX_DPR = 2

/** Frames decoding at once. */
const CONCURRENCY = 4

const frameSrc = (index: number) =>
  `/assets/pad-frames-cutout/frame-${String(index + 1).padStart(3, '0')}.webp`

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const ease = (t: number) => {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}

/**
 * How far apart the layers are (0 = assembled, 1 = fully exploded) for the
 * stage's progress through the viewport (0 = its top reaches the bottom of the
 * screen, 1 = its bottom leaves the top): closed as it arrives, fully exploded
 * and held while it is centred on screen, closed again as it leaves.
 */
function explodeAt(progress: number) {
  return ease((progress - 0.12) / 0.3) * (1 - ease((progress - 0.58) / 0.3))
}

export function PadLayersStage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!stage || !canvas || !ctx) return

    const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    // Phones and small screens: every second frame, half the download.
    const step = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches ? 2 : 1

    let destroyed = false
    let staticMode = reduceQuery.matches
    let listening = false
    let raf = 0
    let resizeTimer = 0
    let orientTimer = 0
    let drawn = -1
    let lastVar = -1
    let current = staticMode ? 1 : 0
    let target = current

    const images: (HTMLImageElement | null)[] = new Array(FRAME_COUNT).fill(null)
    const requested = new Set<number>()
    const queue: number[] = []
    const inFlight = new Set<HTMLImageElement>()

    const snap = (index: number) =>
      index === ASSEMBLED ? ASSEMBLED : Math.min(ASSEMBLED, Math.round(index / step) * step)

    /** A frame that has not arrived (or failed) borrows its nearest loaded
     *  neighbour, so gaps degrade invisibly. */
    const nearestLoaded = (index: number) => {
      for (let d = 0; d < FRAME_COUNT; d++) {
        if (images[index - d]) return index - d
        if (images[index + d]) return index + d
      }
      return -1
    }

    const progress = () => {
      if (staticMode) return 1
      // Fresh geometry every frame: shifts above the section never break it.
      const rect = stage.getBoundingClientRect()
      const height = stage.offsetHeight || rect.height
      const top = rect.top + (rect.height - height) / 2 // ignore the explode scale
      const vh = window.innerHeight
      return explodeAt(clamp01((vh - top) / (vh + height)))
    }

    const render = () => {
      const index = nearestLoaded(snap(Math.round((1 - current) * ASSEMBLED)))
      if (index >= 0 && index !== drawn && canvas.width) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(images[index] as HTMLImageElement, 0, 0, canvas.width, canvas.height)
        drawn = index
        stage.dataset.ready = 'true'
      }
      if (Math.abs(current - lastVar) > 0.004) {
        lastVar = current
        stage.style.setProperty('--why-explode', current.toFixed(3))
      }
    }

    /** Everything is coalesced into one rAF; all drawing happens inside it. */
    const schedule = () => {
      if (raf || destroyed) return
      raf = requestAnimationFrame(update)
    }

    function update() {
      raf = 0
      if (destroyed) return
      target = progress()
      current += (target - current) * 0.2
      if (Math.abs(target - current) < 0.002) current = target
      render()
      if (current !== target) schedule()
    }

    const pump = () => {
      while (!destroyed && inFlight.size < CONCURRENCY && queue.length) {
        const index = queue.shift() as number
        const img = new Image()
        img.decoding = 'async'
        inFlight.add(img)
        const settle = () => {
          inFlight.delete(img)
          pump()
        }
        img.onload = () => {
          // Decode up front so the first scrub never stutters on a lazy decode.
          const decoded = img.decode ? img.decode().catch(() => {}) : Promise.resolve()
          decoded.then(() => {
            if (destroyed) return
            images[index] = img
            drawn = -1
            schedule()
            settle()
          })
        }
        img.onerror = () => {
          if (!destroyed) settle()
        }
        img.src = frameSrc(index)
      }
    }

    const request = (indices: number[]) => {
      for (const index of indices) {
        if (requested.has(index)) continue
        requested.add(index)
        queue.push(index)
      }
      pump()
    }

    /** The end states first, so the stage is right before the rest arrive. */
    const requestFrames = () => {
      if (staticMode) {
        request([0])
        return
      }
      const all = [ASSEMBLED, 0, snap(44)]
      for (let i = 0; i < ASSEMBLED; i += step) all.push(i)
      request(all)
    }

    const sizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      const width = Math.max(1, Math.round(stage.clientWidth * dpr))
      const height = Math.max(1, Math.round(stage.clientHeight * dpr))
      if (!stage.clientWidth || (width === canvas.width && height === canvas.height)) return
      canvas.width = width
      canvas.height = height
      drawn = -1
      schedule()
    }

    const onScroll = () => schedule()

    const onResize = () => {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        sizeCanvas()
        schedule()
      }, 150)
    }

    // iOS reports stale sizes right after an orientation change.
    const onOrientation = () => {
      onResize()
      window.clearTimeout(orientTimer)
      orientTimer = window.setTimeout(() => {
        sizeCanvas()
        schedule()
      }, 400)
    }

    const onMotionPref = () => {
      staticMode = reduceQuery.matches
      if (staticMode) current = target = 1
      requestFrames()
      schedule()
    }

    const listen = (on: boolean) => {
      if (on === listening) return
      listening = on
      // Capture + passive: follows scrolling in any ancestor, never blocks it.
      if (on) document.addEventListener('scroll', onScroll, { passive: true, capture: true })
      else document.removeEventListener('scroll', onScroll, { capture: true })
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestFrames()
          // Arriving by a jump (anchor, reload mid-page): start where the
          // scroll already is instead of easing in from closed.
          if (!listening && !staticMode) current = target = progress()
          render()
        }
        listen(entry.isIntersecting)
      },
      { rootMargin: '900px 0px' },
    )
    observer.observe(stage)

    const sizer = new ResizeObserver(sizeCanvas)
    sizer.observe(stage)
    sizeCanvas()

    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onOrientation)
    reduceQuery.addEventListener('change', onMotionPref)

    return () => {
      destroyed = true
      observer.disconnect()
      sizer.disconnect()
      listen(false)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onOrientation)
      reduceQuery.removeEventListener('change', onMotionPref)
      cancelAnimationFrame(raf)
      window.clearTimeout(resizeTimer)
      window.clearTimeout(orientTimer)
      // Release image memory: abort anything still loading, drop references.
      for (const img of inFlight) {
        img.onload = img.onerror = null
        img.src = ''
      }
      inFlight.clear()
      images.fill(null)
    }
  }, [])

  return (
    <div
      ref={stageRef}
      className="fl-why__stage"
      role="img"
      aria-label="Femi9 pad, shown separating into its layers"
      style={{ '--frame-ratio': `${FRAME_W} / ${FRAME_H}` } as CSSProperties}
    >
      {/* The closed pad: shown until the first frame is drawn, and to anyone
          without JS. */}
      <img src={frameSrc(ASSEMBLED)} alt="" width={FRAME_W} height={FRAME_H} decoding="async" />
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  )
}
