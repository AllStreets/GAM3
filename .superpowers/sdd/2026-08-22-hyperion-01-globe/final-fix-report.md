# HYPERION Plan-1 Final Fix Report

Date: 2026-08-22

## Changes Applied

### Fix 1 — Starfield visibility (src/engine/GlobeEngine.ts, buildStarfield)

Stars live on a sphere of radius 60 world units. With `sizeAttenuation: true` and the
camera at ~3 Earth radii (≈3 units), a 0.05 world-unit size projects to sub-pixel and is
invisible. Changed:

| Field   | Before | After |
|---------|--------|-------|
| size    | 0.05   | 0.22  |
| opacity | 0.8    | 0.9   |

### Fix 2 — E2E gate hardened (e2e/globe.spec.ts + src/engine/GlobeEngine.ts)

**Problem:** shader / texture / WebGL failures emit `console.error` messages but do NOT
throw page-level errors, so the existing `pageerror` listener missed them.

**Changes:**

1. Added console-error capture (registered before `page.goto`):
   ```ts
   page.on('console', (msg) => {
     if (msg.type() === 'error') pageErrors.push(msg.text())
   })
   ```

2. Added non-black-canvas assertion after the 5-second settle. The assertion works by
   copying the WebGL canvas into a 2D probe canvas and reading pixel data.

**Canvas probe approach chosen:** `preserveDrawingBuffer: true` in the `WebGLRenderer`
constructor (`src/engine/GlobeEngine.ts`, line 28). Without this flag, `drawImage` from a
WebGL canvas reads blank after each composited frame, making `max` always 0 and the
assertion always fail. Adding `preserveDrawingBuffer: true` retains the last rendered
frame in the backing buffer so `getImageData` captures real pixels.

Renderer constructor change:
```ts
// Before
new THREE.WebGLRenderer({ canvas, antialias: true })
// After
new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
```

### Fix 3 — Document lon range (src/lib/geo.ts, subsolarPoint)

Added one comment line above the wrap logic:
```ts
// Result is in (-180, 180]: exactly 180 (00:00 UTC) is NOT wrapped to -180 — same meridian.
```

## Gate Results

### `pnpm exec tsc --noEmit`
```
(no output — clean)
```

### `pnpm test`
```
 ✓ src/lib/geo.test.ts (9 tests) 3ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  20:55:21
   Duration  316ms
```

### `pnpm e2e`
```
Running 1 test using 1 worker

  ✓  1 e2e/globe.spec.ts:3:5 › the globe renders without errors (7.1s)

  1 passed (9.9s)
```

All three gates pass.
