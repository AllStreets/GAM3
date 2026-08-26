/**
 * Pure upgrade-cost / upgrade-effect functions for:
 *   - Satellite tank expansions
 *   - Agency-wide refuel efficiency
 *   - Capability retrofits
 *
 * Nothing here touches stores or side-effects.
 */

/**
 * Funding cost to upgrade a satellite tank from `level` → `level + 1`.
 * Escalates: 300 · (level + 1), so Lv0→1 = §300, Lv1→2 = §600, …
 */
export function tankUpgradeCost(level: number): number {
  return 300 * (Math.max(0, Math.floor(level)) + 1)
}

/**
 * Additional Δv capacity gained when upgrading a satellite tank.
 * Flat +300 m/s per level (each upgrade gives the same benefit).
 */
export function tankUpgradeDv(level: number): number {
  void level // flat bonus independent of level
  return 300
}

/**
 * Funding cost to advance agency refuel efficiency from `level` → `level + 1`.
 * Escalates: 400 · (level + 1), so Lv0→1 = §400, Lv1→2 = §800, …
 */
export function refuelEfficiencyCost(level: number): number {
  return 400 * (Math.max(0, Math.floor(level)) + 1)
}

/**
 * Multiplier applied to the base §/Δv refuel price at the given efficiency level.
 * Each level knocks 10% off, floored at 0.6 (40% max discount).
 * At level 0 the factor is exactly 1.0 — no discount.
 */
export function refuelEfficiencyFactor(level: number): number {
  return Math.max(0.6, 1 - 0.1 * Math.max(0, Math.floor(level)))
}

/**
 * Fixed cost (§) to retrofit a satellite to a different capability type.
 */
export const RETROFIT_COST = 250
