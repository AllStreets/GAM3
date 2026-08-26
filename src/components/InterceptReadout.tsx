'use client'

import { useEffect, useState } from 'react'
import { useContractStore } from '@/state/contractStore'
import { useGameStore, previewElements, burnCost } from '@/state/gameStore'
import { useAgencyStore } from '@/state/agencyStore'
import { closestApproach, COMPLETION_RADIUS_KM, firstPassEta, normalHint } from '@/lib/intercept'
import { orbitalPeriod } from '@/lib/orbits'
import { simNow, TIME_SCALE } from '@/lib/simTime'
import { refuelPricePerDv, affordableRefuelDv } from '@/lib/economy'
import { fleetReachability } from '@/lib/reachability'

export default function InterceptReadout() {
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const selectedId = useGameStore((s) => s.selectedId)
  const satellites = useGameStore((s) => s.satellites)
  const burnPlan = useGameStore((s) => s.burnPlan)
  const funding = useAgencyStore((s) => s.funding)
  const refuelEfficiencyLevel = useAgencyStore((s) => s.refuelEfficiencyLevel)
  const refitTokens = useAgencyStore((s) => s.milestones.refitTokens)

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
  const planCost = burnCost(burnPlan)
  const planning = planCost > 0
  const elements = planning ? previewElements(sat, burnPlan, now) : sat.elements
  const period = orbitalPeriod(elements.a)
  const windowSec = 3 * period
  const { closestKm, etaSec } = closestApproach(elements, { lat: target.lat, lon: target.lon }, now, windowSec)
  const ok = closestKm <= COMPLETION_RADIUS_KM
  const hint = ok ? 0 : normalHint(elements, { lat: target.lat, lon: target.lon }, now, windowSec)
  const passEtaSec = ok
    ? (firstPassEta(elements, { lat: target.lat, lon: target.lon }, now, windowSec, COMPLETION_RADIUS_KM) ?? etaSec)
    : etaSec
  const etaWall = passEtaSec / TIME_SCALE
  const etaMin = Math.floor(etaWall / 60)
  const etaS = Math.round(etaWall % 60)

  // ── Burn-plan fuel shortfall ──────────────────────────────────────────────
  // IGNITE is disabled when cost * 1.25 > sat.fuel. Surface the reason.
  const burnUnaffordable = planning && planCost * 1.25 > sat.fuel
  const pricePerDv = refuelPricePerDv(refuelEfficiencyLevel)
  const shortfallDv = burnUnaffordable ? Math.ceil(planCost * 1.25 - sat.fuel) : 0
  const shortfallCost = burnUnaffordable ? Math.ceil(shortfallDv * pricePerDv) : 0
  const canAffordRefuel = burnUnaffordable && affordableRefuelDv(shortfallDv, funding, pricePerDv) >= shortfallDv

  // ── Target reachability check ─────────────────────────────────────────────
  // When the tracked contract is beyond this bird's orbital plane, suggest alternatives.
  const reach = target.reach ?? fleetReachability(satellites, { lat: target.lat, lon: target.lon })
  const targetBeyondThisBird = reach.reachable && reach.bestSatId !== null && reach.bestSatId !== sat.id
  const targetBeyondAll = !reach.reachable

  // ── Subtext for recovery path ─────────────────────────────────────────────
  let recoveryHint: string | null = null
  if (burnUnaffordable) {
    if (canAffordRefuel) {
      recoveryHint = `needs +${shortfallDv} Δv · refuel §${shortfallCost}`
    } else if (refitTokens > 0) {
      recoveryHint = `fuel low · use EMERGENCY REFIT (${refitTokens} token${refitTokens > 1 ? 's' : ''})`
    } else {
      recoveryHint = `needs +${shortfallDv} Δv · refuel §${shortfallCost} or upgrade tank`
    }
  } else if (targetBeyondAll) {
    recoveryHint = `beyond all birds' reach — STAND DOWN or BUY AIMED satellite`
  } else if (targetBeyondThisBird) {
    const betterSat = satellites.find((s) => s.id === reach.bestSatId)
    recoveryHint = `this bird can't reach it — retask ${betterSat?.name ?? 'another satellite'}`
  }

  const borderColor = burnUnaffordable || targetBeyondAll
    ? 'border-amber-500/50 bg-amber-500/8 text-amber-300'
    : ok
    ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300'
    : 'border-white/15 bg-black/60 text-[var(--text)]'

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-20 -translate-x-1/2 font-mono text-xs">
      <div className={`rounded-full border px-4 py-1.5 backdrop-blur ${borderColor}`}>
        <span className="opacity-70">{sat.name} → {target.title.slice(0, 28)} · </span>
        <span className="tabular-nums font-semibold">
          closest {Math.round(closestKm)} km{' '}
          {ok
            ? `✓ · ${planning ? 'ghost ' : ''}pass in ${etaMin}m ${etaS}s`
            : `(need ≤${COMPLETION_RADIUS_KM}) · ${hint === 0 ? 'try a NORMAL burn' : `nudge NORMAL ${hint < 0 ? '◀' : '▶'}`}`}
        </span>
        {recoveryHint && (
          <span className="ml-2 opacity-80">· {recoveryHint}</span>
        )}
      </div>
    </div>
  )
}
