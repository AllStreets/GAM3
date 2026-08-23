# HYPERION Plan 3: The Living World — Real Events

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real world events — USGS earthquakes, NASA EONET wildfires/storms, upcoming rocket launches — appear live on the globe as animated, type-coded markers, with an EVENTS panel listing them; clicking an event flies the camera to it. The world is now real.

**Architecture:** Pure normalizers (`src/lib/worldEvents.ts`, TDD with fixtures) convert each feed's JSON into a common `WorldEvent`; a Next.js route handler (`src/app/api/events/route.ts`) fetches all feeds server-side with per-source failure isolation and HTTP caching; a zustand `worldStore` polls it; an `EventLayer` renders animated markers (quake ripple rings, ember flickers, storm pulses, launch beacons); an `EventsPanel` lists events and drives selection + camera fly-to.

**Tech Stack:** Existing stack. No new dependencies, no database (persistence arrives in Plan 4 with Neon/Clerk).

**Spec:** `docs/superpowers/specs/2026-08-22-hyperion-design.md`

## Global Constraints

- Real events get respectful presentation: factual titles, no gamified framing of casualties (spec: "Real victims are never gamified").
- Feed failure isolation: any source failing must not break the others; total failure returns an empty list with per-source status — the client keeps the last good data (spec: "the game never presents an empty world").
- All feed fetching happens in the route handler (server-side on deploy), never from the browser directly (CORS + future key hygiene).
- Launch Library is rate-limited (~15 req/hr): its fetch uses `next: { revalidate: 900 }`. USGS/EONET use `next: { revalidate: 120 }`.
- Engine code must not import React. Event markers derive positions via `latLonToVector3` from `src/lib/geo.ts`.
- Existing gates stay green: `pnpm test`, `pnpm e2e` (2 tests), `tsc --noEmit`.
- Commit prefixes: `feat:` / `test:` / `chore:` / `fix:`.

---

### Task 1: WorldEvent type + feed normalizers (TDD)

**Files:**
- Create: `src/lib/worldEvents.ts`
- Test: `src/lib/worldEvents.test.ts`

**Interfaces:**
- Produces:
  - `type EventKind = 'quake' | 'wildfire' | 'storm' | 'launch'`
  - `interface WorldEvent { id: string; kind: EventKind; title: string; lat: number; lon: number; time: string /* ISO */; severity: number /* 0..1 */; detail?: string; url?: string }`
  - `normalizeUsgs(json: unknown): WorldEvent[]`
  - `normalizeEonet(json: unknown): WorldEvent[]`
  - `normalizeLaunches(json: unknown): WorldEvent[]`
  - Each normalizer is total: malformed input → `[]`; malformed individual entries are skipped.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/worldEvents.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeUsgs, normalizeEonet, normalizeLaunches } from './worldEvents'

const usgsFixture = {
  features: [
    {
      id: 'us7000abcd',
      properties: { mag: 6.3, place: '42 km SW of Hokkaido, Japan', time: 1755900000000, url: 'https://usgs.gov/x' },
      geometry: { coordinates: [143.2, 41.8, 35.0] },
    },
    { id: 'bad', properties: { mag: null, place: null, time: null }, geometry: null },
  ],
}

const eonetFixture = {
  events: [
    {
      id: 'EONET_1234',
      title: 'Bootleg Fire, Oregon',
      categories: [{ id: 'wildfires', title: 'Wildfires' }],
      geometry: [
        { coordinates: [-121.4, 42.6], date: '2026-08-20T10:00:00Z' },
        { coordinates: [-121.5, 42.7], date: '2026-08-22T10:00:00Z' },
      ],
    },
    {
      id: 'EONET_5678',
      title: 'Hurricane Odette',
      categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
      geometry: [{ coordinates: [-71.2, 24.5], date: '2026-08-22T06:00:00Z' }],
    },
    {
      id: 'EONET_9999',
      title: 'Iceberg A-23A',
      categories: [{ id: 'seaLakeIce', title: 'Sea and Lake Ice' }],
      geometry: [{ coordinates: [-40.0, -75.0], date: '2026-08-22T00:00:00Z' }],
    },
  ],
}

