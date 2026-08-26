# HYPERION Plan 11 — Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax. Implementers MUST consult the Vercel `vercel-storage` (Neon) and `auth` (Clerk) skills and `node_modules/next/dist/docs/` for exact current App-Router APIs — do NOT rely on memorized API shapes.

**Goal:** Move the player's game state server-side (Neon Postgres) with Clerk sign-in, so saves are durable and portable — while keeping anonymous/local play fully working (login never required).

**Architecture:** A key/value **saves** table in Neon mirrors today's per-store localStorage blobs: `(owner_id, store_key, data jsonb, updated_at)`. Owner = Clerk user id when signed in, else an anonymous device id. Server routes `/api/save` + `/api/load` are auth-guarded (a request can only touch its own owner_id). A client **persistence bridge** hydrates stores from the server when a save exists (else localStorage), and write-throughs changes (debounced). Signing in migrates the anon device's saves to the user. All AI/feed invariants unchanged.

**Tech Stack:** Next.js App Router, `@clerk/nextjs`, `@neondatabase/serverless` (or the driver the vercel-storage skill recommends), zustand, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-hyperion-resilience-progression-design.md` §11.

## Global Constraints
- **Env (already provisioned, do not commit):** Neon `DATABASE_URL`/`POSTGRES_URL`/`POSTGRES_PRISMA_URL`; Clerk `CLERK_SECRET_KEY`/`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; `ANTHROPIC_API_KEY`. All server-side except the `NEXT_PUBLIC_` Clerk key. `.env.local` gitignored.
- **Login never required:** anonymous device play must keep working exactly as today (localStorage), with server persistence layered on top. No feature regresses when logged out or when the DB/Clerk is unreachable — degrade to local, never crash (ALWAYS-degrade, like ALWAYS-200).
- **Security:** server routes derive `owner_id` from Clerk auth (`auth()`), never trust a client-supplied user id. Anonymous owner id is a client-generated UUID (localStorage) — treated as a bearer of only that anon save. Never log secrets. Parameterized SQL only (no injection).
- **Back-compat:** existing localStorage saves keep working; on first server load the bridge can seed the server from local. Keep all 459 unit tests green; tsc clean; `npm run build` succeeds (build must not require a live DB — routes handle a missing/unreachable DB gracefully).
- **Port 3100.** Determinism/engine-React boundary unchanged.

## Tasks

### Task 1: Neon data layer + saves schema + save/load routes (anonymous owner)
- Install the Neon driver per the **vercel-storage** skill. Create `src/lib/db.ts`: a lazily-initialised Neon client from `DATABASE_URL` (or the skill's recommended var); export typed helpers `upsertSave(ownerId, key, data)`, `loadSaves(ownerId) → {key,data}[]`, `deleteSaves(ownerId)`. Parameterized SQL. If the DB env is absent/unreachable, throw a typed error the routes catch (so build + logged-out play never break).
- Schema: a `saves` table `(owner_id text, store_key text, data jsonb, updated_at timestamptz default now(), primary key (owner_id, store_key))`. Create it via an idempotent `ensureSchema()` (CREATE TABLE IF NOT EXISTS) called on first route use, OR a `scripts/db-migrate.ts` documented in the report. 
- Routes `src/app/api/save/route.ts` (POST `{key, data}`) + `src/app/api/load/route.ts` (GET). For THIS task, derive owner from a request header/body `x-anon-id` (client device id) — Clerk auth is added in Task 3. **ALWAYS return 200** with `{ok:false, reason}` on DB error (never 500; logged-out/no-DB play must continue). Validate `key` against an allowlist of the 6 store keys. 
- Unit-test the pure allowlist/validation helper; the DB layer itself is integration (guard tests from needing a live DB — mock or skip live calls). Verify `npm run build` still succeeds WITHOUT a DB connection.
- Commit.

### Task 2: Client persistence bridge (write-through + hydrate, local fallback)
- `src/lib/anonId.ts`: get-or-create a persistent anonymous device id in localStorage (`hyperion-anon-id`). Pure-ish; SSR-guarded.
- `src/state/persistBridge.ts` (or a `PersistBridge` mount component): on app start (after store hydrate), call `/api/load` (with `x-anon-id`); if the server has saves, hydrate the stores from them (agency/fleet/contracts/story/profile/onboarded) — server wins when present, else keep localStorage. Then subscribe to each store and **debounced write-through** changes to `/api/save`. Never block the UI; on any failure, silently keep working from localStorage (the existing `saveJSON` stays as the local mirror). 
- Read how each store hydrates/persists (loadJSON/saveJSON keys) and add a `hydrateFrom(data)` path per store (or set state directly) so the bridge can inject server data. Keep it minimal + consistent.
- Verify logged-out play is unchanged when the DB is unreachable (bridge no-ops). Commit.

### Task 3: Clerk auth (provider, middleware, sign-in UI) + owner migration
- Wire Clerk per the **auth** skill + Next docs: `<ClerkProvider>` in the root layout, `clerkMiddleware()` in `middleware.ts`, and a subtle sign-in control in the HUD (e.g. in Settings or the top bar) — Sign in / Sign out, showing the user when signed in. **Login stays optional** — the game is fully playable signed-out (anon id).
- Server routes (`/api/save`, `/api/load`) now derive owner: `const { userId } = auth()` → use `userId` when present, else the `x-anon-id` header. A signed-in user can only access their own rows.
- **Migration on sign-in:** when a user signs in and has anon saves locally, offer/auto-migrate them: copy the anon owner's saves to the user owner (server-side `migrateSaves(anonId, userId)` — upsert anon rows under userId if the user has none), so a logged-out session's progress carries into the account. Guard against clobbering an existing account save (prefer the account's if it exists; else adopt the anon one).
- Verify build + logged-out play unchanged. Commit.

### Task 4: Cohesion, resilience & gate
- Settings panel gains the auth control (Sign in / Sign out + "Saved to your account" vs "Saved on this device" status). On-brand.
- Resilience audit: DB down / Clerk down / offline → the game plays from localStorage with a subtle "offline — saving locally" note, never a crash or a blocked action. `npm run build` must succeed with NO live DB (routes lazy-connect + catch).
- e2e: logged-out play still founds + persists locally (existing smoke passes); a save/load round-trip via the anon path works when the DB is reachable (or is correctly skipped/mocked in CI). Keep all existing assertions.
- Full gate: `npx vitest run` (all green), `npx tsc --noEmit` (clean), `npm run build` (success). Commit.

## Global Self-Review
- §11 coverage: Neon data layer + saves (T1), client bridge hydrate/write-through + anon identity (T2), Clerk auth + owner + migration (T3), cohesion/resilience/gate (T4). Login-optional + local-fallback threaded through every task.
- Security: owner derived server-side from Clerk; parameterized SQL; secrets server-only; ALWAYS-degrade.
- No-regression: logged-out/no-DB play identical to today; build doesn't need a DB; 459 tests green.

## Execution Handoff
Execute via subagent-driven-development. Implementers consult the Vercel `vercel-storage` + `auth` skills and `node_modules/next/dist/docs/` for exact APIs. Controller verifies build + logged-out play on :3100, then merge to main + push. **Deploy note:** the Neon/Clerk env vars are already in the Vercel `hyperion` project, so production picks them up on push.
