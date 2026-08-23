# HYPERION Plan 7A: Foundations of Play

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn HYPERION from a living-Earth instrument into a playable game: found an agency, accept contracts tied to real events, fly a burn to maneuver a satellite over the target (guided by a live closest-approach readout), complete the pass to earn funding + reputation, and spend to grow your fleet — with a founding front door and an in-game guide.

**Architecture:** Pure logic modules (geo inverse + great-circle, the intercept/closest-approach solver, economy rules) are TDD'd and framework-free. Two new localStorage-persisted zustand stores — `agencyStore` (identity + currencies) and `contractStore` (the contract state machine + completion evaluation) — bridge to the engine and React exactly like the existing stores. A `ContractLayer` in the Three.js engine draws the target ring + selected-satellite ground-track + predicted closest-approach marker and drives per-tick completion detection; React panels (Founding, Agency bar, Contracts, Guide, intercept readout) render from the stores.

**Tech Stack:** Existing (Next.js, Three.js, zustand, vitest, Playwright). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-23-hyperion-game-layer-design.md`

## Global Constraints

- Port **3100** only (never 3000). Kill stale servers with `lsof -ti:3100 | xargs kill -9`.
- Engine code (`src/engine/`) must not import React. React never touches Three objects — zustand stores bridge (`getState()`/`subscribe`; non-reactive hot fields are direct-mutated, never `set()`).
- Camera authority order in `GlobeEngine.update()` stays: intro sweep → event flight → burn chase (wins) → shake last. Contract legibility + completion run alongside, never seizing the camera.
- Distance unit: scene = Earth radii; `EARTH_RADIUS = 1`; `ER_KM = 6371`. Completion + intercept use **ground distance** (sub-satellite point → target, great-circle km), not 3D distance.
- `COMPLETION_RADIUS_KM = 500` (imaging swath; tuned generous for fair intercept).
- Persistence is client-side localStorage, degrading gracefully to a fresh session on failure — never crash gameplay.
- Respectful framing preserved: contracts derive from `/api/briefing` which already enforces observe/map/relay/monitor framing; the engine sets rules/economy, the LLM only proposes flavor.
- Gates stay green: `pnpm test`, `pnpm e2e`, `pnpm exec tsc --noEmit`. Commit prefixes `feat:`/`test:`/`fix:`/`chore:`.

---

### Task 1: Geo inverse + great-circle (TDD)

**Files:**
- Modify: `src/lib/geo.ts`
- Test: `src/lib/geo.test.ts` (append)

**Interfaces:**
- Consumes: `latLonToVector3`, `EARTH_RADIUS` (existing).
- Produces:
  - `ER_KM = 6371`
  - `vector3ToLatLon(v: THREE.Vector3): { lat: number; lon: number }` — inverse of `latLonToVector3` (lon in (−180, 180]).
  - `greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number` — haversine surface distance in km.

- [ ] **Step 1: Append failing tests**

Append to `src/lib/geo.test.ts`:

```ts
import { vector3ToLatLon, greatCircleKm, ER_KM } from './geo'

describe('vector3ToLatLon', () => {
  it('inverts latLonToVector3 across a spread of points', () => {
    for (const [lat, lon] of [[0, 0], [0, 90], [45, -120], [-33.9, 151.2], [66, 179]] as const) {
      const round = vector3ToLatLon(latLonToVector3(lat, lon))
      expect(round.lat).toBeCloseTo(lat, 4)
      expect(round.lon).toBeCloseTo(lon, 4)
    }
  })
  it('maps the north pole to lat 90', () => {
    expect(vector3ToLatLon(latLonToVector3(90, 0)).lat).toBeCloseTo(90, 4)
  })
})

describe('greatCircleKm', () => {
  it('is zero for identical points', () => {
    expect(greatCircleKm(40, -74, 40, -74)).toBeCloseTo(0, 6)
  })
  it('is ~half Earth circumference for antipodes', () => {
    const half = Math.PI * ER_KM
    expect(greatCircleKm(0, 0, 0, 180)).toBeCloseTo(half, 0)
  })
  it('matches a known city distance (NYC↔London ≈ 5570 km, ±40)', () => {
    const d = greatCircleKm(40.71, -74.01, 51.51, -0.13)
    expect(d).toBeGreaterThan(5530)
    expect(d).toBeLessThan(5610)
  })
})
```

- [ ] **Step 2: Run — RED** (`pnpm test`, cannot resolve new exports)

- [ ] **Step 3: Implement** — append to `src/lib/geo.ts`:

```ts
/** Earth radius in km (surface-distance conversions). */
export const ER_KM = 6371

/** Inverse of latLonToVector3. lon returned in (-180, 180]. */
export function vector3ToLatLon(v: Vector3): { lat: number; lon: number } {
  const n = v.clone().normalize()
  const lat = 90 - (Math.acos(Math.min(1, Math.max(-1, n.y))) * 180) / Math.PI
  let lon = 90 - (Math.atan2(n.z, n.x) * 180) / Math.PI
  if (lon > 180) lon -= 360
  if (lon <= -180) lon += 360
  return { lat, lon }
}

/** Haversine great-circle surface distance in km. */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * ER_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}
```

(Ensure `Vector3` is already imported at the top of `geo.ts` — it is; `latLonToVector3` uses it.)

- [ ] **Step 4: Run — GREEN** (`pnpm test`), `pnpm exec tsc --noEmit` clean

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo.ts src/lib/geo.test.ts
git commit -m "feat: geo inverse (vector3ToLatLon) and great-circle distance"
```

---

### Task 2: Intercept solver (TDD)

**Files:**
- Create: `src/lib/intercept.ts`
- Test: `src/lib/intercept.test.ts`

**Interfaces:**
- Consumes: `propagate`, `sceneFromEci` (orbits), `vector3ToLatLon`, `greatCircleKm` (geo).
- Produces:
  - `COMPLETION_RADIUS_KM = 500`
  - `interface GeoTarget { lat: number; lon: number }`
  - `subPoint(el: OrbitalElements, t: number): { lat: number; lon: number }` — sub-satellite ground point at sim time `t`.
  - `groundDistanceKm(el: OrbitalElements, t: number, target: GeoTarget): number`
  - `closestApproach(el: OrbitalElements, target: GeoTarget, fromT: number, windowSec: number, stepSec?: number): { closestKm: number; etaSec: number }` — minimum ground distance over `[fromT, fromT+windowSec]` and the offset (seconds from `fromT`) at which it occurs. Default `stepSec` gives ≥ ~300 samples.

- [ ] **Step 1: Write failing tests**

Create `src/lib/intercept.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { subPoint, groundDistanceKm, closestApproach, COMPLETION_RADIUS_KM } from './intercept'
import { orbitalPeriod, type OrbitalElements } from './orbits'

const deg = (d: number) => (d * Math.PI) / 180
const iss: OrbitalElements = { a: (6371 + 420) / 6371, e: 0.0012, i: deg(51.6), raan: 0.8, argp: 0.3, m0: 0, epoch: 0 }

describe('subPoint', () => {
  it('stays within the inclination band in latitude', () => {
    const T = orbitalPeriod(iss.a)
    for (let k = 0; k < 60; k++) {
      const { lat } = subPoint(iss, (k / 60) * T)
      expect(Math.abs(lat)).toBeLessThanOrEqual(51.6 + 1)
    }
  })
})

describe('groundDistanceKm', () => {
  it('is zero when the target IS the current sub-point', () => {
    const sp = subPoint(iss, 1234)
    expect(groundDistanceKm(iss, 1234, sp)).toBeCloseTo(0, 3)
  })
})

describe('closestApproach', () => {
  it('finds a near-zero closest approach for a target on the ground-track', () => {
    // A point the satellite is directly over at t=5000 must be reachable within ~0 km near that time.
    const target = subPoint(iss, 5000)
    const T = orbitalPeriod(iss.a)
    const { closestKm } = closestApproach(iss, target, 5000 - T, 2 * T)
    expect(closestKm).toBeLessThan(50)
  })
  it('reports a large closest approach for an off-track target (a pole for a 51.6° orbit)', () => {
    const T = orbitalPeriod(iss.a)
    const { closestKm } = closestApproach(iss, { lat: 90, lon: 0 }, 0, 2 * T)
    expect(closestKm).toBeGreaterThan(COMPLETION_RADIUS_KM)
  })
  it('etaSec lands inside the window', () => {
    const target = subPoint(iss, 3000)
    const { etaSec } = closestApproach(iss, target, 0, 6000)
    expect(etaSec).toBeGreaterThanOrEqual(0)
    expect(etaSec).toBeLessThanOrEqual(6000)
  })
})
```

- [ ] **Step 2: Run — RED** (`pnpm test`)

- [ ] **Step 3: Implement** — create `src/lib/intercept.ts`:

