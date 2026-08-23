# HYPERION Plan 4: Flying the Burn — Action Layer + Audio + Game Feel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** EXECUTE no longer applies a burn instantly — it drops you into a hands-on **burn moment**: chase camera behind your satellite, HOLD SPACE to throttle, A/D to keep the drifting thrust needle centered; burn quality determines fuel overspend. The whole game gains audio (synthesized, zero asset files) and juice: UI ticks, comms chirps, burn rumble tied to throttle, success stinger, screen shake.

**Architecture:** A burn state machine lives in the game store (TDD, pure helpers for duration/fuel math). A `BurnDirector` engine class owns the chase camera, keyboard input, needle simulation, and per-frame progress; a `BurnOverlay` React component renders the meters by polling a non-reactive `burnLive` field (same pattern as `previewAt`). `src/audio/AudioEngine.ts` is a WebAudio singleton, init-gated on first user gesture (autoplay policy), engine- and React-callable.

**Tech Stack:** Existing stack. No new dependencies, no assets.

**Spec:** `docs/superpowers/specs/2026-08-22-hyperion-design.md` (Game feel is a top-level requirement; flying moments: burn execution)

## Global Constraints

- Audio is synthesized WebAudio only — no audio files. All audio calls are safe pre-init (no-ops until the first user gesture initializes the context). Ambient bed is quiet (master ≤ 0.18 gain).
- Burn gameplay runs on wall-clock seconds (feel), orbit application uses sim time at completion (physics) — `completeBurn(simNow())`.
- Arming requires worst-case affordability: `cost * 1.25 <= fuel` (quality can never drive fuel negative).
- Applied Δv is ALWAYS the planned vector (deterministic outcome); quality only scales fuel spend: `fuelCost = cost * (1 + 0.25 * (1 - quality))`.
- Camera authority order in `update()`: intro sweep → event flight → **burn chase (wins)** → screen shake offset applied last.
- Engine code must not import React. `burnLive` is direct-mutated (never `set()`) exactly like `previewAt`.
- Gates stay green: `pnpm test`, `pnpm e2e`, `tsc --noEmit`. Commit prefixes `feat:`/`test:`/`fix:`.

---

### Task 1: Burn state machine + math (TDD)

**Files:**
- Modify: `src/state/gameStore.ts`
- Test: `src/state/gameStore.test.ts` (append)

**Interfaces:**
- Produces:
  - `burnDuration(costMs: number): number` — wall seconds: `clamp(costMs / 20, 2, 8)`
  - `fuelCostWithQuality(costMs: number, quality: number): number` — `costMs * (1 + 0.25 * (1 - clamp01(quality)))`
  - `interface BurnSession { satId: string; plan: BurnPlan; cost: number; duration: number }`
  - Store additions: `burnSession: BurnSession | null`, `burnLive: { needle: number; progress: number; quality: number }` (non-reactive, direct-mutated),
    `beginBurn(): boolean` (validates selected sat + `0 < cost` + `cost * 1.25 <= fuel`; snapshots session; does NOT change elements/fuel),
    `completeBurn(at: number, quality: number): boolean` (applies `previewElements(sat, plan, at)`, deducts `fuelCostWithQuality`, clears session + plan, resets burnLive),
    `abortBurn(): void` (clears session, keeps plan and fuel untouched).
  - `executeBurn` (Plan 2) remains for programmatic use; UI switches to the session flow.

- [ ] **Step 1: Append the failing tests**

Append to `src/state/gameStore.test.ts`:

