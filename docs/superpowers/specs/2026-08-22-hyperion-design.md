# HYPERION — Design Spec

*2026-08-22 · approved concept design*

## What it is

HYPERION is a browser game about running a private orbital agency above a living Earth. The globe is real — fed by live world data (earthquakes, storms, wildfires, rocket launches) — and an LLM weaves a personalized fictional layer (rival agencies, anomalies, escalating arcs) on top of it. The player commands a satellite constellation with real orbital mechanics, and personally flies the critical moments: burn windows, atmospheric re-entries, and (post-v1) drone runs and proximity operations. The world persists and evolves while the player is away. No two players' worlds are the same.

**Design pillars (in priority order):**
1. Gorgeous graphics — the cinematic living Earth is the hero artifact
2. Cool physics — real Keplerian orbital mechanics; physics-driven flying moments
3. Exciting — real stakes (satellites can die), time pressure, hands-on action
4. Grows differently for every user — LLM-driven fiction layer shaped by playstyle
5. Story is ambient flavor, never a gate — no required narrative

## Player role

**Commander + pilot.** Strategic layer: survey the globe, accept contracts, plan orbital maneuvers, manage fuel/fleet/funding. Action layer: critical moments are flown by hand as short (1–3 minute) physics-driven sequences. Strategy creates tension; piloting delivers adrenaline.

## World truth model

**Real anchors + fiction layer.**
- Real live events (USGS earthquakes, GDACS disasters, NASA EONET wildfires/storms, Launch Library rocket launches) are ingested continuously and appear on the globe as they happen on the real Earth.
- Missions derived from real disasters use a respectful hero-response framing only: observe, map, relay communications, protect. Real victims are never gamified.
- The LLM generates a fictional layer for density and drama: rival agencies with agendas and memory, mysterious signals, satellite anomalies, escalating personalized arcs. All villains and conflict live in the fiction layer.

## Time model — "Hyperion time"

- Orbital motion runs at ~20× wall-clock: a low-Earth orbit completes in ~4–5 minutes. The sky is visibly alive; transfer windows arrive on gameplay timescales. Exact multiplier is a tuning parameter.
- Real-world events remain pinned to wall-clock reality (they appear when they actually happen).
- Each player has an isolated world, so accelerated orbital time never conflicts between players.

## Persistence — living world

- The world advances while the player is away: orbits progress, real events accumulate, rivals maneuver, the AI advances the player's arcs.
- Every session opens with a **situation-room briefing**: what happened since last login, written by the LLM from the actual event record.
- Implementation note: orbits are closed-form (position derivable from orbital elements + epoch at any timestamp), so "living world" requires no continuous simulation — only periodic ticks that process discrete events and queue LLM jobs.

## Stakes & progression — real loss, never ruin

- Satellites can be permanently lost: failed re-entries, fuel exhaustion, debris strikes, rival action. Loss is real and should hurt — assets accumulate history (missions flown, discoveries made).
- The player is never eliminated: the agency always scrapes together funding for a minimum viable fleet. Reputation and technology survive losses.
- Progression: mission earnings → new satellites, better instruments, exotic capabilities (drones, spaceplanes, deep-space assets). Funding and reputation are the meta-currencies; fuel is the in-mission currency.

## Graphics

- **The globe:** NASA blue marble day/night textures with real terminator line, night-side city lights, animated cloud layer, atmospheric-scattering rim glow, polar auroras.
- **Orbits & events:** orbit ribbons as glowing arcs; events pulse on the surface (quake ripples, storm swirls, launch arcs climbing to orbit).
- **Camera:** smooth flight from full-planet view to event close-up; cinematic framing for set-piece moments.
- **Flying moments** get bespoke visual set-pieces (plasma sheath on re-entry, storm interiors on drone runs).
- **Post-processing:** bloom, subtle film grain. Dark situation-room UI with thin neon accents and live tickers (AUSPEX-family aesthetic).
- **Technical:** Three.js/WebGL, device-pixel-ratio-aware rendering (crisp on retina), instancing where needed.

## Physics

