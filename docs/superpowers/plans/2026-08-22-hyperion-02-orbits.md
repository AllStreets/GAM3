# HYPERION Plan 2: Orbital Mechanics & the Fleet

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two satellites orbit the living Earth under real Keplerian mechanics at Hyperion time (20×), rendered as glowing markers with orbit ribbons; the player clicks a satellite, plans an impulsive burn (prograde/normal/radial Δv) with a live ghost-orbit preview, and executes it — spending a real Δv fuel budget.

**Architecture:** Pure orbital math lives in `src/lib/orbits.ts` (ECI frame, Z-up) with heavy unit tests; a zustand store (`src/state/gameStore.ts`) is the single source of truth for fleet state and is readable from both React and the engine; a `SatelliteLayer` class renders markers/ribbons/ghost inside `GlobeEngine` (extended in place, following Plan 1's patterns). Scene mapping: ECI (x→lon0, y→lon90E, z→north) converts to the scene's Y-up frame via `sceneFromEci`.

**Tech Stack:** Existing Plan 1 stack + `zustand` (state store).

**Spec:** `docs/superpowers/specs/2026-08-22-hyperion-design.md`

## Global Constraints

- Distance unit is Earth radii (`EARTH_RADIUS = 1` from `src/lib/geo.ts`); time unit is seconds; velocity is ER/s internally. UI shows km / km/s / m/s (1 ER = 6371 km; `MS_TO_ER = 1 / 6_371_000` converts m/s → ER/s).
- `MU_EARTH = 398600.4418 / 6371**3` ER³/s² (real GM of Earth, converted).
- Hyperion time: `TIME_SCALE = 20`; `simNow() = (Date.now() / 1000) * TIME_SCALE`. Deterministic from wall clock — satellites advance while the app is closed (spec: living world).
- The scene frame is treated as inertial and the Earth mesh does not rotate (Plan 1 invariant: terminator moves via shader). Ground-track precession is deliberately not modeled — an accepted game abstraction.
- Engine code (`src/engine/`) must not import React. React never touches Three objects directly — it goes through the store.
- All engine changes follow Plan 1's established patterns: `disposedFlag` guard for async work, disposal via scene traversal plus explicit texture/material cleanup, DPR-aware rendering untouched.
- The e2e smoke gate (`pnpm e2e`) must stay green through every task.
- Commit prefixes: `feat:` / `test:` / `chore:` / `fix:`.

---

### Task 1: Orbital core — Kepler propagation (TDD)

**Files:**
- Create: `src/lib/orbits.ts`
- Test: `src/lib/orbits.test.ts`

**Interfaces:**
- Produces (consumed by every later task):
  - `MU_EARTH: number`, `MS_TO_ER: number`, `ER_KM = 6371`
  - `interface OrbitalElements { a: number; e: number; i: number; raan: number; argp: number; m0: number; epoch: number }` (radians, ER, seconds)
  - `interface StateVector { position: Vector3; velocity: Vector3 }` (ECI, ER and ER/s)
  - `meanMotion(a: number): number`, `orbitalPeriod(a: number): number`
  - `solveKepler(M: number, e: number): number` (eccentric anomaly)
  - `propagate(el: OrbitalElements, t: number): StateVector`
  - `sceneFromEci(v: Vector3): Vector3`, `eciFromScene(v: Vector3): Vector3`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/orbits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Vector3 } from 'three'
import {
  MU_EARTH, ER_KM, MS_TO_ER, meanMotion, orbitalPeriod, solveKepler,
  propagate, sceneFromEci, eciFromScene,
  type OrbitalElements,
} from './orbits'

const issLike: OrbitalElements = {
  a: (6371 + 400) / 6371, e: 0.001, i: (51.6 * Math.PI) / 180,
  raan: 0.5, argp: 1.0, m0: 0, epoch: 0,
}

describe('constants', () => {
  it('MU_EARTH is the real GM converted to ER^3/s^2', () => {
    expect(MU_EARTH).toBeCloseTo(398600.4418 / 6371 ** 3, 12)
  })
  it('MS_TO_ER converts 6371 km/s to 1 ER/s', () => {
    expect(6_371_000 * MS_TO_ER).toBeCloseTo(1, 9)
  })
})

describe('orbitalPeriod', () => {
  it('gives ~92.5 minutes for a 400 km orbit', () => {
    const T = orbitalPeriod(issLike.a)
    expect(T).toBeGreaterThan(5400)
    expect(T).toBeLessThan(5700)
  })
})

describe('solveKepler', () => {
  it('returns M when e = 0', () => {
    expect(solveKepler(1.234, 0)).toBeCloseTo(1.234, 10)
  })
  it('satisfies Kepler equation residual < 1e-9 for e = 0.5', () => {
    const E = solveKepler(1.0, 0.5)
    expect(Math.abs(E - 0.5 * Math.sin(E) - 1.0)).toBeLessThan(1e-9)
  })
})

