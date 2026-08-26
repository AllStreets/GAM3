'use client'

/**
 * BuyPlanePicker — replaces the bare "BUY SATELLITE" button in FleetPanel.
 *
 * Default mode: "BUY SATELLITE · AUTO §800" — calls buySatellite() (auto plane).
 * AIM mode: offers the currently-targeted contract and the inspected place as
 *   aim targets. Shows the resulting inclination coverage before confirming.
 *   On confirm → buySatelliteAimed(target).
 *
 * On-brand: `ui/Chip`, dark neon aesthetic, consistent border/padding.
 */

import { useState } from 'react'
import { useGameStore } from '@/state/gameStore'
import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { usePlaceStore } from '@/state/placeStore'
import { SATELLITE_PRICE } from '@/lib/economy'
import { planeForTarget } from '@/lib/aimPlane'
import { audio } from '@/audio/AudioEngine'
import { Chip } from '@/components/ui/Chip'

interface AimTarget {
  label: string
  lat: number
  lon: number
}

/** Compute the display inclination in degrees from a target lat. */
function aimInclinationDeg(lat: number): number {
  const MIN_I_DEG = 5
  const MAX_I_DEG = 99
  return Math.min(MAX_I_DEG, Math.max(MIN_I_DEG, Math.abs(lat) + 5))
}

export default function BuyPlanePicker() {
  const buySatellite = useGameStore((s) => s.buySatellite)
  const buySatelliteAimed = useGameStore((s) => s.buySatelliteAimed)
  const funding = useAgencyStore((s) => s.funding)

  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const place = usePlaceStore((s) => s.place)

  // UI state
  const [mode, setMode] = useState<'auto' | 'aim'>('auto')
  const [selectedTarget, setSelectedTarget] = useState<AimTarget | null>(null)

  const canBuy = funding >= SATELLITE_PRICE

  // Collect aim targets:
  // 1. Currently targeted active contract
  const targetContract =
    (targetId ? contracts.find((c) => c.id === targetId && c.status === 'active') : null) ??
    contracts.find((c) => c.status === 'active') ??
    null

  const aimTargets: AimTarget[] = []
  if (targetContract) {
    aimTargets.push({
      label: targetContract.title,
      lat: targetContract.lat,
      lon: targetContract.lon,
    })
  }
  // 2. Inspected place (from clicking the globe)
  if (place) {
    // Don't duplicate if same coords as the contract
    const isDup = aimTargets.some(
      (t) => Math.abs(t.lat - place.lat) < 0.1 && Math.abs(t.lon - place.lon) < 0.1,
    )
    if (!isDup) {
      aimTargets.push({
        label: `Inspected place (${place.lat.toFixed(1)}°, ${place.lon.toFixed(1)}°)`,
        lat: place.lat,
        lon: place.lon,
      })
    }
  }

  // Auto-select first target when entering aim mode
  function enterAimMode() {
    setMode('aim')
    if (aimTargets.length > 0 && !selectedTarget) {
      setSelectedTarget(aimTargets[0])
    }
  }

  function cancel() {
    setMode('auto')
    setSelectedTarget(null)
  }

  function confirmBuy() {
    if (!canBuy) return
    let ok: boolean
    if (selectedTarget) {
      ok = buySatelliteAimed({ lat: selectedTarget.lat, lon: selectedTarget.lon })
    } else {
      ok = buySatellite()
    }
    if (ok) audio.chirp()
    setMode('auto')
    setSelectedTarget(null)
  }

  // ── AUTO mode ──────────────────────────────────────────────────────────────
  if (mode === 'auto') {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => { if (buySatellite()) audio.chirp() }}
          disabled={!canBuy}
          className="flex-1 rounded border border-[var(--accent)]/40 px-2 py-1 text-[11px] text-[var(--accent)] transition enabled:hover:bg-[var(--accent)]/10 disabled:opacity-30"
          title={canBuy ? undefined : `Need §${SATELLITE_PRICE - funding} more`}
        >
          BUY SATELLITE · AUTO §{SATELLITE_PRICE}
        </button>
        {aimTargets.length > 0 && (
          <button
            onClick={enterAimMode}
            disabled={!canBuy}
            className="rounded border border-[var(--accent)]/25 px-2 py-1 text-[11px] text-[var(--accent)]/70 transition enabled:hover:border-[var(--accent)]/60 enabled:hover:text-[var(--accent)] disabled:opacity-30"
            title="Choose orbital plane aimed at a target"
          >
            AIM…
          </button>
        )}
      </div>
    )
  }

  // ── AIM mode ───────────────────────────────────────────────────────────────
  const displayTarget = selectedTarget ?? (aimTargets[0] ?? null)
  const previewIncl = displayTarget ? aimInclinationDeg(displayTarget.lat) : null

  return (
    <div className="rounded border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.25em] text-[var(--accent)]">AIM SATELLITE PLANE</span>
        <button
          onClick={cancel}
          className="text-[10px] opacity-50 hover:opacity-100 transition"
        >
          ✕
        </button>
      </div>

      {/* Target picker */}
      <div className="space-y-1">
        {aimTargets.map((t) => {
          const iSel = selectedTarget?.label === t.label
          const incl = aimInclinationDeg(t.lat)
          return (
            <button
              key={t.label}
              onClick={() => setSelectedTarget(t)}
              className={`w-full rounded border px-2 py-1.5 text-left transition text-[10px] ${
                iSel
                  ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-white/10 text-[var(--text)] hover:border-white/30'
              }`}
            >
              <span className="block font-semibold truncate">{t.label}</span>
              <span className="block opacity-60 tabular-nums">
                {t.lat.toFixed(1)}° / {t.lon.toFixed(1)}° · orbit incl. ~{incl}°
              </span>
            </button>
          )
        })}
      </div>

      {/* Coverage preview */}
      {displayTarget && previewIncl !== null && (
        <div className="text-[10px] opacity-70 leading-relaxed">
          <span>New bird covers up to </span>
          <Chip color="var(--accent)">~{previewIncl}° lat</Chip>
          <span className="ml-1">— reaches {displayTarget.label.length > 28 ? displayTarget.label.slice(0, 28) + '…' : displayTarget.label}</span>
        </div>
      )}

      {/* Confirm / cancel */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={cancel}
          className="flex-1 rounded border border-white/15 px-2 py-1 text-[11px] hover:border-white/30 transition"
        >
          CANCEL
        </button>
        <button
          onClick={confirmBuy}
          disabled={!canBuy || !displayTarget}
          className="flex-1 rounded border border-[var(--accent)]/50 px-2 py-1 text-[11px] text-[var(--accent)] transition enabled:hover:bg-[var(--accent)]/15 disabled:opacity-30"
          title={canBuy ? undefined : `Need §${SATELLITE_PRICE - funding} more`}
        >
          BUY AIMED §{SATELLITE_PRICE}
        </button>
      </div>
    </div>
  )
}
