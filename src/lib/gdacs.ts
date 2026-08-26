import type { EventKind, WorldEvent } from './worldEvents'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Map GDACS event type codes → EventKind */
const GDACS_KIND: Record<string, EventKind> = {
  EQ: 'quake',
  TC: 'storm',
  FL: 'flood',
  VO: 'volcano',
  DR: 'wildfire', // drought → wildfire (closest archetype)
  WF: 'wildfire',
}

/** Map GDACS alert level → 0..1 severity */
const GDACS_SEVERITY: Record<string, number> = {
  Green: 0.3,
  Orange: 0.6,
  Red: 0.9,
}

function num(x: unknown): number | null {
  const n = typeof x === 'string' ? Number(x) : x
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * Normalise a GDACS GeoJSON FeatureCollection event list into WorldEvents.
 * Pure: no network calls. Skips malformed features. Returns [] on total garbage.
 *
 * Feed URL: https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP
 */
export function normalizeGdacs(raw: unknown): WorldEvent[] {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return []
  const features = (raw as any)?.features
  if (!Array.isArray(features)) return []

  const out: WorldEvent[] = []

  for (const f of features) {
    try {
      const props = f?.properties
      if (!props) continue

      const eventtype: string | undefined = props.eventtype
      const alertlevel: string | undefined = props.alertlevel
      const fromdate: string | undefined = props.fromdate
      const name: string | undefined = props.name
      const eventid: string | undefined = props.eventid

      // All required fields must be present
      if (!eventtype || !alertlevel || !fromdate || !name || !eventid) continue

      const kind = GDACS_KIND[eventtype]
      if (!kind) continue // unknown type — skip

      const severity = GDACS_SEVERITY[alertlevel]
      if (severity === undefined) continue // unknown alert level

      const coords = f?.geometry?.coordinates
      const lon = num(coords?.[0])
      const lat = num(coords?.[1])
      if (lon === null || lat === null) continue

      out.push({
        id: `gdacs-${eventid}`,
        kind,
        title: name,
        lat,
        lon,
        time: fromdate,
        severity,
      })
    } catch {
      // Skip any feature that throws during parsing
      continue
    }
  }

  return out
}