```ts
import { propagate, sceneFromEci, type OrbitalElements } from './orbits'
import { vector3ToLatLon, greatCircleKm } from './geo'

/** Imaging swath: a pass within this ground distance of the target completes a contract. */
export const COMPLETION_RADIUS_KM = 500

export interface GeoTarget {
  lat: number
  lon: number
}

/** Ground point directly beneath the satellite at sim time t. */
export function subPoint(el: OrbitalElements, t: number): { lat: number; lon: number } {
  const scene = sceneFromEci(propagate(el, t).position)
  return vector3ToLatLon(scene)
}

/** Great-circle km from the satellite's sub-point to the target at time t. */
export function groundDistanceKm(el: OrbitalElements, t: number, target: GeoTarget): number {
  const sp = subPoint(el, t)
  return greatCircleKm(sp.lat, sp.lon, target.lat, target.lon)
}

/** Minimum ground distance to the target over [fromT, fromT+windowSec] and the offset where it occurs. */
export function closestApproach(
  el: OrbitalElements,
  target: GeoTarget,
  fromT: number,
  windowSec: number,
  stepSec = Math.max(5, windowSec / 400),
): { closestKm: number; etaSec: number } {
  let closestKm = Infinity
  let etaSec = 0
  for (let t = fromT; t <= fromT + windowSec; t += stepSec) {
    const d = groundDistanceKm(el, t, target)
    if (d < closestKm) {
      closestKm = d
      etaSec = t - fromT
    }
  }
  return { closestKm, etaSec }
}
```

- [ ] **Step 4: Run — GREEN**, tsc clean

- [ ] **Step 5: Commit**

```bash
git add src/lib/intercept.ts src/lib/intercept.test.ts
git commit -m "feat: intercept solver (sub-point, ground distance, closest approach)"
```

---

### Task 3: Economy rules (TDD)

**Files:**
- Create: `src/lib/economy.ts`
- Test: `src/lib/economy.test.ts`

**Interfaces:**
- Produces (all pure):
  - `STARTING_FUNDING = 500`, `STARTING_REPUTATION = 0`, `SATELLITE_PRICE = 800`
  - `refuelPrice(missingMs: number): number` — funding to restore `missingMs` m/s of Δv (`ceil(missingMs * 0.6)`).
  - `rankTitle(reputation: number): string` — one of a fixed ladder.
  - `maxActiveContracts(reputation: number): number` — `min(5, 1 + floor(reputation / 60))`.
  - `contractReward(severity: number): { funding: number; reputation: number }` — funding `120 + round(severity*380)`, reputation `8 + round(severity*22)`.
  - `contractDeadline(simNow: number, periodSec: number): number` — `simNow + 3 * periodSec` (three orbits to intercept).

- [ ] **Step 1: Write failing tests**

Create `src/lib/economy.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  STARTING_FUNDING, SATELLITE_PRICE, refuelPrice, rankTitle,
  maxActiveContracts, contractReward, contractDeadline,
} from './economy'

describe('economy', () => {
  it('has sane starting constants', () => {
    expect(STARTING_FUNDING).toBe(500)
    expect(SATELLITE_PRICE).toBe(800)
  })
  it('refuelPrice scales with missing dv', () => {
    expect(refuelPrice(0)).toBe(0)
    expect(refuelPrice(100)).toBe(60)
  })
  it('rankTitle climbs with reputation', () => {
    expect(rankTitle(0)).not.toBe(rankTitle(500))
    expect(typeof rankTitle(120)).toBe('string')
  })
  it('maxActiveContracts grows and caps at 5', () => {
    expect(maxActiveContracts(0)).toBe(1)
    expect(maxActiveContracts(60)).toBe(2)
    expect(maxActiveContracts(10000)).toBe(5)
  })
  it('contractReward increases with severity', () => {
    expect(contractReward(1).funding).toBeGreaterThan(contractReward(0).funding)
    expect(contractReward(0).funding).toBe(120)
  })
  it('contractDeadline is three periods out', () => {
    expect(contractDeadline(1000, 5400)).toBe(1000 + 3 * 5400)
  })
})
```

- [ ] **Step 2: Run — RED**

- [ ] **Step 3: Implement** — create `src/lib/economy.ts`:

```ts
export const STARTING_FUNDING = 500
export const STARTING_REPUTATION = 0
export const SATELLITE_PRICE = 800

/** Funding to restore `missingMs` m/s of delta-v. */
export function refuelPrice(missingMs: number): number {
  return Math.ceil(Math.max(0, missingMs) * 0.6)
}

const RANKS = ['Startup Outfit', 'Registered Operator', 'Established Agency', 'Trusted Partner', 'Orbital Authority']

export function rankTitle(reputation: number): string {
  const idx = Math.min(RANKS.length - 1, Math.floor(Math.max(0, reputation) / 120))
  return RANKS[idx]
}

/** How many contracts may be active at once, grows with reputation, capped at 5. */
export function maxActiveContracts(reputation: number): number {
  return Math.min(5, 1 + Math.floor(Math.max(0, reputation) / 60))
}

/** Reward for a contract, scaled by the source event's severity (0..1). */
export function contractReward(severity: number): { funding: number; reputation: number } {
  const s = Math.min(1, Math.max(0, severity))
  return { funding: 120 + Math.round(s * 380), reputation: 8 + Math.round(s * 22) }
}

/** Deadline three orbital periods after now (enough for a phasing/steering intercept). */
export function contractDeadline(simNow: number, periodSec: number): number {
  return simNow + 3 * periodSec
}
```

- [ ] **Step 4: Run — GREEN**, tsc clean

- [ ] **Step 5: Commit**

```bash
git add src/lib/economy.ts src/lib/economy.test.ts
git commit -m "feat: economy rules (rewards, refuel price, ranks, active caps)"
```

---

### Task 4: Persistence helper + Agency store (TDD)

**Files:**
- Create: `src/lib/persist.ts`
- Create: `src/state/agencyStore.ts`
- Test: `src/state/agencyStore.test.ts`

**Interfaces:**
- Produces:
  - `persist.ts`: `loadJSON<T>(key: string, fallback: T): T`, `saveJSON(key: string, value: unknown): void`, `clearKey(key: string): void` — localStorage with an in-memory fallback (works in node tests / SSR).
  - `useAgencyStore` (zustand): state `{ founded: boolean; name: string; emblemId: string; colorway: string; funding: number; reputation: number }`; actions `found(name, emblemId, colorway): void`, `addFunding(n): void`, `spendFunding(n): boolean`, `addReputation(n): void`, `resetForTest(): void`. Persisted under `hyperion-agency-v1`.

- [ ] **Step 1: Write failing tests**

Create `src/state/agencyStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useAgencyStore } from './agencyStore'
import { STARTING_FUNDING } from '@/lib/economy'

beforeEach(() => useAgencyStore.getState().resetForTest())

describe('agencyStore', () => {
  it('starts un-founded with starting funding', () => {
    const s = useAgencyStore.getState()
    expect(s.founded).toBe(false)
    expect(s.funding).toBe(STARTING_FUNDING)
  })
  it('found() stamps identity and marks founded', () => {
    useAgencyStore.getState().found('Aegis Orbital', 'crest-eye', '#45d8ff')
    const s = useAgencyStore.getState()
    expect(s.founded).toBe(true)
    expect(s.name).toBe('Aegis Orbital')
    expect(s.emblemId).toBe('crest-eye')
    expect(s.colorway).toBe('#45d8ff')
  })
  it('spendFunding deducts when affordable, refuses otherwise', () => {
    expect(useAgencyStore.getState().spendFunding(100)).toBe(true)
    expect(useAgencyStore.getState().funding).toBe(STARTING_FUNDING - 100)
    expect(useAgencyStore.getState().spendFunding(9_999_999)).toBe(false)
  })
  it('reputation never goes below zero', () => {
    useAgencyStore.getState().addReputation(-50)
    expect(useAgencyStore.getState().reputation).toBe(0)
  })
})
```

- [ ] **Step 2: Run — RED**

- [ ] **Step 3: Implement persist helper** — create `src/lib/persist.ts`:

```ts
const memory = new Map<string, string>()

const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof window !== 'undefined' && window.localStorage
    ? window.localStorage
    : {
        getItem: (k) => memory.get(k) ?? null,
        setItem: (k, v) => void memory.set(k, v),
        removeItem: (k) => void memory.delete(k),
      }

/** Load a JSON blob merged over a fallback; returns fallback on any error. */
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) }
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable — persistence is best-effort, never crash gameplay
  }
}

export function clearKey(key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // ignore
  }
}
```

- [ ] **Step 4: Implement agency store** — create `src/state/agencyStore.ts`:

```ts
import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import { STARTING_FUNDING, STARTING_REPUTATION } from '@/lib/economy'

const KEY = 'hyperion-agency-v1'

interface Persisted {
  founded: boolean
  name: string
  emblemId: string
  colorway: string
  funding: number
  reputation: number
}

const DEFAULTS: Persisted = {
  founded: false,
  name: '',
  emblemId: 'crest-rings',
  colorway: '#45d8ff',
  funding: STARTING_FUNDING,
  reputation: STARTING_REPUTATION,
}

interface AgencyState extends Persisted {
  found(name: string, emblemId: string, colorway: string): void
  addFunding(n: number): void
  spendFunding(n: number): boolean
  addReputation(n: number): void
  resetForTest(): void
}

function persistOf(s: AgencyState): Persisted {
  return {
    founded: s.founded, name: s.name, emblemId: s.emblemId,
    colorway: s.colorway, funding: s.funding, reputation: s.reputation,
  }
}

export const useAgencyStore = create<AgencyState>((set, get) => ({
  ...loadJSON<Persisted>(KEY, DEFAULTS),

  found: (name, emblemId, colorway) => {
    set({ founded: true, name: name.trim() || 'Unnamed Agency', emblemId, colorway })
    saveJSON(KEY, persistOf(get()))
  },

  addFunding: (n) => {
    set((s) => ({ funding: s.funding + n }))
    saveJSON(KEY, persistOf(get()))
  },

  spendFunding: (n) => {
    if (n > get().funding) return false
    set((s) => ({ funding: s.funding - n }))
    saveJSON(KEY, persistOf(get()))
    return true
  },

  addReputation: (n) => {
    set((s) => ({ reputation: Math.max(0, s.reputation + n) }))
    saveJSON(KEY, persistOf(get()))
  },

  resetForTest: () => {
    clearKey(KEY)
    set({ ...DEFAULTS })
  },
}))
```