const launchFixture = {
  results: [
    {
      id: 'll-abc',
      name: 'Falcon 9 | Starlink Group 12-9',
      net: '2026-08-23T14:30:00Z',
      pad: { latitude: '28.56', longitude: '-80.57', location: { name: 'Cape Canaveral, FL, USA' } },
    },
    { id: 'll-bad', name: 'No Pad', net: '2026-08-24T00:00:00Z', pad: null },
  ],
}

describe('normalizeUsgs', () => {
  it('maps a quake feature to a WorldEvent', () => {
    const events = normalizeUsgs(usgsFixture)
    expect(events).toHaveLength(1)
    const e = events[0]
    expect(e).toMatchObject({ id: 'usgs-us7000abcd', kind: 'quake', lat: 41.8, lon: 143.2 })
    expect(e.title).toContain('M6.3')
    expect(e.severity).toBeCloseTo(6.3 / 9, 5)
    expect(e.time).toBe(new Date(1755900000000).toISOString())
  })
  it('returns [] for malformed input', () => {
    expect(normalizeUsgs(null)).toEqual([])
    expect(normalizeUsgs({ nope: 1 })).toEqual([])
  })
})

describe('normalizeEonet', () => {
  it('maps wildfires and storms using the LATEST geometry point, skips other categories', () => {
    const events = normalizeEonet(eonetFixture)
    expect(events).toHaveLength(2)
    const fire = events.find((e) => e.kind === 'wildfire')!
    expect(fire.lat).toBeCloseTo(42.7)
    expect(fire.lon).toBeCloseTo(-121.5)
    expect(fire.severity).toBe(0.5)
    const storm = events.find((e) => e.kind === 'storm')!
    expect(storm.title).toBe('Hurricane Odette')
    expect(storm.severity).toBe(0.7)
  })
  it('returns [] for malformed input', () => {
    expect(normalizeEonet(undefined)).toEqual([])
  })
})

