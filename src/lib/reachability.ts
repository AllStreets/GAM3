/**
 * Reachability — pure helpers for determining whether any satellite in the
 * fleet can physically fly its ground-track over a given target latitude.
 *
 * Physics: a satellite at orbital inclination i (radians) reaches latitudes up
 * to ±min(i°, 180°−i°). We add a small margin (REACH_LAT_MARGIN_DEG) to
 * account for the imaging swath (COMPLETION_RADIUS_KM ≈ 500 km ≈ 4.5°).
 */
import type { OrbitalElements } from '@/lib/orbits'
import { orbitalPeriod } from '@/lib/orbits'
import { closestApproach, COMPLETION_RADIUS_KM } from '@/lib/intercept'
import type { Satellite } from '@/state/gameStore'

/** Ground-swath margin in degrees (500 km ÷ ~111 km/° ≈ 4.5°). */
export const REACH_LAT_MARGIN_DEG = 4.5

/**
 * Convert orbital inclination (radians) to the effective max-latitude reach
 * in degrees, folded to [0, 90].
 *
 * Retrograde orbits (i > 90°) have the same latitude coverage as their
 * supplement: 97.5° and 82.5° (= 180 − 97.5) reach the same max lat.
 */
export function inclinationDeg(el: OrbitalElements): number {
  const iDeg = (el.i * 180) / Math.PI
  // Fold: retrograde i > 90 → same ground-track max-lat as 180 - i
  return Math.min(iDeg, 180 - iDeg)
}

/**
 * Maximum latitude (degrees) that this satellite's ground-track can pass over,
 * including the imaging swath margin. Capped at 90.
 */
export function maxReachableLatDeg(el: OrbitalElements): number {
  return Math.min(90, inclinationDeg(el) + REACH_LAT_MARGIN_DEG)
}

/**
 * Returns true if the satellite can physically bring its ground-track (plus
 * swath) within imaging range of `targetLat`.
 */
export function isTargetReachable(el: OrbitalElements, targetLat: number): boolean {
  return Math.abs(targetLat) <= maxReachableLatDeg(el)
}

export interface FleetReach {
  /** True if at least one satellite in the fleet can reach the target latitude. */
  reachable: boolean
  /** Id of the reachable satellite with the smallest current closest-approach. */
  bestSatId: string | null
  /** Approximate Δv (m/s) needed to close the remaining gap to the target. */
  bestApproxDvMs: number | null
}

/**
 * Determine whether the fleet can reach a target and which satellite is best
 * placed to do so right now.
 *
 * - `reachable` = any satellite passes `isTargetReachable` for `target.lat`.
 * - `bestSatId` = among reachable satellites, the one with the smallest
 *   closest-approach distance over the next ~3 orbital periods (evaluated at
 *   t = 0 — deterministic, no Date.now / Math.random).
 * - `bestApproxDvMs` = rough estimate of the Δv needed to close the remaining
 *   gap: `max(0, (closestKm - COMPLETION_RADIUS_KM)) * DV_PER_KM`, where the
 *   constant gives a physics-inspired but intentionally conservative estimate.
 *   Pure / deterministic.
 *
 * Pure function — no side-effects, no random, no Date.now.
 */
export function fleetReachability(
  sats: Satellite[],
  target: { lat: number; lon: number },
): FleetReach {
  // Filter to satellites that can physically reach this latitude.
  const reachable = sats.filter((s) => isTargetReachable(s.elements, target.lat))

  if (reachable.length === 0) {
    return { reachable: false, bestSatId: null, bestApproxDvMs: null }
  }

  // Evaluate each reachable satellite's closest approach over ~3 revs from t=0.
  // Using t=0 makes this deterministic and cheap (no live sim-time dependency).
  const DV_PER_KM = 0.5 // m/s per km — conservative monotonic Δv estimate

  let bestSatId: string | null = null
  let bestClosestKm = Infinity
  let bestApproxDvMs = 0

  for (const sat of reachable) {
    const period = orbitalPeriod(sat.elements.a)
    const { closestKm } = closestApproach(sat.elements, target, 0, period * 3)
    if (closestKm < bestClosestKm) {
      bestClosestKm = closestKm
      bestSatId = sat.id
      bestApproxDvMs = Math.max(0, (closestKm - COMPLETION_RADIUS_KM)) * DV_PER_KM
    }
  }

  return {
    reachable: true,
    bestSatId,
    bestApproxDvMs: Math.round(bestApproxDvMs),
  }
}
