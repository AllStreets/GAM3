# HYPERION — Living World Design (Plans 8 & 9)

*Written 2026-08-24. Approved by Connor after a full 7B playthrough. Binding authority for Plans 8 and 9. Read `docs/HANDOFF.md` first for current state; this spec extends the game-layer spec (`2026-08-23-hyperion-game-layer-design.md`).*

## The vision

Turn the globe from a **map you look at** into a **place you go**. You click into real locations, the camera pushes in from orbit and blooms a real photograph of that city, you capture and keep postcards of beautiful moments, and an AI story engine grows a bespoke, divergent world around you — generating contracts on demand, weaving multi-beat arcs, and pitting you against a rival agency with memory. Everything stays grounded in the real world and different for every player.

## Pillars (unchanged priority order)

Gorgeous graphics · cool physics · excitement · per-user AI divergence. Story is ambient flavor and now also a *driver* (you can summon a contract on a place), but it is never a hard gate — the game is always playable with no network and no key.

## Architecture invariants (carry forward — do not break)

- **Scene frame:** Y-up, Earth-fixed, non-rotating Earth (terminator via shader). `latLonToVector3` (geo) ↔ `sceneFromEci` (orbits); globe picking via raycast → `vector3ToLatLon`.
- **Engine/React boundary:** `src/engine/*` never imports React; React never touches Three objects; zustand stores bridge. Non-reactive hot fields are direct-mutated.
- **Camera authority order** in `GlobeEngine.update()`: intro → flight → **burn chase (wins)** → completion chase-lock → **city-reveal push-in** → shake. Reveal never overrides an active burn.
- **LLM:** server routes only; zod structured outputs; **ALWAYS-200** with a deterministic fallback; respectful real-event framing (**never gamify casualties**; defense/intel = strategic observation & monitoring, **never targeting**); the **engine enforces** what the LLM proposes (target coords come from the click/event, not the model; the engine sets reward/deadline/economy; eventId/location whitelisting).
- **Feeds & external fetches:** all network I/O (Wikimedia, GDACS, space-weather, AI) goes through `/api/*` routes with **8s timeouts, per-source isolation, in-memory caching, and never-blank rules**. The `ANTHROPIC_API_KEY` and any other secrets are **server-side only**, never in the client bundle, never logged.
- **Persistence:** client-side localStorage (Neon+Clerk is a later plan). Every new persisted field hydrates with a back-compatible default; no key bumps without an in-code migration.
- **Determinism** in game logic: no `Math.random`/`Date.now`/argless `new Date()`; sim time via `simNow()` (`TIME_SCALE=20`, anchored 2026-01-01).
- **Port 3100** only (3000 is AgentZeus). On-brand dark-neon situation-room UI; shared `ui/Chip` chrome.

---

## Plan 8 — Living Places (ships first)

The globe becomes somewhere you go: click into places, zoom in on real city imagery, keep postcards, and summon contracts anywhere.

### 8.1 Click-to-inspect — the Place Card

- **Globe picking:** a click on the globe that isn't on a satellite or an event marker raycasts the Earth mesh → scene point → `vector3ToLatLon` → `{lat, lon}`. (Satellite/event picking keeps priority.)
- **Place naming (keyless, offline, instant):** a bundled compact dataset of the ~1,000 largest world cities (`name, country, lat, lon, population`) ships in the repo. A pure `nearestCity(lat, lon)` (great-circle) returns the nearest city + distance. The card shows "near **{City}, {Country}**" when within a sensible radius, else "Open ocean" / "Remote — {region}". TDD'd; no network for the core click.
- **Place Card contents:** place name + coordinates + distance-to-nearest-city; **nearby live events** (from `worldStore`, within R km, using `greatCircleKm`); the **fitting capability + archetype** (derived from the dominant nearby event kind via `contractMeta`); a **real city image** (§8.3); and actions: **Focus / zoom in** (§8.2), **Task a contract here** (§8.4), **Capture postcard** (§8.5).
- A **pin/ring** marks the clicked point on the globe while the card is open. Click-away / ESC closes.

### 8.2 Cinematic city reveal — zoom from orbit into the city

- A new **reveal camera beat**: a scripted ease of the camera radius from the current view distance down toward the surface at the target lat/lon over ~2–3s (with a matching look-at), then a **city image blooms in** over a darkened vignette with the place label + a stardate.
- **Triggers:** the Place Card "Focus"; and — the payoff — folded into **7B's completion cinematic** (`CompletionFx`): completing a contract over a place blooms its city image in at the pass.
- **Boundary-clean:** the push-in is a camera script in `GlobeEngine` (reuse the flight-ease); the image is a **React overlay** (`CityRevealOverlay`) driven by a store field (`revealTarget: {lat,lon,label} | null`), never a Three texture. Sits in the camera authority order below burn chase; never fights a burn. Non-blocking; dismiss returns to the globe.

### 8.3 Image pipeline — real city photos (Wikimedia + curated fallback)

- Server route **`/api/place-image?lat=&lon=`** (keyless):
  1. **Wikimedia Commons geosearch** (`list=geosearch` → `imageinfo`) near the point; filter to real photographs (skip maps/diagrams/SVG, prefer landscape, reasonable resolution); return `{ url, attribution, title, source: 'wikimedia' }`.
  2. **Curated fallback:** a bundled map of major cities → a hand-picked Commons image URL (still a real photo, always good) when geosearch is empty/poor; `source: 'curated'`.
  3. **Stylized fallback:** if nothing, `{ source: 'none' }` → the client renders a stylized card (globe crop + coordinates + label). **Never blank.**