describe('propagate', () => {
  it('keeps a circular equatorial orbit at constant radius and speed', () => {
    const el: OrbitalElements = { a: 2, e: 0, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 }
    for (const t of [0, 1000, 4321, 90000]) {
      const { position, velocity } = propagate(el, t)
      expect(position.length()).toBeCloseTo(2, 6)
      expect(velocity.length()).toBeCloseTo(Math.sqrt(MU_EARTH / 2), 9)
      expect(Math.abs(position.dot(velocity))).toBeLessThan(1e-8)
    }
  })
  it('returns to the same position after one period', () => {
    const p0 = propagate(issLike, 0).position
    const p1 = propagate(issLike, orbitalPeriod(issLike.a)).position
    expect(p0.distanceTo(p1)).toBeLessThan(1e-5)
  })
  it('respects inclination: max |z| over an orbit ~ sin(i) * a', () => {
    let maxZ = 0
    const T = orbitalPeriod(issLike.a)
    for (let k = 0; k < 200; k++) {
      maxZ = Math.max(maxZ, Math.abs(propagate(issLike, (k / 200) * T).position.z))
    }
    expect(maxZ).toBeGreaterThan(Math.sin(issLike.i) * issLike.a * 0.98)
    expect(maxZ).toBeLessThan(issLike.a * (1 + issLike.e) * Math.sin(issLike.i) * 1.02)
  })
})

