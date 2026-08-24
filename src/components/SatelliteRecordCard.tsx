'use client'

import { useEffect, useCallback } from 'react'
import { useGameStore } from '@/state/gameStore'
import { CAPABILITY_LABEL, CAPABILITY_COLOR, simDaysInOrbit } from '@/lib/satelliteMeta'
import { simNow } from '@/lib/simTime'
import { Chip } from '@/components/ui/Chip'

interface SatelliteRecordCardProps {
  onClose: () => void
}

export default function SatelliteRecordCard({ onClose }: SatelliteRecordCardProps) {
  const selectedId = useGameStore((s) => s.selectedId)
  const satellites = useGameStore((s) => s.satellites)
  const sat = satellites.find((s) => s.id === selectedId) ?? null

  // Close on ESC.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )
  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!sat) return null

  const capLabel = CAPABILITY_LABEL[sat.capability]
  const capColor = CAPABILITY_COLOR[capLabel] ?? 'var(--accent)'
  const daysInOrbit = simDaysInOrbit(sat.record.commissionedAt, simNow())
  const dvPct = sat.fuelCapacity > 0 ? (sat.fuel / sat.fuelCapacity) * 100 : 0
  const recentPasses = sat.record.notablePasses.slice(0, 4)

  return (
    /* backdrop click-away */
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      onClick={onClose}
    >
      {/* card — stop propagation so clicking inside doesn't close */}
      <div
        className="pointer-events-auto relative w-72 rounded border border-[var(--accent)]/50 bg-black/85 p-4 font-mono text-xs text-[var(--text)] backdrop-blur-sm"
        style={{ boxShadow: '0 0 20px 2px color-mix(in srgb, var(--accent) 20%, transparent)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="mb-1 text-[10px] tracking-[0.35em] text-[var(--accent)] opacity-70">
              SERVICE RECORD
            </p>
            <h2 className="text-sm font-bold tracking-widest text-[var(--text)]">
              {sat.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="ml-2 mt-0.5 shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[9px] tracking-widest opacity-50 hover:opacity-80 transition-opacity"
          >
            ✕
          </button>
        </div>

        {/* Capability chip */}
        <div className="mb-3">
          <Chip color={capColor}>{capLabel}</Chip>
        </div>

        {/* Stats grid */}
        <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
          <div>
            <dt className="text-[9px] tracking-[0.25em] opacity-50">Δv BUDGET</dt>
            <dd className="tabular-nums">
              {sat.fuel.toFixed(0)}<span className="opacity-50">/{sat.fuelCapacity} m/s</span>
            </dd>
            <div className="mt-1 h-0.5 w-full rounded bg-white/10">
              <div
                className="h-0.5 rounded"
                style={{
                  width: `${dvPct}%`,
                  background: dvPct < 25 ? '#f87171' : 'var(--accent)',
                }}
              />
            </div>
          </div>

          <div>
            <dt className="text-[9px] tracking-[0.25em] opacity-50">CONTRACTS</dt>
            <dd className="tabular-nums">{sat.record.contractsCompleted}</dd>
          </div>

          <div>
            <dt className="text-[9px] tracking-[0.25em] opacity-50">DAYS IN ORBIT</dt>
            <dd className="tabular-nums">{daysInOrbit}</dd>
          </div>
        </dl>

        {/* Notable passes */}
        <div>
          <p className="mb-1.5 text-[9px] tracking-[0.25em] opacity-50">NOTABLE PASSES</p>
          {recentPasses.length === 0 ? (
            <p className="opacity-40 italic">No notable passes yet</p>
          ) : (
            <ul className="space-y-1">
              {recentPasses.map((pass, i) => (
                <li key={i} className="flex items-start gap-1.5 opacity-70">
                  <span className="mt-px text-[var(--accent)] shrink-0">▸</span>
                  <span className="leading-relaxed">{pass}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Close hint */}
        <p className="mt-3 text-center text-[8px] tracking-[0.4em] opacity-25">
          ESC OR CLICK OUTSIDE TO CLOSE
        </p>
      </div>
    </div>
  )
}