- 8s timeout, per-source isolation, in-memory cache keyed by rounded lat/lon, **ALWAYS-200**. **Attribution is shown** on the reveal (Commons licensing requires credit). Images lazy-loaded; `onError` → stylized fallback.

### 8.4 Click-to-generate contract (AI, click-UX-native)

- Place Card **"Task a contract here"** → **`/api/place-contract`** (POST `{lat, lon, placeName, nearbyEvents, agency:{name,archetype}}`): the AI weaves **one** bespoke contract grounded in that place + nearby real events (`title, objective, archetype, preferredCapability`), respectful framing. The **engine** sets the target coords (from the click, not the model), reward, and deadline, and adds it to the board (available; or active on confirm).
- **ALWAYS-200 fallback:** a deterministic contract built from the nearest event/place. Reuses the contract schema + `contractMeta`; engine-enforced economy.

### 8.5 Postcards, front and center

- Surface the existing capture control (larger, labeled) and add a small **saved-postcards strip** (most-recent few thumbnails this session). Fire the **"postcard-worthy" nudge** at the city-reveal and completion beats (rate-limited, dismissible — reuse 7B's nudge). When a city image is revealed, **compose the postcard with that image** (over the WebGL frame) + emblem + caption.

### 8.6 UX shell

- Place Card + City Reveal use the established chrome (`ui/Chip`, agency accent). Everything reachable from the globe; consistent affordances; click-away/ESC everywhere.

**Plan 8 deferred:** precise street-level reverse geocoding (Nominatim) — nearest-city is enough for v1; a full postcard gallery/history; per-place persistent notes.

---

## Plan 9 — Story Engine (right after — everything selected)

The world grows a memory, a rival, and far more variety — AI-woven and grounded.

### 9.1 Narrative state + AI-woven arcs

- A **`storyStore`** (localStorage now; server later): ongoing **arcs** (`id, theme, beatsSeen, nextBeat, tension`), the **rival agency** (name, emblem/archetype, reputation, memory of encounters), and flags derived from your history.
- The briefing route is extended (or a new **`/api/story`**) to **advance arcs**: given your recent completions/failures, archetype, and current world events, the AI proposes the next beat(s) — a short narrative + optionally a contract that advances the arc, and **rival actions** (claims a contract, races you to a target, sends a dispatch/taunt). Structured outputs, ALWAYS-200 deterministic fallback, respectful framing.
- Surfaced as situation-room drama in the briefing panel + a **DISPATCHES** feed.

### 9.2 Rival agency (memory + competition)

- A persistent rival with memory: name/emblem/archetype and a reputation that moves relative to yours. Behavior: occasionally **competes for a contract** (a race — whoever's satellite makes the qualifying pass first wins), sends dispatches, escalates over time. The **engine adjudicates** the race deterministically (same `closestApproach`/pass logic); the **LLM only narrates**.

### 9.3 More real data sources (authentic variety)

- Add feeds behind `/api/events` (per-source isolation, timeouts, never-blank): **GDACS** disasters (keyless GeoRSS), more **EONET** categories (volcanoes, sea/lake ice, dust/haze, snow), **NOAA SWPC** space-weather (keyless JSON — geomagnetic storms, solar flares). Normalize into the existing `WorldEvent` shape with new `kind`s; extend `contractMeta` (new kind → archetype/capability) and `eventIcons` (new glyphs).

### 9.4 More contract variety (gameplay, not just flavor)

- New **objective types** beyond a single imaging pass, each a pure/TDD'd evaluator:
  - **Multi-pass monitoring:** N qualifying passes within a window.
  - **Multi-satellite op:** two different satellites must each pass (or a relay pairing — a comms sat + an imaging sat).
  - **Timed campaign:** a sequence of sub-objectives under a shared deadline.
  - **Relay-window hold (dwell):** keep a comms sat within range of the target for a duration.
- The `Contract` gains an `objective: { type, params }`; the completion evaluator dispatches by type. Rewards scale with complexity.

**Plan 9 deferred:** backend persistence + server-authoritative living-world ticks; cross-player anything.

---

## Persistence

Client-side localStorage, back-compat: add `storyStore` (arcs, rival) in Plan 9; extend `contractStore` (objective type/params) in Plan 9. Image/postcard blobs are session-cached, not heavily persisted. Every new field hydrates with a default.

## AI integration (unchanged invariants)

All AI server-side, zod structured outputs, ALWAYS-200 fallback, respectful framing, engine-enforced. New routes: `/api/place-image` (keyless), `/api/place-contract`, `/api/story` (or extend `/api/briefing`). Targets/eventIds whitelisted; the engine sets economy and target coordinates — the model proposes flavor only.

## Resilience, testing, scope

- **Pure modules TDD'd:** `nearestCity`, the image-pipeline result shaping, each new contract-objective evaluator, arc-progression (deterministic parts), rival-race adjudication.
- **Feeds/routes:** per-source isolation, 8s timeouts, caching, never blank a non-empty world; ALWAYS-200.
- **Playwright:** click a place → Place Card opens; Focus → city reveal appears; postcard capture works.
- **v1 scope:** everything in §§8–9 above.
- **Deferred:** Nominatim precision; backend persistence + server ticks; multiplayer.
- **Non-goals:** multiplayer/PvP, mobile, marketplace.

## Build note

This spec is implemented as **two sequenced plans sharing it**:
- **Plan 8 — Living Places:** click-to-inspect Place Card, cinematic city reveal, the keyless image pipeline, click-to-generate contracts, postcards front-and-center.
- **Plan 9 — Story Engine:** narrative state + AI-woven arcs, the rival agency, more real data sources, more contract variety.

Each ships playable and is verified before the next.