describe('frame mapping', () => {
  it('maps ECI north (+z) to scene +Y', () => {
    const v = sceneFromEci(new Vector3(0, 0, 1))
    expect(v.x).toBeCloseTo(0); expect(v.y).toBeCloseTo(1); expect(v.z).toBeCloseTo(0)
  })
  it('maps ECI +x (lon 0) to scene +Z', () => {
    const v = sceneFromEci(new Vector3(1, 0, 0))
    expect(v.z).toBeCloseTo(1)
  })
  it('eciFromScene inverts sceneFromEci', () => {
    const v = new Vector3(0.3, -0.7, 2.1)
    const back = eciFromScene(sceneFromEci(v))
    expect(back.distanceTo(v)).toBeLessThan(1e-12)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./orbits`.

- [ ] **Step 3: Implement the module**

Create `src/lib/orbits.ts`:

```ts
import { Vector3 } from 'three'

/** Earth radius in km — the scene unit is 1 Earth radius. */
export const ER_KM = 6371
/** GM of Earth in ER^3/s^2. */
export const MU_EARTH = 398600.4418 / ER_KM ** 3
/** Convert m/s to ER/s. */
export const MS_TO_ER = 1 / (ER_KM * 1000)

const TWO_PI = Math.PI * 2

export interface OrbitalElements {
  a: number     // semi-major axis, ER
  e: number     // eccentricity [0, 1)
  i: number     // inclination, rad
  raan: number  // right ascension of ascending node, rad
  argp: number  // argument of periapsis, rad
  m0: number    // mean anomaly at epoch, rad
  epoch: number // sim time, seconds
}

export interface StateVector {
  position: Vector3 // ECI, ER
  velocity: Vector3 // ECI, ER/s
}

export function meanMotion(a: number): number {
  return Math.sqrt(MU_EARTH / (a * a * a))
}

export function orbitalPeriod(a: number): number {
  return TWO_PI / meanMotion(a)
}

export function normalizeAngle(x: number): number {
  const y = x % TWO_PI
  return y < 0 ? y + TWO_PI : y
}

/** Newton-solve E - e·sin(E) = M. */
export function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI
  for (let k = 0; k < 15; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-12) break
  }
  return E
}

/** Rotate perifocal (PQW) coordinates into ECI: Rz(raan) · Rx(i) · Rz(argp). */
function pqwToEci(el: OrbitalElements, x: number, y: number): Vector3 {
  const cO = Math.cos(el.raan), sO = Math.sin(el.raan)
  const ci = Math.cos(el.i), si = Math.sin(el.i)
  const cw = Math.cos(el.argp), sw = Math.sin(el.argp)
  return new Vector3(
    (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y,
    (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y,
    sw * si * x + cw * si * y,
  )
}

export function propagate(el: OrbitalElements, t: number): StateVector {
  const M = normalizeAngle(el.m0 + meanMotion(el.a) * (t - el.epoch))
  const E = solveKepler(M, el.e)
  const cosE = Math.cos(E), sinE = Math.sin(E)
  const sq = Math.sqrt(1 - el.e * el.e)
  const r = el.a * (1 - el.e * cosE)

  const xP = el.a * (cosE - el.e)
  const yP = el.a * sq * sinE
  const vf = Math.sqrt(MU_EARTH * el.a) / r
  const vxP = -vf * sinE
  const vyP = vf * sq * cosE

  return { position: pqwToEci(el, xP, yP), velocity: pqwToEci(el, vxP, vyP) }
}

/** ECI (z = north, x = lon 0, y = lon 90°E) → scene (Y-up, matches latLonToVector3). */
export function sceneFromEci(v: Vector3): Vector3 {
  return new Vector3(v.y, v.z, v.x)
}

export function eciFromScene(v: Vector3): Vector3 {
  return new Vector3(v.z, v.x, v.y)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (9 geo + 10 orbit tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbits.ts src/lib/orbits.test.ts
git commit -m "feat: Keplerian orbital core with propagation and ECI-scene mapping"
```

---

### Task 2: State-vector inversion, burns, and orbit paths (TDD)

**Files:**
- Modify: `src/lib/orbits.ts`
- Test: `src/lib/orbits.test.ts` (append)

**Interfaces:**
- Consumes: Task 1's exports.
- Produces:
  - `elementsFromState(position: Vector3, velocity: Vector3, t: number): OrbitalElements`
  - `applyDeltaV(el: OrbitalElements, t: number, dv: { prograde: number; normal: number; radial: number }): OrbitalElements` — dv in **ER/s**
  - `orbitPathPoints(el: OrbitalElements, segments?: number): Vector3[]` — ECI positions sampled uniformly in eccentric anomaly (default 128, closed loop NOT duplicated: length === segments)
  - `apoapsis(el): number`, `periapsis(el): number` (ER)

- [ ] **Step 1: Append the failing tests**

Append to `src/lib/orbits.test.ts`:

```ts
import { elementsFromState, applyDeltaV, orbitPathPoints, apoapsis, periapsis } from './orbits'

describe('elementsFromState', () => {
  it('round-trips: elements -> state -> elements agree on future propagation', () => {
    const t0 = 12345
    const s0 = propagate(issLike, t0)
    const el2 = elementsFromState(s0.position, s0.velocity, t0)
    for (const dt of [0, 500, 3000]) {
      const a = propagate(issLike, t0 + dt).position
      const b = propagate(el2, t0 + dt).position
      expect(a.distanceTo(b)).toBeLessThan(1e-6)
    }
  })
  it('recovers a, e, i for the seed orbit', () => {
    const s = propagate(issLike, 999)
    const el2 = elementsFromState(s.position, s.velocity, 999)
    expect(el2.a).toBeCloseTo(issLike.a, 6)
    expect(el2.e).toBeCloseTo(issLike.e, 5)
    expect(el2.i).toBeCloseTo(issLike.i, 6)
  })
})

describe('applyDeltaV', () => {
  it('prograde burn raises apoapsis and energy', () => {
    const el2 = applyDeltaV(issLike, 100, { prograde: 50 * MS_TO_ER, normal: 0, radial: 0 })
    expect(apoapsis(el2)).toBeGreaterThan(apoapsis(issLike))
    expect(el2.a).toBeGreaterThan(issLike.a)
  })
  it('retrograde burn lowers periapsis', () => {
    const el2 = applyDeltaV(issLike, 100, { prograde: -50 * MS_TO_ER, normal: 0, radial: 0 })
    expect(periapsis(el2)).toBeLessThan(periapsis(issLike))
  })
  it('normal burn changes inclination-plane (orbit normal direction)', () => {
    const el2 = applyDeltaV(issLike, 100, { prograde: 0, normal: 200 * MS_TO_ER, radial: 0 })
    expect(Math.abs(el2.i - issLike.i)).toBeGreaterThan(1e-4)
  })
  it('zero burn is identity (propagation-equivalent)', () => {
    const el2 = applyDeltaV(issLike, 777, { prograde: 0, normal: 0, radial: 0 })
    const a = propagate(issLike, 2000).position
    const b = propagate(el2, 2000).position
    expect(a.distanceTo(b)).toBeLessThan(1e-6)
  })
})

describe('orbitPathPoints', () => {
  it('returns the requested number of points, all on the ellipse radius range', () => {
    const pts = orbitPathPoints(issLike, 64)
    expect(pts).toHaveLength(64)
    for (const p of pts) {
      expect(p.length()).toBeGreaterThanOrEqual(periapsis(issLike) - 1e-9)
      expect(p.length()).toBeLessThanOrEqual(apoapsis(issLike) + 1e-9)
    }
  })
})
```

- [ ] **Step 2: Run tests — new ones fail** (`pnpm test`; cannot resolve new exports)

- [ ] **Step 3: Implement**

Append to `src/lib/orbits.ts`:

```ts
function clampUnit(x: number): number {
  return Math.min(1, Math.max(-1, x))
}

export function apoapsis(el: OrbitalElements): number {
  return el.a * (1 + el.e)
}

export function periapsis(el: OrbitalElements): number {
  return el.a * (1 - el.e)
}

/**
 * Classical rv -> elements (ECI). Near-singular cases (equatorial and/or
 * circular) fall back to zeroed angles — fine for gameplay orbits, which are
 * seeded inclined and slightly eccentric.
 */
export function elementsFromState(position: Vector3, velocity: Vector3, t: number): OrbitalElements {
  const EPS = 1e-10
  const r = position.length()
  const v2 = velocity.lengthSq()
  const h = new Vector3().crossVectors(position, velocity)
  const nVec = new Vector3(-h.y, h.x, 0) // z-hat × h
  const rv = position.dot(velocity)

  const eVec = position.clone().multiplyScalar(v2 - MU_EARTH / r)
    .sub(velocity.clone().multiplyScalar(rv))
    .divideScalar(MU_EARTH)
  const e = eVec.length()

  const a = -MU_EARTH / (2 * (v2 / 2 - MU_EARTH / r))
  const i = Math.acos(clampUnit(h.z / h.length()))

  let raan = 0
  if (nVec.length() > EPS) {
    raan = Math.acos(clampUnit(nVec.x / nVec.length()))
    if (nVec.y < 0) raan = TWO_PI - raan
  }

  let argp = 0
  if (nVec.length() > EPS && e > EPS) {
    argp = Math.acos(clampUnit(nVec.dot(eVec) / (nVec.length() * e)))
    if (eVec.z < 0) argp = TWO_PI - argp
  } else if (e > EPS) {
    // equatorial: measure periapsis from +x
    argp = Math.atan2(eVec.y, eVec.x)
    if (h.z < 0) argp = TWO_PI - argp
  }

  // true anomaly
  let nu: number
  if (e > EPS) {
    nu = Math.acos(clampUnit(eVec.dot(position) / (e * r)))
    if (rv < 0) nu = TWO_PI - nu
  } else if (nVec.length() > EPS) {
    nu = Math.acos(clampUnit(nVec.dot(position) / (nVec.length() * r)))
    if (position.z < 0) nu = TWO_PI - nu
  } else {
    nu = Math.atan2(position.y, position.x)
    if (h.z < 0) nu = TWO_PI - nu
  }

  // eccentric anomaly then mean anomaly
  const E = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(nu), e + Math.cos(nu))
  const m0 = normalizeAngle(E - e * Math.sin(E))

  return { a, e, i, raan, argp, m0, epoch: t }
}

/** Impulsive burn in the RSW-style local frame: prograde = v-hat, normal = h-hat, radial = r-hat. dv in ER/s. */
export function applyDeltaV(
  el: OrbitalElements,
  t: number,
  dv: { prograde: number; normal: number; radial: number },
): OrbitalElements {
  const { position, velocity } = propagate(el, t)
  const vHat = velocity.clone().normalize()
  const hHat = new Vector3().crossVectors(position, velocity).normalize()
  const rHat = position.clone().normalize()
  const newV = velocity.clone()
    .addScaledVector(vHat, dv.prograde)
    .addScaledVector(hHat, dv.normal)
    .addScaledVector(rHat, dv.radial)
  return elementsFromState(position, newV, t)
}

/** Sample the orbit ellipse uniformly in eccentric anomaly. ECI positions. */
export function orbitPathPoints(el: OrbitalElements, segments = 128): Vector3[] {
  const pts: Vector3[] = []
  const sq = Math.sqrt(1 - el.e * el.e)
  for (let k = 0; k < segments; k++) {
    const E = (k / segments) * TWO_PI
    const x = el.a * (Math.cos(E) - el.e)
    const y = el.a * sq * Math.sin(E)
    pts.push(pqwToEci(el, x, y))
  }
  return pts
}
```

- [ ] **Step 4: Run tests — all pass** (`pnpm test`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/orbits.ts src/lib/orbits.test.ts
git commit -m "feat: state-vector inversion, delta-v burns, and orbit path sampling"
```

---

### Task 3: Sim time + game store + seed fleet (TDD)

**Files:**
- Create: `src/lib/simTime.ts`
- Create: `src/state/gameStore.ts`
- Test: `src/state/gameStore.test.ts`

**Interfaces:**
- Consumes: `applyDeltaV`, `MS_TO_ER`, `OrbitalElements` from orbits.
- Produces:
  - `TIME_SCALE = 20`, `simNow(): number` (in `simTime.ts`)
  - `interface Satellite { id: string; name: string; elements: OrbitalElements; fuel: number; fuelCapacity: number }` (fuel in m/s of Δv budget)
  - `interface BurnPlan { prograde: number; normal: number; radial: number }` (m/s)
  - `useGameStore` (zustand) with state `{ satellites: Satellite[]; selectedId: string | null; burnPlan: BurnPlan }` and actions `{ select(id: string | null): void; setBurnPlan(p: Partial<BurnPlan>): void; resetBurnPlan(): void; executeBurn(at: number): boolean }`
  - `burnCost(p: BurnPlan): number` (m/s, vector magnitude), `previewElements(sat: Satellite, plan: BurnPlan, at: number): OrbitalElements`
  - Seed fleet: `HYPERION-1` (a = (6371+420)/6371, e 0.0012, i 51.6°, raan 0.8, argp 0.3, m0 0, epoch 0, fuel 450/450) and `HYPERION-2` (a = (6371+780)/6371, e 0.002, i 97.5°, raan 2.4, argp 1.1, m0 2.0, epoch 0, fuel 380/380).

- [ ] **Step 1: Install zustand**

```bash
pnpm add zustand@^5
```

- [ ] **Step 2: Write the failing tests**

Create `src/state/gameStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useGameStore, burnCost, previewElements } from './gameStore'
import { apoapsis } from '@/lib/orbits'

beforeEach(() => {
  useGameStore.getState().resetForTest()
})

describe('gameStore', () => {
  it('seeds two satellites with full fuel', () => {
    const sats = useGameStore.getState().satellites
    expect(sats).toHaveLength(2)
    expect(sats[0].name).toBe('HYPERION-1')
    expect(sats[0].fuel).toBe(sats[0].fuelCapacity)
  })

  it('burnCost is the vector magnitude in m/s', () => {
    expect(burnCost({ prograde: 3, normal: 4, radial: 0 })).toBeCloseTo(5, 9)
  })

  it('previewElements raises apoapsis for a prograde plan', () => {
    const sat = useGameStore.getState().satellites[0]
    const el2 = previewElements(sat, { prograde: 40, normal: 0, radial: 0 }, 1000)
    expect(apoapsis(el2)).toBeGreaterThan(apoapsis(sat.elements))
  })

  it('executeBurn applies elements, deducts fuel, clears the plan', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 30 })
    const before = useGameStore.getState().satellites[0]
    const ok = useGameStore.getState().executeBurn(500)
    const after = useGameStore.getState().satellites[0]
    expect(ok).toBe(true)
    expect(after.fuel).toBeCloseTo(before.fuel - 30, 6)
    expect(after.elements.a).toBeGreaterThan(before.elements.a)
    expect(useGameStore.getState().burnPlan).toEqual({ prograde: 0, normal: 0, radial: 0 })
  })

  it('executeBurn refuses when fuel is insufficient', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 100000 })
    const before = useGameStore.getState().satellites[0]
    expect(useGameStore.getState().executeBurn(500)).toBe(false)
    const after = useGameStore.getState().satellites[0]
    expect(after.fuel).toBe(before.fuel)
    expect(after.elements).toEqual(before.elements)
  })

  it('executeBurn with no selection is a no-op returning false', () => {
    expect(useGameStore.getState().executeBurn(0)).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests — fail** (`pnpm test`)

- [ ] **Step 4: Implement**

Create `src/lib/simTime.ts`:

```ts
/** Hyperion time: orbital motion runs 20x wall clock (spec: ~4-5 min LEO orbits). */
export const TIME_SCALE = 20

/** Simulation seconds. Deterministic from the wall clock, so the fleet advances while the app is closed. */
export function simNow(): number {
  return (Date.now() / 1000) * TIME_SCALE
}
```

Create `src/state/gameStore.ts`:

```ts
import { create } from 'zustand'
import {
  applyDeltaV, MS_TO_ER, type OrbitalElements,
} from '@/lib/orbits'

export interface Satellite {
  id: string
  name: string
  elements: OrbitalElements
  /** Remaining delta-v budget, m/s. */
  fuel: number
  fuelCapacity: number
}

export interface BurnPlan {
  prograde: number // m/s
  normal: number
  radial: number
}

const ZERO_PLAN: BurnPlan = { prograde: 0, normal: 0, radial: 0 }

const deg = (d: number) => (d * Math.PI) / 180

function seedFleet(): Satellite[] {
  return [
    {
      id: 'hyp-1',
      name: 'HYPERION-1',
      elements: { a: (6371 + 420) / 6371, e: 0.0012, i: deg(51.6), raan: 0.8, argp: 0.3, m0: 0, epoch: 0 },
      fuel: 450, fuelCapacity: 450,
    },
    {
      id: 'hyp-2',
      name: 'HYPERION-2',
      elements: { a: (6371 + 780) / 6371, e: 0.002, i: deg(97.5), raan: 2.4, argp: 1.1, m0: 2.0, epoch: 0 },
      fuel: 380, fuelCapacity: 380,
    },
  ]
}

export function burnCost(p: BurnPlan): number {
  return Math.hypot(p.prograde, p.normal, p.radial)
}

export function previewElements(sat: Satellite, plan: BurnPlan, at: number): OrbitalElements {
  return applyDeltaV(sat.elements, at, {
    prograde: plan.prograde * MS_TO_ER,
    normal: plan.normal * MS_TO_ER,
    radial: plan.radial * MS_TO_ER,
  })
}

interface GameState {
  satellites: Satellite[]
  selectedId: string | null
  burnPlan: BurnPlan
  select(id: string | null): void
  setBurnPlan(p: Partial<BurnPlan>): void
  resetBurnPlan(): void
  /** Apply the current plan to the selected satellite at sim time `at`. Returns success. */
  executeBurn(at: number): boolean
  resetForTest(): void
}

export const useGameStore = create<GameState>((set, get) => ({
  satellites: seedFleet(),
  selectedId: null,
  burnPlan: { ...ZERO_PLAN },

  select: (id) => set({ selectedId: id, burnPlan: { ...ZERO_PLAN } }),

  setBurnPlan: (p) => set((s) => ({ burnPlan: { ...s.burnPlan, ...p } })),

  resetBurnPlan: () => set({ burnPlan: { ...ZERO_PLAN } }),

  executeBurn: (at) => {
    const { satellites, selectedId, burnPlan } = get()
    const sat = satellites.find((s) => s.id === selectedId)
    if (!sat) return false
    const cost = burnCost(burnPlan)
    if (cost <= 0 || cost > sat.fuel) return false
    const elements = previewElements(sat, burnPlan, at)
    set({
      satellites: satellites.map((s) =>
        s.id === sat.id ? { ...s, elements, fuel: s.fuel - cost } : s,
      ),
      burnPlan: { ...ZERO_PLAN },
    })
    return true
  },

  resetForTest: () => set({ satellites: seedFleet(), selectedId: null, burnPlan: { ...ZERO_PLAN } }),
}))
```

- [ ] **Step 5: Run tests — all pass** (`pnpm test`)

- [ ] **Step 6: Commit**

```bash
git add src/lib/simTime.ts src/state/gameStore.ts src/state/gameStore.test.ts package.json pnpm-lock.yaml
git commit -m "feat: sim time, zustand game store with seed fleet and burn execution"
```

---

### Task 4: SatelliteLayer — markers, ribbons, ghost preview, selection

**Files:**
- Create: `src/engine/SatelliteLayer.ts`
- Modify: `src/engine/GlobeEngine.ts`
- Modify: `src/state/gameStore.ts` (add the non-reactive `previewAt` field — see the note after Step 1)

**Interfaces:**
- Consumes: orbits module, `simNow`, `useGameStore` (zustand stores are framework-free: `useGameStore.getState()` / `.subscribe()` — this does NOT import React).
- Produces: `class SatelliteLayer { readonly group: THREE.Group; update(simTime: number): void; pickSatelliteId(raycaster: THREE.Raycaster): string | null; dispose(): void }`; `GlobeEngine` adds the layer to the scene, updates it each frame, and wires pointer picking (click = select, small pointer travel distinguishes click from drag).

- [ ] **Step 1: Write the layer**

Create `src/engine/SatelliteLayer.ts`:

```ts
import * as THREE from 'three'
import { orbitPathPoints, propagate, sceneFromEci } from '@/lib/orbits'
import { useGameStore, previewElements, burnCost } from '@/state/gameStore'

const ACCENT = 0x45d8ff
const GHOST = 0xffb86b
const SELECTED = 0xa8ecff

/** Renders the fleet: marker + orbit ribbon per satellite, plus the burn-preview ghost orbit. */
export class SatelliteLayer {
  readonly group = new THREE.Group()
  private markers = new Map<string, THREE.Mesh>()
  private hits = new Map<string, THREE.Mesh>()
  private ribbons = new Map<string, THREE.LineLoop>()
  private ghost: THREE.LineLoop
  private unsubscribe: () => void

  constructor() {
    const ghostGeom = new THREE.BufferGeometry()
    this.ghost = new THREE.LineLoop(
      ghostGeom,
      new THREE.LineBasicMaterial({ color: GHOST, transparent: true, opacity: 0.85 }),
    )
    this.ghost.visible = false
    this.group.add(this.ghost)

    this.rebuild()
    this.unsubscribe = useGameStore.subscribe((state, prev) => {
      if (state.satellites !== prev.satellites || state.selectedId !== prev.selectedId) {
        this.rebuild()
      }
      if (state.burnPlan !== prev.burnPlan || state.selectedId !== prev.selectedId || state.satellites !== prev.satellites) {
        this.rebuildGhost()
      }
    })
  }

  private clearSatObjects() {
    for (const map of [this.markers, this.hits, this.ribbons] as const) {
      for (const obj of map.values()) {
        this.group.remove(obj)
        obj.geometry.dispose()
        ;(obj.material as THREE.Material).dispose()
      }
      map.clear()
    }
  }

  private rebuild() {
    this.clearSatObjects()
    const { satellites, selectedId } = useGameStore.getState()
    for (const sat of satellites) {
      const selected = sat.id === selectedId

      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(selected ? 0.02 : 0.014),
        new THREE.MeshBasicMaterial({ color: selected ? SELECTED : ACCENT }),
      )
      this.group.add(marker)
      this.markers.set(sat.id, marker)

      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.06),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      hit.userData.satelliteId = sat.id
      this.group.add(hit)
      this.hits.set(sat.id, hit)

      const pts = orbitPathPoints(sat.elements, 160).map(sceneFromEci)
      const ribbon = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: selected ? SELECTED : ACCENT,
          transparent: true,
          opacity: selected ? 0.85 : 0.35,
        }),
      )
      this.group.add(ribbon)
      this.ribbons.set(sat.id, ribbon)
    }
  }

  private rebuildGhost() {
    const { satellites, selectedId, burnPlan } = useGameStore.getState()
    const sat = satellites.find((s) => s.id === selectedId)
    if (!sat || burnCost(burnPlan) <= 0) {
      this.ghost.visible = false
      return
    }
    const el = previewElements(sat, burnPlan, useGameStore.getState().previewAt ?? 0)
    const pts = orbitPathPoints(el, 160).map(sceneFromEci)
    this.ghost.geometry.dispose()
    this.ghost.geometry = new THREE.BufferGeometry().setFromPoints(pts)
    this.ghost.visible = true
  }

  /** Position markers along their orbits. Call every frame with simNow(). */
  update(simTime: number) {
    // Ghost preview is pinned to "now" so the plan reflects burning immediately.
    useGameStore.getState().previewAt = simTime
    const { satellites } = useGameStore.getState()
    for (const sat of satellites) {
      const p = sceneFromEci(propagate(sat.elements, simTime).position)
      this.markers.get(sat.id)?.position.copy(p)
      this.hits.get(sat.id)?.position.copy(p)
    }
  }

  pickSatelliteId(raycaster: THREE.Raycaster): string | null {
    const objs = [...this.hits.values()]
    const hit = raycaster.intersectObjects(objs, false)[0]
    return hit ? ((hit.object.userData.satelliteId as string) ?? null) : null
  }

  dispose() {
    this.unsubscribe()
    this.clearSatObjects()
    this.ghost.geometry.dispose()
    ;(this.ghost.material as THREE.Material).dispose()
  }
}
```

**Note on `previewAt`:** add it to the store as a plain mutable numeric field (not reactive state — it changes every frame). In `src/state/gameStore.ts` extend the interface: `previewAt?: number` inside `GameState`, initialized to `0` in the creator: `previewAt: 0,`. Assigning `useGameStore.getState().previewAt = simTime` mutates without notifying subscribers — intentional; the ghost rebuild reads it lazily when the plan changes.

- [ ] **Step 2: Integrate with the engine**

In `src/engine/GlobeEngine.ts`:

Imports:

```ts
import { SatelliteLayer } from '@/engine/SatelliteLayer'
import { simNow } from '@/lib/simTime'
import { useGameStore } from '@/state/gameStore'
```

Fields:

```ts
private satLayer: SatelliteLayer
private pointerDown: { x: number; y: number } | null = null
```

Constructor (after atmosphere/clouds setup):

```ts
this.satLayer = new SatelliteLayer()
this.scene.add(this.satLayer.group)

