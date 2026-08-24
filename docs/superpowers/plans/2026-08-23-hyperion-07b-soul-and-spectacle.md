# HYPERION Plan 7B — Soul & Spectacle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn HYPERION's working contract loop into a game with soul and spectacle — satellites with names/specializations/records that can be lost, a per-user story identity (archetypes) that flavors the AI, scored maneuvers and trick-shots, a cinematic completion set-piece, real emergencies with stakes, a "while you were away" return ritual, first-run coaching, and shareable orbital postcards.

**Architecture:** Extend the existing zustand stores (game/agency/contract) and pure `src/lib` modules with new deterministic sub-systems (archetype leaning, maneuver scoring, contract metadata, emergencies, cold-open diff), each TDD'd in isolation. Spectacle and clickable depth are added as new engine effects (`src/engine/*`) and React overlays (`src/components/*`) driven by store state. The `/api/briefing` route is extended to carry agency identity + archetype so the LLM diverges per player. All client-side/localStorage; server-authoritative persistence stays a later plan.

**Tech Stack:** Next.js App Router (Turbopack), Three.js 0.169, zustand, vitest, Playwright, Tailwind, @anthropic-ai/sdk (`messages.parse` + zod, `claude-opus-4-8`).

**Spec:** `docs/superpowers/specs/2026-08-23-hyperion-game-layer-design.md` (§§1b, 6, 6b, 7, 7b, 8, 9, 9b, 9c, 10, 12, 13; 7B half of §14).

## Global Constraints

- **Port 3100 only** for the dev server — never 3000 (AgentZeus owns 3000).
- **API key protection:** `ANTHROPIC_API_KEY` is server-side only (`/api/*` routes). Never import it client-side; never log it; never commit it. `.env.local` is gitignored.
- **LLM invariants (unchanged):** server route only; structured outputs via zod; ALWAYS-200 with a deterministic fallback; respectful real-event framing — **never gamify casualties**; defense/intel contracts are *strategic observation/monitoring, never targeting*; the engine enforces what the LLM proposes (eventId whitelist; engine sets reward/deadline/economy, LLM proposes flavor only).
- **Architecture invariants:** engine (`src/engine/`) never imports React; React never touches Three objects — zustand bridges. Non-reactive hot fields (`previewAt`, `burnLive`) are direct-mutated, never `set()`. Camera authority order in `GlobeEngine.update()`: intro → flight → burn chase → shake. Non-rotating Earth: a satellite's ground-track is a fixed great circle; steering the plane onto a target is the core maneuver.
- **Sim time:** all propagation/deadlines/ticks funnel through `simNow()` (`src/lib/simTime.ts`, `TIME_SCALE=20`, anchored 2026-01-01). Never call `Date.now()` for game logic outside `simNow()`.
- **Resilience:** never an empty contract board (seeded deterministic contracts remain the floor); pure modules deterministic; localStorage failures degrade to a fresh session, never a crash.
- **Persistence:** localStorage via `loadJSON`/`saveJSON`/`clearKey` (`src/lib/persist.ts`). Every new persisted field must be **back-compatible**: loading an old save (missing the field) must fill a sensible default, never crash. Bump a store's persistence key only with an in-code migration; prefer additive defaults over key bumps.
- **Testing:** every new pure module is TDD'd (vitest, `src/**/*.test.ts`, `@` alias → `src`). Keep the existing 98 tests green. Extend the Playwright smoke (`e2e/`) where a task says so.
- **Copy discipline:** all player-facing strings are on-brand terse "situation-room" voice; relief copy is respectful and concrete (aid rendered, never points-for-tragedy).

---

## File Structure

**New pure modules (TDD, no React/Three imports):**
- `src/lib/archetype.ts` — 3-axis leaning math, dominant archetype, titles.
- `src/lib/contractMeta.ts` — event-kind → archetype tag + preferred capability; capability-match reward bonus.
- `src/lib/maneuverScore.ts` — efficiency/precision/grade scoring + trick-shot detection.
- `src/lib/emergency.ts` — debris-conjunction generation + resolution math.
- `src/lib/coldOpen.ts` — "while you were away" deterministic diff/summary.
- `src/lib/satelliteMeta.ts` — capability seeding, service-record helpers, callsign/loss helpers.

**New React overlays (`src/components/`):**
- `CompletionCinematic.tsx` — the completion set-piece overlay (scanning sweep UI, downlink count-up, reward tally, relief-impact line, trick-shot/streak flourish).
- `EmergencyAlert.tsx` — debris-conjunction warning + evasive-burn prompt + loss beat.
- `ColdOpenScreen.tsx` — the returning "while you were away" screen.
- `Walkthrough.tsx` — first-run coach-marks.
- `SatelliteRecordCard.tsx` — clickable satellite service-record panel.
- `PostcardButton.tsx` + `postcard.ts` (helper in `src/lib/`) — capture + composite + download.

**New engine effect (`src/engine/`):**
- `CompletionFx.ts` — the in-scene scanning-sweep + chase-lock effect at the completing pass (driven by a store event).

**Modified:**
- `src/state/gameStore.ts` — satellite meta fields (capability/commissionedAt/record), loss, streak, scoring hooks, completion-event surface.
- `src/state/agencyStore.ts` — archetype leaning + advance + persist + title.
- `src/state/contractStore.ts` — contract archetype/preferredCapability fields; capability-bonus on completion; emit completion events with detail (score/streak/relief).
- `src/lib/economy.ts` — capability-match bonus multiplier constant + helper.
- `src/app/api/briefing/route.ts` — request carries agency identity + archetype; response missions carry archetype + preferredCapability; archetype-flavored system prompt (geopolitical/nature/military-tech lanes).
- `src/components/BriefingPanel.tsx` — send identity/archetype; map new mission fields into contracts.
- `src/components/FleetPanel.tsx` — show capability + record; open SatelliteRecordCard; loss state.
- `src/components/ContractsPanel.tsx` — show archetype tag + preferred capability; match indicator.
- `src/components/GuidePanel.tsx` — stylized SVG diagrams.
- `src/components/Hud.tsx` — mount the new overlays.
- `src/engine/ContractLayer.ts` / `GlobeEngine.ts` — trigger `CompletionFx`; chase-lock on completing pass.

---

## Interfaces (authoritative names — copy verbatim)

