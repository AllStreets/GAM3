# HYPERION Plan 12 — Server-Authoritative Living World (away-tick)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Implementers consult the Vercel `vercel-storage` + `deployment` skills and `node_modules/next/dist/docs/` for exact current cron/route APIs (Next 16). Do NOT rely on memorized cron/config APIs.

**Goal:** The world evolves while you're offline. A scheduled server tick advances each away player's persisted world — contracts expire, the rival claims unfinished races, fresh contracts appear, story arcs advance — and you return to a genuinely changed world with a rich "while you were away" digest.

**Design decisions (Connor):** (1) **Server tick for the away-world** — live play stays client-side/fast; a cron advances offline players' state in Neon (NOT a full server-authoritative rewrite). (2) **Real stakes offline** — active contracts expire-fail (normal −5 rep) and the rival claims contested races while you're away. (3) **Deterministic tick** — no per-tick AI; rich AI dispatches still fire on live return.

**Architecture:** A pure `advanceWorld(state, ctx) → { next, digest }` engine (reusing existing pure libs) is called by a cron-protected `/api/tick` route that iterates *due, offline* owners in Neon, advances each, and writes back the changed store blobs + a per-owner away-digest. The client (already server-persisted via Plan 11's `PersistBridge`) hydrates the advanced state on load and surfaces the digest in the cold-open. Sim-time is wall-clock-derived (`simNow()`), so server and client agree on "now".

**Tech Stack:** Next.js 16 App Router, `@neondatabase/serverless`, Vercel Cron, zustand, vitest, Playwright.

## Global Constraints
- **Env:** Neon (`DATABASE_URL`), Clerk keys, `ANTHROPIC_API_KEY` (already provisioned). **NEW: `CRON_SECRET`** — must be set in Vercel for `/api/tick` auth (Vercel cron sends `Authorization: Bearer $CRON_SECRET`). **Connor must add `CRON_SECRET` in Vercel → pause & tell him the exact step in T4.** Locally, hit `/api/tick` with the secret manually to verify.
- **Security:** `/api/tick` rejects requests without the correct `CRON_SECRET` bearer (403/return `{ok:false}`) — never process without it. Parameterized SQL only. Secrets server-only, never logged.
- **Resilience / ALWAYS-safe:** the tick NEVER crashes the whole run — per-owner try/catch, cap owners per tick, ALWAYS-200-style. With no cron/secret/DB, the game plays exactly as today (static world; client still evaluates on load). Build must succeed with no DB.
- **No clobber of live play:** skip owners whose save `updated_at` is recent (within ~a few minutes = a live session). A `lastTick` guard prevents re-processing the same elapsed sim-time.
- **No double-apply:** the client ADOPTS server-advanced state on load (server wins for the away delta, per Plan 11 PersistBridge); already-`failed`/claimed contracts are not re-processed by client `evaluate` (it only touches `active`). Rep is adjusted once (by whichever expires it first).
- **Never-ruin invariant holds:** offline losses are contracts/rep, never the fleet; the earned safety net + stuck backstop (Plan 10) still guarantee recovery. Determinism (no `Math.random`/`Date.now` in the pure engine; `simNow()`/injected time). Keep all 462 unit tests green; tsc clean; build succeeds.

---

## File Structure
- New pure: `src/lib/worldTick.ts` (+ test) — `advanceWorld` + `WorldDigest`.
- New route: `src/app/api/tick/route.ts` (cron-protected).
- New/extracted: `src/lib/eventsSource.ts` — a reusable server function that fetches + normalizes the live feeds (extracted from `/api/events` so both it and the tick share it).
- Cron config: `vercel.ts` (or `vercel.json`) `crons` entry.
- Modified: `src/app/api/events/route.ts` (use `eventsSource`), `src/lib/db.ts` (a `dueOwnersForTick`/iteration helper + write the digest key), `src/lib/coldOpen.ts` + `src/components/ColdOpenScreen.tsx` (surface the server digest), `src/components/PersistBridge.tsx` (load + expose the digest; clear on consume), `src/lib/db.ts` STORE_KEYS (+ `hyperion-worlddigest-v1` so the client can clear it).

---

## Task 1: `advanceWorld` engine (pure, TDD)
**Files:** `src/lib/worldTick.ts` + `src/lib/worldTick.test.ts`.

**Interface:**
```ts
import type { Contract } from '@/state/contractStore'
import type { Satellite } from '@/state/gameStore'
import type { Rival } from '@/lib/rival'
import type { Arc, Dispatch } from '@/lib/storyProgress'  // (Dispatch may live in storyStore)
export interface WorldDigest {
  atSim: number
  contractsExpired: string[]      // titles
  rivalClaimed: string[]          // titles the rival took
  newOffers: number
  arcBeat: string | null          // short line
  dispatches: string[]            // new dispatch texts added this tick
}
export interface WorldState {
  agency: { funding: number; reputation: number; leaning?: unknown; /* passthrough rest */ [k: string]: unknown }
  fleet: Satellite[]
  contracts: Contract[]
  story: { arcs: Arc[]; dispatches: Dispatch[]; rival: Rival; [k: string]: unknown }
}
export interface AdvanceCtx { nowSim: number; events: { id:string; kind:string; title:string; lat:number; lon:number; time:string; severity:number }[]; periodSec: number }
export function advanceWorld(state: WorldState, ctx: AdvanceCtx): { next: WorldState; digest: WorldDigest }
```
**Behavior (deterministic — reuse existing pure libs):**
- **Expire** each `active` contract with `deadline < nowSim` that is NOT contested-and-claimed → status `'failed'`, `agency.reputation = max(0, rep - 5)`, add its title to `digest.contractsExpired`. (Matches live expiry.)
- **Rival claim:** for each `contested` `active` contract where `acceptedAtSec + contested.rivalEtaSec < nowSim` AND the player hasn't completed it → the rival claims it: status `'failed'` (soft), `rival = applyRaceResult(rival,'rival')`, `reputation = max(0, rep-1)` (gentle), add title to `digest.rivalClaimed`, add a rival dispatch. (Reuse `@/lib/rival`.)
- **Refresh board:** drop `available` contracts past deadline; then top up available contracts from `ctx.events` via `seedContracts(events, nowSim, periodSec)` (reachability-filter against `fleet` per Plan 10 — reuse `fleetReachability`; never offer unreachable auto-contracts), capping the board at the existing max; count added → `digest.newOffers`. Never blank.
- **Advance story:** `advanceArc` the main arc (escalate based on whether the rival gained), set `digest.arcBeat` to a short templated line; add 1 templated dispatch (deterministic, on-brand, respectful) → `digest.dispatches` + `story.dispatches`.
- Return `{ next, digest }`. **Pure** — no clock/random/network; all inputs via args. Passthrough unknown state fields untouched (don't drop agency/story fields you don't manage).

- [ ] TDD: expired active → failed + −5 rep + in digest; contested past ETA → rival claims + rival.wins++ + −1 rep + in digest; a completed contract is NOT expired/claimed; board tops up from events (reachability-filtered, capped, never blank); arc advances + a dispatch added; passthrough fields preserved; fully deterministic. FAIL → implement → PASS. Commit.

---

## Task 2: `/api/tick` route + Neon iteration + cron
**Files:** `src/app/api/tick/route.ts`, `src/lib/eventsSource.ts` (extract from `/api/events`), `src/lib/db.ts` (iteration + digest write), `vercel.ts`/`vercel.json` cron.

- [ ] **Extract `eventsSource.ts`** — a server function `fetchWorldEvents(): Promise<WorldEvent[]>` that does what `/api/events` GET does (feeds + normalizers + isolation + cache). Refactor `/api/events/route.ts` to call it (no behavior change). The tick reuses it.
- [ ] **`db.ts` helpers:** `dueOwnersForTick(sinceSim, activeWithinSec, limit)` → owner ids whose max(`updated_at`) is OLDER than `activeWithinSec` ago (offline) AND whose `hyperion-worldmeta` lastTick is due (or missing), capped at `limit`. `loadOwnerState(ownerId)` → assemble a `WorldState` from the owner's store blobs (agency/fleet/contracts/story; default empties if missing). `writeOwnerState(ownerId, next, digest, nowSim)` → upsert the changed store blobs + `hyperion-worlddigest-v1` (the digest) + `hyperion-worldmeta` (`{lastTickSim: nowSim}`). Parameterized. Add `hyperion-worlddigest-v1` + `hyperion-worldmeta` to `STORE_KEYS` (so load returns them / client can clear the digest).
- [ ] **`/api/tick/route.ts`:** verify `Authorization: Bearer $CRON_SECRET` (reject otherwise). Compute `nowSim = simNow()`; `events = await fetchWorldEvents()`; `owners = dueOwnersForTick(...)` (cap e.g. 50). For each owner (per-owner try/catch so one failure doesn't abort the run): `state = loadOwnerState`; skip if not founded / empty; `{next,digest} = advanceWorld(state, {nowSim, events, periodSec})`; if anything changed, `writeOwnerState`. Return `{ ok, processed, skipped }` (200; ALWAYS-safe). Never log secrets. `export const runtime='nodejs'`, `dynamic='force-dynamic'` (confirm vs Next 16 docs). Reasonable time budget (cap owners).
- [ ] **Cron config:** add a `crons` entry for `/api/tick` (schedule e.g. `*/20 * * * *` = every 20 min) in `vercel.ts` (preferred per Vercel docs) or `vercel.json`. Consult the Vercel deployment skill/docs for the exact current format + that Vercel injects the `CRON_SECRET` bearer.
- [ ] Build must succeed with no DB. Commit.

---

## Task 3: Client integration — richer "while you were away"
**Files:** `src/components/PersistBridge.tsx`, `src/lib/coldOpen.ts` (+ test), `src/components/ColdOpenScreen.tsx`.

- [ ] **Bridge:** on server hydrate, also read the `hyperion-worlddigest-v1` blob (if present) and expose it (a small `worldDigest` signal/store, like `persistStatus`). After the cold-open consumes it, **clear it** (POST an empty digest via the save route — now allowlisted — or a dedicated clear) so it shows once.
- [ ] **Cold-open:** extend `coldOpen.ts`'s `buildColdOpen` (or the ColdOpenScreen) to fold in the server `WorldDigest` when present: lines like "VANTIS claimed *Ende Aftershock Watch*", "3 taskings expired", "4 new contracts on the board", the `arcBeat`. Deterministic; append to the existing recap. TDD the digest→lines mapping.
- [ ] **ColdOpenScreen:** render the server-digest lines in the recap; still shows for returning founded players; dismiss consumes + clears the digest. On-brand.
- [ ] Ensure the client adopts server-advanced state cleanly (no double-ding: already-failed contracts aren't re-processed). `npx vitest run` + `npx tsc --noEmit`. Commit.

---

## Task 4: Provisioning, resilience & gate
**Files:** docs/report; small polish; e2e.

- [ ] **CRON_SECRET provisioning:** in the report, give Connor the exact steps to add `CRON_SECRET` in Vercel (`vercel env add CRON_SECRET production` + preview, or dashboard) and to set it in `.env.local` for local testing (`vercel env pull`). The controller will relay + pause for Connor.
- [ ] **Resilience audit:** no `CRON_SECRET` → `/api/tick` refuses (game unaffected, static world). DB down → tick no-ops, game plays local. Confirm build succeeds with no DB. The tick must not affect live sessions (updated_at skip verified).
- [ ] **Manual tick verification** (controller does this live): POST `/api/tick` with the secret against a seeded away-owner and confirm the digest + state change; confirm a *recently-active* owner is skipped.
- [ ] **e2e:** keep existing green; add a smoke that `/api/tick` without the secret is rejected and with a bad/no owner is safe. Don't require the cron to actually run in CI.
- [ ] **Full gate:** `npx vitest run` (all green), `npx tsc --noEmit` (clean), `npm run build` (success). Commit.

---

## Global Self-Review
- Decisions honored: server-tick (not full rewrite); real offline stakes (expire −5, rival claims); deterministic tick (no AI). Digest → rich cold-open.
- Security: cron-secret gate; parameterized SQL; secrets server-only; ALWAYS-safe; skip live owners; no double-apply; never-ruin holds.
- Reuse: `seedContracts`/`fleetReachability`/`rival`/`storyProgress`/`contractObjective`/`simNow`/feed normalizers. `advanceWorld` pure + TDD'd.
- No regression: live play unchanged; build works with no DB; 462 tests green.

## Execution Handoff
Execute via subagent-driven-development. Implementers consult the Vercel `vercel-storage`/`deployment` skills + `node_modules/next/dist/docs/`. Controller verifies the tick live (manual POST + skip behavior) + build + logged-out play, then merges. **Pause in T4 to have Connor add `CRON_SECRET` in Vercel** (production cron auth) before relying on the deployed cron.
