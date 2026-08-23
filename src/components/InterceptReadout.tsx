'use client'

import { useEffect, useState } from 'react'
import { useContractStore } from '@/state/contractStore'
import { useGameStore, previewElements, burnCost } from '@/state/gameStore'
import { closestApproach, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import { orbitalPeriod } from '@/lib/orbits'
import { simNow, TIME_SCALE } from '@/lib/simTime'

export default function InterceptReadout() {
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const selectedId = useGameStore((s) => s.selectedId)
  const satellites = useGameStore((s) => s.satellites)
  const burnPlan = useGameStore((s) => s.burnPlan)

  // Recompute a few times a second (orbit advances; ghost changes with sliders).
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 400)
    return () => clearInterval(id)
  }, [])

  const target =
    contracts.find((c) => c.id === targetId && c.status === 'active') ??
    contracts.find((c) => c.status === 'active')
  const sat = satellites.find((s) => s.id === selectedId)
  if (!target || !sat) return null

  const now = simNow()
  const planning = burnCost(burnPlan) > 0
  const elements = planning ? previewElements(sat, burnPlan, now) : sat.elements
  const period = orbitalPeriod(elements.a)
  const { closestKm, etaSec } = closestApproach(elements, { lat: target.lat, lon: target.lon }, now, 3 * period)
  const ok = closestKm <= COMPLETION_RADIUS_KM
  const etaWall = etaSec / TIME_SCALE
  const etaMin = Math.floor(etaWall / 60)

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-20 -translate-x-1/2 font-mono text-xs">
      <div className={`rounded-full border px-4 py-1.5 backdrop-blur ${ok ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300' : 'border-white/15 bg-black/60 text-[var(--text)]'}`}>
        <span className="opacity-70">{sat.name} → {target.title.slice(0, 28)} · </span>
        <span className="tabular-nums font-semibold">
          closest {Math.round(closestKm)} km {ok ? '✓' : `(need ≤${COMPLETION_RADIUS_KM})`} · {planning ? 'ghost ' : ''}pass in {etaMin}m {Math.round(etaWall % 60)}s
        </span>
      </div>
    </div>
  )
}