canvas.addEventListener('pointerdown', this.onPointerDown)
canvas.addEventListener('pointerup', this.onPointerUp)
```

Handlers (class fields, arrow functions so `this` binds):

```ts
private onPointerDown = (ev: PointerEvent) => {
  this.pointerDown = { x: ev.clientX, y: ev.clientY }
}

private onPointerUp = (ev: PointerEvent) => {
  const down = this.pointerDown
  this.pointerDown = null
  if (!down) return
  if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 6) return // drag, not click

  const rect = this.canvas.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((ev.clientX - rect.left) / rect.width) * 2 - 1,
    -((ev.clientY - rect.top) / rect.height) * 2 + 1,
  )
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, this.camera)
  const id = this.satLayer.pickSatelliteId(raycaster)
  useGameStore.getState().select(id)
}
```

In `update()` (after the sun/clouds logic):

```ts
this.satLayer.update(simNow())
```

In `dispose()` (before renderer disposal):

```ts
this.canvas.removeEventListener('pointerdown', this.onPointerDown)
this.canvas.removeEventListener('pointerup', this.onPointerUp)
this.satLayer.dispose()
```

Note: the constructor parameter is `private canvas` already — the handlers use `this.canvas`.

- [ ] **Step 3: Verification gate**

Run: `pnpm exec tsc --noEmit` (clean), `pnpm test` (all green), `pnpm e2e` (smoke gate green — the canvas probe and console-error checks must survive the new layer). Then `pnpm dev`: two cyan markers riding visible orbit ribbons around the globe; a full LEO lap takes ~4–5 minutes; clicking a marker brightens its ribbon.

- [ ] **Step 4: Commit**

```bash
git add src/engine/SatelliteLayer.ts src/engine/GlobeEngine.ts src/state/gameStore.ts
git commit -m "feat: satellite layer with orbit ribbons, click selection, ghost preview"
```

---

### Task 5: Fleet panel + burn planner HUD

**Files:**
- Create: `src/components/FleetPanel.tsx`
- Modify: `src/components/Hud.tsx`

**Interfaces:**
- Consumes: `useGameStore`, `burnCost`, orbits telemetry (`propagate`, `ER_KM`), `simNow`.
- Produces: right-side situation-room panel — fleet list with live telemetry, burn planner (three Δv inputs, cost, fuel bar, EXECUTE/RESET), all inside the existing Hud overlay (`pointer-events-auto` on the panel only).

- [ ] **Step 1: Build the panel**

Create `src/components/FleetPanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useGameStore, burnCost, type Satellite } from '@/state/gameStore'
import { propagate, ER_KM } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'

