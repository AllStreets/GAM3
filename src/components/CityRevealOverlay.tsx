'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePlaceStore } from '@/state/placeStore'
import { useAgencyStore } from '@/state/agencyStore'
import { simNow } from '@/lib/simTime'
import { composePostcard, postcardCaption } from '@/lib/postcard'
import { emblemSvgString } from '@/components/Emblem'
import { getActiveEngine } from '@/engine/GlobeEngine'
import { audio } from '@/audio/AudioEngine'
import type { PlaceImage } from '@/lib/placeImage'

/** Format a simulation-time seconds value as a stardate string: SD NNNNNN.N */
function formatStardate(simSeconds: number): string {
  // Scale sim-seconds into a compact stardate: divide by 86400 for "sim days"
  const simDays = simSeconds / 86400
  return `SD ${simDays.toFixed(1).padStart(8, '0')}`
}

function formatCoords(lat: number, lon: number): string {
  const latAbs = Math.abs(lat).toFixed(3)
  const lonAbs = Math.abs(lon).toFixed(3)
  const latDir = lat >= 0 ? 'N' : 'S'
  const lonDir = lon >= 0 ? 'E' : 'W'
  return `${latAbs}°${latDir}  ${lonAbs}°${lonDir}`
}

/** Delay in ms before the overlay image blooms in — lets the camera push-in play. */
const BLOOM_DELAY_MS = 1100

