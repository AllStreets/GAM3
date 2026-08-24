'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/state/gameStore'
import type { ManeuverScore } from '@/lib/maneuverScore'

const GRADE_COLORS: Record<ManeuverScore['grade'], string> = {
  S: '#bd93f9',
  A: '#50fa7b',
  B: '#ffb86b',
  C: '#ff5555',
}

/** Shows GRADE + efficiency/precision bars for 2.5s after a burn completes. */
export function BurnGradeReadout() {
  const lastManeuver = useGameStore((s) => s.lastManeuver)
  const lastTrickShot = useGameStore((s) => s.lastTrickShot)
  const [visible, setVisible] = useState<ManeuverScore | null>(null)
  const [trickShot, setTrickShot] = useState<{ count: number } | null>(null)

  useEffect(() => {
    if (!lastManeuver) return
    setVisible(lastManeuver)
    setTrickShot(lastTrickShot)
    const id = setTimeout(() => { setVisible(null); setTrickShot(null) }, 2500)
    return () => clearTimeout(id)
  }, [lastManeuver, lastTrickShot])

  if (!visible) return null

  const color = GRADE_COLORS[visible.grade]

  return (
    <div className="pointer-events-none fixed inset-0 z-31 flex flex-col items-center justify-end pb-36 font-mono text-xs text-[var(--text)]">
      <div className="w-[280px] space-y-2 rounded border border-white/20 bg-black/80 p-3 backdrop-blur">
        <p className="flex items-center justify-between tracking-[0.3em] text-[11px]">
          <span className="opacity-60">BURN GRADE</span>
          <span className="text-base font-bold" style={{ color }}>{visible.grade}</span>
        </p>
        {/* Efficiency bar */}
        <div>
          <p className="mb-1 flex justify-between opacity-50 text-[9px] tracking-widest">
            <span>EFFICIENCY</span><span>{Math.round(visible.efficiency * 100)}%</span>
          </p>
          <div className="h-1.5 w-full rounded bg-white/10">
            <span className="block h-1.5 rounded bg-[#50fa7b] transition-all" style={{ width: `${visible.efficiency * 100}%` }} />
          </div>
        </div>
        {/* Precision bar */}
        <div>
          <p className="mb-1 flex justify-between opacity-50 text-[9px] tracking-widest">
            <span>PRECISION</span><span>{Math.round(visible.precision * 100)}%</span>
          </p>
          <div className="h-1.5 w-full rounded bg-white/10">
            <span className="block h-1.5 rounded bg-[#bd93f9] transition-all" style={{ width: `${visible.precision * 100}%` }} />
          </div>
        </div>
        {trickShot && (
          <p className="text-center text-[9px] tracking-[0.25em] opacity-80" style={{ color: '#ffb86b' }}>
            TRICK-SHOT ×{trickShot.count}
          </p>
        )}
      </div>
    </div>
  )
}

export default function BurnOverlay() {
  const burnSession = useGameStore((s) => s.burnSession)
  const [live, setLive] = useState({ needle: 0, progress: 0, quality: 1 })

  useEffect(() => {
    if (!burnSession) return
    const id = setInterval(() => setLive({ ...useGameStore.getState().burnLive }), 33)
    return () => clearInterval(id)
  }, [burnSession])

  if (!burnSession) return null

  const sat = useGameStore.getState().satellites.find((s) => s.id === burnSession.satId)

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-end pb-16 font-mono text-xs text-[var(--text)]">
      <div className="w-[420px] space-y-3 rounded border border-[#ffb86b]/40 bg-black/70 p-4 backdrop-blur">
        <p className="flex justify-between text-[10px] tracking-[0.35em] text-[#ffb86b]">
          <span>BURN IN PROGRESS — {sat?.name}</span>
          <span>{burnSession.cost.toFixed(0)} m/s</span>
        </p>

        {/* Thrust needle */}
        <div>
          <p className="mb-1 flex justify-between opacity-60"><span>TRIM</span><span>A / D</span></p>
          <div className="relative h-3 w-full rounded bg-white/10">
            <span className="absolute left-1/2 top-0 h-3 w-px bg-white/40" />
            <span
              className="absolute top-0 h-3 w-1.5 rounded bg-[#ffb86b] transition-transform duration-75"
              style={{ left: '50%', transform: `translateX(${live.needle * 190}px)` }}
            />
          </div>
        </div>

        {/* Progress */}
        <div>
          <p className="mb-1 flex justify-between opacity-60"><span>Δv DELIVERED</span><span>{Math.round(live.progress * 100)}%</span></p>
          <div className="h-2 w-full rounded bg-white/10">
            <span className="block h-2 rounded bg-[var(--accent)]" style={{ width: `${live.progress * 100}%` }} />
          </div>
        </div>

        <p className="flex items-center justify-between">
          <span className="opacity-70">QUALITY <span className="tabular-nums text-[var(--accent)]">{Math.round(live.quality * 100)}%</span></span>
          <span className="opacity-60">HOLD SPACE TO BURN · ESC TO ABORT</span>
        </p>
      </div>
    </div>
  )
}