```ts
import { burnDuration, fuelCostWithQuality } from './gameStore'

describe('burn math', () => {
  it('burnDuration clamps to [2, 8] wall seconds', () => {
    expect(burnDuration(10)).toBe(2)
    expect(burnDuration(80)).toBeCloseTo(4, 9)
    expect(burnDuration(400)).toBe(8)
  })
  it('fuelCostWithQuality: perfect burn costs the plan, sloppy burn overspends 25%', () => {
    expect(fuelCostWithQuality(100, 1)).toBeCloseTo(100, 9)
    expect(fuelCostWithQuality(100, 0)).toBeCloseTo(125, 9)
    expect(fuelCostWithQuality(100, 0.6)).toBeCloseTo(110, 9)
  })
})

describe('burn session', () => {
  it('beginBurn snapshots a session without touching fuel or elements', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 40 })
    expect(useGameStore.getState().beginBurn()).toBe(true)
    const s = useGameStore.getState()
    expect(s.burnSession).toMatchObject({ satId: s.satellites[0].id, cost: 40 })
    expect(s.burnSession!.duration).toBeCloseTo(2, 9)
    expect(s.satellites[0].fuel).toBe(s.satellites[0].fuelCapacity)
  })

  it('beginBurn refuses when worst-case cost exceeds fuel', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 400 }) // 400 * 1.25 = 500 > 450
    expect(useGameStore.getState().beginBurn()).toBe(false)
    expect(useGameStore.getState().burnSession).toBeNull()
  })

  it('completeBurn applies elements, deducts quality-scaled fuel, clears session and plan', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 40 })
    useGameStore.getState().beginBurn()
    const before = useGameStore.getState().satellites[0]
    expect(useGameStore.getState().completeBurn(500, 0.5)).toBe(true)
    const after = useGameStore.getState().satellites[0]
    expect(after.elements.a).toBeGreaterThan(before.elements.a)
    expect(after.fuel).toBeCloseTo(before.fuel - 40 * 1.125, 6)
    expect(useGameStore.getState().burnSession).toBeNull()
    expect(useGameStore.getState().burnPlan).toEqual({ prograde: 0, normal: 0, radial: 0 })
  })

  it('abortBurn clears the session but keeps plan and fuel', () => {
    const st = useGameStore.getState()
    st.select(st.satellites[0].id)
    st.setBurnPlan({ prograde: 40 })
    useGameStore.getState().beginBurn()
    useGameStore.getState().abortBurn()
    const s = useGameStore.getState()
    expect(s.burnSession).toBeNull()
    expect(s.burnPlan.prograde).toBe(40)
    expect(s.satellites[0].fuel).toBe(s.satellites[0].fuelCapacity)
  })

  it('completeBurn with no session is a no-op returning false', () => {
    expect(useGameStore.getState().completeBurn(0, 1)).toBe(false)
  })
})
```

- [ ] **Step 2: `pnpm test` — RED** (new exports missing)

- [ ] **Step 3: Implement in `src/state/gameStore.ts`**

Add after `burnCost`:

```ts
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Wall-clock seconds a burn takes to fly: 1s per 20 m/s, clamped 2..8. */
export function burnDuration(costMs: number): number {
  return Math.min(8, Math.max(2, costMs / 20))
}

/** Quality (0..1) scales overspend: perfect = planned cost, worst = +25%. */
export function fuelCostWithQuality(costMs: number, quality: number): number {
  return costMs * (1 + 0.25 * (1 - clamp01(quality)))
}

export interface BurnSession {
  satId: string
  plan: BurnPlan
  cost: number
  duration: number
}
```

Extend `GameState` interface:

```ts
  burnSession: BurnSession | null
  /** Non-reactive live burn telemetry — direct-mutated by the engine, polled by the overlay. */
  burnLive: { needle: number; progress: number; quality: number }
  beginBurn(): boolean
  completeBurn(at: number, quality: number): boolean
  abortBurn(): void
```

Extend the creator (state + actions):

```ts
  burnSession: null,
  burnLive: { needle: 0, progress: 0, quality: 1 },

  beginBurn: () => {
    const { satellites, selectedId, burnPlan } = get()
    const sat = satellites.find((s) => s.id === selectedId)
    if (!sat) return false
    const cost = burnCost(burnPlan)
    if (cost <= 0 || cost * 1.25 > sat.fuel) return false
    const live = get().burnLive
    live.needle = 0; live.progress = 0; live.quality = 1
    set({ burnSession: { satId: sat.id, plan: { ...burnPlan }, cost, duration: burnDuration(cost) } })
    return true
  },

  completeBurn: (at, quality) => {
    const { satellites, burnSession } = get()
    if (!burnSession) return false
    const sat = satellites.find((s) => s.id === burnSession.satId)
    if (!sat) { set({ burnSession: null }); return false }
    const elements = previewElements(sat, burnSession.plan, at)
    const spent = Math.min(sat.fuel, fuelCostWithQuality(burnSession.cost, quality))
    set({
      satellites: satellites.map((s) =>
        s.id === sat.id ? { ...s, elements, fuel: s.fuel - spent } : s,
      ),
      burnSession: null,
      burnPlan: { prograde: 0, normal: 0, radial: 0 },
    })
    const live = get().burnLive
    live.needle = 0; live.progress = 0; live.quality = 1
    return true
  },

  abortBurn: () => set({ burnSession: null }),
```

