# HYPERION Plan 1: Foundation & Cinematic Globe

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed-quality Next.js app whose home page is a gorgeous, live, cinematic 3D Earth — real day/night terminator computed from the actual current UTC time, night-side city lights, drifting clouds, atmospheric rim glow, starfield, bloom, and a smooth intro camera sweep — crisp on retina displays.

**Architecture:** Next.js App Router hosts a single client component that mounts a framework-independent `GlobeEngine` class (plain Three.js — no react-three-fiber; the engine is a standalone module React merely mounts/disposes). Pure geographic/solar math lives in `src/lib/geo.ts` with unit tests. All later plans (satellites, events, missions) render *through* this engine.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind), Three.js `0.169.0` (pinned), Vitest for unit tests, Playwright for smoke tests, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-22-hyperion-design.md`

**Roadmap context (this is Plan 1 of 5):** Plan 2 = orbital mechanics + satellites + burn preview. Plan 3 = feed ingestion + Neon/Clerk + persistence. Plan 4 = flying moments + audio/game-feel. Plan 5 = LLM layer + living-world ticks. Auroras and event pulses on the globe are deliberately deferred (Plan 3+ renders events; aurora is polish in Plan 4).

## Global Constraints

- Rendering must be DPR-aware: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` — never a fixed-resolution canvas (spec: "Game feel — crisp rendering").
- Dark situation-room aesthetic: near-black background `#030509`, thin neon accents (spec: "Graphics").
- Three.js version is pinned to `0.169.0` exactly (addons import paths and FilmPass signature depend on it).
- All engine code lives under `src/engine/` and must not import React; all React code lives under `src/components/` or `src/app/`.
- Every task ends with a commit; commit messages use conventional prefixes (`feat:`, `test:`, `chore:`).
- Textures come from the three-globe repo (MIT; imagery originally NASA public domain) — exact URLs in Task 1.

---

### Task 1: Scaffold the app, tooling, and textures

**Files:**
- Create: entire Next.js scaffold (via create-next-app into a temp dir, then synced in — the repo already contains `docs/` and `.git`, and create-next-app refuses non-empty dirs)
- Create: `vitest.config.ts`
- Create: `public/textures/earth-day.jpg`, `public/textures/earth-night.jpg`, `public/textures/clouds.png`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `package.json`

**Interfaces:**
- Produces: a running Next.js app (`pnpm dev`), `pnpm test` (vitest), textures at `/textures/earth-day.jpg`, `/textures/earth-night.jpg`, `/textures/clouds.png`.

- [ ] **Step 1: Scaffold via temp dir and sync in**

```bash
cd /Users/connorevans/Downloads/GAM3
pnpm dlx create-next-app@latest /tmp/hyperion-scaffold --typescript --eslint --app --src-dir --tailwind --turbopack --import-alias "@/*" --yes
rsync -a --exclude node_modules --exclude .git /tmp/hyperion-scaffold/ .
rm -rf /tmp/hyperion-scaffold
pnpm install
```

- [ ] **Step 2: Add pinned dependencies**

```bash
pnpm add three@0.169.0
pnpm add -D @types/three@0.169.0 vitest@^2
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.

- [ ] **Step 4: Download textures**

```bash
mkdir -p public/textures
curl -L -o public/textures/earth-day.jpg   https://raw.githubusercontent.com/vasturiano/three-globe/master/example/img/earth-blue-marble.jpg
curl -L -o public/textures/earth-night.jpg https://raw.githubusercontent.com/vasturiano/three-globe/master/example/img/earth-night.jpg
curl -L -o public/textures/clouds.png      https://raw.githubusercontent.com/vasturiano/three-globe/master/example/clouds/clouds.png
ls -la public/textures  # expect three files, each > 100KB
```

- [ ] **Step 5: Set the dark base theme**

Replace the body of `src/app/globals.css` (keep the Tailwind directives at top) with:

```css
:root {
  --bg: #030509;
  --accent: #45d8ff;
  --text: #e6edf3;
}

