'use client'

import { useEffect, useState } from 'react'
import { useGameStore, burnCost, type Satellite } from '@/state/gameStore'
import { propagate, ER_KM, orbitalPeriod } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'
import { audio } from '@/audio/AudioEngine'
import { SATELLITE_PRICE, refuelPrice, refuelPricePerDv, affordableRefuelDv } from '@/lib/economy'
import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { closestApproach, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import { CAPABILITY_LABEL, CAPABILITY_COLOR } from '@/lib/satelliteMeta'
import { Chip } from '@/components/ui/Chip'
import SatelliteRecordCard from '@/components/SatelliteRecordCard'
import UpgradesPanel from '@/components/UpgradesPanel'

function telemetry(sat: Satellite) {
  const { position, velocity } = propagate(sat.elements, simNow())
  return {
    altKm: (position.length() - 1) * ER_KM,
    speedKms: velocity.length() * ER_KM,
  }
}

function DvField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="w-20 opacity-70">{label}</span>
      <input
        type="range" min={-800} max={800} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      <span className="w-14 text-right tabular-nums">{value} m/s</span>
    </label>
  )
}

export default function FleetPanel() {
  const satellites = useGameStore((s) => s.satellites)
  const selectedId = useGameStore((s) => s.selectedId)
  const burnPlan = useGameStore((s) => s.burnPlan)
  const select = useGameStore((s) => s.select)
  const setBurnPlan = useGameStore((s) => s.setBurnPlan)
  const resetBurnPlan = useGameStore((s) => s.resetBurnPlan)
  const beginBurn = useGameStore((s) => s.beginBurn)
  const refuelSatellite = useGameStore((s) => s.refuelSatellite)
  const emergencyRefit = useGameStore((s) => s.emergencyRefit)
  const buySatellite = useGameStore((s) => s.buySatellite)
  const funding = useAgencyStore((s) => s.funding)
  const refitTokens = useAgencyStore((s) => s.milestones.refitTokens)
  const refuelEfficiencyLevel = useAgencyStore((s) => s.refuelEfficiencyLevel)
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const target =
    contracts.find((c) => c.id === targetId && c.status === 'active') ??
    contracts.find((c) => c.status === 'active') ?? null

  // Service-record card state.
  const [recordOpen, setRecordOpen] = useState(false)

  // Re-render telemetry at 4 Hz; mounted gates hydration-sensitive output
  const [mounted, setMounted] = useState(false)
  const [, force] = useState(0)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])

  const selected = satellites.find((s) => s.id === selectedId) ?? null
  const cost = burnCost(burnPlan)
  const canExecute = !!selected && cost > 0 && cost * 1.25 <= (selected?.fuel ?? 0)

  return (
    <>
      {recordOpen && selectedId && (
        <SatelliteRecordCard onClose={() => setRecordOpen(false)} />
      )}
      <aside className="pointer-events-auto w-full space-y-3 font-mono text-xs text-[var(--text)]">
        <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
          <h2 className="mb-2 text-[10px] tracking-[0.35em] text-[var(--accent)]">FLEET</h2>
          <ul className="space-y-2">
            {(() => {
              const approaches = new Map<string, number>()
              if (mounted && target) {
                const now = simNow()
                for (const sat of satellites) {
                  approaches.set(
                    sat.id,
                    closestApproach(sat.elements, { lat: target.lat, lon: target.lon }, now, 3 * orbitalPeriod(sat.elements.a)).closestKm,
                  )
                }
              }
              const bestId =
                approaches.size > 0
                  ? [...approaches.entries()].sort((a, b) => a[1] - b[1])[0][0]
                  : null
              return satellites.map((sat) => {
                const t = telemetry(sat)
                const isSel = sat.id === selectedId
                const capLabel = CAPABILITY_LABEL[sat.capability]
                const capColor = CAPABILITY_COLOR[capLabel]
                return (
                  <li key={sat.id}>
                    <button
                      onClick={() => { audio.chirp(); select(isSel ? null : sat.id) }}
                      className={`w-full rounded border px-2 py-1.5 text-left transition ${
                        isSel ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="font-semibold">{sat.name}</span>
                        <span className="tabular-nums opacity-70">{mounted ? `${t.altKm.toFixed(0)} km` : '— km'}</span>
                      </span>
                      {/* Capability chip + completed badge row */}
                      <span className="mt-1 flex items-center gap-1.5">
                        <Chip color={capColor}>{capLabel}</Chip>
                        {sat.record.contractsCompleted > 0 && (
                          <Chip color="var(--accent)">✓ {sat.record.contractsCompleted}</Chip>
                        )}
                      </span>
                      <span className="mt-1 flex items-center justify-between tabular-nums opacity-70">
                        <span>{mounted ? `${t.speedKms.toFixed(2)} km/s` : '— km/s'}</span>
                        <span>Δv {sat.fuel.toFixed(0)}/{sat.fuelCapacity} m/s</span>
                      </span>
                      <span className="mt-1 block h-1 w-full rounded bg-white/10">
                        <span
                          className="block h-1 rounded bg-[var(--accent)]"
                          style={{ width: `${(sat.fuel / sat.fuelCapacity) * 100}%` }}
                        />
                      </span>
                      {target && approaches.has(sat.id) && (
                        <span className="mt-0.5 flex items-center justify-between text-[10px]">
                          <span className={approaches.get(sat.id)! <= COMPLETION_RADIUS_KM ? 'text-emerald-400' : 'text-amber-400/80'}>
                            ◎ {Math.round(approaches.get(sat.id)!)} km to target
                          </span>
                          {sat.id === bestId && <span className="text-[var(--accent)]">◀ best</span>}
                        </span>
                      )}
                    </button>
                    {/* Record affordance — visible only on the selected row */}
                    {isSel && (
                      <button
                        onClick={() => { audio.uiTick(); setRecordOpen(true) }}
                        className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-white/10 px-2 py-0.5 text-[10px] opacity-60 hover:border-[var(--accent)]/50 hover:opacity-100 transition"
                      >
                        <span>▤</span>
                        <span>record</span>
                      </button>
                    )}
                    {/* Upgrades panel — refit toggle below record on selected row */}
                    {isSel && <UpgradesPanel />}
                  </li>
                )
              })
            })()}
          </ul>
        </section>

        {selected && (
          <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
            <h2 className="mb-2 text-[10px] tracking-[0.35em] text-[#ffb86b]">BURN PLAN — {selected.name}</h2>
            <div className="space-y-2">
              <DvField label="PROGRADE" value={burnPlan.prograde} onChange={(v) => setBurnPlan({ prograde: v })} />
              <DvField label="NORMAL" value={burnPlan.normal} onChange={(v) => setBurnPlan({ normal: v })} />
              <DvField label="RADIAL" value={burnPlan.radial} onChange={(v) => setBurnPlan({ radial: v })} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="tabular-nums opacity-80">cost {cost.toFixed(1)} m/s</span>
              <span className="flex gap-2">
                <button
                  onClick={() => { audio.uiTick(); resetBurnPlan() }}
                  className="rounded border border-white/15 px-2 py-1 hover:border-white/40"
                >
                  RESET
                </button>
                <button
                  onClick={() => { if (beginBurn()) audio.alert() }}
                  disabled={!canExecute}
                  className="rounded border border-[#ffb86b] px-2 py-1 text-[#ffb86b] transition enabled:hover:bg-[#ffb86b]/15 disabled:opacity-30"
                >
                  IGNITE
                </button>
              </span>
            </div>
          </section>
        )}

        <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
          {selected && (() => {
            const missing = selected.fuelCapacity - selected.fuel
            const pricePerDv = refuelPricePerDv(refuelEfficiencyLevel)
            const affordDv = affordableRefuelDv(missing, funding, pricePerDv)
            const affordCost = Math.ceil(affordDv * pricePerDv)
            const fullCost = refuelPrice(missing)
            const canAffordFull = funding >= fullCost && missing > 0
            const canAffordAny = affordDv > 0
            const isFull = missing <= 0

            if (isFull) {
              return (
                <button disabled className="rounded border border-white/15 px-2 py-1 text-[11px] disabled:opacity-30">
                  REFUEL — full
                </button>
              )
            }

            if (!canAffordAny) {
              const shortfall = Math.ceil(1 * pricePerDv) // cost of 1 Δv
              return (
                <button disabled className="rounded border border-white/15 px-2 py-1 text-[11px] disabled:opacity-30">
                  REFUEL — §{shortfall} short
                </button>
              )
            }

            return (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (refuelSatellite(selected.id)) audio.uiTick() }}
                  className="rounded border border-white/15 px-2 py-1 text-[11px] transition hover:border-white/40"
                >
                  REFUEL +{affordDv} Δv · §{affordCost}
                </button>
                {canAffordFull && affordDv < missing && (
                  <button
                    onClick={() => { if (refuelSatellite(selected.id, missing)) audio.uiTick() }}
                    className="rounded border border-white/15 px-2 py-1 text-[11px] opacity-70 transition hover:border-white/40 hover:opacity-100"
                  >
                    FULL · §{fullCost}
                  </button>
                )}
              </div>
            )
          })()}
          {selected && (() => {
            const isFull = selected.fuelCapacity - selected.fuel <= 0
            const hasTokens = refitTokens > 0
            const disabled = isFull || !hasTokens
            const reason = isFull ? 'tank full' : !hasTokens ? 'no tokens' : ''
            return (
              <button
                onClick={() => { if (!disabled && emergencyRefit(selected.id)) audio.alert() }}
                disabled={disabled}
                title={disabled ? `EMERGENCY REFIT — ${reason}` : `Spend 1 refit token to fully refuel ${selected.name} for free`}
                className="rounded border border-[#f97316]/40 px-2 py-1 text-[11px] text-[#f97316] transition enabled:hover:bg-[#f97316]/10 disabled:opacity-30"
              >
                {disabled && reason
                  ? `EMERGENCY REFIT — ${reason}`
                  : `EMERGENCY REFIT (${refitTokens})`}
              </button>
            )
          })()}
          <button
            onClick={() => { if (buySatellite()) audio.chirp() }}
            disabled={funding < SATELLITE_PRICE}
            className="self-end rounded border border-[var(--accent)]/40 px-2 py-1 text-[11px] text-[var(--accent)] transition enabled:hover:bg-[var(--accent)]/10 disabled:opacity-30"
          >
            BUY SATELLITE §{SATELLITE_PRICE}
          </button>
        </div>
      </aside>
    </>
  )
}
