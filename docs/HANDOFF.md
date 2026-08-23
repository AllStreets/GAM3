# HYPERION — Project Handoff

*Written 2026-08-23 for the next Claude session. Read this first, then `docs/superpowers/specs/2026-08-22-hyperion-design.md` (the binding spec).*

## The Vision (one paragraph)

HYPERION is Connor's game: command a satellite fleet over a **cinematic, living, REAL Earth**. Real orbital mechanics you fly by hand. Real world events (earthquakes, storms, wildfires, launches) from live feeds are the content. An LLM turns those events + your personal playstyle into briefings, missions, and eventually storylines/rivals — so **the game is different for every player and grows with them**. Pillars in priority order: gorgeous graphics, cool physics, excitement, per-user AI divergence. Story is ambient flavor, never a gate.

## Where We Are (Plans 1–6 shipped, live at https://hyperion-flax.vercel.app)

| Plan | Delivered |
|---|---|
| 1 — Globe | Three.js cinematic Earth: real UTC terminator (shader), city lights, clouds, atmosphere, starfield, bloom+grain, intro sweep, HUD shell |
| 2 — Orbits | Real Keplerian mechanics (`src/lib/orbits.ts`, server-portable, heavily unit-tested), 2-satellite fleet, zustand `gameStore`, burn planner with live ghost-orbit preview, sim time 20× (`src/lib/simTime.ts`, anchored 2026-01-01) |
| 3 — Living world | USGS/EONET/LaunchLibrary → `/api/events` (timeouts, per-source isolation), `worldStore` (never-blank rule), animated `EventLayer`, EventsPanel with camera fly-to |
| 4 — Game feel | Flying the burn: IGNITE → chase cam → HOLD SPACE + A/D trim → quality scales fuel overspend (cost×1.25 arm margin). Synthesized WebAudio (`src/audio/AudioEngine.ts` — ambient/chirps/rumble/stinger, zero assets), screen shake, BurnOverlay |
| 5 — Visuals | Procedural 3D satellites (gold bus, solar wings, dish, nav blink; sun-tracking via `group.up`; DirectionalLight follows terminator), canvas-drawn event icon sprites (seismic/flame/cyclone/rocket) |
| 6 — AI v1 | Playstyle profile (`src/lib/profile.ts`, localStorage, tracks burns/quality/aborts/focus-kinds/sessions) → `/api/briefing` (claude-opus-4-8, `messages.parse` + zod structured outputs, effort low, respectful-framing system prompt, body validation, ALWAYS-200 fallback) → BriefingPanel with per-player missions on REAL events + TRACK buttons |
| 7A — Game foundations | **It's a game now.** Found an agency (name + procedural SVG emblem + colorway, `FoundingScreen`); 5-satellite fleet w/ diverse planes; contracts from AI briefing (`contractStore`, accept→active→complete/expire); **maneuver-to-intercept** — fly a burn to bring a satellite's ground-track over a real-event target (`src/lib/intercept.ts` closest-approach solver; `ContractLayer` target ring + ground-track + marker; `InterceptReadout` ghost-aware closest-approach HUD); lean economy (`agencyStore` funding+reputation, refuel, buy-satellite); CONTRACTS + AGENCY panels (right-rail flex stack); field GUIDE (`?`); effect-based store hydration (reload-safe); all client-side localStorage. Spec: `docs/superpowers/specs/2026-08-23-hyperion-game-layer-design.md` |

**Gates:** 59 unit tests, 4 e2e (Playwright, includes console-error + non-black-canvas checks), tsc clean. **Infra:** GitHub `AllStreets/GAM3` → Vercel project `hyperion` auto-deploys main; `ANTHROPIC_API_KEY` in Vercel prod+preview env (Sensitive) and `.env.local` (gitignored; verified never committed). **Port 3100 — never 3000 (AgentZeus owns 3000).**

## Connor's Direct Feedback (2026-08-23 — the priorities)

