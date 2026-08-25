# HYPERION Plan 8 — Living Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the globe somewhere you *go* — click any location to open a Place Card, cinematically zoom from orbit into a real photo of that city, summon AI contracts on any spot, and put postcards front-and-center.

**Architecture:** Extend the existing engine (`GlobeEngine` globe-picking + a new camera "reveal" beat), add a small `placeStore`, three new React overlays (`PlaceCard`, `CityRevealOverlay`, and a postcard strip), two new keyless/AI server routes (`/api/place-image`, `/api/place-contract`) mirroring the existing `/api/events` and `/api/briefing` patterns, and pure TDD'd libs (`nearestCity`, image-pick shaping, place-contract fallback). All client-side state; every network call server-side with timeouts, caching, and ALWAYS-200 fallbacks.

**Tech Stack:** Next.js App Router (Turbopack), Three.js 0.169, zustand, vitest, Playwright, Tailwind, @anthropic-ai/sdk (`messages.parse` + zod, `claude-opus-4-8`).

**Spec:** `docs/superpowers/specs/2026-08-24-hyperion-living-world-design.md` (§8; §9 is Plan 9).

## Global Constraints

- **Port 3100** only. **`ANTHROPIC_API_KEY` server-side only** — never client, never logged. `.env.local` gitignored.
- **All network I/O through `/api/*`** with 8s timeouts (`AbortSignal.timeout(8_000)` / the `fetchJson` helper), per-source isolation (`Promise.allSettled`), caching (`next: { revalidate }` or in-memory), and **ALWAYS-200** — every route returns a valid body even on total failure. **Never blank** a non-empty world.
- **LLM invariants:** server route only; zod structured outputs; ALWAYS-200 deterministic fallback; respectful framing (**never gamify casualties**; defense/intel = observation, never targeting); **engine enforces** — the target lat/lon comes from the click (not the model), and the engine sets reward/deadline/economy.
- **Engine/React boundary:** `src/engine/*` never imports React; React never touches Three objects; zustand bridges. Camera authority order in `GlobeEngine.update()`: intro → flight → **burn chase (wins)** → completion chase-lock → **city-reveal push-in (new)** → emergency tick → shake. The reveal beat must never run during an active burn.
- **Determinism** in game logic: no `Math.random`/`Date.now`/argless `new Date()` (route handlers may use `new Date().toISOString()` for `fetchedAt`, matching `/api/events`); sim time via `simNow()`.
- **Back-compat persistence:** any new persisted field hydrates with a default. `placeStore`/reveal state is transient (not persisted).
- **Copy discipline:** on-brand terse situation-room voice; Wikimedia images show **attribution** (license requires credit).
- **Attribution/licensing:** only display Wikimedia Commons images with their `artist`/`credit` + license shown; skip results without usable licensing.

---

## File Structure

**New pure libs (TDD, no React/Three):**
- `src/data/cities.ts` — bundled curated dataset of major world cities `{ name, country, lat, lon }`.
- `src/lib/nearestCity.ts` — `nearestCity(lat, lon)` + `placeLabel(...)`.
- `src/lib/placeImage.ts` — pure shaping/filtering of Wikimedia geosearch results (`pickBestImage`), used by the route.
- `src/lib/placeContract.ts` — pure fallback contract builder + response→contract mapping for click-to-generate.

**New server routes:**
- `src/app/api/place-image/route.ts` — keyless Wikimedia Commons geosearch + curated fallback.
- `src/app/api/place-contract/route.ts` — AI contract for a clicked place (mirrors `/api/briefing`).

**New state:**
- `src/state/placeStore.ts` — `{ place, reveal, inspect, focusReveal, clearReveal, clear }` (transient).

**New React overlays:**
- `src/components/PlaceCard.tsx` — the click-to-inspect card.
- `src/components/CityRevealOverlay.tsx` — the bloom-in city image over the push-in.
- `src/components/PostcardStrip.tsx` — recent-postcards strip (session).

**New curated data:**
- `src/data/cityImages.ts` — major-city → Wikimedia image URL + attribution fallback map.

**New engine:**
- `src/engine/PlaceMarker.ts` — a small ring/pin at the inspected point (or fold into an existing layer).

