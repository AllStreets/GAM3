# HYPERION — The Game Layer (Design Spec)

*2026-08-23 · approved design direction. Extends the founding spec `2026-08-22-hyperion-design.md` — this is the layer that turns the living-Earth instrument into a **game**: objectives, economy, identity, stakes, and a seamless front door.*

## The hook

**The news is the game.** Real world events, in real time, are the level design. You run a private orbital agency; the living Earth streams you real crises and opportunities. Your fleet is limited, so you triage. Your choices define what kind of agency you become. Every objective is completed by a hand-flown orbital maneuver. No two players' agencies, fleets, stories, or skies are the same.

This spec delivers the first **playable** version of that — enough that the first minute already feels like a game, not a dashboard. Rivals, the AI-woven overarching mystery, seasons, and anomaly-hunting are deliberately deferred to later plans.

## Design pillars for this layer (priority order)

1. **Seamless, attractive front door** — found your agency, learn the controls, be playing, with minimal friction and cohesive visuals.
2. **A real objective loop** — accept → maneuver to intercept → complete → earn → grow.
3. **Identity & ownership** — your named agency + emblem, an archetype that emerges from your choices, named satellites with history you can lose.
4. **Living-world tension** — triage under real deadlines; occasional emergencies that demand a snap decision.
5. **Spectacle** — the completing pass is a set-piece.

All of it preserves the founding spec's rules: LLM work server-side between play moments only; schema-validated outputs with deterministic fallback; **respectful real-event framing** (contracts on real disasters are observe/map/relay/monitor support — the reward is for aiding responders, never the tragedy); the game never presents an empty world.

---

## 1. Onboarding — Agency Founding (seamless front door)

**First-run only.** A returning player (saved agency in localStorage) skips straight into the globe.

A cinematic founding screen over the globe backdrop:
- **Name your agency** (text input; a suggested name pre-filled so a player can one-click through).
- **Pick an emblem** — a gallery of ~8 procedurally-drawn **SVG crests** (orbital/agency motifs: rings, sightlines, chevrons, stars) each in a selectable accent colorway. 100% procedural, keyless, on-brand with the dark-neon aesthetic.
- **Commissioned** — a confirming beat (stinger, the emblem stamps in), then a smooth camera hand-off into the live globe with the agency established. No jarring jump into a satellite and back.

The chosen name, emblem id, and colorway persist and appear thereafter in the **agency status bar**. The accent colorway may tint HUD accents so the agency feels *yours*.

Archetype is **not** chosen here — it emerges from play (§4). Founding stays fast: name, emblem, go.

## 1b. Returning — the "while you were away" cold-open

A player with a saved agency does **not** re-found — but they also don't land cold. Each return opens on a styled **situation-room cold-open**: a short recap of what the *real* world did and what *your fleet* saw since last login — new significant events (from the live feeds, diffed against `lastSeen`), contracts that expired or completed while gone, sim-days elapsed, fuel states. Written by the briefing AI when available (it already receives `lastSeen`), with a deterministic fallback ("While you were away: 3 new events, HYPERION-2 completed 1.4 orbits"). It turns the game from an app you open into a *place your story continues* — a return ritual and a hook. Dismissible into live play in one action.

## 2. The guide (low-friction learning)

- A **first-run guided walkthrough**: after founding, 3–5 lightweight coach-marks spotlight each panel in turn ("This is your fleet — click a satellite to select it", "Plan a burn here", "Contracts appear here"), dismissible, skippable, shown once.
- A persistent **GUIDE overlay** reachable any time (a `?` control / hotkey): a cohesive reference with **stylized SVG diagrams**, not walls of text — the burn controls (Δv sliders → ghost orbit), the flying keys (**SPACE** throttle · **A/D** trim · **ESC** abort), selecting satellites, accepting contracts, TRACK-to-fly, the intercept readout. Attractive, on-brand, keyless.

## 3. The contract loop