- [ ] **Step 5: Run — GREEN**, tsc clean

- [ ] **Step 6: Commit**

```bash
git add src/lib/persist.ts src/state/agencyStore.ts src/state/agencyStore.test.ts
git commit -m "feat: localStorage persist helper and agency store (identity + currencies)"
```

---

### Task 5: Fleet economy — bigger tanks, refuel, buy satellite (TDD) + fix burn e2e

**Files:**
- Modify: `src/state/gameStore.ts`
- Test: `src/state/gameStore.test.ts` (append)
- Modify: `e2e/globe.spec.ts` (fuel assertions only)

**Interfaces:**
- Consumes: `refuelPrice`, `SATELLITE_PRICE` (economy), `useAgencyStore` (funding).
- Produces on `gameStore`:
  - Bigger tanks in `seedFleet`: HYPERION-1 `fuel/cap 1800`, HYPERION-2 `fuel/cap 1500` (affordable plane-steering).
  - `refuelSatellite(id: string): boolean` — cost `refuelPrice(cap - fuel)`; if agency can pay, refill to cap, spend funding; else false.
  - `buySatellite(): boolean` — cost `SATELLITE_PRICE`; if payable, append a new satellite (name `HYPERION-N`, a fresh LEO orbit, full tank 1500) and spend funding; else false.

- [ ] **Step 1: Append failing tests**

Append to `src/state/gameStore.test.ts`:

```ts
import { useAgencyStore } from './agencyStore'
import { SATELLITE_PRICE } from '@/lib/economy'

describe('fleet economy', () => {
  beforeEach(() => {
    useGameStore.getState().resetForTest()
    useAgencyStore.getState().resetForTest()
  })

  it('seed fleet has the larger tanks', () => {
    const [a, b] = useGameStore.getState().satellites
    expect(a.fuelCapacity).toBe(1800)
    expect(b.fuelCapacity).toBe(1500)
  })

  it('refuelSatellite refills to capacity and charges funding', () => {
    const g = useGameStore.getState()
    const id = g.satellites[0].id
    // drain via a burn
    g.select(id); g.setBurnPlan({ prograde: 100 }); useGameStore.getState().executeBurn(0)
    const before = useAgencyStore.getState().funding
    expect(useGameStore.getState().refuelSatellite(id)).toBe(true)
    expect(useGameStore.getState().satellites[0].fuel).toBe(1800)
    expect(useAgencyStore.getState().funding).toBeLessThan(before)
  })

  it('refuel fails with insufficient funding', () => {
    const g = useGameStore.getState()
    const id = g.satellites[0].id
    g.select(id); g.setBurnPlan({ prograde: 100 }); useGameStore.getState().executeBurn(0)
    useAgencyStore.setState({ funding: 0 })
    expect(useGameStore.getState().refuelSatellite(id)).toBe(false)
  })

  it('buySatellite appends a bird and charges the price', () => {
    useAgencyStore.setState({ funding: SATELLITE_PRICE + 10 })
    const n = useGameStore.getState().satellites.length
    expect(useGameStore.getState().buySatellite()).toBe(true)
    expect(useGameStore.getState().satellites.length).toBe(n + 1)
    expect(useAgencyStore.getState().funding).toBe(10)
  })

  it('buySatellite refuses when broke', () => {
    useAgencyStore.setState({ funding: 0 })
    expect(useGameStore.getState().buySatellite()).toBe(false)
  })
})
```

- [ ] **Step 2: Run — RED**

- [ ] **Step 3: Implement** — in `src/state/gameStore.ts`:

Add imports near the top:

```ts
import { refuelPrice, SATELLITE_PRICE } from '@/lib/economy'
import { useAgencyStore } from '@/state/agencyStore'
```

Update `seedFleet` fuel values to the larger tanks:

```ts
function seedFleet(): Satellite[] {
  return [
    {
      id: 'hyp-1',
      name: 'HYPERION-1',
      elements: { a: (6371 + 420) / 6371, e: 0.0012, i: deg(51.6), raan: 0.8, argp: 0.3, m0: 0, epoch: 0 },
      fuel: 1800, fuelCapacity: 1800,
    },
    {
      id: 'hyp-2',
      name: 'HYPERION-2',
      elements: { a: (6371 + 780) / 6371, e: 0.002, i: deg(97.5), raan: 2.4, argp: 1.1, m0: 2.0, epoch: 0 },
      fuel: 1500, fuelCapacity: 1500,
    },
  ]
}
```

Add `refuelSatellite` and `buySatellite` to the `GameState` interface:

```ts
  refuelSatellite(id: string): boolean
  buySatellite(): boolean
```

Add the implementations inside the store creator (after `abortBurn`):

```ts
  refuelSatellite: (id) => {
    const sat = get().satellites.find((s) => s.id === id)
    if (!sat) return false
    const missing = sat.fuelCapacity - sat.fuel
    if (missing <= 0) return false
    const price = refuelPrice(missing)
    if (!useAgencyStore.getState().spendFunding(price)) return false
    set((s) => ({
      satellites: s.satellites.map((x) => (x.id === id ? { ...x, fuel: x.fuelCapacity } : x)),
    }))
    return true
  },

  buySatellite: () => {
    if (!useAgencyStore.getState().spendFunding(SATELLITE_PRICE)) return false
    const n = get().satellites.length + 1
    // Fresh LEO orbit; RAAN/argp offset per index so new coverage differs from existing planes.
    const sat: Satellite = {
      id: `hyp-${n}-${Math.round(get().previewAt ?? 0)}`,
      name: `HYPERION-${n}`,
      elements: {
        a: (6371 + 500 + n * 40) / 6371, e: 0.001, i: deg(63 + n * 5),
        raan: (0.6 * n) % (Math.PI * 2), argp: (0.4 * n) % (Math.PI * 2), m0: (1.1 * n) % (Math.PI * 2), epoch: 0,
      },
      fuel: 1500, fuelCapacity: 1500,
    }
    set((s) => ({ satellites: [...s.satellites, sat] }))
    return true
  },
```

> Note: `id` must be stable across renders; `previewAt` (a sim-time-ish number) plus the index gives a unique-enough id without `Math.random`. Because `Math.random`/`Date.now` are fine in app runtime (only workflow scripts forbid them), you may instead use `Date.now()` — but the above avoids it for determinism in tests.

**Fleet persistence** (spec §11 — the fleet must survive reload, or buy/refuel would spend funding while resetting the fleet). Add to the top imports:

```ts
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
```

Add a key constant near the other module constants:

```ts
const FLEET_KEY = 'hyperion-fleet-v1'
```

Change the store's initial `satellites: seedFleet(),` to load a persisted fleet, falling back to the seed:

```ts
  satellites: loadJSON<{ satellites: Satellite[] }>(FLEET_KEY, { satellites: seedFleet() }).satellites,
```

Persist after every fleet mutation: add `saveJSON(FLEET_KEY, { satellites: get().satellites })` immediately before `return true` in **`executeBurn`**, **`completeBurn`**, **`refuelSatellite`**, and **`buySatellite`**. In **`resetForTest`**, add `clearKey(FLEET_KEY)` before the existing `set(...)` call. (`loadJSON` merges over the fallback, so 7B can add `serviceRecord` fields to `Satellite` later without breaking existing saves.)

- [ ] **Step 4: Run — GREEN** (`pnpm test`), tsc clean

- [ ] **Step 5: Fix the existing burn e2e fuel assertions**

The IGNITE-flow test in `e2e/globe.spec.ts` asserts `/Δv 4[0-3][0-9]\/450 m\/s/` after a ~100 m/s burn. With the 1800 tank, capacity and remaining change. Find that assertion and replace it with a tank-agnostic check that fuel dropped below full:

```ts
  // Fuel was spent (started at 1800/1800).
  await expect(page.getByText(/Δv 1[0-7][0-9][0-9]\/1800 m\/s/)).toBeVisible()
```

Also update any assertion that reads `450/450` for HYPERION-1 to `1800/1800`, and `380/380` for HYPERION-2 to `1500/1500`.

