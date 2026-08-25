'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/state/gameStore'
import { useAgencyStore } from '@/state/agencyStore'
import { simNow } from '@/lib/simTime'
import { audio } from '@/audio/AudioEngine'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Format sim-seconds remaining into a MM:SS string. */
function formatCountdown(simSec: number): string {
  const s = Math.max(0, Math.floor(simSec))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// ──────────────────────────────────────────────────────────────────────────────
// Conjunction Alert
// ──────────────────────────────────────────────────────────────────────────────

export function ConjunctionAlert() {
  const founded = useAgencyStore((s) => s.founded)
  const emergency = useGameStore((s) => s.emergency)
  const satellites = useGameStore((s) => s.satellites)
  const select = useGameStore((s) => s.select)
  const setBurnPlan = useGameStore((s) => s.setBurnPlan)
  const payEvasion = useGameStore((s) => s.payEvasion)

  // Live countdown — updates once per real second.
  const [simSecsRemaining, setSimSecsRemaining] = useState<number>(0)

  useEffect(() => {
    if (!emergency) return
    const tick = () => setSimSecsRemaining(emergency.deadline - simNow())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [emergency])

  if (!founded || !emergency) return null

  const sat = satellites.find((s) => s.id === emergency.satId)
  const satName = sat?.name ?? emergency.satId
  const hasFuel = (sat?.fuel ?? 0) >= emergency.requiredDv

  const handleFlyEvasive = () => {
    select(emergency.satId)
    setBurnPlan({ prograde: emergency.requiredDv })
    audio.chirp()
  }

  const handlePayEvasion = () => {
    const ok = payEvasion()
    if (ok) audio.uiTick()
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div
        className="pointer-events-auto w-96 rounded border border-red-500 bg-black/90 p-5 font-mono backdrop-blur-sm"
        style={{ boxShadow: '0 0 32px 4px rgba(255,80,80,0.35)' }}
      >
        {/* Header */}
        <div className="mb-1 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full bg-red-500"
            style={{ boxShadow: '0 0 6px rgba(255,80,80,0.9)', animation: 'pulse 0.8s infinite' }}
          />
          <p className="text-[10px] tracking-[0.4em] text-red-400">CONJUNCTION WARNING</p>
        </div>

        {/* Satellite name */}
        <h2 className="mb-3 text-sm font-bold tracking-widest text-red-300">
          {satName.toUpperCase()}
        </h2>

        {/* Countdown + required Δv */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <p className="mb-0.5 text-[9px] tracking-[0.3em] text-red-400/60">TIME TO IMPACT</p>
            <p
              className="text-2xl font-bold tabular-nums text-red-400"
              style={{ textShadow: '0 0 8px rgba(255,80,80,0.6)' }}
            >
              {formatCountdown(simSecsRemaining)}
            </p>
            <p className="mt-0.5 text-[9px] text-red-400/50">SIM-TIME REMAINING</p>
          </div>
          <div>
            <p className="mb-0.5 text-[9px] tracking-[0.3em] text-red-400/60">EVASIVE Δv</p>
            <p
              className="text-2xl font-bold tabular-nums text-red-300"
              style={{ textShadow: '0 0 8px rgba(255,80,80,0.4)' }}
            >
              {emergency.requiredDv} <span className="text-sm font-normal">m/s</span>
            </p>
            <p className="mt-0.5 text-[9px] text-red-400/50">PROGRADE COMPONENT</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleFlyEvasive}
            className="w-full cursor-pointer rounded border border-red-400 bg-red-900/40 px-3 py-2 text-[10px] font-bold tracking-[0.3em] text-red-200 transition-all hover:bg-red-800/60 hover:text-red-100"
          >
            FLY EVASIVE BURN
          </button>
          <button
            onClick={handlePayEvasion}
            disabled={!hasFuel}
            className={[
              'w-full cursor-pointer rounded border px-3 py-2 text-[10px] tracking-[0.3em] transition-all',
              hasFuel
                ? 'border-red-600/60 bg-red-950/40 text-red-400 hover:bg-red-900/40 hover:text-red-300'
                : 'cursor-not-allowed border-red-900/30 bg-transparent text-red-900/50',
            ].join(' ')}
          >
            BURN FUEL TO DODGE · {emergency.requiredDv} m/s
            {!hasFuel && ' (INSUFFICIENT)'}
          </button>
        </div>

        {/* Hint */}
        <p className="mt-3 text-[8px] leading-relaxed tracking-wide text-red-500/50">
          FAILURE TO RESPOND BEFORE DEADLINE RESULTS IN PERMANENT SATELLITE LOSS.
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Loss Beat Overlay
// ──────────────────────────────────────────────────────────────────────────────

export function LossBeat() {
  const founded = useAgencyStore((s) => s.founded)
  const lastLoss = useGameStore((s) => s.lastLoss)
  const clearLoss = useGameStore((s) => s.clearLoss)

  if (!founded || !lastLoss) return null

  const handleDismiss = () => {
    audio.uiTick()
    clearLoss()
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      {/* Somber vignette */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.75) 100%)' }}
      />

      <div
        className="pointer-events-auto relative w-80 rounded border border-zinc-700 bg-black/92 p-6 font-mono backdrop-blur-sm"
        style={{ boxShadow: '0 0 48px 8px rgba(0,0,0,0.8)' }}
      >
        {/* Elegiac header */}
        <p className="mb-2 text-[9px] tracking-[0.6em] text-zinc-500">SATELLITE LOST</p>
        <div className="mb-3 h-px w-full bg-zinc-700" />

        {/* Name */}
        <h2 className="mb-2 text-base font-bold tracking-[0.25em] text-zinc-300">
          {lastLoss.name.toUpperCase()}
        </h2>

        {/* Epitaph */}
        <p className="mb-1 text-[9px] leading-relaxed tracking-widest text-zinc-500">
          DESTROYED IN DEBRIS CONJUNCTION.
        </p>
        <p className="mb-4 text-[9px] leading-relaxed tracking-widest text-zinc-600">
          THE AGENCY ENDURES.
        </p>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="mt-1 block w-full cursor-pointer text-center text-[8px] tracking-[0.5em] text-zinc-600 transition-opacity hover:text-zinc-400"
        >
          [ ACKNOWLEDGE ]
        </button>
      </div>
    </div>
  )
}
