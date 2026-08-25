'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePlaceStore } from '@/state/placeStore'
import { useWorldStore } from '@/state/worldStore'
import { useAgencyStore, agencyArchetype } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { nearestCity, placeLabel } from '@/lib/nearestCity'
import { greatCircleKm } from '@/lib/geo'
import { archetypeForKind, capabilityForKind } from '@/lib/contractMeta'
import { CAPABILITY_LABEL } from '@/lib/satelliteMeta'
import { ARCHETYPE_COLOR } from '@/lib/archetype'
import { Chip } from '@/components/ui/Chip'
import type { PlaceImage } from '@/lib/placeImage'
import { buildPlaceContract } from '@/lib/placeContract'
import { simNow } from '@/lib/simTime'
import { orbitalPeriod, ER_KM } from '@/lib/orbits'

const ARCHETYPE_LABEL: Record<string, string> = {
  relief: 'RELIEF',
  research: 'RESEARCH',
  defense: 'DEFENSE',
}

const CAPABILITY_COLOR_MAP: Record<string, string> = {
  OPTICAL: '#60a5fa',
  RELAY: '#4ade80',
  THERMAL: '#f87171',
}

function formatCoords(lat: number, lon: number): string {
  const latAbs = Math.abs(lat).toFixed(2)
  const lonAbs = Math.abs(lon).toFixed(2)
  const latDir = lat >= 0 ? 'N' : 'S'
  const lonDir = lon >= 0 ? 'E' : 'W'
  return `${latAbs}°${latDir}  ${lonAbs}°${lonDir}`
}

const KIND_COLOR: Record<string, string> = {
  quake: '#f87171',
  wildfire: '#fb923c',
  storm: '#60a5fa',
  launch: '#4ade80',
}

