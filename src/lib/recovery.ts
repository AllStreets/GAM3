/**
 * Pure deterministic helpers for detecting an unrecoverable ("stuck") game state.
 * No Zustand imports — all inputs come in via parameters so the logic is easily testable.
 */

export interface IsAgencyStuckInput {
  /** Every satellite in the fleet (fuel + capacity). */
  fleet: { fuel: number; fuelCapacity: number }[]
  /** Agency's current funding. */
  funds: number
  /**
   * Per-active-contract: the minimum Δv any satellite in the fleet would need
   * to reach the target (best-reachable satellite's required Δv), or null when
   * the target is completely unreachable by any satellite regardless of fuel.
   */
  activeTargetsBestDv: (number | null)[]
  /** Price to buy a new satellite (from economy.SATELLITE_PRICE). */
  satellitePrice: number
  /** Current cost per m/s of Δv (from economy.refuelPricePerDv). */
  pricePerDv: number
}

/**
 * Returns true only when every path out of the current state is blocked:
 *   - There is at least one active contract (zero active contracts = not stuck).
 *   - For every active contract, the cheapest satellite can't reach it with
 *     current fuel AND the player can't afford to refuel enough to close the
 *     gap AND the player can't buy a brand-new satellite.
 *
 * A single progressable contract (or the ability to buy a satellite) means NOT stuck.
 */
export function isAgencyStuck(input: IsAgencyStuckInput): boolean {
  const { fleet, funds, activeTargetsBestDv, satellitePrice, pricePerDv } = input

  // No active contracts → player can freely accept one; not stuck.
  if (activeTargetsBestDv.length === 0) return false

  // If player can afford a new satellite they can always escape.
  if (funds >= satellitePrice) return false

  // Check whether any active contract is progressable.
  for (const bestDv of activeTargetsBestDv) {
    // Null → target unreachable regardless of fuel (orbital geometry).
    if (bestDv === null) continue

    // Is there a satellite that already has enough fuel?
    const satWithEnoughFuel = fleet.some((s) => s.fuel >= bestDv)
    if (satWithEnoughFuel) return false

    // Can the player refuel any satellite to cover the gap?
    // Find the satellite with the most current fuel (needs the least top-up).
    const maxFuelSat = fleet.reduce((best, s) => (s.fuel > best.fuel ? s : best), fleet[0])
    if (!maxFuelSat) continue

    const missingForBest = bestDv - maxFuelSat.fuel
    if (missingForBest <= 0) return false // already has enough (covered above, but defensive)

    // The player needs `missingForBest` more Δv; cost = ceil(missingForBest * pricePerDv).
    const refuelCost = Math.ceil(missingForBest * pricePerDv)
    if (funds >= refuelCost) return false
  }

  // Every active contract is stuck; no satellite has enough fuel, player can't
  // afford to refuel or buy new. Agency is stuck.
  return true
}