html, body {
  height: 100%;
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  overflow: hidden;
}
```

In `src/app/layout.tsx`, set the metadata:

```ts
export const metadata: Metadata = {
  title: 'HYPERION',
  description: 'The watch from above.',
}
```

- [ ] **Step 6: Verify dev server boots**

Run: `pnpm dev` (background), then `curl -s http://localhost:3000 | grep -i hyperion`
Expected: HTML containing the HYPERION title. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Three.js, Vitest, textures, dark theme"
```

---

### Task 2: Geographic + solar math module (TDD)

**Files:**
- Create: `src/lib/geo.ts`
- Test: `src/lib/geo.test.ts`

**Interfaces:**
- Produces:
  - `latLonToVector3(latDeg: number, lonDeg: number, radius?: number): THREE.Vector3` — maps geographic coordinates onto the scene sphere (default radius `1`), matching Three.js `SphereGeometry`'s equirectangular UV convention (the three-globe convention: `phi = (90-lat)°`, `theta = (90-lon)°`).
  - `subsolarPoint(date: Date): { lat: number; lon: number }` — the point on Earth where the sun is directly overhead (declination approximation, ±1°; longitude from UTC hour angle).
  - `EARTH_RADIUS = 1` (scene units).
- Consumed by: Task 4 (sun direction uniform), and every later plan (event markers, satellite positions).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { latLonToVector3, subsolarPoint, EARTH_RADIUS } from './geo'

describe('latLonToVector3', () => {
  it('maps the north pole to +Y', () => {
    const v = latLonToVector3(90, 0)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(EARTH_RADIUS, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('maps (0°, 0°) — Gulf of Guinea — to +Z', () => {
    const v = latLonToVector3(0, 0)
    expect(v.x).toBeCloseTo(0, 5)
    expect(v.y).toBeCloseTo(0, 5)
    expect(v.z).toBeCloseTo(EARTH_RADIUS, 5)
  })

  it('maps (0°, 90°E) to +X', () => {
    const v = latLonToVector3(0, 90)
    expect(v.x).toBeCloseTo(EARTH_RADIUS, 5)
    expect(v.y).toBeCloseTo(0, 5)
    expect(v.z).toBeCloseTo(0, 5)
  })

  it('respects a custom radius', () => {
    const v = latLonToVector3(0, 0, 2.5)
    expect(v.length()).toBeCloseTo(2.5, 5)
  })
})

describe('subsolarPoint', () => {
  it('puts the sun near lon 0 at 12:00 UTC', () => {
    const { lon } = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)))
    expect(Math.abs(lon)).toBeLessThan(2)
  })

  it('puts the sun near lon -90 (90°W) at 18:00 UTC', () => {
    const { lon } = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 18, 0, 0)))
    expect(lon).toBeCloseTo(-90, 0)
  })

  it('declination is ~+23.4° at June solstice', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 12, 0, 0)))
    expect(lat).toBeGreaterThan(22.5)
    expect(lat).toBeLessThan(24.5)
  })

  it('declination is ~-23.4° at December solstice', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 11, 21, 12, 0, 0)))
    expect(lat).toBeGreaterThan(-24.5)
    expect(lat).toBeLessThan(-22.5)
  })

  it('declination is near 0 at the March equinox', () => {
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)))
    expect(Math.abs(lat)).toBeLessThan(1.5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./geo`.

- [ ] **Step 3: Implement the module**

Create `src/lib/geo.ts`:

```ts
import { Vector3 } from 'three'

/** Scene-space Earth radius. All distances in the app are in Earth radii. */
export const EARTH_RADIUS = 1

const DEG = Math.PI / 180

/**
 * Geographic coordinates -> scene position, matching the equirectangular
 * UV layout of THREE.SphereGeometry (three-globe convention):
 * phi = (90 - lat), theta = (90 - lon).
 */
export function latLonToVector3(
  latDeg: number,
  lonDeg: number,
  radius: number = EARTH_RADIUS,
): Vector3 {
  const phi = (90 - latDeg) * DEG
  const theta = (90 - lonDeg) * DEG
  return new Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

/**
 * Approximate subsolar point (where the sun is directly overhead).
 * Declination: cosine approximation, accurate to ~1°.
 * Longitude: from the UTC hour angle (ignores equation of time, error < 4°) —
 * plenty for a game terminator.
 */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1)
  const dayOfYear = (date.getTime() - startOfYear) / 86_400_000 + 1
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365.24) * (dayOfYear + 10))

  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  let lon = (12 - utcHours) * 15
  if (lon > 180) lon -= 360
  if (lon < -180) lon += 360

  return { lat, lon }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo.ts src/lib/geo.test.ts
git commit -m "feat: geographic and subsolar-point math with unit tests"
```