- **Orbits:** two-body Keplerian mechanics with closed-form propagation. Deterministic: client and server compute identical positions from (elements, epoch, timestamp). Unit-tested as a pure math module.
- **Maneuvers:** impulsive burns with live orbit preview (drag the burn vector, watch the predicted orbit deform), Hohmann-style transfers, plane changes, deorbit burns. Fuel cost is the physical constraint that makes decisions matter.
- **Flying moments (v1):**
  - *Burn execution:* align thrust vector and fire within a closing window; burn quality (timing, vector precision, cutoff) determines fuel efficiency and resulting orbit accuracy.
  - *Re-entry:* steer a capsule through the entry corridor — too steep burns up, too shallow skips off the atmosphere; bank to steer toward the landing zone; deploy chute.
- **Flying moments (post-v1):** drone runs through wind-field weather physics; RCS proximity ops (Newtonian docking/repair); emergency debris-conjunction evasion.

## AI layer

All LLM work runs server-side between play moments — never in the realtime loop. Four jobs:

1. **Event interpreter:** converts ingested real events into contracts (respectful framing enforced by prompt + schema).
2. **Fiction weaver:** generates the personalized layer from the player's **playstyle profile** (risk appetite, fuel discipline, contract choices, losses suffered, flying skill). Rivals adapt to the player; arcs escalate differently per user.
3. **Briefing writer:** the situation-room catch-up each session, grounded in the world's actual event log.
4. **Flavor:** satellite names, contract titles, rival comms.

All outputs are schema-validated structured JSON (zod) written to Postgres. The LLM proposes; the game engine enforces all rules, economy, and physics. Model access via Anthropic API (server-side keys only).

## Architecture

- **App:** Next.js (App Router) on Vercel — one repo, one deploy. Three.js client for the globe and flying moments.
- **Database:** Neon Postgres via Vercel Marketplace (provisioned with `vercel integration add` at implementation time; env vars auto-wired).
- **Auth:** Clerk via Vercel Marketplace (free tier).
- **World heartbeat:** Vercel cron jobs —
  - *Feed ingester* (shared, every few minutes): pulls USGS / GDACS / NASA EONET / Launch Library into a shared events table.
  - *World ticker* (batched across players): advances each world — processes deadlines, rival moves, discoveries; queues and executes LLM jobs.
- **Data model (core tables):** players, worlds, assets (satellites: orbital elements, epoch, fuel, health, instruments, history), events (real + fictional), missions/contracts, rivals, playstyle_profiles, briefings, tick_log.

## Game feel — policy, not polish (the Pixel Cup lesson)

Top-level requirements from day one:
- **Audio always:** ambient situation-room bed, comms chirps, burn rumble, alert stingers, UI ticks.
- **Every meter visible:** fuel, transfer windows, burn quality, risk, mission timers — if a mechanic exists, the player can see it.
- **Juice on every interaction:** screen shake on violent re-entry, satisfying lock-on ticks, animated transitions.
- **Simple inputs:** mouse + a few keys; no simultaneous-chord holds; remappable later.
- **Crisp rendering:** DPR-aware canvas at all times.

## Resilience & error handling

- Feed outage → cached events + fiction layer covers the gap; the game never presents an empty world.
- LLM failure → deterministic template fallback missions; briefings degrade to structured factual summaries.
- Client/server determinism: positions always derived from server-authoritative elements + epoch; no simulation drift.
- Cron tick failures are logged (tick_log) and self-heal on next tick (ticks are idempotent over discrete events).

## Testing

- Unit tests: orbital math (propagation, transfer computation, corridor math) as a pure module — highest coverage priority.
- Tick engine: idempotency and event-processing tests against a test database.
- LLM outputs: zod schema validation with rejection/retry; golden-prompt regression tests for framing rules (respectful real-event handling).
- Client: Playwright smoke tests (globe renders, contract flow, burn moment completes).

## Scope

**v1:**
- The globe in full visual quality
- 2 starting satellites, orbital planning + burn preview
- Real feed ingestion (all four sources)
- Contracts from real + fictional events
- Burn-execution and re-entry flying moments
- LLM briefings, event interpretation, fiction weaving (single rival agency)
- Living-world ticks + persistence + auth
- Audio + game-feel baseline

**Post-v1:** drone runs, proximity ops, multiple active rivals, fleet/tech expansion, seasonal arcs, shareable "world postcards."

**Non-goals:** multiplayer, PvP, mobile apps, marketplaces, user-generated content.