- AI briefing missions (existing `/api/briefing`) become **available contracts**; a small deterministic set is always seeded so the board is never empty (resilience).
- A contract carries: target (a real event's lat/lon + kind + title), **deadline** (sim-time), **reward** (funding + reputation), and an archetype tag (relief / research / defense — §4).
- **Accept** → the contract becomes **active** (cap on simultaneous active contracts to force triage — see §5/§7).
- **Complete** when a satellite makes a qualifying pass over the target before the deadline (§4). → award funding + reputation, the cinematic pass (§8), advance the agency's archetype leaning.
- **Expire** past the deadline → failed, a small reputation ding (real stakes, never ruin).
- A **CONTRACTS panel**: available (with ACCEPT), active (with live intercept status + countdown), recently completed/failed. Selecting a contract sets it as the intercept target and rings it on the globe.

## 4. Maneuver-to-intercept (the physics-honest core)

Our Earth is non-rotating in-scene (founding-spec invariant), so a satellite's ground-track is a fixed great circle set by its orbital plane. Reaching a target means **steering the plane onto it** and **timing the pass** — both done with the burn planner you already fly.

- **Completion test:** a satellite completes when its scene-position passes within `COMPLETION_RADIUS` (≈ imaging swath, tuned generous, e.g. ~500 km in scene units) of the target point `latLonToVector3(targetLat, targetLon)`, before the deadline. Checked every engine tick against active contracts.
- **Affordable maneuvers:** raise the fleet's fuel capacities (game balance — it's a game, not a sim) so modest plane-steering *and* phasing are affordable and the maneuver is genuinely skillful rather than impossible. Refuel economy keeps fuel meaningful.
- **The fairness guarantee — a live intercept solver:** for the selected satellite (and, while the burn planner is open, its **ghost orbit**), sample the orbit forward ~2–3 revs (closed-form `propagate`, cheap) and report **closest approach distance to the target + ETA**. It turns **green** when closest approach ≤ radius within the deadline. The player drags Δv until it's green, then flies the burn. No guesswork.
- **Legibility on the globe:** the active/selected contract shows a **target ring**; the selected satellite shows its **ground-track** (a great-circle line) so the player can *see* they need to rotate it onto the target. A subtle **predicted closest-approach marker** on the track.
- New pure geo helpers (TDD): `vector3ToLatLon` (inverse of `latLonToVector3`), `greatCircleKm`. The intercept solver lives in a testable pure module.

## 5. Economy (lean)

Two currencies:
- **Funding** — earned from contracts; spent to **refuel** a satellite (price ∝ Δv restored) and **buy a new satellite** (fixed price; auto-placed in an orbital plane chosen to help the current contract board, so growth is strategically useful without a plane-picker UI in v1).
- **Reputation** — earned from contracts, dinged by failures; **gates contract tiers** (higher-value contracts require reputation) and **caps concurrent active contracts** (more reputation → run more at once → deeper triage).

The **AGENCY status bar** shows: emblem + name, funding, reputation (+ rank title derived from it), fleet count. A **FLEET/AGENCY panel** houses refuel and buy-satellite actions.

## 6. Agency archetypes (identity + your three story lanes)

Your completed contracts push a hidden 3-axis leaning: **Relief** (disaster/humanitarian), **Research** (science/observation/anomaly), **Defense** (intel/military-tech). The dominant axis is your **archetype**, shown as a title/descriptor in the status bar and evolving as you play.

Archetype feeds back into the game:
- It **biases the contract stream** — a relief-leaning agency sees more disaster-response contracts, defense sees more strategic-observation jobs, etc.
- It **flavors the AI briefing** — the archetype + agency name/emblem are sent to `/api/briefing` so the situation report speaks to *your* agency's character and history. (This is the concrete seed of the per-user story divergence and directly serves the geopolitical / nature / military-tech story lanes; the deep story engine + rivals is Plan 9.)

Respectful framing is unchanged across all archetypes — defense/intel jobs are strategic observation and monitoring, never targeting.

## 6b. Relief impact — making the framing land

When a **relief**-tagged contract (a real disaster) completes, the resolution beat includes a brief, concrete **impact acknowledgment** — the good your data did, framed as aiding responders ("Imagery relayed to relief teams · affected area mapped"). Deterministic, respectful, never gamifying the tragedy itself — the reward is explicitly for the *support rendered*. It makes the humanitarian framing land emotionally rather than reading as bare points, and reinforces the founding-spec rule that real victims are never gamified.

## 7. Named satellites, service records, real loss

- Each satellite has a **callsign** and a **service record**: contracts completed, sim-days in orbit, notable passes. Shown in the fleet panel and on selection.
- **Real loss:** a satellite can be permanently lost — a botched deorbit, fuel exhaustion far from any tasking, or an unhandled emergency (§8). Loss removes it and its record (a somber beat), but the agency endures — funding always scrapes together a replacement path (never ruin). Losing a long-served bird is a genuine gut-punch, which is the point.

## 7b. Satellite specializations (which bird you send matters)

Each satellite has a **primary capability** — **imaging** (optical passes), **comms** (relay), or **thermal** (heat/fire mapping) — shown on its record and in the fleet panel. Contracts carry a **preferred capability** implied by the event kind (wildfires → thermal, disasters/quakes → imaging, launches/relay needs → comms). Any satellite can complete any contract, but sending the **matching** capability earns a bonus (higher reward + a cleaner pass score, §9b); a mismatch still completes at base value. This makes *which* bird you task a real, cheap tactical choice without a full instrument/upgrade tree (deferred). Bought satellites (§5) are assigned a capability chosen to fill a gap in the current board.

## 8. Live triage + emergencies

- **Triage** is emergent: the concurrent-active cap (§5) plus real event deadlines mean more contracts than a small fleet can serve at once — the player chooses. This is mostly generation/deadline tuning, not new systems.
- **Emergencies (light, real):** occasionally the living world throws a time-critical interrupt — the headline case is a **debris-conjunction warning** on one of your satellites: a countdown, and an **evasive burn** demand. Handle it (a quick required maneuver / accept a fuel cost) or risk **losing the satellite** (§7). One well-built emergency type in v1; more (space-weather instrument outages, etc.) later.

## 9. The cinematic pass (spectacle)