- [ ] **Step 6: Run e2e** — `lsof -ti:3100 | xargs kill -9`, then `pnpm e2e`. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/state/gameStore.ts src/state/gameStore.test.ts e2e/globe.spec.ts
git commit -m "feat: bigger tanks, refuel + buy-satellite economy actions"
```

---

### Task 6: Contract store + evaluation (TDD)

**Files:**
- Create: `src/state/contractStore.ts`
- Test: `src/state/contractStore.test.ts`

**Interfaces:**
- Consumes: `useAgencyStore` (rewards/penalty), `useGameStore` `Satellite` type, `groundDistanceKm` + `COMPLETION_RADIUS_KM` (intercept), `maxActiveContracts` (economy).
- Produces:
  - `type ContractStatus = 'available' | 'active' | 'completed' | 'failed'`
  - `interface Contract { id: string; eventId: string; title: string; kind: string; lat: number; lon: number; deadline: number; reward: { funding: number; reputation: number }; status: ContractStatus }`
  - `useContractStore` (zustand, persisted `hyperion-contracts-v1`): state `{ contracts: Contract[]; targetId: string | null }`; actions:
    - `setAvailable(next: Contract[]): void` — adds any new-by-id available contracts, leaves existing (accepted/completed) untouched.
    - `accept(id: string): boolean` — available → active if under `maxActiveContracts(reputation)`.
    - `setTarget(id: string | null): void` — which contract the intercept UI/globe focuses.
    - `evaluate(satellites: Satellite[], simTime: number): { completed: Contract[]; failed: Contract[] }` — for each active contract: complete if any satellite's sub-point is within `COMPLETION_RADIUS_KM` (reward → agency); fail if `simTime > deadline` (small reputation ding). Mutates state, returns the transitions for juice.
    - `resetForTest(): void`

- [ ] **Step 1: Write failing tests**

Create `src/state/contractStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useContractStore, type Contract } from './contractStore'
import { useAgencyStore } from './agencyStore'
import { useGameStore } from './gameStore'
import { subPoint } from '@/lib/intercept'

const mk = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', eventId: 'e1', title: 'Test', kind: 'quake', lat: 0, lon: 0,
  deadline: 1_000_000, reward: { funding: 200, reputation: 10 }, status: 'available', ...over,
})

beforeEach(() => {
  useContractStore.getState().resetForTest()
  useAgencyStore.getState().resetForTest()
  useGameStore.getState().resetForTest()
})

describe('contractStore', () => {
  it('setAvailable adds new contracts without clobbering existing status', () => {
    useContractStore.getState().setAvailable([mk()])
    useContractStore.getState().accept('c1')
    useContractStore.getState().setAvailable([mk(), mk({ id: 'c2' })])
    const cs = useContractStore.getState().contracts
    expect(cs.find((c) => c.id === 'c1')!.status).toBe('active') // not reset to available
    expect(cs.find((c) => c.id === 'c2')!.status).toBe('available')
  })

  it('accept respects the active cap', () => {
    // reputation 0 → cap 1
    useContractStore.getState().setAvailable([mk(), mk({ id: 'c2' })])
    expect(useContractStore.getState().accept('c1')).toBe(true)
    expect(useContractStore.getState().accept('c2')).toBe(false)
  })

  it('evaluate completes a contract whose target is under a satellite, and rewards the agency', () => {
    const sat = useGameStore.getState().satellites[0]
    const sp = subPoint(sat.elements, 5000) // a point the sat is directly over at t=5000
    useContractStore.getState().setAvailable([mk({ lat: sp.lat, lon: sp.lon })])
    useContractStore.getState().accept('c1')
    const beforeFunding = useAgencyStore.getState().funding
    const { completed } = useContractStore.getState().evaluate(useGameStore.getState().satellites, 5000)
    expect(completed).toHaveLength(1)
    expect(useContractStore.getState().contracts[0].status).toBe('completed')
    expect(useAgencyStore.getState().funding).toBe(beforeFunding + 200)
  })

  it('evaluate fails a contract past its deadline', () => {
    useContractStore.getState().setAvailable([mk({ lat: 90, lon: 0, deadline: 10 })])
    useContractStore.getState().accept('c1')
    const { failed } = useContractStore.getState().evaluate(useGameStore.getState().satellites, 999)
    expect(failed).toHaveLength(1)
    expect(useContractStore.getState().contracts[0].status).toBe('failed')
  })
})
```

- [ ] **Step 2: Run — RED**

- [ ] **Step 3: Implement** — create `src/state/contractStore.ts`:

```ts
import { create } from 'zustand'
import { loadJSON, saveJSON, clearKey } from '@/lib/persist'
import { useAgencyStore } from '@/state/agencyStore'
import { maxActiveContracts } from '@/lib/economy'
import { groundDistanceKm, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import type { Satellite } from '@/state/gameStore'

const KEY = 'hyperion-contracts-v1'

export type ContractStatus = 'available' | 'active' | 'completed' | 'failed'

export interface Contract {
  id: string
  eventId: string
  title: string
  kind: string
  lat: number
  lon: number
  /** sim-time seconds */
  deadline: number
  reward: { funding: number; reputation: number }
  status: ContractStatus
}

interface Persisted {
  contracts: Contract[]
  targetId: string | null
}

const DEFAULTS: Persisted = { contracts: [], targetId: null }

interface ContractState extends Persisted {
  setAvailable(next: Contract[]): void
  accept(id: string): boolean
  setTarget(id: string | null): void
  evaluate(satellites: Satellite[], simTime: number): { completed: Contract[]; failed: Contract[] }
  resetForTest(): void
}

function save(get: () => ContractState) {
  const s = get()
  saveJSON(KEY, { contracts: s.contracts, targetId: s.targetId })
}

export const useContractStore = create<ContractState>((set, get) => ({
  ...loadJSON<Persisted>(KEY, DEFAULTS),

  setAvailable: (next) => {
    const existing = new Set(get().contracts.map((c) => c.id))
    const fresh = next.filter((c) => !existing.has(c.id)).map((c) => ({ ...c, status: 'available' as const }))
    if (fresh.length === 0) return
    set((s) => ({ contracts: [...s.contracts, ...fresh] }))
    save(get)
  },

  accept: (id) => {
    const s = get()
    const c = s.contracts.find((x) => x.id === id)
    if (!c || c.status !== 'available') return false
    const activeCount = s.contracts.filter((x) => x.status === 'active').length
    if (activeCount >= maxActiveContracts(useAgencyStore.getState().reputation)) return false
    set((st) => ({
      contracts: st.contracts.map((x) => (x.id === id ? { ...x, status: 'active' as const } : x)),
      targetId: id,
    }))
    save(get)
    return true
  },

  setTarget: (id) => {
    set({ targetId: id })
    save(get)
  },

  evaluate: (satellites, simTime) => {
    const completed: Contract[] = []
    const failed: Contract[] = []
    const agency = useAgencyStore.getState()

    const contracts = get().contracts.map((c) => {
      if (c.status !== 'active') return c
      // Completion: any satellite's sub-point within the imaging radius right now.
      const hit = satellites.some(
        (sat) => groundDistanceKm(sat.elements, simTime, { lat: c.lat, lon: c.lon }) <= COMPLETION_RADIUS_KM,
      )
      if (hit) {
        agency.addFunding(c.reward.funding)
        agency.addReputation(c.reward.reputation)
        const done = { ...c, status: 'completed' as const }
        completed.push(done)
        return done
      }
      if (simTime > c.deadline) {
        agency.addReputation(-5)
        const bad = { ...c, status: 'failed' as const }
        failed.push(bad)
        return bad
      }
      return c
    })

    if (completed.length || failed.length) {
      set({ contracts })
      save(get)
    }
    return { completed, failed }
  },

  resetForTest: () => {
    clearKey(KEY)
    set({ ...DEFAULTS })
  },
}))
```

- [ ] **Step 4: Run — GREEN**, tsc clean

- [ ] **Step 5: Commit**

```bash
git add src/state/contractStore.ts src/state/contractStore.test.ts
git commit -m "feat: contract store with accept/evaluate state machine and rewards"
```

---

### Task 7: Contracts from briefing (TDD) + seed + wiring

**Files:**
- Create: `src/lib/contractsFromBriefing.ts`
- Test: `src/lib/contractsFromBriefing.test.ts`
- Modify: `src/components/BriefingPanel.tsx`

**Interfaces:**
- Consumes: `Contract` type, `contractReward` + `contractDeadline` (economy), `orbitalPeriod` (orbits), `WorldEvent` (worldEvents).
- Produces:
  - `interface BriefingMission { title: string; eventId: string; objective: string }`
  - `contractsFromBriefing(missions: BriefingMission[], events: WorldEvent[], simNow: number, periodSec: number): Contract[]` — one contract per mission whose `eventId` matches a provided event; reward from event severity, deadline three periods out. Skips missions without a matching event.
  - `seedContracts(events: WorldEvent[], simNow: number, periodSec: number): Contract[]` — a deterministic 2-contract fallback from the two highest-severity events, so the board is never empty.

- [ ] **Step 1: Write failing tests**

Create `src/lib/contractsFromBriefing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { contractsFromBriefing, seedContracts } from './contractsFromBriefing'
import type { WorldEvent } from './worldEvents'

const ev = (id: string, severity = 0.5): WorldEvent => ({
  id, kind: 'quake', title: `Event ${id}`, lat: 10, lon: 20, time: '2026-08-23T00:00:00Z', severity,
})

describe('contractsFromBriefing', () => {
  it('builds a contract per mission with a matching event', () => {
    const cs = contractsFromBriefing(
      [{ title: 'Survey', eventId: 'a', objective: '...' }, { title: 'Nope', eventId: 'zzz', objective: '...' }],
      [ev('a')],
      1000, 5400,
    )
    expect(cs).toHaveLength(1)
    expect(cs[0].eventId).toBe('a')
    expect(cs[0].lat).toBe(10)
    expect(cs[0].deadline).toBe(1000 + 3 * 5400)
    expect(cs[0].reward.funding).toBeGreaterThan(0)
    expect(cs[0].status).toBe('available')
  })
})

describe('seedContracts', () => {
  it('returns up to two contracts from the highest-severity events', () => {
    const cs = seedContracts([ev('a', 0.2), ev('b', 0.9), ev('c', 0.5)], 0, 5400)
    expect(cs).toHaveLength(2)
    expect(cs[0].eventId).toBe('b') // highest severity first
  })
  it('is empty when there are no events', () => {
    expect(seedContracts([], 0, 5400)).toEqual([])
  })
})
```

- [ ] **Step 2: Run — RED**

- [ ] **Step 3: Implement** — create `src/lib/contractsFromBriefing.ts`:

```ts
import type { Contract } from '@/state/contractStore'
import type { WorldEvent } from '@/lib/worldEvents'
import { contractReward, contractDeadline } from '@/lib/economy'

export interface BriefingMission {
  title: string
  eventId: string
  objective: string
}

function contractForEvent(title: string, ev: WorldEvent, simNow: number, periodSec: number): Contract {
  return {
    id: `contract-${ev.id}`,
    eventId: ev.id,
    title,
    kind: ev.kind,
    lat: ev.lat,
    lon: ev.lon,
    deadline: contractDeadline(simNow, periodSec),
    reward: contractReward(ev.severity),
    status: 'available',
  }
}

/** One contract per briefing mission that references a known event. */
export function contractsFromBriefing(
  missions: BriefingMission[],
  events: WorldEvent[],
  simNow: number,
  periodSec: number,
): Contract[] {
  const byId = new Map(events.map((e) => [e.id, e]))
  const out: Contract[] = []
  for (const m of missions) {
    const ev = byId.get(m.eventId)
    if (ev) out.push(contractForEvent(m.title, ev, simNow, periodSec))
  }
  return out
}

/** Deterministic fallback so the board is never empty: top-2 events by severity. */
export function seedContracts(events: WorldEvent[], simNow: number, periodSec: number): Contract[] {
  return [...events]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 2)
    .map((ev) => contractForEvent(`Priority Watch — ${ev.title}`, ev, simNow, periodSec))
}
```

- [ ] **Step 4: Run — GREEN**, tsc clean

- [ ] **Step 5: Wire into BriefingPanel** — in `src/components/BriefingPanel.tsx`, after the briefing response is received, feed contracts into the store. Add imports:

```tsx
import { useContractStore } from '@/state/contractStore'
import { contractsFromBriefing, seedContracts } from '@/lib/contractsFromBriefing'
import { orbitalPeriod } from '@/lib/orbits'
import { useGameStore } from '@/state/gameStore'
```

Inside the `.then((data) => { ... })` handler that sets the briefing (where `audio.chirp()` fires), also register contracts:

```tsx
        const now = simNow()
        const period = orbitalPeriod(useGameStore.getState().satellites[0].elements.a)
        const fromAI = contractsFromBriefing(data.briefing.missions, events, now, period)
        const contracts = fromAI.length ? fromAI : seedContracts(events, now, period)
        useContractStore.getState().setAvailable(contracts)