From the current codebase (do not rename): `useGameStore`, `Satellite {id,name,elements,fuel,fuelCapacity}`, `previewElements(sat,plan,at)`, `burnCost(plan)`, `completeBurn(at,quality)`, `buySatellite()`, `useAgencyStore {founded,name,emblemId,colorway,funding,reputation, addFunding, spendFunding, addReputation, hydrate, resetForTest}` (verify the founding action's exact name in the file — `found`/`find` — and do not change it), `useContractStore {contracts, targetId, setAvailable, accept, setTarget, evaluate(satellites,simTime)→{completed,failed}, hydrate, resetForTest}`, `Contract {id,eventId,title,kind,lat,lon,deadline,reward:{funding,reputation},status}`, `COMPLETION_RADIUS_KM`, `closestApproach(el,target,fromT,windowSec,stepSec?)→{closestKm,etaSec}`, `groundDistanceKm(el,t,target)`, `subPoint(el,t)`, `firstPassEta(...)`, `normalHint(...)`, `propagate`, `applyDeltaV`, `orbitalPeriod`, `orbitPathPoints`, `sceneFromEci`, `MS_TO_ER`, `latLonToVector3`, `vector3ToLatLon`, `greatCircleKm`, `simNow`, `TIME_SCALE`, `audio {chirp,uiTick,alert,stinger,setRumble,armGesture}`, `loadJSON/saveJSON/clearKey`, `profileSummary()`, `recordBurn/recordAbort/recordSession`, `profile.lastSeen`.

---

## Task 1: Satellite specializations, callsigns & service records (data model)

**Why first:** capability + record fields are consumed by contract scoring (T3), the record card (T12), loss (T7), and the record flourish in the cinematic (T5). Land the model + migration before consumers.

**Files:**
- Create: `src/lib/satelliteMeta.ts`
- Test: `src/lib/satelliteMeta.test.ts`
- Modify: `src/state/gameStore.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Capability = 'imaging' | 'comms' | 'thermal'
  export interface ServiceRecord {
    contractsCompleted: number
    notablePasses: string[]   // short strings, e.g. "Trick-shot over Luzon · SD 41"
    commissionedAt: number    // sim seconds
  }
  export const CAPABILITY_LABEL: Record<Capability, string>  // 'imaging'→'OPTICAL', 'comms'→'RELAY', 'thermal'→'THERMAL'
  export function seedCapability(index: number): Capability   // deterministic spread: 0 imaging,1 imaging,2 comms,3 thermal,4 comms
  export function fillGapCapability(existing: Capability[]): Capability  // least-represented capability, ties → imaging
  export function freshRecord(commissionedAt: number): ServiceRecord
  export function simDaysInOrbit(commissionedAt: number, now: number): number  // (now-commissionedAt)/86400, floor, min 0
  ```
- Consumes: `Satellite` from gameStore (add optional fields, back-compat).

- [ ] **Step 1: Write failing tests** (`src/lib/satelliteMeta.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { seedCapability, fillGapCapability, freshRecord, simDaysInOrbit, CAPABILITY_LABEL } from './satelliteMeta'

describe('satelliteMeta', () => {
  it('seeds a deterministic capability spread across the starting fleet', () => {
    const caps = [0,1,2,3,4].map(seedCapability)
    expect(caps).toEqual(['imaging','imaging','comms','thermal','comms'])
  })
  it('fills the least-represented capability', () => {
    expect(fillGapCapability(['imaging','imaging','comms'])).toBe('thermal')
    expect(fillGapCapability(['imaging','comms','thermal'])).toBe('imaging') // tie → imaging
  })
  it('freshRecord starts empty at the commission time', () => {
    const r = freshRecord(123)
    expect(r).toEqual({ contractsCompleted: 0, notablePasses: [], commissionedAt: 123 })
  })
  it('simDaysInOrbit floors elapsed sim-days and never goes negative', () => {
    expect(simDaysInOrbit(0, 86400 * 3.7)).toBe(3)
    expect(simDaysInOrbit(100, 0)).toBe(0)
  })
  it('exposes on-brand capability labels', () => {
    expect(CAPABILITY_LABEL.imaging).toBe('OPTICAL')
    expect(CAPABILITY_LABEL.comms).toBe('RELAY')
    expect(CAPABILITY_LABEL.thermal).toBe('THERMAL')
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/lib/satelliteMeta.test.ts`) — "Cannot find module".

- [ ] **Step 3: Implement `src/lib/satelliteMeta.ts`**

```ts
export type Capability = 'imaging' | 'comms' | 'thermal'

export interface ServiceRecord {
  contractsCompleted: number
  notablePasses: string[]
  commissionedAt: number
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  imaging: 'OPTICAL',
  comms: 'RELAY',
  thermal: 'THERMAL',
}

const SEED: Capability[] = ['imaging', 'imaging', 'comms', 'thermal', 'comms']

export function seedCapability(index: number): Capability {
  return SEED[index] ?? (['imaging', 'comms', 'thermal'][index % 3] as Capability)
}

export function fillGapCapability(existing: Capability[]): Capability {
  const order: Capability[] = ['imaging', 'comms', 'thermal']
  const count = (c: Capability) => existing.filter((x) => x === c).length
  return order.reduce((best, c) => (count(c) < count(best) ? c : best), order[0])
}

export function freshRecord(commissionedAt: number): ServiceRecord {
  return { contractsCompleted: 0, notablePasses: [], commissionedAt }
}

export function simDaysInOrbit(commissionedAt: number, now: number): number {
  return Math.max(0, Math.floor((now - commissionedAt) / 86400))
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Extend the `Satellite` model in `src/state/gameStore.ts`** (additive, back-compat)
  - Add to the `Satellite` interface: `capability: Capability` and `record: ServiceRecord`.
  - Import from `@/lib/satelliteMeta`.
  - In `seedFleet()`, give each of the 5 birds `capability: seedCapability(i)` and `record: freshRecord(0)` (map with index).
  - In `buySatellite()`, set `capability: fillGapCapability(get().satellites.map(s => s.capability))` and `record: freshRecord(get().previewAt ?? 0)`.
  - In `hydrate()`, after `loadJSON`, **backfill** any satellite missing `capability`/`record`: `capability ?? seedCapability(index)`, `record ?? freshRecord(0)`. This makes old saves load cleanly.
  - Add a small action to append a notable pass and bump the completed count (consumed by T3/T5):
    ```ts
    recordContractPass(satId: string, note?: string): void
    ```
    Implementation: map satellites, on match `{ ...s, record: { ...s.record, contractsCompleted: s.record.contractsCompleted + 1, notablePasses: note ? [note, ...s.record.notablePasses].slice(0, 6) : s.record.notablePasses } }`; then `saveJSON(FLEET_KEY, { satellites: get().satellites })`.

- [ ] **Step 6: Extend the gameStore test** (`src/state/gameStore.test.ts`) — add cases: seeded fleet has 5 capabilities matching `seedCapability`; `recordContractPass` increments count and prepends a note capped at 6; hydrate backfills a legacy satellite object lacking `capability`/`record`. Run the full store test file — expect PASS.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(fleet): satellite capabilities, callsigns & service records (back-compat)"`

---

## Task 2: Agency archetypes — 3-axis leaning, dominant archetype, titles

**Files:**
- Create: `src/lib/archetype.ts`, `src/lib/archetype.test.ts`
- Modify: `src/state/agencyStore.ts`, `src/lib/economy.ts` (move/replace `rankTitle` usage — see step 5)

**Interfaces:**
- Produces:
  ```ts
  export type Archetype = 'relief' | 'research' | 'defense'
  export interface Leaning { relief: number; research: number; defense: number }
  export const ZERO_LEANING: Leaning
  export function advanceLeaning(l: Leaning, tag: Archetype, weight?: number): Leaning  // default weight 1
  export function dominantArchetype(l: Leaning): Archetype | null  // null when all zero; ties → priority relief>research>defense
  export function archetypeDescriptor(a: Archetype | null): string  // 'relief'→'Relief Command', null→'Startup Outfit'
  export function archetypeTitle(a: Archetype | null, reputation: number): string  // combines rank tier + descriptor
  ```

- [ ] **Step 1: Write failing tests** (`src/lib/archetype.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { advanceLeaning, dominantArchetype, archetypeDescriptor, archetypeTitle, ZERO_LEANING } from './archetype'

describe('archetype', () => {
  it('accumulates leaning by tag', () => {
    let l = ZERO_LEANING
    l = advanceLeaning(l, 'relief')
    l = advanceLeaning(l, 'relief', 2)
    l = advanceLeaning(l, 'defense')
    expect(l).toEqual({ relief: 3, research: 0, defense: 1 })
  })
  it('returns null dominant when unplayed', () => {
    expect(dominantArchetype(ZERO_LEANING)).toBeNull()
  })
  it('picks the dominant axis, breaking ties relief>research>defense', () => {
    expect(dominantArchetype({ relief: 2, research: 1, defense: 0 })).toBe('relief')
    expect(dominantArchetype({ relief: 2, research: 2, defense: 1 })).toBe('relief')
    expect(dominantArchetype({ relief: 0, research: 3, defense: 3 })).toBe('research')
  })
  it('descriptors are on-brand and null is Startup Outfit', () => {
    expect(archetypeDescriptor(null)).toBe('Startup Outfit')
    expect(archetypeDescriptor('defense')).toBe('Strategic Watch')
  })
  it('title combines a rank tier with the descriptor', () => {
    expect(archetypeTitle(null, 0)).toContain('Startup Outfit')
    expect(archetypeTitle('relief', 300)).toMatch(/·/)
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/lib/archetype.ts`**

```ts
export type Archetype = 'relief' | 'research' | 'defense'
export interface Leaning { relief: number; research: number; defense: number }
export const ZERO_LEANING: Leaning = { relief: 0, research: 0, defense: 0 }

const PRIORITY: Archetype[] = ['relief', 'research', 'defense']

export function advanceLeaning(l: Leaning, tag: Archetype, weight = 1): Leaning {
  return { ...l, [tag]: (l[tag] ?? 0) + weight }
}

export function dominantArchetype(l: Leaning): Archetype | null {
  const max = Math.max(l.relief, l.research, l.defense)
  if (max <= 0) return null
  return PRIORITY.find((a) => l[a] === max) ?? null
}

const DESCRIPTOR: Record<Archetype, string> = {
  relief: 'Relief Command',
  research: 'Science Directorate',
  defense: 'Strategic Watch',
}

export function archetypeDescriptor(a: Archetype | null): string {
  return a ? DESCRIPTOR[a] : 'Startup Outfit'
}

const RANKS = ['Provisional', 'Chartered', 'Established', 'Distinguished', 'Legendary']

function rankTier(reputation: number): string {
  return RANKS[Math.min(RANKS.length - 1, Math.floor(reputation / 120))]
}

export function archetypeTitle(a: Archetype | null, reputation: number): string {
  const d = archetypeDescriptor(a)
  return a ? `${rankTier(reputation)} · ${d}` : d
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Wire into `src/state/agencyStore.ts`**
  - Add persisted field `leaning: Leaning` (default `ZERO_LEANING`), and derived (non-persisted computed at read time) is fine — but store the raw leaning.
  - Add action `advanceArchetype(tag: Archetype, weight?: number): void` → `set({ leaning: advanceLeaning(get().leaning, tag, weight) })` then save.
  - Add a selector-style helper exported from the store module: `export function agencyTitle(): string { const s = useAgencyStore.getState(); return archetypeTitle(dominantArchetype(s.leaning), s.reputation) }` and `export function agencyArchetype(): Archetype | null`.
  - `hydrate()`: backfill `leaning ?? ZERO_LEANING`.
  - Keep the existing `rankTitle` in `economy.ts` for any current callers, but the AgencyBar (T-later/existing) should switch to `agencyTitle()`. Update `AgencyBar.tsx` to render `agencyTitle()` where it currently shows the rank/"Startup Outfit".

- [ ] **Step 6: Extend `src/state/agencyStore.test.ts`** — founding leaves leaning zero → title "Startup Outfit"; `advanceArchetype('relief')` twice + `advanceArchetype('defense')` → dominant relief; hydrate backfills missing leaning. Run — expect PASS.

- [ ] **Step 7: Commit** — `feat(agency): archetype leaning, dominant archetype & evolving title`

---

## Task 3: Contract metadata — archetype tag, preferred capability, match bonus

**Files:**
- Create: `src/lib/contractMeta.ts`, `src/lib/contractMeta.test.ts`
- Modify: `src/state/contractStore.ts`, `src/lib/economy.ts`, `src/components/BriefingPanel.tsx` (mapping), `src/components/ContractsPanel.tsx` (display)

**Interfaces:**
- Produces:
  ```ts
  import type { Archetype } from '@/lib/archetype'
  import type { Capability } from '@/lib/satelliteMeta'
  export function archetypeForKind(kind: string): Archetype   // quake/earthquake/flood/storm/cyclone/wildfire → relief; volcano/ice/anomaly → research; launch/rocket → defense; default research
  export function capabilityForKind(kind: string): Capability // wildfire/volcano → thermal; launch/rocket → comms; default imaging
  export const CAPABILITY_MATCH_BONUS: number                 // 0.35 (reward multiplier add)
  export function matchBonusFunding(base: number, matched: boolean): number  // round(base * (matched ? 1+BONUS : 1))
  ```
- Consumes: `Contract` gains `archetype: Archetype` and `preferredCapability: Capability`.

- [ ] **Step 1: Failing tests** (`src/lib/contractMeta.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { archetypeForKind, capabilityForKind, matchBonusFunding, CAPABILITY_MATCH_BONUS } from './contractMeta'

describe('contractMeta', () => {
  it('maps event kinds to archetype lanes', () => {
    expect(archetypeForKind('earthquake')).toBe('relief')
    expect(archetypeForKind('wildfire')).toBe('relief')
    expect(archetypeForKind('launch')).toBe('defense')
    expect(archetypeForKind('volcano')).toBe('research')
    expect(archetypeForKind('mystery')).toBe('research') // default
  })
  it('maps event kinds to preferred capability', () => {
    expect(capabilityForKind('wildfire')).toBe('thermal')
    expect(capabilityForKind('volcano')).toBe('thermal')
    expect(capabilityForKind('launch')).toBe('comms')
    expect(capabilityForKind('earthquake')).toBe('imaging') // default
  })
  it('applies the capability match bonus to funding', () => {
    expect(matchBonusFunding(400, false)).toBe(400)
    expect(matchBonusFunding(400, true)).toBe(Math.round(400 * (1 + CAPABILITY_MATCH_BONUS)))
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/lib/contractMeta.ts`** (keyword-match on lowercased kind; robust to feed variety).

```ts
import type { Archetype } from '@/lib/archetype'
import type { Capability } from '@/lib/satelliteMeta'

export const CAPABILITY_MATCH_BONUS = 0.35

const has = (k: string, ...w: string[]) => w.some((x) => k.includes(x))

export function archetypeForKind(kind: string): Archetype {
  const k = kind.toLowerCase()
  if (has(k, 'quake', 'seismic', 'flood', 'storm', 'cyclone', 'hurricane', 'typhoon', 'fire', 'wildfire', 'drought')) return 'relief'
  if (has(k, 'launch', 'rocket', 'orbit', 'sat')) return 'defense'
  return 'research' // volcano, ice, anomaly, unknown → observation/science
}

export function capabilityForKind(kind: string): Capability {
  const k = kind.toLowerCase()
  if (has(k, 'fire', 'wildfire', 'volcano', 'thermal', 'heat')) return 'thermal'
  if (has(k, 'launch', 'rocket', 'relay', 'comms')) return 'comms'
  return 'imaging'
}

export function matchBonusFunding(base: number, matched: boolean): number {
  return Math.round(base * (matched ? 1 + CAPABILITY_MATCH_BONUS : 1))
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Extend `Contract` + completion logic in `src/state/contractStore.ts`**
  - Add `archetype: Archetype` and `preferredCapability: Capability` to the `Contract` type.
  - Wherever contracts are constructed from briefing/seed (in `BriefingPanel`/the conversion helper — step 7), set both via `archetypeForKind(kind)` / `capabilityForKind(kind)`.
  - `hydrate()`: backfill missing `archetype`/`preferredCapability` from `kind`.
  - In `evaluate(satellites, simTime)`: when a contract completes, determine the **completing satellite** (the one within `COMPLETION_RADIUS_KM`). Compute `matched = sat.capability === contract.preferredCapability`. Award funding via `matchBonusFunding(contract.reward.funding, matched)` (reputation unchanged). On the completed contract object returned, attach transient detail for the cinematic: `{ ...c, status:'completed', completedBy: sat.id, matched }` — extend the returned `completed` items with `completedBy` and `matched` (add these optional fields to the returned shape; they need not persist).
  - After awarding: call `useGameStore.getState().recordContractPass(sat.id)` and `useAgencyStore.getState().advanceArchetype(c.archetype)`.
  - Keep the existing agency funding/reputation award path; only the funding amount changes by the bonus.

- [ ] **Step 6: economy note** — no change needed beyond using `matchBonusFunding`; leave `contractReward` as-is (it sets the base at generation time).

- [ ] **Step 7: Mapping + display**
  - `BriefingPanel.tsx`: in the mission→contract conversion, populate `archetype`/`preferredCapability`. (Full AI wiring is T9; here just derive from `kind` so the fields exist now.)
  - `ContractsPanel.tsx`: render a small archetype chip (relief/research/defense with accent) and the preferred capability label (`CAPABILITY_LABEL`), plus a subtle "★ match" hint when the currently-selected satellite's capability equals `preferredCapability`.

- [ ] **Step 8: Extend `src/state/contractStore.test.ts`** — a completed contract with a matching-capability satellite awards `matchBonusFunding(base,true)`; a mismatch awards base; `completed` items include `completedBy`+`matched`; hydrate backfills archetype/preferredCapability. Run — expect PASS.

- [ ] **Step 9: Commit** — `feat(contracts): archetype tags, preferred capability & capability-match bonus`

---

## Task 4: Maneuver scoring & orbital trick-shots (pure)

**Files:**
- Create: `src/lib/maneuverScore.ts`, `src/lib/maneuverScore.test.ts`
- Modify: `src/state/gameStore.ts` (compute + expose last score on `completeBurn`), `src/components/BurnOverlay.tsx` or a small readout (surface the grade)

**Interfaces:**
- Produces:
  ```ts
  export interface ManeuverScore {
    efficiency: number   // 0..1
    precision: number    // 0..1
    grade: 'S' | 'A' | 'B' | 'C'
    overall: number      // 0..1
  }
  export function scoreManeuver(input: {
    dvNeeded: number; dvSpent: number; closestKm: number; radiusKm: number
  }): ManeuverScore
  // efficiency = clamp01(dvNeeded / max(dvSpent, eps)); precision = clamp01(1 - closestKm/radiusKm)
  // overall = 0.5*eff + 0.5*prec; grade S≥0.9 A≥0.75 B≥0.5 else C
  export function detectTrickShot(input: {
    elements: OrbitalElements; targets: { lat: number; lon: number }[]
    fromT: number; windowSec: number; radiusKm: number
  }): { count: number; isTrickShot: boolean }
  // count = number of distinct targets whose closestApproach ≤ radius within window; isTrickShot = count ≥ 2
  ```

- [ ] **Step 1: Failing tests** (`src/lib/maneuverScore.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { scoreManeuver, detectTrickShot } from './maneuverScore'
import type { OrbitalElements } from '@/lib/orbits'

describe('scoreManeuver', () => {
  it('rewards minimal spend and tight passes', () => {
    const s = scoreManeuver({ dvNeeded: 100, dvSpent: 100, closestKm: 0, radiusKm: 500 })
    expect(s.efficiency).toBeCloseTo(1); expect(s.precision).toBeCloseTo(1); expect(s.grade).toBe('S')
  })
  it('penalizes overspend and grazing passes', () => {
    const s = scoreManeuver({ dvNeeded: 100, dvSpent: 200, closestKm: 500, radiusKm: 500 })
    expect(s.efficiency).toBeCloseTo(0.5); expect(s.precision).toBeCloseTo(0); expect(s.grade).toBe('C')
  })
  it('clamps to [0,1]', () => {
    const s = scoreManeuver({ dvNeeded: 300, dvSpent: 100, closestKm: 900, radiusKm: 500 })
    expect(s.efficiency).toBe(1); expect(s.precision).toBe(0)
  })
})

describe('detectTrickShot', () => {
  const el: OrbitalElements = { a: (6371+500)/6371, e: 0.001, i: 0.9, raan: 0.5, argp: 0.3, m0: 0, epoch: 0 }
  it('flags reaching two targets in one window as a trick-shot', () => {
    // two targets straddling the ground-track; generous radius makes both reachable
    const r = detectTrickShot({ elements: el, targets: [{lat:0,lon:0},{lat:0,lon:5}], fromT: 0, windowSec: 6000, radiusKm: 3000 })
    expect(r.count).toBeGreaterThanOrEqual(2); expect(r.isTrickShot).toBe(true)
  })
  it('single reachable target is not a trick-shot', () => {
    const r = detectTrickShot({ elements: el, targets: [{lat:0,lon:0},{lat:80,lon:120}], fromT: 0, windowSec: 6000, radiusKm: 200 })
    expect(r.isTrickShot).toBe(false)
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/lib/maneuverScore.ts`** (reuse `closestApproach` from `@/lib/intercept`).

```ts
import { closestApproach } from '@/lib/intercept'
import type { OrbitalElements } from '@/lib/orbits'

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export interface ManeuverScore { efficiency: number; precision: number; grade: 'S'|'A'|'B'|'C'; overall: number }

export function scoreManeuver(input: { dvNeeded: number; dvSpent: number; closestKm: number; radiusKm: number }): ManeuverScore {
  const efficiency = clamp01(input.dvNeeded / Math.max(input.dvSpent, 1e-6))
  const precision = clamp01(1 - input.closestKm / Math.max(input.radiusKm, 1e-6))
  const overall = 0.5 * efficiency + 0.5 * precision
  const grade = overall >= 0.9 ? 'S' : overall >= 0.75 ? 'A' : overall >= 0.5 ? 'B' : 'C'
  return { efficiency, precision, grade, overall }
}

export function detectTrickShot(input: {
  elements: OrbitalElements; targets: { lat: number; lon: number }[]; fromT: number; windowSec: number; radiusKm: number
}): { count: number; isTrickShot: boolean } {
  const count = input.targets.reduce((n, t) => {
    const { closestKm } = closestApproach(input.elements, t, input.fromT, input.windowSec)
    return n + (closestKm <= input.radiusKm ? 1 : 0)
  }, 0)
  return { count, isTrickShot: count >= 2 }
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Wire scoring into `completeBurn`** (`src/state/gameStore.ts`)
  - When a burn completes, compute the score. Inputs: `dvNeeded` = the ghost's closest-approach-optimal — approximate as `burnSession.cost` when no target, or better: pass the target's needed dv. Simplest deterministic proxy that matches the tests' intent: `dvNeeded = burnSession.cost` (planned) and `dvSpent = spent` (quality-inflated) → efficiency reflects burn quality; `closestKm` = closest approach of the **new** elements to the tracked contract target within one period (use `closestApproach(elements, target, at, orbitalPeriod(elements.a)*3)`), `radiusKm = COMPLETION_RADIUS_KM`. If no active/target contract, precision defaults to the efficiency-only path (set precision input `closestKm=0` so precision=1 — a free-flight burn is graded on efficiency alone).
  - Store `lastManeuver: ManeuverScore | null` (non-persisted) on the game store and set it in `completeBurn`. Also compute `detectTrickShot` against **all active contracts' targets** using the new elements; if `isTrickShot`, set a transient `lastTrickShot: { count } | null` and append a notable pass to the completing satellite record (via `recordContractPass(satId, "Trick-shot ×N · SD <days>")` — the actual completion pass is credited in T3; here only mark the trick-shot note if a completion also happens — to avoid double count, T5 owns the celebratory beat and record note; in this task just expose `lastManeuver`/`lastTrickShot` for the overlay).
  - Add these to `GameState` and reset them in `resetForTest`.

- [ ] **Step 6: Surface the grade** — In `BurnOverlay.tsx` (or a tiny transient toast), when `lastManeuver` is set after a burn, show `GRADE S/A/B/C` with the efficiency/precision bars for ~2.5s. Keep it lightweight; the big celebration is the cinematic (T5).

- [ ] **Step 7: gameStore test** — `completeBurn` sets `lastManeuver` with a valid grade; a free-flight burn (no target) grades on efficiency. Run — expect PASS.

- [ ] **Step 8: Commit** — `feat(maneuver): deterministic maneuver scoring + trick-shot detection`

---

## Task 5: The cinematic completion pass (spectacle) + operational tempo

**Files:**
- Create: `src/engine/CompletionFx.ts`, `src/components/CompletionCinematic.tsx`
- Modify: `src/state/contractStore.ts` (emit a completion event), `src/state/gameStore.ts` (streak state), `src/engine/GlobeEngine.ts` (chase-lock + drive CompletionFx), `src/engine/ContractLayer.ts` (hand completion to FX), `src/components/Hud.tsx` (mount overlay), `src/audio/AudioEngine.ts` (add an escalating `downlink()` if trivial, else reuse `stinger`)

**Design (spec §9/§9/§6b):** A completion is a set-piece, not a toast. When `evaluate()` reports a completion:
1. **Store event surface:** contractStore exposes a transient `lastCompletion: CompletionEvent | null` where
   ```ts
   interface CompletionEvent {
     contractId: string; title: string; lat: number; lon: number
     funding: number; reputation: number; matched: boolean
     archetype: Archetype; completedBy: string
     streak: number; multiplier: number
     grade?: 'S'|'A'|'B'|'C'; trickShot?: number
     reliefImpact?: string   // set when archetype==='relief' (T6 provides the copy)
   }
   ```
   Set it in `evaluate()` (or a small `emitCompletion` helper called from evaluate). Also bump the **operational-tempo streak** in gameStore: consecutive completions increase `streak`; a contract **failure** resets `streak` to 0. `multiplier = 1 + min(0.5, 0.1*(streak-1))` applied to funding (documented, small). Recompute the awarded funding with the multiplier (fold into T3's award, or apply here before adding to agency — keep a single source of truth: apply multiplier in `evaluate` right after the capability bonus).
2. **In-scene FX (`CompletionFx.ts`):** given `{lat,lon}` and `satId`, run a ~3s effect: a scanning-sweep ring expanding over the target zone (a shader/additive ring that grows + fades), plus a chase-lock request. Expose:
   ```ts
   class CompletionFx { group: THREE.Group; trigger(lat:number, lon:number): void; update(dt:number): void; get active(): boolean; get focusSat(): string | null; dispose(): void }
   ```
   `GlobeEngine.update()` — insert a camera authority beat **just below burn chase**: while `completionFx.active`, ease the camera toward the completing satellite's scene position (reuse the flight-ease helper). This is the "chase-cam lock onto the satellite as it sweeps the target."
3. **Overlay (`CompletionCinematic.tsx`):** subscribes to `contractStore.lastCompletion`. On a new event, play a ~3s sequence: title resolve, a **data-downlink count-up** (0→100% over ~1.5s), a **reward tally** that counts funding up with escalating audio (`audio.stinger()` at the crescendo; optional per-tick `uiTick`), the archetype chip, the **relief-impact line** when present (T6), and a **trick-shot / streak flourish** ("TRICK-SHOT ×2" / "STREAK ×4 · +10%") when applicable. Dismiss automatically after the sequence or on click. Never blocks input for more than the animation; `pointer-events` only on its dismiss control.

- [ ] **Step 1:** Add `lastCompletion`/`clearCompletion` to `contractStore` and `streak`/`bumpStreak`/`resetStreak` to `gameStore`; set `lastCompletion` (with streak+multiplier+matched+archetype+completedBy) inside `evaluate()` when a contract completes, and reset streak on failure. Fold the streak multiplier into the funding award (single source of truth). Unit-test in `contractStore.test.ts`: two completions in a row raise `streak` to 2 and set `multiplier` > 1; a failure resets streak. Run — expect PASS.
- [ ] **Step 2:** Implement `CompletionFx.ts` (additive expanding ring at `latLonToVector3(lat,lon,1.001)`, 3s life, `active` true during; `focusSat` returns the satellite to chase). No React import. Keep geometry disposal correct.
- [ ] **Step 3:** In `GlobeEngine.ts`, own a `CompletionFx` instance, add its group to the scene, call `update(dt)` each frame, and insert the chase-lock ease beat below burn chase in `update()`. Wire `ContractLayer` (which already runs `evaluate`) to call `completionFx.trigger(lat,lon)` for each completion this tick (pass the FX in via constructor or a setter, or have GlobeEngine read `contractStore.lastCompletion` and trigger — pick the lower-coupling path: GlobeEngine reads the store event and triggers FX, so ContractLayer stays evaluation-only).
- [ ] **Step 4:** Implement `CompletionCinematic.tsx` and mount it in `Hud.tsx`. Subscribe to `lastCompletion`; run the count-up + tally + flourish; call `clearCompletion()` on finish/dismiss.
- [ ] **Step 5:** (Optional audio) add `downlink()` to `AudioEngine` only if trivial; otherwise reuse `stinger`/`uiTick`. Don't gold-plate.
- [ ] **Step 6:** Manual/visual verification is the controller's job post-task; ensure no console errors and the existing e2e still passes (`npx playwright test`). Commit — `feat(spectacle): cinematic completion pass, chase-lock FX & operational tempo`.

---

## Task 6: Relief-impact acknowledgment

**Files:** Create `src/lib/reliefImpact.ts` + test; consumed by `contractStore.evaluate` (sets `reliefImpact` on the completion event) and rendered by `CompletionCinematic`.

**Interface:**
```ts
export function reliefImpactLine(kind: string, title: string): string
// deterministic, respectful, concrete: e.g. "Imagery relayed to relief teams · affected area mapped"
// variants keyed by kind (quake/flood/storm/fire); never gamifies casualties
```

- [ ] **Step 1: Failing test** — `reliefImpactLine('earthquake', ...)` returns a non-empty respectful string containing "relief" or "responders"; a wildfire variant mentions "fire" or "thermal"; the function is pure/deterministic (same input → same output). No numbers implying casualties.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** a small keyword→line map with a safe default ("Data relayed to response teams · situational picture improved").
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5:** In `contractStore.evaluate`, when `c.archetype === 'relief'`, set `completion.reliefImpact = reliefImpactLine(c.kind, c.title)`. `CompletionCinematic` renders it as a distinct, quieter line under the tally.
- [ ] **Step 6: Commit** — `feat(relief): respectful impact acknowledgment on relief completions`

---

## Task 7: Emergencies — debris-conjunction + real satellite loss

**Files:**
- Create: `src/lib/emergency.ts`, `src/lib/emergency.test.ts`, `src/components/EmergencyAlert.tsx`
- Modify: `src/state/gameStore.ts` (emergency state + loss + evasive-burn resolution), `src/engine/GlobeEngine.ts` or a lightweight ticker (spawn logic), `src/components/Hud.tsx`

**Design (spec §8/§7):** Occasionally the world throws a **debris-conjunction warning** on one satellite: a countdown and an evasive-burn demand. Handle it (a quick required maneuver OR accept a fuel cost) or **lose the satellite**. Loss removes it + its record (a somber beat); the agency endures (never ruin).

**Interfaces (pure math in `emergency.ts`):**
```ts
export interface Conjunction { satId: string; startedAt: number; deadline: number; requiredDv: number }
export function shouldSpawnConjunction(opts: { now: number; lastSpawnAt: number; minGapSec: number; fleetSize: number; roll: number }): boolean
// deterministic: true when now - lastSpawnAt >= minGapSec AND roll < perFleetChance(fleetSize). roll is passed in (caller supplies a seeded/derived value — NOT Math.random inside the module).
export function makeConjunction(satId: string, now: number, requiredDv?: number, leadSec?: number): Conjunction
export function isResolvedByBurn(c: Conjunction, dvSpent: number): boolean  // dvSpent >= requiredDv
export function isExpired(c: Conjunction, now: number): boolean             // now > deadline
```

- [ ] **Step 1: Failing tests** — spawn gating respects min-gap and roll threshold; `makeConjunction` sets `deadline = now + leadSec` and a positive `requiredDv`; `isResolvedByBurn` true iff spent ≥ required; `isExpired` at deadline. (All deterministic — `roll` is an input.)
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `emergency.ts`** (no randomness inside; `perFleetChance` a small constant like 0.15). 
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: gameStore integration**
  - State: `emergency: Conjunction | null`, `lastConjunctionAt: number` (persisted so gaps survive reload), and actions:
    - `maybeSpawnConjunction(now, roll)`: if none active and `shouldSpawnConjunction(...)`, pick a random-but-derived satellite (index from `roll`), set `emergency = makeConjunction(...)`, `audio.alert()`.
    - `resolveEmergencyByBurn(satId, dvSpent)`: if it matches the active emergency's sat and `isResolvedByBurn`, clear emergency and add a notable pass ("Evaded conjunction · SD <days>").
    - `payEvasion()`: accept a flat fuel cost on the sat = `requiredDv` (deduct fuel; if insufficient fuel → cannot pay, must fly or lose), then clear.
    - `loseSatellite(satId)`: remove the satellite (and its record), set a transient `lastLoss: { name } | null` for the somber overlay beat, persist. **Never** let the fleet reach zero silently — if this was the last satellite, immediately grant a replacement via the existing `buySatellite`-style path at no cost (a "provisional replacement") so the agency endures.
    - `tickEmergency(now)`: if `emergency && isExpired`, call `loseSatellite(emergency.satId)`.
  - Call `maybeSpawnConjunction` + `tickEmergency` from the existing engine tick (throttled, e.g. once per sim-minute) in `GlobeEngine.update()` or `ContractLayer.update()`; supply `roll` from a cheap deterministic source (e.g. fractional part of `simTime`), so no `Math.random` in game logic.
  - Completing an **evasive burn**: the simplest UX — when an emergency is active on the selected sat and the player flies any burn on it that spends ≥ `requiredDv`, `completeBurn` calls `resolveEmergencyByBurn`. Wire that in `completeBurn`.
- [ ] **Step 6: `EmergencyAlert.tsx`** — a high-priority red alert overlay when `emergency` is set: satellite name, countdown to `deadline` (sim-time), required Δv, and two actions: **"FLY EVASIVE"** (selects the sat, opens the burn planner pre-nudged with `requiredDv` prograde) and **"BURN FUEL TO DODGE §/Δv"** (calls `payEvasion`). A distinct **loss beat** overlay when `lastLoss` is set (somber, dismiss in one action), then `clearLoss()`. Mount in `Hud.tsx`.
- [ ] **Step 7: gameStore test** — spawn→resolve-by-burn clears emergency; spawn→expire loses the sat; losing the last sat grants a replacement so `satellites.length >= 1`. Run — PASS.
- [ ] **Step 8: Commit** — `feat(stakes): debris-conjunction emergencies & real satellite loss`

---

## Task 8: The returning "while you were away" cold-open

**Files:**
- Create: `src/lib/coldOpen.ts`, `src/lib/coldOpen.test.ts`, `src/components/ColdOpenScreen.tsx`
- Modify: `src/components/Hud.tsx` (show once per session for a founded, returning player), `src/lib/profile.ts` (already tracks `lastSeen`; read prior value before `recordSession` stamps a new one)

**Design (spec §1b):** A founded player doesn't re-found and doesn't land cold. On return, show a styled situation-room recap: new significant events since `lastSeen`, contracts that completed/expired while gone, sim-days elapsed, fuel states. Deterministic fallback always available; AI-written version is a T9 nicety (reuse the briefing's `lastSeen` framing). Dismissible in one action.

**Interface (pure):**
```ts
export interface ColdOpenSummary {
  simDaysElapsed: number
  newEventCount: number
  headlineEvents: string[]       // up to 3 titles
  completedWhileAway: number
  expiredWhileAway: number
  lines: string[]                // rendered bullet strings, deterministic
  isReturning: boolean           // false for a brand-new agency / no lastSeen
}
export function buildColdOpen(input: {
  lastSeenIso: string | null; now: number
  events: { id: string; title: string; time: string; severity: number }[]
  contracts: { status: string; deadline: number }[]
}): ColdOpenSummary
```

- [ ] **Step 1: Failing tests** — no `lastSeen` → `isReturning:false`; given a `lastSeen` in the past, `simDaysElapsed` computed from `(now - simAtLastSeen)`; new events counted by comparing event `time` to `lastSeen`; completed/expired tallied from contract statuses/deadlines; `lines` non-empty and deterministic.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `coldOpen.ts`** — pure; derive sim-days from wall elapsed × `TIME_SCALE` / 86400 (import `TIME_SCALE`), or accept precomputed values to keep it fully pure/testable. Sort headline events by severity.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: `ColdOpenScreen.tsx`** — on mount, if agency `founded` and `profile.lastSeen` existed **before** this session stamped a new one (capture the prior value in `StoreHydrator`/session bootstrap), build the summary and show the recap over the globe; one "ENTER OPERATIONS" action dismisses it. Show once per load. If `isReturning` is false, render nothing.
- [ ] **Step 6:** Ensure `recordSession()` still stamps `lastSeen`; capture the prior `lastSeen` at bootstrap so the cold-open can diff against it (don't let the new stamp erase the value the screen needs — read it first).
- [ ] **Step 7: Commit** — `feat(return): "while you were away" cold-open recap`

---

## Task 9: AI integration — per-user divergence (identity + archetype + story lanes)

**Files:** Modify `src/app/api/briefing/route.ts`, `src/components/BriefingPanel.tsx`. (Server-only key rules apply.)

**Design (spec §12/§6):** The briefing request also carries **agency identity** (name, emblem, colorway) + **archetype leaning**; the response missions carry an **archetype tag** + **preferredCapability**; the system prompt is **flavored by archetype** so a relief agency reads humanitarian, a research agency reads scientific/anomaly, a defense agency reads strategic-observation — this is the concrete seed of geopolitical / nature / military-tech story lanes and per-user divergence. Invariants unchanged (server route, zod, ALWAYS-200 fallback, respectful framing, engine enforces eventId whitelist + economy).

- [ ] **Step 1:** Extend the **request** zod schema: add `agency: { name: string(≤60), archetype: 'relief'|'research'|'defense'|null }`. Keep existing `profile`/`fleet`/`events`. Validate + default gracefully (missing agency → null archetype).
- [ ] **Step 2:** Extend the **response** mission schema: each mission gains `archetype: 'relief'|'research'|'defense'` and `preferredCapability: 'imaging'|'comms'|'thermal'` (LLM proposes; engine may override from `kind` if absent — never trust it for economy). Keep `title`, `eventId`, `objective`.
- [ ] **Step 3:** Flavor the **system prompt** by `agency.archetype`: append a lane paragraph — relief → humanitarian/disaster-response emphasis; research → scientific observation, natural phenomena, anomalies; defense → strategic observation & monitoring (explicitly *never targeting*). Re-assert the HARD RULES (never gamify suffering; missions reference whitelisted eventIds only; 2–3 missions). Keep model `claude-opus-4-8`, effort low, ALWAYS-200 fallback.
- [ ] **Step 4:** Update the **deterministic fallback** to still emit `archetype`/`preferredCapability` (derive via `archetypeForKind`/`capabilityForKind`) and, when an archetype leaning is provided, **bias** which events become missions toward that lane (sort relief-lane events first for a relief agency, etc.). This delivers the "biases the contract stream" requirement even without the LLM.
- [ ] **Step 5:** `BriefingPanel.tsx`: send `agency: { name, archetype: agencyArchetype() }`; when mapping missions→contracts, use the mission's `archetype`/`preferredCapability` when present, else derive from `kind` (T3 helper). Engine still sets reward/deadline.
- [ ] **Step 6:** Keep `/api/briefing` returning 200 with the fallback if the key is absent or the call errors. Do **not** log the key or the raw prompt containing it. Verify `.env.local` still gitignored and the key never reaches the client bundle (it's only read in the route).
- [ ] **Step 7:** No new unit test is strictly required (route is integration), but add a tiny test for the fallback's lane-biasing if it's factored into a pure helper (recommended: extract `orderEventsForArchetype(events, archetype)` into `contractMeta.ts` and TDD it). Commit — `feat(ai): archetype-flavored briefings & per-user story lanes`.

---

## Task 10: First-run walkthrough + GUIDE overlay with SVG diagrams

**Files:** Create `src/components/Walkthrough.tsx`; modify `src/components/GuidePanel.tsx`, `src/components/Hud.tsx`.

**Design (spec §2):** After founding, 3–5 lightweight coach-marks spotlight each panel in turn ("This is your fleet — click a satellite", "Plan a burn here", "Contracts appear here", "Fly the burn: SPACE throttle · A/D trim"), dismissible, skippable, shown once (persist a `hyperion-onboarded-v1` flag via `saveJSON`). The persistent GUIDE (`?`) gains **stylized SVG diagrams** (burn sliders→ghost orbit, the flying keys, intercept readout) instead of walls of text.

- [ ] **Step 1:** `Walkthrough.tsx` — a sequence of 3–5 steps, each a positioned callout with "Next"/"Skip". Gate on `founded && !onboarded`. On finish/skip, set the onboarded flag. Coordinates target existing panels (fleet right rail, contracts, burn planner, intercept readout). Keep it CSS-positioned, non-blocking except its own controls.
- [ ] **Step 2:** `GuidePanel.tsx` — add inline SVG diagrams (small, on-brand, accent-colored): (a) three Δv sliders → an amber ghost ellipse; (b) key legend SPACE/A/D/ESC; (c) intercept readout turning green. Replace dense text with captioned diagrams.
- [ ] **Step 3:** Mount `Walkthrough` in `Hud.tsx`. Extend the Playwright smoke (`e2e/`): after founding, the walkthrough appears and can be skipped; `?` opens the guide. Run `npx playwright test` — expect PASS.
- [ ] **Step 4: Commit** — `feat(onboarding): first-run walkthrough + illustrated guide`

---

## Task 11: Orbital postcards (capture, composite, download)

**Files:** Create `src/lib/postcard.ts`, `src/components/PostcardButton.tsx`; modify `src/engine/GlobeEngine.ts` (expose a frame-capture hook), `src/components/Hud.tsx`.

**Design (spec §9c):** One-press **capture** turns the current framed view into a postcard: the WebGL frame composited with the agency **emblem**, name, and a caption (location / event / stardate), downloadable as an image. Keyless, canvas-based. A subtle "postcard-worthy" prompt can appear at genuinely cinematic moments (a completing pass, a terminator crossing) without nagging.

- [ ] **Step 1:** In `GlobeEngine`, ensure the renderer is created with `preserveDrawingBuffer: true` **or** capture on-demand by forcing a render then `renderer.domElement.toDataURL()` within the same frame. Expose `captureFrame(): string /* dataURL */`. (Prefer render-then-capture to avoid the perf cost of `preserveDrawingBuffer` always-on; if the composer complicates this, render the composer to a target and read back.)
- [ ] **Step 2:** `src/lib/postcard.ts` — `composePostcard(frameDataUrl, { agencyName, emblemSvg, caption }): Promise<string>` draws the frame to an offscreen canvas, overlays a bottom gradient bar, the emblem (render the `Emblem` SVG to an image), agency name, and caption, returns a PNG dataURL. Pure-ish (DOM canvas), guard for SSR (only run client-side).
- [ ] **Step 3:** `PostcardButton.tsx` — a small camera control; on click calls `captureFrame()` → `composePostcard()` → triggers a download (`<a download>`), and `audio.uiTick()`. A subtle "postcard-worthy ✨" nudge appears for ~3s after a completion cinematic or a terminator crossing (reuse `lastCompletion`), dismissible, non-nagging (rate-limited to once per few minutes).
- [ ] **Step 4:** Mount in `Hud.tsx`. Manual visual verification (controller). Commit — `feat(share): one-press orbital postcards`.

---

## Task 12: Clickable satellite records + UX shell cohesion

**Files:** Create `src/components/SatelliteRecordCard.tsx`; modify `src/components/FleetPanel.tsx`, and light polish across panels.

**Design (spec §7/§10):** Selecting a satellite (or a "record" affordance) opens a **service-record card**: callsign, capability (`CAPABILITY_LABEL`), Δv, contracts completed, sim-days in orbit (`simDaysInOrbit(record.commissionedAt, simNow())`), notable passes. Threads the agency accent. Everything reachable without leaving the globe; consistent panel chrome.

- [ ] **Step 1:** `SatelliteRecordCard.tsx` — a compact card bound to the selected satellite; shows capability chip, service stats, and the last few notable passes. Opens from a "▤ record" control on the selected fleet row (or on second click). Closes on ESC/click-away.
- [ ] **Step 2:** `FleetPanel.tsx` — show the capability label inline on each row (small chip) and a completed-count badge; add the record affordance.
- [ ] **Step 3:** Cohesion pass — ensure archetype chips, capability labels, and grade badges share one chrome/spacing vocabulary across ContractsPanel/FleetPanel/CompletionCinematic. No functional change beyond styling consistency.
- [ ] **Step 4: Commit** — `feat(fleet): clickable service-record cards + UX cohesion`

---

## Global Self-Review (run before execution)

- **Spec coverage:** §1b→T8; §2→T10; §6→T2+T9; §6b→T6; §7→T1+T7(loss); §7b→T1+T3; §8→T7; §9→T5; §9b→T4; §9c→T11; §10→T12; §12→T9. All 7B items map to a task.
- **Type consistency:** `Capability` defined in T1 and imported everywhere; `Archetype`/`Leaning` in T2; `Contract` gains `archetype`+`preferredCapability` in T3 and is read by T5/T9/ContractsPanel; `CompletionEvent` defined in T5 and consumed by `CompletionCinematic`; `ManeuverScore` in T4. Verified consistent.
- **Back-compat:** every new persisted field (satellite capability/record, agency leaning, contract archetype/preferredCapability, emergency `lastConjunctionAt`, onboarded flag) has a hydrate-time default. No forced key bumps.
- **Determinism:** no `Math.random`/`Date.now` in game logic — emergencies take an injected `roll`; sim time via `simNow()`; scoring/archetype/coldOpen pure.
- **Order:** data model (T1–T3) → mastery (T4) → spectacle (T5–T6) → stakes (T7) → return/AI/onboarding/share/records (T8–T12). Each task leaves the game playable.

## Execution Handoff

Execute via **superpowers:subagent-driven-development** — fresh implementer per task, task review (spec + quality) after each, one broad final review, controller visual-verifies on :3100 between spectacle tasks (T5, T7, T11), then merge to main and push (auto-deploys). Keep the 98 unit tests green plus the new suites; extend the Playwright smoke in T10.