function telemetry(sat: Satellite) {
  const { position, velocity } = propagate(sat.elements, simNow())
  return {
    altKm: (position.length() - 1) * ER_KM,
    speedKms: velocity.length() * ER_KM,
  }
}

function DvField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[11px]">
      <span className="w-20 opacity-70">{label}</span>
      <input
        type="range" min={-120} max={120} step={1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      <span className="w-14 text-right tabular-nums">{value} m/s</span>
    </label>
  )
}

export default function FleetPanel() {
  const satellites = useGameStore((s) => s.satellites)
  const selectedId = useGameStore((s) => s.selectedId)
  const burnPlan = useGameStore((s) => s.burnPlan)
  const select = useGameStore((s) => s.select)
  const setBurnPlan = useGameStore((s) => s.setBurnPlan)
  const resetBurnPlan = useGameStore((s) => s.resetBurnPlan)
  const executeBurn = useGameStore((s) => s.executeBurn)

  // Re-render telemetry at 4 Hz
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [])

  const selected = satellites.find((s) => s.id === selectedId) ?? null
  const cost = burnCost(burnPlan)
  const canExecute = !!selected && cost > 0 && cost <= (selected?.fuel ?? 0)

  return (
    <aside className="pointer-events-auto fixed right-6 top-16 z-20 w-72 space-y-3 font-mono text-xs text-[var(--text)]">
      <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
        <h2 className="mb-2 text-[10px] tracking-[0.35em] text-[var(--accent)]">FLEET</h2>
        <ul className="space-y-2">
          {satellites.map((sat) => {
            const t = telemetry(sat)
            const isSel = sat.id === selectedId
            return (
              <li key={sat.id}>
                <button
                  onClick={() => select(isSel ? null : sat.id)}
                  className={`w-full rounded border px-2 py-1.5 text-left transition ${
                    isSel ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-semibold">{sat.name}</span>
                    <span className="tabular-nums opacity-70">{t.altKm.toFixed(0)} km</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between tabular-nums opacity-70">
                    <span>{t.speedKms.toFixed(2)} km/s</span>
                    <span>Δv {sat.fuel.toFixed(0)}/{sat.fuelCapacity} m/s</span>
                  </span>
                  <span className="mt-1 block h-1 w-full rounded bg-white/10">
                    <span
                      className="block h-1 rounded bg-[var(--accent)]"
                      style={{ width: `${(sat.fuel / sat.fuelCapacity) * 100}%` }}
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      {selected && (
        <section className="rounded border border-white/10 bg-black/55 p-3 backdrop-blur">
          <h2 className="mb-2 text-[10px] tracking-[0.35em] text-[#ffb86b]">BURN PLAN — {selected.name}</h2>
          <div className="space-y-2">
            <DvField label="PROGRADE" value={burnPlan.prograde} onChange={(v) => setBurnPlan({ prograde: v })} />
            <DvField label="NORMAL" value={burnPlan.normal} onChange={(v) => setBurnPlan({ normal: v })} />
            <DvField label="RADIAL" value={burnPlan.radial} onChange={(v) => setBurnPlan({ radial: v })} />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="tabular-nums opacity-80">cost {cost.toFixed(1)} m/s</span>
            <span className="flex gap-2">
              <button
                onClick={resetBurnPlan}
                className="rounded border border-white/15 px-2 py-1 hover:border-white/40"
              >
                RESET
              </button>
              <button
                onClick={() => executeBurn(simNow())}
                disabled={!canExecute}
                className="rounded border border-[#ffb86b] px-2 py-1 text-[#ffb86b] transition enabled:hover:bg-[#ffb86b]/15 disabled:opacity-30"
              >
                EXECUTE
              </button>
            </span>
          </div>
        </section>
      )}
    </aside>
  )
}
```

- [ ] **Step 2: Mount it in the HUD**

In `src/components/Hud.tsx`, import and render inside the overlay root (after `<header>`):

```tsx
import FleetPanel from '@/components/FleetPanel'
```

```tsx
      <FleetPanel />
```

- [ ] **Step 3: Verification gate**

`pnpm exec tsc --noEmit`, `pnpm test`, `pnpm e2e` all green. `pnpm dev`: FLEET panel lists both birds with live altitude/speed ticking; selecting shows BURN PLAN; dragging PROGRADE shows the amber ghost orbit growing on the globe; EXECUTE deducts fuel, the real ribbon jumps to the ghost, plan resets.

- [ ] **Step 4: Commit**

```bash
git add src/components/FleetPanel.tsx src/components/Hud.tsx
git commit -m "feat: fleet panel with live telemetry and burn planner HUD"
```

---

### Task 6: E2E coverage + docs

**Files:**
- Modify: `e2e/globe.spec.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the running app.
- Produces: extended smoke gate covering fleet interaction.

- [ ] **Step 1: Extend the smoke test**

Append a second test to `e2e/globe.spec.ts`:

```ts
test('fleet panel selects a satellite and plans a burn', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('HYPERION-1')).toBeVisible()
  await expect(page.getByText('HYPERION-2')).toBeVisible()

  await page.getByRole('button', { name: /HYPERION-1/ }).click()
  await expect(page.getByText(/BURN PLAN — HYPERION-1/)).toBeVisible()

  // Plan a prograde burn via keyboard on the slider
  const slider = page.locator('input[type="range"]').first()
  await slider.focus()
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByText(/cost 2[0-9]\.[0-9] m\/s/)).toBeVisible()

  const execute = page.getByRole('button', { name: 'EXECUTE' })
  await expect(execute).toBeEnabled()
  await execute.click()
  // Plan resets after execution
  await expect(page.getByText(/cost 0\.0 m\/s/)).toBeVisible()
})
```

- [ ] **Step 2: Run the gate**

Run: `pnpm e2e`
Expected: 2 passed.

- [ ] **Step 3: Update README status**

In `README.md`, change the Status line to:

```markdown
**Status:** Plan 2 (orbital fleet — Keplerian mechanics, burn planner) complete.
```

- [ ] **Step 4: Full gate + commit**

```bash
pnpm test && pnpm e2e
git add e2e/globe.spec.ts README.md
git commit -m "test: fleet-interaction smoke coverage; README status"
```