Also update `resetForTest` to include `burnSession: null` and reset `burnLive` fields via direct mutation.

- [ ] **Step 4: `pnpm test` — GREEN**, `tsc --noEmit` clean

- [ ] **Step 5: Commit** — `git add src/state/gameStore.ts src/state/gameStore.test.ts && git commit -m "feat: burn session state machine with quality-scaled fuel math"`

---

### Task 2: AudioEngine — synthesized game audio

**Files:**
- Create: `src/audio/AudioEngine.ts`

**Interfaces:**
- Produces singleton `audio` with methods (all safe no-ops before init or on server): `armGesture()` (installs one-time pointerdown/keydown listeners that create the AudioContext + start the ambient bed), `uiTick()`, `chirp()`, `alert()`, `stinger()`, `setRumble(level: number)` (0 stops rumble, >0 starts/adjusts).

- [ ] **Step 1: Implement**

Create `src/audio/AudioEngine.ts`:

```ts
/**
 * Synthesized situation-room audio. Zero assets. The AudioContext is created
 * lazily on the first user gesture (autoplay policy); every method is a safe
 * no-op before init and on the server.
 */
class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private rumbleGain: GainNode | null = null
  private armed = false

  /** Install one-time gesture listeners that boot the context + ambient bed. */
  armGesture() {
    if (this.armed || typeof window === 'undefined') return
    this.armed = true
    const boot = () => {
      window.removeEventListener('pointerdown', boot)
      window.removeEventListener('keydown', boot)
      this.init()
    }
    window.addEventListener('pointerdown', boot)
    window.addEventListener('keydown', boot)
  }

  private init() {
    if (this.ctx) return
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.18
    this.master.connect(this.ctx.destination)
    this.startAmbient()
  }

  /** Very quiet filtered-noise drone with a slow LFO swell. */
  private startAmbient() {
    if (!this.ctx || !this.master) return
    const ctx = this.ctx
    const len = ctx.sampleRate * 2
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1
      last = (last + 0.02 * white) / 1.02 // brown-ish noise
      data[i] = last * 3.5
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 160
    const gain = ctx.createGain()
    gain.gain.value = 0.35
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.05
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.12
    lfo.connect(lfoGain).connect(gain.gain)
    src.connect(filter).connect(gain).connect(this.master)
    src.start()
    lfo.start()
  }

  private blip(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', when = 0) {
    if (!this.ctx || !this.master) return
    const t0 = this.ctx.currentTime + when
    const osc = this.ctx.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + duration + 0.02)
  }

  /** Short UI confirmation tick. */
  uiTick() {
    this.blip(1320, 0.05, 0.5, 'square')
  }

  /** Two-tone comms chirp (selection). */
  chirp() {
    this.blip(880, 0.06, 0.5)
    this.blip(1245, 0.09, 0.45, 'sine', 0.07)
  }

  /** Attention tone (arming, warnings). */
  alert() {
    this.blip(392, 0.14, 0.6, 'triangle')
    this.blip(392, 0.14, 0.5, 'triangle', 0.17)
  }

  /** Rising success arpeggio (burn complete). */
  stinger() {
    this.blip(523.25, 0.12, 0.5)
    this.blip(659.25, 0.12, 0.5, 'sine', 0.09)
    this.blip(783.99, 0.2, 0.55, 'sine', 0.18)
  }

  /** Engine rumble: level 0 stops, >0 starts/adjusts (call every frame during a burn). */
  setRumble(level: number) {
    if (!this.ctx || !this.master) return
    if (level <= 0) {
      if (this.rumbleGain) {
        this.rumbleGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08)
        const dying = this.rumbleGain
        setTimeout(() => { dying.disconnect() }, 400)
        this.rumbleGain = null
      }
      return
    }
    if (!this.rumbleGain) {
      const ctx = this.ctx
      const len = ctx.sampleRate
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buffer.getChannelData(0)
      let last = 0
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.05 * white) / 1.05
        data[i] = last * 4
      }
      const src = ctx.createBufferSource()
      src.buffer = buffer
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 90
      this.rumbleGain = ctx.createGain()
      this.rumbleGain.gain.value = 0
      src.connect(filter).connect(this.rumbleGain).connect(this.master)
      src.start()
    }
    this.rumbleGain.gain.setTargetAtTime(Math.min(1, level) * 1.6, this.ctx.currentTime, 0.06)
  }
}

export const audio = new AudioEngine()
```