**Modified:**
- `src/engine/GlobeEngine.ts` — earth-mesh pick in `onPointerUp`; the reveal camera beat; a `revealTo(lat,lon)` script; drive `PlaceMarker` from `placeStore`.
- `src/state/contractStore.ts` — `addContract(c)` single-append action.
- `src/components/Hud.tsx` — mount `PlaceCard`, `CityRevealOverlay`, `PostcardStrip`.
- `src/components/PostcardButton.tsx` — compose with the revealed city image when a reveal is active; more prominent.

---

## Interfaces (authoritative names — copy verbatim)

From the codebase: `vector3ToLatLon(v)→{lat,lon}`, `latLonToVector3(lat,lon,r?)`, `greatCircleKm(lat1,lon1,lat2,lon2)`, `sceneFromEci`/`eciFromScene`, `propagate`, `orbitalPeriod(a)`, `simNow()`, `TIME_SCALE`. `useWorldStore` (`events: WorldEvent[]`, `WorldEvent {id,kind,title,lat,lon,time,severity,detail?,url?}`, `EventKind='quake'|'wildfire'|'storm'|'launch'`). `useContractStore` (`Contract {id,eventId,title,kind,lat,lon,deadline,reward:{funding,reputation},status,archetype,preferredCapability,completedBy?,matched?}`, `setAvailable`, `accept`, `setTarget`). `contractForEvent(title,ev,simNow,periodSec,archetype?,capability?)`, `seedContracts`, `contractReward(severity)`, `contractDeadline(simNow,periodSec)`. `archetypeForKind`/`capabilityForKind` (`@/lib/contractMeta`), `Archetype` (`@/lib/archetype`), `Capability` (`@/lib/satelliteMeta`), `Chip` (`@/components/ui/Chip`). Postcards: `getActiveEngine()`, `GlobeEngine.captureFrame()`, `composePostcard(frame,{agencyName,emblemSvg,caption})`, `postcardCaption({contractTitle?,simTime})`, `emblemSvgString(id,color,size)`. Route pattern: `fetchJson(url,revalidate)` in `src/app/api/events/route.ts`; briefing route uses `client.messages.parse({model:'claude-opus-4-8', output_config:{format: zodOutputFormat(Schema), effort:'low'}})` with an ALWAYS-200 fallback. Earth mesh: `GlobeEngine.this.earth`. Flight: `this.flight={from,to,start}`, cubic ease-out, 1.2s.

---

## Task 1: Bundled cities dataset + `nearestCity` (pure)

**Files:**
- Create: `src/data/cities.ts`, `src/lib/nearestCity.ts`, `src/lib/nearestCity.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/data/cities.ts
  export interface City { name: string; country: string; lat: number; lon: number }
  export const CITIES: City[]   // ~200 major world cities, all regions
  // src/lib/nearestCity.ts
  export interface NearestCity { city: City; km: number }
  export function nearestCity(lat: number, lon: number, cities?: City[]): NearestCity  // nearest by greatCircleKm; cities defaults to CITIES
  export function placeLabel(lat: number, lon: number, cities?: City[]): string
  // "near {City}, {Country}" when km ≤ 400; "{Country} region" when a city ≤ 1500km; else "Open ocean" / "Remote"
  ```

- [ ] **Step 1: Write failing tests** (`src/lib/nearestCity.test.ts`) — use a SMALL fixture list (not the full dataset) so tests are data-independent:

