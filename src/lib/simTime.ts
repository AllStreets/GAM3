/** Hyperion time: orbital motion runs TIME_SCALE x wall clock (spec: ~4-5 min LEO orbits). */
export const TIME_SCALE = 20

/**
 * Fixed wall-clock origin (2026-01-01T00:00:00Z). Sim time is anchored here so
 * changing TIME_SCALE only affects time AFTER a change, instead of rescaling
 * every persisted epoch in history.
 */
export const WALL_ORIGIN_S = Date.UTC(2026, 0, 1) / 1000
export const SIM_ORIGIN_S = 0

/** Simulation seconds. Deterministic from the wall clock — the fleet advances while the app is closed. */
export function simNow(): number {
  return SIM_ORIGIN_S + (Date.now() / 1000 - WALL_ORIGIN_S) * TIME_SCALE
}
