# HYPERION Plan 10 — Resilience & Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make play robust to human error and bad luck — never a permanent soft-lock (earned safety nets), never handed an unreachable contract — and add meaningful progression (four upgrades).

**Architecture:** Pure, TDD'd libs for reachability + economy safety math, layered into the existing zustand stores (game/agency/contract) and surfaced in the HUD. Auto-generated contracts are filtered by a deterministic reachability test; player click-to-generate stays unrestricted. Recovery (stand-down, partial refuel) is always available; the cushion (relief grants, emergency-refit tokens) is earned via milestones, with a rare stuck-backstop floor. Upgrades spend funding through the single economy path.

**Tech Stack:** Next.js App Router, Three.js 0.169, zustand, vitest, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-25-hyperion-resilience-progression-design.md` (§10; §11 is Plan 11).

## Global Constraints

- **Port 3100.** Determinism in game logic (no `Math.random`/`Date.now`; `simNow()`); `Date.now()` only for display timestamps.
- **Single funding award site** in `contractStore.evaluate` stays intact — new economy features are SPENDS (via `agencyStore.spendFunding`) or milestone GRANTS (a separate, clearly-bounded path), never a second contract-completion award.
- **Never regress** the Earth texture alignment (`TEXTURE_LON_OFFSET` in GlobeEngine), the geolocation, or the 7B/8/9 features. Engine no React; React no Three.
- **Back-compat persistence:** every new persisted field (agency tokens/grants/upgrades/efficiency, satellite capacity/upgrade levels, contract reach annotation) hydrates with a default; no key bumps without migration.
- **Never a dead end:** no action leaves the player without a legible next step; disabled controls show *why*. On-brand `ui/Chip` chrome. Respectful copy.
- **Feeds/LLM invariants** unchanged (isolation, timeout, cache, ALWAYS-200, key server-side).

---

## File Structure

**New pure libs (TDD):** `src/lib/reachability.ts`, `src/lib/recovery.ts` (affordableRefuelDv, isAgencyStuck), `src/lib/upgrades.ts` (price/apply helpers), `src/lib/milestones.ts` (relief-grant + token math).
**New UI:** `src/components/UpgradesPanel.tsx` (fleet refit + upgrades), `src/components/BuyPlanePicker.tsx` (aim a bought satellite's plane).
**Modified:** `src/state/gameStore.ts` (partial refuel, capacity/capability upgrades, emergency refit, buy-in-plane), `src/state/agencyStore.ts` (relief grants, emergency-refit tokens, refuel-efficiency, milestone accrual), `src/state/contractStore.ts` (standDown, reachability annotation on contracts, filter hook), `src/lib/economy.ts` (partial-refuel price + efficiency), `src/lib/contractsFromBriefing.ts` + `src/lib/placeContract.ts` (auto-filter vs player-tag), `src/components/ContractsPanel.tsx` (reach tag + STAND DOWN), `src/components/FleetPanel.tsx` (partial refuel + emergency refit + upgrade entry), `src/app/api/briefing/route.ts` (optional: pass reachability context — engine still filters).

---

## Task 1: Reachability lib + auto-contract filter + annotation

**Files:** Create `src/lib/reachability.ts` + test; modify `src/lib/contractsFromBriefing.ts`, `src/lib/placeContract.ts`, `src/state/contractStore.ts` (annotation), `src/components/ContractsPanel.tsx`.

**Interfaces (pure):**
```ts
import type { OrbitalElements } from '@/lib/orbits'
import type { Satellite } from '@/state/gameStore'
export const REACH_LAT_MARGIN_DEG: number  // ~4.5 (COMPLETION_RADIUS_KM as degrees)
export function inclinationDeg(el: OrbitalElements): number  // el.i in radians → degrees, folded to [0,90] reach (i and 180-i reach same |lat|)
export function maxReachableLatDeg(el: OrbitalElements): number  // min(90, inclinationDeg + REACH_LAT_MARGIN_DEG)
export function isTargetReachable(el: OrbitalElements, targetLat: number): boolean  // |targetLat| <= maxReachableLatDeg
export interface FleetReach { reachable: boolean; bestSatId: string | null; bestApproxDvMs: number | null }
export function fleetReachability(sats: Satellite[], target: { lat: number; lon: number }): FleetReach
// reachable = any sat isTargetReachable(targetLat). bestSatId/bestApproxDvMs = among reachable sats, the one whose
// current closest-approach (via closestApproach over ~3 revs) is smallest, with a rough NORMAL Δv estimate to close the gap
// (approximate: dv ≈ (closestKm - COMPLETION_RADIUS_KM)/scale, clamped ≥ 0; keep deterministic + cheap). null when none reachable.
```

- [ ] **Step 1: Failing tests** — `maxReachableLatDeg` for i=51.6° ≈ 56°; a target at 80°N is unreachable by a 51.6° sat but reachable by a 97.5° (polar) sat; `fleetReachability` returns reachable+bestSatId when any plane covers it, `{reachable:false,bestSatId:null}` for a target beyond all inclinations. (Use small fixtures.)
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement `reachability.ts`** (fold inclination i and 180−i to the same |lat| reach; reuse `closestApproach`/`orbitalPeriod` from intercept/orbits for the best-sat Δv approximation — keep it cheap/deterministic).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Filter AUTO contracts** — in `contractsFromBriefing` + `seedContracts`, DROP any contract whose target is fleet-unreachable **given the current fleet** (pass the fleet in — these fns will need the satellites; thread `useGameStore.getState().satellites` from the caller, or add a `sats` param). Never-blank still holds (seed from reachable events; if somehow none, keep prior board). Player path (`buildPlaceContract`) is NOT filtered — instead set a `reach` annotation.
- [ ] **Step 6: Annotate contracts** — add optional `reach?: FleetReach` to `Contract` (transient/recomputed, back-compat). Compute it when building/refreshing available contracts and recompute on fleet change (a helper the store calls). ContractsPanel shows a tag: reachable+affordable → green "◀ HYPERION-N · ~420 m/s"; reachable but needs refuel/upgrade → amber; unreachable (player-made) → red "beyond coverage". Keep existing chips.
- [ ] **Step 7:** `npx vitest run` + `npx tsc --noEmit`. Commit — `feat(resilience): reachability filter for auto-contracts + reach annotation`

---

## Task 2: Stand-down + partial refuel + stuck detection

**Files:** Create `src/lib/recovery.ts` + test; modify `src/lib/economy.ts`, `src/state/gameStore.ts`, `src/state/contractStore.ts`, `src/components/FleetPanel.tsx`, `src/components/ContractsPanel.tsx`.

**Interfaces (pure):**
```ts
// economy.ts
export function refuelPricePerDv(efficiencyLevel?: number): number  // base §/Δv (from existing refuelPrice), reduced by efficiency (Plan T4)
export function affordableRefuelDv(missingDv: number, funds: number, pricePerDv: number): number  // floor(min(missingDv, funds/pricePerDv))
// recovery.ts
export function isAgencyStuck(input: {
  fleet: { fuel: number; fuelCapacity: number }[]; funds: number
  activeTargetsBestDv: (number|null)[]  // per active contract, best-reachable-sat Δv-needed (null if unreachable)
  satellitePrice: number; pricePerDv: number
}): boolean
// true when no active contract is progressable: for each, the best sat lacks Δv AND player can't afford enough refuel to close it,
// AND player can't afford a new satellite. Deterministic.
```

- [ ] **Step 1: Failing tests** — `affordableRefuelDv` (full when affordable, partial when funds-limited, 0 when broke); `isAgencyStuck` true when broke + all birds dry + can't afford refuel/new-sat, false when any path exists.
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Partial refuel** — `gameStore.refuelSatellite(id, dv?)`: if `dv` omitted, refuel the **affordable** amount (`affordableRefuelDv(missing, funds, pricePerDv)`); if given, refuel that (capped by affordable+missing). Spend via `agencyStore.spendFunding`. Update FleetPanel refuel control to show "REFUEL +{affordableDv} Δv · §{cost}" and a "FULL §{fullCost}" option when affordable; never a dead all-or-nothing button.
- [ ] **Step 4: STAND DOWN** — `contractStore.standDown(id)`: an ACTIVE contract → dropped (removed or status 'failed' soft), its committed satellite freed (clear target if it was targeted). Reputation: small ding via `addReputation(-2)`, **waived** (0) when `isAgencyStuck`. ContractsPanel shows a "STAND DOWN" control on active contracts (confirm-on-click). Emit a dispatch ("Stood down from {title}.").
- [ ] **Step 5:** `npx vitest run` + `npx tsc --noEmit`. Commit — `feat(resilience): stand-down + partial refuel + stuck detection`

---

## Task 3: Earned safety net — relief grants + emergency-refit tokens

**Files:** Create `src/lib/milestones.ts` + test; modify `src/state/agencyStore.ts`, `src/state/gameStore.ts`, `src/components/AgencyBar.tsx`/`FleetPanel.tsx`, `src/state/contractStore.ts` (accrue on completion + stuck backstop).

**Interfaces (pure):**
```ts
// milestones.ts
export interface Milestones { completed: number; reliefGrantsClaimed: number; refitTokens: number }
export function accrueOnCompletion(m: Milestones): { milestones: Milestones; grantedFunding: number; grantedTokens: number }
// every 5 completions → a relief grant (funding scaled to tier) + occasionally a refit token; deterministic.
export function reliefGrantAmount(completed: number): number  // scales with progress (e.g. 200 + 40*floor(completed/5))
```

- [ ] **Step 1: Failing tests** — `accrueOnCompletion` grants funding+token on the 5th/10th completion, nothing in between; `reliefGrantAmount` scales up. Deterministic.
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: agencyStore** — add persisted `milestones: Milestones` + `refitTokens` accessor + actions: on a contract completion, `contractStore.evaluate` calls an agency hook `agency.recordCompletionMilestone()` → applies `accrueOnCompletion`, adds any `grantedFunding` (a SEPARATE grant path, not the contract award; add via `addFunding`) + tokens, and emits a dispatch ("Relief grant secured: §N"). Back-compat hydrate.
- [ ] **Step 4: Emergency refit** — `gameStore.emergencyRefit(satId)`: if the agency has a refit token, fully refuel that satellite for free, decrement the token, emit a dispatch. FleetPanel shows "EMERGENCY REFIT ({n} tokens)" on a stranded/low satellite, disabled with a reason when no tokens.
- [ ] **Step 5: Stuck backstop (hard floor)** — in `contractStore.evaluate` (or a small tick), if `isAgencyStuck` AND funds==0 AND refitTokens==0 AND no active contract progressable, grant a single minimal **emergency relief drop** (small funding) at most once per stuck episode (guard with a flag so it doesn't spam), emit a somber dispatch. This guarantees the game always continues.
- [ ] **Step 6: UI** — AgencyBar/a small panel shows relief grants + refit tokens available. On-brand.
- [ ] **Step 7:** `npx vitest run` + `npx tsc --noEmit`. Commit — `feat(resilience): earned relief grants + emergency-refit tokens + stuck backstop`

---

## Task 4: Upgrades — bigger tanks, refuel efficiency, capability retrofit

**Files:** Create `src/lib/upgrades.ts` + test, `src/components/UpgradesPanel.tsx`; modify `src/state/gameStore.ts`, `src/state/agencyStore.ts`, `src/components/FleetPanel.tsx`/`Hud.tsx`.

**Interfaces (pure):**
```ts
// upgrades.ts
export function tankUpgradeCost(level: number): number   // escalating, e.g. 300 * (level+1)
export function tankUpgradeDv(level: number): number      // +Δv capacity per level, e.g. 300
export function refuelEfficiencyCost(level: number): number
export function refuelEfficiencyFactor(level: number): number  // multiplier ≤1 on §/Δv, e.g. 1 - 0.1*level (floor 0.6)
export const RETROFIT_COST: number
```

- [ ] **Step 1: Failing tests** — costs escalate; tankUpgradeDv positive; efficiency factor decreases with a floor; retrofit cost constant.
- [ ] **Step 2: FAIL → implement → PASS.**
- [ ] **Step 3: Satellite upgrade fields** — add `tankLevel: number` (default 0) to `Satellite` (back-compat hydrate). `gameStore.upgradeTank(satId)`: spend `tankUpgradeCost(tankLevel)`, `fuelCapacity += tankUpgradeDv(level)`, `tankLevel++`. `gameStore.retrofitCapability(satId, cap)`: spend `RETROFIT_COST`, set `capability`. Both via `spendFunding`, guarded.
- [ ] **Step 4: Refuel efficiency** — agency-wide `refuelEfficiencyLevel` (persisted) in `agencyStore`; `agencyStore.upgradeRefuelEfficiency()` spends `refuelEfficiencyCost(level)`, increments level. `economy.refuelPricePerDv(level)` applies `refuelEfficiencyFactor`. Wire the partial-refuel price (T2) to read the agency's efficiency level.
- [ ] **Step 5: UpgradesPanel** — an on-brand "FLEET REFIT" panel (reachable from FleetPanel or a control): per selected satellite, TANK UPGRADE (+Δv · §cost) and RETROFIT (OPTICAL/RELAY/THERMAL · §cost); agency-wide REFUEL EFFICIENCY (§cost). Disabled + reason when unaffordable. Mount without HUD overlap.
- [ ] **Step 6:** `npx vitest run` + `npx tsc --noEmit`. Commit — `feat(progression): tank / refuel-efficiency / capability-retrofit upgrades`

---

## Task 5: Buy satellite in a chosen plane

**Files:** Create `src/components/BuyPlanePicker.tsx`; modify `src/state/gameStore.ts`, `src/components/FleetPanel.tsx`.

**Design:** Buying a satellite lets you AIM its orbital plane at a target/region so you can deliberately buy coverage for a hard contract (instead of the current auto plane).

- [ ] **Step 1: `gameStore.buySatelliteAimed(target?: {lat:number; lon:number})`** — like `buySatellite` (spends `SATELLITE_PRICE`) but places the new satellite in an orbit whose plane brings its ground-track over `target` when given: set inclination `i = clamp(|targetLat| + a few°, min 5°, max ~99°)` and choose `raan`/`m0` so the ascending node/phase puts the ground-track near `target.lon` at a near-term time (approximate is fine — the player then flies to fine-tune). If no target, keep the existing auto behavior. Pure helper `planeForTarget(lat, lon, index) → Partial<OrbitalElements>` (TDD: inclination ≥ |lat|, deterministic). Back-compat: keep `buySatellite()` working.
- [ ] **Step 2: `BuyPlanePicker.tsx`** — the BUY control offers "AUTO" or "AIM AT…": AIM lets you pick a target — the currently-targeted contract, or a clicked place (reuse `placeStore` if convenient), or type/pick a region — then calls `buySatelliteAimed(target)`. Show the resulting reach ("new bird will cover ~{lat}° latitude"). On-brand; guarded by funds.
- [ ] **Step 3:** unit-test `planeForTarget` (inclination covers the target latitude; deterministic). `npx vitest run` + `npx tsc --noEmit`. Commit — `feat(progression): buy a satellite aimed at a chosen plane/target`

---

## Task 6: Error-handling polish, cohesion & e2e

**Files:** polish across panels; `e2e/*.spec.ts`.

- [ ] **Step 1: Legible dead-ends** — audit economy/burn controls: every disabled action shows WHY (tooltip/subtext: "needs refuel: +{Δv} · §{cost}", "beyond this bird's reach — retask or upgrade", "insufficient funds — §{n} short"). Extend `InterceptReadout`/`GuidanceHint` to surface the recovery path when the tracked contract is unreachable/unaffordable (suggest STAND DOWN / refit / upgrade / buy-aimed).
- [ ] **Step 2: Cohesion** — new controls (STAND DOWN, partial refuel, UpgradesPanel, BuyPlanePicker, reach tags, tokens) share `ui/Chip` + accent + panel chrome; no HUD overlap with existing zones (left rail, right rail, bottom-center place card, bottom-right postcard/guide).
- [ ] **Step 3: e2e** — extend the smoke: (a) an unreachable auto-contract is filtered (seed a fleet with only low-inclination birds + a polar-target event via a dev hook, assert no auto-contract at that target) while a player-created contract at that target is allowed + tagged "beyond coverage"; (b) STAND DOWN on an active contract frees its satellite; (c) partial refuel with limited funds buys a partial amount. Keep existing assertions (no console errors, non-black canvas). Use the established `window.__*store` dev-hook pattern.
- [ ] **Step 4: Full gate** — `npx vitest run` (all green), `npx tsc --noEmit` (clean), `npm run build` (success). Commit — `feat(resilience): error-handling polish + cohesion + e2e`

---

## Global Self-Review (run before execution)

- **Spec coverage:** §10.1 reachability→T1; §10.2 stand-down/partial-refuel/stuck→T2 + earned safety net→T3; §10.3 upgrades→T4 (tanks/efficiency/retrofit) + T5 (buy-in-plane); §10.4 error polish→T6. All mapped.
- **Type consistency:** `FleetReach` (T1) on `Contract.reach`; `Milestones` (T3) in agencyStore; satellite `tankLevel` (T4); `planeForTarget` (T5). Economy `refuelPricePerDv(efficiencyLevel)` (T2/T4) shared.
- **Economy integrity:** contract-completion single award site untouched; all new spends via `spendFunding`; milestone grants are a separate bounded path; stuck backstop guarded to fire at most once per episode.
- **Determinism/back-compat:** pure libs no clock/random; all new persisted fields hydrate defaults; auto-filter never blanks the board.
- **Order:** reachability (T1) → recovery (T2) → earned net (T3) → upgrades (T4) → buy-in-plane (T5) → polish/e2e (T6). Each ships playable and directly reduces soft-lock risk.

## Execution Handoff

Execute via **superpowers:subagent-driven-development** — fresh implementer per task, task review after each, one broad final review (most-capable model), controller visual-verifies the recovery flow (stand-down, partial refuel, tokens) + upgrades on :3100, then merge to main and push. Keep the 329 unit tests green plus new suites; extend the Playwright smoke in T6. Then proceed to Plan 11 (Persistence), pausing for provisioning if it needs Connor.
