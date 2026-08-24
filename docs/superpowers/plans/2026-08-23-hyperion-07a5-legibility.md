# HYPERION Plan 7A.5: Legibility & Pacing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HYPERION's core loop teach and guide itself. From a controller playtest of shipped Plan 7A: the loop *works and rewards you* (found → accept → intercept → complete → §+REP), but it plays like an untutored orbital-mechanics puzzle — the intercept tool is hidden until you select a satellite, the burn sliders are guess-the-direction, you can't tell which of 5 satellites can reach a target, and a "green" solution is often a far-future pass (dead waiting). This plan fixes exactly those: surface the best satellite at a glance, tell the player which way to burn, show when the pass actually happens, add a contextual next-step nudge, tame the giant events list, and loosen early deadlines.

**Architecture:** Two small pure additions to `src/lib/intercept.ts` (TDD) — a "first pass within radius" ETA and a "which NORMAL direction helps" hint — drive the UI. The existing HUD components gain guidance: `FleetPanel` shows each satellite's closest-approach to the targeted contract (best bird highlighted); `InterceptReadout` shows a directional burn hint + near-term pass ETA; a new lightweight `GuidanceHint` gives the contextual next step; `EventsPanel` collapses by default. One economy tuning (more deadline headroom). No new dependencies.

**Tech Stack:** Existing (Next.js, Three.js, zustand, vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-08-23-hyperion-game-layer-design.md` (this refines the §4 maneuver-to-intercept "fairness guarantee" and §10 UX-shell legibility that Plan 7A implemented but under-delivered on).

## Global Constraints

- Port **3100** only (`lsof -ti:3100 | xargs kill -9` to clear).
- Engine code must not import React; React bridges through zustand stores (unchanged).
- Distance = Earth radii scene units; ground distance in km; `COMPLETION_RADIUS_KM = 500` (unchanged).
- Sim time is 20× wall (`TIME_SCALE` from `src/lib/simTime.ts`); all player-facing times display in WALL seconds (divide sim-seconds by `TIME_SCALE`) — Plan 7A already did this for countdowns; keep it.
- Additive only: do not regress the shipped loop (found → accept → select → burn → complete → reward). Existing e2e (6 tests) must stay green.
- Gates: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm e2e` all green. Commit prefixes `feat:`/`fix:`/`test:`/`chore:`.

---

### Task 1: Intercept guidance helpers — first-pass ETA + NORMAL direction hint (TDD)

**Files:**
- Modify: `src/lib/intercept.ts`
- Test: `src/lib/intercept.test.ts` (append)

**Interfaces:**
- Consumes: existing `closestApproach`, `groundDistanceKm`, `subPoint`; `applyDeltaV` + `MS_TO_ER` from `@/lib/orbits`.
- Produces:
  - `firstPassEta(el: OrbitalElements, target: GeoTarget, fromT: number, windowSec: number, radiusKm: number, stepSec?: number): number | null` — the earliest offset (seconds from `fromT`) at which the sub-point is within `radiusKm` of the target; `null` if never within the window. This is the "when does the pass actually complete" time (near-term), distinct from `closestApproach`'s global-minimum ETA.
  - `normalHint(el: OrbitalElements, target: GeoTarget, now: number, windowSec: number, dvMs?: number): -1 | 0 | 1` — tests a small ±NORMAL burn (default `dvMs = 40`) and returns the sign that most reduces closest approach (−1 = burn NORMAL negative, +1 = positive), or `0` if neither meaningfully helps (already optimal/green or symmetric).

- [ ] **Step 1: Append failing tests**

Append to `src/lib/intercept.test.ts`. **Import hygiene:** the file already imports `orbitalPeriod, type OrbitalElements` from `./orbits` at the top — merge the new `./orbits` names (`applyDeltaV`, `MS_TO_ER`) into that existing top-of-file import and add `firstPassEta, normalHint` to the existing `./intercept` import, rather than adding duplicate import lines mid-file. The test code below shows the names used; place all imports at the top.

```ts
import { firstPassEta, normalHint } from './intercept'
import { orbitalPeriod } from './orbits'

describe('firstPassEta', () => {
  it('returns a near-term offset for a target on the current track', () => {
    const target = subPoint(iss, 4000) // sat is directly over this at t=4000
    const eta = firstPassEta(iss, target, 3000, 3000, COMPLETION_RADIUS_KM)
    expect(eta).not.toBeNull()
    expect(eta!).toBeGreaterThanOrEqual(0)
    expect(eta!).toBeLessThanOrEqual(3000)
    // Earliest entry into the disk is at/just before the exact overhead moment (~1000s in).
    expect(eta!).toBeLessThan(1100)
  })
  it('returns null for an unreachable target (a pole for a 51.6° orbit)', () => {
    const T = orbitalPeriod(iss.a)
    expect(firstPassEta(iss, { lat: 90, lon: 0 }, 0, 2 * T, COMPLETION_RADIUS_KM)).toBeNull()
  })
})

describe('normalHint', () => {
  it('returns a non-zero direction when a target is just off the track', () => {
    // A point offset ~2° in latitude from a sub-point is reachable by a small plane nudge.
    const sp = subPoint(iss, 5000)
    const offTarget = { lat: sp.lat + 2, lon: sp.lon }
    const hint = normalHint(iss, offTarget, 5000 - orbitalPeriod(iss.a), 2 * orbitalPeriod(iss.a))
    expect([-1, 1]).toContain(hint)
  })
  it('the hinted direction actually reduces closest approach', () => {
    const sp = subPoint(iss, 5000)
    const offTarget = { lat: sp.lat + 2, lon: sp.lon }
    const now = 5000 - orbitalPeriod(iss.a)
    const win = 2 * orbitalPeriod(iss.a)
    const hint = normalHint(iss, offTarget, now, win)
    if (hint !== 0) {
      const base = closestApproach(iss, offTarget, now, win).closestKm
      // apply the hinted 40 m/s and confirm it's not worse
      const nudged = closestApproach(applyDeltaVForTest(iss, now, hint * 40), offTarget, now, win).closestKm
      expect(nudged).toBeLessThanOrEqual(base + 1)
    }
  })
})

// local helper mirroring intercept's internal NORMAL burn, for the assertion above
import { applyDeltaV, MS_TO_ER } from './orbits'
function applyDeltaVForTest(el: typeof iss, t: number, normalMs: number) {
  return applyDeltaV(el, t, { prograde: 0, normal: normalMs * MS_TO_ER, radial: 0 })
}
```

- [ ] **Step 2: Run — RED** (`pnpm test`, cannot resolve `firstPassEta`/`normalHint`)

- [ ] **Step 3: Implement** — append to `src/lib/intercept.ts` (add `applyDeltaV`, `MS_TO_ER` to the existing orbits import at the top):

```ts
import { propagate, sceneFromEci, applyDeltaV, MS_TO_ER, type OrbitalElements } from './orbits'
```

(Replace the existing `import { propagate, sceneFromEci, type OrbitalElements } from './orbits'` line with the above.)

Then append these functions:

```ts
/** Earliest offset (seconds from fromT) at which the satellite is within radiusKm of the target; null if never in the window. */
export function firstPassEta(
  el: OrbitalElements,
  target: GeoTarget,
  fromT: number,
  windowSec: number,
  radiusKm: number,
  stepSec = Math.max(5, windowSec / 400),
): number | null {
  for (let t = fromT; t <= fromT + windowSec; t += stepSec) {
    if (groundDistanceKm(el, t, target) <= radiusKm) return t - fromT
  }
  return null
}

/** Which NORMAL burn direction most reduces closest approach: -1, +1, or 0 (neither meaningfully helps). */
export function normalHint(
  el: OrbitalElements,
  target: GeoTarget,
  now: number,
  windowSec: number,
  dvMs = 40,
): -1 | 0 | 1 {
  const base = closestApproach(el, target, now, windowSec).closestKm
  const plus = closestApproach(
    applyDeltaV(el, now, { prograde: 0, normal: dvMs * MS_TO_ER, radial: 0 }),
    target, now, windowSec,
  ).closestKm
  const minus = closestApproach(
    applyDeltaV(el, now, { prograde: 0, normal: -dvMs * MS_TO_ER, radial: 0 }),
    target, now, windowSec,
  ).closestKm
  const EPS = 2 // km — ignore negligible differences
  if (plus < base - EPS && plus <= minus) return 1
  if (minus < base - EPS && minus < plus) return -1
  return 0
}
```

- [ ] **Step 4: Run — GREEN**, `pnpm exec tsc --noEmit` clean

- [ ] **Step 5: Commit**

```bash
git add src/lib/intercept.ts src/lib/intercept.test.ts
git commit -m "feat: intercept guidance — first-pass ETA and NORMAL direction hint"
```

---

### Task 2: Fleet list shows each satellite's closest-approach to the target (pick the right bird)

**Files:**
- Modify: `src/components/FleetPanel.tsx`

**Interfaces:**
- Consumes: `useContractStore` (targeted active contract), `closestApproach` + `COMPLETION_RADIUS_KM` (intercept), `orbitalPeriod` (orbits), `simNow`.
- Produces: when there is a targeted active contract, each satellite row in FleetPanel shows its current closest-approach km to that target with a green (≤500) / amber marker, and the best (lowest) satellite gets a "◀ best" badge — so the player can see at a glance which satellite to task, instead of selecting each one to check.

- [ ] **Step 1: Read the current `src/components/FleetPanel.tsx`.** It already re-renders at 4 Hz (a `force`/interval) and computes a `telemetry(sat)` per row. Add contract-aware intercept display.

- [ ] **Step 2: Add imports** (merge with existing where present):

```tsx
import { useContractStore } from '@/state/contractStore'
import { closestApproach, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import { orbitalPeriod } from '@/lib/orbits'
```

- [ ] **Step 3: Compute the target + per-satellite closest-approach.** Near the other store hooks in the component body:

```tsx
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const target =
    contracts.find((c) => c.id === targetId && c.status === 'active') ??
    contracts.find((c) => c.status === 'active') ?? null
```

Inside the render, before mapping satellites, compute each satellite's closest approach (only when a target and after `mounted`, to stay hydration-safe):

```tsx
  const approaches = new Map<string, number>()
  if (mounted && target) {
    const now = simNow()
    for (const sat of satellites) {
      approaches.set(
        sat.id,
        closestApproach(sat.elements, { lat: target.lat, lon: target.lon }, now, 3 * orbitalPeriod(sat.elements.a)).closestKm,
      )
    }
  }
  const bestId =
    approaches.size > 0
      ? [...approaches.entries()].sort((a, b) => a[1] - b[1])[0][0]
      : null
```

(`satellites` and `mounted` already exist in FleetPanel from Plan 7A.)

- [ ] **Step 4: Render the per-row intercept line.** Inside each satellite `<button>` row, below the existing altitude/speed/fuel line, add (only when a target exists):

```tsx
                {target && approaches.has(sat.id) && (
                  <span className="mt-0.5 flex items-center justify-between text-[10px]">
                    <span className={approaches.get(sat.id)! <= COMPLETION_RADIUS_KM ? 'text-emerald-400' : 'text-amber-400/80'}>
                      ◎ {Math.round(approaches.get(sat.id)!)} km to target
                    </span>
                    {sat.id === bestId && <span className="text-[var(--accent)]">◀ best</span>}
                  </span>
                )}
```

- [ ] **Step 5: Verify** — `pnpm exec tsc --noEmit` clean; `pnpm test` green; `pnpm lint` clean; `pnpm dev`: found → accept a contract → the fleet rows now each show "◎ NNN km to target" (green if reachable), and the closest bird shows "◀ best". No target → the line is absent (unchanged fleet look).

- [ ] **Step 6: Commit**

```bash
git add src/components/FleetPanel.tsx
git commit -m "feat: fleet list shows each satellite's closest-approach + best-bird badge"
```

---

### Task 3: Intercept readout — directional burn hint + near-term pass ETA; contextual guidance nudge

**Files:**
- Modify: `src/components/InterceptReadout.tsx`
- Create: `src/components/GuidanceHint.tsx`
- Modify: `src/components/Hud.tsx`

**Interfaces:**
- Consumes: `normalHint` + `firstPassEta` + `closestApproach` + `COMPLETION_RADIUS_KM` (intercept), `orbitalPeriod` (orbits), `TIME_SCALE`+`simNow` (simTime), `useGameStore` (selectedId, burnPlan, previewElements, burnCost), `useContractStore` (targeted active contract), `useAgencyStore` (founded).
- Produces:
  - `InterceptReadout` gains, when NOT green, a **directional hint** ("↳ nudge NORMAL ◀ to line up" / "▶") derived from `normalHint`; and when green, the **near-term pass ETA** from `firstPassEta` (wall time) instead of the global-minimum ETA — so a green solution shows *when it actually completes*, biasing the player toward near-term intercepts.
  - `GuidanceHint` — a small, dismissible bottom-center coach line that shows the current next step: no active contract → "Accept a contract →"; active but no satellite selected → "Select a satellite to plan an intercept"; selected but not green → "Drag NORMAL until the readout turns green"; green with a plan → "IGNITE, then hold SPACE to fly the burn". Founded-gated; sits just above the InterceptReadout.

- [ ] **Step 1: Read current `src/components/InterceptReadout.tsx`.** It computes `elements` (ghost when `burnCost(burnPlan)>0` else `sat.elements`), `closestApproach(..., now, 3*period)`, `ok`, and shows "closest N km … pass in Xm Ys" with wall-time ETA. Extend it.

- [ ] **Step 2: Add imports** to InterceptReadout:

```tsx
import { closestApproach, COMPLETION_RADIUS_KM, firstPassEta, normalHint } from '@/lib/intercept'
import { TIME_SCALE } from '@/lib/simTime'
```

(Keep the existing `orbitalPeriod`, `simNow`, store imports.)

- [ ] **Step 3: Compute hint + near-term ETA.** After computing `elements`, `period`, and the existing `closestApproach` result (`closestKm`, `etaSec`) and `ok`, add:

```tsx
  const windowSec = 3 * period
  const hint = ok ? 0 : normalHint(elements, { lat: target.lat, lon: target.lon }, now, windowSec)
  const passEtaSec = ok
    ? (firstPassEta(elements, { lat: target.lat, lon: target.lon }, now, windowSec, COMPLETION_RADIUS_KM) ?? etaSec)
    : etaSec
  const etaWall = passEtaSec / TIME_SCALE
  const etaMin = Math.floor(etaWall / 60)
  const etaS = Math.round(etaWall % 60)
```

(Replace any existing `etaWall`/`etaMin` derivation with the above so green uses the near-term first-pass ETA.)

- [ ] **Step 4: Render the hint.** In the readout's text, when `!ok`, append the direction hint; keep the green ✓ path. Update the inner content to:

```tsx
        <span className="tabular-nums font-semibold">
          closest {Math.round(closestKm)} km{' '}
          {ok
            ? `✓ · ${planning ? 'ghost ' : ''}pass in ${etaMin}m ${etaS}s`
            : `(need ≤${COMPLETION_RADIUS_KM}) · ${hint === 0 ? 'try a NORMAL burn' : `nudge NORMAL ${hint < 0 ? '◀' : '▶'}`}`}
        </span>
```

- [ ] **Step 5: Build `GuidanceHint`** — create `src/components/GuidanceHint.tsx`:

```tsx
'use client'

import { useAgencyStore } from '@/state/agencyStore'
import { useContractStore } from '@/state/contractStore'
import { useGameStore, burnCost, previewElements } from '@/state/gameStore'
import { closestApproach, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import { orbitalPeriod } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'
import { useEffect, useState } from 'react'

export default function GuidanceHint() {
  const founded = useAgencyStore((s) => s.founded)
  const contracts = useContractStore((s) => s.contracts)
  const targetId = useContractStore((s) => s.targetId)
  const selectedId = useGameStore((s) => s.selectedId)
  const satellites = useGameStore((s) => s.satellites)
  const burnPlan = useGameStore((s) => s.burnPlan)
  const burnSession = useGameStore((s) => s.burnSession)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [])

  if (!founded || burnSession) return null

  const active = contracts.filter((c) => c.status === 'active')
  const target = contracts.find((c) => c.id === targetId && c.status === 'active') ?? active[0] ?? null
  const sat = satellites.find((s) => s.id === selectedId) ?? null

  let step: string | null = null
  if (active.length === 0) step = 'Accept a contract from the CONTRACTS panel →'
  else if (!sat) step = '① Select a satellite (fleet panel or click it) to plan an intercept'
  else if (target) {
    const now = simNow()
    const planning = burnCost(burnPlan) > 0
    const elements = planning ? previewElements(sat, burnPlan, now) : sat.elements
    const closest = closestApproach(elements, { lat: target.lat, lon: target.lon }, now, 3 * orbitalPeriod(elements.a)).closestKm
    step = closest <= COMPLETION_RADIUS_KM
      ? '③ Locked on — IGNITE, then hold SPACE to fly the burn'
      : '② Drag NORMAL until the intercept readout turns green'
  }
  if (!step) return null

  return (
    <div className="pointer-events-none fixed bottom-16 left-1/2 z-20 -translate-x-1/2 font-mono text-xs">
      <div className="rounded-full border border-[var(--accent)]/30 bg-black/60 px-4 py-1 text-[var(--accent)] backdrop-blur">
        {step}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Mount `GuidanceHint`** in `src/components/Hud.tsx` (before FoundingScreen, near InterceptReadout):

```tsx
import GuidanceHint from '@/components/GuidanceHint'
```

```tsx
      <GuidanceHint />
```

- [ ] **Step 7: Verify** — `tsc` clean; `pnpm test` green; `pnpm lint` clean; `pnpm dev`: with a contract active and no satellite selected, the guidance line reads "① Select a satellite…"; select one → "② Drag NORMAL until … green"; the intercept readout shows "nudge NORMAL ◀/▶" until green; once green it reads "③ IGNITE, then hold SPACE" and the readout's "pass in" reflects the near-term pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/InterceptReadout.tsx src/components/GuidanceHint.tsx src/components/Hud.tsx
git commit -m "feat: directional burn hint, near-term pass ETA, contextual guidance nudge"
```

---

### Task 4: Tame the events list + loosen early deadlines

**Files:**
- Modify: `src/components/EventsPanel.tsx`
- Modify: `src/lib/economy.ts`
- Test: `src/lib/economy.test.ts` (update the deadline test)

**Interfaces:**
- Produces: EventsPanel collapses to a short list by default with a toggle (the 100+ item wall no longer dominates the screen); `contractDeadline` gives more headroom (3 → 5 orbital periods) so early contracts aren't lost to first-time fumbling.

- [ ] **Step 1: Collapse the events list.** Read current `src/components/EventsPanel.tsx`. It renders all events in a scrollable `<ul>`. Add a collapsed default showing the first 8, with a toggle. Add near the other `useState`:

```tsx
  const [expanded, setExpanded] = useState(false)
```

Change the list to slice when collapsed, and add a toggle button under the list. Where it currently maps `events`, map `(expanded ? events : events.slice(0, 8))`, and after the `<ul>` (inside the section, only when there are more than 8) add:

```tsx
        {events.length > 8 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 w-full rounded border border-white/10 py-1 text-[10px] opacity-70 transition hover:opacity-100"
          >
            {expanded ? 'Show less' : `Show all ${events.length} events`}
          </button>
        )}
```

Also tighten the list's max height so even expanded it never dominates: ensure the `<ul>` has `max-h-[38vh] overflow-y-auto` (adjust the existing max-h if larger).

- [ ] **Step 2: Loosen the deadline.** In `src/lib/economy.ts`, change `contractDeadline`:

```ts
/** Deadline five orbital periods after now — enough headroom to plan and fly an intercept without time pressure dominating. */
export function contractDeadline(simNow: number, periodSec: number): number {
  return simNow + 5 * periodSec
}
```

Update the test in `src/lib/economy.test.ts`:

```ts
  it('contractDeadline is five periods out', () => {
    expect(contractDeadline(1000, 5400)).toBe(1000 + 5 * 5400)
  })
```

- [ ] **Step 3: Verify** — `pnpm test` green (updated deadline test); `tsc` clean; `pnpm lint` clean; `pnpm dev`: the EVENTS panel shows ~8 items with "Show all N events"; expanding scrolls within a bounded height; accepted contracts show a longer countdown.

- [ ] **Step 4: Commit**

```bash
git add src/components/EventsPanel.tsx src/lib/economy.ts src/lib/economy.test.ts
git commit -m "feat: collapse events list by default; more contract deadline headroom"
```

---

### Task 5: E2E guidance coverage + README + full gate

**Files:**
- Modify: `e2e/globe.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Extend the contract smoke test** to assert the guidance surfaces appear. In `e2e/globe.spec.ts`, in the existing "found agency → contracts → accept" test, after accepting a contract add:

```ts
  // Guidance nudge appears telling the player the next step.
  await expect(page.getByText(/Select a satellite|Drag NORMAL|IGNITE/)).toBeVisible({ timeout: 10_000 })
```

- [ ] **Step 2: Add an events-collapse assertion** (new small test):

```ts
test('events panel is collapsed by default with a show-all toggle', async ({ page }) => {
  await foundAgency(page)
  await expect(page.getByRole('button', { name: /Show all \d+ events/ })).toBeVisible({ timeout: 20_000 })
})
```

- [ ] **Step 3: README** — update the status line:

```markdown
**Status:** Plan 7A.5 (legibility & pacing — best-bird intercept, directional burn hints, guidance nudge, near-term pass ETA, collapsed events) complete.
```

- [ ] **Step 4: Full gate + commit**

```bash
lsof -ti:3100 | xargs kill -9
pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm e2e
git add e2e/globe.spec.ts README.md
git commit -m "test: guidance + events-collapse e2e; README status"
```