- [ ] **Step 2: Gate** — `tsc --noEmit` clean, `pnpm test` green (no unit tests for WebAudio; e2e console-error gate covers runtime).

- [ ] **Step 3: Commit** — `git add src/audio/AudioEngine.ts && git commit -m "feat: synthesized WebAudio engine (ambient, ticks, chirps, rumble, stinger)"`

---

### Task 3: BurnDirector — chase camera, needle, input, shake

**Files:**
- Create: `src/engine/BurnDirector.ts`
- Modify: `src/engine/GlobeEngine.ts`

**Interfaces:**
- Consumes: `useGameStore` (burnSession, burnLive, completeBurn, abortBurn), `propagate`, `sceneFromEci`, `simNow`, `audio`.
- Produces: `class BurnDirector { active: boolean; shake: number; update(dtSeconds: number, camera: THREE.PerspectiveCamera): void; dispose(): void }` — while a `burnSession` exists it owns the camera (chase view), runs the needle/progress/quality sim from keyboard state, calls `completeBurn`/`abortBurn`, and drives `audio.setRumble`. `shake` decays after completion; GlobeEngine applies it as a post-camera positional jitter.

- [ ] **Step 1: Implement the director**

Create `src/engine/BurnDirector.ts`:

```ts
import * as THREE from 'three'
import { propagate, sceneFromEci } from '@/lib/orbits'
import { simNow } from '@/lib/simTime'
import { useGameStore } from '@/state/gameStore'
import { audio } from '@/audio/AudioEngine'

/**
 * Owns the burn moment: chase camera, thrust needle simulation, progress,
 * quality integration, audio rumble, and completion/abort. Keyboard state is
 * tracked with window listeners (SPACE = throttle, A/D or arrows = trim,
 * ESC = abort).
 */
export class BurnDirector {
  active = false
  /** 0..1 camera-shake energy; decays in GlobeEngine's update. */
  shake = 0

  private keys = { throttle: false, left: false, right: false }
  private qualityAccum = 0
  private qualityTime = 0

  private onKeyDown = (ev: KeyboardEvent) => {
    if (ev.code === 'Space') { this.keys.throttle = true; if (this.active) ev.preventDefault() }
    if (ev.code === 'KeyA' || ev.code === 'ArrowLeft') this.keys.left = true
    if (ev.code === 'KeyD' || ev.code === 'ArrowRight') this.keys.right = true
    if (ev.code === 'Escape' && this.active) {
      audio.alert()
      useGameStore.getState().abortBurn()
    }
  }

  private onKeyUp = (ev: KeyboardEvent) => {
    if (ev.code === 'Space') this.keys.throttle = false
    if (ev.code === 'KeyA' || ev.code === 'ArrowLeft') this.keys.left = false
    if (ev.code === 'KeyD' || ev.code === 'ArrowRight') this.keys.right = false
  }

  constructor() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    const state = useGameStore.getState()
    const session = state.burnSession

    if (!session) {
      if (this.active) {
        this.active = false
        audio.setRumble(0)
      }
      return
    }

    if (!this.active) {
      this.active = true
      this.qualityAccum = 0
      this.qualityTime = 0
    }

    const sat = state.satellites.find((s) => s.id === session.satId)
    if (!sat) { state.abortBurn(); return }

    // Chase camera: behind the satellite, slightly above.
    const sv = propagate(sat.elements, simNow())
    const pos = sceneFromEci(sv.position)
    const vHat = sceneFromEci(sv.velocity).normalize()
    const up = pos.clone().normalize()
    camera.position.copy(pos).addScaledVector(vHat, -0.12).addScaledVector(up, 0.05)
    camera.lookAt(pos.clone().addScaledVector(vHat, 0.1))

    // Needle: random drift fought by trim input.
    const live = state.burnLive
    const steer = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0)
    live.needle += (Math.random() - 0.5) * 2.4 * dt
    live.needle -= steer * 3.2 * dt
    live.needle = Math.max(-1, Math.min(1, live.needle))

    // Throttle advances progress; quality integrates alignment while burning.
    if (this.keys.throttle) {
      live.progress = Math.min(1, live.progress + dt / session.duration)
      const alignment = 1 - Math.abs(live.needle)
      this.qualityAccum += alignment * dt
      this.qualityTime += dt
      live.quality = this.qualityTime > 0 ? this.qualityAccum / this.qualityTime : 1
      audio.setRumble(0.35 + 0.65 * alignment)
    } else {
      audio.setRumble(0)
    }

    if (live.progress >= 1) {
      const quality = live.quality
      state.completeBurn(simNow(), quality)
      this.shake = 0.55 + 0.45 * (1 - quality)
      audio.setRumble(0)
      audio.stinger()
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    audio.setRumble(0)
  }
}
```

