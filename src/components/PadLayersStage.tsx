'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import './PadLayersStage.css'

const VIDEO_SRC = '/assets/pad-scroll-360.mp4'
const POSTER_SRC = '/assets/pad-frames-cutout/frame-001.webp'
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
  const rafRef = useRef<number | null>(null)
  const lastTimeRef = useRef(-1)
  const mountedRef = useRef(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    const stage = stageRef.current
    const video = videoRef.current
    if (!stage || !video) return

    mountedRef.current = true

    const update = () => {
      if (!mountedRef.current) return

      const rect = stage.getBoundingClientRect()
      const height = stage.offsetHeight || rect.height
      const vh = window.innerHeight || 1

      // The entire visual state is driven by where the stage sits in the
      // viewport. This works with normal scrolling and smooth-scroll libraries
      // because getBoundingClientRect() reflects the actual rendered position.
      const progress = clamp01((vh * 0.78 - rect.top) / (vh * 0.9 + height))
      stage.style.setProperty('--why-explode', explodeAt(progress).toFixed(3))

      if (loadedRef.current && Number.isFinite(video.duration) && video.duration > 0) {
        const nextTime = Math.min(video.duration - 0.001, Math.max(0, progress * video.duration))
        if (Math.abs(nextTime - lastTimeRef.current) > 1 / 45) {
          try {
            video.currentTime = nextTime
            lastTimeRef.current = nextTime
          } catch {
            // A seek can briefly fail while the browser is opening a media range.
          }
        }
      }

      rafRef.current = window.requestAnimationFrame(update)
    }

    const markReady = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return
      loadedRef.current = true
      stage.dataset.videoReady = 'true'
      stage.dataset.videoError = 'false'
    }

    const markError = () => {
      loadedRef.current = false
      stage.dataset.videoReady = 'false'
      stage.dataset.videoError = 'true'
    }

    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.addEventListener('loadedmetadata', markReady)
    video.addEventListener('loadeddata', markReady)
    video.addEventListener('canplay', markReady)
    video.addEventListener('error', markError)

    video.load()
    rafRef.current = window.requestAnimationFrame(update)

    return () => {
      mountedRef.current = false
      loadedRef.current = false
      video.removeEventListener('loadedmetadata', markReady)
      video.removeEventListener('loadeddata', markReady)
      video.removeEventListener('canplay', markReady)
      video.removeEventListener('error', markError)
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
      video.pause()
    }
  }, [])

  return (
    <div
      ref={stageRef}
      className="fl-why__stage"
      role="img"
      aria-label="Femi9 pad, shown separating into its layers"
      style={{ '--frame-ratio': `${VIDEO_W} / ${VIDEO_H}` } as CSSProperties}
    >
      <img
        className="fl-why__poster"
        src={POSTER_SRC}
        alt=""
        width={VIDEO_W}
        height={VIDEO_H}
        decoding="async"
      />
      <video
        ref={videoRef}
        className="fl-why__video"
        src={VIDEO_SRC}
        poster={POSTER_SRC}
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
