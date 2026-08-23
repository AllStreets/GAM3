import { describe, it, expect } from 'vitest'
import { subPoint, groundDistanceKm, closestApproach, COMPLETION_RADIUS_KM } from './intercept'
import { orbitalPeriod, type OrbitalElements } from './orbits'

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
