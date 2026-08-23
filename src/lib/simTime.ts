/** Hyperion time: orbital motion runs 20x wall clock (spec: ~4-5 min LEO orbits). */
export const TIME_SCALE = 20

/** Simulation seconds. Deterministic from the wall clock, so the fleet advances while the app is closed. */
export function simNow(): number {
  return (Date.now() / 1000) * TIME_SCALE
}
