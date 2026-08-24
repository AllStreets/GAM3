import { describe, it, expect } from 'vitest'
import { subPoint, groundDistanceKm, closestApproach, COMPLETION_RADIUS_KM, firstPassEta, normalHint } from './intercept'
import { orbitalPeriod, applyDeltaV, MS_TO_ER, type OrbitalElements } from './orbits'

const deg = (d: number) => (d * Math.PI) / 180
const iss: OrbitalElements = { a: (6371 + 420) / 6371, e: 0.0012, i: deg(51.6), raan: 0.8, argp: 0.3, m0: 0, epoch: 0 }

describe('subPoint', () => {
  it('stays within the inclination band in latitude', () => {
    const T = orbitalPeriod(iss.a)
    for (let k = 0; k < 60; k++) {
      const { lat } = subPoint(iss, (k / 60) * T)
      expect(Math.abs(lat)).toBeLessThanOrEqual(51.6 + 1)
    }
  })
})

describe('groundDistanceKm', () => {
  it('is zero when the target IS the current sub-point', () => {
    const sp = subPoint(iss, 1234)
    expect(groundDistanceKm(iss, 1234, sp)).toBeCloseTo(0, 3)
  })
})

describe('closestApproach', () => {
  it('finds a near-zero closest approach for a target on the ground-track', () => {
    // A point the satellite is directly over at t=5000 must be reachable within ~0 km near that time.
    const target = subPoint(iss, 5000)
    const T = orbitalPeriod(iss.a)
    const { closestKm } = closestApproach(iss, target, 5000 - T, 2 * T)
    expect(closestKm).toBeLessThan(50)
  })
  it('reports a large closest approach for an off-track target (a pole for a 51.6° orbit)', () => {
    const T = orbitalPeriod(iss.a)
    const { closestKm } = closestApproach(iss, { lat: 90, lon: 0 }, 0, 2 * T)
    expect(closestKm).toBeGreaterThan(COMPLETION_RADIUS_KM)
  })
  it('etaSec lands inside the window', () => {
    const target = subPoint(iss, 3000)
    const { etaSec } = closestApproach(iss, target, 0, 6000)
    expect(etaSec).toBeGreaterThanOrEqual(0)
    expect(etaSec).toBeLessThanOrEqual(6000)
  })
})

// local helper mirroring intercept's internal NORMAL burn, for the assertion below
function applyDeltaVForTest(el: OrbitalElements, t: number, normalMs: number) {
  return applyDeltaV(el, t, { prograde: 0, normal: normalMs * MS_TO_ER, radial: 0 })
}

describe('firstPassEta', () => {
  it('returns a near-term offset for a target on the current track', () => {
    const target = subPoint(iss, 4000) // sat is directly over this at t=4000
    const eta = firstPassEta(iss, target, 3000, 3000, COMPLETION_RADIUS_KM)
    expect(eta).not.toBeNull()
    expect(eta!).toBeGreaterThanOrEqual(0)
    expect(eta!).toBeLessThanOrEqual(3000)
    // Earliest entry into the disk is at/just before the exact overhead moment (~1000s in).
    expect(eta!).toBeLessThan(1100)
  })
  it('returns null for an unreachable target (a pole for a 51.6° orbit)', () => {
    const T = orbitalPeriod(iss.a)
    expect(firstPassEta(iss, { lat: 90, lon: 0 }, 0, 2 * T, COMPLETION_RADIUS_KM)).toBeNull()
  })
})

describe('normalHint', () => {
  it('returns a non-zero direction when a target is just off the track', () => {
    // A point offset ~2° in latitude from a sub-point is reachable by a small plane nudge.
    const sp = subPoint(iss, 5000)
    const offTarget = { lat: sp.lat + 2, lon: sp.lon }
    const hint = normalHint(iss, offTarget, 5000 - orbitalPeriod(iss.a), 2 * orbitalPeriod(iss.a))
    expect([-1, 1]).toContain(hint)
  })
  it('the hinted direction actually reduces closest approach', () => {
    const sp = subPoint(iss, 5000)
    const offTarget = { lat: sp.lat + 2, lon: sp.lon }
    const now = 5000 - orbitalPeriod(iss.a)
    const win = 2 * orbitalPeriod(iss.a)
    const hint = normalHint(iss, offTarget, now, win)
    if (hint !== 0) {
      const base = closestApproach(iss, offTarget, now, win).closestKm
      // apply the hinted 40 m/s and confirm it's not worse
      const nudged = closestApproach(applyDeltaVForTest(iss, now, hint * 40), offTarget, now, win).closestKm
      expect(nudged).toBeLessThanOrEqual(base + 1)
    }
  })
})