export default function PlaceCard() {
  const place = usePlaceStore((s) => s.place)
  const clear = usePlaceStore((s) => s.clear)
  const focusReveal = usePlaceStore((s) => s.focusReveal)
  const founded = useAgencyStore((s) => s.founded)
  const events = useWorldStore((s) => s.events)
  const cardRef = useRef<HTMLDivElement>(null)

  // ── Contract tasking state ─────────────────────────────────────────────────
  const [taskingInFlight, setTaskingInFlight] = useState(false)
  const [taskingConfirm, setTaskingConfirm] = useState<string | null>(null)

  // ── Place image state ──────────────────────────────────────────────────────
  const [placeImage, setPlaceImage] = useState<PlaceImage | null>(null)
  const [imgError, setImgError] = useState(false)

  // Fetch image whenever place changes; guard against races with a request ID
  const fetchIdRef = useRef(0)

  const fetchPlaceImage = useCallback(async (lat: number, lon: number, id: number) => {
    try {
      const res = await fetch(`/api/place-image?lat=${lat}&lon=${lon}`)
      if (!res.ok) return
      const data = (await res.json()) as PlaceImage
      // Only apply if this is still the latest request
      if (fetchIdRef.current === id) {
        setPlaceImage(data)
        setImgError(false)
      }
    } catch {
      // Network error — leave previous image in place (or null on first load)
    }
  }, [])

  useEffect(() => {
    if (!place) {
      setPlaceImage(null)
      setImgError(false)
      setTaskingConfirm(null)
      setTaskingInFlight(false)
      return
    }
    setTaskingConfirm(null)
    setTaskingInFlight(false)
    const id = ++fetchIdRef.current
    setPlaceImage(null)
    setImgError(false)
    void fetchPlaceImage(place.lat, place.lon, id)
  }, [place, fetchPlaceImage])

  // ESC to close
  useEffect(() => {
    if (!place) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [place, clear])

  // Click-away to close
  useEffect(() => {
    if (!place) return
    const onClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        clear()
      }
    }
    // Delayed attach so the opening click doesn't immediately close.
    const id = setTimeout(() => window.addEventListener('mousedown', onClick), 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('mousedown', onClick)
    }
  }, [place, clear])

  // ── Derived values (computed when place is set; used by the task contract callback) ──
  // These must be computed before useCallback so the callback dependency is stable.
  const lat = place?.lat ?? 0
  const lon = place?.lon ?? 0
  const label = place ? placeLabel(lat, lon) : ''
  const nearby = place
    ? events
        .filter((ev) => greatCircleKm(lat, lon, ev.lat, ev.lon) <= 600)
        .sort((a, b) => b.severity - a.severity)
        .slice(0, 3)
    : []

  // ── TASK CONTRACT (must be declared as a hook BEFORE the early return) ──────
  const handleTaskContract = useCallback(async () => {
    if (taskingInFlight) return
    setTaskingInFlight(true)
    setTaskingConfirm(null)

    try {
      const res = await fetch('/api/place-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lon,
          placeName: label,
          nearbyEvents: nearby.map((ev) => ({ kind: ev.kind, title: ev.title, severity: ev.severity })),
          agency: { name: useAgencyStore.getState().name, archetype: agencyArchetype() },
        }),
      })

      const data = await res.json() as {
        source: 'ai' | 'fallback'
        mission: { title: string; objective: string; archetype: 'relief' | 'research' | 'defense'; preferredCapability: 'imaging' | 'comms' | 'thermal' }
      }

      const maxNearbySeverity = nearby.length > 0
        ? Math.max(...nearby.map((ev) => ev.severity))
        : 0.5

      // LEO 500 km reference period
      const periodSec = orbitalPeriod((ER_KM + 500) / ER_KM)

      const contract = buildPlaceContract({
        ...data.mission,
        objective: data.mission.objective,
        lat,
        lon,
        placeName: label,
        severity: maxNearbySeverity,
        simNow: simNow(),
        periodSec,
      })

      useContractStore.getState().addContract(contract)
      useContractStore.getState().setTarget(contract.id)
      setTaskingConfirm('Contract added → CONTRACTS')
    } catch {
      setTaskingConfirm('Tasking failed — try again')
    } finally {
      setTaskingInFlight(false)
    }
  }, [taskingInFlight, lat, lon, label, nearby])

  if (!place || !founded) return null

  // ── Additional derived values only needed for rendering ───────────────────
  const coords = formatCoords(lat, lon)
  const { city, km } = nearestCity(lat, lon)

  // Derive fitting profile from dominant nearby event kind.
  const kindCounts: Record<string, number> = {}
  for (const ev of nearby) {
    kindCounts[ev.kind] = (kindCounts[ev.kind] ?? 0) + 1
  }
  const dominantKind =
    Object.keys(kindCounts).length > 0
      ? Object.entries(kindCounts).sort((a, b) => b[1] - a[1])[0][0]
      : null
  const archetype = dominantKind ? archetypeForKind(dominantKind) : 'research'
  const capability = dominantKind ? capabilityForKind(dominantKind) : 'imaging'
  const capLabel = CAPABILITY_LABEL[capability]
  const archColor = ARCHETYPE_COLOR[archetype]
  const capColor = CAPABILITY_COLOR_MAP[capLabel] ?? '#45d8ff'

  const handleFocus = () => {
    focusReveal(lat, lon, label)
    clear()
  }

  return (
    <div
      ref={cardRef}
      data-testid="place-card"
      className="pointer-events-auto fixed bottom-6 left-1/2 z-30 w-72 -translate-x-1/2 rounded border border-[var(--accent)]/25 bg-black/80 p-4 font-mono text-xs text-[var(--text)] shadow-[0_0_24px_2px_rgba(69,216,255,0.10)] backdrop-blur"
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold tracking-[0.3em] text-[var(--accent)] uppercase">
            {label}
          </p>
          <p className="mt-0.5 text-[10px] tabular-nums opacity-60">{coords}</p>
          <p className="mt-0.5 text-[10px] opacity-50">
            {Math.round(km)} km from {city.name}
          </p>
        </div>
        <button
          onClick={clear}
          className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] opacity-60 hover:border-white/30 hover:opacity-100 transition"
          aria-label="Close place card"
        >
          ✕
        </button>
      </div>

      <div className="my-2 h-px bg-white/10" />

      {/* Place image */}
      {placeImage && placeImage.source !== 'none' && !imgError ? (
        <div className="mb-3">
          <div className="relative h-24 w-full overflow-hidden rounded border border-white/10">
            <img
              src={placeImage.url}
              alt={placeImage.title}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          </div>
          {placeImage.attribution && (
            <p className="mt-0.5 truncate text-[8px] opacity-40" title={placeImage.attribution}>
              {placeImage.attribution}
            </p>
          )}
        </div>
      ) : placeImage && (placeImage.source === 'none' || imgError) ? (
        <div className="mb-3 flex h-24 w-full flex-col items-center justify-center rounded border border-white/10 bg-white/5">
          <p className="text-[9px] tracking-[0.3em] opacity-30 uppercase">NO IMAGERY</p>
          <p className="mt-1 text-[9px] tabular-nums opacity-20">{coords}</p>
        </div>
      ) : (
        /* Loading state */
        <div className="mb-3 flex h-24 w-full items-center justify-center rounded border border-white/10 bg-white/5">
          <p className="text-[9px] tracking-[0.3em] opacity-30 uppercase">LOADING…</p>
        </div>
      )}

      {/* Nearby events */}
      <div className="mb-3">
        <p className="mb-1 text-[9px] tracking-[0.3em] opacity-50 uppercase">Nearby Events</p>
        {nearby.length === 0 ? (
          <p className="text-[10px] opacity-40">No events within 600 km</p>
        ) : (
          <ul className="space-y-1">
            {nearby.map((ev) => (
              <li key={ev.id} className="flex items-center gap-1.5 min-w-0">
                <Chip color={KIND_COLOR[ev.kind] ?? '#45d8ff'}>
                  {ev.kind.toUpperCase()}
                </Chip>
                <span className="truncate opacity-80">{ev.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Fitting profile */}
      <div className="mb-3">
        <p className="mb-1 text-[9px] tracking-[0.3em] opacity-50 uppercase">Fitting Profile</p>
        <div className="flex items-center gap-1.5">
          <Chip color={archColor}>{ARCHETYPE_LABEL[archetype]}</Chip>
          <Chip color={capColor}>{capLabel}</Chip>
        </div>
      </div>

      <div className="my-2 h-px bg-white/10" />

      {/* Actions */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={handleFocus}
          className="w-full rounded border border-[var(--accent)]/50 py-1.5 text-[10px] tracking-[0.2em] text-[var(--accent)] transition hover:bg-[var(--accent)]/10 uppercase"
        >
          FOCUS / ZOOM IN
        </button>
        <button
          onClick={() => void handleTaskContract()}
          disabled={taskingInFlight}
          className={`w-full rounded border py-1.5 text-[10px] tracking-[0.2em] uppercase transition ${
            taskingInFlight
              ? 'border-white/10 opacity-30 cursor-not-allowed'
              : 'border-[var(--accent)]/30 text-[var(--accent)]/80 hover:bg-[var(--accent)]/10 hover:border-[var(--accent)]/60 cursor-pointer'
          }`}
        >
          {taskingInFlight ? 'TASKING…' : 'TASK CONTRACT HERE'}
        </button>
        {taskingConfirm && (
          <p className="text-center text-[9px] tracking-[0.2em] text-[var(--accent)] opacity-70 uppercase">{taskingConfirm}</p>
        )}
        <button
          disabled
          className="w-full rounded border border-white/10 py-1.5 text-[10px] tracking-[0.2em] opacity-30 uppercase cursor-not-allowed"
        >
          CAPTURE POSTCARD
        </button>
      </div>
    </div>
  )
}