```

(`simNow` and `events` are already in scope in BriefingPanel; if `simNow` is not imported there, add `import { simNow } from '@/lib/simTime'`.)

- [ ] **Step 6: Run gate** — `pnpm test`, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/contractsFromBriefing.ts src/lib/contractsFromBriefing.test.ts src/components/BriefingPanel.tsx
git commit -m "feat: derive contracts from AI briefing missions with deterministic seed"
```

---

### Task 8: Emblems + Founding screen

**Files:**
- Create: `src/components/Emblem.tsx`
- Create: `src/components/FoundingScreen.tsx`
- Modify: `src/components/Hud.tsx`

**Interfaces:**
- Consumes: `useAgencyStore` (`founded`, `found`), `audio` (stinger).
- Produces:
  - `EMBLEMS: { id: string; label: string }[]` and `COLORWAYS: string[]`.
  - `<Emblem id={string} color={string} size={number} />` — a procedural SVG crest.
  - `<FoundingScreen />` — full-screen founding overlay shown only when `!founded`; on FOUND calls `found(name, emblemId, colorway)`.

- [ ] **Step 1: Build the emblem library** — create `src/components/Emblem.tsx`:

```tsx
export const COLORWAYS = ['#45d8ff', '#ff5c49', '#ffa14a', '#9a7bff', '#4ade80', '#e6edf3']

export const EMBLEMS: { id: string; label: string }[] = [
  { id: 'crest-rings', label: 'Orbit' },
  { id: 'crest-eye', label: 'Watch' },
  { id: 'crest-delta', label: 'Vector' },
  { id: 'crest-star', label: 'Polaris' },
  { id: 'crest-shield', label: 'Aegis' },
  { id: 'crest-compass', label: 'Azimuth' },
]

/** Procedural SVG crest. Stroke uses the agency colorway; fill stays dark. */
export function Emblem({ id, color, size = 64 }: { id: string; color: string; size?: number }) {
  const common = { fill: 'none', stroke: color, strokeWidth: 3, strokeLinecap: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={id}>
      <circle cx="50" cy="50" r="46" fill="#030509" stroke={color} strokeWidth="1.5" opacity="0.9" />
      {id === 'crest-rings' && (
        <g {...common}>
          <ellipse cx="50" cy="50" rx="34" ry="14" />
          <ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(60 50 50)" />
          <ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(120 50 50)" />
          <circle cx="50" cy="50" r="5" fill={color} />
        </g>
      )}
      {id === 'crest-eye' && (
        <g {...common}>
          <path d="M18 50 Q50 24 82 50 Q50 76 18 50 Z" />
          <circle cx="50" cy="50" r="10" />
          <circle cx="50" cy="50" r="3" fill={color} />
        </g>
      )}
      {id === 'crest-delta' && (
        <g {...common}>
          <path d="M50 20 L78 74 L50 62 L22 74 Z" />
          <line x1="50" y1="20" x2="50" y2="62" />
        </g>
      )}
      {id === 'crest-star' && (
        <g {...common}>
          <path d="M50 18 L58 44 L84 44 L62 60 L70 84 L50 68 L30 84 L38 60 L16 44 L42 44 Z" />
        </g>
      )}
      {id === 'crest-shield' && (
        <g {...common}>
          <path d="M50 20 L78 30 V54 Q78 74 50 82 Q22 74 22 54 V30 Z" />
          <line x1="50" y1="30" x2="50" y2="72" />
          <line x1="32" y1="46" x2="68" y2="46" />
        </g>
      )}
      {id === 'crest-compass' && (
        <g {...common}>
          <circle cx="50" cy="50" r="30" />
          <path d="M50 24 L58 50 L50 76 L42 50 Z" fill={color} />
          <circle cx="50" cy="50" r="4" fill="#030509" />
        </g>
      )}
    </svg>
  )
}
```

- [ ] **Step 2: Build the founding screen** — create `src/components/FoundingScreen.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useAgencyStore } from '@/state/agencyStore'
import { Emblem, EMBLEMS, COLORWAYS } from '@/components/Emblem'
import { audio } from '@/audio/AudioEngine'

const SUGGESTED = 'Aegis Orbital'

export default function FoundingScreen() {
  const founded = useAgencyStore((s) => s.founded)
  const found = useAgencyStore((s) => s.found)
  const [name, setName] = useState(SUGGESTED)
  const [emblemId, setEmblemId] = useState(EMBLEMS[0].id)
  const [color, setColor] = useState(COLORWAYS[0])

  if (founded) return null

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm font-mono text-[var(--text)]">
      <div className="w-[560px] max-w-[92vw] rounded-lg border border-white/10 bg-black/70 p-6">
        <p className="text-[10px] tracking-[0.5em] text-[var(--accent)]">HYPERION</p>
        <h1 className="mt-1 mb-4 text-lg font-semibold tracking-wide">Found your agency</h1>

        <label className="mb-1 block text-[11px] opacity-70">AGENCY NAME</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          className="mb-5 w-full rounded border border-white/15 bg-black/50 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />

        <label className="mb-2 block text-[11px] opacity-70">EMBLEM</label>
        <div className="mb-5 grid grid-cols-6 gap-2">
          {EMBLEMS.map((em) => (
            <button
              key={em.id}
              onClick={() => { audio.uiTick(); setEmblemId(em.id) }}
              className={`rounded border p-1 transition ${emblemId === em.id ? 'border-[var(--accent)] bg-white/5' : 'border-white/10 hover:border-white/30'}`}
              title={em.label}
            >
              <Emblem id={em.id} color={color} size={48} />
            </button>
          ))}
        </div>

        <label className="mb-2 block text-[11px] opacity-70">COLORWAY</label>
        <div className="mb-6 flex gap-2">
          {COLORWAYS.map((c) => (
            <button
              key={c}
              onClick={() => { audio.uiTick(); setColor(c) }}
              className={`h-7 w-7 rounded-full border-2 transition ${color === c ? 'border-white' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              aria-label={`colorway ${c}`}
            />
          ))}
        </div>

        <button
          onClick={() => { found(name, emblemId, color); audio.stinger() }}
          className="w-full rounded border border-[var(--accent)] bg-[var(--accent)]/10 py-2.5 text-sm font-semibold tracking-widest text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
        >
          COMMISSION AGENCY
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount it** — in `src/components/Hud.tsx`, import and render `<FoundingScreen />` as the LAST child of the overlay root (so it layers above the panels):