---

### Task 3: GlobeEngine shell + mounted canvas

**Files:**
- Create: `src/engine/GlobeEngine.ts`
- Create: `src/components/GlobeCanvas.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces: `class GlobeEngine { constructor(canvas: HTMLCanvasElement); start(): void; dispose(): void }` — owns scene, camera, renderer, controls, resize, and the frame loop. Task 4–6 extend this class.
- Consumes: nothing from earlier tasks yet (placeholder sphere; shader arrives in Task 4).

- [ ] **Step 1: Write the engine shell**

Create `src/engine/GlobeEngine.ts`:

```ts
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EARTH_RADIUS } from '@/lib/geo'

export class GlobeEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private frameHandle = 0
  private resizeObserver: ResizeObserver
  protected earth: THREE.Mesh

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
    this.camera.position.set(0, EARTH_RADIUS * 0.6, EARTH_RADIUS * 3)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = EARTH_RADIUS * 1.4
    this.controls.maxDistance = EARTH_RADIUS * 8
    this.controls.enablePan = false
    this.controls.rotateSpeed = 0.45

    // Placeholder material — replaced by the day/night shader in Task 4.
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS, 96, 96),
      new THREE.MeshBasicMaterial({ color: 0x0a2a4a }),
    )
    this.scene.add(this.earth)

    this.scene.add(this.buildStarfield())

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.handleResize()
  }

  private buildStarfield(): THREE.Points {
    const COUNT = 4000
    const positions = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      // Uniform points on a distant sphere
      const u = Math.random() * 2 - 1
      const t = Math.random() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      positions[i * 3] = 60 * s * Math.cos(t)
      positions[i * 3 + 1] = 60 * u
      positions[i * 3 + 2] = 60 * s * Math.sin(t)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: 0xbfd4e6,
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    })
    return new THREE.Points(geometry, material)
  }

  private handleResize() {
    const host = this.canvas.parentElement ?? this.canvas
    const { clientWidth: w, clientHeight: h } = host
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  /** Per-frame hook — extended by later tasks. */
  protected update(_elapsedSeconds: number) {}

  start() {
    const clock = new THREE.Clock()
    const tick = () => {
      this.frameHandle = requestAnimationFrame(tick)
      this.controls.update()
      this.update(clock.getElapsedTime())
      this.render()
    }
    tick()
  }

  /** Render hook — replaced by the composer in Task 6. */
  protected render() {
    this.renderer.render(this.scene, this.camera)
  }

  protected get sceneRef() {
    return this.scene
  }
  protected get cameraRef() {
    return this.camera
  }
  protected get controlsRef() {
    return this.controls
  }
  protected get rendererRef() {
    return this.renderer
  }

  dispose() {
    cancelAnimationFrame(this.frameHandle)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose()
        const m = obj.material
        for (const mat of Array.isArray(m) ? m : [m]) mat.dispose()
      }
    })
    this.renderer.dispose()
  }
}
```

- [ ] **Step 2: Write the React mount**

Create `src/components/GlobeCanvas.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'
import { GlobeEngine } from '@/engine/GlobeEngine'

