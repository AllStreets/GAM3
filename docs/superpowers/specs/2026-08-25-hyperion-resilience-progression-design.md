# HYPERION — Resilience, Progression & Persistence Design (Plans 10 & 11)

*Written 2026-08-25. Approved by Connor after a full Plan-9 playthrough that surfaced a soft-lock (a committed satellite couldn't reach its contract and refuel was unaffordable). Binding authority for Plans 10 and 11.*

## The problem this solves

The game can strand you: you commit a satellite to a contract, discover it can't reach the target within its fuel, and can't afford to refuel — with no way to recover and no signal that the contract was unreachable in the first place. This design makes play **robust to human error and bad luck** without removing stakes: you can always recover, the recovery cushion is *earned* by playing well, and contracts the game hands you are always physically reachable. It then adds **progression** (upgrades) and, in Plan 11, **server-side persistence**.

## Pillars (unchanged priority)

Gorgeous graphics · cool physics · excitement · per-user AI divergence. New cross-cutting principle: **never a dead end** — the player is never permanently soft-locked, but safety nets are earned, not handed out.

## Architecture invariants (carry forward)

- Non-rotating Earth; `latLonToVector3` ↔ `sceneFromEci` ↔ `vector3ToLatLon`; the textured Earth shells are rotated `TEXTURE_LON_OFFSET` (−90°) to align with this frame (do not regress).
- Engine (`src/engine/*`) no React; React no Three; zustand bridges. Determinism in game logic (no `Math.random`/`Date.now`; `simNow()`); `Date.now()` only for display timestamps / route `fetchedAt`.
- LLM: server routes only, zod, ALWAYS-200 + deterministic fallback, respectful framing, engine-enforces (targets/economy). Feeds isolated + timed-out + cached + never-blank.
- **Single funding award site** in `contractStore.evaluate` (capability bonus × streak × objectiveScale, capped) — new economy features must not add a second player award; spends go through `agencyStore.spendFunding`.
- Client-side persistence (localStorage) until Plan 11; every new persisted field hydrates with a back-compat default. Port 3100; key server-side only. Shared `ui/Chip` chrome.

---

## Plan 10 — Resilience & Progression

### 10.1 Reachability-aware contract generation (auto-only)

- **Hard reachability test (pure, deterministic):** a target is reachable by a satellite only if the satellite's orbital plane can bring its ground-track within `COMPLETION_RADIUS_KM` of the target — i.e. `|targetLat| ≤ inclinationDeg(sat) + latitudeMargin` (margin ≈ the completion radius in degrees, ~4.5°). A target is **fleet-unreachable** if NO satellite passes this test. New pure helper in `src/lib/reachability.ts`: `maxReachableLatDeg(sat)`, `isTargetReachable(sat, target)`, `fleetReachability(sats, target) → { reachable: boolean; bestSatId: string | null; bestApproxDvMs: number | null }` (best sat = the one needing the least NORMAL Δv to bring closest approach ≤ radius, approximated via `closestApproach`/`normalHint` sampling; annotate rough Δv).
- **Auto-generated contracts are filtered:** the briefing/story/seed → contract path (`contractsFromBriefing`, `seedContracts`) DROPS any contract whose target is fleet-unreachable at generation time. So the game never hands you an impossible tasking. (The board's never-empty rule still holds — seed from reachable events.)
- **Player click-to-generate is NOT filtered:** `/api/place-contract` + `buildPlaceContract` still let you create a contract anywhere — even beyond coverage — as a deliberate sandbox act. Such a contract is TAGGED "beyond current coverage" (a `reach` flag) so you know; accepting it is allowed (you chose it).
- **Annotation:** every contract carries a lightweight reachability annotation — `reachable` + `bestSatId` + approx Δv — surfaced in `ContractsPanel` as a "◀ HYPERION-N · ~420 m/s" tag (green if some bird can afford it now, amber if it needs refuel/upgrade, red "beyond coverage" for player-made unreachable ones). Recomputed as the fleet changes.

### 10.2 Never soft-locked — recovery (earned safety net)

- **STAND DOWN (abandon):** any ACTIVE contract can be stood down → its committed satellite is freed for retasking, the contract is dropped. Cost: a small reputation ding (like a mild expiry), **waived** when the agency is in a "stuck" state (see below). Action in `contractStore` (`standDown(id)`); button in `ContractsPanel` on active contracts.
- **Partial refuel:** `refuelSatellite` becomes **partial** — refuel up to what the player can afford (buy `min(missingDv, affordableDv)` at the per-Δv price), not all-or-nothing. The FleetPanel refuel control shows the affordable amount ("REFUEL +320 Δv · §196") and a full-refuel option when affordable. Pure price helper: `affordableRefuelDv(missingDv, funds, pricePerDv)`.
- **Stuck detection (pure):** `isAgencyStuck(fleet, funds, activeContracts)` = true when NO active contract can be progressed — i.e. for every active contract, the best-reachable satellite lacks the Δv AND the player can't afford enough refuel to change that — AND the player can't afford a new satellite. Deterministic.
- **Earned recovery reserve (per Connor):** the safety nets are *earned*, not always-on:
  - **Relief grant:** crossing reputation/completion milestones (e.g. every 5 completed contracts, or each new rank tier) awards a one-time **relief grant** of funding (scaled to the tier). Tracked in `agencyStore` (persisted). This is the income the player builds up.
  - **Emergency refit token:** milestones also grant **emergency-refit tokens** (e.g. 1 per rank tier). A token can be spent to fully refuel one stranded satellite for free (a "recall & refit"). Tracked + persisted.
  - **Stuck backstop:** if `isAgencyStuck` is true AND the player has zero funds, zero tokens, and no way forward, grant a single **emergency relief drop** (a minimal funding grant) so the game can always continue — rare, only when genuinely stuck, logged as a dispatch. This is the hard floor beneath the earned reserve.
- **UI:** an AGENCY area shows relief grants available + emergency-refit tokens; FleetPanel shows "EMERGENCY REFIT (1 token)" on a stranded satellite; a clear "STAND DOWN" on active contracts. All on-brand.

### 10.3 Upgrades / progression (all four)

Spend funding on lasting improvements (pure price/apply helpers, TDD'd; economy through `spendFunding`):
- **Buy satellite in a chosen plane:** the BUY flow lets you aim the new satellite's orbital plane at a **target/region you pick** (click a place or a contract → the bought satellite is placed in an inclination/RAAN that brings its ground-track over that point), instead of an auto plane. So you can deliberately buy coverage for a hard contract. (Reuse the founding/geo math; a lightweight "aim" step.)
- **Bigger fuel tanks:** upgrade a satellite's `fuelCapacity` (+Δv) for a funding fee (escalating per level). Lets it make longer plane-changes / reach farther.
- **Refuel efficiency:** an agency-wide (or per-sat) upgrade that lowers the §/Δv refuel price. Eases the economy squeeze.
- **Capability retrofit:** change a satellite's `capability` (imaging/comms/thermal) for a fee, so you can match more contracts.
- All upgrades: persisted, back-compat, priced so they're meaningful but not trivial; surfaced in an on-brand **UPGRADES / FLEET REFIT** panel.

### 10.4 Error handling & playability polish

- Guard every economy action (can't spend what you don't have; partial where sensible); clear affordance states (disabled + reason tooltip) instead of dead buttons.
- The intercept/burn flow already blocks igniting an unaffordable burn (arm margin) — extend the readout to say *why* ("needs refuel: +Δv / §" or "beyond this bird's reach — retask or upgrade").
- No action should leave the player without a legible next step; the guidance hint / dispatches surface the recovery path when stuck.

---

## Plan 11 — Persistence (after Plan 10)

Move client state server-side so the world is durable and can tick authoritatively.

- **Provisioning:** Neon Postgres + Clerk via **Vercel Marketplace** (`vercel integration add` — CLI authenticated). **NEVER Supabase.** This step may require Connor to complete a dashboard/browser auth — pause and ask when reached.
- **Auth:** Clerk sign-in; an agency is owned by a user. Anonymous/local play still works (local fallback) so the game never hard-requires login.
- **Schema:** agency (name/emblem/colorway/funding/reputation/leaning/tokens/upgrades), fleet (+ service records + capabilities + upgrades), contracts (+ objectives/progress/contested), story (arcs/dispatches/rival), profile. Server routes read/write via a typed data layer; the client hydrates from the server when authed, else localStorage.
- **Server-authoritative living world:** with persistence, contracts/story/rival can advance on the server (a tick / cron) so the world moves while you're away — deepening the "while you were away" cold-open. GDACS/feeds can be ingested server-side.
- Invariants unchanged: key server-side, ALWAYS-200, respectful, engine-enforces; determinism where it matters.

---

## Resilience, testing, scope

- **Pure modules TDD'd:** `reachability.ts` (max reachable latitude, fleet reachability, best-sat/Δv), `affordableRefuelDv`, `isAgencyStuck`, upgrade price/apply helpers, milestone/relief-grant/token math.
- **Feeds/routes:** unchanged discipline (isolation, timeout, cache, ALWAYS-200, never-blank).
- **Playwright:** stand-down frees a satellite; partial refuel buys affordable Δv; an unreachable auto-contract never appears (seed a fleet + a polar target and assert it's filtered) while a click-made one at the same target is allowed + tagged.
- **v1 scope (Plan 10):** reachability filter (auto-only) + annotation, stand-down, partial refuel, earned relief grants + emergency-refit tokens + stuck backstop, the four upgrades, error-handling polish.
- **Deferred / Plan 11:** Neon+Clerk persistence + server-authoritative ticks.
- **Non-goals:** multiplayer/PvP, mobile, marketplace.

## Build note

Two plans share this spec:
- **Plan 10 — Resilience & Progression:** reachability, stand-down, partial refuel, earned safety net, the four upgrades, error polish. Fully autonomous; build first (it fixes an active soft-lock).
- **Plan 11 — Persistence:** Neon+Clerk, server-side state + authoritative world. May require Connor to provision.

Each ships playable and is verified before the next.
