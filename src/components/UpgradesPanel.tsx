'use client'

import { useState } from 'react'
import { useGameStore } from '@/state/gameStore'
import { useAgencyStore } from '@/state/agencyStore'
import { tankUpgradeCost, tankUpgradeDv, refuelEfficiencyCost, refuelEfficiencyFactor, RETROFIT_COST } from '@/lib/upgrades'
import { CAPABILITY_LABEL, CAPABILITY_COLOR, type Capability } from '@/lib/satelliteMeta'
import { Chip } from '@/components/ui/Chip'
import { audio } from '@/audio/AudioEngine'

const CAPABILITIES: Capability[] = ['imaging', 'comms', 'thermal']

export default function UpgradesPanel() {
  const [open, setOpen] = useState(false)

  const selectedId = useGameStore((s) => s.selectedId)
  const satellites = useGameStore((s) => s.satellites)
  const upgradeTank = useGameStore((s) => s.upgradeTank)
  const retrofitCapability = useGameStore((s) => s.retrofitCapability)

  const funding = useAgencyStore((s) => s.funding)
  const refuelEfficiencyLevel = useAgencyStore((s) => s.refuelEfficiencyLevel)
  const upgradeRefuelEfficiency = useAgencyStore((s) => s.upgradeRefuelEfficiency)

  const sat = satellites.find((s) => s.id === selectedId) ?? null

  if (!selectedId) return null

  const tankCost = sat ? tankUpgradeCost(sat.tankLevel) : 0
  const tankDv = sat ? tankUpgradeDv(sat.tankLevel) : 0
  const canAffordTank = sat ? funding >= tankCost : false

  const effCost = refuelEfficiencyCost(refuelEfficiencyLevel)
  const effFactor = refuelEfficiencyFactor(refuelEfficiencyLevel)
  const effDiscount = Math.round((1 - effFactor) * 100)
  const nextFactor = refuelEfficiencyFactor(refuelEfficiencyLevel + 1)
  const nextDiscount = Math.round((1 - nextFactor) * 100)
  const canAffordEff = funding >= effCost

  return (
    <>
      {/* Toggle button — sits below the record button on the selected satellite row */}
      <button
        onClick={() => { audio.uiTick(); setOpen((o) => !o) }}
        className="mt-1 flex w-full items-center justify-center gap-1 rounded border border-white/10 px-2 py-0.5 text-[10px] opacity-60 hover:border-[var(--accent)]/50 hover:opacity-100 transition"
      >
        <span>⟁</span>
        <span>refit</span>
      </button>

      {open && (
        <div className="mt-1 rounded border border-white/10 bg-black/60 p-2.5 backdrop-blur space-y-3">
          <h3 className="text-[9px] tracking-[0.4em] text-[var(--accent)]">FLEET REFIT</h3>

          {/* ── Tank upgrade ─────────────────────────────────────────── */}
          {sat && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] opacity-70">
                <span>TANK</span>
                <Chip color="var(--accent)">Lv{sat.tankLevel}</Chip>
              </div>
              <button
                onClick={() => { if (upgradeTank(sat.id)) { audio.uiTick() } }}
                disabled={!canAffordTank}
                title={!canAffordTank ? `§${tankCost - funding} short` : undefined}
                className="w-full rounded border border-white/15 px-2 py-1 text-[10px] text-left transition enabled:hover:border-[var(--accent)]/50 disabled:opacity-30"
              >
                {canAffordTank
                  ? `TANK UPGRADE +${tankDv} Δv · §${tankCost}`
                  : `TANK UPGRADE +${tankDv} Δv · §${tankCost} short §${tankCost - funding}`}
              </button>
            </div>
          )}

          {/* ── Capability retrofit ───────────────────────────────────── */}
          {sat && (
            <div className="space-y-1">
              <div className="text-[10px] opacity-70">RETROFIT · §{RETROFIT_COST}</div>
              <div className="flex gap-1.5 flex-wrap">
                {CAPABILITIES.map((cap) => {
                  const label = CAPABILITY_LABEL[cap]
                  const color = CAPABILITY_COLOR[label]
                  const isCurrent = sat.capability === cap
                  const canAfford = funding >= RETROFIT_COST
                  const disabled = isCurrent || !canAfford
                  return (
                    <button
                      key={cap}
                      onClick={() => { if (retrofitCapability(sat.id, cap)) { audio.uiTick() } }}
                      disabled={disabled}
                      title={
                        isCurrent
                          ? 'Already active'
                          : !canAfford
                          ? `§${RETROFIT_COST - funding} short`
                          : `Retrofit to ${label}`
                      }
                      className="rounded border px-2 py-0.5 text-[9px] font-bold tracking-widest transition disabled:opacity-30 enabled:hover:bg-white/5"
                      style={
                        isCurrent
                          ? { color, borderColor: `${color}80`, background: `${color}20` }
                          : { color, borderColor: `${color}30` }
                      }
                    >
                      {label}
                      {isCurrent && ' ✓'}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Agency refuel efficiency ──────────────────────────────── */}
          <div className="space-y-1 border-t border-white/10 pt-2">
            <div className="flex items-center gap-1 text-[10px] opacity-70">
              <span>REFUEL EFFICIENCY</span>
              <Chip color="#a78bfa">Lv{refuelEfficiencyLevel}</Chip>
              <span className="opacity-60 text-[9px]">−{effDiscount}%</span>
            </div>
            <button
              onClick={() => { if (upgradeRefuelEfficiency()) { audio.uiTick() } }}
              disabled={!canAffordEff}
              title={!canAffordEff ? `§${effCost - funding} short` : undefined}
              className="w-full rounded border border-white/15 px-2 py-1 text-[10px] text-left transition enabled:hover:border-[#a78bfa]/50 disabled:opacity-30"
            >
              {canAffordEff
                ? `Lv${refuelEfficiencyLevel} → Lv${refuelEfficiencyLevel + 1} · −${nextDiscount}% · §${effCost}`
                : `Lv${refuelEfficiencyLevel + 1} · §${effCost} short §${effCost - funding}`}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
