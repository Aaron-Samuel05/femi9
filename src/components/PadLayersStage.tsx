'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import './PadLayersStage.css'

/**
 * Scroll-controlled Femi9 pad frame sequence. The artwork stays exact to the
 * supplied product frames; scroll controls the exploded/reassembled playback.
 * The canvas backing store is capped to the frames' native 595px width so
 * Retina phones do not upscale the raster artwork before displaying it.
 */
const FRAME_COUNT = 90
const ASSEMBLED = FRAME_COUNT - 1
const FRAME_W = 595
const FRAME_H = 1240
const MAX_DPR = 2
const CONCURRENCY = 4

const frameSrc = (index: number) =>
  `/assets/pad-frames-cutout/frame-${String(index + 1).padStart(3, '0')}.webp`

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const ease = (t: number) => {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}

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

    const nearestLoaded = (index: number) => {
      for (let d = 0; d < FRAME_COUNT; d++) {
        if (images[index - d]) return index - d
        if (images[index + d]) return index + d
      }
      return -1
    }

    const progress = () => {
      if (staticMode) return 1
      const rect = stage.getBoundingClientRect()
      const height = stage.offsetHeight || rect.height
      const top = rect.top + (rect.height - height) / 2
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
      const cssWidth = Math.max(1, stage.clientWidth)
      const cssHeight = Math.max(1, stage.clientHeight)
      // Render at native asset resolution (or below), never above it.
      const nativeDprCap = FRAME_W / cssWidth
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR, nativeDprCap)
      const width = Math.max(1, Math.min(FRAME_W, Math.round(cssWidth * dpr)))
      const height = Math.max(1, Math.min(FRAME_H, Math.round(cssHeight * dpr)))
      if (!stage.clientWidth || (width === canvas.width && height === canvas.height)) return
      canvas.width = width
      canvas.height = height
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
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
      if (on) document.addEventListener('scroll', onScroll, { passive: true, capture: true })
      else document.removeEventListener('scroll', onScroll, { capture: true })
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestFrames()
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
      <img src={frameSrc(ASSEMBLED)} alt="" width={FRAME_W} height={FRAME_H} decoding="async" />
      <canvas ref={canvasRef} aria-hidden="true" />
    </div>
  )
}
