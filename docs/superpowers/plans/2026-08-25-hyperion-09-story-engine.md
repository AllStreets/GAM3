# HYPERION Plan 9 — Story Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the world memory and drama — the city image blooms in when you complete a contract over a place; far more real event types feed the board; contracts vary in *how you play them*; and an AI story engine grows multi-beat arcs and a rival agency with memory that races you for targets.

**Architecture:** Extend the events route with more keyless feeds (normalizers TDD'd), add contract **objective types** with pure per-type completion evaluators, fold a pre-fetched city image into the 7B completion cinematic, and add a `storyStore` + `/api/story` route (mirroring `/api/briefing`) that advances arcs + a rival whose contract "races" are **engine-adjudicated** (the LLM only narrates). All client-side state, all network via `/api/*` with timeouts/caching/ALWAYS-200, key server-side only.

**Tech Stack:** Next.js App Router, Three.js 0.169, zustand, vitest, Playwright, Tailwind, @anthropic-ai/sdk (`messages.parse` + zod, `claude-opus-4-8`).

**Spec:** `docs/superpowers/specs/2026-08-24-hyperion-living-world-design.md` (§9; plus the §8.2 completion-fold deferred from Plan 8).

## Global Constraints

- **Port 3100.** `ANTHROPIC_API_KEY` server-side only; never client, never logged. `.env.local` gitignored.
- **All network I/O through `/api/*`** — 8s timeouts (`AbortSignal.timeout`), per-source isolation (`Promise.allSettled`), caching (`next: { revalidate }`), **ALWAYS-200**, never blank a non-empty world.
- **LLM invariants:** server route only; zod structured outputs; ALWAYS-200 deterministic fallback; respectful framing (**never gamify casualties**; defense = observation, never targeting); **engine enforces** — the LLM narrates, the engine adjudicates outcomes (rival races via `closestApproach`/pass logic), sets economy, and whitelists event/place targets. Event titles are untrusted (prompt-injection guarded).
- **Engine/React boundary:** `src/engine/*` no React; React no Three; zustand bridges. Determinism in game logic (no `Math.random`/`Date.now`; `simNow()`); route handlers may stamp `new Date().toISOString()` for `fetchedAt` like `/api/events`.
- **Back-compat persistence:** every new persisted field (contract `objective`, `storyStore`) hydrates with a default; no key bumps without migration. `Contract.objective?` was already added in Plan 8.
- **On-brand chrome:** shared `ui/Chip`; respectful, terse situation-room voice.

---

## File Structure

**New pure libs (TDD, no React/Three):**
- `src/lib/gdacs.ts`, `src/lib/spaceWeather.ts` — normalizers for GDACS + NOAA SWPC → `WorldEvent`.
- `src/lib/contractObjective.ts` — objective types + a pure evaluator per type + progress helpers.
- `src/lib/rival.ts` — deterministic rival-race adjudication + rival reputation math.
- `src/lib/storyProgress.ts` — deterministic arc-progression helpers (tension, next-beat selection).

**New server routes:** `src/app/api/story/route.ts` (AI arcs + rival dispatches).

**New state:** `src/state/storyStore.ts` (arcs, rival, dispatches — persisted, back-compat).

**New React:** `src/components/DispatchesFeed.tsx` (story/rival dispatches), and the completion city-image bloom lives in the existing `CompletionCinematic.tsx`.

**Modified:** `src/lib/worldEvents.ts` (+new `EventKind`s), `src/app/api/events/route.ts` (+GDACS +SWPC +more EONET categories), `src/engine/eventIcons.ts` (+glyphs), `src/lib/contractMeta.ts` (+new-kind mappings), `src/state/contractStore.ts` (objective types + per-type evaluation + rival race in `evaluate`; `lastCompletion` gains `placeImage` hook), `src/components/CompletionCinematic.tsx` (city-image bloom), `src/components/ContractsPanel.tsx` (objective type/progress display), `src/components/BriefingPanel.tsx`/`Hud.tsx` (mount DispatchesFeed; call `/api/story`).

---

## Task 1: Completion city-image bloom (§8.2 fold — Connor's explicit ask)

**Why first:** small, high visual payoff, explicitly requested. When you complete a contract over a place, the real city image blooms into the completion cinematic.

**Files:** Modify `src/state/contractStore.ts` (attach place coords to the completion event — already has `lat`/`lon` on `CompletionEvent`), `src/components/CompletionCinematic.tsx`.

- [ ] **Step 1:** In `CompletionCinematic.tsx`, when a `lastCompletion` arrives, fire a fetch to `/api/place-image?lat=&lon=` (using the completion's `lat`/`lon`) at the start of the sequence. Store the result in local state (race-guarded by contractId).
- [ ] **Step 2:** When the image resolves (`source !== 'none'`) render it as a **hero bloom** in the cinematic — fade/scale-in behind/above the reward tally (a framed image with the place-image attribution shown small), timed to the downlink count-up beat. If `source === 'none'` or it hasn't resolved by the tally, keep the existing cinematic exactly as-is (no layout jump — reserve the space or overlay absolutely). Never block the sequence on the fetch.
- [ ] **Step 3:** Keep the sequence timing intact; the image is a progressive enhancement. Ensure no console errors when the image 404s (onError → hide). Confirm `npx tsc --noEmit` clean and all 231 tests green (this is UI-only; no new unit test required).
- [ ] **Step 4: Commit** — `feat(story): city image blooms into the completion cinematic (§8.2 fold)`

---

## Task 2: More real data sources (§9.3)

**Files:** Create `src/lib/gdacs.ts`, `src/lib/spaceWeather.ts` (+ tests); modify `src/lib/worldEvents.ts` (`EventKind` union), `src/app/api/events/route.ts`, `src/engine/eventIcons.ts`, `src/lib/contractMeta.ts`.

**Interfaces:**
- `EventKind` gains `'volcano' | 'flood' | 'spaceweather'` (keep existing `quake|wildfire|storm|launch`). (EONET already can yield volcanoes/floods once categories are mapped.)
- `src/lib/gdacs.ts`: `export function normalizeGdacs(raw: unknown): WorldEvent[]` — parse GDACS GeoRSS/GeoJSON (keyless: `https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP`) → events with kind mapped from GDACS type (EQ→quake, FL→flood, TC→storm, VO→volcano, DR/WF→wildfire), severity from alert level (green/orange/red → 0.3/0.6/0.9), lat/lon, title, time. Defensive: return `[]` on any shape mismatch.
- `src/lib/spaceWeather.ts`: `export function normalizeSpaceWeather(raw: unknown): WorldEvent[]` — parse NOAA SWPC (keyless JSON, e.g. `https://services.swpc.noaa.gov/products/noaa-scales.json` or the planetary-K-index feed) → 0–2 `spaceweather` events (geomagnetic storm / solar activity) placed at a representative high-latitude point (aurora oval) or lat 0 with a note; severity from the scale. Deterministic; return `[]` when quiet/parse fails.

- [ ] **Step 1: Failing tests** — `normalizeGdacs` maps a sample GDACS event list to `WorldEvent`s with correct kind+severity+coords; empty/garbage → `[]`. `normalizeSpaceWeather` maps a sample SWPC payload to a `spaceweather` event with severity from the scale; quiet/garbage → `[]`. (Feed pure functions their raw JSON fixtures.)
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** both normalizers (pure, no network in the lib — the route fetches and passes raw JSON in).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Wire into `/api/events`** — add GDACS + SWPC to the `Promise.allSettled` set with appropriate `revalidate` (GDACS 600, SWPC 900) and add them to the `sources` map + the merged/sorted/sliced events. Widen the EONET query (`categories` — include volcanoes, floods, severe-storms) and map new EONET categories to the new kinds in `normalizeEonet`. Keep the 120-cap + never-blank.
- [ ] **Step 6: New kinds everywhere** — `contractMeta.archetypeForKind`/`capabilityForKind`: volcano→research/thermal, flood→relief/imaging, spaceweather→research/thermal. `eventIcons`: add a glyph for volcano/flood/spaceweather (reuse/tint existing canvas-drawn style). Extend the `contractMeta` tests for the new kinds.
- [ ] **Step 7:** `npx vitest run` + `npx tsc --noEmit`. Commit — `feat(story): more real data sources — GDACS, EONET categories, NOAA space-weather`

---

## Task 3: More contract variety (§9.4)

**Files:** Create `src/lib/contractObjective.ts` (+ tests); modify `src/state/contractStore.ts`, `src/lib/contractsFromBriefing.ts` / `src/lib/placeContract.ts` (attach an objective), `src/components/ContractsPanel.tsx` + `InterceptReadout`/FleetPanel display.

**Design:** `Contract.objective?` (added in Plan 8) becomes a structured objective. Each type has a pure evaluator that, given the fleet + a per-contract progress record + simTime, returns updated progress + `done`.

**Interfaces (pure `contractObjective.ts`):**
```ts
export type ObjectiveType = 'single-pass' | 'multi-pass' | 'multi-sat' | 'dwell'
export interface Objective { type: ObjectiveType; label: string; params: { passes?: number; sats?: number; dwellSec?: number } }
export interface ObjectiveProgress { passesDone: number; satsSeen: string[]; dwellAccumSec: number; done: boolean }
export function freshProgress(): ObjectiveProgress
export function defaultObjective(kind: string, capability: string): Objective  // pick a sensible type from event kind (storm→multi-pass monitoring, launch→multi-sat, relief→single-pass, comms→dwell)
export function evaluateObjective(o: Objective, prog: ObjectiveProgress, opts: {
  inRangeSatIds: string[]; dtSec: number
}): ObjectiveProgress
// single-pass: done when any sat in range once. multi-pass: passesDone++ per distinct in-range entry, done at params.passes.
// multi-sat: collect distinct satsSeen while in range, done at params.sats. dwell: dwellAccumSec += dtSec while ≥1 in range, done at params.dwellSec.
export function objectiveRewardScale(o: Objective): number  // 1.0 single, up to ~1.8 for complex — feeds funding
```

- [ ] **Step 1: Failing tests** — `defaultObjective` maps kinds sensibly; `evaluateObjective` for each type advances progress and flips `done` at the threshold (single/multi-pass/multi-sat/dwell); `objectiveRewardScale` grows with complexity. (Pure — feed synthetic in-range sets + dt.)
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Attach objectives at contract construction** — `contractForEvent` + `buildPlaceContract` set `objective: defaultObjective(kind, capability)` (keep `objective?` optional/back-compat; existing saves without it behave as single-pass).
- [ ] **Step 4: Evaluate in `contractStore.evaluate`** — replace the single "within COMPLETION_RADIUS_KM → complete" check with: for each active contract, compute `inRangeSatIds` (sats within radius this tick), advance a per-contract `progress` (store it on the contract, non-persisted-or-persisted your call — keep on the contract object), and only mark `completed` when `progress.done`. Reward scales by `objectiveRewardScale` (fold into the existing single award site alongside capability bonus + streak multiplier — keep ONE addFunding). Contracts without an objective keep the old single-pass behavior.
- [ ] **Step 5: Display** — ContractsPanel shows the objective `label` + progress (e.g. "PASS 2/3", "DWELL 40/90s", "2/2 SATS"); InterceptReadout can surface the active contract's objective progress. On-brand `Chip`.
- [ ] **Step 6:** `npx vitest run` + `npx tsc --noEmit`. Commit — `feat(story): contract objective types (multi-pass / multi-sat / dwell) + progress`

---

## Task 4: Story engine — narrative state + AI-woven arcs (§9.1)

**Files:** Create `src/lib/storyProgress.ts` (+tests), `src/state/storyStore.ts`, `src/app/api/story/route.ts`, `src/components/DispatchesFeed.tsx`; modify `Hud.tsx`/`BriefingPanel.tsx` (trigger `/api/story`, mount feed).

**Design:** `storyStore` (persisted, back-compat) holds `arcs: Arc[]`, `dispatches: Dispatch[]` (a capped feed), and `lastStoryAt`. On session start / after completions, the client POSTs recent history + archetype + world summary to `/api/story`; the AI proposes the next **beat(s)** — short narrative dispatches, optionally a follow-up contract seed (engine builds it) — respectful, structured, ALWAYS-200 with a deterministic fallback (a templated dispatch from the player's latest completion/archetype).

**Interfaces:**
```ts
// storyProgress.ts (pure)
export interface Arc { id: string; theme: string; tension: number; beatsSeen: number }
export function advanceArc(a: Arc, escalate: boolean): Arc   // tension clamped 0..1, beatsSeen++
export function pickArcTheme(archetype: string | null, recentKinds: string[]): string  // deterministic theme seed
// storyStore
export interface Dispatch { id: string; at: number; text: string; source: 'story' | 'rival' }
```

- [ ] **Step 1: Failing tests** for `storyProgress` (advanceArc clamps tension + increments; pickArcTheme deterministic by archetype/kinds). FAIL → implement → PASS.
- [ ] **Step 2: `storyStore`** — persisted (`hyperion-story-v1`), hydrate with empty defaults; actions `addDispatch` (cap ~20), `upsertArc`, `resetForTest`. Back-compat.
- [ ] **Step 3: `/api/story` route** — mirror `/api/briefing`: request `{ agency:{name,archetype}, recent:{completed:number,failed:number,lastKinds:string[]}, events:[{kind,title,severity}]≤15 }`; response `{ source, dispatches:[{text, source:'story'|'rival'}]≤3, arcTheme?:string }`; system prompt = a situation-room narrator, respectful, HARD RULES, archetype-flavored, NEVER gamify casualties. ALWAYS-200 fallback = one deterministic dispatch from the latest completion/archetype. Model `claude-opus-4-8`, effort low.
- [ ] **Step 4: `DispatchesFeed.tsx`** — a compact, on-brand feed of recent `dispatches` (story + rival, source-tinted). Mounted in Hud (e.g. below the briefing / a collapsible panel). Non-nagging.
- [ ] **Step 5: Trigger** — call `/api/story` on session start (after hydrate) and after a completion (debounced), push returned dispatches into `storyStore`, upsert the arc. Keep it ALWAYS-200 and never block play.
- [ ] **Step 6:** `npx vitest run` + `npx tsc --noEmit`; verify key only in route files. Commit — `feat(story): narrative state + AI-woven arcs + dispatches feed`

---

## Task 5: Rival agency with memory + engine-adjudicated races (§9.2)

**Files:** Create `src/lib/rival.ts` (+tests); modify `src/state/storyStore.ts` (rival state), `src/state/contractStore.ts` (rival can claim/race a contract), `src/app/api/story/route.ts` (rival dispatches), `src/components/ContractsPanel.tsx`/`DispatchesFeed.tsx` (rival markers).

**Design:** A persistent rival `{ name, emblemId, archetype, reputation, memory: {wins,losses} }` in `storyStore`. Occasionally the rival **contests** an available/active contract: a race where **whoever's satellite makes the qualifying pass first wins** — adjudicated deterministically by the engine (the rival is assigned a plausible "ETA" from a seeded function of the contract; if the player completes before that ETA they win, else the rival claims it). The LLM only narrates (taunts, dispatches). Winning/losing updates both reputations and the rival's memory.

**Interfaces (pure `rival.ts`):**
```ts
export interface Rival { name: string; emblemId: string; archetype: string; reputation: number; wins: number; losses: number }
export function seedRival(playerArchetype: string | null): Rival  // deterministic starter rival
export function rivalEtaSec(contractId: string, deadlineSec: number, difficulty: number): number  // deterministic pseudo-ETA in (0, deadline)
export function resolveRace(playerCompletedAtSec: number | null, rivalEtaSec: number): 'player' | 'rival'
export function applyRaceResult(r: Rival, result: 'player' | 'rival'): Rival  // update wins/losses + reputation
```

- [ ] **Step 1: Failing tests** — `seedRival` deterministic; `rivalEtaSec` in-range + deterministic; `resolveRace` (player faster → player; player null/slower → rival); `applyRaceResult` updates memory+rep. FAIL → implement → PASS.
- [ ] **Step 2: Rival state** in `storyStore` (persisted, hydrate default via `seedRival`). Mark a subset of contracts as `contested` (a flag + the rival ETA) at generation/accept time (deterministic; keep it occasional).
- [ ] **Step 3: Adjudicate in `contractStore.evaluate`** — for a `contested` active contract: if the player completes (objective done) before `rivalEtaSec`, player wins (normal reward + a beat); if simTime passes the rival ETA first, the rival **claims** it (contract removed/failed-soft with NO player rep ding beyond a small "lost to rival" note, rival rep up). Update rival memory. Emit a dispatch (`source:'rival'`). Keep the single funding award site intact.
- [ ] **Step 4: `/api/story`** — include rival context so dispatches can be rival taunts/claims; deterministic fallback covers it.
- [ ] **Step 5: Display** — ContractsPanel marks contested contracts (a small "⚔ RIVAL" chip + the rival ETA/countdown); DispatchesFeed shows rival dispatches source-tinted; a small rival standing (you vs rival rep) somewhere on-brand.
- [ ] **Step 6:** `npx vitest run` + `npx tsc --noEmit`. Commit — `feat(story): rival agency with memory + engine-adjudicated contract races`

---

## Task 6: Cohesion, balance & e2e

**Files:** cohesion across new panels; `e2e/*.spec.ts`.

- [ ] **Step 1: Cohesion** — DispatchesFeed, objective/rival chips, new event icons share the established chrome (`ui/Chip`, accent). Ensure the new panels don't overlap existing HUD (respect the bottom-right cluster + right rail + place card zones).
- [ ] **Step 2: Balance** — sanity-check reward scaling (objective complexity + rival stakes) doesn't break the economy; contested contracts stay occasional; dispatches non-nagging. Adjust constants with `log`ged notes.
- [ ] **Step 3: e2e** — extend the Playwright smoke: after founding, the DispatchesFeed appears (or a dispatch arrives via the fallback); a contract shows an objective label. Keep existing assertions (no console errors, non-black canvas).
- [ ] **Step 4: Full gate** — `npx vitest run` (all green), `npx tsc --noEmit` (clean), `npm run build` (success). Commit — `feat(story): cohesion + balance + e2e for the story engine`

---

## Global Self-Review (run before execution)

- **Spec coverage:** §8.2 completion-fold→T1; §9.3 data sources→T2; §9.4 contract variety→T3; §9.1 arcs→T4; §9.2 rival→T5; cohesion/e2e→T6. All mapped.
- **Type consistency:** new `EventKind`s (T2) used by contractMeta/eventIcons; `Objective`/`ObjectiveProgress` (T3) consumed by contractStore + ContractsPanel; `Arc`/`Dispatch` (T4) + `Rival` (T5) live in storyStore; the single funding award site in `evaluate` gains objectiveRewardScale (T3) alongside capability bonus + streak (7B) + place — ONE addFunding.
- **Security/resilience:** `/api/story` key server-only, ALWAYS-200; all feeds isolated + cached + never-blank; rival races engine-adjudicated (LLM narrates only).
- **Determinism/back-compat:** pure libs no clock/random; rival ETA + arc progression seeded/deterministic; `objective`/`storyStore` hydrate defaults; contracts without objectives = single-pass.
- **Order:** completion-fold (T1) → data (T2) → gameplay variety (T3) → narrative (T4) → rival (T5) → cohesion/e2e (T6). Each ships playable.

## Execution Handoff

Execute via **superpowers:subagent-driven-development** — fresh implementer per task, task review after each, one broad final review (most-capable model), controller visual-verifies the visual beats (T1 completion bloom, T5 rival UI) on :3100, then merge to main and push. Keep the 231 unit tests green plus new suites; extend the Playwright smoke in T6.