```tsx
import FoundingScreen from '@/components/FoundingScreen'
```

```tsx
      <FoundingScreen />
```

- [ ] **Step 4: Verify** — `pnpm exec tsc --noEmit` clean; `pnpm test` green; `lsof -ti:3100 | xargs kill -9`; `pnpm dev`; the app opens on the founding screen (fresh browser / cleared localStorage). Founding dismisses into the globe. Note: existing e2e now sees the founding overlay first — Task 14 updates the e2e to found an agency before other assertions; for now verify manually + confirm `pnpm test` (unit) is green.

- [ ] **Step 5: Commit**

```bash
git add src/components/Emblem.tsx src/components/FoundingScreen.tsx src/components/Hud.tsx
git commit -m "feat: agency founding screen with procedural SVG emblems"
```

---

### Task 9: Agency status bar + fleet economy UI + wider burn sliders

**Files:**
- Create: `src/components/AgencyBar.tsx`
- Modify: `src/components/FleetPanel.tsx`
- Modify: `src/components/Hud.tsx`

**Interfaces:**
- Consumes: `useAgencyStore`, `useGameStore` (`refuelSatellite`, `buySatellite`), `rankTitle` + `SATELLITE_PRICE` (economy), `Emblem`.
- Produces: `<AgencyBar />` — top-center readout (emblem, name, funding, reputation+rank, fleet count); FleetPanel gains REFUEL (per selected sat) + BUY SATELLITE actions and its Δv sliders widen to ±400.

- [ ] **Step 1: Build the agency bar** — create `src/components/AgencyBar.tsx`:

```tsx
'use client'

import { useAgencyStore } from '@/state/agencyStore'
import { useGameStore } from '@/state/gameStore'
import { Emblem } from '@/components/Emblem'
import { rankTitle } from '@/lib/economy'

export default function AgencyBar() {
  const founded = useAgencyStore((s) => s.founded)
  const name = useAgencyStore((s) => s.name)
  const emblemId = useAgencyStore((s) => s.emblemId)
  const color = useAgencyStore((s) => s.colorway)
  const funding = useAgencyStore((s) => s.funding)
  const reputation = useAgencyStore((s) => s.reputation)
  const fleet = useGameStore((s) => s.satellites.length)

  if (!founded) return null

  return (
    <div className="pointer-events-auto fixed left-1/2 top-4 z-20 -translate-x-1/2 font-mono text-xs text-[var(--text)]">
      <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/60 px-4 py-1.5 backdrop-blur">
        <span className="flex items-center gap-2">
          <Emblem id={emblemId} color={color} size={22} />
          <span className="font-semibold tracking-wide">{name}</span>
        </span>
        <span className="h-4 w-px bg-white/15" />
        <span className="tabular-nums" style={{ color }}>§{funding.toLocaleString()}</span>
        <span className="tabular-nums opacity-80">REP {reputation} · {rankTitle(reputation)}</span>
        <span className="tabular-nums opacity-60">FLEET {fleet}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Widen sliders + add economy actions to FleetPanel** — in `src/components/FleetPanel.tsx`:

Add imports:

```tsx
import { SATELLITE_PRICE, refuelPrice } from '@/lib/economy'
import { useAgencyStore } from '@/state/agencyStore'
```

Widen the `DvField` range from ±120 to ±400 (change `min={-120} max={120}` to `min={-400} max={400}`; keep `step={1}`).

Add store hooks near the other `useGameStore` selectors:

```tsx
  const refuelSatellite = useGameStore((s) => s.refuelSatellite)
  const buySatellite = useGameStore((s) => s.buySatellite)
  const funding = useAgencyStore((s) => s.funding)
```

In the FLEET section, under the burn planner (after the EXECUTE/IGNITE row, inside the `selected &&` block or below the fleet list), add refuel for the selected satellite and a global buy button:

```tsx
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
        {selected && (
          <button
            onClick={() => { if (refuelSatellite(selected.id)) audio.uiTick() }}
            disabled={selected.fuel >= selected.fuelCapacity || funding < refuelPrice(selected.fuelCapacity - selected.fuel)}
            className="rounded border border-white/15 px-2 py-1 text-[11px] transition enabled:hover:border-white/40 disabled:opacity-30"
          >
            REFUEL §{refuelPrice((selected?.fuelCapacity ?? 0) - (selected?.fuel ?? 0))}
          </button>
        )}
        <button
          onClick={() => { if (buySatellite()) audio.chirp() }}
          disabled={funding < SATELLITE_PRICE}
          className="ml-auto rounded border border-[var(--accent)]/40 px-2 py-1 text-[11px] text-[var(--accent)] transition enabled:hover:bg-[var(--accent)]/10 disabled:opacity-30"
        >
          BUY SATELLITE §{SATELLITE_PRICE}
        </button>
      </div>
```

(`audio` is already imported in FleetPanel from Plan 4. `selected` is the currently-selected satellite object already computed in FleetPanel.)

- [ ] **Step 3: Mount AgencyBar** — in `src/components/Hud.tsx` add `<AgencyBar />` (before `<FoundingScreen />` so founding still layers on top):

```tsx
import AgencyBar from '@/components/AgencyBar'
```

```tsx
      <AgencyBar />
```

- [ ] **Step 4: Verify** — tsc clean; `pnpm test` green; `pnpm dev`: after founding, the agency bar shows; selecting a satellite shows REFUEL; BUY SATELLITE works and increments FLEET; sliders now reach ±400.

- [ ] **Step 5: Commit**

```bash
git add src/components/AgencyBar.tsx src/components/FleetPanel.tsx src/components/Hud.tsx
git commit -m "feat: agency status bar, refuel + buy-satellite UI, wider burn sliders"
```

---

### Task 10: Contracts panel

**Files:**
- Create: `src/components/ContractsPanel.tsx`
- Modify: `src/components/Hud.tsx`

**Interfaces:**
- Consumes: `useContractStore` (`contracts`, `targetId`, `accept`, `setTarget`), `useWorldStore` (`focusEvent` for TRACK), `simNow`, `audio`.
- Produces: `<ContractsPanel />` — right-side panel: available (ACCEPT), active (with countdown + SELECT-as-target), completed/failed tail.

- [ ] **Step 1: Build the panel** — create `src/components/ContractsPanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useContractStore } from '@/state/contractStore'
import { useWorldStore } from '@/state/worldStore'
import { useAgencyStore } from '@/state/agencyStore'
import { simNow } from '@/lib/simTime'
import { maxActiveContracts } from '@/lib/economy'
import { audio } from '@/audio/AudioEngine'