export default function GlobeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const engine = new GlobeEngine(canvas)
    engine.start()
    return () => engine.dispose()
  }, [])

  return (
    <div className="fixed inset-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
```

- [ ] **Step 3: Wire the page**

Replace `src/app/page.tsx`:

```tsx
import GlobeCanvas from '@/components/GlobeCanvas'

export default function Home() {
  return (
    <main>
      <GlobeCanvas />
    </main>
  )
}
```

- [ ] **Step 4: Verify in the browser**

Run: `pnpm dev`, open http://localhost:3000.
Expected: a dark-blue sphere over a starfield; drag rotates with smooth damping; scroll zooms within limits; resizing the window keeps the sphere crisp and correctly proportioned. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/engine/GlobeEngine.ts src/components/GlobeCanvas.tsx src/app/page.tsx
git commit -m "feat: GlobeEngine shell with starfield, orbit controls, DPR-aware canvas"
```

---

### Task 4: Day/night Earth shader with real terminator

**Files:**
- Create: `src/engine/earthMaterial.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Interfaces:**
- Consumes: `subsolarPoint`, `latLonToVector3` from `src/lib/geo.ts` (Task 2).
- Produces: `createEarthMaterial(dayMap: THREE.Texture, nightMap: THREE.Texture): THREE.ShaderMaterial` with a `sunDirection: THREE.Vector3` uniform; `GlobeEngine` gains `private updateSun()` called every frame.

- [ ] **Step 1: Write the shader material**

Create `src/engine/earthMaterial.ts`:

```ts
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;

  varying vec2 vUv;
  varying vec3 vWorldNormal;

  void main() {
    float cosAngle = dot(normalize(vWorldNormal), normalize(sunDirection));

    // Soft twilight band across the terminator.
    float dayAmount = smoothstep(-0.12, 0.12, cosAngle);

    vec3 day = texture2D(dayMap, vUv).rgb;
    // Day side gets simple diffuse shading so noon looks brighter than dawn.
    day *= 0.25 + 0.85 * max(cosAngle, 0.0);

    // City lights: warm tint, boosted so they glow (bloom picks this up).
    vec3 night = texture2D(nightMap, vUv).rgb * vec3(1.0, 0.88, 0.72) * 1.9;

    vec3 color = mix(night, day, dayAmount);

    // Faint blue ambient so the night limb never goes pure black.
    color += vec3(0.012, 0.022, 0.045) * (1.0 - dayAmount);

    gl_FragColor = vec4(color, 1.0);
  }
`

export function createEarthMaterial(
  dayMap: THREE.Texture,
  nightMap: THREE.Texture,
): THREE.ShaderMaterial {
  dayMap.colorSpace = THREE.SRGBColorSpace
  nightMap.colorSpace = THREE.SRGBColorSpace
  return new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: dayMap },
      nightMap: { value: nightMap },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader,
    fragmentShader,
  })
}
```

- [ ] **Step 2: Use it in the engine**

In `src/engine/GlobeEngine.ts`:

Add imports:

```ts
import { createEarthMaterial } from '@/engine/earthMaterial'
import { EARTH_RADIUS, latLonToVector3, subsolarPoint } from '@/lib/geo'
```

(Replace the existing `import { EARTH_RADIUS } from '@/lib/geo'` line.)

Add a field:

```ts
private earthMaterial?: THREE.ShaderMaterial
```

In the constructor, replace the placeholder-material earth block with:

```ts
this.earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 96, 96),
  new THREE.MeshBasicMaterial({ color: 0x0a2a4a }), // visible until textures load
)
this.scene.add(this.earth)

const loader = new THREE.TextureLoader()
Promise.all([
  loader.loadAsync('/textures/earth-day.jpg'),
  loader.loadAsync('/textures/earth-night.jpg'),
]).then(([day, night]) => {
  this.earthMaterial = createEarthMaterial(day, night)
  this.earth.material = this.earthMaterial
  this.updateSun()
})
```

Add the sun updater and call it from `update`:

```ts
private updateSun() {
  if (!this.earthMaterial) return
  const { lat, lon } = subsolarPoint(new Date())
  const dir = latLonToVector3(lat, lon, 1).normalize()
  ;(this.earthMaterial.uniforms.sunDirection.value as THREE.Vector3).copy(dir)
}

protected update(_elapsedSeconds: number) {
  this.updateSun()
}
```

- [ ] **Step 3: Verify the terminator against reality**

Run: `pnpm dev`, open http://localhost:3000.
Expected: textured Earth; one hemisphere day, one night with glowing city lights; a soft twilight band. Sanity-check: find where local noon should be right now (sun over longitude `(12 − currentUTCHour) × 15`) and confirm that hemisphere is lit. Also run `pnpm test` — still passing.

- [ ] **Step 4: Commit**

```bash
git add src/engine/earthMaterial.ts src/engine/GlobeEngine.ts
git commit -m "feat: day/night Earth shader with real-time subsolar terminator and city lights"
```

---

### Task 5: Clouds and atmospheric rim glow

**Files:**
- Create: `src/engine/atmosphereMaterial.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Interfaces:**
- Consumes: `sunDirection` convention from Task 4 (world-space unit vector).
- Produces: `createAtmosphereMaterial(): THREE.ShaderMaterial` (with `sunDirection` uniform); engine gains a `clouds` mesh rotating slowly.

- [ ] **Step 1: Write the atmosphere shader**

Create `src/engine/atmosphereMaterial.ts`:

```ts
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec3 vWorldNormal;

  void main() {
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Rendered on a slightly larger BackSide sphere: fresnel-style rim,
// brighter on the sunlit limb, deep blue on the night limb.
const fragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  varying vec3 vWorldNormal;

  void main() {
    vec3 n = normalize(vWorldNormal);
    float rim = pow(0.72 - abs(dot(n, vec3(0.0, 0.0, 1.0))) * 0.5, 3.0);
    float sunlit = smoothstep(-0.3, 0.6, dot(n, normalize(sunDirection)));
    vec3 dayGlow = vec3(0.28, 0.56, 1.0);
    vec3 nightGlow = vec3(0.04, 0.09, 0.22);
    gl_FragColor = vec4(mix(nightGlow, dayGlow, sunlit), 1.0) * rim * 1.6;
  }
`

export function createAtmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { sunDirection: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  })
}
```

- [ ] **Step 2: Add clouds + atmosphere to the engine**

In `src/engine/GlobeEngine.ts`, add import:

```ts
import { createAtmosphereMaterial } from '@/engine/atmosphereMaterial'
```

Add fields:

```ts
private clouds?: THREE.Mesh
private atmosphereMaterial?: THREE.ShaderMaterial
```

In the constructor, after the earth/texture block, add:

```ts
this.atmosphereMaterial = createAtmosphereMaterial()
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS * 1.12, 96, 96),
  this.atmosphereMaterial,
)
this.scene.add(atmosphere)

new THREE.TextureLoader().loadAsync('/textures/clouds.png').then((tex) => {
  this.clouds = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.008, 96, 96),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  )
  this.scene.add(this.clouds)
})
```

In `updateSun()`, also copy the direction into the atmosphere uniform:

```ts
if (this.atmosphereMaterial) {
  ;(this.atmosphereMaterial.uniforms.sunDirection.value as THREE.Vector3).copy(dir)
}
```

In `update()`, add slow cloud drift:

```ts
if (this.clouds) this.clouds.rotation.y = elapsedSeconds * 0.004
```

(Rename the parameter from `_elapsedSeconds` to `elapsedSeconds`.)

- [ ] **Step 3: Verify in the browser**

Run: `pnpm dev`.
Expected: a soft blue rim hugging the limb — brighter on the sunlit side, deep navy on the night side; a cloud layer drifting almost imperceptibly; zooming in shows clouds floating above the surface.

- [ ] **Step 4: Commit**

```bash
git add src/engine/atmosphereMaterial.ts src/engine/GlobeEngine.ts
git commit -m "feat: atmospheric rim glow and drifting cloud layer"
```

---

### Task 6: Post-processing, intro sweep, and the HUD shell

**Files:**
- Modify: `src/engine/GlobeEngine.ts`
- Create: `src/components/Hud.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GlobeEngine.render()` hook (Task 3).
- Produces: bloom + film grain on the render path; a 3.5-second eased intro sweep; `<Hud />` overlay (wordmark + live UTC clock) that later plans extend into the situation room.

- [ ] **Step 1: Add the composer**

In `src/engine/GlobeEngine.ts`, add imports:

```ts
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js'
```

Add a field:

```ts
private composer?: EffectComposer
```

At the end of the constructor:

```ts
this.composer = new EffectComposer(this.renderer)
this.composer.addPass(new RenderPass(this.scene, this.camera))
this.composer.addPass(
  new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.65, 0.82),
)
this.composer.addPass(new FilmPass(0.18, false))
```

In `handleResize()`, after `this.renderer.setSize(...)`, add:

```ts
this.composer?.setSize(w, h)
```

Replace the `render()` hook body:

```ts
protected render() {
  if (this.composer) this.composer.render()
  else this.renderer.render(this.scene, this.camera)
}
```

In `dispose()`, add `this.composer?.dispose()` before `this.renderer.dispose()`.

- [ ] **Step 2: Add the intro camera sweep**

Add fields:

```ts
private introStart: number | null = null
private static readonly INTRO_SECONDS = 3.5
```

In `update()`, add at the top:

```ts
if (this.introStart === null) this.introStart = elapsedSeconds
const t = (elapsedSeconds - this.introStart) / GlobeEngine.INTRO_SECONDS
if (t < 1) {
  const ease = 1 - Math.pow(1 - t, 3) // cubic ease-out
  const dist = EARTH_RADIUS * (7.5 - 4.5 * ease) // 7.5 -> 3.0
  const angle = -0.5 + 0.5 * ease
  this.cameraRef.position.set(
    dist * Math.sin(angle),
    EARTH_RADIUS * (1.4 - 0.8 * ease),
    dist * Math.cos(angle),
  )
  this.cameraRef.lookAt(0, 0, 0)
  this.controlsRef.enabled = false
} else {
  this.controlsRef.enabled = true
}
```

- [ ] **Step 3: Build the HUD shell**

Create `src/components/Hud.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

function utcNow(): string {
  return new Date().toISOString().slice(11, 19) + ' UTC'
}

export default function Hud() {
  const [clock, setClock] = useState<string | null>(null)

  useEffect(() => {
    setClock(utcNow())
    const id = setInterval(() => setClock(utcNow()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-10 p-6 font-mono">
      <header className="flex items-start justify-between">
        <h1 className="text-sm font-semibold tracking-[0.5em] text-[var(--text)]">
          HYPERION
          <span className="mt-1 block h-px w-24 bg-[var(--accent)] opacity-70" />
        </h1>
        <p className="text-xs tabular-nums text-[var(--accent)] opacity-90">
          {clock ?? '--:--:-- UTC'}
        </p>
      </header>
    </div>
  )
}
```

In `src/app/page.tsx`:

```tsx
import GlobeCanvas from '@/components/GlobeCanvas'
import Hud from '@/components/Hud'

export default function Home() {
  return (
    <main>
      <GlobeCanvas />
      <Hud />
    </main>
  )
}
```

- [ ] **Step 4: Verify in the browser**

Run: `pnpm dev`.
Expected: page opens with a slow cinematic pull-in from deep space that hands control to the mouse after ~3.5s; city lights and the atmosphere rim now visibly bloom; subtle film grain; HYPERION wordmark top-left with neon underline; live UTC clock top-right ticking every second. `pnpm test` still passes.

- [ ] **Step 5: Commit**

```bash
git add src/engine/GlobeEngine.ts src/components/Hud.tsx src/app/page.tsx
git commit -m "feat: bloom + film grain, cinematic intro sweep, HUD shell with UTC clock"
```

---

### Task 7: Playwright smoke test + README

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/globe.spec.ts`
- Create: `README.md` (overwrite the create-next-app default)
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: the running app (Tasks 1–6).
- Produces: `pnpm e2e` — the smoke gate every later plan must keep green.

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Add to `package.json` scripts: `"e2e": "playwright test"`.
Add to `.gitignore`:

```
/test-results/
/playwright-report/
```

- [ ] **Step 2: Write the config and the failing test**

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
```

Create `e2e/globe.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('the globe renders without errors', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))

  await page.goto('/')

  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'HYPERION' })).toBeVisible()
  await expect(page.getByText('UTC')).toBeVisible()

  // Let the intro sweep and texture loads settle, then assert a clean console.
  await page.waitForTimeout(5000)
  expect(pageErrors).toEqual([])
})
```

- [ ] **Step 3: Run the smoke test**

Run: `pnpm e2e`
Expected: PASS (1 test). If it fails, the failure output names the broken layer (missing canvas = engine mount; page errors = shader/texture issues).

- [ ] **Step 4: Write the README**

Replace `README.md`:

```markdown
# HYPERION

*The watch from above.*

A browser game about running a private orbital agency over a living Earth —
real orbital mechanics, real live world events, and an AI-woven world that
grows differently for every player.

**Status:** Plan 1 (cinematic globe) complete.

## Stack

Next.js (App Router) · Three.js · Neon Postgres + Clerk (via Vercel
Marketplace, from Plan 3) · Anthropic API (from Plan 5)

## Develop

    pnpm install
    pnpm dev        # http://localhost:3000
    pnpm test       # unit tests (orbital/geo math)
    pnpm e2e        # Playwright smoke test

## Documents

- Design spec: `docs/superpowers/specs/2026-08-22-hyperion-design.md`
- Plans: `docs/superpowers/plans/`
```

- [ ] **Step 5: Run everything, then commit**

```bash
pnpm test && pnpm e2e
git add -A
git commit -m "test: Playwright smoke gate and project README"
```
