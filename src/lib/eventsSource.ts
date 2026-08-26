/**
 * eventsSource.ts — Shared server function for fetching + normalising world events.
 *
 * Extracted from /api/events/route.ts so both that route and /api/tick can share
 * the same feed-fetching logic without duplicating it.
 *
 * Characteristics:
 *  - Promise.allSettled over all feeds (per-source isolation: one feed failure
 *    never aborts the others).
 *  - 8 s AbortSignal timeout per request (avoids hanging the tick).
 *  - Returns up to 120 events sorted by time descending.
 *  - Identical logic to what /api/events GET returns; never alters response shape.
 */

import {
  normalizeUsgs,
  normalizeEonet,
  normalizeLaunches,
  type WorldEvent,
} from '@/lib/worldEvents'
import { normalizeGdacs } from '@/lib/gdacs'
import { normalizeSpaceWeather } from '@/lib/spaceWeather'

const USGS_URL =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
const EONET_URL =
  'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=60&categories=volcanoes,floods,severeStorms,wildfires'
const LAUNCH_URL =
  'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=12&mode=list'
const GDACS_URL =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP'
const SWPC_URL =
  'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'

async function fetchJson(url: string, revalidate: number): Promise<unknown> {
  const res = await fetch(url, {
    next: { revalidate },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

/**
 * Fetch and normalise all world-event feeds.
 *
 * Per-source isolation via Promise.allSettled — a failed feed returns an empty
 * slice; the remaining feeds are unaffected.
 *
 * Returns up to 120 events sorted by ISO time descending (newest first),
 * exactly as /api/events/route.ts returns them.
 */
export async function fetchWorldEvents(): Promise<WorldEvent[]> {
  const [usgs, eonet, launches, gdacs, swpc] = await Promise.allSettled([
    fetchJson(USGS_URL, 120),
    fetchJson(EONET_URL, 120),
    fetchJson(LAUNCH_URL, 900), // Launch Library is rate-limited (~15/hr)
    fetchJson(GDACS_URL, 600),
    fetchJson(SWPC_URL, 900),
  ])

  return [
    ...(usgs.status === 'fulfilled' ? normalizeUsgs(usgs.value) : []),
    ...(eonet.status === 'fulfilled' ? normalizeEonet(eonet.value) : []),
    ...(launches.status === 'fulfilled' ? normalizeLaunches(launches.value) : []),
    ...(gdacs.status === 'fulfilled' ? normalizeGdacs(gdacs.value) : []),
    ...(swpc.status === 'fulfilled' ? normalizeSpaceWeather(swpc.value) : []),
  ]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 120)
}

/**
 * Fetch world events and return both the events list and per-source status.
 * Used by /api/events/route.ts to maintain the existing response shape.
 */
export async function fetchWorldEventsWithStatus(): Promise<{
  events: WorldEvent[]
  sources: {
    usgs: 'ok' | 'error'
    eonet: 'ok' | 'error'
    launches: 'ok' | 'error'
    gdacs: 'ok' | 'error'
    spaceweather: 'ok' | 'error'
  }
}> {
  const [usgs, eonet, launches, gdacs, swpc] = await Promise.allSettled([
    fetchJson(USGS_URL, 120),
    fetchJson(EONET_URL, 120),
    fetchJson(LAUNCH_URL, 900),
    fetchJson(GDACS_URL, 600),
    fetchJson(SWPC_URL, 900),
  ])

  const events: WorldEvent[] = [
    ...(usgs.status === 'fulfilled' ? normalizeUsgs(usgs.value) : []),
    ...(eonet.status === 'fulfilled' ? normalizeEonet(eonet.value) : []),
    ...(launches.status === 'fulfilled' ? normalizeLaunches(launches.value) : []),
    ...(gdacs.status === 'fulfilled' ? normalizeGdacs(gdacs.value) : []),
    ...(swpc.status === 'fulfilled' ? normalizeSpaceWeather(swpc.value) : []),
  ]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 120)

  return {
    events,
    sources: {
      usgs: usgs.status === 'fulfilled' ? 'ok' : 'error',
      eonet: eonet.status === 'fulfilled' ? 'ok' : 'error',
      launches: launches.status === 'fulfilled' ? 'ok' : 'error',
      gdacs: gdacs.status === 'fulfilled' ? 'ok' : 'error',
      spaceweather: swpc.status === 'fulfilled' ? 'ok' : 'error',
    },
  }
}
