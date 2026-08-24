'use client'

import { useEffect, useRef, useState } from 'react'
import { useContractStore, type CompletionEvent } from '@/state/contractStore'
import { audio } from '@/audio/AudioEngine'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const ARCHETYPE_LABEL: Record<string, string> = {
  relief: 'RELIEF',
  research: 'SCIENCE',
  defense: 'DEFENSE',
}

const ARCHETYPE_COLOR: Record<string, string> = {
  relief: '#ff9955',
  research: '#45d8ff',
  defense: '#c084fc',
}

// Count-up hook: animates a number from 0 → target over `ms` milliseconds.
function useCountUp(target: number, ms: number, running: boolean): number {
  const [value, setValue] = useState(0)
  const raf = useRef<number>(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) { setValue(0); return }
    startRef.current = null
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const frac = Math.min(1, (now - startRef.current) / ms)
      setValue(Math.round(frac * target))
      if (frac < 1) raf.current = requestAnimationFrame(tick)
      else setValue(target)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, ms, running])

  return value
}

// ──────────────────────────────────────────────────────────────────────────────
// Overlay
// ──────────────────────────────────────────────────────────────────────────────

interface PhaseState {
  /** 0=title, 1=downlink, 2=tally, 3=chips, 4=done */
  phase: number
  event: CompletionEvent
}

