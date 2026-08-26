'use client'

import { useEffect, useState } from 'react'
import { useContractStore } from '@/state/contractStore'
import { useWorldStore } from '@/state/worldStore'
import { useAgencyStore } from '@/state/agencyStore'
import { useGameStore } from '@/state/gameStore'
import { useStoryStore } from '@/state/storyStore'
import { simNow, TIME_SCALE } from '@/lib/simTime'
import { maxActiveContracts } from '@/lib/economy'
import { CAPABILITY_LABEL } from '@/lib/satelliteMeta'
import { audio } from '@/audio/AudioEngine'
import type { Archetype } from '@/lib/archetype'
import { ARCHETYPE_COLOR } from '@/lib/archetype'
import { Chip } from '@/components/ui/Chip'
import type { Objective, ObjectiveProgress } from '@/lib/contractObjective'
import { fleetReachability } from '@/lib/reachability'
import { refuelPricePerDv, affordableRefuelDv } from '@/lib/economy'
import type { Contract } from '@/state/contractStore'
import type { Satellite } from '@/state/gameStore'

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  relief:   'RELIEF',
  research: 'RESEARCH',
  defense:  'DEFENSE',
}

function countdown(deadline: number, now: number): string {
  const s = Math.max(0, Math.round((deadline - now) / TIME_SCALE))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

function progressLabel(o: Objective, p: ObjectiveProgress): string {
  switch (o.type) {
    case 'single-pass':
      return p.done ? 'PASS ✓' : 'AWAITING PASS'
    case 'multi-pass':
      return `PASS ${p.passesDone}/${o.params.passes ?? 1}`
    case 'multi-sat':
      return `SATS ${p.satsSeen.length}/${o.params.sats ?? 1}`
    case 'dwell':
      return `DWELL ${Math.round(p.dwellAccumSec)}/${o.params.dwellSec ?? 60}s`
  }
}

// Rival accent colour (consistent with DispatchesFeed)
const RIVAL_COLOR = '#ffa14a'

/** Derive the satellite short-name label from an id (e.g. "hyp-2" → "HYPERION-2"). */
function satLabel(sats: { id: string; name: string }[], satId: string): string {
  return sats.find((s) => s.id === satId)?.name ?? satId.toUpperCase()
}

/**
 * Reach chip shown on each available/player-created contract.
 *
 * GREEN  — reachable and the best sat has enough fuel (or can afford enough
 *          refuel) to cover the remaining Δv gap right now.
 * AMBER  — reachable by at least one sat's orbital plane, but the best sat
 *          doesn't have enough fuel AND the player can't afford enough refuel
 *          to close the gap — needs refuel or upgrade before flying.
 * RED    — no satellite's plane can reach this latitude at all.
 */
function ReachChip({
  contract, sats, funding, refuelEfficiencyLevel,
}: {
  contract: Contract
  sats: Satellite[]
  funding: number
  refuelEfficiencyLevel: number
}) {
  // Prefer the pre-computed annotation; fall back to computing in-panel.
  const reach = contract.reach ?? fleetReachability(sats, { lat: contract.lat, lon: contract.lon })

  if (!reach.reachable || reach.bestSatId === null) {
    return <Chip color="#f87171">beyond coverage</Chip>
  }

  const label = satLabel(sats, reach.bestSatId)
  const dvNeeded = reach.bestApproxDvMs ?? 0
  const bestSat = sats.find((s) => s.id === reach.bestSatId)

  // "Can the best sat fly this NOW?" — it has enough fuel for the needed Δv.
  const satHasFuel = bestSat ? bestSat.fuel >= dvNeeded : false

  // "Can the player afford to refuel enough to cover the gap?" — even partial
  // refuel counts if it would bring the sat's fuel ≥ dvNeeded.
  const pricePerDv = refuelPricePerDv(refuelEfficiencyLevel)
  const missingFuel = bestSat ? Math.max(0, dvNeeded - bestSat.fuel) : dvNeeded
  const affordDv = affordableRefuelDv(missingFuel, funding, pricePerDv)
  const canAffordGap = bestSat
    ? bestSat.fuel + affordDv >= dvNeeded
    : false

  if (satHasFuel || canAffordGap || dvNeeded === 0) {
    return (
      <Chip color="#4ade80">
        {'◀ '}{label}{' · ~'}{dvNeeded}{' m/s'}
      </Chip>
    )
  }

  // Amber: reachable by plane, but can't afford enough refuel right now.
  return (
    <Chip color="#fbbf24">
      {'◀ '}{label}{' · needs refuel/upgrade'}
    </Chip>
  )
}

function rivalCountdown(acceptedAtSec: number, rivalEtaSecValue: number, now: number): string {
  // ETA is measured in sim-seconds from accept time; now is wall-clock sim time.
  const rivalArrivesAt = acceptedAtSec + rivalEtaSecValue
  const remaining = Math.max(0, Math.round((rivalArrivesAt - now) / TIME_SCALE))
  const m = Math.floor(remaining / 60)
  return m > 0 ? `${m}m ${remaining % 60}s` : `${remaining}s`
}

export default function ContractsPanel() {
  const founded = useAgencyStore((s) => s.founded)
  const reputation = useAgencyStore((s) => s.reputation)
  const funding = useAgencyStore((s) => s.funding)
  const refuelEfficiencyLevel = useAgencyStore((s) => s.refuelEfficiencyLevel)
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const accept = useContractStore((s) => s.accept)
  const setTarget = useContractStore((s) => s.setTarget)
  const standDown = useContractStore((s) => s.standDown)
  const focusEvent = useWorldStore((s) => s.focusEvent)
  const selectedId = useGameStore((s) => s.selectedId)
  const satellites = useGameStore((s) => s.satellites)
  const selectedCapability = satellites.find((s) => s.id === selectedId)?.capability ?? null
  const rival = useStoryStore((s) => s.rival)

  const [now, setNow] = useState<number | null>(null)
  // Two-step confirm for STAND DOWN so a mis-click never abandons a contract.
  const [standDownConfirmId, setStandDownConfirmId] = useState<string | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(simNow())
    const id = setInterval(() => setNow(simNow()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!founded) return null

  const available = contracts.filter((c) => c.status === 'available')
  const active = contracts.filter((c) => c.status === 'active')
  const done = contracts.filter((c) => c.status === 'completed' || c.status === 'failed').slice(-3)
  const cap = maxActiveContracts(reputation)

  return (
    <aside className="pointer-events-auto w-full font-mono text-xs text-[var(--text)]">
      <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
        <h2 className="mb-2 flex items-center justify-between text-[10px] tracking-[0.35em] text-[var(--accent)]">
          <span>CONTRACTS</span>
          <span className="opacity-60">ACTIVE {active.length}/{cap}</span>
        </h2>

        {available.length > 0 && (
          <ul className="mb-2 space-y-1">
            {available.map((c) => {
              const archColor = ARCHETYPE_COLOR[c.archetype]
              const archLabel = ARCHETYPE_LABEL[c.archetype]
              const capLabel = CAPABILITY_LABEL[c.preferredCapability]
              const isMatch = selectedCapability !== null && selectedCapability === c.preferredCapability
              return (
                <li key={c.id} className="rounded border border-white/10 p-2">
                  <p className="mb-1 truncate font-semibold">{c.title}</p>
                  {c.objective && (
                    <p className="mb-1 text-[9px] leading-relaxed opacity-50 italic line-clamp-2">{c.objective}</p>
                  )}
                  <p className="mb-1 flex items-center gap-1.5 flex-wrap">
                    <Chip color={archColor}>{archLabel}</Chip>
                    <Chip className="opacity-60">{capLabel}</Chip>
                    {isMatch && (
                      <span className="text-[9px] text-yellow-400 opacity-80">★ match</span>
                    )}
                    <ReachChip contract={c} sats={satellites} funding={funding} refuelEfficiencyLevel={refuelEfficiencyLevel} />
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="tabular-nums opacity-70" style={{ color: 'var(--accent)' }}>§{c.reward.funding} · REP {c.reward.reputation}</span>
                    <button
                      onClick={() => { if (accept(c.id)) audio.alert() }}
                      disabled={active.length >= cap}
                      className="rounded border border-[var(--accent)]/40 px-2 py-0.5 text-[10px] text-[var(--accent)] transition enabled:hover:bg-[var(--accent)]/10 disabled:opacity-30"
                    >
                      ACCEPT
                    </button>
                  </p>
                </li>
              )
            })}
          </ul>
        )}

        {active.map((c) => (
          <div
            key={c.id}
            className={`mb-1 rounded border p-2 transition ${
              c.contested
                ? targetId === c.id
                  ? 'border-[#ffa14a] bg-[#ffa14a]/10'
                  : 'border-[#ffa14a]/40'
                : targetId === c.id
                  ? 'border-[#ffb86b] bg-[#ffb86b]/10'
                  : 'border-white/15'
            }`}
          >
            <button
              onClick={() => { audio.uiTick(); setTarget(c.id); focusEvent(c.eventId) }}
              className="block w-full text-left"
            >
              <p className="mb-0.5 flex items-center justify-between">
                <span className={`truncate font-semibold ${c.contested ? 'text-[#ffa14a]' : 'text-[#ffb86b]'}`}>{c.title}</span>
                <span className="shrink-0 tabular-nums opacity-70">{now === null ? '' : `T-${countdown(c.deadline, now)}`}</span>
              </p>
              {c.gameObjective ? (
                <p className="mb-0.5 flex items-center gap-1.5 flex-wrap">
                  <Chip color="#a78bfa">{c.gameObjective.label}</Chip>
                  {c.progress && (
                    <Chip className="opacity-80">{progressLabel(c.gameObjective, c.progress)}</Chip>
                  )}
                  {c.contested && now !== null && (
                    <Chip color={RIVAL_COLOR}>
                      ⚔ RIVAL {rivalCountdown(c.contested.acceptedAtSec, c.contested.rivalEtaSec, now)}
                    </Chip>
                  )}
                </p>
              ) : (
                <p className="opacity-60 flex items-center gap-1.5 flex-wrap">
                  <span>Maneuver a satellite over the target · TRACK to view</span>
                  {c.contested && now !== null && (
                    <Chip color={RIVAL_COLOR}>
                      ⚔ RIVAL {rivalCountdown(c.contested.acceptedAtSec, c.contested.rivalEtaSec, now)}
                    </Chip>
                  )}
                </p>
              )}
            </button>
            <div className="mt-1.5 flex justify-end gap-1.5">
              {standDownConfirmId === c.id ? (
                <>
                  <button
                    onClick={() => { audio.uiTick(); standDown(c.id); setStandDownConfirmId(null) }}
                    className="rounded border border-red-500/70 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300 transition hover:bg-red-500/25"
                  >
                    CONFIRM STAND DOWN
                  </button>
                  <button
                    onClick={() => setStandDownConfirmId(null)}
                    className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/50 transition hover:border-white/40 hover:text-white/80"
                  >
                    CANCEL
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { audio.uiTick(); setStandDownConfirmId(c.id) }}
                  className="rounded border border-red-500/30 px-2 py-0.5 text-[10px] text-red-400/70 transition hover:border-red-500/60 hover:text-red-400"
                >
                  STAND DOWN
                </button>
              )}
            </div>
          </div>
        ))}

        {available.length === 0 && active.length === 0 && (
          <p className="py-3 text-center opacity-50">Awaiting the next briefing…</p>
        )}

        {done.length > 0 && (
          <ul className="mt-2 border-t border-white/10 pt-2 space-y-0.5">
            {done.map((c) => (
              <li key={c.id} className="flex items-center justify-between opacity-50">
                <span className="truncate">{c.title}</span>
                <span className={c.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}>
                  {c.status === 'completed' ? '✓' : '✕'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