- [ ] **Step 2: Wire into `GlobeEngine`**

Imports: `import { BurnDirector } from '@/engine/BurnDirector'` and `import { audio } from '@/audio/AudioEngine'`.

Fields: `private burnDirector = new BurnDirector()` and `private lastElapsed = 0`.

Constructor: after existing setup add `audio.armGesture()`.

In `update(elapsedSeconds)`: compute `const dt = Math.min(0.05, elapsedSeconds - this.lastElapsed); this.lastElapsed = elapsedSeconds` at the top. Then AFTER the intro-sweep and event-flight blocks add the burn-chase block:

```ts
this.burnDirector.update(dt, this.camera)
if (this.burnDirector.active) {
  this.controls.enabled = false
  this.flight = null // a burn cancels any event flight
}
```

At the END of `update()` (after satLayer/eventLayer updates), apply shake decay + jitter:

```ts
if (this.burnDirector.shake > 0.001) {
  this.camera.position.x += (Math.random() - 0.5) * this.burnDirector.shake * 0.012
  this.camera.position.y += (Math.random() - 0.5) * this.burnDirector.shake * 0.012
  this.burnDirector.shake *= Math.exp(-3.2 * dt)
} else {
  this.burnDirector.shake = 0
}
```

In `dispose()`: add `this.burnDirector.dispose()`.

- [ ] **Step 3: Gate** — `tsc --noEmit` clean; `pnpm test` green; `pnpm e2e` 3/3 (kill stale port first).

- [ ] **Step 4: Commit** — `git add src/engine/BurnDirector.ts src/engine/GlobeEngine.ts && git commit -m "feat: burn director with chase camera, needle sim, rumble, screen shake"`

---

### Task 4: BurnOverlay + UI wiring + sounds

**Files:**
- Create: `src/components/BurnOverlay.tsx`
- Modify: `src/components/FleetPanel.tsx`
- Modify: `src/components/EventsPanel.tsx`
- Modify: `src/components/Hud.tsx`

**Interfaces:**
- Consumes: `useGameStore` (burnSession, burnLive, beginBurn), `audio`.
- Produces: full-screen burn HUD (needle bar, Δv progress, quality %, control hints) polled at 30 Hz from `burnLive`; FleetPanel's EXECUTE becomes the arm trigger (`beginBurn()` + `audio.alert()`); selection clicks get `audio.chirp()`, slider changes get nothing (too chatty), RESET gets `audio.uiTick()`; EventsPanel focus clicks get `audio.uiTick()`.

- [ ] **Step 1: Build the overlay**

