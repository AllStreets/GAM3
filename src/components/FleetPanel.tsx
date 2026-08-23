'use client'

import { useEffect, useState } from 'react'
import { useGameStore, burnCost, type Satellite } from '@/state/gameStore'
import { propagate, ER_KM } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'

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
        type="range" min={-120} max={120} step={1} value={value}
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
  const executeBurn = useGameStore((s) => s.executeBurn)

  // Re-render telemetry at 4 Hz; mounted gates hydration-sensitive output
  const [mounted, setMounted] = useState(false)
  const [, force] = useState(0)
  useEffect(() => {
    setMounted(true)
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])

  const selected = satellites.find((s) => s.id === selectedId) ?? null
  const cost = burnCost(burnPlan)
  const canExecute = !!selected && cost > 0 && cost <= (selected?.fuel ?? 0)

  return (
    <aside className="pointer-events-auto fixed right-6 top-16 z-20 w-72 space-y-3 font-mono text-xs text-[var(--text)]">
      <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
        <h2 className="mb-2 text-[10px] tracking-[0.35em] text-[var(--accent)]">FLEET</h2>
        <ul className="space-y-2">
          {satellites.map((sat) => {
            const t = telemetry(sat)
            const isSel = sat.id === selectedId
            return (
              <li key={sat.id}>
                <button
                  onClick={() => select(isSel ? null : sat.id)}
                  className={`w-full rounded border px-2 py-1.5 text-left transition ${
                    isSel ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-semibold">{sat.name}</span>
                    <span className="tabular-nums opacity-70">{mounted ? `${t.altKm.toFixed(0)} km` : '— km'}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between tabular-nums opacity-70">
                    <span>{mounted ? `${t.speedKms.toFixed(2)} km/s` : '— km/s'}</span>
                    <span>Δv {sat.fuel.toFixed(0)}/{sat.fuelCapacity} m/s</span>
                  </span>
                  <span className="mt-1 block h-1 w-full rounded bg-white/10">
                    <span
                      className="block h-1 rounded bg-[var(--accent)]"
                      style={{ width: `${(sat.fuel / sat.fuelCapacity) * 100}%` }}
                    />
                  </span>
                </button>
              </li>
            )
          })}
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
                onClick={resetBurnPlan}
                className="rounded border border-white/15 px-2 py-1 hover:border-white/40"
              >
                RESET
              </button>
              <button
                onClick={() => executeBurn(simNow())}
                disabled={!canExecute}
                className="rounded border border-[#ffb86b] px-2 py-1 text-[#ffb86b] transition enabled:hover:bg-[#ffb86b]/15 disabled:opacity-30"
              >
                EXECUTE
              </button>
            </span>
          </div>
        </section>
      )}
    </aside>
  )
}
