# HYPERION Plan 5: Real Satellites & Event Icons

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cyan octahedron satellite markers with detailed procedural 3D satellites (gold-foil bus, blue solar panel wings, comms dish, blinking nav light) lit by a real sun-aligned light; replace event blips with recognizable canvas-drawn icon sprites (seismic rings, flame, cyclone spiral, rocket) while keeping the existing colors, ripple/flicker/pulse animations, and additive shimmer.

**Architecture:** A `buildSatelliteModel()` factory (`src/engine/satelliteModel.ts`) returns a lit `THREE.Group` used by `SatelliteLayer`; the scene gains a directional sun light that tracks the terminator's `sunDirection` (earth/atmosphere shaders are unaffected — they're custom/unlit). An icon-texture factory (`src/engine/eventIcons.ts`) draws white glyphs on offscreen canvases (cached per kind) tinted by sprite materials; `EventLayer` swaps core meshes for `THREE.Sprite`s and keeps its animation meshes.

**Tech Stack:** Existing. Zero asset files — models and icons are 100% procedural.

**Spec:** `docs/superpowers/specs/2026-08-22-hyperion-design.md` (Graphics pillar)

## Global Constraints

- Colors unchanged: quake `0xff5c49`, wildfire `0xffa14a`, storm `0x9a7bff`, launch `0x45d8ff`, fleet accent `0x45d8ff`, selected `0xa8ecff`.
- Existing animations preserved: quake expanding ripple, wildfire flicker (now sprite opacity), storm pulse ring, per-event `hashPhase` offsets, focused ×1.8 via `applyFocus`.
- Earth/atmosphere/cloud rendering untouched. New lights must not exceed: DirectionalLight intensity 2.2 + AmbientLight(0x223347, 0.6).
- Hit spheres, selection flow, ribbons, ghost orbit, burn chase all keep working (e2e must stay 3/3).
- Engine code: no React imports. Port 3100 only.
- Commit prefixes `feat:`/`fix:`/`chore:`.

---

### Task 1: Sun light + procedural satellite model

**Files:**
- Create: `src/engine/satelliteModel.ts`
- Modify: `src/engine/GlobeEngine.ts`
- Modify: `src/engine/SatelliteLayer.ts`

**Interfaces:**
- `buildSatelliteModel(selected: boolean): SatelliteModel` where `interface SatelliteModel { group: THREE.Group; navLight: THREE.Mesh }`. Group is ~0.035 units wingspan, +Z is "forward" (flight direction).
- GlobeEngine adds `private sunLight: THREE.DirectionalLight` updated inside `updateSun()`; SatelliteLayer orients each model with `group.up = sunDir` heuristic then `lookAt` along velocity, and blinks nav lights in `update()`.

- [ ] **Step 1: Model factory**

Create `src/engine/satelliteModel.ts`:

```ts
import * as THREE from 'three'

export interface SatelliteModel {
  group: THREE.Group
  navLight: THREE.Mesh
}

const GOLD = new THREE.MeshStandardMaterial({
  color: 0xb08d2f, metalness: 0.85, roughness: 0.35,
})
const SILVER = new THREE.MeshStandardMaterial({
  color: 0xc9d1d9, metalness: 0.9, roughness: 0.25,
})
const PANEL = new THREE.MeshStandardMaterial({
  color: 0x14264f, metalness: 0.6, roughness: 0.3,
  emissive: 0x0a1e4a, emissiveIntensity: 0.55,
})
const PANEL_SELECTED = new THREE.MeshStandardMaterial({
  color: 0x1a3a72, metalness: 0.6, roughness: 0.3,
  emissive: 0x2a6bd4, emissiveIntensity: 0.9,
})
const ARM = new THREE.MeshStandardMaterial({
  color: 0x888e96, metalness: 0.8, roughness: 0.4,
})

/**
 * Procedural comms satellite: gold-foil bus, twin solar wings, dish, nav light.
 * +Z is the flight direction; solar wings span local X; dish faces -Z (nadir-ish).
 * Wingspan ~0.035 scene units. Materials are shared across instances (do NOT
 * dispose materials per-satellite — dispose geometries only).
 */
export function buildSatelliteModel(selected: boolean): SatelliteModel {
  const group = new THREE.Group()

  const bus = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.013), GOLD)
  group.add(bus)

  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.003), SILVER)
  collar.position.z = 0.008
  group.add(collar)

  // Dish: shallow cone opening toward -Z
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.0025, 20, 1, true), SILVER)
  dish.rotation.x = -Math.PI / 2
  dish.position.z = -0.008
  group.add(dish)

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.006), ARM)
  mast.rotation.x = Math.PI / 2
  mast.position.z = -0.0105
  group.add(mast)

  // Solar wings on ±X arms
  const panelMat = selected ? PANEL_SELECTED : PANEL
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0005, 0.005), ARM)
    arm.rotation.z = Math.PI / 2
    arm.position.x = side * 0.0065
    group.add(arm)

    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.0006, 0.009), panelMat)
    wing.position.x = side * 0.016
    group.add(wing)

    // Panel seams: three thin dark strips across each wing for detail
    for (let k = -1; k <= 1; k++) {
      const seam = new THREE.Mesh(
        new THREE.BoxGeometry(0.0005, 0.0008, 0.009),
        ARM,
      )
      seam.position.set(side * (0.016 + k * 0.0045), 0, 0)
      group.add(seam)
    }
  }

  const navLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.0012, 8, 8),
    new THREE.MeshBasicMaterial({ color: selected ? 0xa8ecff : 0xff5555 }),
  )
  navLight.position.set(0, 0.006, 0)
  group.add(navLight)

  return { group, navLight }
}
```

- [ ] **Step 2: Scene lighting**

