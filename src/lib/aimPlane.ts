/**
 * aimPlane — pure helper for choosing an orbital plane aimed at a geographic target.
 *
 * Physics rationale:
 *  - A satellite at inclination i (radians) reaches latitudes up to ±i° (prograde)
 *    or ±(180°-i)° (retrograde, same coverage). To cover target at latitude L, the
 *    satellite needs inclination i ≥ |L|.
 *  - We add a 5° margin above |lat| so the ground-track reliably sweeps the target
 *    (matches isTargetReachable's REACH_LAT_MARGIN_DEG of 4.5° plus a bit).
 *  - RAAN is chosen so the ascending node geometry brings the ground-track over
 *    the target longitude. Approximate: for a near-equatorial ascending node at
 *    longitude λ, the track crosses at ±inclination. We rotate RAAN so the node
 *    is ~90° of longitude west of the target, placing the target near the peak of
 *    the ground-track (where the satellite is at max latitude).
 *  - argp and m0 are spread by `index` so multiple aimed satellites differ.
 *
 * Pure: no Math.random, no Date.now. Deterministic for same inputs.
 */

import type { OrbitalElements } from '@/lib/orbits'

const DEG_TO_RAD = Math.PI / 180

/** LEO altitude for newly bought satellites, in km above surface. */
const AIM_ALT_KM = 500

/** Earth radius for converting altitude to ER. */
const ER_KM = 6371

/** Standard LEO semi-major axis for aimed satellites. */
const AIM_A = (ER_KM + AIM_ALT_KM) / ER_KM

/** Minimum inclination (5°) to prevent degenerate near-equatorial orbits. */
const MIN_I_DEG = 5

/** Maximum inclination (~99°) — just past sun-sync; covers polar targets. */
const MAX_I_DEG = 99

/**
 * Given a geographic target (lat, lon in degrees) and an integer index (to
 * spread multiple aimed satellites), return partial OrbitalElements that set
 * the orbital plane so the satellite's ground-track passes near the target.
 *
 * Guarantees:
 *  - Returned inclination i (in radians) satisfies:  i ≥ deg2rad(|lat|)
 *    (so isTargetReachable(elements, lat) will be true for the +margin check
 *    because we add 5° above |lat|, which exceeds REACH_LAT_MARGIN_DEG=4.5°).
 *  - Deterministic: same (lat, lon, index) → same result.
 *  - Pure: no side effects.
 *
 * Approximation for RAAN:
 *  The ascending node is placed ~90° west of the target longitude. For a
 *  prograde orbit, the satellite is at maximum northern latitude a quarter
 *  orbit after the ascending node (when the argument of latitude ≈ 90°). So
 *  placing the node 90° west means the peak-latitude crossing is near the
 *  target longitude. This is a first-order approximation; Earth's rotation
 *  introduces a small offset (≤15° per 90 min orbit) which the player
 *  fine-tunes by flying. argp ≈ 0 keeps periapsis at the equator (near-
 *  circular orbit), m0 is varied by index so satellites start at different
 *  phases.
 */
export function planeForTarget(
  lat: number,
  lon: number,
  index: number,
): Partial<OrbitalElements> {
  // Inclination: |lat| + 5° margin, clamped to [MIN_I_DEG, MAX_I_DEG].
  const iDeg = Math.min(MAX_I_DEG, Math.max(MIN_I_DEG, Math.abs(lat) + 5))
  const i = iDeg * DEG_TO_RAD

  // RAAN: place ascending node ~90° west of the target longitude so the
  // ground-track peak (at argument-of-latitude ≈ 90°) crosses near lon.
  // Longitude wraps to [0, 360) for consistency, then convert to radians.
  const raanDeg = ((lon - 90) % 360 + 360) % 360
  const raan = raanDeg * DEG_TO_RAD

  // argp: periapsis near ascending node for near-circular orbit, spread by index.
  const argp = ((index * 0.4) % (2 * Math.PI))

  // m0: mean anomaly at epoch — spread satellites around the orbit by index.
  const m0 = ((index * 1.1) % (2 * Math.PI))

  return {
    a: AIM_A,
    e: 0.001,
    i,
    raan,
    argp,
    m0,
    epoch: 0,
  }
}