describe('normalizeLaunches', () => {
  it('maps an upcoming launch with pad coordinates', () => {
    const events = normalizeLaunches(launchFixture)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      id: 'launch-ll-abc', kind: 'launch', lat: 28.56, lon: -80.57, severity: 0.4,
    })
    expect(events[0].detail).toBe('Cape Canaveral, FL, USA')
  })
  it('returns [] for malformed input', () => {
    expect(normalizeLaunches(42)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — fail** (`pnpm test`: cannot resolve `./worldEvents`)

- [ ] **Step 3: Implement**

Create `src/lib/worldEvents.ts`:

```ts
export type EventKind = 'quake' | 'wildfire' | 'storm' | 'launch'

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
```

- [ ] **Step 4: Run tests — all pass** (`pnpm test`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/worldEvents.ts src/lib/worldEvents.test.ts
git commit -m "feat: WorldEvent normalizers for USGS, EONET, and Launch Library feeds"
```

---

### Task 2: /api/events route handler

**Files:**
- Create: `src/app/api/events/route.ts`

**Interfaces:**
- Consumes: the three normalizers.
- Produces: `GET /api/events` → `{ events: WorldEvent[], sources: { usgs: 'ok'|'error'; eonet: 'ok'|'error'; launches: 'ok'|'error' }, fetchedAt: string }`. Events merged, sorted by `time` descending, capped at 120. Route always returns 200.

- [ ] **Step 1: Implement the route**

Create `src/app/api/events/route.ts`:

```ts
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
```

- [ ] **Step 2: Verify against the live feeds**

Run: `pnpm dev` (kill stale port 3000 first), then:

```bash
curl -s http://localhost:3000/api/events | head -c 600
```

Expected: JSON starting with `{"events":[{"id":"...` containing real current events; `"sources":{"usgs":"ok"` (a source may legitimately be `"error"` if the external feed is down — the route must still return 200 with the rest).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/events/route.ts
git commit -m "feat: /api/events route merging live USGS, EONET, launch feeds"
```

---

### Task 3: worldStore + polling (TDD for store logic)

**Files:**
- Create: `src/state/worldStore.ts`
- Test: `src/state/worldStore.test.ts`

**Interfaces:**
- Consumes: `WorldEvent`.
- Produces:
  - `useWorldStore` (zustand): `{ events: WorldEvent[]; focusedId: string | null; lastFetch: string | null; sourcesOk: boolean; setEvents(events: WorldEvent[], sourcesOk: boolean, fetchedAt: string): void; focusEvent(id: string | null): void }`
  - `setEvents` keeps the previous list when handed an empty array while a non-empty list exists (never blank the world).
  - `startEventPolling(intervalMs?: number): () => void` — fetches `/api/events` immediately and on an interval (default 120_000); returns a stop function. Guarded so it is browser-only (no-ops during SSR/tests without fetch).

- [ ] **Step 1: Write the failing tests**

Create `src/state/worldStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useWorldStore } from './worldStore'
import type { WorldEvent } from '@/lib/worldEvents'

const ev = (id: string): WorldEvent => ({
  id, kind: 'quake', title: `Event ${id}`, lat: 0, lon: 0,
  time: '2026-08-23T00:00:00Z', severity: 0.5,
})

beforeEach(() => {
  useWorldStore.getState().resetForTest()
})

describe('worldStore', () => {
  it('stores events and metadata', () => {
    useWorldStore.getState().setEvents([ev('a'), ev('b')], true, '2026-08-23T01:00:00Z')
    const s = useWorldStore.getState()
    expect(s.events).toHaveLength(2)
    expect(s.sourcesOk).toBe(true)
    expect(s.lastFetch).toBe('2026-08-23T01:00:00Z')
  })

  it('never blanks a non-empty world with an empty fetch', () => {
    useWorldStore.getState().setEvents([ev('a')], true, 't1')
    useWorldStore.getState().setEvents([], false, 't2')
    const s = useWorldStore.getState()
    expect(s.events).toHaveLength(1)
    expect(s.sourcesOk).toBe(false)
  })

  it('clears focus when the focused event disappears', () => {
    useWorldStore.getState().setEvents([ev('a')], true, 't1')
    useWorldStore.getState().focusEvent('a')
    useWorldStore.getState().setEvents([ev('b')], true, 't2')
    expect(useWorldStore.getState().focusedId).toBeNull()
  })

  it('focusEvent toggles and clears', () => {
    useWorldStore.getState().setEvents([ev('a')], true, 't1')
    useWorldStore.getState().focusEvent('a')
    expect(useWorldStore.getState().focusedId).toBe('a')
    useWorldStore.getState().focusEvent(null)
    expect(useWorldStore.getState().focusedId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — fail** (`pnpm test`)

- [ ] **Step 3: Implement**

Create `src/state/worldStore.ts`:

```ts
import { create } from 'zustand'
import type { WorldEvent } from '@/lib/worldEvents'

interface WorldState {
  events: WorldEvent[]
  focusedId: string | null
  lastFetch: string | null
  sourcesOk: boolean
  setEvents(events: WorldEvent[], sourcesOk: boolean, fetchedAt: string): void
  focusEvent(id: string | null): void
  resetForTest(): void
}

export const useWorldStore = create<WorldState>((set, get) => ({
  events: [],
  focusedId: null,
  lastFetch: null,
  sourcesOk: true,

  setEvents: (events, sourcesOk, fetchedAt) =>
    set((s) => {
      // Never blank a non-empty world (spec: the game never presents an empty world).
      const next = events.length === 0 && s.events.length > 0 ? s.events : events
      const focusedId =
        s.focusedId && next.some((e) => e.id === s.focusedId) ? s.focusedId : null
      return { events: next, sourcesOk, lastFetch: fetchedAt, focusedId }
    }),

  focusEvent: (id) => set({ focusedId: id }),

  resetForTest: () => set({ events: [], focusedId: null, lastFetch: null, sourcesOk: true }),
}))

/** Browser-only polling loop. Returns a stop function. */
export function startEventPolling(intervalMs = 120_000): () => void {
  if (typeof window === 'undefined') return () => {}

  let stopped = false
  const pull = async () => {
    try {
      const res = await fetch('/api/events')
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as {
        events: WorldEvent[]
        sources: Record<string, string>
        fetchedAt: string
      }
      if (stopped) return
      const sourcesOk = Object.values(data.sources).every((s) => s === 'ok')
      useWorldStore.getState().setEvents(data.events, sourcesOk, data.fetchedAt)
    } catch {
      if (!stopped) useWorldStore.getState().setEvents([], false, new Date().toISOString())
    }
  }

  void pull()
  const id = setInterval(pull, intervalMs)
  return () => {
    stopped = true
    clearInterval(id)
  }
}
```

- [ ] **Step 4: Run tests — all pass**; `pnpm exec tsc --noEmit` clean

- [ ] **Step 5: Commit**

```bash
git add src/state/worldStore.ts src/state/worldStore.test.ts
git commit -m "feat: world store with resilient event ingestion and polling"
```

---

### Task 4: EventLayer — animated markers + camera fly-to

**Files:**
- Create: `src/engine/EventLayer.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Interfaces:**
- Consumes: `useWorldStore`, `latLonToVector3`.
- Produces: `class EventLayer { readonly group: THREE.Group; update(elapsedSeconds: number): void; dispose(): void }`; GlobeEngine adds it, updates it per frame, and flies the camera to a newly focused event (smooth 1.2 s ease of the camera position direction toward the event, preserving distance; controls disabled during the flight).

Marker design (all additive, depthWrite false, positioned at `latLonToVector3(lat, lon, 1.005)`):
- quake: flat ring (`RingGeometry(0.012, 0.016)`) oriented tangent to the surface (lookAt outward normal), color `0xff5c49`, plus an expanding "ripple" ring that scales 1→3 and fades on a 2 s loop, phase-offset per event
- wildfire: small sphere `0.008`, color `0xffa14a`, opacity flickering `0.55 + 0.3 * sin(t * 7 + phase)`
- storm: ring (`RingGeometry(0.014, 0.02)`), color `0x9a7bff`, slow pulse scale `1 + 0.15 * sin(t * 2 + phase)`
- launch: small cone (`ConeGeometry(0.008, 0.024)`) pointing outward (aligned to surface normal), color `0x45d8ff`
- focused event: its marker group scales ×1.8 and gets full opacity

- [ ] **Step 1: Write the layer**

Create `src/engine/EventLayer.ts`:

```ts
import * as THREE from 'three'
import { latLonToVector3 } from '@/lib/geo'
import { useWorldStore } from '@/state/worldStore'
import type { WorldEvent } from '@/lib/worldEvents'

const COLORS = { quake: 0xff5c49, wildfire: 0xffa14a, storm: 0x9a7bff, launch: 0x45d8ff } as const

interface MarkerEntry {
  root: THREE.Group
  event: WorldEvent
  phase: number
  ripple?: THREE.Mesh
  core: THREE.Mesh
}

function additiveMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  })
}

export class EventLayer {
  readonly group = new THREE.Group()
  private markers = new Map<string, MarkerEntry>()
  private unsubscribe: () => void

  constructor() {
    this.rebuild()
    this.unsubscribe = useWorldStore.subscribe((state, prev) => {
      if (state.events !== prev.events || state.focusedId !== prev.focusedId) this.rebuild()
    })
  }

  private clear() {
    for (const entry of this.markers.values()) {
      this.group.remove(entry.root)
      entry.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          ;(obj.material as THREE.Material).dispose()
        }
      })
    }
    this.markers.clear()
  }

  private rebuild() {
    this.clear()
    const { events, focusedId } = useWorldStore.getState()
    for (const [idx, event] of events.entries()) {
      const root = new THREE.Group()
      const pos = latLonToVector3(event.lat, event.lon, 1.005)
      root.position.copy(pos)
      root.lookAt(pos.clone().multiplyScalar(2)) // +Z faces outward along the surface normal

      const color = COLORS[event.kind]
      let core: THREE.Mesh
      let ripple: THREE.Mesh | undefined

      if (event.kind === 'quake') {
        core = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 32), additiveMat(color, 0.9))
        ripple = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.014, 32), additiveMat(color, 0.5))
        root.add(ripple)
      } else if (event.kind === 'wildfire') {
        core = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 12), additiveMat(color, 0.8))
      } else if (event.kind === 'storm') {
        core = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.02, 32), additiveMat(color, 0.75))
      } else {
        core = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.024, 12), additiveMat(color, 0.9))
        core.rotation.x = Math.PI / 2 // cone axis along +Z (outward)
      }
      root.add(core)

      if (event.id === focusedId) root.scale.setScalar(1.8)

      this.group.add(root)
      this.markers.set(event.id, { root, event, phase: idx * 0.7, core, ripple })
    }
  }

  update(elapsedSeconds: number) {
    for (const { event, phase, ripple, core } of this.markers.values()) {
      const t = elapsedSeconds + phase
      if (event.kind === 'quake' && ripple) {
        const cycle = (t % 2) / 2
        ripple.scale.setScalar(1 + cycle * 2)
        ;(ripple.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - cycle)
      } else if (event.kind === 'wildfire') {
        ;(core.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(t * 7)
      } else if (event.kind === 'storm') {
        core.scale.setScalar(1 + 0.15 * Math.sin(t * 2))
      }
    }
  }

  dispose() {
    this.unsubscribe()
    this.clear()
  }
}
```

- [ ] **Step 2: Integrate with the engine + camera fly-to**

In `src/engine/GlobeEngine.ts`:

Imports:

```ts
import { EventLayer } from '@/engine/EventLayer'
import { useWorldStore } from '@/state/worldStore'
import { latLonToVector3 } from '@/lib/geo'
```

(Merge with existing geo import if present.)

Fields:

```ts
private eventLayer: EventLayer
private worldUnsub?: () => void
private flight: { from: THREE.Vector3; to: THREE.Vector3; start: number } | null = null
```

Constructor (after satLayer setup):

```ts
this.eventLayer = new EventLayer()
this.scene.add(this.eventLayer.group)