When a satellite completes a contract, it's a **set-piece**, not a toast:
- Chase-cam lock onto the satellite as it sweeps the target.
- A **scanning sweep** effect rakes the target zone; a **data-downlink** count-up.
- Reward tally with escalating audio; the contract card resolves with a stinger.
- (Plan 8's city reveal slots into this exact beat — the image blooms in at the pass.)
- An **operational-tempo** touch: consecutive clean completions build a small momentum/multiplier state, surfaced lightly, to reward a hot streak.

## 9b. Maneuver scoring & orbital trick-shots (the mastery ceiling)

Every flown burn is **scored**, turning each maneuver into a rated moment (a landing-score for orbital mechanics):
- **Efficiency** — Δv actually needed vs. Δv spent (rewards clean, minimal burns; ties to the existing burn-quality mechanic).
- **Precision** — how tightly the resulting pass threads the target (closest approach well inside the radius scores higher than a grazing edge).
- **The trick-shot** — a single maneuver whose new ground-track brings a satellite within range of **two active contracts on one pass** (or one pass completing a contract *and* setting up the next) earns a big bonus + a distinct celebratory beat and a lasting mark on the satellite's service record (§7).

Scores surface as a brief rating on burn completion, feed the operational-tempo streak (§9), and give experts something to chase and brag about. Pure/deterministic scoring math — TDD'd.

## 9c. Orbital postcards (attractive & shareable)

A one-press **capture** turns a beautiful in-game moment into an **orbital postcard**: the current framed view (a satellite crossing the terminator over a city, an aurora, a storm's eye), composited with the agency **emblem**, name, and a caption (location / event / stardate), downloadable as an image. Uses the existing WebGL frame (canvas capture) + a compositing layer — keyless, no external service. Inherently gorgeous, inherently shareable; makes people want to show the game off. A subtle "postcard-worthy" prompt can appear at genuinely cinematic moments (a completing pass, a terminator crossing) without nagging.

## 10. UX shell (seamless, attractive, low friction)

The founding spec's dark neon situation-room aesthetic, tightened into a cohesive **game UI**: consistent panel chrome, the agency emblem/accent threaded through, clear affordances, controllable friction (accept a contract in one click; the intercept readout removes guesswork; the guide is always a keystroke away). Everything reachable without leaving the globe.

## 11. Persistence

Client-side (localStorage), consistent with the existing profile — no backend in this plan (Neon/Clerk persistence + server-authoritative living world is a later plan):
- Agency (name, emblem, colorway, archetype leanings), fleet (+ service records), contracts (available/active/completed), economy (funding, reputation), and the existing playstyle profile.
- Founding runs once; a present save loads the player straight in.

## 12. AI integration

- Contracts derive from `/api/briefing` (existing) — extended so the request also carries the **agency identity + archetype leaning** and the response missions carry an **archetype tag** and enough for the engine to build a contract (target eventId → lat/lon from the client's event list; the engine sets reward/deadline, not the LLM).
- Unchanged invariants: server route only, structured outputs (zod), ALWAYS-200 with deterministic fallback, respectful framing, engine enforces (eventId whitelist; the LLM proposes flavor, the game sets rules/economy).

## 13. Resilience, testing, scope

- **Resilience:** never an empty contract board (seeded deterministic contracts); intercept solver and economy are pure/deterministic; localStorage failures degrade gracefully (a fresh session, never a crash).
- **Testing:** pure modules TDD'd with high coverage — geo inverse + great-circle, the intercept/closest-approach solver, the economy and contract state machine, archetype leaning math. Playwright smoke extended: founding flow, accept a contract, guide opens.
- **v1 scope (this spec):** founding + emblem, the returning cold-open, guide, the contract loop, maneuver-to-intercept with the live solver + globe legibility, maneuver scoring + trick-shots, lean economy (refuel + buy satellite), archetypes feeding the stream + AI, named satellites + real loss, satellite specializations, one emergency type, the cinematic pass + relief-impact acknowledgment, orbital postcards, client-side persistence.
- **Deferred (later plans):** city reveal (Plan 8); rival agency + AI mystery + seasons + anomaly-hunting (Plan 9); backend persistence + server-authoritative living-world ticks + GDACS (persistence plan); a plane-picker for bought satellites; additional emergency types; deep instrument/upgrade tree.
- **Non-goals:** multiplayer, PvP, mobile, marketplace.

## 14. Build note

This spec is large; it is intended to be implemented as **two sequenced implementation plans** sharing this spec:
- **Plan 7A — Foundations of play:** founding + emblem + persistence shell, the contract store + state machine, maneuver-to-intercept (geo helpers, intercept solver, globe legibility, bigger tanks), lean economy, the CONTRACTS + AGENCY panels, the guide.
- **Plan 7B — Soul & spectacle:** the returning cold-open, archetypes (leaning + AI wiring + stream bias), named satellites + service records + real loss, satellite specializations, the emergency system, the cinematic pass + tempo + relief-impact acknowledgment, maneuver scoring + trick-shots, orbital postcards, the first-run walkthrough, UX polish.

Each plan ships playable and is verified before the next.