```ts
import { describe, it, expect } from 'vitest'
import { nearestCity, placeLabel } from './nearestCity'
import type { City } from '@/data/cities'

const FIX: City[] = [
  { name: 'London', country: 'United Kingdom', lat: 51.5, lon: -0.13 },
  { name: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.69 },
  { name: 'Nairobi', country: 'Kenya', lat: -1.29, lon: 36.82 },
]

describe('nearestCity', () => {
  it('returns the closest city with a positive distance', () => {
    const r = nearestCity(51.6, -0.1, FIX)
    expect(r.city.name).toBe('London')
    expect(r.km).toBeGreaterThanOrEqual(0)
    expect(r.km).toBeLessThan(50)
  })
  it('picks Tokyo for a point in Japan', () => {
    expect(nearestCity(35.7, 139.7, FIX).city.name).toBe('Tokyo')
  })
})

describe('placeLabel', () => {
  it('names a nearby city', () => {
    expect(placeLabel(51.55, -0.12, FIX)).toMatch(/near London, United Kingdom/)
  })
  it('calls the deep ocean open water', () => {
    // mid-Pacific, far from every fixture city
    expect(placeLabel(-30, -140, FIX)).toMatch(/Open ocean|Remote/)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (`npx vitest run src/lib/nearestCity.test.ts`).

- [ ] **Step 3: Create `src/data/cities.ts`** — a curated `CITIES` array of **~200 major world cities** spanning every populated region (Americas, Europe, Africa, Middle East, South/East/SE Asia, Oceania — capital cities + major metros), each `{ name, country, lat, lon }`. Coordinates from well-known geographic knowledge; ±0.2° accuracy is fine (this drives a "near {City}" label, not navigation). Ensure broad global coverage so most land clicks resolve to a sensible nearby city. Keep it a plain TS module (`resolveJsonModule` is on but a TS export is preferred).

- [ ] **Step 4: Implement `src/lib/nearestCity.ts`**

```ts
import { greatCircleKm } from '@/lib/geo'
import { CITIES, type City } from '@/data/cities'

export interface NearestCity { city: City; km: number }

export function nearestCity(lat: number, lon: number, cities: City[] = CITIES): NearestCity {
  let best = cities[0]
  let bestKm = Infinity
  for (const c of cities) {
    const km = greatCircleKm(lat, lon, c.lat, c.lon)
    if (km < bestKm) { bestKm = km; best = c }
  }
  return { city: best, km: bestKm }
}

export function placeLabel(lat: number, lon: number, cities: City[] = CITIES): string {
  const { city, km } = nearestCity(lat, lon, cities)
  if (km <= 400) return `near ${city.name}, ${city.country}`
  if (km <= 1500) return `${city.country} region`
  return 'Open ocean'
}
```

- [ ] **Step 5: Run — expect PASS.**

- [ ] **Step 6: Commit** — `feat(places): bundled cities dataset + nearestCity/placeLabel`

---

## Task 2: Globe click → Place Card

**Files:**
- Create: `src/state/placeStore.ts`, `src/components/PlaceCard.tsx`, `src/engine/PlaceMarker.ts`
- Modify: `src/engine/GlobeEngine.ts`, `src/components/Hud.tsx`

**Interfaces:**
- Produces:
  ```ts
  // placeStore — transient (not persisted)
  interface PlaceState {
    place: { lat: number; lon: number } | null       // currently inspected point (Place Card open)
    reveal: { lat: number; lon: number; label: string } | null  // active city reveal (Task 4)
    inspect(lat: number, lon: number): void
    clear(): void
    focusReveal(lat: number, lon: number, label: string): void
    clearReveal(): void
  }
  export const usePlaceStore = create<PlaceState>(...)
  ```

- [ ] **Step 1: Create `src/state/placeStore.ts`** — a zustand store with the shape above. `inspect` sets `place`; `clear` sets it null; `focusReveal`/`clearReveal` manage `reveal` (used in Task 4). No persistence.

- [ ] **Step 2: Extend globe picking in `GlobeEngine.onPointerUp`** — after the existing satellite pick, if no satellite was hit, raycast the Earth mesh and open a place inspect (only when founded and not mid-burn):

```ts
const id = this.satLayer.pickSatelliteId(raycaster)
if (id) { useGameStore.getState().select(id); return }
// No satellite: try the globe surface → inspect a place.
if (useAgencyStore.getState().founded && !useGameStore.getState().burnSession) {
  const hit = raycaster.intersectObject(this.earth, false)[0]
  if (hit) {
    const { lat, lon } = vector3ToLatLon(hit.point)
    usePlaceStore.getState().inspect(lat, lon)
    return
  }
}
useGameStore.getState().select(null) // empty space → deselect
```
Import `usePlaceStore`, `useAgencyStore`, `vector3ToLatLon` as needed. Keep the existing 6px drag threshold so drags don't open cards.

- [ ] **Step 3: `PlaceMarker.ts`** — a tiny engine object (a thin ring at `latLonToVector3(lat,lon,1.001)`, additive, on-brand accent) added to the scene, its position/visibility driven each frame from `usePlaceStore.getState().place`. NO React import. Own it in `GlobeEngine` (construct, add to scene, `update()` reads the store, `dispose()`). Reuse the ring approach from `ContractLayer`/`CompletionFx`.

- [ ] **Step 4: `PlaceCard.tsx`** — subscribe to `usePlaceStore(s => s.place)`. When set, render an on-brand card (mount in Hud, gated on founded): 
  - Title `placeLabel(lat,lon)` + coords (formatted DMS or decimal) + `nearestCity` distance.
  - **Nearby events:** from `useWorldStore.events`, those within ~600 km via `greatCircleKm`, top 3 by severity, each a small row (kind chip + title).
  - **Fitting profile:** `Chip` for the archetype + capability derived from the dominant nearby event kind (via `archetypeForKind`/`capabilityForKind`; default research/imaging when no nearby events).
  - A **city image** placeholder (Task 3 fills it) — leave a labelled empty frame for now.
  - Actions row (buttons, wired in later tasks): **Focus / zoom in** (Task 4), **Task a contract here** (Task 5), **Capture postcard** (Task 6). For this task, render them; "Focus" can call `focusReveal(lat,lon,placeLabel(...))` already (overlay lands in Task 4).
  - Close on ESC / click-away / a ✕ → `clear()`. `pointer-events` only on the card.

- [ ] **Step 5: Mount `PlaceCard` in `Hud.tsx`.**

- [ ] **Step 6:** Manual/quick check: `npx tsc --noEmit` clean; existing tests still green (`npx vitest run`). Controller will visually verify. Commit — `feat(places): globe click opens a Place Card + place marker`

---

## Task 3: Image pipeline — `/api/place-image` (keyless Wikimedia + curated fallback)

**Files:**
- Create: `src/lib/placeImage.ts`, `src/lib/placeImage.test.ts`, `src/app/api/place-image/route.ts`, `src/data/cityImages.ts`
- Modify: `src/components/PlaceCard.tsx` (show the image)

**Interfaces:**
- Produces:
  ```ts
  // src/lib/placeImage.ts
  export interface PlaceImage { url: string; attribution: string; title: string; source: 'wikimedia' | 'curated' | 'none' }
  // Pure: shape+filter a Wikimedia imageinfo result set into the best usable photo, or null.
  export function pickBestImage(pages: WikiImagePage[]): { url: string; attribution: string; title: string } | null
  export interface WikiImagePage { title: string; imageinfo?: { url: string; extmetadata?: Record<string, { value: string }>; width?: number; height?: number; mediatype?: string }[] }
  // Route response: PlaceImage (always 200)
  ```

- [ ] **Step 1: Failing tests** (`src/lib/placeImage.test.ts`) — pure `pickBestImage`:

```ts
import { describe, it, expect } from 'vitest'
import { pickBestImage } from './placeImage'