this.worldUnsub = useWorldStore.subscribe((state, prev) => {
  if (state.focusedId && state.focusedId !== prev.focusedId) {
    const ev = state.events.find((e) => e.id === state.focusedId)
    if (ev) this.flyTo(ev.lat, ev.lon)
  }
})
```

Methods:

```ts
/** Ease the camera so it looks down on (lat, lon), preserving current distance. */
private flyTo(lat: number, lon: number) {
  const dist = this.camera.position.length()
  this.flight = {
    from: this.camera.position.clone(),
    to: latLonToVector3(lat, lon, 1).normalize().multiplyScalar(dist),
    start: -1, // stamped with elapsed time on the next update tick
  }
}
```

In `update(elapsedSeconds)` (after intro-sweep block, before sun/clouds):

```ts
if (this.flight) {
  if (this.flight.start < 0) this.flight.start = elapsedSeconds
  const t = (elapsedSeconds - this.flight.start) / 1.2
  if (t >= 1) {
    this.camera.position.copy(this.flight.to)
    this.flight = null
    this.controls.enabled = true
  } else {
    const ease = 1 - Math.pow(1 - t, 3)
    this.camera.position.lerpVectors(this.flight.from, this.flight.to, ease)
    this.controls.enabled = false
  }
  this.camera.lookAt(0, 0, 0)
}
```

And at the end of `update()`:

```ts
this.eventLayer.update(elapsedSeconds)
```

In `dispose()` (alongside satLayer disposal):

```ts
this.worldUnsub?.()
this.eventLayer.dispose()
```

(If the intro sweep also sets `controls.enabled`, order the flight block AFTER the sweep block so a flight during the intro is impossible to trigger anyway — focus requires a click.)

- [ ] **Step 3: Verification gate**

`pnpm exec tsc --noEmit` clean; `pnpm test` green; `pnpm e2e` 2/2 green.

- [ ] **Step 4: Commit**

```bash
git add src/engine/EventLayer.ts src/engine/GlobeEngine.ts
git commit -m "feat: animated world-event markers and camera fly-to"
```

---

### Task 5: EventsPanel + polling wire-up

**Files:**
- Create: `src/components/EventsPanel.tsx`
- Modify: `src/components/Hud.tsx`

**Interfaces:**
- Consumes: `useWorldStore`, `startEventPolling`.
- Produces: left-side EVENTS panel: LIVE/DEGRADED indicator, scrollable list (kind glyph, title, relative time), click focuses (toggles) the event and flies the camera. Polling starts on mount, stops on unmount.

- [ ] **Step 1: Build the panel**

Create `src/components/EventsPanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useWorldStore, startEventPolling } from '@/state/worldStore'
import type { EventKind } from '@/lib/worldEvents'