export default function CompletionCinematic() {
  const lastCompletion = useContractStore((s) => s.lastCompletion)
  const clearCompletion = useContractStore((s) => s.clearCompletion)

  const [active, setActive] = useState<PhaseState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearedRef = useRef<string | null>(null)

  // Pick up a new event.
  useEffect(() => {
    if (!lastCompletion) return
    if (lastCompletion.contractId === clearedRef.current) return
    setActive({ phase: 0, event: lastCompletion })
  }, [lastCompletion])

  // Phase advancement.
  useEffect(() => {
    if (!active) return
    if (active.phase >= 4) return // done

    const delays: number[] = [
      600,   // 0→1: title resolve → start downlink
      1600,  // 1→2: downlink complete → start tally
      1200,  // 2→3: tally done → chips + flourish
      1400,  // 3→4: auto-dismiss
    ]
    timerRef.current = setTimeout(() => {
      setActive((prev) => prev ? { ...prev, phase: prev.phase + 1 } : null)
    }, delays[active.phase] ?? 1000)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [active?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss when phase reaches 4.
  useEffect(() => {
    if (!active || active.phase < 4) return
    const ev = active.event
    clearedRef.current = ev.contractId
    setActive(null)
    clearCompletion()
  }, [active?.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    if (!active) return
    if (timerRef.current) clearTimeout(timerRef.current)
    clearedRef.current = active.event.contractId
    setActive(null)
    clearCompletion()
  }

  if (!active) return null

  const { phase, event } = active

  return (
    <CompletionOverlay
      event={event}
      phase={phase}
      onDismiss={dismiss}
    />
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// The actual rendered overlay — extracted so it doesn't re-subscribe to store.
// ──────────────────────────────────────────────────────────────────────────────

function CompletionOverlay({
  event,
  phase,
  onDismiss,
}: {
  event: CompletionEvent
  phase: number
  onDismiss: () => void
}) {
  const archetypeColor = ARCHETYPE_COLOR[event.archetype] ?? '#ffffff'

  // Downlink progress (phase 1)
  const dlProgress = useCountUp(100, 1400, phase >= 1)

  // Funding tally (phase 2)
  const fundingCount = useCountUp(event.funding, 1000, phase >= 2)

  // Play stinger at start of tally phase.
  const stingerFired = useRef(false)
  useEffect(() => {
    if (phase === 2 && !stingerFired.current) {
      stingerFired.current = true
      audio.stinger()
    }
  }, [phase])

  // Play uiTick on each funding count-up step.
  const prevFunding = useRef(0)
  useEffect(() => {
    if (fundingCount > prevFunding.current && fundingCount < event.funding) {
      if (fundingCount % 20 === 0) audio.uiTick()
    }
    prevFunding.current = fundingCount
  }, [fundingCount, event.funding])

  const multiplierPct = Math.round((event.multiplier - 1) * 100)

  return (
    /* pointer-events-none on outer shell; only the dismiss button is interactive */
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="pointer-events-auto relative w-80 rounded border border-[var(--accent)] bg-black/80 p-5 font-mono backdrop-blur-sm"
        style={{ boxShadow: `0 0 24px 2px ${archetypeColor}40` }}
      >
        {/* Title */}
        <p className="mb-1 text-[10px] tracking-[0.4em] text-[var(--accent)] opacity-70">CONTRACT COMPLETE</p>
        <h2
          className="mb-4 text-sm font-bold leading-tight tracking-widest"
          style={{ color: archetypeColor }}
        >
          {event.title.toUpperCase()}
        </h2>

        {/* Data-downlink bar (phases 1+) */}
        {phase >= 1 && (
          <div className="mb-3">
            <p className="mb-1 text-[9px] tracking-[0.3em] text-[var(--text)] opacity-50">
              DATA DOWNLINK
            </p>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-none"
                  style={{
                    width: `${dlProgress}%`,
                    background: archetypeColor,
                    boxShadow: `0 0 6px ${archetypeColor}`,
                  }}
                />
              </div>
              <span className="text-[10px] tabular-nums" style={{ color: archetypeColor }}>
                {dlProgress}%
              </span>
            </div>
          </div>
        )}

        {/* Funding tally (phases 2+) */}
        {phase >= 2 && (
          <div className="mb-4">
            <p className="mb-0.5 text-[9px] tracking-[0.3em] text-[var(--text)] opacity-50">FUNDING AWARDED</p>
            <p className="text-2xl font-bold tabular-nums" style={{ color: archetypeColor }}>
              ${fundingCount.toLocaleString()}
            </p>
          </div>
        )}

        {/* Archetype chip + flourishes (phases 3+) */}
        {phase >= 3 && (
          <div className="flex flex-wrap gap-2">
            {/* Archetype chip */}
            <span
              className="rounded border px-2 py-0.5 text-[9px] tracking-widest"
              style={{ borderColor: archetypeColor, color: archetypeColor }}
            >
              {ARCHETYPE_LABEL[event.archetype] ?? event.archetype.toUpperCase()}
            </span>

            {/* Match chip */}
            {event.matched && (
              <span className="rounded border border-emerald-400/60 px-2 py-0.5 text-[9px] tracking-widest text-emerald-400">
                CAPABILITY MATCH
              </span>
            )}

            {/* Grade chip */}
            {event.grade && (
              <span className="rounded border border-yellow-400/60 px-2 py-0.5 text-[9px] tracking-widest text-yellow-400">
                GRADE {event.grade}
              </span>
            )}

            {/* Trick-shot flourish */}
            {event.trickShot && event.trickShot > 1 && (
              <span className="rounded border border-purple-400/70 px-2 py-0.5 text-[9px] font-bold tracking-widest text-purple-400">
                TRICK-SHOT ×{event.trickShot}
              </span>
            )}

            {/* Streak flourish (show when streak ≥ 2) */}
            {event.streak >= 2 && (
              <span className="rounded border border-amber-400/70 px-2 py-0.5 text-[9px] font-bold tracking-widest text-amber-400">
                STREAK ×{event.streak}
                {multiplierPct > 0 ? ` · +${multiplierPct}%` : ''}
              </span>
            )}

            {/* Relief impact line (T6 populates this) */}
            {event.reliefImpact && (
              <p className="mt-2 w-full text-[9px] leading-relaxed text-[#ff9955]/80">
                {event.reliefImpact}
              </p>
            )}
          </div>
        )}

        {/* Dismiss hint */}
        <button
          onClick={onDismiss}
          className="mt-4 block w-full cursor-pointer text-center text-[8px] tracking-[0.5em] text-[var(--text)] opacity-30 hover:opacity-60 transition-opacity"
        >
          [ DISMISS ]
        </button>
      </div>
    </div>
  )
}
