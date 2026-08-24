'use client'

import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { useGameStore, burnCost, previewElements } from '@/state/gameStore'
import { closestApproach, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import { orbitalPeriod } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'
import { useEffect, useState } from 'react'

export default function GuidanceHint() {
  const founded = useAgencyStore((s) => s.founded)
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const selectedId = useGameStore((s) => s.selectedId)
  const satellites = useGameStore((s) => s.satellites)
  const burnPlan = useGameStore((s) => s.burnPlan)
  const burnSession = useGameStore((s) => s.burnSession)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  if (!founded || burnSession) return null

  const active = contracts.filter((c) => c.status === 'active')
  const target = contracts.find((c) => c.id === targetId && c.status === 'active') ?? active[0] ?? null
  const sat = satellites.find((s) => s.id === selectedId) ?? null

  let step: string | null = null
  if (active.length === 0) step = 'Accept a contract from the CONTRACTS panel →'
  else if (!sat) step = '① Select a satellite (fleet panel or click it) to plan an intercept'
  else if (target) {
    const now = simNow()
    const planning = burnCost(burnPlan) > 0
    const elements = planning ? previewElements(sat, burnPlan, now) : sat.elements
    const closest = closestApproach(elements, { lat: target.lat, lon: target.lon }, now, 3 * orbitalPeriod(elements.a)).closestKm
    step = closest <= COMPLETION_RADIUS_KM
      ? '③ Locked on — IGNITE, then hold SPACE to fly the burn'
      : '② Drag NORMAL until the intercept readout turns green'
  }
  if (!step) return null

  return (
    <div className="pointer-events-none fixed bottom-16 left-1/2 z-20 -translate-x-1/2 font-mono text-xs">
      <div className="rounded-full border border-[var(--accent)]/30 bg-black/60 px-4 py-1 text-[var(--accent)] backdrop-blur">
        {step}
      </div>
    </div>
  )
}