const GLYPH: Record<EventKind, { char: string; cls: string }> = {
  quake: { char: '◉', cls: 'text-[#ff5c49]' },
  wildfire: { char: '▲', cls: 'text-[#ffa14a]' },
  storm: { char: '◎', cls: 'text-[#9a7bff]' },
  launch: { char: '▶', cls: 'text-[#45d8ff]' },
}

function timeAgo(iso: string, now: number): string {
  const s = Math.round((now - Date.parse(iso)) / 1000)
  if (!Number.isFinite(s)) return ''
  if (s < 0) return `T-${Math.floor(-s / 3600)}h${Math.floor((-s % 3600) / 60)}m`
  if (s < 90) return `${s}s ago`
  if (s < 5400) return `${Math.round(s / 60)}m ago`
  if (s < 172800) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

export default function EventsPanel() {
  const events = useWorldStore((s) => s.events)
  const focusedId = useWorldStore((s) => s.focusedId)
  const sourcesOk = useWorldStore((s) => s.sourcesOk)
  const focusEvent = useWorldStore((s) => s.focusEvent)
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const clock = setInterval(() => setNow(Date.now()), 30_000)
    const stop = startEventPolling()
    return () => {
      clearInterval(clock)
      stop()
    }
  }, [])

  return (
    <aside className="pointer-events-auto fixed left-6 top-16 z-20 w-80 font-mono text-xs text-[var(--text)]">
      <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
        <h2 className="mb-2 flex items-center justify-between text-[10px] tracking-[0.35em] text-[var(--accent)]">
          <span>EVENTS</span>
          <span className={`flex items-center gap-1.5 ${sourcesOk ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${sourcesOk ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
            {sourcesOk ? 'LIVE' : 'DEGRADED'}
          </span>
        </h2>
        {events.length === 0 ? (
          <p className="py-4 text-center opacity-50">listening to the world…</p>
        ) : (
          <ul className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
            {events.map((ev) => {
              const g = GLYPH[ev.kind]
              const focused = ev.id === focusedId
              return (
                <li key={ev.id}>
                  <button
                    onClick={() => focusEvent(focused ? null : ev.id)}
                    className={`w-full rounded border px-2 py-1.5 text-left transition ${
                      focused ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-transparent hover:border-white/20'
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className={g.cls}>{g.char}</span>
                      <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                      <span className="shrink-0 tabular-nums opacity-50">
                        {now === null ? '' : timeAgo(ev.time, now)}
                      </span>
                    </span>
                    {ev.detail && <span className="mt-0.5 block truncate pl-5 opacity-50">{ev.detail}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </aside>
  )
}
```

- [ ] **Step 2: Mount in Hud.tsx** (next to `<FleetPanel />`):

```tsx
import EventsPanel from '@/components/EventsPanel'
```

```tsx
      <EventsPanel />
```

- [ ] **Step 3: Verification gate**

`tsc --noEmit`, `pnpm test`, `pnpm e2e` green. `pnpm dev`: EVENTS panel fills with real current world events (LIVE dot green); markers glow and animate on the globe (red quake ripples, orange embers, violet storm rings, cyan launch cones); clicking an event flies the camera to it and enlarges its marker.

- [ ] **Step 4: Commit**

```bash
git add src/components/EventsPanel.tsx src/components/Hud.tsx
git commit -m "feat: live events panel with focus fly-to"
```

---

### Task 6: E2E + docs

**Files:**
- Modify: `e2e/globe.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Append the events smoke test**

```ts
test('events panel shows live world events and focuses one', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('EVENTS')).toBeVisible()
  // Live feeds populate within the polling fetch; allow generous time.
  const firstEvent = page.locator('aside').filter({ hasText: 'EVENTS' }).locator('li button').first()
  await expect(firstEvent).toBeVisible({ timeout: 20_000 })
  await firstEvent.click()
  await expect(firstEvent).toHaveClass(/border-\[var\(--accent\)\]/)
})
```

- [ ] **Step 2: Run the gate** — `pnpm e2e`, expected 3 passed. (This test hits real external feeds through the route; if all sources are down it may show "listening to the world…" — in that unlikely case document it in the report rather than weakening the assertion.)

- [ ] **Step 3: README status line**

```markdown
**Status:** Plan 3 (living world — live USGS/EONET/launch events on the globe) complete.
```

- [ ] **Step 4: Full gate + commit**

```bash
pnpm test && pnpm e2e
git add e2e/globe.spec.ts README.md
git commit -m "test: events panel smoke coverage; README status"
```
