'use client'

import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { useGameStore, burnCost, previewElements } from '@/state/gameStore'
import { closestApproach, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import { orbitalPeriod } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'
import { fleetReachability, isTargetReachable } from '@/lib/reachability'
import { refuelPricePerDv, affordableRefuelDv } from '@/lib/economy'
import { useEffect, useState } from 'react'

export default function GuidanceHint() {
  const founded = useAgencyStore((s) => s.founded)
  const funding = useAgencyStore((s) => s.funding)
  const refuelEfficiencyLevel = useAgencyStore((s) => s.refuelEfficiencyLevel)
  const refitTokens = useAgencyStore((s) => s.milestones.refitTokens)
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
  let isWarning = false

  if (active.length === 0) {
    step = 'Accept a contract from the CONTRACTS panel →'
  } else if (!sat) {
    step = '① Select a satellite (fleet panel or click it) to plan an intercept'
  } else if (target) {
    const now = simNow()
    const planning = burnCost(burnPlan) > 0
    const elements = planning ? previewElements(sat, burnPlan, now) : sat.elements
    const closest = closestApproach(elements, { lat: target.lat, lon: target.lon }, now, 3 * orbitalPeriod(elements.a)).closestKm

    if (closest <= COMPLETION_RADIUS_KM) {
      step = '③ Locked on — IGNITE, then hold SPACE to fly the burn'
    } else {
      // Check if this specific satellite can reach the target's latitude at all.
      const thisSatCanReach = isTargetReachable(sat.elements, target.lat)

      if (!thisSatCanReach) {
        // Check if any other sat can reach it.
        const reach = target.reach ?? fleetReachability(satellites, { lat: target.lat, lon: target.lon })
        if (!reach.reachable) {
          isWarning = true
          step = 'Target beyond all coverage — STAND DOWN this contract or BUY AIMED satellite'
        } else {
          const betterSat = satellites.find((s) => s.id === reach.bestSatId)
          isWarning = true
          step = `② ${betterSat?.name ?? 'Another satellite'} is better placed — select it in the fleet panel`
        }
      } else {
        // This sat can reach the target. Check fuel sufficiency for the needed Δv.
        const reach = target.reach ?? fleetReachability(satellites, { lat: target.lat, lon: target.lon })
        const dvNeeded = reach.bestApproxDvMs ?? 0
        const pricePerDv = refuelPricePerDv(refuelEfficiencyLevel)
        const missing = Math.max(0, dvNeeded - sat.fuel)
        const affordDv = affordableRefuelDv(missing, funding, pricePerDv)
        const canClose = sat.fuel >= dvNeeded || sat.fuel + affordDv >= dvNeeded

        if (!canClose && dvNeeded > 0) {
          isWarning = true
          if (refitTokens > 0) {
            step = `Fuel too low — use EMERGENCY REFIT (${refitTokens} token) then burn`
          } else {
            step = `Fuel too low · refuel in the right panel, upgrade tank, or STAND DOWN to reassign`
          }
        } else {
          step = '② Drag NORMAL until the intercept readout turns green'
        }
      }
    }
  }
  if (!step) return null

  return (
    <div className="pointer-events-none fixed bottom-16 left-1/2 z-20 -translate-x-1/2 font-mono text-xs">
      <div className={`rounded-full border px-4 py-1 backdrop-blur ${
        isWarning
          ? 'border-amber-500/40 bg-black/60 text-amber-300'
          : 'border-[var(--accent)]/30 bg-black/60 text-[var(--accent)]'
      }`}>
        {step}
      </div>
    </div>
  )
}
