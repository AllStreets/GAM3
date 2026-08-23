import { NextResponse } from 'next/server'
import {
  normalizeUsgs, normalizeEonet, normalizeLaunches, type WorldEvent,
} from '@/lib/worldEvents'

const USGS_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=60'
const LAUNCH_URL = 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=12&mode=list'

async function fetchJson(url: string, revalidate: number): Promise<unknown> {
  const res = await fetch(url, { next: { revalidate } })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

export async function GET() {
  const [usgs, eonet, launches] = await Promise.allSettled([
    fetchJson(USGS_URL, 120),
    fetchJson(EONET_URL, 120),
    fetchJson(LAUNCH_URL, 900), // Launch Library is rate-limited (~15/hr)
  ])

  const events: WorldEvent[] = [
    ...(usgs.status === 'fulfilled' ? normalizeUsgs(usgs.value) : []),
    ...(eonet.status === 'fulfilled' ? normalizeEonet(eonet.value) : []),
    ...(launches.status === 'fulfilled' ? normalizeLaunches(launches.value) : []),
  ]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, 120)

  return NextResponse.json({
    events,
    sources: {
      usgs: usgs.status === 'fulfilled' ? 'ok' : 'error',
      eonet: eonet.status === 'fulfilled' ? 'ok' : 'error',
      launches: launches.status === 'fulfilled' ? 'ok' : 'error',
    },
    fetchedAt: new Date().toISOString(),
  })
}