In `src/engine/GlobeEngine.ts`:
- Field: `private sunLight = new THREE.DirectionalLight(0xfff4e0, 2.2)`
- Constructor (near atmosphere setup): `this.scene.add(this.sunLight); this.scene.add(new THREE.AmbientLight(0x223347, 0.6))`
- In `updateSun()` after computing `dir`: `this.sunLight.position.copy(dir).multiplyScalar(10)` (DirectionalLight shines from position toward origin — matches the shader's terminator).

- [ ] **Step 3: SatelliteLayer swap**

In `src/engine/SatelliteLayer.ts`:
- Import: `import { buildSatelliteModel, type SatelliteModel } from '@/engine/satelliteModel'` and add `latLonToVector3`-free sun access: `import { subsolarPoint, latLonToVector3 } from '@/lib/geo'`
- Replace the markers map type: `private markers = new Map<string, SatelliteModel>()`
- In `rebuild()`, replace the octahedron block with:

```ts
const model = buildSatelliteModel(selected)
this.group.add(model.group)
this.markers.set(sat.id, model)
```

- In `clearSatObjects()`, the markers map now holds groups — dispose geometries only (materials are shared module singletons):

```ts
for (const model of this.markers.values()) {
  this.group.remove(model.group)
  model.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose()
  })
}
this.markers.clear()
```

(Keep the existing loop for `hits` and `ribbons` disposing geometry AND material — those materials are per-instance. The navLight's MeshBasicMaterial is per-instance too: dispose it specially: in the traverse, `if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial) obj.material.dispose()`.)

- In `update(simTime)`, replace the marker positioning block:

```ts
const sub = subsolarPoint(new Date())
const sun = latLonToVector3(sub.lat, sub.lon, 1).normalize()
for (const sat of satellites) {
  const sv = propagate(sat.elements, simTime)
  const p = sceneFromEci(sv.position)
  const model = this.markers.get(sat.id)
  if (model) {
    model.group.position.copy(p)
    model.group.up.copy(sun) // wings roughly sunward
    model.group.lookAt(p.clone().add(sceneFromEci(sv.velocity).normalize()))
    model.navLight.visible = Math.sin(simTime * 0.4 + hashPhase(sat.id)) > 0
  }
  this.hits.get(sat.id)?.position.copy(p)
}
```

(`hashPhase` already exists in EventLayer — move it to a shared location: export it from `src/engine/eventIcons.ts`? No — Task 2 creates that file. For THIS task, add a local copy named `hashPhase` at module level in SatelliteLayer.ts with a comment `// same as EventLayer's; consolidate when shared module appears`. Task 2 consolidates both to import from `src/engine/eventIcons.ts`.)

- [ ] **Step 4: Gate** — `tsc --noEmit` clean; `pnpm test` 53/53; `pnpm e2e` 3/3 (`lsof -ti:3100 | xargs kill -9` first).

- [ ] **Step 5: Commit** — `git add src/engine && git commit -m "feat: procedural 3D satellites with sun-tracking wings and scene lighting"`

---

### Task 2: Event icon sprites

**Files:**
- Create: `src/engine/eventIcons.ts`
- Modify: `src/engine/EventLayer.ts`
- Modify: `src/engine/SatelliteLayer.ts` (import consolidation)

**Interfaces:**
- `getEventIconTexture(kind: EventKind): THREE.CanvasTexture` — cached per kind; 128×128 white glyph on transparent, tinted by the sprite material.
- `hashPhase(id: string): number` — exported here; both layers import it (delete local copies).

- [ ] **Step 1: Icon factory**

Create `src/engine/eventIcons.ts`:

```ts
import * as THREE from 'three'
import type { EventKind } from '@/lib/worldEvents'

/** Stable per-id animation phase in [0, 2π). */
export function hashPhase(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((h >>> 0) % 100) / 100 * Math.PI * 2
}

const cache = new Map<EventKind, THREE.CanvasTexture>()

function draw(kind: EventKind, ctx: CanvasRenderingContext2D) {
  const c = 64 // center
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'

  if (kind === 'quake') {
    // Seismic: solid epicenter dot + two broken concentric rings
    ctx.beginPath(); ctx.arc(c, c, 9, 0, Math.PI * 2); ctx.fill()
    for (const [r, gap] of [[28, 0.5], [46, 0.7]] as const) {
      for (let k = 0; k < 3; k++) {
        const a0 = (k * 2 * Math.PI) / 3 + gap
        ctx.beginPath(); ctx.arc(c, c, r, a0, a0 + (2 * Math.PI) / 3 - gap); ctx.stroke()
      }
    }
  } else if (kind === 'wildfire') {
    // Flame teardrop with inner cutout
    ctx.beginPath()
    ctx.moveTo(64, 8)
    ctx.bezierCurveTo(30, 44, 22, 70, 30, 90)
    ctx.bezierCurveTo(38, 110, 54, 120, 64, 120)
    ctx.bezierCurveTo(74, 120, 90, 110, 98, 90)
    ctx.bezierCurveTo(106, 70, 98, 44, 64, 8)
    ctx.fill()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.moveTo(64, 62)
    ctx.bezierCurveTo(50, 80, 50, 94, 64, 104)
    ctx.bezierCurveTo(78, 94, 78, 80, 64, 62)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  } else if (kind === 'storm') {
    // Cyclone: eye + three curved arms
    ctx.beginPath(); ctx.arc(c, c, 12, 0, Math.PI * 2); ctx.stroke()
    for (let k = 0; k < 3; k++) {
      const a = (k * 2 * Math.PI) / 3
      ctx.beginPath()
      ctx.arc(
        c + Math.cos(a) * 18, c + Math.sin(a) * 18,
        26, a + Math.PI * 0.15, a + Math.PI * 0.85,
      )
      ctx.stroke()
    }
  } else {
    // Rocket: nose + body + fins + exhaust notch
    ctx.beginPath()
    ctx.moveTo(64, 10)
    ctx.bezierCurveTo(84, 34, 84, 64, 78, 88) // right side
    ctx.lineTo(50, 88)
    ctx.bezierCurveTo(44, 64, 44, 34, 64, 10) // left side
    ctx.fill()
    // fins
    ctx.beginPath(); ctx.moveTo(50, 70); ctx.lineTo(30, 96); ctx.lineTo(50, 92); ctx.fill()
    ctx.beginPath(); ctx.moveTo(78, 70); ctx.lineTo(98, 96); ctx.lineTo(78, 92); ctx.fill()
    // window
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath(); ctx.arc(64, 44, 8, 0, Math.PI * 2); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    // exhaust
    ctx.beginPath(); ctx.moveTo(54, 96); ctx.lineTo(64, 118); ctx.lineTo(74, 96); ctx.fill()
  }
}

/** White glyph texture for an event kind, cached. Tint via SpriteMaterial color. */
export function getEventIconTexture(kind: EventKind): THREE.CanvasTexture {
  const hit = cache.get(kind)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  draw(kind, canvas.getContext('2d')!)
  const tex = new THREE.CanvasTexture(canvas)
  tex.anisotropy = 4
  cache.set(kind, tex)
  return tex
}
```

- [ ] **Step 2: EventLayer swap**

In `src/engine/EventLayer.ts`:
- Imports: `import { getEventIconTexture, hashPhase } from '@/engine/eventIcons'`; delete the local `hashPhase`.
- `MarkerEntry`: replace `core: THREE.Mesh` with `core: THREE.Sprite`.
- In `rebuild()`, replace the per-kind core mesh construction with a sprite + keep the animation meshes:

```ts
const color = COLORS[event.kind]
const sprite = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: getEventIconTexture(event.kind),
    color,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
)
sprite.scale.setScalar(0.03)
root.add(sprite)
const core = sprite

let ripple: THREE.Mesh | undefined
if (event.kind === 'quake') {
  ripple = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.014, 32), additiveMat(color, 0.5))
  root.add(ripple)
} else if (event.kind === 'storm') {
  ripple = new THREE.Mesh(new THREE.RingGeometry(0.016, 0.02, 32), additiveMat(color, 0.4))
  root.add(ripple)
}
```

(The storm now ALSO gets a ring — it becomes the pulse element so the spiral sprite can spin instead of scale-pulsing.)

- In `update()`, adjust the per-kind animation:

```ts
if (event.kind === 'quake' && ripple) {
  const cycle = (t % 2) / 2
  ripple.scale.setScalar(1 + cycle * 2)
  ;(ripple.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - cycle)
} else if (event.kind === 'wildfire') {
  ;(core.material as THREE.SpriteMaterial).opacity = 0.7 + 0.25 * Math.sin(t * 7)
} else if (event.kind === 'storm') {
  ;(core.material as THREE.SpriteMaterial).rotation = -t * 0.8
  if (ripple) ripple.scale.setScalar(1 + 0.15 * Math.sin(t * 2))
}
```

- Disposal: sprites' materials are per-instance (dispose them); the cached textures are shared — never disposed by the layer. In `clear()`'s traverse add sprite handling:

```ts
if (obj instanceof THREE.Sprite) {
  obj.material.dispose() // material only — texture is the shared cache
}
```

- [ ] **Step 3: Consolidate** — in `src/engine/SatelliteLayer.ts`, delete the local `hashPhase` copy and `import { hashPhase } from '@/engine/eventIcons'`.

- [ ] **Step 4: Gate** — `tsc --noEmit` clean; `pnpm test` 53/53; `pnpm e2e` 3/3.

- [ ] **Step 5: Commit** — `git add src/engine && git commit -m "feat: canvas-drawn event icon sprites (seismic, flame, cyclone, rocket)"`

---

### Task 3: README + full gate

- [ ] Status line → `**Status:** Plan 5 (procedural 3D satellites + event icon sprites) complete.`
- [ ] `pnpm test && pnpm e2e && pnpm exec tsc --noEmit`
- [ ] `git add README.md && git commit -m "chore: README status for Plan 5"`