function countdown(deadline: number, now: number): string {
  const s = Math.max(0, Math.round(deadline - now))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

export default function ContractsPanel() {
  const founded = useAgencyStore((s) => s.founded)
  const reputation = useAgencyStore((s) => s.reputation)
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const accept = useContractStore((s) => s.accept)
  const setTarget = useContractStore((s) => s.setTarget)
  const focusEvent = useWorldStore((s) => s.focusEvent)

  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(simNow())
    const id = setInterval(() => setNow(simNow()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!founded) return null

  const available = contracts.filter((c) => c.status === 'available')
  const active = contracts.filter((c) => c.status === 'active')
  const done = contracts.filter((c) => c.status === 'completed' || c.status === 'failed').slice(-3)
  const cap = maxActiveContracts(reputation)

  return (
    <aside className="pointer-events-auto fixed right-6 top-28 z-20 w-80 font-mono text-xs text-[var(--text)]">
      <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
        <h2 className="mb-2 flex items-center justify-between text-[10px] tracking-[0.35em] text-[var(--accent)]">
          <span>CONTRACTS</span>
          <span className="opacity-60">ACTIVE {active.length}/{cap}</span>
        </h2>

        {available.length > 0 && (
          <ul className="mb-2 space-y-1">
            {available.map((c) => (
              <li key={c.id} className="rounded border border-white/10 p-2">
                <p className="mb-1 truncate font-semibold">{c.title}</p>
                <p className="flex items-center justify-between">
                  <span className="tabular-nums opacity-70" style={{ color: 'var(--accent)' }}>§{c.reward.funding} · REP {c.reward.reputation}</span>
                  <button
                    onClick={() => { if (accept(c.id)) audio.alert() }}
                    disabled={active.length >= cap}
                    className="rounded border border-[var(--accent)]/40 px-2 py-0.5 text-[10px] text-[var(--accent)] transition enabled:hover:bg-[var(--accent)]/10 disabled:opacity-30"
                  >
                    ACCEPT
                  </button>
                </p>
              </li>
            ))}
          </ul>
        )}

        {active.map((c) => (
          <button
            key={c.id}
            onClick={() => { audio.uiTick(); setTarget(c.id); focusEvent(c.eventId) }}
            className={`mb-1 block w-full rounded border p-2 text-left transition ${targetId === c.id ? 'border-[#ffb86b] bg-[#ffb86b]/10' : 'border-white/15 hover:border-white/30'}`}
          >
            <p className="mb-0.5 flex items-center justify-between">
              <span className="truncate font-semibold text-[#ffb86b]">{c.title}</span>
              <span className="shrink-0 tabular-nums opacity-70">{now === null ? '' : `T-${countdown(c.deadline, now)}`}</span>
            </p>
            <p className="opacity-60">Maneuver a satellite over the target · TRACK to view</p>
          </button>
        ))}

        {available.length === 0 && active.length === 0 && (
          <p className="py-3 text-center opacity-50">Awaiting the next briefing…</p>
        )}

        {done.length > 0 && (
          <ul className="mt-2 border-t border-white/10 pt-2 space-y-0.5">
            {done.map((c) => (
              <li key={c.id} className="flex items-center justify-between opacity-50">
                <span className="truncate">{c.title}</span>
                <span className={c.status === 'completed' ? 'text-emerald-400' : 'text-red-400'}>
                  {c.status === 'completed' ? '✓' : '✕'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
```

- [ ] **Step 2: Mount** — in `src/components/Hud.tsx` add `<ContractsPanel />` (near the other panels, before FoundingScreen):

```tsx
import ContractsPanel from '@/components/ContractsPanel'
```

```tsx
      <ContractsPanel />
```

- [ ] **Step 3: Verify** — tsc clean; `pnpm test` green; `pnpm dev`: after founding, once a briefing lands, CONTRACTS shows available items; ACCEPT moves one to active with a countdown; clicking an active contract flies the camera to its event.

- [ ] **Step 4: Commit**

```bash
git add src/components/ContractsPanel.tsx src/components/Hud.tsx
git commit -m "feat: contracts panel (accept, active countdowns, target selection)"
```

---

### Task 11: Contract globe layer + completion wiring

**Files:**
- Create: `src/engine/ContractLayer.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Interfaces:**
- Consumes: `useContractStore`, `useGameStore`, `simNow`, `latLonToVector3` (geo), `subPoint` + `closestApproach` (intercept), `propagate` + `sceneFromEci` + `orbitalPeriod` (orbits), `audio`.
- Produces: `class ContractLayer { readonly group: THREE.Group; update(simTime: number): void; dispose(): void }` — draws (a) a pulsing **target ring** at the active/targeted contract, (b) the **selected satellite's ground-track** as a great-circle line, (c) a **closest-approach marker** on that track; and runs throttled **completion evaluation** each update, firing a stinger on completion. `GlobeEngine` adds the layer, updates it each frame, disposes it.

- [ ] **Step 1: Build the layer** — create `src/engine/ContractLayer.ts`:

```ts
import * as THREE from 'three'
import { useContractStore } from '@/state/contractStore'
import { useGameStore } from '@/state/gameStore'
import { latLonToVector3 } from '@/lib/geo'
import { subPoint } from '@/lib/intercept'
import { orbitalPeriod } from '@/lib/orbits'
import { audio } from '@/audio/AudioEngine'

const TARGET_COLOR = 0xffb86b
const TRACK_COLOR = 0x45d8ff

/** Renders active-contract legibility (target ring, selected ground-track, closest-approach marker)
 *  and drives throttled completion detection. */
export class ContractLayer {
  readonly group = new THREE.Group()
  private ring: THREE.Mesh
  private track: THREE.Line
  private marker: THREE.Mesh
  private lastEval = -1e9

  constructor() {
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.038, 48),
      new THREE.MeshBasicMaterial({ color: TARGET_COLOR, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.ring.visible = false
    this.group.add(this.ring)

    this.track = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: TRACK_COLOR, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.track.visible = false
    this.group.add(this.track)

    this.marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 12, 12),
      new THREE.MeshBasicMaterial({ color: TRACK_COLOR, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.marker.visible = false
    this.group.add(this.marker)
  }

  update(simTime: number) {
    const cs = useContractStore.getState()
    const gs = useGameStore.getState()

    // Throttled completion + expiry evaluation (every ~0.5 wall-seconds worth of sim time at 20x ≈ 10 sim-sec).
    if (simTime - this.lastEval > 10) {
      this.lastEval = simTime
      const { completed, failed } = cs.evaluate(gs.satellites, simTime)
      if (completed.length) audio.stinger()
      if (failed.length) audio.alert()
    }

    // Target ring at the currently-targeted (or first active) contract.
    const target = cs.contracts.find((c) => c.id === cs.targetId && c.status === 'active')
      ?? cs.contracts.find((c) => c.status === 'active')
    if (target) {
      const p = latLonToVector3(target.lat, target.lon, 1.008)
      this.ring.position.copy(p)
      this.ring.lookAt(p.clone().multiplyScalar(2))
      const pulse = 1 + 0.12 * Math.sin(simTime * 0.5)
      this.ring.scale.setScalar(pulse)
      this.ring.visible = true
    } else {
      this.ring.visible = false
    }

    // Selected satellite's ground-track + closest-approach marker.
    const sat = gs.satellites.find((s) => s.id === gs.selectedId)
    if (sat && target) {
      const period = orbitalPeriod(sat.elements.a)
      const pts: THREE.Vector3[] = []
      let best = Infinity
      let bestPos = new THREE.Vector3()
      const N = 120
      for (let k = 0; k <= N; k++) {
        const t = simTime + (k / N) * period
        const sp = subPoint(sat.elements, t)
        const g = latLonToVector3(sp.lat, sp.lon, 1.006)
        pts.push(g)
        const d = g.distanceTo(latLonToVector3(target.lat, target.lon, 1.006))
        if (d < best) { best = d; bestPos = g.clone() }
      }
      this.track.geometry.dispose()
      this.track.geometry = new THREE.BufferGeometry().setFromPoints(pts)
      this.track.visible = true
      this.marker.position.copy(bestPos)
      this.marker.visible = true
    } else {
      this.track.visible = false
      this.marker.visible = false
    }
  }

  dispose() {
    for (const obj of [this.ring, this.track, this.marker]) {
      this.group.remove(obj)
      obj.geometry.dispose()
      ;(obj.material as THREE.Material).dispose()
    }
  }
}
```

> Note: `subPoint` already wraps `propagate`/`sceneFromEci`, so this layer imports only `subPoint` (intercept) and `orbitalPeriod` (orbits) — keep the import list to exactly what the file references so `tsc`/lint stay clean.

- [ ] **Step 2: Wire into GlobeEngine** — in `src/engine/GlobeEngine.ts`:

Add import:

```ts
import { ContractLayer } from '@/engine/ContractLayer'
```

Add field + construct/add in the constructor (near the EventLayer wiring):

```ts
  private contractLayer = new ContractLayer()
```

```ts
    this.scene.add(this.contractLayer.group)
```

In `update(elapsedSeconds)`, after `this.eventLayer.update(...)` (i.e., at the end of the layer updates), add:

```ts
    this.contractLayer.update(simNow())
```

(`simNow` is already imported in GlobeEngine from Plan 2/4. If not, add `import { simNow } from '@/lib/simTime'`.)

In `dispose()`, add:

```ts
    this.contractLayer.dispose()
```

- [ ] **Step 3: Verify** — tsc clean; `pnpm test` green; `pnpm e2e` (the founding-aware version lands in Task 14 — for now confirm the app builds and, manually, that accepting a contract shows an amber target ring; selecting a satellite draws a cyan ground-track with a marker; flying a burn that threads the ring completes the contract with a stinger and bumps funding.)

- [ ] **Step 4: Commit**

```bash
git add src/engine/ContractLayer.ts src/engine/GlobeEngine.ts
git commit -m "feat: contract globe layer (target ring, ground-track, marker) + completion detection"
```

---

### Task 12: Intercept readout HUD

**Files:**
- Create: `src/components/InterceptReadout.tsx`
- Modify: `src/components/Hud.tsx`

**Interfaces:**
- Consumes: `useContractStore` (targeted active contract), `useGameStore` (selected satellite + `burnPlan` for ghost preview), `previewElements` (gameStore), `closestApproach` + `COMPLETION_RADIUS_KM` (intercept), `orbitalPeriod` (orbits), `simNow`.
- Produces: `<InterceptReadout />` — shows, for the selected satellite vs. the targeted active contract, the **closest ground approach + ETA**; computed against the **ghost orbit** when a burn is being planned so the readout updates live as sliders move; turns green when within radius.

- [ ] **Step 1: Build the readout** — create `src/components/InterceptReadout.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useContractStore } from '@/state/contractStore'
import { useGameStore, previewElements, burnCost } from '@/state/gameStore'
import { closestApproach, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import { orbitalPeriod } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'

export default function InterceptReadout() {
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const selectedId = useGameStore((s) => s.selectedId)
  const satellites = useGameStore((s) => s.satellites)
  const burnPlan = useGameStore((s) => s.burnPlan)

  // Recompute a few times a second (orbit advances; ghost changes with sliders).
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 400)
    return () => clearInterval(id)
  }, [])

  const target =
    contracts.find((c) => c.id === targetId && c.status === 'active') ??
    contracts.find((c) => c.status === 'active')
  const sat = satellites.find((s) => s.id === selectedId)
  if (!target || !sat) return null

  const now = simNow()
  const planning = burnCost(burnPlan) > 0
  const elements = planning ? previewElements(sat, burnPlan, now) : sat.elements
  const period = orbitalPeriod(elements.a)
  const { closestKm, etaSec } = closestApproach(elements, { lat: target.lat, lon: target.lon }, now, 3 * period)
  const ok = closestKm <= COMPLETION_RADIUS_KM
  const etaMin = Math.floor(etaSec / 60)

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-20 -translate-x-1/2 font-mono text-xs">
      <div className={`rounded-full border px-4 py-1.5 backdrop-blur ${ok ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300' : 'border-white/15 bg-black/60 text-[var(--text)]'}`}>
        <span className="opacity-70">{sat.name} → {target.title.slice(0, 28)} · </span>
        <span className="tabular-nums font-semibold">
          closest {Math.round(closestKm)} km {ok ? '✓' : `(need ≤${COMPLETION_RADIUS_KM})`} · {planning ? 'ghost ' : ''}pass in {etaMin}m {Math.round(etaSec % 60)}s
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount** — in `src/components/Hud.tsx` add `<InterceptReadout />` (before FoundingScreen):

```tsx
import InterceptReadout from '@/components/InterceptReadout'
```

```tsx
      <InterceptReadout />
```

- [ ] **Step 3: Verify** — tsc clean; `pnpm test` green; `pnpm dev`: with a contract active and a satellite selected, the readout shows a closest-approach distance + ETA; opening the burn planner and dragging Δv updates it live ("ghost pass in …"); it turns green when ≤ 500 km.

- [ ] **Step 4: Commit**

```bash
git add src/components/InterceptReadout.tsx src/components/Hud.tsx
git commit -m "feat: live intercept readout (closest approach + ETA, ghost-aware)"
```

---

### Task 13: The guide overlay

**Files:**
- Create: `src/components/GuidePanel.tsx`
- Modify: `src/components/Hud.tsx`

**Interfaces:**
- Consumes: `audio`.
- Produces: `<GuidePanel />` — a toggle button (bottom-right `?`) and a modal with stylized SVG control diagrams; opens/closes on the button and the `?`/`h` key; closes on `Escape`.

- [ ] **Step 1: Build the guide** — create `src/components/GuidePanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { audio } from '@/audio/AudioEngine'

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-white/25 bg-white/5 px-1.5 py-0.5 text-[10px]">{children}</kbd>
}

export default function GuidePanel() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' || e.key === 'h' || e.key === 'H') { setOpen((o) => !o); audio.uiTick() }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        onClick={() => { setOpen((o) => !o); audio.uiTick() }}
        className="pointer-events-auto fixed bottom-6 right-6 z-30 h-9 w-9 rounded-full border border-white/20 bg-black/60 font-mono text-sm text-[var(--accent)] backdrop-blur transition hover:border-[var(--accent)]"
        aria-label="guide"
      >
        ?
      </button>

      {open && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm font-mono text-xs text-[var(--text)]" onClick={() => setOpen(false)}>
          <div className="w-[620px] max-w-[92vw] rounded-lg border border-white/10 bg-black/80 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[10px] tracking-[0.4em] text-[var(--accent)]">FIELD GUIDE</h2>
              <button onClick={() => setOpen(false)} className="opacity-60 hover:opacity-100">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <section>
                <p className="mb-2 font-semibold text-[var(--accent)]">Command your fleet</p>
                <svg viewBox="0 0 120 60" className="mb-2 w-full">
                  <circle cx="30" cy="40" r="18" fill="none" stroke="#45d8ff" strokeWidth="1" opacity="0.4" />
                  <path d="M14 44 l10 -3 l-2 4 z" fill="#45d8ff" />
                  <circle cx="86" cy="20" r="3" fill="#45d8ff" />
                  <text x="72" y="42" fill="#e6edf3" fontSize="7">click a bird</text>
                </svg>
                <p className="opacity-75">Click a satellite (or a fleet-panel entry) to <b>select</b> it.</p>
              </section>

              <section>
                <p className="mb-2 font-semibold text-[var(--accent)]">Plan a burn</p>
                <svg viewBox="0 0 120 60" className="mb-2 w-full">
                  <ellipse cx="60" cy="30" rx="40" ry="16" fill="none" stroke="#45d8ff" strokeWidth="1" opacity="0.5" />
                  <ellipse cx="60" cy="30" rx="52" ry="22" fill="none" stroke="#ffb86b" strokeWidth="1" strokeDasharray="3 3" />
                  <text x="30" y="56" fill="#ffb86b" fontSize="7">ghost orbit = preview</text>
                </svg>
                <p className="opacity-75">Drag <b>PROGRADE / NORMAL / RADIAL</b> Δv. The amber ghost shows your new orbit; the intercept readout turns green when you'll pass the target.</p>
              </section>

              <section>
                <p className="mb-2 font-semibold text-[var(--accent)]">Fly the burn</p>
                <p className="mb-1 flex gap-2"><Key>SPACE</Key><span className="opacity-75">hold to throttle</span></p>
                <p className="mb-1 flex gap-2"><Key>A</Key><Key>D</Key><span className="opacity-75">trim the needle</span></p>
                <p className="flex gap-2"><Key>ESC</Key><span className="opacity-75">abort</span></p>
              </section>

              <section>
                <p className="mb-2 font-semibold text-[var(--accent)]">Run contracts</p>
                <p className="opacity-75">Accept a contract, maneuver a satellite over its <span style={{ color: '#ffb86b' }}>ringed target</span>, and the pass completes it — earning <b>§ funding</b> and <b>reputation</b>. Spend funding to <b>refuel</b> or <b>buy satellites</b>.</p>
                <p className="mt-2 opacity-50">Toggle this guide any time with <Key>?</Key></p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Mount** — in `src/components/Hud.tsx` add `<GuidePanel />` (before FoundingScreen so founding still layers above it on first run):

```tsx
import GuidePanel from '@/components/GuidePanel'
```

```tsx
      <GuidePanel />
```

- [ ] **Step 3: Verify** — tsc clean; `pnpm test` green; `pnpm dev`: the `?` button (and the `?`/`h` key) opens the guide; `Escape` / clicking outside closes it.

- [ ] **Step 4: Commit**

```bash
git add src/components/GuidePanel.tsx src/components/Hud.tsx
git commit -m "feat: field guide overlay with control diagrams and hotkey"
```

---

### Task 14: E2E coverage + README + full gate

**Files:**
- Modify: `e2e/globe.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the running app on 3100.
- Produces: e2e that founds an agency first (all prior tests must dismiss the founding overlay), plus a contract-acceptance smoke; README status.

- [ ] **Step 1: Add a founding helper + gate existing tests**

The founding overlay (z-40) now covers the globe on a fresh browser, so it must be dismissed before any interaction. At the top of `e2e/globe.spec.ts`, add a helper and call it after each `page.goto('/')` that then interacts with the HUD:

```ts
async function foundAgency(page: import('@playwright/test').Page) {
  await page.goto('/')
  const commission = page.getByRole('button', { name: 'COMMISSION AGENCY' })
  // Fresh browser shows the founding screen; a persisted one won't.
  if (await commission.isVisible().catch(() => false)) {
    await commission.click()
  }
  await expect(commission).toBeHidden()
}
```

Replace the `await page.goto('/')` line in each existing test that interacts with panels (the fleet/burn tests, the events test) with `await foundAgency(page)`. Playwright starts each test with a fresh context (empty localStorage), so the founding screen appears every test — the helper handles it. The pure "globe renders" test can keep `page.goto('/')` but must not assert on covered panels; if it checks the HYPERION heading only, it still passes (the heading is in the founding screen too). Verify and adjust as needed.

- [ ] **Step 2: Add a contract smoke test**

Append to `e2e/globe.spec.ts`:

```ts
test('found agency, briefing yields contracts, accept one', async ({ page }) => {
  await foundAgency(page)
  // Agency bar appears once founded.
  await expect(page.getByText(/REP 0/)).toBeVisible()
  // Contracts arrive after the briefing round-trip (AI or fallback).
  const accept = page.getByRole('button', { name: 'ACCEPT' }).first()
  await expect(accept).toBeVisible({ timeout: 45_000 })
  await accept.click()
  // An active contract now shows a T- countdown.
  await expect(page.getByText(/T-/)).toBeVisible()
})
```

- [ ] **Step 3: Run the full gate**

```bash
lsof -ti:3100 | xargs kill -9
pnpm test && pnpm exec tsc --noEmit && pnpm e2e
```

Expected: all unit tests green, tsc clean, all e2e green (existing + the new contract smoke). If an existing e2e fails only because it now needs the founding dismissal, wrap its navigation with `foundAgency`.

- [ ] **Step 4: README**

Update the status line in `README.md`:

```markdown
**Status:** Plan 7A (foundations of play — found an agency, contracts, maneuver-to-intercept, economy, guide) complete.
```

- [ ] **Step 5: Commit**

```bash
git add e2e/globe.spec.ts README.md
git commit -m "test: founding-aware e2e + contract acceptance smoke; README status"
```
