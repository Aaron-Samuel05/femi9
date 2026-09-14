'use client'

import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import './PadLayersStage.css'

const VIDEO_SRC = '/assets/pad-scroll-360.mp4'
const FALLBACK_FRAME = '/assets/pad-frames-cutout/frame-090.webp'
const VIDEO_W = 360
const VIDEO_H = 640

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
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackRef = useRef<HTMLImageElement>(null)
  const lastTime = useRef(-1)
  const rafRef = useRef(0)

  const setScrollFrame = useCallback(() => {
    const stage = stageRef.current
    const video = videoRef.current
    if (!stage || !video || !Number.isFinite(video.duration) || video.duration <= 0) return

    const rect = stage.getBoundingClientRect()
    const height = stage.offsetHeight || rect.height
    const vh = window.innerHeight
    const progress = clamp01((vh - rect.top) / (vh + height))
    const time = progress * video.duration

    if (Math.abs(time - lastTime.current) > 1 / 120) {
      video.currentTime = time
      lastTime.current = time
    }
    stage.style.setProperty('--why-explode', explodeAt(progress).toFixed(3))
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    const video = videoRef.current
    if (!stage || !video) return

    let destroyed = false
    let listening = false
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')

    const schedule = () => {
      if (rafRef.current || destroyed) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        if (!destroyed) setScrollFrame()
      })
    }

    const onScroll = () => schedule()
    const onLoaded = () => {
      stage.dataset.videoReady = 'true'
      const fallback = fallbackRef.current
      if (fallback) fallback.hidden = true
      if (reduced.matches) {
        video.currentTime = video.duration
        lastTime.current = video.duration
      } else {
        schedule()
      }
    }
    const onError = () => {
      stage.dataset.videoReady = 'false'
      const fallback = fallbackRef.current
      if (fallback) fallback.hidden = false
    }
    const onMotion = () => {
      if (reduced.matches && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration
        lastTime.current = video.duration
      } else {
        schedule()
      }
    }
    const listen = (on: boolean) => {
      if (on === listening) return
      listening = on
      if (on) document.addEventListener('scroll', onScroll, { passive: true, capture: true })
      else document.removeEventListener('scroll', onScroll, { capture: true })
    }

    video.muted = true
    video.playsInline = true
    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('canplay', onLoaded)
    video.addEventListener('error', onError)
    reduced.addEventListener('change', onMotion)

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting
        listen(visible)
        if (visible) schedule()
      },
      { rootMargin: '900px 0px' },
    )
    observer.observe(stage)

    video.load()

    return () => {
      destroyed = true
      observer.disconnect()
      listen(false)
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('canplay', onLoaded)
      video.removeEventListener('error', onError)
      reduced.removeEventListener('change', onMotion)
      cancelAnimationFrame(rafRef.current)
      video.pause()
    }
  }, [setScrollFrame])

  return (
    <div
      ref={stageRef}
      className="fl-why__stage"
      role="img"
      aria-label="Femi9 pad, shown separating into its layers"
      style={{ '--frame-ratio': `${VIDEO_W} / ${VIDEO_H}` } as CSSProperties}
    >
      <img
        ref={fallbackRef}
        src={FALLBACK_FRAME}
        alt=""
        width={VIDEO_W}
        height={VIDEO_H}
        decoding="async"
      />
      <video
        ref={videoRef}
        className="fl-why__video"
        src={VIDEO_SRC}
        poster={FALLBACK_FRAME}
        width={VIDEO_W}
        height={VIDEO_H}
        playsInline
        muted
        preload="auto"
        aria-hidden="true"
      />
    </div>
  )
}