describe('pickBestImage', () => {
  it('returns null for no pages', () => {
    expect(pickBestImage([])).toBeNull()
  })
  it('skips non-bitmap / tiny images and picks a real photo with attribution', () => {
    const best = pickBestImage([
      { title: 'File:Map.svg', imageinfo: [{ url: 'x.svg', mediatype: 'DRAWING', width: 1000, height: 1000 }] },
      { title: 'File:Skyline.jpg', imageinfo: [{ url: 'https://commons/skyline.jpg', mediatype: 'BITMAP', width: 1600, height: 900, extmetadata: { Artist: { value: 'Jane Doe' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
    ])
    expect(best?.url).toBe('https://commons/skyline.jpg')
    expect(best?.attribution).toMatch(/Jane Doe|CC BY-SA/)
  })
  it('rejects images with no usable licensing', () => {
    const best = pickBestImage([
      { title: 'File:NoLicense.jpg', imageinfo: [{ url: 'y.jpg', mediatype: 'BITMAP', width: 1200, height: 800 }] },
    ])
    expect(best).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Implement `src/lib/placeImage.ts`** — `pickBestImage`: filter to `mediatype === 'BITMAP'`, min width ≥ 800, must have `extmetadata` with an `Artist` or `LicenseShortName` (usable attribution); prefer landscape (width ≥ height) and larger; build `attribution` from `Artist` + `LicenseShortName` (strip HTML tags from the values). Return the best or null.

- [ ] **Step 4: Create `src/data/cityImages.ts`** — a curated fallback map: `{ name, lat, lon, url, attribution }[]` for ~20–30 major world cities (well-known Commons photo URLs, or `/images/places/*.jpg` bundled in `public/` if you add any — prefer stable Commons `upload.wikimedia.org` URLs). Export `nearestCuratedImage(lat, lon, maxKm=250)` → the curated entry within range or null (reuse `greatCircleKm`).

- [ ] **Step 5: Implement `src/app/api/place-image/route.ts`** — mirror `/api/events`:
  - `GET` with `lat`/`lon` query params (parse+validate; clamp).
  - Wikimedia Commons geosearch: `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=geosearch&ggsprimary=all&ggsnamespace=6&ggscoord={lat}|{lon}&ggsradius=10000&ggslimit=20&prop=imageinfo&iiprop=url|extmetadata|mediatype|size&origin=*` via `fetchJson`-style fetch with `AbortSignal.timeout(8000)` and `next:{revalidate: 86400}`.
  - Parse `query.pages` → `pickBestImage` → if found, return `{ ...best, source:'wikimedia' }`.
  - Else `nearestCuratedImage(lat,lon)` → `{ ...curated, source:'curated' }`.
  - Else `{ url:'', attribution:'', title:'', source:'none' }`.
  - **ALWAYS-200** (wrap in try/catch → `source:'none'` on any error). In-memory `Map` cache keyed by `${lat.toFixed(1)},${lon.toFixed(1)}` (bounded to ~200 entries).

- [ ] **Step 6: PlaceCard shows the image** — on `place` change, `fetch('/api/place-image?lat=&lon=')`, render the returned image (lazy, `onError` → stylized fallback) with the **attribution** line beneath; `source:'none'` → a stylized coordinate card. Handle race (ignore stale responses when `place` changed).

- [ ] **Step 7:** Run `npx vitest run` + `npx tsc --noEmit`. Commit — `feat(places): keyless /api/place-image (Wikimedia + curated fallback) in the Place Card`

---

## Task 4: Cinematic city reveal (camera push-in + overlay)

**Files:**
- Create: `src/components/CityRevealOverlay.tsx`
- Modify: `src/engine/GlobeEngine.ts`, `src/components/Hud.tsx`, `src/components/PlaceCard.tsx`

- [ ] **Step 1: Camera reveal beat in `GlobeEngine`** — add a `reveal` script field: `private reveal: { lat:number; lon:number; from:THREE.Vector3; start:number } | null`. Add a public `revealTo(lat, lon)` that sets `from = camera.position.clone()`, target = a point on the surface normal at `latLonToVector3(lat,lon,1)` scaled to a **close radius** (e.g. `EARTH_RADIUS * 1.25`), `start=-1`. In `update()`, add a beat **after the completion chase-lock and before the emergency tick**, guarded by `!this.burnDirector.active && !this.completionFx.active`: ease camera from `from` to the close target over ~2s (cubic ease-out), `lookAt(0,0,0)`, `controls.enabled=false`; when done, keep the close position and leave `reveal` set until cleared. Also **subscribe to `usePlaceStore`**: when `reveal` becomes non-null, call `revealTo(lat,lon)`; when it clears, ease back out (restore a default view distance) — or simply re-enable controls and let the user zoom out. Keep it simple and robust; never fight a burn.

- [ ] **Step 2: `CityRevealOverlay.tsx`** — subscribe to `usePlaceStore(s => s.reveal)`. When set, after a short delay (letting the push-in play ~1.2s), bloom in the city image (fetch `/api/place-image` for the reveal point, or reuse the PlaceCard's fetched image via the store if you cache it) over a darkened vignette, with the `label` + a stardate (`postcardCaption`-style or a simple SD from `simNow()`), plus attribution. A **CAPTURE POSTCARD** button (Task 6) and a **✕ / ENTER** to dismiss → `clearReveal()`. `pointer-events` only on controls. If image `source:'none'`, show a stylized reveal (still cinematic).

- [ ] **Step 3: Wire PlaceCard "Focus / zoom in"** → `usePlaceStore.getState().focusReveal(lat, lon, placeLabel(lat,lon))` (and close the card). Mount `CityRevealOverlay` in `Hud.tsx`.

- [ ] **Step 4: Fold into completion (light)** — when the 7B completion cinematic fires and the completed contract is within ~250 km of a curated/known city, also trigger a reveal image bloom in the cinematic (reuse the fetched place image). Keep this modest: if it risks fighting the completion camera, gate it to just showing the image in the `CompletionCinematic` overlay rather than moving the camera. Document what you did.

- [ ] **Step 5:** `npx tsc --noEmit` clean; existing tests green. Controller visually verifies the zoom-in. Commit — `feat(places): cinematic city reveal — push-in from orbit + image bloom`

---

## Task 5: Click-to-generate contract (`/api/place-contract`)

**Files:**
- Create: `src/lib/placeContract.ts`, `src/lib/placeContract.test.ts`, `src/app/api/place-contract/route.ts`
- Modify: `src/state/contractStore.ts` (`addContract`), `src/components/PlaceCard.tsx`

**Interfaces:**
- Produces:
  ```ts
  // src/lib/placeContract.ts (pure)
  import type { Contract } from '@/state/contractStore'
  import type { Archetype } from '@/lib/archetype'
  import type { Capability } from '@/lib/satelliteMeta'
  export interface PlaceContractInput {
    lat: number; lon: number; placeName: string
    title?: string; objective?: string; archetype?: Archetype; preferredCapability?: Capability
    severity?: number; simNow: number; periodSec: number
  }
  export function buildPlaceContract(i: PlaceContractInput): Contract
  // deterministic: id `place-${round(lat)}-${round(lon)}-${round(simNow)}`, kind 'place',
  // eventId same as id, target = {lat,lon}, reward=contractReward(severity ?? 0.5),
  // deadline=contractDeadline(simNow,periodSec), archetype/capability defaulted via contractMeta from a neutral kind,
  // title/objective defaulted from placeName when the LLM didn't supply them.
  // contractStore action:
  addContract(c: Contract): void   // append as available (dedupe by id); persists like setAvailable
  ```

- [ ] **Step 1: Failing tests** (`src/lib/placeContract.test.ts`) — `buildPlaceContract` sets target to the input lat/lon; id/eventId deterministic; reward from severity; archetype/capability honor explicit values and default otherwise; title falls back to a placeName-derived string. (Pure — pass explicit `simNow`/`periodSec`.)

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement `src/lib/placeContract.ts`** per the interface (reuse `contractReward`, `contractDeadline`, `archetypeForKind`/`capabilityForKind` with a sensible neutral default; `kind: 'place'`).

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: `addContract` in `contractStore.ts`** — append the contract as `available` if its id isn't present (dedupe), persist with the same pattern as `setAvailable`. Add to the store interface.

- [ ] **Step 6: `/api/place-contract/route.ts`** — mirror `/api/briefing`:
  - Request zod: `{ lat, lon, placeName: string(≤80), nearbyEvents: {kind,title,severity}[]≤10, agency:{name≤60, archetype: enum|null} }`.
  - System prompt: a terse tasking officer; propose ONE contract `{ title, objective, archetype, preferredCapability }` for this place, grounded in `placeName` + nearby events, archetype-flavored, respectful (never gamify casualties; defense = observation). HARD RULES reasserted.
  - `client.messages.parse({ model:'claude-opus-4-8', output_config:{ format: zodOutputFormat(PlaceMissionSchema), effort:'low' }, ... })`.
  - Return `{ source:'ai'|'fallback', mission:{ title, objective, archetype, preferredCapability } }`. **ALWAYS-200**: on missing key/error, `source:'fallback'` with a deterministic mission (title `"{placeName} — Observation Tasking"`, archetype/capability from the dominant nearby event kind or research/imaging). Never log the key.

- [ ] **Step 7: PlaceCard "Task a contract here"** → POST to `/api/place-contract` with the place + nearby events + agency identity; on response, `buildPlaceContract({ ...mission, lat, lon, placeName, severity: <dominant nearby severity or 0.5>, simNow: simNow(), periodSec: orbitalPeriod(<a representative sat 'a', or a constant LEO period>) })` and `useContractStore.getState().addContract(contract)`; toast/confirm ("Contract added to the board"); optionally `setTarget(contract.id)`. Guard against spamming (disable while in-flight).

- [ ] **Step 8:** `npx vitest run` + `npx tsc --noEmit`; verify `ANTHROPIC_API_KEY` only in route files (`git grep`). Commit — `feat(places): click-to-generate AI contracts via /api/place-contract`

---

## Task 6: Postcards front-and-center + city-image postcard

**Files:**
- Create: `src/components/PostcardStrip.tsx`
- Modify: `src/components/PostcardButton.tsx`, `src/components/CityRevealOverlay.tsx`, `src/components/Hud.tsx`, `src/state/placeStore.ts` (optional recent-postcards list)

- [ ] **Step 1:** Make `PostcardButton` more prominent — a labelled control ("◉ POSTCARD"), not just an icon; keep the rate-limited nudge, and also fire the nudge when a `reveal` is active (a city reveal is inherently postcard-worthy).
- [ ] **Step 2:** When composing a postcard while a `reveal` is active (or from the CityRevealOverlay's CAPTURE button), compose with the **revealed city image** as the hero (draw the city image as the base instead of / behind the WebGL frame) + emblem + `postcardCaption({ contractTitle: <place label>, simTime })` + attribution. Reuse `composePostcard` (extend it minimally if needed to accept an optional base image, or compose in the overlay). Keep the plain orbital-frame postcard path working.
- [ ] **Step 3:** `PostcardStrip.tsx` — a small bottom strip showing the last up-to-3 postcards captured **this session** (keep dataURLs in a module-level array or `placeStore`; do NOT bloat localStorage — session-only is fine). Clicking a thumbnail re-downloads it. Mount in Hud near the PostcardButton. Non-nagging, collapses when empty.
- [ ] **Step 4:** `npx tsc --noEmit` + tests green. Controller visually verifies capture. Commit — `feat(places): postcards front-and-center + city-image postcards + recent strip`

---

## Task 7: UX cohesion + Playwright smoke

**Files:**
- Modify: `src/components/PlaceCard.tsx`, `src/components/CityRevealOverlay.tsx` (chrome), `e2e/*.spec.ts`

- [ ] **Step 1: Cohesion** — Place Card, City Reveal, and Postcard strip share the established chrome (`ui/Chip`, agency accent, panel borders/spacing). Consistent close affordances (ESC/click-away/✕). No functional change.
- [ ] **Step 2: Playwright smoke** — read an existing `e2e/*.spec.ts` for the founding pattern; add a spec: after founding, a **click on the globe canvas opens the Place Card** (assert the card text appears); the card has a **Focus** action that triggers the **City Reveal overlay** (assert it appears); **capture postcard** works (assert a download is triggered or the strip gains a thumbnail — whichever is observable). Keep existing assertions (no console errors, non-black canvas). Run `npx playwright test`; note any environment flakiness.
- [ ] **Step 3:** Full gate: `npx vitest run` (all green), `npx tsc --noEmit` (clean), `npm run build` (success). Commit — `feat(places): UX cohesion + e2e smoke for Living Places`

---

## Global Self-Review (run before execution)

- **Spec coverage:** §8.1 Place Card→T2; §8.2 city reveal→T4; §8.3 image pipeline→T3; §8.4 click-to-generate→T5; §8.5 postcards→T6; §8.6 UX shell→T7. Nearest-city naming (§8.1) →T1. All §8 items mapped.
- **Type consistency:** `City`/`nearestCity`/`placeLabel` (T1) used by T2/T3/T5; `placeStore.place`/`reveal` (T2) drive T4; `PlaceImage`/`pickBestImage` (T3) used by T3 route + T6; `buildPlaceContract`/`addContract` (T5) consume the existing `Contract`. Consistent.
- **Boundary:** engine (globe pick, PlaceMarker, reveal camera) has no React; overlays never touch Three (they call `getActiveEngine().captureFrame()` → string, and read stores). Camera reveal beat placed below burn/completion, guarded.
- **Security/resilience:** both routes ALWAYS-200 with fallback; key server-only; Wikimedia keyless with attribution; timeouts + cache; never-blank.
- **Determinism:** pure libs have no clock/random; routes may stamp `fetchedAt` like `/api/events`.
- **Order:** data/pick (T1–T2) → image (T3) → reveal (T4) → AI contract (T5) → postcards (T6) → cohesion+e2e (T7). Each leaves the game playable.

## Execution Handoff

Execute via **superpowers:subagent-driven-development** — fresh implementer per task, task review (spec + quality) after each, one broad final review (most-capable model), controller visual-verifies the visual tasks (T2 click, T4 reveal, T6 postcard) on :3100, then merge to main and push. Keep the 203 unit tests green plus new suites; extend the Playwright smoke in T7.
