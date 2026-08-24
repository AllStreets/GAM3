'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getActiveEngine } from '@/engine/GlobeEngine'
import { composePostcard, postcardCaption } from '@/lib/postcard'
import { emblemSvgString } from '@/components/Emblem'
import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
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

      // 4. Composite
      const postcardDataUrl = await composePostcard(frameDataUrl, {
        agencyName: agencyName || 'HYPERION',
        emblemSvg: svgStr,
        caption,
      })

      // 5. Download
      const link = document.createElement('a')
      link.download = 'hyperion-postcard.png'
      link.href = postcardDataUrl
      link.click()

      // 6. Audio feedback
      audio.uiTick()
    } catch (err) {
      console.error('PostcardButton: capture failed', err)
    } finally {
      setCapturing(false)
    }
  }, [agencyName, emblemId, colorway, targetId, contracts, capturing])

  const dismissNudge = useCallback(() => {
    setShowNudge(false)
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current)
  }, [])

  return (
    <>
      {/* Nudge — appears after completion cinematics, rate-limited */}
      {showNudge && (
        <div
          className="pointer-events-auto absolute bottom-20 right-16 flex animate-fade-in items-center gap-2 rounded border border-[var(--accent)] bg-black/70 px-3 py-1.5 text-xs text-[var(--accent)] shadow-lg backdrop-blur-sm"
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

      {/* Camera button */}
      <button
        onClick={handleCapture}
        disabled={capturing}
        aria-label="Capture orbital postcard"
        title="Capture orbital postcard"
        className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded border border-[var(--accent)] bg-black/60 text-[var(--accent)] opacity-70 backdrop-blur-sm transition hover:opacity-100 disabled:opacity-30"
      >
        {capturing ? (
          // Spinner while compositing
          <svg
            className="animate-spin"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
          >
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 10" />
          </svg>
        ) : (
          // Camera icon
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="8" cy="9" r="3" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5.5 4 L6.5 2 H9.5 L10.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </>
  )
}