1. **OBJECTIVES ARE THE GAP.** "Games need objectives." Plan 6's briefing missions are the seed, but they're advisory-only — no acceptance, completion detection, rewards, or economy. This is the #1 next thing: make missions real (accept → satisfy conditions e.g. imaging pass over the event within N orbits → earn funding/reputation → spend on fleet).
2. **Storylines matter** — rival agencies with memory, arcs that escalate from the profile (spec's "fiction weaver"). Build after/with objectives.
3. **Satellites: "V1 good, we can do better"** — more detail/fidelity on the 3D models (textures, greebles, better materials, maybe per-satellite variants).
4. Standing directive: keep building autonomously, polished beautiful product; pause only for credentials/irreversible decisions.

## Roadmap (agreed + spec-derived)

The game-layer spec (`docs/superpowers/specs/2026-08-23-hyperion-game-layer-design.md`) is the binding authority for the next plans. It splits into 7A (DONE) and 7B.

1. **Plan 7B — Soul & spectacle** (NEXT, spec §14): the "while you were away" cold-open; agency **archetypes** (relief/research/defense from contract choices → bias contract stream + flavor the AI briefing); named satellites + service records + real loss; **satellite specializations** (imaging/comms/thermal — which bird you send matters); one **emergency** type (debris-conjunction → evasive burn or lose the sat); the **cinematic pass** + operational-tempo + relief-impact acknowledgment; **maneuver scoring + trick-shots**; **orbital postcards**; first-run walkthrough; UX polish. Carry these ledger notes from 7A: reachability-aware contract generation (reuse `closestApproach` across the fleet at offer time — 5 diverse planes mitigate but don't fully solve); economy balance (a full refuel §1080 > a single reward §~500); a verified end-to-end contract completion (manual or e2e with an on-track seeded target).
2. **Plan 8 — City reveal**: on focusing a place, deepen the fly-to into a cinematic push-in, then reveal a real web-pulled image (Wikimedia Commons geosearch, keyless) + map. Slots into the cinematic-pass beat.
3. **Plan 9 — Story engine & rivals**: LLM fiction weaver — rival agency with memory, personalized escalating arcs, situation-room drama. Server-side, schema-validated, engine-enforced.
4. **Persistence**: Neon Postgres + Clerk via Vercel Marketplace (`vercel integration add` — CLI authenticated). NEVER Supabase. Moves profile/agency/fleet/contracts server-side, enables true living-world ticks + GDACS ingestion.
5. **Satellite fidelity pass** + more flying moments (re-entry corridor spec'd, client-only) + polish backlog below.

## How This Project Is Built (process that's been working)

Write plan to `docs/superpowers/plans/` (full code in plan, no placeholders) → superpowers subagent-driven-development (implementer subagent per task + reviewer per task or combined for small branches + final fable/opus review + ONE fix wave) → controller visually verifies via Playwright MCP screenshots on :3100 → merge to main → push (auto-deploys). Ledger in `.superpowers/sdd/<plan>/progress.md` during execution. Memory in `~/.claude/projects/-Users-connorevans-Downloads-GAM3/memory/`.

## Architecture Invariants (do not break)

- Scene frame: Y-up, Earth-fixed, non-rotating Earth (terminator moves via shader). `latLonToVector3` (geo.ts) ↔ `sceneFromEci` (orbits.ts). Orbital math is pure/deterministic: positions from (elements, epoch, t) — the living world needs no frame simulation, only discrete events.
- Engine (`src/engine/`) never imports React; React never touches Three objects — zustand stores bridge (`getState()`/`subscribe` from engine; non-reactive hot fields like `previewAt`/`burnLive` are direct-mutated, never `set()`).
- Camera authority order in `GlobeEngine.update()`: intro sweep → event flight → burn chase (wins) → shake last.
- LLM: server routes only, structured outputs (zod), ALWAYS-200 with deterministic fallback, respectful real-event framing (never gamify casualties — missions on real disasters are observe/map/relay/support only). Engine enforces what the LLM proposes (e.g. eventId whitelist).
- Feeds: per-source isolation, 8s timeouts, never blank a non-empty world.
- Game feel is policy: every mechanic visible, audio on interactions, juice.

## Known Deferred Minors (ride-alongs, in old ledgers/reviews)

Sprite limb-clipping at grazing angles; dayside additive washout; event icons small at full-globe zoom (severity-scaled sizing is the obvious fix); `dvSpent` records planned not actual cost; per-frame Vector3 allocations (fine at current scale, pool before fleet grows); EventLayer full rebuild per poll is now identity-guarded but still O(n) on real changes; SatelliteLayer rebuild same; lookAt near-degeneracy jitter when orbit plane contains sun vector; `simNow` single funnel must hold for future server-authoritative time.
