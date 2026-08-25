'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getActiveEngine } from '@/engine/GlobeEngine'
import { composePostcard, postcardCaption } from '@/lib/postcard'
import { emblemSvgString } from '@/components/Emblem'
import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { usePlaceStore } from '@/state/placeStore'
import { simNow } from '@/lib/simTime'
import { audio } from '@/audio/AudioEngine'

/** How many sim-seconds to wait before showing the nudge again (~3 min realtime at scale=20). */
const NUDGE_COOLDOWN_SIM_S = 60 * 3 * 20 // 3 real minutes in sim-seconds

/** Sim-time of the last nudge display, persisted in module scope (survives re-renders). */
let lastNudgeSimTime = -Infinity

export default function PostcardButton() {
  const [capturing, setCapturing] = useState(false)
  const [showNudge, setShowNudge] = useState(false)
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Agency info from store
  const agencyName = useAgencyStore((s) => s.name)
  const emblemId = useAgencyStore((s) => s.emblemId)
  const colorway = useAgencyStore((s) => s.colorway)

  // Contract state for caption
  const targetId = useContractStore((s) => s.targetId)
  const contracts = useContractStore((s) => s.contracts)
  const lastCompletion = useContractStore((s) => s.lastCompletion)

  // Place state — nudge when a city reveal is active
  const reveal = usePlaceStore((s) => s.reveal)
  const addPostcard = usePlaceStore((s) => s.addPostcard)

  // Watch for completion cinematics to show nudge
  const lastCompletionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!lastCompletion) return
    if (lastCompletion.contractId === lastCompletionRef.current) return
    lastCompletionRef.current = lastCompletion.contractId

    const now = simNow()
    if (now - lastNudgeSimTime < NUDGE_COOLDOWN_SIM_S) return
    lastNudgeSimTime = now

    // Show nudge for ~3s
    setShowNudge(true)
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
    nudgeTimerRef.current = setTimeout(() => setShowNudge(false), 3000)
  }, [lastCompletion])

  // Also show nudge when a city reveal becomes active (inherently postcard-worthy)
  const revealRef = useRef<typeof reveal>(null)
  useEffect(() => {
    if (!reveal) return
    // Only trigger when a new reveal appears (not on re-renders with same reveal)
    if (reveal === revealRef.current) return
    revealRef.current = reveal

    const now = simNow()
    if (now - lastNudgeSimTime < NUDGE_COOLDOWN_SIM_S) return
    lastNudgeSimTime = now

    setShowNudge(true)
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
    nudgeTimerRef.current = setTimeout(() => setShowNudge(false), 3000)
  }, [reveal])

  // Clear revealRef when reveal is dismissed
  useEffect(() => {
    if (!reveal) revealRef.current = null
  }, [reveal])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
    }
  }, [])

  const handleCapture = useCallback(async () => {
    const engine = getActiveEngine()
    if (!engine || capturing) return

    setCapturing(true)
    setShowNudge(false)

    try {
      // 1. Capture the WebGL frame (engine returns a PNG data URL)
      const frameDataUrl = engine.captureFrame()

      // 2. Build caption
      const targetContract = targetId
        ? contracts.find((c) => c.id === targetId && c.status === 'active')
        : null
      const caption = postcardCaption({
        contractTitle: targetContract?.title,
        simTime: simNow(),
      })

      // 3. Build emblem SVG string
      const svgStr = emblemSvgString(emblemId, colorway, 100)

      // 4. Composite (orbital frame — no city image)
      const postcardDataUrl = await composePostcard(frameDataUrl, {
        agencyName: agencyName || 'HYPERION',
        emblemSvg: svgStr,
        caption,
      })

      // 5. Push into session strip
      if (postcardDataUrl) addPostcard(postcardDataUrl)

      // 6. Download
      const link = document.createElement('a')
      link.download = 'hyperion-postcard.png'
      link.href = postcardDataUrl
      link.click()

      // 7. Audio feedback
      audio.uiTick()
    } catch (err) {
      console.error('PostcardButton: capture failed', err)
    } finally {
      setCapturing(false)
    }
  }, [agencyName, emblemId, colorway, targetId, contracts, capturing, addPostcard])

  const dismissNudge = useCallback(() => {
    setShowNudge(false)
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
  }, [])

  return (
    <>
      {/* Nudge — appears after completion cinematics or city reveals, rate-limited */}
      {showNudge && (
        <div
          className="pointer-events-auto absolute bottom-12 right-0 flex animate-fade-in items-center gap-2 rounded border border-[var(--accent)] bg-black/70 px-3 py-1.5 text-xs text-[var(--accent)] shadow-lg backdrop-blur-sm whitespace-nowrap"
          role="status"
        >
          <span>postcard-worthy ✨</span>
          <button
            onClick={dismissNudge}
            className="ml-1 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Labelled postcard button — prominent, on-brand */}
      <button
        onClick={handleCapture}
        disabled={capturing}
        aria-label="Capture orbital postcard"
        title="Capture orbital postcard"
        className="pointer-events-auto flex h-8 items-center gap-1.5 rounded border border-[var(--accent)] bg-black/60 px-3 text-[var(--accent)] opacity-70 backdrop-blur-sm transition hover:opacity-100 disabled:opacity-30"
      >
        {capturing ? (
          // Spinner while compositing
          <svg
            className="animate-spin"
            width="12"
            height="12"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 10" />
          </svg>
        ) : (
          // Record / capture dot
          <span className="text-[10px]" aria-hidden>◉</span>
        )}
        <span className="text-[10px] font-semibold tracking-[0.2em] uppercase">
          {capturing ? 'CAPTURING…' : 'POSTCARD'}
        </span>
      </button>
    </>
  )
}