Create `src/components/BurnOverlay.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useGameStore } from '@/state/gameStore'

export default function BurnOverlay() {
  const burnSession = useGameStore((s) => s.burnSession)
  const [live, setLive] = useState({ needle: 0, progress: 0, quality: 1 })

  useEffect(() => {
    if (!burnSession) return
    const id = setInterval(() => setLive({ ...useGameStore.getState().burnLive }), 33)
    return () => clearInterval(id)
  }, [burnSession])

  if (!burnSession) return null

  const sat = useGameStore.getState().satellites.find((s) => s.id === burnSession.satId)

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-end pb-16 font-mono text-xs text-[var(--text)]">
      <div className="w-[420px] space-y-3 rounded border border-[#ffb86b]/40 bg-black/70 p-4 backdrop-blur">
        <p className="flex justify-between text-[10px] tracking-[0.35em] text-[#ffb86b]">
          <span>BURN IN PROGRESS — {sat?.name}</span>
          <span>{burnSession.cost.toFixed(0)} m/s</span>
        </p>

        {/* Thrust needle */}
        <div>
          <p className="mb-1 flex justify-between opacity-60"><span>TRIM</span><span>A / D</span></p>
          <div className="relative h-3 w-full rounded bg-white/10">
            <span className="absolute left-1/2 top-0 h-3 w-px bg-white/40" />
            <span
              className="absolute top-0 h-3 w-1.5 rounded bg-[#ffb86b] transition-transform duration-75"
              style={{ left: '50%', transform: `translateX(${live.needle * 190}px)` }}
            />
          </div>
        </div>

        {/* Progress */}
        <div>
          <p className="mb-1 flex justify-between opacity-60"><span>Δv DELIVERED</span><span>{Math.round(live.progress * 100)}%</span></p>
          <div className="h-2 w-full rounded bg-white/10">
            <span className="block h-2 rounded bg-[var(--accent)]" style={{ width: `${live.progress * 100}%` }} />
          </div>
        </div>

        <p className="flex items-center justify-between">
          <span className="opacity-70">QUALITY <span className="tabular-nums text-[var(--accent)]">{Math.round(live.quality * 100)}%</span></span>
          <span className="opacity-60">HOLD SPACE TO BURN · ESC TO ABORT</span>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire FleetPanel**

In `src/components/FleetPanel.tsx`:
- Import `audio`: `import { audio } from '@/audio/AudioEngine'`
- Replace the `executeBurn` selector line with `const beginBurn = useGameStore((s) => s.beginBurn)`
- Fleet select button `onClick`: add `audio.chirp()` before `select(...)`
- RESET `onClick`: add `audio.uiTick()` before `resetBurnPlan()`
- EXECUTE button: `onClick={() => { if (beginBurn()) audio.alert() }}` and update `canExecute` to `!!selected && cost > 0 && cost * 1.25 <= (selected?.fuel ?? 0)`; keep the disabled styling; rename its label from `EXECUTE` to `IGNITE`.

In `src/components/EventsPanel.tsx`: import `audio` and add `audio.uiTick()` at the top of the event button `onClick`.

- [ ] **Step 3: Mount overlay** — in `src/components/Hud.tsx` import and render `<BurnOverlay />` after the panels.

- [ ] **Step 4: Gate** — `tsc --noEmit` clean; `pnpm test` green; note the e2e fleet test asserts the `EXECUTE` button — IT WILL FAIL now (label renamed + flow changed). Update `e2e/globe.spec.ts` fleet test: replace the EXECUTE click/assert section with:

```ts
  const ignite = page.getByRole('button', { name: 'IGNITE' })
  await expect(ignite).toBeEnabled()
  await ignite.click()
  await expect(page.getByText(/BURN IN PROGRESS/)).toBeVisible()
  // Fly the burn: hold SPACE for just over the 2s minimum duration.
  await page.keyboard.down('Space')
  await page.waitForTimeout(2400)
  await page.keyboard.up('Space')
  await expect(page.getByText(/BURN IN PROGRESS/)).not.toBeVisible({ timeout: 5_000 })
  // Fuel was spent (was 450/450).
  await expect(page.getByText(/Δv 4[0-3][0-9]\/450 m\/s/)).toBeVisible()
```

Run `pnpm e2e` — 3 passed.

- [ ] **Step 5: Commit** — `git add src/components e2e/globe.spec.ts && git commit -m "feat: burn overlay, ignite flow, UI audio hooks"`

---

### Task 5: README + full gate

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Status line → `**Status:** Plan 4 (flying the burn — action layer, synthesized audio, game feel) complete.`
- [ ] **Step 2:** Full gate: `pnpm test && pnpm e2e && pnpm exec tsc --noEmit`
- [ ] **Step 3:** Commit — `git add README.md && git commit -m "chore: README status for Plan 4"`