export default function CityRevealOverlay() {
  const reveal = usePlaceStore((s) => s.reveal)
  const clearReveal = usePlaceStore((s) => s.clearReveal)
  const addPostcard = usePlaceStore((s) => s.addPostcard)

  // Agency branding for city postcard
  const agencyName = useAgencyStore((s) => s.name)
  const emblemId = useAgencyStore((s) => s.emblemId)
  const colorway = useAgencyStore((s) => s.colorway)

  const [placeImage, setPlaceImage] = useState<PlaceImage | null>(null)
  const [imgError, setImgError] = useState(false)
  const [visible, setVisible] = useState(false)   // controls fade/scale bloom
  const [bloomed, setBloomed] = useState(false)    // true once visible delay fired
  const [capturing, setCapturing] = useState(false)

  const fetchIdRef = useRef(0)
  const bloomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchPlaceImage = useCallback(async (lat: number, lon: number, id: number) => {
    try {
      const res = await fetch(`/api/place-image?lat=${lat}&lon=${lon}`)
      if (!res.ok) return
      const data = (await res.json()) as PlaceImage
      if (fetchIdRef.current === id) {
        setPlaceImage(data)
        setImgError(false)
      }
    } catch {
      // Network error — fall through; stylized reveal will show instead
    }
  }, [])

  // When reveal activates: fetch image + schedule bloom.
  useEffect(() => {
    if (!reveal) {
      // Tear down: clear timers, reset all state.
      if (bloomTimerRef.current) clearTimeout(bloomTimerRef.current)
      setVisible(false)
      setBloomed(false)
      setPlaceImage(null)
      setImgError(false)
      return
    }

    // New reveal — reset state and fetch image.
    setVisible(false)
    setBloomed(false)
    setPlaceImage(null)
    setImgError(false)
    const id = ++fetchIdRef.current
    void fetchPlaceImage(reveal.lat, reveal.lon, id)

    // Schedule bloom after push-in delay.
    if (bloomTimerRef.current) clearTimeout(bloomTimerRef.current)
    bloomTimerRef.current = setTimeout(() => {
      setBloomed(true)
      requestAnimationFrame(() => setVisible(true))
    }, BLOOM_DELAY_MS)

    return () => {
      if (bloomTimerRef.current) clearTimeout(bloomTimerRef.current)
    }
  }, [reveal, fetchPlaceImage])

  // ESC to dismiss.
  useEffect(() => {
    if (!reveal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearReveal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reveal, clearReveal])

  // City-image postcard capture
  const handleCapturePostcard = useCallback(async () => {
    if (!reveal || capturing) return
    setCapturing(true)
    try {
      // Capture the WebGL frame as fallback in case city image fails
      const engine = getActiveEngine()
      const frameDataUrl = engine ? engine.captureFrame() : ''

      const hasCity = placeImage && placeImage.source !== 'none' && !imgError

      const caption = postcardCaption({
        contractTitle: reveal.label,
        simTime: simNow(),
      })
      const svgStr = emblemSvgString(emblemId, colorway, 100)

      const postcardDataUrl = await composePostcard(frameDataUrl || 'data:,', {
        agencyName: agencyName || 'HYPERION',
        emblemSvg: svgStr,
        caption,
        baseImageUrl: hasCity ? placeImage!.url : undefined,
        imageAttribution: hasCity ? (placeImage!.attribution ?? undefined) : undefined,
      })

      if (postcardDataUrl && postcardDataUrl !== 'data:,') {
        addPostcard(postcardDataUrl)
        const link = document.createElement('a')
        link.download = `hyperion-${reveal.label.replace(/\s+/g, '-').toLowerCase()}.png`
        link.href = postcardDataUrl
        link.click()
        audio.uiTick()
      }
    } catch (err) {
      console.error('CityRevealOverlay: postcard capture failed', err)
    } finally {
      setCapturing(false)
    }
  }, [reveal, capturing, placeImage, imgError, agencyName, emblemId, colorway, addPostcard])

  if (!reveal || !bloomed) return null

  const { lat, lon, label } = reveal
  const coords = formatCoords(lat, lon)
  const stardate = formatStardate(simNow())
  const hasImage = placeImage && placeImage.source !== 'none' && !imgError

  return (
    /* Outer shell: pointer-events-none so the globe stays interactive; only controls capture events */
    <div
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
      aria-label="City reveal overlay"
    >
      {/* Vignette backdrop — darkens the globe beneath */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 10%, rgba(0,0,0,0.72) 80%)',
          opacity: visible ? 1 : 0,
        }}
      />

      {/* Main reveal panel */}
      <div
        className="pointer-events-auto relative flex w-[26rem] max-w-[92vw] flex-col overflow-hidden rounded border border-white/15 bg-black/80 font-mono backdrop-blur-sm transition-all duration-700"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.92)',
          boxShadow: '0 0 48px 4px rgba(69,216,255,0.18)',
        }}
      >
        {/* Header bar */}
        <div className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[9px] tracking-[0.45em] text-[var(--accent)] opacity-70 uppercase">
              ORBITAL REVEAL
            </p>
            <h2 className="mt-0.5 truncate text-sm font-bold tracking-[0.3em] text-[var(--text)] uppercase">
              {label}
            </h2>
            <p className="mt-0.5 text-[10px] tabular-nums opacity-50">{coords}</p>
          </div>
          <button
            onClick={clearReveal}
            className="shrink-0 rounded border border-white/10 px-2 py-1 text-[10px] opacity-60 transition hover:border-[var(--accent)]/50 hover:opacity-100"
            aria-label="Close city reveal"
          >
            ✕
          </button>
        </div>

        {/* Hero image or stylized fallback */}
        <div className="relative h-48 w-full overflow-hidden border-b border-white/10 bg-black/60">
          {hasImage ? (
            <>
              <img
                src={placeImage!.url}
                alt={placeImage!.title}
                className="h-full w-full object-cover transition-opacity duration-700"
                style={{ opacity: visible ? 1 : 0 }}
                onError={() => setImgError(true)}
              />
              {/* Scan-line gradient overlay for cinematic feel */}
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.65) 100%)',
                }}
              />
            </>
          ) : (
            /* Stylized reveal when no image — still cinematic */
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              <div
                className="h-px w-32 transition-all duration-1000"
                style={{
                  background: 'linear-gradient(to right, transparent, var(--accent), transparent)',
                  width: visible ? '8rem' : '0',
                }}
              />
              <p className="text-[10px] tracking-[0.5em] text-[var(--accent)] opacity-60 uppercase">
                {coords}
              </p>
              <p className="text-[9px] tracking-[0.35em] opacity-30 uppercase">
                {placeImage ? 'NO IMAGERY ON FILE' : 'SCANNING…'}
              </p>
              <div
                className="h-px w-32 transition-all duration-1000"
                style={{
                  background: 'linear-gradient(to right, transparent, var(--accent), transparent)',
                  width: visible ? '8rem' : '0',
                  transitionDelay: '150ms',
                }}
              />
            </div>
          )}

          {/* Stardate overlay on image */}
          <div className="absolute bottom-2 left-3 text-[9px] tabular-nums tracking-[0.3em] text-white/60 uppercase">
            {stardate}
          </div>
        </div>

        {/* Attribution */}
        {hasImage && placeImage!.attribution && (
          <p className="truncate border-b border-white/5 px-4 py-1.5 text-[8px] opacity-35" title={placeImage!.attribution}>
            {placeImage!.attribution}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-1.5 px-4 py-3">
          {/* CAPTURE POSTCARD — city-image postcard */}
          <button
            onClick={handleCapturePostcard}
            disabled={capturing}
            className="w-full rounded border border-[var(--accent)]/60 py-1.5 text-[10px] tracking-[0.25em] text-[var(--accent)] transition hover:bg-[var(--accent)]/10 disabled:cursor-not-allowed disabled:opacity-40 uppercase"
          >
            {capturing ? (
              <span className="flex items-center justify-center gap-1.5">
                <svg className="animate-spin" width="10" height="10" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 10" />
                </svg>
                CAPTURING…
              </span>
            ) : (
              '◉ CAPTURE POSTCARD'
            )}
          </button>

          {/* ENTER OPERATIONS / dismiss */}
          <button
            onClick={clearReveal}
            className="w-full rounded border border-[var(--accent)]/50 py-1.5 text-[10px] tracking-[0.25em] text-[var(--accent)] transition hover:bg-[var(--accent)]/10 uppercase"
          >
            ENTER OPERATIONS
          </button>
        </div>
      </div>
    </div>
  )
}
