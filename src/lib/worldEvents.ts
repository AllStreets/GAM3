export type EventKind = 'quake' | 'wildfire' | 'storm' | 'launch' | 'volcano' | 'flood' | 'spaceweather'

export interface WorldEvent {
  id: string
  kind: EventKind
  title: string
  lat: number
  lon: number
  /** ISO timestamp of the event (or launch net). */
  time: string
  /** 0..1 visual weight. */
  severity: number
  detail?: string
  url?: string
}

function num(x: unknown): number | null {
  const n = typeof x === 'string' ? Number(x) : x
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** USGS GeoJSON summary feed -> WorldEvents. Malformed entries are skipped. */
export function normalizeUsgs(json: unknown): WorldEvent[] {
  const features = (json as any)?.features
  if (!Array.isArray(features)) return []
  const out: WorldEvent[] = []
  for (const f of features) {
    const mag = num(f?.properties?.mag)
    const time = num(f?.properties?.time)
    const lon = num(f?.geometry?.coordinates?.[0])
    const lat = num(f?.geometry?.coordinates?.[1])
    const place = typeof f?.properties?.place === 'string' ? f.properties.place : null
    if (mag === null || time === null || lon === null || lat === null || !f?.id) continue
    out.push({
      id: `usgs-${f.id}`,
      kind: 'quake',
      title: `M${mag.toFixed(1)} — ${place ?? 'unknown location'}`,
      lat, lon,
      time: new Date(time).toISOString(),
      severity: Math.min(1, Math.max(0, mag / 9)),
      url: typeof f?.properties?.url === 'string' ? f.properties.url : undefined,
    })
  }
  return out
}

const EONET_KINDS: Record<string, { kind: EventKind; severity: number }> = {
  wildfires: { kind: 'wildfire', severity: 0.5 },
  severeStorms: { kind: 'storm', severity: 0.7 },
  volcanoes: { kind: 'volcano', severity: 0.6 },
  floods: { kind: 'flood', severity: 0.5 },
}

/** NASA EONET v3 open events -> WorldEvents (wildfires + severe storms only, latest geometry point). */
export function normalizeEonet(json: unknown): WorldEvent[] {
  const events = (json as any)?.events
  if (!Array.isArray(events)) return []
  const out: WorldEvent[] = []
  for (const ev of events) {
    const catId = ev?.categories?.[0]?.id
    const mapping = typeof catId === 'string' ? EONET_KINDS[catId] : undefined
    if (!mapping || !ev?.id || typeof ev?.title !== 'string') continue
    const geoms = Array.isArray(ev?.geometry) ? ev.geometry : []
    const last = geoms[geoms.length - 1]
    const lon = num(last?.coordinates?.[0])
    const lat = num(last?.coordinates?.[1])
    if (lon === null || lat === null) continue
    out.push({
      id: `eonet-${ev.id}`,
      kind: mapping.kind,
      title: ev.title,
      lat, lon,
      time: typeof last?.date === 'string' ? last.date : new Date(0).toISOString(),
      severity: mapping.severity,
    })
  }
  return out
}

/** Launch Library 2 upcoming launches -> WorldEvents (pad coordinates). */
export function normalizeLaunches(json: unknown): WorldEvent[] {
  const results = (json as any)?.results
  if (!Array.isArray(results)) return []
  const out: WorldEvent[] = []
  for (const l of results) {
    const lat = num(l?.pad?.latitude)
    const lon = num(l?.pad?.longitude)
    if (lat === null || lon === null || !l?.id || typeof l?.name !== 'string') continue
    out.push({
      id: `launch-${l.id}`,
      kind: 'launch',
      title: l.name,
      lat, lon,
      time: typeof l?.net === 'string' ? l.net : new Date(0).toISOString(),
      severity: 0.4,
      detail: typeof l?.pad?.location?.name === 'string' ? l.pad.location.name : undefined,
    })
  }
  return out
}
